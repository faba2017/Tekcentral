import { randomUUID } from "node:crypto";
import type { MailTransport } from "./mailService.js";
import { MailConfigurationError, smtpMailTransport } from "./mailService.js";
import { getOrderById } from "./orderRepository.js";
import { bestEffortAlert, bestEffortResolve } from "./operationalAlertService.js";
import { claimCustomerDelivery, completeCustomerDeliveryAttempt, createCustomerDeliveryIdempotently, deferClaimedCustomerDelivery, getInvoiceById, listDueCustomerDeliveries, type CommerceCustomerDelivery, type CommerceInvoice } from "./persistence/invoiceDeliveryRepository.js";
import { renderOrderConfirmation } from "./orderConfirmationMail.js";
import { renderInvoiceDeliveryEmail } from "./invoiceDeliveryMail.js";
import { inspectInvoiceDocument } from "./invoiceDocumentService.js";
import { recordAdminAuditBestEffort } from "./adminAuditService.js";
import type { BackendOrder } from "./types.js";

export const CUSTOMER_DELIVERY_MAX_ATTEMPTS = 4;
export const CUSTOMER_DELIVERY_LEASE_SECONDS = 90;
export const CUSTOMER_DELIVERY_POLL_MS = 10_000;
const RETRY_SECONDS = [60, 300, 1_800];
const SMTP_ALERT = { type: "CUSTOMER_DELIVERY_SMTP_OUTAGE", subsystem: "EMAIL" as const, diagnosticCode: "CUSTOMER_DELIVERY_SMTP_TRANSIENT" };
const WORKER_ALERT = { type: "CUSTOMER_DELIVERY_WORKER_OUTAGE", subsystem: "EMAIL" as const, diagnosticCode: "CUSTOMER_DELIVERY_WORKER_FAILED" };

export function classifyCustomerDeliveryFailure(error: unknown) {
  const message = error instanceof Error ? error.message.toUpperCase() : "UNKNOWN";
  if (error instanceof MailConfigurationError || message.includes("CONFIGURATION_MISSING")) return { code: "SMTP_CONFIG_MISSING", retryable: true };
  if (message.includes("INVALID_RECIPIENT")) return { code: "INVALID_RECIPIENT", retryable: false };
  const smtpCode = Number(message.match(/SMTP_(\d{3})/)?.[1]);
  if (smtpCode >= 500) return { code: `SMTP_${smtpCode}`, retryable: false };
  if (smtpCode >= 400) return { code: `SMTP_${smtpCode}`, retryable: true };
  if (/TIMEOUT|ECONN|ENET|EHOST|NETWORK|SOCKET/.test(message)) return { code: "SMTP_CONNECTION_FAILED", retryable: true };
  return { code: "DELIVERY_SEND_FAILED", retryable: true };
}

export function customerDeliveryRetryAt(attemptNumber: number, completedAt: Date) {
  const seconds = RETRY_SECONDS[attemptNumber - 1];
  return seconds ? new Date(completedAt.getTime() + seconds * 1_000).toISOString() : undefined;
}

export async function ensureOrderConfirmationDelivery(order: BackendOrder, now = new Date()) {
  return createCustomerDeliveryIdempotently({
    id: `customer-delivery-${randomUUID()}`,
    orderId: order.id,
    deliveryType: "ORDER_CONFIRMATION",
    recipient: order.customer.email.trim().toLowerCase(),
    idempotencyKey: `order-confirmation:${order.id}`,
    originType: "SYSTEM",
    createdAt: now.toISOString(),
    nextAttemptAt: now.toISOString(),
  });
}

export async function ensureCanonicalInvoiceDelivery(invoice: CommerceInvoice, now = new Date()) {
  return createCustomerDeliveryIdempotently({
    id: `customer-delivery-${randomUUID()}`,
    orderId: invoice.orderId,
    invoiceId: invoice.id,
    deliveryType: "INVOICE_DELIVERY",
    recipient: invoice.snapshot.customer.email.trim().toLowerCase(),
    idempotencyKey: `invoice-delivery:${invoice.id}`,
    originType: "SYSTEM",
    createdAt: now.toISOString(),
    nextAttemptAt: now.toISOString(),
  });
}

function validEmail(value: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }

export interface CustomerDeliveryWorkerOptions {
  mail?: MailTransport;
  workerId?: string;
  now?: () => Date;
  limit?: number;
  environment?: NodeJS.ProcessEnv;
}

export async function processCustomerDelivery(delivery: CommerceCustomerDelivery, options: CustomerDeliveryWorkerOptions = {}) {
  const mail = options.mail ?? smtpMailTransport;
  const workerId = options.workerId ?? `customer-delivery-worker-${process.pid}-${randomUUID()}`;
  const startedAt = (options.now?.() ?? new Date()).toISOString();
  const claimed = await claimCustomerDelivery({ deliveryId: delivery.id, leaseOwner: workerId, now: startedAt, leaseSeconds: CUSTOMER_DELIVERY_LEASE_SECONDS });
  if (!claimed) return { state: "NOT_CLAIMED" as const };
  const order = await getOrderById(claimed.orderId);
  let failure: { code: string; retryable: boolean } | undefined;
  let invoiceNumber: string | undefined;
  try {
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (!validEmail(claimed.recipient)) throw new Error("INVALID_RECIPIENT");
    let message;
    if (claimed.deliveryType === "INVOICE_DELIVERY") {
      const invoice = claimed.invoiceId ? await getInvoiceById(claimed.invoiceId) : undefined;
      if (!invoice) throw new Error("INVOICE_NOT_FOUND");
      invoiceNumber = invoice.invoiceNumber;
      if (invoice.snapshot.customer.email.trim().toLowerCase() !== claimed.recipient.trim().toLowerCase()) throw new Error("RECIPIENT_MISMATCH");
      const document = await inspectInvoiceDocument(invoice.id, invoice.invoiceNumber);
      if (document.status !== "READY") {
        const deferred = await deferClaimedCustomerDelivery({ deliveryId: claimed.id, leaseOwner: workerId, now: startedAt, nextAttemptAt: new Date(Date.parse(startedAt) + 60_000).toISOString(), safeFailureCode: document.failureCode });
        return { state: "BLOCKED" as const, failureCode: document.failureCode, delivery: deferred };
      }
      message = renderInvoiceDeliveryEmail(invoice, document.bytes, Boolean(order.customerAccountId), options.environment);
    } else {
      if (order.customer.email.trim().toLowerCase() !== claimed.recipient.trim().toLowerCase()) throw new Error("RECIPIENT_MISMATCH");
      message = renderOrderConfirmation(order, options.environment);
    }
    await mail.send({ ...message, to: claimed.recipient });
  } catch (error) {
    if (error instanceof Error && (["ORDER_NOT_FOUND", "INVOICE_NOT_FOUND", "RECIPIENT_MISMATCH"].includes(error.message))) failure = { code: error.message, retryable: false };
    else failure = classifyCustomerDeliveryFailure(error);
  }
  const completed = options.now?.() ?? new Date();
  if (!failure) {
    const result = await completeCustomerDeliveryAttempt({ deliveryId: claimed.id, attemptId: `customer-delivery-attempt-${randomUUID()}`, attemptNumber: claimed.attemptCount, leaseOwner: workerId, startedAt, completedAt: completed.toISOString(), outcome: "SENT" });
    if (claimed.deliveryType === "INVOICE_DELIVERY" && claimed.invoiceId) await recordAdminAuditBestEffort({ category: "ACTIVITY", actorType: "SYSTEM", subsystem: "ORDERS", actionType: "INVOICE_DELIVERY_SENT", entityType: "INVOICE", entityId: claimed.invoiceId, entityLabel: invoiceNumber ?? claimed.invoiceId, summary: "An existing canonical invoice was delivered to its persisted order recipient.", after: [{ label: "Delivery ID", value: claimed.id }, { label: "Order ID", value: claimed.orderId }, { label: "Invoice number", value: invoiceNumber ?? "Unavailable" }, { label: "Origin", value: claimed.originType }], targetRoute: "/admin/orders", idempotencyKey: `invoice-delivery-sent:${claimed.id}` });
    await bestEffortResolve(SMTP_ALERT);
    console.info("Customer delivery sent", { orderId: claimed.orderId, deliveryId: claimed.id, attemptNumber: claimed.attemptCount, status: "SENT" });
    return { state: "SENT" as const, ...result };
  }
  const retryAt = failure.retryable && claimed.attemptCount < CUSTOMER_DELIVERY_MAX_ATTEMPTS ? customerDeliveryRetryAt(claimed.attemptCount, completed) : undefined;
  const result = await completeCustomerDeliveryAttempt({ deliveryId: claimed.id, attemptId: `customer-delivery-attempt-${randomUUID()}`, attemptNumber: claimed.attemptCount, leaseOwner: workerId, startedAt, completedAt: completed.toISOString(), outcome: "FAILED", safeFailureCode: failure.code, nextAttemptAt: retryAt });
  if (failure.retryable && claimed.attemptCount >= 2) await bestEffortAlert({ ...SMTP_ALERT, severity: "CRITICAL", title: "Customer order email delivery is unavailable", summary: "Repeated customer delivery attempts could not reach the configured email transport.", targetRoute: "/admin/settings/health", recommendedAction: "Review email service health", customerImpactCount: 1 });
  console.warn("Customer delivery failed", { orderId: claimed.orderId, deliveryId: claimed.id, attemptNumber: claimed.attemptCount, status: "FAILED", failureCode: failure.code, retryScheduled: Boolean(retryAt) });
  return { state: "FAILED" as const, retryAt, failureCode: failure.code, ...result };
}

export async function runCustomerDeliveryBatch(options: CustomerDeliveryWorkerOptions = {}) {
  const now = options.now?.() ?? new Date();
  const due = await listDueCustomerDeliveries({ now: now.toISOString(), limit: options.limit ?? 20 });
  const results = [];
  for (const delivery of due) results.push(await processCustomerDelivery(delivery, options));
  return { due: due.length, claimed: results.filter((item) => item.state !== "NOT_CLAIMED").length, results };
}

export function startCustomerDeliveryWorker(options: CustomerDeliveryWorkerOptions & { pollMs?: number } = {}) {
  if (process.env.CUSTOMER_DELIVERY_WORKER_ENABLED === "false") return { enabled: false, stop: () => undefined };
  let stopped = false; let running = false; let consecutiveFailures = 0;
  const tick = async () => { if (stopped || running) return; running = true; try { await runCustomerDeliveryBatch(options); if (consecutiveFailures >= 2) await bestEffortResolve(WORKER_ALERT); consecutiveFailures = 0; } catch (error) { consecutiveFailures += 1; console.error("Customer delivery worker tick failed", { code: "CUSTOMER_DELIVERY_WORKER_FAILED", consecutiveFailures, error: error instanceof Error ? error.message : "Unknown error" }); if (consecutiveFailures >= 2) await bestEffortAlert({ ...WORKER_ALERT, severity: "CRITICAL", title: "Customer delivery worker is unavailable", summary: "The customer delivery worker has failed repeatedly and due messages remain persisted for recovery.", targetRoute: "/admin/settings/health", recommendedAction: "Review backend and PostgreSQL health" }); } finally { running = false; } };
  const timer = setInterval(() => void tick(), Math.max(1_000, options.pollMs ?? CUSTOMER_DELIVERY_POLL_MS));
  timer.unref(); void tick();
  return { enabled: true, stop: () => { stopped = true; clearInterval(timer); } };
}

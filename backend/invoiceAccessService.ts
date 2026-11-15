import { randomUUID } from "node:crypto";
import { recordAdminAuditBestEffort } from "./adminAuditService.js";
import { inspectInvoiceDocument } from "./invoiceDocumentService.js";
import { createCustomerDeliveryIdempotently, getCustomerDelivery, getInvoiceByOrderId, listCustomerDeliveriesByInvoice, listCustomerDeliveryAttempts, scheduleFailedCustomerDeliveryRetry, type CommerceCustomerDelivery } from "./persistence/invoiceDeliveryRepository.js";
import { loadPersistenceConfig } from "./persistence/config.js";
import { objectStorage } from "./storage/objectStorage.js";
import type { StaffAuthorizationContext } from "./staffAuthorization.js";
import { staffAuditActor } from "./staffAuthorization.js";

export class InvoiceAccessError extends Error {
  constructor(public readonly code: "INVOICE_NOT_FOUND" | "DOCUMENT_NOT_READY" | "DELIVERY_NOT_FOUND" | "DELIVERY_NOT_RETRYABLE" | "INVALID_REQUEST_ID" | "RECIPIENT_INVALID", message: string, public readonly status = 404) { super(message); }
}

const safeRequestId = (value: string) => {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(normalized)) throw new InvoiceAccessError("INVALID_REQUEST_ID", "A valid resend request identifier is required.", 400);
  return normalized;
};
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const invoicePersistenceAvailable = () => loadPersistenceConfig().provider === "POSTGRES";

export async function getCustomerInvoiceMetadata(orderId: string) {
  if (!invoicePersistenceAvailable()) return undefined;
  const invoice = await getInvoiceByOrderId(orderId);
  if (!invoice) return undefined;
  const document = await inspectInvoiceDocument(invoice.id, invoice.invoiceNumber);
  return { invoiceNumber: invoice.invoiceNumber, issuedAt: invoice.issuedAt, status: invoice.status, documentReady: document.status === "READY", downloadAvailable: document.status === "READY" };
}

export async function getAuthorizedInvoiceDownload(orderId: string) {
  if (!invoicePersistenceAvailable()) throw new InvoiceAccessError("INVOICE_NOT_FOUND", "Invoice not found.");
  const invoice = await getInvoiceByOrderId(orderId);
  if (!invoice) throw new InvoiceAccessError("INVOICE_NOT_FOUND", "Invoice not found.");
  const verified = await inspectInvoiceDocument(invoice.id, invoice.invoiceNumber);
  if (verified.status !== "READY") throw new InvoiceAccessError("DOCUMENT_NOT_READY", "Invoice document is not available.", 409);
  const filename = `${invoice.invoiceNumber}.pdf`;
  if (loadPersistenceConfig().objectStorage.provider === "SPACES") {
    const url = await objectStorage().createSignedDownload(verified.bundle.media.objectKey, 300, { filename, contentType: "application/pdf" });
    return { kind: "SIGNED_URL" as const, url, filename, invoice };
  }
  return { kind: "STREAM" as const, bytes: verified.bytes, filename, invoice };
}

async function deliveryView(delivery: CommerceCustomerDelivery) {
  const attempts = await listCustomerDeliveryAttempts(delivery.id);
  return { deliveryId: delivery.id, status: delivery.status, recipient: delivery.recipient, attempts: delivery.attemptCount, lastDeliveryAt: delivery.sentAt ?? delivery.lastAttemptAt, safeFailureCode: delivery.safeFailureCode, originType: delivery.originType, actorLabel: delivery.actorLabel, createdAt: delivery.createdAt, history: attempts.map((attempt) => ({ attemptNumber: attempt.attemptNumber, outcome: attempt.outcome, completedAt: attempt.completedAt, safeFailureCode: attempt.safeFailureCode })) };
}

export async function getAdminCommercialDocuments(orderId: string) {
  if (!invoicePersistenceAvailable()) return { invoice: undefined };
  const invoice = await getInvoiceByOrderId(orderId);
  if (!invoice) return { invoice: undefined };
  const document = await inspectInvoiceDocument(invoice.id, invoice.invoiceNumber);
  const deliveries = await listCustomerDeliveriesByInvoice(invoice.id);
  return { invoice: { invoiceNumber: invoice.invoiceNumber, status: invoice.status, issuedAt: invoice.issuedAt, total: invoice.total, currency: invoice.currency, documentStatus: document.status, documentFailureCode: document.status === "READY" ? undefined : document.failureCode, downloadAvailable: document.status === "READY", deliveries: await Promise.all(deliveries.map(deliveryView)) } };
}

export async function requestInvoiceResend(input: { orderId: string; requestId: string; actor: StaffAuthorizationContext; now?: Date }) {
  if (!invoicePersistenceAvailable()) throw new InvoiceAccessError("INVOICE_NOT_FOUND", "Invoice not found.");
  const invoice = await getInvoiceByOrderId(input.orderId);
  if (!invoice) throw new InvoiceAccessError("INVOICE_NOT_FOUND", "Invoice not found.");
  const document = await inspectInvoiceDocument(invoice.id, invoice.invoiceNumber);
  if (document.status !== "READY") throw new InvoiceAccessError("DOCUMENT_NOT_READY", "Invoice document is not available.", 409);
  const deliveries = await listCustomerDeliveriesByInvoice(invoice.id);
  const original = deliveries.find((item) => item.originType === "SYSTEM") ?? deliveries[0];
  if (!original || !validEmail(original.recipient)) throw new InvoiceAccessError("RECIPIENT_INVALID", "The persisted invoice recipient is not valid.", 409);
  const requestId = safeRequestId(input.requestId);
  const now = (input.now ?? new Date()).toISOString();
  const actor = staffAuditActor(input.actor);
  const result = await createCustomerDeliveryIdempotently({ id: `customer-delivery-${randomUUID()}`, orderId: invoice.orderId, invoiceId: invoice.id, deliveryType: "INVOICE_DELIVERY", recipient: original.recipient, idempotencyKey: `invoice-resend:${invoice.id}:${input.actor.actorId ?? "staff"}:${requestId}`, originType: "STAFF_USER", actorId: actor.actorId, actorLabel: actor.actorLabel, actorRole: actor.actorRole, createdAt: now, nextAttemptAt: now });
  if (result.created) await recordAdminAuditBestEffort({ category: "AUDIT", ...actor, subsystem: "ORDERS", actionType: "INVOICE_RESEND_REQUESTED", entityType: "INVOICE", entityId: invoice.id, entityLabel: invoice.invoiceNumber, summary: "A staff user requested another copy of an existing invoice be sent to the persisted order recipient.", before: [{ label: "Previous delivery state", value: original.status }], after: [{ label: "Order number", value: invoice.snapshot.orderNumber }, { label: "Invoice number", value: invoice.invoiceNumber }, { label: "Delivery ID", value: result.delivery.id }], targetRoute: `/admin/orders/${encodeURIComponent(invoice.snapshot.orderNumber)}`, idempotencyKey: `invoice-resend-audit:${result.delivery.id}` });
  return { delivery: await deliveryView(result.delivery), created: result.created };
}

export async function retryInvoiceDelivery(input: { orderId: string; deliveryId: string; actor: StaffAuthorizationContext; now?: Date }) {
  if (!invoicePersistenceAvailable()) throw new InvoiceAccessError("DELIVERY_NOT_FOUND", "Invoice delivery not found.");
  const invoice = await getInvoiceByOrderId(input.orderId);
  const delivery = await getCustomerDelivery(input.deliveryId);
  if (!invoice || !delivery || delivery.invoiceId !== invoice.id || delivery.orderId !== input.orderId || delivery.deliveryType !== "INVOICE_DELIVERY") throw new InvoiceAccessError("DELIVERY_NOT_FOUND", "Invoice delivery not found.");
  const document = await inspectInvoiceDocument(invoice.id, invoice.invoiceNumber);
  if (document.status !== "READY") throw new InvoiceAccessError("DOCUMENT_NOT_READY", "Invoice document is not available.", 409);
  const previous = delivery.status;
  const retried = await scheduleFailedCustomerDeliveryRetry({ deliveryId: delivery.id, now: (input.now ?? new Date()).toISOString() });
  if (!retried) throw new InvoiceAccessError("DELIVERY_NOT_RETRYABLE", "This invoice delivery cannot be retried automatically.", 409);
  const actor = staffAuditActor(input.actor);
  await recordAdminAuditBestEffort({ category: "AUDIT", ...actor, subsystem: "ORDERS", actionType: "INVOICE_DELIVERY_RETRY_REQUESTED", entityType: "INVOICE", entityId: invoice.id, entityLabel: invoice.invoiceNumber, summary: "A staff user retried a failed invoice delivery.", before: [{ label: "Previous delivery state", value: previous }], after: [{ label: "Order number", value: invoice.snapshot.orderNumber }, { label: "Invoice number", value: invoice.invoiceNumber }, { label: "Delivery ID", value: retried.id }], targetRoute: `/admin/orders/${encodeURIComponent(invoice.snapshot.orderNumber)}`, idempotencyKey: `invoice-retry-audit:${retried.id}:${retried.updatedAt}` });
  return { delivery: await deliveryView(retried) };
}

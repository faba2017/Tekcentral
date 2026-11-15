import { randomUUID } from "node:crypto";
import { ensureCanonicalInvoiceDelivery, ensureOrderConfirmationDelivery } from "./customerDeliveryService.js";
import { ensureInvoiceDocumentOperationally, inspectInvoiceDocument, type InvoiceDocumentDependencies } from "./invoiceDocumentService.js";
import { ensureInvoiceForPaidOrderOperationally } from "./invoiceService.js";
import { bestEffortAlert, bestEffortResolve } from "./operationalAlertService.js";
import { findOrdersMissingRequiredConfirmation, findPaidOrdersMissingRequiredInvoice } from "./persistence/commerceRepository.js";
import { findProspectiveInvoicesMissingDelivery, findProspectiveInvoicesMissingDocument } from "./persistence/invoiceDeliveryRepository.js";
import { withDistributedLock } from "./persistence/postgres.js";

export const COMMERCE_RECONCILIATION_BATCH_SIZE = 20;
export const COMMERCE_RECONCILIATION_GRACE_MS = 3 * 60 * 1_000;
export const COMMERCE_RECONCILIATION_DEVELOPMENT_POLL_MS = 60 * 1_000;
export const COMMERCE_RECONCILIATION_PRODUCTION_POLL_MS = 5 * 60 * 1_000;
const WORKER_ALERT = { type: "COMMERCE_RECONCILIATION_WORKER_OUTAGE", subsystem: "PAYMENTS" as const, diagnosticCode: "COMMERCE_RECONCILIATION_WORKER_FAILED" };

export interface CommerceReconciliationSummary {
  runId: string;
  startedAt: string;
  completedAt: string;
  cutoff: string;
  scanned: number;
  repairedConfirmations: number;
  repairedInvoices: number;
  repairedDocuments: number;
  repairedDeliveries: number;
  skipped: number;
  failed: number;
}

export interface CommerceReconciliationOptions {
  now?: () => Date;
  batchSize?: number;
  graceMs?: number;
  documentDependencies?: InvoiceDocumentDependencies;
}

const safeFailureCode = (error: unknown) => error instanceof Error ? error.message.split(":")[0].slice(0, 80) : "UNKNOWN_ERROR";
const boundedBatch = (value: number | undefined) => Math.max(1, Math.min(50, Math.trunc(value ?? COMMERCE_RECONCILIATION_BATCH_SIZE)));

export async function reconcileCommerceDocuments(options: CommerceReconciliationOptions = {}): Promise<CommerceReconciliationSummary> {
  const now = options.now?.() ?? new Date();
  const runId = `commerce-reconciliation-${randomUUID()}`;
  const cutoff = new Date(now.getTime() - Math.max(30_000, options.graceMs ?? COMMERCE_RECONCILIATION_GRACE_MS)).toISOString();
  const batchSize = boundedBatch(options.batchSize);
  const summary: CommerceReconciliationSummary = { runId, startedAt: now.toISOString(), completedAt: now.toISOString(), cutoff, scanned: 0, repairedConfirmations: 0, repairedInvoices: 0, repairedDocuments: 0, repairedDeliveries: 0, skipped: 0, failed: 0 };

  const confirmations = await findOrdersMissingRequiredConfirmation({ requiredBefore: cutoff, limit: batchSize });
  summary.scanned += confirmations.length;
  for (const candidate of confirmations) {
    try {
      const result = await ensureOrderConfirmationDelivery(candidate.order, now);
      if (result.created) summary.repairedConfirmations += 1; else summary.skipped += 1;
      console.info("Commerce reconciliation stage", { runId, stage: "ORDER_CONFIRMATION", orderNumber: candidate.order.orderNumber, outcome: result.created ? "REPAIRED" : "EXISTING" });
    } catch (error) {
      summary.failed += 1;
      console.error("Commerce reconciliation stage failed", { runId, stage: "ORDER_CONFIRMATION", orderNumber: candidate.order.orderNumber, failureCode: safeFailureCode(error) });
    }
  }

  const invoiceCandidates = await findPaidOrdersMissingRequiredInvoice({ requiredBefore: cutoff, limit: batchSize });
  summary.scanned += invoiceCandidates.length;
  for (const candidate of invoiceCandidates) {
    const result = await ensureInvoiceForPaidOrderOperationally(candidate.order.id, candidate.order.orderNumber, { ensureDocument: false });
    if (!result) summary.failed += 1;
    else if (result.created) summary.repairedInvoices += 1;
    else summary.skipped += 1;
  }

  const documentCandidates = await findProspectiveInvoicesMissingDocument({ requiredBefore: cutoff, limit: batchSize });
  summary.scanned += documentCandidates.length;
  for (const candidate of documentCandidates) {
    const result = await ensureInvoiceDocumentOperationally(candidate.invoice.id, candidate.invoice.invoiceNumber, options.documentDependencies);
    if (!result) summary.failed += 1;
    else if (result.created) summary.repairedDocuments += 1;
    else summary.skipped += 1;
  }

  const deliveryCandidates = await findProspectiveInvoicesMissingDelivery({ requiredBefore: cutoff, limit: batchSize });
  summary.scanned += deliveryCandidates.length;
  for (const candidate of deliveryCandidates) {
    const document = await inspectInvoiceDocument(candidate.invoice.id, candidate.invoice.invoiceNumber);
    if (document.status !== "READY") {
      summary.failed += 1;
      console.warn("Commerce reconciliation delivery blocked", { runId, stage: "INVOICE_DELIVERY", invoiceNumber: candidate.invoice.invoiceNumber, failureCode: document.failureCode });
      continue;
    }
    try {
      const result = await ensureCanonicalInvoiceDelivery(candidate.invoice, now);
      if (result.created) summary.repairedDeliveries += 1; else summary.skipped += 1;
      console.info("Commerce reconciliation stage", { runId, stage: "INVOICE_DELIVERY", invoiceNumber: candidate.invoice.invoiceNumber, outcome: result.created ? "REPAIRED" : "EXISTING" });
    } catch (error) {
      summary.failed += 1;
      console.error("Commerce reconciliation stage failed", { runId, stage: "INVOICE_DELIVERY", invoiceNumber: candidate.invoice.invoiceNumber, failureCode: safeFailureCode(error) });
    }
  }

  summary.completedAt = (options.now?.() ?? new Date()).toISOString();
  console.info("Commerce reconciliation completed", summary);
  return summary;
}

export async function runCommerceReconciliation(options: CommerceReconciliationOptions = {}) {
  return withDistributedLock("job:commerce-document-reconciliation", () => reconcileCommerceDocuments(options));
}

export function startCommerceReconciliationWorker(options: CommerceReconciliationOptions & { pollMs?: number; environment?: NodeJS.ProcessEnv } = {}) {
  const environment = options.environment ?? process.env;
  if (environment.COMMERCE_RECONCILIATION_WORKER_ENABLED !== "true") return { enabled: false, stop: () => undefined };
  const defaultPoll = environment.NODE_ENV === "production" ? COMMERCE_RECONCILIATION_PRODUCTION_POLL_MS : COMMERCE_RECONCILIATION_DEVELOPMENT_POLL_MS;
  const configuredPoll = Number(environment.COMMERCE_RECONCILIATION_POLL_MS);
  const pollMs = Math.max(30_000, Number.isFinite(configuredPoll) && configuredPoll > 0 ? configuredPoll : options.pollMs ?? defaultPoll);
  let stopped = false;
  let running = false;
  let consecutiveFailures = 0;
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const result = await runCommerceReconciliation(options);
      if (result.acquired) {
        if (consecutiveFailures >= 2) await bestEffortResolve(WORKER_ALERT);
        consecutiveFailures = 0;
      }
    } catch (error) {
      consecutiveFailures += 1;
      console.error("Commerce reconciliation worker tick failed", { failureCode: safeFailureCode(error), consecutiveFailures });
      if (consecutiveFailures >= 2) await bestEffortAlert({ ...WORKER_ALERT, severity: "CRITICAL", title: "Commerce document reconciliation is unavailable", summary: "Prospective commerce documents remain persisted for bounded recovery after repeated reconciliation failures.", targetRoute: "/admin/settings/health", recommendedAction: "Review PostgreSQL and commerce document health" });
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), pollMs);
  timer.unref();
  void tick();
  return { enabled: true, stop: () => { stopped = true; clearInterval(timer); } };
}

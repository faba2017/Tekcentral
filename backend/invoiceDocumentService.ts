import { createHash, randomUUID } from "node:crypto";
import { recordAdminAuditBestEffort } from "./adminAuditService.js";
import { renderInvoicePdf, INVOICE_PDF_RENDERER_VERSION, type InvoicePdfRenderResult } from "./invoicePdfRenderer.js";
import { bestEffortAlert, bestEffortResolve } from "./operationalAlertService.js";
import { getInvoiceById, getInvoiceDocumentBundle, persistInvoiceDocument, type CommerceInvoiceDocumentBundle } from "./persistence/invoiceDeliveryRepository.js";
import { loadPersistenceConfig } from "./persistence/config.js";
import { objectStorage, privateInvoiceKey, type ObjectStorage } from "./storage/objectStorage.js";

const RENDER_ALERT = { type: "INVOICE_DOCUMENT_RENDER_FAILURE", subsystem: "PAYMENTS" as const, diagnosticCode: "INVOICE_DOCUMENT_RENDER_FAILED" };
const STORAGE_ALERT = { type: "INVOICE_DOCUMENT_STORAGE_FAILURE", subsystem: "SYSTEM" as const, diagnosticCode: "INVOICE_DOCUMENT_STORAGE_FAILED" };
const INTEGRITY_ALERT = { type: "INVOICE_DOCUMENT_INTEGRITY_FAILURE", subsystem: "SYSTEM" as const, diagnosticCode: "INVOICE_DOCUMENT_INTEGRITY_FAILED" };

export type InvoiceDocumentFailureCode = "INVOICE_NOT_FOUND" | "INVOICE_DOCUMENT_RENDER_FAILED" | "INVOICE_DOCUMENT_STORAGE_FAILED" | "INVOICE_DOCUMENT_OBJECT_MISSING" | "INVOICE_DOCUMENT_HASH_MISMATCH" | "INVOICE_DOCUMENT_MEDIA_INVALID";

export class InvoiceDocumentError extends Error {
  constructor(public readonly code: InvoiceDocumentFailureCode, message: string, options?: ErrorOptions) { super(message, options); }
}

export interface InvoiceDocumentResult {
  bundle: CommerceInvoiceDocumentBundle;
  created: boolean;
  pageCount?: number;
}

export interface InvoiceDocumentDependencies {
  storage?: ObjectStorage;
  render?: typeof renderInvoicePdf;
  now?: () => Date;
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const isPdf = (bytes: Uint8Array) => bytes.length >= 5 && Buffer.from(bytes.subarray(0, 5)).toString("ascii") === "%PDF-";
const resolveDocumentAlerts = (invoiceId: string) => Promise.all([
  bestEffortResolve({ ...RENDER_ALERT, entityType: "INVOICE", entityId: invoiceId }),
  bestEffortResolve(STORAGE_ALERT),
  bestEffortResolve({ ...INTEGRITY_ALERT, entityType: "INVOICE", entityId: invoiceId }),
]);

export async function verifyInvoiceDocumentBundle(bundle: CommerceInvoiceDocumentBundle, storage: ObjectStorage = objectStorage()) {
  if (bundle.document.contentHash !== bundle.media.contentHash || bundle.media.contentType !== "application/pdf") throw new InvoiceDocumentError("INVOICE_DOCUMENT_MEDIA_INVALID", "Invoice document metadata is inconsistent.");
  const bytes = await storage.readObject(bundle.media.objectKey, "PRIVATE");
  if (!bytes) throw new InvoiceDocumentError("INVOICE_DOCUMENT_OBJECT_MISSING", "The canonical invoice document object is missing.");
  if (!isPdf(bytes) || bytes.length !== bundle.media.byteSize) throw new InvoiceDocumentError("INVOICE_DOCUMENT_MEDIA_INVALID", "The canonical invoice document object is invalid.");
  if (sha256(bytes) !== bundle.document.contentHash) throw new InvoiceDocumentError("INVOICE_DOCUMENT_HASH_MISMATCH", "The canonical invoice document failed integrity verification.");
  return bytes;
}

export async function readVerifiedInvoiceDocument(invoiceId: string, storage: ObjectStorage = objectStorage()) {
  const bundle = await getInvoiceDocumentBundle(invoiceId);
  if (!bundle) throw new InvoiceDocumentError("INVOICE_DOCUMENT_OBJECT_MISSING", "The canonical invoice document is not ready.");
  const bytes = await verifyInvoiceDocumentBundle(bundle, storage);
  return { bundle, bytes };
}

function classify(error: unknown): { code: InvoiceDocumentFailureCode; alert: typeof RENDER_ALERT | typeof STORAGE_ALERT | typeof INTEGRITY_ALERT } {
  if (error instanceof InvoiceDocumentError) {
    if (["INVOICE_DOCUMENT_OBJECT_MISSING", "INVOICE_DOCUMENT_HASH_MISMATCH", "INVOICE_DOCUMENT_MEDIA_INVALID"].includes(error.code)) return { code: error.code, alert: INTEGRITY_ALERT };
    if (error.code === "INVOICE_DOCUMENT_STORAGE_FAILED") return { code: error.code, alert: STORAGE_ALERT };
    return { code: error.code, alert: RENDER_ALERT };
  }
  const message = error instanceof Error ? error.message : "";
  if (/OBJECT_|STORAGE|BUCKET|S3|MEDIA_METADATA/.test(message)) return { code: "INVOICE_DOCUMENT_STORAGE_FAILED", alert: STORAGE_ALERT };
  return { code: "INVOICE_DOCUMENT_RENDER_FAILED", alert: RENDER_ALERT };
}

export async function ensureInvoiceDocument(invoiceId: string, dependencies: InvoiceDocumentDependencies = {}): Promise<InvoiceDocumentResult> {
  const storage = dependencies.storage ?? objectStorage();
  const existing = await getInvoiceDocumentBundle(invoiceId);
  if (existing) { await verifyInvoiceDocumentBundle(existing, storage); await resolveDocumentAlerts(invoiceId); return { bundle: existing, created: false }; }
  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) throw new InvoiceDocumentError("INVOICE_NOT_FOUND", "Invoice was not found.");
  let rendered: InvoicePdfRenderResult;
  try { rendered = await (dependencies.render ?? renderInvoicePdf)(invoice.snapshot); } catch (error) { throw new InvoiceDocumentError("INVOICE_DOCUMENT_RENDER_FAILED", "Invoice PDF rendering failed.", { cause: error }); }
  const contentHash = sha256(rendered.bytes);
  const objectKey = privateInvoiceKey(invoice.invoiceNumber, contentHash);
  let stored;
  try { stored = await storage.storeObject({ key: objectKey, access: "PRIVATE", bytes: rendered.bytes, contentType: "application/pdf", expectedHash: contentHash }); } catch (error) { throw new InvoiceDocumentError("INVOICE_DOCUMENT_STORAGE_FAILED", "Invoice PDF private storage failed.", { cause: error }); }
  if (stored.contentHash !== contentHash || stored.byteSize !== rendered.bytes.length || stored.contentType !== "application/pdf" || stored.access !== "PRIVATE") throw new InvoiceDocumentError("INVOICE_DOCUMENT_STORAGE_FAILED", "Invoice PDF storage verification failed.");
  let storedBytes;
  try { storedBytes = await storage.readObject(objectKey, "PRIVATE"); } catch (error) { throw new InvoiceDocumentError("INVOICE_DOCUMENT_STORAGE_FAILED", "Invoice PDF could not be read from private storage.", { cause: error }); }
  if (!storedBytes || !isPdf(storedBytes) || storedBytes.length !== rendered.bytes.length || sha256(storedBytes) !== contentHash) throw new InvoiceDocumentError("INVOICE_DOCUMENT_STORAGE_FAILED", "Invoice PDF could not be verified in private storage.");
  const config = loadPersistenceConfig();
  const createdAt = (dependencies.now ?? (() => new Date()))().toISOString();
  const persisted = await persistInvoiceDocument({ invoiceId, documentId: `invoice-document-${randomUUID()}`, mediaId: `invoice-media-${randomUUID()}`, rendererVersion: rendered.rendererVersion, contentHash, bucket: config.objectStorage.privateBucket ?? "local-private", objectKey, byteSize: rendered.bytes.length, createdAt });
  await verifyInvoiceDocumentBundle(persisted.bundle, storage);
  if (persisted.created) await recordAdminAuditBestEffort({ category: "ACTIVITY", actorType: "SYSTEM", subsystem: "PAYMENTS", actionType: "INVOICE_DOCUMENT_CREATED", entityType: "INVOICE", entityId: invoice.id, entityLabel: invoice.invoiceNumber, summary: "A canonical private invoice PDF was rendered and stored.", after: [{ label: "Invoice number", value: invoice.invoiceNumber }, { label: "Document ID", value: persisted.bundle.document.id }, { label: "Media ID", value: persisted.bundle.media.id }, { label: "Content fingerprint", value: contentHash }, { label: "Renderer version", value: INVOICE_PDF_RENDERER_VERSION }], targetRoute: `/admin/orders/${encodeURIComponent(invoice.snapshot.orderNumber)}`, idempotencyKey: `invoice-document-created:${persisted.bundle.document.id}` });
  await resolveDocumentAlerts(invoiceId);
  console.info("Invoice document ensured", { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, documentId: persisted.bundle.document.id, mediaId: persisted.bundle.media.id, rendererVersion: persisted.bundle.document.rendererVersion, outcome: persisted.created ? "CREATED" : "EXISTING", hashPrefix: contentHash.slice(0, 12) });
  return { bundle: persisted.bundle, created: persisted.created, pageCount: rendered.pageCount };
}

async function reportInvoiceDocumentFailure(invoiceId: string, invoiceNumber: string, error: unknown) {
  const failure = classify(error);
  console.error("Invoice document access failed", { invoiceId, invoiceNumber, code: failure.code });
  const invoiceSpecific = failure.alert !== STORAGE_ALERT;
  await bestEffortAlert({ type: failure.alert.type, severity: "CRITICAL", subsystem: failure.alert.subsystem, title: failure.alert === INTEGRITY_ALERT ? "Invoice document integrity needs attention" : failure.alert === STORAGE_ALERT ? "Invoice document storage is unavailable" : "Invoice document rendering is unavailable", summary: "A canonical invoice exists, but its private PDF document could not be safely accessed.", entityType: invoiceSpecific ? "INVOICE" : undefined, entityId: invoiceSpecific ? invoiceId : undefined, targetRoute: failure.alert === STORAGE_ALERT ? "/admin/settings/health" : "/admin/orders", recommendedAction: "Review invoice document health before customer delivery", diagnosticCode: failure.code, customerImpactCount: 1 });
  return failure;
}

export async function inspectInvoiceDocument(invoiceId: string, invoiceNumber: string) {
  const bundle = await getInvoiceDocumentBundle(invoiceId);
  if (!bundle) return { status: "MISSING" as const, failureCode: "INVOICE_DOCUMENT_OBJECT_MISSING" as const };
  try {
    const bytes = await verifyInvoiceDocumentBundle(bundle);
    await resolveDocumentAlerts(invoiceId);
    return { status: "READY" as const, bundle, bytes };
  } catch (error) {
    const failure = await reportInvoiceDocumentFailure(invoiceId, invoiceNumber, error);
    return { status: failure.code === "INVOICE_DOCUMENT_OBJECT_MISSING" ? "MISSING" as const : "FAILED" as const, failureCode: failure.code };
  }
}

export async function ensureInvoiceDocumentOperationally(invoiceId: string, invoiceNumber: string, dependencies: InvoiceDocumentDependencies = {}) {
  try { return await ensureInvoiceDocument(invoiceId, dependencies); }
  catch (error) {
    await reportInvoiceDocumentFailure(invoiceId, invoiceNumber, error);
    return undefined;
  }
}

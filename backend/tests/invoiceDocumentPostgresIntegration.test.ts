import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureInvoiceDocument, ensureInvoiceDocumentOperationally, InvoiceDocumentError } from "../invoiceDocumentService.js";
import { ensureInvoiceForPaidOrder } from "../invoiceService.js";
import { listAdminAudit } from "../adminAuditService.js";
import { listOperationalAlerts } from "../operationalAlertService.js";
import { getInvoiceDocumentBundle } from "../persistence/invoiceDeliveryRepository.js";
import { closePostgres, query, runMigrations } from "../persistence/postgres.js";
import { savePostgresOrder } from "../persistence/commerceRepository.js";
import { LocalObjectStorage, setObjectStorageForTests } from "../storage/objectStorage.js";
import type { BackendOrder } from "../types.js";

const databaseUrl = process.env.DATABASE_URL;
if (process.env.RUN_INVOICE_DOCUMENT_INTEGRATION !== "1" || !databaseUrl || !/_test(?:\?|$)/.test(new URL(databaseUrl).pathname)) throw new Error("Invoice document integration requires RUN_INVOICE_DOCUMENT_INTEGRATION=1 and an isolated *_test PostgreSQL database.");

const runId = `${Date.now()}-${process.pid}`;
const timestamp = "2026-11-14T10:00:00.000Z";
const fixture = (suffix: string): BackendOrder => ({
  id: `invoice-document-order-${suffix}-${runId}`, customerAccountId: null, orderNumber: `TC-2026-DOC-${suffix.toUpperCase()}-${runId}`, createdAt: timestamp, updatedAt: timestamp,
  customer: { firstName: "Document", lastName: "Fixture", email: `${suffix}@example.test`, mobile: "+27820000000", companyName: "Test Company" },
  deliveryAddress: { streetAddress: "1 Test Street", suburb: "Table View", city: "Cape Town", province: "Western Cape", postalCode: "7441", country: "South Africa" },
  deliveryMethod: { id: "standard", name: "Standard", description: "Tracked", estimatedRange: "2–5 business days", price: 149, enabled: true },
  paymentMethod: { id: "payfast", name: "PayFast", description: "Hosted", settlementNote: "Secure", enabled: true },
  payment: { provider: "payfast", status: "PAID", paymentReference: `PF-${suffix}`, payfastPaymentId: `PF-SAFE-${suffix}`, grossAmount: 1149, confirmedAt: timestamp, updatedAt: timestamp, processedItnIds: [] },
  items: [{ productId: `product-${suffix}`, slug: suffix, sku: `TC-${suffix}`, name: `Canonical Product ${suffix}`, brand: "Brand", quantity: 2, unitPrice: 500, lineTotal: 1000 }],
  subtotal: 1000, deliveryAmount: 149, taxAmount: 149.87, total: 1149, currency: "ZAR", status: "CONFIRMED", statusHistory: [], returns: [], refunds: [],
});

const root = await mkdtemp(join(tmpdir(), "tekcentral-j4-storage-"));
const storage = new LocalObjectStorage(root);
setObjectStorageForTests(storage);

try {
  await runMigrations();
  assert.equal((await query<{ count: string }>("SELECT count(*)::text count FROM commerce_invoice_documents")).rows[0].count, "0");
  const order = fixture("primary"); await savePostgresOrder(order); const invoice = (await ensureInvoiceForPaidOrder(order.id)).invoice;
  const concurrent = await Promise.all([ensureInvoiceDocument(invoice.id, { storage }), ensureInvoiceDocument(invoice.id, { storage })]);
  assert.equal(concurrent.filter((item) => item.created).length, 1);
  assert.equal(new Set(concurrent.map((item) => item.bundle.document.id)).size, 1);
  assert.equal(new Set(concurrent.map((item) => item.bundle.media.id)).size, 1);
  const bundle = (await getInvoiceDocumentBundle(invoice.id))!;
  assert.equal(bundle.document.rendererVersion, "invoice-pdf-v1");
  assert.equal(bundle.document.contentHash, bundle.media.contentHash);
  assert.equal(bundle.media.contentType, "application/pdf");
  assert.match(bundle.media.objectKey, new RegExp(`^invoices/${invoice.invoiceNumber}/[0-9a-f]{64}\\.pdf$`));
  const bytes = await storage.readObject(bundle.media.objectKey, "PRIVATE"); assert.ok(bytes); assert.equal(Buffer.from(bytes.subarray(0, 5)).toString("ascii"), "%PDF-"); assert.equal(createHash("sha256").update(bytes).digest("hex"), bundle.document.contentHash);
  const repeated = await ensureInvoiceDocument(invoice.id, { storage }); assert.equal(repeated.created, false); assert.equal(repeated.bundle.document.id, bundle.document.id);
  assert.equal((await query<{ count: string }>("SELECT count(*)::text count FROM commerce_invoice_documents WHERE invoice_id=$1", [invoice.id])).rows[0].count, "1");
  assert.equal((await query<{ count: string }>("SELECT count(*)::text count FROM media_objects WHERE object_scope='PRIVATE_INVOICE'")).rows[0].count, "1");
  const audits = await listAdminAudit({ actionType: "INVOICE_DOCUMENT_CREATED", page: 1, pageSize: 100 }); assert.equal(audits.records.filter((item) => item.entityId === invoice.id).length, 1); assert.equal(audits.records.find((item) => item.entityId === invoice.id)?.actorType, "SYSTEM");

  await query("UPDATE commerce_orders SET payload=jsonb_set(jsonb_set(payload,'{customer,firstName}',to_jsonb('Changed'::text)),'{items,0,name}',to_jsonb('Changed Product'::text)) WHERE id=$1", [order.id]);
  const immutable = await ensureInvoiceDocument(invoice.id, { storage }); assert.equal(immutable.bundle.document.contentHash, bundle.document.contentHash);

  const failureOrder = fixture("failure"); await savePostgresOrder(failureOrder); const failureInvoice = (await ensureInvoiceForPaidOrder(failureOrder.id)).invoice;
  const failingStorage = new LocalObjectStorage(join(root, "failing")); failingStorage.storeObject = async () => { throw new Error("CONTROLLED_STORAGE_UNAVAILABLE"); };
  await assert.rejects(() => ensureInvoiceDocument(failureInvoice.id, { storage: failingStorage }), (error: unknown) => error instanceof InvoiceDocumentError && error.code === "INVOICE_DOCUMENT_STORAGE_FAILED");
  assert.equal(await getInvoiceDocumentBundle(failureInvoice.id), undefined);
  setObjectStorageForTests(failingStorage); const operational = await ensureInvoiceDocumentOperationally(failureInvoice.id, failureInvoice.invoiceNumber); assert.equal(operational, undefined);
  assert.equal((await listOperationalAlerts({ status: "OPEN" })).some((item) => item.type === "INVOICE_DOCUMENT_STORAGE_FAILURE" && !item.entityId), true);
  setObjectStorageForTests(storage);
  const recovered = await ensureInvoiceDocumentOperationally(failureInvoice.id, failureInvoice.invoiceNumber); assert.ok(recovered);
  assert.equal((await listOperationalAlerts({ status: "OPEN" })).some((item) => item.type === "INVOICE_DOCUMENT_STORAGE_FAILURE"), false);

  await storage.storeObject({ key: bundle.media.objectKey, access: "PRIVATE", bytes: new TextEncoder().encode("%PDF-corrupt"), contentType: "application/pdf" });
  await assert.rejects(() => ensureInvoiceDocument(invoice.id, { storage }), (error: unknown) => error instanceof InvoiceDocumentError && ["INVOICE_DOCUMENT_MEDIA_INVALID", "INVOICE_DOCUMENT_HASH_MISMATCH"].includes(error.code));
  await storage.deleteObject(bundle.media.objectKey, "PRIVATE");
  await assert.rejects(() => ensureInvoiceDocument(invoice.id, { storage }), (error: unknown) => error instanceof InvoiceDocumentError && error.code === "INVOICE_DOCUMENT_OBJECT_MISSING");

  assert.equal((await query<{ count: string }>("SELECT count(*)::text count FROM commerce_invoice_documents")).rows[0].count, "2");
  assert.equal((await query<{ count: string }>("SELECT count(*)::text count FROM commerce_invoice_documents d JOIN media_objects m ON m.id=d.media_object_id WHERE m.object_scope='PRIVATE_INVOICE' AND m.content_type='application/pdf'")).rows[0].count, "2");
  assert.equal((await query<{ count: string }>("SELECT count(*)::text count FROM commerce_customer_delivery_attempts")).rows[0].count, "0");
  console.log(JSON.stringify({ documents: 2, privateMedia: 2, concurrentWinner: true, idempotent: true, storageFailureAssociation: 0, storageAlertRecovered: true, corruptionRejected: true, missingObjectRejected: true, smtpCalls: 0 }));
} finally { setObjectStorageForTests(undefined); await closePostgres(); }

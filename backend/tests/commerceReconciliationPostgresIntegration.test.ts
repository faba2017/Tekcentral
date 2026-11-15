import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listAdminAudit } from "../adminAuditService.js";
import { reconcileCommerceDocuments, runCommerceReconciliation, startCommerceReconciliationWorker } from "../commerceReconciliationService.js";
import { ensureInvoiceForPaidOrder } from "../invoiceService.js";
import { confirmVerifiedPayfastPayment } from "../orderRepository.js";
import { savePostgresOrder, saveProspectivePostgresOrder } from "../persistence/commerceRepository.js";
import { getInvoiceByOrderId, getInvoiceDocumentBundle, listCustomerDeliveriesByOrder } from "../persistence/invoiceDeliveryRepository.js";
import { closePostgres, query, runMigrations } from "../persistence/postgres.js";
import { LocalObjectStorage, setObjectStorageForTests } from "../storage/objectStorage.js";
import type { BackendOrder, PaymentStatus } from "../types.js";

const databaseUrl = process.env.DATABASE_URL;
if (process.env.RUN_COMMERCE_RECONCILIATION_INTEGRATION !== "1" || !databaseUrl || !/_test(?:\?|$)/.test(new URL(databaseUrl).pathname)) throw new Error("Commerce reconciliation integration requires RUN_COMMERCE_RECONCILIATION_INTEGRATION=1 and an isolated *_test PostgreSQL database.");

const runId = `${Date.now()}-${process.pid}`;
const timestamp = "2026-11-14T10:00:00.000Z";
const future = () => new Date(Date.now() + 10 * 60 * 1_000);
const fixture = (suffix: string, paymentStatus: PaymentStatus = "PENDING"): BackendOrder => ({
  id: `reconciliation-order-${suffix}-${runId}`, customerAccountId: null, orderNumber: `TC-2026-RECON-${suffix.toUpperCase()}-${runId}`, createdAt: timestamp, updatedAt: timestamp,
  customer: { firstName: "Recovery", lastName: "Fixture", email: `${suffix}@example.test`, mobile: "+27821234567" },
  deliveryAddress: { streetAddress: "1 Test Street", suburb: "Table View", city: "Cape Town", province: "Western Cape", postalCode: "7441", country: "South Africa" },
  deliveryMethod: { id: "standard", name: "Standard", description: "Tracked", estimatedRange: "2–5 business days", price: 149, enabled: true },
  paymentMethod: { id: "payfast", name: "PayFast", description: "Hosted", settlementNote: "Secure", enabled: true },
  payment: { provider: "payfast", status: paymentStatus, paymentReference: `PF-${suffix}`, grossAmount: 1149, confirmedAt: paymentStatus === "PAID" ? timestamp : undefined, updatedAt: timestamp, processedItnIds: [] },
  items: [{ productId: `product-${suffix}`, slug: suffix, sku: `SKU-${suffix}`, name: `Recovery Product ${suffix}`, brand: "Test", quantity: 2, unitPrice: 500, lineTotal: 1000 }],
  subtotal: 1000, deliveryAmount: 149, taxAmount: 149.87, total: 1149, currency: "ZAR", status: paymentStatus === "PAID" ? "CONFIRMED" : "PENDING", statusHistory: [], returns: [], refunds: [],
});

const root = await mkdtemp(join(tmpdir(), "tekcentral-j6b-storage-"));
const storage = new LocalObjectStorage(root);
setObjectStorageForTests(storage);

try {
  await runMigrations();
  await query("TRUNCATE commerce_customer_delivery_attempts,commerce_customer_deliveries,commerce_invoice_documents,commerce_invoices,commerce_orders,media_objects RESTART IDENTITY CASCADE");

  assert.equal(startCommerceReconciliationWorker({ environment: { COMMERCE_RECONCILIATION_WORKER_ENABLED: "false" } }).enabled, false);

  const historical = fixture("historical", "PAID");
  await savePostgresOrder(historical);
  const confirmation = fixture("confirmation");
  await saveProspectivePostgresOrder(confirmation);
  const invoiceOrder = fixture("invoice");
  await saveProspectivePostgresOrder(invoiceOrder);
  await confirmVerifiedPayfastPayment(invoiceOrder.orderNumber, { confirmedAt: timestamp, processedItnIds: ["j6b-itn"] });

  const first = await reconcileCommerceDocuments({ now: future, documentDependencies: { storage } });
  assert.equal(first.repairedConfirmations, 2);
  assert.equal(first.repairedInvoices, 1);
  assert.equal(first.repairedDocuments, 1);
  assert.equal(await getInvoiceByOrderId(historical.id), undefined, "unmarked historical paid Order must remain ignored");
  const issued = await getInvoiceByOrderId(invoiceOrder.id); assert.ok(issued);
  assert.ok(await getInvoiceDocumentBundle(issued.id));
  assert.deepEqual((await listCustomerDeliveriesByOrder(confirmation.id)).map((item) => item.deliveryType), ["ORDER_CONFIRMATION"]);
  assert.deepEqual((await listCustomerDeliveriesByOrder(invoiceOrder.id)).map((item) => item.deliveryType).sort(), ["INVOICE_DELIVERY", "ORDER_CONFIRMATION"]);
  assert.equal((await query<{ count: string }>("SELECT count(*)::text count FROM commerce_customer_delivery_attempts")).rows[0].count, "0", "reconciliation must not send SMTP");

  await query("DELETE FROM commerce_customer_deliveries WHERE invoice_id=$1 AND delivery_type='INVOICE_DELIVERY'", [issued.id]);
  const deliveryRepair = await reconcileCommerceDocuments({ now: future, documentDependencies: { storage } });
  assert.equal(deliveryRepair.repairedDeliveries, 1);
  assert.equal((await listCustomerDeliveriesByOrder(invoiceOrder.id)).filter((item) => item.deliveryType === "INVOICE_DELIVERY").length, 1);

  const partialOrder = fixture("partial-document");
  await saveProspectivePostgresOrder(partialOrder);
  await confirmVerifiedPayfastPayment(partialOrder.orderNumber, { confirmedAt: timestamp });
  const partialInvoice = (await ensureInvoiceForPaidOrder(partialOrder.id)).invoice;
  assert.equal(await getInvoiceDocumentBundle(partialInvoice.id), undefined);
  const documentRepair = await reconcileCommerceDocuments({ now: future, documentDependencies: { storage } });
  assert.equal(documentRepair.repairedDocuments, 1);
  assert.ok(await getInvoiceDocumentBundle(partialInvoice.id));

  const healthyCountsBefore = (await query<{ invoices: string; documents: string; deliveries: string; sequence: string }>("SELECT (SELECT count(*)::text FROM commerce_invoices) invoices,(SELECT count(*)::text FROM commerce_invoice_documents) documents,(SELECT count(*)::text FROM commerce_customer_deliveries) deliveries,(SELECT COALESCE(max(next_value),0)::text FROM app_sequences WHERE name='invoice') sequence")).rows[0];
  const healthy = await reconcileCommerceDocuments({ now: future, documentDependencies: { storage } });
  assert.equal(healthy.scanned, 0);
  const healthyCountsAfter = (await query<{ invoices: string; documents: string; deliveries: string; sequence: string }>("SELECT (SELECT count(*)::text FROM commerce_invoices) invoices,(SELECT count(*)::text FROM commerce_invoice_documents) documents,(SELECT count(*)::text FROM commerce_customer_deliveries) deliveries,(SELECT COALESCE(max(next_value),0)::text FROM app_sequences WHERE name='invoice') sequence")).rows[0];
  assert.deepEqual(healthyCountsAfter, healthyCountsBefore);

  const invoiceDelivery = (await listCustomerDeliveriesByOrder(invoiceOrder.id)).find((item) => item.deliveryType === "INVOICE_DELIVERY")!;
  await query("UPDATE commerce_customer_deliveries SET status='FAILED',safe_failure_code='INVALID_RECIPIENT',next_attempt_at=NULL WHERE id=$1", [invoiceDelivery.id]);
  const permanent = await reconcileCommerceDocuments({ now: future, documentDependencies: { storage } });
  assert.equal(permanent.repairedDeliveries, 0);
  assert.equal((await query<{ status: string }>("SELECT status FROM commerce_customer_deliveries WHERE id=$1", [invoiceDelivery.id])).rows[0].status, "FAILED");
  await query("UPDATE commerce_customer_deliveries SET status='SENDING',attempt_count=1,last_attempt_at=now()-interval '2 minutes',safe_failure_code=NULL,next_attempt_at=NULL,lease_owner='expired-worker',lease_expires_at=now()-interval '1 minute' WHERE id=$1", [invoiceDelivery.id]);
  await reconcileCommerceDocuments({ now: future, documentDependencies: { storage } });
  assert.equal((await query<{ status: string }>("SELECT status FROM commerce_customer_deliveries WHERE id=$1", [invoiceDelivery.id])).rows[0].status, "SENDING", "stale SENDING remains owned by the delivery worker");

  const corruptBundle = (await getInvoiceDocumentBundle(partialInvoice.id))!;
  await storage.deleteObject(corruptBundle.media.objectKey, "PRIVATE");
  await query("DELETE FROM commerce_customer_deliveries WHERE invoice_id=$1 AND delivery_type='INVOICE_DELIVERY'", [partialInvoice.id]);
  const corrupt = await reconcileCommerceDocuments({ now: future, documentDependencies: { storage } });
  assert.equal(corrupt.repairedDeliveries, 0);
  assert.ok(corrupt.failed >= 1);
  assert.ok(await getInvoiceDocumentBundle(partialInvoice.id), "immutable corrupt association must remain in place");
  assert.equal((await listCustomerDeliveriesByOrder(partialOrder.id)).some((item) => item.deliveryType === "INVOICE_DELIVERY"), false);

  const concurrentOrder = fixture("concurrent");
  await saveProspectivePostgresOrder(concurrentOrder);
  await Promise.all([reconcileCommerceDocuments({ now: future, documentDependencies: { storage } }), reconcileCommerceDocuments({ now: future, documentDependencies: { storage } })]);
  assert.equal((await listCustomerDeliveriesByOrder(concurrentOrder.id)).filter((item) => item.deliveryType === "ORDER_CONFIRMATION").length, 1);
  const locked = await Promise.all([runCommerceReconciliation({ now: future, documentDependencies: { storage } }), runCommerceReconciliation({ now: future, documentDependencies: { storage } })]);
  assert.ok(locked.every((item) => item.acquired === true || item.acquired === false));

  const issuanceAudits = await listAdminAudit({ actionType: "INVOICE_ISSUED", page: 1, pageSize: 100 });
  assert.equal(issuanceAudits.records.filter((item) => item.entityId === issued.id).length, 1);
  const documentAudits = await listAdminAudit({ actionType: "INVOICE_DOCUMENT_CREATED", page: 1, pageSize: 100 });
  assert.equal(documentAudits.records.filter((item) => item.entityId === issued.id).length, 1);

  console.log(JSON.stringify({ historicalIgnored: true, repairedConfirmation: true, repairedInvoice: true, repairedDocument: true, repairedDelivery: true, healthyNoop: true, permanentFailureUntouched: true, staleSendingUntouched: true, corruptDocumentFailedClosed: true, concurrentDeliveryCount: 1, smtpCalls: 0 }));
} finally {
  setObjectStorageForTests(undefined);
  await closePostgres();
  await rm(root, { recursive: true, force: true });
}

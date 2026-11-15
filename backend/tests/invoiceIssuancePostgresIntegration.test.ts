import assert from "node:assert/strict";
import { ensureInvoiceForPaidOrder, type InvoiceSellerSnapshot } from "../invoiceService.js";
import { ensureOrderConfirmationDelivery } from "../customerDeliveryService.js";
import { getInvoiceByOrderId, invoiceSnapshotHash, listCustomerDeliveriesByOrder } from "../persistence/invoiceDeliveryRepository.js";
import { closePostgres, query, runMigrations } from "../persistence/postgres.js";
import { savePostgresOrder } from "../persistence/commerceRepository.js";
import { updatePaymentStatus } from "../orderRepository.js";
import { listAdminAudit } from "../adminAuditService.js";
import type { BackendOrder, PaymentStatus } from "../types.js";

const databaseUrl = process.env.DATABASE_URL;
if (process.env.RUN_INVOICE_ISSUANCE_INTEGRATION !== "1" || !databaseUrl || !/_test(?:\?|$)/.test(new URL(databaseUrl).pathname)) throw new Error("Invoice issuance integration requires RUN_INVOICE_ISSUANCE_INTEGRATION=1 and an isolated *_test PostgreSQL database.");
const runId = `${Date.now()}-${process.pid}`;
const timestamp = "2026-11-14T10:00:00.000Z";
const sellerA: InvoiceSellerSnapshot = { legalName: "Seller A (Pty) Ltd", tradingName: "Seller A", registrationNumber: "A-REG", registeredAddress: { lines: ["Address A"], country: "South Africa" }, email: "a@example.test", phone: "+27000000001" };
const sellerB: InvoiceSellerSnapshot = { legalName: "Seller B (Pty) Ltd", tradingName: "Seller B", registrationNumber: "B-REG", registeredAddress: { lines: ["Address B"], country: "South Africa" }, email: "b@example.test", phone: "+27000000002" };

const fixture = (suffix: string, paymentStatus: PaymentStatus = "PAID"): BackendOrder => ({
  id: `invoice-order-${suffix}-${runId}`, customerAccountId: null, orderNumber: `TC-2026-${suffix.toUpperCase()}-${runId}`, createdAt: timestamp, updatedAt: timestamp,
  customer: { firstName: "Original", lastName: "Customer", email: `${suffix}@example.test`, mobile: "+27821234567", companyName: "Original Company", consigneeId: "PRIVATE-ID" },
  deliveryAddress: { streetAddress: "1 Original Street", suburb: "Table View", city: "Cape Town", province: "Western Cape", postalCode: "7441", country: "South Africa" },
  deliveryMethod: { id: "standard", name: "Standard", description: "Tracked", estimatedRange: "2–5 business days", price: 149, enabled: true },
  paymentMethod: { id: "payfast", name: "PayFast", description: "Hosted", settlementNote: "Secure", enabled: true },
  payment: { provider: "payfast", status: paymentStatus, paymentReference: `PF-${suffix}`, payfastPaymentId: `PF-SAFE-${suffix}`, grossAmount: 1149, confirmedAt: paymentStatus === "PAID" ? timestamp : undefined, updatedAt: timestamp, processedItnIds: [] },
  items: [{ productId: `product-${suffix}`, slug: suffix, sku: `TC-${suffix}`, name: `Original Product ${suffix}`, brand: "Brand", quantity: 2, unitPrice: 500, lineTotal: 1000, costBasis: { status: "COMPLETE", evaluatedAt: timestamp, productId: `product-${suffix}`, productSku: `TC-${suffix}`, quantity: 2, supplierId: "TVR", sourceUnitCost: 100, customerUnitPriceInclVat: 500, customerLineTotalInclVat: 1000, vatRatePercent: 15, vatAmount: 130.43, revenueExVat: 869.57 } }],
  subtotal: 1000, deliveryAmount: 149, taxAmount: 149.87, total: 1149, currency: "ZAR", status: paymentStatus === "PAID" ? "CONFIRMED" : "PENDING", statusHistory: [], returns: [], refunds: [], supplierAllocations: [{ id: `allocation-${suffix}`, orderId: `invoice-order-${suffix}-${runId}`, orderItemIds: [`product-${suffix}`], supplierCode: "TVR", supplierName: "Private Supplier", status: "ASSIGNED", createdAt: timestamp, updatedAt: timestamp }],
});

try {
  await runMigrations();
  const historical = fixture("historical"); await savePostgresOrder(historical);
  assert.equal((await query<{ count: string }>("SELECT count(*)::text count FROM commerce_invoices")).rows[0].count, "0", "startup must not backfill historical paid Orders");

  for (const status of ["PENDING", "CANCELLED", "FAILED"] as PaymentStatus[]) {
    const ineligible = fixture(status.toLowerCase(), status); await savePostgresOrder(ineligible);
    await assert.rejects(() => ensureInvoiceForPaidOrder(ineligible.id), /Only a backend-confirmed paid Order/);
  }
  assert.equal((await query<{ count: string }>("SELECT count(*)::text count FROM commerce_invoices")).rows[0].count, "0");

  const paid = fixture("paid"); await savePostgresOrder(paid); await ensureOrderConfirmationDelivery(paid, new Date(timestamp));
  const concurrent = await Promise.all([ensureInvoiceForPaidOrder(paid.id, { seller: sellerA }), ensureInvoiceForPaidOrder(paid.id, { seller: sellerB })]);
  assert.equal(concurrent.filter((item) => item.created).length, 1); assert.equal(new Set(concurrent.map((item) => item.invoice.id)).size, 1); assert.equal(new Set(concurrent.map((item) => item.invoice.invoiceNumber)).size, 1);
  const issued = concurrent[0].invoice; assert.match(issued.invoiceNumber, /^INV-2026-\d{6}$/); assert.equal(issued.status, "ISSUED"); assert.equal(issued.snapshotHash, invoiceSnapshotHash(issued.snapshot));
  assert.equal(issued.snapshot.lines[0].description, "Original Product paid"); assert.equal(issued.snapshot.total, 1149); assert.equal(issued.snapshot.deliveryAmount, 149); assert.equal(issued.snapshot.payment.reference, "PF-SAFE-paid"); assert.equal(issued.snapshot.billingAddress.source, "DELIVERY_ADDRESS_ONLY");
  const deliveries = await listCustomerDeliveriesByOrder(paid.id); assert.deepEqual(deliveries.map((item) => item.deliveryType).sort(), ["INVOICE_DELIVERY", "ORDER_CONFIRMATION"]); assert.equal(deliveries.find((item) => item.deliveryType === "INVOICE_DELIVERY")?.status, "PENDING");
  assert.equal((await query<{ count: string }>("SELECT count(*)::text count FROM commerce_customer_delivery_attempts")).rows[0].count, "0");
  const sequenceBefore = (await query<{ next_value: string }>("SELECT next_value::text FROM app_sequences WHERE name='invoice' AND year=2026")).rows[0].next_value;
  const duplicate = await ensureInvoiceForPaidOrder(paid.id, { seller: sellerB }); assert.equal(duplicate.created, false); assert.equal(duplicate.invoice.id, issued.id);
  const sequenceAfter = (await query<{ next_value: string }>("SELECT next_value::text FROM app_sequences WHERE name='invoice' AND year=2026")).rows[0].next_value; assert.equal(sequenceAfter, sequenceBefore, "existing invoice must not consume another number");
  const audit = await listAdminAudit({ actionType: "INVOICE_ISSUED", page: 1, pageSize: 100 }); assert.equal(audit.records.filter((item) => item.entityId === issued.id).length, 1); assert.equal(audit.records.find((item) => item.entityId === issued.id)?.actorType, "SYSTEM");

  await query("UPDATE commerce_orders SET payload=jsonb_set(jsonb_set(jsonb_set(payload,'{items,0,name}',to_jsonb('Changed Product'::text)),'{items,0,unitPrice}','9999'::jsonb),'{deliveryAmount}','999'::jsonb) WHERE id=$1", [paid.id]);
  await query("UPDATE commerce_orders SET payload=jsonb_set(jsonb_set(payload,'{customer,firstName}',to_jsonb('Changed Customer'::text)),'{items,0,costBasis,vatRatePercent}','20'::jsonb) WHERE id=$1", [paid.id]);
  const afterChanges = await getInvoiceByOrderId(paid.id); assert.deepEqual(afterChanges?.snapshot, issued.snapshot); assert.equal(afterChanges?.snapshotHash, issued.snapshotHash);
  await updatePaymentStatus(paid.orderNumber, "PARTIALLY_REFUNDED"); const afterRefund = await getInvoiceByOrderId(paid.id); assert.deepEqual(afterRefund?.snapshot, issued.snapshot);

  const different = [fixture("parallel-a"), fixture("parallel-b"), fixture("parallel-c")]; await Promise.all(different.map(savePostgresOrder));
  const parallel = await Promise.all(different.map((order, index) => ensureInvoiceForPaidOrder(order.id, { seller: index === 0 ? sellerB : sellerA })));
  assert.equal(new Set(parallel.map((item) => item.invoice.invoiceNumber)).size, 3); assert.equal(parallel[0].invoice.snapshot.seller.legalName, sellerB.legalName); assert.equal(issued.snapshot.seller.legalName, sellerA.legalName);
  const snapshotText = JSON.stringify(issued.snapshot); for (const forbidden of ["TVR", "sourceUnitCost", "supplierAllocations", "PRIVATE-ID", "consigneeId", "grossMargin"] ) assert.equal(snapshotText.includes(forbidden), false);

  const transition = fixture("transition", "PENDING"); await savePostgresOrder(transition); assert.equal(await getInvoiceByOrderId(transition.id), undefined);
  const paidTransition = await updatePaymentStatus(transition.orderNumber, "PAID", { grossAmount: 1149, confirmedAt: timestamp }); assert.ok(paidTransition); const transitionInvoice = await ensureInvoiceForPaidOrder(transition.id, { seller: sellerA }); assert.equal(transitionInvoice.created, true);
  assert.equal((await query<{ count: string }>("SELECT count(*)::text count FROM commerce_invoice_documents")).rows[0].count, "0");
  assert.equal((await query<{ count: string }>("SELECT count(*)::text count FROM media_objects WHERE object_scope='PRIVATE_INVOICE'")).rows[0].count, "0");
  console.log(JSON.stringify({ invoices: (await query<{ count: string }>("SELECT count(*)::text count FROM commerce_invoices")).rows[0].count, invoiceDeliveries: (await query<{ count: string }>("SELECT count(*)::text count FROM commerce_customer_deliveries WHERE delivery_type='INVOICE_DELIVERY'")).rows[0].count, invoiceDocuments: 0, smtpCalls: 0, historicalBackfill: 0, oneInvoiceUnderConcurrency: true, uniqueParallelNumbers: true, immutableAfterRefund: true }));
} finally { await closePostgres(); }

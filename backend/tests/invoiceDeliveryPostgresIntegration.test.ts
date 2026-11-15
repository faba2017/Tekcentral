import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  allocateInvoiceNumber,
  associateInvoiceDocument,
  canonicalInvoiceSnapshotJson,
  claimCustomerDelivery,
  completeCustomerDeliveryAttempt,
  createCustomerDeliveryIdempotently,
  createInvoiceIdempotently,
  getCustomerDelivery,
  getInvoiceById,
  getInvoiceByNumber,
  getInvoiceByOrderId,
  getInvoiceDocument,
  invoiceSnapshotHash,
  listCustomerDeliveriesByInvoice,
  listCustomerDeliveriesByOrder,
  listCustomerDeliveryAttempts,
  type InvoiceCommercialSnapshot,
} from "../persistence/invoiceDeliveryRepository.js";
import { closePostgres, query, runMigrations } from "../persistence/postgres.js";

const databaseUrl = process.env.DATABASE_URL;
if (process.env.RUN_INVOICE_PERSISTENCE_INTEGRATION !== "1" || !databaseUrl || !/_test(?:\?|$)/.test(new URL(databaseUrl).pathname)) {
  throw new Error("Invoice persistence integration requires RUN_INVOICE_PERSISTENCE_INTEGRATION=1 and an isolated *_test PostgreSQL database.");
}

const runId = `${Date.now()}-${process.pid}`;
const now = new Date("2026-11-14T10:00:00.000Z");
const orderId = `invoice-test-order-${runId}`;
const orderNumber = `TC-2026-${String(Date.now()).slice(-6)}`;
const invoiceId = `invoice-${runId}`;

const snapshot = (invoiceNumber: string): InvoiceCommercialSnapshot => ({
  schemaVersion: 1,
  invoiceNumber,
  issuedAt: now.toISOString(),
  orderNumber,
  seller: {
    legalName: "TEKCENTRAL (Pty) Ltd",
    tradingName: "TekCentral",
    registrationNumber: "2026/701802/07",
    registeredAddress: { lines: ["Test snapshot address"], country: "South Africa" },
    email: "info@example.test",
    phone: "+27 00 000 0000",
  },
  customer: { name: "Persistence Test", email: "customer@example.test", companyName: "Example Test Company" },
  billingAddress: { lines: ["Immutable billing snapshot"], country: "South Africa" },
  lines: [{ productId: "product-test", description: "Immutable Product title", sku: "SKU-TEST", quantity: 1, unitPrice: 100, lineTotal: 100 }],
  subtotal: 100,
  deliveryAmount: 20,
  taxAmount: 15.65,
  total: 120,
  currency: "ZAR",
  payment: { provider: "payfast", reference: "SAFE-REFERENCE", status: "PAID", confirmedAt: now.toISOString() },
  taxEvidence: { ratePercent: 15, treatment: "INCLUDED" },
});

try {
  const migration = await runMigrations();
  assert.equal(migration.discovered >= 15, true);
  assert.equal((await query<{ count: string }>("SELECT count(*)::text count FROM commerce_invoices")).rows[0].count, "0", "isolated database must begin without invoices");

  await query("INSERT INTO commerce_orders(id,order_number,status,payment_status,currency,total,payload,created_at,updated_at) VALUES($1,$2,'CONFIRMED','PAID','ZAR',120,$3::jsonb,$4,$4)", [orderId, orderNumber, JSON.stringify({ id: orderId, orderNumber, marker: "ORIGINAL_ORDER" }), now.toISOString()]);

  const invoiceNumbers = await Promise.all(Array.from({ length: 20 }, () => allocateInvoiceNumber(2026)));
  assert.equal(new Set(invoiceNumbers).size, 20, "invoice sequence allocations must be unique");
  assert.equal(invoiceNumbers.every((value) => /^INV-2026-\d{6}$/.test(value)), true);
  const candidateA = invoiceNumbers[0];
  const candidateB = invoiceNumbers[1];
  const createInput = (invoiceNumber: string, id: string) => ({
    id,
    orderId,
    invoiceNumber,
    status: "ISSUED" as const,
    issuedAt: now.toISOString(),
    currency: "ZAR",
    subtotal: 100,
    deliveryAmount: 20,
    taxAmount: 15.65,
    total: 120,
    paymentReference: "SAFE-REFERENCE",
    snapshot: snapshot(invoiceNumber),
    snapshotSchemaVersion: 1,
    createdAt: now.toISOString(),
  });
  const concurrentInvoices = await Promise.all([
    createInvoiceIdempotently(createInput(candidateA, invoiceId)),
    createInvoiceIdempotently(createInput(candidateB, `${invoiceId}-competitor`)),
  ]);
  assert.equal(concurrentInvoices.filter((result) => result.created).length, 1, "one canonical invoice must win per order");
  assert.equal(concurrentInvoices[0].invoice.id, concurrentInvoices[1].invoice.id);
  const invoice = concurrentInvoices[0].invoice;
  assert.equal((await getInvoiceById(invoice.id))?.invoiceNumber, invoice.invoiceNumber);
  assert.equal((await getInvoiceByOrderId(orderId))?.id, invoice.id);
  assert.equal((await getInvoiceByNumber(invoice.invoiceNumber))?.orderId, orderId);
  assert.equal(invoice.snapshotHash, invoiceSnapshotHash(invoice.snapshot));
  assert.equal(invoice.snapshotHash, createHash("sha256").update(canonicalInvoiceSnapshotJson(invoice.snapshot)).digest("hex"));

  await query("UPDATE commerce_orders SET payload=$2::jsonb WHERE id=$1", [orderId, JSON.stringify({ id: orderId, orderNumber, marker: "CHANGED_AFTER_INVOICE", productName: "Changed live Product" })]);
  assert.deepEqual((await getInvoiceById(invoice.id))?.snapshot, invoice.snapshot, "order/Product changes must not alter invoice snapshot");
  await assert.rejects(() => query("UPDATE commerce_invoices SET total=999 WHERE id=$1", [invoice.id]), /immutable/i);
  assert.equal((await getInvoiceById(invoice.id))?.total, 120, "issued invoice rows must reject ordinary update semantics");

  const pdf = Buffer.from("%PDF-1.4\nJ.2A isolated fixture\n%%EOF");
  const mediaHash = createHash("sha256").update(pdf).digest("hex");
  const mediaId = `invoice-media-${runId}`;
  await query("INSERT INTO media_objects(id,object_scope,bucket,object_key,content_hash,content_type,byte_size,created_at) VALUES($1,'PRIVATE_INVOICE','test-private',$2,$3,'application/pdf',$4,$5)", [mediaId, `invoices/${invoice.invoiceNumber}/${mediaHash}.pdf`, mediaHash, pdf.length, now.toISOString()]);
  const associated = await associateInvoiceDocument({ id: `invoice-document-${runId}`, invoiceId: invoice.id, mediaObjectId: mediaId, rendererVersion: "fixture-renderer-1", contentHash: mediaHash, createdAt: now.toISOString() });
  assert.equal(associated.created, true);
  assert.equal((await getInvoiceDocument(invoice.id))?.mediaObjectId, mediaId);
  assert.equal((await associateInvoiceDocument(associated.document)).created, false, "same document association must be idempotent");

  const secondMediaId = `invoice-media-conflict-${runId}`;
  await query("INSERT INTO media_objects(id,object_scope,bucket,object_key,content_hash,content_type,byte_size,created_at) VALUES($1,'PRIVATE_INVOICE','test-private',$2,$3,'application/pdf',$4,$5)", [secondMediaId, `invoices/${invoice.invoiceNumber}/${"b".repeat(64)}.pdf`, "b".repeat(64), pdf.length, now.toISOString()]);
  await assert.rejects(() => associateInvoiceDocument({ ...associated.document, id: `invoice-document-conflict-${runId}`, mediaObjectId: secondMediaId, contentHash: "b".repeat(64) }), /INVOICE_DOCUMENT_ALREADY_ASSOCIATED/);

  const confirmationKey = `order-confirmation:${orderId}`;
  const confirmationInput = { id: `delivery-confirmation-${runId}`, orderId, deliveryType: "ORDER_CONFIRMATION" as const, recipient: "customer@example.test", idempotencyKey: confirmationKey, originType: "SYSTEM" as const, createdAt: now.toISOString() };
  const concurrentConfirmations = await Promise.all([createCustomerDeliveryIdempotently(confirmationInput), createCustomerDeliveryIdempotently({ ...confirmationInput, id: `${confirmationInput.id}-duplicate` })]);
  assert.equal(concurrentConfirmations.filter((result) => result.created).length, 1);
  assert.equal(concurrentConfirmations[0].delivery.id, concurrentConfirmations[1].delivery.id);

  const invoiceDeliveryKey = `invoice-delivery:${invoice.id}`;
  const invoiceDeliveryInput = { id: `delivery-invoice-${runId}`, orderId, invoiceId: invoice.id, deliveryType: "INVOICE_DELIVERY" as const, recipient: "customer@example.test", idempotencyKey: invoiceDeliveryKey, originType: "SYSTEM" as const, createdAt: now.toISOString() };
  const invoiceDeliveries = await Promise.all([createCustomerDeliveryIdempotently(invoiceDeliveryInput), createCustomerDeliveryIdempotently({ ...invoiceDeliveryInput, id: `${invoiceDeliveryInput.id}-duplicate` })]);
  assert.equal(invoiceDeliveries.filter((result) => result.created).length, 1);
  assert.equal((await listCustomerDeliveriesByOrder(orderId)).length, 2);
  assert.equal((await listCustomerDeliveriesByInvoice(invoice.id)).length, 1);

  const deliveryId = concurrentConfirmations[0].delivery.id;
  const claims = await Promise.all([
    claimCustomerDelivery({ deliveryId, leaseOwner: "worker-a", now: now.toISOString(), leaseSeconds: 60 }),
    claimCustomerDelivery({ deliveryId, leaseOwner: "worker-b", now: now.toISOString(), leaseSeconds: 60 }),
  ]);
  assert.equal(claims.filter(Boolean).length, 1, "only one worker may claim a delivery");
  const firstClaim = claims.find(Boolean)!;
  const retryAt = new Date(now.getTime() + 120_000).toISOString();
  await completeCustomerDeliveryAttempt({ deliveryId, attemptId: `attempt-1-${runId}`, attemptNumber: firstClaim.attemptCount, leaseOwner: firstClaim.leaseOwner!, startedAt: now.toISOString(), completedAt: new Date(now.getTime() + 1_000).toISOString(), outcome: "FAILED", safeFailureCode: "SMTP_UNAVAILABLE", nextAttemptAt: retryAt });
  assert.equal((await getCustomerDelivery(deliveryId))?.nextAttemptAt, retryAt);
  assert.equal(await claimCustomerDelivery({ deliveryId, leaseOwner: "worker-early", now: new Date(now.getTime() + 60_000).toISOString() }), undefined, "retry must wait for durable next_attempt_at");

  await closePostgres();
  const reloaded = await getCustomerDelivery(deliveryId);
  assert.equal(reloaded?.status, "FAILED");
  assert.equal(reloaded?.safeFailureCode, "SMTP_UNAVAILABLE");
  const secondClaim = await claimCustomerDelivery({ deliveryId, leaseOwner: "worker-retry", now: retryAt, leaseSeconds: 60 });
  assert.ok(secondClaim);
  await completeCustomerDeliveryAttempt({ deliveryId, attemptId: `attempt-2-${runId}`, attemptNumber: secondClaim.attemptCount, leaseOwner: "worker-retry", startedAt: retryAt, completedAt: new Date(Date.parse(retryAt) + 1_000).toISOString(), outcome: "SENT", providerReference: "safe-provider-reference" });
  const attempts = await listCustomerDeliveryAttempts(deliveryId);
  assert.deepEqual(attempts.map((attempt) => attempt.attemptNumber), [1, 2]);
  assert.deepEqual(attempts.map((attempt) => attempt.outcome), ["FAILED", "SENT"]);
  await assert.rejects(() => query("UPDATE commerce_customer_delivery_attempts SET outcome='FAILED' WHERE id=$1", [attempts[1].id]), /immutable/i);
  assert.equal((await listCustomerDeliveryAttempts(deliveryId))[1].outcome, "SENT", "attempt history must be append-only");

  const columns = (await query<{ table_name: string; column_name: string }>("SELECT table_name,column_name FROM information_schema.columns WHERE table_name IN ('commerce_invoices','commerce_invoice_documents','commerce_customer_deliveries','commerce_customer_delivery_attempts')")).rows.map((row) => `${row.table_name}.${row.column_name}`.toLowerCase());
  for (const forbidden of ["passphrase", "secret", "itn_payload", "card_number", "password", "session_token", "supplier_cost", "margin", "email_body", "smtp_transcript"]) assert.equal(columns.some((column) => column.includes(forbidden)), false, `forbidden secret/commercial column: ${forbidden}`);

  await assert.rejects(() => query("DELETE FROM commerce_orders WHERE id=$1", [orderId]), /foreign key|violates/i, "order deletion must not orphan an invoice");
  assert.equal((await getInvoiceById(invoice.id))?.orderId, orderId);
  console.log(JSON.stringify({ invoices: 1, documents: 1, deliveries: 2, attempts: 2, concurrentInvoiceWinner: true, concurrentDeliveryWinner: true, retrySurvivedReconnect: true }));
} finally {
  await closePostgres();
}

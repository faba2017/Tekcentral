import assert from "node:assert/strict";
import type { MailMessage, MailTransport } from "../mailService.js";
import { ensureOrderConfirmationDelivery, runCustomerDeliveryBatch } from "../customerDeliveryService.js";
import { getCustomerDelivery, listCustomerDeliveriesByOrder, listCustomerDeliveryAttempts } from "../persistence/invoiceDeliveryRepository.js";
import { closePostgres, query, runMigrations } from "../persistence/postgres.js";
import { savePostgresOrder } from "../persistence/commerceRepository.js";
import { listOperationalAlerts } from "../operationalAlertService.js";
import type { BackendOrder } from "../types.js";

const databaseUrl = process.env.DATABASE_URL;
if (process.env.RUN_ORDER_CONFIRMATION_INTEGRATION !== "1" || !databaseUrl || !/_test(?:\?|$)/.test(new URL(databaseUrl).pathname)) throw new Error("Order confirmation integration requires RUN_ORDER_CONFIRMATION_INTEGRATION=1 and an isolated *_test PostgreSQL database.");

const runId = `${Date.now()}-${process.pid}`;
const at = (minutes: number) => new Date(Date.parse("2026-11-14T10:00:00.000Z") + minutes * 60_000);
const fixture = (suffix: string, input: { account?: boolean; email?: string } = {}): BackendOrder => ({
  id: `order-confirmation-${suffix}-${runId}`,
  customerAccountId: input.account ? `customer-${suffix}` : null,
  orderNumber: `TC-2026-${suffix.toUpperCase()}-${runId}`,
  createdAt: at(0).toISOString(), updatedAt: at(0).toISOString(),
  customer: { firstName: "Test", lastName: `<${suffix}>`, email: input.email ?? `${suffix}@example.test`, mobile: "+27821234567" },
  deliveryAddress: { streetAddress: "1 Test Street", suburb: "Table View", city: "Cape Town", province: "Western Cape", postalCode: "7441", country: "South Africa" },
  deliveryMethod: { id: "standard", name: "Standard delivery", description: "Tracked", estimatedRange: "2–5 business days", price: 149, enabled: true },
  paymentMethod: { id: "payfast", name: "PayFast", description: "Hosted", settlementNote: "Secure", enabled: true },
  payment: { provider: "payfast", status: "PENDING", paymentReference: `PF-${suffix}`, updatedAt: at(0).toISOString(), processedItnIds: [] },
  items: [{ productId: `product-${suffix}`, slug: suffix, sku: `SKU-${suffix}`, name: `Persisted Product ${suffix}`, brand: "Test", quantity: 2, unitPrice: 500, lineTotal: 1000 }],
  subtotal: 1000, deliveryAmount: 149, taxAmount: 149.87, total: 1149, currency: "ZAR", status: "PENDING",
  statusHistory: [{ status: "PENDING", label: "Order placed", createdAt: at(0).toISOString() }], returns: [], refunds: [],
});

class RecordingMail implements MailTransport {
  messages: MailMessage[] = [];
  failures: Error[] = [];
  async send(message: MailMessage) { this.messages.push(message); const failure = this.failures.shift(); if (failure) throw failure; }
}

try {
  await runMigrations();
  assert.equal((await query<{ count: string }>("SELECT count(*)::text count FROM commerce_customer_deliveries")).rows[0].count, "0");
  const historical = fixture("historical"); await savePostgresOrder(historical);
  const historicalBatch = await runCustomerDeliveryBatch({ mail: new RecordingMail(), now: () => at(1), workerId: "historical-worker" });
  assert.equal(historicalBatch.due, 0, "worker must not infer deliveries for historical orders");
  assert.equal((await listCustomerDeliveriesByOrder(historical.id)).length, 0);

  const registered = fixture("registered", { account: true });
  await query("INSERT INTO customers(id,email,normalized_email,display_name,password_hash,status,created_at,updated_at) VALUES($1,$2,$2,'Registered Test','test-hash','ACTIVE',$3,$3)", [registered.customerAccountId, registered.customer.email, registered.createdAt]);
  await savePostgresOrder(registered);
  const enqueues = await Promise.all([ensureOrderConfirmationDelivery(registered, at(1)), ensureOrderConfirmationDelivery(registered, at(1)), ensureOrderConfirmationDelivery(registered, at(1))]);
  assert.equal(enqueues.filter((item) => item.created).length, 1);
  assert.equal(new Set(enqueues.map((item) => item.delivery.id)).size, 1);
  assert.equal(enqueues[0].delivery.originType, "SYSTEM"); assert.equal(enqueues[0].delivery.actorId, undefined);
  const concurrentMail = new RecordingMail();
  const concurrent = await Promise.all([
    runCustomerDeliveryBatch({ mail: concurrentMail, now: () => at(2), workerId: "worker-a" }),
    runCustomerDeliveryBatch({ mail: concurrentMail, now: () => at(2), workerId: "worker-b" }),
  ]);
  assert.equal(concurrent.reduce((sum, item) => sum + item.claimed, 0), 1);
  assert.equal(concurrentMail.messages.length, 1);
  assert.equal(concurrentMail.messages[0].to, registered.customer.email);
  assert.match(concurrentMail.messages[0].text, /account\/orders\//);
  const sent = await getCustomerDelivery(enqueues[0].delivery.id); assert.equal(sent?.status, "SENT"); assert.ok(sent?.sentAt); assert.equal(sent?.nextAttemptAt, undefined);
  assert.equal((await listCustomerDeliveryAttempts(enqueues[0].delivery.id)).length, 1);

  const guest = fixture("guest"); await savePostgresOrder(guest); const guestDelivery = (await ensureOrderConfirmationDelivery(guest, at(3))).delivery;
  const retryMail = new RecordingMail(); retryMail.failures.push(new Error("SMTP_TIMEOUT"));
  const first = await runCustomerDeliveryBatch({ mail: retryMail, now: () => at(3), workerId: "retry-worker-1" });
  assert.equal(first.results[0]?.state, "FAILED");
  const failed = await getCustomerDelivery(guestDelivery.id); assert.equal(failed?.status, "FAILED"); assert.equal(failed?.safeFailureCode, "SMTP_CONNECTION_FAILED"); assert.equal(failed?.nextAttemptAt, at(4).toISOString());
  await closePostgres();
  const retry = await runCustomerDeliveryBatch({ mail: retryMail, now: () => at(4), workerId: "retry-worker-2" });
  assert.equal(retry.results[0]?.state, "SENT"); assert.equal(retryMail.messages.length, 2); assert.doesNotMatch(retryMail.messages[1].text, /token=/i);
  const attempts = await listCustomerDeliveryAttempts(guestDelivery.id); assert.deepEqual(attempts.map((item) => item.outcome), ["FAILED", "SENT"]);

  const invalid = fixture("invalid", { email: "invalid-address" }); await savePostgresOrder(invalid); const invalidDelivery = (await ensureOrderConfirmationDelivery(invalid, at(5))).delivery;
  const invalidMail = new RecordingMail(); await runCustomerDeliveryBatch({ mail: invalidMail, now: () => at(5), workerId: "invalid-worker" });
  const permanent = await getCustomerDelivery(invalidDelivery.id); assert.equal(permanent?.status, "FAILED"); assert.equal(permanent?.safeFailureCode, "INVALID_RECIPIENT"); assert.equal(permanent?.nextAttemptAt, undefined); assert.equal(invalidMail.messages.length, 0);
  const later = await runCustomerDeliveryBatch({ mail: invalidMail, now: () => at(100), workerId: "invalid-worker-later" }); assert.equal(later.claimed, 0, "permanent failure must not retry");

  const outageOrder = fixture("outage"); await savePostgresOrder(outageOrder); await ensureOrderConfirmationDelivery(outageOrder, at(20));
  const outageMail = new RecordingMail(); outageMail.failures.push(new Error("ECONNREFUSED"), new Error("SMTP_451"));
  await runCustomerDeliveryBatch({ mail: outageMail, now: () => at(20), workerId: "outage-worker-1" });
  await runCustomerDeliveryBatch({ mail: outageMail, now: () => at(21), workerId: "outage-worker-2" });
  assert.equal((await listOperationalAlerts({ status: "OPEN", subsystem: "EMAIL" })).filter((item) => item.type === "CUSTOMER_DELIVERY_SMTP_OUTAGE").length, 1, "repeated transient failures must coalesce one H.1 incident");
  await runCustomerDeliveryBatch({ mail: outageMail, now: () => at(26), workerId: "outage-worker-recovery" });
  assert.equal((await listOperationalAlerts({ subsystem: "EMAIL" })).find((item) => item.type === "CUSTOMER_DELIVERY_SMTP_OUTAGE")?.status, "RESOLVED");

  const staleOrder = fixture("stale"); await savePostgresOrder(staleOrder); const stale = (await ensureOrderConfirmationDelivery(staleOrder, at(6))).delivery;
  const claimed = await query("UPDATE commerce_customer_deliveries SET status='SENDING',attempt_count=1,last_attempt_at=$2,next_attempt_at=NULL,lease_owner='crashed-worker',lease_expires_at=$2::timestamptz+interval '15 seconds',updated_at=$2 WHERE id=$1", [stale.id, at(6).toISOString()]); assert.equal(claimed.rowCount, 1);
  const staleMail = new RecordingMail(); const recovered = await runCustomerDeliveryBatch({ mail: staleMail, now: () => new Date(at(6).getTime() + 16_000), workerId: "recovery-worker" }); assert.equal(recovered.results[0]?.state, "SENT"); assert.equal(staleMail.messages.length, 1);

  const originalTotals = registered.total;
  await query("UPDATE commerce_orders SET payload=jsonb_set(payload,'{items,0,unitPrice}','9999'::jsonb) WHERE id=$1", [registered.id]);
  assert.equal(concurrentMail.messages[0].text.includes("9,999"), false); assert.equal(originalTotals, 1149);
  assert.equal((await query<{ count: string }>("SELECT count(*)::text count FROM commerce_invoices")).rows[0].count, "0");
  assert.equal((await query<{ count: string }>("SELECT count(*)::text count FROM commerce_invoice_documents")).rows[0].count, "0");
  assert.equal((await query<{ count: string }>("SELECT count(*)::text count FROM media_objects WHERE object_scope='PRIVATE_INVOICE'")).rows[0].count, "0");
  assert.equal((await query<{ count: string }>("SELECT count(*)::text count FROM commerce_customer_deliveries WHERE origin_type='STAFF_USER'")).rows[0].count, "0");
  console.log(JSON.stringify({ deliveries: (await query<{ count: string }>("SELECT count(*)::text count FROM commerce_customer_deliveries")).rows[0].count, attempts: (await query<{ count: string }>("SELECT count(*)::text count FROM commerce_customer_delivery_attempts")).rows[0].count, injectedSmtpMessages: concurrentMail.messages.length + retryMail.messages.length + outageMail.messages.length + staleMail.messages.length, historicalBackfill: 0, invoices: 0, invoiceDocuments: 0, concurrentClaimWinner: true, retrySurvivedReconnect: true, staleLeaseRecovered: true }));
} finally {
  await closePostgres();
}

import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listAdminAudit } from "../adminAuditService.js";
import { getCustomerAccountOrder } from "../customerAccountOrders.js";
import { processCustomerDelivery } from "../customerDeliveryService.js";
import { getAdminCommercialDocuments, getAuthorizedInvoiceDownload, requestInvoiceResend, retryInvoiceDelivery } from "../invoiceAccessService.js";
import { ensureInvoiceDocument } from "../invoiceDocumentService.js";
import { ensureInvoiceForPaidOrder } from "../invoiceService.js";
import type { MailMessage, MailTransport } from "../mailService.js";
import { getCustomerDelivery, getInvoiceDocumentBundle, listCustomerDeliveriesByInvoice, listCustomerDeliveryAttempts } from "../persistence/invoiceDeliveryRepository.js";
import { closePostgres, query, runMigrations } from "../persistence/postgres.js";
import { savePostgresOrder } from "../persistence/commerceRepository.js";
import { createStaffAuthorizationContext } from "../staffAuthorization.js";
import { LocalObjectStorage, setObjectStorageForTests } from "../storage/objectStorage.js";
import type { BackendOrder } from "../types.js";

const databaseUrl = process.env.DATABASE_URL;
if (process.env.RUN_INVOICE_ACCESS_INTEGRATION !== "1" || !databaseUrl || !/_test(?:\?|$)/.test(new URL(databaseUrl).pathname)) throw new Error("Invoice access integration requires RUN_INVOICE_ACCESS_INTEGRATION=1 and an isolated *_test PostgreSQL database.");

const runId = `${Date.now()}-${process.pid}`;
const base = Date.parse("2026-11-14T10:00:00.000Z");
const at = (minute: number) => new Date(base + minute * 60_000);
const storage = new LocalObjectStorage(await mkdtemp(join(tmpdir(), "tekcentral-j5-storage-")));
setObjectStorageForTests(storage);

const orderFixture = (suffix: string, input: { customerId?: string | null; email?: string } = {}): BackendOrder => ({
  id: `j5-order-${suffix}-${runId}`,
  customerAccountId: input.customerId ?? null,
  orderNumber: `TC-2026-J5-${suffix.toUpperCase()}-${runId}`,
  createdAt: at(0).toISOString(), updatedAt: at(0).toISOString(),
  customer: { firstName: "J5", lastName: suffix, email: input.email ?? `${suffix}@example.test`, mobile: "+27821234567" },
  deliveryAddress: { streetAddress: "1 Test Street", suburb: "Table View", city: "Cape Town", province: "Western Cape", postalCode: "7441", country: "South Africa" },
  deliveryMethod: { id: "standard", name: "Standard delivery", description: "Tracked", estimatedRange: "2–5 business days", price: 149, enabled: true },
  paymentMethod: { id: "payfast", name: "PayFast", description: "Hosted", settlementNote: "Secure", enabled: true },
  payment: { provider: "payfast", status: "PAID", paymentReference: `PF-${suffix}`, payfastPaymentId: `PF-SAFE-${suffix}`, grossAmount: 1149, confirmedAt: at(0).toISOString(), updatedAt: at(0).toISOString(), processedItnIds: [] },
  items: [{ productId: `product-${suffix}`, slug: suffix, sku: `SKU-${suffix}`, name: `Canonical Product ${suffix}`, brand: "Test", quantity: 2, unitPrice: 500, lineTotal: 1000 }],
  subtotal: 1000, deliveryAmount: 149, taxAmount: 149.87, total: 1149, currency: "ZAR", status: "CONFIRMED",
  statusHistory: [{ status: "CONFIRMED", label: "Payment confirmed", createdAt: at(0).toISOString() }], returns: [], refunds: [],
});

class RecordingMail implements MailTransport {
  messages: MailMessage[] = [];
  failures: Error[] = [];
  async send(message: MailMessage) { this.messages.push(message); const failure = this.failures.shift(); if (failure) throw failure; }
}

const staff = createStaffAuthorizationContext({ actorId: `staff-${runId}`, actorLabel: "J5 Finance", profile: { baseRole: "FINANCE", grantedPermissions: [], revokedPermissions: [] } });
const createCustomer = (id: string, email: string) => query("INSERT INTO customers(id,email,normalized_email,display_name,password_hash,status,created_at,updated_at) VALUES($1,$2,$2,'J5 Customer','test-hash','ACTIVE',$3,$3)", [id, email, at(0).toISOString()]);
const prepare = async (order: BackendOrder, withDocument = true) => {
  await savePostgresOrder(order);
  const issued = await ensureInvoiceForPaidOrder(order.id);
  if (withDocument) await ensureInvoiceDocument(issued.invoice.id, { storage });
  const delivery = (await listCustomerDeliveriesByInvoice(issued.invoice.id))[0];
  assert.ok(delivery);
  return { invoice: issued.invoice, delivery };
};

try {
  const migrations = await runMigrations();
  assert.equal(migrations.discovered >= 16, true, "J.5 access must remain compatible with the additive J.6A recovery-scope migration");

  const customerId = `customer-${runId}`;
  await createCustomer(customerId, "registered@example.test");
  const registeredOrder = orderFixture("registered", { customerId, email: "registered@example.test" });
  const registered = await prepare(registeredOrder);
  const ownerView = await getCustomerAccountOrder(customerId, registeredOrder.orderNumber);
  assert.equal(ownerView?.invoice?.invoiceNumber, registered.invoice.invoiceNumber);
  assert.equal(ownerView?.invoice?.documentReady, true);
  assert.equal(await getCustomerAccountOrder(`other-${runId}`, registeredOrder.orderNumber), undefined, "another customer must not receive invoice metadata");
  const download = await getAuthorizedInvoiceDownload(registeredOrder.id);
  assert.equal(download.kind, "STREAM");
  if (download.kind === "STREAM") assert.equal(Buffer.from(download.bytes.subarray(0, 5)).toString("ascii"), "%PDF-");

  const registeredMail = new RecordingMail();
  const concurrent = await Promise.all([
    processCustomerDelivery(registered.delivery, { mail: registeredMail, workerId: "j5-worker-a", now: () => at(1), environment: { PUBLIC_STOREFRONT_ORIGIN: "https://tekcentral.example" } }),
    processCustomerDelivery(registered.delivery, { mail: registeredMail, workerId: "j5-worker-b", now: () => at(1), environment: { PUBLIC_STOREFRONT_ORIGIN: "https://tekcentral.example" } }),
  ]);
  assert.equal(concurrent.filter((item) => item.state === "SENT").length, 1);
  assert.equal(registeredMail.messages.length, 1);
  assert.equal(registeredMail.messages[0].to, registeredOrder.customer.email);
  assert.match(registeredMail.messages[0].text, /account\/orders\//);
  assert.equal(registeredMail.messages[0].attachments?.[0].filename, `${registered.invoice.invoiceNumber}.pdf`);
  assert.equal((await listCustomerDeliveryAttempts(registered.delivery.id)).length, 1);

  const guestOrder = orderFixture("guest");
  const guest = await prepare(guestOrder);
  const guestMail = new RecordingMail();
  assert.equal((await processCustomerDelivery(guest.delivery, { mail: guestMail, workerId: "j5-guest", now: () => at(2), environment: { PUBLIC_STOREFRONT_ORIGIN: "https://tekcentral.example" } })).state, "SENT");
  assert.equal(guestMail.messages.length, 1);
  assert.doesNotMatch(guestMail.messages[0].text, /account\/orders|token=/i);
  assert.equal(guestMail.messages[0].attachments?.length, 1);

  const missingOrder = orderFixture("missing");
  const missing = await prepare(missingOrder, false);
  const missingMail = new RecordingMail();
  const blocked = await processCustomerDelivery(missing.delivery, { mail: missingMail, workerId: "j5-missing", now: () => at(3) });
  assert.equal(blocked.state, "BLOCKED");
  assert.equal(missingMail.messages.length, 0);
  assert.equal((await listCustomerDeliveryAttempts(missing.delivery.id)).length, 0, "document readiness must not count as an SMTP attempt");

  const corruptOrder = orderFixture("corrupt");
  const corrupt = await prepare(corruptOrder);
  const corruptBundle = (await getInvoiceDocumentBundle(corrupt.invoice.id))!;
  await storage.deleteObject(corruptBundle.media.objectKey, "PRIVATE");
  const corruptMail = new RecordingMail();
  assert.equal((await processCustomerDelivery(corrupt.delivery, { mail: corruptMail, workerId: "j5-corrupt", now: () => at(4) })).state, "BLOCKED");
  assert.equal(corruptMail.messages.length, 0);
  await assert.rejects(() => getAuthorizedInvoiceDownload(corruptOrder.id), /Invoice document is not available/);

  const retryOrder = orderFixture("retry");
  const retryFixture = await prepare(retryOrder);
  const retryMail = new RecordingMail(); retryMail.failures.push(new Error("SMTP_TIMEOUT"));
  assert.equal((await processCustomerDelivery(retryFixture.delivery, { mail: retryMail, workerId: "j5-retry-first", now: () => at(5) })).state, "FAILED");
  const retryResult = await retryInvoiceDelivery({ orderId: retryOrder.id, deliveryId: retryFixture.delivery.id, actor: staff, now: at(6) });
  assert.equal(retryResult.delivery.status, "PENDING");
  const retryDelivery = await getCustomerDelivery(retryFixture.delivery.id); assert.ok(retryDelivery);
  assert.equal((await processCustomerDelivery(retryDelivery, { mail: retryMail, workerId: "j5-retry-second", now: () => at(6) })).state, "SENT");
  assert.deepEqual((await listCustomerDeliveryAttempts(retryFixture.delivery.id)).map((item) => item.outcome), ["FAILED", "SENT"]);

  const invalidOrder = orderFixture("invalid", { email: "invalid-recipient" });
  const invalid = await prepare(invalidOrder);
  const invalidMail = new RecordingMail();
  assert.equal((await processCustomerDelivery(invalid.delivery, { mail: invalidMail, workerId: "j5-invalid", now: () => at(7) })).state, "FAILED");
  assert.equal(invalidMail.messages.length, 0);
  await assert.rejects(() => retryInvoiceDelivery({ orderId: invalidOrder.id, deliveryId: invalid.delivery.id, actor: staff, now: at(8) }), /cannot be retried automatically/);

  const requestId = `request-${runId}`;
  const [resendA, resendB] = await Promise.all([
    requestInvoiceResend({ orderId: registeredOrder.id, requestId, actor: staff, now: at(9) }),
    requestInvoiceResend({ orderId: registeredOrder.id, requestId, actor: staff, now: at(9) }),
  ]);
  assert.equal([resendA, resendB].filter((item) => item.created).length, 1, "double submit must create one logical resend");
  assert.equal(resendA.delivery.deliveryId, resendB.delivery.deliveryId);
  assert.equal(resendA.delivery.recipient, registeredOrder.customer.email);
  const resendDelivery = (await listCustomerDeliveriesByInvoice(registered.invoice.id)).find((item) => item.id === resendA.delivery.deliveryId)!;
  const resendMail = new RecordingMail();
  assert.equal((await processCustomerDelivery(resendDelivery, { mail: resendMail, workerId: "j5-resend", now: () => at(10) })).state, "SENT");
  assert.equal(resendMail.messages.length, 1);
  assert.equal((await query<{ count: string }>("SELECT count(*)::text count FROM commerce_invoices WHERE order_id=$1", [registeredOrder.id])).rows[0].count, "1");
  assert.equal((await query<{ count: string }>("SELECT count(*)::text count FROM commerce_invoice_documents WHERE invoice_id=$1", [registered.invoice.id])).rows[0].count, "1");

  const guestSnapshotHash = guest.invoice.snapshotHash;
  const claimedCustomerId = `claimed-customer-${runId}`;
  await createCustomer(claimedCustomerId, guestOrder.customer.email);
  await savePostgresOrder({ ...guestOrder, customerAccountId: claimedCustomerId, updatedAt: at(11).toISOString() });
  const claimedView = await getCustomerAccountOrder(claimedCustomerId, guestOrder.orderNumber);
  assert.equal(claimedView?.invoice?.invoiceNumber, guest.invoice.invoiceNumber);
  assert.equal((await query<{ snapshot_hash: string }>("SELECT snapshot_hash FROM commerce_invoices WHERE id=$1", [guest.invoice.id])).rows[0].snapshot_hash, guestSnapshotHash);

  const admin = await getAdminCommercialDocuments(registeredOrder.id);
  assert.equal(admin.invoice?.documentStatus, "READY");
  assert.equal(admin.invoice?.deliveries.length, 2);
  assert.equal(admin.invoice?.deliveries.every((item) => !item.history.some((entry) => "providerReference" in entry)), true);
  const resendAudits = await listAdminAudit({ actionType: "INVOICE_RESEND_REQUESTED", page: 1, pageSize: 100 });
  assert.equal(resendAudits.records.filter((item) => item.entityId === registered.invoice.id).length, 1);
  assert.equal(resendAudits.records.find((item) => item.entityId === registered.invoice.id)?.actorType, "STAFF_USER");
  assert.equal(resendAudits.records.find((item) => item.entityId === registered.invoice.id)?.actorId, staff.actorId);
  const automatedAudits = await listAdminAudit({ actionType: "INVOICE_DELIVERY_SENT", page: 1, pageSize: 100 });
  assert.equal(automatedAudits.records.some((item) => item.entityId === registered.invoice.id && item.actorType === "SYSTEM"), true);

  assert.equal((await query<{ count: string }>("SELECT count(*)::text count FROM commerce_customer_deliveries WHERE delivery_type='INVOICE_DELIVERY' AND recipient<>lower(recipient)")).rows[0].count, "0");
  assert.equal((await query<{ name: string | null }>("SELECT to_regclass('public.commerce_payment_receipts')::text name")).rows[0].name, null);
  console.log(JSON.stringify({ customerOwnerAccess: true, customerIdorDenied: true, registeredMessages: registeredMail.messages.length, guestMessages: guestMail.messages.length, missingDocumentSends: missingMail.messages.length, corruptDocumentSends: corruptMail.messages.length, concurrentSendWinner: true, retryAttempts: 2, manualResendRows: 1, realSmtpMessages: 0, migrationCount: migrations.discovered }));
} finally {
  setObjectStorageForTests(undefined);
  await closePostgres();
}

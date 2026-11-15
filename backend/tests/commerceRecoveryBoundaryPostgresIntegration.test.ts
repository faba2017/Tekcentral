import assert from "node:assert/strict";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ensureOrderConfirmationDelivery } from "../customerDeliveryService.js";
import { ensureInvoiceForPaidOrder } from "../invoiceService.js";
import { confirmVerifiedPayfastPayment, updatePaymentStatus } from "../orderRepository.js";
import {
  findOrdersMissingRequiredConfirmation,
  findPaidOrdersMissingRequiredInvoice,
  getCommerceRecoveryScope,
  savePostgresOrder,
  saveProspectivePostgresOrder,
} from "../persistence/commerceRepository.js";
import { closePostgres, query, runMigrations } from "../persistence/postgres.js";
import type { BackendOrder, PaymentStatus } from "../types.js";

const databaseUrl = process.env.DATABASE_URL;
if (process.env.RUN_COMMERCE_RECOVERY_BOUNDARY_INTEGRATION !== "1" || !databaseUrl || !/_test(?:\?|$)/.test(new URL(databaseUrl).pathname)) {
  throw new Error("Commerce recovery-boundary integration requires RUN_COMMERCE_RECOVERY_BOUNDARY_INTEGRATION=1 and an isolated *_test PostgreSQL database.");
}

const runId = `${Date.now()}-${process.pid}`;
const timestamp = "2026-11-14T10:00:00.000Z";
const fixture = (suffix: string, paymentStatus: PaymentStatus = "PENDING"): BackendOrder => ({
  id: `recovery-order-${suffix}-${runId}`,
  customerAccountId: null,
  orderNumber: `TC-2026-RECOVERY-${suffix.toUpperCase()}-${runId}`,
  createdAt: timestamp,
  updatedAt: timestamp,
  customer: { firstName: "Recovery", lastName: "Fixture", email: `${suffix}@example.test`, mobile: "+27821234567" },
  deliveryAddress: { streetAddress: "1 Test Street", suburb: "Table View", city: "Cape Town", province: "Western Cape", postalCode: "7441", country: "South Africa" },
  deliveryMethod: { id: "standard", name: "Standard", description: "Tracked", estimatedRange: "2–5 business days", price: 149, enabled: true },
  paymentMethod: { id: "payfast", name: "PayFast", description: "Hosted", settlementNote: "Secure", enabled: true },
  payment: { provider: "payfast", status: paymentStatus, paymentReference: `PF-${suffix}`, grossAmount: 1149, confirmedAt: paymentStatus === "PAID" ? timestamp : undefined, updatedAt: timestamp, processedItnIds: [] },
  items: [{ productId: `product-${suffix}`, slug: suffix, sku: `SKU-${suffix}`, name: `Recovery Product ${suffix}`, brand: "Test", quantity: 2, unitPrice: 500, lineTotal: 1000 }],
  subtotal: 1000,
  deliveryAmount: 149,
  taxAmount: 149.87,
  total: 1149,
  currency: "ZAR",
  status: paymentStatus === "PAID" ? "CONFIRMED" : "PENDING",
  statusHistory: [],
  returns: [],
  refunds: [],
});

const migrations = resolve(process.cwd(), "backend", "persistence", "migrations");
const preBoundaryMigrations = await mkdtemp(join(tmpdir(), "tekcentral-pre-j6a-"));

try {
  for (const file of (await readdir(migrations)).filter((name) => /^\d+.*\.sql$/.test(name) && name < "0016_")) await cp(join(migrations, file), join(preBoundaryMigrations, file));
  await runMigrations(preBoundaryMigrations);

  const historicalPending = fixture("historical-pending");
  const historicalPaid = fixture("historical-paid", "PAID");
  await savePostgresOrder(historicalPending);
  await savePostgresOrder(historicalPaid);

  const migration = await runMigrations();
  assert.deepEqual(migration.executed, ["0016_commerce_recovery_scope.sql"]);
  assert.deepEqual(await getCommerceRecoveryScope(historicalPending.id), {});
  assert.deepEqual(await getCommerceRecoveryScope(historicalPaid.id), {});
  await confirmVerifiedPayfastPayment(historicalPaid.orderNumber, { processedItnIds: ["late-historical-itn"] });
  assert.deepEqual(await getCommerceRecoveryScope(historicalPaid.id), {}, "an already-paid historical Order must not enter prospective invoice scope");

  const prospectivePending = fixture("prospective-pending");
  await saveProspectivePostgresOrder(prospectivePending);
  const pendingScope = await getCommerceRecoveryScope(prospectivePending.id);
  assert.ok(pendingScope?.orderConfirmationRequiredAt);
  assert.equal(pendingScope?.invoiceRequiredAt, undefined);
  assert.deepEqual((await findOrdersMissingRequiredConfirmation()).map((item) => item.order.id), [prospectivePending.id]);

  const confirmationComplete = fixture("confirmation-complete");
  await saveProspectivePostgresOrder(confirmationComplete);
  await ensureOrderConfirmationDelivery(confirmationComplete, new Date(timestamp));
  assert.equal((await findOrdersMissingRequiredConfirmation()).some((item) => item.order.id === confirmationComplete.id), false);

  const failed = fixture("failed");
  await saveProspectivePostgresOrder(failed);
  await updatePaymentStatus(failed.orderNumber, "FAILED");
  assert.equal((await getCommerceRecoveryScope(failed.id))?.invoiceRequiredAt, undefined);
  const cancelled = fixture("cancelled");
  await saveProspectivePostgresOrder(cancelled);
  await updatePaymentStatus(cancelled.orderNumber, "CANCELLED");
  assert.equal((await getCommerceRecoveryScope(cancelled.id))?.invoiceRequiredAt, undefined);

  const prospectivePaid = fixture("prospective-paid");
  await saveProspectivePostgresOrder(prospectivePaid);
  const paid = await confirmVerifiedPayfastPayment(prospectivePaid.orderNumber, { confirmedAt: timestamp, processedItnIds: ["verified-itn"] });
  assert.equal(paid?.payment.status, "PAID");
  const firstPaidScope = await getCommerceRecoveryScope(prospectivePaid.id);
  assert.ok(firstPaidScope?.invoiceRequiredAt);
  assert.deepEqual((await findPaidOrdersMissingRequiredInvoice()).map((item) => item.order.id), [prospectivePaid.id]);

  await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
  await confirmVerifiedPayfastPayment(prospectivePaid.orderNumber, { confirmedAt: timestamp, processedItnIds: ["verified-itn"] });
  assert.equal((await getCommerceRecoveryScope(prospectivePaid.id))?.invoiceRequiredAt, firstPaidScope?.invoiceRequiredAt, "invoice scope marker must be write-once");
  await savePostgresOrder({ ...paid!, updatedAt: new Date().toISOString() });
  assert.equal((await getCommerceRecoveryScope(prospectivePaid.id))?.invoiceRequiredAt, firstPaidScope?.invoiceRequiredAt, "generic Order persistence must not rewrite marker columns");

  await updatePaymentStatus(prospectivePaid.orderNumber, "REFUND_PENDING");
  assert.equal((await getCommerceRecoveryScope(prospectivePaid.id))?.invoiceRequiredAt, firstPaidScope?.invoiceRequiredAt, "later payment state must preserve workflow scope");
  await updatePaymentStatus(prospectivePaid.orderNumber, "PAID");

  const invoiced = fixture("invoiced");
  await saveProspectivePostgresOrder(invoiced);
  await confirmVerifiedPayfastPayment(invoiced.orderNumber, { confirmedAt: timestamp });
  await ensureInvoiceForPaidOrder(invoiced.id);
  assert.equal((await findPaidOrdersMissingRequiredInvoice()).some((item) => item.order.id === invoiced.id), false);

  const invoiceCandidates = await findPaidOrdersMissingRequiredInvoice({ limit: 1 });
  assert.equal(invoiceCandidates.length, 1);
  assert.equal(invoiceCandidates[0].order.id, prospectivePaid.id);
  assert.equal(invoiceCandidates.some((item) => item.order.id === historicalPaid.id), false);

  const counts = (await query<{ orders: string; invoices: string; documents: string; attempts: string }>("SELECT (SELECT count(*)::text FROM commerce_orders) orders,(SELECT count(*)::text FROM commerce_invoices) invoices,(SELECT count(*)::text FROM commerce_invoice_documents) documents,(SELECT count(*)::text FROM commerce_customer_delivery_attempts) attempts")).rows[0];
  console.log(JSON.stringify({ historicalMarkersNull: true, prospectiveConfirmationCandidate: true, prospectiveInvoiceCandidate: true, markerWriteOnce: true, noSmtp: true, counts }));
} finally {
  await closePostgres();
  await rm(preBoundaryMigrations, { recursive: true, force: true });
}

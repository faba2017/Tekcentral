import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildInvoiceSnapshot, canonicalInvoiceSeller, InvoiceEligibilityError, validateInvoiceEligibility } from "../invoiceService.js";
import { invoiceSnapshotHash } from "../persistence/invoiceDeliveryRepository.js";
import type { BackendOrder, PaymentStatus } from "../types.js";

const order = (status: PaymentStatus = "PAID"): BackendOrder => ({
  id: "invoice-unit-order", customerAccountId: null, orderNumber: "TC-2026-INVOICE-UNIT", createdAt: "2026-11-14T10:00:00.000Z", updatedAt: "2026-11-14T10:05:00.000Z",
  customer: { firstName: "Invoice", lastName: "Customer", email: "invoice@example.test", mobile: "+27821234567", companyName: "Example Company", vatNumber: "CUSTOMER-VAT-EVIDENCE", consigneeId: "SHOULD-NOT-APPEAR" },
  deliveryAddress: { streetAddress: "1 Test Street", suburb: "Table View", city: "Cape Town", province: "Western Cape", postalCode: "7441", country: "South Africa" },
  deliveryMethod: { id: "standard", name: "Standard", description: "Tracked", estimatedRange: "2–5 business days", price: 149, enabled: true },
  paymentMethod: { id: "payfast", name: "PayFast", description: "Hosted", settlementNote: "Secure", enabled: true },
  payment: { provider: "payfast", status, paymentReference: "TC-2026-INVOICE-UNIT-PF", payfastPaymentId: "PF-SAFE-REFERENCE", grossAmount: 1149, confirmedAt: status === "PAID" ? "2026-11-14T10:05:00.000Z" : undefined, updatedAt: "2026-11-14T10:05:00.000Z", processedItnIds: [] },
  items: [{ productId: "product-unit", slug: "unit", sku: "TC-UNIT", name: "Canonical Product", brand: "Brand", quantity: 2, unitPrice: 500, lineTotal: 1000, costBasis: { status: "COMPLETE", evaluatedAt: "2026-11-14T10:00:00.000Z", productId: "product-unit", productSku: "TC-UNIT", quantity: 2, supplierId: "SCOOP", sourceUnitCost: 100, customerUnitPriceInclVat: 500, customerLineTotalInclVat: 1000, vatRatePercent: 15, vatAmount: 130.43, revenueExVat: 869.57, grossProfit: 669.57, grossMarginPercent: 77 } }],
  subtotal: 1000, deliveryAmount: 149, taxAmount: 149.87, total: 1149, currency: "ZAR", status: status === "PAID" ? "CONFIRMED" : "PENDING", statusHistory: [], returns: [], refunds: [], supplierAllocations: [{ id: "private-allocation", orderId: "invoice-unit-order", orderItemIds: ["product-unit"], supplierCode: "SCOOP", supplierName: "Private Supplier", status: "ASSIGNED", createdAt: "2026-11-14T10:00:00.000Z", updatedAt: "2026-11-14T10:00:00.000Z" }],
});

assert.doesNotThrow(() => validateInvoiceEligibility(order()));
for (const status of ["PENDING", "CANCELLED", "FAILED", "REFUND_PENDING", "REFUNDED"] as PaymentStatus[]) assert.throws(() => validateInvoiceEligibility(order(status)), (error: unknown) => error instanceof InvoiceEligibilityError && error.code === "PAYMENT_NOT_PAID");
assert.throws(() => validateInvoiceEligibility({ ...order(), total: 1 }), (error: unknown) => error instanceof InvoiceEligibilityError && error.code === "COMMERCIAL_TOTALS_INVALID");

const snapshot = buildInvoiceSnapshot({ order: order(), invoiceNumber: "INV-2026-000001", issuedAt: "2026-11-14T10:05:00.000Z" });
assert.equal(snapshot.schemaVersion, 1); assert.equal(snapshot.billingAddress.source, "DELIVERY_ADDRESS_ONLY"); assert.deepEqual(snapshot.deliveryAddress?.lines, snapshot.billingAddress.lines);
assert.equal(snapshot.payment.reference, "PF-SAFE-REFERENCE"); assert.equal(snapshot.taxEvidence?.ratePercent, 15); assert.equal(snapshot.taxEvidence?.treatment, "INCLUDED");
const serialized = JSON.stringify(snapshot);
for (const forbidden of ["SCOOP", "sourceUnitCost", "grossMarginPercent", "supplierAllocations", "consigneeId", "SHOULD-NOT-APPEAR"]) assert.equal(serialized.includes(forbidden), false);
assert.equal("vatNumber" in canonicalInvoiceSeller(), false, "merchant VAT registration must not be invented");
const reordered = { ...snapshot, seller: { ...snapshot.seller } };
assert.equal(invoiceSnapshotHash(reordered), invoiceSnapshotHash(snapshot));
assert.notEqual(invoiceSnapshotHash({ ...snapshot, total: snapshot.total + 1 }), invoiceSnapshotHash(snapshot));
const serverSource = readFileSync("backend/server.ts", "utf8");
const paymentCommitIndex = serverSource.indexOf("const paidOrder = await confirmVerifiedPayfastPayment(order.orderNumber");
const issuanceHookIndex = serverSource.indexOf("ensureInvoiceForPaidOrderOperationally(paidOrder.id, paidOrder.orderNumber)", paymentCommitIndex);
assert.ok(paymentCommitIndex >= 0 && issuanceHookIndex > paymentCommitIndex, "verified PayFast payment persistence must precede invoice issuance");
assert.equal(serverSource.includes("/api/invoices"), false, "J.3 must not expose a public invoice issuance endpoint");
console.log("Invoice eligibility, snapshot, privacy and hash tests passed.");

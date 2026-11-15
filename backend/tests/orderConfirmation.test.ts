import assert from "node:assert/strict";
import { classifyCustomerDeliveryFailure, customerDeliveryRetryAt, CUSTOMER_DELIVERY_MAX_ATTEMPTS } from "../customerDeliveryService.js";
import { orderConfirmationPaymentCopy, renderOrderConfirmation } from "../orderConfirmationMail.js";
import type { BackendOrder } from "../types.js";

const order = (overrides: Partial<BackendOrder> = {}): BackendOrder => ({
  id: "order-confirmation-unit",
  customerAccountId: "customer-unit",
  orderNumber: "TC-2026-UNIT01",
  createdAt: "2026-11-14T10:00:00.000Z",
  updatedAt: "2026-11-14T10:00:00.000Z",
  customer: { firstName: "<script>alert(1)</script>", lastName: "Customer", email: "customer@example.test", mobile: "+27821234567", companyName: "A&B <Company>" },
  deliveryAddress: { streetAddress: "1 <Unsafe> Street", suburb: "Table View", city: "Cape Town", province: "Western Cape", postalCode: "7441", country: "South Africa" },
  deliveryMethod: { id: "standard", name: "Standard <Delivery>", description: "Tracked", estimatedRange: "2–5 business days", price: 149, enabled: true },
  paymentMethod: { id: "payfast", name: "PayFast", description: "Hosted", settlementNote: "Secure", enabled: true },
  payment: { provider: "payfast", status: "PENDING", paymentReference: "TC-UNIT-PF", updatedAt: "2026-11-14T10:00:00.000Z", processedItnIds: [] },
  items: [{ productId: "product-unit", slug: "unit", sku: "SKU-<1>", name: "Router <Pro>", brand: "Brand", quantity: 2, unitPrice: 500, lineTotal: 1000 }],
  subtotal: 1000,
  deliveryAmount: 149,
  taxAmount: 149.87,
  total: 1149,
  currency: "ZAR",
  status: "PENDING",
  statusHistory: [{ status: "PENDING", label: "Order placed", createdAt: "2026-11-14T10:00:00.000Z" }],
  returns: [], refunds: [],
  ...overrides,
});

const pending = renderOrderConfirmation(order(), { PUBLIC_APP_URL: "https://tekcentral.example" });
assert.equal(pending.subject, "Order received — TC-2026-UNIT01");
assert.doesNotMatch(pending.subject, /paid|payment received/i);
assert.equal(pending.to, "customer@example.test");
assert.match(pending.text, /This is an order confirmation, not an invoice or payment receipt/);
assert.match(pending.text, /Total: R[\s\u00a0]*1[\s\u00a0]*149,00/);
assert.match(pending.text, /account\/orders\/TC-2026-UNIT01/);
assert.match(pending.html!, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.match(pending.html!, /Router &lt;Pro&gt;/);
assert.match(pending.html!, /1 &lt;Unsafe&gt; Street/);
assert.doesNotMatch(pending.html!, /<script>alert\(1\)<\/script>/);
assert.doesNotMatch(pending.text, /supplier|margin|cost basis/i);

const guest = renderOrderConfirmation(order({ customerAccountId: null }), { PUBLIC_APP_URL: "https://tekcentral.example" });
assert.doesNotMatch(guest.text, /account\/orders/);
assert.match(guest.text, /secure guest-order access/);
assert.doesNotMatch(guest.text, /token=/i);

const paid = renderOrderConfirmation(order({ payment: { ...order().payment, status: "PAID", confirmedAt: "2026-11-14T10:05:00.000Z" }, status: "CONFIRMED" }));
assert.match(paid.text, /Payment has been confirmed/);
assert.match(orderConfirmationPaymentCopy("FAILED"), /not confirmed/);
assert.match(orderConfirmationPaymentCopy("CANCELLED"), /cancelled/);

assert.deepEqual(classifyCustomerDeliveryFailure(new Error("SMTP_550")), { code: "SMTP_550", retryable: false });
assert.deepEqual(classifyCustomerDeliveryFailure(new Error("SMTP_451")), { code: "SMTP_451", retryable: true });
assert.deepEqual(classifyCustomerDeliveryFailure(new Error("SMTP_TIMEOUT")), { code: "SMTP_CONNECTION_FAILED", retryable: true });
assert.deepEqual(classifyCustomerDeliveryFailure(new Error("INVALID_RECIPIENT")), { code: "INVALID_RECIPIENT", retryable: false });
assert.equal(customerDeliveryRetryAt(1, new Date("2026-11-14T10:00:00Z")), "2026-11-14T10:01:00.000Z");
assert.equal(customerDeliveryRetryAt(CUSTOMER_DELIVERY_MAX_ATTEMPTS, new Date()), undefined);

console.log("Order confirmation renderer and SMTP classification tests passed.");

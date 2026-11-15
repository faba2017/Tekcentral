import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getCustomerAccountOrder, listCustomerAccountOrders } from "../customerAccountOrders.js";
import { CustomerOrderClaimError, customerOrderClaimPolicy, requestGuestOrderClaim, setOrderClaimStorePathForTests, verifyGuestOrderClaim } from "../customerOrderClaim.js";
import type { MailMessage } from "../mailService.js";
import { getOrder, saveOrder, setOrderStorePathForTests, updateOrder } from "../orderRepository.js";
import type { BackendOrder } from "../types.js";
import { issueGuestOrderAccess, setGuestOrderAccessStorePathForTests, verifyGuestOrderAccess } from "../guestOrderAccess.js";

const orderPath = resolve("/tmp", `tekcentral-account-orders-${process.pid}.json`);
const claimPath = resolve("/tmp", `tekcentral-account-order-claims-${process.pid}.json`);
const guestAccessPath = resolve("/tmp", `tekcentral-guest-order-access-${process.pid}.json`);
setOrderStorePathForTests(orderPath);
setOrderClaimStorePathForTests(claimPath);
setGuestOrderAccessStorePathForTests(guestAccessPath);
const base = (orderNumber: string, customerAccountId: string | undefined, createdAt: string): BackendOrder => ({
  id: `id-${orderNumber}`, orderNumber, customerAccountId, createdAt, updatedAt: createdAt, status: "CONFIRMED", customer: { firstName: "Test", lastName: "Customer", email: "shared@example.com", mobile: "0821234567" }, deliveryAddress: { streetAddress: "1 Main Road", suburb: "Central", city: "Cape Town", province: "Western Cape", postalCode: "8001", country: "South Africa" }, deliveryMethod: { id: "standard", name: "Standard", description: "Delivery", estimatedRange: "2-5 business days", price: 100, enabled: true }, paymentMethod: { id: "payfast", name: "PayFast", description: "Hosted", enabled: true }, items: [{ productId: "product-1", slug: "product-1", sku: "SKU-1", name: "Router", brand: "Tek", quantity: 1, unitPrice: 500, lineTotal: 500, costBasis: { status: "COMPLETE", evaluatedAt: createdAt, productId: "product-1", quantity: 1, supplierId: "SCOOP", customerUnitPriceInclVat: 500, customerLineTotalInclVat: 500, vatRatePercent: 15, vatAmount: 65.22, revenueExVat: 434.78 } }], subtotal: 500, deliveryFee: 100, deliveryAmount: 100, total: 600, vatAmount: 78.26, taxAmount: 78.26, currency: "ZAR", payment: { provider: "payfast", status: "PAID", paymentReference: `PAY-${orderNumber}`, updatedAt: createdAt, processedItnIds: [] }, returns: [], refunds: [], internalNotes: [], supplierAllocations: [], statusHistory: [], operationalHold: { active: false }, parcels: [], shipments: [],
} as unknown as BackendOrder);

for (let index = 0; index < 12; index += 1) await saveOrder(base(`TC-A-${index}`, "account-a", new Date(Date.UTC(2026, 9, index + 1)).toISOString()));
await updateOrder("TC-A-0", (order) => ({ ...order, shipment: { courierName: "Customer Courier", trackingNumber: "TRACK-100", trackingUrl: "https://tracking.example.test/TRACK-100", dispatchDate: "2026-10-02T08:00:00.000Z", notes: "Internal shipment note", updatedAt: "2026-10-02T08:00:00.000Z" }, returns: [{ id: "return-1", orderId: order.id, items: [{ productId: "product-1", name: "Router", quantity: 1, unitPrice: 500, lineTotal: 500 }], reason: "Faulty", createdAt: "2026-10-03T08:00:00.000Z", status: "UNDER_REVIEW" }], refunds: [{ id: "refund-1", orderId: order.id, returnRequestId: "return-1", amount: 500, status: "PENDING", createdAt: "2026-10-04T08:00:00.000Z", updatedAt: "2026-10-04T08:00:00.000Z" }] }));
await saveOrder(base("TC-B-1", "account-b", "2026-10-20T00:00:00.000Z"));
await saveOrder(base("TC-GUEST-1", undefined, "2026-10-21T00:00:00.000Z"));
const guestAccessToken = await issueGuestOrderAccess("TC-GUEST-1", new Date("2026-10-21T00:01:00.000Z"));
assert.match(guestAccessToken, /^[A-Za-z0-9_-]{43}$/);
assert.equal(await verifyGuestOrderAccess("TC-GUEST-1", guestAccessToken), true);
assert.equal(await verifyGuestOrderAccess("TC-GUEST-1", undefined), false);
assert.equal(await verifyGuestOrderAccess("TC-GUEST-1", "wrong-token"), false);
assert.equal(await verifyGuestOrderAccess("TC-GUEST-OTHER", guestAccessToken), false);
assert.equal(await verifyGuestOrderAccess("TC-LEGACY-NO-CREDENTIAL", guestAccessToken), false);
const secondGuestToken = await issueGuestOrderAccess("TC-GUEST-OTHER");
assert.notEqual(secondGuestToken, guestAccessToken);
const persistedGuestAccess = await readFile(guestAccessPath, "utf8");
assert.equal(persistedGuestAccess.includes(guestAccessToken), false, "raw guest token must not be persisted");
assert.equal(persistedGuestAccess.includes(secondGuestToken), false, "raw guest token must not be persisted");
const firstPage = await listCustomerAccountOrders("account-a", 1, 10);
assert.equal(firstPage.total, 12);
assert.equal(firstPage.orders.length, 10);
assert.equal(firstPage.orders[0]?.orderNumber, "TC-A-11");
assert.equal(firstPage.totalPages, 2);
const secondPage = await listCustomerAccountOrders("account-a", 2, 10);
assert.equal(secondPage.orders.length, 2);
assert.equal((await listCustomerAccountOrders("account-b")).total, 1);
assert.equal((await listCustomerAccountOrders("shared@example.com")).total, 0, "email must never act as order ownership");
assert.equal(await getCustomerAccountOrder("account-a", "TC-B-1"), undefined);
const detail = await getCustomerAccountOrder("account-a", "TC-A-0");
assert.ok(detail);
assert.equal("id" in detail, false);
assert.equal("customerAccountId" in detail, false);
assert.equal("costBasis" in detail.items[0]!, false);
assert.equal("supplierAllocations" in detail, false);
assert.equal("shipment" in detail, false);
assert.equal("shipments" in detail, false);
assert.deepEqual(detail.tracking, { carrier: "Customer Courier", trackingNumber: "TRACK-100", trackingUrl: "https://tracking.example.test/TRACK-100", shippedAt: "2026-10-02T08:00:00.000Z" });
assert.equal(JSON.stringify(detail).includes("Internal shipment note"), false);
assert.equal("paymentReference" in detail.payment, false);
assert.equal("gatewayReference" in detail.payment, false);
assert.equal("processedItnIds" in detail.payment, false);
assert.equal("orderId" in detail.returns[0]!, false);
assert.equal("orderId" in detail.refunds[0]!, false);
assert.equal(detail.returnStatus, "UNDER_REVIEW");
assert.equal(detail.refundStatus, "PENDING");

const messages: MailMessage[] = [];
const mail = { async send(message: MailMessage) { messages.push(message); } };
const claimTime = new Date("2026-10-22T08:00:00.000Z");
const guestBefore = await getOrder("TC-GUEST-1");
await requestGuestOrderClaim({ accountId: "account-a", orderNumber: "tc-guest-1", mail }, claimTime);
assert.equal(messages.length, 1);
const claimToken = messages[0]!.text.match(/\n\n([A-F0-9]{16})\n\n/)?.[1];
assert.ok(claimToken);
const persistedClaims = await readFile(claimPath, "utf8");
assert.equal(persistedClaims.includes(claimToken), false, "plaintext claim token must not be persisted");
await assert.rejects(() => verifyGuestOrderClaim({ accountId: "account-b", orderNumber: "TC-GUEST-1", token: claimToken }), (error: unknown) => error instanceof CustomerOrderClaimError && error.code === "CLAIM_INVALID");
await assert.rejects(() => verifyGuestOrderClaim({ accountId: "account-a", orderNumber: "TC-GUEST-1", token: "0000000000000000" }), (error: unknown) => error instanceof CustomerOrderClaimError && error.code === "CLAIM_INVALID");
const claimed = await verifyGuestOrderClaim({ accountId: "account-a", orderNumber: "TC-GUEST-1", token: claimToken }, new Date("2026-10-22T08:05:00.000Z"));
assert.equal(claimed.customerAccountId, "account-a");
assert.equal(await verifyGuestOrderAccess("TC-GUEST-1", guestAccessToken), false, "claim must revoke guest access");
assert.deepEqual(claimed.items, guestBefore?.items);
assert.deepEqual(claimed.deliveryAddress, guestBefore?.deliveryAddress);
assert.deepEqual(claimed.payment, guestBefore?.payment);
assert.equal((await listCustomerAccountOrders("account-a", 1, 20)).orders.some((order) => order.orderNumber === "TC-GUEST-1"), true);
await assert.rejects(() => verifyGuestOrderClaim({ accountId: "account-a", orderNumber: "TC-GUEST-1", token: claimToken }), (error: unknown) => error instanceof CustomerOrderClaimError && error.code === "CLAIM_INVALID");

await saveOrder(base("TC-GUEST-EXPIRED", undefined, "2026-10-22T00:00:00.000Z"));
await requestGuestOrderClaim({ accountId: "account-a", orderNumber: "TC-GUEST-EXPIRED", mail }, claimTime);
const expiredToken = messages.at(-1)!.text.match(/\n\n([A-F0-9]{16})\n\n/)?.[1] ?? "";
await assert.rejects(() => verifyGuestOrderClaim({ accountId: "account-a", orderNumber: "TC-GUEST-EXPIRED", token: expiredToken }, new Date(claimTime.getTime() + customerOrderClaimPolicy.ttlMs + 1)), (error: unknown) => error instanceof CustomerOrderClaimError && error.code === "CLAIM_INVALID");

const sendsBeforeSafeResponses = messages.length;
await requestGuestOrderClaim({ accountId: "account-a", orderNumber: "TC-UNKNOWN", mail }, claimTime);
await requestGuestOrderClaim({ accountId: "account-a", orderNumber: "TC-B-1", mail }, claimTime);
assert.equal(messages.length, sendsBeforeSafeResponses, "unknown and owned orders use a safe response without email delivery");

await saveOrder(base("TC-GUEST-RACE", undefined, "2026-10-22T00:00:00.000Z"));
await requestGuestOrderClaim({ accountId: "account-a", orderNumber: "TC-GUEST-RACE", mail }, claimTime);
const tokenA = messages.at(-1)!.text.match(/\n\n([A-F0-9]{16})\n\n/)?.[1] ?? "";
await requestGuestOrderClaim({ accountId: "account-b", orderNumber: "TC-GUEST-RACE", mail }, claimTime);
const tokenB = messages.at(-1)!.text.match(/\n\n([A-F0-9]{16})\n\n/)?.[1] ?? "";
const race = await Promise.allSettled([
  verifyGuestOrderClaim({ accountId: "account-a", orderNumber: "TC-GUEST-RACE", token: tokenA }, claimTime),
  verifyGuestOrderClaim({ accountId: "account-b", orderNumber: "TC-GUEST-RACE", token: tokenB }, claimTime),
]);
assert.equal(race.filter((entry) => entry.status === "fulfilled").length, 1, "only one account can atomically claim an order");
assert.equal(race.filter((entry) => entry.status === "rejected").length, 1);

console.log("Customer account order tests passed.");

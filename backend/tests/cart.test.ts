import assert from "node:assert/strict";
import { resolve } from "node:path";
import { cancelCartAction, cartOwner, confirmCartAction, createCartAction, expireCartActionForTests, getCart, getCartTelemetry, mergeGuestCartIntoCustomer, replaceCart, setCartProductSourceForTests, setCartStorePathForTests, CartError } from "../cartService.js";
const path = resolve("/tmp", `tekcentral-cart-${process.pid}.json`); setCartStorePathForTests(path);
let price = 840; let purchasable = true;
setCartProductSourceForTests(async () => [{ id: "product-router", slug: "router", name: "Public Router", brand: "Tek", category: "Networking", categorySlug: "networking", price, currency: "ZAR", isDemoPrice: false, shortDescription: "Router", images: [], stockStatus: "in-stock", specifications: [], availability: { state: purchasable ? "IN_STOCK" : "OUT_OF_STOCK", label: purchasable ? "In stock" : "Out of stock", freshness: "FRESH", purchasable }, catalogueSource: "PUBLISHED" }] as never);
const ownerA = cartOwner(undefined, "guest-a"); const ownerB = cartOwner(undefined, "guest-b"); assert.notEqual(ownerA, ownerB);
const pending = await createCartAction(ownerA, "ADD", "product-router", 1); assert.equal((await getCart(ownerA)).itemCount, 0);
await assert.rejects(() => confirmCartAction(ownerB, pending.pendingActionId), (error: unknown) => error instanceof CartError && error.code === "CART_ACTION_NOT_FOUND");
const added = await confirmCartAction(ownerA, pending.pendingActionId); assert.equal(added.cart?.subtotal, 840); assert.equal(added.cart?.itemCount, 1);
const replay = await confirmCartAction(ownerA, pending.pendingActionId); assert.equal(replay.replayed, true); assert.equal((await getCart(ownerA)).itemCount, 1);
// A transport/provider failure after the successful write is recoverable: replay returns the stored result without another write.
await assert.rejects(async () => { await confirmCartAction(ownerA, pending.pendingActionId); throw new Error("simulated response failure"); });
assert.equal((await getCart(ownerA)).itemCount, 1);
const update = await createCartAction(ownerA, "UPDATE", "product-router", 2); await confirmCartAction(ownerA, update.pendingActionId); assert.equal((await getCart(ownerA)).itemCount, 2);
const cancelled = await createCartAction(ownerA, "REMOVE", "product-router", 1); await cancelCartAction(ownerA, cancelled.pendingActionId); await assert.rejects(() => confirmCartAction(ownerA, cancelled.pendingActionId), (error: unknown) => error instanceof CartError && error.code === "CART_ACTION_CANCELLED");
const changed = await createCartAction(ownerA, "UPDATE", "product-router", 3); price = 899; const priceResult = await confirmCartAction(ownerA, changed.pendingActionId); assert.equal(priceResult.state, "CART_PRICE_CHANGED"); assert.equal((await getCart(ownerA)).itemCount, 2);
const availabilityPending = await createCartAction(ownerA, "ADD", "product-router", 1); purchasable = false;
await assert.rejects(() => confirmCartAction(ownerA, availabilityPending.pendingActionId), (error: unknown) => error instanceof CartError && error.code === "CART_AVAILABILITY_CHANGED");
await assert.rejects(() => createCartAction(ownerA, "ADD", "product-router", 1), (error: unknown) => error instanceof CartError && error.code === "PRODUCT_NOT_PURCHASABLE");
purchasable = true;
const expired = await createCartAction(ownerA, "ADD", "product-router", 1); await expireCartActionForTests(expired.pendingActionId);
await assert.rejects(() => confirmCartAction(ownerA, expired.pendingActionId), (error: unknown) => error instanceof CartError && error.code === "CART_ACTION_EXPIRED");

// Guest-to-account policy merges quantities, revalidates Products, clears the guest cart and is idempotent.
const guestOwner = cartOwner(undefined, "merge-guest"); const customerOwner = cartOwner("customer-1", "unused");
await replaceCart(guestOwner, [{ productId: "product-router", quantity: 2 }]);
await replaceCart(customerOwner, [{ productId: "product-router", quantity: 3 }]);
assert.equal((await mergeGuestCartIntoCustomer(guestOwner, customerOwner)).itemCount, 5);
assert.equal((await mergeGuestCartIntoCustomer(guestOwner, customerOwner)).itemCount, 5);
assert.equal((await getCart(guestOwner)).itemCount, 0);

const telemetry = await getCartTelemetry();
assert.equal(telemetry.cart_add_confirmation_created, 3);
assert.equal(telemetry.cart_add_confirmed, 1);
assert.equal(telemetry.cart_update_confirmation_created, 2);
assert.equal(telemetry.cart_update_confirmed, 1);
assert.equal(telemetry.cart_remove_confirmation_created, 1);
assert.equal(telemetry.cart_price_changed, 1);
assert.equal(telemetry.cart_availability_changed, 1);
assert.equal(telemetry.cart_mutation_failed, 1);
assert.equal(telemetry.cart_idempotent_replay, 2);
assert.doesNotMatch(JSON.stringify(telemetry), /product-router|supplier|prompt/i);
assert.doesNotMatch(JSON.stringify(await getCart(ownerA)), /supplier|margin|cost/i); setCartProductSourceForTests(); console.log("Cart service tests passed.");

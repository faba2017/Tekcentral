import assert from "node:assert/strict";
import { availabilityPurchasable, resolveProductAvailability, type ProductAvailabilityEvidence } from "../productAvailability.js";
import { isUsableMappedOffer, isUsableScoopAvailabilitySource, isUsableSyntechAvailabilitySource } from "../productAvailabilityService.js";

const now = new Date("2026-10-16T12:00:00.000Z");
const freshAt = "2026-10-16T11:00:00.000Z";
const staleAt = "2026-10-14T11:00:00.000Z";
const evidence = (state: ProductAvailabilityEvidence["state"], source: string, observedAt = freshAt, quantity?: number): ProductAvailabilityEvidence => ({ state, source, observedAt, quantity, freshnessHours: 24 });

assert.equal(resolveProductAvailability([evidence("IN_STOCK", "SINGLE", freshAt, 12)], now).state, "IN_STOCK");
assert.equal(resolveProductAvailability([evidence("LOW_STOCK", "SINGLE", freshAt, 3)], now).state, "LOW_STOCK");
assert.equal(resolveProductAvailability([evidence("OUT_OF_STOCK", "SINGLE", freshAt, 0)], now).state, "OUT_OF_STOCK");
assert.equal(resolveProductAvailability([evidence("AVAILABLE_FROM_SUPPLIER", "SINGLE")], now).state, "AVAILABLE_FROM_SUPPLIER");
assert.equal(resolveProductAvailability([evidence("IN_STOCK", "STALE", staleAt, 12)], now).state, "CHECK_REQUIRED");
assert.equal(resolveProductAvailability([], now).state, "AVAILABILITY_UNKNOWN");
assert.equal(resolveProductAvailability([evidence("OUT_OF_STOCK", "SCOOP", freshAt, 0), evidence("IN_STOCK", "SYNTECH", freshAt, 25)], now).state, "IN_STOCK");
assert.equal(resolveProductAvailability([evidence("OUT_OF_STOCK", "SCOOP", freshAt, 0), evidence("OUT_OF_STOCK", "SYNTECH", freshAt, 0)], now).state, "OUT_OF_STOCK");
assert.equal(resolveProductAvailability([evidence("IN_STOCK", "STALE", staleAt, 20), evidence("OUT_OF_STOCK", "FRESH_ZERO", freshAt, 0)], now).state, "OUT_OF_STOCK");
assert.equal(resolveProductAvailability([evidence("AVAILABILITY_UNKNOWN", "NO_STOCK_FIELD"), evidence("IN_STOCK", "CJ_EXACT", freshAt, 8)], now).state, "IN_STOCK");
assert.equal(resolveProductAvailability([evidence("AVAILABILITY_UNKNOWN", "NO_STOCK_FIELD"), evidence("OUT_OF_STOCK", "EXPLICIT_ZERO", freshAt, 0)], now).state, "OUT_OF_STOCK");
assert.equal(resolveProductAvailability([evidence("AVAILABILITY_UNKNOWN", "NO_STOCK_FIELD"), evidence("IN_STOCK", "STALE", staleAt, 8)], now).state, "CHECK_REQUIRED");
assert.equal(resolveProductAvailability([evidence("DELIVERY_CHECK_REQUIRED", "CJ_LOGISTICS")], now).state, "DELIVERY_CHECK_REQUIRED");
assert.equal(isUsableMappedOffer("VERIFIED", true), true);
assert.equal(isUsableMappedOffer("REJECTED", true), false);
assert.equal(isUsableMappedOffer("VERIFIED", false), false);
assert.equal(isUsableScoopAvailabilitySource({ availability: "AVAILABLE", sourceObservations: [{ active: true }] }), true);
assert.equal(isUsableScoopAvailabilitySource({ availability: "STALE", sourceObservations: [{ active: true }] }), false);
assert.equal(isUsableScoopAvailabilitySource({ availability: "AVAILABLE", sourceObservations: [{ active: false }] }), false);
assert.equal(isUsableSyntechAvailabilitySource({ sourcePresence: "ACTIVE" }), true);
assert.equal(isUsableSyntechAvailabilitySource({ sourcePresence: "SOURCE_MISSING" }), false);
assert.equal(availabilityPurchasable("CHECK_REQUIRED"), false);
assert.equal(availabilityPurchasable("DELIVERY_CHECK_REQUIRED"), true);
for (const state of ["IN_STOCK", "LOW_STOCK", "AVAILABLE_FROM_SUPPLIER", "BACKORDER", "PREORDER", "DELIVERY_CHECK_REQUIRED"] as const) assert.equal(availabilityPurchasable(state), true, `${state} should remain purchasable`);
for (const state of ["OUT_OF_STOCK", "CHECK_REQUIRED", "AVAILABILITY_UNKNOWN", "DISCONTINUED"] as const) assert.equal(availabilityPurchasable(state), false, `${state} should block purchase`);

const af5xhdTypeEvidence = evidence("IN_STOCK", "SCOOP_OFFER", "2026-10-30T22:36:11.369Z", 174);
const af5xhdResolved = resolveProductAvailability([af5xhdTypeEvidence], new Date("2026-11-07T12:00:00.000Z"));
assert.equal(af5xhdResolved.state, "CHECK_REQUIRED");
assert.equal(af5xhdResolved.purchasable, false);

console.log("Product availability tests passed.");

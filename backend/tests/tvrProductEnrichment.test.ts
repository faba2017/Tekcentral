import assert from "node:assert/strict";
import { contentIntelligence } from "../productConfigurationIntelligence.js";
import { deriveTvrWebsiteFreshness, resolveTvrProductEnrichment } from "../suppliers/tvr/tvrProductEnrichment.js";
import type { TvrPublicProductEvidence } from "../suppliers/tvr/tvrPublicCatalogue.js";
import type { TvrNormalizedOffer } from "../suppliers/tvr/tvrOfferNormalization.js";
import type { SupplierProductMapping } from "../types.js";

const now = "2026-11-08T23:33:26.208Z", version = "version-1", fingerprint = "source-fingerprint";
const record: TvrPublicProductEvidence = {
  productId: 12544, canonicalUrl: "https://www.tvr.co.za/product/logitech-mouse-wired-m90/", websiteSku: "910-001793", normalizedSku: "910-001793",
  title: "LOGITECH MOUSE WIRED M90", shortDescription: "Reliable wired optical mouse.", longDescription: "USB Type-A optical mouse with two buttons and a wheel.", brand: "LOGITECH",
  categories: [{ name: "Mice" }], attributes: [{ name: "Tracking", values: ["Optical"] }, { name: "Resolution", values: ["1000 DPI"] }, { name: "Buttons", values: ["2"] }],
  weight: "0.09 kg", dimensions: { length: "113 mm", width: "62 mm", height: "38 mm" }, documents: [],
  deferredImages: [{ url: "https://www.tvr.co.za/wp-content/uploads/m90.jpg", order: 0, fingerprint: "image" }], fingerprint: "product-fingerprint",
};
const offer = (condition = "NEW"): TvrNormalizedOffer => ({
  id: `TVR:${condition}:910-001793`, supplierId: "TVR", supplierIdentity: `TVR:${condition}:910-001793`, supplierSku: "910-001793", catalogueSupplierSku: `${condition}:910-001793`, normalizedSupplierSku: "910-001793", condition: condition as TvrNormalizedOffer["condition"],
  taxBasis: "UNKNOWN", priceMeaning: "DEALER_RESELLER_PURCHASE_COST", commercialAuthority: "TEKCENTRAL_BUSINESS_CONFIRMED", availability: "UNKNOWN", fulfilmentCapability: "UNKNOWN", mappingStatus: "UNMAPPED", classification: "SAFE", reviewReasons: [], flags: [], conditionCollision: false,
  priceEvidence: { alternatives: [] }, stockEvidence: { states: [], observations: [] }, normalizedOfferFingerprint: `offer-${condition}`, lifecycleStatus: "CURRENT", observedAt: now, updatedAt: now,
  provenance: { contributingEvidenceIds: [], sourceVersionIds: [], observations: [] }, sourceWarningsRef: { sourceVersionIds: [], scope: "WORKBOOK_VERSION" },
});
const mapping = (sourceOffer = offer(), status: SupplierProductMapping["status"] = "VERIFIED", productId = "product-1"): SupplierProductMapping => ({
  id: `mapping-${sourceOffer.condition}-${productId}`, productId, supplierCode: "TVR", supplierSku: sourceOffer.supplierSku, supplierOfferId: sourceOffer.id, status, createdAt: now, updatedAt: now,
});
const resolve = (input: Partial<Parameters<typeof resolveTvrProductEnrichment>[0]> = {}) => resolveTvrProductEnrichment({
  productId: "product-1", records: [record], offers: [offer()], mappings: [mapping()], sourceVersionId: version, sourceFingerprint: fingerprint,
  retrievedAt: now, sourceState: "ACTIVE", currentVersionId: version, currentFingerprint: fingerprint, ...input,
});

const exact = resolve();
assert.equal(exact.status, "RESOLVED");
if (exact.status !== "RESOLVED") throw new Error("fixture did not resolve");
assert.equal(exact.freshness, "FRESH");
assert.equal(exact.enrichment.evidence.title.sourceVersionId, version);
assert.equal(exact.enrichment.specifications.some((item) => item.name === "Resolution" && item.value === "1000 DPI"), true);
assert.equal(exact.enrichment.specifications.some((item) => item.name === "Weight"), true);
assert.equal(exact.enrichment.category, undefined, "website category remains advisory");
assert.equal(exact.enrichment.imageCandidates.length, 1);
assert.equal(exact.enrichment.imageCandidates[0]?.targetProductId, "product-1");
const repeated = resolve();
assert.equal(repeated.status, "RESOLVED");
if (repeated.status !== "RESOLVED") throw new Error("expected repeated TVR enrichment resolution");
assert.equal(exact.enrichment.imageCandidates[0]?.id, repeated.enrichment.imageCandidates[0]?.id, "candidate identity must be deterministic");
assert.equal(JSON.stringify(exact.enrichment).includes("price"), false);
assert.equal(resolve({ mappings: [{ ...mapping(), supplierSku: "NEW:910-001793" }] }).status, "RESOLVED", "condition-qualified mapping identity must bridge through the exact offer raw SKU");

for (const status of ["UNMAPPED", "SUGGESTED", "REJECTED", "SUPERSEDED", "REVIEW_REQUIRED"] as const) assert.equal(resolve({ mappings: [mapping(offer(), status)] }).status, "NOT_FOUND");
assert.equal(resolve({ records: [] }).status, "NOT_FOUND", "sheet-only offer must not receive website evidence");
assert.equal(resolve({ offers: [], mappings: [] }).status, "NOT_FOUND", "website-only evidence must not attach");
assert.equal(resolve({ mappings: [{ ...mapping(), supplierOfferId: "TVR:NEW:FUZZY" }] }).status, "NOT_FOUND");
assert.equal(resolve({ records: [record, { ...record, productId: 999, canonicalUrl: "https://www.tvr.co.za/product/conflict/", fingerprint: "different" }] }).status, "AMBIGUOUS");

const reman = offer("REMANUFACTURED"), multi = resolve({ offers: [offer(), reman], mappings: [mapping(), mapping(reman)] });
assert.equal(multi.status, "RESOLVED");
if (multi.status === "RESOLVED") { assert.equal(multi.offers.length, 2); assert.equal(multi.mappings.length, 2); }
assert.equal(resolve({ mappings: [mapping(), mapping(offer(), "VERIFIED", "product-2")] }).status, "AMBIGUOUS");

const recommendations = contentIntelligence(exact.enrichment, { name: "Staff title", shortDescription: "Staff copy", description: "Staff overview", specifications: [{ name: "Tracking", value: "Laser", origin: "STAFF_AUTHORED" }] });
assert.equal(recommendations.some((item) => item.type === "SPECIFICATION" && item.confidence === "CONFLICT"), true);
assert.equal(recommendations.some((item) => item.type === "SPECIFICATION" && item.confidence === "STRONG"), true);
const redundant = contentIntelligence(exact.enrichment, { name: exact.enrichment.title!, shortDescription: exact.enrichment.shortDescription!, description: exact.enrichment.longDescription, specifications: exact.enrichment.specifications.map(({ name, value }) => ({ name, value })) });
assert.equal(redundant.length, 0);
assert.equal(deriveTvrWebsiteFreshness({ evidenceVersionId: version, evidenceFingerprint: fingerprint, currentVersionId: version, currentFingerprint: fingerprint, sourceState: "DISABLED" }), "STALE");
assert.equal(deriveTvrWebsiteFreshness({ evidenceVersionId: version, evidenceFingerprint: fingerprint }), "UNKNOWN");
const stable = resolve();
assert.equal(stable.status === "RESOLVED" && stable.enrichment.fingerprint, exact.enrichment.fingerprint);
const changed = resolve({ records: [{ ...record, longDescription: "Changed source-backed content.", fingerprint: "changed" }] });
assert.equal(changed.status, "RESOLVED"); if (changed.status === "RESOLVED") assert.notEqual(changed.enrichment.fingerprint, exact.enrichment.fingerprint);

console.log("TVR exact-SKU Product enrichment tests passed.");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { redactAdminPayload } from "../adminResponseSecurity.js";
import { availabilityPurchasable, resolveProductAvailability, type ProductAvailabilityEvidence } from "../productAvailability.js";
import {
  PRODUCT_ONBOARDING_STEPS,
  evaluateProductOnboarding,
  normalizeCjOnboardingEvidence,
  normalizeManualOnboardingEvidence,
  normalizeScoopOnboardingEvidence,
  normalizeSyntechOnboardingEvidence,
  type ProductOnboardingContext,
} from "../productOnboarding.js";

const complete = (supplierCode: string, sourceKind: "API" | "FEED" | "MANUAL"): ProductOnboardingContext => ({
  evidence: { supplierCode, supplierSku: `${supplierCode}-SKU`, sourceKind, sourceStatus: "CURRENT", stock: { status: "AVAILABLE", quantity: 8, observedAt: "2026-11-08T08:00:00.000Z", freshness: "FRESH" }, logistics: { status: "COMPLETE" }, commercial: { status: "CURRENT", cost: 100, currency: "ZAR" } },
  product: { id: `product-${supplierCode.toLowerCase()}`, slug: `product-${supplierCode.toLowerCase()}`, name: `${supplierCode} Product`, sku: `TC-${supplierCode}` },
  mappingStatus: "VERIFIED", identityStatus: "VERIFIED", taxonomyStatus: "VERIFIED", contentStatus: "COMPLETE", hasControlledPublicImage: true,
  pricingStatus: "APPROVED", launchStatus: "SELECTED", previewAvailable: true, publication: { state: "READY_FOR_PUBLISH_REVIEW" },
});

const adapters = [
  [normalizeScoopOnboardingEvidence, "SCOOP", "FEED"],
  [normalizeSyntechOnboardingEvidence, "SYNTECH", "FEED"],
  [normalizeCjOnboardingEvidence, "CJ", "API"],
  [normalizeManualOnboardingEvidence, "TEKCENTRAL", "MANUAL"],
] as const;
for (const [adapter, supplierCode, sourceKind] of adapters) {
  const normalized = adapter({ supplierCode: "IGNORED", sourceStatus: "CURRENT" });
  assert.equal(normalized.supplierCode, supplierCode);
  assert.equal(normalized.sourceKind, sourceKind);
  const readiness = evaluateProductOnboarding(complete(supplierCode, sourceKind));
  assert.deepEqual(readiness.steps.map((step) => step.id), PRODUCT_ONBOARDING_STEPS);
  assert.equal(readiness.nextAction.id, "PUBLISH_PRODUCT");
  assert.equal(readiness.nextAction.label, "Review & publish");
  assert.equal(readiness.completedStepCount, 11);
}

const actionCases: Array<[Partial<ProductOnboardingContext>, string, string]> = [
  [{ mappingStatus: "MISSING" }, "REVIEW_MAPPING", "Match or create Product"],
  [{ taxonomyStatus: "MISSING" }, "COMPLETE_TAXONOMY", "Complete taxonomy"],
  [{ hasControlledPublicImage: false }, "ADD_PUBLIC_IMAGE", "Add public image"],
  [{ evidence: { ...complete("SCOOP", "FEED").evidence, logistics: { status: "MISSING" } } }, "COMPLETE_LOGISTICS", "Complete logistics"],
  [{ pricingStatus: "AWAITING_APPROVAL" }, "REVIEW_PRICING", "Review pricing"],
  [{ launchStatus: "NOT_SELECTED" }, "REVIEW_LAUNCH", "Select for launch"],
];
for (const [override, id, label] of actionCases) {
  const base = complete("SCOOP", "FEED");
  const readiness = evaluateProductOnboarding({ ...base, ...override, evidence: override.evidence ?? base.evidence });
  assert.equal(readiness.nextAction.id, id);
  assert.equal(readiness.nextAction.label, label);
}

const now = new Date("2026-11-08T12:00:00.000Z");
const evidence = (state: ProductAvailabilityEvidence["state"], observedAt?: string): ProductAvailabilityEvidence => ({ state, source: "QA", observedAt, freshnessHours: 24 });
assert.equal(resolveProductAvailability([evidence("IN_STOCK", "2026-11-08T08:00:00.000Z")], now).state, "IN_STOCK");
assert.equal(resolveProductAvailability([evidence("LOW_STOCK", "2026-11-08T08:00:00.000Z")], now).state, "LOW_STOCK");
assert.equal(resolveProductAvailability([evidence("AVAILABLE_FROM_SUPPLIER", "2026-11-08T08:00:00.000Z")], now).state, "AVAILABLE_FROM_SUPPLIER");
assert.equal(resolveProductAvailability([evidence("OUT_OF_STOCK", "2026-11-08T08:00:00.000Z")], now).state, "OUT_OF_STOCK");
assert.equal(resolveProductAvailability([evidence("IN_STOCK", "2026-11-01T08:00:00.000Z")], now).state, "CHECK_REQUIRED");
assert.equal(resolveProductAvailability([], now).state, "AVAILABILITY_UNKNOWN");
assert.equal(availabilityPurchasable("OUT_OF_STOCK"), false);

const redacted = redactAdminPayload({ supplierUrl: "https://private.example", supplierCostExVat: 100, grossMarginPercent: 20, stockTotal: 9, canonical: { name: "Public Product" } }, { pathname: "/api/admin/products/product-1/publication", permissions: new Set(["products.read"]) }) as Record<string, unknown>;
assert.equal("supplierCostExVat" in redacted, false);
assert.equal("grossMarginPercent" in redacted, false);
assert.equal("stockTotal" in redacted, false);
assert.deepEqual(redacted.canonical, { name: "Public Product" });

for (const path of ["src/pages/admin/AdminScoopSupplierPage.tsx", "src/pages/admin/AdminSyntechSupplierPage.tsx", "src/pages/admin/AdminCjSupplierPage.tsx", "src/components/admin/TekCentralManualOffersWorkspace.tsx"]) {
  assert.match(readFileSync(path, "utf8"), /ProductConfiguration(?:Link|Workspace)|productConfigurationHref|productSetup/);
}
const supplierTable = readFileSync("src/components/admin/SupplierProductTable.tsx", "utf8");
assert.match(supplierTable, /nextAction\.id === "VIEW_STOREFRONT"/);
assert.doesNotMatch(supplierTable, /nextAction\.label === "View storefront"/);
const server = readFileSync("backend/server.ts", "utf8");
const syntechCatalogueRoute = server.slice(server.indexOf('url.pathname === "/api/admin/suppliers/syntech/products"'), server.indexOf("const syntechOnboardingMatch"));
assert.match(syntechCatalogueRoute, /filtered\.slice\(start, start \+ pageSize\)\.map/);
assert.doesNotMatch(syntechCatalogueRoute, /all\.map\(async[\s\S]*getProductOnboardingReadiness/);

console.log("Cross-supplier QA tests passed.");

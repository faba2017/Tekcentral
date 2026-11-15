import assert from "node:assert/strict";
import type { PricingProposal } from "../pricingProposalRepository.js";
import { redactAdminPayload } from "../adminResponseSecurity.js";
import { contentIntelligence, logisticsIntelligence, mediaIntelligence, pricingIntelligence } from "../productConfigurationIntelligence.js";
import { buildSupplierProductEnrichment } from "../supplierProductEnrichment.js";

const retrievedAt = "2026-11-07T08:00:00.000Z";
const enrichment = buildSupplierProductEnrichment({ supplier: "SYNTECH", supplierSku: "SYN-1", productName: "Router One", brand: "Example", description: "Dual-band wireless router.", attributes: { portCount: "4", warranty: "24 months" }, primaryImageUrl: "https://cdn.example.test/router.png", retrievedAt, mediaAssociation: "EXACT_VARIANT" });
const content = contentIntelligence(enrichment, { name: "Example Router", shortDescription: "Existing staff copy", description: "Staff overview", specifications: [{ name: "Port count", value: "8", origin: "STAFF_AUTHORED" }] });
assert.ok(content.some((item) => item.type === "SPECIFICATION" && item.confidence === "CONFLICT"));
assert.ok(content.some((item) => JSON.stringify(item.recommendedValue).includes("Warranty")));
assert.equal(content.some((item) => JSON.stringify(item.recommendedValue).includes("PoE")), false);
assert.equal(content.some((item) => item.recommendedValue === "Staff overview"), false);

for (const supplier of ["SCOOP", "SYNTECH", "CJ", "TEKCENTRAL"]) {
  const suggestion = buildSupplierProductEnrichment({ supplier, supplierSku: `${supplier}-1`, productName: "Evidence-backed product", description: "Source description.", retrievedAt });
  assert.equal(suggestion.evidence.title.supplier, supplier);
  assert.equal(suggestion.longDescription, "Source description.");
}
const normalizedCopy = buildSupplierProductEnrichment({ supplier: "SCOOP", productName: "Router One", description: "Router One!!! Router for a small office...", retrievedAt });
assert.equal(normalizedCopy.longDescription, "Router for a small office.");

const media = mediaIntelligence([...enrichment.imageCandidates, { ...enrichment.imageCandidates[0], id: "duplicate", candidateOrder: 1 }, { ...enrichment.imageCandidates[0], id: "broken", url: "http://invalid.example.test/image.bmp", candidateOrder: 2 }]);
assert.equal(media[0].intelligence.recommendedPrimary, true);
assert.ok(media.find((item) => item.id === "duplicate")?.intelligence.labels.includes("Duplicate"));
assert.ok(media.find((item) => item.id === "broken")?.intelligence.labels.includes("Broken"));

const incompleteLogistics = logisticsIntelligence({ status: "PARTIAL", source: "SUPPLIER_FEED", freshness: "STALE", weightKnown: false, dimensionsKnown: false });
assert.equal(incompleteLogistics.confidence, "STALE");
assert.ok(incompleteLogistics.recommendations.some((item) => item.type === "MISSING_WEIGHT"));
assert.ok(incompleteLogistics.recommendations.some((item) => item.type === "MISSING_DIMENSIONS"));
const conflictLogistics = logisticsIntelligence({ status: "COMPLETE", conflicts: [{ field: "weight", sources: ["feed", "document"] }] });
assert.equal(conflictLogistics.confidence, "CONFLICT");
assert.equal("availability" in conflictLogistics, false);

const proposal = (supplierId: string, cost: number, status: PricingProposal["status"] = "PENDING_APPROVAL") => ({ id: `price-${supplierId}`, productId: "product-1", supplierId, supplierOfferId: `${supplierId}-offer`, status, costSnapshot: { supplierId, supplierOfferId: `${supplierId}-offer`, currency: "ZAR", supplierCostExVat: cost, pricingTimestamp: retrievedAt }, vatRatePercent: 15, warnings: ["ABOVE_REFERENCE_RETAIL"], warningDetails: [{ code: "ABOVE_REFERENCE_RETAIL", severity: "WARNING", message: "Review market benchmark." }], grossMarginPercent: 20, generatedAt: retrievedAt, updatedAt: retrievedAt } as unknown as PricingProposal);
const pricing = pricingIntelligence({ proposals: [proposal("SCOOP", 100), proposal("SYNTECH", 110, "APPROVED")], fxImpact: { classification: "REVIEW", currentGrossMarginPercent: 12, recommendedPrice: 199 } });
assert.equal(pricing.comparison.length, 2);
assert.equal(pricing.comparison[0].supplierCostExVat, 100);
assert.ok(pricing.recommendations.some((item) => item.type === "FX_MOVEMENT"));
assert.ok(pricing.recommendations.some((item) => item.type === "APPROVAL"));
assert.equal(pricing.comparison.some((item) => "selected" in item), false);
const redacted = redactAdminPayload({ intelligence: { pricing } }, { pathname: "/api/admin/products/product-1/publication", permissions: new Set(["products.read"]) }) as { intelligence: { pricing: { comparison: Array<Record<string, unknown>> } } };
assert.equal("supplierCostExVat" in redacted.intelligence.pricing.comparison[0], false);

console.log("Product configuration intelligence tests passed.");

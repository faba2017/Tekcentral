import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { generateContextualAdminAi, modelRoleForContext, parseAdminAiContextRequest } from "../adminAi/contextual.js";
import { AdminAiService } from "../adminAi/service.js";
import type { AdminAiProviderRequest } from "../adminAi/types.js";
import type { StaffAuthorizationContext } from "../staffAuthorization.js";
import type { StaffPermission } from "../staffRbac.js";

const staff = (...permissions: StaffPermission[]): StaffAuthorizationContext => ({ actorType: "STAFF_USER", actorId: "staff-1", actorLabel: "Staff", role: "CATALOGUE", permissions: new Set(permissions), provisional: false });
const access = async () => ({ environmentEnabled: true, globalEnabled: true, hasPermission: true, effective: true });
let calls = 0;
const providerRequests: AdminAiProviderRequest[] = [];
const service = new AdminAiService({
  config: { enabled: true, provider: "digitalocean", apiKey: "not-real", primaryModel: "primary", routineModel: "routine", fallbackModel: "fallback", baseUrl: "https://inference.do-ai.run", timeoutMs: 20_000, maxOutputTokens: 1_200 },
  provider: { id: "digitalocean", async generate(request) { calls += 1; providerRequests.push(request); return { text: "Facts are summarized. Suggested next steps remain read-only.", provider: "digitalocean", model: request.model, latencyMs: 2, usage: { inputTokens: 40, outputTokens: 12, totalTokens: 52 } }; } },
});

const readiness = (completed = 7) => ({
  source: { supplierCode: "TVR", sourceKind: "FEED", sourceStatus: "CURRENT", stock: { status: "AVAILABLE", freshness: "FRESH" }, logistics: { status: "COMPLETE" }, commercial: { status: "CURRENT", cost: 99, currency: "ZAR" }, lastCheckedAt: "2026-11-09T10:00:00Z", provenance: { apiKey: "must-not-leak", signedUrl: "https://secret.invalid/signed" } },
  product: { id: "product-1", slug: "product-1", name: "Safe Product", sku: "SAFE-1" },
  steps: [
    { id: "SOURCE_EVIDENCE", label: "Source evidence", state: "COMPLETE", blockers: [] },
    { id: "PRICING", label: "Pricing", state: "NEEDS_REVIEW", blockers: [{ code: "PRICING_APPROVAL_REQUIRED", step: "PRICING", severity: "REVIEW", explanation: "Pricing is awaiting approval.", whyItMatters: "Explicit approval is required.", recommendedResolution: "Review the proposal.", actionId: "REVIEW_PRICING" }] },
  ],
  completedStepCount: completed, totalApplicableStepCount: 12,
  blockers: [],
  warnings: [{ code: "PRICING_APPROVAL_REQUIRED", step: "PRICING", severity: "REVIEW", explanation: "Pricing is awaiting approval.", whyItMatters: "Explicit approval is required.", recommendedResolution: "Review the proposal.", actionId: "REVIEW_PRICING" }],
  firstUnresolvedStep: "PRICING", nextAction: { id: "REVIEW_PRICING", label: "Review pricing", step: "PRICING" }, publicationEligible: false, publicationState: "NOT_PUBLISHED", alreadyPublished: false,
});
const product = { id: "product-1", slug: "product-1", sku: "SAFE-1", name: "Safe Product", brand: "Safe Brand", category: "Networking", subcategory: "Routers", taxonomyStatus: "VERIFIED", publicationStatus: "INTERNAL_DRAFT", shortDescription: "Safe", description: "Safe", images: [], createdAt: "2026-01-01", updatedAt: "2026-01-01", provenance: { createdFromSupplierOffer: true, sourceSupplier: "TVR", sourceSupplierOfferId: "offer-1", sourceSupplierSku: "SAFE-1", sourceDescription: "Safe" } };
const proposal = { id: "price-1", productId: "product-1", supplierId: "TVR", supplierOfferId: "offer-1", proposalKind: "AUTOMATED", status: "PENDING_APPROVAL", generatedAt: "2026-11-09T10:00:00Z", updatedAt: "2026-11-09T10:00:00Z", costSnapshot: { supplierId: "TVR", supplierOfferId: "offer-1", currency: "ZAR", supplierCostExVat: 100, sourceCostAmount: 115, sourceCurrency: "ZAR", sourceTaxBasis: "INCLUSIVE", pricingTimestamp: "2026-11-09T09:00:00Z", secret: "do-not-leak" }, vatRatePercent: 15, proposedSellingPriceExVat: 150, vatAmount: 22.5, proposedSellingPriceInclVat: 172.5, grossProfit: 50, grossMarginPercent: 33.33, markupPercent: 50.01, warnings: ["ABOVE_REFERENCE_RETAIL"], warningDetails: [{ code: "ABOVE_REFERENCE_RETAIL", severity: "WARNING", message: "Above reference retail." }], appliedPricingBand: { id: "LOW", minimumCost: 0, maximumCost: 500, targetGrossMarginPercent: 35, minimumGrossProfit: 50 } };
const supplier = { supplier: { id: "TVR", displayName: "TVR Distribution", enabled: true, sourceSummary: { configured: 2, active: 2, disabled: 0, archived: 0, incentivesIgnored: 0 } }, configurationStatus: "CONFIGURED", connectionStatus: "CONNECTED", healthStatus: "HEALTHY", catalogue: { productCount: 1346, availableCount: 459, staleCount: 0, lastSyncAt: "2026-11-09T10:00:00Z" }, mappings: { total: 4, verified: 2, reviewRequired: 2 }, orders: { total: 0, attention: 0 }, tvrOffers: { total: 1346, conflict: 3, reviewRequired: 2, credential: "must-not-leak" }, syncHistory: Array.from({ length: 20 }, (_, index) => ({ type: "Supplier source", completedAt: `2026-11-${String(index + 1).padStart(2, "0")}T10:00:00Z`, status: index ? "UNCHANGED" : "IMPORTED", recordsProcessed: 1346, errors: 0, source: "TVR source registry", rawUrl: "https://secret.invalid" })) };
let currentCompleted = 7;
const deps = {
  getProductReadiness: async () => readiness(currentCompleted) as never,
  getProduct: async (id: string) => id === "product-1" ? product as never : undefined,
  getSupplier: async (id: string) => id === "TVR" ? supplier as never : undefined,
  getProposal: async (id: string) => id === "price-1" ? proposal as never : undefined,
};

assert.deepEqual(parseAdminAiContextRequest({ contextType: "PRODUCT", resourceId: "product-1", intent: "SUMMARY" }), { contextType: "PRODUCT", resourceId: "product-1", intent: "SUMMARY" });
assert.throws(() => parseAdminAiContextRequest({ contextType: "PRODUCT", resourceId: "product-1", intent: "SUMMARY", price: 1 }), (error: unknown) => (error as { code?: string }).code === "INVALID_CONTEXT_REQUEST");
assert.throws(() => parseAdminAiContextRequest({ contextType: "ORDER", resourceId: "1", intent: "SUMMARY" }), (error: unknown) => (error as { code?: string }).code === "INVALID_CONTEXT_REQUEST");
assert.equal(modelRoleForContext("PRODUCT", "SUMMARY"), "ROUTINE");
assert.equal(modelRoleForContext("SUPPLIER", "RISK_REVIEW"), "PRIMARY");
assert.equal(modelRoleForContext("PRICING_PROPOSAL", "BLOCKERS"), "PRIMARY");

await assert.rejects(() => generateContextualAdminAi({ request: { contextType: "PRODUCT", resourceId: "product-1", intent: "SUMMARY" }, context: staff("admin_ai.use"), service, resolveAccess: access, dependencies: deps }), (error: unknown) => (error as { code?: string }).code === "PERMISSION_DENIED");
assert.equal(calls, 0);
await assert.rejects(() => generateContextualAdminAi({ request: { contextType: "PRODUCT", resourceId: "missing", intent: "SUMMARY" }, context: staff("admin_ai.use", "products.read"), service, resolveAccess: access, dependencies: deps }), (error: unknown) => (error as { code?: string }).code === "RESOURCE_NOT_FOUND");
assert.equal(calls, 0);
await assert.rejects(() => generateContextualAdminAi({ request: { contextType: "SUPPLIER", resourceId: "TVR", intent: "SUMMARY" }, context: staff("admin_ai.use", "suppliers.read"), service, resolveAccess: async () => ({ environmentEnabled: true, globalEnabled: false, hasPermission: true, effective: false, denialReason: "GLOBAL_DISABLED" }), dependencies: deps }), (error: unknown) => (error as { code?: string }).code === "GLOBAL_DISABLED");
assert.equal(calls, 0);

const productResult = await generateContextualAdminAi({ request: { contextType: "PRODUCT", resourceId: "product-1", intent: "BLOCKERS" }, context: staff("admin_ai.use", "products.read"), service, resolveAccess: access, dependencies: deps });
assert.equal(productResult.result.requestedModelRole, "ROUTINE");
assert.equal(providerRequests.at(-1)!.maxOutputTokens, 1_200);
assert.match(providerRequests.at(-1)!.contextBlocks[0].content, /PRICING_APPROVAL_REQUIRED/);
assert.doesNotMatch(providerRequests.at(-1)!.contextBlocks[0].content, /must-not-leak|secret\.invalid/i);
currentCompleted = 8;
await generateContextualAdminAi({ request: { contextType: "PRODUCT", resourceId: "product-1", intent: "SUMMARY" }, context: staff("admin_ai.use", "products.read"), service, resolveAccess: access, dependencies: deps });
assert.match(providerRequests.at(-1)!.contextBlocks[0].content, /"completedSteps":8/);

await generateContextualAdminAi({ request: { contextType: "SUPPLIER", resourceId: "TVR", intent: "RISK_REVIEW" }, context: staff("admin_ai.use", "suppliers.read"), service, resolveAccess: access, dependencies: deps });
assert.equal(providerRequests.at(-1)!.modelRole, "PRIMARY");
assert.equal((providerRequests.at(-1)!.contextBlocks[0].content.match(/Supplier source/g) ?? []).length, 5);
assert.doesNotMatch(providerRequests.at(-1)!.contextBlocks[0].content, /credential|secret\.invalid|rawUrl/i);

await generateContextualAdminAi({ request: { contextType: "PRICING_PROPOSAL", resourceId: "price-1", intent: "SUMMARY" }, context: staff("admin_ai.use", "pricing.read"), service, resolveAccess: access, dependencies: deps });
assert.match(providerRequests.at(-1)!.contextBlocks[0].content, /Restricted by staff permission/);
assert.doesNotMatch(providerRequests.at(-1)!.contextBlocks[0].content, /R\s?100[,.]00/);
await generateContextualAdminAi({ request: { contextType: "PRICING_PROPOSAL", resourceId: "price-1", intent: "EXPLAIN" }, context: staff("admin_ai.use", "pricing.read", "pricing.view_supplier_cost"), service, resolveAccess: access, dependencies: deps });
const pricingContext = providerRequests.at(-1)!.contextBlocks[0].content;
assert.match(pricingContext, /PENDING_APPROVAL/); assert.match(pricingContext, /R\s?100[,.]00/); assert.match(pricingContext, /R\s?172[,.]50/); assert.match(pricingContext, /INCLUSIVE/); assert.doesNotMatch(pricingContext, /do-not-leak|secret/i);
assert.match(pricingContext, /"markupPercent":50\.01/); assert.match(pricingContext, /"pricingBand":"LOW"/);

const ui = await readFile("src/components/admin/AdminAiContextPanel.tsx", "utf8");
assert.equal(ui.includes("dangerouslySetInnerHTML"), false);
assert.match(ui, /Canonical status remains authoritative/);
for (const file of ["src/components/admin/ProductConfigurationWorkspace.tsx", "src/pages/admin/AdminSupplierWorkspacePage.tsx", "src/pages/admin/AdminPricingSettingsPage.tsx"]) assert.match(await readFile(file, "utf8"), /AdminAiContextPanel/);

console.log("Admin AI contextual intelligence tests passed.");

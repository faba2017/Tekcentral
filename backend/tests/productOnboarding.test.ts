import assert from "node:assert/strict";
import {
  PRODUCT_ONBOARDING_STEPS,
  evaluateProductOnboarding,
  normalizeCjOnboardingEvidence,
  normalizeManualOnboardingEvidence,
  normalizeMustekOnboardingEvidence,
  normalizeScoopOnboardingEvidence,
  normalizeSyntechOnboardingEvidence,
  type ProductOnboardingContext,
} from "../productOnboarding.js";
import { readFileSync } from "node:fs";
import { redactAdminPayload } from "../adminResponseSecurity.js";
import { buildSupplierProductEnrichment } from "../supplierProductEnrichment.js";

const complete = (supplierCode = "SCOOP"): ProductOnboardingContext => ({
  evidence: { supplierCode, supplierSku: "SKU-1", sourceKind: "FEED", sourceStatus: "CURRENT", stock: { status: "AVAILABLE", quantity: 5, freshness: "FRESH" }, logistics: { status: "COMPLETE" }, commercial: { status: "CURRENT", cost: 100, currency: "ZAR" } },
  product: { id: "product-1", slug: "product-1", name: "Product one", sku: "TC-1" },
  mappingStatus: "VERIFIED", identityStatus: "VERIFIED", taxonomyStatus: "VERIFIED", contentStatus: "COMPLETE",
  hasControlledPublicImage: true, pricingStatus: "APPROVED", launchStatus: "SELECTED", previewAvailable: true,
  publication: { state: "READY_FOR_PUBLISH_REVIEW" },
});

const step = (result: ReturnType<typeof evaluateProductOnboarding>, id: typeof PRODUCT_ONBOARDING_STEPS[number]) => result.steps.find((item) => item.id === id)!;

{
  const cjMedia = buildSupplierProductEnrichment({ supplier: "CJ", supplierSku: "VARIANT-SKU", supplierProductId: "PID-1", supplierVariantId: "VID-1", productName: "Product", variantName: "Product Black", primaryImageUrl: "https://supplier.example/variant.jpg", imageCandidates: ["https://supplier.example/product-gallery.jpg"], retrievedAt: "2026-11-07T00:00:00.000Z", mediaSourceType: "API", mediaAssociation: "EXACT_VARIANT", additionalMediaAssociation: "UNVERIFIED" });
  assert.equal(cjMedia.imageCandidates[0].association, "EXACT_VARIANT");
  assert.equal(cjMedia.imageCandidates[1].association, "UNVERIFIED");
  assert.equal(cjMedia.imageCandidates.every((candidate) => candidate.status === "REVIEW_REQUIRED"), true);
  assert.equal(cjMedia.imageCandidates[0].supplierVariantId, "VID-1");
  const scoopMedia = buildSupplierProductEnrichment({ supplier: "SCOOP", supplierSku: "SCOOP-1", productName: "Product", primaryImageUrl: "https://supplier.example/product.jpg", retrievedAt: "2026-11-07T00:00:00.000Z", mediaSourceType: "LIVE_FEED" });
  assert.equal(scoopMedia.imageCandidates[0].sourceType, "LIVE_FEED");
  assert.equal(scoopMedia.imageCandidates[0].reuseEligibility, "REVIEW_REQUIRED");
}

{
  const result = evaluateProductOnboarding(complete());
  assert.deepEqual(result.steps.map((item) => item.id), PRODUCT_ONBOARDING_STEPS);
  assert.equal(result.publicationEligible, true);
  assert.equal(result.blockers.length, 0);
  assert.equal(result.nextAction.id, "PUBLISH_PRODUCT");
  assert.equal(result.firstUnresolvedStep, "PUBLICATION");
  assert.equal(result.completedStepCount, 11);
  assert.equal(result.totalApplicableStepCount, 12);
}

{
  const workspace = readFileSync("src/components/admin/ProductConfigurationWorkspace.tsx", "utf8");
  assert.match(workspace, /onboarding-readiness/);
  assert.match(workspace, /productOnboardingSteps\.map/);
  assert.match(workspace, /Ingest approved URL/);
  assert.match(workspace, /Supplier media candidates/);
  assert.match(workspace, /publication-image\/upload/);
  assert.match(workspace, /Upload own image/);
  assert.match(workspace, /image" : "images"} · maximum 8/);
  assert.match(workspace, /Supplier candidates: \{candidates\.length\}/);
  assert.match(workspace, /Create new version to edit gallery/);
  assert.match(workspace, /createNewVersion\("MEDIA"\)/);
  assert.match(workspace, /Controlled Product gallery images/);
  assert.match(workspace, /aria-pressed=\{activeImage === image\}/);
  assert.match(workspace, /Move image \$\{index \+ 1\} left/);
  assert.match(workspace, /Move image \$\{index \+ 1\} right/);
  assert.match(workspace, /Ingest selected/);
  assert.match(workspace, /Ingest all eligible/);
  assert.match(workspace, /candidate\.reuseEligibility === "APPROVED_SOURCE"/);
  assert.match(workspace, /require individual staff review/);
  assert.match(workspace, /Maximum controlled gallery reached/);
  assert.match(workspace, /candidate\.association/);
  assert.match(workspace, /candidate\.reuseEligibility/);
  assert.match(workspace, /resolveProductOnboardingFocus/);
  assert.match(workspace, /next\.set\("step", step\)/);
  assert.match(workspace, /setSearchParams\(next, \{ replace: false \}\)/);
  assert.doesNotMatch(workspace, /const updateStep[\s\S]*?navigate\(`/);
  assert.match(workspace, /requestedStepRef\.current/);
  assert.match(workspace, /readinessRef\.current/);
  assert.match(workspace, /\[productId, requestedStep\]/);
  assert.match(workspace, /section\?\.scrollIntoView/);
  assert.match(workspace, /section\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(workspace, /tabIndex=\{-1\}/);
  assert.match(workspace, /aria-expanded=\{expanded\}/);
  assert.match(workspace, /aria-controls=\{`product-configuration-panel-/);
  assert.match(workspace, /role="region"/);
  assert.match(workspace, /aria-labelledby=\{`product-configuration-step-/);
  assert.match(workspace, /const nextActionLabel = readiness\?\.nextAction\.label/);
  assert.match(workspace, /nextAction\.id === "VIEW_STOREFRONT"/);
  assert.match(workspace, /nextAction\.id === "CREATE_NEW_VERSION"/);
  assert.match(workspace, /onClick=\{saveDraft\}/);
  assert.match(workspace, /Save draft before publishing/);
  assert.match(workspace, /publicationEligible/);
  assert.match(workspace, /hasStaffPermission/);
  assert.match(workspace, /PublishWorkspaceResponse/);
  assert.match(workspace, /setReadiness\(result\.readiness\)/);
  assert.match(workspace, /setReview\(result\.review\)/);
  assert.match(workspace, /publicationDraftIsDirty/);
  assert.match(workspace, /!review\?\.hasActiveDraft \|\| !persistedDraft/);
  assert.match(workspace, /setPersistedDraft\(nextReview\?\.hasActiveDraft \|\| nextReview\?\.state === "PUBLISHED" \? nextReview\.draft : undefined\)/);
  assert.match(workspace, /setPersistedDraft\(result\.review\.draft\)/);
  assert.match(workspace, /hasMaterialPublicationChanges/);
  assert.match(workspace, /tekcentral:product-readiness-updated/);
  assert.match(workspace, /publishIdempotencyKeyRef/);
  assert.match(workspace, /Public title/);
  assert.match(workspace, /Short description/);
  assert.match(workspace, /Long description/);
  assert.match(workspace, /SEO title/);
  assert.match(workspace, /Specifications/);
  assert.match(workspace, /Product documents/);
  assert.match(workspace, /publication-documents\/upload/);
  assert.match(workspace, /publication-documents\/import/);
  assert.match(workspace, /Create new version/);
  assert.match(workspace, /Restore as new version/);
  assert.match(workspace, /Unpublish Product/);
  assert.match(workspace, /Version history/);
  assert.match(workspace, /Review source-backed suggestions/);
  assert.match(workspace, /Generate pricing proposal/);
  assert.match(workspace, /Approve proposal/);
  assert.match(workspace, /Reject proposal/);
  assert.match(workspace, /Open full pricing review/);
  assert.match(workspace, /pricing\.view_supplier_cost/);
  assert.match(workspace, /pricing\.approve/);
  assert.equal(workspace.includes("/api/admin/pricing/products/${encodeURIComponent(productId)}/proposal"), true);
  assert.match(workspace, /Accept/);
  assert.match(workspace, /Ignore/);
  assert.match(workspace, /Delivery wording/);
  assert.match(workspace, /beforeunload/);
  assert.match(workspace, /You have unsaved Product changes/);
  assert.match(workspace, /Canonical category/);
  assert.match(workspace, /Canonical subcategory/);
  assert.match(workspace, /Canonical Product type/);
  assert.match(workspace, /Document candidates are never attached directly/);
  assert.match(workspace, /review\.availability\.state/);
  assert.doesNotMatch(workspace, /<Detail label="Availability">\{review\?\.internalSource\.availability/);
  assert.match(workspace, /canCreateVersion/);
  assert.match(workspace, /setError\(cause instanceof ApiError \? cause\.message/);
  assert.match(workspace, /setConfirmation\(undefined\)/);
  assert.doesNotMatch(workspace, /mutate\("publish"/);
  assert.doesNotMatch(workspace, /evaluateProductOnboarding/);

  const preview = readFileSync("src/pages/admin/AdminProductPublicationPreviewPage.tsx", "utf8");
  assert.match(preview, /productSetup=/);
  assert.doesNotMatch(preview, /Back to publication review/);

  const server = readFileSync("backend/server.ts", "utf8");
  assert.match(server, /sendJson\(response, 200, \{ version, publication, readiness, review \}\)/);
  assert.match(server, /publicationNewDraftMatch/);
  assert.match(server, /PRODUCT_DOCUMENT_UPLOADED/);
  assert.match(server, /PRODUCT_DOCUMENT_IMPORTED/);
  assert.match(server, /PRODUCT_VERSION_DRAFT_CREATED/);

  const publicationRepository = readFileSync("backend/productPublicationRepository.ts", "utf8");
  assert.match(publicationRepository, /consumeDraft: true/);
  assert.match(publicationRepository, /store\.drafts = \(store\.drafts \?\? \[\]\)\.filter/);
  assert.match(publicationRepository, /if \(existing\) return existing;/);
  assert.match(publicationRepository, /publishDraftInflight/);
  assert.match(publicationRepository, /if \(existingInflight\) return existingInflight/);
  assert.match(publicationRepository, /createPublicationDraftFromActiveVersion/);
  assert.match(publicationRepository, /ingestAndAssociatePublicationImage/);
  assert.match(publicationRepository, /existingControlledGallery/);
  assert.match(publicationRepository, /savePublicationDraft\(\{/);
  assert.match(publicationRepository, /getProductAvailability\(internalProductId\)/);
  assert.match(publicationRepository, /availability,/);

  const workspaceSource = readFileSync("src/components/admin/ProductConfigurationWorkspace.tsx", "utf8");
  assert.match(workspaceSource, /activeProductIdRef\.current = productId/);
  assert.match(workspaceSource, /setReadiness\(undefined\); setReview\(undefined\); setPricing\(undefined\); setDraft\(undefined\)/);
  assert.match(workspaceSource, /productLoading \|\| activeProductIdRef\.current !== productId/);
  assert.match(workspaceSource, /setSourceImageUrl\(""\)/);

  const onboardingService = readFileSync("backend/productOnboardingService.ts", "utf8");
  assert.match(onboardingService, /review\?\.availability\.freshness/);
  assert.match(onboardingService, /review\.availability\.state/);
  assert.match(publicationRepository, /snapshot: structuredClone\(active\.snapshot\)/);

  const productContent = readFileSync("backend/productContent.ts", "utf8");
  for (const documentType of ["DATASHEET", "COMPLIANCE_CERTIFICATE", "USER_MANUAL", "INSTALLATION_GUIDE", "WARRANTY_DOCUMENT", "BROCHURE", "SPECIFICATION_SHEET", "SAFETY_DOCUMENT", "OTHER"]) {
    assert.match(productContent, new RegExp(`\\b${documentType}\\b`));
  }

  const gallery = readFileSync("src/components/commerce/ProductGallery.tsx", "utf8");
  assert.match(gallery, /setSelectedImage\(url\)/);
  assert.match(gallery, /availableImages\.length > 1/);
  assert.match(gallery, /ProductGalleryViewer key=\{images\.join/);
  assert.match(gallery, /overflow-x-auto/);
  assert.match(gallery, /aria-pressed/);
  assert.match(gallery, /aria-current/);
  assert.match(gallery, /loading="lazy"/);
  assert.doesNotMatch(gallery, /apiRequest|fetch\(/);

  const enrichment = readFileSync("backend/supplierProductEnrichment.ts", "utf8");
  for (const field of ["supplierSku", "sourceType", "association", "discoveredAt", "candidateOrder", "reuseEligibility", "status"]) assert.match(enrichment, new RegExp(field));
  for (const sourceType of ["API", "LIVE_FEED", "DOWNLOAD_URL", "HTML", "MANUAL", "MEDIA_FEED"]) assert.match(enrichment, new RegExp(sourceType));

  for (const file of [
    "src/pages/admin/AdminScoopSupplierPage.tsx",
    "src/pages/admin/AdminSyntechSupplierPage.tsx",
    "src/pages/admin/AdminCjImportedProductsPage.tsx",
    "src/components/admin/TekCentralManualOffersWorkspace.tsx",
  ]) {
    const source = readFileSync(file, "utf8");
    if (file.includes("ScoopSupplier")) assert.match(source, /ScoopLaunchReadiness/);
    else assert.match(source, /ProductConfigurationLink/);
  }

  const scoop = readFileSync("src/pages/admin/AdminScoopSupplierPage.tsx", "utf8");
  assert.match(scoop, /selectedWorkflow\.onboarding/);
  assert.match(scoop, /productConfigurationHref/);
  assert.doesNotMatch(scoop, /launch steps complete/);
  const syntech = readFileSync("src/pages/admin/AdminSyntechSupplierPage.tsx", "utf8");
  assert.match(syntech, /navigate\(productConfigurationHref/);
  assert.match(syntech, /mapped\?\.productId/);
  assert.match(syntech, /Complete.*canonical category/s);
  const pricingPage = readFileSync("src/pages/admin/AdminPricingSettingsPage.tsx", "utf8");
  assert.match(pricingPage, /focusedProductId/);
  assert.match(pricingPage, /proposal\.productId === focusedProductId/);
  assert.match(pricingPage, /Back to Product configuration/);
  const cj = readFileSync("src/pages/admin/AdminCjSupplierPage.tsx", "utf8");
  assert.match(cj, /nextParams\.set\("productSetup", response\.product\.id\)/);
  const manual = readFileSync("src/components/admin/TekCentralManualOffersWorkspace.tsx", "utf8");
  assert.match(manual, /navigate\(productConfigurationHref/);
  assert.match(server, /onboarding = productOnboarding/);

  const supplierTable = readFileSync("src/components/admin/SupplierProductTable.tsx", "utf8");
  for (const primitive of ["SupplierProductIdentity", "SupplierMappingStatus", "SupplierProductReadiness", "SupplierAvailability", "SupplierCommercialEvidence", "SupplierProductNextAction"]) assert.match(supplierTable, new RegExp(`function ${primitive}`));
  assert.match(supplierTable, /readiness\.nextAction\.label/);
  assert.match(supplierTable, /readiness\.nextAction\.step/);
  assert.match(supplierTable, /TekCentral:/);
  assert.match(supplierTable, /Evidence:/);
  assert.match(supplierTable, /primaryTitle=\{supplierTitle\}/);
  assert.doesNotMatch(supplierTable, /evaluateProductOnboarding/);

  const scoopTable = readFileSync("src/components/admin/ScoopLaunchReadiness.tsx", "utf8");
  const cjImported = readFileSync("src/pages/admin/AdminCjImportedProductsPage.tsx", "utf8");
  for (const source of [scoopTable, syntech, cjImported, manual]) {
    assert.match(source, /SupplierProductReadiness/);
    assert.match(source, /SupplierProductNextAction/);
    assert.match(source, /SupplierAvailability/);
  }
  assert.match(cjImported, /minWidth=\{1760\}/);
  assert.doesNotMatch(cjImported, />Map</);
  assert.match(server, /canonicalAvailability/);
}

{
  const payload = { source: { commercial: { status: "CURRENT", cost: 125, currency: "ZAR" } }, internalSource: { supplierCostExVat: 125, grossMargin: 20 }, effectiveDealerCostExVat: 100, authoritativeCost: 90, normalizedCostZar: 1_700, totalStock: 12, branchStock: { CPT: 12 }, available: 10 };
  const redacted = redactAdminPayload(payload, { pathname: "/api/admin/products/product-1/publication", permissions: new Set(["products.read"]) }) as typeof payload;
  assert.equal(redacted.source.commercial.cost, undefined);
  assert.equal(redacted.internalSource.supplierCostExVat, undefined);
  assert.equal(redacted.effectiveDealerCostExVat, undefined);
  assert.equal(redacted.authoritativeCost, undefined);
  assert.equal(redacted.normalizedCostZar, undefined);
  assert.equal(redacted.totalStock, undefined);
  assert.equal(redacted.branchStock, undefined);
  assert.equal(redacted.available, undefined);
  const allowed = redactAdminPayload(payload, { pathname: "/api/admin/products/product-1/publication", permissions: new Set(["products.read", "suppliers.view_cost", "pricing.view_margin"]) }) as typeof payload;
  assert.equal(allowed.source.commercial.cost, 125);
  assert.equal(allowed.internalSource.supplierCostExVat, 125);
}
{
  const result = evaluateProductOnboarding({ ...complete(), mappingStatus: "MISSING" });
  assert.equal(step(result, "PRODUCT_MAPPING").state, "INCOMPLETE");
  assert.equal(result.firstUnresolvedStep, "PRODUCT_MAPPING");
  assert.equal(result.nextAction.id, "REVIEW_MAPPING");
  assert.equal(result.publicationEligible, false);
}
{
  const result = evaluateProductOnboarding({ ...complete(), taxonomyStatus: "MISSING" });
  assert.equal(result.firstUnresolvedStep, "TAXONOMY");
  assert.equal(result.nextAction.id, "COMPLETE_TAXONOMY");
}
{
  const result = evaluateProductOnboarding({ ...complete(), hasControlledPublicImage: false, legacyBlockers: ["CONTROLLED_IMAGE_REQUIRED"] });
  assert.equal(step(result, "MEDIA").state, "BLOCKED");
  assert.equal(result.blockers.filter((item) => item.code === "PUBLIC_IMAGE_MISSING").length, 1);
  assert.equal(result.nextAction.id, "ADD_PUBLIC_IMAGE");
  assert.equal(result.publicationEligible, false);
}
{
  const input = complete(); input.evidence = { ...input.evidence, logistics: { status: "MISSING" } };
  const result = evaluateProductOnboarding(input);
  assert.equal(result.firstUnresolvedStep, "LOGISTICS");
  assert.equal(result.nextAction.id, "COMPLETE_LOGISTICS");
}
{
  const result = evaluateProductOnboarding({ ...complete(), pricingStatus: "AWAITING_APPROVAL" });
  assert.equal(step(result, "PRICING").state, "NEEDS_REVIEW");
  assert.equal(result.nextAction.id, "REVIEW_PRICING");
  assert.equal(result.publicationEligible, false);
}
{
  const input = complete(); input.evidence = { ...input.evidence, sourceStatus: "STALE" };
  const result = evaluateProductOnboarding(input);
  assert.equal(result.firstUnresolvedStep, "SOURCE_EVIDENCE");
  assert.equal(result.nextAction.id, "REFRESH_SOURCE");
}
{
  const mustek = complete("MUSTEK");
  mustek.evidence = normalizeMustekOnboardingEvidence({ ...mustek.evidence, stock: { status: "UNKNOWN", freshness: "UNKNOWN" }, commercial: { status: "MISSING", cost: 15_699, currency: "ZAR" } });
  mustek.pricingStatus = "MISSING";
  mustek.launchStatus = "NOT_SELECTED";
  mustek.hasControlledPublicImage = false;
  mustek.previewAvailable = false;
  mustek.legacyBlockers = ["SOURCE_NOT_AVAILABLE", "PRICING_PROPOSAL_REQUIRED", "NOT_SELECTED"];
  const result = evaluateProductOnboarding(mustek);
  assert.equal(step(result, "SOURCE_EVIDENCE").state, "COMPLETE", "unsupported stock must not erase current source evidence");
  assert.equal(result.source.stock?.status, "UNKNOWN");
  assert.equal(step(result, "COMMERCIAL").state, "BLOCKED");
  assert.equal(step(result, "PRICING").state, "BLOCKED");
  assert.equal(step(result, "LAUNCH").state, "BLOCKED");
  assert.equal(step(result, "PREVIEW").state, "BLOCKED");
  assert.equal(step(result, "PUBLICATION").state, "BLOCKED");
}
{
  const missing = complete(); missing.evidence = { ...missing.evidence, sourceStatus: "UNKNOWN" }; missing.legacyBlockers = ["SOURCE_NOT_AVAILABLE"];
  const result = evaluateProductOnboarding(missing);
  assert.equal(step(result, "SOURCE_EVIDENCE").state, "BLOCKED");
  assert.equal(step(result, "SOURCE_EVIDENCE").blockers[0]?.code, "SOURCE_EVIDENCE_MISSING");
}
{
  const stale = complete(); stale.evidence = { ...stale.evidence, sourceStatus: "STALE" }; stale.legacyBlockers = ["SOURCE_NOT_AVAILABLE"];
  const result = evaluateProductOnboarding(stale);
  assert.equal(step(result, "SOURCE_EVIDENCE").state, "BLOCKED");
  assert.equal(step(result, "SOURCE_EVIDENCE").blockers[0]?.code, "SOURCE_EVIDENCE_STALE");
}
{
  const zeroStock = complete("SCOOP"); zeroStock.evidence = { ...zeroStock.evidence, stock: { status: "OUT_OF_STOCK", quantity: 0, freshness: "FRESH" } }; zeroStock.legacyBlockers = ["OFFER_UNAVAILABLE"];
  const result = evaluateProductOnboarding(zeroStock);
  assert.equal(step(result, "SOURCE_EVIDENCE").state, "COMPLETE", "authoritative zero stock must not imply missing source evidence");
  assert.equal(result.source.stock?.status, "OUT_OF_STOCK");
}
{
  const unsupportedStock = complete("SYNTECH"); unsupportedStock.evidence = { ...unsupportedStock.evidence, stock: { status: "UNKNOWN", freshness: "UNKNOWN" } }; unsupportedStock.legacyBlockers = ["SOURCE_NOT_AVAILABLE"];
  assert.equal(step(evaluateProductOnboarding(unsupportedStock), "SOURCE_EVIDENCE").state, "COMPLETE");
  unsupportedStock.mappingStatus = "MISSING";
  assert.equal(step(evaluateProductOnboarding(unsupportedStock), "PRODUCT_MAPPING").state, "INCOMPLETE");
}
{
  const result = evaluateProductOnboarding({ ...complete(), publication: { state: "PUBLISHED", storefrontTarget: "/product/product-1" } });
  assert.equal(result.alreadyPublished, true);
  assert.equal(result.nextAction.id, "VIEW_STOREFRONT");
  assert.equal(step(result, "PUBLICATION").state, "COMPLETE");
  const changed = evaluateProductOnboarding({ ...complete(), publication: { state: "PUBLISHED", hasUnpublishedChanges: true } });
  assert.equal(changed.nextAction.id, "CREATE_NEW_VERSION");
  assert.equal(result.completedStepCount, result.totalApplicableStepCount);
  assert.equal(result.firstUnresolvedStep, undefined);
  assert.equal(result.publicationEligible, false);
}
{
  const base = { supplierCode: "ignored", supplierSku: "SKU", sourceStatus: "CURRENT" as const, logistics: { status: "COMPLETE" as const }, commercial: { status: "CURRENT" as const } };
  assert.deepEqual([
    normalizeManualOnboardingEvidence(base), normalizeScoopOnboardingEvidence(base), normalizeSyntechOnboardingEvidence(base), normalizeCjOnboardingEvidence(base),
  ].map((item) => [item.supplierCode, item.sourceKind]), [["TEKCENTRAL", "MANUAL"], ["SCOOP", "FEED"], ["SYNTECH", "FEED"], ["CJ", "API"]]);
}
{
  const result = evaluateProductOnboarding({ ...complete(), mappingStatus: "MISSING", taxonomyStatus: "MISSING", hasControlledPublicImage: false });
  assert.equal(result.firstUnresolvedStep, "PRODUCT_MAPPING");
  assert.deepEqual(result.blockers.map((item) => item.step).slice(0, 3), ["PRODUCT_MAPPING", "TAXONOMY", "MEDIA"]);
}
{
  const input = complete(); input.evidence = { ...input.evidence, logistics: { status: "NOT_APPLICABLE" }, commercial: { status: "NOT_APPLICABLE" } }; input.pricingStatus = "NOT_APPLICABLE";
  const result = evaluateProductOnboarding(input);
  assert.equal(result.totalApplicableStepCount, 9);
  assert.equal(step(result, "LOGISTICS").state, "NOT_APPLICABLE");
  assert.equal(step(result, "COMMERCIAL").state, "NOT_APPLICABLE");
  assert.equal(step(result, "PRICING").state, "NOT_APPLICABLE");
}

console.log("Product onboarding tests passed.");

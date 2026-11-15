import assert from "node:assert/strict";
import { closePostgres, query } from "../persistence/postgres.js";
import { saveInternalProduct } from "../internalProductRepository.js";
import { listSupplierProductMappings, setSupplierProductMappingStatus } from "../supplierProductMappingRepository.js";
import { promoteCurrentTvrCatalogue } from "../suppliers/tvr/tvrCatalogueService.js";
import { suggestTvrExistingProductMapping, tvrIdentityEvidence } from "../suppliers/tvr/tvrProductOnboarding.js";
import type { TvrOfferEvidenceRow } from "../suppliers/tvr/tvrOfferNormalization.js";

if (process.env.RUN_TVR_MAPPING_POSTGRES_INTEGRATION !== "1") {
  console.log("TVR mapping PostgreSQL integration skipped (set RUN_TVR_MAPPING_POSTGRES_INTEGRATION=1). ");
} else {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !/_test(?:\?|$)/.test(new URL(databaseUrl).pathname)) throw new Error("TVR mapping integration requires an isolated *_test PostgreSQL database.");
  await query("TRUNCATE catalogue_product_mappings, catalogue_supplier_offers, catalogue_supplier_state, catalogue_products RESTART IDENTITY CASCADE");
  const now = new Date().toISOString();
  const row = (condition: "NEW" | "REMANUFACTURED", id: string, flags: string[]): TvrOfferEvidenceRow => ({
    id,
    supplierSku: `${condition}:PRO A620M-E`,
    rawIdentifier: "PRO A620M-E",
    normalizedIdentifier: "PRO A620M-E",
    sourceDescription: "MSI PRO A620M-E motherboard",
    condition,
    price: { raw: condition === "NEW" ? 1200 : 800, amount: condition === "NEW" ? 1200 : 800, currencyAuthority: "EXPLICIT", explicitCurrency: "ZAR", taxBasis: "UNKNOWN" },
    stock: { state: "AVAILABLE", rawType: "TEXT", raw: "In stock" },
    flags,
    workbookName: "TVR fixture.xlsx",
    worksheetName: condition === "NEW" ? "MSI" : "Remanufactured",
    sourceRow: condition === "NEW" ? 2 : 3,
    sourceCells: [],
    sourceNotes: [],
    rowClassification: "PRODUCT_ROW",
    sourceFingerprint: `fingerprint-${condition}`,
    groupClassification: "UNIQUE",
    profile: "COMMON_B_E",
    conditionCollision: true,
    sourceId: "tvr-commercial-workbook",
    sourceVersionId: "tvr-version-1",
    observedAt: now,
  });
  const evidence = [row("NEW", "evidence-new", []), row("REMANUFACTURED", "evidence-reman", ["3_MONTH_WARRANTY", "NO_ACCESSORIES"])];
  const firstPromotion = await promoteCurrentTvrCatalogue(evidence);
  assert.equal(firstPromotion.offers.length, 2);
  assert.deepEqual(tvrIdentityEvidence(firstPromotion.offers[0]).supplierProductId, "PRO A620M-E");

  const product = await saveInternalProduct({ slug: "msi-pro-a620m-e", sku: "TC-MSI-A620ME", name: "MSI PRO A620M-E Motherboard", brand: "MSI", category: "Computers", categorySlug: "computers", taxonomyStatus: "REVIEW_REQUIRED", shortDescription: "Controlled TVR mapping fixture.", images: [], publicationStatus: "INTERNAL_DRAFT", provenance: { createdFromSupplierOffer: true, sourceSupplier: "TVR", sourceSupplierOfferId: "fixture-existing-product-source", sourceSupplierSku: "PRO A620M-E", sourceDescription: "MSI PRO A620M-E motherboard" } });

  const suggestedNew = await suggestTvrExistingProductMapping({ offerIdentity: "NEW:PRO A620M-E", productId: product.id, confirmed: true, actor: "TVR Integration Staff" });
  assert.equal(suggestedNew.status, "SUGGESTED");
  assert.equal((await listSupplierProductMappings()).filter((item) => item.supplierCode === "TVR").length, 1, "Mapping one condition must not map another condition.");
  const verifiedNew = await setSupplierProductMappingStatus(suggestedNew.id!, "VERIFIED", { actor: "TVR Integration Staff", evidence: "Controlled exact identity fixture" });
  assert.equal(verifiedNew?.verifiedBy, "TVR Integration Staff");

  const suggestedReman = await suggestTvrExistingProductMapping({ offerIdentity: "REMANUFACTURED:PRO A620M-E", productId: product.id, confirmed: true, actor: "TVR Integration Staff" });
  const verifiedReman = await setSupplierProductMappingStatus(suggestedReman.id!, "VERIFIED", { actor: "TVR Integration Staff", evidence: "Controlled exact identity fixture" });
  const mappings = (await listSupplierProductMappings()).filter((item) => item.supplierCode === "TVR");
  assert.equal(mappings.length, 2);
  assert.equal(new Set(mappings.map((item) => item.supplierOfferId)).size, 2);
  assert.equal(new Set(mappings.map((item) => item.productId)).size, 1);
  assert.equal(verifiedReman?.evidence?.includes("3_MONTH_WARRANTY"), true);
  assert.equal(verifiedReman?.evidence?.includes("NO_ACCESSORIES"), true);

  const secondPromotion = await promoteCurrentTvrCatalogue(evidence);
  assert.equal(secondPromotion.unchanged, 2);
  const afterReconciliation = (await listSupplierProductMappings()).filter((item) => item.supplierCode === "TVR");
  assert.deepEqual(afterReconciliation.map((item) => [item.id, item.productId, item.status]).sort(), mappings.map((item) => [item.id, item.productId, item.status]).sort());
  assert.equal(Number((await query<{ count: number }>("SELECT count(*)::int AS count FROM catalogue_products")).rows[0].count), 1, "Condition differences must not duplicate the canonical Product.");
  await closePostgres();
  console.log("TVR mapping PostgreSQL integration tests passed.");
}

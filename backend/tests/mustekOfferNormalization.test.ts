import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeMustekOffers, normalizeMustekSupplierSku, type MustekEvidenceRow } from "../suppliers/mustek/mustekOfferNormalization.js";
import { normalizeMustekOnboardingEvidence } from "../productOnboarding.js";
import { normalizeCurrentMustekCatalogue } from "../suppliers/mustek/mustekCatalogueService.js";
import { redactAdminPayload } from "../adminResponseSecurity.js";
import { permissionForAdminRequest } from "../adminAuthorizationPolicy.js";
import { getMustekOnboardingPreview, suggestMustekExistingProductMapping } from "../suppliers/mustek/mustekProductOnboarding.js";
import { listSupplierProductMappings } from "../supplierProductMappingRepository.js";

const row = (overrides: Partial<MustekEvidenceRow> = {}): MustekEvidenceRow => ({ evidenceId: "e-1", sourceId: "acer", sourceVersionId: "v-1", sourceFingerprint: "source-1", supplierSku: " ac-100 ", sourceDescription: "Acer display", dealerCost: 100, currency: "ZAR", taxBasis: "UNKNOWN", workbookName: "Acer.xlsx", worksheetName: "Products", sourceRow: 2, observedAt: "2026-11-08T10:00:00.000Z", ...overrides });

assert.equal(normalizeMustekSupplierSku(" ab-100 "), "AB-100");
assert.equal(normalizeMustekSupplierSku("N/A"), undefined);
const safe = normalizeMustekOffers([row()], "2026-11-08T11:00:00.000Z");
assert.equal(safe.offers.length, 1); assert.equal(safe.offers[0].supplierIdentity, "MUSTEK:AC-100"); assert.equal(safe.offers[0].classification, "SAFE");
assert.equal(safe.offers[0].cost, 100); assert.equal(safe.offers[0].taxBasis, "UNKNOWN"); assert.equal(safe.offers[0].availability, "UNKNOWN"); assert.equal(safe.offers[0].mappingStatus, "UNMAPPED");
assert.equal("tekcentralProductId" in safe.offers[0], false);
const duplicate = normalizeMustekOffers([row(), row({ evidenceId: "e-2", sourceVersionId: "v-2", sourceFingerprint: "source-2", sourceRow: 9 })]);
assert.equal(duplicate.offers.length, 1); assert.equal(duplicate.offers[0].normalizedOfferFingerprint, safe.offers[0].normalizedOfferFingerprint); assert.equal(duplicate.offers[0].provenance.contributingEvidenceIds.length, 2);
const caseVariant = normalizeMustekOffers([row({ supplierSku: "TN-3607XXL" }), row({ evidenceId: "e-2", supplierSku: "Tn-3607XXL" })]); assert.equal(caseVariant.offers.length, 1); assert.equal(caseVariant.offers[0].supplierSku, "TN-3607XXL");
const conflict = normalizeMustekOffers([row(), row({ evidenceId: "e-2", dealerCost: 120 })]);
assert.equal(conflict.offers[0].classification, "CONFLICT"); assert.equal(conflict.offers[0].cost, undefined); assert.match(conflict.offers[0].reviewReasons.join(" "), /Conflicting/);
const missing = normalizeMustekOffers([row({ dealerCost: undefined })]); assert.equal(missing.offers[0].classification, "MISSING_COMMERCIAL_DATA"); assert.equal(missing.offers[0].cost, undefined);
const ambiguous = normalizeMustekOffers([row(), row({ evidenceId: "e-2", sourceDescription: "Different product" })]); assert.equal(ambiguous.offers[0].classification, "REVIEW_REQUIRED");
const brother = normalizeMustekOffers([row({ sourceLabel: "Brother November pricelist", workbookName: "Brother.xlsx" })]); assert.equal(brother.offers[0].classification, "REVIEW_REQUIRED");
const unresolved = normalizeMustekOffers([row({ supplierSku: "" })]); assert.equal(unresolved.offers.length, 0); assert.equal(unresolved.unresolvedEvidenceCount, 1);
const feed = normalizeMustekOnboardingEvidence({ supplierCode: "MUSTEK", sourceStatus: "CURRENT", provenance: {} }); assert.equal(feed.sourceKind, "FEED");
const stored = await normalizeCurrentMustekCatalogue([row()]); assert.equal(stored.created, 1); const repeated = await normalizeCurrentMustekCatalogue([row()]); assert.equal(repeated.offers.length, 1);
const redacted = redactAdminPayload({ products: safe.offers }, { pathname: "/api/admin/suppliers/mustek/products", permissions: new Set(["suppliers.read"]) }) as { products: Array<Record<string, unknown>> };
assert.equal("cost" in redacted.products[0], false); assert.equal(redacted.products[0].supplierSku, "AC-100");
assert.equal(permissionForAdminRequest("GET", "/api/admin/suppliers/mustek/products"), "suppliers.read");
assert.equal(permissionForAdminRequest("POST", "/api/admin/suppliers/mustek/catalogue/refresh"), "suppliers.refresh");
assert.equal(permissionForAdminRequest("POST", "/api/admin/suppliers/mustek/products/AC-100/mapping"), "suppliers.manage_mapping");
assert.equal(permissionForAdminRequest("POST", "/api/admin/suppliers/mustek/products/AC-100/create-product"), "products.create");

const originalCwd = process.cwd(); const isolated = await mkdtemp(join(tmpdir(), "mustek-mapping-"));
try {
  process.chdir(isolated);
  await normalizeCurrentMustekCatalogue([row({ supplierSku: "TC-LTP-14", sourceDescription: "14-inch Business Laptop", sourceBrand: "TekPro" })]);
  const preview = await getMustekOnboardingPreview("TC-LTP-14");
  assert.equal(preview.currentMapping, undefined);
  assert.equal(preview.productCandidates[0]?.product.id, "demo-laptop-pro-14");
  assert.equal((await listSupplierProductMappings()).some((mapping) => mapping.supplierCode === "MUSTEK"), false, "Candidate reads must not create mappings.");
  const suggested = await suggestMustekExistingProductMapping({ supplierSku: "TC-LTP-14", productId: "demo-laptop-pro-14", confirmed: true, actor: "Test staff" });
  assert.equal(suggested.status, "SUGGESTED");
  assert.equal(suggested.verifiedAt, undefined);
  assert.match(suggested.evidence?.join(" ") ?? "", /Offer classification SAFE/);
} finally { process.chdir(originalCwd); await rm(isolated, { recursive: true, force: true }); }
console.log("Mustek offer normalization tests passed.");

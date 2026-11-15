import assert from "node:assert/strict";
import { redactAdminPayload } from "../adminResponseSecurity.js";
import { permissionForAdminRequest } from "../adminAuthorizationPolicy.js";
import { normalizeTvrOffers, type TvrOfferEvidenceRow } from "../suppliers/tvr/tvrOfferNormalization.js";

const row = (overrides: Partial<TvrOfferEvidenceRow> = {}): TvrOfferEvidenceRow => ({
  id: "evidence-1", sourceId: "tvr-commercial-workbook", sourceVersionId: "version-1", observedAt: "2026-11-08T10:00:00.000Z",
  supplierSku: "NEW:PRO A620M-E", rawIdentifier: "PRO A620M-E", normalizedIdentifier: "PRO A620M-E", sourceDescription: "MSI PRO A620M-E motherboard",
  workbookName: "TVR DISTRIBUTION SHEETS", worksheetName: "MSI", sourceRow: 4, sourceCells: ["B4", "C4", "D4", "E4"], condition: "NEW",
  sourceNotes: [], flags: [], price: { raw: 1500, amount: 1500, sourceLabel: "Price Excl", currencyAuthority: "UNKNOWN", taxBasis: "UNKNOWN" }, stock: { raw: "In Stock", rawType: "TEXT", state: "AVAILABLE" },
  rowClassification: "PRODUCT_ROW", groupClassification: "UNIQUE", conditionCollision: false, sourceFingerprint: "source-fact-1", profile: "HEADERLESS_B_E", semanticUncertainty: "No reliable global price header.",
  ...overrides,
});

const result = normalizeTvrOffers([
  row(),
  row({ id: "evidence-2", sourceVersionId: "version-2", sourceRow: 8 }),
  row({ id: "evidence-reman", supplierSku: "REMANUFACTURED:PRO A620M-E", condition: "REMANUFACTURED", sourceDescription: "Reman MSI PRO A620M-E", price: { raw: 1100, amount: 1100, currencyAuthority: "UNKNOWN", taxBasis: "UNKNOWN" }, flags: ["3_MONTH_WARRANTY", "NO_ACCESSORIES"], conditionCollision: true }),
]);
assert.equal(result.offers.length, 2);
const current = result.offers.find((offer) => offer.condition === "NEW")!;
const reman = result.offers.find((offer) => offer.condition === "REMANUFACTURED")!;
assert.equal(current.supplierIdentity, "TVR:NEW:PRO A620M-E");
assert.equal(current.catalogueSupplierSku, "NEW:PRO A620M-E");
assert.equal(current.supplierSku, "PRO A620M-E");
assert.equal(current.provenance.contributingEvidenceIds.length, 2);
assert.equal(current.stockEvidence.observations.every((item) => !("quantity" in item)), true);
assert.equal(current.currency, "ZAR");
assert.equal(current.taxBasis, "EXCLUSIVE");
assert.equal(current.availability, "AVAILABLE");
assert.equal(current.priceMeaning, "DEALER_RESELLER_PURCHASE_COST");
assert.notEqual(current.supplierIdentity, reman.supplierIdentity);
assert.equal(reman.flags.includes("NO_ACCESSORIES"), true);

const duplicateFingerprint = normalizeTvrOffers([row({ id: "other-id", sourceVersionId: "later-version", sourceRow: 99, observedAt: "2027-01-01T00:00:00.000Z" })]).offers[0].normalizedOfferFingerprint;
assert.equal(duplicateFingerprint, normalizeTvrOffers([row()]).offers[0].normalizedOfferFingerprint);

const conflict = normalizeTvrOffers([row(), row({ id: "evidence-conflict", sourceDescription: "Different motherboard", price: { raw: 1600, amount: 1600, currencyAuthority: "UNKNOWN", taxBasis: "UNKNOWN" }, groupClassification: "CONFLICTING_FACTS" })]).offers[0];
assert.equal(conflict.classification, "CONFLICT");
assert.equal(conflict.description, undefined);
assert.equal(conflict.cost, undefined);
assert.equal(conflict.availability, "UNKNOWN");
assert.equal(conflict.factAlternatives?.descriptions.length, 2);

const inclusive = normalizeTvrOffers([row({ id: "inclusive", supplierSku: "NEW:PRICE", rawIdentifier: "PRICE", normalizedIdentifier: "PRICE", price: { raw: 115, amount: 115, sourceLabel: "Price", currencyAuthority: "UNKNOWN", taxBasis: "UNKNOWN" } })]).offers[0];
assert.equal(inclusive.taxBasis, "INCLUSIVE"); assert.equal(inclusive.cost, 115); assert.equal(inclusive.currency, "ZAR");
const refurb = normalizeTvrOffers([row({ id: "refurb", supplierSku: "REMANUFACTURED:REFURB", rawIdentifier: "REFURB", normalizedIdentifier: "REFURB", condition: "REMANUFACTURED", price: { raw: 230, amount: 230, sourceLabel: "Refurb Price", currencyAuthority: "UNKNOWN", taxBasis: "UNKNOWN" }, stock: { rawType: "MISSING", state: "UNKNOWN" }, flags: ["3_MONTH_WARRANTY", "NO_ACCESSORIES"] })]).offers[0];
assert.equal(refurb.taxBasis, "INCLUSIVE"); assert.equal(refurb.availability, "UNKNOWN"); assert.deepEqual(refurb.flags, ["3_MONTH_WARRANTY", "NO_ACCESSORIES"]);
const noStock = normalizeTvrOffers([row({ id: "none", supplierSku: "NEW:NONE", rawIdentifier: "NONE", normalizedIdentifier: "NONE", stock: { raw: "No stock", rawType: "TEXT", state: "OUT_OF_STOCK" } })]).offers[0];
assert.equal(noStock.availability, "OUT_OF_STOCK"); assert.equal("quantity" in noStock.stockEvidence, false);
const adata = normalizeTvrOffers([row({ id: "adata", supplierSku: "NEW:ADATA", rawIdentifier: "ADATA", normalizedIdentifier: "ADATA", worksheetName: "Adata", flags: ["PRICE_VOLATILITY_CONFIRMATION_REQUIRED"], semanticUncertainty: undefined })]).offers[0];
assert.equal(adata.classification, "SAFE"); assert.equal(adata.flags.includes("PRICE_VOLATILITY_CONFIRMATION_REQUIRED"), true);

const redacted = redactAdminPayload({ products: [current] }, { pathname: "/api/admin/suppliers/tvr/products", permissions: new Set(["suppliers.read"]) }) as { products: Array<Record<string, unknown>> };
assert.equal("cost" in redacted.products[0], false);
assert.equal("priceEvidence" in redacted.products[0], false);
const redactedConflict = redactAdminPayload({ products: [conflict] }, { pathname: "/api/admin/suppliers/tvr/products", permissions: new Set(["suppliers.read"]) }) as { products: Array<Record<string, unknown>> };
assert.equal("factAlternatives" in redactedConflict.products[0], false);
assert.equal("stockEvidence" in redacted.products[0], false);
const privateView = redactAdminPayload({ products: [current] }, { pathname: "/api/admin/suppliers/tvr/products", permissions: new Set(["suppliers.read", "suppliers.view_cost", "suppliers.view_private_stock"]) }) as { products: Array<Record<string, unknown>> };
assert.equal("cost" in privateView.products[0], true);
assert.equal("stockEvidence" in privateView.products[0], true);
assert.throws(() => normalizeTvrOffers([row({ condition: "BROKEN" as TvrOfferEvidenceRow["condition"] })]), /TVR_INVALID_CONDITION_IDENTITY/);
assert.equal(permissionForAdminRequest("GET", "/api/admin/suppliers/tvr/products"), "suppliers.read");
assert.equal(permissionForAdminRequest("POST", "/api/admin/suppliers/tvr/catalogue/refresh"), "suppliers.refresh");

console.log("TVR offer normalization tests passed");

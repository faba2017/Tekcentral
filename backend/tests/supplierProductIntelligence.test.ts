import assert from "node:assert/strict";
import type { InternalProduct } from "../internalProductRepository.js";
import type { SupplierProductMapping } from "../types.js";
import { findCanonicalProductCandidates, normalizeIdentityValue, requiresDuplicateOverride, suggestCanonicalProductIdentity } from "../supplierProductIntelligence.js";

const product = (overrides: Partial<InternalProduct> = {}): InternalProduct => ({
  id: "product-router", slug: "mikrotik-router-rb5009", sku: "TC-RB5009", name: "MikroTik RB5009UG+S+IN Router", brand: "MikroTik", model: "RB5009UG+S+IN", manufacturerPartNumber: "RB5009UG+S+IN", gtin: "4752224007148",
  category: "Networking", categorySlug: "networking", categoryId: "networking", subcategoryId: "routers", productTypeId: "wired-routers", shortDescription: "Canonical router", images: [], publicationStatus: "INTERNAL_DRAFT", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  provenance: { createdFromSupplierOffer: true, sourceSupplier: "SCOOP", sourceSupplierOfferId: "SCOOP-RB5009", sourceSupplierSku: "RB5009UG-S-IN", sourceDescription: "Supplier evidence" }, ...overrides,
});
const mapping = (overrides: Partial<SupplierProductMapping> = {}): SupplierProductMapping => ({ productId: "product-router", supplierCode: "SCOOP", supplierSku: "SCOOP-RB5009", status: "VERIFIED", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...overrides });
const products = [product()];

const exactMpn = await findCanonicalProductCandidates({ supplierCode: "SYNTECH", supplierSku: "SYN-RB", title: "Router", brand: "MikroTik Networks", manufacturerPartNumber: "RB5009UG+S+IN" }, { products, mappings: [] });
assert.equal(exactMpn[0].confidence, "EXACT"); assert.equal(exactMpn[0].automaticMappingAllowed, true); assert.match(exactMpn[0].evidence.join(" "), /part number/i);
const exactBarcode = await findCanonicalProductCandidates({ supplierCode: "CJ", supplierSku: "CJ-RB", gtin: "4752224007148" }, { products, mappings: [] });
assert.equal(exactBarcode[0].confidence, "EXACT"); assert.equal(exactBarcode[0].automaticMappingAllowed, true);
const verifiedHistory = await findCanonicalProductCandidates({ supplierCode: "SYNTECH", supplierSku: "SYN-RB", title: "Different supplier title" }, { products, mappings: [mapping({ supplierCode: "SYNTECH", supplierSku: "SYN-RB" })] });
assert.equal(verifiedHistory[0].confidence, "EXACT"); assert.match(verifiedHistory[0].evidence[0], /verified supplier identity/i);
const modelBrand = await findCanonicalProductCandidates({ supplierCode: "TEKCENTRAL", supplierSku: "MANUAL-RB", brand: "MikroTik", model: "RB5009UG+S+IN" }, { products, mappings: [] });
assert.equal(modelBrand[0].confidence, "HIGH"); assert.equal(modelBrand[0].automaticMappingAllowed, false);
const titleOnly = await findCanonicalProductCandidates({ supplierCode: "SCOOP", supplierSku: "TITLE-RB", title: "MikroTik RB5009UG+S+IN Router" }, { products, mappings: [] });
assert.equal(titleOnly[0].confidence, "LOW"); assert.equal(titleOnly[0].automaticMappingAllowed, false); assert.equal(requiresDuplicateOverride(titleOnly), false); assert.equal(requiresDuplicateOverride(modelBrand), true);

const suggestion = suggestCanonicalProductIdentity({ supplierCode: "SYNTECH", supplierSku: "SYN-RB", title: "  MIKROTIK   MIKROTIK RB5009 ROUTER!!!  ", brand: "mikrotik", manufacturerPartNumber: "RB5009UG+S+IN" }, products);
assert.equal(suggestion.suggestedBrand, "MikroTik"); assert.match(suggestion.suggestedTitle, /^MikroTik RB5009 ROUTER!/i); assert.match(suggestion.suggestedTitle, /RB5009UG\+S\+IN$/); assert.ok(suggestion.rulesApplied.length >= 2);
assert.equal(normalizeIdentityValue(" UGREEN—USB_C "), "ugreen usb c");

for (const supplierCode of ["SCOOP", "SYNTECH", "CJ", "TEKCENTRAL"] as const) {
  const candidates = await findCanonicalProductCandidates({ supplierCode, supplierSku: `${supplierCode}-RB`, brand: "MikroTik", model: "RB5009UG+S+IN" }, { products, mappings: [] });
  assert.equal(candidates[0].product.id, "product-router"); assert.equal(candidates[0].confidence, "HIGH");
}
console.log("Supplier Product intelligence tests passed.");

import { canonicalTaxonomyPath } from "../../canonicalTaxonomyService.js";
import { getAdminProductById, getProductCreatedFromOffer, listAdminProducts, saveInternalProduct } from "../../internalProductRepository.js";
import { findCanonicalProductCandidates, requiresDuplicateOverride, suggestCanonicalProductIdentity } from "../../supplierProductIntelligence.js";
import { listSupplierProductMappings, saveSupplierProductMapping } from "../../supplierProductMappingRepository.js";
import { getMustekCatalogueOffer } from "./mustekCatalogueService.js";

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function getMustekOnboardingPreview(supplierSku: string) {
  const offer = await getMustekCatalogueOffer(supplierSku);
  if (!offer) throw new Error("Mustek offer not found.");
  const [products, mappings] = await Promise.all([listAdminProducts(), listSupplierProductMappings()]);
  const currentMapping = mappings.find((item) => item.supplierCode === "MUSTEK" && item.supplierSku === offer.supplierSku && item.status !== "SUPERSEDED");
  const identity = { supplierCode: "MUSTEK" as const, supplierSku: offer.supplierSku, supplierProductId: offer.supplierSku, title: offer.description, brand: offer.brand };
  const productCandidates = await findCanonicalProductCandidates(identity, { products, mappings });
  return { offer, currentMapping, productCandidates: productCandidates.slice(0, 10), duplicateWarning: requiresDuplicateOverride(productCandidates), identitySuggestion: suggestCanonicalProductIdentity(identity, products) };
}

export async function suggestMustekExistingProductMapping(input: { supplierSku: string; productId: string; confirmed: boolean; actor?: string }) {
  if (!input.confirmed) throw new Error("Staff confirmation is required.");
  const [offer, product] = await Promise.all([getMustekCatalogueOffer(input.supplierSku), getAdminProductById(input.productId)]);
  if (!offer || !product) throw new Error("Mustek offer or TekCentral Product not found.");
  const existing = (await listSupplierProductMappings()).find((item) => item.supplierCode === "MUSTEK" && item.supplierSku === offer.supplierSku && item.status !== "SUPERSEDED");
  if (existing?.status === "VERIFIED" && existing.productId !== product.id) throw new Error("This Mustek offer is already verified against another Product.");
  const matches = await findCanonicalProductCandidates({ supplierCode: "MUSTEK", supplierSku: offer.supplierSku, supplierProductId: offer.supplierSku, title: offer.description, brand: offer.brand }, { products: [product] });
  const match = matches[0];
  return saveSupplierProductMapping({ id: existing?.id, productId: product.id, supplierCode: "MUSTEK", supplierSku: offer.supplierSku, supplierOfferId: offer.id, supplierProductId: offer.supplierSku, supplierProductSku: offer.supplierSku, status: "SUGGESTED", confidence: match ? match.score / 100 : 0, confidenceLevel: match?.confidence === "EXACT" ? "HIGH" : match?.confidence ?? "LOW", matchMethod: "STAFF_SELECTED_MUSTEK_OFFER", evidence: [...(match?.evidence ?? []), `Offer classification ${offer.classification}`, ...offer.reviewReasons], source: "MUSTEK_FEED" });
}

export async function createProductFromMustekOffer(input: { supplierSku: string; sku: string; name: string; brand: string; shortDescription: string; categoryId: string; subcategoryId?: string; productTypeId?: string; confirmed: boolean; duplicateOverrideConfirmed?: boolean; actor?: string }) {
  if (!input.confirmed) throw new Error("Staff confirmation is required.");
  const preview = await getMustekOnboardingPreview(input.supplierSku); const offer = preview.offer;
  const existing = await getProductCreatedFromOffer(offer.id);
  if (existing) return { product: existing, mapping: preview.currentMapping, reused: true as const };
  if (preview.duplicateWarning && !input.duplicateOverrideConfirmed) throw new Error("LIKELY_EXISTING_PRODUCT_REQUIRES_CONFIRMATION");
  const path = await canonicalTaxonomyPath(input);
  if (!path.category || path.category.status !== "ACTIVE" || input.subcategoryId && (!path.subcategory || path.subcategory.status !== "ACTIVE") || input.productTypeId && (!path.productType || path.productType.status !== "ACTIVE")) throw new Error("A valid active canonical taxonomy selection is required.");
  const now = new Date().toISOString();
  const product = await saveInternalProduct({ slug: slugify(input.name), sku: input.sku.trim().toUpperCase(), name: input.name.trim(), brand: input.brand.trim() || offer.brand || "Unbranded", category: path.category.name, categorySlug: path.category.slug, subcategory: path.subcategory?.name, categoryId: path.category.id, subcategoryId: path.subcategory?.id, productTypeId: path.productType?.id, taxonomyVersion: 1, taxonomyStatus: "VERIFIED", shortDescription: input.shortDescription.trim() || offer.description || input.name.trim(), images: [], publicationStatus: "INTERNAL_DRAFT", provenance: { createdFromSupplierOffer: true, sourceSupplier: "MUSTEK", sourceSupplierOfferId: offer.id, sourceSupplierSku: offer.supplierSku, sourceDescription: offer.description ?? offer.supplierSku, manufacturer: offer.brand } });
  const mapping = await saveSupplierProductMapping({ productId: product.id, supplierCode: "MUSTEK", supplierSku: offer.supplierSku, supplierOfferId: offer.id, supplierProductId: offer.supplierSku, supplierProductSku: offer.supplierSku, status: "VERIFIED", confidence: 1, confidenceLevel: "HIGH", matchMethod: "STAFF_CONFIRMED_PRODUCT_CREATION", evidence: [`Exact Mustek offer ${offer.id}`, `Offer classification ${offer.classification}`, ...offer.reviewReasons], verifiedBy: input.actor ?? "TekCentral Staff", verifiedAt: now, source: "MUSTEK_PRODUCT_ONBOARDING" });
  return { product, mapping, reused: false as const };
}

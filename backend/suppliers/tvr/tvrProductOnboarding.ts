import { canonicalTaxonomyPath } from "../../canonicalTaxonomyService.js";
import { getAdminProductById, getProductCreatedFromOffer, listAdminProducts, saveInternalProduct } from "../../internalProductRepository.js";
import { findCanonicalProductCandidates, requiresDuplicateOverride, suggestCanonicalProductIdentity } from "../../supplierProductIntelligence.js";
import { listSupplierProductMappings, saveSupplierProductMapping } from "../../supplierProductMappingRepository.js";
import { getTvrCatalogueOffer } from "./tvrCatalogueService.js";
import type { TvrNormalizedOffer } from "./tvrOfferNormalization.js";

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function tvrIdentityEvidence(offer: TvrNormalizedOffer) {
  const composite = offer.compositeIdentity;
  return {
    supplierCode: "TVR" as const,
    // Matching uses the real source-backed identity, never the condition-qualified database key.
    supplierSku: offer.normalizedSupplierSku,
    supplierProductId: offer.normalizedSupplierSku,
    title: offer.description,
    model: composite ? `${composite.normalizedIndoorModel} + ${composite.normalizedOutdoorModel}` : offer.normalizedSupplierSku,
  };
}

const mappingForOffer = async (offer: TvrNormalizedOffer) => (await listSupplierProductMappings()).find((item) =>
  item.supplierCode === "TVR" && item.supplierOfferId === offer.id && item.status !== "SUPERSEDED",
);

export async function getTvrOnboardingPreview(offerIdentity: string) {
  const offer = await getTvrCatalogueOffer(offerIdentity);
  if (!offer) throw new Error("TVR offer not found.");
  const [products, mappings] = await Promise.all([listAdminProducts(), listSupplierProductMappings()]);
  const currentMapping = mappings.find((item) => item.supplierCode === "TVR" && item.supplierOfferId === offer.id && item.status !== "SUPERSEDED");
  const identity = tvrIdentityEvidence(offer);
  const productCandidates = await findCanonicalProductCandidates(identity, { products, mappings });
  return {
    offer,
    currentMapping,
    productCandidates: productCandidates.slice(0, 10),
    duplicateWarning: requiresDuplicateOverride(productCandidates),
    identitySuggestion: suggestCanonicalProductIdentity(identity, products),
  };
}

export async function suggestTvrExistingProductMapping(input: { offerIdentity: string; productId: string; confirmed: boolean; actor?: string }) {
  if (!input.confirmed) throw new Error("Staff confirmation is required.");
  const [offer, product] = await Promise.all([getTvrCatalogueOffer(input.offerIdentity), getAdminProductById(input.productId)]);
  if (!offer || !product) throw new Error("TVR offer or TekCentral Product not found.");
  const existing = await mappingForOffer(offer);
  if (existing?.status === "VERIFIED" && existing.productId !== product.id) throw new Error("This TVR offer is already verified against another Product.");
  const match = (await findCanonicalProductCandidates(tvrIdentityEvidence(offer), { products: [product] }))[0];
  return saveSupplierProductMapping({
    id: existing?.id,
    productId: product.id,
    supplierCode: "TVR",
    supplierSku: offer.catalogueSupplierSku,
    supplierOfferId: offer.id,
    supplierProductId: offer.normalizedSupplierSku,
    supplierProductSku: offer.supplierSku,
    status: "SUGGESTED",
    confidence: match ? match.score / 100 : 0,
    confidenceLevel: match?.confidence === "EXACT" ? "HIGH" : match?.confidence ?? "LOW",
    matchMethod: "STAFF_SELECTED_TVR_OFFER",
    evidence: [
      ...(match?.evidence ?? []),
      `Raw TVR identity ${offer.supplierSku}`,
      `Commercial condition ${offer.condition}`,
      `Offer classification ${offer.classification}`,
      ...offer.flags,
      ...offer.reviewReasons,
      ...(offer.compositeIdentity ? [`Indoor model ${offer.compositeIdentity.rawIndoorModel}`, `Outdoor model ${offer.compositeIdentity.rawOutdoorModel}`] : []),
    ],
    source: "TVR_COMMERCIAL_WORKBOOK",
  });
}

export async function createProductFromTvrOffer(input: { offerIdentity: string; sku: string; name: string; brand: string; shortDescription: string; categoryId: string; subcategoryId?: string; productTypeId?: string; confirmed: boolean; duplicateOverrideConfirmed?: boolean; actor?: string }) {
  if (!input.confirmed) throw new Error("Staff confirmation is required.");
  const preview = await getTvrOnboardingPreview(input.offerIdentity);
  const offer = preview.offer;
  const existing = await getProductCreatedFromOffer(offer.id);
  if (existing) return { product: existing, mapping: preview.currentMapping, reused: true as const };
  if (preview.duplicateWarning && !input.duplicateOverrideConfirmed) throw new Error("LIKELY_EXISTING_PRODUCT_REQUIRES_CONFIRMATION");
  const path = await canonicalTaxonomyPath(input);
  if (!path.category || path.category.status !== "ACTIVE" || input.subcategoryId && (!path.subcategory || path.subcategory.status !== "ACTIVE") || input.productTypeId && (!path.productType || path.productType.status !== "ACTIVE")) throw new Error("A valid active canonical taxonomy selection is required.");
  const now = new Date().toISOString();
  const sourceDescription = offer.description ?? offer.supplierSku;
  const product = await saveInternalProduct({
    slug: slugify(input.name),
    sku: input.sku.trim().toUpperCase(),
    name: input.name.trim(),
    brand: input.brand.trim() || "Unbranded",
    model: offer.compositeIdentity ? `${offer.compositeIdentity.rawIndoorModel} + ${offer.compositeIdentity.rawOutdoorModel}` : offer.supplierSku,
    category: path.category.name,
    categorySlug: path.category.slug,
    subcategory: path.subcategory?.name,
    categoryId: path.category.id,
    subcategoryId: path.subcategory?.id,
    productTypeId: path.productType?.id,
    taxonomyVersion: 1,
    taxonomyStatus: "VERIFIED",
    shortDescription: input.shortDescription.trim() || sourceDescription,
    images: [],
    publicationStatus: "INTERNAL_DRAFT",
    provenance: {
      createdFromSupplierOffer: true,
      sourceSupplier: "TVR",
      sourceSupplierOfferId: offer.id,
      sourceSupplierSku: offer.supplierSku,
      sourceDescription,
      manufacturer: input.brand.trim() || undefined,
    },
  });
  const mapping = await saveSupplierProductMapping({
    productId: product.id,
    supplierCode: "TVR",
    supplierSku: offer.catalogueSupplierSku,
    supplierOfferId: offer.id,
    supplierProductId: offer.normalizedSupplierSku,
    supplierProductSku: offer.supplierSku,
    status: "VERIFIED",
    confidence: 1,
    confidenceLevel: "HIGH",
    matchMethod: "STAFF_CONFIRMED_PRODUCT_CREATION",
    evidence: [
      `Exact TVR offer ${offer.id}`,
      `Raw TVR identity ${offer.supplierSku}`,
      `Commercial condition ${offer.condition}`,
      `Offer classification ${offer.classification}`,
      ...offer.flags,
      ...offer.reviewReasons,
      ...(offer.compositeIdentity ? [`Indoor model ${offer.compositeIdentity.rawIndoorModel}`, `Outdoor model ${offer.compositeIdentity.rawOutdoorModel}`] : []),
    ],
    verifiedBy: input.actor ?? "TekCentral Staff",
    verifiedAt: now,
    source: "TVR_PRODUCT_ONBOARDING",
  });
  return { product, mapping, reused: false as const };
}

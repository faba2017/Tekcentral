import { getSupplierPolicySettings } from "../../businessSettingsRepository.js";
import { getAdminProductById, getProductCreatedFromOffer, saveInternalProduct, setInternalProductLaunchSelection } from "../../internalProductRepository.js";
import { findIngestedPublicImage, ingestPublicProductImage } from "../../publicImageIngestion.js";
import { listPricingProposals } from "../../pricingProposalRepository.js";
import { quantityAvailability, resolveProductAvailability } from "../../productAvailability.js";
import { canonicalTaxonomyPath } from "../../canonicalTaxonomyService.js";
import { getTekCentralManualOffer, mapTekCentralManualOffer, recordTekCentralManualProductCreated } from "./tekcentralManualOfferRepository.js";

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
async function taxonomy(input: { categoryId: string; subcategoryId?: string; productTypeId?: string }) { const {category,subcategory,productType}=await canonicalTaxonomyPath(input); if (!category || category.status!=="ACTIVE" || input.subcategoryId && (!subcategory||subcategory.status!=="ACTIVE") || input.productTypeId && (!productType||productType.status!=="ACTIVE")) throw new Error("A valid active canonical taxonomy selection is required."); return { category, subcategory, productType }; }

export async function createProductFromTekCentralManualOffer(input: { offerId: string; sku: string; name: string; brand: string; model?: string; manufacturerPartNumber?: string; ean?: string; shortDescription: string; longDescription?: string; categoryId: string; subcategoryId?: string; productTypeId?: string; imageSourceUrl?: string; selectForLaunch?: boolean; confirmed: boolean; actor?: string }) {
  if (!input.confirmed) throw new Error("Staff confirmation is required.");
  const offer = await getTekCentralManualOffer(input.offerId); if (!offer) throw new Error("Manual supplier offer not found.");
  const existing = await getProductCreatedFromOffer(offer.id); if (existing) return { product: existing, offer: await mapTekCentralManualOffer({ offerId: offer.id, productId: existing.id, actor: input.actor }), reused: true as const };
  const selected = await taxonomy(input); const name = input.name.trim(); const sku = input.sku.trim(); const brand = input.brand.trim(); const shortDescription = input.shortDescription.trim(); if (!name || !sku || !brand || !shortDescription) throw new Error("Product title, SKU, brand and short description are required.");
  const product = await saveInternalProduct({ slug: slugify(name), sku, name, brand, model: input.model?.trim() || undefined, manufacturerPartNumber: input.manufacturerPartNumber?.trim() || undefined, ean: input.ean?.replace(/\s+/g, "") || undefined, category: selected.category.label, categorySlug: selected.category.slug, subcategory: selected.subcategory?.label, categoryId: selected.category.id, subcategoryId: selected.subcategory?.id, productTypeId: selected.productType?.id, taxonomyVersion: 1, taxonomyStatus: "VERIFIED", shortDescription, description: input.longDescription?.trim() || undefined, images: [], publicationStatus: "INTERNAL_DRAFT", provenance: { createdFromSupplierOffer: true, sourceSupplier: "TEKCENTRAL", sourceSupplierOfferId: offer.id, sourceSupplierSku: offer.supplierSku, sourceDescription: name, manufacturer: brand } });
  const mapped = await recordTekCentralManualProductCreated(offer.id, product.id, input.actor);
  if (input.selectForLaunch) await setInternalProductLaunchSelection({ productId: product.id, state: "SELECTED_FOR_LAUNCH", actor: input.actor });
  const image = input.imageSourceUrl?.trim() ? await ingestPublicProductImage({ internalProductId: product.id, sourceUrl: input.imageSourceUrl.trim(), sourceType: "TEKCENTRAL_STAFF_SOURCE" }) : undefined;
  return { product: await getAdminProductById(product.id), offer: mapped, image, reused: false as const };
}

export async function getTekCentralManualProductReadiness(offerId: string, now = new Date()) {
  const offer = await getTekCentralManualOffer(offerId); if (!offer) throw new Error("Manual supplier offer not found.");
  const product = offer.productId ? await getAdminProductById(offer.productId) : undefined;
  const proposals = product ? (await listPricingProposals()).filter((item) => item.productId === product.id && item.supplierId === "TEKCENTRAL" && item.supplierOfferId === offer.id).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)) : [];
  const proposal = proposals[0]; const proposalMatchesCurrentCost = proposal?.costSnapshot.supplierCostExVat === offer.sourceCostExVat; const policy = await getSupplierPolicySettings(); const availability = resolveProductAvailability([{ state: quantityAvailability(offer.available) ?? "AVAILABILITY_UNKNOWN", quantity: offer.available, observedAt: offer.stockObservedAt, freshnessHours: policy.stockFreshnessHours, source: "TEKCENTRAL_MANUAL_STOCK" }], now);
  const controlledImage = product ? await findIngestedPublicImage({ internalProductId: product.id }) : undefined; const costStale = now.getTime() - Date.parse(offer.costObservedAt) > policy.sourcePriceFreshnessHours * 3_600_000;
  const contentReady = Boolean(product?.shortDescription.trim() && product.description?.trim());
  const blockers = [...(offer.mappingStatus !== "VERIFIED" || !product ? ["MAPPING_NOT_VERIFIED"] : []), ...(product?.taxonomyStatus !== "VERIFIED" ? ["TAXONOMY_NOT_VERIFIED"] : []), ...(!contentReady ? ["CONTENT_INCOMPLETE"] : []), ...(!controlledImage ? ["CONTROLLED_IMAGE_REQUIRED"] : []), ...(product && "launchSelection" in product && product.launchSelection?.state !== "SELECTED_FOR_LAUNCH" ? ["NOT_SELECTED"] : []), ...(costStale ? ["COST_EVIDENCE_STALE"] : []), ...(!proposal ? ["PRICING_PROPOSAL_REQUIRED"] : !proposalMatchesCurrentCost ? ["PRICING_REVIEW_REQUIRED"] : proposal.status !== "APPROVED" ? ["PRICING_APPROVAL_REQUIRED"] : []), ...(availability.freshness !== "FRESH" ? ["STOCK_EVIDENCE_STALE"] : []), ...(["OUT_OF_STOCK", "AVAILABILITY_UNKNOWN"].includes(availability.state) ? ["SOURCE_NOT_AVAILABLE"] : [])];
  return { status: blockers.length ? "NOT_READY" as const : "READY_FOR_PUBLISH_REVIEW" as const, blockers, offer, product, proposal, availability, controlledImage, costStale, contentStatus: !product?.shortDescription ? "CONTENT_MISSING" : contentReady ? "CONTENT_ENRICHED" : "CONTENT_BASIC" };
}

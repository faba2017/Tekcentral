import { getInternalProduct } from "./internalProductRepository.js";
import { getPublicationReview, getPublicationSummary } from "./productPublicationRepository.js";
import { listSupplierProductMappings } from "./supplierProductMappingRepository.js";
import {
  evaluateProductOnboarding,
  normalizeCjOnboardingEvidence,
  normalizeManualOnboardingEvidence,
  normalizeMustekOnboardingEvidence,
  normalizeTvrOnboardingEvidence,
  normalizeScoopOnboardingEvidence,
  normalizeSyntechOnboardingEvidence,
  type NormalizedSupplierEvidence,
  type ProductOnboardingContext,
  type SupplierEvidenceAdapterInput,
} from "./productOnboarding.js";
import { getMustekCatalogueOffer } from "./suppliers/mustek/mustekCatalogueService.js";
import { getTvrCatalogueOffer } from "./suppliers/tvr/tvrCatalogueService.js";

function adapterFor(supplierCode: string) {
  if (supplierCode === "SCOOP") return normalizeScoopOnboardingEvidence;
  if (supplierCode === "SYNTECH") return normalizeSyntechOnboardingEvidence;
  if (supplierCode === "CJ") return normalizeCjOnboardingEvidence;
  if (supplierCode === "TEKCENTRAL") return normalizeManualOnboardingEvidence;
  if (supplierCode === "MUSTEK") return normalizeMustekOnboardingEvidence;
  if (supplierCode === "TVR") return normalizeTvrOnboardingEvidence;
  return (input: SupplierEvidenceAdapterInput): NormalizedSupplierEvidence => ({ ...input, supplierCode, sourceKind: input.sourceKind ?? "API" });
}

function hasLegacy(blockers: string[], ...codes: string[]) {
  return blockers.some((value) => codes.some((code) => value === code || value.includes(code)));
}

export async function getProductOnboardingReadiness(productId: string) {
  const product = await getInternalProduct(productId);
  if (!product) throw new Error("Internal product not found.");
  const mappings = (await listSupplierProductMappings()).filter((mapping) => mapping.productId === productId && mapping.status !== "SUPERSEDED" && mapping.status !== "REJECTED");
  const mapping = mappings.find((item) => item.status === "VERIFIED") ?? mappings[0];
  const supplierCode = mapping?.supplierCode ?? product.provenance.sourceSupplier;
  const supplierSku = mapping?.supplierSku ?? product.provenance.sourceSupplierSku;
  const publication = await getPublicationSummary(productId);
  let review: Awaited<ReturnType<typeof getPublicationReview>> | undefined;
  try { review = await getPublicationReview(productId); } catch { review = undefined; }
  const legacyBlockers = review?.readiness.blockers ?? [];
  const stale = review?.availability.freshness === "STALE" || hasLegacy(legacyBlockers, "STALE");
  const unavailable = review?.availability.state === "OUT_OF_STOCK" || review?.availability.state === "DISCONTINUED" || hasLegacy(legacyBlockers, "OFFER_UNAVAILABLE", "SOURCE_NOT_AVAILABLE", "AUTHORITATIVE_COMMERCIAL_DATA_MISSING");
  const logisticsMissing = hasLegacy(legacyBlockers, "LOGISTICS_INCOMPLETE");
  const commercialMissing = hasLegacy(legacyBlockers, "AUTHORITATIVE_COMMERCIAL_DATA_MISSING");
  const commercialStale = hasLegacy(legacyBlockers, "COST_EVIDENCE_STALE", "PRICING_STALE");
  const mustekOffer = supplierCode === "MUSTEK" && supplierSku ? await getMustekCatalogueOffer(supplierSku) : undefined;
  const tvrOffer = supplierCode === "TVR" && mapping?.supplierOfferId ? await getTvrCatalogueOffer(mapping.supplierOfferId) : undefined;
  const evidence = adapterFor(supplierCode)({
    supplierCode,
    supplierSku,
    sourceProductId: mapping?.supplierProductId,
    sourceVariantId: mapping?.supplierVariantId,
    title: product.provenance.sourceDescription,
    description: product.provenance.sourceDescription,
    sourceCategory: product.provenance.sourceCategory?.sourceCategoryPath ?? product.provenance.sourceCategory?.sourceCategoryLabel,
    sourceStatus: mustekOffer || tvrOffer?.lifecycleStatus === "CURRENT" ? "CURRENT" : unavailable ? "UNAVAILABLE" : stale ? "STALE" : "CURRENT",
    stock: review ? { status: review.availability.state === "OUT_OF_STOCK" ? "OUT_OF_STOCK" : review.availability.state === "AVAILABILITY_UNKNOWN" || review.availability.state === "CHECK_REQUIRED" ? "UNKNOWN" : "AVAILABLE", quantity: review.availability.quantity, observedAt: review.availability.observedAt, freshness: review.availability.freshness } : undefined,
    logistics: { status: logisticsMissing ? "MISSING" : "COMPLETE", source: review?.internalSource.logisticsSource, observedAt: review?.internalSource.lastRefreshedAt },
    commercial: mustekOffer ? { status: "MISSING", cost: mustekOffer.cost, currency: mustekOffer.currency, observedAt: mustekOffer.observedAt } : tvrOffer ? { status: tvrOffer.lifecycleStatus !== "CURRENT" || tvrOffer.classification === "CONFLICT" || tvrOffer.cost === undefined || tvrOffer.currency !== "ZAR" || tvrOffer.taxBasis === "UNKNOWN" ? "MISSING" : commercialStale ? "STALE" : "CURRENT", cost: tvrOffer.cost, currency: tvrOffer.currency, observedAt: tvrOffer.observedAt, taxBasis: tvrOffer.taxBasis, priceMeaning: tvrOffer.priceMeaning } : { status: commercialMissing ? "MISSING" : commercialStale ? "STALE" : "CURRENT", cost: review?.internalSource.supplierCostExVat, currency: supplierCode === "CJ" ? undefined : "ZAR", observedAt: review?.internalSource.lastRefreshedAt },
    mediaCandidates: product.provenance.sourceImage?.originalUrl ? [product.provenance.sourceImage.originalUrl] : [],
    lastCheckedAt: tvrOffer?.observedAt ?? mustekOffer?.observedAt ?? review?.internalSource.lastRefreshedAt,
    provenance: mustekOffer ? { mappingId: mapping?.id, sourceSupplierOfferId: mustekOffer.id, evidenceCount: mustekOffer.provenance.contributingEvidenceIds.length, classification: mustekOffer.classification, normalizedOfferFingerprint: mustekOffer.normalizedOfferFingerprint } : tvrOffer ? { mappingId: mapping?.id, sourceSupplierOfferId: tvrOffer.id, evidenceCount: tvrOffer.provenance.contributingEvidenceIds.length, classification: tvrOffer.classification, condition: tvrOffer.condition, flags: tvrOffer.flags.join(", "), sourceVersionIds: tvrOffer.provenance.sourceVersionIds.join(", "), normalizedOfferFingerprint: tvrOffer.normalizedOfferFingerprint } : { mappingId: mapping?.id, sourceSupplierOfferId: product.provenance.sourceSupplierOfferId },
  });
  const pricingStatus: ProductOnboardingContext["pricingStatus"] = review?.currentApprovedProposal ? "APPROVED"
    : hasLegacy(legacyBlockers, "PRICING_NOT_APPROVED", "PRICING_APPROVAL_REQUIRED") ? "AWAITING_APPROVAL"
      : hasLegacy(legacyBlockers, "PRICING_STALE", "PRICING_REVIEW_REQUIRED") ? "STALE" : "MISSING";
  return evaluateProductOnboarding({
    evidence,
    product: { id: product.id, slug: product.slug, name: product.name, sku: product.sku },
    mappingStatus: mapping?.status === "VERIFIED" ? "VERIFIED" : mapping ? "NEEDS_REVIEW" : "MISSING",
    identityStatus: product.name.trim() && product.sku.trim() && product.slug.trim() ? "VERIFIED" : "MISSING",
    taxonomyStatus: product.taxonomyStatus === "VERIFIED" ? "VERIFIED" : product.taxonomyStatus ? "NEEDS_REVIEW" : "MISSING",
    contentStatus: review?.contentStatus === "CONTENT_ENRICHED" || review?.contentStatus === "CONTENT_BASIC" && Boolean(review.draft.shortDescription.trim()) ? "COMPLETE" : review ? "NEEDS_REVIEW" : product.shortDescription.trim() ? "NEEDS_REVIEW" : "MISSING",
    hasControlledPublicImage: Boolean(review?.image.publicImageUrl?.startsWith("/api/public/assets/products/")),
    pricingStatus,
    launchStatus: (review?.launchSelection.state ?? product.launchSelection?.state) === "SELECTED_FOR_LAUNCH" ? "SELECTED" : "NOT_SELECTED",
    previewAvailable: Boolean(review?.eligibility.canPublish),
    publication: { state: publication.state, hasUnpublishedChanges: review?.hasUnpublishedChanges, storefrontTarget: publication.slug ? `/product/${publication.slug}` : undefined },
    legacyBlockers,
  });
}

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getInternalProduct } from "./internalProductRepository.js";
import { listPricingProposals } from "./pricingProposalRepository.js";
import { listSupplierProductMappings } from "./supplierProductMappingRepository.js";
import { getScoopCatalogueProduct } from "./suppliers/scoop/scoopCatalogueRepository.js";
import { deriveScoopLaunchReadiness, latestScoopProposal } from "./suppliers/scoop/scoopLaunchReadiness.js";
import { getCjCatalogueProduct } from "./suppliers/cj/cjCatalogueRepository.js";
import { getCjVariantLaunchReadiness } from "./suppliers/cj/cjLaunchPipeline.js";
import { getSyntechCatalogueProduct } from "./suppliers/syntech/syntechCatalogueRepository.js";
import { getSyntechProductReadiness } from "./suppliers/syntech/syntechProductOnboarding.js";
import { getTekCentralManualProductReadiness } from "./suppliers/tekcentral/tekcentralManualProductOperations.js";
import { getTekCentralManualOffer } from "./suppliers/tekcentral/tekcentralManualOfferRepository.js";
import { getMustekCatalogueOffer } from "./suppliers/mustek/mustekCatalogueService.js";
import { getMustekProductEnrichment } from "./suppliers/mustek/mustekProductEnrichment.js";
import { getTvrCatalogueOffer } from "./suppliers/tvr/tvrCatalogueService.js";
import { getTvrProductEnrichment } from "./suppliers/tvr/tvrProductEnrichment.js";
import { ingestMustekPrivateMedia } from "./suppliers/mustek/mustekPrivateMediaIngestion.js";
import { ingestTvrWebsiteMedia } from "./suppliers/tvr/tvrMediaIngestion.js";
import { findIngestedPublicImage, ingestPublicProductImage, listIngestedPublicImages, productMediaId, removeIngestedPublicImage, uploadPublicProductImage, type ImageIngestionResult } from "./publicImageIngestion.js";
import { preparePublicationContentDefaults, type PublicationContentOrigins } from "./publicationContentDefaults.js";
import { hasMaterialPublicChanges } from "./publicationSnapshot.js";
import { deriveProductContentStatus, type PublicProductDocument, type PublicProductSpecification } from "./productContent.js";
import { manufacturerContentDocuments, productPhysicalSpecifications } from "./suppliers/scoop/scoopProductContent.js";
import { listFxPricingImpacts } from "./fxImpactRepository.js";
import { buildSupplierProductEnrichment } from "./supplierProductEnrichment.js";
import { getProductPolicySettings } from "./businessSettingsRepository.js";
import { buildProductAvailabilityIndex, getProductAvailability, type ProductAvailabilitySummary } from "./productAvailabilityService.js";
import { withCanonicalTaxonomy } from "./canonicalTaxonomyService.js";
import { normalizeProductImages, publicProductMedia, type PublicProductImage } from "../src/lib/product-media.js";
import { loadPersistenceConfig } from "./persistence/config.js";
import { readPublicationStore, replacePublicationStore } from "./persistence/catalogueRepository.js";
import { contentIntelligence, logisticsIntelligence, mediaIntelligence, pricingIntelligence } from "./productConfigurationIntelligence.js";
import { supplierProcurementDecision } from "./supplierProcurement.js";

export type PublicationState = "NOT_PUBLISHED" | "READY_FOR_PUBLISH_REVIEW" | "PUBLISHED" | "UNPUBLISHED";
export interface PublicProductSnapshot {
  id: string; slug: string; sku?: string; name: string; brand: string; model?: string;
  category: string; categorySlug: string; subcategory?: string; price: number; currency: "ZAR";
  shortDescription: string; description?: string; overview?: string; images: string[]; media?: PublicProductImage[];
  specifications: PublicProductSpecification[]; documents?: PublicProductDocument[]; seoTitle?: string; seoDescription?: string;
  deliveryDisplay?: string; vatRate: number; availabilityDisplay: string; stockPolicySnapshot: "AUTHORITATIVE_CURRENT_STOCK";
}
export interface PublicationVersion {
  id: string; version: number; internalProductId: string; createdAt: string; createdBy: string;
  status: "PUBLISHED"; publishedAt: string; publishedBy: string;
  pricingProposalId: string; mappingId: string; supplierCode: string; supplierSku: string;
  sourceReadinessSnapshot: { status: string; blockers: string[]; checkedAt: string };
  sourceMappingSnapshot: { mappingId: string; supplierCode: string; supplierSku: string; verifiedAt?: string };
  imageProvenance?: { originalUrl: string; sourceType: string; capturedAt: string; contentType: string; bytes: number };
  contentOrigins?: PublicationContentOrigins;
  previousVersionId?: string; rollbackSourceVersionId?: string; idempotencyKey: string;
  snapshot: PublicProductSnapshot;
}
export interface ProductPublication {
  internalProductId: string; state: Exclude<PublicationState, "READY_FOR_PUBLISH_REVIEW" | "NOT_PUBLISHED">;
  activeVersionId?: string; updatedAt: string; versions: PublicationVersion[];
}
export interface ProductPublicationDraft { internalProductId: string; snapshot: PublicProductSnapshot; contentOrigins?: PublicationContentOrigins; imageProvenance?: PublicationVersion["imageProvenance"]; savedAt: string; savedBy: string; }
export interface PublicationAuditEntry { id: string; internalProductId: string; action: "PUBLISHED" | "UNPUBLISHED" | "ROLLED_BACK"; actor: string; at: string; versionId?: string; }
export interface PublicationEligibility { canPublish: boolean; blockers: string[]; warnings: string[]; }
interface Store { version: 1; publications: ProductPublication[]; drafts?: ProductPublicationDraft[]; audit: PublicationAuditEntry[]; }
const path = () => resolve(process.cwd(), ".data", "product-publications.json");
const publishDraftInflight = new Map<string, Promise<PublicationVersion>>();
async function readStore(): Promise<Store> { if (loadPersistenceConfig().provider === "POSTGRES") return readPublicationStore<ProductPublication | ProductPublicationDraft | PublicationAuditEntry>() as unknown as Promise<Store>; try { const value = JSON.parse(await readFile(path(), "utf8")) as Store; return value.version === 1 && Array.isArray(value.publications) ? { ...value, drafts: value.drafts ?? [] } : { version: 1, publications: [], drafts: [], audit: [] }; } catch { return { version: 1, publications: [], drafts: [], audit: [] }; } }
async function writeStore(store: Store) { if (loadPersistenceConfig().provider === "POSTGRES") { await replacePublicationStore(store); return; } const target = path(); const temp = `${target}.tmp`; await mkdir(dirname(target), { recursive: true }); await writeFile(temp, JSON.stringify(store, null, 2)); await rename(temp, target); }
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function selectProductPublicationContext<T extends { readiness: { status: string; blockers: string[] }; proposal?: { status: string; generatedAt: string }; mapping: { updatedAt?: string } }>(contexts: T[]) {
  return [...contexts].sort((left, right) => {
    const score = (context: T) => (context.readiness.status === "READY_FOR_PUBLISH_REVIEW" ? 10_000 : 0)
      + (context.proposal?.status === "APPROVED" ? 1_000 : 0)
      - context.readiness.blockers.length * 10;
    return score(right) - score(left)
      || (right.proposal?.generatedAt ?? right.mapping.updatedAt ?? "").localeCompare(left.proposal?.generatedAt ?? left.mapping.updatedAt ?? "");
  })[0];
}
export function approvedPublicationPrice(proposal?: { status: string; proposedSellingPriceInclVat?: number }) {
  return proposal?.status === "APPROVED" && proposal.proposedSellingPriceInclVat !== undefined ? proposal.proposedSellingPriceInclVat : undefined;
}

/**
 * Source presence and purchase availability are separate publication facts.
 * A fresh canonical contribution proves a usable current source even when its
 * stock state is OUT_OF_STOCK or AVAILABILITY_UNKNOWN.
 */
export function publicationSourceAvailabilityBlockers(
  availability: Pick<ProductAvailabilitySummary, "usableOfferCount" | "freshOfferCount">,
) {
  return availability.usableOfferCount > 0 && availability.freshOfferCount > 0
    ? []
    : ["SOURCE_NOT_AVAILABLE"];
}

async function publicationContext(internalProductId: string) {
  const product = await getInternalProduct(internalProductId);
  if (!product) throw new Error("Internal product not found.");
  const verifiedMappings = (await listSupplierProductMappings()).filter((item) => item.productId === internalProductId && item.status === "VERIFIED");
  if (!verifiedMappings.length) throw new Error("A verified supplier mapping is required before publication.");
  const proposals = await listPricingProposals();
  const contexts = (await Promise.all(verifiedMappings.map(async (mapping) => {
    if (mapping.supplierCode === "SCOOP") {
      const offer = await getScoopCatalogueProduct(mapping.supplierSku);
      if (!offer) return undefined;
      const proposal = latestScoopProposal(proposals, offer.supplierSku, internalProductId);
      const supplierReadiness = deriveScoopLaunchReadiness({ product: offer, mapping, proposal });
      const readiness = product.launchSelection ? {
        ...supplierReadiness,
        blockers: product.launchSelection.state === "SELECTED_FOR_LAUNCH" ? supplierReadiness.blockers.filter((blocker) => blocker !== "NOT_SELECTED") : [...new Set(["NOT_SELECTED", ...supplierReadiness.blockers])],
      } : supplierReadiness;
      readiness.status = readiness.blockers.length ? "NOT_READY" : "READY_FOR_PUBLISH_REVIEW";
      return { supplier: "SCOOP" as const, product, mapping, offer, proposal, readiness };
    }
    if (mapping.supplierCode === "CJ" && mapping.supplierProductId && mapping.supplierVariantId) {
      const offer = await getCjCatalogueProduct(mapping.supplierProductId);
      const variant = offer?.variants.find((item) => item.supplierVariantId === mapping.supplierVariantId);
      if (!offer || !variant) return undefined;
      const readiness = await getCjVariantLaunchReadiness(offer, variant, mapping, product.launchSelection?.state);
      return { supplier: "CJ" as const, product, mapping, offer, variant, proposal: readiness.proposal, readiness };
    }
    if (mapping.supplierCode === "SYNTECH") {
      const offer = await getSyntechCatalogueProduct(mapping.supplierSku);
      if (!offer) return undefined;
      const readiness = await getSyntechProductReadiness(mapping.supplierSku);
      return { supplier: "SYNTECH" as const, product, mapping, offer, proposal: readiness.proposal, readiness };
    }
    if (mapping.supplierCode === "MUSTEK" && mapping.supplierOfferId) {
      const offer = await getMustekCatalogueOffer(mapping.supplierSku);
      if (!offer || offer.id !== mapping.supplierOfferId) return undefined;
      const proposal = proposals.filter((item) => item.productId === internalProductId && item.supplierId === "MUSTEK" && item.supplierOfferId === offer.id).sort((left, right) => right.generatedAt.localeCompare(left.generatedAt))[0];
      const blockers = [
        ...(product.taxonomyStatus !== "VERIFIED" ? ["TAXONOMY_NOT_VERIFIED"] : []),
        ...(product.launchSelection?.state !== "SELECTED_FOR_LAUNCH" ? ["NOT_SELECTED"] : []),
        ...(!proposal ? ["PRICING_PROPOSAL_REQUIRED"] : proposal.status !== "APPROVED" ? ["PRICING_APPROVAL_REQUIRED"] : []),
        "SOURCE_NOT_AVAILABLE",
      ];
      const readiness = { status: "NOT_READY" as const, blockers, availability: { state: "AVAILABILITY_UNKNOWN" as const } };
      return { supplier: "MUSTEK" as const, product, mapping, offer, proposal, readiness };
    }
    if (mapping.supplierCode === "TVR" && mapping.supplierOfferId) {
      const offer = await getTvrCatalogueOffer(mapping.supplierOfferId);
      if (!offer || offer.id !== mapping.supplierOfferId) return undefined;
      const proposal = proposals.filter((item) => item.productId === internalProductId && item.supplierId === "TVR" && item.supplierOfferId === offer.id).sort((left, right) => right.generatedAt.localeCompare(left.generatedAt))[0];
      const availability = await getProductAvailability(internalProductId);
      const blockers = [
        ...(product.taxonomyStatus !== "VERIFIED" ? ["TAXONOMY_NOT_VERIFIED"] : []),
        ...(product.launchSelection?.state !== "SELECTED_FOR_LAUNCH" ? ["NOT_SELECTED"] : []),
        ...(!proposal ? ["PRICING_PROPOSAL_REQUIRED"] : proposal.status !== "APPROVED" ? ["PRICING_APPROVAL_REQUIRED"] : []),
        ...publicationSourceAvailabilityBlockers(availability),
      ];
      const readiness = { status: blockers.length ? "NOT_READY" as const : "READY_FOR_PUBLISH_REVIEW" as const, blockers, availability: { state: availability.state } };
      return { supplier: "TVR" as const, product, mapping, offer, proposal, readiness };
    }
    if (mapping.supplierCode === "TEKCENTRAL" && mapping.supplierOfferId) {
      const offer = await getTekCentralManualOffer(mapping.supplierOfferId); if (!offer) return undefined;
      const readiness = await getTekCentralManualProductReadiness(offer.id);
      return { supplier: "TEKCENTRAL" as const, product, mapping, offer, proposal: readiness.proposal, readiness };
    }
    return undefined;
  }))).filter((context): context is NonNullable<typeof context> => Boolean(context));
  const viableContexts = contexts.filter((candidate) => supplierProcurementDecision(candidate.mapping.supplierCode).viable);
  const context = selectProductPublicationContext(viableContexts.length ? viableContexts : contexts);
  if (!context) throw new Error("Publication readiness is not available for any verified supplier mapping.");
  if (!supplierProcurementDecision(context.mapping.supplierCode).viable) {
    context.readiness.blockers = [...new Set([...context.readiness.blockers, "PROCUREMENT_PATH_UNAVAILABLE"])];
    context.readiness.status = "NOT_READY";
  }
  return context;
}

export async function getPublicationSummary(internalProductId: string) {
  const record = (await readStore()).publications.find((item) => item.internalProductId === internalProductId);
  if (record) { const active = record.versions.find((item) => item.id === record.activeVersionId); return { state: record.state as PublicationState, activeVersionId: record.activeVersionId, versionCount: record.versions.length, slug: active?.snapshot.slug, activePrice: active?.snapshot.price, activeImage: active?.snapshot.images.find((item) => item.startsWith("/api/public/assets/products/")) }; }
  try { const context = await publicationContext(internalProductId); return { state: (context.readiness.status === "READY_FOR_PUBLISH_REVIEW" ? "READY_FOR_PUBLISH_REVIEW" : "NOT_PUBLISHED") as PublicationState, versionCount: 0 }; }
  catch { return { state: "NOT_PUBLISHED" as PublicationState, versionCount: 0 }; }
}

export async function getPublicationReview(internalProductId: string) {
  const context = await publicationContext(internalProductId);
  const [store, fxImpacts, productPolicy, availability] = await Promise.all([readStore(), listFxPricingImpacts(), getProductPolicySettings(), getProductAvailability(internalProductId)]);
  const publication = store.publications.find((item) => item.internalProductId === internalProductId);
  const active = publication?.versions.find((item) => item.id === publication.activeVersionId);
  const approvedPrice = approvedPublicationPrice(context.proposal);
  const defaults: PublicProductSnapshot = active?.snapshot ?? {
    id: context.product.id, slug: context.product.slug, sku: context.product.sku, name: context.product.name,
    brand: context.product.brand, model: context.product.model, category: context.product.category,
    categorySlug: context.product.categorySlug, subcategory: context.product.subcategory,
    price: approvedPrice ?? 0, currency: "ZAR",
    shortDescription: context.product.shortDescription, description: context.product.description,
    images: context.product.images, specifications: [], vatRate: context.proposal?.vatRatePercent ?? 15,
    availabilityDisplay: "Current stock status", stockPolicySnapshot: "AUTHORITATIVE_CURRENT_STOCK",
  };
  const supplierSourceImageUrl = context.product.provenance.sourceImage?.originalUrl ?? active?.imageProvenance?.originalUrl ?? defaults.images[0];
  const storedImages = await listIngestedPublicImages(internalProductId);
  const storedImage = storedImages.find((item) => item.sourceImageUrl === supplierSourceImageUrl) ?? storedImages[0] ?? await findIngestedPublicImage({ internalProductId, sourceUrl: supplierSourceImageUrl?.startsWith("https://") ? supplierSourceImageUrl : undefined });
  const sourceImageUrl = storedImage?.sourceImageUrl ?? supplierSourceImageUrl;
  const existingControlledUrl = defaults.images[0]?.startsWith("/api/public/assets/products/") ? defaults.images[0] : undefined;
  const publicImageUrl = existingControlledUrl ?? storedImage?.publicUrl;
  const savedDraft = store.drafts?.find((item) => item.internalProductId === internalProductId);
  const existingControlledGallery = (savedDraft?.snapshot.images ?? active?.snapshot.images ?? []).filter((image) => image.startsWith("/api/public/assets/products/"));
  const controlledGallery = normalizeProductImages([...existingControlledGallery, ...storedImages.map((item) => item.publicUrl)]);
  const draftSource = savedDraft?.snapshot
    ? { ...savedDraft.snapshot, images: controlledGallery }
    : { ...defaults, images: controlledGallery.length ? controlledGallery : publicImageUrl ? [publicImageUrl] : [] };
  const prepared = preparePublicationContentDefaults({ product: context.product, draft: draftSource, origins: savedDraft?.contentOrigins ?? active?.contentOrigins });
  const draftImages = normalizeProductImages(prepared.draft.images);
  const draft = { ...prepared.draft, images: draftImages, media: publicProductMedia(prepared.draft.name, draftImages, prepared.draft.media), price: approvedPrice ?? prepared.draft.price };
  const descriptionImages = context.supplier === "CJ" ? [...(context.offer.description?.matchAll(/<img[^>]+src=["'](https:\/\/[^"']+)["']/gi) ?? [])].map((match) => match[1]) : [];
  const mustekEnrichment = context.supplier === "MUSTEK" ? await getMustekProductEnrichment(internalProductId) : undefined;
  const tvrEnrichment = context.supplier === "TVR" ? await getTvrProductEnrichment(internalProductId) : undefined;
  const generatedSupplierEnrichment = context.supplier === "CJ"
    ? buildSupplierProductEnrichment({ supplier: "CJ", supplierSku: context.mapping.supplierSku, supplierProductId: context.offer.supplierProductId, supplierVariantId: context.variant.supplierVariantId, productName: context.offer.supplierProductName, variantName: context.variant.name, brand: context.offer.brand ?? context.product.brand, description: context.offer.description, category: context.product.category, subcategory: context.product.subcategory, attributes: context.variant.attributes, primaryImageUrl: context.variant.imageUrl ?? context.offer.imageUrl, imageCandidates: descriptionImages, retrievedAt: context.offer.lastSuccessfulRefreshAt ?? context.offer.lastFetchedAt ?? context.offer.importedAt, sourceFingerprint: context.variant.rawSourceFingerprint ?? context.offer.rawSourceFingerprint, mediaSourceType: "API", mediaAssociation: context.variant.imageUrl ? "EXACT_VARIANT" : "PRODUCT", additionalMediaAssociation: "UNVERIFIED", mediaReuseEligibility: "REVIEW_REQUIRED" })
    : context.supplier === "SCOOP"
    ? buildSupplierProductEnrichment({ supplier: "SCOOP", supplierSku: context.offer.supplierSku, productName: context.offer.description, brand: context.offer.manufacturer, description: context.product.provenance.sourceDescription, category: context.product.category, subcategory: context.product.subcategory, primaryImageUrl: context.offer.imageUrl, retrievedAt: context.offer.lastSyncedAt, mediaSourceType: "LIVE_FEED", mediaReuseEligibility: "REVIEW_REQUIRED" })
    : context.supplier === "SYNTECH"
    ? buildSupplierProductEnrichment({ supplier: "SYNTECH", supplierSku: context.offer.supplierSku, supplierProductId: context.offer.supplierSku, productName: context.offer.name ?? context.offer.supplierSku, brand: context.offer.brand, description: context.offer.description ?? context.offer.shortDescription, category: context.product.category, subcategory: context.product.subcategory, attributes: Object.fromEntries(context.offer.attributes.map((item) => [item.key, item.value])), primaryImageUrl: context.offer.featuredImage, imageCandidates: context.offer.additionalImages, retrievedAt: context.offer.observedAt, sourceFingerprint: context.offer.sourceFingerprint, mediaSourceType: "LIVE_FEED", mediaReuseEligibility: "REVIEW_REQUIRED" })
    : context.supplier === "MUSTEK"
    ? mustekEnrichment?.enrichment
    : context.supplier === "TVR"
    ? tvrEnrichment?.status === "RESOLVED" ? tvrEnrichment.enrichment : undefined
    : buildSupplierProductEnrichment({ supplier: "TEKCENTRAL", supplierSku: context.mapping.supplierSku, supplierProductId: context.offer.id, productName: context.product.name, brand: context.product.brand, description: context.product.description ?? context.product.shortDescription, category: context.product.category, subcategory: context.product.subcategory, retrievedAt: context.offer.updatedAt, sourceFingerprint: context.offer.sourceFingerprint, mediaSourceType: "MANUAL", mediaAssociation: "PRODUCT", mediaReuseEligibility: "APPROVED_SOURCE" });
  if (generatedSupplierEnrichment) generatedSupplierEnrichment.imageCandidates = mediaIntelligence(await Promise.all(generatedSupplierEnrichment.imageCandidates.map(async (candidate) => {
    const sourceReference = candidate.url ?? `private-supplier-evidence://${candidate.id}`;
    return { ...candidate, status: await findIngestedPublicImage({ internalProductId, sourceUrl: sourceReference }) ? "INGESTED" as const : candidate.status };
  })), storedImages.map((item)=>item.sourceImageUrl));
  const supplierEnrichment = productPolicy.supplierEnrichmentEnabled && generatedSupplierEnrichment
    ? { ...generatedSupplierEnrichment, ...(productPolicy.seoSuggestionsEnabled ? {} : { seoTitle: undefined, seoDescription: undefined }) }
    : undefined;
  const overviewOrigin = prepared.origins.overview === "SOURCE_DERIVED" ? "APPROVED_SOURCE_DERIVED" : prepared.origins.overview;
  const contentStatus = deriveProductContentStatus({ overview: draft.overview ?? draft.description, overviewOrigin, specifications: draft.specifications, documents: draft.documents });
  const eligibility = derivePublicationEligibility({
    draft,
    readinessStatus: context.readiness.status,
    readinessBlockers: context.readiness.blockers,
    hasApprovedPrice: context.proposal?.status === "APPROVED" && context.proposal.proposedSellingPriceInclVat !== undefined,
    publicImageUrl: draft.images[0]?.startsWith("/api/public/assets/products/") ? draft.images[0] : publicImageUrl,
    contentStatus,
    minimumContentState: productPolicy.minimumContentState,
  });
  const productProposals=(await listPricingProposals()).filter((item)=>item.productId===internalProductId).sort((a,b)=>b.generatedAt.localeCompare(a.generatedAt));
  const fxImpact=fxImpacts.find((item) => item.productId === internalProductId && (item.classification === "REVIEW" || item.classification === "CRITICAL"));
  const logisticsEvidence = "evidence" in context.readiness ? context.readiness.evidence.logistics : undefined;
  const rawLogisticsObservedAt = logisticsEvidence && "observedAt" in logisticsEvidence
    ? logisticsEvidence.observedAt
    : logisticsEvidence && "capturedAt" in logisticsEvidence
      ? logisticsEvidence.capturedAt
      : undefined;
  const logisticsObservedAt = typeof rawLogisticsObservedAt === "string" ? rawLogisticsObservedAt : undefined;
  const logisticsWeightKnown = logisticsEvidence && "weightGrams" in logisticsEvidence ? logisticsEvidence.weightGrams !== undefined : undefined;
  const logisticsDimensionsKnown = logisticsEvidence && "lengthMm" in logisticsEvidence
    ? logisticsEvidence.lengthMm !== undefined && logisticsEvidence.widthMm !== undefined && logisticsEvidence.heightMm !== undefined
    : undefined;
  const logisticsSource = typeof logisticsEvidence?.source === "string" ? logisticsEvidence.source : undefined;
  const intelligence={
    content:supplierEnrichment?contentIntelligence(supplierEnrichment,{name:draft.name,shortDescription:draft.shortDescription,description:draft.description,specifications:draft.specifications}):[],
    media:generatedSupplierEnrichment?.imageCandidates ?? [],
    logistics:logisticsIntelligence({status:logisticsEvidence?.status,source:logisticsSource,observedAt:logisticsObservedAt,freshness:availability.freshness,weightKnown:logisticsWeightKnown,dimensionsKnown:logisticsDimensionsKnown}),
    pricing:pricingIntelligence({proposals:productProposals,approvedPrice,fxImpact}),
  };
  return {
    state: publication?.state ?? (context.readiness.status === "READY_FOR_PUBLISH_REVIEW" ? "READY_FOR_PUBLISH_REVIEW" : "NOT_PUBLISHED"),
    readiness: context.readiness, launchSelection: context.product.launchSelection ?? { state: "NOT_SELECTED" as const }, currentApprovedProposal: context.proposal?.status === "APPROVED" ? { id: context.proposal.id, price: context.proposal.proposedSellingPriceInclVat } : undefined,
    draft,
    draftSavedAt: savedDraft?.savedAt,
    image: { sourceImageUrl, publicImageUrl, provenance: storedImage?.provenance ?? active?.imageProvenance, gallery: storedImages.map((item) => ({ mediaId: productMediaId(internalProductId, item.publicUrl), publicUrl: item.publicUrl, sourceImageUrl: item.sourceImageUrl, provenance: item.provenance })) },
    contentOrigins: prepared.origins,
    contentStatus,
    supplierEnrichment,
    contentSuggestions: context.supplier === "SCOOP" ? {
      specifications: [...productPhysicalSpecifications(context.offer), ...((context.offer.capturedContentSuggestions?.specifications ?? []) as PublicProductSpecification[])],
      documents: [...manufacturerContentDocuments(context.offer), ...((context.offer.capturedContentSuggestions?.documents ?? []) as PublicProductDocument[])],
    } : context.supplier === "CJ" ? {
      specifications: Object.entries(context.variant.attributes ?? {}).map(([name, value]) => ({ name, value, group: "Selected variant", source: "CJ variant", origin: "SOURCE_DERIVED" as const })),
      documents: [],
    } : context.supplier === "SYNTECH" ? {
      specifications: context.offer.attributes.map((item) => ({ name: item.key, value: item.value, group: "Product details", source: "Syntech feed", origin: "SOURCE_DERIVED" as const })),
      documents: [],
    } : context.supplier === "MUSTEK" ? {
      specifications: [],
      documents: [],
    } : { specifications: [], documents: [] },
    availability,
    eligibility,
    hasActiveDraft: Boolean(savedDraft),
    fxImpact,
    intelligence,
    hasUnpublishedChanges: active ? hasMaterialPublicChanges(draft, active.snapshot) : true,
    activeVersionId: publication?.activeVersionId, versions: publication?.versions ?? [],
    audit: store.audit.filter((item) => item.internalProductId === internalProductId),
    internalSource: context.supplier === "SCOOP"
      ? { supplierCode: context.mapping.supplierCode, supplierSku: context.offer.supplierSku, mappingId: context.mapping.id, pricingProposalId: context.proposal?.id, supplierCostExVat: context.proposal?.costSnapshot.supplierCostExVat, grossProfit: context.proposal?.grossProfit, grossMarginPercent: context.proposal?.grossMarginPercent, availability: context.offer.availability, lastRefreshedAt: context.offer.lastSyncedAt, stockSource: context.offer.sourceObservations.find((item) => item.active)?.sourceType, logisticsSource: context.offer.logisticsMetadata?.source }
      : context.supplier === "CJ"
      ? { supplierCode: context.mapping.supplierCode, supplierSku: context.mapping.supplierSku, mappingId: context.mapping.id, pricingProposalId: context.proposal?.id, supplierCostExVat: context.proposal?.costSnapshot.supplierCostExVat ?? context.proposal?.costSnapshot.landedCostExVat, grossProfit: context.proposal?.grossProfit, grossMarginPercent: context.proposal?.grossMarginPercent, availability: context.variant.stockTotal === undefined ? "UNKNOWN" : context.variant.stockTotal > 0 ? "AVAILABLE" : "OUT_OF_STOCK", lastRefreshedAt: context.offer.lastSuccessfulRefreshAt, stockSource: "CJ_VARIANT", logisticsSource: context.readiness.evidence.logistics.source }
      : context.supplier === "SYNTECH"
      ? { supplierCode: context.mapping.supplierCode, supplierSku: context.mapping.supplierSku, mappingId: context.mapping.id, pricingProposalId: context.proposal?.id, supplierCostExVat: context.proposal?.costSnapshot.supplierCostExVat, grossProfit: context.proposal?.grossProfit, grossMarginPercent: context.proposal?.grossMarginPercent, availability: context.readiness.availability.state, lastRefreshedAt: context.offer.observedAt, stockSource: "SYNTECH_BRANCH_STOCK", logisticsSource: "SUPPLIER_FEED" }
      : context.supplier === "MUSTEK"
      ? { supplierCode: context.mapping.supplierCode, supplierSku: context.mapping.supplierSku, mappingId: context.mapping.id, pricingProposalId: context.proposal?.id, supplierCostExVat: undefined, grossProfit: undefined, grossMarginPercent: undefined, availability: "UNKNOWN", lastRefreshedAt: context.offer.observedAt, stockSource: undefined, logisticsSource: undefined }
      : context.supplier === "TVR"
      ? { supplierCode: context.mapping.supplierCode, supplierSku: context.mapping.supplierSku, mappingId: context.mapping.id, pricingProposalId: context.proposal?.id, supplierCostExVat: undefined, grossProfit: undefined, grossMarginPercent: undefined, availability: "UNKNOWN", lastRefreshedAt: context.offer.observedAt, stockSource: undefined, logisticsSource: undefined }
      : { supplierCode: context.mapping.supplierCode, supplierSku: context.mapping.supplierSku, mappingId: context.mapping.id, pricingProposalId: context.proposal?.id, supplierCostExVat: context.proposal?.costSnapshot.supplierCostExVat, grossProfit: context.proposal?.grossProfit, grossMarginPercent: context.proposal?.grossMarginPercent, availability: context.readiness.availability.state, lastRefreshedAt: context.offer.stockObservedAt, stockSource: "TEKCENTRAL_MANUAL_STOCK", logisticsSource: "INTERNAL_MANUAL" },
  };
}

export async function savePublicationDraft(input: { internalProductId: string; snapshot: PublicProductSnapshot; contentOrigins?: PublicationContentOrigins; imageProvenance?: PublicationVersion["imageProvenance"]; actor?: string }) {
  await publicationContext(input.internalProductId);
  validateSnapshot({ ...input.snapshot, documents: input.snapshot.documents ?? [] }, false);
  const store = await readStore(); const now = new Date().toISOString();
  const images = normalizeProductImages(input.snapshot.images); const snapshot = { ...input.snapshot, images, media: publicProductMedia(input.snapshot.name, images, input.snapshot.media) };
  const draft: ProductPublicationDraft = { internalProductId: input.internalProductId, snapshot, contentOrigins: input.contentOrigins, imageProvenance: input.imageProvenance, savedAt: now, savedBy: input.actor?.trim() || "Admin staff" };
  store.drafts = [...(store.drafts ?? []).filter((item) => item.internalProductId !== input.internalProductId), draft];
  await writeStore(store); return draft;
}

export async function associatePublicationImage(input: { internalProductId: string; actor?: string }, ingested: ImageIngestionResult) {
  const before = await getPublicationReview(input.internalProductId);
  const existingControlled = before.draft.images.filter((image) => image.startsWith("/api/public/assets/products/"));
  const images = normalizeProductImages(existingControlled.length ? [...existingControlled, ingested.publicUrl] : [ingested.publicUrl]);
  const draft = await savePublicationDraft({
    internalProductId: input.internalProductId,
    snapshot: { ...before.draft, images, media: publicProductMedia(before.draft.name, images, before.draft.media) },
    contentOrigins: before.contentOrigins,
    imageProvenance: before.image.provenance ?? ingested.provenance,
    actor: input.actor,
  });
  return { image: ingested, draft, review: await getPublicationReview(input.internalProductId) };
}

export async function ingestAndAssociatePublicationImage(input: { internalProductId: string; sourceUrl: string; sourceType: string; actor?: string }, fetcher: typeof fetch = fetch) {
  const ingested = await ingestPublicProductImage({ internalProductId: input.internalProductId, sourceUrl: input.sourceUrl, sourceType: input.sourceType }, fetcher);
  return associatePublicationImage(input, ingested);
}

export async function uploadAndAssociatePublicationImage(input: { internalProductId: string; filename: string; mimeType: string; base64: string; actor?: string }) {
  const ingested = await uploadPublicProductImage(input);
  return associatePublicationImage(input, ingested);
}

export async function ingestAndAssociatePrivateMustekImage(input: { internalProductId: string; candidateId: string; actor?: string }) {
  const ingested = await ingestMustekPrivateMedia(input);
  return associatePublicationImage(input, ingested);
}

export async function ingestAndAssociateTvrWebsiteImage(input: { internalProductId: string; candidateId: string; actor?: string }) {
  const ingested = await ingestTvrWebsiteMedia(input);
  if (ingested.internalProductId !== input.internalProductId) throw new Error("TVR_MEDIA_PRODUCT_MISMATCH");
  return associatePublicationImage(input, ingested);
}

export async function removePublicationMedia(input: { internalProductId: string; mediaId: string; actor?: string }) {
  const before = await getPublicationReview(input.internalProductId);
  const records = await listIngestedPublicImages(input.internalProductId);
  const record = records.find((item) => productMediaId(input.internalProductId, item.publicUrl) === input.mediaId);
  if (!record || !before.draft.images.includes(record.publicUrl)) throw new Error("PRODUCT_MEDIA_NOT_FOUND");
  const images = before.draft.images.filter((image) => image !== record.publicUrl);
  const draft = await savePublicationDraft({
    internalProductId: input.internalProductId,
    snapshot: { ...before.draft, images, media: publicProductMedia(before.draft.name, images, before.draft.media) },
    contentOrigins: before.contentOrigins,
    imageProvenance: images.length ? before.image.provenance : undefined,
    actor: input.actor,
  });
  const removed = await removeIngestedPublicImage(input);
  return { removed, draft, review: await getPublicationReview(input.internalProductId) };
}

export function derivePublicationEligibility(input: { draft: PublicProductSnapshot; readinessStatus: string; readinessBlockers: string[]; hasApprovedPrice: boolean; publicImageUrl?: string; contentStatus?: "CONTENT_MISSING" | "CONTENT_BASIC" | "CONTENT_ENRICHED" | "CONTENT_REVIEW_REQUIRED"; minimumContentState?: "CONTENT_BASIC" | "CONTENT_ENRICHED" }): PublicationEligibility {
  const blockers = input.readinessStatus === "READY_FOR_PUBLISH_REVIEW" ? [] : input.readinessBlockers.map((item) => item.replace(/_/g, " "));
  if (!input.hasApprovedPrice) blockers.push("A current approved price is required.");
  if (!input.draft.name.trim()) blockers.push("Public title is required.");
  if (!input.draft.slug.trim()) blockers.push("Public slug is required.");
  if (!input.draft.brand.trim()) blockers.push("Brand is required.");
  if (!input.draft.category.trim() || !input.draft.categorySlug.trim()) blockers.push("Public category and category slug are required.");
  if (!input.draft.shortDescription.trim()) blockers.push("Short description is required.");
  if (!(input.draft.overview ?? input.draft.description ?? input.draft.shortDescription).trim()) blockers.push("Product overview is required.");
  if (!input.publicImageUrl?.startsWith("/api/public/assets/products/")) blockers.push("TekCentral-controlled primary image is missing.");
  if (input.contentStatus === "CONTENT_MISSING" || input.contentStatus === "CONTENT_REVIEW_REQUIRED" || input.minimumContentState === "CONTENT_ENRICHED" && input.contentStatus !== "CONTENT_ENRICHED") blockers.push(`Product content must reach ${input.minimumContentState ?? "CONTENT_ENRICHED"}.`);
  const warnings = [
    input.draft.shortDescription.trim().toLowerCase() === input.draft.name.trim().toLowerCase() ? "Short description is identical to the product title." : "",
    !input.draft.description?.trim() ? "Long description is empty." : "",
    !input.draft.specifications.some((item) => item.name.trim() && item.value.trim()) ? "No public specifications have been added." : "",
    !input.draft.seoTitle?.trim() ? "SEO title is empty." : "",
    !input.draft.seoDescription?.trim() ? "SEO description is empty." : "",
    !input.draft.deliveryDisplay?.trim() ? "Delivery display wording is empty." : "",
  ].filter(Boolean);
  return { canPublish: blockers.length === 0, blockers, warnings };
}

function validateSnapshot(snapshot: PublicProductSnapshot, publishing = true) {
  if (!snapshot.name.trim() || !snapshot.slug.trim() || !snapshot.brand.trim() || !snapshot.category.trim() || !snapshot.categorySlug.trim()) throw new Error("Title, slug, brand and category are required.");
  if (publishing && !snapshot.shortDescription.trim()) throw new Error("A short description is required for publication.");
  if (publishing && !snapshot.images[0]) throw new Error("A primary image is required.");
  if (snapshot.images.length > 8 || normalizeProductImages(snapshot.images).length !== snapshot.images.length) throw new Error("Product gallery must contain at most 8 unique HTTPS or TekCentral-controlled images.");
  for (const document of snapshot.documents ?? []) { if (!document.title.trim() || !document.verified || !(document.url.startsWith("https://") || document.url.startsWith("/api/public/assets/documents/"))) throw new Error(`${publishing ? "Published" : "Draft"} product documents must be approved HTTPS or TekCentral-controlled resources.`); }
}

export async function publishProduct(input: { internalProductId: string; pricingProposalId: string; idempotencyKey: string; actor?: string; imageProvenance?: PublicationVersion["imageProvenance"]; contentOrigins?: PublicationContentOrigins; snapshot: Omit<PublicProductSnapshot, "id" | "price" | "currency">; consumeDraft?: boolean }) {
  const [context, productPolicy] = await Promise.all([publicationContext(input.internalProductId), getProductPolicySettings()]);
  if (context.readiness.status !== "READY_FOR_PUBLISH_REVIEW") throw new Error(`Product is not ready for publication: ${context.readiness.blockers.join(", ")}`);
  if (!context.proposal || context.proposal.status !== "APPROVED" || context.proposal.id !== input.pricingProposalId || context.proposal.proposedSellingPriceInclVat === undefined) throw new Error("The current approved pricing proposal is required.");
  const store = await readStore();
  const existingByKey = store.publications.flatMap((item) => item.versions).find((item) => item.internalProductId === input.internalProductId && item.idempotencyKey === input.idempotencyKey);
  if (existingByKey) return existingByKey;
  const now = new Date().toISOString();
  const images = normalizeProductImages(input.snapshot.images);
  const snapshot: PublicProductSnapshot = { ...input.snapshot, images, media: publicProductMedia(input.snapshot.name, images, input.snapshot.media), specifications: input.snapshot.specifications.map((item) => item.origin === "APPROVED_SOURCE_DERIVED" && !item.approvedAt ? { ...item, approvedAt: now } : item), documents: input.snapshot.documents?.map((item) => item.origin === "APPROVED_SOURCE_DERIVED" && !item.approvedAt ? { ...item, approvedAt: now } : item), id: context.product.id, price: context.proposal.proposedSellingPriceInclVat, currency: "ZAR" };
  validateSnapshot(snapshot);
  if (snapshot.images.some((image) => !image.startsWith("/api/public/assets/products/"))) throw new Error("Publish requires every gallery image to be stored and controlled by TekCentral. Ingest each source image first.");
  const contentStatus = deriveProductContentStatus({
    overview: snapshot.overview ?? snapshot.description,
    overviewOrigin: input.contentOrigins?.overview,
    specifications: snapshot.specifications,
    documents: snapshot.documents,
  });
  if (contentStatus === "CONTENT_MISSING" || contentStatus === "CONTENT_REVIEW_REQUIRED" || productPolicy.minimumContentState === "CONTENT_ENRICHED" && contentStatus !== "CONTENT_ENRICHED") {
    throw new Error(`Product content must reach ${productPolicy.minimumContentState} before publication.`);
  }
  const publication = store.publications.find((item) => item.internalProductId === input.internalProductId);
  const activeVersion = publication?.versions.find((item) => item.id === publication.activeVersionId);
  if (publication?.state === "PUBLISHED" && activeVersion && !hasMaterialPublicChanges(snapshot, activeVersion.snapshot)) throw new Error("No public changes to publish.");
  const duplicateSlug = store.publications.flatMap((item) => item.versions).find((item) => item.internalProductId !== input.internalProductId && item.snapshot.slug === snapshot.slug);
  if (duplicateSlug) throw new Error("Public product slug is already in use.");
  if (!context.mapping.id) throw new Error("Verified mapping identity is missing.");
  const actor = input.actor?.trim() || "Admin staff";
  let nextPublication = publication;
  const version: PublicationVersion = { id: id("publication"), version: (nextPublication?.versions.length ?? 0) + 1, internalProductId: input.internalProductId, createdAt: now, createdBy: actor, status: "PUBLISHED", publishedAt: now, publishedBy: actor, pricingProposalId: context.proposal.id, mappingId: context.mapping.id, supplierCode: context.mapping.supplierCode, supplierSku: context.mapping.supplierSku, sourceReadinessSnapshot: { status: context.readiness.status, blockers: [...context.readiness.blockers], checkedAt: now }, sourceMappingSnapshot: { mappingId: context.mapping.id, supplierCode: context.mapping.supplierCode, supplierSku: context.mapping.supplierSku, verifiedAt: context.mapping.verifiedAt }, imageProvenance: input.imageProvenance, contentOrigins: input.contentOrigins, previousVersionId: nextPublication?.activeVersionId, idempotencyKey: input.idempotencyKey, snapshot };
  if (nextPublication) { nextPublication = { ...nextPublication, state: "PUBLISHED", activeVersionId: version.id, updatedAt: now, versions: [...nextPublication.versions, version] }; store.publications = store.publications.map((item) => item.internalProductId === input.internalProductId ? nextPublication! : item); }
  else { nextPublication = { internalProductId: input.internalProductId, state: "PUBLISHED", activeVersionId: version.id, updatedAt: now, versions: [version] }; store.publications.push(nextPublication); }
  store.audit.unshift({ id: id("publication-audit"), internalProductId: input.internalProductId, action: "PUBLISHED", actor, at: now, versionId: version.id });
  if (input.consumeDraft) store.drafts = (store.drafts ?? []).filter((item) => item.internalProductId !== input.internalProductId);
  await writeStore(store); return version;
}

export async function publishSavedDraft(input: { internalProductId: string; pricingProposalId: string; idempotencyKey: string; actor?: string }) {
  const inflightKey = `${input.internalProductId}:${input.idempotencyKey}`;
  const existingInflight = publishDraftInflight.get(inflightKey);
  if (existingInflight) return existingInflight;
  const operation = (async () => {
    const store = await readStore();
    const existing = store.publications.flatMap((item) => item.versions).find((item) => item.internalProductId === input.internalProductId && item.idempotencyKey === input.idempotencyKey);
    if (existing) return existing;
    const draft = store.drafts?.find((item) => item.internalProductId === input.internalProductId);
    if (!draft) throw new Error("Save draft before publishing.");
    return publishProduct({ ...input, snapshot: draft.snapshot, contentOrigins: draft.contentOrigins, imageProvenance: draft.imageProvenance, consumeDraft: true });
  })();
  publishDraftInflight.set(inflightKey, operation);
  try { return await operation; }
  finally { if (publishDraftInflight.get(inflightKey) === operation) publishDraftInflight.delete(inflightKey); }
}

export async function createPublicationDraftFromActiveVersion(internalProductId: string, actor = "Admin staff") {
  const store = await readStore();
  const publication = store.publications.find((item) => item.internalProductId === internalProductId);
  const active = publication?.versions.find((item) => item.id === publication.activeVersionId);
  if (!publication || publication.state !== "PUBLISHED" || !active) throw new Error("A current published version is required.");
  const existing = store.drafts?.find((item) => item.internalProductId === internalProductId);
  if (existing) return existing;
  const now = new Date().toISOString();
  const draft: ProductPublicationDraft = { internalProductId, snapshot: structuredClone(active.snapshot), contentOrigins: active.contentOrigins, imageProvenance: active.imageProvenance, savedAt: now, savedBy: actor.trim() || "Admin staff" };
  store.drafts = [...(store.drafts ?? []), draft];
  await writeStore(store);
  return draft;
}

export async function unpublishProduct(internalProductId: string, actor = "Admin staff") { const store = await readStore(); const publication = store.publications.find((item) => item.internalProductId === internalProductId); if (!publication) throw new Error("Published product not found."); if (publication.state === "UNPUBLISHED") return publication; const now = new Date().toISOString(); publication.state = "UNPUBLISHED"; publication.updatedAt = now; store.audit.unshift({ id: id("publication-audit"), internalProductId, action: "UNPUBLISHED", actor, at: now, versionId: publication.activeVersionId }); await writeStore(store); return publication; }

export async function rollbackProduct(input: { internalProductId: string; sourceVersionId: string; pricingProposalId: string; idempotencyKey: string; actor?: string }) {
  const store = await readStore(); const publication = store.publications.find((item) => item.internalProductId === input.internalProductId); const source = publication?.versions.find((item) => item.id === input.sourceVersionId); if (!publication || !source) throw new Error("Publication version not found.");
  const context = await publicationContext(input.internalProductId); if (!context.proposal || context.proposal.status !== "APPROVED" || context.proposal.id !== input.pricingProposalId) throw new Error("The current approved pricing proposal is required.");
  if (context.proposal.proposedSellingPriceInclVat !== source.snapshot.price) throw new Error("Rollback blocked: the current approved price does not match this version.");
  const sourceImage = source.snapshot.images[0];
  const ingested = sourceImage?.startsWith("https://") ? await ingestPublicProductImage({ internalProductId: input.internalProductId, sourceUrl: sourceImage, sourceType: source.supplierCode }) : undefined;
  const rollbackSnapshot = ingested ? { ...source.snapshot, images: [ingested.publicUrl, ...source.snapshot.images.slice(1)] } : source.snapshot;
  const version = await publishProduct({ internalProductId: input.internalProductId, pricingProposalId: input.pricingProposalId, idempotencyKey: input.idempotencyKey, actor: input.actor, imageProvenance: ingested?.provenance ?? source.imageProvenance, contentOrigins: source.contentOrigins, snapshot: rollbackSnapshot });
  const updated = await readStore(); const target = updated.publications.find((item) => item.internalProductId === input.internalProductId)!; const index = target.versions.findIndex((item) => item.id === version.id); target.versions[index] = { ...target.versions[index], rollbackSourceVersionId: source.id }; const audit = updated.audit.find((item) => item.versionId === version.id); if (audit) audit.action = "ROLLED_BACK"; await writeStore(updated); return target.versions[index];
}

async function publicSnapshot(snapshot: PublicProductSnapshot) {
  return {
    ...await withCanonicalTaxonomy(snapshot),
    images: normalizeProductImages(snapshot.images),
    media: publicProductMedia(snapshot.name, snapshot.images, snapshot.media),
    specifications: snapshot.specifications.map(({ name, value, group, isKey }) => ({ name, value, group, isKey })),
    documents: snapshot.documents?.map(({ type, title, url, verified }) => ({ type, title, url, verified })),
  };
}
export async function listPublicProducts() {
  const store = await readStore(); const result = []; const availabilityIndex = await buildProductAvailabilityIndex();
  for (const publication of store.publications.filter((item) => item.state === "PUBLISHED" && item.activeVersionId)) {
    const version = publication.versions.find((item) => item.id === publication.activeVersionId); if (!version) continue;
    const availability = availabilityIndex.get(version.internalProductId);
    result.push({ ...await publicSnapshot(version.snapshot), isDemoPrice: false, availability: { state: availability.state, label: availability.label, freshness: availability.freshness, observedAt: availability.observedAt, purchasable: availability.purchasable }, stockStatus: availability.state === "IN_STOCK" ? "in-stock" as const : availability.state === "LOW_STOCK" ? "low-stock" as const : availability.state === "OUT_OF_STOCK" || availability.state === "DISCONTINUED" ? "out-of-stock" as const : "unknown" as const, catalogueSource: "PUBLISHED" as const });
  }
  return (await import("./merchandisingService.js")).applyEffectivePromotions(result);
}
export async function getPublicProductBySlug(slug: string) { return (await listPublicProducts()).find((item) => item.slug === slug); }
export async function getPublicationPreview(internalProductId: string) {
  const store = await readStore(); const publication = store.publications.find((item) => item.internalProductId === internalProductId);
  const draft = store.drafts?.find((item) => item.internalProductId === internalProductId);
  const version = publication?.versions.find((item) => item.id === publication.activeVersionId) ?? publication?.versions.at(-1);
  if (!draft && (!publication || !version)) return undefined;
  const context = await publicationContext(internalProductId);
  const approvedPrice = approvedPublicationPrice(context.proposal);
  const base = draft?.snapshot ?? version!.snapshot;
  const priced = approvedPrice === undefined ? base : { ...base, price: approvedPrice };
  const snapshot = { ...priced, images: normalizeProductImages(priced.images), media: publicProductMedia(priced.name, priced.images, priced.media) };
  const availability = await getProductAvailability(internalProductId);
  return {
    product: { ...snapshot, isDemoPrice: false, availability: { state: availability.state, label: availability.label, freshness: availability.freshness, observedAt: availability.observedAt, purchasable: availability.purchasable }, stockStatus: availability.state === "IN_STOCK" ? "in-stock" as const : availability.state === "LOW_STOCK" ? "low-stock" as const : availability.state === "OUT_OF_STOCK" || availability.state === "DISCONTINUED" ? "out-of-stock" as const : "unknown" as const, catalogueSource: "PUBLISHED" as const },
    publicationState: publication?.state ?? "UNPUBLISHED",
    versionNumber: version?.version ?? 0,
    draftSavedAt: draft?.savedAt,
    priceAvailable: approvedPrice !== undefined,
  };
}
export async function getPublishedBackendProduct(productId: string) { const item = (await listPublicProducts()).find((product) => product.id === productId); return item ? { productId: item.id, slug: item.slug, sku: item.sku, name: item.name, brand: item.brand, price: item.price, stockStatus: item.stockStatus, availabilityState: item.availability.state, categoryId: item.categoryId, subcategoryId: item.subcategoryId, productTypeId: item.productTypeId, taxonomyVersion: item.taxonomyVersion } : undefined; }

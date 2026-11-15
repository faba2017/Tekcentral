import { createHash } from "node:crypto";
import type { SupplierProductMapping } from "../../types.js";
import { buildSupplierProductEnrichment, type SupplierProductEnrichmentSuggestion } from "../../supplierProductEnrichment.js";
import { listSupplierProductMappings } from "../../supplierProductMappingRepository.js";
import { listTvrCatalogueOffers } from "./tvrCatalogueService.js";
import { normalizeTvrWebsiteSku, type TvrPublicProductEvidence } from "./tvrPublicCatalogue.js";
import { readCurrentTvrPublicCatalogueBundle } from "./tvrPublicCatalogueService.js";
import type { TvrNormalizedOffer } from "./tvrOfferNormalization.js";

export type TvrWebsiteFreshness = "FRESH" | "STALE" | "UNKNOWN";
export type TvrEnrichmentResolution =
  | { status: "NOT_FOUND"; reason: string }
  | { status: "AMBIGUOUS"; reason: string; normalizedSku?: string; evidenceCount?: number }
  | {
      status: "RESOLVED";
      normalizedSku: string;
      evidence: TvrPublicProductEvidence;
      offers: TvrNormalizedOffer[];
      mappings: SupplierProductMapping[];
      freshness: TvrWebsiteFreshness;
      sourceVersionId: string;
      sourceFingerprint: string;
      enrichment: SupplierProductEnrichmentSuggestion;
    };

export function deriveTvrWebsiteFreshness(input: {
  evidenceVersionId?: string;
  evidenceFingerprint?: string;
  currentVersionId?: string;
  currentFingerprint?: string;
  sourceState?: string;
}): TvrWebsiteFreshness {
  if (!input.currentVersionId || !input.currentFingerprint) return "UNKNOWN";
  return input.sourceState === "ACTIVE"
    && input.evidenceVersionId === input.currentVersionId
    && input.evidenceFingerprint === input.currentFingerprint ? "FRESH" : "STALE";
}

const attributes = (record: TvrPublicProductEvidence) => Object.fromEntries(record.attributes
  .filter((item) => item.name.trim() && item.values.length)
  .map((item) => [item.name, item.values.join("; ")]));

function addPhysicalEvidence(enrichment: SupplierProductEnrichmentSuggestion, record: TvrPublicProductEvidence) {
  const evidence = enrichment.evidence.title;
  const add = (name: string, value?: string, sourceField?: string) => {
    if (!value?.trim() || enrichment.specifications.some((item) => item.name.toLowerCase() === name.toLowerCase())) return;
    enrichment.specifications.push({ name, value: value.trim(), group: "Source dimensions", isKey: false, source: "SUPPLIER_FEED", origin: "SOURCE_DERIVED", evidence: { ...evidence, sourceField: sourceField ?? name } });
  };
  add("Weight", record.weight, "weight");
  const dimensions = record.dimensions;
  if (dimensions && (dimensions.length || dimensions.width || dimensions.height)) add("Dimensions", [dimensions.length, dimensions.width, dimensions.height].map((value) => value || "—").join(" × "), "dimensions");
}

/** Exact raw-SKU gate: current website evidence -> current offer -> VERIFIED mapping -> Product. */
export function resolveTvrProductEnrichment(input: {
  productId: string;
  records: TvrPublicProductEvidence[];
  offers: TvrNormalizedOffer[];
  mappings: SupplierProductMapping[];
  sourceVersionId: string;
  sourceFingerprint: string;
  retrievedAt: string;
  sourceState?: string;
  currentVersionId?: string;
  currentFingerprint?: string;
}): TvrEnrichmentResolution {
  const verifiedForProduct = input.mappings.filter((mapping) => mapping.supplierCode === "TVR" && mapping.productId === input.productId && mapping.status === "VERIFIED" && mapping.supplierOfferId);
  if (!verifiedForProduct.length) return { status: "NOT_FOUND", reason: "VERIFIED_MAPPING_REQUIRED" };
  const bridges = verifiedForProduct.flatMap((mapping) => {
    const offer = input.offers.find((candidate) => candidate.id === mapping.supplierOfferId);
    if (!offer) return [];
    return [{ mapping, offer, normalizedSku: normalizeTvrWebsiteSku(offer.supplierSku) }];
  });
  if (!bridges.length) return { status: "NOT_FOUND", reason: "EXACT_CURRENT_OFFER_REQUIRED" };
  const bridgeSkus = [...new Set(bridges.map((bridge) => bridge.normalizedSku))];
  if (bridgeSkus.length !== 1) return { status: "AMBIGUOUS", reason: "MULTIPLE_WEBSITE_IDENTITIES" };
  const normalizedSku = bridgeSkus[0];
  const conflictingProducts = new Set(input.mappings.filter((mapping) => mapping.supplierCode === "TVR" && mapping.status === "VERIFIED" && mapping.supplierOfferId)
    .flatMap((mapping) => {
      const mappedOffer = input.offers.find((candidate) => candidate.id === mapping.supplierOfferId);
      return mappedOffer && normalizeTvrWebsiteSku(mappedOffer.supplierSku) === normalizedSku ? [mapping.productId] : [];
    }));
  if (conflictingProducts.size > 1) return { status: "AMBIGUOUS", reason: "CONTRADICTORY_VERIFIED_PRODUCT_MAPPINGS", normalizedSku };
  const records = input.records.filter((record) => record.normalizedSku === normalizedSku);
  if (!records.length) return { status: "NOT_FOUND", reason: "WEBSITE_EVIDENCE_NOT_FOUND" };
  if (records.length !== 1) return { status: "AMBIGUOUS", reason: "DUPLICATE_WEBSITE_SKU", normalizedSku, evidenceCount: records.length };
  const record = records[0];
  const freshness = deriveTvrWebsiteFreshness({ evidenceVersionId: input.sourceVersionId, evidenceFingerprint: input.sourceFingerprint, currentVersionId: input.currentVersionId, currentFingerprint: input.currentFingerprint, sourceState: input.sourceState });
  const description = record.longDescription || record.shortDescription;
  const enrichment = buildSupplierProductEnrichment({
    supplier: "TVR", sourceId: "TVR_PUBLIC_CATALOGUE", sourceVersionId: input.sourceVersionId,
    sourceVersionFingerprint: input.sourceFingerprint, supplierSku: record.websiteSku,
    supplierProductId: String(record.productId), productName: record.title, brand: record.brand,
    description, attributes: attributes(record), retrievedAt: input.retrievedAt,
    sourceFingerprint: record.fingerprint, freshness, mediaSourceType: "HTML",
  });
  if (record.shortDescription) enrichment.shortDescription = record.shortDescription;
  if (record.longDescription) enrichment.longDescription = record.longDescription;
  enrichment.evidence.shortDescription = { ...enrichment.evidence.shortDescription, sourceField: "shortDescription" };
  enrichment.evidence.longDescription = { ...enrichment.evidence.longDescription, sourceField: "longDescription" };
  addPhysicalEvidence(enrichment, record);
  enrichment.category = undefined;
  enrichment.subcategory = undefined;
  enrichment.imageCandidates = record.deferredImages.map((image) => ({
    id: createHash("sha256").update(["TVR", input.sourceVersionId, normalizedSku, String(record.productId), image.url, input.productId].join("\0")).digest("hex"),
    targetProductId: input.productId,
    url: image.url,
    supplier: "TVR",
    supplierSku: record.websiteSku,
    supplierProductId: String(record.productId),
    sourceType: "HTML" as const,
    association: "PRODUCT" as const,
    discoveredAt: input.retrievedAt,
    candidateOrder: image.order,
    reuseEligibility: "REVIEW_REQUIRED" as const,
    status: "REVIEW_REQUIRED" as const,
    evidence: {
      supplier: "TVR", sourceId: "TVR_PUBLIC_CATALOGUE", sourceVersionId: input.sourceVersionId,
      sourceVersionFingerprint: input.sourceFingerprint, supplierProductId: String(record.productId),
      sourceField: `deferredImages[${image.order}]`, retrievedAt: input.retrievedAt,
      sourceFingerprint: image.fingerprint, freshness,
    },
  }));
  enrichment.fingerprint = createHash("sha256").update(JSON.stringify(enrichment)).digest("hex");
  return { status: "RESOLVED", normalizedSku, evidence: record, offers: bridges.map((item) => item.offer), mappings: bridges.map((item) => item.mapping), freshness, sourceVersionId: input.sourceVersionId, sourceFingerprint: input.sourceFingerprint, enrichment };
}

export async function getTvrProductEnrichment(productId: string): Promise<TvrEnrichmentResolution> {
  try {
    const [source, offers, mappings] = await Promise.all([readCurrentTvrPublicCatalogueBundle(), listTvrCatalogueOffers(), listSupplierProductMappings()]);
    if (!source) return { status: "NOT_FOUND", reason: "CURRENT_WEBSITE_SOURCE_REQUIRED" };
    return resolveTvrProductEnrichment({ productId, records: source.bundle.products, offers, mappings, sourceVersionId: source.sourceVersionId, sourceFingerprint: source.sourceFingerprint, retrievedAt: source.retrievedAt, sourceState: source.sourceState, currentVersionId: source.sourceVersionId, currentFingerprint: source.sourceFingerprint });
  } catch {
    return { status: "NOT_FOUND", reason: "WEBSITE_EVIDENCE_UNAVAILABLE" };
  }
}

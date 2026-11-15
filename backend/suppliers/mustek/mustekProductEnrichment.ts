import { createHash } from "node:crypto";
import type { SupplierProductMapping } from "../../types.js";
import { buildSupplierProductEnrichment, type SupplierProductEnrichmentSuggestion } from "../../supplierProductEnrichment.js";
import { listSupplierProductMappings } from "../../supplierProductMappingRepository.js";
import { getMustekCatalogueOffer, listMustekCatalogueOffers } from "./mustekCatalogueService.js";
import { normalizeMustekSupplierSku, type MustekNormalizedOffer } from "./mustekOfferNormalization.js";
import { readCurrentMustekMsiEvidence, type MustekMsiProductEvidence, type MustekMsiSourceVersion } from "./mustekMsiEvidenceParser.js";

export type MustekEvidenceFreshness = "FRESH" | "STALE" | "UNKNOWN";

export function deriveMustekMsiFreshness(evidence: MustekMsiSourceVersion, current?: MustekMsiSourceVersion): MustekEvidenceFreshness {
  if (!current) return "UNKNOWN";
  return evidence.sourceId === current.sourceId
    && evidence.sourceVersionId === current.sourceVersionId
    && evidence.sourceFingerprint === current.sourceFingerprint ? "FRESH" : "STALE";
}

function description(record: MustekMsiProductEvidence) {
  return [
    ...Object.entries(record.content.summary).map(([key, value]) => `${key}: ${value}.`),
    ...record.content.notes,
    record.content.tag,
  ].filter((value): value is string => Boolean(value?.trim())).join(" ");
}

function attributes(record: MustekMsiProductEvidence) {
  const grouped = new Map<string, string[]>();
  for (const item of record.specifications) grouped.set(item.key, [...(grouped.get(item.key) ?? []), item.value]);
  return Object.fromEntries([...grouped].map(([key, values]) => [key, [...new Set(values)].join("; ")]));
}

export interface MustekProductEnrichmentResolution {
  offer: MustekNormalizedOffer;
  mapping: SupplierProductMapping;
  evidence: MustekMsiProductEvidence;
  freshness: MustekEvidenceFreshness;
  enrichment: SupplierProductEnrichmentSuggestion;
}

/** Strict identity gate: exact normalized MSI SKU -> exact Mustek offer -> VERIFIED mapping -> Product. */
export function resolveMustekProductEnrichment(input: {
  productId: string;
  records: MustekMsiProductEvidence[];
  offers: MustekNormalizedOffer[];
  mappings: SupplierProductMapping[];
  currentSource?: MustekMsiSourceVersion;
}): MustekProductEnrichmentResolution | undefined {
  const verified = input.mappings.filter((mapping) => mapping.supplierCode === "MUSTEK" && mapping.productId === input.productId && mapping.status === "VERIFIED");
  for (const mapping of verified) {
    const sku = normalizeMustekSupplierSku(mapping.supplierSku);
    if (!sku) continue;
    const offer = input.offers.find((candidate) => candidate.supplierSku === sku && candidate.id === mapping.supplierOfferId);
    if (!offer) continue;
    const evidence = input.records.find((candidate) => normalizeMustekSupplierSku(candidate.supplierSku) === offer.supplierSku);
    if (!evidence) continue;
    const freshness = deriveMustekMsiFreshness(evidence.provenance, input.currentSource);
    const enrichment = buildSupplierProductEnrichment({
      supplier: "MUSTEK",
      sourceId: evidence.provenance.sourceId,
      sourceVersionId: evidence.provenance.sourceVersionId,
      sourceVersionFingerprint: evidence.provenance.sourceFingerprint,
      supplierSku: offer.supplierSku,
      supplierProductId: offer.supplierSku,
      productName: evidence.content.series ?? offer.description ?? evidence.supplierSku,
      brand: evidence.manufacturerContext,
      description: description(evidence),
      attributes: attributes(evidence),
      retrievedAt: evidence.provenance.retrievedAt,
      sourceFingerprint: evidence.evidenceFingerprint,
      freshness,
    });
    enrichment.specifications = enrichment.specifications.map((specification) => ({
      ...specification,
      group: evidence.specifications.find((item) => item.key.toLowerCase() === specification.name.toLowerCase())?.group ?? specification.group,
      evidence: {
        ...specification.evidence,
        sourceField: evidence.specifications.find((item) => item.key.toLowerCase() === specification.name.toLowerCase())?.sourceField ?? specification.evidence.sourceField,
      },
    }));
    if (evidence.embeddedImage) {
      const candidateId = createHash("sha256").update(["MUSTEK", evidence.provenance.sourceId, evidence.provenance.sourceVersionId, input.productId, evidence.supplierSku, evidence.embeddedImage.contentFingerprint].join("\0")).digest("hex");
      enrichment.imageCandidates = [{
        id: candidateId,
        supplier: "MUSTEK",
        supplierSku: offer.supplierSku,
        supplierProductId: offer.supplierSku,
        sourceType: "PRIVATE_SUPPLIER_EVIDENCE",
        association: "PRODUCT",
        discoveredAt: evidence.provenance.retrievedAt,
        candidateOrder: 0,
        reuseEligibility: "REVIEW_REQUIRED",
        status: "REVIEW_REQUIRED",
        evidence: {
          supplier: "MUSTEK",
          sourceId: evidence.provenance.sourceId,
          sourceVersionId: evidence.provenance.sourceVersionId,
          sourceVersionFingerprint: evidence.provenance.sourceFingerprint,
          supplierProductId: offer.supplierSku,
          sourceField: evidence.embeddedImage.sourceField,
          retrievedAt: evidence.provenance.retrievedAt,
          sourceFingerprint: evidence.evidenceFingerprint,
          freshness,
        },
        privateEvidence: {
          mimeType: evidence.embeddedImage.mediaType,
          byteSize: evidence.embeddedImage.byteSize,
          contentFingerprint: evidence.embeddedImage.contentFingerprint,
          sourceLabel: "MSI private catalogue image",
          evidenceClassification: "PRIVATE_REVIEW_REQUIRED",
        },
      }];
    } else enrichment.imageCandidates = [];
    // Advisory category and display price deliberately do not enter this contract.
    return { offer, mapping, evidence, freshness, enrichment };
  }
  return undefined;
}

export async function getMustekProductEnrichment(productId: string): Promise<MustekProductEnrichmentResolution | undefined> {
  try {
    const [parsed, offers, mappings] = await Promise.all([
      readCurrentMustekMsiEvidence(),
      listMustekCatalogueOffers(),
      listSupplierProductMappings(),
    ]);
    return resolveMustekProductEnrichment({ productId, records: parsed.records, offers, mappings, currentSource: parsed.source });
  } catch {
    // Source evidence is optional read-time intelligence; canonical Product state remains available.
    return undefined;
  }
}

export async function exactMustekOfferForMapping(mapping: SupplierProductMapping) {
  if (mapping.supplierCode !== "MUSTEK" || mapping.status !== "VERIFIED" || !mapping.supplierOfferId) return undefined;
  const offer = await getMustekCatalogueOffer(mapping.supplierSku);
  return offer?.id === mapping.supplierOfferId ? offer : undefined;
}

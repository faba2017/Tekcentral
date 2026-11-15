import { createHash } from "node:crypto";
import type { PublicProductSpecification } from "./productContent.js";

export interface SupplierEnrichmentEvidence {
  supplier: string;
  sourceId?: string;
  sourceVersionId?: string;
  sourceVersionFingerprint?: string;
  supplierProductId?: string;
  supplierVariantId?: string;
  sourceField: string;
  retrievedAt: string;
  sourceFingerprint?: string;
  /** Explicit source-version freshness supplied by adapters that can prove it. */
  freshness?: "FRESH" | "STALE" | "UNKNOWN";
}

export type SupplierMediaCandidateStatus = "DISCOVERED" | "REVIEW_REQUIRED" | "INGESTED" | "REJECTED" | "DUPLICATE" | "INVALID";
export interface SupplierMediaCandidate {
  id: string;
  /** Canonical Product this actionable candidate was resolved for. */
  targetProductId?: string;
  url?: string;
  supplier: string;
  supplierSku?: string;
  supplierProductId?: string;
  supplierVariantId?: string;
  sourceType: "API" | "LIVE_FEED" | "DOWNLOAD_URL" | "HTML" | "MANUAL" | "MEDIA_FEED" | "PRIVATE_SUPPLIER_EVIDENCE";
  association: "PRODUCT" | "EXACT_VARIANT" | "UNVERIFIED";
  discoveredAt: string;
  candidateOrder: number;
  reuseEligibility: "REVIEW_REQUIRED" | "APPROVED_SOURCE" | "NOT_APPROVED";
  status: SupplierMediaCandidateStatus;
  evidence: SupplierEnrichmentEvidence;
  privateEvidence?: {
    mimeType: string;
    byteSize: number;
    contentFingerprint: string;
    sourceLabel: string;
    evidenceClassification: "PRIVATE_REVIEW_REQUIRED";
  };
}

export interface SupplierProductEnrichmentInput {
  supplier: string;
  sourceId?: string;
  sourceVersionId?: string;
  sourceVersionFingerprint?: string;
  supplierSku?: string;
  supplierProductId?: string;
  supplierVariantId?: string;
  productName: string;
  variantName?: string;
  brand?: string;
  description?: string;
  category?: string;
  subcategory?: string;
  attributes?: Record<string, string>;
  primaryImageUrl?: string;
  imageCandidates?: string[];
  retrievedAt: string;
  sourceFingerprint?: string;
  freshness?: SupplierEnrichmentEvidence["freshness"];
  mediaSourceType?: SupplierMediaCandidate["sourceType"];
  mediaAssociation?: SupplierMediaCandidate["association"];
  additionalMediaAssociation?: SupplierMediaCandidate["association"];
  mediaReuseEligibility?: SupplierMediaCandidate["reuseEligibility"];
}

export interface SupplierProductEnrichmentSuggestion {
  title?: string;
  shortDescription?: string;
  longDescription?: string;
  seoTitle?: string;
  seoDescription?: string;
  category?: string;
  subcategory?: string;
  specifications: Array<PublicProductSpecification & { evidence: SupplierEnrichmentEvidence }>;
  imageCandidates: SupplierMediaCandidate[];
  evidence: Record<string, SupplierEnrichmentEvidence>;
  fingerprint: string;
}

const compact = (value?: string) => value?.replace(/<br\s*\/?\s*>/gi, ". ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/([!?.,])\1+/g, "$1").replace(/\s+/g, " ").trim() ?? "";
const cleanTitle = (brand: string | undefined, productName: string, variantName?: string) => {
  const selected = compact(variantName) || compact(productName);
  if (!brand?.trim() || selected.toLowerCase().startsWith(brand.trim().toLowerCase())) return selected;
  return `${brand.trim()} ${selected}`;
};
const trimAtWord = (value: string, limit: number) => value.length <= limit ? value : `${value.slice(0, limit - 1).replace(/\s+\S*$/, "").trim()}…`;
const normalizedLabel = (value: string) => value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/^./, (letter) => letter.toUpperCase());
const humanList = (values: string[]) => values.length < 2 ? values[0] ?? "" : `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`;
const descriptionWithoutRepeatedTitle = (title: string, description: string) => {
  if (!title || !description.toLowerCase().startsWith(title.toLowerCase())) return description;
  return description.slice(title.length).replace(/^\s*[-:|.!?,]+\s*/, "").trim() || description;
};

export function buildSupplierProductEnrichment(input: SupplierProductEnrichmentInput): SupplierProductEnrichmentSuggestion {
  const title = cleanTitle(input.brand, input.productName, input.variantName);
  const evidence = (sourceField: string): SupplierEnrichmentEvidence => ({ supplier: input.supplier, sourceId: input.sourceId, sourceVersionId: input.sourceVersionId, sourceVersionFingerprint: input.sourceVersionFingerprint, supplierProductId: input.supplierProductId, supplierVariantId: input.supplierVariantId, sourceField, retrievedAt: input.retrievedAt, sourceFingerprint: input.sourceFingerprint, freshness: input.freshness });
  const sourceText = descriptionWithoutRepeatedTitle(title, compact(input.description));
  const facts: string[] = [];
  const specifications: SupplierProductEnrichmentSuggestion["specifications"] = [];
  const addSpec = (name: string, value: string, sourceField: string, key = false) => {
    if (!value.trim() || specifications.some((item) => item.name.toLowerCase() === name.toLowerCase())) return;
    specifications.push({ name, value: value.trim(), group: "Product details", isKey: key, source: "SUPPLIER_FEED", origin: "SOURCE_DERIVED", evidence: evidence(sourceField) });
  };
  for (const [name, value] of Object.entries(input.attributes ?? {})) addSpec(normalizedLabel(name), value, `variant.attributes.${name}`);
  const length = title.match(/\b(\d+(?:\.\d+)?)\s*m\b/i)?.[1];
  const isEthernetCable = /ethernet cable/i.test(`${title} ${sourceText}`);
  if (isEthernetCable) { addSpec("Product type", "Ethernet cable", "productName", true); facts.push("wired Ethernet connectivity"); }
  if (length) { addSpec("Cable length", `${length} m`, "variantName", true); facts.push(`a ${length} m length`); }
  const colour = sourceText.match(/\bcolou?r\s*:\s*([a-z][a-z ]*?)(?:\.|product|$)/i)?.[1]?.trim();
  if (colour) { addSpec("Colour", colour.replace(/^./, (letter) => letter.toUpperCase()), "description", true); facts.push(`a ${colour.toLowerCase()} finish`); }
  const cableType = sourceText.match(/network cable type\s*:\s*([a-z][a-z ]*?)(?:\.|length|$)/i)?.[1]?.trim();
  if (cableType) addSpec("Network cable type", cableType.replace(/^./, (letter) => letter.toUpperCase()), "description");
  const shortDescription = facts.length ? `${title} for ${humanList(facts)}.` : (sourceText ? trimAtWord(sourceText, 180) : undefined);
  const longDescription = sourceText || (facts.length ? `${title}: ${humanList(facts)}.` : undefined);
  const urls = [...new Set([input.primaryImageUrl, ...(input.imageCandidates ?? [])].filter((url): url is string => Boolean(url?.startsWith("https://"))))];
  const result: SupplierProductEnrichmentSuggestion = {
    title: title || undefined,
    shortDescription,
    longDescription,
    seoTitle: title ? trimAtWord(`${title} | TekCentral`, 60) : undefined,
    seoDescription: shortDescription ? trimAtWord(`Shop ${shortDescription}`, 160) : undefined,
    category: input.category,
    subcategory: input.subcategory,
    specifications,
    imageCandidates: urls.map((url, index) => {
      const candidateEvidence = evidence(index === 0 ? "primaryImageUrl" : "description.images");
      return {
        id: createHash("sha256").update(`${input.supplier}\0${input.supplierSku ?? ""}\0${input.supplierVariantId ?? ""}\0${url}`).digest("hex"),
        url,
        supplier: input.supplier,
        supplierSku: input.supplierSku,
        supplierProductId: input.supplierProductId,
        supplierVariantId: input.supplierVariantId,
        sourceType: input.mediaSourceType ?? "API",
        association: (index === 0 ? input.mediaAssociation : input.additionalMediaAssociation ?? input.mediaAssociation) ?? (input.supplierVariantId ? "EXACT_VARIANT" : "PRODUCT"),
        discoveredAt: input.retrievedAt,
        candidateOrder: index,
        reuseEligibility: input.mediaReuseEligibility ?? "REVIEW_REQUIRED",
        status: "REVIEW_REQUIRED" as const,
        evidence: candidateEvidence,
      };
    }),
    evidence: { title: evidence(input.variantName ? "variantName" : "productName"), shortDescription: evidence("normalizedFacts"), longDescription: evidence("normalizedFacts"), seoTitle: evidence("generatedFromTitle"), seoDescription: evidence("generatedFromShortDescription") },
    fingerprint: "",
  };
  result.fingerprint = createHash("sha256").update(JSON.stringify(result)).digest("hex");
  return result;
}

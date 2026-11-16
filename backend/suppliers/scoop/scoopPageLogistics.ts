import { createHash } from "node:crypto";
import { getScoopCatalogueProduct, saveScoopCatalogueProduct, saveScoopLogisticsSource } from "./scoopCatalogueRepository.js";
import { deriveScoopLogisticsStatus } from "./scoopLogisticsMetadata.js";
import { acquireScoopManufacturerLogistics, normalizeDimension, normalizeWeight } from "./scoopManufacturerLogistics.js";
import type { ScoopCatalogueProduct, ScoopLogisticsFailureReason, ScoopLogisticsMetadata } from "./scoopTypes.js";
import { fetchPublicScoopProductPage } from "./scoopUrlReconciliation.js";
import { applyScoopStaffUrl, previewScoopStaffUrl } from "./scoopUrlReconciliation.js";
import { parseScoopProductContent } from "./scoopProductContent.js";

export type ScoopPageLogisticsFailure = "PRODUCT_URL_UNKNOWN" | "SOURCE_BLOCKED" | "SOURCE_UNAVAILABLE" | "IDENTITY_MISMATCH" | "IDENTITY_LOW_CONFIDENCE" | "MEASUREMENTS_NOT_FOUND" | "PACKAGE_DATA_NOT_FOUND" | "PRODUCT_DATA_NOT_FOUND" | "AMBIGUOUS_MULTI_COMPONENT" | "INVALID_MEASUREMENTS" | "PARSER_ERROR" | "NETWORK_ERROR" | "RATE_LIMITED";
export interface ScoopComponentMeasurement { label: string; weightGrams?: number; lengthMm?: number; widthMm?: number; heightMm?: number; rawWeight?: string; rawDimensions?: string }
export interface ScoopPageLogisticsPreview {
  supplierSku: string; sourceUrl: string; identityConfidence: "HIGH" | "LOW"; extractionConfidence: "HIGH" | "MEDIUM" | "LOW";
  product?: ScoopComponentMeasurement; package?: ScoopComponentMeasurement; components: ScoopComponentMeasurement[];
  sourceType: ScoopEvidenceSourceType; shippingBasis?: "PACKAGE" | "PRODUCT_DIMENSIONS_FALLBACK"; status: ScoopLogisticsMetadata["status"]; blocker?: ScoopPageLogisticsFailure; contentFingerprint: string;
  confirmedHardwareRevision?: string; missingEvidence: string[]; conflict?: { existing: ScoopComponentMeasurement; proposed: ScoopComponentMeasurement; existingSource?: string };
  contentSuggestions?: { overview: boolean; specificationCount: number; documentCount: number };
}
export type ScoopEvidenceSourceType = "SCOOP_PRODUCT_PAGE" | "MANUFACTURER_PRODUCT_PAGE" | "MANUFACTURER_DATASHEET" | "APPROVED_SOURCE_CAPTURE";

const clean = (value: string) => value.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<\/(?:tr|p|div|li|h[1-6])>|<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&times;|&#215;/gi, "×").replace(/&amp;/gi, "&").replace(/[ \t]+/g, " ");
const identity = (value?: string) => (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const CACHE_MS = 30 * 24 * 60 * 60 * 1000;
export const SCOOP_PAGE_SOURCE_MAX_BYTES = 900_000;

function weight(value?: string) {
  const match = value?.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|lb)\b/i); if (!match) return undefined;
  return normalizeWeight(Number(match[1].replace(",", ".")), match[2].toLowerCase() as "kg" | "g" | "lb");
}
function dimensions(value?: string) {
  const match = value?.match(/(\d+(?:[.,]\d+)?)\s*(?:mm|cm|m|in|inch(?:es)?)?\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(?:mm|cm|m|in|inch(?:es)?)?\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m|in|inch(?:es)?)\b/i); if (!match) return undefined;
  const unit = match[4].toLowerCase(); const normalizedUnit = unit === "m" ? "m" : unit.startsWith("in") ? "in" : unit as "mm" | "cm";
  const convert = (part: string) => normalizedUnit === "m" ? Number(part.replace(",", ".")) * 1000 : normalizeDimension(Number(part.replace(",", ".")), normalizedUnit);
  return { lengthMm: convert(match[1]), widthMm: convert(match[2]), heightMm: convert(match[3]) };
}
function componentDimensions(value?: string) {
  const complete = dimensions(value); if (complete) return complete;
  const match = value?.match(/(\d+(?:[.,]\d+)?)\s*(?:mm|cm|m|in|inch(?:es)?)?\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m|in|inch(?:es)?)\b/i); if (!match) return undefined;
  const unit = match[3].toLowerCase(); const normalizedUnit = unit === "m" ? "m" : unit.startsWith("in") ? "in" : unit as "mm" | "cm";
  const convert = (part: string) => normalizedUnit === "m" ? Number(part.replace(",", ".")) * 1000 : normalizeDimension(Number(part.replace(",", ".")), normalizedUnit);
  return { lengthMm: convert(match[1]), widthMm: convert(match[2]) };
}
function measurement(label: string, rawWeight?: string, rawDimensions?: string): ScoopComponentMeasurement | undefined {
  const parsedWeight = weight(rawWeight); const parsedDimensions = dimensions(rawDimensions);
  if (parsedWeight === undefined && !parsedDimensions) return undefined;
  return { label, weightGrams: parsedWeight, ...parsedDimensions, rawWeight, rawDimensions };
}
function findValue(text: string, label: RegExp, value: RegExp) { return text.match(new RegExp(`(?:${label.source})\\s*:?\\s*(${value.source})`, "i"))?.[1]; }
const weightValue = /\d+(?:[.,]\d+)?\s*(?:kg|g|lb)\b/;
const dimensionValue = /\d+(?:[.,]\d+)?\s*(?:(?:mm|cm|m|in|inch(?:es)?)\s*)?[x×]\s*\d+(?:[.,]\d+)?\s*(?:(?:mm|cm|m|in|inch(?:es)?)\s*)?[x×]\s*\d+(?:[.,]\d+)?\s*(?:mm|cm|m|in|inch(?:es)?)\b/;
const componentDimensionValue = /\d+(?:[.,]\d+)?\s*(?:(?:mm|cm|m|in|inch(?:es)?)\s*)?[x×]\s*\d+(?:[.,]\d+)?(?:\s*(?:(?:mm|cm|m|in|inch(?:es)?)\s*)?[x×]\s*\d+(?:[.,]\d+)?)?\s*(?:mm|cm|m|in|inch(?:es)?)\b/;

export function parseScoopPageLogistics(content: string) {
  const text = clean(content);
  const packageMeasurement = measurement("Package", findValue(text, /(?:package|shipping|packed|carton)\s*(?:weight)?/, weightValue), findValue(text, /(?:package|shipping|packed|carton)\s*(?:dimensions?|size)/, dimensionValue));
  const productMeasurement = measurement("Product", findValue(text, /(?:unit|product|device)\s*weight|(?<!package\s)(?<!shipping\s)\bweight/, weightValue), findValue(text, /(?:unit|product|device)\s*(?:dimensions?|size)|(?<!package\s)(?<!carton\s)\bdimensions?/, dimensionValue));
  const componentLabels = ["antenna", "radio", "dish", "injector", "adapter", "power supply"];
  const components: ScoopComponentMeasurement[] = componentLabels.map((label): ScoopComponentMeasurement | undefined => {
    const rawWeight = findValue(text, new RegExp(`${label}[^\n]{0,60}(?:weight)`), weightValue);
    const rawDimensions = findValue(text, new RegExp(`${label}[^\n]{0,60}(?:dimensions?|size)`), componentDimensionValue);
    const parsedWeight = weight(rawWeight); const parsedDimensions = componentDimensions(rawDimensions);
    if (parsedWeight === undefined && !parsedDimensions) return undefined;
    return { label: label.replace(/\b\w/g, (letter) => letter.toUpperCase()), weightGrams: parsedWeight, ...parsedDimensions, rawWeight, rawDimensions };
  }).filter((item): item is ScoopComponentMeasurement => item !== undefined);
  return { text, product: productMeasurement, package: packageMeasurement, components };
}

function canonicalScoopUrl(value?: string) { try { const url = new URL(value ?? ""); return url.hostname.replace(/^www\./, "") === "scoop.co.za" && url.protocol === "https:" ? url.toString() : undefined; } catch { return undefined; } }
function knownUrl(product: ScoopCatalogueProduct) { return canonicalScoopUrl(product.productPageResolution?.productPageUrl ?? product.sourceObservations.find((source) => source.sourceType === "WEBSITE")?.fields.productUrl ?? product.sourceObservations.find((source) => source.sourceType === "WEBSITE")?.sourceReference); }
const manufacturerHosts: Record<string, string[]> = { ubiquiti: ["ui.com", "ubiquiti.com"], cudy: ["cudy.com"], reyee: ["reyee.com", "ruijienetworks.com"], linkbasic: ["linkbasic.com"], fanvil: ["fanvil.com"], mikrotik: ["mikrotik.com"] };
function trustedSourceUrl(value: string | undefined, type: ScoopEvidenceSourceType, manufacturer?: string) {
  if (type === "APPROVED_SOURCE_CAPTURE" && !value) return undefined;
  let url: URL; try { url = new URL(value ?? ""); } catch { return undefined; }
  if (url.protocol !== "https:") return undefined;
  if (type === "SCOOP_PRODUCT_PAGE") return canonicalScoopUrl(url.href);
  const allowed = manufacturerHosts[identity(manufacturer)];
  return allowed?.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)) ? url.href : undefined;
}
function measurementConflict(existing: ScoopLogisticsMetadata | undefined, proposed: ScoopComponentMeasurement | undefined) {
  if (!existing || !proposed) return undefined;
  const different = existing.weightGrams !== proposed.weightGrams || existing.lengthMm !== proposed.lengthMm || existing.widthMm !== proposed.widthMm || existing.heightMm !== proposed.heightMm;
  return different ? { existing: { label: "Existing", weightGrams: existing.weightGrams, lengthMm: existing.lengthMm, widthMm: existing.widthMm, heightMm: existing.heightMm }, proposed, existingSource: existing.sourceReference } : undefined;
}
export function extractScoopHardwareRevision(supplierSku: string, content: string) {
  return supplierSku === "CD-WR1200" ? clean(content).match(/\bWR1200\s+(\d+(?:\.\d+)?)\b/i)?.[1] : undefined;
}

export async function previewScoopPageLogistics(input: { supplierSku: string; sourceUrl?: string; sourceType?: ScoopEvidenceSourceType; content: string }): Promise<ScoopPageLogisticsPreview> {
  if (Buffer.byteLength(input.content, "utf8") > SCOOP_PAGE_SOURCE_MAX_BYTES) throw Object.assign(new Error("Scoop page source exceeds the 900 KB limit."), { code: "SOURCE_TOO_LARGE", status: 413 });
  const product = await getScoopCatalogueProduct(input.supplierSku); if (!product) throw new Error("Scoop product not found.");
  const sourceType = input.sourceType ?? "SCOOP_PRODUCT_PAGE"; const candidateUrl = input.sourceUrl ?? (sourceType === "SCOOP_PRODUCT_PAGE" ? knownUrl(product) : undefined); const sourceUrl = trustedSourceUrl(candidateUrl, sourceType, product.manufacturer);
  if (!sourceUrl && sourceType !== "APPROVED_SOURCE_CAPTURE") return { supplierSku: product.supplierSku, sourceUrl: input.sourceUrl ?? "", sourceType, identityConfidence: "LOW", extractionConfidence: "LOW", components: [], status: "MISSING", blocker: "PRODUCT_URL_UNKNOWN", contentFingerprint: createHash("sha256").update(input.content).digest("hex"), missingEvidence: ["Trusted authoritative source URL"] };
  const parsed = parseScoopPageLogistics(input.content); const pageSku = parsed.text.match(/\bSKU\s*:?\s*([A-Z0-9][A-Z0-9._/-]*)/i)?.[1];
  const normalizedText = identity(parsed.text); const exactSku = pageSku?.toUpperCase() === product.supplierSku.toUpperCase(); const knownScoopIdentity = sourceType === "SCOOP_PRODUCT_PAGE" && knownUrl(product) === sourceUrl && normalizedText.includes(identity(product.supplierSku)) && (!product.manufacturer || normalizedText.includes(identity(product.manufacturer)));
  const identityMatches = exactSku || knownScoopIdentity;
  const contentFingerprint = createHash("sha256").update(`${sourceType}\n${sourceUrl ?? "approved-capture"}\n${input.content}`).digest("hex");
  if (!identityMatches) return { supplierSku: product.supplierSku, sourceUrl: sourceUrl ?? "", sourceType, identityConfidence: "LOW", extractionConfidence: "LOW", components: parsed.components, status: "MISSING", blocker: pageSku ? "IDENTITY_MISMATCH" : "IDENTITY_LOW_CONFIDENCE", contentFingerprint, missingEvidence: [pageSku ? "Exact matching SKU/model" : "Exact SKU identity"] };
  const revision = extractScoopHardwareRevision(product.supplierSku, input.content);
  if (product.supplierSku === "CD-WR1200" && !revision) return { supplierSku: product.supplierSku, sourceUrl: sourceUrl ?? "", sourceType, identityConfidence: "HIGH", extractionConfidence: "LOW", components: parsed.components, status: "MISSING", blocker: "IDENTITY_LOW_CONFIDENCE", contentFingerprint, missingEvidence: ["Exact WR1200 hardware revision"] };
  const ambiguous = parsed.components.length > 1 && !parsed.package && !parsed.product;
  const selected = parsed.package ?? parsed.product; const status = selected ? deriveScoopLogisticsStatus(selected) : "MISSING";
  const missingEvidence = selected ? [selected.weightGrams === undefined && "Weight", (!selected.lengthMm || !selected.widthMm || !selected.heightMm) && "Complete dimensions"].filter((value): value is string => Boolean(value)) : ["Weight and dimensions"];
  const content = sourceType === "SCOOP_PRODUCT_PAGE" && sourceUrl ? parseScoopProductContent(input.content, sourceUrl) : undefined;
  return { supplierSku: product.supplierSku, sourceUrl: sourceUrl ?? "", sourceType, identityConfidence: "HIGH", extractionConfidence: ambiguous ? "MEDIUM" : selected ? "HIGH" : "LOW", product: parsed.product, package: parsed.package, components: parsed.components, shippingBasis: parsed.package ? "PACKAGE" : parsed.product ? "PRODUCT_DIMENSIONS_FALLBACK" : undefined, status, blocker: ambiguous ? "AMBIGUOUS_MULTI_COMPONENT" : selected || revision ? undefined : "MEASUREMENTS_NOT_FOUND", contentFingerprint, confirmedHardwareRevision: revision, missingEvidence, conflict: measurementConflict(product.logisticsMetadata, selected), contentSuggestions: content ? { overview: Boolean(content.overview), specificationCount: content.specifications.length, documentCount: content.documents.length } : undefined };
}

export async function applyScoopPageLogistics(input: { supplierSku: string; sourceUrl?: string; sourceType?: ScoopEvidenceSourceType; content: string; contentFingerprint: string; actor?: string; confirmConflict?: boolean }) {
  const preview = await previewScoopPageLogistics(input); if (preview.contentFingerprint !== input.contentFingerprint) throw new Error("Scoop page content changed after preview. Preview it again before applying.");
  if (preview.identityConfidence !== "HIGH" || preview.blocker || (!preview.product && !preview.package)) throw new Error(`Scoop page logistics cannot be applied: ${preview.blocker ?? "IDENTITY_LOW_CONFIDENCE"}.`);
  if (preview.conflict && !input.confirmConflict) throw new Error("Authoritative logistics conflict requires explicit staff confirmation.");
  const selected = preview.package ?? preview.product!; const now = new Date().toISOString();
  const source = preview.sourceType === "SCOOP_PRODUCT_PAGE" ? "SUPPLIER_PRODUCT_PAGE" as const : preview.sourceType === "APPROVED_SOURCE_CAPTURE" ? "ADMIN_IMPORT" as const : "MANUFACTURER" as const;
  const sourceReference = preview.sourceUrl || `approved-capture:${preview.supplierSku}`;
  const record: ScoopLogisticsMetadata = { source, sourceReference, productPageUrl: preview.sourceType === "SCOOP_PRODUCT_PAGE" ? preview.sourceUrl : undefined, contentFingerprint: preview.contentFingerprint, capturedAt: now, updatedAt: now, fetchedAt: now, status: deriveScoopLogisticsStatus(selected), weightGrams: preview.product?.weightGrams, lengthMm: preview.product?.lengthMm, widthMm: preview.product?.widthMm, heightMm: preview.product?.heightMm, packageWeightGrams: preview.package?.weightGrams, packageLengthMm: preview.package?.lengthMm, packageWidthMm: preview.package?.widthMm, packageHeightMm: preview.package?.heightMm, actualWeightKg: selected.weightGrams === undefined ? undefined : selected.weightGrams / 1000, volumeM3: selected.lengthMm === undefined ? undefined : selected.lengthMm * selected.widthMm! * selected.heightMm! / 1_000_000_000, identityConfidence: "HIGH", sourceConfidence: "HIGH", extractionConfidence: preview.extractionConfidence, shippingBasis: preview.shippingBasis, measurementScope: preview.package && preview.product ? "PRODUCT_AND_PACKAGE" : preview.package ? "PACKAGE" : "PRODUCT", productSource: preview.product ? source : undefined, packageSource: preview.package ? source : undefined, components: preview.components, rawWeight: selected.rawWeight, rawDimensions: selected.rawDimensions };
  const saved = await saveScoopLogisticsSource({ supplierSku: input.supplierSku, record, actor: input.actor ?? "Scoop page logistics import" });
  if (preview.sourceType === "SCOOP_PRODUCT_PAGE" && preview.sourceUrl) { const urlPreview = await previewScoopStaffUrl({ supplierSku: input.supplierSku, url: preview.sourceUrl, pageContent: input.content }); if (urlPreview.confidence === "HIGH" && ["ADD", "KEEP"].includes(urlPreview.action)) await applyScoopStaffUrl({ supplierSku: input.supplierSku, url: preview.sourceUrl, pageContent: input.content, fingerprint: urlPreview.fingerprint }); }
  const product = await getScoopCatalogueProduct(input.supplierSku); if (product) {
    const content = preview.sourceType === "SCOOP_PRODUCT_PAGE" && preview.sourceUrl ? parseScoopProductContent(input.content, preview.sourceUrl) : undefined;
    await saveScoopCatalogueProduct({ ...product, ...(preview.confirmedHardwareRevision ? { confirmedHardwareRevision: { revision: preview.confirmedHardwareRevision, sourceReference, contentFingerprint: preview.contentFingerprint, confirmedAt: now, confirmedBy: input.actor ?? "TekCentral staff" } } : {}), ...(content && (content.specifications.length || content.documents.length) ? { capturedContentSuggestions: { contentFingerprint: preview.contentFingerprint, sourceUrl: preview.sourceUrl, capturedAt: now, specifications: content.specifications, documents: content.documents } } : {}), logisticsLastAttemptAt: now, logisticsLastError: undefined, logisticsLastFailure: product.logisticsMetadata?.status === "COMPLETE" ? undefined : product.logisticsLastFailure, updatedAt: now });
  }
  return { ...saved, preview };
}

export async function confirmScoopHardwareRevision(input: { supplierSku: string; sourceUrl?: string; sourceType?: ScoopEvidenceSourceType; content: string; contentFingerprint: string; actor?: string }) {
  const preview = await previewScoopPageLogistics(input);
  if (preview.contentFingerprint !== input.contentFingerprint) throw new Error("Revision evidence changed after preview. Preview it again before applying.");
  if (preview.identityConfidence !== "HIGH" || !preview.confirmedHardwareRevision) throw new Error("Exact hardware revision evidence is required.");
  const product = await getScoopCatalogueProduct(input.supplierSku); if (!product) throw new Error("Scoop product not found."); const now = new Date().toISOString(); const sourceReference = preview.sourceUrl || `approved-capture:${preview.supplierSku}`;
  await saveScoopCatalogueProduct({ ...product, confirmedHardwareRevision: { revision: preview.confirmedHardwareRevision, sourceReference, contentFingerprint: preview.contentFingerprint, confirmedAt: now, confirmedBy: input.actor ?? "TekCentral staff" }, logisticsLastAttemptAt: now, logisticsLastError: undefined, logisticsLastFailure: undefined, updatedAt: now });
  if (preview.sourceType === "SCOOP_PRODUCT_PAGE" && preview.sourceUrl) { const urlPreview = await previewScoopStaffUrl({ supplierSku: input.supplierSku, url: preview.sourceUrl, pageContent: input.content }); if (urlPreview.confidence === "HIGH" && ["ADD", "KEEP"].includes(urlPreview.action)) await applyScoopStaffUrl({ supplierSku: input.supplierSku, url: preview.sourceUrl, pageContent: input.content, fingerprint: urlPreview.fingerprint }); }
  const enrichment = await acquireScoopManufacturerLogistics(input.supplierSku);
  return { outcome: "REVISION_CONFIRMED" as const, revision: preview.confirmedHardwareRevision, enrichment, product: await getScoopCatalogueProduct(input.supplierSku) };
}

export async function fetchScoopPageLogistics(input: { supplierSku: string; sourceUrl?: string; fetchImpl?: typeof fetch; actor?: string }) {
  const product = await getScoopCatalogueProduct(input.supplierSku); if (!product) throw new Error("Scoop product not found."); const sourceUrl = canonicalScoopUrl(input.sourceUrl) ?? knownUrl(product);
  const cached = product.logisticsSources?.find((source) => source.source === "SUPPLIER_PRODUCT_PAGE" && Date.now() - new Date(source.fetchedAt).getTime() < CACHE_MS);
  if (cached) return { outcome: "CACHED" as const, product };
  const fail = async (reason: ScoopPageLogisticsFailure, message = reason.replace(/_/g, " ")) => {
    const now = new Date().toISOString();
    await saveScoopCatalogueProduct({ ...product, logisticsLastAttemptAt: now, logisticsLastFailure: reason as ScoopLogisticsFailureReason, logisticsLastError: message, updatedAt: now });
    return { outcome: "FAILED" as const, reason };
  };
  if (!sourceUrl) return fail("PRODUCT_URL_UNKNOWN");
  try {
    const fetched = await fetchPublicScoopProductPage({ url: sourceUrl, fetchImpl: input.fetchImpl });
    if (!("content" in fetched)) return fail(fetched.diagnostic === "TEMPORARY_ERROR" ? "NETWORK_ERROR" : fetched.diagnostic === "PRODUCT_PAGE_NOT_FOUND" ? "SOURCE_UNAVAILABLE" : "SOURCE_BLOCKED", fetched.message);
    const content = fetched.content;
    const canonicalResponseUrl = fetched.canonicalUrl ?? sourceUrl;
    const preview = await previewScoopPageLogistics({ supplierSku: input.supplierSku, sourceUrl: canonicalResponseUrl, content });
    if (preview.blocker) return { ...(await fail(preview.blocker)), preview };
    return { ...(await applyScoopPageLogistics({ supplierSku: input.supplierSku, sourceUrl: canonicalResponseUrl, content, contentFingerprint: preview.contentFingerprint, actor: input.actor })), outcome: "AVAILABLE" as const };
  } catch (error) { return fail("NETWORK_ERROR", error instanceof Error ? error.message : "Scoop page request failed."); }
}

export async function ingestScoopPageLogisticsBatch(input: { skus: string[]; fetchImpl?: typeof fetch }) {
  const skus = [...new Set(input.skus)].slice(0, 25); const results = [];
  for (const supplierSku of skus) {
    results.push({ supplierSku, ...(await fetchScoopPageLogistics({ supplierSku, fetchImpl: input.fetchImpl })) });
    if (supplierSku !== skus.at(-1)) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { requested: skus.length, processed: results.length, results };
}

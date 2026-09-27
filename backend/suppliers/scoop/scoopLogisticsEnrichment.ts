import { getScoopCatalogueProduct, listScoopCatalogueProducts, saveScoopCatalogueProduct, saveScoopLogisticsEnrichmentSummary } from "./scoopCatalogueRepository.js";
import type { ScoopCatalogueProduct, ScoopLogisticsEnrichmentSummary, ScoopLogisticsMetadata, ScoopProductPageResolution } from "./scoopTypes.js";
import { effectiveScoopLogisticsMetadata, upsertScoopLogisticsSource } from "./scoopLogisticsMetadata.js";
import { acquireScoopManufacturerLogistics } from "./scoopManufacturerLogistics.js";
import { listSupplierProductMappings } from "../../supplierProductMappingRepository.js";
import { listPricingProposals } from "../../pricingProposalRepository.js";

const SEARCH_URL = "https://scoop.co.za/catalogsearch/result/?q=";
const FRESH_MS = 30 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;
const BATCH_LIMIT = 25;
const CONCURRENCY = 1;
const REQUEST_DELAY_MS = 500;

function decodeHtml(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'").replace(/&nbsp;/g, " ");
}
function textContent(html: string) {
  return decodeHtml(html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}
export function parseScoopWeight(value?: string) {
  if (!value) return undefined;
  const match = value.trim().match(/^(\d+(?:[.,]\d+)?)\s*(kg|g)\b/i);
  if (!match) return undefined;
  const amount = Number(match[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return Math.round((match[2].toLowerCase() === "kg" ? amount * 1000 : amount) * 1000) / 1000;
}
export function parseScoopDimensions(value?: string) {
  if (!value) return undefined;
  const match = value.trim().match(/(?:[Øø]\s*)?(\d+(?:[.,]\d+)?)\s*(?:mm|cm)?\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(?:mm|cm)?\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm)\b/i);
  if (!match) return undefined;
  const multiplier = match[4].toLowerCase() === "cm" ? 10 : 1;
  const values = [match[1], match[2], match[3]].map((part) => Number(part.replace(",", ".")) * multiplier);
  if (values.some((part) => !Number.isFinite(part) || part <= 0)) return undefined;
  return { lengthMm: values[0], widthMm: values[1], heightMm: values[2] };
}
export function extractScoopLogisticsMetadata(html: string, productPageUrl: string, fetchedAt = new Date().toISOString()): ScoopLogisticsMetadata {
  const text = textContent(html);
  const rawWeight = text.match(/\bWeight\s*:?\s*([0-9][0-9.,]*\s*(?:kg|g)\b)/i)?.[1];
  const rawDimensions = text.match(/\bDimensions?\s*:?\s*((?:[Øø]\s*)?[0-9][0-9.,]*\s*(?:mm|cm)?\s*[x×]\s*[0-9][0-9.,]*\s*(?:mm|cm)?\s*[x×]\s*[0-9][0-9.,]*\s*(?:mm|cm)\b)/i)?.[1];
  const weightGrams = parseScoopWeight(rawWeight);
  const dimensions = parseScoopDimensions(rawDimensions);
  const hadRaw = Boolean(rawWeight || rawDimensions);
  const status = weightGrams && dimensions ? "COMPLETE" : weightGrams ? "WEIGHT_ONLY" : dimensions ? "DIMENSIONS_ONLY" : hadRaw ? "INVALID" : "MISSING";
  return {
    status, source: "SUPPLIER_PRODUCT_PAGE", sourceReference: productPageUrl, capturedAt: fetchedAt, updatedAt: fetchedAt, fetchedAt, productPageUrl,
    ...(weightGrams ? { weightGrams, actualWeightKg: weightGrams / 1000 } : {}),
    ...(dimensions ? { ...dimensions, volumeM3: (dimensions.lengthMm * dimensions.widthMm * dimensions.heightMm) / 1_000_000_000 } : {}),
    ...(rawWeight ? { rawWeight } : {}), ...(rawDimensions ? { rawDimensions } : {}),
  };
}
function canonicalUrl(value: string) {
  try { const url = new URL(decodeHtml(value), "https://scoop.co.za"); return url.hostname === "scoop.co.za" && url.pathname.endsWith(".html") ? `${url.origin}${url.pathname}` : undefined; } catch { return undefined; }
}
export function resolveScoopProductPageFromSearch(html: string, sku: string): ScoopProductPageResolution {
  const now = new Date().toISOString();
  const escapedSku = sku.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exactSku = new RegExp(`\\b${escapedSku}\\b`, "i");
  const productBlocks = [...html.matchAll(/<(?:li|article|div)\b[^>]*class=["'][^"']*(?:product-item|product-card)[^"']*["'][^>]*>[\s\S]*?<\/(?:li|article|div)>/gi)].map((match) => match[0]);
  const relevant = productBlocks.filter((block) => exactSku.test(textContent(block)));
  const links = (relevant.length ? relevant : [html]).flatMap((block) => [...block.matchAll(/<a\b[^>]*href=["']([^"']+\.html(?:\?[^"']*)?)["']/gi)]
    .filter((match) => relevant.length > 0 || exactSku.test(textContent(block.slice(Math.max(0, (match.index ?? 0) - 800), (match.index ?? 0) + match[0].length + 800))))
    .map((match) => canonicalUrl(match[1])).filter((value): value is string => Boolean(value)));
  const unique = [...new Set(links)];
  if (unique.length === 1) return { status: "RESOLVED", productPageUrl: unique[0], resolvedAt: now };
  return { status: unique.length > 1 ? "AMBIGUOUS" : "NOT_FOUND", resolvedAt: now };
}
class ScoopSourceError extends Error {
  constructor(message: string, public transient = false) { super(message); }
}
async function fetchTextOnce(url: string, fetchImpl: typeof fetch) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "TekCentral-Scoop-Logistics/1.0 (+https://tekcentral.co.za)" } });
    if (!response.ok) throw new ScoopSourceError(`HTTP ${response.status}`, response.status === 429 || response.status >= 500);
    const html = await response.text();
    if (/cf-mitigated|Just a moment/i.test(html)) throw new ScoopSourceError("Scoop page access challenge");
    return html;
  } catch (error) {
    if (error instanceof ScoopSourceError) throw error;
    throw new ScoopSourceError(error instanceof Error ? error.message : "Network request failed.", true);
  } finally { clearTimeout(timeout); }
}
async function fetchText(url: string, fetchImpl: typeof fetch) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { return await fetchTextOnce(url, fetchImpl); }
    catch (error) {
      if (!(error instanceof ScoopSourceError) || !error.transient || attempt === 1) throw error;
      await sleep(250 * (2 ** attempt));
    }
  }
  throw new ScoopSourceError("Source temporarily unavailable.", true);
}
function pageSku(html: string) { return textContent(html).match(/\bSKU\s*:?\s*([A-Z0-9][A-Z0-9._/-]*)/i)?.[1]; }
export async function enrichScoopProductLogistics(sku: string, options: { fetchImpl?: typeof fetch; force?: boolean } = {}) {
  let product = await getScoopCatalogueProduct(sku); if (!product) throw new Error("Scoop product not found.");
  if (!options.force && product.logisticsMetadata && Date.now() - Date.parse(product.logisticsMetadata.fetchedAt) < FRESH_MS) return { product, cached: true };
  const fetchImpl = options.fetchImpl ?? fetch; const attemptedAt = new Date().toISOString();
  const manufacturer = await acquireScoopManufacturerLogistics(sku);
  if (manufacturer.outcome !== "FAILED") {
    product = (await getScoopCatalogueProduct(sku)) ?? product;
    if (product.logisticsMetadata?.status === "COMPLETE") {
      const updated = { ...product, logisticsLastAttemptAt: attemptedAt, logisticsLastError: undefined, logisticsLastFailure: undefined, updatedAt: attemptedAt };
      await saveScoopCatalogueProduct(updated); return { product: updated, cached: manufacturer.outcome === "UNCHANGED" };
    }
  }
  try {
    let resolution = product.productPageResolution;
    if (!resolution?.productPageUrl || resolution.status !== "RESOLVED") {
      resolution = resolveScoopProductPageFromSearch(await fetchText(`${SEARCH_URL}${encodeURIComponent(sku)}`, fetchImpl), sku);
    }
    if (resolution.status !== "RESOLVED" || !resolution.productPageUrl) {
      const failure = resolution.status === "AMBIGUOUS" ? "LOW_IDENTITY_CONFIDENCE" as const : manufacturer.outcome === "FAILED" ? manufacturer.reason : "AUTHORITATIVE_SOURCE_NOT_FOUND" as const;
      const updated = { ...product, productPageResolution: resolution, logisticsLastAttemptAt: attemptedAt, logisticsLastError: resolution.status === "AMBIGUOUS" ? "Multiple exact Scoop product pages matched this SKU." : "No exact authoritative product page matched this SKU.", logisticsLastFailure: failure };
      await saveScoopCatalogueProduct(updated); return { product: updated, cached: false };
    }
    const html = await fetchText(resolution.productPageUrl, fetchImpl);
    if (pageSku(html)?.toUpperCase() !== sku.toUpperCase()) throw new Error("Resolved page SKU did not match the requested SKU.");
    const metadata = extractScoopLogisticsMetadata(html, resolution.productPageUrl, attemptedAt);
    const existingSources = product.logisticsSources ?? (product.logisticsMetadata ? [product.logisticsMetadata] : []);
    const sources = upsertScoopLogisticsSource(existingSources, metadata);
    const effective = effectiveScoopLogisticsMetadata(sources);
    const updated: ScoopCatalogueProduct = { ...product, productPageResolution: resolution, logisticsSources: sources, logisticsMetadata: effective, logisticsLastAttemptAt: attemptedAt, logisticsLastError: effective?.status === "COMPLETE" ? undefined : "Authoritative source returned partial logistics data.", logisticsLastFailure: effective?.status === "COMPLETE" ? undefined : "PARTIAL_DATA", updatedAt: attemptedAt };
    await saveScoopCatalogueProduct(updated); return { product: updated, cached: false };
  } catch (error) {
    const resolution: ScoopProductPageResolution = product.productPageResolution?.status === "RESOLVED" ? product.productPageResolution : { status: "ERROR", resolvedAt: attemptedAt, error: error instanceof Error ? error.message : "Product page request failed." };
    const message = error instanceof Error ? error.message : "Product page request failed.";
    const reason = manufacturer.outcome === "FAILED" && manufacturer.reason === "LOW_IDENTITY_CONFIDENCE" ? "LOW_IDENTITY_CONFIDENCE" as const : /challenge|HTTP 401|HTTP 403/.test(message) ? "SOURCE_BLOCKED" as const : /HTTP 429/.test(message) ? "RATE_LIMITED" as const : /abort|network|fetch|HTTP 5/i.test(message) ? "NETWORK_ERROR" as const : /SKU did not match/.test(message) ? "IDENTITY_NOT_RESOLVED" as const : "PARSER_ERROR" as const;
    const updated: ScoopCatalogueProduct = { ...product, productPageResolution: resolution, logisticsLastAttemptAt: attemptedAt, logisticsLastError: message, logisticsLastFailure: reason };
    await saveScoopCatalogueProduct(updated); return { product: updated, cached: false };
  }
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export function selectScoopLogisticsBatchCandidates(input: { catalogue: ScoopCatalogueProduct[]; verified: Set<string>; approved: Set<string>; missingOnly?: boolean; selectedForLaunchOnly?: boolean; verifiedMappingsOnly?: boolean; manufacturer?: string; limit?: number }) {
  return input.catalogue.filter((product) => (!input.missingOnly || product.logisticsMetadata?.status !== "COMPLETE") && (!input.selectedForLaunchOnly || product.launchAssortment?.state === "SELECTED_FOR_LAUNCH") && (!input.verifiedMappingsOnly || input.verified.has(product.supplierSku)) && (!input.manufacturer || product.manufacturer?.toLowerCase() === input.manufacturer.toLowerCase())).sort((a, b) => Number(b.launchAssortment?.state === "SELECTED_FOR_LAUNCH") - Number(a.launchAssortment?.state === "SELECTED_FOR_LAUNCH") || Number(input.verified.has(b.supplierSku)) - Number(input.verified.has(a.supplierSku)) || Number(input.approved.has(b.supplierSku)) - Number(input.approved.has(a.supplierSku))).slice(0, Math.min(input.limit ?? BATCH_LIMIT, BATCH_LIMIT));
}
export async function enrichScoopLogisticsBatch(input: { skus?: string[]; limit?: number; force?: boolean; fetchImpl?: typeof fetch; missingOnly?: boolean; selectedForLaunchOnly?: boolean; verifiedMappingsOnly?: boolean; manufacturer?: string } = {}) {
  const catalogue = await listScoopCatalogueProducts();
  const mappings = await listSupplierProductMappings();
  const proposals = await listPricingProposals();
  const verified = new Set(mappings.filter((mapping) => mapping.supplierCode === "SCOOP" && mapping.status === "VERIFIED").map((mapping) => mapping.supplierSku));
  const approved = new Set(proposals.filter((proposal) => proposal.supplierId === "SCOOP" && proposal.status === "APPROVED").map((proposal) => proposal.supplierOfferId.replace(/^SCOOP:/, "")));
  const eligible = selectScoopLogisticsBatchCandidates({ catalogue, verified, approved, missingOnly: input.missingOnly, selectedForLaunchOnly: input.selectedForLaunchOnly, verifiedMappingsOnly: input.verifiedMappingsOnly, manufacturer: input.manufacturer, limit: input.limit });
  const requested = input.skus?.length ? input.skus : eligible.map((product) => product.supplierSku);
  const skus = [...new Set(requested)].slice(0, Math.min(input.limit ?? BATCH_LIMIT, BATCH_LIMIT));
  const results: { product: ScoopCatalogueProduct; cached: boolean; previousStatus: string; readinessChanged: boolean }[] = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, skus.length) }, async () => {
    while (cursor < skus.length) { const sku = skus[cursor++]; const before = catalogue.find((product) => product.supplierSku === sku); const result = await enrichScoopProductLogistics(sku, input); const previousStatus = before?.logisticsMetadata?.status ?? "MISSING"; results.push({ ...result, previousStatus, readinessChanged: previousStatus !== "COMPLETE" && result.product.logisticsMetadata?.status === "COMPLETE" }); if (cursor < skus.length) await sleep(REQUEST_DELAY_MS); }
  }));
  const currentCatalogue = await listScoopCatalogueProducts();
  const summary: ScoopLogisticsEnrichmentSummary = {
    requested: skus.length, processed: results.length,
    complete: results.filter(({ product }) => product.logisticsMetadata?.status === "COMPLETE").length,
    partial: results.filter(({ product }) => ["WEIGHT_ONLY", "DIMENSIONS_ONLY"].includes(product.logisticsMetadata?.status ?? "")).length,
    missing: results.filter(({ product }) => product.logisticsMetadata?.status === "MISSING" || ["NOT_FOUND", "AMBIGUOUS"].includes(product.productPageResolution?.status ?? "")).length,
    failed: results.filter(({ product }) => product.productPageResolution?.status === "ERROR" || Boolean(product.logisticsLastError && product.productPageResolution?.status === "RESOLVED")).length,
    cached: results.filter((result) => result.cached).length, lastEnrichmentAt: new Date().toISOString(),
    bySource: Object.fromEntries([...new Set(currentCatalogue.map((product) => product.logisticsMetadata?.source ?? "MISSING"))].map((source) => [source, currentCatalogue.filter((product) => (product.logisticsMetadata?.source ?? "MISSING") === source).length])),
    failureReasons: Object.fromEntries([...new Set(currentCatalogue.map((product) => product.logisticsLastFailure).filter(Boolean))].map((reason) => [reason!, currentCatalogue.filter((product) => product.logisticsLastFailure === reason).length])),
    manufacturerCoverage: Object.fromEntries([...new Set(currentCatalogue.map((product) => product.manufacturer).filter(Boolean))].map((manufacturer) => [manufacturer!, { total: currentCatalogue.filter((product) => product.manufacturer === manufacturer).length, complete: currentCatalogue.filter((product) => product.manufacturer === manufacturer && product.logisticsMetadata?.status === "COMPLETE").length }])),
  };
  await saveScoopLogisticsEnrichmentSummary(summary); return { summary, products: results.map(({ product, cached, previousStatus, readinessChanged }) => ({ supplierSku: product.supplierSku, manufacturer: product.manufacturer, model: product.logisticsMetadata?.model, identityConfidence: product.logisticsMetadata?.identityConfidence, source: product.logisticsMetadata?.source, status: product.logisticsMetadata?.status ?? "MISSING", failureReason: product.logisticsLastFailure, shippingBasis: product.logisticsMetadata?.shippingBasis, cached, previousStatus, readinessChanged })) };
}
export function stockedScoopBranches(product: Pick<ScoopCatalogueProduct, "branchStock">) { return (Object.entries(product.branchStock) as ["CPT" | "JHB" | "DBN", number | undefined][]).filter(([, quantity]) => (quantity ?? 0) > 0).map(([branch]) => branch); }

import { createHash } from "node:crypto";

export const TVR_PUBLIC_CATALOGUE_API_URL = "https://www.tvr.co.za/wp-json/wc/store/v1/products";
export const TVR_PUBLIC_CATALOGUE_MAX_PAGES = 100;
export const TVR_PUBLIC_CATALOGUE_MAX_PRODUCTS = 10_000;
export const TVR_PUBLIC_CATALOGUE_PAGE_SIZE = 100;
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const ALLOWED_HOST = "www.tvr.co.za";
const ALLOWED_PATH = "/wp-json/wc/store/v1/products";

export class TvrPublicCatalogueError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export interface TvrPublicCategoryEvidence { id?: number; name: string; slug?: string }
export interface TvrPublicAttributeEvidence { id?: number; name: string; taxonomy?: string; values: string[] }
export interface TvrDeferredImageEvidence { id?: number; url: string; thumbnail?: string; srcset?: string; alt?: string; name?: string; order: number; width?: number; height?: number; fingerprint: string }
export interface TvrDocumentReferenceEvidence { url: string; label?: string; type: "DOCUMENT_REFERENCE" }
export interface TvrPublicProductEvidence {
  productId: number;
  canonicalUrl: string;
  websiteSku: string;
  normalizedSku: string;
  title: string;
  shortDescription?: string;
  longDescription?: string;
  brand?: string;
  categories: TvrPublicCategoryEvidence[];
  attributes: TvrPublicAttributeEvidence[];
  weight?: string;
  dimensions?: { length?: string; width?: string; height?: string };
  documents: TvrDocumentReferenceEvidence[];
  deferredImages: TvrDeferredImageEvidence[];
  sourceModifiedAt?: string;
  fingerprint: string;
}
export interface TvrPublicCatalogueQuarantine { page: number; index: number; productId?: number; reason: string; fingerprint: string }
export interface TvrPublicCatalogueDiagnostics {
  expectedTotal: number;
  expectedPages: number;
  pagesFetched: number;
  normalizedProducts: number;
  quarantined: number;
  duplicateProductIds: number;
  duplicateCanonicalUrls: number;
  duplicateNormalizedSkus: number;
  responseBytes: number;
  termination: "FINAL_PAGE" | "EMPTY_PAGE" | "NO_NEW_PRODUCTS";
}
export interface TvrPublicCatalogueBundle {
  schema: "TVR_PUBLIC_CATALOGUE_V1";
  products: TvrPublicProductEvidence[];
  quarantine: TvrPublicCatalogueQuarantine[];
  diagnostics: TvrPublicCatalogueDiagnostics;
  logicalFingerprint: string;
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const compact = (value: string) => value.normalize("NFKC").replace(/\s+/g, " ").trim();
export const normalizeTvrWebsiteSku = (value: string) => compact(value).toLocaleLowerCase("en-ZA");

const namedEntities: Record<string, string> = { amp: "&", apos: "'", quot: '"', lt: "<", gt: ">", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", trade: "™", reg: "®", copy: "©" };
export function decodeTvrHtmlEntities(value: string) {
  return value.replace(/&#(x?[0-9a-f]+);?/gi, (_, encoded: string) => {
    const point = encoded.toLowerCase().startsWith("x") ? Number.parseInt(encoded.slice(1), 16) : Number.parseInt(encoded, 10);
    return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
  }).replace(/&([a-z]+);/gi, (match, name: string) => namedEntities[name.toLowerCase()] ?? match);
}

export function sanitizeTvrProductHtml(value: unknown) {
  if (typeof value !== "string") return "";
  return compact(decodeTvrHtmlEntities(value
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|iframe)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(?:br|\/p|\/li|\/div|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " "))).replace(/\s+([,.;:!?])/g, "$1");
}

function safeString(value: unknown) { return typeof value === "string" ? compact(value) : ""; }
function safeNumber(value: unknown) { return Number.isInteger(value) && Number(value) > 0 ? Number(value) : undefined; }
function canonicalProductUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== ALLOWED_HOST || !url.pathname.startsWith("/product/")) return undefined;
    url.hash = ""; url.search = "";
    return url.toString();
  } catch { return undefined; }
}
function values(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === "string" ? compact(item) : item && typeof item === "object" ? safeString((item as Record<string, unknown>).name) : "").filter(Boolean);
}
function stableCategories(value: unknown): TvrPublicCategoryEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => item && typeof item === "object" ? item as Record<string, unknown> : {}).map((item) => ({ id: safeNumber(item.id), name: safeString(item.name), slug: safeString(item.slug) || undefined })).filter((item) => item.name).sort((a, b) => `${a.name}\0${a.slug ?? ""}`.localeCompare(`${b.name}\0${b.slug ?? ""}`));
}
function stableAttributes(value: unknown): TvrPublicAttributeEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => item && typeof item === "object" ? item as Record<string, unknown> : {}).map((item) => ({ id: safeNumber(item.id), name: safeString(item.name), taxonomy: safeString(item.taxonomy) || undefined, values: [...new Set(values(item.terms).concat(values(item.options)))].sort() })).filter((item) => item.name && item.values.length).sort((a, b) => a.name.localeCompare(b.name));
}
function documentReferences(...html: string[]) {
  const found = new Map<string, TvrDocumentReferenceEvidence>();
  for (const fragment of html) for (const match of fragment.matchAll(/<a\b[^>]*href=["'](https:\/\/[^"']+\.(?:pdf|docx?|xlsx?)(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try { const url = new URL(decodeTvrHtmlEntities(match[1])); if (url.hostname.toLowerCase() !== ALLOWED_HOST) continue; found.set(url.toString(), { url: url.toString(), label: sanitizeTvrProductHtml(match[2]) || undefined, type: "DOCUMENT_REFERENCE" }); } catch { /* malformed links are ignored */ }
  }
  return [...found.values()].sort((a, b) => a.url.localeCompare(b.url));
}
function deferredImages(value: unknown) {
  if (!Array.isArray(value)) return [];
  const result: TvrDeferredImageEvidence[] = [];
  for (const [order, raw] of value.entries()) {
    const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const candidate = safeString(item.src) || safeString(item.url);
    try {
      const url = new URL(candidate);
      if (url.protocol !== "https:" || url.hostname.toLowerCase() !== ALLOWED_HOST) continue;
      const image = { id: safeNumber(item.id), url: url.toString(), thumbnail: safeString(item.thumbnail) || undefined, srcset: safeString(item.srcset) || undefined, alt: safeString(item.alt) || undefined, name: safeString(item.name) || undefined, order, width: safeNumber(item.width), height: safeNumber(item.height) };
      result.push({ ...image, fingerprint: hash(JSON.stringify(image)) });
    } catch { /* malformed images remain non-actionable */ }
  }
  return result;
}

export function normalizeTvrPublicProduct(raw: unknown): { product?: TvrPublicProductEvidence; reason?: string } {
  const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const productId = safeNumber(item.id), canonicalUrl = canonicalProductUrl(item.permalink), websiteSku = safeString(item.sku);
  if (!productId) return { reason: "MISSING_PRODUCT_ID" };
  if (!canonicalUrl) return { reason: "INVALID_CANONICAL_URL" };
  if (!websiteSku) return { reason: "MISSING_SKU" };
  const normalizedSku = normalizeTvrWebsiteSku(websiteSku);
  if (!normalizedSku || normalizedSku.length > 180 || [...normalizedSku].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  })) return { reason: "MALFORMED_SKU" };
  const title = sanitizeTvrProductHtml(item.name);
  if (!title) return { reason: "MISSING_TITLE" };
  const rawShort = typeof item.short_description === "string" ? item.short_description : "", rawLong = typeof item.description === "string" ? item.description : "";
  const brands = stableCategories(item.brands), categories = stableCategories(item.categories), attributes = stableAttributes(item.attributes);
  const dimensionsRaw = item.dimensions && typeof item.dimensions === "object" ? item.dimensions as Record<string, unknown> : {};
  const dimensions = { length: safeString(dimensionsRaw.length) || undefined, width: safeString(dimensionsRaw.width) || undefined, height: safeString(dimensionsRaw.height) || undefined };
  const logical = {
    productId, canonicalUrl, websiteSku, normalizedSku, title,
    shortDescription: sanitizeTvrProductHtml(rawShort) || undefined,
    longDescription: sanitizeTvrProductHtml(rawLong) || undefined,
    brand: brands[0]?.name,
    categories,
    attributes,
    weight: safeString(item.weight) || undefined,
    dimensions: Object.values(dimensions).some(Boolean) ? dimensions : undefined,
    documents: documentReferences(rawShort, rawLong),
    sourceModifiedAt: safeString(item.modified_gmt) || safeString(item.date_modified_gmt) || undefined,
  };
  return { product: { ...logical, deferredImages: deferredImages(item.images), fingerprint: hash(JSON.stringify(logical)) } };
}

function assertApiUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== ALLOWED_HOST || url.pathname !== ALLOWED_PATH || url.username || url.password || url.port) throw new TvrPublicCatalogueError("SOURCE_PATH_NOT_ALLOWED", "TVR public catalogue requests must use the approved Store API path.");
  return url;
}
async function fetchPage(url: URL, fetcher: typeof fetch, timeoutMs: number, maxResponseBytes: number) {
  let response: Response;
  try { response = await fetcher(url, { method: "GET", redirect: "manual", headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) }); }
  catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "AbortError" || name === "TimeoutError") throw new TvrPublicCatalogueError("SOURCE_TIMEOUT", "TVR Store API request timed out.");
    throw new TvrPublicCatalogueError("SOURCE_UNAVAILABLE", "TVR Store API request failed.");
  }
  if ([301, 302, 303, 307, 308].includes(response.status)) throw new TvrPublicCatalogueError("SOURCE_REDIRECT_NOT_ALLOWED", "TVR Store API redirected outside the canonical request contract.");
  if (!response.ok) throw new TvrPublicCatalogueError("SOURCE_UNAVAILABLE", `TVR Store API returned HTTP ${response.status}.`);
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("application/json")) throw new TvrPublicCatalogueError("SOURCE_MIME_MISMATCH", "TVR Store API did not return JSON.");
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxResponseBytes) throw new TvrPublicCatalogueError("SOURCE_RESPONSE_TOO_LARGE", "A TVR Store API page exceeded the response limit.");
  const text = await response.text();
  if (Buffer.byteLength(text) > maxResponseBytes) throw new TvrPublicCatalogueError("SOURCE_RESPONSE_TOO_LARGE", "A TVR Store API page exceeded the response limit.");
  let parsed: unknown; try { parsed = JSON.parse(text); } catch { throw new TvrPublicCatalogueError("SOURCE_INVALID_JSON", "TVR Store API returned invalid JSON."); }
  if (!Array.isArray(parsed)) throw new TvrPublicCatalogueError("SOURCE_INVALID_SHAPE", "TVR Store API response was not a Product array.");
  return { response, records: parsed, bytes: Buffer.byteLength(text), pageFingerprint: hash(text) };
}

export async function acquireTvrPublicCatalogue(input: { fetch?: typeof fetch; apiUrl?: string; pageSize?: number; maxPages?: number; maxProducts?: number; timeoutMs?: number; maxResponseBytes?: number } = {}): Promise<TvrPublicCatalogueBundle> {
  const fetcher = input.fetch ?? fetch, base = assertApiUrl(input.apiUrl ?? TVR_PUBLIC_CATALOGUE_API_URL);
  const pageSize = Math.max(1, Math.min(100, input.pageSize ?? TVR_PUBLIC_CATALOGUE_PAGE_SIZE));
  const maxPages = Math.max(1, Math.min(TVR_PUBLIC_CATALOGUE_MAX_PAGES, input.maxPages ?? TVR_PUBLIC_CATALOGUE_MAX_PAGES));
  const maxProducts = Math.max(1, Math.min(TVR_PUBLIC_CATALOGUE_MAX_PRODUCTS, input.maxProducts ?? TVR_PUBLIC_CATALOGUE_MAX_PRODUCTS));
  const seenIds = new Set<number>(), seenUrls = new Set<string>(), seenPages = new Set<string>(), skuCounts = new Map<string, number>();
  const products: TvrPublicProductEvidence[] = [], quarantine: TvrPublicCatalogueQuarantine[] = [];
  let expectedTotal = -1, expectedPages = -1, responseBytes = 0, processedRecords = 0, duplicateProductIds = 0, duplicateCanonicalUrls = 0, termination: TvrPublicCatalogueDiagnostics["termination"] = "FINAL_PAGE";
  for (let page = 1; page <= maxPages; page += 1) {
    const url = new URL(base); url.searchParams.set("page", String(page)); url.searchParams.set("per_page", String(pageSize));
    const fetched = await fetchPage(url, fetcher, input.timeoutMs ?? DEFAULT_TIMEOUT_MS, input.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES); responseBytes += fetched.bytes;
    const total = Number(fetched.response.headers.get("x-wp-total")), pages = Number(fetched.response.headers.get("x-wp-totalpages"));
    if (!Number.isInteger(total) || total < 0 || !Number.isInteger(pages) || pages < 0 || pages > maxPages) throw new TvrPublicCatalogueError(pages > maxPages ? "SOURCE_PAGE_LIMIT" : "PAGINATION_METADATA_INVALID", "TVR Store API pagination metadata is invalid or exceeds the configured bound.");
    if (page === 1) { expectedTotal = total; expectedPages = pages; if (total > maxProducts) throw new TvrPublicCatalogueError("SOURCE_PRODUCT_LIMIT", "TVR Store API Product total exceeds the configured bound."); }
    else if (total !== expectedTotal || pages !== expectedPages) throw new TvrPublicCatalogueError("PAGINATION_INCONSISTENT", "TVR Store API pagination changed during acquisition.");
    if (seenPages.has(fetched.pageFingerprint)) throw new TvrPublicCatalogueError("PAGINATION_REPEATED_PAGE", "TVR Store API repeated a page response.");
    seenPages.add(fetched.pageFingerprint);
    if (!fetched.records.length) { if (page <= expectedPages) throw new TvrPublicCatalogueError("PAGINATION_INCOMPLETE", "TVR Store API ended before the reported final page."); termination = "EMPTY_PAGE"; break; }
    let newIds = 0;
    for (const [index, record] of fetched.records.entries()) {
      processedRecords += 1;
      const normalized = normalizeTvrPublicProduct(record);
      if (!normalized.product) { const raw = record && typeof record === "object" ? record as Record<string, unknown> : {}; quarantine.push({ page, index, productId: safeNumber(raw.id), reason: normalized.reason ?? "MALFORMED_PRODUCT", fingerprint: hash(JSON.stringify(record)) }); continue; }
      const product = normalized.product;
      if (seenIds.has(product.productId)) { duplicateProductIds += 1; quarantine.push({ page, index, productId: product.productId, reason: "DUPLICATE_PRODUCT_ID", fingerprint: product.fingerprint }); continue; }
      if (seenUrls.has(product.canonicalUrl)) { duplicateCanonicalUrls += 1; quarantine.push({ page, index, productId: product.productId, reason: "DUPLICATE_CANONICAL_URL", fingerprint: product.fingerprint }); continue; }
      seenIds.add(product.productId); seenUrls.add(product.canonicalUrl); newIds += 1; products.push(product); skuCounts.set(product.normalizedSku, (skuCounts.get(product.normalizedSku) ?? 0) + 1);
      if (products.length > maxProducts) throw new TvrPublicCatalogueError("SOURCE_PRODUCT_LIMIT", "TVR Store API Product records exceeded the configured bound.");
    }
    if (!newIds) { if (page < expectedPages) throw new TvrPublicCatalogueError("PAGINATION_NO_PROGRESS", "TVR Store API produced no new Product identities before the final page."); termination = "NO_NEW_PRODUCTS"; break; }
    if (page >= expectedPages) { termination = "FINAL_PAGE"; break; }
    if (page === maxPages) throw new TvrPublicCatalogueError("SOURCE_PAGE_LIMIT", "TVR Store API did not complete within the page bound.");
  }
  if (processedRecords !== expectedTotal) throw new TvrPublicCatalogueError("PAGINATION_INCOMPLETE", "TVR Store API records did not match the reported Product total.");
  const corruptionThreshold = Math.max(10, Math.ceil(Math.max(expectedTotal, products.length) * 0.02));
  if (duplicateProductIds + duplicateCanonicalUrls > corruptionThreshold) throw new TvrPublicCatalogueError("SOURCE_IDENTITY_CORRUPTION", "TVR Store API contained excessive duplicate Product identities.");
  if (quarantine.filter((item) => !item.reason.startsWith("DUPLICATE_")).length > corruptionThreshold) throw new TvrPublicCatalogueError("SOURCE_MALFORMED_THRESHOLD", "TVR Store API contained excessive malformed Product records.");
  products.sort((a, b) => a.normalizedSku.localeCompare(b.normalizedSku) || a.canonicalUrl.localeCompare(b.canonicalUrl) || a.productId - b.productId);
  quarantine.sort((a, b) => a.page - b.page || a.index - b.index || a.reason.localeCompare(b.reason));
  const duplicateNormalizedSkus = [...skuCounts.values()].filter((count) => count > 1).length;
  const diagnostics: TvrPublicCatalogueDiagnostics = { expectedTotal, expectedPages, pagesFetched: seenPages.size, normalizedProducts: products.length, quarantined: quarantine.length, duplicateProductIds, duplicateCanonicalUrls, duplicateNormalizedSkus, responseBytes, termination };
  const logical = {
    schema: "TVR_PUBLIC_CATALOGUE_V1" as const,
    products: products.map((product) => Object.fromEntries(Object.entries(product).filter(([key]) => key !== "deferredImages"))),
    quarantine,
  };
  return { schema: "TVR_PUBLIC_CATALOGUE_V1", products, quarantine, diagnostics, logicalFingerprint: hash(JSON.stringify(logical)) };
}

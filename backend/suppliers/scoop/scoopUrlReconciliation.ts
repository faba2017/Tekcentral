import { createHash } from "node:crypto";
import { getScoopCatalogueProduct, listScoopCatalogueProducts, saveScoopCatalogueProduct } from "./scoopCatalogueRepository.js";
import type { ScoopCanonicalUrlSource, ScoopCatalogueProduct, ScoopProductPageResolution } from "./scoopTypes.js";
import { effectiveScoopLogisticsMetadata } from "./scoopLogisticsMetadata.js";

export type ScoopUrlAction = "ADD" | "KEEP" | "CHANGE_REVIEW" | "CONFLICT" | "REJECT";
export type ScoopUrlDiagnostic = "INVALID_URL" | "UNSUPPORTED_SCOOP_URL" | "AUTHENTICATED_URL_SUSPECTED" | "URL_RESOLVED" | "FETCH_BLOCKED" | "PRODUCT_PAGE_NOT_FOUND" | "PRODUCT_IDENTITY_MISMATCH" | "MORE_INFORMATION_NOT_FOUND" | "LOGISTICS_NOT_FOUND" | "EXTRACTION_SUCCESS" | "TEMPORARY_ERROR";
export interface ScoopUrlPreviewRow { rowNumber: number; sku: string; currentUrl?: string; proposedUrl?: string; source: ScoopCanonicalUrlSource; confidence: "HIGH" | "MEDIUM" | "LOW"; action: ScoopUrlAction; errors: string[] }

const AUTHENTICATED_PATH = /\/(?:customer|account|checkout|cart|login|wishlist)(?:\/|$)/i;
const SENSITIVE_QUERY = /^(?:sid|session|token|key|customer|account|auth)/i;
const TRACKING_QUERY = /^(?:utm_|gclid$|fbclid$|mc_)/i;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8_000;

export function inspectScoopProductUrl(value?: string): { diagnostic: ScoopUrlDiagnostic; canonicalUrl?: string; message: string } {
  if (!value?.trim()) return { diagnostic: "INVALID_URL", message: "A public Scoop Product URL is required." };
  let url: URL;
  try { url = new URL(value.trim()); } catch { return { diagnostic: "INVALID_URL", message: "Enter a valid HTTPS URL." }; }
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (url.protocol !== "https:" || hostname !== "scoop.co.za") return { diagnostic: "UNSUPPORTED_SCOOP_URL", message: "Only public HTTPS scoop.co.za Product URLs are supported." };
  if (AUTHENTICATED_PATH.test(url.pathname) || [...url.searchParams.keys()].some((key) => SENSITIVE_QUERY.test(key))) return { diagnostic: "AUTHENTICATED_URL_SUSPECTED", message: "This Scoop URL appears to require an authenticated session. Use the public Scoop Product URL." };
  url.hostname = "scoop.co.za"; url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (TRACKING_QUERY.test(key)) url.searchParams.delete(key);
  return { diagnostic: "URL_RESOLVED", canonicalUrl: url.toString(), message: "Public Scoop Product URL resolved." };
}

export function normalizeScoopProductUrl(value?: string) {
  return inspectScoopProductUrl(value).canonicalUrl;
}

async function boundedText(response: Response) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_HTML_BYTES) throw new Error("RESPONSE_TOO_LARGE");
  if (!response.body) return "";
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; if (!value) continue; total += value.byteLength; if (total > MAX_HTML_BYTES) { await reader.cancel(); throw new Error("RESPONSE_TOO_LARGE"); } chunks.push(value); }
  const merged = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(merged);
}

export async function fetchPublicScoopProductPage(input: { url: string; fetchImpl?: typeof fetch; timeoutMs?: number }) {
  const inspected = inspectScoopProductUrl(input.url);
  if (!inspected.canonicalUrl) return inspected;
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? FETCH_TIMEOUT_MS);
  try {
    let current = inspected.canonicalUrl;
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      const response = await (input.fetchImpl ?? fetch)(current, { redirect: "manual", signal: controller.signal, headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "TekCentral-Scoop-Product/1.0 (+https://tekcentral.co.za)" } });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location"); if (!location) return { diagnostic: "PRODUCT_PAGE_NOT_FOUND" as const, canonicalUrl: current, message: "Scoop returned a redirect without a destination." };
        const next = inspectScoopProductUrl(new URL(location, current).toString());
        if (!next.canonicalUrl) return { ...next, diagnostic: next.diagnostic === "AUTHENTICATED_URL_SUSPECTED" ? next.diagnostic : "FETCH_BLOCKED" as const };
        current = next.canonicalUrl; continue;
      }
      if (response.status === 401 || response.status === 403 || response.status === 429) return { diagnostic: "FETCH_BLOCKED" as const, canonicalUrl: current, message: `Scoop public-page fetch was blocked (HTTP ${response.status}).` };
      if (response.status === 404) return { diagnostic: "PRODUCT_PAGE_NOT_FOUND" as const, canonicalUrl: current, message: "The Scoop Product page was not found." };
      if (!response.ok) return { diagnostic: "TEMPORARY_ERROR" as const, canonicalUrl: current, message: `Scoop returned HTTP ${response.status}.` };
      const contentType = response.headers.get("content-type") ?? ""; if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) return { diagnostic: "FETCH_BLOCKED" as const, canonicalUrl: current, message: "Scoop did not return an HTML Product page." };
      const content = await boundedText(response); if (/cloudflare|cf-mitigated|just a moment|challenge/i.test(content)) return { diagnostic: "FETCH_BLOCKED" as const, canonicalUrl: current, message: "Scoop returned a public-page access challenge." };
      return { diagnostic: "URL_RESOLVED" as const, canonicalUrl: normalizeScoopProductUrl(response.url) ?? current, message: "Public Scoop Product page fetched.", content };
    }
    return { diagnostic: "FETCH_BLOCKED" as const, canonicalUrl: current, message: "Scoop exceeded the safe redirect limit." };
  } catch (error) {
    return { diagnostic: "TEMPORARY_ERROR" as const, canonicalUrl: inspected.canonicalUrl, message: error instanceof Error && error.name === "AbortError" ? "Scoop Product page request timed out." : "Scoop Product page could not be fetched safely." };
  } finally { clearTimeout(timeout); }
}

function rowsFromInput(content: string) {
  const trimmed = content.trim(); if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as unknown; const records = Array.isArray(parsed) ? parsed : (parsed as { products?: unknown[] }).products;
    if (!Array.isArray(records)) throw new Error("URL import JSON must be an array or contain a products array.");
    return records.map((record) => { const row = record as Record<string, unknown>; return { sku: String(row.sku ?? ""), url: String(row.canonicalProductUrl ?? row.productUrl ?? row.product_url ?? row.url ?? ""), observedSku: String(row.observedSku ?? row.pageSku ?? row.page_sku ?? "") }; });
  }
  const lines = trimmed.split(/\r?\n/).filter(Boolean); const headers = lines.shift()?.split(",").map((item) => item.trim().toLowerCase().replace(/[^a-z0-9]/g, "")) ?? [];
  const skuIndex = headers.findIndex((item) => item === "sku"); const urlIndex = headers.findIndex((item) => ["url", "producturl", "canonicalproducturl"].includes(item)); const observedSkuIndex = headers.findIndex((item) => ["observedsku", "pagesku"].includes(item));
  return lines.map((line) => { const values = line.split(",").map((item) => item.trim().replace(/^"|"$/g, "")); return { sku: values[skuIndex] ?? "", url: values[urlIndex] ?? "", observedSku: observedSkuIndex < 0 ? "" : values[observedSkuIndex] ?? "" }; });
}

function currentStatus(product: ScoopCatalogueProduct) {
  if (product.productPageResolution?.urlStatus) return product.productPageResolution.urlStatus;
  return product.productPageResolution?.status === "RESOLVED" && product.productPageResolution.productPageUrl ? "VERIFIED" as const : "UNKNOWN" as const;
}

export async function previewScoopUrlImport(content: string, source: ScoopCanonicalUrlSource = "TRUSTED_IMPORT") {
  const catalogue = await listScoopCatalogueProducts(); const bySku = new Map(catalogue.map((product) => [product.supplierSku.toUpperCase(), product]));
  const claimedUrls = new Map(catalogue.map((product) => [normalizeScoopProductUrl(product.productPageResolution?.productPageUrl), product.supplierSku]).filter((entry): entry is [string, string] => Boolean(entry[0])));
  const raw = rowsFromInput(content); const skuCounts = new Map<string, number>(); const urlSkus = new Map<string, Set<string>>();
  for (const row of raw) { const sku = row.sku.trim().toUpperCase(); const url = normalizeScoopProductUrl(row.url); skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1); if (url) { const skus = urlSkus.get(url) ?? new Set<string>(); skus.add(sku); urlSkus.set(url, skus); } }
  const rows: ScoopUrlPreviewRow[] = raw.map((rawRow, index) => {
    const sku = rawRow.sku.trim().toUpperCase(); const observedSku = rawRow.observedSku.trim().toUpperCase(); const proposedUrl = normalizeScoopProductUrl(rawRow.url); const product = bySku.get(sku); const currentUrl = normalizeScoopProductUrl(product?.productPageResolution?.productPageUrl); const errors: string[] = [];
    if (!sku) errors.push("SKU is required."); if (!product && sku) errors.push("Unknown Scoop SKU."); if (!proposedUrl) errors.push("Canonical URL must be a valid HTTPS scoop.co.za product URL.");
    if ((skuCounts.get(sku) ?? 0) > 1) { const urls = new Set(raw.filter((row) => row.sku.trim().toUpperCase() === sku).map((row) => normalizeScoopProductUrl(row.url)).filter(Boolean)); if (urls.size > 1) errors.push("One SKU maps to conflicting Scoop URLs."); }
    if (proposedUrl && (urlSkus.get(proposedUrl)?.size ?? 0) > 1) errors.push("One Scoop URL maps to conflicting SKUs.");
    if (proposedUrl && claimedUrls.has(proposedUrl) && claimedUrls.get(proposedUrl) !== sku) errors.push("This Scoop URL is already verified for another SKU conflict.");
    if (observedSku && observedSku !== sku) errors.push(`Observed page SKU ${observedSku} conflicts with ${sku}.`);
    const confidence = observedSku === sku ? "HIGH" as const : "MEDIUM" as const;
    const action: ScoopUrlAction = errors.length ? (errors.some((error) => /conflict/i.test(error)) ? "CONFLICT" : "REJECT") : confidence !== "HIGH" ? "CHANGE_REVIEW" : currentUrl === proposedUrl ? "KEEP" : currentUrl ? "CHANGE_REVIEW" : "ADD";
    return { rowNumber: index + 2, sku, currentUrl, proposedUrl, source, confidence, action, errors };
  });
  return { fingerprint: createHash("sha256").update(content).digest("hex"), rows, summary: Object.fromEntries(["ADD", "KEEP", "CHANGE_REVIEW", "CONFLICT", "REJECT"].map((action) => [action.toLowerCase(), rows.filter((row) => row.action === action).length])) };
}

function nextResolution(product: ScoopCatalogueProduct, url: string, source: ScoopCanonicalUrlSource, now: string): ScoopProductPageResolution {
  const previous = product.productPageResolution; const history = previous?.productPageUrl && previous.productPageUrl !== url ? [{ url: previous.productPageUrl, source: previous.urlSource ?? "PREVIOUSLY_VERIFIED" as const, status: previous.urlStatus ?? "VERIFIED" as const, observedAt: previous.verifiedAt ?? previous.resolvedAt }, ...(previous.history ?? [])] : previous?.history;
  return { status: "RESOLVED", productPageUrl: url, resolvedAt: previous?.resolvedAt ?? now, urlStatus: "VERIFIED", urlSource: source, urlIdentityConfidence: "HIGH", verifiedAt: now, lastCheckedAt: now, history };
}

export async function applyScoopUrlImport(content: string, fingerprint: string, source: ScoopCanonicalUrlSource = "TRUSTED_IMPORT") {
  const preview = await previewScoopUrlImport(content, source); if (preview.fingerprint !== fingerprint) throw new Error("URL import changed after preview. Preview it again before applying.");
  const unsafe = preview.rows.filter((row) => !["ADD", "KEEP"].includes(row.action)); if (unsafe.length) throw new Error("URL import contains rejected, conflicting, or review-required mappings.");
  let added = 0; let unchanged = 0; const now = new Date().toISOString();
  for (const row of preview.rows) { const product = await getScoopCatalogueProduct(row.sku); if (!product || !row.proposedUrl) continue; if (row.action === "KEEP" && currentStatus(product) === "VERIFIED") { unchanged += 1; continue; } await saveScoopCatalogueProduct({ ...product, productPageResolution: nextResolution(product, row.proposedUrl, source, now), updatedAt: now }); added += 1; }
  return { added, unchanged, preview };
}

export async function previewScoopStaffUrl(input: { supplierSku: string; url: string; pageContent?: string }) {
  const product = await getScoopCatalogueProduct(input.supplierSku); if (!product) throw new Error("Scoop product not found.");
  const inspected = inspectScoopProductUrl(input.url); const proposedUrl = inspected.canonicalUrl; const currentUrl = normalizeScoopProductUrl(product.productPageResolution?.productPageUrl); const pageSku = input.pageContent?.match(/\bSKU\s*:?\s*([A-Z0-9][A-Z0-9._/-]*)/i)?.[1]?.toUpperCase();
  const errors: string[] = []; if (!proposedUrl) errors.push(inspected.message); if (pageSku && pageSku !== product.supplierSku.toUpperCase()) errors.push("Page SKU does not match this Scoop offer.");
  const confidence = pageSku === product.supplierSku.toUpperCase() ? "HIGH" as const : "MEDIUM" as const;
  const action: ScoopUrlAction = errors.length ? "REJECT" : confidence !== "HIGH" ? "CHANGE_REVIEW" : currentUrl === proposedUrl ? "KEEP" : currentUrl ? "CHANGE_REVIEW" : "ADD";
  return { supplierSku: product.supplierSku, currentUrl, proposedUrl, source: "STAFF_PROVIDED" as const, confidence, action, errors, diagnostic: inspected.diagnostic, fingerprint: createHash("sha256").update(`${product.supplierSku}\n${input.url}\n${input.pageContent ?? ""}`).digest("hex") };
}

export async function applyScoopStaffUrl(input: { supplierSku: string; url: string; pageContent: string; fingerprint: string }) {
  const preview = await previewScoopStaffUrl(input); if (preview.fingerprint !== input.fingerprint) throw new Error("URL verification changed after preview. Preview it again before applying.");
  if (preview.confidence !== "HIGH" || !["ADD", "KEEP"].includes(preview.action) || !preview.proposedUrl) throw new Error("Staff URL requires exact page SKU verification and must not conflict with an existing URL.");
  const product = await getScoopCatalogueProduct(input.supplierSku); if (!product) throw new Error("Scoop product not found."); const now = new Date().toISOString();
  if (preview.action === "KEEP" && product.productPageResolution?.urlStatus === "VERIFIED") return { outcome: "UNCHANGED" as const, product };
  const saved = await saveScoopCatalogueProduct({ ...product, productPageResolution: nextResolution(product, preview.proposedUrl, "STAFF_PROVIDED", now), updatedAt: now });
  return { outcome: "VERIFIED" as const, product: saved };
}

export async function quarantineScoopCanonicalUrl(input: { supplierSku: string; observedSku: string; reason: string }) {
  const product = await getScoopCatalogueProduct(input.supplierSku); if (!product?.productPageResolution?.productPageUrl) throw new Error("Canonical Scoop URL is not present.");
  if (input.observedSku.trim().toUpperCase() === product.supplierSku.toUpperCase()) throw new Error("Observed page SKU matches; quarantine is not required.");
  const now = new Date().toISOString(); const previous = product.productPageResolution; const previousUrl = previous.productPageUrl!; const logisticsSources = product.logisticsSources?.filter((source) => source.source !== "SUPPLIER_PRODUCT_PAGE");
  return saveScoopCatalogueProduct({ ...product, productPageResolution: { ...previous, urlStatus: "CONFLICT", urlIdentityConfidence: "LOW", lastCheckedAt: now, error: input.reason, history: [{ url: previousUrl, source: previous.urlSource ?? "PREVIOUSLY_VERIFIED", status: previous.urlStatus ?? "VERIFIED", observedAt: previous.verifiedAt ?? previous.resolvedAt }, ...(previous.history ?? [])] }, logisticsSources, logisticsMetadata: effectiveScoopLogisticsMetadata(logisticsSources), updatedAt: now });
}

export async function backfillScoopCanonicalUrls() {
  const catalogue = await listScoopCatalogueProducts(); let verified = 0; let unchanged = 0; let conflicts = 0;
  for (const product of catalogue) {
    const observations = product.sourceObservations.filter((item) => item.sourceType === "WEBSITE" && item.active).map((item) => normalizeScoopProductUrl(item.fields.productUrl ?? item.sourceReference)).filter((url): url is string => Boolean(url)); const unique = [...new Set(observations)];
    if (!unique.length) continue;
    const websiteObservation = product.sourceObservations.find((item) => item.sourceType === "WEBSITE" && item.active && normalizeScoopProductUrl(item.fields.productUrl ?? item.sourceReference) === unique[0]); const observedSku = websiteObservation?.fields.pageSku ?? websiteObservation?.fields.observedSku;
    if (product.reconciliationStatus === "SOURCE_MISMATCH" || observedSku?.toUpperCase() !== product.supplierSku.toUpperCase()) { const now = new Date().toISOString(); await saveScoopCatalogueProduct({ ...product, productPageResolution: { ...(product.productPageResolution ?? { status: "AMBIGUOUS", resolvedAt: now }), productPageUrl: unique[0], urlStatus: "REVIEW_REQUIRED", urlSource: "WEBSITE_OBSERVATION", urlIdentityConfidence: "LOW", lastCheckedAt: now, error: product.reconciliationStatus === "SOURCE_MISMATCH" ? "Website identity conflicts with the XML offer." : "Website observation does not contain an exact observed page SKU." }, updatedAt: now }); continue; }
    if (unique.length > 1 || (product.productPageResolution?.productPageUrl && !unique.includes(normalizeScoopProductUrl(product.productPageResolution.productPageUrl)!))) { const now = new Date().toISOString(); await saveScoopCatalogueProduct({ ...product, productPageResolution: { ...(product.productPageResolution ?? { status: "AMBIGUOUS", resolvedAt: now }), urlStatus: "CONFLICT", urlSource: "WEBSITE_OBSERVATION", urlIdentityConfidence: "LOW", lastCheckedAt: now, error: "Trusted website observations contain conflicting canonical URLs." }, updatedAt: now }); conflicts += 1; continue; }
    if (currentStatus(product) === "VERIFIED" && normalizeScoopProductUrl(product.productPageResolution?.productPageUrl) === unique[0]) { unchanged += 1; continue; }
    const now = new Date().toISOString(); await saveScoopCatalogueProduct({ ...product, productPageResolution: nextResolution(product, unique[0], "WEBSITE_OBSERVATION", now), updatedAt: now }); verified += 1;
  }
  return { verified, unchanged, conflicts };
}

export async function getScoopUrlMetrics() {
  const catalogue = await listScoopCatalogueProducts(); const status = (product: ScoopCatalogueProduct) => currentStatus(product);
  return { total: catalogue.length, verified: catalogue.filter((product) => status(product) === "VERIFIED").length, reviewRequired: catalogue.filter((product) => status(product) === "REVIEW_REQUIRED").length, unknown: catalogue.filter((product) => status(product) === "UNKNOWN").length, conflict: catalogue.filter((product) => status(product) === "CONFLICT").length, selectedVerified: catalogue.filter((product) => product.launchAssortment?.state === "SELECTED_FOR_LAUNCH" && status(product) === "VERIFIED").length, selectedMissing: catalogue.filter((product) => product.launchAssortment?.state === "SELECTED_FOR_LAUNCH" && status(product) !== "VERIFIED").length };
}

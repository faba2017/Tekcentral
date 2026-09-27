import { createHash, randomUUID } from "node:crypto";
import { applyScoopWebsiteProducts } from "./scoopCatalogueRepository.js";
import type { ScoopWebsiteImportPreviewRow, ScoopWebsiteImportRow } from "./scoopTypes.js";

export interface ScoopWebsiteDiscoveryProvider {
  mode: "SAFE_DIRECT_DISCOVERY" | "MANUAL_WEBSITE_IMPORT";
  discover(): Promise<{ products: ScoopWebsiteImportRow[]; status: number; contentType?: string; bodySample?: string }>;
}

export async function discoverScoopWebsiteProducts(provider: ScoopWebsiteDiscoveryProvider) {
  const result = await provider.discover();
  const challenged = result.status === 403 || /cloudflare|cf-mitigated|just a moment|challenge/i.test(`${result.contentType ?? ""} ${result.bodySample ?? ""}`);
  if (challenged) return { status: "SOURCE_UNAVAILABLE" as const, reason: "Scoop website protection prevented safe direct discovery.", products: [] as ScoopWebsiteImportRow[] };
  if (result.status < 200 || result.status >= 300) return { status: "SOURCE_UNAVAILABLE" as const, reason: `Scoop website discovery returned HTTP ${result.status}.`, products: [] as ScoopWebsiteImportRow[] };
  return { status: "AVAILABLE" as const, products: result.products };
}

function csvRows(input: string) {
  const rows: string[][] = []; let row: string[] = []; let value = ""; let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"' && quoted && input[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(value.trim()); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      row.push(value.trim()); value = ""; if (row.some(Boolean)) rows.push(row); row = [];
    } else value += char;
  }
  row.push(value.trim()); if (row.some(Boolean)) rows.push(row); return rows;
}

function safeUrl(value?: string) {
  if (!value) return undefined;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.toString() : undefined; } catch { return undefined; }
}

function readRows(input: string): ScoopWebsiteImportRow[] {
  const trimmed = input.trim(); if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as unknown; const records = Array.isArray(parsed) ? parsed : (parsed as { products?: unknown[] }).products;
    if (!Array.isArray(records)) throw new Error("Website import JSON must be an array or contain a products array.");
    return records.map((record) => { const item = record as Record<string, unknown>; return { sku: String(item.sku ?? "").trim(), title: String(item.title ?? "").trim(), manufacturer: String(item.manufacturer ?? "").trim() || undefined, productUrl: String(item.product_url ?? item.productUrl ?? "").trim() || undefined, imageUrl: String(item.image_url ?? item.imageUrl ?? "").trim() || undefined, category: String(item.category ?? "").trim() || undefined, supplierCode: String(item.supplier_code ?? item.supplierCode ?? "").trim() || undefined }; });
  }
  const rows = csvRows(trimmed); const headers = rows.shift()?.map((header) => header.toLowerCase().replace(/[^a-z0-9]/g, "")) ?? [];
  const value = (row: string[], aliases: string[]) => { const index = headers.findIndex((header) => aliases.includes(header)); return index < 0 ? undefined : row[index]?.trim() || undefined; };
  return rows.map((row) => ({ sku: value(row, ["sku"]) ?? "", title: value(row, ["title", "name", "description"]) ?? "", manufacturer: value(row, ["manufacturer", "brand"]), productUrl: value(row, ["producturl", "url"]), imageUrl: value(row, ["imageurl", "image"]), category: value(row, ["category"]), supplierCode: value(row, ["suppliercode", "model"]) }));
}

export function previewScoopWebsiteImport(input: string) {
  const parsed = readRows(input); const counts = new Map(parsed.map((row) => [row.sku.toUpperCase(), 0]));
  for (const row of parsed) counts.set(row.sku.toUpperCase(), (counts.get(row.sku.toUpperCase()) ?? 0) + 1);
  const rows: ScoopWebsiteImportPreviewRow[] = parsed.map((row, index) => {
    const errors: string[] = []; const sku = row.sku.trim().toUpperCase(); const title = row.title.trim();
    if (!sku) errors.push("SKU is required."); if (!title) errors.push("Title is required.");
    if (sku && (counts.get(sku) ?? 0) > 1) errors.push("Duplicate SKU in this import.");
    if (row.productUrl && !safeUrl(row.productUrl)) errors.push("Product URL must use HTTP or HTTPS.");
    if (row.imageUrl && !safeUrl(row.imageUrl)) errors.push("Image URL must use HTTP or HTTPS.");
    return { ...row, sku, title, productUrl: safeUrl(row.productUrl), imageUrl: safeUrl(row.imageUrl), rowNumber: index + 2, status: errors.length ? "REJECTED" : "VALID", errors };
  });
  const importFingerprint = createHash("sha256").update(input).digest("hex");
  return { importFingerprint, rows, summary: { rowsRead: rows.length, valid: rows.filter((row) => row.status === "VALID").length, rejected: rows.filter((row) => row.status === "REJECTED").length } };
}

export async function applyScoopWebsiteImport(input: string, importFingerprint: string) {
  const preview = previewScoopWebsiteImport(input);
  if (preview.importFingerprint !== importFingerprint) throw new Error("Website import changed after preview. Preview it again before applying.");
  if (preview.summary.rejected) throw new Error("Website import contains rejected rows.");
  const batchId = `scoop-web-${randomUUID()}`;
  return applyScoopWebsiteProducts(preview.rows.map((row) => ({ sku: row.sku, title: row.title, manufacturer: row.manufacturer, productUrl: row.productUrl, imageUrl: row.imageUrl, category: row.category, supplierCode: row.supplierCode })), batchId);
}

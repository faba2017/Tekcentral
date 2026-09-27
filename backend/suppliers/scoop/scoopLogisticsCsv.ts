import { createHash, randomUUID } from "node:crypto";
import { listScoopCatalogueProducts, saveScoopLogisticsSource } from "./scoopCatalogueRepository.js";
import { deriveScoopLogisticsStatus, validateScoopLogisticsValues } from "./scoopLogisticsMetadata.js";
import type { ScoopLogisticsMetadata } from "./scoopTypes.js";

const requiredHeaders = ["sku", "weight_grams", "length_mm", "width_mm", "height_mm"];
function parseRows(csv: string) {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (char === '"' && quoted && csv[index + 1] === '"') { field += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(field.trim()); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && csv[index + 1] === "\n") index += 1; row.push(field.trim()); if (row.some(Boolean)) rows.push(row); row = []; field = ""; }
    else field += char;
  }
  row.push(field.trim()); if (row.some(Boolean)) rows.push(row); return rows;
}
function number(value: string) { if (!value) return undefined; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : Number.NaN; }
export interface ScoopCsvPreviewRow { rowNumber: number; sku: string; values: { weightGrams?: number; lengthMm?: number; widthMm?: number; heightMm?: number }; status?: ScoopLogisticsMetadata["status"]; errors: string[]; }
export async function previewScoopLogisticsCsv(csv: string) {
  const rows = parseRows(csv); if (!rows.length) throw new Error("CSV file is empty.");
  const headers = rows[0].map((value) => value.toLowerCase());
  if (headers.length !== requiredHeaders.length || requiredHeaders.some((header, index) => headers[index] !== header)) throw new Error(`CSV headers must be: ${requiredHeaders.join(",")}`);
  const catalogue = await listScoopCatalogueProducts(); const known = new Set(catalogue.map((product) => product.supplierSku));
  const counts = new Map<string, number>(); rows.slice(1).forEach((row) => counts.set(row[0]?.toUpperCase(), (counts.get(row[0]?.toUpperCase()) ?? 0) + 1));
  const previewRows: ScoopCsvPreviewRow[] = rows.slice(1).map((row, index) => {
    const sku = row[0]?.trim(); const values = { weightGrams: number(row[1]), lengthMm: number(row[2]), widthMm: number(row[3]), heightMm: number(row[4]) }; const errors: string[] = [];
    if (!known.has(sku)) errors.push("Unknown Scoop SKU.");
    if ((counts.get(sku.toUpperCase()) ?? 0) > 1) errors.push("Duplicate SKU row.");
    try { validateScoopLogisticsValues(values); } catch (error) { errors.push(error instanceof Error ? error.message : "Invalid logistics values."); }
    return { rowNumber: index + 2, sku, values, status: errors.length ? undefined : deriveScoopLogisticsStatus(values), errors };
  });
  return {
    importFingerprint: createHash("sha256").update(csv).digest("hex"), rows: previewRows,
    summary: { rowsRead: previewRows.length, matched: previewRows.filter((row) => !row.errors.includes("Unknown Scoop SKU.")).length, complete: previewRows.filter((row) => row.status === "COMPLETE").length, partial: previewRows.filter((row) => row.status === "WEIGHT_ONLY" || row.status === "DIMENSIONS_ONLY").length, rejected: previewRows.filter((row) => row.errors.length).length, unknownSkus: previewRows.filter((row) => row.errors.includes("Unknown Scoop SKU.")).length },
  };
}
export async function applyScoopLogisticsCsv(csv: string, expectedFingerprint: string, actor = "TekCentral Staff") {
  const preview = await previewScoopLogisticsCsv(csv); if (preview.importFingerprint !== expectedFingerprint) throw new Error("CSV changed after preview. Preview it again before applying.");
  if (preview.summary.rejected) throw new Error("Resolve all rejected CSV rows before applying the import.");
  const batchId = `scoop-logistics-${randomUUID()}`; let updated = 0; let unchanged = 0; const now = new Date().toISOString();
  for (const row of preview.rows) {
    const record: ScoopLogisticsMetadata = { source: "ADMIN_IMPORT", sourceReference: batchId, capturedAt: now, updatedAt: now, fetchedAt: now, status: row.status!, ...row.values, actualWeightKg: row.values.weightGrams === undefined ? undefined : row.values.weightGrams / 1000, volumeM3: row.values.lengthMm === undefined ? undefined : row.values.lengthMm * row.values.widthMm! * row.values.heightMm! / 1_000_000_000 };
    const result = await saveScoopLogisticsSource({ supplierSku: row.sku, record, actor }); if (result.outcome === "UPDATED") updated += 1; else if (result.outcome === "UNCHANGED") unchanged += 1;
  }
  return { batchId, ...preview.summary, updated, unchanged, appliedAt: now };
}
function csvCell(value: string) { return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value; }
export async function exportMissingScoopLogisticsCsv() {
  const products = (await listScoopCatalogueProducts()).filter((product) => product.logisticsMetadata?.status !== "COMPLETE");
  return ["sku,description,manufacturer,weight_grams,length_mm,width_mm,height_mm", ...products.map((product) => [product.supplierSku, product.description, product.manufacturer ?? "", product.logisticsMetadata?.weightGrams ?? "", product.logisticsMetadata?.lengthMm ?? "", product.logisticsMetadata?.widthMm ?? "", product.logisticsMetadata?.heightMm ?? ""].map((value) => csvCell(String(value))).join(","))].join("\n");
}

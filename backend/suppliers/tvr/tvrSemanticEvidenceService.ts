import { loadPersistenceConfig } from "../../persistence/config.js";
import { query, withTransaction } from "../../persistence/postgres.js";
import { objectStorage } from "../../storage/objectStorage.js";
import { bestEffortAlert, bestEffortResolve } from "../../operationalAlertService.js";
import { createSourceRun, updateSourceRun, type SupplierSourceRun } from "../../supplierSourceRegistry.js";
import { TVR_COMMERCIAL_WORKBOOK_ID } from "./tvrSourceManifest.js";
import { parseTvrSemanticWorkbook, type TvrSemanticParseResult } from "./tvrSemanticParser.js";
import { parseTvrLogicalWorkbook } from "./tvrWorkbookSnapshot.js";

interface SourceVersionRow { id: string; source_id: string; object_key: string | null; retrieved_at: Date | string; fingerprint: string; }
export interface TvrSemanticPersistenceResult { sourceVersionId: string; inserted: number; existing: number; report: TvrSemanticParseResult; }

const safeRunMetadata = (report: TvrSemanticParseResult) => ({ semanticParser: "TVR_C_V1", logicalFingerprint: report.logicalFingerprint, tabReports: report.tabs, notes: report.notes, groups: report.groups, conditions: report.conditions, flags: report.flags });

export async function normalizeTvrSourceVersion(sourceVersionId: string, options: { createRun?: boolean } = {}): Promise<TvrSemanticPersistenceResult> {
  if (loadPersistenceConfig().provider !== "POSTGRES") throw new Error("TVR_SEMANTIC_POSTGRES_REQUIRED");
  let run: SupplierSourceRun | undefined;
  try {
    if (options.createRun !== false) { run = await createSourceRun(TVR_COMMERCIAL_WORKBOOK_ID); run.status = "PARSING"; await updateSourceRun(run); }
    const version = (await query<SourceVersionRow>("SELECT id,source_id,object_key,retrieved_at,fingerprint FROM supplier_source_versions WHERE id=$1 AND source_id=$2", [sourceVersionId, TVR_COMMERCIAL_WORKBOOK_ID])).rows[0];
    if (!version) throw new Error("TVR_SOURCE_VERSION_NOT_FOUND");
    if (!version.object_key) throw new Error("TVR_SOURCE_VERSION_OBJECT_MISSING");
    const bytes = await objectStorage().readObject(version.object_key, "PRIVATE");
    if (!bytes) throw new Error("TVR_SOURCE_VERSION_BYTES_MISSING");
    const logical = parseTvrLogicalWorkbook(bytes);
    if (logical.logicalFingerprint !== version.fingerprint) throw new Error("TVR_SOURCE_VERSION_FINGERPRINT_MISMATCH");
    const report = parseTvrSemanticWorkbook(logical);
    const persisted = await withTransaction(async (client) => {
      const current = await client.query<{ id: string; fingerprint: string }>("SELECT id,fingerprint FROM supplier_source_evidence WHERE supplier_code='TVR' AND source_version_id=$1 ORDER BY id", [sourceVersionId]);
      if (current.rowCount) {
        const expected = new Map(report.evidence.map((row) => [row.id, row.sourceFingerprint]));
        if (current.rowCount !== expected.size || current.rows.some((row) => expected.get(row.id) !== row.fingerprint)) throw new Error("TVR_SEMANTIC_EVIDENCE_IMMUTABILITY_MISMATCH");
        return { inserted: 0, existing: current.rowCount };
      }
      for (const row of report.evidence) await client.query(
        "INSERT INTO supplier_source_evidence(id,supplier_code,source_id,source_version_id,supplier_sku,source_description,source_brand,workbook_name,worksheet_name,source_row,dealer_cost,currency,tax_basis,stock_evidence,product_url,observed_at,fingerprint,payload) VALUES($1,'TVR',$2,$3,$4,$5,NULL,$6,$7,$8,$9,$10,'UNKNOWN',$11::jsonb,NULL,$12,$13,$14::jsonb)",
        [row.id, version.source_id, version.id, row.supplierSku, row.sourceDescription, row.workbookName, row.worksheetName, row.sourceRow, row.price.amount, row.price.explicitCurrency ?? null, JSON.stringify(row.stock), version.retrieved_at, row.sourceFingerprint, JSON.stringify(row)],
      );
      return { inserted: report.evidence.length, existing: 0 };
    });
    if (run) { run.status = persisted.inserted ? "IMPORTED" : "UNCHANGED"; run.completedAt = new Date().toISOString(); run.fingerprint = report.logicalFingerprint; run.counts = { evidenceRows: report.evidence.length, inserted: persisted.inserted, worksheets: report.tabs.length, duplicateGroups: report.groups.duplicateSameFact, conflictGroups: report.groups.conflictingFacts, conditionCollisionGroups: report.groups.conditionCollisions }; run.metadata = { sourceVersionId, ...safeRunMetadata(report) }; await updateSourceRun(run); }
    await bestEffortResolve({ type: "SUPPLIER_SOURCE_FAILURE", subsystem: "SUPPLIERS", entityType: "SUPPLIER_SOURCE", entityId: TVR_COMMERCIAL_WORKBOOK_ID, diagnosticCode: "TVR_SEMANTIC_PARSE_FAILED" });
    return { sourceVersionId, ...persisted, report };
  } catch (error) {
    const summary = (error instanceof Error ? error.message : "TVR semantic parsing failed.").replace(/https?:\/\/\S+/g, "[source]").slice(0, 300);
    if (run) { run.status = "FAILED"; run.completedAt = new Date().toISOString(); run.errorCode = "TVR_SEMANTIC_PARSE_FAILED"; run.errorSummary = summary; await updateSourceRun(run); }
    await bestEffortAlert({ type: "SUPPLIER_SOURCE_FAILURE", severity: "WARNING", subsystem: "SUPPLIERS", title: "TVR workbook interpretation needs attention", summary: "An immutable TVR workbook version could not be normalized. The source snapshot and previous evidence were retained.", entityType: "SUPPLIER_SOURCE", entityId: TVR_COMMERCIAL_WORKBOOK_ID, targetRoute: "/admin/suppliers/tvr/sync-history", recommendedAction: "Inspect the semantic parser failure before promoting TVR evidence.", diagnosticCode: "TVR_SEMANTIC_PARSE_FAILED" });
    throw error;
  }
}

export async function normalizeCurrentTvrSourceVersion() {
  const current = (await query<{ id: string }>("SELECT id FROM supplier_source_versions WHERE source_id=$1 ORDER BY retrieved_at DESC LIMIT 1", [TVR_COMMERCIAL_WORKBOOK_ID])).rows[0];
  if (!current) throw new Error("TVR_SOURCE_VERSION_NOT_FOUND");
  return normalizeTvrSourceVersion(current.id);
}

export const summarizeTvrSemanticReport = (report: TvrSemanticParseResult) => ({ counts: report.counts, conditions: report.conditions, groups: report.groups, flags: report.flags, tabs: report.tabs });

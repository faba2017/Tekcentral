import { createHash } from "node:crypto";
import { loadPersistenceConfig } from "../../persistence/config.js";
import { query } from "../../persistence/postgres.js";
import { objectStorage } from "../../storage/objectStorage.js";
import { bestEffortAlert, bestEffortResolve } from "../../operationalAlertService.js";
import { countSupplierSourceVersions, createSourceRun, getSupplierSource, listSupplierSourceRuns, listSupplierSources, saveSupplierSource, updateSourceRun, updateSupplierSourceObservation, validateSupplierSourceUrl, type SupplierSource, type SupplierSourceAuditActor, type SupplierSourceRun } from "../../supplierSourceRegistry.js";
import { parseTvrLogicalWorkbook } from "./tvrWorkbookSnapshot.js";
import { TVR_COMMERCIAL_WORKBOOK_ID, TVR_PUBLIC_CATALOGUE_ID, tvrSourceManifest } from "./tvrSourceManifest.js";
import { normalizeTvrSourceVersion } from "./tvrSemanticEvidenceService.js";
import { syncTvrPublicCatalogue } from "./tvrPublicCatalogueService.js";

const maximumBytes = 30 * 1024 * 1024;
const maximumRedirects = 4;
const active = new Set<string>();
export class TvrSourceError extends Error { constructor(public code: string, message: string) { super(message); } }

export async function fetchTvrWorkbookResponse(url: string, fetcher: typeof fetch, resolve?: (hostname: string) => Promise<string[]>) {
  let current = await validateSupplierSourceUrl("TVR", url, resolve, { redirect: false });
  for (let redirects = 0; redirects <= maximumRedirects; redirects += 1) {
    const response = await fetcher(current, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(15_000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirects === maximumRedirects) throw new TvrSourceError("SOURCE_REDIRECT_LIMIT", "Source exceeded the redirect limit.");
      const location = response.headers.get("location");
      if (!location) throw new TvrSourceError("SOURCE_REDIRECT_INVALID", "Source returned an invalid redirect.");
      current = await validateSupplierSourceUrl("TVR", new URL(location, current).toString(), resolve, { redirect: true });
      continue;
    }
    return response;
  }
  throw new TvrSourceError("SOURCE_REDIRECT_LIMIT", "Source exceeded the redirect limit.");
}

export async function seedTvrSources(actor: string | SupplierSourceAuditActor = { actorType: "SYSTEM", actorLabel: "System" }) {
  const existing = await listSupplierSources("TVR");
  let created = 0;
  for (const [index, definition] of tvrSourceManifest.entries()) {
    if (existing.some((source) => source.id === definition.id || source.sourceUrl === definition.sourceUrl)) continue;
    await saveSupplierSource({ ...definition, expectedMimeTypes: [...definition.expectedMimeTypes], supplierCode: "TVR", transport: "DOWNLOAD_URL", state: "DISABLED", priority: index + 1, isPrimary: false, syncEnabled: false, revisionMetadata: {} }, actor);
    created += 1;
  }
  return { created, totalConfigured: (await listSupplierSources("TVR")).length };
}

async function persistVersion(source: SupplierSource, logicalFingerprint: string, rawHash: string, bytes: Uint8Array, contentType: string, metadata: Record<string, unknown>) {
  const versionId = `version-${createHash("sha256").update(`${source.id}|${logicalFingerprint}`).digest("hex").slice(0, 24)}`;
  const objectKey = `supplier-evidence/tvr/${source.id}/${logicalFingerprint}/TVR-DISTRIBUTION-SHEETS.xlsx`;
  await objectStorage().storeObject({ key: objectKey, access: "PRIVATE", bytes, contentType, expectedHash: rawHash });
  if (loadPersistenceConfig().provider === "POSTGRES") await query("INSERT INTO supplier_source_versions(id,source_id,fingerprint,object_key,content_type,byte_size,etag,last_modified,workbook_metadata,retrieved_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,now()) ON CONFLICT(source_id,fingerprint) DO NOTHING", [versionId, source.id, logicalFingerprint, objectKey, contentType, bytes.length, source.etag ?? null, source.lastModified ?? null, JSON.stringify(metadata)]);
  return { versionId, objectKey };
}

export async function syncTvrSource(sourceId: string, mode: "CHECK" | "SYNC" = "SYNC", deps: { fetch?: typeof fetch; resolve?: (hostname: string) => Promise<string[]> } = {}) {
  if (sourceId === TVR_PUBLIC_CATALOGUE_ID) return syncTvrPublicCatalogue(mode, { fetch: deps.fetch });
  if (active.has(sourceId)) throw new TvrSourceError("SYNC_IN_PROGRESS", "This source is already being checked.");
  const source = await getSupplierSource(sourceId);
  if (!source || source.supplierCode !== "TVR") throw new TvrSourceError("SOURCE_NOT_FOUND", "TVR source was not found.");
  if (source.id !== TVR_COMMERCIAL_WORKBOOK_ID || source.format !== "XLSX") throw new TvrSourceError("SOURCE_NOT_SYNCABLE", "This source is registered for a later enrichment phase.");
  if (mode === "SYNC" && source.state !== "ACTIVE") throw new TvrSourceError("SOURCE_DISABLED", "Activate this source before synchronizing it.");
  if (!source.sourceUrl) throw new TvrSourceError("SOURCE_URL_MISSING", "Source has no configured URL.");
  active.add(sourceId);
  let run: SupplierSourceRun | undefined;
  try {
    run = await createSourceRun(sourceId); run.status = "DOWNLOADING"; await updateSourceRun(run);
    const response = await fetchTvrWorkbookResponse(source.sourceUrl, deps.fetch ?? fetch, deps.resolve);
    if (!response.ok) throw new TvrSourceError("SOURCE_UNAVAILABLE", `Source returned HTTP ${response.status}.`);
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!source.expectedMimeTypes.includes(contentType)) throw new TvrSourceError("SOURCE_MIME_MISMATCH", "Source content type did not match the configured workbook format.");
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > maximumBytes) throw new TvrSourceError("SOURCE_TOO_LARGE", "Source exceeds the maximum allowed size.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > maximumBytes) throw new TvrSourceError("SOURCE_TOO_LARGE", "Source exceeds the maximum allowed size.");
    run.status = "PARSING"; await updateSourceRun(run);
    let snapshot;
    try { snapshot = parseTvrLogicalWorkbook(bytes); } catch (error) { throw new TvrSourceError("PARSE_FAILED", error instanceof Error ? error.message : "Workbook could not be parsed."); }
    const rawHash = createHash("sha256").update(bytes).digest("hex"), now = new Date().toISOString();
    const metadata = { workbookTitle: "TVR DISTRIBUTION SHEETS", rawSha256: rawHash, logicalFingerprint: snapshot.logicalFingerprint, tabCount: snapshot.tabs.length, tabs: snapshot.tabs, private: true };
    if (snapshot.logicalFingerprint === source.fingerprint || mode === "CHECK") {
      run.status = snapshot.logicalFingerprint === source.fingerprint ? "UNCHANGED" : "PARTIAL"; run.completedAt = now; run.fingerprint = snapshot.logicalFingerprint; run.counts = { bytes: bytes.length, worksheets: snapshot.tabs.length }; run.metadata = { ...metadata, checkOnly: mode === "CHECK" };
      await updateSupplierSourceObservation(source.id, { lastCheckedAt: now, lastRetrievedAt: now, contentLength: bytes.length, etag: response.headers.get("etag") ?? undefined, lastModified: response.headers.get("last-modified") ?? undefined });
      return updateSourceRun(run);
    }
    const persisted = await persistVersion(source, snapshot.logicalFingerprint, rawHash, bytes, contentType, metadata);
    const semantic = await normalizeTvrSourceVersion(persisted.versionId, { createRun: false });
    run.status = "IMPORTED"; run.completedAt = now; run.fingerprint = snapshot.logicalFingerprint; run.counts = { bytes: bytes.length, worksheets: snapshot.tabs.length, sourceVersions: 1 }; run.metadata = { ...metadata, sourceVersionId: persisted.versionId, objectKey: persisted.objectKey };
    run.counts = { ...run.counts, evidenceRows: semantic.report.evidence.length, duplicateGroups: semantic.report.groups.duplicateSameFact, conflictGroups: semantic.report.groups.conflictingFacts, conditionCollisionGroups: semantic.report.groups.conditionCollisions };
    run.metadata = { ...run.metadata, semanticParser: "TVR_C_V1", semanticTabs: semantic.report.tabs, semanticNotes: semantic.report.notes };
    await updateSupplierSourceObservation(source.id, { lastCheckedAt: now, lastRetrievedAt: now, lastImportedAt: now, lastFailedAt: undefined, lastErrorSummary: undefined, contentLength: bytes.length, fingerprint: snapshot.logicalFingerprint, etag: response.headers.get("etag") ?? undefined, lastModified: response.headers.get("last-modified") ?? undefined, revisionMetadata: metadata });
    await bestEffortResolve({ type: "SUPPLIER_SOURCE_FAILURE", subsystem: "SUPPLIERS", entityType: "SUPPLIER_SOURCE", entityId: source.id, diagnosticCode: "TVR_SOURCE_SYNC_FAILED" });
    return updateSourceRun(run);
  } catch (error) {
    const code = error instanceof TvrSourceError ? error.code : "SOURCE_SYNC_FAILED";
    const summary = (error instanceof Error ? error.message : "Source synchronization failed.").replace(/https?:\/\/\S+/g, "[source]").slice(0, 300);
    if (run) { run.status = "FAILED"; run.completedAt = new Date().toISOString(); run.errorCode = code; run.errorSummary = summary; await updateSourceRun(run); }
    await updateSupplierSourceObservation(sourceId, { lastCheckedAt: new Date().toISOString(), lastFailedAt: new Date().toISOString(), lastErrorSummary: summary });
    await bestEffortAlert({ type: "SUPPLIER_SOURCE_FAILURE", severity: "WARNING", subsystem: "SUPPLIERS", title: "TVR source synchronization needs attention", summary: "A configured TVR source could not be processed. Previous valid evidence was retained.", entityType: "SUPPLIER_SOURCE", entityId: sourceId, targetRoute: "/admin/suppliers/tvr/sources", recommendedAction: "Inspect the latest source run and correct the source or format issue.", diagnosticCode: "TVR_SOURCE_SYNC_FAILED" });
    throw error;
  } finally { active.delete(sourceId); }
}

export async function getTvrSourcesView() {
  const sources = await listSupplierSources("TVR"), sourceIds = new Set(sources.map((source) => source.id));
  const runs = (await listSupplierSourceRuns()).filter((run) => sourceIds.has(run.sourceId));
  const commercial = sources.find((source) => source.id === TVR_COMMERCIAL_WORKBOOK_ID);
  return { summary: { configured: sources.length, active: sources.filter((source) => source.state === "ACTIVE").length, disabled: sources.filter((source) => source.state === "DISABLED").length, incentivesIgnored: 0, versions: commercial ? await countSupplierSourceVersions(commercial.id) : 0 }, sources, runs };
}

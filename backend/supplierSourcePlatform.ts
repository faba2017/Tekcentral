import type { SupplierCode } from "./types.js";
import {
  listSupplierSourceRuns,
  listSupplierSources,
  type SupplierSource,
  type SupplierSourceRun,
} from "./supplierSourceRegistry.js";
import { syncMustekSource } from "./suppliers/mustek/mustekSourceService.js";
import { syncTvrSource } from "./suppliers/tvr/tvrSourceService.js";
import { syncScoopCatalogueFromFeed } from "./suppliers/scoop/scoopCatalogueAdapter.js";
import { getScoopCatalogueSyncStatus } from "./suppliers/scoop/scoopCatalogueRepository.js";
import { runSyntechSync } from "./suppliers/syntech/syntechSyncService.js";
import { getSyntechStatus } from "./suppliers/syntech/syntechCatalogueRepository.js";
import { syntechConfiguration } from "./suppliers/syntech/syntechCatalogueAdapter.js";
import { getCjConnectionStatus, testCjConnection } from "./suppliers/cj/cjCatalogueAdapter.js";

export type SupplierSourceAuthority = "COMMERCIAL" | "CATALOGUE" | "CONTENT" | "MEDIA" | "MANUAL" | "ENRICHMENT";
export interface SupplierSourceCapabilities {
  canCheck: boolean;
  canSync: boolean;
  canRefresh: boolean;
  canImport: boolean;
  canActivate: boolean;
  canDeactivate: boolean;
  canConfigure: boolean;
}
export interface AdminSupplierSourceDto {
  id: string;
  supplierCode: SupplierCode;
  label: string;
  purpose: string;
  format: string;
  state: "ACTIVE" | "DISABLED" | "ARCHIVED";
  isPrimary: boolean;
  authority: SupplierSourceAuthority[];
  capabilities: SupplierSourceCapabilities;
  location?: string;
  lastCheckedAt?: string;
  lastImportedAt?: string;
  lastErrorSummary?: string;
  etag?: string;
  lastModified?: string;
  health: "HEALTHY" | "PARTIAL" | "FAILED" | "UNKNOWN" | "DISABLED";
}

interface VirtualSourceDefinition extends Omit<AdminSupplierSourceDto, "state" | "health" | "lastCheckedAt" | "lastImportedAt" | "lastErrorSummary"> {
  state: () => Promise<AdminSupplierSourceDto["state"]> | AdminSupplierSourceDto["state"];
  observations: () => Promise<Pick<AdminSupplierSourceDto, "health" | "lastCheckedAt" | "lastImportedAt" | "lastErrorSummary">>;
}

const none = { canCheck: false, canSync: false, canRefresh: false, canImport: false, canActivate: false, canDeactivate: false, canConfigure: false };
const virtualDefinitions: VirtualSourceDefinition[] = [
  {
    id: "SCOOP_XML_CATALOGUE", supplierCode: "SCOOP", label: "Scoop XML catalogue feed", purpose: "PRICE_LIST", format: "XML", isPrimary: true,
    authority: ["COMMERCIAL", "CATALOGUE", "CONTENT"], capabilities: { ...none, canSync: true, canRefresh: true }, location: "scoop.co.za (public XML feed)", state: () => "ACTIVE",
    observations: async () => { const status = await getScoopCatalogueSyncStatus(); const failed = Boolean(status.lastSync?.error); return { health: failed ? "FAILED" : status.lastSync ? status.lastSync.failed ? "PARTIAL" : "HEALTHY" : "UNKNOWN", lastCheckedAt: status.lastSync?.lastSyncedAt, lastImportedAt: !failed ? status.lastSync?.lastSyncedAt : undefined, lastErrorSummary: status.lastSync?.error }; },
  },
  {
    id: "SCOOP_PUBLIC_WEBSITE", supplierCode: "SCOOP", label: "Scoop public product catalogue", purpose: "HTML_CATALOGUE", format: "HTML", isPrimary: false,
    authority: ["CONTENT", "MEDIA", "ENRICHMENT"], capabilities: { ...none, canImport: true }, location: "scoop.co.za (public catalogue)", state: () => "ACTIVE",
    observations: async () => { const status = await getScoopCatalogueSyncStatus(); return { health: status.reconciliation.websiteBacked > 0 ? "HEALTHY" : "UNKNOWN", lastImportedAt: status.lastEnrichment?.lastEnrichmentAt }; },
  },
  {
    id: "SYNTECH_FULL_FEED", supplierCode: "SYNTECH", label: "Syntech full catalogue feed", purpose: "PRICE_LIST", format: "OTHER", isPrimary: true,
    authority: ["COMMERCIAL", "CATALOGUE", "CONTENT", "MEDIA"], capabilities: { ...none, canCheck: true, canSync: true, canRefresh: true }, location: "Environment-managed private JSON feed",
    state: () => syntechConfiguration().enabled && syntechConfiguration().fullConfigured ? "ACTIVE" : "DISABLED",
    observations: async () => syntechObservation("FULL"),
  },
  {
    id: "SYNTECH_UPDATE_FEED", supplierCode: "SYNTECH", label: "Syntech update feed", purpose: "PRICE_LIST", format: "OTHER", isPrimary: false,
    authority: ["COMMERCIAL", "CATALOGUE"], capabilities: { ...none, canCheck: true, canSync: true, canRefresh: true }, location: "Environment-managed private JSON feed",
    state: () => syntechConfiguration().enabled && syntechConfiguration().updateConfigured ? "ACTIVE" : "DISABLED",
    observations: async () => syntechObservation("UPDATE"),
  },
  {
    id: "CJ_API", supplierCode: "CJ", label: "CJ API integration", purpose: "HTML_CATALOGUE", format: "OTHER", isPrimary: true,
    authority: ["COMMERCIAL", "CATALOGUE", "CONTENT", "MEDIA", "ENRICHMENT"], capabilities: { ...none, canCheck: true, canRefresh: true }, location: "Environment-managed API integration",
    state: async () => (await getCjConnectionStatus()).configured ? "ACTIVE" : "DISABLED",
    observations: async () => { const status = await getCjConnectionStatus(); return { health: status.authenticated ? "HEALTHY" : status.configured ? "FAILED" : "DISABLED", lastCheckedAt: status.lastSuccessfulRequestAt, lastErrorSummary: status.lastError ?? undefined }; },
  },
  {
    id: "TEKCENTRAL_MANUAL", supplierCode: "TEKCENTRAL", label: "TekCentral staff-maintained inventory", purpose: "PRICE_LIST", format: "OTHER", isPrimary: true,
    authority: ["COMMERCIAL", "CATALOGUE", "MANUAL"], capabilities: { ...none }, location: "Internal staff-maintained evidence", state: () => "ACTIVE",
    observations: async () => ({ health: "UNKNOWN" }),
  },
];

async function syntechObservation(type: "FULL" | "UPDATE") {
  const status = await getSyntechStatus();
  const run = status.syncHistory.find((item) => item.syncType === type);
  return { health: !run ? "UNKNOWN" as const : run.status === "SUCCESS" ? "HEALTHY" as const : "FAILED" as const, lastCheckedAt: run?.completedAt, lastImportedAt: run?.status === "SUCCESS" ? run.completedAt : undefined, lastErrorSummary: run?.status === "SUCCESS" ? undefined : run?.errorSummary };
}

const safeSummary = (value?: string) => value?.replace(/https?:\/\/\S+/gi, "[source]").replace(/([?&](?:key|token|secret|signature|password)=)[^&\s]+/gi, "$1[redacted]").slice(0, 300);
export function safeSourceLocation(value?: string) {
  if (!value) return undefined;
  try { const url = new URL(value); return `${url.hostname}${url.pathname}`; } catch { return undefined; }
}
function persistedAuthority(source: SupplierSource): SupplierSourceAuthority[] {
  const hint = source.hints.authority;
  if (hint === "COMMERCIAL_STOCK") return ["COMMERCIAL", "CATALOGUE"];
  if (hint === "CONTENT_SPECIFICATION_MEDIA") return ["CONTENT", "MEDIA", "ENRICHMENT"];
  if (source.purpose === "PRICE_LIST") return ["COMMERCIAL", "CATALOGUE"];
  if (source.purpose === "MARKETING_ASSET") return ["MEDIA", "ENRICHMENT"];
  return ["CONTENT", "ENRICHMENT"];
}
function healthFor(source: SupplierSource, run?: SupplierSourceRun): AdminSupplierSourceDto["health"] {
  if (source.state !== "ACTIVE") return "DISABLED";
  if (run?.status === "FAILED") return "FAILED";
  if (run?.status === "PARTIAL") return "PARTIAL";
  if (run && ["IMPORTED", "UNCHANGED"].includes(run.status)) return "HEALTHY";
  return "UNKNOWN";
}
function persistedCapabilities(source: SupplierSource): SupplierSourceCapabilities {
  const implemented = (source.supplierCode === "MUSTEK" || source.supplierCode === "TVR") && Boolean(source.sourceUrl);
  return { ...none, canCheck: implemented, canSync: implemented, canRefresh: implemented, canActivate: implemented && source.state !== "ACTIVE", canDeactivate: implemented && source.state === "ACTIVE", canConfigure: source.supplierCode === "MUSTEK" };
}
export async function getSupplierSourceView(supplierCode: SupplierCode) {
  const persisted = await listSupplierSources(supplierCode);
  const runs = await listSupplierSourceRuns();
  const latest = new Map<string, SupplierSourceRun>();
  for (const run of runs) if (!latest.has(run.sourceId)) latest.set(run.sourceId, run);
  const sources: AdminSupplierSourceDto[] = persisted.map((source) => ({
    id: source.id, supplierCode, label: source.label, purpose: source.purpose, format: source.format, state: source.state, isPrimary: source.isPrimary,
    authority: persistedAuthority(source), capabilities: persistedCapabilities(source), location: safeSourceLocation(source.sourceUrl), lastCheckedAt: source.lastCheckedAt,
    lastImportedAt: source.lastImportedAt, lastErrorSummary: safeSummary(source.lastErrorSummary), etag: source.etag ? "Recorded" : undefined, lastModified: source.lastModified,
    health: healthFor(source, latest.get(source.id)),
  }));
  for (const definition of virtualDefinitions.filter((item) => item.supplierCode === supplierCode)) sources.push({ ...definition, state: await definition.state(), ...await definition.observations() });
  const sourceIds = new Set(sources.map((source) => source.id));
  const safeRuns = runs.filter((run) => sourceIds.has(run.sourceId)).map((run) => ({ ...run, errorSummary: safeSummary(run.errorSummary), metadata: {} }));
  return { summary: { configured: sources.length, active: sources.filter((item) => item.state === "ACTIVE").length, disabled: sources.filter((item) => item.state === "DISABLED").length, archived: sources.filter((item) => item.state === "ARCHIVED").length, incentivesIgnored: supplierCode === "MUSTEK" ? 3 : 0 }, sources, runs: safeRuns };
}

export async function runSupplierSourceOperation(supplierCode: SupplierCode, sourceId: string, operation: "check" | "sync") {
  const source = (await getSupplierSourceView(supplierCode)).sources.find((item) => item.id === sourceId);
  if (!source) throw new Error("SOURCE_NOT_FOUND");
  if (operation === "check" && !source.capabilities.canCheck || operation === "sync" && !source.capabilities.canSync) throw new Error("SOURCE_OPERATION_UNSUPPORTED");
  if (supplierCode === "MUSTEK") return { sourceId, supplierCode, operation, run: await syncMustekSource(sourceId, operation === "check" ? "CHECK" : "SYNC") };
  if (supplierCode === "TVR") return { sourceId, supplierCode, operation, run: await syncTvrSource(sourceId, operation === "check" ? "CHECK" : "SYNC") };
  if (supplierCode === "SCOOP" && sourceId === "SCOOP_XML_CATALOGUE" && operation === "sync") return { sourceId, supplierCode, operation, result: await syncScoopCatalogueFromFeed() };
  if (supplierCode === "SYNTECH") { const type = sourceId === "SYNTECH_FULL_FEED" ? "FULL" : "UPDATE"; return { sourceId, supplierCode, operation, result: await runSyntechSync(type, { mutate: operation === "sync" }) }; }
  if (supplierCode === "CJ" && sourceId === "CJ_API" && operation === "check") return { sourceId, supplierCode, operation, result: await testCjConnection() };
  throw new Error("SOURCE_HANDLER_MISSING");
}

export function validateSupplierSourceDefinitions() {
  const ids = new Set<string>();
  const errors: string[] = [];
  for (const item of virtualDefinitions) {
    if (ids.has(item.id)) errors.push(`Duplicate source ID ${item.id}`); else ids.add(item.id);
    if (item.capabilities.canSync && !["SCOOP_XML_CATALOGUE", "SYNTECH_FULL_FEED", "SYNTECH_UPDATE_FEED"].includes(item.id)) errors.push(`Sync handler missing for ${item.id}`);
    if (item.capabilities.canCheck && !["SYNTECH_FULL_FEED", "SYNTECH_UPDATE_FEED", "CJ_API"].includes(item.id)) errors.push(`Check handler missing for ${item.id}`);
  }
  return { valid: errors.length === 0, errors, definitions: virtualDefinitions.map((item) => ({ id: item.id, supplierCode: item.supplierCode, label: item.label, purpose: item.purpose, format: item.format, isPrimary: item.isPrimary, authority: item.authority, capabilities: item.capabilities, location: item.location })) };
}

export const supplierHasSourceWorkspace = (supplierCode: SupplierCode) => ["TEKCENTRAL", "CJ", "SCOOP", "SYNTECH", "MUSTEK", "TVR"].includes(supplierCode);

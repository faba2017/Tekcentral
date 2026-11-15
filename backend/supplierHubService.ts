import { getSupplierRegistryEntry, operationalSupplierIds } from "./supplierRegistry.js";
import { listSupplierProductMappings } from "./supplierProductMappingRepository.js";
import { listSupplierOrders } from "./supplierOrderRepository.js";
import { deriveSupplierOrderAttention } from "./supplierOrchestration.js";
import { getCjConnectionStatus } from "./suppliers/cj/cjCatalogueAdapter.js";
import { listCjCatalogueProducts } from "./suppliers/cj/cjCatalogueRepository.js";
import { getScoopCatalogueSyncStatus, listScoopCatalogueProducts } from "./suppliers/scoop/scoopCatalogueRepository.js";
import type { SupplierCode } from "./types.js";
import { getSyntechStatus } from "./suppliers/syntech/syntechCatalogueRepository.js";
import { syntechConfiguration } from "./suppliers/syntech/syntechCatalogueAdapter.js";
import { getSyntechSyncReadiness } from "./suppliers/syntech/syntechSyncService.js";
import { getSyntechApiProcurementControl } from "./suppliers/syntech/syntechOrderAdapter.js";
import { getTekCentralManualOfferStatus } from "./suppliers/tekcentral/tekcentralManualOfferRepository.js";
import { getMustekCatalogueStatus } from "./suppliers/mustek/mustekCatalogueService.js";
import { getTvrCatalogueStatus } from "./suppliers/tvr/tvrCatalogueService.js";
import { listSupplierSourceRuns, listSupplierSources } from "./supplierSourceRegistry.js";
import { getSupplierSourceView } from "./supplierSourcePlatform.js";

export type OperationalSupplierId = typeof operationalSupplierIds[number];
const validSupplier = (value: string): value is OperationalSupplierId => operationalSupplierIds.includes(value as OperationalSupplierId);

export async function getSupplierOperations(id: string) {
  if (!validSupplier(id)) return undefined;
  const [mappings, allOrders] = await Promise.all([listSupplierProductMappings(), listSupplierOrders()]);
  const supplierMappings = mappings.filter((mapping) => mapping.supplierCode === id);
  const orders = allOrders.filter((order) => order.supplierCode === id);
  const attention = orders.flatMap((order) => deriveSupplierOrderAttention(order).map((reason) => ({ supplierOrderId: order.id, reason })));
  const sourceSummary = (await getSupplierSourceView(id as SupplierCode)).summary;
  const registry = { ...getSupplierRegistryEntry(id as SupplierCode), sourceSummary };
  if (id === "TEKCENTRAL") {
    const status = await getTekCentralManualOfferStatus();
    const manualOrders = orders.filter((item) => item.supplierCode === "TEKCENTRAL");
    return { supplier: registry, configurationStatus: "CONFIGURED", connectionStatus: "INTERNAL", healthStatus: status.metrics.inventoryExceptions > 0 ? "FAILED" : "OPERATIONAL", catalogue: { productCount: status.metrics.total, availableCount: status.offers.filter((offer) => offer.active && offer.available > 0).length, staleCount: status.metrics.staleStock, lastSyncAt: status.offers.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.updatedAt }, mappings: { total: supplierMappings.length, verified: supplierMappings.filter((item) => item.status === "VERIFIED").length, reviewRequired: supplierMappings.filter((item) => item.status !== "VERIFIED" && item.status !== "REJECTED" && item.status !== "SUPERSEDED").length }, orders: { total: manualOrders.length, attention: manualOrders.filter((item) => deriveSupplierOrderAttention(item).length > 0).length }, manualOffers: status.metrics, syncHistory: [] };
  }
  if (id === "SYNTECH") {
    const [status, configuration, syntechSync, syntechProcurement] = await Promise.all([getSyntechStatus(), Promise.resolve(syntechConfiguration()), getSyntechSyncReadiness(), getSyntechApiProcurementControl()]);
    const latest = status.syncHistory[0]; const successful = status.syncHistory.find((item) => item.status === "SUCCESS");
    const healthStatus = !configuration.configured ? "UNKNOWN" : latest?.status === "BLOCKED" || latest?.status === "FAILED" || latest?.status === "INVALID" ? "FAILED" : successful && Date.now() - Date.parse(successful.completedAt) < 26 * 60 * 60 * 1000 ? "HEALTHY" : status.productCount ? "DEGRADED" : "UNKNOWN";
    const lastApiOrder = orders.filter((item) => item.externalSubmission?.mode === "SYNTECH_UAT_API").sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    return { supplier: registry, configurationStatus: configuration.configured ? "CONFIGURED" : "NOT_CONFIGURED", connectionStatus: latest?.status === "SUCCESS" ? "CONNECTED" : configuration.configured ? "DEGRADED" : "NOT_CONFIGURED", healthStatus, catalogue: { productCount: status.productCount, availableCount: status.activeCount, staleCount: status.productCount - status.activeCount, lastSyncAt: successful?.completedAt }, mappings: { total: supplierMappings.length, verified: supplierMappings.filter((item) => item.status === "VERIFIED").length, reviewRequired: supplierMappings.filter((item) => item.status === "SUGGESTED" || item.status === "STALE").length }, orders: { total: orders.length, attention: attention.length }, syntechSync, syntechProcurement: { ...syntechProcurement, lastAttempt: lastApiOrder ? { at: lastApiOrder.updatedAt, status: lastApiOrder.externalSubmission?.status, code: lastApiOrder.externalSubmission?.lastErrorCode } : undefined, manualFallbackEnabled: true }, syncHistory: status.syncHistory.map((item) => ({ type: `${item.syncType} feed`, startedAt: item.startedAt, completedAt: item.completedAt, status: item.status, recordsProcessed: item.parsedCount, expectedCount: item.expectedCount, parsedCount: item.parsedCount, createdCount: item.createdCount, updatedCount: item.updatedCount, missingCount: item.missingCount, warningCount: item.warningCount, errors: item.status === "SUCCESS" ? 0 : 1, source: "Syntech JSON feed" })), lastError: latest?.status !== "SUCCESS" ? latest?.errorSummary : undefined };
  }
  if (id === "CJ") {
    const [status, catalogue] = await Promise.all([getCjConnectionStatus(), listCjCatalogueProducts()]);
    const syncHistory = status.lastSuccessfulRequestAt ? [{ type: "API catalogue request", completedAt: status.lastSuccessfulRequestAt, status: "SUCCESS", source: "CJ API" }] : [];
    return { supplier: registry, configurationStatus: status.configured ? "CONFIGURED" : "NOT_CONFIGURED", connectionStatus: status.authenticated ? "CONNECTED" : status.configured ? "DEGRADED" : "NOT_CONFIGURED", healthStatus: status.authenticated ? "HEALTHY" : status.configured ? "DEGRADED" : "UNKNOWN", catalogue: { productCount: catalogue.length, lastSyncAt: status.lastSuccessfulRequestAt }, mappings: { total: supplierMappings.length, verified: supplierMappings.filter((item) => item.status === "VERIFIED").length, reviewRequired: supplierMappings.filter((item) => item.status === "SUGGESTED" || item.status === "STALE").length }, orders: { total: orders.length, attention: attention.length }, syncHistory, lastError: status.lastError ?? undefined };
  }
  if (id === "MUSTEK") {
    const [status, sources, runs] = await Promise.all([getMustekCatalogueStatus(), listSupplierSources("MUSTEK"), listSupplierSourceRuns()]);
    const sourceIds = new Set(sources.map((source) => source.id));
    const mustekRuns = runs.filter((run) => sourceIds.has(run.sourceId));
    const latest = mustekRuns[0];
    const successful = mustekRuns.find((run) => ["IMPORTED", "PARTIAL", "UNCHANGED"].includes(run.status));
    return { supplier: registry, configurationStatus: sources.length ? "CONFIGURED" : "NOT_CONFIGURED", connectionStatus: successful ? "CONNECTED" : sources.some((source) => source.state === "ACTIVE") ? "DEGRADED" : "NOT_CONFIGURED", healthStatus: latest?.status === "FAILED" ? "FAILED" : successful ? "HEALTHY" : "UNKNOWN", catalogue: { productCount: status.metrics.total, lastSyncAt: successful?.completedAt }, mappings: { total: supplierMappings.length, verified: supplierMappings.filter((item) => item.status === "VERIFIED").length, reviewRequired: status.metrics.reviewRequired + status.metrics.conflicts + status.metrics.missingCommercialData }, orders: { total: orders.length, attention: attention.length }, syncHistory: mustekRuns.slice(0, 20).map((run) => ({ type: "Supplier source", startedAt: run.startedAt, completedAt: run.completedAt, status: run.status, recordsProcessed: run.counts.evidenceRows, errors: run.status === "FAILED" ? 1 : 0, source: "Mustek source registry" })), mustekSources: { configured: sources.length, active: sources.filter((source) => source.state === "ACTIVE").length, disabled: sources.filter((source) => source.state === "DISABLED").length }, mustekOffers: status.metrics, lastError: latest?.status === "FAILED" ? latest.errorSummary : undefined };
  }
  if (id === "TVR") {
    const [sources, runs, status] = await Promise.all([listSupplierSources("TVR"), listSupplierSourceRuns(), getTvrCatalogueStatus()]);
    const sourceIds = new Set(sources.map((source) => source.id));
    const supplierRuns = runs.filter((run) => sourceIds.has(run.sourceId));
    const latest = supplierRuns[0];
    const successful = supplierRuns.find((run) => ["IMPORTED", "UNCHANGED"].includes(run.status));
    return { supplier: registry, configurationStatus: sources.length === 2 ? "CONFIGURED" : "NOT_CONFIGURED", connectionStatus: successful ? "CONNECTED" : sources.some((source) => source.state === "ACTIVE") ? "DEGRADED" : "NOT_CONFIGURED", healthStatus: latest?.status === "FAILED" ? "FAILED" : successful ? "HEALTHY" : "UNKNOWN", catalogue: { productCount: status.metrics.total, lastSyncAt: status.metrics.lastObservedAt ?? successful?.completedAt }, mappings: { total: supplierMappings.length, verified: supplierMappings.filter((item) => item.status === "VERIFIED").length, reviewRequired: supplierMappings.filter((item) => item.status === "SUGGESTED" || item.status === "REVIEW_REQUIRED" || item.status === "STALE").length }, orders: { total: 0, attention: 0 }, tvrOffers: status.metrics, syncHistory: supplierRuns.slice(0, 20).map((run) => ({ type: "Supplier source", startedAt: run.startedAt, completedAt: run.completedAt, status: run.status, recordsProcessed: run.counts.evidenceRows, errors: run.status === "FAILED" ? 1 : 0, source: "TVR source registry" })), lastError: latest?.status === "FAILED" ? latest.errorSummary : undefined };
  }
  const [status, catalogue] = await Promise.all([getScoopCatalogueSyncStatus(), listScoopCatalogueProducts()]);
  const syncSucceeded = Boolean(status.lastSync && !status.lastSync.error && status.lastSync.failed === 0);
  const syncHistory = status.lastSync ? [{ type: "Catalogue feed sync", completedAt: status.lastSync.lastSyncedAt, status: status.lastSync.error ? "FAILED" : status.lastSync.failed > 0 ? "PARTIAL" : "SUCCESS", recordsProcessed: status.lastSync.fetched, errors: status.lastSync.failed, source: "Scoop XML feed" }] : [];
  return { supplier: registry, configurationStatus: status.productCount > 0 ? "CONFIGURED" : "NOT_CONFIGURED", connectionStatus: syncSucceeded ? "CONNECTED" : status.productCount > 0 ? "DEGRADED" : "NOT_CONFIGURED", healthStatus: syncSucceeded ? "HEALTHY" : status.productCount > 0 ? "DEGRADED" : "UNKNOWN", catalogue: { productCount: catalogue.length, availableCount: status.availableCount, staleCount: status.staleCount, lastSyncAt: status.lastSync?.lastSyncedAt }, mappings: { total: supplierMappings.length, verified: supplierMappings.filter((item) => item.status === "VERIFIED").length, reviewRequired: supplierMappings.filter((item) => item.status === "SUGGESTED" || item.status === "STALE").length }, orders: { total: orders.length, attention: attention.length }, syncHistory };
}

export async function getSupplierHub() { return { suppliers: (await Promise.all(operationalSupplierIds.map(getSupplierOperations))).filter(Boolean) }; }

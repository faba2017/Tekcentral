import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { ScoopCatalogueProduct, ScoopCatalogueSyncSummary, ScoopFeedParseResult, ScoopLaunchAssortmentState, ScoopLogisticsAuditEntry, ScoopLogisticsEnrichmentSummary, ScoopLogisticsMetadata, ScoopReconciliationStatus, ScoopSourceObservation, ScoopWebsiteImportRow, ScoopWebsiteImportSummary } from "./scoopTypes.js";
import { deriveScoopLogisticsStatus, effectiveScoopLogisticsMetadata, upsertScoopLogisticsSource, validateScoopLogisticsValues } from "./scoopLogisticsMetadata.js";

interface ScoopCatalogueStore {
  version: 1;
  products: ScoopCatalogueProduct[];
  lastSync?: ScoopCatalogueSyncSummary;
  lastEnrichment?: ScoopLogisticsEnrichmentSummary;
  logisticsAudit?: ScoopLogisticsAuditEntry[];
}

function getStorePath() {
  return resolve(process.cwd(), ".data", "supplier-catalogue-scoop.json");
}

async function readStore(): Promise<ScoopCatalogueStore> {
  try {
    const raw = await readFile(getStorePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<ScoopCatalogueStore>;
    if (parsed.version !== 1 || !Array.isArray(parsed.products)) {
      return { version: 1, products: [] };
    }
    const products = parsed.products.map((product) => {
      const legacy = product.logisticsMetadata as ScoopLogisticsMetadata & { source?: string } | undefined;
      const normalize = (record: typeof legacy): ScoopLogisticsMetadata | undefined => record ? {
        ...record,
        source: String(record.source) === "SCOOP_PRODUCT_PAGE" ? "SUPPLIER_PRODUCT_PAGE" : (record.source ?? "UNKNOWN") as ScoopLogisticsMetadata["source"],
        capturedAt: record.capturedAt ?? record.fetchedAt,
        updatedAt: record.updatedAt ?? record.fetchedAt,
      } : undefined;
      const sources = (product.logisticsSources?.map((record) => normalize(record)).filter((record): record is ScoopLogisticsMetadata => Boolean(record)) ?? (legacy ? [normalize(legacy)!] : []));
      const now = product.lastSyncedAt ?? product.updatedAt ?? product.createdAt ?? new Date().toISOString();
      const sourceObservations: ScoopSourceObservation[] = product.sourceObservations?.length ? product.sourceObservations : [{
        sourceType: "XML_FEED", sourceReference: product.sourceMetadata?.feedUrl, firstSeenAt: product.createdAt ?? now,
        lastSeenAt: now, lastSuccessfulRefreshAt: now, active: !product.staleAt, staleAt: product.staleAt,
        fields: product.sourceMetadata?.sourceFields ?? {},
      }];
      const xmlActive = sourceObservations.some((item) => item.sourceType === "XML_FEED" && item.active);
      const websiteActive = sourceObservations.some((item) => item.sourceType === "WEBSITE" && item.active);
      const reconciliationStatus = product.reconciliationStatus ?? (xmlActive && websiteActive ? "BOTH" : websiteActive ? "WEBSITE_ONLY" : xmlActive ? "XML_ONLY" : "STALE");
      return { ...product, sourceObservations, reconciliationStatus, logisticsSources: sources, logisticsMetadata: effectiveScoopLogisticsMetadata(sources) };
    });
    return { version: 1, products, lastSync: parsed.lastSync, lastEnrichment: parsed.lastEnrichment, logisticsAudit: parsed.logisticsAudit ?? [] };
  } catch {
    return { version: 1, products: [] };
  }
}

async function writeStore(store: ScoopCatalogueStore) {
  const storePath = getStorePath();
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2));
}

function comparableProduct(product: ScoopCatalogueProduct) {
  return {
    ...product,
    createdAt: undefined,
    updatedAt: undefined,
    lastSyncedAt: undefined,
    staleAt: undefined,
    productPageResolution: undefined,
    logisticsMetadata: undefined,
    logisticsSources: undefined,
    logisticsLastAttemptAt: undefined,
    logisticsLastError: undefined,
    launchAssortment: undefined,
    sourceObservations: product.sourceObservations.map((source) => ({ ...source, firstSeenAt: undefined, lastSeenAt: undefined, lastSuccessfulRefreshAt: undefined })),
    reconciliationHistory: undefined,
  };
}

function upsertObservation(existing: ScoopSourceObservation[], next: ScoopSourceObservation) {
  const index = existing.findIndex((item) => item.sourceType === next.sourceType);
  if (index < 0) return [...existing, next];
  const result = [...existing];
  result[index] = { ...next, firstSeenAt: existing[index].firstSeenAt };
  return result;
}

function statusForSources(sources: ScoopSourceObservation[], conflict = false): ScoopReconciliationStatus {
  if (conflict) return "SOURCE_MISMATCH";
  const xml = sources.some((source) => source.sourceType === "XML_FEED" && source.active);
  const website = sources.some((source) => source.sourceType === "WEBSITE" && source.active);
  return xml && website ? "BOTH" : xml ? "XML_ONLY" : website ? "WEBSITE_ONLY" : "STALE";
}

function normalizeIdentity(value?: string) {
  return (value ?? "").toLowerCase().replace(/\b(pty|ltd|limited|inc|corporation|corp|distribution)\b/g, "").replace(/wifi/g, "wi fi").replace(/[^a-z0-9]+/g, " ").trim();
}

export function scoopIdentityConflict(product: Pick<ScoopCatalogueProduct, "description" | "manufacturer">, website: ScoopWebsiteImportRow) {
  const reasons: string[] = [];
  const xmlManufacturer = normalizeIdentity(product.manufacturer);
  const webManufacturer = normalizeIdentity(website.manufacturer);
  if (xmlManufacturer && webManufacturer && xmlManufacturer !== webManufacturer) reasons.push("Manufacturer differs between XML and website observations.");
  return reasons;
}

function event(product: ScoopCatalogueProduct | undefined, type: NonNullable<ScoopCatalogueProduct["reconciliationHistory"]>[number]["type"], timestamp: string, detail?: string) {
  return { id: `scoop-source-${timestamp}-${Math.random().toString(36).slice(2, 8)}`, type, timestamp, detail };
}

export async function listScoopCatalogueProducts() {
  const store = await readStore();
  return store.products;
}

export async function getScoopCatalogueProduct(supplierSku: string) {
  const store = await readStore();
  return store.products.find((product) => product.supplierSku === supplierSku);
}

export async function getScoopCatalogueSyncStatus() {
  const store = await readStore();
  const logistics = {
    complete: store.products.filter((product) => product.logisticsMetadata?.status === "COMPLETE").length,
    partial: store.products.filter((product) => ["WEIGHT_ONLY", "DIMENSIONS_ONLY"].includes(product.logisticsMetadata?.status ?? "")).length,
    missing: store.products.filter((product) => !product.logisticsMetadata || ["MISSING", "INVALID"].includes(product.logisticsMetadata.status)).length,
    adminOverrides: store.products.filter((product) => product.logisticsMetadata?.source === "ADMIN").length,
    adminImports: store.products.filter((product) => product.logisticsMetadata?.source === "ADMIN_IMPORT").length,
    supplierPage: store.products.filter((product) => product.logisticsMetadata?.source === "SUPPLIER_PRODUCT_PAGE").length,
    supplierFeed: store.products.filter((product) => product.logisticsMetadata?.source === "SUPPLIER_FEED").length,
    manufacturer: store.products.filter((product) => product.logisticsMetadata?.source === "MANUFACTURER").length,
    unknown: store.products.filter((product) => product.logisticsMetadata?.source === "UNKNOWN").length,
  };
  return {
    supplier: "SCOOP" as const,
    productCount: store.products.length,
    availableCount: store.products.filter((product) => product.availability === "AVAILABLE").length,
    staleCount: store.products.filter((product) => product.availability === "STALE" || product.staleAt).length,
    reconciliation: {
      xmlBacked: store.products.filter((product) => product.sourceObservations.some((source) => source.sourceType === "XML_FEED" && source.active)).length,
      websiteBacked: store.products.filter((product) => product.sourceObservations.some((source) => source.sourceType === "WEBSITE" && source.active)).length,
      both: store.products.filter((product) => product.reconciliationStatus === "BOTH").length,
      websiteOnly: store.products.filter((product) => product.reconciliationStatus === "WEBSITE_ONLY").length,
      xmlOnly: store.products.filter((product) => product.reconciliationStatus === "XML_ONLY").length,
      conflicts: store.products.filter((product) => product.reconciliationStatus === "SOURCE_MISMATCH").length,
      stale: store.products.filter((product) => product.reconciliationStatus === "STALE").length,
    },
    lastSync: store.lastSync,
    lastEnrichment: store.lastEnrichment,
    logistics,
  };
}

export async function syncScoopCatalogueProducts(parsed: ScoopFeedParseResult): Promise<ScoopCatalogueSyncSummary> {
  const store = await readStore();
  const now = new Date().toISOString();
  const currentBySku = new Map(store.products.map((product) => [product.supplierSku, product]));
  const incomingSkus = new Set(parsed.products.map((product) => product.supplierSku));
  const nextProducts: ScoopCatalogueProduct[] = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let stale = 0;
  let matchedWebsiteOnly = 0;
  let upgradedToBoth = 0;
  let newXmlOnly = 0;
  let staleXmlObservations = 0;

  for (const product of parsed.products) {
    const existing = currentBySku.get(product.supplierSku);
    const priorStatus = existing?.reconciliationStatus;
    const website = existing?.sourceObservations.find((source) => source.sourceType === "WEBSITE");
    const xml = product.sourceObservations.find((source) => source.sourceType === "XML_FEED")!;
    const sourceObservations = upsertObservation(existing?.sourceObservations ?? [], { ...xml, firstSeenAt: existing?.sourceObservations.find((source) => source.sourceType === "XML_FEED")?.firstSeenAt ?? now });
    const conflictReasons = website ? scoopIdentityConflict(product as ScoopCatalogueProduct, { sku: product.supplierSku, title: website.fields.title ?? "", manufacturer: website.fields.manufacturer }) : [];
    const reconciliationStatus = statusForSources(sourceObservations, conflictReasons.length > 0);
    const next: ScoopCatalogueProduct = {
      ...product,
      manufacturer: product.manufacturer ?? existing?.manufacturer,
      imageUrl: product.imageUrl ?? existing?.imageUrl,
      productPageResolution: existing?.productPageResolution,
      logisticsMetadata: existing?.logisticsMetadata,
      logisticsSources: existing?.logisticsSources,
      logisticsLastAttemptAt: existing?.logisticsLastAttemptAt,
      logisticsLastError: existing?.logisticsLastError,
      launchAssortment: existing?.launchAssortment,
      sourceObservations,
      reconciliationStatus,
      reconciliationConflict: conflictReasons.length ? { detectedAt: existing?.reconciliationConflict?.detectedAt ?? now, reasons: conflictReasons } : undefined,
      reconciliationHistory: existing?.reconciliationHistory,
      mappingStatus: existing?.mappingStatus ?? "UNMAPPED",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastSyncedAt: now,
    };
    if (!existing) {
      created += 1;
      newXmlOnly += 1;
    } else if (JSON.stringify(comparableProduct(existing)) === JSON.stringify(comparableProduct(next))) {
      unchanged += 1;
      next.updatedAt = existing.updatedAt;
    } else {
      updated += 1;
    }
    if (priorStatus === "WEBSITE_ONLY") { matchedWebsiteOnly += 1; if (reconciliationStatus === "BOTH") upgradedToBoth += 1; }
    if (priorStatus && priorStatus !== reconciliationStatus) next.reconciliationHistory = [event(existing, "STATUS_CHANGED", now, `${priorStatus} to ${reconciliationStatus}`), ...(next.reconciliationHistory ?? [])].slice(0, 100);
    nextProducts.push(next);
  }

  for (const existing of store.products) {
    if (incomingSkus.has(existing.supplierSku)) continue;
    if (existing.availability === "STALE" || existing.staleAt) {
      unchanged += 1;
      nextProducts.push(existing);
      continue;
    }
    stale += 1; staleXmlObservations += 1;
    const sourceObservations = existing.sourceObservations.map((source) => source.sourceType === "XML_FEED" ? { ...source, active: false, staleAt: source.staleAt ?? now } : source);
    const websiteActive = sourceObservations.some((source) => source.sourceType === "WEBSITE" && source.active);
    const reconciliationStatus = statusForSources(sourceObservations, Boolean(existing.reconciliationConflict));
    nextProducts.push({ ...existing, sourceObservations, reconciliationStatus, availability: websiteActive ? "UNKNOWN" : "STALE", branchStock: {}, totalStock: undefined, dealerPriceExVat: undefined, dealerVatAmount: undefined, dealerPriceInclVat: undefined, retailPriceInclVat: undefined, updatedAt: now, staleAt: now,
      reconciliationHistory: [event(existing, "SOURCE_STALE", now, "XML observation absent from latest successful feed."), ...(existing.reconciliationHistory ?? [])].slice(0, 100) });
  }

  const summary: ScoopCatalogueSyncSummary = {
    fetched: parsed.products.length,
    created,
    updated,
    unchanged,
    stale,
    failed: 0,
    lastSyncedAt: now,
    xmlRootTag: parsed.xmlRootTag,
    xmlItemTag: parsed.xmlItemTag,
    xmlObserved: parsed.products.length,
    matchedWebsiteOnly,
    newXmlOnly,
    upgradedToBoth,
    staleXmlObservations,
  };
  await writeStore({
    version: 1,
    products: nextProducts.sort((a, b) => a.supplierSku.localeCompare(b.supplierSku)),
    lastSync: summary,
    lastEnrichment: store.lastEnrichment,
    logisticsAudit: store.logisticsAudit,
  });
  return summary;
}

export async function applyScoopWebsiteProducts(rows: ScoopWebsiteImportRow[], batchId: string): Promise<ScoopWebsiteImportSummary> {
  const store = await readStore(); const now = new Date().toISOString(); const bySku = new Map(store.products.map((product) => [product.supplierSku, product]));
  let newWebsiteOnly = 0; let mergedWithXml = 0; let unchanged = 0; let conflicts = 0;
  for (const row of rows) {
    const existing = bySku.get(row.sku); const previousWebsite = existing?.sourceObservations.find((source) => source.sourceType === "WEBSITE");
    const fields = Object.fromEntries(Object.entries({ title: row.title, manufacturer: row.manufacturer, productUrl: row.productUrl, imageUrl: row.imageUrl, category: row.category, supplierCode: row.supplierCode }).filter((entry): entry is [string, string] => Boolean(entry[1])));
    if (previousWebsite && JSON.stringify(previousWebsite.fields) === JSON.stringify(fields) && previousWebsite.active) { unchanged += 1; continue; }
    const observation: ScoopSourceObservation = { sourceType: "WEBSITE", sourceReference: row.productUrl, importBatchId: batchId, firstSeenAt: previousWebsite?.firstSeenAt ?? now, lastSeenAt: now, lastSuccessfulRefreshAt: now, active: true, fields };
    if (!existing) {
      const product: ScoopCatalogueProduct = { supplierId: "SCOOP", supplierSku: row.sku, description: row.title, manufacturer: row.manufacturer, imageUrl: row.imageUrl, branchStock: {}, availability: "UNKNOWN", currency: "ZAR", vatRate: 0.15, priceSemantics: { dealerPrice: "EXCLUDING_VAT", retailPrice: "INCLUDING_VAT" }, mappingStatus: "UNMAPPED", sourceMetadata: { feedUrl: "", sourceFields: {} }, sourceObservations: [observation], reconciliationStatus: "WEBSITE_ONLY", createdAt: now, updatedAt: now, lastSyncedAt: now, reconciliationHistory: [event(undefined, "SOURCE_ADDED", now, "Website discovery import")] };
      store.products.push(product); bySku.set(row.sku, product); newWebsiteOnly += 1; continue;
    }
    const sourceObservations = upsertObservation(existing.sourceObservations, observation); const reasons = scoopIdentityConflict(existing, row); const status = statusForSources(sourceObservations, reasons.length > 0);
    const next = { ...existing, manufacturer: existing.manufacturer ?? row.manufacturer, imageUrl: existing.imageUrl ?? row.imageUrl, sourceObservations, reconciliationStatus: status, reconciliationConflict: reasons.length ? { detectedAt: existing.reconciliationConflict?.detectedAt ?? now, reasons } : undefined, updatedAt: now,
      reconciliationHistory: [event(existing, reasons.length ? "CONFLICT_DETECTED" : "SOURCE_ADDED", now, reasons.join(" ") || "Website observation merged"), ...(existing.reconciliationHistory ?? [])].slice(0, 100) };
    const index = store.products.findIndex((product) => product.supplierSku === row.sku); store.products[index] = next; bySku.set(row.sku, next);
    if (reasons.length) conflicts += 1; else mergedWithXml += 1;
  }
  store.products.sort((a, b) => a.supplierSku.localeCompare(b.supplierSku)); await writeStore(store);
  return { discovered: rows.length, newWebsiteOnly, mergedWithXml, unchanged, conflicts, rejected: 0, batchId, importedAt: now };
}

export async function saveScoopCatalogueProduct(product: ScoopCatalogueProduct) {
  const store = await readStore();
  const index = store.products.findIndex((item) => item.supplierSku === product.supplierSku);
  if (index < 0) return undefined;
  store.products[index] = product;
  await writeStore(store);
  return product;
}

export async function setScoopLaunchAssortmentState(input: {
  supplierSku: string;
  state: ScoopLaunchAssortmentState;
  actor?: string;
  suggested?: boolean;
  suggestionReasons?: string[];
}) {
  const store = await readStore();
  const index = store.products.findIndex((product) => product.supplierSku === input.supplierSku);
  if (index < 0) return undefined;
  const now = new Date().toISOString();
  const existing = store.products[index].launchAssortment;
  store.products[index] = {
    ...store.products[index],
    launchAssortment: {
      state: input.state,
      suggested: input.suggested ?? false,
      suggestionReasons: input.suggestionReasons ?? (input.state === "CANDIDATE" ? existing?.suggestionReasons ?? [] : []),
      updatedAt: now,
      updatedBy: input.actor ?? "TekCentral Staff",
    },
    updatedAt: now,
  };
  await writeStore(store);
  return store.products[index];
}

export async function saveScoopLogisticsEnrichmentSummary(summary: ScoopLogisticsEnrichmentSummary) {
  const store = await readStore();
  store.lastEnrichment = summary;
  await writeStore(store);
  return summary;
}

export async function saveScoopAdminLogistics(input: { supplierSku: string; weightGrams?: number; lengthMm?: number; widthMm?: number; heightMm?: number; actor?: string }) {
  validateScoopLogisticsValues(input);
  const store = await readStore(); const index = store.products.findIndex((product) => product.supplierSku === input.supplierSku);
  if (index < 0) return undefined;
  const product = store.products[index]; const now = new Date().toISOString();
  const previous = product.logisticsSources?.find((record) => record.source === "ADMIN");
  const next: ScoopLogisticsMetadata = {
    source: "ADMIN", sourceReference: `TekCentral admin override for ${input.supplierSku}`, capturedAt: previous?.capturedAt ?? now, updatedAt: now, fetchedAt: now,
    productPageUrl: product.productPageResolution?.productPageUrl,
    weightGrams: input.weightGrams, lengthMm: input.lengthMm, widthMm: input.widthMm, heightMm: input.heightMm,
    actualWeightKg: input.weightGrams === undefined ? undefined : input.weightGrams / 1000,
    volumeM3: input.lengthMm === undefined ? undefined : (input.lengthMm * input.widthMm! * input.heightMm!) / 1_000_000_000,
    status: deriveScoopLogisticsStatus(input),
  };
  const sources = upsertScoopLogisticsSource(product.logisticsSources ?? (product.logisticsMetadata ? [product.logisticsMetadata] : []), next);
  store.products[index] = { ...product, logisticsSources: sources, logisticsMetadata: effectiveScoopLogisticsMetadata(sources), updatedAt: now };
  const fields = ["weightGrams", "lengthMm", "widthMm", "heightMm"].filter((field) => previous?.[field as keyof ScoopLogisticsMetadata] !== next[field as keyof ScoopLogisticsMetadata]);
  store.logisticsAudit = [{ id: `scoop-logistics-${Date.now()}`, supplierSku: input.supplierSku, changedFields: fields, previousValue: previous, newValue: next, timestamp: now, actor: input.actor ?? "TekCentral Staff" }, ...(store.logisticsAudit ?? [])].slice(0, 1000);
  await writeStore(store); return { product: store.products[index], audit: store.logisticsAudit[0] };
}

export async function clearScoopAdminLogistics(supplierSku: string, actor = "TekCentral Staff") {
  const store = await readStore(); const index = store.products.findIndex((product) => product.supplierSku === supplierSku); if (index < 0) return undefined;
  const product = store.products[index]; const previous = product.logisticsSources?.find((record) => record.source === "ADMIN");
  const sources = (product.logisticsSources ?? []).filter((record) => record.source !== "ADMIN"); const now = new Date().toISOString();
  store.products[index] = { ...product, logisticsSources: sources, logisticsMetadata: effectiveScoopLogisticsMetadata(sources), updatedAt: now };
  if (previous) store.logisticsAudit = [{ id: `scoop-logistics-${Date.now()}`, supplierSku, changedFields: ["ADMIN_OVERRIDE_CLEARED"], previousValue: previous, timestamp: now, actor }, ...(store.logisticsAudit ?? [])].slice(0, 1000);
  await writeStore(store); return { product: store.products[index], audit: store.logisticsAudit?.[0] };
}

export async function listScoopLogisticsAudit(supplierSku: string) { return (await readStore()).logisticsAudit?.filter((entry) => entry.supplierSku === supplierSku) ?? []; }

export async function saveScoopLogisticsSource(input: { supplierSku: string; record: ScoopLogisticsMetadata; actor: string }) {
  const store = await readStore(); const index = store.products.findIndex((product) => product.supplierSku === input.supplierSku); if (index < 0) return { outcome: "UNKNOWN_SKU" as const };
  const product = store.products[index]; const existingSources = product.logisticsSources ?? (product.logisticsMetadata ? [product.logisticsMetadata] : []);
  const previous = existingSources.find((record) => record.source === input.record.source);
  const fields = [
    "weightGrams", "lengthMm", "widthMm", "heightMm",
    "packageWeightGrams", "packageLengthMm", "packageWidthMm", "packageHeightMm",
    "manufacturer", "model", "identityConfidence", "sourceConfidence", "shippingBasis", "notes",
  ] as const;
  if (previous && fields.every((field) => previous[field] === input.record[field])) return { outcome: "UNCHANGED" as const, product };
  validateScoopLogisticsValues(input.record);
  const sources = upsertScoopLogisticsSource(existingSources, input.record); const now = new Date().toISOString();
  const next = { ...product, logisticsSources: sources, logisticsMetadata: effectiveScoopLogisticsMetadata(sources), updatedAt: now };
  store.products[index] = next;
  store.logisticsAudit = [{ id: `scoop-logistics-${Date.now()}-${input.supplierSku}`, supplierSku: input.supplierSku, changedFields: fields.filter((field) => previous?.[field] !== input.record[field]), previousValue: previous, newValue: input.record, timestamp: now, actor: input.actor }, ...(store.logisticsAudit ?? [])].slice(0, 1000);
  await writeStore(store); return { outcome: "UPDATED" as const, product: next };
}

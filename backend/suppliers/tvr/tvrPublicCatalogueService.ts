import { createHash } from "node:crypto";
import { loadPersistenceConfig } from "../../persistence/config.js";
import { query, withTransaction } from "../../persistence/postgres.js";
import { objectStorage } from "../../storage/objectStorage.js";
import { bestEffortAlert, bestEffortResolve } from "../../operationalAlertService.js";
import { createSourceRun, getSupplierSource, updateSourceRun, updateSupplierSourceObservation, type SupplierSourceRun } from "../../supplierSourceRegistry.js";
import { listTvrCatalogueOffers } from "./tvrCatalogueService.js";
import { TVR_PUBLIC_CATALOGUE_ID } from "./tvrSourceManifest.js";
import { acquireTvrPublicCatalogue, normalizeTvrWebsiteSku, TVR_PUBLIC_CATALOGUE_API_URL, TvrPublicCatalogueError, type TvrPublicCatalogueBundle } from "./tvrPublicCatalogue.js";

const active = new Set<string>();
const hash = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const versionIdFor = (fingerprint: string) => `version-${createHash("sha256").update(`${TVR_PUBLIC_CATALOGUE_ID}|${fingerprint}`).digest("hex").slice(0, 24)}`;

async function diagnosticMatches(bundle: TvrPublicCatalogueBundle) {
  if (loadPersistenceConfig().provider !== "POSTGRES") return { exactSupplierOfferSkuMatches: 0, websiteOnlySkus: bundle.products.length };
  const offers = await listTvrCatalogueOffers();
  const offerSkus = new Set(offers.map((offer) => normalizeTvrWebsiteSku(offer.supplierSku)).filter(Boolean));
  const websiteSkus = new Set(bundle.products.map((product) => product.normalizedSku));
  const exactSupplierOfferSkuMatches = [...websiteSkus].filter((sku) => offerSkus.has(sku)).length;
  return { exactSupplierOfferSkuMatches, websiteOnlySkus: [...websiteSkus].filter((sku) => !offerSkus.has(sku)).length };
}

async function persistBundle(bundle: TvrPublicCatalogueBundle, retrievedAt: string) {
  const bytes = new TextEncoder().encode(JSON.stringify(bundle));
  const rawHash = hash(bytes), versionId = versionIdFor(bundle.logicalFingerprint);
  const objectKey = `supplier-evidence/tvr/${TVR_PUBLIC_CATALOGUE_ID}/${bundle.logicalFingerprint}/normalized-products.json`;
  await objectStorage().storeObject({ key: objectKey, access: "PRIVATE", bytes, contentType: "application/json", expectedHash: rawHash });
  if (loadPersistenceConfig().provider === "POSTGRES") await withTransaction(async (client) => {
    await client.query(`INSERT INTO supplier_source_versions(id,source_id,fingerprint,object_key,content_type,byte_size,workbook_metadata,retrieved_at)
      VALUES($1,$2,$3,$4,'application/json',$5,$6::jsonb,$7) ON CONFLICT(source_id,fingerprint) DO NOTHING`, [versionId, TVR_PUBLIC_CATALOGUE_ID, bundle.logicalFingerprint, objectKey, bytes.length, JSON.stringify({ schema: bundle.schema, logicalFingerprint: bundle.logicalFingerprint, diagnostics: bundle.diagnostics, private: true, rawSha256: rawHash }), retrievedAt]);
    for (const [index, product] of bundle.products.entries()) await client.query(`INSERT INTO supplier_source_evidence(id,supplier_code,source_id,source_version_id,supplier_sku,source_description,source_brand,worksheet_name,source_row,product_url,observed_at,fingerprint,payload)
      VALUES($1,'TVR',$2,$3,$4,$5,$6,'STORE_API',$7,$8,$9,$10,$11::jsonb) ON CONFLICT(source_id,source_version_id,worksheet_name,source_row,supplier_sku) DO NOTHING`, [
      `evidence-${createHash("sha256").update(`${versionId}|${product.productId}|${product.websiteSku}`).digest("hex").slice(0, 28)}`,
      TVR_PUBLIC_CATALOGUE_ID, versionId, product.websiteSku, product.title, product.brand ?? null, index + 1, product.canonicalUrl, retrievedAt, product.fingerprint, JSON.stringify({ evidenceType: "TVR_PUBLIC_PRODUCT_V1", product }),
    ]);
  });
  return { versionId, objectKey, rawHash, bytes: bytes.length };
}

export async function syncTvrPublicCatalogue(mode: "CHECK" | "SYNC" = "SYNC", deps: { fetch?: typeof fetch } = {}) {
  if (active.has(TVR_PUBLIC_CATALOGUE_ID)) throw new TvrPublicCatalogueError("SYNC_IN_PROGRESS", "This source is already being checked.");
  const source = await getSupplierSource(TVR_PUBLIC_CATALOGUE_ID);
  if (!source || source.supplierCode !== "TVR") throw new TvrPublicCatalogueError("SOURCE_NOT_FOUND", "TVR public catalogue source was not found.");
  if (mode === "SYNC" && source.state !== "ACTIVE") throw new TvrPublicCatalogueError("SOURCE_DISABLED", "Activate this source before synchronizing it.");
  active.add(TVR_PUBLIC_CATALOGUE_ID);
  let run: SupplierSourceRun | undefined;
  try {
    run = await createSourceRun(TVR_PUBLIC_CATALOGUE_ID); run.status = "DOWNLOADING"; await updateSourceRun(run);
    const bundle = await acquireTvrPublicCatalogue({ fetch: deps.fetch, apiUrl: TVR_PUBLIC_CATALOGUE_API_URL });
    run.status = "PARSING"; await updateSourceRun(run);
    const now = new Date().toISOString(), diagnostics = await diagnosticMatches(bundle);
    const metadata = { schema: bundle.schema, apiEndpoint: "/wp-json/wc/store/v1/products", logicalFingerprint: bundle.logicalFingerprint, ...bundle.diagnostics, ...diagnostics, private: true, commercialAuthority: false, mediaDeferred: true };
    if (bundle.logicalFingerprint === source.fingerprint || mode === "CHECK") {
      run.status = bundle.logicalFingerprint === source.fingerprint ? "UNCHANGED" : "PARTIAL";
      run.completedAt = now; run.fingerprint = bundle.logicalFingerprint; run.counts = { products: bundle.products.length, pages: bundle.diagnostics.pagesFetched, quarantined: bundle.quarantine.length, duplicateProductIds: bundle.diagnostics.duplicateProductIds, duplicateCanonicalUrls: bundle.diagnostics.duplicateCanonicalUrls, duplicateNormalizedSkus: bundle.diagnostics.duplicateNormalizedSkus }; run.warnings = bundle.quarantine.slice(0, 100).map((item) => `${item.reason} on page ${item.page}`); run.metadata = { ...metadata, checkOnly: mode === "CHECK" };
      await updateSupplierSourceObservation(source.id, { lastCheckedAt: now, lastRetrievedAt: now, contentLength: bundle.diagnostics.responseBytes, revisionMetadata: metadata });
      return updateSourceRun(run);
    }
    const persisted = await persistBundle(bundle, now);
    run.status = bundle.quarantine.length ? "PARTIAL" : "IMPORTED"; run.completedAt = now; run.fingerprint = bundle.logicalFingerprint;
    run.counts = { products: bundle.products.length, pages: bundle.diagnostics.pagesFetched, quarantined: bundle.quarantine.length, duplicateProductIds: bundle.diagnostics.duplicateProductIds, duplicateCanonicalUrls: bundle.diagnostics.duplicateCanonicalUrls, duplicateNormalizedSkus: bundle.diagnostics.duplicateNormalizedSkus, exactSupplierOfferSkuMatches: diagnostics.exactSupplierOfferSkuMatches, websiteOnlySkus: diagnostics.websiteOnlySkus, sourceVersions: 1 };
    run.warnings = bundle.quarantine.slice(0, 100).map((item) => `${item.reason} on page ${item.page}`); run.metadata = { ...metadata, sourceVersionId: persisted.versionId, objectKey: persisted.objectKey, normalizedBundleSha256: persisted.rawHash, normalizedBundleBytes: persisted.bytes };
    await updateSupplierSourceObservation(source.id, { lastCheckedAt: now, lastRetrievedAt: now, lastImportedAt: now, lastFailedAt: undefined, lastErrorSummary: undefined, contentLength: bundle.diagnostics.responseBytes, fingerprint: bundle.logicalFingerprint, revisionMetadata: metadata });
    await bestEffortResolve({ type: "SUPPLIER_SOURCE_FAILURE", subsystem: "SUPPLIERS", entityType: "SUPPLIER_SOURCE", entityId: source.id, diagnosticCode: "TVR_PUBLIC_CATALOGUE_SYNC_FAILED" });
    return updateSourceRun(run);
  } catch (error) {
    const code = error instanceof TvrPublicCatalogueError ? error.code : "SOURCE_SYNC_FAILED";
    const summary = (error instanceof Error ? error.message : "TVR public catalogue synchronization failed.").replace(/https?:\/\/\S+/g, "[source]").slice(0, 300);
    if (run) { run.status = "FAILED"; run.completedAt = new Date().toISOString(); run.errorCode = code; run.errorSummary = summary; await updateSourceRun(run); }
    await updateSupplierSourceObservation(TVR_PUBLIC_CATALOGUE_ID, { lastCheckedAt: new Date().toISOString(), lastFailedAt: new Date().toISOString(), lastErrorSummary: summary });
    await bestEffortAlert({ type: "SUPPLIER_SOURCE_FAILURE", severity: "WARNING", subsystem: "SUPPLIERS", title: "TVR public catalogue synchronization needs attention", summary: "The bounded TVR public Product index could not be completed. Previous valid website evidence was retained.", entityType: "SUPPLIER_SOURCE", entityId: TVR_PUBLIC_CATALOGUE_ID, targetRoute: "/admin/suppliers/tvr/sources", recommendedAction: "Inspect the latest source run and retry after the public catalogue is stable.", diagnosticCode: "TVR_PUBLIC_CATALOGUE_SYNC_FAILED" });
    throw error;
  } finally { active.delete(TVR_PUBLIC_CATALOGUE_ID); }
}

export async function readCurrentTvrPublicCatalogueBundle(): Promise<{ sourceVersionId: string; sourceFingerprint: string; sourceState: string; retrievedAt: string; bundle: TvrPublicCatalogueBundle } | undefined> {
  if (loadPersistenceConfig().provider !== "POSTGRES") return undefined;
  const current = (await query<{ id: string; fingerprint: string; object_key: string; retrieved_at: string | Date; state: string }>(`SELECT v.id,v.fingerprint,v.object_key,v.retrieved_at,s.state FROM supplier_sources s JOIN supplier_source_versions v ON v.source_id=s.id AND v.fingerprint=s.fingerprint WHERE s.id=$1`, [TVR_PUBLIC_CATALOGUE_ID])).rows[0];
  if (!current?.object_key) return undefined;
  const bytes = await objectStorage().readObject(current.object_key, "PRIVATE");
  if (!bytes) return undefined;
  return { sourceVersionId: current.id, sourceFingerprint: current.fingerprint, sourceState: current.state, retrievedAt: current.retrieved_at instanceof Date ? current.retrieved_at.toISOString() : current.retrieved_at, bundle: JSON.parse(new TextDecoder().decode(bytes)) as TvrPublicCatalogueBundle };
}

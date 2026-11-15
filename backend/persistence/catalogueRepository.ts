import { createHash } from "node:crypto";
import { query, withTransaction } from "./postgres.js";

const LOCK = 8_473_629_113;
type Json = Record<string, unknown>;
const asJson = (value: unknown) => value as Json;
const iso = (value: unknown, fallback = new Date(0).toISOString()) => typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : fallback;
const json = (value: unknown) => JSON.stringify(value);

export function catalogueFingerprint(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16); }
export async function readCatalogueProducts<T>() { return (await query<{ payload: T }>("SELECT payload FROM catalogue_products WHERE product_kind='INTERNAL' ORDER BY created_at, id")).rows.map((row) => row.payload); }

export async function replaceCatalogueProducts(values: unknown[]) {
  const products = values.map(asJson);
  await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK]);
    for (const product of products) await client.query("INSERT INTO catalogue_products(id,slug,sku,publication_status,supplier_code,supplier_offer_id,product_kind,payload,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,'INTERNAL',$7::jsonb,$8,$9) ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,sku=excluded.sku,publication_status=excluded.publication_status,supplier_code=excluded.supplier_code,supplier_offer_id=excluded.supplier_offer_id,payload=excluded.payload,updated_at=excluded.updated_at", [product.id, product.slug, product.sku, product.publicationStatus ?? "INTERNAL_DRAFT", asJson(product.provenance)?.sourceSupplier, asJson(product.provenance)?.sourceSupplierOfferId, json(product), iso(product.createdAt), iso(product.updatedAt)]);
  });
}

export async function replaceCodeSeededProducts(values: unknown[]) {
  const products = values.map(asJson);
  await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK]);
    for (const product of products) await client.query("INSERT INTO catalogue_products(id,slug,sku,publication_status,supplier_code,supplier_offer_id,product_kind,payload,created_at,updated_at) VALUES($1,$2,$3,'PUBLISHED','CODE',$4,'CODE_SEEDED',$5::jsonb,$6,$6) ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,sku=excluded.sku,payload=excluded.payload", [product.id, product.slug, product.sku ?? product.id, `CODE:${String(product.id)}`, json(product), new Date(0).toISOString()]);
  });
}

export async function readPublicationStore<T>() {
  const [publications, drafts, audit] = await Promise.all([query<{ payload: T }>("SELECT payload FROM catalogue_publications ORDER BY updated_at, product_id"), query<{ payload: T }>("SELECT payload FROM catalogue_publication_drafts ORDER BY saved_at, product_id"), query<{ payload: T }>("SELECT payload FROM catalogue_publication_audit ORDER BY created_at, id")]);
  return { version: 1 as const, publications: publications.rows.map((row) => row.payload), drafts: drafts.rows.map((row) => row.payload), audit: audit.rows.map((row) => row.payload) };
}

export async function replacePublicationStore(value: { publications: unknown[]; drafts?: unknown[]; audit: unknown[] }) {
  const publications = value.publications.map(asJson); const drafts = (value.drafts ?? []).map(asJson); const audit = value.audit.map(asJson);
  await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK]); await client.query("DELETE FROM catalogue_publication_audit"); await client.query("DELETE FROM catalogue_publication_drafts"); await client.query("DELETE FROM catalogue_publication_versions"); await client.query("DELETE FROM catalogue_publications");
    for (const publication of publications) {
      await client.query("INSERT INTO catalogue_publications(product_id,state,active_version_id,updated_at,payload) VALUES($1,$2,$3,$4,$5::jsonb)", [publication.internalProductId, publication.state, publication.activeVersionId ?? null, iso(publication.updatedAt), json(publication)]);
      for (const version of (publication.versions as unknown[] ?? []).map(asJson)) await client.query("INSERT INTO catalogue_publication_versions(id,product_id,version,status,published_at,idempotency_key,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)", [version.id, publication.internalProductId, version.version, version.status, iso(version.publishedAt), version.idempotencyKey, json(version)]);
    }
    for (const draft of drafts) await client.query("INSERT INTO catalogue_publication_drafts(product_id,saved_at,payload) VALUES($1,$2,$3::jsonb)", [draft.internalProductId, iso(draft.savedAt), json(draft)]);
    for (const entry of audit) await client.query("INSERT INTO catalogue_publication_audit(id,product_id,action,created_at,payload) VALUES($1,$2,$3,$4,$5::jsonb)", [entry.id, entry.internalProductId, entry.action, iso(entry.at), json(entry)]);
  });
}

export async function readRows<T>(table: string, order: string) { return (await query<{ payload: T }>(`SELECT payload FROM ${table} ORDER BY ${order}`)).rows.map((row) => row.payload); }
export async function replaceMappings(values: unknown[]) { const rows = values.map(asJson); await replaceSimple("catalogue_product_mappings", rows, async (client, row) => client.query("INSERT INTO catalogue_product_mappings(id,supplier_code,supplier_identity,product_id,status,updated_at,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)", [row.id, row.supplierCode, row.supplierVariantId ?? row.supplierSku ?? row.supplierProductId, row.productId, row.status, iso(row.updatedAt), json(row)])); }
export async function replaceCategoryMappings(values: unknown[]) { const rows = values.map(asJson); await replaceSimple("catalogue_category_mappings", rows, async (client, row) => client.query("INSERT INTO catalogue_category_mappings(id,supplier_code,source_category_id,normalized_source_path,taxonomy_id,status,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)", [row.id, row.supplierId, row.sourceCategoryId ?? row.sourceCategoryPath ?? row.sourceCategoryLabel, row.normalizedSourcePath ?? row.sourceCategoryId ?? row.sourceCategoryPath ?? row.sourceCategoryLabel, row.categoryId ?? null, row.status ?? "VERIFIED", json(row)])); }
export async function upsertCategoryMapping(value: unknown) { const row = asJson(value); await withTransaction(async (client) => { await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${row.supplierId}:${row.normalizedSourcePath}`]); await client.query("INSERT INTO catalogue_category_mappings(id,supplier_code,source_category_id,normalized_source_path,taxonomy_id,status,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(supplier_code,normalized_source_path) DO UPDATE SET id=excluded.id,source_category_id=excluded.source_category_id,taxonomy_id=excluded.taxonomy_id,status=excluded.status,payload=excluded.payload", [row.id, row.supplierId, row.sourceCategoryId ?? row.sourceCategoryPath ?? row.sourceCategoryLabel, row.normalizedSourcePath, row.categoryId ?? null, row.status ?? "VERIFIED", json(row)]); }); }
export async function replacePricing(values: unknown[]) { const rows = values.map(asJson); await replaceSimple("catalogue_pricing_proposals", rows, async (client, row) => client.query("INSERT INTO catalogue_pricing_proposals(id,product_id,supplier_code,supplier_offer_id,status,generated_at,updated_at,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)", [row.id, row.productId, row.supplierId, row.supplierOfferId ?? null, row.status, iso(row.generatedAt), iso(row.updatedAt), json(row)])); }

async function replaceSimple(table: string, rows: Json[], insert: (client: Parameters<Parameters<typeof withTransaction>[0]>[0], row: Json) => Promise<unknown>) {
  await withTransaction(async (client) => { await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK]); await client.query(`DELETE FROM ${table}`); for (const row of rows) await insert(client, row); });
}

export async function replaceMerchandising(value: { sections: unknown[]; promotions: unknown[]; audit: unknown[] }) {
  const sections = value.sections.map(asJson); const promotions = value.promotions.map(asJson); const audit = value.audit.map(asJson);
  await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK]); await client.query("DELETE FROM catalogue_merchandising_audit"); await client.query("DELETE FROM catalogue_promotions"); await client.query("DELETE FROM catalogue_merchandising_sections");
    for (const section of sections) await client.query("INSERT INTO catalogue_merchandising_sections(id,section_key,sort_order,enabled,payload) VALUES($1,$2,$3,$4,$5::jsonb)", [section.id, section.key, section.order, section.enabled, json(section)]);
    for (const promotion of promotions) await client.query("INSERT INTO catalogue_promotions(id,enabled,starts_at,ends_at,payload) VALUES($1,$2,$3,$4,$5::jsonb)", [promotion.id, promotion.enabled, iso(promotion.startsAt), iso(promotion.endsAt), json(promotion)]);
    for (const entry of audit) await client.query("INSERT INTO catalogue_merchandising_audit(id,entity_id,action,created_at,payload) VALUES($1,$2,$3,$4,$5::jsonb)", [entry.id, entry.entityId, entry.action, iso(entry.createdAt), json(entry)]);
  });
}

export async function readSupplierStore<T>(supplierCode: string): Promise<{ version: 1; products: T[]; [key: string]: unknown }> {
  const state = await query<{ payload: Record<string, unknown> }>("SELECT payload FROM catalogue_supplier_state WHERE supplier_code=$1", [supplierCode]); const products = await query<{ payload: T }>("SELECT payload FROM catalogue_supplier_offers WHERE supplier_code=$1 ORDER BY supplier_identity", [supplierCode]);
  return { version: 1, ...(state.rows[0]?.payload ?? {}), products: products.rows.map((row) => row.payload) };
}

export async function replaceSupplierStore<T extends { products: unknown[] }>(supplierCode: string, value: T) {
  const products = value.products.map(asJson);
  await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK]); await client.query("DELETE FROM catalogue_supplier_offers WHERE supplier_code=$1", [supplierCode]);
    for (const product of products) { const identity = String(product.supplierProductId ?? product.supplierSku ?? product.id); await client.query("INSERT INTO catalogue_supplier_offers(supplier_code,supplier_identity,product_id,supplier_sku,availability,currency,observed_at,updated_at,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)", [supplierCode, identity, product.productId ?? null, product.supplierSku ?? identity, product.availability ?? null, product.currency ?? null, product.observedAt ? iso(product.observedAt) : null, product.updatedAt ? iso(product.updatedAt) : null, json(product)]); }
    const metadata = { ...value } as Record<string, unknown>; delete metadata.products; delete metadata.version; await client.query("INSERT INTO catalogue_supplier_state(supplier_code,payload,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(supplier_code) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at", [supplierCode, json(metadata)]);
  });
}

export async function replaceMedia(values: unknown[]) {
  const records = values.map(asJson); const order = new Map<string, number>();
  await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK]); await client.query("DELETE FROM catalogue_media_records");
    for (const record of records) { const productId = String(record.internalProductId); const sortOrder = order.get(productId) ?? 0; order.set(productId, sortOrder + 1); const publicUrl = String(record.publicUrl); const provenance = asJson(record.provenance); await client.query("INSERT INTO catalogue_media_records(id,product_id,public_url,storage_key,content_type,byte_size,source_url,captured_at,sort_order,is_primary,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)", [record.id ?? createHash("sha256").update(`${productId}:${publicUrl}`).digest("hex"), productId, publicUrl, `products/${publicUrl.split("/").pop()}`, record.mimeType ?? provenance.contentType, provenance.bytes, record.sourceImageUrl ?? null, iso(record.storedAt ?? provenance.capturedAt), sortOrder, sortOrder === 0, json(record)]); }
  });
}

export async function recordCatalogueImport(fingerprint: string, summary: unknown) { await query("INSERT INTO catalogue_import_runs(fingerprint,source_summary,completed_at) VALUES($1,$2::jsonb,now()) ON CONFLICT DO NOTHING", [fingerprint, json(summary)]); }
export async function catalogueImportExists(fingerprint: string) { return (await query("SELECT 1 FROM catalogue_import_runs WHERE fingerprint=$1", [fingerprint])).rowCount === 1; }

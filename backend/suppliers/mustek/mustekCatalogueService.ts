import { query, withTransaction } from "../../persistence/postgres.js";
import { loadPersistenceConfig } from "../../persistence/config.js";
import { normalizeMustekOffers, type MustekEvidenceRow, type MustekNormalizedOffer } from "./mustekOfferNormalization.js";

const memory: MustekNormalizedOffer[] = [];
const mapRow = (row: Record<string, unknown>): MustekEvidenceRow => ({
  evidenceId: String(row.evidence_id), sourceId: String(row.source_id), sourceLabel: row.source_label ? String(row.source_label) : undefined, sourceVersionId: String(row.source_version_id), sourceFingerprint: String(row.source_fingerprint),
  supplierSku: row.supplier_sku ? String(row.supplier_sku) : undefined, sourceDescription: row.source_description ? String(row.source_description) : undefined,
  sourceBrand: row.source_brand ? String(row.source_brand) : undefined, workbookName: row.workbook_name ? String(row.workbook_name) : undefined,
  worksheetName: row.worksheet_name ? String(row.worksheet_name) : undefined, sourceRow: row.source_row === null ? undefined : Number(row.source_row),
  dealerCost: row.dealer_cost === null ? undefined : Number(row.dealer_cost), currency: row.currency ? String(row.currency) : undefined,
  taxBasis: row.tax_basis ? String(row.tax_basis) : undefined, observedAt: new Date(String(row.observed_at)).toISOString(),
});

export async function readCurrentMustekEvidence() {
  if (loadPersistenceConfig().provider !== "POSTGRES") return [];
  const rows = await query<Record<string, unknown>>(`SELECT e.id evidence_id,e.source_id,s.label source_label,e.source_version_id,v.fingerprint source_fingerprint,e.supplier_sku,e.source_description,e.source_brand,e.workbook_name,e.worksheet_name,e.source_row,e.dealer_cost,e.currency,e.tax_basis,e.observed_at
    FROM supplier_source_evidence e JOIN supplier_sources s ON s.id=e.source_id JOIN supplier_source_versions v ON v.id=e.source_version_id
    WHERE e.supplier_code='MUSTEK' AND s.state='ACTIVE' AND s.purpose='PRICE_LIST' AND s.fingerprint=v.fingerprint
    ORDER BY e.supplier_sku,e.id`);
  return rows.rows.map(mapRow);
}

export async function normalizeCurrentMustekCatalogue(rows?: MustekEvidenceRow[]) {
  const result = normalizeMustekOffers(rows ?? await readCurrentMustekEvidence());
  if (loadPersistenceConfig().provider !== "POSTGRES") { memory.splice(0, memory.length, ...result.offers); return { ...result, created: result.offers.length, updated: 0, unchanged: 0 }; }
  let created = 0, updated = 0, unchanged = 0;
  await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('MUSTEK_CATALOGUE_NORMALIZATION'))");
    for (const offer of result.offers) {
      const existing = await client.query<{ product_id: string | null; payload: MustekNormalizedOffer }>("SELECT product_id,payload FROM catalogue_supplier_offers WHERE supplier_code='MUSTEK' AND supplier_identity=$1 FOR UPDATE", [offer.supplierIdentity]);
      const prior = existing.rows[0];
      if (prior?.payload.normalizedOfferFingerprint === offer.normalizedOfferFingerprint) {
        await client.query("UPDATE catalogue_supplier_offers SET observed_at=$2,payload=jsonb_set(jsonb_set(payload,'{provenance}',$3::jsonb,true),'{observedAt}',$4::jsonb,true) WHERE supplier_code='MUSTEK' AND supplier_identity=$1", [offer.supplierIdentity, offer.observedAt, JSON.stringify(offer.provenance), JSON.stringify(offer.observedAt)]);
        unchanged += 1; continue;
      }
      const payload = { ...offer, mappingStatus: prior?.product_id ? prior.payload.mappingStatus : "UNMAPPED" };
      await client.query(`INSERT INTO catalogue_supplier_offers(supplier_code,supplier_identity,product_id,supplier_sku,availability,currency,observed_at,updated_at,payload)
        VALUES('MUSTEK',$1,NULL,$2,'UNKNOWN',$3,$4,$5,$6::jsonb)
        ON CONFLICT(supplier_code,supplier_identity) DO UPDATE SET supplier_sku=excluded.supplier_sku,availability='UNKNOWN',currency=excluded.currency,observed_at=excluded.observed_at,updated_at=excluded.updated_at,payload=excluded.payload`,
      [offer.supplierIdentity, offer.supplierSku, offer.currency ?? null, offer.observedAt, offer.updatedAt, JSON.stringify(payload)]);
      if (prior) updated += 1;
      else created += 1;
    }
    await client.query("INSERT INTO catalogue_supplier_state(supplier_code,payload,updated_at) VALUES('MUSTEK',$1::jsonb,now()) ON CONFLICT(supplier_code) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at", [JSON.stringify({ normalizedAt: new Date().toISOString(), offerCount: result.offers.length, unresolvedEvidenceCount: result.unresolvedEvidenceCount })]);
  });
  return { ...result, created, updated, unchanged };
}

export async function listMustekCatalogueOffers() {
  if (loadPersistenceConfig().provider !== "POSTGRES") return [...memory];
  return (await query<{ payload: MustekNormalizedOffer }>("SELECT payload FROM catalogue_supplier_offers WHERE supplier_code='MUSTEK' ORDER BY supplier_identity")).rows.map((row) => row.payload);
}

export async function getMustekCatalogueOffer(supplierSku: string) {
  const normalized = supplierSku.normalize("NFKC").trim().toUpperCase();
  return (await listMustekCatalogueOffers()).find((offer) => offer.supplierSku === normalized);
}

export async function getMustekCatalogueStatus() {
  const offers = await listMustekCatalogueOffers();
  return { offers, metrics: { total: offers.length, safe: offers.filter((item) => item.classification === "SAFE").length, reviewRequired: offers.filter((item) => item.classification === "REVIEW_REQUIRED").length, conflicts: offers.filter((item) => item.classification === "CONFLICT").length, missingCommercialData: offers.filter((item) => item.classification === "MISSING_COMMERCIAL_DATA").length, withCost: offers.filter((item) => item.cost !== undefined).length, lastObservedAt: offers.map((item) => item.observedAt).sort().at(-1) } };
}

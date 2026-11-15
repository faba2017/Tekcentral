import { loadPersistenceConfig } from "../../persistence/config.js";
import { query, withTransaction } from "../../persistence/postgres.js";
import { bestEffortAlert, bestEffortResolve } from "../../operationalAlertService.js";
import { TVR_COMMERCIAL_WORKBOOK_ID } from "./tvrSourceManifest.js";
import { normalizeTvrOffers, type TvrNormalizedOffer, type TvrOfferEvidenceRow } from "./tvrOfferNormalization.js";

interface EvidenceRow { id: string; source_id: string; source_version_id: string; observed_at: Date | string; payload: Omit<TvrOfferEvidenceRow, "sourceId" | "sourceVersionId" | "observedAt"> }

export async function readCurrentTvrOfferEvidence(): Promise<TvrOfferEvidenceRow[]> {
  if (loadPersistenceConfig().provider !== "POSTGRES") throw new Error("TVR_CATALOGUE_POSTGRES_REQUIRED");
  const current = (await query<{ id: string }>("SELECT id FROM supplier_source_versions WHERE source_id=$1 ORDER BY retrieved_at DESC LIMIT 1", [TVR_COMMERCIAL_WORKBOOK_ID])).rows[0];
  if (!current) throw new Error("TVR_SOURCE_VERSION_NOT_FOUND");
  return (await query<EvidenceRow>("SELECT id,source_id,source_version_id,observed_at,payload FROM supplier_source_evidence WHERE supplier_code='TVR' AND source_version_id=$1 ORDER BY id", [current.id])).rows.map((row) => ({ ...row.payload, id: row.id, sourceId: row.source_id, sourceVersionId: row.source_version_id, observedAt: new Date(row.observed_at).toISOString() }));
}

export async function promoteCurrentTvrCatalogue(rows?: TvrOfferEvidenceRow[]) {
  let created = 0, updated = 0, unchanged = 0, noLongerObserved = 0;
  try {
    const evidence = rows ?? await readCurrentTvrOfferEvidence();
    if (!evidence.length) throw new Error("TVR_SEMANTIC_EVIDENCE_NOT_FOUND");
    const result = normalizeTvrOffers(evidence);
    await withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('TVR_CATALOGUE_PROMOTION'))");
      const existing = await client.query<{ supplier_identity: string; product_id: string | null; payload: TvrNormalizedOffer }>("SELECT supplier_identity,product_id,payload FROM catalogue_supplier_offers WHERE supplier_code='TVR'");
      const byIdentity = new Map(existing.rows.map((row) => [row.supplier_identity, row]));
      const currentIdentities = new Set(result.offers.map((offer) => offer.supplierIdentity));
      for (const offer of result.offers) {
        const prior = byIdentity.get(offer.supplierIdentity);
        if (prior?.payload.normalizedOfferFingerprint === offer.normalizedOfferFingerprint && prior.payload.lifecycleStatus === "CURRENT") { unchanged += 1; continue; }
        const payload: TvrNormalizedOffer = { ...offer, mappingStatus: prior?.payload.mappingStatus ?? offer.mappingStatus };
        await client.query(`INSERT INTO catalogue_supplier_offers(supplier_code,supplier_identity,product_id,supplier_sku,availability,currency,observed_at,updated_at,payload)
          VALUES('TVR',$1,$2,$3,$4,$5,$6,$7,$8::jsonb)
          ON CONFLICT(supplier_code,supplier_identity) DO UPDATE SET supplier_sku=excluded.supplier_sku,availability=excluded.availability,currency=excluded.currency,observed_at=excluded.observed_at,updated_at=excluded.updated_at,payload=excluded.payload`,
        [offer.supplierIdentity, prior?.product_id ?? null, offer.catalogueSupplierSku, offer.availability, offer.currency ?? null, offer.observedAt, offer.updatedAt, JSON.stringify(payload)]);
        if (prior) updated += 1; else created += 1;
      }
      for (const prior of existing.rows) {
        if (currentIdentities.has(prior.supplier_identity) || prior.payload.lifecycleStatus === "NO_LONGER_OBSERVED") continue;
        await client.query("UPDATE catalogue_supplier_offers SET payload=$3::jsonb,updated_at=now() WHERE supplier_code='TVR' AND supplier_identity=$1 AND product_id IS NOT DISTINCT FROM $2", [prior.supplier_identity, prior.product_id, JSON.stringify({ ...prior.payload, lifecycleStatus: "NO_LONGER_OBSERVED", updatedAt: new Date().toISOString() })]);
        noLongerObserved += 1;
      }
      const metrics = metricsFor(result.offers);
      await client.query("INSERT INTO catalogue_supplier_state(supplier_code,payload,updated_at) VALUES('TVR',$1::jsonb,now()) ON CONFLICT(supplier_code) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at", [JSON.stringify({ normalizedAt: new Date().toISOString(), ...metrics })]);
    });
    await bestEffortResolve({ type: "SUPPLIER_SOURCE_FAILURE", subsystem: "SUPPLIERS", entityType: "SUPPLIER_SOURCE", entityId: TVR_COMMERCIAL_WORKBOOK_ID, diagnosticCode: "TVR_CATALOGUE_PROMOTION_FAILED" });
    return { ...result, created, updated, unchanged, noLongerObserved, metrics: metricsFor(result.offers) };
  } catch (error) {
    await bestEffortAlert({ type: "SUPPLIER_SOURCE_FAILURE", severity: "WARNING", subsystem: "SUPPLIERS", title: "TVR catalogue promotion needs attention", summary: "Current immutable TVR evidence could not be promoted. Previous supplier offers were retained.", entityType: "SUPPLIER_SOURCE", entityId: TVR_COMMERCIAL_WORKBOOK_ID, targetRoute: "/admin/suppliers/tvr/products", recommendedAction: "Inspect the TVR catalogue promotion failure before retrying.", diagnosticCode: "TVR_CATALOGUE_PROMOTION_FAILED" });
    throw error;
  }
}

export async function listTvrCatalogueOffers() {
  if (loadPersistenceConfig().provider !== "POSTGRES") return [];
  return (await query<{ payload: TvrNormalizedOffer }>("SELECT payload FROM catalogue_supplier_offers WHERE supplier_code='TVR' ORDER BY supplier_identity")).rows.map((row) => row.payload);
}

export async function getTvrCatalogueOffer(identity: string) {
  const normalized = identity.trim();
  if (!normalized) return undefined;
  return (await listTvrCatalogueOffers()).find((offer) =>
    offer.id === normalized ||
    offer.supplierIdentity === normalized ||
    offer.catalogueSupplierSku === normalized,
  );
}

export const metricsFor = (offers: TvrNormalizedOffer[]) => ({
  total: offers.filter((item) => item.lifecycleStatus === "CURRENT").length,
  safe: offers.filter((item) => item.lifecycleStatus === "CURRENT" && item.classification === "SAFE").length,
  reviewRequired: offers.filter((item) => item.lifecycleStatus === "CURRENT" && item.classification === "REVIEW_REQUIRED").length,
  conflicts: offers.filter((item) => item.lifecycleStatus === "CURRENT" && item.classification === "CONFLICT").length,
  missingCommercialData: offers.filter((item) => item.lifecycleStatus === "CURRENT" && item.classification === "MISSING_COMMERCIAL_DATA").length,
  new: offers.filter((item) => item.lifecycleStatus === "CURRENT" && item.condition === "NEW").length,
  clearance: offers.filter((item) => item.lifecycleStatus === "CURRENT" && item.condition === "CLEARANCE").length,
  remanufactured: offers.filter((item) => item.lifecycleStatus === "CURRENT" && item.condition === "REMANUFACTURED").length,
  flags: offers.filter((item) => item.lifecycleStatus === "CURRENT").reduce<Record<string, number>>((counts, item) => { for (const flag of item.flags) counts[flag] = (counts[flag] ?? 0) + 1; return counts; }, {}),
  lastObservedAt: offers.map((item) => item.observedAt).sort().at(-1),
});

export async function getTvrCatalogueStatus() {
  const offers = await listTvrCatalogueOffers();
  if (loadPersistenceConfig().provider !== "POSTGRES") return { offers, metrics: { ...metricsFor(offers), semanticEvidenceCount: 0 } };
  const semanticEvidenceCount = Number((await query<{ count: number }>("SELECT count(*)::int AS count FROM supplier_source_evidence WHERE supplier_code='TVR' AND source_version_id=(SELECT id FROM supplier_source_versions WHERE source_id=$1 ORDER BY retrieved_at DESC LIMIT 1)", [TVR_COMMERCIAL_WORKBOOK_ID])).rows[0]?.count ?? 0);
  return { offers, metrics: { ...metricsFor(offers), semanticEvidenceCount } };
}

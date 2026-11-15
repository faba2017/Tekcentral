import assert from "node:assert/strict";
import { closePostgres, query } from "../persistence/postgres.js";
import { normalizeTvrSourceVersion } from "../suppliers/tvr/tvrSemanticEvidenceService.js";
import { TVR_COMMERCIAL_WORKBOOK_ID } from "../suppliers/tvr/tvrSourceManifest.js";

if (process.env.RUN_TVR_POSTGRES_INTEGRATION !== "1") {
  console.log("TVR semantic PostgreSQL integration skipped (set RUN_TVR_POSTGRES_INTEGRATION=1).");
} else {
  const version = (await query<{ id: string }>("SELECT id FROM supplier_source_versions WHERE source_id=$1 ORDER BY retrieved_at DESC LIMIT 1", [TVR_COMMERCIAL_WORKBOOK_ID])).rows[0];
  assert.ok(version, "accepted TVR workbook version is required");
  const offersBefore = Number((await query<{ count: number }>("SELECT count(*)::int AS count FROM catalogue_supplier_offers WHERE supplier_code='TVR'")).rows[0].count);
  const mappingsBefore = Number((await query<{ count: number }>("SELECT count(*)::int AS count FROM catalogue_product_mappings WHERE supplier_code='TVR'")).rows[0].count);
  const pricingBefore = Number((await query<{ count: number }>("SELECT count(*)::int AS count FROM catalogue_pricing_proposals WHERE supplier_code='TVR'")).rows[0].count);
  const first = await normalizeTvrSourceVersion(version.id);
  const second = await normalizeTvrSourceVersion(version.id);
  assert.equal(first.report.logicalFingerprint, second.report.logicalFingerprint);
  assert.equal(second.inserted, 0);
  assert.equal(second.existing, first.report.evidence.length);
  assert.equal(Number((await query<{ count: number }>("SELECT count(*)::int AS count FROM supplier_source_evidence WHERE supplier_code='TVR' AND source_version_id=$1", [version.id])).rows[0].count), first.report.evidence.length);
  assert.equal(Number((await query<{ count: number }>("SELECT count(*)::int AS count FROM catalogue_supplier_offers WHERE supplier_code='TVR'")).rows[0].count), offersBefore);
  assert.equal(Number((await query<{ count: number }>("SELECT count(*)::int AS count FROM catalogue_product_mappings WHERE supplier_code='TVR'")).rows[0].count), mappingsBefore);
  assert.equal(Number((await query<{ count: number }>("SELECT count(*)::int AS count FROM catalogue_pricing_proposals WHERE supplier_code='TVR'")).rows[0].count), pricingBefore);
  await closePostgres();
  console.log("TVR semantic PostgreSQL integration tests passed");
}

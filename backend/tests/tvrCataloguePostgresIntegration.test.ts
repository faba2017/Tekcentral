import assert from "node:assert/strict";
import { closePostgres, query } from "../persistence/postgres.js";
import { promoteCurrentTvrCatalogue } from "../suppliers/tvr/tvrCatalogueService.js";

if (process.env.RUN_TVR_POSTGRES_INTEGRATION !== "1") {
  console.log("TVR catalogue PostgreSQL integration skipped (set RUN_TVR_POSTGRES_INTEGRATION=1).");
} else {
  const before = {
    products: Number((await query<{ count: number }>("SELECT count(*)::int AS count FROM catalogue_products")).rows[0].count),
    mappings: Number((await query<{ count: number }>("SELECT count(*)::int AS count FROM catalogue_product_mappings WHERE supplier_code='TVR'")).rows[0].count),
    pricing: Number((await query<{ count: number }>("SELECT count(*)::int AS count FROM catalogue_pricing_proposals WHERE supplier_code='TVR'")).rows[0].count),
  };
  const first = await promoteCurrentTvrCatalogue();
  assert.ok(first.metrics.total > 0);
  const second = await promoteCurrentTvrCatalogue();
  assert.equal(second.created, 0); assert.equal(second.updated, 0); assert.equal(second.unchanged, first.metrics.total);
  assert.equal(Number((await query<{ count: number }>("SELECT count(*)::int AS count FROM catalogue_supplier_offers WHERE supplier_code='TVR' AND product_id IS NOT NULL")).rows[0].count), 0);
  assert.equal(Number((await query<{ count: number }>("SELECT count(*)::int AS count FROM catalogue_product_mappings WHERE supplier_code='TVR'")).rows[0].count), before.mappings);
  assert.equal(Number((await query<{ count: number }>("SELECT count(*)::int AS count FROM catalogue_pricing_proposals WHERE supplier_code='TVR'")).rows[0].count), before.pricing);
  assert.equal(Number((await query<{ count: number }>("SELECT count(*)::int AS count FROM catalogue_products")).rows[0].count), before.products);
  assert.ok(Number((await query<{ count: number }>("SELECT count(*)::int AS count FROM catalogue_supplier_offers WHERE supplier_code='TVR' AND availability IN ('AVAILABLE','LOW_STOCK','OUT_OF_STOCK')")).rows[0].count) > 0);
  assert.equal(Number((await query<{ count: number }>("SELECT count(*)::int AS count FROM catalogue_supplier_offers WHERE supplier_code='TVR' AND payload->>'classification'='CONFLICT' AND availability<>'UNKNOWN'")).rows[0].count), 0);
  await closePostgres();
  console.log(`TVR catalogue PostgreSQL integration tests passed (${first.metrics.total} offers)`);
}

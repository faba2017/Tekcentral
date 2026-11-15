import { query, closePostgres } from "../persistence/postgres.js";

const tables = [
  "customers", "customer_sessions", "staff_accounts", "staff_sessions", "catalogue_products", "catalogue_supplier_offers", "catalogue_pricing_proposals", "catalogue_publications", "commerce_orders", "commerce_order_lines", "commerce_payment_records", "commerce_supplier_orders", "commerce_inventory_balances", "commerce_inventory_reservations", "contact_conversations", "contact_messages", "operational_alerts", "operational_events", "admin_audit", "internal_notifications", "operational_state", "zeus_usage_events", "admin_ai_conversations", "admin_ai_messages", "admin_ai_context_attachments", "rate_limit_buckets", "app_sequences",
] as const;

const snapshot: Record<string, { count: number; fingerprint: string }> = {};
for (const table of tables) {
  const result = await query<{ count: string; fingerprint: string }>(`SELECT count(*)::text AS count, md5(coalesce(string_agg(to_jsonb(row_value)::text, '' ORDER BY to_jsonb(row_value)::text), '')) AS fingerprint FROM ${table} row_value`);
  snapshot[table] = { count: Number(result.rows[0].count), fingerprint: result.rows[0].fingerprint };
}
const constraints = await query<{ invalid: string }>("SELECT count(*)::text AS invalid FROM pg_constraint WHERE contype='f' AND NOT convalidated");
console.log(JSON.stringify({ snapshot, foreignKeysNotValidated: Number(constraints.rows[0].invalid) }, null, 2));
await closePostgres();

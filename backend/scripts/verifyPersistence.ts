import { closePostgres, query } from "../persistence/postgres.js";

const tables = ["products", "customers", "orders", "supplier_offers", "supplier_orders", "staff_accounts", "contact_conversations", "admin_audit", "operational_alerts", "media_objects"];
try { const counts: Record<string, number> = {}; for (const table of tables) { const result = await query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table}`); counts[table] = Number(result.rows[0]?.count ?? 0); } console.log(JSON.stringify({ success: true, counts }, null, 2)); }
finally { await closePostgres(); }

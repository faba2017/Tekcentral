import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import pg, { type PoolClient, type QueryResultRow } from "pg";
import { loadMigrationDatabaseConfig, loadPersistenceConfig } from "./config.js";

const { Pool } = pg;
let sharedPool: pg.Pool | undefined;
let migrationPool: pg.Pool | undefined;
let coordinationPool: pg.Pool | undefined;

export function postgresPool() {
  const config = loadPersistenceConfig();
  if (config.provider !== "POSTGRES" || !config.databaseUrl) throw new Error("PostgreSQL persistence is not configured.");
  sharedPool ??= new Pool({ connectionString: config.databaseUrl, max: config.databasePoolMax, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 30_000, statement_timeout: 15_000, ssl: config.databaseSslMode === "require" ? { rejectUnauthorized: false } : false, application_name: `tekcentral-${config.environment}` });
  return sharedPool;
}

export async function withTransaction<T>(operation: (client: PoolClient) => Promise<T>) { const client = await postgresPool().connect(); try { await client.query("BEGIN"); const result = await operation(client); await client.query("COMMIT"); return result; } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); } }
export async function query<T extends QueryResultRow = QueryResultRow>(sql: string, parameters: unknown[] = []) { return postgresPool().query<T>(sql, parameters); }
function postgresCoordinationPool() {
  const config = loadPersistenceConfig();
  if (config.provider !== "POSTGRES" || !config.databaseUrl) throw new Error("PostgreSQL persistence is required for distributed coordination.");
  coordinationPool ??= new Pool({ connectionString: config.databaseUrl, max: 2, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 30_000, statement_timeout: 15_000, ssl: config.databaseSslMode === "require" ? { rejectUnauthorized: false } : false, application_name: `tekcentral-${config.environment}-coordination` });
  return coordinationPool;
}
export async function withDistributedLock<T>(lockKey: string, operation: () => Promise<T>): Promise<{ acquired: true; value: T } | { acquired: false }> {
  const client = await postgresCoordinationPool().connect();
  let acquired = false;
  try {
    acquired = Boolean((await client.query<{ acquired: boolean }>("SELECT pg_try_advisory_lock(hashtext($1)) AS acquired", [lockKey])).rows[0]?.acquired);
    if (!acquired) return { acquired: false };
    return { acquired: true, value: await operation() };
  } finally {
    if (acquired) await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]).catch(() => undefined);
    client.release();
  }
}
export async function postgresReady() { const started = Date.now(); try { const result = await postgresPool().query<{ ok: number }>("SELECT 1 AS ok"); return { ready: result.rows[0]?.ok === 1, latencyMs: Date.now() - started }; } catch { return { ready: false, latencyMs: Date.now() - started }; } }
export async function closePostgres() { if (sharedPool) { const pool = sharedPool; sharedPool = undefined; await pool.end(); } if (coordinationPool) { const pool = coordinationPool; coordinationPool = undefined; await pool.end(); } await closeMigrationPostgres(); }

function postgresMigrationPool() {
  const config = loadMigrationDatabaseConfig();
  migrationPool ??= new Pool({ connectionString: config.databaseUrl, max: 1, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 10_000, statement_timeout: 60_000, ssl: config.databaseSslMode === "require" ? { rejectUnauthorized: false } : false, application_name: "tekcentral-migration" });
  return migrationPool;
}

export async function closeMigrationPostgres() { if (migrationPool) { const pool = migrationPool; migrationPool = undefined; await pool.end(); } }

export async function runMigrations(directory = resolve(process.cwd(), "backend", "persistence", "migrations")) {
  const files = (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  const client = await postgresMigrationPool().connect();
  try { await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(847362910)"); await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now(), checksum text NOT NULL)"); const applied = new Set((await client.query<{ version: string }>("SELECT version FROM schema_migrations")).rows.map((row) => row.version)); const executed: string[] = [];
    for (const file of files) { if (applied.has(file)) continue; const sql = await readFile(resolve(directory, file), "utf8"); const { createHash } = await import("node:crypto"); const checksum = createHash("sha256").update(sql).digest("hex"); await client.query(sql); await client.query("INSERT INTO schema_migrations(version, checksum) VALUES ($1, $2)", [file, checksum]); executed.push(file); }
    await client.query("COMMIT"); return { discovered: files.length, executed };
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
}

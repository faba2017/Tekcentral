import assert from "node:assert/strict";
import pg from "pg";
import { bootstrapPersistenceRoles } from "../persistence/roleBootstrap.js";
import { closePostgres, runMigrations } from "../persistence/postgres.js";

const { Client } = pg;
const adminConnection = process.env.KSEC_R3_POSTGRES_ADMIN_URL;
if (!adminConnection) {
  console.log("PostgreSQL role integration skipped: KSEC_R3_POSTGRES_ADMIN_URL not configured.");
  process.exit(0);
}

const suffix = String(process.pid);
const database = `tekcentral_ksec_r3_${suffix}`;
const migrationRole = `tekcentral_migration_${suffix}`;
const runtimeRole = `tekcentral_runtime_${suffix}`;
const migrationPassword = `migration-${suffix}-safe`;
const runtimePassword = `runtime-${suffix}-safe`;
const adminUrl = new URL(adminConnection);
const targetUrl = (role: string, password: string, db = database) => { const value = new URL(adminUrl); value.username = role; value.password = password; value.pathname = `/${db}`; return value.toString(); };
const admin = new Client({ connectionString: adminUrl.toString(), ssl: false });

await admin.connect();
try {
  await admin.query(`CREATE ROLE "${migrationRole}" LOGIN PASSWORD '${migrationPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  await admin.query(`CREATE ROLE "${runtimeRole}" LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  await admin.query(`CREATE DATABASE "${database}" OWNER "${migrationRole}"`);
  await admin.query(`ALTER ROLE "${migrationRole}" SET search_path = public, pg_catalog`);
  await admin.query(`ALTER ROLE "${runtimeRole}" SET search_path = pg_catalog, public`);
  process.env.APP_ENV = "test";
  process.env.NODE_ENV = "test";
  process.env.PERSISTENCE_PROVIDER = "POSTGRES";
  process.env.DATABASE_SSL_MODE = "disable";
  process.env.DATABASE_RUNTIME_ROLE = runtimeRole;
  process.env.DATABASE_MIGRATION_ROLE = migrationRole;
  process.env.DATABASE_URL = targetUrl(runtimeRole, runtimePassword);
  process.env.DATABASE_MIGRATION_URL = targetUrl(migrationRole, migrationPassword);

  const migrated = await runMigrations();
  assert.equal(migrated.discovered, 16);
  assert.equal(migrated.executed.length, 16);
  await closePostgres();
  await bootstrapPersistenceRoles(process.env);

  const runtime = new Client({ connectionString: process.env.DATABASE_URL, ssl: false });
  const migration = new Client({ connectionString: process.env.DATABASE_MIGRATION_URL, ssl: false });
  await runtime.connect(); await migration.connect();
  try {
    const identity = (await runtime.query<{ current_user: string; database_owner: string; schema_owner: string; search_path: string }>("SELECT current_user, pg_get_userbyid((SELECT datdba FROM pg_database WHERE datname=current_database())) database_owner, pg_get_userbyid((SELECT nspowner FROM pg_namespace WHERE nspname='public')) schema_owner, current_setting('search_path') search_path")).rows[0];
    assert.equal(identity.current_user, runtimeRole);
    assert.notEqual(identity.database_owner, runtimeRole);
    assert.notEqual(identity.schema_owner, runtimeRole);
    assert.match(identity.search_path, /pg_catalog, public/);

    await runtime.query("INSERT INTO customers(id,email,normalized_email,display_name,password_hash,status,created_at,updated_at) VALUES('customer-role-test','role@example.test','role@example.test','Role Test','hash','ACTIVE',now(),now())");
    await runtime.query("INSERT INTO customer_sessions(id,customer_id,token_hash,created_at,last_seen_at,expires_at) VALUES('session-role-test','customer-role-test','token-hash',now(),now(),now()+interval '1 hour')");
    assert.equal((await runtime.query<{ count: string }>("SELECT count(*)::text count FROM customer_sessions WHERE customer_id='customer-role-test'")).rows[0].count, "1");
    await runtime.query("DELETE FROM customer_sessions WHERE id='session-role-test'");
    await runtime.query("INSERT INTO app_sequences(name,year,next_value) VALUES('role-test',2026,1)");
    assert.equal((await runtime.query<{ value: string }>("SELECT allocate_business_sequence('role-test',2026)::text value")).rows[0].value, "1");
    assert.equal((await runtime.query<{ acquired: boolean }>("SELECT pg_try_advisory_lock(731992) acquired")).rows[0].acquired, true);
    await runtime.query("SELECT pg_advisory_unlock(731992)");

    for (const sql of [
      "CREATE TABLE public.runtime_must_not_create(id integer)",
      "ALTER TABLE public.customers ADD COLUMN runtime_must_not_add text",
      "DROP TABLE public.customers",
      `CREATE ROLE runtime_escape_${suffix}`,
      "CREATE FUNCTION public.runtime_escape() RETURNS integer LANGUAGE sql AS 'SELECT 1'",
    ]) await assert.rejects(() => runtime.query(sql), /permission denied|must be owner/i);
    await assert.rejects(() => runtime.query("SELECT * FROM schema_migrations"), /permission denied/i);

    const immutablePrivileges = (await runtime.query<{ can_update: boolean; can_delete: boolean }>("SELECT has_table_privilege(current_user,'public.admin_audit','UPDATE') can_update, has_table_privilege(current_user,'public.admin_audit','DELETE') can_delete")).rows[0];
    assert.equal(immutablePrivileges.can_update, false);
    assert.equal(immutablePrivileges.can_delete, false);
    await runtime.query("INSERT INTO admin_audit(id,category,actor_type,action_type,entity_type,entity_id,summary,occurred_at) VALUES('audit-role-test','AUDIT','SYSTEM','ROLE_TEST','SYSTEM','role-test','role test',now())");
    await runtime.query("DELETE FROM admin_audit WHERE id='audit-role-test'");
    await runtime.query("UPDATE admin_audit SET summary='changed' WHERE id='audit-role-test'");
    assert.deepEqual((await runtime.query<{ summary: string }>("SELECT summary FROM admin_audit WHERE id='audit-role-test'")).rows, [{ summary: "role test" }]);

    await migration.query("CREATE TABLE public.future_runtime_table(id text PRIMARY KEY, value text)");
    await runtime.query("INSERT INTO future_runtime_table(id,value) VALUES('one','default grant works')");
    assert.equal((await runtime.query<{ value: string }>("SELECT value FROM future_runtime_table WHERE id='one'")).rows[0].value, "default grant works");
    await assert.rejects(() => runtime.query("ALTER TABLE future_runtime_table ADD COLUMN forbidden text"), /must be owner|permission denied/i);
    await migration.query("DROP TABLE public.future_runtime_table");

    const functions = await migration.query<{ proname: string; security_definer: boolean; config: string[] | null }>("SELECT proname, prosecdef security_definer, proconfig config FROM pg_proc JOIN pg_namespace n ON n.oid=pronamespace WHERE n.nspname='public' AND proname IN ('allocate_business_sequence','reject_immutable_commerce_record','validate_private_invoice_media_object','validate_customer_delivery_invoice_order') ORDER BY proname");
    assert.equal(functions.rows.every((row) => row.security_definer === false), true);
    assert.equal(functions.rows.every((row) => row.config?.some((value) => value === "search_path=pg_catalog, public")), true);
    assert.equal((await migration.query<{ count: string }>("SELECT count(*)::text count FROM schema_migrations")).rows[0].count, "16");
  } finally { await runtime.end(); await migration.end(); }
  console.log("PostgreSQL migration/runtime role separation and DDL-denial tests passed.");
} finally {
  await closePostgres().catch(() => undefined);
  await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [database]).catch(() => undefined);
  await admin.query(`DROP DATABASE IF EXISTS "${database}"`).catch(() => undefined);
  await admin.query(`DROP ROLE IF EXISTS "${runtimeRole}"`).catch(() => undefined);
  await admin.query(`DROP ROLE IF EXISTS "${migrationRole}"`).catch(() => undefined);
  await admin.end();
}

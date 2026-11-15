import pg from "pg";
import { loadMigrationDatabaseConfig } from "./config.js";

const { Client } = pg;
const safeRole = (value: string | undefined, label: string) => {
  if (!value || !/^[a-z][a-z0-9_]{2,62}$/.test(value)) throw new Error(`${label} must be a safe lowercase PostgreSQL role name.`);
  return value;
};
const identifier = (value: string) => `"${value}"`;

async function grantFunctionIfPresent(client: pg.Client, runtimeRole: string, signature: string) {
  const exists = await client.query<{ present: boolean }>("SELECT to_regprocedure($1) IS NOT NULL AS present", [signature]);
  if (exists.rows[0]?.present) await client.query(`GRANT EXECUTE ON FUNCTION ${signature} TO ${identifier(runtimeRole)}`);
}

export async function bootstrapPersistenceRoles(environment: NodeJS.ProcessEnv = process.env) {
  const config = loadMigrationDatabaseConfig(environment);
  const migrationRole = safeRole(config.databaseMigrationRole, "DATABASE_MIGRATION_ROLE");
  const runtimeRole = safeRole(config.databaseRuntimeRole, "DATABASE_RUNTIME_ROLE");
  const client = new Client({ connectionString: config.databaseUrl, ssl: config.databaseSslMode === "require" ? { rejectUnauthorized: false } : false, application_name: "tekcentral-role-bootstrap" });
  await client.connect();
  try {
    const identity = await client.query<{ current_user: string }>("SELECT current_user");
    if (identity.rows[0]?.current_user !== migrationRole) throw new Error("DATABASE_MIGRATION_URL must authenticate as the configured migration role before role bootstrap.");
    await client.query("BEGIN");
    const roles = await client.query<{ rolname: string; rolcanlogin: boolean; rolsuper: boolean; rolcreatedb: boolean; rolcreaterole: boolean; rolreplication: boolean; rolbypassrls: boolean }>("SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=ANY($1::text[])", [[runtimeRole, migrationRole]]);
    if (roles.rows.length !== 2) throw new Error("Configured PostgreSQL roles must be provisioned by the managed-database administrator before grant bootstrap.");
    for (const role of roles.rows) if (!role.rolcanlogin || role.rolsuper || role.rolcreatedb || role.rolcreaterole || role.rolreplication || role.rolbypassrls) throw new Error(`Configured PostgreSQL role ${role.rolname} violates the least-privilege role attributes.`);
    await client.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    await client.query(`REVOKE ALL ON SCHEMA public FROM ${identifier(runtimeRole)}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${identifier(runtimeRole)}`);
    await client.query("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC");
    await client.query("REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC");
    await client.query("REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC");
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${identifier(runtimeRole)}`);
    await client.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${identifier(runtimeRole)}`);
    await client.query(`REVOKE ALL ON TABLE public.schema_migrations FROM ${identifier(runtimeRole)}`);
    for (const table of ["admin_audit", "commerce_invoices", "commerce_invoice_documents", "commerce_customer_delivery_attempts"]) {
      const tableExists = await client.query<{ present: boolean }>("SELECT to_regclass($1) IS NOT NULL AS present", [`public.${table}`]);
      if (tableExists.rows[0]?.present) await client.query(`REVOKE UPDATE, DELETE ON TABLE public.${identifier(table)} FROM ${identifier(runtimeRole)}`);
    }
    for (const signature of [
      "public.allocate_business_sequence(text,integer)",
      "public.reject_immutable_commerce_record()",
      "public.validate_private_invoice_media_object()",
      "public.validate_customer_delivery_invoice_order()",
      "public.gen_random_uuid()",
    ]) await grantFunctionIfPresent(client, runtimeRole, signature);
    await client.query(`ALTER FUNCTION public.allocate_business_sequence(text,integer) SET search_path = pg_catalog, public`);
    for (const signature of ["public.reject_immutable_commerce_record()", "public.validate_private_invoice_media_object()", "public.validate_customer_delivery_invoice_order()"] ) {
      const functionExists = await client.query<{ present: boolean }>("SELECT to_regprocedure($1) IS NOT NULL AS present", [signature]);
      if (functionExists.rows[0]?.present) await client.query(`ALTER FUNCTION ${signature} SET search_path = pg_catalog, public`);
    }
    await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${identifier(migrationRole)} IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC`);
    await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${identifier(migrationRole)} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${identifier(runtimeRole)}`);
    await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${identifier(migrationRole)} IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC`);
    await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${identifier(migrationRole)} IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${identifier(runtimeRole)}`);
    await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${identifier(migrationRole)} IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`);
    await client.query("COMMIT");
    return { migrationRole, runtimeRole, schema: "public", immutableDeleteRevocations: 4 };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { await client.end(); }
}

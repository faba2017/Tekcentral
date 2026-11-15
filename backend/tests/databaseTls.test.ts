import assert from "node:assert/strict";
import { loadDatabaseTlsConfig, postgresSslOptions, sanitizedPostgresConnectionString } from "../persistence/databaseTls.js";
import { loadMigrationDatabaseConfig, loadPersistenceConfig } from "../persistence/config.js";

const ca = "-----BEGIN CERTIFICATE-----\nsynthetic-test-ca\n-----END CERTIFICATE-----";
const staging = { APP_ENV: "staging", DATABASE_SSL_MODE: "verify-full", DATABASE_SSL_CA: ca } as NodeJS.ProcessEnv;
assert.deepEqual(loadDatabaseTlsConfig(staging, "staging"), { mode: "verify-full", ca });
assert.deepEqual(postgresSslOptions({ mode: "verify-full", ca }), { rejectUnauthorized: true, ca }); assert.equal(postgresSslOptions({ mode: "disable" }), false);
assert.throws(() => loadDatabaseTlsConfig({ APP_ENV: "staging", DATABASE_SSL_MODE: "disable" }, "staging"), /requires DATABASE_SSL_MODE=verify-full/);
assert.throws(() => loadDatabaseTlsConfig({ APP_ENV: "staging", DATABASE_SSL_MODE: "require" }, "staging"), /disable or verify-full/);
assert.throws(() => loadDatabaseTlsConfig({ APP_ENV: "staging", DATABASE_SSL_MODE: "verify-full" }, "staging"), /DATABASE_SSL_CA/);
assert.throws(() => loadDatabaseTlsConfig({ APP_ENV: "staging", DATABASE_SSL_MODE: "verify-full", DATABASE_SSL_CA: "not a certificate" }, "staging"), /PEM certificate/);
assert.doesNotThrow(() => loadDatabaseTlsConfig({ DATABASE_SSL_MODE: "disable" }, "development"));
assert.equal(sanitizedPostgresConnectionString("postgres://user:pass@db.example:25060/app?sslmode=require&application_name=test"), "postgres://user:pass@db.example:25060/app?application_name=test");

const common = { APP_ENV: "staging", PERSISTENCE_PROVIDER: "POSTGRES", DATABASE_RUNTIME_ROLE: "tekcentral_runtime", DATABASE_MIGRATION_ROLE: "tekcentral_migration", DATABASE_SSL_MODE: "verify-full", DATABASE_SSL_CA_BASE64: Buffer.from(ca).toString("base64"), OBJECT_STORAGE_PROVIDER: "SPACES", OBJECT_STORAGE_ENDPOINT: "https://fra1.digitaloceanspaces.com", OBJECT_STORAGE_REGION: "fra1", OBJECT_STORAGE_PUBLIC_BUCKET: "tekcentral-staging-public-media", OBJECT_STORAGE_PRIVATE_BUCKET: "tekcentral-staging-private-documents", OBJECT_STORAGE_PUBLIC_ACCESS_KEY: "public-key", OBJECT_STORAGE_PUBLIC_SECRET_KEY: "public-secret", OBJECT_STORAGE_PRIVATE_ACCESS_KEY: "private-key", OBJECT_STORAGE_PRIVATE_SECRET_KEY: "private-secret", OBJECT_STORAGE_PUBLIC_BASE_URL: "https://tekcentral-staging-public-media.fra1.digitaloceanspaces.com" } as NodeJS.ProcessEnv;
assert.equal(loadPersistenceConfig({ ...common, DATABASE_URL: "postgres://tekcentral_runtime:secret@db.example/app?sslmode=require" }).databaseSslMode, "verify-full");
assert.equal(loadMigrationDatabaseConfig({ ...common, DATABASE_MIGRATION_URL: "postgres://tekcentral_migration:secret@db.example/app?sslmode=require" }).databaseMigrationRole, "tekcentral_migration");
assert.throws(() => loadPersistenceConfig({ ...common, DATABASE_URL: "postgres://tekcentral_runtime:secret@db.example/app", DATABASE_SSL_CA_BASE64: "" }), /DATABASE_SSL_CA/);
console.log("Verified PostgreSQL TLS configuration tests passed.");

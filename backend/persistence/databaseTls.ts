import { readFileSync } from "node:fs";
import type { ConnectionOptions } from "node:tls";

export type DatabaseSslMode = "disable" | "verify-full";
export type PersistenceEnvironment = "development" | "test" | "staging" | "production";

export interface DatabaseTlsConfig {
  mode: DatabaseSslMode;
  ca?: string;
}

function certificateFromEnvironment(environment: NodeJS.ProcessEnv) {
  const inline = environment.DATABASE_SSL_CA?.trim();
  const encoded = environment.DATABASE_SSL_CA_BASE64?.trim();
  const file = environment.DATABASE_SSL_CA_FILE?.trim();
  const configured = [inline, encoded, file].filter(Boolean);
  if (configured.length > 1) throw new Error("Configure only one of DATABASE_SSL_CA, DATABASE_SSL_CA_BASE64, or DATABASE_SSL_CA_FILE.");
  let certificate: string | undefined;
  if (inline) certificate = inline.replace(/\\n/g, "\n");
  if (encoded) {
    try { certificate = Buffer.from(encoded, "base64").toString("utf8").trim(); }
    catch { throw new Error("DATABASE_SSL_CA_BASE64 must contain a valid base64-encoded CA certificate."); }
  }
  if (file) {
    try { certificate = readFileSync(file, "utf8").trim(); }
    catch { throw new Error("DATABASE_SSL_CA_FILE could not be read."); }
  }
  if (!certificate) return undefined;
  if (!certificate.includes("-----BEGIN CERTIFICATE-----") || !certificate.includes("-----END CERTIFICATE-----") || certificate.includes("PRIVATE KEY")) {
    throw new Error("The configured database CA must contain a PEM certificate and no private key.");
  }
  return certificate;
}

export function loadDatabaseTlsConfig(environment: NodeJS.ProcessEnv, runtime: PersistenceEnvironment): DatabaseTlsConfig {
  const requested = environment.DATABASE_SSL_MODE?.trim().toLowerCase();
  const mode = (requested || (runtime === "staging" || runtime === "production" ? "verify-full" : "disable")) as DatabaseSslMode;
  if (mode !== "disable" && mode !== "verify-full") throw new Error("DATABASE_SSL_MODE must be disable or verify-full.");
  if ((runtime === "staging" || runtime === "production") && mode !== "verify-full") throw new Error(`${runtime} requires DATABASE_SSL_MODE=verify-full.`);
  if (mode === "disable") return { mode };
  const ca = certificateFromEnvironment(environment);
  if (!ca) throw new Error("DATABASE_SSL_CA, DATABASE_SSL_CA_BASE64, or DATABASE_SSL_CA_FILE is required when DATABASE_SSL_MODE=verify-full.");
  return { mode, ca };
}

export function postgresSslOptions(config: DatabaseTlsConfig): false | ConnectionOptions {
  return config.mode === "disable" ? false : { rejectUnauthorized: true, ca: config.ca };
}

export function sanitizedPostgresConnectionString(value: string) {
  const parsed = new URL(value);
  for (const parameter of ["sslmode", "sslrootcert", "sslcert", "sslkey", "sslpassword"]) parsed.searchParams.delete(parameter);
  return parsed.toString();
}

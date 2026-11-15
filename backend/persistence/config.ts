export type PersistenceProvider = "LOCAL" | "POSTGRES";
export type ObjectStorageProvider = "LOCAL" | "SPACES";

export interface PersistenceConfig {
  environment: "development" | "test" | "staging" | "production";
  provider: PersistenceProvider;
  databaseUrl?: string;
  databaseRuntimeRole?: string;
  databaseMigrationRole?: string;
  databaseSslMode: "disable" | "require";
  databasePoolMax: number;
  objectStorage: {
    provider: ObjectStorageProvider;
    endpoint?: string;
    region?: string;
    publicBucket?: string;
    privateBucket?: string;
    publicAccessKey?: string;
    publicSecretKey?: string;
    privateAccessKey?: string;
    privateSecretKey?: string;
    publicBaseUrl?: string;
    localRoot: string;
  };
}

const boundedInteger = (value: string | undefined, fallback: number, min: number, max: number) => { const parsed = Number(value); return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback; };
const roleName = (value?: string) => value?.trim();
function databaseUsername(value?: string) { if (!value) return undefined; try { return decodeURIComponent(new URL(value).username); } catch { return undefined; } }
function validateSpacesEndpoint(endpoint: string | undefined, region: string | undefined) {
  let parsed: URL;
  try { parsed = new URL(endpoint ?? ""); } catch { throw new Error("OBJECT_STORAGE_ENDPOINT must be an approved DigitalOcean Spaces HTTPS endpoint."); }
  const expectedHost = region ? `${region}.digitaloceanspaces.com` : "";
  if (parsed.protocol !== "https:" || parsed.hostname !== expectedHost || parsed.port || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error("OBJECT_STORAGE_ENDPOINT must be an approved DigitalOcean Spaces HTTPS endpoint matching OBJECT_STORAGE_REGION.");
}

export function loadPersistenceConfig(environment: NodeJS.ProcessEnv = process.env): PersistenceConfig {
  const runtime = environment.NODE_ENV === "production" ? "production" : environment.APP_ENV === "staging" ? "staging" : environment.NODE_ENV === "test" ? "test" : "development";
  const provider = (environment.PERSISTENCE_PROVIDER?.toUpperCase() || "LOCAL") as PersistenceProvider;
  const objectProvider = (environment.OBJECT_STORAGE_PROVIDER?.toUpperCase() || "LOCAL") as ObjectStorageProvider;
  if (!(["LOCAL", "POSTGRES"] as string[]).includes(provider)) throw new Error("PERSISTENCE_PROVIDER must be LOCAL or POSTGRES.");
  if (!(["LOCAL", "SPACES"] as string[]).includes(objectProvider)) throw new Error("OBJECT_STORAGE_PROVIDER must be LOCAL or SPACES.");
  if ((runtime === "production" || runtime === "staging") && provider !== "POSTGRES") throw new Error(`${runtime} requires PERSISTENCE_PROVIDER=POSTGRES.`);
  if (provider === "POSTGRES" && !environment.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is required for PostgreSQL persistence.");
  if ((runtime === "production" || runtime === "staging") && objectProvider !== "SPACES") throw new Error(`${runtime} requires OBJECT_STORAGE_PROVIDER=SPACES.`);
  const runtimeRole = roleName(environment.DATABASE_RUNTIME_ROLE);
  const migrationRole = roleName(environment.DATABASE_MIGRATION_ROLE);
  if (runtime === "production" || runtime === "staging") {
    if (!runtimeRole || !migrationRole) throw new Error("DATABASE_RUNTIME_ROLE and DATABASE_MIGRATION_ROLE are required for staging/production separation.");
    if (runtimeRole === migrationRole) throw new Error("Database runtime and migration roles must be different.");
    if (databaseUsername(environment.DATABASE_URL) !== runtimeRole) throw new Error("DATABASE_URL must authenticate as DATABASE_RUNTIME_ROLE in staging/production.");
  }
  if (objectProvider === "SPACES") {
    for (const key of ["OBJECT_STORAGE_ENDPOINT", "OBJECT_STORAGE_REGION", "OBJECT_STORAGE_PUBLIC_BUCKET", "OBJECT_STORAGE_PRIVATE_BUCKET", "OBJECT_STORAGE_PUBLIC_BASE_URL"] as const) if (!environment[key]?.trim()) throw new Error(`${key} is required for Spaces object storage.`);
    validateSpacesEndpoint(environment.OBJECT_STORAGE_ENDPOINT, environment.OBJECT_STORAGE_REGION);
    if (environment.OBJECT_STORAGE_PUBLIC_BUCKET?.trim() === environment.OBJECT_STORAGE_PRIVATE_BUCKET?.trim()) throw new Error("Public and private object-storage buckets must be different.");
    const separateCredentials = ["OBJECT_STORAGE_PUBLIC_ACCESS_KEY", "OBJECT_STORAGE_PUBLIC_SECRET_KEY", "OBJECT_STORAGE_PRIVATE_ACCESS_KEY", "OBJECT_STORAGE_PRIVATE_SECRET_KEY"] as const;
    if (runtime === "production" || runtime === "staging") for (const key of separateCredentials) if (!environment[key]?.trim()) throw new Error(`${key} is required for staging/production Spaces isolation.`);
    if (runtime === "development" || runtime === "test") {
      const hasLegacy = Boolean(environment.OBJECT_STORAGE_ACCESS_KEY?.trim() && environment.OBJECT_STORAGE_SECRET_KEY?.trim());
      const hasSeparate = separateCredentials.every((key) => Boolean(environment[key]?.trim()));
      if (!hasLegacy && !hasSeparate) throw new Error("Spaces object storage credentials are required.");
    }
  }
  const legacyAccessKey = environment.OBJECT_STORAGE_ACCESS_KEY?.trim();
  const legacySecretKey = environment.OBJECT_STORAGE_SECRET_KEY?.trim();
  return {
    environment: runtime, provider, databaseUrl: environment.DATABASE_URL?.trim(), databaseRuntimeRole: runtimeRole, databaseMigrationRole: migrationRole, databaseSslMode: environment.DATABASE_SSL_MODE === "disable" ? "disable" : "require", databasePoolMax: boundedInteger(environment.DATABASE_POOL_MAX, 10, 1, 50),
    objectStorage: { provider: objectProvider, endpoint: environment.OBJECT_STORAGE_ENDPOINT?.trim(), region: environment.OBJECT_STORAGE_REGION?.trim(), publicBucket: environment.OBJECT_STORAGE_PUBLIC_BUCKET?.trim(), privateBucket: environment.OBJECT_STORAGE_PRIVATE_BUCKET?.trim(), publicAccessKey: environment.OBJECT_STORAGE_PUBLIC_ACCESS_KEY?.trim() || legacyAccessKey, publicSecretKey: environment.OBJECT_STORAGE_PUBLIC_SECRET_KEY?.trim() || legacySecretKey, privateAccessKey: environment.OBJECT_STORAGE_PRIVATE_ACCESS_KEY?.trim() || legacyAccessKey, privateSecretKey: environment.OBJECT_STORAGE_PRIVATE_SECRET_KEY?.trim() || legacySecretKey, publicBaseUrl: environment.OBJECT_STORAGE_PUBLIC_BASE_URL?.replace(/\/$/, ""), localRoot: environment.OBJECT_STORAGE_LOCAL_ROOT?.trim() || ".data/object-storage" },
  };
}

export function loadMigrationDatabaseConfig(environment: NodeJS.ProcessEnv = process.env) {
  const runtime = environment.NODE_ENV === "production" ? "production" : environment.APP_ENV === "staging" ? "staging" : environment.NODE_ENV === "test" ? "test" : "development";
  if (environment.PERSISTENCE_PROVIDER?.toUpperCase() !== "POSTGRES") throw new Error("PostgreSQL persistence is required for migrations.");
  const runtimeUrl = environment.DATABASE_URL?.trim();
  const runtimeRole = roleName(environment.DATABASE_RUNTIME_ROLE);
  const migrationRole = roleName(environment.DATABASE_MIGRATION_ROLE);
  const migrationUrl = environment.DATABASE_MIGRATION_URL?.trim() || (runtime === "development" || runtime === "test" ? runtimeUrl : undefined);
  if (!migrationUrl) throw new Error("DATABASE_MIGRATION_URL is required for staging/production migrations.");
  if (runtime === "production" || runtime === "staging") {
    if (!runtimeUrl || !runtimeRole || !migrationRole) throw new Error("DATABASE_URL, DATABASE_RUNTIME_ROLE and DATABASE_MIGRATION_ROLE are required for migration validation.");
    if (runtimeRole === migrationRole || databaseUsername(migrationUrl) === databaseUsername(runtimeUrl)) throw new Error("Database runtime and migration connection identities must be different.");
    if (databaseUsername(runtimeUrl) !== runtimeRole) throw new Error("DATABASE_URL must authenticate as DATABASE_RUNTIME_ROLE.");
    if (databaseUsername(migrationUrl) !== migrationRole) throw new Error("DATABASE_MIGRATION_URL must authenticate as DATABASE_MIGRATION_ROLE.");
  }
  return { databaseUrl: migrationUrl, databaseSslMode: environment.DATABASE_SSL_MODE === "disable" ? "disable" as const : "require" as const, databaseMigrationRole: migrationRole, databaseRuntimeRole: runtimeRole };
}

export function productionPersistenceBlockers(environment: NodeJS.ProcessEnv = process.env) { try { loadPersistenceConfig({ ...environment, NODE_ENV: "production" }); return [] as string[]; } catch (error) { return [error instanceof Error ? error.message : "Invalid production persistence configuration."]; } }

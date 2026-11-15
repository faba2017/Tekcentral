import { loadPersistenceConfig, productionPersistenceBlockers } from "./config.js";
import { postgresReady } from "./postgres.js";
import { objectStorage } from "../storage/objectStorage.js";

export async function persistenceReadiness() {
  const config = loadPersistenceConfig(); const checks: Record<string, { ready: boolean; detail?: string }> = {};
  if (config.provider === "POSTGRES") { const database = await postgresReady(); checks.database = { ready: database.ready, detail: `${database.latencyMs}ms` }; } else checks.database = { ready: config.environment !== "production", detail: "local development adapter" };
  checks.objectStorage = { ready: await objectStorage().ready(), detail: config.objectStorage.provider };
  const blockers = config.environment === "production" ? productionPersistenceBlockers() : [];
  return { ready: blockers.length === 0 && Object.values(checks).every((item) => item.ready), environment: config.environment, provider: config.provider, checks, blockers };
}

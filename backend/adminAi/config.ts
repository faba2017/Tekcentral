import { AdminAiError } from "./errors.js";
import type { AdminAiHealth, AdminAiModelRole, AdminAiProviderId } from "./types.js";

export interface AdminAiConfig {
  enabled: boolean;
  provider?: AdminAiProviderId;
  apiKey?: string;
  primaryModel?: string;
  routineModel?: string;
  fallbackModel?: string;
  baseUrl: string;
  timeoutMs: number;
  maxOutputTokens: number;
}

const DEFAULT_BASE_URL = "https://inference.do-ai.run";
const clean = (value: string | undefined) => value?.trim() || undefined;
export function loadAdminAiConfig(env: NodeJS.ProcessEnv = process.env): AdminAiConfig {
  const enabled = env.ADMIN_AI_ENABLED === "true";
  const provider = clean(env.ADMIN_AI_PROVIDER)?.toLowerCase();
  const config: AdminAiConfig = {
    enabled,
    provider: provider === "digitalocean" ? "digitalocean" : undefined,
    apiKey: clean(env.ADMIN_AI_DIGITALOCEAN_API_KEY),
    primaryModel: clean(env.ADMIN_AI_DIGITALOCEAN_PRIMARY_MODEL),
    routineModel: clean(env.ADMIN_AI_DIGITALOCEAN_ROUTINE_MODEL),
    fallbackModel: clean(env.ADMIN_AI_DIGITALOCEAN_FALLBACK_MODEL),
    baseUrl: DEFAULT_BASE_URL,
    timeoutMs: 20_000,
    maxOutputTokens: 1_200,
  };
  if (!enabled) return config;
  if (!provider || provider !== "digitalocean") throw new AdminAiError("CONFIGURATION_ERROR", "Admin AI provider is missing or unsupported.");
  if (!config.apiKey) throw new AdminAiError("CONFIGURATION_ERROR", "Admin AI DigitalOcean API key is not configured.");
  if (!config.primaryModel) throw new AdminAiError("CONFIGURATION_ERROR", "Admin AI primary model is not configured.");
  if (!config.routineModel) throw new AdminAiError("CONFIGURATION_ERROR", "Admin AI routine model is not configured.");
  return config;
}

export function adminAiModelForRole(config: AdminAiConfig, role: AdminAiModelRole) {
  const model = role === "PRIMARY" ? config.primaryModel : config.routineModel;
  if (!model) throw new AdminAiError("CONFIGURATION_ERROR", `Admin AI ${role.toLowerCase()} model is not configured.`, { modelRole: role });
  return model;
}

export function adminAiConfigurationHealth(env: NodeJS.ProcessEnv = process.env): AdminAiHealth {
  const checkedAt = new Date().toISOString();
  if (env.ADMIN_AI_ENABLED !== "true") return { status: "DISABLED", enabled: false, primaryConfigured: Boolean(clean(env.ADMIN_AI_DIGITALOCEAN_PRIMARY_MODEL)), routineConfigured: Boolean(clean(env.ADMIN_AI_DIGITALOCEAN_ROUTINE_MODEL)), fallbackConfigured: Boolean(clean(env.ADMIN_AI_DIGITALOCEAN_FALLBACK_MODEL)), checkedAt };
  try { const config = loadAdminAiConfig(env); return { status: "CONFIGURED", enabled: true, provider: config.provider, primaryConfigured: true, routineConfigured: true, fallbackConfigured: Boolean(config.fallbackModel), checkedAt }; }
  catch (error) { return { status: "CONFIG_ERROR", enabled: true, primaryConfigured: Boolean(clean(env.ADMIN_AI_DIGITALOCEAN_PRIMARY_MODEL)), routineConfigured: Boolean(clean(env.ADMIN_AI_DIGITALOCEAN_ROUTINE_MODEL)), fallbackConfigured: Boolean(clean(env.ADMIN_AI_DIGITALOCEAN_FALLBACK_MODEL)), checkedAt, detail: error instanceof AdminAiError ? error.message : "Admin AI configuration is invalid." }; }
}

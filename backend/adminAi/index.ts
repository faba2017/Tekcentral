import { adminAiConfigurationHealth, loadAdminAiConfig } from "./config.js";
import { DigitalOceanAdminAiProvider } from "./digitalOceanProvider.js";
import { AdminAiService, type AdminAiServiceOptions } from "./service.js";
import { adminAiProviderObserver } from "./providerOperations.js";

export { adminAiConfigurationHealth };
export * from "./types.js";
export { AdminAiError, adminAiSafeHttpError } from "./errors.js";

export function createAdminAiService(env: NodeJS.ProcessEnv = process.env, overrides: { fetch?: typeof fetch; logger?: AdminAiServiceOptions["logger"] } = {}) {
  const config = loadAdminAiConfig(env);
  const provider = new DigitalOceanAdminAiProvider({ apiKey: config.apiKey ?? "disabled-not-used", baseUrl: config.baseUrl, fetch: overrides.fetch });
  return new AdminAiService({ config, provider, logger: overrides.logger, observer: adminAiProviderObserver });
}

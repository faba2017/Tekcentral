import { DigitalOceanZeusProvider, ZeusProviderError } from "./digitalOceanProvider.js";
import { LocalZeusProvider } from "./localProvider.js";
import type { ZeusAIProvider } from "./types.js";

class UnavailableProvider implements ZeusAIProvider { constructor(private error: ZeusProviderError) {} async generate(): Promise<never> { throw this.error; } }
export function createZeusProvider(env: NodeJS.ProcessEnv = process.env): ZeusAIProvider {
  const provider = (env.ZEUS_PROVIDER?.trim().toLowerCase() || "local");
  if (provider === "local") return new LocalZeusProvider();
  if (provider === "digitalocean") {
    try { return new DigitalOceanZeusProvider({ apiKey: env.ZEUS_DIGITALOCEAN_API_KEY ?? "", model: env.ZEUS_DIGITALOCEAN_MODEL ?? "", baseUrl: env.ZEUS_DIGITALOCEAN_BASE_URL }); }
    catch (error) { return new UnavailableProvider(error instanceof ZeusProviderError ? error : new ZeusProviderError("CONFIGURATION_ERROR", "DigitalOcean provider configuration is invalid.")); }
  }
  return new UnavailableProvider(new ZeusProviderError("CONFIGURATION_ERROR", "Zeus provider setting is not supported."));
}

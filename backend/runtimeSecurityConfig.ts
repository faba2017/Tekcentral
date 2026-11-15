const localhostNames = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

function productionHttpsOrigin(name: string, value: string | undefined) {
  if (!value?.trim()) throw new Error(`${name} is required in production.`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTPS origin.`);
  }
  if (parsed.protocol !== "https:" || localhostNames.has(parsed.hostname) || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(`${name} must be a public HTTPS origin without credentials, path, query, or fragment.`);
  }
  return parsed.origin;
}

export function validateRuntimeSecurityConfig(environment: NodeJS.ProcessEnv = process.env) {
  if (environment.NODE_ENV !== "production") return;
  const storefront = productionHttpsOrigin("PUBLIC_STOREFRONT_ORIGIN", environment.PUBLIC_STOREFRONT_ORIGIN);
  const admin = productionHttpsOrigin("ADMIN_ORIGIN", environment.ADMIN_ORIGIN);
  if (storefront === admin) throw new Error("ADMIN_ORIGIN must be separate from PUBLIC_STOREFRONT_ORIGIN in production.");
  if (environment.PAYFAST_DEBUG_SIGNATURE === "true") throw new Error("PAYFAST_DEBUG_SIGNATURE must be disabled in production.");
  if (environment.RECAPTCHA_TEST_BYPASS === "true") throw new Error("RECAPTCHA_TEST_BYPASS must be disabled in production.");
}

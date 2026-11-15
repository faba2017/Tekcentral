export function isTrustedCustomerOrigin(
  origin: string | undefined,
  configuredOrigin = process.env.PUBLIC_STOREFRONT_ORIGIN,
  environment = process.env.NODE_ENV,
) {
  if (!origin) return false;
  const configured = configuredOrigin?.trim().replace(/\/$/, "");
  if (configured && origin === configured) return true;
  return environment !== "production" && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin);
}

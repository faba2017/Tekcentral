const normalized = (value?: string) => value?.trim().replace(/\/$/, "");

export function adminOrigin() { return normalized(process.env.ADMIN_ORIGIN); }

export function isTrustedAdminOrigin(origin?: string) {
  if (!origin) return false;
  const configured = adminOrigin();
  if (configured && origin === configured) return true;
  if (process.env.NODE_ENV !== "production") {
    try {
      const parsed = new URL(origin);
      return ["127.0.0.1", "localhost"].includes(parsed.hostname) && ["http:", "https:"].includes(parsed.protocol);
    } catch { return false; }
  }
  return false;
}

import type { IncomingMessage, ServerResponse } from "node:http";

export type SecurityEnvironment = "development" | "test" | "production" | string | undefined;

const payfastFormOrigins = ["https://sandbox.payfast.co.za", "https://www.payfast.co.za"];
const storefrontScripts = ["https://maps.googleapis.com", "https://maps.gstatic.com", "https://www.google.com/recaptcha/", "https://www.gstatic.com/recaptcha/"];
const storefrontFrames = ["https://www.google.com/recaptcha/", "https://recaptcha.google.com/recaptcha/"];

function externalPublicMediaOrigin(value = process.env.OBJECT_STORAGE_PUBLIC_BASE_URL) {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.origin : undefined;
  } catch {
    return undefined;
  }
}

function configuredApiOrigins(environment: SecurityEnvironment) {
  return [...new Set([process.env.PUBLIC_API_URL, process.env.VITE_API_BASE_URL].flatMap((value) => {
    if (!value) return [];
    try {
      const parsed = new URL(value);
      if (parsed.protocol === "https:" || (environment !== "production" && parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))) return [parsed.origin];
    } catch {
      // Invalid deployment values are excluded from browser policy; production origin validation remains fail closed.
    }
    return [];
  }))];
}

const developmentScriptSources = (environment: SecurityEnvironment) => environment === "development" ? " 'unsafe-inline'" : "";
const developmentConnectSources = (environment: SecurityEnvironment) => environment === "development"
  ? " ws://127.0.0.1:5173 ws://localhost:5173"
  : "";

export function contentSecurityPolicy(pathname: string, publicMediaBaseUrl = process.env.OBJECT_STORAGE_PUBLIC_BASE_URL, environment: SecurityEnvironment = process.env.NODE_ENV) {
  const admin = pathname === "/api/admin" || pathname.startsWith("/api/admin/") || pathname.startsWith("/admin");
  const mediaOrigin = externalPublicMediaOrigin(publicMediaBaseUrl);
  const apiOrigins = configuredApiOrigins(environment);
  const directives = admin
    ? [
        "default-src 'self'",
        `script-src 'self'${developmentScriptSources(environment)}`,
        "style-src 'self' 'unsafe-inline'",
        `img-src 'self' data: blob:${mediaOrigin ? ` ${mediaOrigin}` : ""}`,
        `connect-src 'self'${developmentConnectSources(environment)}${apiOrigins.length ? ` ${apiOrigins.join(" ")}` : ""}`,
        "font-src 'self' data:",
        "frame-src 'none'",
      ]
    : [
        "default-src 'self'",
        `script-src 'self'${developmentScriptSources(environment)} ${storefrontScripts.join(" ")}`,
        "style-src 'self' 'unsafe-inline'",
        `img-src 'self' data: blob: https://maps.gstatic.com https://maps.googleapis.com${mediaOrigin ? ` ${mediaOrigin}` : ""}`,
        `connect-src 'self'${developmentConnectSources(environment)}${apiOrigins.length ? ` ${apiOrigins.join(" ")}` : ""} https://maps.googleapis.com https://www.google.com https://www.gstatic.com`,
        "font-src 'self' data:",
        `frame-src ${storefrontFrames.join(" ")}`,
      ];
  directives.push(
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self' ${payfastFormOrigins.join(" ")}`,
    "frame-ancestors 'none'",
  );
  if (environment === "production") directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export function securityHeaders(pathname: string, environment: SecurityEnvironment = process.env.NODE_ENV) {
  return {
    "Content-Security-Policy": contentSecurityPolicy(pathname, process.env.OBJECT_STORAGE_PUBLIC_BASE_URL, environment),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
    ...(environment === "production" ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" } : {}),
  };
}

export function applySecurityHeaders(response: ServerResponse, pathname: string, environment: SecurityEnvironment = process.env.NODE_ENV) {
  for (const [name, value] of Object.entries(securityHeaders(pathname, environment))) response.setHeader(name, value);
}

export function isSensitiveApiPath(pathname: string) {
  return [
    "/api/admin",
    "/api/account",
    "/api/cart",
    "/api/orders",
    "/api/payments",
    "/api/checkout",
    "/api/zeus",
    "/api/contact",
  ].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function applySensitiveCachePolicy(response: ServerResponse, pathname: string) {
  if (!isSensitiveApiPath(pathname)) return;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Pragma", "no-cache");
}

const allowedCorsHeaders = new Set(["content-type", "x-guest-order-access"]);
const allowedCorsMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export function validateCorsPreflight(request: IncomingMessage, trustedOrigin: boolean) {
  const origin = request.headers.origin;
  if (!origin || !trustedOrigin) return { ok: false as const, status: 403, code: "UNTRUSTED_ORIGIN" };
  const method = String(request.headers["access-control-request-method"] ?? "").toUpperCase();
  if (!allowedCorsMethods.has(method)) return { ok: false as const, status: 405, code: "CORS_METHOD_NOT_ALLOWED" };
  const requestedHeaders = String(request.headers["access-control-request-headers"] ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (requestedHeaders.some((header) => !allowedCorsHeaders.has(header))) return { ok: false as const, status: 400, code: "CORS_HEADERS_NOT_ALLOWED" };
  return { ok: true as const, method, headers: requestedHeaders };
}

export function applyTrustedCors(response: ServerResponse, origin: string, requestedMethod?: string, requestedHeaders: string[] = []) {
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader("Vary", "Origin");
  if (requestedMethod) response.setHeader("Access-Control-Allow-Methods", requestedMethod);
  if (requestedHeaders.length > 0) response.setHeader("Access-Control-Allow-Headers", requestedHeaders.join(", "));
}

export function safeErrorEnvelope(error: unknown, knownError: boolean, requestId: string, code?: string) {
  return {
    error: knownError && error instanceof Error ? error.message : "An unexpected server error occurred.",
    code: knownError ? code : "INTERNAL_SERVER_ERROR",
    requestId,
  };
}

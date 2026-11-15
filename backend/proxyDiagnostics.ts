import type { IncomingMessage } from "node:http";

const safeHeader = (value: string | string[] | undefined, max = 256) => {
  const text = Array.isArray(value) ? value.join(",") : value;
  if (!text) return undefined;
  const sanitized = text.replace(/[^A-Za-z0-9.,:[\] _-]/g, "").slice(0, max);
  return sanitized || undefined;
};

export function proxyDiagnostic(request: IncomingMessage, environment: NodeJS.ProcessEnv = process.env) {
  if (environment.TRUSTED_PROXY_DIAGNOSTICS !== "true") return undefined;
  return {
    event: "TRUSTED_PROXY_DIAGNOSTIC",
    remoteAddress: safeHeader(request.socket.remoteAddress),
    forwardedFor: safeHeader(request.headers["x-forwarded-for"]),
    forwardedProto: safeHeader(request.headers["x-forwarded-proto"], 24),
    host: safeHeader(request.headers.host, 253),
  };
}

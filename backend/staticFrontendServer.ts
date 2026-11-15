import { createReadStream, statSync } from "node:fs";
import { createServer, type Server, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { applySecurityHeaders, type BrowserSecurityProfile } from "./httpSecurity.js";

const mimeTypes: Record<string, string> = {
  ".avif": "image/avif", ".css": "text/css; charset=utf-8", ".gif": "image/gif", ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon", ".jpeg": "image/jpeg", ".jpg": "image/jpeg", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".map": "application/json; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2",
};

export interface StaticFrontendOptions {
  root?: string;
  profile: BrowserSecurityProfile;
  environment?: "production" | "development";
}

function safePath(rawUrl: string) {
  const rawPath = rawUrl.split("?", 1)[0] || "/";
  let decoded: string;
  try { decoded = decodeURIComponent(rawPath); } catch { return undefined; }
  if (!decoded.startsWith("/") || decoded.includes("\0") || decoded.includes("\\")) return undefined;
  const segments = decoded.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === ".." || segment.startsWith("."))) return undefined;
  return decoded;
}

function sendText(response: ServerResponse, status: number, body: string, method: string) {
  const bytes = Buffer.from(body);
  response.statusCode = status;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.setHeader("Content-Length", String(bytes.length));
  response.setHeader("Cache-Control", "no-store");
  response.end(method === "HEAD" ? undefined : bytes);
}

function isHashedAsset(pathname: string) {
  return pathname.startsWith("/assets/") && /-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/.test(pathname);
}

export function createStaticFrontendServer(options: StaticFrontendOptions): Server {
  const root = resolve(options.root ?? "dist");
  if (options.environment !== "production") throw new Error("The production static server requires environment=production.");
  const indexPath = resolve(root, "index.html");
  if (!statSync(indexPath, { throwIfNoEntry: false })?.isFile()) throw new Error("Static frontend build is missing dist/index.html.");
  return createServer((request, response) => {
    const method = request.method ?? "GET";
    const pathname = safePath(request.url ?? "/");
    applySecurityHeaders(response, pathname ?? "/", "production", options.profile);
    if (method !== "GET" && method !== "HEAD") { response.setHeader("Allow", "GET, HEAD"); sendText(response, 405, "Method not allowed.", method); return; }
    if (!pathname) { sendText(response, 404, "Not found.", method); return; }
    if (pathname === "/live" || pathname === "/ready") { response.setHeader("Content-Type", "application/json; charset=utf-8"); response.setHeader("Cache-Control", "no-store"); response.end(method === "HEAD" ? undefined : JSON.stringify({ status: pathname === "/live" ? "alive" : "ready", profile: options.profile })); return; }
    if (pathname === "/api" || pathname.startsWith("/api/")) { sendText(response, 404, "Not found.", method); return; }

    const requested = pathname === "/" ? indexPath : resolve(root, `.${pathname}`);
    const withinRoot = requested === root || requested.startsWith(`${root}${sep}`);
    const file = withinRoot ? statSync(requested, { throwIfNoEntry: false }) : undefined;
    let target = file?.isFile() ? requested : undefined;
    let spaFallback = false;
    if (!target && !extname(pathname)) { target = indexPath; spaFallback = true; }
    if (!target) { sendText(response, 404, "Not found.", method); return; }

    const extension = extname(target).toLowerCase();
    const contentType = mimeTypes[extension];
    if (!contentType || extension === ".map") { sendText(response, 404, "Not found.", method); return; }
    const fileStat = statSync(target);
    response.statusCode = 200;
    response.setHeader("Content-Type", contentType);
    response.setHeader("Content-Length", String(fileStat.size));
    response.setHeader("Cache-Control", spaFallback || extension === ".html" ? "no-cache, no-store, must-revalidate" : isHashedAsset(pathname) ? "public, max-age=31536000, immutable" : "public, max-age=3600, must-revalidate");
    if (method === "HEAD") { response.end(); return; }
    createReadStream(target).on("error", () => { if (!response.headersSent) sendText(response, 500, "Unable to serve file.", method); else response.destroy(); }).pipe(response);
  });
}

function profileFromArguments() {
  const index = process.argv.indexOf("--profile");
  const value = index >= 0 ? process.argv[index + 1] : process.env.FRONTEND_SECURITY_PROFILE;
  if (value !== "storefront" && value !== "admin") throw new Error("Use --profile storefront or --profile admin.");
  return value;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  const profile = profileFromArguments();
  const environment = process.env.NODE_ENV;
  if (environment !== "production") throw new Error("NODE_ENV=production is required for the production static server.");
  const server = createStaticFrontendServer({ root: process.env.STATIC_ROOT || "dist", profile, environment });
  const port = Number(process.env.PORT || 8080);
  const host = process.env.HOST || "0.0.0.0";
  server.listen(port, host, () => console.log(`TekCentral ${profile} frontend listening on http://${host}:${port}`));
}

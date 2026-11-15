import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStaticFrontendServer } from "../staticFrontendServer.js";

const root = await mkdtemp(join(tmpdir(), "tekcentral-static-"));
await mkdir(join(root, "assets"));
await mkdir(join(root, "images"));
await writeFile(join(root, "index.html"), "<!doctype html><div id=\"root\">TekCentral</div><script type=\"module\" src=\"/assets/index-12345678.js\"></script>");
await writeFile(join(root, "assets", "index-12345678.js"), "console.log('production');");
await writeFile(join(root, "assets", "index-12345678.css"), "body{color:#000}");
await writeFile(join(root, "images", "product.webp"), Buffer.from([0x52, 0x49, 0x46, 0x46]));
await writeFile(join(root, ".env"), "SECRET=must-not-serve");

async function start(profile: "storefront" | "admin") {
  const server = createStaticFrontendServer({ root, profile, environment: "production" });
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  return { server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}
const request = (origin: string, path: string, init?: RequestInit) => fetch(`${origin}${path}`, init);

const storefront = await start("storefront");
try {
  const home = await request(storefront.origin, "/");
  assert.equal(home.status, 200); assert.match(await home.text(), /TekCentral/);
  assert.match(home.headers.get("content-security-policy") ?? "", /maps\.googleapis\.com/);
  assert.match(home.headers.get("content-security-policy") ?? "", /sandbox\.payfast\.co\.za/);
  assert.equal(home.headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains");
  assert.equal(home.headers.get("x-content-type-options"), "nosniff"); assert.equal(home.headers.get("x-frame-options"), "DENY");
  assert.equal(home.headers.get("referrer-policy"), "strict-origin-when-cross-origin"); assert.match(home.headers.get("permissions-policy") ?? "", /camera=\(\)/);
  assert.equal(home.headers.get("cache-control"), "no-cache, no-store, must-revalidate");
  for (const path of ["/products/example", "/admin/orders/example"]) { const response = await request(storefront.origin, path); assert.equal(response.status, 200); assert.match(await response.text(), /TekCentral/); }
  const js = await request(storefront.origin, "/assets/index-12345678.js"); assert.equal(js.headers.get("content-type"), "text/javascript; charset=utf-8"); assert.equal(js.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal((await request(storefront.origin, "/assets/index-12345678.css")).headers.get("content-type"), "text/css; charset=utf-8");
  assert.equal((await request(storefront.origin, "/images/product.webp")).headers.get("content-type"), "image/webp");
  for (const path of ["/assets/missing.js", "/api/orders", "/.env", "/.git/config", "/%2e%2e/package.json", "/%2e%2e%2fpackage.json", "/%E0%A4%A"]) assert.equal((await request(storefront.origin, path)).status, 404, path);
  assert.equal((await request(storefront.origin, "/live")).status, 200); assert.equal((await request(storefront.origin, "/ready")).status, 200);
  assert.equal((await request(storefront.origin, "/", { method: "POST" })).status, 405);
} finally { await new Promise<void>((resolvePromise) => storefront.server.close(() => resolvePromise())); }

const admin = await start("admin");
try {
  const response = await request(admin.origin, "/admin/orders/example"); const csp = response.headers.get("content-security-policy") ?? "";
  assert.equal(response.status, 200); assert.match(csp, /frame-src 'none'/); assert.match(csp, /form-action 'self'/);
  assert.doesNotMatch(csp, /maps\.googleapis\.com|recaptcha|payfast\.co\.za/);
} finally { await new Promise<void>((resolvePromise) => admin.server.close(() => resolvePromise())); }

await rm(root, { recursive: true, force: true });
console.log("Production static Storefront/Admin server tests passed.");

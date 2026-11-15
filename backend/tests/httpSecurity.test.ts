import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { contentSecurityPolicy, isSensitiveApiPath, safeErrorEnvelope, securityHeaders, validateCorsPreflight } from "../httpSecurity.js";
import { validateRuntimeSecurityConfig } from "../runtimeSecurityConfig.js";

const storefront = contentSecurityPolicy("/api/products", undefined, "production");
assert.match(storefront, /default-src 'self'/);
assert.match(storefront, /maps\.googleapis\.com/);
assert.match(storefront, /maps\.gstatic\.com/);
assert.match(storefront, /www\.google\.com\/recaptcha/);
assert.match(storefront, /form-action 'self' https:\/\/sandbox\.payfast\.co\.za https:\/\/www\.payfast\.co\.za/);
assert.match(storefront, /frame-ancestors 'none'/);
assert.doesNotMatch(storefront, /unsafe-eval/);
assert.doesNotMatch(storefront.match(/script-src[^;]*/)?.[0] ?? "", /unsafe-inline/);
assert.doesNotMatch(storefront.match(/connect-src[^;]*/)?.[0] ?? "", /ws:/);
assert.match(storefront, /upgrade-insecure-requests/);
const developmentStorefront = contentSecurityPolicy("/api/products", undefined, "development");
assert.doesNotMatch(developmentStorefront, /upgrade-insecure-requests/);
assert.match(developmentStorefront.match(/script-src[^;]*/)?.[0] ?? "", /'unsafe-inline'/);
assert.match(developmentStorefront, /ws:\/\/127\.0\.0\.1:5173/);
assert.match(developmentStorefront, /ws:\/\/localhost:5173/);
assert.doesNotMatch(developmentStorefront, /unsafe-eval/);

const admin = contentSecurityPolicy("/api/admin/products");
assert.match(admin, /script-src 'self'/);
assert.doesNotMatch(admin, /maps\.googleapis\.com/);
assert.match(admin, /frame-src 'none'/);
const developmentAdmin = contentSecurityPolicy("/admin", undefined, "development");
assert.match(developmentAdmin.match(/script-src[^;]*/)?.[0] ?? "", /'unsafe-inline'/);
assert.match(developmentAdmin, /ws:\/\/127\.0\.0\.1:5173/);

const previewStorefront = contentSecurityPolicy("/", undefined, "production");
assert.doesNotMatch(previewStorefront.match(/script-src[^;]*/)?.[0] ?? "", /unsafe-inline|unsafe-eval/);
assert.doesNotMatch(previewStorefront.match(/connect-src[^;]*/)?.[0] ?? "", /ws:/);

const production = securityHeaders("/api/products", "production");
assert.equal(production["X-Content-Type-Options"], "nosniff");
assert.equal(production["X-Frame-Options"], "DENY");
assert.equal(production["Strict-Transport-Security"], "max-age=31536000; includeSubDomains");
assert.equal("Strict-Transport-Security" in securityHeaders("/api/products", "development"), false);

assert.equal(isSensitiveApiPath("/api/admin/orders"), true);
assert.equal(isSensitiveApiPath("/api/account/session"), true);
assert.equal(isSensitiveApiPath("/api/products"), false);

const preflightRequest = (headers: Record<string, string>) => ({ headers } as unknown as IncomingMessage);
assert.deepEqual(validateCorsPreflight(preflightRequest({ origin: "https://admin.tekcentral.co.za", "access-control-request-method": "PATCH", "access-control-request-headers": "content-type" }), true), { ok: true, method: "PATCH", headers: ["content-type"] });
assert.equal(validateCorsPreflight(preflightRequest({ origin: "https://evil.example", "access-control-request-method": "POST" }), false).code, "UNTRUSTED_ORIGIN");
assert.equal(validateCorsPreflight(preflightRequest({ origin: "https://tekcentral.co.za", "access-control-request-method": "TRACE" }), true).code, "CORS_METHOD_NOT_ALLOWED");
assert.equal(validateCorsPreflight(preflightRequest({ origin: "https://tekcentral.co.za", "access-control-request-method": "POST", "access-control-request-headers": "authorization" }), true).code, "CORS_HEADERS_NOT_ALLOWED");

assert.doesNotThrow(() => validateRuntimeSecurityConfig({ NODE_ENV: "development" }));
assert.doesNotThrow(() => validateRuntimeSecurityConfig({ NODE_ENV: "production", PUBLIC_STOREFRONT_ORIGIN: "https://tekcentral.co.za", ADMIN_ORIGIN: "https://admin.tekcentral.co.za" }));
assert.throws(() => validateRuntimeSecurityConfig({ NODE_ENV: "production", PUBLIC_STOREFRONT_ORIGIN: "http://127.0.0.1:5173", ADMIN_ORIGIN: "https://admin.tekcentral.co.za" }), /PUBLIC_STOREFRONT_ORIGIN/);
assert.throws(() => validateRuntimeSecurityConfig({ NODE_ENV: "production", PUBLIC_STOREFRONT_ORIGIN: "https://tekcentral.co.za", ADMIN_ORIGIN: "https://admin.tekcentral.co.za", RECAPTCHA_TEST_BYPASS: "true" }), /RECAPTCHA_TEST_BYPASS/);
assert.throws(() => validateRuntimeSecurityConfig({ NODE_ENV: "production", PUBLIC_STOREFRONT_ORIGIN: "https://tekcentral.co.za", ADMIN_ORIGIN: "https://admin.tekcentral.co.za", PAYFAST_DEBUG_SIGNATURE: "true" }), /PAYFAST_DEBUG_SIGNATURE/);

const unknownError = safeErrorEnvelope(new Error("database password leaked here"), false, "request-123");
assert.deepEqual(unknownError, { error: "An unexpected server error occurred.", code: "INTERNAL_SERVER_ERROR", requestId: "request-123" });
const knownError = safeErrorEnvelope(new Error("Invalid postal code."), true, "request-456", "INVALID_DESTINATION");
assert.deepEqual(knownError, { error: "Invalid postal code.", code: "INVALID_DESTINATION", requestId: "request-456" });

console.log("HTTP security tests passed.");

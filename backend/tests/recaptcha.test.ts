import assert from "node:assert/strict";
import { RecaptchaError, verifyRecaptcha } from "../recaptchaService.js";

process.env.RECAPTCHA_SECRET_KEY = "test-secret";
process.env.RECAPTCHA_MIN_SCORE = "0.5";
delete process.env.RECAPTCHA_TEST_BYPASS;
const now = new Date("2026-10-28T10:00:00.000Z");
const response = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const fetchResult = (body: object) => async () => response(body);

await verifyRecaptcha({ token: "opaque", action: "contact_submit" }, { now, fetchImpl: fetchResult({ success: true, action: "contact_submit", score: 0.9, challenge_ts: "2026-10-28T09:59:30.000Z", hostname: "localhost" }) as typeof fetch });
await assert.rejects(() => verifyRecaptcha({ token: "opaque", action: "account_register" }, { now, fetchImpl: fetchResult({ success: true, action: "contact_submit", score: 0.9, challenge_ts: "2026-10-28T09:59:30.000Z" }) as typeof fetch }), (error: unknown) => error instanceof RecaptchaError && error.reason === "ACTION_MISMATCH");
await assert.rejects(() => verifyRecaptcha({ token: "opaque", action: "contact_submit" }, { now, fetchImpl: fetchResult({ success: true, action: "contact_submit", score: 0.2, challenge_ts: "2026-10-28T09:59:30.000Z" }) as typeof fetch }), (error: unknown) => error instanceof RecaptchaError && error.reason === "LOW_SCORE");
await assert.rejects(() => verifyRecaptcha({ token: "invalid", action: "contact_submit" }, { now, fetchImpl: fetchResult({ success: false }) as typeof fetch }), (error: unknown) => error instanceof RecaptchaError && error.reason === "INVALID_TOKEN");
await assert.rejects(() => verifyRecaptcha({ token: "opaque", action: "contact_submit" }, { now, fetchImpl: (async () => { throw new Error("network"); }) as typeof fetch }), (error: unknown) => error instanceof RecaptchaError && error.reason === "VERIFICATION_UNAVAILABLE");
await assert.rejects(() => verifyRecaptcha({ action: "contact_submit" }), (error: unknown) => error instanceof RecaptchaError && error.reason === "MISSING_TOKEN");
process.env.RECAPTCHA_TEST_BYPASS = "true"; process.env.NODE_ENV = "test";
await verifyRecaptcha({ action: "account_register" });
process.env.NODE_ENV = "production";
await assert.rejects(() => verifyRecaptcha({ action: "account_register" }), (error: unknown) => error instanceof RecaptchaError && error.reason === "MISSING_TOKEN");
delete process.env.RECAPTCHA_MIN_SCORE;
await assert.rejects(() => verifyRecaptcha({ token: "opaque", action: "account_register" }), (error: unknown) => error instanceof RecaptchaError && error.reason === "NOT_CONFIGURED");
delete process.env.RECAPTCHA_TEST_BYPASS; delete process.env.NODE_ENV;
console.log("reCAPTCHA tests passed");

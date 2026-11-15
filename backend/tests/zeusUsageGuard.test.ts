import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ZeusGuardError, ZeusUsageGuard } from "../zeus/usageGuard.js";
import type { ZeusChatResponse } from "../zeus/types.js";

const baseTime = Date.parse("2026-10-24T10:00:00.000Z");
let sequence = 0;
const pathFor = (name: string) => resolve("/tmp", `tekcentral-zeus-guard-${process.pid}-${sequence += 1}-${name}.json`);
const messages = (content = "Find me a router under R1500") => [{ role: "user", content }];
const env = (values: Record<string, string> = {}) => ({ ZEUS_GUEST_ENABLED: "true", ZEUS_GUEST_MINUTE_LIMIT: "5", ZEUS_GUEST_HOURLY_LIMIT: "10", ZEUS_GUEST_DAILY_LIMIT: "30", ZEUS_AUTH_MINUTE_LIMIT: "10", ZEUS_AUTH_HOURLY_LIMIT: "40", ZEUS_AUTH_DAILY_LIMIT: "150", ZEUS_GLOBAL_MINUTE_LIMIT: "120", ZEUS_COOLDOWN_SECONDS: "30", ZEUS_DUPLICATE_WINDOW_SECONDS: "8", ZEUS_QUOTA_HASH_KEY: "test-only-hash-key", ...values } as NodeJS.ProcessEnv);
const expectGuard = async (run: () => Promise<unknown>, code: ZeusGuardError["code"]) => assert.rejects(run, (error: unknown) => error instanceof ZeusGuardError && error.code === code);

async function successful(guard: ZeusUsageGuard, input: { customerId?: string; ip: string; content?: string }, tokens = 30) {
  const reservation = await guard.reserve({ customerId: input.customerId, ip: input.ip, messages: messages(input.content) });
  await guard.complete(reservation, "SUCCESS", { provider: "test", model: "test-model", inputTokens: tokens - 10, outputTokens: 10, totalTokens: tokens, toolCount: 1 });
  return reservation;
}

// A normal five-request guest shopping sequence remains within the launch burst limit.
{
  const guard = new ZeusUsageGuard({ env: env(), path: pathFor("normal"), now: () => baseTime });
  for (const prompt of ["I need a router under R1500", "Which is better for an office?", "Does the second have Wi-Fi?", "Show something cheaper", "Compare the first and third"]) await successful(guard, { ip: "198.51.100.10", content: prompt });
  await expectGuard(() => guard.reserve({ ip: "198.51.100.10", messages: messages("one too many") }), "QUOTA_EXCEEDED");
  const summary = await guard.summary(); assert.equal(summary.requestsToday, 5); assert.equal(summary.quotaRejectsToday, 1); assert.equal(summary.totalTokensToday, 150);
}

// Hourly and daily customer quotas count only useful/tool-loop results, not validation or provider failures.
{
  let now = baseTime;
  const guard = new ZeusUsageGuard({ env: env({ ZEUS_GUEST_MINUTE_LIMIT: "20", ZEUS_GUEST_HOURLY_LIMIT: "2", ZEUS_GUEST_DAILY_LIMIT: "3" }), path: pathFor("hour-day"), now: () => now });
  await successful(guard, { ip: "198.51.100.11" }); now += 61_000;
  const failed = await guard.reserve({ ip: "198.51.100.11", messages: messages("provider failure") }); await guard.complete(failed, "PROVIDER_FAILURE", {}, "NETWORK_ERROR"); now += 61_000;
  await successful(guard, { ip: "198.51.100.11", content: "compare products" }); now += 61_000;
  await expectGuard(() => guard.reserve({ ip: "198.51.100.11", messages: messages("hour blocked") }), "QUOTA_EXCEEDED");
  now += 3_600_001; await successful(guard, { ip: "198.51.100.11", content: "third success" }); now += 61_000;
  await expectGuard(() => guard.reserve({ ip: "198.51.100.11", messages: messages("day blocked") }), "QUOTA_EXCEEDED");
}

// Guest switch, authenticated account isolation, and secondary IP protection remain server-owned.
{
  const disabled = new ZeusUsageGuard({ env: env({ ZEUS_GUEST_ENABLED: "false" }), path: pathFor("disabled"), now: () => baseTime });
  await expectGuard(() => disabled.reserve({ ip: "198.51.100.12", messages: messages() }), "GUEST_DISABLED");
  await successful(disabled, { customerId: "account-a", ip: "198.51.100.12" });
  const guard = new ZeusUsageGuard({ env: env({ ZEUS_AUTH_MINUTE_LIMIT: "2" }), path: pathFor("accounts"), now: () => baseTime });
  await successful(guard, { customerId: "account-a", ip: "198.51.100.13" }); await successful(guard, { customerId: "account-a", ip: "198.51.100.13", content: "second" });
  await expectGuard(() => guard.reserve({ customerId: "account-a", ip: "198.51.100.13", messages: messages("third") }), "QUOTA_EXCEEDED");
  await successful(guard, { customerId: "account-b", ip: "198.51.100.13" });
}

// Global cap and provider-instability circuit stop paid inference without touching storefront services.
{
  const capped = new ZeusUsageGuard({ env: env({ ZEUS_GLOBAL_DAILY_LIMIT: "2", ZEUS_GUEST_MINUTE_LIMIT: "20" }), path: pathFor("global"), now: () => baseTime });
  await successful(capped, { ip: "198.51.100.20" }); await successful(capped, { ip: "198.51.100.21" });
  await expectGuard(() => capped.reserve({ ip: "198.51.100.22", messages: messages() }), "TEMPORARILY_UNAVAILABLE");
  const circuit = new ZeusUsageGuard({ env: env({ ZEUS_GUEST_MINUTE_LIMIT: "20" }), path: pathFor("circuit"), now: () => baseTime });
  for (const code of ["RATE_LIMITED", "PROVIDER_5XX", "TIMEOUT"]) { const reservation = await circuit.reserve({ ip: `198.51.100.${30 + Math.random()}`, messages: messages(code) }); await circuit.complete(reservation, "PROVIDER_FAILURE", {}, code); }
  await expectGuard(() => circuit.reserve({ ip: "198.51.100.40", messages: messages() }), "TEMPORARILY_UNAVAILABLE");
}

// Duplicate responses are identity-scoped and persistence survives a guard recreation.
{
  const path = pathFor("persistence"); const guard = new ZeusUsageGuard({ env: env(), path, now: () => baseTime }); const reservation = await successful(guard, { customerId: "account-private", ip: "203.0.113.1" });
  const key = guard.duplicateKey(reservation); const response: ZeusChatResponse = { requestId: "safe-request", message: "Safe answer", products: [], orders: [], addresses: [] };
  guard.cache(key, response); assert.equal(guard.recent(key)?.requestId, "safe-request");
  let providerExecutions = 0; const inFlight = guard.track(key, Promise.resolve().then(() => { providerExecutions += 1; return response; })); assert.equal(guard.running(key), inFlight); assert.equal((await guard.running(key))?.requestId, "safe-request"); assert.equal(providerExecutions, 1);
  const other = await guard.reserve({ customerId: "account-other", ip: "203.0.113.1", messages: messages() }); assert.notEqual(guard.duplicateKey(other), key); await guard.complete(other, "CONSENT_REQUIRED");
  const restarted = new ZeusUsageGuard({ env: env({ ZEUS_AUTH_MINUTE_LIMIT: "1" }), path, now: () => baseTime });
  await expectGuard(() => restarted.reserve({ customerId: "account-private", ip: "203.0.113.1", messages: messages("new prompt") }), "QUOTA_EXCEEDED");
  const stored = await readFile(path, "utf8");
  for (const secret of ["account-private", "203.0.113.1", "Find me a router", "supplierCost", "sessionToken", "password"]) assert.equal(stored.includes(secret), false);
}

// Tool-loop retries cool down and do not immediately buy another provider run.
{
  const guard = new ZeusUsageGuard({ env: env(), path: pathFor("cooldown"), now: () => baseTime });
  const reservation = await guard.reserve({ ip: "203.0.113.2", messages: messages("looping request") }); await guard.complete(reservation, "TOOL_LOOP_FAILURE", {}, "TOOL_LOOP_EXCEEDED");
  await expectGuard(() => guard.reserve({ ip: "203.0.113.2", messages: messages("looping request") }), "COOLDOWN");
}

// Versioned deterministic knowledge events stay aggregate and contain no raw prompt.
{
  const path = pathFor("knowledge-telemetry"); const guard = new ZeusUsageGuard({ env: env(), path, now: () => baseTime });
  const reservation = await guard.reserve({ ip: "203.0.113.3", messages: messages("Who are you?") });
  await guard.complete(reservation, "SUCCESS", { inputTokens: 0, outputTokens: 0, totalTokens: 0, toolCount: 0, instructionVersion: "G4.1", knowledgeModules: ["ABOUT_TEKCENTRAL"], answerType: "identity_answer" });
  const analytics = await guard.analytics(1); assert.equal(analytics.knowledgeAnswers.identity_answer, 1);
  const stored = await readFile(path, "utf8"); assert.match(stored, /"instructionVersion": "G4\.1"/); assert.doesNotMatch(stored, /Who are you/);
}

console.log("Zeus usage guard tests passed.");

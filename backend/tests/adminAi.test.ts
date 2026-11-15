import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { AdminAiError, adminAiSafeHttpError } from "../adminAi/errors.js";
import { adminAiConfigurationHealth, loadAdminAiConfig } from "../adminAi/config.js";
import { DigitalOceanAdminAiProvider } from "../adminAi/digitalOceanProvider.js";
import { modelRoleForChat, PRICING_REVIEW_RESPONSE_CONTRACT, reasoningEffortForChat } from "../adminAi/chatService.js";
import { AdminAiService, type AdminAiLogEvent } from "../adminAi/service.js";
import type { AdminAiProvider, AdminAiProviderRequest, AdminAiProviderResponse } from "../adminAi/types.js";

const env = {
  ADMIN_AI_ENABLED: "true",
  ADMIN_AI_PROVIDER: "digitalocean",
  ADMIN_AI_DIGITALOCEAN_API_KEY: "admin-secret",
  ADMIN_AI_DIGITALOCEAN_PRIMARY_MODEL: "primary-model",
  ADMIN_AI_DIGITALOCEAN_ROUTINE_MODEL: "routine-model",
  ADMIN_AI_DIGITALOCEAN_FALLBACK_MODEL: "fallback-model",
  ZEUS_DIGITALOCEAN_API_KEY: "zeus-secret",
} as NodeJS.ProcessEnv;
const response = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const request = { callerFeature: "catalogue-review", modelRole: "PRIMARY" as const, messages: [{ role: "user" as const, content: "Summarise this safe record." }] };
const expectCode = async (run: () => Promise<unknown>, code: string) => assert.rejects(run, (error: unknown) => error instanceof AdminAiError && error.code === code);

assert.equal(modelRoleForChat([], "Explain current operations"), "ROUTINE");
assert.equal(modelRoleForChat([{ contextType: "PRODUCT" }], "Explain this Product"), "ROUTINE");
assert.equal(modelRoleForChat([{ contextType: "PRODUCT" }], "Please add supported use cases to the Product overview"), "PRIMARY");
assert.equal(modelRoleForChat([{ contextType: "PRICING_PROPOSAL" }], "What should I review before deciding on this proposal?"), "PRIMARY");
assert.equal(modelRoleForChat([{ contextType: "PRICING_PROPOSAL" }], "What does pending approval mean?"), "ROUTINE");
assert.equal(modelRoleForChat([{ contextType: "PRODUCT" }, { contextType: "SUPPLIER" }], "Summarize these records"), "PRIMARY");
assert.equal(reasoningEffortForChat([{ contextType: "PRICING_PROPOSAL" }], "PRIMARY"), "LOW");
assert.equal(reasoningEffortForChat([{ contextType: "PRODUCT" }], "PRIMARY"), "LOW");
assert.equal(reasoningEffortForChat([{ contextType: "PRODUCT" }, { contextType: "SUPPLIER" }], "PRIMARY"), undefined);
assert.equal(reasoningEffortForChat([{ contextType: "PRICING_PROPOSAL" }], "ROUTINE"), undefined);
for (const required of ["supplier cost", "proposed selling price", "gross profit", "gross margin", "markup", "pricing band", "target margin", "minimum profit", "proposal status", "warning code", "Do not recalculate"]) assert.match(PRICING_REVIEW_RESPONSE_CONTRACT, new RegExp(required, "i"));

assert.equal(loadAdminAiConfig(env).apiKey, "admin-secret");
for (const combination of [
  { ZEUS_ENABLED: "true", ADMIN_AI_ENABLED: "true", expected: true },
  { ZEUS_ENABLED: "true", ADMIN_AI_ENABLED: "false", expected: false },
  { ZEUS_ENABLED: "false", ADMIN_AI_ENABLED: "true", expected: true },
  { ZEUS_ENABLED: "false", ADMIN_AI_ENABLED: "false", expected: false },
]) {
  const { expected, ...environmentFlags } = combination;
  assert.equal(loadAdminAiConfig({ ...env, ...environmentFlags }).enabled, expected);
}
assert.equal(loadAdminAiConfig({ ADMIN_AI_ENABLED: "false" }).enabled, false);
assert.equal(adminAiConfigurationHealth(env).status, "CONFIGURED");
assert.equal(adminAiConfigurationHealth({ ADMIN_AI_ENABLED: "false" }).status, "DISABLED");
assert.equal(adminAiConfigurationHealth({ ADMIN_AI_ENABLED: "true" }).status, "CONFIG_ERROR");
assert.throws(() => loadAdminAiConfig({ ADMIN_AI_ENABLED: "true", ADMIN_AI_PROVIDER: "other" }), (error: unknown) => error instanceof AdminAiError && error.code === "CONFIGURATION_ERROR");
assert.throws(() => loadAdminAiConfig({ ADMIN_AI_ENABLED: "true", ADMIN_AI_PROVIDER: "digitalocean", ADMIN_AI_DIGITALOCEAN_PRIMARY_MODEL: "primary", ADMIN_AI_DIGITALOCEAN_ROUTINE_MODEL: "routine" }), (error: unknown) => error instanceof AdminAiError && error.code === "CONFIGURATION_ERROR");
assert.throws(() => new DigitalOceanAdminAiProvider({ apiKey: "key", baseUrl: "https://unsafe.example" }), (error: unknown) => error instanceof AdminAiError && error.code === "CONFIGURATION_ERROR");

let authorization = ""; let sentBody = "";
const digitalOcean = new DigitalOceanAdminAiProvider({ apiKey: "admin-secret", fetch: async (_url, init) => {
  authorization = String((init?.headers as Record<string, string>).Authorization); sentBody = String(init?.body);
  return response({ id: "completion-1", model: "primary-model", choices: [{ finish_reason: "stop", message: { content: "Safe summary" } }], usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 } }, 200, { "x-request-id": "provider-1" });
} });
const providerResult = await digitalOcean.generate({ requestId: "request-123", modelRole: "PRIMARY", model: "primary-model", systemInstruction: "Internal only", messages: request.messages, contextBlocks: [], temperature: 0, maxOutputTokens: 20, outputFormat: "TEXT", timeoutMs: 1_000 });
assert.equal(authorization, "Bearer admin-secret"); assert.equal(authorization.includes("zeus-secret"), false); assert.equal(sentBody.includes("admin-secret"), false);
assert.equal(providerResult.text, "Safe summary"); assert.deepEqual(providerResult.usage, { inputTokens: 12, outputTokens: 3, totalTokens: 15 }); assert.equal(providerResult.providerRequestId, "provider-1");

let lowEffortBody = "";
const lowEffortProvider = new DigitalOceanAdminAiProvider({ apiKey: "key", fetch: async (_url, init) => {
  lowEffortBody = String(init?.body);
  return response({ choices: [{ finish_reason: "stop", message: { content: "Complete pricing review" } }] });
} });
await lowEffortProvider.generate({ requestId: "request-low-effort", modelRole: "PRIMARY", model: "glm-5.3", systemInstruction: "safe", messages: request.messages, contextBlocks: [], temperature: 0, maxOutputTokens: 1_200, outputFormat: "TEXT", timeoutMs: 1_000, reasoningEffort: "LOW" });
assert.equal(JSON.parse(lowEffortBody).reasoning_effort, "low");
let unsupportedEffortBody = "";
const unsupportedEffortProvider = new DigitalOceanAdminAiProvider({ apiKey: "key", fetch: async (_url, init) => {
  unsupportedEffortBody = String(init?.body);
  return response({ choices: [{ finish_reason: "stop", message: { content: "Unchanged" } }] });
} });
await unsupportedEffortProvider.generate({ requestId: "request-unsupported-effort", modelRole: "PRIMARY", model: "other-primary", systemInstruction: "safe", messages: request.messages, contextBlocks: [], temperature: 0, maxOutputTokens: 1_200, outputFormat: "TEXT", timeoutMs: 1_000, reasoningEffort: "LOW" });
assert.equal("reasoning_effort" in JSON.parse(unsupportedEffortBody), false);

const reasoningWithFinal = new DigitalOceanAdminAiProvider({ apiKey: "key", fetch: async () => response({ choices: [{ finish_reason: "stop", message: { reasoning_content: "private reasoning must never escape", content: "Final only" } }], usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12, completion_tokens_details: { reasoning_tokens: 4 } } }) });
const reasoningResult = await reasoningWithFinal.generate({ requestId: "request-reasoning-final", modelRole: "ROUTINE", model: "reasoning-model", systemInstruction: "safe", messages: request.messages, contextBlocks: [], temperature: 0, maxOutputTokens: 100, outputFormat: "TEXT", timeoutMs: 1_000 });
assert.equal(reasoningResult.text, "Final only"); assert.equal(reasoningResult.text.includes("private reasoning"), false); assert.equal(reasoningResult.usage?.reasoningTokens, 4);

const reasoningExhausted = new DigitalOceanAdminAiProvider({ apiKey: "key", fetch: async () => response({ choices: [{ finish_reason: "length", message: { reasoning_content: "private exhausted reasoning", content: null } }], usage: { completion_tokens: 24, completion_tokens_details: { reasoning_tokens: 24 } } }) });
await assert.rejects(() => reasoningExhausted.generate({ requestId: "request-reasoning-length", modelRole: "ROUTINE", model: "reasoning-model", systemInstruction: "safe", messages: request.messages, contextBlocks: [], temperature: 0, maxOutputTokens: 24, outputFormat: "TEXT", timeoutMs: 1_000 }), (error: unknown) => error instanceof AdminAiError && error.code === "INVALID_RESPONSE" && error.diagnostics.httpStatus === 200 && error.diagnostics.outputLimitReached === true && error.diagnostics.reasoningPresent === true && error.diagnostics.reasoningLength === 27 && error.diagnostics.contentLength === 0 && error.diagnostics.outputTokens === 24 && !error.message.includes("private exhausted reasoning"));

let toolRequestBody = "";
const toolOnly = new DigitalOceanAdminAiProvider({ apiKey: "key", fetch: async (_url, init) => { toolRequestBody = String(init?.body); return response({ choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "product_draft_update", arguments: JSON.stringify({ changes: { shortDescription: "A grounded Product description." } }) } }] } }] }); } });
const toolDefinition = { name: "product_draft_update", description: "Prepare a Product draft update.", inputSchema: { type: "object" } };
const toolResult = await toolOnly.generate({ requestId: "request-tool-only", modelRole: "PRIMARY", model: "model", systemInstruction: "safe", messages: request.messages, contextBlocks: [], temperature: 0, maxOutputTokens: 100, outputFormat: "TEXT", timeoutMs: 1_000, tools: [toolDefinition] });
assert.equal(toolResult.text, "");
assert.deepEqual(toolResult.toolCalls, [{ id: "call-1", name: "product_draft_update", input: { changes: { shortDescription: "A grounded Product description." } } }]);
assert.equal(JSON.parse(toolRequestBody).tool_choice, "auto");
assert.equal(JSON.parse(toolRequestBody).tools[0].function.name, "product_draft_update");
const multipleTools = new DigitalOceanAdminAiProvider({ apiKey: "key", fetch: async () => response({ choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "product_draft_update", arguments: "{}" } }, { id: "call-2", type: "function", function: { name: "product_draft_update", arguments: "{}" } }] } }] }) });
await expectCode(() => multipleTools.generate({ requestId: "request-multiple-tools", modelRole: "PRIMARY", model: "model", systemInstruction: "safe", messages: request.messages, contextBlocks: [], temperature: 0, maxOutputTokens: 100, outputFormat: "TEXT", timeoutMs: 1_000, tools: [toolDefinition] }), "INVALID_RESPONSE");
const unknownTool = new DigitalOceanAdminAiProvider({ apiKey: "key", fetch: async () => response({ choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "dangerous_tool", arguments: "{}" } }] } }] }) });
await expectCode(() => unknownTool.generate({ requestId: "request-unknown-tool", modelRole: "PRIMARY", model: "model", systemInstruction: "safe", messages: request.messages, contextBlocks: [], temperature: 0, maxOutputTokens: 100, outputFormat: "TEXT", timeoutMs: 1_000, tools: [toolDefinition] }), "INVALID_RESPONSE");

const providerRequest = { requestId: "request-provider-error", modelRole: "ROUTINE" as const, model: "routine-model", systemInstruction: "safe", messages: request.messages, contextBlocks: [], temperature: 0, maxOutputTokens: 100, outputFormat: "TEXT" as const, timeoutMs: 1_000 };
const unavailableJson = new DigitalOceanAdminAiProvider({ apiKey: "key", fetch: async () => response({ error: { type: "server_error", code: "overloaded", message: "Model capacity is temporarily unavailable." } }, 503, { "x-request-id": "provider-503-json", "retry-after": "1", "x-ratelimit-remaining": "0" }) });
await assert.rejects(() => unavailableJson.generate(providerRequest), (error: unknown) => error instanceof AdminAiError && error.code === "PROVIDER_UNAVAILABLE" && error.diagnostics.httpStatus === 503 && error.diagnostics.providerErrorCode === "overloaded" && error.diagnostics.providerRequestId === "provider-503-json" && error.diagnostics.retryAfterMs === 1_000 && error.diagnostics.rateLimitRemaining === "0");
const unavailableText = new DigitalOceanAdminAiProvider({ apiKey: "key", fetch: async () => new Response("<html><body>Service temporarily unavailable</body></html>", { status: 503, headers: { "content-type": "text/html", "x-request-id": "provider-503-text" } }) });
await assert.rejects(() => unavailableText.generate(providerRequest), (error: unknown) => error instanceof AdminAiError && error.code === "PROVIDER_UNAVAILABLE" && error.diagnostics.httpStatus === 503 && error.diagnostics.contentType === "text/html" && error.diagnostics.providerRequestId === "provider-503-text");
const malformedSuccess = new DigitalOceanAdminAiProvider({ apiKey: "key", fetch: async () => response({ unexpected: true }, 200) });
await expectCode(() => malformedSuccess.generate(providerRequest), "INVALID_RESPONSE");

class FakeProvider implements AdminAiProvider {
  readonly id = "digitalocean" as const; calls: AdminAiProviderRequest[] = [];
  constructor(private readonly run: (request: AdminAiProviderRequest, call: number) => Promise<AdminAiProviderResponse>) {}
  generate(item: AdminAiProviderRequest) { this.calls.push(item); return this.run(item, this.calls.length); }
}
const success = (model: string): AdminAiProviderResponse => ({ text: "OK", provider: "digitalocean", model, finishReason: "stop", latencyMs: 4 });
const config = loadAdminAiConfig(env);
const primary = new FakeProvider(async (item) => success(item.model));
const primaryService = new AdminAiService({ config, provider: primary, requestId: () => "generated-request", delay: async () => undefined });
assert.equal((await primaryService.generate(request)).model, "primary-model");
assert.equal((await primaryService.generate({ ...request, modelRole: "ROUTINE" })).model, "routine-model");
assert.equal(primary.calls[0].reasoningEffort, undefined);
assert.equal(primary.calls[1].reasoningEffort, undefined);

const retryFallback = new FakeProvider(async (item, call) => { if (call <= 2) throw new AdminAiError("RATE_LIMITED", "limited"); return success(item.model); });
const fallbackResult = await new AdminAiService({ config, provider: retryFallback, delay: async () => undefined, requestId: () => "fallback-request" }).generate(request);
assert.equal(retryFallback.calls.length, 3); assert.deepEqual(retryFallback.calls.map((item) => item.model), ["primary-model", "primary-model", "fallback-model"]); assert.equal(fallbackResult.fallbackUsed, true); assert.equal(fallbackResult.originalFailure, "RATE_LIMITED");

const fallbackFailure = new FakeProvider(async () => { throw new AdminAiError("PROVIDER_UNAVAILABLE", "offline"); });
await expectCode(() => new AdminAiService({ config, provider: fallbackFailure, delay: async () => undefined }).generate(request), "PROVIDER_UNAVAILABLE"); assert.equal(fallbackFailure.calls.length, 3);
const unavailableThenFallback = new FakeProvider(async (item, call) => { if (call <= 2) throw new AdminAiError("PROVIDER_UNAVAILABLE", "capacity", { httpStatus: 503 }); return success(item.model); });
const unavailableFallbackResult = await new AdminAiService({ config, provider: unavailableThenFallback, delay: async () => undefined, requestId: () => "same-logical-request" }).generate({ ...request, modelRole: "ROUTINE" });
assert.equal(unavailableThenFallback.calls.length, 3); assert.deepEqual(unavailableThenFallback.calls.map((item) => item.requestId), ["same-logical-request", "same-logical-request", "same-logical-request"]); assert.deepEqual(unavailableThenFallback.calls.map((item) => item.model), ["routine-model", "routine-model", "fallback-model"]); assert.equal(unavailableFallbackResult.fallbackUsed, true); assert.equal(unavailableFallbackResult.originalFailure, "PROVIDER_UNAVAILABLE");
const exhaustedThenFallback = new FakeProvider(async (item, call) => {
  if (call <= 2) throw new AdminAiError("INVALID_RESPONSE", "reasoning exhausted", { outputLimitReached: true, reasoningPresent: true, contentLength: 0 });
  return success(item.model);
});
const exhaustedFallbackResult = await new AdminAiService({ config, provider: exhaustedThenFallback, delay: async () => undefined, requestId: () => "exhausted-request" }).generate({ ...request, modelRole: "ROUTINE" });
assert.deepEqual(exhaustedThenFallback.calls.map((item) => item.model), ["routine-model", "routine-model", "fallback-model"]);
assert.equal(exhaustedFallbackResult.fallbackUsed, true);
assert.equal(exhaustedFallbackResult.originalFailure, "INVALID_RESPONSE");
const malformedInvalid = new FakeProvider(async () => { throw new AdminAiError("INVALID_RESPONSE", "malformed", { contentLength: 0 }); });
await expectCode(() => new AdminAiService({ config, provider: malformedInvalid, delay: async () => undefined }).generate(request), "INVALID_RESPONSE");
assert.equal(malformedInvalid.calls.length, 1);
assert.deepEqual(adminAiSafeHttpError(new AdminAiError("INVALID_RESPONSE", "private provider detail")), { status: 502, message: "Admin AI could not complete this response. Retry the message." });
assert.deepEqual(adminAiSafeHttpError(new AdminAiError("PROVIDER_UNAVAILABLE", "private provider detail")), { status: 503, message: "Admin AI provider is temporarily unavailable. Try again." });
const retryDelays: number[] = [];
const retryAfterProvider = new FakeProvider(async (item, call) => { if (call === 1) throw new AdminAiError("PROVIDER_UNAVAILABLE", "capacity", { httpStatus: 503, retryAfterMs: 1_000 }); return success(item.model); });
await new AdminAiService({ config, provider: retryAfterProvider, delay: async (milliseconds) => { retryDelays.push(milliseconds); } }).generate(request);
assert.deepEqual(retryDelays, [1_000]);
const authFailure = new FakeProvider(async () => { throw new AdminAiError("AUTHENTICATION_ERROR", "denied"); });
await expectCode(() => new AdminAiService({ config, provider: authFailure, delay: async () => undefined }).generate(request), "AUTHENTICATION_ERROR"); assert.equal(authFailure.calls.length, 1);
const disabledProvider = new FakeProvider(async (item) => success(item.model));
await expectCode(() => new AdminAiService({ config: { ...config, enabled: false }, provider: disabledProvider }).generate(request), "DISABLED"); assert.equal(disabledProvider.calls.length, 0);
await expectCode(() => primaryService.generate({ ...request, messages: [] }), "INVALID_REQUEST");
await expectCode(() => primaryService.generate({ ...request, maxOutputTokens: 99_999 }), "INVALID_REQUEST");
await expectCode(() => primaryService.generate({ ...request, reasoningEffort: "HIGH" as never }), "INVALID_REQUEST");
const cappedProvider = new FakeProvider(async (item) => success(item.model));
await new AdminAiService({ config, provider: cappedProvider }).generate({ ...request, maxOutputTokens: config.maxOutputTokens });
assert.equal(cappedProvider.calls[0].maxOutputTokens, config.maxOutputTokens);

for (const [status, code] of [[401, "AUTHENTICATION_ERROR"], [429, "RATE_LIMITED"], [404, "MODEL_UNAVAILABLE"], [503, "PROVIDER_UNAVAILABLE"], [400, "INVALID_REQUEST"]] as const) {
  await expectCode(() => new DigitalOceanAdminAiProvider({ apiKey: "key", fetch: async () => response({}, status) }).generate({ requestId: "request-http", modelRole: "PRIMARY", model: "model", systemInstruction: "safe", messages: request.messages, contextBlocks: [], temperature: 0, maxOutputTokens: 10, outputFormat: "TEXT", timeoutMs: 1_000 }), code);
}
await expectCode(() => new DigitalOceanAdminAiProvider({ apiKey: "key", fetch: async () => new Response("bad-json") }).generate({ requestId: "request-json", modelRole: "PRIMARY", model: "model", systemInstruction: "safe", messages: request.messages, contextBlocks: [], temperature: 0, maxOutputTokens: 10, outputFormat: "TEXT", timeoutMs: 1_000 }), "INVALID_RESPONSE");
await expectCode(() => new DigitalOceanAdminAiProvider({ apiKey: "key", fetch: async (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))) }).generate({ requestId: "request-timeout", modelRole: "PRIMARY", model: "model", systemInstruction: "safe", messages: request.messages, contextBlocks: [], temperature: 0, maxOutputTokens: 10, outputFormat: "TEXT", timeoutMs: 5 }), "TIMEOUT");

const logs: AdminAiLogEvent[] = []; const sensitive = "sensitive-prompt-value";
await new AdminAiService({ config, provider: new FakeProvider(async (item) => success(item.model)), logger: (event) => logs.push(event) }).generate({ ...request, messages: [{ role: "user", content: sensitive }] });
const serializedLogs = JSON.stringify(logs); assert.equal(serializedLogs.includes(sensitive), false); assert.equal(serializedLogs.includes("admin-secret"), false); assert.equal(logs[0].requestId.length > 0, true);

const providerWithoutUsage = new DigitalOceanAdminAiProvider({ apiKey: "key", fetch: async () => response({ choices: [{ message: { content: "OK" } }] }) });
assert.equal((await providerWithoutUsage.generate({ requestId: "request-usage", modelRole: "PRIMARY", model: "model", systemInstruction: "safe", messages: request.messages, contextBlocks: [], temperature: 0, maxOutputTokens: 10, outputFormat: "TEXT", timeoutMs: 1_000 })).usage, undefined);

const indexSource = await readFile(join(process.cwd(), "backend/adminAi/index.ts"), "utf8");
const serviceSource = await readFile(join(process.cwd(), "backend/adminAi/service.ts"), "utf8");
assert.doesNotMatch(`${indexSource}${serviceSource}`, /zeus|recordAdminAudit|postgres|repository|server\.js/i);
console.log("Admin AI foundation tests passed.");

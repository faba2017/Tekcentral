import assert from "node:assert/strict";
import { DigitalOceanZeusProvider, parseInlineToolCall, ZeusProviderError } from "../zeus/digitalOceanProvider.js";
import { createZeusProvider } from "../zeus/providerFactory.js";
import type { ZeusProviderRequest } from "../zeus/types.js";

const baseRequest: ZeusProviderRequest = { system: "Safe policy", messages: [{ role: "user", content: "Find a router" }], authenticated: false, tools: [{ name: "searchProducts", description: "Search", inputSchema: { type: "object", properties: { query: { type: "string" } }, additionalProperties: false }, requiresAuthentication: false }] };
const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const expectCode = async (run: () => Promise<unknown>, code: string) => assert.rejects(run, (error: unknown) => error instanceof ZeusProviderError && error.code === code);

assert.throws(() => new DigitalOceanZeusProvider({ apiKey: "", model: "model" }), (error: unknown) => error instanceof ZeusProviderError && error.code === "CONFIGURATION_ERROR");
assert.throws(() => new DigitalOceanZeusProvider({ apiKey: "key", model: "" }), (error: unknown) => error instanceof ZeusProviderError && error.code === "CONFIGURATION_ERROR");
assert.throws(() => new DigitalOceanZeusProvider({ apiKey: "key", model: "model", baseUrl: "http://unsafe.test" }), (error: unknown) => error instanceof ZeusProviderError && error.code === "CONFIGURATION_ERROR");
assert.equal(createZeusProvider({ ZEUS_PROVIDER: "local" }).constructor.name, "LocalZeusProvider");
await expectCode(() => createZeusProvider({ ZEUS_PROVIDER: "unknown" }).generate(baseRequest), "CONFIGURATION_ERROR");

let capturedUrl = ""; let capturedAuthorization = ""; let capturedBody = "";
const normal = new DigitalOceanZeusProvider({ apiKey: "secret-key", model: "tool-model", baseUrl: "https://inference.do-ai.run/", fetch: async (input, init) => { capturedUrl = String(input); capturedAuthorization = String((init?.headers as Record<string, string>).Authorization); capturedBody = String(init?.body); return jsonResponse({ id: "completion-1", model: "tool-model", choices: [{ message: { content: "Here is the answer." } }], usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 } }, 200, { "x-request-id": "request-1" }); } });
const answer = await normal.generate(baseRequest);
assert.equal(capturedUrl, "https://inference.do-ai.run/v1/chat/completions"); assert.equal(capturedAuthorization, "Bearer secret-key"); assert.equal(capturedBody.includes("secret-key"), false); assert.equal(answer.message, "Here is the answer."); assert.deepEqual(answer.usage, { inputTokens: 20, outputTokens: 5, totalTokens: 25 }); assert.equal(answer.requestId, "request-1");

const toolProvider = new DigitalOceanZeusProvider({ apiKey: "key", model: "tool-model", fetch: async () => jsonResponse({ choices: [{ message: { content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "searchProducts", arguments: "{\"query\":\"router\"}" } }] } }] }) });
assert.deepEqual((await toolProvider.generate(baseRequest)).toolCalls, [{ id: "call-1", name: "searchProducts", input: { query: "router" } }]);
assert.deepEqual(parseInlineToolCall("Searching.searchProducts<arg_key>query</arg_key><arg_value>router</arg_value><arg_key>limit</arg_key><arg_value>4</arg_value>", ["searchProducts"]), { id: "inline-searchProducts", name: "searchProducts", input: { query: "router", limit: 4 } });
assert.equal(parseInlineToolCall("searchProducts<arg_key>query</arg_key><arg_value>router</arg_value>", ["getProduct"]), undefined);
const inlineProvider = new DigitalOceanZeusProvider({ apiKey: "key", model: "tool-model", fetch: async () => jsonResponse({ choices: [{ message: { content: "Searching.searchProducts<arg_key>query</arg_key><arg_value>router</arg_value>" } }] }) });
assert.deepEqual((await inlineProvider.generate(baseRequest)).toolCalls, [{ id: "inline-searchProducts", name: "searchProducts", input: { query: "router" } }]);
const mixedProvider = new DigitalOceanZeusProvider({ apiKey: "key", model: "tool-model", fetch: async () => jsonResponse({ extra: { ignored: true }, choices: [{ finish_reason: "tool_calls", message: { content: "I'll check both.", tool_calls: [{ id: "call-a", type: "function", function: { name: "searchProducts", arguments: "{\"query\":\"router\"}" } }, { id: "call-b", type: "function", function: { name: "searchProducts", arguments: "{\"query\":\"ethernet cable\"}" } }] } }] }) });
const mixed = await mixedProvider.generate(baseRequest); assert.equal(mixed.message, "I'll check both."); assert.equal(mixed.toolCalls?.length, 2);

let followUpBody = "";
const followUp = new DigitalOceanZeusProvider({ apiKey: "key", model: "tool-model", fetch: async (_input, init) => { followUpBody = String(init?.body); return jsonResponse({ choices: [{ message: { content: "Done" } }] }); } });
await followUp.generate({ ...baseRequest, toolResults: [{ toolCallId: "call-1", name: "searchProducts", input: { query: "router" }, output: { products: [{ name: "Public Router", price: 1000 }] } }] });
const followUpJson = JSON.parse(followUpBody) as { messages: { role: string; tool_calls?: unknown; tool_call_id?: string }[] };
assert.equal(followUpJson.messages.some((message) => message.role === "assistant" && message.tool_calls), true); assert.equal(followUpJson.messages.some((message) => message.role === "tool" && message.tool_call_id === "call-1"), true);
assert.equal(followUpBody.includes("supplierCost"), false); assert.equal(followUpBody.includes("sessionToken"), false); assert.equal(followUpBody.includes("passwordHash"), false);
let forcedBody = "";
const forced = new DigitalOceanZeusProvider({ apiKey: "key", model: "tool-model", fetch: async (_input, init) => { forcedBody = String(init?.body); return jsonResponse({ choices: [{ message: { content: "Final from evidence" } }] }); } });
await forced.generate({ ...baseRequest, forceFinalAnswer: true, toolResults: [{ toolCallId: "call-1", name: "searchProducts", input: { query: "router" }, output: { products: [] } }] });
const forcedJson = JSON.parse(forcedBody) as { tools?: unknown[]; tool_choice?: unknown; messages: { role: string; content?: string }[] };
assert.equal(forcedJson.tools, undefined); assert.equal(forcedJson.tool_choice, undefined); assert.equal(forcedJson.messages.some((message) => message.role === "system" && message.content?.includes("No further tools")), true);

for (const [status, code] of [[401, "AUTH_ERROR"], [403, "AUTH_ERROR"], [429, "RATE_LIMITED"], [404, "MODEL_UNAVAILABLE"], [503, "PROVIDER_5XX"]] as const) await expectCode(() => new DigitalOceanZeusProvider({ apiKey: "key", model: "model", fetch: async () => jsonResponse({ error: { message: "raw secret error" } }, status) }).generate(baseRequest), code);
await expectCode(() => new DigitalOceanZeusProvider({ apiKey: "key", model: "model", fetch: async () => new Response("not json") }).generate(baseRequest), "INVALID_PROVIDER_RESPONSE");
await expectCode(() => new DigitalOceanZeusProvider({ apiKey: "key", model: "model", fetch: async () => jsonResponse({ choices: [] }) }).generate(baseRequest), "INVALID_PROVIDER_RESPONSE");
await expectCode(() => new DigitalOceanZeusProvider({ apiKey: "key", model: "model", fetch: async () => jsonResponse({ choices: [{ message: { tool_calls: [{ id: "call", type: "function", function: { name: "searchProducts", arguments: "not-json" } }] } }] }) }).generate(baseRequest), "INVALID_PROVIDER_RESPONSE");
await expectCode(() => new DigitalOceanZeusProvider({ apiKey: "key", model: "model", fetch: async () => jsonResponse({ choices: [{ message: { tool_calls: [{ id: "call", type: "function", function: { name: "unknownTool", arguments: "{}" } }] } }] }) }).generate(baseRequest), "INVALID_PROVIDER_RESPONSE");
await expectCode(() => new DigitalOceanZeusProvider({ apiKey: "key", model: "model", fetch: async () => jsonResponse({ choices: [{ message: { tool_calls: [{ id: "call", type: "function", function: { arguments: "{}" } }] } }] }) }).generate(baseRequest), "INVALID_PROVIDER_RESPONSE");
await expectCode(() => new DigitalOceanZeusProvider({ apiKey: "key", model: "model", fetch: async () => jsonResponse({ choices: [{ message: { tool_calls: [{ id: "call", type: "function", function: { name: "searchProducts", arguments: "[]" } }] } }] }) }).generate(baseRequest), "INVALID_PROVIDER_RESPONSE");
await expectCode(() => new DigitalOceanZeusProvider({ apiKey: "key", model: "model", fetch: async () => jsonResponse({ choices: [{ message: { tool_calls: [{ id: "call", type: "function", function: { name: "searchProducts", arguments: "{\"unsupported\":true}" } }] } }] }) }).generate(baseRequest), "INVALID_PROVIDER_RESPONSE");
await expectCode(() => new DigitalOceanZeusProvider({ apiKey: "key", model: "model", fetch: async () => jsonResponse({ choices: [{ message: { content: [{ type: "text", text: "unsupported" }] } }] }) }).generate(baseRequest), "INVALID_PROVIDER_RESPONSE");
await expectCode(() => new DigitalOceanZeusProvider({ apiKey: "key", model: "model", fetch: async () => jsonResponse({ choices: [{ finish_reason: "length", message: { content: "truncated" } }], usage: { completion_tokens: 700 } }) }).generate(baseRequest), "OUTPUT_LIMIT");
await expectCode(() => new DigitalOceanZeusProvider({ apiKey: "key", model: "model", fetch: async () => jsonResponse({ choices: [{ finish_reason: "tool_calls", message: { content: null } }] }) }).generate(baseRequest), "INVALID_PROVIDER_RESPONSE");
await expectCode(() => new DigitalOceanZeusProvider({ apiKey: "key", model: "model", timeoutMs: 5, fetch: async (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))) }).generate(baseRequest), "TIMEOUT");
console.log("Zeus DigitalOcean provider tests passed.");

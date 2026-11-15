import type { ZeusAIProvider, ZeusProviderRequest, ZeusProviderResponse, ZeusToolCall } from "./types.js";

export type ZeusProviderErrorCode = "AUTH_ERROR" | "RATE_LIMITED" | "TIMEOUT" | "MODEL_UNAVAILABLE" | "INVALID_PROVIDER_RESPONSE" | "OUTPUT_LIMIT" | "PROVIDER_5XX" | "NETWORK_ERROR" | "CONFIGURATION_ERROR";
export class ZeusProviderError extends Error { constructor(public code: ZeusProviderErrorCode, message: string, public requestId?: string, public usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }) { super(message); } }
export interface DigitalOceanProviderConfig { apiKey: string; model: string; baseUrl?: string; timeoutMs?: number; maxOutputTokens?: number; fetch?: typeof fetch }

type ProviderMessage = { role: string; content?: string | null; tool_call_id?: string; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] };
type CompletionResponse = { id?: string; model?: string; choices?: { finish_reason?: string | null; message?: { content?: unknown; refusal?: unknown; tool_calls?: { id?: string; type?: string; function?: { name?: string; arguments?: string } }[] } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }; error?: { message?: string; code?: string } };

const cleanBaseUrl = (value: string) => value.replace(/\/+$/, "");
const completionUsage = (body: CompletionResponse) => ({ inputTokens: body.usage?.prompt_tokens, outputTokens: body.usage?.completion_tokens, totalTokens: body.usage?.total_tokens });
export function parseInlineToolCall(content: string, allowedTools: string[]): ZeusToolCall | undefined {
  if (!content.includes("<arg_key>") || !content.includes("<arg_value>")) return undefined;
  const name = allowedTools.find((tool) => new RegExp(`(?:^|[^A-Za-z0-9_])${tool}(?=<arg_key>)`).test(content));
  if (!name) return undefined;
  const input: Record<string, string | number | boolean> = {}; const pattern = /<arg_key>([^<]+)<\/arg_key><arg_value>([^<]*)<\/arg_value>/g;
  for (const match of content.matchAll(pattern)) { const key = match[1].trim(); const value = match[2].trim(); if (!key || Object.hasOwn(input, key)) return undefined; input[key] = /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : value === "true" ? true : value === "false" ? false : value; }
  return Object.keys(input).length ? { id: `inline-${name}`, name, input } : undefined;
}
const schemaAccepts = (value: unknown, schema: Record<string, unknown>): boolean => {
  if (schema.type === "object") { if (!value || typeof value !== "object" || Array.isArray(value)) return false; const data = value as Record<string, unknown>; const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>; if (schema.additionalProperties === false && Object.keys(data).some((key) => !Object.hasOwn(properties, key))) return false; if (Array.isArray(schema.required) && schema.required.some((key) => typeof key !== "string" || data[key] === undefined)) return false; return Object.entries(data).every(([key, item]) => !properties[key] || schemaAccepts(item, properties[key])); }
  if (schema.type === "array") return Array.isArray(value) && (typeof schema.minItems !== "number" || value.length >= schema.minItems) && (typeof schema.maxItems !== "number" || value.length <= schema.maxItems) && value.every((item) => schemaAccepts(item, (schema.items ?? {}) as Record<string, unknown>));
  if (schema.type === "string") return typeof value === "string" && (!Array.isArray(schema.enum) || schema.enum.includes(value));
  if (schema.type === "integer") return typeof value === "number" && Number.isInteger(value) && (typeof schema.minimum !== "number" || value >= schema.minimum) && (typeof schema.maximum !== "number" || value <= schema.maximum);
  if (schema.type === "number") return typeof value === "number" && Number.isFinite(value) && (typeof schema.minimum !== "number" || value >= schema.minimum) && (typeof schema.maximum !== "number" || value <= schema.maximum);
  if (schema.type === "boolean") return typeof value === "boolean";
  return false;
};
const providerMessages = (request: ZeusProviderRequest): ProviderMessage[] => {
  const messages: ProviderMessage[] = [{ role: "system", content: request.system }, ...request.messages.map((item) => ({ role: item.role, content: item.content }))];
  for (const result of request.toolResults ?? []) {
    messages.push({ role: "assistant", content: null, tool_calls: [{ id: result.toolCallId, type: "function", function: { name: result.name, arguments: JSON.stringify(result.input) } }] });
    messages.push({ role: "tool", tool_call_id: result.toolCallId, content: JSON.stringify(result.output) });
  }
  if (request.forceFinalAnswer) messages.push({ role: "system", content: "No further tools are needed. Answer the customer's request now using only the supplied tool results. Do not request another tool." });
  return messages;
};

export class DigitalOceanZeusProvider implements ZeusAIProvider {
  private baseUrl: string; private timeoutMs: number; private maxOutputTokens: number; private request: typeof fetch;
  constructor(private config: DigitalOceanProviderConfig) {
    if (!config.apiKey.trim()) throw new ZeusProviderError("CONFIGURATION_ERROR", "DigitalOcean inference API key is not configured.");
    if (!config.model.trim()) throw new ZeusProviderError("CONFIGURATION_ERROR", "DigitalOcean inference model is not configured.");
    this.baseUrl = cleanBaseUrl(config.baseUrl?.trim() || "https://inference.do-ai.run");
    if (!this.baseUrl.startsWith("https://")) throw new ZeusProviderError("CONFIGURATION_ERROR", "DigitalOcean inference base URL must use HTTPS.");
    this.timeoutMs = config.timeoutMs ?? 15_000; this.maxOutputTokens = config.maxOutputTokens ?? 700; this.request = config.fetch ?? fetch;
  }

  async generate(request: ZeusProviderRequest): Promise<ZeusProviderResponse> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      const tools = request.forceFinalAnswer ? [] : request.tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema, strict: true } }));
      response = await this.request(`${this.baseUrl}/v1/chat/completions`, { method: "POST", signal: controller.signal, headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: this.config.model, messages: providerMessages(request), ...(tools.length ? { tools, tool_choice: "auto" } : {}), temperature: 0.2, max_completion_tokens: this.maxOutputTokens, stream: false }) });
    } catch (error) { if (error instanceof Error && error.name === "AbortError") throw new ZeusProviderError("TIMEOUT", "DigitalOcean inference timed out."); throw new ZeusProviderError("NETWORK_ERROR", "DigitalOcean inference network request failed."); }
    finally { clearTimeout(timer); }
    const requestId = response.headers.get("x-request-id") ?? response.headers.get("request-id") ?? undefined;
    let body: CompletionResponse;
    try { body = await response.json() as CompletionResponse; } catch { throw new ZeusProviderError("INVALID_PROVIDER_RESPONSE", "DigitalOcean returned malformed JSON.", requestId); }
    if (!response.ok) {
      const code: ZeusProviderErrorCode = response.status === 401 || response.status === 403 ? "AUTH_ERROR" : response.status === 429 ? "RATE_LIMITED" : response.status === 404 ? "MODEL_UNAVAILABLE" : response.status >= 500 ? "PROVIDER_5XX" : "INVALID_PROVIDER_RESPONSE";
      throw new ZeusProviderError(code, `DigitalOcean inference failed with ${response.status}.`, requestId);
    }
    const usage = completionUsage(body); const choice = body.choices?.[0]; const message = choice?.message; if (!message) throw new ZeusProviderError("INVALID_PROVIDER_RESPONSE", "DigitalOcean response did not contain a message.", requestId ?? body.id, usage);
    if (choice.finish_reason === "length") throw new ZeusProviderError("OUTPUT_LIMIT", "DigitalOcean response reached its output limit.", requestId ?? body.id, usage);
    if (choice.finish_reason && !["stop", "tool_calls", "function_call"].includes(choice.finish_reason)) throw new ZeusProviderError("INVALID_PROVIDER_RESPONSE", "DigitalOcean response ended unexpectedly.", requestId ?? body.id);
    if (message.refusal !== undefined && message.refusal !== null) throw new ZeusProviderError("INVALID_PROVIDER_RESPONSE", "DigitalOcean declined the request.", requestId ?? body.id);
    const toolCalls: ZeusToolCall[] = [];
    for (const call of message.tool_calls ?? []) {
      if (!call.id || call.type !== "function" || !call.function?.name || typeof call.function.arguments !== "string") throw new ZeusProviderError("INVALID_PROVIDER_RESPONSE", "DigitalOcean returned an invalid tool call.", requestId ?? body.id);
      const definition = request.tools.find((tool) => tool.name === call.function!.name); if (!definition) throw new ZeusProviderError("INVALID_PROVIDER_RESPONSE", "DigitalOcean requested an unknown tool.", requestId ?? body.id);
      let input: unknown; try { input = JSON.parse(call.function.arguments); } catch { throw new ZeusProviderError("INVALID_PROVIDER_RESPONSE", "DigitalOcean returned invalid tool arguments.", requestId ?? body.id); }
      if (!schemaAccepts(input, definition.inputSchema)) throw new ZeusProviderError("INVALID_PROVIDER_RESPONSE", "DigitalOcean returned tool arguments outside the registered schema.", requestId ?? body.id);
      toolCalls.push({ id: call.id, name: call.function.name, input });
    }
    if (message.content !== undefined && message.content !== null && typeof message.content !== "string") throw new ZeusProviderError("INVALID_PROVIDER_RESPONSE", "DigitalOcean returned unsupported assistant content.", requestId ?? body.id);
    let content = typeof message.content === "string" && message.content.trim() ? message.content.trim() : undefined;
    if (!toolCalls.length && content) { const inline = parseInlineToolCall(content, request.tools.map((tool) => tool.name)); if (inline) { toolCalls.push(inline); content = undefined; } }
    for (const call of toolCalls) { const definition = request.tools.find((tool) => tool.name === call.name); if (!definition || !schemaAccepts(call.input, definition.inputSchema)) throw new ZeusProviderError("INVALID_PROVIDER_RESPONSE", "DigitalOcean returned an invalid normalized tool call.", requestId ?? body.id); }
    if (choice.finish_reason === "tool_calls" && toolCalls.length === 0) throw new ZeusProviderError("INVALID_PROVIDER_RESPONSE", "DigitalOcean ended for tool calls without a valid tool call.", requestId ?? body.id);
    if (!content && toolCalls.length === 0) throw new ZeusProviderError("INVALID_PROVIDER_RESPONSE", "DigitalOcean response contained neither text nor tool calls.", requestId ?? body.id);
    return { message: content, toolCalls: toolCalls.length ? toolCalls : undefined, provider: "digitalocean", model: body.model ?? this.config.model, requestId: requestId ?? body.id, usage: { inputTokens: body.usage?.prompt_tokens, outputTokens: body.usage?.completion_tokens, totalTokens: body.usage?.total_tokens } };
  }
}

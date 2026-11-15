import { performance } from "node:perf_hooks";
import { AdminAiError } from "./errors.js";
import type { AdminAiProvider, AdminAiProviderRequest, AdminAiProviderResponse, AdminAiToolCall, AdminAiUsage } from "./types.js";

type CompletionBody = {
  id?: string;
  model?: string;
  choices?: Array<{ finish_reason?: string | null; message?: { content?: unknown; reasoning_content?: unknown; refusal?: unknown; tool_calls?: unknown[] } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
};

export interface DigitalOceanAdminAiProviderOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

const DEFAULT_BASE_URL = "https://inference.do-ai.run";
const MAX_DIAGNOSTIC_LENGTH = 160;
const REASONING_EFFORT_CAPABILITIES = new Map<string, ReadonlySet<"low">>([
  ["glm-5.3", new Set(["low"])],
]);

function providerReasoningEffort(request: AdminAiProviderRequest) {
  const effort = request.reasoningEffort?.toLowerCase() as "low" | undefined;
  return effort && REASONING_EFFORT_CAPABILITIES.get(request.model)?.has(effort) ? effort : undefined;
}

function safeDiagnostic(value: unknown) {
  if (typeof value !== "string") return undefined;
  const sanitized = value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/(?:api[_ -]?key|token|secret)\s*[:=]\s*\S+/gi, "[redacted-credential]")
    .trim();
  return sanitized ? sanitized.slice(0, MAX_DIAGNOSTIC_LENGTH) : undefined;
}

function retryAfterMs(value: string | null, now = Date.now()) {
  if (!value?.trim()) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : undefined;
}

function providerErrorDetails(raw: string) {
  try {
    const parsed = JSON.parse(raw) as { error?: unknown; code?: unknown; message?: unknown; type?: unknown };
    const nested = parsed.error && typeof parsed.error === "object" ? parsed.error as { code?: unknown; message?: unknown; type?: unknown } : undefined;
    return {
      providerErrorType: safeDiagnostic(nested?.type ?? parsed.type),
      providerErrorCode: safeDiagnostic(nested?.code ?? parsed.code),
      providerErrorMessage: safeDiagnostic(nested?.message ?? parsed.message),
    };
  } catch {
    return { providerErrorMessage: safeDiagnostic(raw.replace(/<[^>]*>/g, " ")) };
  }
}

function providerMessages(request: AdminAiProviderRequest) {
  const context = request.contextBlocks.length
    ? `\n\nAuthoritative context blocks:\n${request.contextBlocks.map((item) => `[${item.label}]\n${item.content}`).join("\n\n")}`
    : "";
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: `${request.systemInstruction}${context}` },
    ...request.messages.map((message) => ({ role: message.role, content: message.content })),
  ];
  if (request.toolContinuation) {
    messages.push({ role: "assistant", content: null, tool_calls: [{ id: request.toolContinuation.call.id, type: "function", function: { name: request.toolContinuation.call.name, arguments: JSON.stringify(request.toolContinuation.call.input) } }] });
    messages.push({ role: "tool", tool_call_id: request.toolContinuation.call.id, name: request.toolContinuation.call.name, content: JSON.stringify(request.toolContinuation.result) });
  }
  return messages;
}

function toolCalls(raw: unknown[], request: AdminAiProviderRequest): AdminAiToolCall[] {
  const allowed = new Set((request.tools ?? []).map((tool) => tool.name));
  return raw.map((item) => {
    if (!item || typeof item !== "object") throw new AdminAiError("INVALID_RESPONSE", "Admin AI provider returned an invalid tool call.");
    const value = item as { id?: unknown; type?: unknown; function?: { name?: unknown; arguments?: unknown } };
    if (typeof value.id !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(value.id) || value.type !== "function" || typeof value.function?.name !== "string" || !allowed.has(value.function.name) || typeof value.function.arguments !== "string") throw new AdminAiError("INVALID_RESPONSE", "Admin AI provider returned an unknown or malformed tool call.");
    let input: unknown;
    try { input = JSON.parse(value.function.arguments); } catch { throw new AdminAiError("INVALID_RESPONSE", "Admin AI provider returned malformed tool arguments."); }
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new AdminAiError("INVALID_RESPONSE", "Admin AI provider returned invalid tool arguments.");
    return { id: value.id, name: value.function.name, input: input as Record<string, unknown> };
  });
}

function usage(body: CompletionBody): AdminAiUsage | undefined {
  if (!body.usage) return undefined;
  return {
    inputTokens: body.usage.prompt_tokens,
    outputTokens: body.usage.completion_tokens,
    totalTokens: body.usage.total_tokens,
    ...(body.usage.completion_tokens_details?.reasoning_tokens !== undefined ? { reasoningTokens: body.usage.completion_tokens_details.reasoning_tokens } : {}),
  };
}

export class DigitalOceanAdminAiProvider implements AdminAiProvider {
  readonly id = "digitalocean" as const;
  private readonly request: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly options: DigitalOceanAdminAiProviderOptions) {
    if (!options.apiKey.trim()) throw new AdminAiError("CONFIGURATION_ERROR", "Admin AI DigitalOcean API key is not configured.");
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    if (this.baseUrl !== DEFAULT_BASE_URL) throw new AdminAiError("CONFIGURATION_ERROR", "Admin AI inference endpoint is not allowed.");
    this.request = options.fetch ?? fetch;
  }

  async generate(request: AdminAiProviderRequest): Promise<AdminAiProviderResponse> {
    const startedAt = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    let response: Response;
    try {
      const reasoningEffort = providerReasoningEffort(request);
      response = await this.request(`${this.baseUrl}/v1/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
          "X-Request-ID": request.requestId,
        },
        body: JSON.stringify({
          model: request.model,
          messages: providerMessages(request),
          temperature: request.temperature,
          max_completion_tokens: request.maxOutputTokens,
          stream: false,
          ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
          ...(request.outputFormat === "JSON_OBJECT" ? { response_format: { type: "json_object" } } : {}),
          ...(request.tools?.length ? { tools: request.tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } })), tool_choice: "auto" } : {}),
        }),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new AdminAiError("TIMEOUT", "Admin AI provider request timed out.", { requestId: request.requestId, modelRole: request.modelRole, model: request.model });
      throw new AdminAiError("PROVIDER_UNAVAILABLE", "Admin AI provider could not be reached.", { requestId: request.requestId, modelRole: request.modelRole, model: request.model });
    } finally {
      clearTimeout(timer);
    }

    const providerRequestId = response.headers.get("x-request-id") ?? response.headers.get("request-id") ?? undefined;
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    const rawBody = await response.text();
    if (!response.ok) {
      const code = response.status === 401 || response.status === 403 ? "AUTHENTICATION_ERROR"
        : response.status === 429 ? "RATE_LIMITED"
          : response.status === 408 ? "TIMEOUT"
          : response.status === 404 ? "MODEL_UNAVAILABLE"
            : response.status >= 500 ? "PROVIDER_UNAVAILABLE"
              : response.status >= 400 ? "INVALID_REQUEST" : "UNKNOWN_PROVIDER_ERROR";
      throw new AdminAiError(code, `Admin AI provider request failed with HTTP ${response.status}.`, {
        requestId: request.requestId,
        modelRole: request.modelRole,
        model: request.model,
        providerRequestId,
        httpStatus: response.status,
        contentType,
        ...providerErrorDetails(rawBody),
        retryAfterMs: retryAfterMs(response.headers.get("retry-after")),
        rateLimitLimit: safeDiagnostic(response.headers.get("x-ratelimit-limit")),
        rateLimitRemaining: safeDiagnostic(response.headers.get("x-ratelimit-remaining")),
        rateLimitReset: safeDiagnostic(response.headers.get("x-ratelimit-reset")),
      });
    }

    let body: CompletionBody;
    try { body = JSON.parse(rawBody) as CompletionBody; }
    catch { throw new AdminAiError("INVALID_RESPONSE", "Admin AI provider returned malformed JSON.", { requestId: request.requestId, modelRole: request.modelRole, model: request.model, providerRequestId, httpStatus: response.status, contentType }); }

    const choice = body.choices?.[0];
    if (!choice?.message) throw new AdminAiError("INVALID_RESPONSE", "Admin AI provider response did not contain a choice message.", { requestId: request.requestId, modelRole: request.modelRole, model: request.model, providerRequestId: providerRequestId ?? body.id });
    const reasoningPresent = typeof choice.message.reasoning_content === "string" && choice.message.reasoning_content.length > 0;
    const reasoningLength = typeof choice.message.reasoning_content === "string" ? choice.message.reasoning_content.length : 0;
    const contentLength = typeof choice.message.content === "string" ? choice.message.content.length : 0;
    const normalizedUsage = usage(body);
    if (choice.message.refusal != null) throw new AdminAiError("INVALID_RESPONSE", "Admin AI provider declined the request.", { requestId: request.requestId, modelRole: request.modelRole, model: request.model, providerRequestId: providerRequestId ?? body.id, finishReason: choice.finish_reason ?? undefined, reasoningPresent });
    const parsedToolCalls = toolCalls(Array.isArray(choice.message.tool_calls) ? choice.message.tool_calls : [], request);
    if (parsedToolCalls.length > 1) throw new AdminAiError("INVALID_RESPONSE", "Admin AI supports one controlled action per turn.", { requestId: request.requestId, modelRole: request.modelRole, model: request.model, providerRequestId: providerRequestId ?? body.id });
    if ((typeof choice.message.content !== "string" || !choice.message.content.trim()) && parsedToolCalls.length === 0) {
      const outputLimitReached = choice.finish_reason === "length";
      const message = outputLimitReached ? "Admin AI provider exhausted the output budget before returning final text." : "Admin AI provider returned no usable final text.";
      throw new AdminAiError("INVALID_RESPONSE", message, { requestId: request.requestId, modelRole: request.modelRole, model: request.model, providerRequestId: providerRequestId ?? body.id, httpStatus: response.status, contentType, finishReason: choice.finish_reason ?? undefined, reasoningPresent, reasoningLength, contentLength, outputLimitReached, outputTokens: normalizedUsage?.outputTokens });
    }
    return {
      text: typeof choice.message.content === "string" ? choice.message.content.trim() : "",
      provider: this.id,
      model: body.model ?? request.model,
      finishReason: choice.finish_reason ?? undefined,
      providerRequestId: providerRequestId ?? body.id,
      usage: normalizedUsage,
      latencyMs: Math.round(performance.now() - startedAt),
      ...(parsedToolCalls.length ? { toolCalls: parsedToolCalls } : {}),
    };
  }
}

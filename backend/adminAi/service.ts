import { randomUUID } from "node:crypto";
import { adminAiModelForRole, type AdminAiConfig } from "./config.js";
import { AdminAiError, adminAiFallbackEligible, adminAiOutputExhaustion, adminAiRetryable } from "./errors.js";
import { ADMIN_AI_SYSTEM_INSTRUCTION } from "./instructions.js";
import { ADMIN_AI_MODEL_ROLES, type AdminAiGenerateRequest, type AdminAiGenerateResponse, type AdminAiProvider, type AdminAiProviderRequest } from "./types.js";

export type AdminAiLogEvent = {
  event: "admin_ai_request";
  requestId: string;
  callerFeature: string;
  provider: string;
  modelRole: string;
  model: string;
  attempt: number;
  fallback: boolean;
  outcome: "SUCCESS" | "ERROR";
  latencyMs: number;
  errorCode?: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
};

export interface AdminAiServiceOptions {
  config: AdminAiConfig;
  provider: AdminAiProvider;
  logger?: (event: AdminAiLogEvent) => void;
  requestId?: () => string;
  delay?: (milliseconds: number) => Promise<void>;
  observer?: { success?: (result:AdminAiGenerateResponse)=>void|Promise<void>; failure?: (error:AdminAiError)=>void|Promise<void> };
}

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
const retryDelayMs = (failure: AdminAiError) => {
  const requested = failure.diagnostics.retryAfterMs;
  return requested !== undefined && requested >= 0 && requested <= 2_000 ? requested : 100;
};
const invalid = (message: string) => { throw new AdminAiError("INVALID_REQUEST", message); };

function validateRequest(request: AdminAiGenerateRequest, config: AdminAiConfig) {
  if (!ADMIN_AI_MODEL_ROLES.includes(request.modelRole)) invalid("Admin AI model role is invalid.");
  if (!request.callerFeature?.trim() || request.callerFeature.length > 80) invalid("Admin AI caller feature is invalid.");
  if (!request.messages.length || request.messages.length > 20) invalid("Admin AI requires between 1 and 20 messages.");
  let messageCharacters = 0;
  for (const message of request.messages) {
    if (!message.content.trim() || message.content.length > 8_000) invalid("Admin AI message content is invalid.");
    messageCharacters += message.content.length;
  }
  if (messageCharacters > 32_000) invalid("Admin AI message input is too large.");
  const context = request.contextBlocks ?? [];
  if (context.length > 8 || context.some((item) => !item.label.trim() || item.label.length > 80 || !item.content.trim() || item.content.length > 4_000)) invalid("Admin AI context is invalid.");
  if (context.reduce((sum, item) => sum + item.content.length, 0) > 16_000) invalid("Admin AI context is too large.");
  const temperature = request.temperature ?? 0.1;
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 1) invalid("Admin AI temperature is invalid.");
  const maxOutputTokens = request.maxOutputTokens ?? config.maxOutputTokens;
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > config.maxOutputTokens) invalid("Admin AI output limit is invalid.");
  const timeoutMs = request.timeoutMs ?? config.timeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > config.timeoutMs) invalid("Admin AI timeout is invalid.");
  if (request.reasoningEffort !== undefined && request.reasoningEffort !== "LOW") invalid("Admin AI reasoning policy is invalid.");
  const tools = request.tools ?? [];
  if (tools.length > 8 || new Set(tools.map((tool) => tool.name)).size !== tools.length || tools.some((tool) => !/^[a-z][a-z0-9_]{2,63}$/.test(tool.name) || !tool.description.trim() || tool.description.length > 500 || !tool.inputSchema || typeof tool.inputSchema !== "object")) invalid("Admin AI tool definitions are invalid.");
  if (request.toolContinuation && (!/^[A-Za-z0-9_-]{1,160}$/.test(request.toolContinuation.call.id) || !/^[a-z][a-z0-9_]{2,63}$/.test(request.toolContinuation.call.name))) invalid("Admin AI tool continuation is invalid.");
  return { context, temperature, maxOutputTokens, timeoutMs, reasoningEffort: request.reasoningEffort, tools, toolContinuation: request.toolContinuation };
}

export class AdminAiService {
  private readonly logger: (event: AdminAiLogEvent) => void;
  private readonly makeRequestId: () => string;
  private readonly delay: (milliseconds: number) => Promise<void>;

  constructor(private readonly options: AdminAiServiceOptions) {
    this.logger = options.logger ?? (() => undefined);
    this.makeRequestId = options.requestId ?? randomUUID;
    this.delay = options.delay ?? wait;
  }

  async generate(request: AdminAiGenerateRequest): Promise<AdminAiGenerateResponse> {
    if (!this.options.config.enabled) throw new AdminAiError("DISABLED", "Admin AI is disabled.");
    const validated = validateRequest(request, this.options.config);
    const requestId = request.requestId && /^[A-Za-z0-9_-]{8,80}$/.test(request.requestId) ? request.requestId : this.makeRequestId();
    const originalModel = adminAiModelForRole(this.options.config, request.modelRole);
    const base: Omit<AdminAiProviderRequest, "model"> = {
      requestId,
      modelRole: request.modelRole,
      systemInstruction: ADMIN_AI_SYSTEM_INSTRUCTION,
      messages: request.messages,
      contextBlocks: validated.context,
      temperature: validated.temperature,
      maxOutputTokens: validated.maxOutputTokens,
      outputFormat: request.outputFormat ?? "TEXT",
      timeoutMs: validated.timeoutMs,
      reasoningEffort: validated.reasoningEffort,
      tools: validated.tools,
      toolContinuation: validated.toolContinuation,
    };
    let originalFailure: AdminAiError | undefined;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try { const result=await this.runAttempt({ ...base, model: originalModel }, request.callerFeature, attempt, false, originalModel, undefined);await this.options.observer?.success?.(result);return result; }
      catch (error) {
        originalFailure = this.normalize(error, requestId, request.modelRole, originalModel);
        if (!(adminAiRetryable(originalFailure.code) || adminAiOutputExhaustion(originalFailure)) || attempt === 2) break;
        await this.delay(retryDelayMs(originalFailure));
      }
    }
    const fallbackModel = this.options.config.fallbackModel;
    if (originalFailure && fallbackModel && fallbackModel !== originalModel && (adminAiFallbackEligible(originalFailure.code) || adminAiOutputExhaustion(originalFailure))) {
      try { const result=await this.runAttempt({ ...base, model: fallbackModel }, request.callerFeature, 1, true, originalModel, originalFailure.code);await this.options.observer?.success?.(result);return result; }
      catch (error) {
        const failure = this.normalize(error, requestId, request.modelRole, fallbackModel);
        failure.diagnostics.fallbackAttempted = true;
        await this.options.observer?.failure?.(failure);
        throw failure;
      }
    }
    const terminal=originalFailure ?? new AdminAiError("UNKNOWN_PROVIDER_ERROR", "Admin AI request failed.", { requestId, modelRole: request.modelRole, model: originalModel });await this.options.observer?.failure?.(terminal);throw terminal;
  }

  async probe(modelRole: "PRIMARY" | "ROUTINE") {
    return this.generate({ callerFeature: "provider-health-probe", modelRole, messages: [{ role: "user", content: "Reply with exactly: OK" }], maxOutputTokens: 16, temperature: 0 });
  }

  private async runAttempt(providerRequest: AdminAiProviderRequest, callerFeature: string, attempt: number, fallback: boolean, originalModel: string, originalFailure?: AdminAiGenerateResponse["originalFailure"]): Promise<AdminAiGenerateResponse> {
    const startedAt = Date.now();
    try {
      const result = await this.options.provider.generate(providerRequest);
      this.logger({ event: "admin_ai_request", requestId: providerRequest.requestId, callerFeature, provider: result.provider, modelRole: providerRequest.modelRole, model: providerRequest.model, attempt, fallback, outcome: "SUCCESS", latencyMs: result.latencyMs, usage: result.usage });
      return { ...result, requestId: providerRequest.requestId, requestedModelRole: providerRequest.modelRole, originalModel, fallbackUsed: fallback, originalFailure };
    } catch (error) {
      const failure = this.normalize(error, providerRequest.requestId, providerRequest.modelRole, providerRequest.model);
      this.logger({ event: "admin_ai_request", requestId: providerRequest.requestId, callerFeature, provider: this.options.provider.id, modelRole: providerRequest.modelRole, model: providerRequest.model, attempt, fallback, outcome: "ERROR", latencyMs: Date.now() - startedAt, errorCode: failure.code });
      throw failure;
    }
  }

  private normalize(error: unknown, requestId: string, modelRole: "PRIMARY" | "ROUTINE", model: string) {
    if (error instanceof AdminAiError) {
      error.diagnostics = { requestId, modelRole, model, ...error.diagnostics };
      return error;
    }
    return new AdminAiError("UNKNOWN_PROVIDER_ERROR", "Admin AI provider failed unexpectedly.", { requestId, modelRole, model });
  }
}

export const ADMIN_AI_MODEL_ROLES = ["PRIMARY", "ROUTINE"] as const;
export type AdminAiModelRole = (typeof ADMIN_AI_MODEL_ROLES)[number];
export type AdminAiProviderId = "digitalocean";
export type AdminAiErrorCode = "DISABLED" | "CONFIGURATION_ERROR" | "AUTHENTICATION_ERROR" | "RATE_LIMITED" | "TIMEOUT" | "PROVIDER_UNAVAILABLE" | "MODEL_UNAVAILABLE" | "INVALID_REQUEST" | "INVALID_RESPONSE" | "UNKNOWN_PROVIDER_ERROR";
export type AdminAiMessage = { role: "user" | "assistant"; content: string };
export type AdminAiUsage = { inputTokens?: number; outputTokens?: number; totalTokens?: number; reasoningTokens?: number; cost?: { amount: number; currency: string } };
export type AdminAiReasoningEffort = "LOW";
export type AdminAiToolDefinition = { name: string; description: string; inputSchema: Record<string, unknown> };
export type AdminAiToolCall = { id: string; name: string; input: Record<string, unknown> };
export type AdminAiToolContinuation = { call: AdminAiToolCall; result: Record<string, unknown> };

export interface AdminAiGenerateRequest {
  requestId?: string;
  modelRole: AdminAiModelRole;
  messages: AdminAiMessage[];
  contextBlocks?: { label: string; content: string }[];
  callerFeature: string;
  metadata?: Record<string, string | number | boolean>;
  temperature?: number;
  maxOutputTokens?: number;
  outputFormat?: "TEXT" | "JSON_OBJECT";
  timeoutMs?: number;
  reasoningEffort?: AdminAiReasoningEffort;
  tools?: AdminAiToolDefinition[];
  toolContinuation?: AdminAiToolContinuation;
}

export interface AdminAiProviderRequest {
  requestId: string;
  modelRole: AdminAiModelRole;
  model: string;
  systemInstruction: string;
  messages: AdminAiMessage[];
  contextBlocks: { label: string; content: string }[];
  temperature: number;
  maxOutputTokens: number;
  outputFormat: "TEXT" | "JSON_OBJECT";
  timeoutMs: number;
  reasoningEffort?: AdminAiReasoningEffort;
  tools?: AdminAiToolDefinition[];
  toolContinuation?: AdminAiToolContinuation;
}

export interface AdminAiProviderResponse {
  text: string;
  provider: AdminAiProviderId;
  model: string;
  finishReason?: string;
  providerRequestId?: string;
  usage?: AdminAiUsage;
  latencyMs: number;
  toolCalls?: AdminAiToolCall[];
}

export interface AdminAiGenerateResponse extends AdminAiProviderResponse {
  requestId: string;
  requestedModelRole: AdminAiModelRole;
  originalModel: string;
  fallbackUsed: boolean;
  originalFailure?: AdminAiErrorCode;
}

export interface AdminAiProvider {
  readonly id: AdminAiProviderId;
  generate(request: AdminAiProviderRequest): Promise<AdminAiProviderResponse>;
}

export interface AdminAiHealth {
  status: "DISABLED" | "CONFIGURED" | "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "CONFIG_ERROR";
  enabled: boolean;
  provider?: AdminAiProviderId;
  primaryConfigured: boolean;
  routineConfigured: boolean;
  fallbackConfigured: boolean;
  checkedAt: string;
  detail?: string;
}

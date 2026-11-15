import type { AdminAiErrorCode, AdminAiModelRole } from "./types.js";

export class AdminAiError extends Error {
  constructor(
    public code: AdminAiErrorCode,
    message: string,
    public diagnostics: {
      requestId?: string;
      modelRole?: AdminAiModelRole;
      model?: string;
      providerRequestId?: string;
      fallbackAttempted?: boolean;
      finishReason?: string;
      reasoningPresent?: boolean;
      reasoningLength?: number;
      contentLength?: number;
      outputLimitReached?: boolean;
      outputTokens?: number;
      httpStatus?: number;
      contentType?: string;
      providerErrorType?: string;
      providerErrorCode?: string;
      providerErrorMessage?: string;
      retryAfterMs?: number;
      rateLimitLimit?: string;
      rateLimitRemaining?: string;
      rateLimitReset?: string;
    } = {},
  ) { super(message); }
}

export const adminAiRetryable = (code: AdminAiErrorCode) => ["RATE_LIMITED", "TIMEOUT", "PROVIDER_UNAVAILABLE", "MODEL_UNAVAILABLE"].includes(code);
export const adminAiFallbackEligible = adminAiRetryable;

export const adminAiOutputExhaustion = (error: AdminAiError) =>
  error.code === "INVALID_RESPONSE"
  && error.diagnostics.outputLimitReached === true
  && error.diagnostics.reasoningPresent === true
  && error.diagnostics.contentLength === 0;

export function adminAiSafeHttpError(error: AdminAiError) {
  switch (error.code) {
    case "RATE_LIMITED": return { status: 429, message: "Admin AI is temporarily busy. Try again shortly." };
    case "TIMEOUT": return { status: 504, message: "Admin AI did not complete the response in time. Retry the message." };
    case "INVALID_RESPONSE": return { status: 502, message: "Admin AI could not complete this response. Retry the message." };
    case "AUTHENTICATION_ERROR":
    case "CONFIGURATION_ERROR":
    case "MODEL_UNAVAILABLE":
    case "PROVIDER_UNAVAILABLE":
    case "UNKNOWN_PROVIDER_ERROR": return { status: 503, message: "Admin AI provider is temporarily unavailable. Try again." };
    case "DISABLED": return { status: 503, message: "Admin AI is currently disabled." };
    case "INVALID_REQUEST": return { status: 400, message: "The Admin AI request is invalid." };
  }
}

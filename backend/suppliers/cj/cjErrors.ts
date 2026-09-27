export type CjErrorCode =
  | "CJ_NOT_CONFIGURED"
  | "CJ_AUTH_FAILED"
  | "CJ_TOKEN_REFRESH_FAILED"
  | "CJ_RATE_LIMITED"
  | "CJ_PRODUCT_NOT_FOUND"
  | "CJ_VARIANT_REQUIRED"
  | "CJ_TECH_POLICY_UNAVAILABLE"
  | "CJ_API_UNAVAILABLE"
  | "CJ_INVALID_RESPONSE";

export class CjApiError extends Error {
  constructor(
    public code: CjErrorCode,
    message: string,
    public requestId?: string,
  ) {
    super(message);
  }
}

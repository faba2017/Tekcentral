import { CjApiError } from "./cjErrors.js";
import { CjAuthService } from "./cjAuthService.js";
import { CJ_API_BASE_URL, type CjApiEnvelope } from "./cjTypes.js";

type FetchLike = typeof fetch;

export class CjClient {
  private lastRequestAt = 0;

  constructor(
    private authService = new CjAuthService(),
    private fetcher: FetchLike = fetch,
    private timeoutMs = 10_000,
  ) {}

  async request<T>(path: string, options: { method?: "GET" | "POST"; query?: Record<string, string | number | undefined>; body?: unknown } = {}) {
    await this.throttle();
    const accessToken = await this.authService.getAccessToken();
    const url = new URL(`${CJ_API_BASE_URL}${path}`);
    Object.entries(options.query ?? {}).forEach(([key, value]) => {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(url, {
        method: options.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          "CJ-Access-Token": accessToken,
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => ({}))) as CjApiEnvelope<T>;
      if (response.status === 429) throw new CjApiError("CJ_RATE_LIMITED", "CJ API rate limit reached.", payload.requestId);
      if (!response.ok) throw new CjApiError("CJ_API_UNAVAILABLE", payload.message || "CJ API unavailable.", payload.requestId);
      if (payload.result === false || payload.success === false) {
        const code = payload.code === 1600001 || payload.code === 1600002 ? "CJ_AUTH_FAILED" : "CJ_INVALID_RESPONSE";
        throw new CjApiError(code, payload.message || "CJ API returned an error.", payload.requestId);
      }
      await this.authService.markSuccessfulRequest();
      return payload;
    } catch (error) {
      if (error instanceof CjApiError) {
        await this.authService.markError(error.message);
        throw error;
      }
      await this.authService.markError("CJ API unavailable.");
      throw new CjApiError("CJ_API_UNAVAILABLE", "CJ API unavailable.");
    } finally {
      clearTimeout(timeout);
    }
  }

  private async throttle() {
    const waitMs = 1_000 - (Date.now() - this.lastRequestAt);
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.lastRequestAt = Date.now();
  }
}

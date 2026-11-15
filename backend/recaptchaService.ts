export type RecaptchaAction = "contact_submit" | "account_register" | "password_reset_request";
export type RecaptchaFailureReason = "MISSING_TOKEN" | "NOT_CONFIGURED" | "INVALID_TOKEN" | "ACTION_MISMATCH" | "LOW_SCORE" | "HOSTNAME_MISMATCH" | "EXPIRED_TOKEN" | "VERIFICATION_UNAVAILABLE";

interface GoogleRecaptchaResponse {
  success?: boolean;
  score?: number;
  action?: string;
  challenge_ts?: string;
  hostname?: string;
}

export class RecaptchaError extends Error {
  constructor(public readonly reason: RecaptchaFailureReason, public readonly status: number, message: string) { super(message); }
}

const counters = new Map<string, number>();
const record = (key: string) => counters.set(key, (counters.get(key) ?? 0) + 1);
export const getRecaptchaMetrics = () => Object.fromEntries(counters);

export function recaptchaConfig() {
  const configuredThreshold = process.env.RECAPTCHA_MIN_SCORE?.trim();
  const threshold = Number(configuredThreshold ?? "0.5");
  return {
    secret: process.env.RECAPTCHA_SECRET_KEY?.trim(),
    threshold: Number.isFinite(threshold) && threshold >= 0 && threshold <= 1 ? threshold : 0.5,
    thresholdConfigured: Boolean(configuredThreshold),
    allowedHostnames: (process.env.RECAPTCHA_ALLOWED_HOSTNAMES ?? "tekcentral.co.za,www.tekcentral.co.za").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean),
    testBypass: process.env.NODE_ENV !== "production" && process.env.RECAPTCHA_TEST_BYPASS === "true",
  };
}

export async function verifyRecaptcha(input: { token?: string; action: RecaptchaAction; remoteIp?: string }, dependencies: { fetchImpl?: typeof fetch; now?: Date } = {}) {
  const config = recaptchaConfig();
  if (config.testBypass) { record("BYPASSED"); return { score: 1, hostname: "test" }; }
  if (!input.token?.trim()) { record("MISSING_TOKEN"); throw new RecaptchaError("MISSING_TOKEN", 400, "Please verify that you are not an automated request and try again."); }
  if (!config.secret || (process.env.NODE_ENV === "production" && !config.thresholdConfigured)) { record("NOT_CONFIGURED"); throw new RecaptchaError("NOT_CONFIGURED", 503, "Verification is temporarily unavailable. Please try again shortly."); }
  const body = new URLSearchParams({ secret: config.secret, response: input.token.trim() });
  if (input.remoteIp) body.set("remoteip", input.remoteIp);
  let response: Response;
  try {
    response = await (dependencies.fetchImpl ?? fetch)("https://www.google.com/recaptcha/api/siteverify", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(5_000) });
  } catch {
    record("VERIFICATION_UNAVAILABLE"); throw new RecaptchaError("VERIFICATION_UNAVAILABLE", 503, "Verification is temporarily unavailable. Please try again shortly.");
  }
  if (!response.ok) { record("VERIFICATION_UNAVAILABLE"); throw new RecaptchaError("VERIFICATION_UNAVAILABLE", 503, "Verification is temporarily unavailable. Please try again shortly."); }
  const result = await response.json() as GoogleRecaptchaResponse;
  if (!result.success) { record("INVALID_TOKEN"); throw new RecaptchaError("INVALID_TOKEN", 400, "Verification failed. Please try again."); }
  if (result.action !== input.action) { record("ACTION_MISMATCH"); throw new RecaptchaError("ACTION_MISMATCH", 400, "Verification failed. Please try again."); }
  if (typeof result.score !== "number" || result.score < config.threshold) { record("LOW_SCORE"); throw new RecaptchaError("LOW_SCORE", 400, "Verification failed. Please try again."); }
  const challengeAt = Date.parse(result.challenge_ts ?? "");
  if (!Number.isFinite(challengeAt) || (dependencies.now ?? new Date()).getTime() - challengeAt > 2 * 60_000) { record("EXPIRED_TOKEN"); throw new RecaptchaError("EXPIRED_TOKEN", 400, "Verification expired. Please try again."); }
  if (process.env.NODE_ENV === "production" && (!result.hostname || !config.allowedHostnames.includes(result.hostname.toLowerCase()))) { record("HOSTNAME_MISMATCH"); throw new RecaptchaError("HOSTNAME_MISMATCH", 400, "Verification failed. Please try again."); }
  record("VERIFIED"); return { score: result.score, hostname: result.hostname };
}

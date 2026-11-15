import { fetchSyntechFeed, SyntechFeedError, syntechConfiguration } from "./syntechCatalogueAdapter.js";
import { getSyntechStatus, recordSyntechRequest, saveSyntechSyncRun, setSyntechRateLimit, syncSyntechProducts } from "./syntechCatalogueRepository.js";
import type { SyntechSyncRun, SyntechSyncType } from "./syntechTypes.js";
import { loadPersistenceConfig } from "../../persistence/config.js";
import { withDistributedLock } from "../../persistence/postgres.js";

let active: Promise<unknown> | undefined;
export const SYNTECH_SCHEDULER_LOCK = "job:syntech-scheduler";

export type SyntechSyncBlockReason = "NOT_CONFIGURED" | "SYNC_IN_PROGRESS" | "RATE_LIMITED" | "ACCOUNT_BLOCKED";

export async function getSyntechSyncReadiness(now = new Date()) {
  const configuration = syntechConfiguration();
  const status = await getSyntechStatus();
  const currentHour = now.toISOString().slice(0, 13);
  const requestsUsed = status.budget?.hourKey === currentHour ? status.budget.requests : 0;
  const rateLimitedUntil = status.budget?.rateLimitedUntil && Date.parse(status.budget.rateLimitedUntil) > now.getTime()
    ? status.budget.rateLimitedUntil
    : undefined;
  const blockReason: SyntechSyncBlockReason | undefined = !configuration.enabled || !configuration.configured
    ? "NOT_CONFIGURED"
    : active
    ? "SYNC_IN_PROGRESS"
    : status.budget?.blocked
    ? "ACCOUNT_BLOCKED"
    : rateLimitedUntil || requestsUsed >= 5
    ? "RATE_LIMITED"
    : undefined;
  return {
    configured: configuration.enabled && configuration.configured,
    syncInProgress: Boolean(active),
    canRunFullSync: !blockReason,
    blockReason,
    requestBudget: {
      limit: 5,
      used: requestsUsed,
      remaining: Math.max(0, 5 - requestsUsed),
      rateLimitedUntil,
      accountBlocked: Boolean(status.budget?.blocked),
    },
  };
}

export function syntechSyncErrorCode(error: unknown) {
  if (error instanceof SyntechFeedError) return error.code;
  if (error instanceof Error && error.message === "SYNTECH_SYNC_IN_PROGRESS") return "SYNC_IN_PROGRESS";
  if (error instanceof Error && (error.message === "SYNTECH_RATE_LIMITED" || error.message === "SYNTECH_REQUEST_BUDGET_EXHAUSTED")) return "RATE_LIMITED";
  if (error instanceof Error && error.message === "SYNTECH_ACCOUNT_BLOCKED") return "ACCOUNT_BLOCKED";
  return "UNAVAILABLE";
}

function normalizeSyntechSyncError(error: unknown) {
  if (error instanceof SyntechFeedError) return error;
  if (error instanceof Error && (error.message === "SYNTECH_RATE_LIMITED" || error.message === "SYNTECH_REQUEST_BUDGET_EXHAUSTED")) return new SyntechFeedError("RATE_LIMITED", "Syntech feed request limit reached.");
  if (error instanceof Error && error.message === "SYNTECH_ACCOUNT_BLOCKED") return new SyntechFeedError("ACCOUNT_BLOCKED", "Syntech account key is blocked; contact the Syntech account manager.");
  return undefined;
}

export async function runSyntechSync(type: SyntechSyncType, options: { mutate?: boolean; fetchImpl?: typeof fetch } = {}) {
  if (active) throw new Error("SYNTECH_SYNC_IN_PROGRESS");
  const execute = async () => {
    const started = new Date();
    try {
      const configuration = syntechConfiguration();
      if (!configuration.enabled || !configuration.configured) throw new SyntechFeedError("NOT_CONFIGURED", "Syntech feed is not configured.");
      await recordSyntechRequest(started);
      const parsed = await fetchSyntechFeed(type === "TEST" ? "UPDATE" : type, options.fetchImpl);
      const result = options.mutate === false || type === "TEST" ? { createdCount: 0, updatedCount: 0, missingCount: 0, productCount: (await getSyntechStatus()).productCount } : await syncSyntechProducts(parsed);
      const completedAt = new Date().toISOString();
      const run: SyntechSyncRun = { id: `syntech-sync-${Date.now()}`, syncType: type, startedAt: started.toISOString(), completedAt, status: "SUCCESS", expectedCount: parsed.expectedCount, parsedCount: parsed.parsedCount, ...result, durationMs: Date.parse(completedAt) - started.getTime(), warningCount: 0 };
      await saveSyntechSyncRun(run);
      return { run, parsed: { expectedCount: parsed.expectedCount, parsedCount: parsed.parsedCount, currency: parsed.currency } };
    } catch (error) {
      const feedError = normalizeSyntechSyncError(error);
      if (feedError?.code === "RATE_LIMITED") await setSyntechRateLimit("RATE_LIMITED");
      if (feedError?.code === "ACCOUNT_BLOCKED") await setSyntechRateLimit("ACCOUNT_BLOCKED");
      const completedAt = new Date().toISOString();
      const run: SyntechSyncRun = { id: `syntech-sync-${Date.now()}`, syncType: type, startedAt: started.toISOString(), completedAt, status: feedError?.code === "RATE_LIMITED" ? "RATE_LIMITED" : feedError?.code === "ACCOUNT_BLOCKED" ? "BLOCKED" : feedError?.code === "INVALID_FEED" ? "INVALID" : "FAILED", httpStatus: feedError?.httpStatus, expectedCount: feedError?.diagnostics?.expectedCount, parsedCount: feedError?.diagnostics?.parsedCount, failureStage: feedError?.diagnostics?.stage, failureRowIndex: feedError?.diagnostics?.rowIndex, duplicateCount: feedError?.diagnostics?.duplicateCount, observedFields: feedError?.diagnostics?.observedFields, createdCount: 0, updatedCount: 0, missingCount: 0, durationMs: Date.parse(completedAt) - started.getTime(), warningCount: 0, errorSummary: feedError?.code === "ACCOUNT_BLOCKED" ? "Syntech account key is blocked; contact the Syntech account manager." : feedError?.message ?? (error instanceof Error ? error.message : "Syntech sync failed."), rateLimitState: feedError?.code };
      await saveSyntechSyncRun(run);
      throw error;
    }
  };
  const operation = (loadPersistenceConfig().provider === "POSTGRES" ? withDistributedLock(SYNTECH_SCHEDULER_LOCK, execute).then((locked) => {
    if (!locked.acquired) throw new Error("SYNTECH_SYNC_IN_PROGRESS");
    return locked.value;
  }) : execute()).finally(() => { active = undefined; });
  active = operation;
  return operation;
}

export function startSyntechScheduler(options: { enabled?: boolean; appRole?: string } = {}) {
  const roleEligible = (options.appRole ?? process.env.APP_ROLE) === "worker";
  const enabled = roleEligible && (options.enabled ?? process.env.SYNTECH_ENABLED === "true") && (process.env.NODE_ENV !== "test" || options.enabled !== undefined);
  if (!enabled) return { enabled: false, stop: () => undefined };
  const updateHours = Math.max(1, Number(process.env.SYNTECH_UPDATE_SYNC_INTERVAL_HOURS ?? 1));
  const fullHours = Math.max(12, Number(process.env.SYNTECH_FULL_SYNC_INTERVAL_HOURS ?? 24));
  let lastUpdate = 0; let lastFull = 0;
  let stopped = false;
  const timer = setInterval(() => {
    if (stopped) return;
    const now = new Date();
    if (now.getMinutes() === 17 && now.getTime() - lastUpdate >= updateHours * 3_600_000) { lastUpdate = now.getTime(); void runSyntechSync("UPDATE").catch(() => undefined); }
    if (now.getUTCHours() === 1 && now.getMinutes() === 37 && now.getTime() - lastFull >= fullHours * 3_600_000) { lastFull = now.getTime(); void runSyntechSync("FULL").catch(() => undefined); }
  }, 60_000);
  timer.unref();
  return { enabled: true, stop: () => { stopped = true; clearInterval(timer); } };
}

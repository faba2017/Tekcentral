import { getBusinessSettings, getEffectiveNotificationSettings } from "./businessSettingsRepository.js";
import { getFxImpactDashboard, reconcileForeignCurrencyPricingImpact } from "./fxImpactService.js";
import { getFxRate, refreshFxRate, type FxRateProvider } from "./fxRateService.js";
import { getLastFxReconciliationRun, saveFxReconciliationRun, type FxReconciliationRunSummary } from "./fxReconciliationRunRepository.js";
import { listPricingProposals } from "./pricingProposalRepository.js";
import { bestEffortResolve } from "./operationalAlertService.js";
import { loadPersistenceConfig } from "./persistence/config.js";
import { withDistributedLock } from "./persistence/postgres.js";

export interface FxPair { sourceCurrency: string; targetCurrency: "ZAR"; }
export const FX_SCHEDULER_LOCK = "job:fx-scheduler";
export async function discoverRequiredFxPairs(): Promise<FxPair[]> {
  const keys = new Set((await listPricingProposals()).filter((proposal) => proposal.status !== "REJECTED" && proposal.status !== "SUPERSEDED" && proposal.costSnapshot.sourceCurrency && proposal.costSnapshot.sourceCurrency !== "ZAR" && proposal.costSnapshot.sourceCostAmount !== undefined).map((proposal) => `${proposal.costSnapshot.sourceCurrency}/ZAR`));
  return [...keys].sort().map((key) => ({ sourceCurrency: key.split("/")[0], targetCurrency: "ZAR" }));
}
let activeRun: Promise<FxReconciliationRunSummary> | undefined;
export function isFxReconciliationRunning() { return Boolean(activeRun); }
export function runFxPricingReconciliation(input: { trigger: "SCHEDULED" | "MANUAL"; provider?: FxRateProvider; now?: Date } = { trigger: "MANUAL" }) {
  if (activeRun) return activeRun;
  activeRun = (loadPersistenceConfig().provider === "POSTGRES" ? withDistributedLock(FX_SCHEDULER_LOCK, () => execute(input)).then((locked) => {
    if (!locked.acquired) throw new Error("FX_RECONCILIATION_IN_PROGRESS");
    return locked.value;
  }) : execute(input)).finally(() => { activeRun = undefined; });
  return activeRun;
}
async function execute(input: { trigger: "SCHEDULED" | "MANUAL"; provider?: FxRateProvider; now?: Date }) {
  const startedAt = (input.now ?? new Date()).toISOString(); const settings = (await getBusinessSettings()).pricing; const pairs = await discoverRequiredFxPairs();
  const totals = { ratesRefreshed: 0, ratesReused: 0, offersEvaluated: 0, proposalsGenerated: 0, attentionCreated: 0 }; const errors: FxReconciliationRunSummary["errors"] = [];
  if (!settings.fxImpactMonitoringEnabled || !settings.fxScheduledReconciliationEnabled && input.trigger === "SCHEDULED") {
    return saveFxReconciliationRun({ id: `fx-run-${Date.now()}`, trigger: input.trigger, startedAt, completedAt: new Date().toISOString(), status: "SKIPPED", pairsEvaluated: 0, ...totals, ignore: 0, monitor: 0, review: 0, critical: 0, errors: [] });
  }
  for (const pair of pairs) {
    try {
      let current = await getFxRate(pair.sourceCurrency, pair.targetCurrency, input.now);
      if (current.status !== "FRESH" || !current.quote) { const quote = await refreshFxRate(pair.sourceCurrency, pair.targetCurrency, input.provider); current = { ...current, quote, status: "FRESH" }; totals.ratesRefreshed += 1; }
      else totals.ratesReused += 1;
      const result = await reconcileForeignCurrencyPricingImpact(current.quote); totals.offersEvaluated += result.evaluated; totals.proposalsGenerated += result.generated; totals.attentionCreated += result.notifications;
    } catch (error) { errors.push({ pair: `${pair.sourceCurrency}/${pair.targetCurrency}`, message: error instanceof Error ? error.message : "FX reconciliation failed." }); }
  }
  const dashboard = await getFxImpactDashboard(); const completedAt = new Date().toISOString();
  if (dashboard.metrics.review === 0 && dashboard.metrics.critical === 0) await bestEffortResolve({ type: "CJ_COST_MOVEMENT_REQUIRES_REVIEW", subsystem: "PRICING", diagnosticCode: "FX_COST_MOVEMENT_ACTIONABLE" });
  return saveFxReconciliationRun({ id: `fx-run-${Date.now()}`, trigger: input.trigger, startedAt, completedAt, status: errors.length === 0 ? "SUCCESS" : errors.length < pairs.length ? "PARTIAL" : "FAILED", pairsEvaluated: pairs.length, ...totals, ignore: dashboard.metrics.healthy, monitor: dashboard.metrics.monitor, review: dashboard.metrics.review, critical: dashboard.metrics.critical, errors });
}
export async function getFxPricingAttention() {
  const [dashboard, proposals, lastRun, notifications] = await Promise.all([getFxImpactDashboard(), listPricingProposals(), getLastFxReconciliationRun(), getEffectiveNotificationSettings()]);
  const productIds = notifications.notifications.fxPricingInAppEnabled ? deriveFxPricingAttentionProductIds(dashboard.impacts, proposals) : [];
  return { count: productIds.length, productIds, lastRun, running: isFxReconciliationRunning() };
}
function deriveFxPricingAttentionProductIds(impacts: Awaited<ReturnType<typeof getFxImpactDashboard>>["impacts"], proposals: Awaited<ReturnType<typeof listPricingProposals>>) {
  const statusById = new Map(proposals.map((proposal) => [proposal.id, proposal.status]));
  const productIds = new Set(impacts.filter((impact) => (impact.classification === "REVIEW" || impact.classification === "CRITICAL") && (!impact.proposalId || ["DRAFT", "PENDING_APPROVAL"].includes(statusById.get(impact.proposalId) ?? ""))).map((impact) => impact.productId));
  return [...productIds];
}
export function deriveFxPricingAttentionCount(impacts: Parameters<typeof deriveFxPricingAttentionProductIds>[0], proposals: Parameters<typeof deriveFxPricingAttentionProductIds>[1]) { return deriveFxPricingAttentionProductIds(impacts, proposals).length; }
export function startFxReconciliationScheduler(options?: { enabled?: boolean; runImmediately?: boolean; appRole?: string }) {
  const roleEligible = (options?.appRole ?? process.env.APP_ROLE) === "worker";
  const enabled = roleEligible && (options?.enabled ?? (process.env.NODE_ENV === "production" || process.env.FX_SCHEDULER_ENABLED === "true"));
  if (!enabled) return { enabled: false, stop: () => undefined };
  let timer: NodeJS.Timeout | undefined; let stopped = false;
  const schedule = async () => { if (stopped) return; const hours = (await getBusinessSettings()).pricing.fxScheduledReconciliationHours; if (stopped) return; timer = setTimeout(async () => { await runFxPricingReconciliation({ trigger: "SCHEDULED" }).catch(() => undefined); await schedule(); }, hours * 3_600_000); timer.unref(); };
  if (options?.runImmediately ?? true) void runFxPricingReconciliation({ trigger: "SCHEDULED" }).catch(() => undefined);
  void schedule();
  return { enabled: true, stop: () => { stopped = true; if (timer) clearTimeout(timer); } };
}

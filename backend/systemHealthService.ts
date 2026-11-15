import { getBusinessSettings } from "./businessSettingsRepository.js";
import { getFxRate } from "./fxRateService.js";
import { getCjConnectionStatus } from "./suppliers/cj/cjCatalogueAdapter.js";
import { getScoopCatalogueSyncStatus } from "./suppliers/scoop/scoopCatalogueRepository.js";
import { getPayfastProfileStatus } from "./payments/paymentGateway.js";
import { getSyntechStatus } from "./suppliers/syntech/syntechCatalogueRepository.js";
import { syntechConfiguration } from "./suppliers/syntech/syntechCatalogueAdapter.js";
import { zeusUsageGuard } from "./zeus/usageGuard.js";
import { getCartTelemetry } from "./cartService.js";
import { listPublicProducts } from "./productPublicationRepository.js";
import { operationalAlertSummary } from "./operationalAlertService.js";

export type SystemHealthStatus = "HEALTHY" | "DEGRADED" | "FAILED" | "UNKNOWN";
export interface SystemHealthCheck { service: string; status: SystemHealthStatus; checkedAt: string; summary: string; details?: Record<string, string | number | boolean>; }

export async function getSystemHealth() {
  const checkedAt = new Date().toISOString();
  const checks: SystemHealthCheck[] = [];
  try { await getBusinessSettings(); checks.push({ service: "Backend persistence", status: "HEALTHY", checkedAt, summary: "Settings storage is readable." }); }
  catch { checks.push({ service: "Backend persistence", status: "FAILED", checkedAt, summary: "Settings storage could not be read." }); }
  try { const products = await listPublicProducts(); const purchasable = products.filter((item) => item.availability.purchasable).length; checks.push({ service: "Storefront catalogue", status: products.length && purchasable ? "HEALTHY" : products.length ? "DEGRADED" : "UNKNOWN", checkedAt, summary: purchasable ? "Published purchasable Products are available." : products.length ? "No published Product is currently purchasable." : "No published Products are available.", details: { publishedProducts: products.length, purchasableProducts: purchasable, checkRequired: products.filter((item) => item.availability.state === "CHECK_REQUIRED").length, outOfStock: products.filter((item) => item.availability.state === "OUT_OF_STOCK").length, availabilityUnknown: products.filter((item) => item.availability.state === "AVAILABILITY_UNKNOWN").length } }); }
  catch { checks.push({ service: "Storefront catalogue", status: "DEGRADED", checkedAt, summary: "Published Product availability could not be evaluated." }); }
  try {
    const cj = await getCjConnectionStatus();
    checks.push({ service: "CJ API", status: cj.authenticated ? "HEALTHY" : cj.configured ? "DEGRADED" : "UNKNOWN", checkedAt, summary: cj.authenticated ? "Authenticated session available." : cj.configured ? "Configured but not currently authenticated." : "Not configured.", details: { configured: cj.configured, authenticated: cj.authenticated } });
  } catch { checks.push({ service: "CJ API", status: "DEGRADED", checkedAt, summary: "Current CJ status could not be read." }); }
  try {
    const scoop = await getScoopCatalogueSyncStatus();
    checks.push({ service: "Scoop feed", status: scoop.productCount > 0 ? "HEALTHY" : "UNKNOWN", checkedAt, summary: scoop.productCount > 0 ? "Stored catalogue observations are available." : "No stored catalogue observations are available.", details: { productCount: scoop.productCount, staleCount: scoop.staleCount } });
  } catch { checks.push({ service: "Scoop feed", status: "DEGRADED", checkedAt, summary: "Stored Scoop status could not be read." }); }
  try { const configuration = syntechConfiguration(); const syntech = await getSyntechStatus(); const latest = syntech.syncHistory[0]; const successful = syntech.syncHistory.find((item) => item.status === "SUCCESS"); const fresh = Boolean(successful && Date.now() - Date.parse(successful.completedAt) < 26 * 60 * 60 * 1000); const status: SystemHealthStatus = !configuration.configured ? "UNKNOWN" : latest?.status === "BLOCKED" || latest?.status === "FAILED" || latest?.status === "INVALID" ? "FAILED" : fresh ? "HEALTHY" : syntech.productCount ? "DEGRADED" : "UNKNOWN"; checks.push({ service: "Syntech feed", status, checkedAt, summary: !configuration.configured ? "Syntech feeds are not configured." : latest?.status === "BLOCKED" ? "Syntech account key is blocked; contact the account manager." : fresh ? "Recent valid Syntech feed data is available." : syntech.productCount ? "Stored Syntech feed data is stale." : "No successful Syntech feed sync is recorded.", details: { configured: configuration.configured, productCount: syntech.productCount, activeCount: syntech.activeCount } }); } catch { checks.push({ service: "Syntech feed", status: "DEGRADED", checkedAt, summary: "Stored Syntech status could not be read." }); }
  for (const mode of ["SANDBOX", "LIVE"] as const) { const profile = getPayfastProfileStatus(mode); checks.push({ service: `PayFast ${mode === "SANDBOX" ? "Sandbox" : "Live"}`, status: "UNKNOWN", checkedAt, summary: profile.configured ? "Configured; no provider connection test was performed." : "Not configured.", details: { configured: profile.configured, mode } }); }
  const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD); checks.push({ service: "SMTP", status: "UNKNOWN", checkedAt, summary: smtpConfigured ? "Configured; no live health check was performed." : "Not configured.", details: { configured: smtpConfigured } });
  try { const fx = await getFxRate("USD", "ZAR"); checks.push({ service: "FX provider", status: fx.status === "FRESH" ? "HEALTHY" : fx.status === "STALE" ? "DEGRADED" : "UNKNOWN", checkedAt, summary: fx.status === "FRESH" ? "A fresh stored USD/ZAR quote is available." : fx.status === "STALE" ? "The stored USD/ZAR quote is stale." : "No current USD/ZAR quote is available." }); }
  catch { checks.push({ service: "FX provider", status: "DEGRADED", checkedAt, summary: "Stored FX status could not be read." }); }
  try { const usage = await zeusUsageGuard.summary(); checks.push({ service: "Zeus usage guard", status: usage.circuitBreakerOpen ? "DEGRADED" : "HEALTHY", checkedAt, summary: usage.circuitBreakerOpen ? "The temporary provider circuit breaker is active." : "Usage and cost guardrails are operating normally.", details: usage }); }
  catch { checks.push({ service: "Zeus usage guard", status: "DEGRADED", checkedAt, summary: "Aggregate Zeus usage status could not be read." }); }
  try { checks.push({ service: "Zeus cart actions", status: "HEALTHY", checkedAt, summary: "Aggregate conversational cart counters are available.", details: await getCartTelemetry() }); }
  catch { checks.push({ service: "Zeus cart actions", status: "DEGRADED", checkedAt, summary: "Aggregate cart action counters could not be read." }); }
  try { const alerts = await operationalAlertSummary(); checks.push({ service: "Operational alerts", status: alerts.critical ? "FAILED" : alerts.warning ? "DEGRADED" : "HEALTHY", checkedAt, summary: alerts.critical ? `${alerts.critical} critical operational issue(s) require attention.` : alerts.warning ? `${alerts.warning} operational warning(s) require attention.` : "No active operational incidents are recorded.", details: { critical: alerts.critical, warning: alerts.warning } }); }
  catch { checks.push({ service: "Operational alerts", status: "DEGRADED", checkedAt, summary: "Operational alert state could not be read." }); }
  return { checkedAt, checks };
}

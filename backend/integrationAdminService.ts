import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getEffectiveNotificationSettings, getSettingsDomain } from "./businessSettingsRepository.js";
import { FrankfurterEcbFxProvider, getFxRate, type FxRateProvider } from "./fxRateService.js";
import { getSmtpConfigurationStatus, smtpMailTransport, verifySmtpConnection } from "./mailService.js";
import { getSystemHealth, type SystemHealthCheck, type SystemHealthStatus } from "./systemHealthService.js";
import { getCjConnectionStatus, testCjConnection } from "./suppliers/cj/cjCatalogueAdapter.js";
import { CJ_API_BASE_URL } from "./suppliers/cj/cjTypes.js";
import { fetchAndParseScoopPricelist } from "./suppliers/scoop/scoopCatalogueAdapter.js";
import { getScoopCatalogueSyncStatus } from "./suppliers/scoop/scoopCatalogueRepository.js";
import { SyntechFeedError, syntechConfiguration } from "./suppliers/syntech/syntechCatalogueAdapter.js";
import { getSyntechStatus } from "./suppliers/syntech/syntechCatalogueRepository.js";
import { runSyntechSync } from "./suppliers/syntech/syntechSyncService.js";
import { syntechResellerApiConfiguration } from "./suppliers/syntech/syntechOrderAdapter.js";

export type IntegrationId = "CJ" | "SCOOP" | "SYNTECH" | "SYNTECH_RESELLER" | "SMTP" | "FX";
export type IntegrationConfigurationStatus = "CONFIGURED" | "PARTIALLY_CONFIGURED" | "NOT_CONFIGURED" | "ENVIRONMENT_MANAGED";
export interface IntegrationTestResult { integration: IntegrationId; status: "PASSED" | "FAILED"; testedAt: string; summary: string; category?: string; details?: Record<string, string | number | boolean>; }
interface TestStore { version: 1; results: Partial<Record<IntegrationId, IntegrationTestResult>>; }

const storePath = () => resolve(process.cwd(), ".data", "integration-tests.json");
async function readStore(): Promise<TestStore> { try { const value = JSON.parse(await readFile(storePath(), "utf8")) as TestStore; return value.version === 1 ? value : { version: 1, results: {} }; } catch { return { version: 1, results: {} }; } }
async function saveResult(result: IntegrationTestResult) { const store = await readStore(); const target = storePath(); const temp = `${target}.tmp`; await mkdir(dirname(target), { recursive: true }); await writeFile(temp, JSON.stringify({ version: 1, results: { ...store.results, [result.integration]: result } }, null, 2)); await rename(temp, target); return result; }

function healthFor(checks: SystemHealthCheck[], service: string) { return checks.find((item) => item.service === service) ?? { service, status: "UNKNOWN" as SystemHealthStatus, checkedAt: new Date().toISOString(), summary: "Health has not been evaluated." }; }
function sanitizedCategory(error: unknown) {
  if (error instanceof SyntechFeedError) return error.code;
  const message = error instanceof Error ? error.message.toUpperCase() : "";
  if (message === "SYNTECH_ACCOUNT_BLOCKED") return "ACCOUNT_BLOCKED";
  if (message === "SYNTECH_RATE_LIMITED" || message === "SYNTECH_REQUEST_BUDGET_EXHAUSTED") return "RATE_LIMITED";
  if (/RATE|429/.test(message)) return "RATE_LIMITED";
  if (/AUTH|TOKEN|401|403/.test(message)) return "AUTHENTICATION_FAILED";
  if (/TIMEOUT|ABORT/.test(message)) return "TIMEOUT";
  if (/INVALID|MALFORMED|XML/.test(message)) return "INVALID_RESPONSE";
  if (/CONFIGURATION|NOT_CONFIGURED|MISSING/.test(message)) return "NOT_CONFIGURED";
  return "CONNECTION_FAILED";
}
function failureSummary(id: IntegrationId, category: string) {
  const name = id === "SCOOP" ? "Scoop feed" : id === "FX" ? "FX provider" : id;
  return category === "ACCOUNT_BLOCKED" ? `${name} account key is blocked; contact the supplier account manager.` : category === "AUTHENTICATION_FAILED" ? `${name} authentication failed.` : category === "RATE_LIMITED" ? `${name} is temporarily rate limited.` : category === "INVALID_FEED" ? `${name} returned an invalid feed.` : category === "UNAVAILABLE" ? `${name} is temporarily unavailable.` : category === "TIMEOUT" ? `${name} connection timed out.` : category === "INVALID_RESPONSE" ? `${name} returned an invalid response.` : category === "NOT_CONFIGURED" ? `${name} is not configured.` : `${name} connection failed.`;
}

export function deriveSyntechIntegrationState(configuration: ReturnType<typeof syntechConfiguration>, lastTest?: IntegrationTestResult) {
  return {
    configurationStatus: configuration.configured ? "CONFIGURED" as const : "NOT_CONFIGURED" as const,
    configuration: {
      enabled: configuration.enabled,
      configured: configuration.configured,
      fullConfigured: configuration.fullConfigured,
      updateConfigured: configuration.updateConfigured,
      format: configuration.format,
    },
    lastTest,
  };
}

export async function getIntegrationsAdminView() {
  const [settings, health, tests, cj, scoop, syntech, smtp, fx] = await Promise.all([
    getSettingsDomain("integrations"), getSystemHealth(), readStore(), getCjConnectionStatus(), getScoopCatalogueSyncStatus(), getSyntechStatus(), Promise.resolve(getSmtpConfigurationStatus()), getFxRate("USD", "ZAR"),
  ]);
  const fields = (group: string) => settings.settings.filter((item) => item.group === group);
  const syntechConfigurationState = deriveSyntechIntegrationState(syntechConfiguration(), tests.results.SYNTECH);
  const reseller = syntechResellerApiConfiguration();
  return {
    revision: settings.revision,
    integrations: [
      { id: "CJ", name: "CJ", configurationStatus: cj.configured ? "ENVIRONMENT_MANAGED" : "NOT_CONFIGURED", health: healthFor(health.checks, "CJ API"), lastVerifiedAt: tests.results.CJ?.testedAt ?? cj.lastSuccessfulRequestAt, lastActivityAt: cj.lastSuccessfulRequestAt, summary: "CJ catalogue, stock and logistics API.", fields: fields("CJ"), lastTest: tests.results.CJ, actions: ["TEST", "OPEN_SUPPLIER_HUB"] },
      { id: "SCOOP", name: "Scoop Feed", configurationStatus: "CONFIGURED", health: healthFor(health.checks, "Scoop feed"), lastVerifiedAt: tests.results.SCOOP?.testedAt, lastActivityAt: scoop.lastSync?.lastSyncedAt, summary: "Scoop production XML catalogue feed.", fields: fields("Scoop Feed"), lastTest: tests.results.SCOOP, operational: { productCount: scoop.productCount, staleCount: scoop.staleCount, lastSync: scoop.lastSync }, actions: ["TEST", "REFRESH", "OPEN_SUPPLIER_HUB"] },
      { id: "SYNTECH", name: "Syntech Feed", ...syntechConfigurationState, health: healthFor(health.checks, "Syntech feed"), lastVerifiedAt: tests.results.SYNTECH?.testedAt, lastActivityAt: syntech.syncHistory[0]?.completedAt, summary: "Syntech reseller JSON catalogue feeds.", fields: [], operational: { productCount: syntech.productCount, activeCount: syntech.activeCount }, actions: ["TEST", "REFRESH", "OPEN_SUPPLIER_HUB"] },
      { id: "SYNTECH_RESELLER", name: "Syntech Reseller API", configurationStatus: reseller.enabled && reseller.configured && reseller.environment === "UAT" ? "ENVIRONMENT_MANAGED" : reseller.configured ? "PARTIALLY_CONFIGURED" : "NOT_CONFIGURED", health: { service: "Syntech Reseller API", status: tests.results.SYNTECH_RESELLER?.status === "PASSED" ? "HEALTHY" : "UNKNOWN", checkedAt: tests.results.SYNTECH_RESELLER?.testedAt ?? new Date().toISOString(), summary: tests.results.SYNTECH_RESELLER?.summary ?? "Configuration has not been validated." }, lastVerifiedAt: tests.results.SYNTECH_RESELLER?.testedAt, summary: "Staff-controlled Syntech order creation. UAT only; production is disabled.", fields: [], lastTest: tests.results.SYNTECH_RESELLER, operational: { environment: reseller.environment, enabled: reseller.enabled, tokenConfigured: reseller.tokenConfigured, usernameConfigured: reseller.usernameConfigured, baseUrlConfigured: reseller.baseUrlConfigured, productionOperational: false }, actions: ["TEST", "OPEN_SUPPLIER_HUB"] },
      { id: "SMTP", name: "SMTP", configurationStatus: smtp.configured && smtp.credentialConfigured ? "ENVIRONMENT_MANAGED" : smtp.configured || smtp.credentialConfigured ? "PARTIALLY_CONFIGURED" : "NOT_CONFIGURED", health: healthFor(health.checks, "SMTP"), lastVerifiedAt: tests.results.SMTP?.testedAt, summary: "Internal operational email transport.", fields: fields("SMTP"), lastTest: tests.results.SMTP, actions: ["TEST"] },
      { id: "FX", name: "FX Provider", configurationStatus: "CONFIGURED", health: healthFor(health.checks, "FX provider"), lastVerifiedAt: tests.results.FX?.testedAt ?? fx.quote?.fetchedAt, lastActivityAt: fx.quote?.fetchedAt, summary: "Frankfurter / ECB foreign-exchange quotes.", fields: fields("FX Provider"), lastTest: tests.results.FX, operational: { pair: "USD/ZAR", rate: fx.quote?.rate, effectiveAt: fx.quote?.effectiveAt, fetchedAt: fx.quote?.fetchedAt, freshness: fx.status }, actions: ["TEST", "OPEN_FX"] },
    ],
  };
}

export async function testIntegration(id: IntegrationId, dependencies: {
  cjTest?: typeof testCjConnection;
  scoopTest?: typeof fetchAndParseScoopPricelist;
  smtpVerify?: typeof verifySmtpConnection;
  smtpSend?: typeof smtpMailTransport.send;
  fxProvider?: FxRateProvider;
  smtpRecipient?: string;
  syntechTest?: typeof runSyntechSync;
  syntechFetchImpl?: typeof fetch;
} = {}): Promise<IntegrationTestResult> {
  const testedAt = new Date().toISOString();
  try {
    if (id === "CJ") { const status = await (dependencies.cjTest ?? testCjConnection)(); return saveResult({ integration: id, status: "PASSED", testedAt, summary: "CJ authentication and read-only settings request succeeded.", details: { authenticated: status.authenticated, endpoint: CJ_API_BASE_URL } }); }
    if (id === "SCOOP") { const parsed = await (dependencies.scoopTest ?? fetchAndParseScoopPricelist)(); return saveResult({ integration: id, status: "PASSED", testedAt, summary: "Scoop feed is reachable and valid XML was parsed.", details: { productCount: parsed.products.length, rootElement: parsed.xmlRootTag ?? "unknown", itemElement: parsed.xmlItemTag ?? "unknown" } }); }
    if (id === "SYNTECH") { const configuration = syntechConfiguration(); if (!configuration.enabled || !configuration.configured) throw new SyntechFeedError("NOT_CONFIGURED", "Syntech feed is not configured."); const result = await (dependencies.syntechTest ?? runSyntechSync)("TEST", { mutate: false, fetchImpl: dependencies.syntechFetchImpl }); return saveResult({ integration: id, status: "PASSED", testedAt, summary: "Syntech update feed is reachable and its envelope is valid.", details: result.parsed }); }
    if (id === "SYNTECH_RESELLER") { const configuration = syntechResellerApiConfiguration(); if (!configuration.enabled || !configuration.configured || configuration.environment !== "UAT") throw new Error("NOT_CONFIGURED"); return saveResult({ integration: id, status: "PASSED", testedAt, summary: "Syntech Reseller API UAT configuration is valid. No external request was sent.", details: { environment: "UAT", enabled: true, tokenConfigured: true, baseUrlConfigured: true, productionOperational: false } }); }
    if (id === "SMTP") {
      const notification = dependencies.smtpRecipient ? undefined : await getEffectiveNotificationSettings(); const recipient = dependencies.smtpRecipient ?? notification?.notifications.fxPricingRecipientEmail?.trim();
      if (!recipient) throw new Error("CONFIGURATION_MISSING");
      await (dependencies.smtpVerify ?? verifySmtpConnection)();
      await (dependencies.smtpSend ?? smtpMailTransport.send)({ to: recipient, subject: "TEST - TekCentral SMTP integration", text: "This message confirms the TekCentral SMTP transport configuration.", html: "<h1>TekCentral SMTP test</h1><p>This message confirms the SMTP transport configuration.</p>" });
      return saveResult({ integration: id, status: "PASSED", testedAt, summary: "SMTP accepted the controlled test email.", details: { recipient } });
    }
    const quote = await (dependencies.fxProvider ?? new FrankfurterEcbFxProvider()).getRate("USD", "ZAR");
    return saveResult({ integration: id, status: "PASSED", testedAt, summary: "FX provider returned a valid current USD/ZAR quote.", details: { pair: "USD/ZAR", rate: quote.rate, effectiveAt: quote.effectiveAt } });
  } catch (error) {
    const category = sanitizedCategory(error);
    const diagnostics = error instanceof SyntechFeedError && error.diagnostics ? { stage: error.diagnostics.stage, ...(error.diagnostics.expectedCount !== undefined ? { expectedCount: error.diagnostics.expectedCount } : {}), ...(error.diagnostics.parsedCount !== undefined ? { parsedCount: error.diagnostics.parsedCount } : {}), ...(error.diagnostics.rowIndex !== undefined ? { rowIndex: error.diagnostics.rowIndex } : {}), ...(error.diagnostics.duplicateCount !== undefined ? { duplicateCount: error.diagnostics.duplicateCount } : {}), ...(error.diagnostics.field ? { field: error.diagnostics.field } : {}), ...(error.diagnostics.observedFields ? { observedFields: error.diagnostics.observedFields.join(",") } : {}) } : undefined;
    return saveResult({ integration: id, status: "FAILED", testedAt, category, summary: error instanceof SyntechFeedError && error.code === "INVALID_FEED" ? error.message : failureSummary(id, category), details: diagnostics });
  }
}

export async function getIntegrationHistory() { const store = await readStore(); return Object.values(store.results).filter((item): item is IntegrationTestResult => Boolean(item)).sort((a, b) => b.testedAt.localeCompare(a.testedAt)); }

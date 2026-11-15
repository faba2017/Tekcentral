import { getBusinessSettings } from "./businessSettingsRepository.js";
import { getStoredFxQuote, saveFxQuote, type FxQuote, type FxRateStatus } from "./fxRateRepository.js";

export interface FxRateProvider { getRate(sourceCurrency: string, targetCurrency: string): Promise<FxQuote>; }
type FetchLike = typeof fetch;

const currency = (value: string) => {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("FX currency must be a three-letter ISO code.");
  return normalized;
};

export class FrankfurterEcbFxProvider implements FxRateProvider {
  constructor(private readonly fetcher: FetchLike = fetch, private readonly timeoutMs = 8_000) {}
  async getRate(sourceCurrency: string, targetCurrency: string): Promise<FxQuote> {
    const source = currency(sourceCurrency); const target = currency(targetCurrency);
    const endpoint = `https://api.frankfurter.dev/v2/providers/ecb/rate/${source.toLowerCase()}/${target.toLowerCase()}`;
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(endpoint, { headers: { accept: "application/json" }, signal: controller.signal });
      if (!response.ok) throw new Error(`FX provider returned HTTP ${response.status}.`);
      const raw = await response.json() as Record<string, unknown>;
      const rate = Number(raw.rate);
      const date = typeof raw.date === "string" ? raw.date : undefined;
      if (!Number.isFinite(rate) || rate <= 0 || !date) throw new Error("FX provider returned a malformed rate.");
      const fetchedAt = new Date().toISOString();
      return { sourceCurrency: source, targetCurrency: target, rate, provider: "FRANKFURTER_ECB", effectiveAt: new Date(`${date}T00:00:00.000Z`).toISOString(), fetchedAt, sourceReference: endpoint };
    } finally { clearTimeout(timeout); }
  }
}

const inflight = new Map<string, Promise<FxQuote>>();
export function fxQuoteStatus(quote: FxQuote | undefined, freshnessHours: number, now = new Date()): FxRateStatus {
  if (!quote) return "MISSING";
  return now.getTime() - new Date(quote.fetchedAt).getTime() <= freshnessHours * 3_600_000 ? "FRESH" : "STALE";
}
export async function getFxRate(sourceCurrency: string, targetCurrency: string, now = new Date()) {
  const [quote, settings] = await Promise.all([getStoredFxQuote(currency(sourceCurrency), currency(targetCurrency)), getBusinessSettings()]);
  return { quote, status: fxQuoteStatus(quote, settings.pricing.fxStaleAfterHours, now), freshnessHours: settings.pricing.fxStaleAfterHours };
}
export async function refreshFxRate(sourceCurrency: string, targetCurrency: string, provider: FxRateProvider = new FrankfurterEcbFxProvider()) {
  const source = currency(sourceCurrency); const target = currency(targetCurrency); const key = `${source}/${target}`;
  const existing = inflight.get(key); if (existing) return existing;
  const request = provider.getRate(source, target).then((quote) => {
    if (quote.sourceCurrency !== source || quote.targetCurrency !== target || !Number.isFinite(quote.rate) || quote.rate <= 0) throw new Error("FX provider returned an invalid currency pair or rate.");
    return saveFxQuote(quote);
  }).finally(() => inflight.delete(key));
  inflight.set(key, request); return request;
}
export async function resolveFxEvidence(sourceCurrency: string, targetCurrency = "ZAR") {
  const source = currency(sourceCurrency); const target = currency(targetCurrency);
  if (source === target) return { rate: 1, capturedAt: new Date().toISOString(), provider: "IDENTITY", sourceReference: `${source}/${target}`, status: "FRESH" as const };
  const automatic = await getFxRate(source, target);
  if (automatic.status === "FRESH" && automatic.quote) return { rate: automatic.quote.rate, capturedAt: automatic.quote.fetchedAt, provider: automatic.quote.provider, sourceReference: automatic.quote.sourceReference, status: automatic.status };
  const settings = (await getBusinessSettings()).pricing;
  const manualFresh = settings.cjManualFxRate && settings.cjFxRateUpdatedAt && settings.cjFxSourceCurrency === source && Date.now() - new Date(settings.cjFxRateUpdatedAt).getTime() <= settings.fxStaleAfterHours * 3_600_000;
  if (manualFresh) return { rate: settings.cjManualFxRate!, capturedAt: settings.cjFxRateUpdatedAt!, provider: "MANUAL", sourceReference: settings.cjFxSourceReference ?? "Manual FX evidence", status: "FRESH" as const };
  return { rate: undefined, capturedAt: automatic.quote?.fetchedAt, provider: automatic.quote?.provider, sourceReference: automatic.quote?.sourceReference, status: automatic.status };
}
export function resetFxInflightForTests() { inflight.clear(); }

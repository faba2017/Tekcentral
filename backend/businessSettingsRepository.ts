import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { LocalShippingRateCard, ShippingPolicyType } from "./localShippingEstimator.js";

export type PricingRoundingMode = "NONE" | "NEAREST_1" | "NEAREST_5" | "NEAREST_10" | "END_99";
export type ReferencePriceBehavior = "IGNORE" | "WARNING_ONLY" | "SOFT_CEILING";

export interface PricingBand { id: string; minimumCost: number; maximumCost?: number; targetGrossMarginPercent: number; minimumGrossProfit?: number; }
export interface PricingSettings {
  vatRatePercent: number;
  pricingBands: PricingBand[];
  roundingMode: PricingRoundingMode;
  referencePriceBehavior: ReferencePriceBehavior;
  proposedPricesRequireApproval: boolean;
  autoPublishPrices: boolean;
  cjManualFxRate?: number;
  cjFxRateUpdatedAt?: string;
  cjFxBufferPercent: number;
  fxStaleAfterHours: number;
}
export type ScoopShippingMode = ShippingPolicyType | "CONFIGURED_FLAT" | "CONFIGURED_ZONE";
export interface ShippingZone { id: string; provinces: string[]; charge: number; estimate?: string; }
export interface ShippingSettings {
  shippingEnabled: boolean; quoteValidityMinutes: number; shippingPriceBufferPercent: number;
  minimumShippingCharge: number; maximumShippingCharge?: number;
  allowMixedSupplierCheckout: boolean; requireFreshQuoteBeforePayment: boolean;
  scoopMode: ScoopShippingMode; scoopFlatCharge?: number; scoopZones: ShippingZone[];
  localRateCard: LocalShippingRateCard;
}
export interface SettingsAuditEntry { id: string; setting: string; previousValue: unknown; newValue: unknown; timestamp: string; actor: string; }
interface Store { version: 1; pricing: PricingSettings; shipping: ShippingSettings; audit: SettingsAuditEntry[]; }
type LegacyShippingSettings = Partial<Omit<ShippingSettings, "localRateCard">> & { localRateCard?: Partial<Omit<LocalShippingRateCard, "origin" | "zones">> & { origin?: Partial<LocalShippingRateCard["origin"]>; zones?: LocalShippingRateCard["zones"] } };

export const defaultPricingSettings: PricingSettings = {
  vatRatePercent: 15,
  pricingBands: [
    { id: "LOW", minimumCost: 0, maximumCost: 500, targetGrossMarginPercent: 35, minimumGrossProfit: 50 },
    { id: "STANDARD", minimumCost: 500, maximumCost: 2_000, targetGrossMarginPercent: 28, minimumGrossProfit: 125 },
    { id: "HIGH", minimumCost: 2_000, maximumCost: 10_000, targetGrossMarginPercent: 20, minimumGrossProfit: 300 },
    { id: "PREMIUM", minimumCost: 10_000, targetGrossMarginPercent: 15, minimumGrossProfit: 750 },
  ],
  roundingMode: "NEAREST_1",
  referencePriceBehavior: "WARNING_ONLY",
  proposedPricesRequireApproval: true,
  autoPublishPrices: false,
  cjFxBufferPercent: 0,
  fxStaleAfterHours: 24,
};
export const defaultShippingSettings: ShippingSettings = {
  shippingEnabled: true, quoteValidityMinutes: 30, shippingPriceBufferPercent: 0, minimumShippingCharge: 0,
  allowMixedSupplierCheckout: true, requireFreshQuoteBeforePayment: true, scoopMode: "MANUAL_QUOTE", scoopZones: [],
  localRateCard: { enabled: false, version: 0, environment: "PRODUCTION", origin: { city: "", province: "" }, volumetricDivisorCm3PerKg: 5_000, percentageBuffer: 0, fixedBufferRand: 0, roundingMode: "NEAREST_1", zones: [] },
};

function path() { return resolve(process.cwd(), ".data", "business-settings.json"); }
function cloneDefaults(): Store { return { version: 1, pricing: structuredClone(defaultPricingSettings), shipping: structuredClone(defaultShippingSettings), audit: [] }; }
export function normalizeShippingSettings(input?: LegacyShippingSettings): ShippingSettings {
  const defaults = structuredClone(defaultShippingSettings);
  const card = input?.localRateCard;
  return {
    ...defaults,
    ...input,
    scoopZones: Array.isArray(input?.scoopZones) ? input.scoopZones : defaults.scoopZones,
    localRateCard: {
      ...defaults.localRateCard,
      ...card,
      version: Number.isInteger(card?.version) && (card?.version ?? -1) >= 0 ? card!.version! : 0,
      origin: { ...defaults.localRateCard.origin, ...card?.origin },
      zones: Array.isArray(card?.zones) ? card.zones : [],
    },
  };
}

function validate(settings: PricingSettings) {
  if (!Number.isFinite(settings.vatRatePercent) || settings.vatRatePercent < 0 || settings.vatRatePercent > 100) throw new Error("VAT rate must be between 0 and 100.");
  if (!Array.isArray(settings.pricingBands) || settings.pricingBands.length === 0) throw new Error("At least one pricing band is required.");
  const sorted = [...settings.pricingBands].sort((a, b) => a.minimumCost - b.minimumCost);
  sorted.forEach((band, index) => {
    if (!band.id.trim() || band.minimumCost < 0 || band.targetGrossMarginPercent <= 0 || band.targetGrossMarginPercent >= 100) throw new Error("Each pricing band requires a valid ID, cost and gross margin.");
    if (band.maximumCost !== undefined && band.maximumCost <= band.minimumCost) throw new Error("Pricing band maximum must exceed its minimum.");
    if (band.minimumGrossProfit !== undefined && band.minimumGrossProfit < 0) throw new Error("Minimum gross profit cannot be negative.");
    if (index > 0 && sorted[index - 1].maximumCost !== undefined && band.minimumCost < sorted[index - 1].maximumCost!) throw new Error("Pricing bands cannot overlap.");
  });
  if (settings.cjManualFxRate !== undefined && settings.cjManualFxRate <= 0) throw new Error("CJ FX rate must be positive.");
  if (settings.cjFxBufferPercent < 0 || settings.cjFxBufferPercent > 100) throw new Error("FX buffer must be between 0 and 100.");
  if (settings.fxStaleAfterHours <= 0) throw new Error("FX stale threshold must be positive.");
  if (settings.autoPublishPrices) throw new Error("Automatic storefront price publishing is not available.");
}
function validateShipping(settings: ShippingSettings) {
  if (!Number.isFinite(settings.quoteValidityMinutes) || settings.quoteValidityMinutes <= 0) throw new Error("Quote validity must be positive.");
  if (!Number.isFinite(settings.shippingPriceBufferPercent) || settings.shippingPriceBufferPercent < 0) throw new Error("Shipping buffer cannot be negative.");
  if (!Number.isFinite(settings.minimumShippingCharge) || settings.minimumShippingCharge < 0) throw new Error("Minimum shipping charge cannot be negative.");
  if (settings.maximumShippingCharge !== undefined && (!Number.isFinite(settings.maximumShippingCharge) || settings.maximumShippingCharge < settings.minimumShippingCharge)) throw new Error("Maximum shipping charge cannot be below minimum.");
  if (settings.scoopMode === "CONFIGURED_FLAT" && (settings.scoopFlatCharge === undefined || settings.scoopFlatCharge < 0)) throw new Error("Scoop flat shipping requires a valid charge.");
  if (settings.scoopMode === "CONFIGURED_ZONE" && settings.scoopZones.length === 0) throw new Error("Scoop zone shipping requires at least one zone.");
  if (settings.scoopZones.some((zone) => !zone.id || zone.provinces.length === 0 || !Number.isFinite(zone.charge) || zone.charge < 0)) throw new Error("Each shipping zone requires an ID, province and valid charge.");
  const card = settings.localRateCard;
  if (!card || !Number.isInteger(card.version) || card.version < 0) throw new Error("Local rate-card version is invalid.");
  if (!Number.isFinite(card.volumetricDivisorCm3PerKg) || card.volumetricDivisorCm3PerKg <= 0) throw new Error("Volumetric divisor must be positive.");
  if (!Number.isFinite(card.percentageBuffer) || card.percentageBuffer < 0 || !Number.isFinite(card.fixedBufferRand) || card.fixedBufferRand < 0) throw new Error("Local shipping buffers cannot be negative.");
  if (card.enabled && (!card.origin.city.trim() || !card.origin.province.trim() || card.zones.length === 0)) throw new Error("Enabled local rate cards require an origin and at least one zone.");
  card.zones.forEach((zone) => {
    if (!zone.id.trim() || !zone.label.trim()) throw new Error("Each local shipping zone requires an ID and label.");
    if (![zone.baseCharge, zone.includedWeightKg, zone.additionalRatePerKg, zone.minimumCharge, zone.estimatedTransitDaysMin, zone.estimatedTransitDaysMax].every((value) => Number.isFinite(value) && value >= 0)) throw new Error("Local shipping zone values must be valid non-negative numbers.");
    if (zone.maximumCharge !== undefined && (!Number.isFinite(zone.maximumCharge) || zone.maximumCharge < zone.minimumCharge)) throw new Error("Zone maximum charge cannot be below its minimum.");
    if (zone.estimatedTransitDaysMax < zone.estimatedTransitDaysMin) throw new Error("Zone maximum transit days cannot be below its minimum.");
    if (!zone.postalCodeRanges.length && !zone.provinces.length && !zone.cities.length) throw new Error("Each zone requires a postal, city or province rule.");
    if (zone.postalCodeRanges.some((range) => !Number.isInteger(range.from) || !Number.isInteger(range.to) || range.from < 0 || range.to > 9_999 || range.from > range.to)) throw new Error("Postal-code ranges must be valid four-digit ranges.");
  });
}

async function readStore(): Promise<Store> {
  try {
    const parsed = JSON.parse(await readFile(path(), "utf8")) as Partial<Store>;
    if (parsed.version !== 1 || !parsed.pricing || !Array.isArray(parsed.audit)) return cloneDefaults();
    const pricing = { ...structuredClone(defaultPricingSettings), ...parsed.pricing };
    const shipping = normalizeShippingSettings(parsed.shipping as LegacyShippingSettings | undefined);
    validate(pricing);
    validateShipping(shipping);
    return { version: 1, pricing, shipping, audit: parsed.audit };
  } catch { return cloneDefaults(); }
}
async function writeStore(store: Store) {
  const target = path(); const temp = `${target}.tmp`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(temp, JSON.stringify(store, null, 2));
  await rename(temp, target);
}
export async function getBusinessSettings() { return readStore(); }
export async function updatePricingSettings(next: PricingSettings, actor = "TekCentral Staff") {
  validate(next);
  const store = await readStore(); const now = new Date().toISOString();
  const keys = Object.keys(next) as (keyof PricingSettings)[];
  const changes = keys.filter((key) => JSON.stringify(store.pricing[key]) !== JSON.stringify(next[key])).map((key) => ({ id: `settings-${Date.now()}-${key}`, setting: `pricing.${key}`, previousValue: store.pricing[key], newValue: next[key], timestamp: now, actor }));
  const updated = { ...store, pricing: next, audit: [...changes, ...store.audit].slice(0, 500) };
  await writeStore(updated); return updated;
}
export async function updateShippingSettings(next: ShippingSettings, actor = "TekCentral Staff") {
  const store = await readStore();
  const submitted = normalizeShippingSettings(next);
  const previousCard = { ...store.shipping.localRateCard, version: 0 };
  const submittedCard = { ...submitted.localRateCard, version: 0 };
  const rateCardChanged = JSON.stringify(previousCard) !== JSON.stringify(submittedCard);
  const normalized = { ...submitted, localRateCard: { ...submitted.localRateCard, version: rateCardChanged ? store.shipping.localRateCard.version + 1 : store.shipping.localRateCard.version } };
  validateShipping(normalized);
  const now = new Date().toISOString(); const keys = Object.keys(normalized) as (keyof ShippingSettings)[];
  const changes = keys.filter((key) => JSON.stringify(store.shipping[key]) !== JSON.stringify(normalized[key])).map((key) => ({ id: `settings-${Date.now()}-shipping-${key}`, setting: `shipping.${key}`, previousValue: store.shipping[key], newValue: normalized[key], timestamp: now, actor }));
  const updated = { ...store, shipping: normalized, audit: [...changes, ...store.audit].slice(0, 500) }; await writeStore(updated); return updated;
}

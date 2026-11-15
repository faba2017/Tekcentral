import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { LocalShippingRateCard, ShippingPolicyType } from "./localShippingEstimator.js";
import { loadPersistenceConfig } from "./persistence/config.js";
import { query } from "./persistence/postgres.js";

export type PricingRoundingMode = "NONE" | "NEAREST_1" | "NEAREST_5" | "NEAREST_10" | "END_99";
export type ReferencePriceBehavior = "IGNORE" | "WARNING_ONLY" | "SOFT_CEILING";
export type FxImpactMonitoringMode = "MANUAL" | "ASSISTED" | "AUTO_WITH_GUARDRAILS";
export interface FxImpactThresholds { ignorePercent: number; monitorPercent: number; reviewPercent: number; criticalPercent: number; }

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
  cjFxSourceCurrency?: string;
  cjFxSourceReference?: string;
  cjFxManualReason?: string;
  cjFxManualActor?: string;
  cjFxBufferPercent: number;
  fxStaleAfterHours: number;
  fxImpactMonitoringEnabled: boolean;
  fxImpactMonitoringMode: FxImpactMonitoringMode;
  fxImpactThresholds: FxImpactThresholds;
  fxScheduledReconciliationEnabled: boolean;
  fxScheduledReconciliationHours: number;
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
export interface NotificationSettings { fxPricingEmailEnabled: boolean; fxPricingInAppEnabled: boolean; fxPricingRecipientEmail?: string; fxPricingNotifyOn: ("REVIEW" | "CRITICAL")[]; }
export type AutomationSettings = Pick<PricingSettings, "fxImpactMonitoringEnabled" | "fxImpactMonitoringMode" | "fxImpactThresholds" | "fxScheduledReconciliationEnabled" | "fxScheduledReconciliationHours" | "fxStaleAfterHours">;
export interface SettingsAuditEntry { id: string; setting: string; previousValue: unknown; newValue: unknown; timestamp: string; actor: string; }
export type SettingsDomain = "general" | "commerce" | "products" | "suppliers" | "payments" | "notifications" | "integrations" | "automation" | "ai-assistant" | "users-security" | "system";
export type SettingSource = "DEFAULT" | "DATABASE" | "ENVIRONMENT";
export type SettingRisk = "STANDARD" | "HIGH";
export type SettingCapability = "EDITABLE" | "READ_ONLY" | "ENVIRONMENT_MANAGED" | "SECRET" | "SYSTEM_MANAGED" | "SYSTEM_PROTECTED" | "NOT_SUPPORTED";
export interface GeneralSettings { businessName?: string; tradingName?: string; defaultCountry?: "ZA"; defaultCurrency?: "ZAR"; timezone?: "Africa/Johannesburg"; }
export interface SettingsDomainRecord { revision: number; values: Record<string, unknown>; updatedAt?: string; updatedBy?: string; }
export interface SettingsHistoryEntry { id: string; domain: SettingsDomain; key: string; previousValue: unknown; newValue: unknown; actor: string; timestamp: string; credentialChanged?: boolean; }
export interface SettingDefinition { key: string; domain: SettingsDomain; group?: string; label: string; description: string; valueType: "string" | "enum" | "secret-status"; defaultValue?: unknown; allowedValues?: string[]; risk: SettingRisk; secret: boolean; editable: boolean; capability?: SettingCapability; requiredRole: "ADMIN" | "SUPER_ADMIN"; environmentKey?: string; }
interface Store { version: 1; pricing: PricingSettings; shipping: ShippingSettings; notifications?: NotificationSettings; domainRevisions?: Partial<Record<"pricing" | "shipping" | "notifications", number>>; audit: SettingsAuditEntry[]; settingsDomains?: Partial<Record<SettingsDomain, SettingsDomainRecord>>; settingsHistory?: SettingsHistoryEntry[]; _persistenceVersion?: number; }
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
  fxImpactMonitoringEnabled: true,
  fxImpactMonitoringMode: "ASSISTED",
  fxImpactThresholds: { ignorePercent: 3, monitorPercent: 3, reviewPercent: 7, criticalPercent: 12 },
  fxScheduledReconciliationEnabled: true,
  fxScheduledReconciliationHours: 24,
};
export const defaultShippingSettings: ShippingSettings = {
  shippingEnabled: true, quoteValidityMinutes: 30, shippingPriceBufferPercent: 0, minimumShippingCharge: 0,
  allowMixedSupplierCheckout: true, requireFreshQuoteBeforePayment: true, scoopMode: "MANUAL_QUOTE", scoopZones: [],
  localRateCard: { enabled: false, version: 0, environment: "PRODUCTION", origin: { city: "", province: "" }, volumetricDivisorCm3PerKg: 5_000, percentageBuffer: 0, fixedBufferRand: 0, roundingMode: "NEAREST_1", zones: [] },
};
export const defaultNotificationSettings: NotificationSettings = { fxPricingEmailEnabled: true, fxPricingInAppEnabled: true, fxPricingNotifyOn: ["REVIEW", "CRITICAL"] };

function path() { return resolve(process.cwd(), ".data", "business-settings.json"); }
function cloneDefaults(): Store { return { version: 1, pricing: structuredClone(defaultPricingSettings), shipping: structuredClone(defaultShippingSettings), notifications: structuredClone(defaultNotificationSettings), domainRevisions: {}, audit: [], settingsDomains: {}, settingsHistory: [] }; }

export const settingsDefinitions: SettingDefinition[] = [
  { key: "zeusEnabled", domain: "ai-assistant", group: "Customer assistant", label: "Zeus", description: "Global customer-facing Zeus master switch. The environment switch must also allow Zeus.", valueType: "enum", defaultValue: "true", allowedValues: ["true", "false"], risk: "HIGH", secret: false, editable: true, requiredRole: "SUPER_ADMIN" },
  { key: "adminAiEnabled", domain: "ai-assistant", group: "Internal assistant", label: "Admin AI", description: "Global internal Admin AI master switch. Environment availability and staff permission are also required.", valueType: "enum", defaultValue: "false", allowedValues: ["true", "false"], risk: "HIGH", secret: false, editable: true, requiredRole: "SUPER_ADMIN" },
  { key: "businessName", domain: "general", label: "Business name", description: "Registered business name. Leave unconfigured until confirmed.", valueType: "string", risk: "STANDARD", secret: false, editable: true, requiredRole: "ADMIN" },
  { key: "tradingName", domain: "general", label: "Trading name", description: "Customer-facing trading name. Leave unconfigured until confirmed.", valueType: "string", risk: "STANDARD", secret: false, editable: true, requiredRole: "ADMIN" },
  { key: "defaultCountry", domain: "general", label: "Default country", description: "Default operating country.", valueType: "enum", defaultValue: "ZA", allowedValues: ["ZA"], risk: "HIGH", secret: false, editable: true, requiredRole: "ADMIN" },
  { key: "defaultCurrency", domain: "general", label: "Default currency", description: "Default commercial currency.", valueType: "enum", defaultValue: "ZAR", allowedValues: ["ZAR"], risk: "HIGH", secret: false, editable: true, requiredRole: "ADMIN" },
  { key: "timezone", domain: "general", label: "Timezone", description: "Timezone used for administrative timestamps.", valueType: "enum", defaultValue: "Africa/Johannesburg", allowedValues: ["Africa/Johannesburg"], risk: "STANDARD", secret: false, editable: true, requiredRole: "ADMIN" },
  { key: "defaultGateway", domain: "payments", label: "Default gateway", description: "Gateway used for new checkout payment attempts.", valueType: "enum", defaultValue: "PAYFAST", allowedValues: ["PAYFAST"], risk: "HIGH", secret: false, editable: true, requiredRole: "SUPER_ADMIN" },
  { key: "payfastMode", domain: "payments", label: "PayFast mode", description: "Environment profile used for new PayFast payment attempts.", valueType: "enum", defaultValue: process.env.PAYFAST_MODE === "live" ? "LIVE" : "SANDBOX", allowedValues: ["SANDBOX", "LIVE"], risk: "HIGH", secret: false, editable: true, requiredRole: "SUPER_ADMIN" },
  { key: "payfastEnabled", domain: "payments", label: "PayFast enabled", description: "Whether PayFast is available for new checkout payment attempts.", valueType: "enum", defaultValue: "true", allowedValues: ["true", "false"], risk: "HIGH", secret: false, editable: true, requiredRole: "SUPER_ADMIN" },
  { key: "payfastLastVerifiedAt", domain: "payments", label: "PayFast last verified", description: "Timestamp of the last safe configuration validation.", valueType: "string", risk: "STANDARD", secret: false, editable: true, requiredRole: "SUPER_ADMIN" },
  { key: "cjEnabled", domain: "integrations", group: "CJ", label: "Enabled", description: "CJ enablement is controlled by the supplier registry.", valueType: "enum", defaultValue: "true", allowedValues: ["true"], risk: "HIGH", secret: false, editable: false, capability: "SYSTEM_MANAGED", requiredRole: "SUPER_ADMIN" },
  { key: "cjEndpoint", domain: "integrations", group: "CJ", label: "Provider endpoint", description: "Fixed CJ V2 API endpoint.", valueType: "string", defaultValue: "https://developers.cjdropshipping.com/api2.0/v1", risk: "HIGH", secret: false, editable: false, capability: "SYSTEM_MANAGED", requiredRole: "SUPER_ADMIN" },
  { key: "cjCredential", domain: "integrations", group: "CJ", label: "CJ credentials", description: "CJ API credentials are managed outside the application.", valueType: "secret-status", risk: "HIGH", secret: true, editable: false, capability: "SECRET", requiredRole: "SUPER_ADMIN", environmentKey: "CJ_API_KEY" },
  { key: "scoopEnabled", domain: "integrations", group: "Scoop Feed", label: "Enabled", description: "Scoop feed operations are enabled by the registered supplier capability.", valueType: "enum", defaultValue: "true", allowedValues: ["true"], risk: "HIGH", secret: false, editable: false, capability: "SYSTEM_MANAGED", requiredRole: "SUPER_ADMIN" },
  { key: "scoopFeedUrl", domain: "integrations", group: "Scoop Feed", label: "Feed URL", description: "HTTPS Scoop XML feed URL. Only the approved Scoop host is accepted.", valueType: "string", defaultValue: "https://scoop.co.za/scoop_pricelist.xml", risk: "HIGH", secret: false, editable: true, capability: "EDITABLE", requiredRole: "SUPER_ADMIN" },
  { key: "scoopRefreshBehavior", domain: "integrations", group: "Scoop Feed", label: "Refresh behavior", description: "Feed refresh remains an explicit staff action.", valueType: "string", defaultValue: "Manual", risk: "STANDARD", secret: false, editable: false, capability: "SYSTEM_MANAGED", requiredRole: "ADMIN" },
  { key: "smtpHost", domain: "integrations", group: "SMTP", label: "SMTP host", description: "Mail transport host managed by environment.", valueType: "string", risk: "HIGH", secret: false, editable: false, capability: "ENVIRONMENT_MANAGED", requiredRole: "SUPER_ADMIN", environmentKey: "SMTP_HOST" },
  { key: "smtpPort", domain: "integrations", group: "SMTP", label: "SMTP port", description: "Mail transport port managed by environment.", valueType: "string", risk: "HIGH", secret: false, editable: false, capability: "ENVIRONMENT_MANAGED", requiredRole: "SUPER_ADMIN", environmentKey: "SMTP_PORT" },
  { key: "smtpSecure", domain: "integrations", group: "SMTP", label: "Transport security", description: "TLS transport mode managed by environment.", valueType: "string", risk: "HIGH", secret: false, editable: false, capability: "ENVIRONMENT_MANAGED", requiredRole: "SUPER_ADMIN", environmentKey: "SMTP_SECURE" },
  { key: "smtpUsername", domain: "integrations", group: "SMTP", label: "SMTP username", description: "Mail transport username managed by environment.", valueType: "string", risk: "HIGH", secret: false, editable: false, capability: "ENVIRONMENT_MANAGED", requiredRole: "SUPER_ADMIN", environmentKey: "SMTP_USER" },
  { key: "smtpFromEmail", domain: "integrations", group: "SMTP", label: "From email", description: "Sender address managed by environment.", valueType: "string", risk: "HIGH", secret: false, editable: false, capability: "ENVIRONMENT_MANAGED", requiredRole: "SUPER_ADMIN", environmentKey: "SMTP_FROM_EMAIL" },
  { key: "smtpFromName", domain: "integrations", group: "SMTP", label: "From name", description: "Sender display name managed by environment.", valueType: "string", defaultValue: "TekCentral Operations", risk: "HIGH", secret: false, editable: false, capability: "ENVIRONMENT_MANAGED", requiredRole: "SUPER_ADMIN", environmentKey: "SMTP_FROM_NAME" },
  { key: "smtpCredential", domain: "integrations", group: "SMTP", label: "SMTP password", description: "SMTP password is managed outside the application.", valueType: "secret-status", risk: "HIGH", secret: true, editable: false, capability: "SECRET", requiredRole: "SUPER_ADMIN", environmentKey: "SMTP_PASSWORD" },
  { key: "fxProvider", domain: "integrations", group: "FX Provider", label: "Provider", description: "Canonical foreign-exchange provider.", valueType: "string", defaultValue: "Frankfurter / ECB", risk: "STANDARD", secret: false, editable: false, capability: "SYSTEM_MANAGED", requiredRole: "ADMIN" },
  { key: "fxEndpoint", domain: "integrations", group: "FX Provider", label: "Provider endpoint", description: "Fixed provider endpoint; arbitrary provider URLs are not supported.", valueType: "string", defaultValue: "https://api.frankfurter.dev", risk: "HIGH", secret: false, editable: false, capability: "SYSTEM_MANAGED", requiredRole: "SUPER_ADMIN" },
  { key: "smtpCredential", domain: "notifications", label: "SMTP credentials", description: "Mail credentials are managed by environment.", valueType: "secret-status", risk: "HIGH", secret: true, editable: false, requiredRole: "SUPER_ADMIN", environmentKey: "SMTP_PASSWORD" },
  { key: "minimumContentState", domain: "products", group: "Publication readiness", label: "Minimum content state", description: "Minimum reviewed content state required before publication can proceed.", valueType: "enum", defaultValue: "CONTENT_BASIC", allowedValues: ["CONTENT_BASIC", "CONTENT_ENRICHED"], risk: "HIGH", secret: false, editable: true, capability: "EDITABLE", requiredRole: "ADMIN" },
  { key: "requireControlledPrimaryImage", domain: "products", group: "Images", label: "Require controlled primary image", description: "Products must use a TekCentral-controlled image before publication.", valueType: "enum", defaultValue: "true", allowedValues: ["true"], risk: "HIGH", secret: false, editable: false, capability: "SYSTEM_PROTECTED", requiredRole: "ADMIN" },
  { key: "requireShortDescription", domain: "products", group: "Content", label: "Require short description", description: "A meaningful short description is required by the publication workflow.", valueType: "enum", defaultValue: "true", allowedValues: ["true"], risk: "HIGH", secret: false, editable: false, capability: "SYSTEM_PROTECTED", requiredRole: "ADMIN" },
  { key: "requireLongDescription", domain: "products", group: "Content", label: "Require long description", description: "Long descriptions remain a review warning rather than a publication blocker.", valueType: "enum", defaultValue: "false", allowedValues: ["false"], risk: "STANDARD", secret: false, editable: false, capability: "READ_ONLY", requiredRole: "ADMIN" },
  { key: "supplierEnrichmentEnabled", domain: "products", group: "Enrichment / SEO", label: "Supplier enrichment enabled", description: "Controls future supplier-derived content suggestions without changing saved drafts or published versions.", valueType: "enum", defaultValue: "true", allowedValues: ["true", "false"], risk: "STANDARD", secret: false, editable: true, capability: "EDITABLE", requiredRole: "ADMIN" },
  { key: "seoSuggestionsEnabled", domain: "products", group: "Enrichment / SEO", label: "SEO suggestions enabled", description: "Controls future SEO suggestions. Existing reviewed content is preserved.", valueType: "enum", defaultValue: "true", allowedValues: ["true", "false"], risk: "STANDARD", secret: false, editable: true, capability: "EDITABLE", requiredRole: "ADMIN" },
  { key: "requireStaffContentReview", domain: "products", group: "Publication readiness", label: "Require staff content review", description: "Publication remains an explicit staff action and can never auto-publish content.", valueType: "enum", defaultValue: "true", allowedValues: ["true"], risk: "HIGH", secret: false, editable: false, capability: "SYSTEM_PROTECTED", requiredRole: "ADMIN" },
  { key: "sourcePriceFreshnessHours", domain: "suppliers", group: "Freshness defaults", label: "Source-price freshness", description: "Maximum age of supplier price evidence used by pricing readiness.", valueType: "enum", defaultValue: "24", allowedValues: ["6", "12", "24", "48", "72"], risk: "HIGH", secret: false, editable: true, capability: "EDITABLE", requiredRole: "ADMIN" },
  { key: "stockFreshnessHours", domain: "suppliers", group: "Availability / stock", label: "Stock freshness", description: "Maximum age of supplier stock evidence used for public availability.", valueType: "enum", defaultValue: "24", allowedValues: ["6", "12", "24", "48", "72"], risk: "HIGH", secret: false, editable: true, capability: "EDITABLE", requiredRole: "ADMIN" },
  { key: "syntechApiProcurementEnabled", domain: "suppliers", group: "Syntech procurement", label: "Syntech API procurement", description: "Operational permission for future Syntech API submissions. The deployment environment must also permit UAT writes. Manual procurement remains available when this is disabled.", valueType: "enum", defaultValue: "false", allowedValues: ["true", "false"], risk: "HIGH", secret: false, editable: true, capability: "EDITABLE", requiredRole: "SUPER_ADMIN" },
  { key: "catalogueRefreshInterval", domain: "suppliers", group: "Catalogue refresh", label: "Default catalogue refresh interval", description: "Refresh scheduling is not yet controlled by a shared supplier scheduler.", valueType: "string", risk: "STANDARD", secret: false, editable: false, capability: "NOT_SUPPORTED", requiredRole: "ADMIN" },
  { key: "logisticsFreshnessHours", domain: "suppliers", group: "Freshness defaults", label: "Logistics freshness", description: "Logistics evidence currently follows supplier-specific workflow rules.", valueType: "string", risk: "STANDARD", secret: false, editable: false, capability: "NOT_SUPPORTED", requiredRole: "ADMIN" },
  { key: "procurementModes", domain: "suppliers", group: "Supplier behavior", label: "Procurement modes", description: "Modes are managed by each supplier capability registration, not a global switch.", valueType: "string", defaultValue: "Managed by supplier capability", risk: "STANDARD", secret: false, editable: false, capability: "READ_ONLY", requiredRole: "ADMIN" },
  { key: "supplierEnablement", domain: "suppliers", group: "Supplier behavior", label: "Supplier enablement", description: "Supplier enablement is currently registry-managed and cannot be changed here safely.", valueType: "string", defaultValue: "Operational suppliers enabled", risk: "HIGH", secret: false, editable: false, capability: "READ_ONLY", requiredRole: "ADMIN" },
];

export class SettingsConflictError extends Error { code = "SETTINGS_CONFLICT" as const; }
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
  if (settings.cjFxSourceCurrency !== undefined && !/^[A-Z]{3}$/.test(settings.cjFxSourceCurrency)) throw new Error("FX source currency must be a three-letter ISO code.");
  if (settings.cjFxBufferPercent < 0 || settings.cjFxBufferPercent > 100) throw new Error("FX buffer must be between 0 and 100.");
  if (settings.fxStaleAfterHours <= 0) throw new Error("FX stale threshold must be positive.");
  if (!["MANUAL", "ASSISTED", "AUTO_WITH_GUARDRAILS"].includes(settings.fxImpactMonitoringMode)) throw new Error("FX monitoring mode is invalid.");
  const thresholds = settings.fxImpactThresholds;
  if (!thresholds || ![thresholds.ignorePercent, thresholds.monitorPercent, thresholds.reviewPercent, thresholds.criticalPercent].every((value) => Number.isFinite(value) && value >= 0) || thresholds.ignorePercent !== thresholds.monitorPercent || thresholds.monitorPercent >= thresholds.reviewPercent || thresholds.reviewPercent >= thresholds.criticalPercent) throw new Error("FX impact thresholds must define contiguous increasing bands.");
  if (!Number.isFinite(settings.fxScheduledReconciliationHours) || settings.fxScheduledReconciliationHours < 1) throw new Error("FX reconciliation frequency must be at least one hour.");
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
  if(loadPersistenceConfig().provider==="POSTGRES"){const row=(await query<{version:string;payload:Store}>("SELECT version::text,payload FROM operational_state WHERE namespace='settings' AND key='business'" )).rows[0];if(!row)return cloneDefaults();return{...row.payload,_persistenceVersion:Number(row.version)};}
  try {
    const parsed = JSON.parse(await readFile(path(), "utf8")) as Partial<Store>;
    if (parsed.version !== 1 || !parsed.pricing || !Array.isArray(parsed.audit)) return cloneDefaults();
    const pricing = { ...structuredClone(defaultPricingSettings), ...parsed.pricing };
    const shipping = normalizeShippingSettings(parsed.shipping as LegacyShippingSettings | undefined);
    validate(pricing);
    validateShipping(shipping);
    return { version: 1, pricing, shipping, notifications: { ...structuredClone(defaultNotificationSettings), ...parsed.notifications }, domainRevisions: parsed.domainRevisions ?? {}, audit: parsed.audit, settingsDomains: parsed.settingsDomains ?? {}, settingsHistory: parsed.settingsHistory ?? [] };
  } catch { return cloneDefaults(); }
}
async function writeStore(store: Store) {
  if(loadPersistenceConfig().provider==="POSTGRES"){const expected=store._persistenceVersion??0;const payload={...store};delete payload._persistenceVersion;const result=expected===0?await query("INSERT INTO operational_state(namespace,key,version,payload,updated_at) VALUES('settings','business',1,$1::jsonb,now()) ON CONFLICT DO NOTHING RETURNING version",[JSON.stringify(payload)]):await query("UPDATE operational_state SET version=version+1,payload=$1::jsonb,updated_at=now() WHERE namespace='settings' AND key='business' AND version=$2 RETURNING version",[JSON.stringify(payload),expected]);if(!result.rowCount)throw new SettingsConflictError("Settings changed by another administrator. Refresh before saving.");store._persistenceVersion=Number(result.rows[0].version);return;}
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
  const updated = { ...store, pricing: next, domainRevisions: { ...store.domainRevisions, pricing: (store.domainRevisions?.pricing ?? 0) + (changes.length ? 1 : 0) }, audit: [...changes, ...store.audit].slice(0, 500) };
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
  const updated = { ...store, shipping: normalized, domainRevisions: { ...store.domainRevisions, shipping: (store.domainRevisions?.shipping ?? 0) + (changes.length ? 1 : 0) }, audit: [...changes, ...store.audit].slice(0, 500) }; await writeStore(updated); return updated;
}

function validateEmail(value: string) { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error("Notification recipient must be a valid email address."); }
export async function getEffectiveNotificationSettings() {
  const store = await readStore(); const configured = store.notifications ?? structuredClone(defaultNotificationSettings);
  const environmentRecipient = process.env.FX_PRICING_NOTIFICATION_EMAIL?.trim();
  const recipient = configured.fxPricingRecipientEmail?.trim() || environmentRecipient || "reports@tekcentral.co.za";
  return { notifications: { ...configured, fxPricingRecipientEmail: recipient }, revision: store.domainRevisions?.notifications ?? 0, source: configured.fxPricingRecipientEmail ? "DATABASE" as const : environmentRecipient ? "ENVIRONMENT" as const : "DEFAULT" as const, audit: store.audit.filter((entry) => entry.setting.startsWith("notifications.")) };
}
export async function updateNotificationSettings(next: NotificationSettings, input: { revision: number; confirmHighRisk: boolean }, actor = "TekCentral Staff") {
  const store = await readStore(); const revision = store.domainRevisions?.notifications ?? 0;
  if (input.revision !== revision) throw new SettingsConflictError("Settings changed by another administrator. Refresh before saving.");
  if (!input.confirmHighRisk) throw new Error("Notification settings require explicit confirmation.");
  if (next.fxPricingRecipientEmail) validateEmail(next.fxPricingRecipientEmail.trim());
  if (!Array.isArray(next.fxPricingNotifyOn) || next.fxPricingNotifyOn.some((item) => !["REVIEW", "CRITICAL"].includes(item))) throw new Error("Notification severity selection is invalid.");
  const previous = store.notifications ?? structuredClone(defaultNotificationSettings); const now = new Date().toISOString();
  const keys = Object.keys(next) as (keyof NotificationSettings)[]; const changes = keys.filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key])).map((key) => ({ id: `settings-${Date.now()}-notifications-${key}`, setting: `notifications.${key}`, previousValue: previous[key], newValue: next[key], timestamp: now, actor }));
  const updated: Store = { ...store, notifications: next, domainRevisions: { ...store.domainRevisions, notifications: revision + (changes.length ? 1 : 0) }, audit: [...changes, ...store.audit].slice(0, 500) }; await writeStore(updated); return getEffectiveNotificationSettings();
}
export async function getPricingSettingsView() { const store = await readStore(); return { pricing: store.pricing, revision: store.domainRevisions?.pricing ?? 0, source: "DATABASE" as const, audit: store.audit.filter((entry) => entry.setting.startsWith("pricing.")) }; }
export async function patchPricingSettings(next: PricingSettings, input: { revision: number; confirmHighRisk: boolean }, actor = "TekCentral Staff") { const store = await readStore(); if (input.revision !== (store.domainRevisions?.pricing ?? 0)) throw new SettingsConflictError("Settings changed by another administrator. Refresh before saving."); if (!input.confirmHighRisk) throw new Error("Pricing settings require explicit confirmation."); await updatePricingSettings(next, actor); return getPricingSettingsView(); }
export async function getShippingSettingsView() { const store = await readStore(); return { shipping: store.shipping, revision: store.domainRevisions?.shipping ?? 0, source: "DATABASE" as const, audit: store.audit.filter((entry) => entry.setting.startsWith("shipping.")) }; }
export async function patchShippingSettings(next: ShippingSettings, input: { revision: number; confirmHighRisk: boolean }, actor = "TekCentral Staff") { const store = await readStore(); if (input.revision !== (store.domainRevisions?.shipping ?? 0)) throw new SettingsConflictError("Settings changed by another administrator. Refresh before saving."); if (!input.confirmHighRisk) throw new Error("Shipping settings require explicit confirmation."); await updateShippingSettings(next, actor); return getShippingSettingsView(); }
export async function getAutomationSettingsView() { const { pricing, revision, source, audit } = await getPricingSettingsView(); const automation: AutomationSettings = { fxImpactMonitoringEnabled: pricing.fxImpactMonitoringEnabled, fxImpactMonitoringMode: pricing.fxImpactMonitoringMode, fxImpactThresholds: pricing.fxImpactThresholds, fxScheduledReconciliationEnabled: pricing.fxScheduledReconciliationEnabled, fxScheduledReconciliationHours: pricing.fxScheduledReconciliationHours, fxStaleAfterHours: pricing.fxStaleAfterHours }; return { automation, revision, source, audit: audit.filter((entry) => ["pricing.fxImpactMonitoringEnabled", "pricing.fxImpactMonitoringMode", "pricing.fxImpactThresholds", "pricing.fxScheduledReconciliationEnabled", "pricing.fxScheduledReconciliationHours", "pricing.fxStaleAfterHours"].includes(entry.setting)) }; }
export async function patchAutomationSettings(next: AutomationSettings, input: { revision: number; confirmHighRisk: boolean }, actor = "TekCentral Staff") { const store = await readStore(); return patchPricingSettings({ ...store.pricing, ...next }, input, actor).then(() => getAutomationSettingsView()); }

function definitionsFor(domain: SettingsDomain) { return settingsDefinitions.filter((item) => item.domain === domain); }
function domainRecord(store: Store, domain: SettingsDomain): SettingsDomainRecord { return store.settingsDomains?.[domain] ?? { revision: 0, values: {} }; }
function publicSetting(definition: SettingDefinition, record: SettingsDomainRecord) {
  const configured = Object.prototype.hasOwnProperty.call(record.values, definition.key) ? record.values[definition.key] : undefined;
  const environmentConfigured = definition.environmentKey ? Boolean(process.env[definition.environmentKey]?.trim()) : false;
  const source: SettingSource = definition.environmentKey ? "ENVIRONMENT" : configured !== undefined ? "DATABASE" : "DEFAULT";
  const capability = definition.capability ?? (definition.environmentKey ? "ENVIRONMENT_MANAGED" : definition.editable ? "EDITABLE" : "READ_ONLY");
  const environmentValue = definition.environmentKey ? process.env[definition.environmentKey]?.trim() : undefined;
  return { ...definition, capability, environmentKey: undefined, configuredValue: definition.secret ? undefined : configured, effectiveValue: definition.secret ? undefined : (environmentValue || configured || definition.defaultValue), configured: definition.secret ? environmentConfigured : configured !== undefined || environmentConfigured, source, updatedAt: record.updatedAt, updatedBy: record.updatedBy };
}
export async function getSettingsDomain(domain: SettingsDomain) {
  const store = await readStore(); const record = domainRecord(store, domain);
  return { domain, revision: record.revision, updatedAt: record.updatedAt, updatedBy: record.updatedBy, settings: definitionsFor(domain).map((item) => publicSetting(item, record)) };
}
export async function getSettingsHistory(domain: SettingsDomain) { const store = await readStore(); return { domain, history: (store.settingsHistory ?? []).filter((item) => item.domain === domain) }; }
export async function getProductPolicySettings() {
  const view = await getSettingsDomain("products"); const value = (key: string) => view.settings.find((item) => item.key === key)?.effectiveValue;
  return { minimumContentState: String(value("minimumContentState") ?? "CONTENT_BASIC") as "CONTENT_BASIC" | "CONTENT_ENRICHED", requireControlledPrimaryImage: true, requireShortDescription: true, requireStaffContentReview: true, supplierEnrichmentEnabled: String(value("supplierEnrichmentEnabled") ?? "true") === "true", seoSuggestionsEnabled: String(value("seoSuggestionsEnabled") ?? "true") === "true" };
}
export async function getSupplierPolicySettings() {
  const view = await getSettingsDomain("suppliers"); const value = (key: string, fallback: number) => Number(view.settings.find((item) => item.key === key)?.effectiveValue ?? fallback);
  return { sourcePriceFreshnessHours: value("sourcePriceFreshnessHours", 24), stockFreshnessHours: value("stockFreshnessHours", 24) };
}
export async function getSyntechApiProcurementSetting() {
  const view = await getSettingsDomain("suppliers");
  const setting = view.settings.find((item) => item.key === "syntechApiProcurementEnabled");
  return { enabled: String(setting?.effectiveValue ?? "false") === "true", revision: view.revision, updatedAt: view.updatedAt, updatedBy: view.updatedBy };
}
function validateFrameworkValue(definition: SettingDefinition, value: unknown) {
  if (!definition.editable || definition.environmentKey) throw new Error(`${definition.label} is managed by environment and cannot be edited here.`);
  if (value !== undefined && value !== null && typeof value !== "string") throw new Error(`${definition.label} must be text.`);
  if (typeof value === "string" && value.length > 160) throw new Error(`${definition.label} is too long.`);
  if (definition.allowedValues && value !== undefined && !definition.allowedValues.includes(String(value))) throw new Error(`${definition.label} has an invalid value.`);
  if (definition.domain === "integrations" && definition.key === "scoopFeedUrl" && value !== undefined) validateScoopFeedUrl(String(value));
}

export function validateScoopFeedUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Scoop feed URL must be a valid HTTPS URL."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hostname.toLowerCase() !== "scoop.co.za") throw new Error("Scoop feed URL must use HTTPS on the approved scoop.co.za host.");
  if (!url.pathname.toLowerCase().endsWith(".xml")) throw new Error("Scoop feed URL must reference an XML resource.");
  return url.toString();
}

export async function getIntegrationPolicySettings() {
  const view = await getSettingsDomain("integrations");
  const value = (key: string) => view.settings.find((item) => item.key === key)?.effectiveValue;
  return { scoopFeedUrl: validateScoopFeedUrl(String(value("scoopFeedUrl") ?? "https://scoop.co.za/scoop_pricelist.xml")) };
}
export async function patchSettingsDomain(domain: SettingsDomain, input: { revision: number; changes: Record<string, unknown>; confirmHighRisk?: boolean }, actor = "TekCentral Staff") {
  const store = await readStore(); const record = domainRecord(store, domain);
  if (input.revision !== record.revision) throw new SettingsConflictError("Settings changed by another administrator. Refresh before saving.");
  const definitions = new Map(definitionsFor(domain).map((item) => [item.key, item]));
  const entries = Object.entries(input.changes ?? {});
  if (!entries.length) return getSettingsDomain(domain);
  entries.forEach(([key, value]) => { const definition = definitions.get(key); if (!definition) throw new Error(`Unknown ${domain} setting: ${key}.`); validateFrameworkValue(definition, value); if (definition.risk === "HIGH" && !input.confirmHighRisk) throw new Error(`${definition.label} requires explicit confirmation.`); });
  const now = new Date().toISOString(); const values = { ...record.values }; const history: SettingsHistoryEntry[] = [];
  for (const [key, value] of entries) { const definition = definitions.get(key)!; const previousValue = values[key]; if (value === undefined || value === null || value === "") delete values[key]; else values[key] = typeof value === "string" ? value.trim() : value; if (JSON.stringify(previousValue) !== JSON.stringify(values[key])) history.push({ id: `framework-${Date.now()}-${key}`, domain, key, previousValue: definition.secret ? undefined : previousValue, newValue: definition.secret ? undefined : values[key], credentialChanged: definition.secret || undefined, actor, timestamp: now }); }
  const next: SettingsDomainRecord = { revision: record.revision + (history.length ? 1 : 0), values, updatedAt: history.length ? now : record.updatedAt, updatedBy: history.length ? actor : record.updatedBy };
  const updated: Store = { ...store, settingsDomains: { ...store.settingsDomains, [domain]: next }, settingsHistory: [...history, ...(store.settingsHistory ?? [])].slice(0, 1_000) };
  await writeStore(updated); return getSettingsDomain(domain);
}

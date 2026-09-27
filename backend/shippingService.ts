import { createHash, randomUUID } from "node:crypto";
import { backendDeliveryMethods, getBackendProduct } from "./catalogue.js";
import { getBusinessSettings, type ShippingSettings } from "./businessSettingsRepository.js";
import { listSupplierProductMappings } from "./supplierProductMappingRepository.js";
import { checkCjVariantDeliveryToSouthAfrica, type CjLogisticsOption } from "./suppliers/cj/cjOrderAdapter.js";
import { getScoopCatalogueProduct } from "./suppliers/scoop/scoopCatalogueRepository.js";
import { getShippingQuote, saveShippingQuote, type FulfilmentGroupQuote, type ShippingDiagnostic, type ShippingQuote, type ShippingQuoteItem } from "./shippingQuoteRepository.js";
import { estimateLocalShipping, LocalShippingEstimateError } from "./localShippingEstimator.js";

export interface ShippingQuoteInput {
  items: ShippingQuoteItem[];
  destination: { country: string; province: string; city?: string; suburb?: string; postalCode: string };
  deliveryMethodId: string;
}

export class ShippingQuoteError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

function money(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function quoteFingerprint(input: ShippingQuoteInput) {
  const items = [...input.items].map((item) => ({ productId: item.productId, quantity: item.quantity })).sort((a, b) => a.productId.localeCompare(b.productId));
  return createHash("sha256").update(JSON.stringify({ items, destination: input.destination, deliveryMethodId: input.deliveryMethodId })).digest("hex");
}
export function applyShippingPolicy(cost: number, settings: ShippingSettings) {
  let charge = cost * (1 + settings.shippingPriceBufferPercent / 100);
  charge = Math.max(settings.minimumShippingCharge, charge);
  if (settings.maximumShippingCharge !== undefined) charge = Math.min(settings.maximumShippingCharge, charge);
  return money(charge);
}
export function selectCustomerSafeCjRoute(options: CjLogisticsOption[]) {
  const knownIdRoutes = new Set(["CJPacket Liquid Line", "CJPacket Sensitive", "CJPacket Postal"]);
  return options.filter((option) => !knownIdRoutes.has(option.logisticName) && option.shippingCost !== undefined && option.estimatedDelivery)
    .sort((a, b) => (a.shippingCost ?? Infinity) - (b.shippingCost ?? Infinity))[0];
}
function publicGroup(group: FulfilmentGroupQuote) {
  const { internalSupplierCode: _supplier, internalMethod: _method, supplierShippingCost: _cost, estimatedInternalFreightCost: _estimateCost, actualSupplierFreightCost: _actualCost, bufferAmount: _buffer, policyType: _policy, zone: _zone, actualWeightKg: _actualWeight, volumetricWeightKg: _volumetricWeight, billableWeightKg: _billableWeight, rateCardVersion: _rateVersion, calculationVersion: _calculationVersion, provenance: _provenance, source: _source, diagnostics: _diagnostics, ...safe } = group;
  void _supplier; void _method; void _cost; void _estimateCost; void _actualCost; void _buffer; void _policy; void _zone; void _actualWeight; void _volumetricWeight; void _billableWeight; void _rateVersion; void _calculationVersion; void _provenance; void _source; void _diagnostics;
  return safe;
}
export function publicShippingQuote(quote: ShippingQuote) {
  const { supplierShippingCost: _cost, estimatedInternalFreightCost: _estimatedCost, settingsSnapshot: _settings, items: _items, diagnostics: _diagnostics, ...safe } = quote;
  void _cost; void _estimatedCost; void _settings; void _items; void _diagnostics;
  return { ...safe, fulfilmentGroups: quote.fulfilmentGroups.map(publicGroup) };
}

export async function createShippingQuote(input: ShippingQuoteInput): Promise<ShippingQuote> {
  const store = await getBusinessSettings();
  const settings = store.shipping;
  if (!settings.shippingEnabled) throw new ShippingQuoteError("SHIPPING_DISABLED", "Delivery quoting is currently unavailable.");
  if (!input.items.length) throw new ShippingQuoteError("EMPTY_CART", "Add an item before requesting delivery.");
  if (!input.destination.country.trim() || !input.destination.province.trim() || !/^\d{4}$/.test(input.destination.postalCode.trim())) throw new ShippingQuoteError("INVALID_ADDRESS", "We couldn't calculate delivery for this address. Please check the address and try again.");
  const method = backendDeliveryMethods.find((item) => item.id === input.deliveryMethodId && item.enabled);
  if (!method) throw new ShippingQuoteError("INVALID_DELIVERY_METHOD", "Choose a valid delivery method.");
  const normalizedItems = await Promise.all(input.items.map(async (item) => {
    if (!await getBackendProduct(item.productId)) throw new ShippingQuoteError("UNKNOWN_PRODUCT", `Unknown product ${item.productId}.`);
    return { productId: item.productId, quantity: Math.max(1, Math.min(99, Math.trunc(item.quantity))) };
  }));
  const mappings = (await listSupplierProductMappings()).filter((mapping) => mapping.status === "VERIFIED");
  const mappedItems = normalizedItems.filter((item) => mappings.some((mapping) => mapping.productId === item.productId && (mapping.supplierCode === "CJ" || mapping.supplierCode === "SCOOP")));
  if (input.deliveryMethodId === "express" && mappedItems.length > 0) throw new ShippingQuoteError("UNSUPPORTED_FULFILMENT", "Express delivery is not available for these items.");
  const grouped = new Map<string, { supplier: "CJ" | "SCOOP" | "LOCAL"; variantId?: string; items: ShippingQuoteItem[] }>();
  for (const item of normalizedItems) {
    const mapping = mappings.find((candidate) => candidate.productId === item.productId && (candidate.supplierCode === "CJ" || candidate.supplierCode === "SCOOP"));
    const supplier = mapping?.supplierCode === "CJ" ? "CJ" : mapping?.supplierCode === "SCOOP" ? "SCOOP" : "LOCAL";
    const key = supplier === "CJ" ? `CJ:${mapping?.supplierVariantId ?? item.productId}` : supplier;
    const group = grouped.get(key) ?? { supplier, variantId: mapping?.supplierVariantId, items: [] };
    group.items.push(item); grouped.set(key, group);
  }
  if (!settings.allowMixedSupplierCheckout && grouped.size > 1) throw new ShippingQuoteError("MIXED_CHECKOUT_DISABLED", "These items cannot currently be delivered together.");
  const groups: FulfilmentGroupQuote[] = [];
  for (const [groupId, group] of grouped) {
    const base = { groupId, itemProductIds: group.items.map((item) => item.productId), currency: "ZAR" as const, warnings: [] as string[] };
    if (group.supplier === "LOCAL") {
      groups.push({ ...base, kind: "LOCAL", customerLabel: "Local delivery", customerCharge: method.price, supplierShippingCost: method.price, estimate: method.estimatedRange, source: "TEKCENTRAL_CONFIGURED", internalSupplierCode: "TEKCENTRAL", internalMethod: method.name });
      continue;
    }
    if (group.supplier === "SCOOP") {
      const diagnostics: ShippingDiagnostic[] = [];
      const estimateItems: { productId: string; quantity: number; weightGrams: number; lengthMm: number; widthMm: number; heightMm: number }[] = [];
      for (const item of group.items) {
        const mapping = mappings.find((candidate) => candidate.productId === item.productId && candidate.supplierCode === "SCOOP");
        const offer = mapping ? await getScoopCatalogueProduct(mapping.supplierSku) : undefined;
        if (!offer) diagnostics.push({ code: "UNKNOWN_PRODUCT_SOURCE", productId: item.productId, fulfilmentGroup: groupId, source: "SCOOP" });
        else if (offer.availability === "STALE") diagnostics.push({ code: "STALE_LOGISTICS", productId: item.productId, fulfilmentGroup: groupId, source: "SCOOP" });
        else if (!offer.logisticsMetadata) diagnostics.push({ code: "MISSING_LOGISTICS", productId: item.productId, fulfilmentGroup: groupId, source: "SCOOP" });
        else {
          if (!offer.logisticsMetadata.weightGrams) diagnostics.push({ code: "MISSING_WEIGHT", productId: item.productId, fulfilmentGroup: groupId, source: "SCOOP", missingPrerequisite: "weightGrams" });
          if (!offer.logisticsMetadata.lengthMm || !offer.logisticsMetadata.widthMm || !offer.logisticsMetadata.heightMm) diagnostics.push({ code: "MISSING_DIMENSIONS", productId: item.productId, fulfilmentGroup: groupId, source: "SCOOP", missingPrerequisite: "dimensions" });
          if (offer.logisticsMetadata.status === "COMPLETE" && offer.logisticsMetadata.weightGrams && offer.logisticsMetadata.lengthMm && offer.logisticsMetadata.widthMm && offer.logisticsMetadata.heightMm) estimateItems.push({ productId: item.productId, quantity: item.quantity, weightGrams: offer.logisticsMetadata.weightGrams, lengthMm: offer.logisticsMetadata.lengthMm, widthMm: offer.logisticsMetadata.widthMm, heightMm: offer.logisticsMetadata.heightMm });
        }
      }
      if (settings.scoopMode === "ZONE_ESTIMATE" && diagnostics.length === 0) {
        try {
          const estimate = estimateLocalShipping({ items: estimateItems, destination: input.destination, rateCard: settings.localRateCard });
          groups.push({ ...base, kind: "LOCAL", customerLabel: "Standard Delivery", customerDescription: "Estimated delivery based on your address and shipment size.", customerCharge: estimate.customerShippingCharge, estimatedInternalFreightCost: estimate.estimatedInternalFreightCost, bufferAmount: estimate.bufferAmount, policyType: estimate.policyType, zone: estimate.zoneId, actualWeightKg: estimate.actualWeightKg, volumetricWeightKg: estimate.volumetricWeightKg, billableWeightKg: estimate.billableWeightKg, rateCardVersion: estimate.rateCardVersion, calculationVersion: estimate.calculationVersion, provenance: estimate.provenance, estimate: estimate.transitEstimate, source: "TEKCENTRAL_ZONE_ESTIMATE", internalSupplierCode: "SCOOP", internalMethod: "ZONE_ESTIMATE", warnings: [] });
          continue;
        } catch (error) {
          const code = error instanceof LocalShippingEstimateError ? error.code : "CALCULATION_ERROR";
          diagnostics.push({ code, fulfilmentGroup: groupId, source: "SCOOP" });
        }
      }
      let configured: number | undefined; let estimate: string | undefined;
      if (settings.scoopMode === "CONFIGURED_FLAT" || settings.scoopMode === "FLAT_RATE") configured = settings.scoopFlatCharge;
      if (settings.scoopMode === "CONFIGURED_ZONE") {
        const zone = settings.scoopZones.find((candidate) => candidate.provinces.includes(input.destination.province));
        configured = zone?.charge; estimate = zone?.estimate;
      }
      if (settings.scoopMode === "MANUAL_QUOTE" || settings.scoopMode === "CARRIER_QUOTE" || settings.scoopMode === "SUPPLIER_QUOTE") diagnostics.push({ code: "UNSUPPORTED_FULFILMENT", fulfilmentGroup: groupId, source: "SCOOP", missingPrerequisite: "configured Scoop shipping policy" });
      if (diagnostics.length) console.warn("Shipping quote diagnostic", diagnostics);
      groups.push({ ...base, kind: "LOCAL", customerLabel: "Standard local delivery", customerCharge: diagnostics.length || configured === undefined ? undefined : applyShippingPolicy(configured, settings), supplierShippingCost: configured, estimate, source: "SCOOP_CONFIGURED", internalSupplierCode: "SCOOP", warnings: configured === undefined ? ["Delivery could not be calculated for this address."] : diagnostics.length ? ["Delivery prerequisites are incomplete."] : [], diagnostics });
      continue;
    }
    if (!group.variantId) {
      groups.push({ ...base, kind: "INTERNATIONAL", customerLabel: "Standard international delivery", source: "CJ_LOGISTICS", internalSupplierCode: "CJ", warnings: ["Verified supplier variant is missing."] });
      continue;
    }
    const result = await checkCjVariantDeliveryToSouthAfrica({ supplierVariantId: group.variantId });
    const option = selectCustomerSafeCjRoute(result.logisticsOptions);
    const sourceCost = option?.shippingCost;
    const sourceCurrency = option?.currency ?? "USD";
    let costZar: number | undefined;
    if (sourceCost !== undefined && sourceCurrency === "ZAR") costZar = sourceCost;
    else if (sourceCost !== undefined && store.pricing.cjManualFxRate) costZar = sourceCost * store.pricing.cjManualFxRate;
    const warning = !option ? (result.diagnosticReasons?.[0] ?? "No eligible international delivery method is available.") : costZar === undefined ? "A current shipping exchange rate is required." : undefined;
    groups.push({ ...base, kind: "INTERNATIONAL", customerLabel: "Standard international delivery", customerCharge: costZar === undefined ? undefined : applyShippingPolicy(costZar, settings), supplierShippingCost: costZar, estimate: option?.estimatedDelivery, source: "CJ_LOGISTICS", internalSupplierCode: "CJ", internalMethod: option?.logisticName, warnings: warning ? [warning] : [] });
  }
  const ready = groups.filter((group) => group.customerCharge !== undefined);
  const status = ready.length === groups.length ? "READY" : ready.length ? "PARTIAL" : "UNAVAILABLE";
  const now = new Date();
  const quote: ShippingQuote = {
    quoteId: `shipping-${randomUUID()}`, cartFingerprint: quoteFingerprint({ ...input, items: normalizedItems }), items: normalizedItems,
    destination: input.destination, deliveryMethodId: input.deliveryMethodId, currency: "ZAR", fulfilmentGroups: groups,
    customerShippingCharge: status === "READY" ? money(groups.reduce((sum, group) => sum + (group.customerCharge ?? 0), 0)) : undefined,
    supplierShippingCost: status === "READY" && groups.every((group) => group.supplierShippingCost !== undefined) ? money(groups.reduce((sum, group) => sum + (group.supplierShippingCost ?? 0), 0)) : undefined,
    estimatedInternalFreightCost: status === "READY" && groups.some((group) => group.estimatedInternalFreightCost !== undefined) ? money(groups.reduce((sum, group) => sum + (group.estimatedInternalFreightCost ?? 0), 0)) : undefined,
    generatedAt: now.toISOString(), expiresAt: new Date(now.getTime() + settings.quoteValidityMinutes * 60_000).toISOString(), status,
    warnings: groups.flatMap((group) => group.warnings), diagnostics: groups.flatMap((group) => group.diagnostics ?? []), settingsSnapshot: structuredClone(settings),
  };
  await saveShippingQuote(quote); return quote;
}
export async function createShippingOptions(input: Omit<ShippingQuoteInput, "deliveryMethodId">) {
  return (await createShippingOptionsResult(input)).options;
}

export type ShippingOptionsOutcome = "QUOTE_READY" | "QUOTE_NO_MATCHING_ZONE" | "QUOTE_RATE_NOT_CONFIGURED" | "QUOTE_MISSING_LOGISTICS" | "QUOTE_UNAVAILABLE_POLICY" | "QUOTE_FAILED";
export interface ShippingOptionsResult {
  options: ShippingQuote[];
  outcome: ShippingOptionsOutcome;
  reason?: "NO_AUTOMATED_RATE_POLICY" | "NO_MATCHING_ZONE" | "RATE_NOT_CONFIGURED" | "MISSING_LOGISTICS" | "SHIPPING_PREREQUISITES_UNAVAILABLE";
}

export async function createShippingOptionsResult(input: Omit<ShippingQuoteInput, "deliveryMethodId">): Promise<ShippingOptionsResult> {
  const options: ShippingQuote[] = [];
  const unavailable: ShippingQuote[] = [];
  for (const method of backendDeliveryMethods.filter((item) => item.enabled)) {
    try {
      const quote = await createShippingQuote({ ...input, deliveryMethodId: method.id });
      if (quote.status === "READY" && quote.customerShippingCharge !== undefined) options.push(quote);
      else unavailable.push(quote);
    }
    catch (error) { if (!(error instanceof ShippingQuoteError) || error.code !== "UNSUPPORTED_FULFILMENT") throw error; }
  }
  if (options.length) return { options, outcome: "QUOTE_READY" };
  const codes = new Set(unavailable.flatMap((quote) => quote.diagnostics?.map((diagnostic) => diagnostic.code) ?? []));
  if (codes.has("RATE_NOT_CONFIGURED")) return { options, outcome: "QUOTE_RATE_NOT_CONFIGURED", reason: "RATE_NOT_CONFIGURED" };
  if (codes.has("UNSUPPORTED_DESTINATION")) return { options, outcome: "QUOTE_NO_MATCHING_ZONE", reason: "NO_MATCHING_ZONE" };
  if (["MISSING_LOGISTICS", "MISSING_WEIGHT", "MISSING_DIMENSIONS", "STALE_LOGISTICS"].some((code) => codes.has(code as ShippingDiagnostic["code"]))) return { options, outcome: "QUOTE_MISSING_LOGISTICS", reason: "MISSING_LOGISTICS" };
  if (codes.has("UNSUPPORTED_FULFILMENT")) return { options, outcome: "QUOTE_UNAVAILABLE_POLICY", reason: "NO_AUTOMATED_RATE_POLICY" };
  return { options, outcome: "QUOTE_FAILED", reason: "SHIPPING_PREREQUISITES_UNAVAILABLE" };
}

export async function testScoopZoneEstimate(input: { supplierSku: string; quantity: number; destination: { province: string; city?: string; postalCode: string } }) {
  const settings = (await getBusinessSettings()).shipping;
  const blocked = (blocker: "SKU_NOT_FOUND" | "MISSING_LOGISTICS" | "RATE_CARD_DISABLED" | "POLICY_NOT_ZONE_ESTIMATE" | "NO_MATCHING_ZONE" | "INVALID_DESTINATION" | "CALCULATION_ERROR") => ({ success: false as const, policy: settings.scoopMode, rateCardVersion: settings.localRateCard.version, blocker });
  if (settings.scoopMode !== "ZONE_ESTIMATE") return blocked("POLICY_NOT_ZONE_ESTIMATE");
  if (!settings.localRateCard.enabled || settings.localRateCard.version < 1 || !settings.localRateCard.zones.some((zone) => zone.enabled)) return blocked("RATE_CARD_DISABLED");
  if (!input.destination.province.trim() || !/^\d{4}$/.test(input.destination.postalCode.trim())) return blocked("INVALID_DESTINATION");
  const offer = await getScoopCatalogueProduct(input.supplierSku.trim());
  const logistics = offer?.logisticsMetadata;
  if (!offer) return blocked("SKU_NOT_FOUND");
  if (!logistics || logistics.status !== "COMPLETE" || !logistics.weightGrams || !logistics.lengthMm || !logistics.widthMm || !logistics.heightMm) return blocked("MISSING_LOGISTICS");
  try {
    const estimate = estimateLocalShipping({ items: [{ productId: offer.supplierSku, quantity: Math.max(1, Math.trunc(input.quantity)), weightGrams: logistics.weightGrams, lengthMm: logistics.lengthMm, widthMm: logistics.widthMm, heightMm: logistics.heightMm }], destination: input.destination, rateCard: settings.localRateCard });
    return { success: true as const, policy: settings.scoopMode, zoneId: estimate.zoneId, matchedBy: estimate.zoneMatchMethod, actualWeightKg: estimate.actualWeightKg, volumetricWeightKg: estimate.volumetricWeightKg, billableWeightKg: estimate.billableWeightKg, baseCharge: estimate.baseCharge, additionalWeightCharge: estimate.additionalWeightCharge, operationalBuffer: estimate.percentageBufferAmount, fixedBuffer: estimate.fixedBufferAmount, customerCharge: estimate.customerShippingCharge, transitDaysMin: estimate.transitDaysMin, transitDaysMax: estimate.transitDaysMax, rateCardVersion: estimate.rateCardVersion };
  } catch (error) {
    if (error instanceof LocalShippingEstimateError && error.code === "UNSUPPORTED_DESTINATION") return blocked("NO_MATCHING_ZONE");
    if (error instanceof LocalShippingEstimateError && error.code === "MISSING_LOGISTICS") return blocked("MISSING_LOGISTICS");
    return blocked("CALCULATION_ERROR");
  }
}
export async function requireShippingQuote(id: string, input: ShippingQuoteInput) {
  const quote = await getShippingQuote(id);
  if (!quote) throw new ShippingQuoteError("QUOTE_NOT_FOUND", "Delivery quote was not found. Please calculate delivery again.");
  if (quote.cartFingerprint !== quoteFingerprint(input)) throw new ShippingQuoteError("QUOTE_MISMATCH", "Delivery details changed. Please calculate delivery again.");
  if (quote.status !== "READY" || quote.customerShippingCharge === undefined) throw new ShippingQuoteError("QUOTE_UNAVAILABLE", "We couldn't confirm delivery for one or more items. Please try again or contact us for assistance.");
  if (Date.parse(quote.expiresAt) <= Date.now()) throw new ShippingQuoteError("QUOTE_EXPIRED", "Your delivery quote expired. Please calculate delivery again.");
  return quote;
}
export async function revalidateShippingQuote(id: string) {
  const previous = await getShippingQuote(id);
  if (!previous) throw new ShippingQuoteError("QUOTE_NOT_FOUND", "Delivery quote was not found.");
  const quote = await createShippingQuote({ items: previous.items, destination: previous.destination, deliveryMethodId: previous.deliveryMethodId });
  const comparison = (group: FulfilmentGroupQuote) => [group.customerLabel, group.customerCharge, group.estimate, group.actualWeightKg, group.volumetricWeightKg, group.billableWeightKg, group.rateCardVersion, group.calculationVersion];
  const changed = quote.customerShippingCharge !== previous.customerShippingCharge || JSON.stringify(quote.fulfilmentGroups.map(comparison)) !== JSON.stringify(previous.fulfilmentGroups.map(comparison));
  return { quote, changed };
}

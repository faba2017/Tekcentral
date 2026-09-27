export type ShippingPolicyType = "MANUAL_QUOTE" | "FLAT_RATE" | "ZONE_ESTIMATE" | "CARRIER_QUOTE" | "SUPPLIER_QUOTE";
export type ShippingRoundingMode = "NONE" | "NEAREST_1" | "NEAREST_5";

export interface LocalShippingZoneRate {
  id: string;
  label: string;
  enabled: boolean;
  postalCodeRanges: { from: number; to: number }[];
  provinces: string[];
  cities: string[];
  baseCharge: number;
  includedWeightKg: number;
  additionalRatePerKg: number;
  minimumCharge: number;
  maximumCharge?: number;
  estimatedTransitDaysMin: number;
  estimatedTransitDaysMax: number;
}

export interface LocalShippingRateCard {
  enabled: boolean;
  version: number;
  environment: "PRODUCTION" | "TEST_NOT_PRODUCTION";
  origin: { city: string; province: string; postalCode?: string };
  volumetricDivisorCm3PerKg: number;
  percentageBuffer: number;
  fixedBufferRand: number;
  roundingMode: ShippingRoundingMode;
  zones: LocalShippingZoneRate[];
}

export interface LocalShipmentItem {
  productId: string;
  quantity: number;
  weightGrams: number;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
}

export interface LocalShippingEstimate {
  policyType: "ZONE_ESTIMATE";
  zoneId: string;
  zoneLabel: string;
  zoneMatchMethod: "POSTAL_CODE" | "CITY" | "PROVINCE";
  actualWeightKg: number;
  volumetricWeightKg: number;
  billableWeightKg: number;
  estimatedInternalFreightCost: number;
  baseCharge: number;
  additionalWeightCharge: number;
  percentageBufferAmount: number;
  fixedBufferAmount: number;
  bufferAmount: number;
  customerShippingCharge: number;
  transitEstimate: string;
  transitDaysMin: number;
  transitDaysMax: number;
  rateCardVersion: number;
  calculationVersion: "LOCAL_ZONE_ESTIMATE_V1";
  provenance: "TEKCENTRAL_RATE_CARD_ESTIMATE";
}

export class LocalShippingEstimateError extends Error {
  constructor(public code: "RATE_NOT_CONFIGURED" | "UNSUPPORTED_DESTINATION" | "MISSING_LOGISTICS" | "CALCULATION_ERROR", message: string) { super(message); }
}

const precise = (value: number) => Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateVolumetricWeightKg(lengthMm: number, widthMm: number, heightMm: number, divisor: number) {
  if (![lengthMm, widthMm, heightMm, divisor].every((value) => Number.isFinite(value) && value > 0)) throw new LocalShippingEstimateError("MISSING_LOGISTICS", "Valid dimensions and volumetric divisor are required.");
  return precise(((lengthMm / 10) * (widthMm / 10) * (heightMm / 10)) / divisor);
}

export function resolveLocalShippingZoneMatch(destination: { province: string; city?: string; postalCode: string }, zones: LocalShippingZoneRate[]) {
  if (!destination.province.trim() || !/^\d{4}$/.test(destination.postalCode.trim())) throw new LocalShippingEstimateError("UNSUPPORTED_DESTINATION", "A valid South African destination is required.");
  const postalCode = Number(destination.postalCode);
  const city = destination.city?.trim().toLowerCase();
  const province = destination.province.trim().toLowerCase();
  const enabled = zones.filter((zone) => zone.enabled);
  const postal = enabled.find((zone) => zone.postalCodeRanges.some((range) => postalCode >= range.from && postalCode <= range.to));
  if (postal) return { zone: postal, matchMethod: "POSTAL_CODE" as const };
  const cityMatch = enabled.find((zone) => city && zone.cities.some((value) => value.trim().toLowerCase() === city));
  if (cityMatch) return { zone: cityMatch, matchMethod: "CITY" as const };
  const provinceMatch = enabled.find((zone) => zone.provinces.some((value) => value.trim().toLowerCase() === province));
  return provinceMatch ? { zone: provinceMatch, matchMethod: "PROVINCE" as const } : undefined;
}
export function resolveLocalShippingZone(destination: { province: string; city?: string; postalCode: string }, zones: LocalShippingZoneRate[]) { return resolveLocalShippingZoneMatch(destination, zones)?.zone; }

export function roundShippingCharge(value: number, mode: ShippingRoundingMode) {
  if (mode === "NEAREST_5") return Math.round(value / 5) * 5;
  if (mode === "NEAREST_1") return Math.round(value);
  return money(value);
}

export function estimateLocalShipping(input: { items: LocalShipmentItem[]; destination: { province: string; city?: string; postalCode: string }; rateCard: LocalShippingRateCard }): LocalShippingEstimate {
  const { rateCard } = input;
  if (!rateCard.enabled || rateCard.version < 1 || !rateCard.zones.length) throw new LocalShippingEstimateError("RATE_NOT_CONFIGURED", "A local delivery rate card is not configured.");
  if (!input.items.length) throw new LocalShippingEstimateError("CALCULATION_ERROR", "At least one shipment item is required.");
  const match = resolveLocalShippingZoneMatch(input.destination, rateCard.zones);
  if (!match) throw new LocalShippingEstimateError("UNSUPPORTED_DESTINATION", "No configured delivery zone matches this destination.");
  const { zone } = match;
  let actualWeightKg = 0;
  let volumetricWeightKg = 0;
  for (const item of input.items) {
    if (![item.weightGrams, item.lengthMm, item.widthMm, item.heightMm].every((value) => Number.isFinite(value) && value > 0)) throw new LocalShippingEstimateError("MISSING_LOGISTICS", `Product ${item.productId} is missing complete logistics data.`);
    const quantity = Math.max(1, Math.trunc(item.quantity));
    actualWeightKg += (item.weightGrams / 1_000) * quantity;
    volumetricWeightKg += calculateVolumetricWeightKg(item.lengthMm, item.widthMm, item.heightMm, rateCard.volumetricDivisorCm3PerKg) * quantity;
  }
  actualWeightKg = precise(actualWeightKg);
  volumetricWeightKg = precise(volumetricWeightKg);
  const billableWeightKg = Math.max(actualWeightKg, volumetricWeightKg);
  const additionalWeight = Math.max(0, billableWeightKg - zone.includedWeightKg);
  const additionalWeightCharge = money(additionalWeight * zone.additionalRatePerKg);
  let estimatedInternalFreightCost = zone.baseCharge + additionalWeightCharge;
  estimatedInternalFreightCost = Math.max(zone.minimumCharge, estimatedInternalFreightCost);
  if (zone.maximumCharge !== undefined) estimatedInternalFreightCost = Math.min(zone.maximumCharge, estimatedInternalFreightCost);
  estimatedInternalFreightCost = money(estimatedInternalFreightCost);
  const percentageBufferAmount = money(estimatedInternalFreightCost * rateCard.percentageBuffer / 100);
  const fixedBufferAmount = money(rateCard.fixedBufferRand);
  const bufferAmount = money(percentageBufferAmount + fixedBufferAmount);
  const customerShippingCharge = money(roundShippingCharge(estimatedInternalFreightCost + bufferAmount, rateCard.roundingMode));
  return {
    policyType: "ZONE_ESTIMATE", zoneId: zone.id, zoneLabel: zone.label, zoneMatchMethod: match.matchMethod,
    actualWeightKg, volumetricWeightKg, billableWeightKg, estimatedInternalFreightCost,
    baseCharge: zone.baseCharge, additionalWeightCharge,
    percentageBufferAmount, fixedBufferAmount, bufferAmount, customerShippingCharge,
    transitEstimate: `Estimated ${zone.estimatedTransitDaysMin}-${zone.estimatedTransitDaysMax} business days`,
    transitDaysMin: zone.estimatedTransitDaysMin, transitDaysMax: zone.estimatedTransitDaysMax,
    rateCardVersion: rateCard.version, calculationVersion: "LOCAL_ZONE_ESTIMATE_V1", provenance: "TEKCENTRAL_RATE_CARD_ESTIMATE",
  };
}

export type FreightVarianceStatus = "WITHIN_TOLERANCE" | "UNDER_RECOVERED" | "OVER_RECOVERED";
export function calculateFreightReconciliation(input: { estimatedInternalFreightCost: number; actualFreightCost: number; customerShippingCharge: number; toleranceRand?: number }) {
  const varianceRand = money(input.customerShippingCharge - input.actualFreightCost);
  const variancePercent = input.actualFreightCost === 0 ? undefined : money((varianceRand / input.actualFreightCost) * 100);
  const tolerance = input.toleranceRand ?? 0;
  const status: FreightVarianceStatus = Math.abs(varianceRand) <= tolerance ? "WITHIN_TOLERANCE" : varianceRand < 0 ? "UNDER_RECOVERED" : "OVER_RECOVERED";
  return { ...input, varianceRand, variancePercent, status };
}

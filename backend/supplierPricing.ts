export interface SupplierPricingPreparation {
  currency: string;
  vatRate: number;
  supplierCostExVat?: number;
  supplierVatAmount?: number;
  supplierCostInclVat?: number;
  referenceRetailInclVat?: number;
  retailGrossSpreadVsCostExVat?: number;
  retailGrossSpreadVsCostInclVat?: number;
  proposedSellingPriceInclVat?: number;
  grossProfit?: number;
  grossMarginPercent?: number;
  markupPercent?: number;
}

function money(value: number) {
  return Number(value.toFixed(2));
}

export function applyPricingRounding(value: number, mode: PricingRoundingMode) {
  if (mode === "NONE") return money(value);
  if (mode === "END_99") return Math.max(0, Math.ceil(value) - 0.01);
  const increment = mode === "NEAREST_5" ? 5 : mode === "NEAREST_10" ? 10 : 1;
  return money(Math.round(value / increment) * increment);
}

export function applyPricingRoundingAtOrAbove(value: number, mode: PricingRoundingMode) {
  const rounded = applyPricingRounding(value, mode);
  if (rounded >= value - 0.000_001) return rounded;
  if (mode === "NONE") return money(Math.ceil(value * 100) / 100);
  if (mode === "END_99") return money(Math.ceil(value + 0.01) - 0.01);
  const increment = mode === "NEAREST_5" ? 5 : mode === "NEAREST_10" ? 10 : 1;
  return money(Math.ceil(value / increment) * increment);
}

export function calculateProposedPrice(input: SupplierPricingInput, settings: PricingSettings): SupplierPricingResult {
  const warnings: PricingWarning[] = [];
  const costExVat = input.landedCostExVat ?? input.supplierCostExVat;
  if (input.currency !== "ZAR" && !input.fxRateUsed) warnings.push("MISSING_FX_RATE");
  if (input.fxRateUsed && Date.now() - new Date(input.fxCapturedAt ?? input.pricingTimestamp).getTime() > settings.fxStaleAfterHours * 3_600_000) warnings.push("STALE_FX_RATE");
  if (costExVat === undefined || !Number.isFinite(costExVat) || costExVat < 0) {
    const resultWarnings = [...warnings, "NO_VALID_PRICING_BAND"] as PricingWarning[];
    return { vatRatePercent: settings.vatRatePercent, referenceRetailInclVat: input.referenceRetailInclVat, warnings: resultWarnings, warningDetails: resultWarnings.map((code) => classifyPricingWarning(code, { referencePriceBehavior: settings.referencePriceBehavior })) };
  }
  const band = settings.pricingBands.find((item) => costExVat >= item.minimumCost && (item.maximumCost === undefined || costExVat < item.maximumCost));
  if (!band) {
    const resultWarnings = [...warnings, "NO_VALID_PRICING_BAND"] as PricingWarning[];
    return { vatRatePercent: settings.vatRatePercent, referenceRetailInclVat: input.referenceRetailInclVat, warnings: resultWarnings, warningDetails: resultWarnings.map((code) => classifyPricingWarning(code, { referencePriceBehavior: settings.referencePriceBehavior })) };
  }
  const marginPrice = costExVat / (1 - band.targetGrossMarginPercent / 100);
  const profitFloorPrice = costExVat + (band.minimumGrossProfit ?? 0);
  const sellingExVatBeforeRounding = Math.max(marginPrice, profitFloorPrice);
  const vatRate = settings.vatRatePercent / 100;
  const unroundedInclVat = sellingExVatBeforeRounding * (1 + vatRate);
  const roundedCandidate = applyPricingRounding(unroundedInclVat, settings.roundingMode);
  const roundedCandidateScenario = priceScenario(roundedCandidate, costExVat, vatRate, band.targetGrossMarginPercent, band.minimumGrossProfit);
  const roundedInclVat = roundedCandidateScenario.minimumProfitPasses && roundedCandidateScenario.targetMarginPasses
    ? roundedCandidate
    : applyPricingRoundingAtOrAbove(unroundedInclVat, settings.roundingMode);
  const targetMarginProposal = priceScenario(roundedInclVat, costExVat, vatRate, band.targetGrossMarginPercent, band.minimumGrossProfit);
  let proposedInclVat = roundedInclVat;
  if (settings.referencePriceBehavior === "SOFT_CEILING" && input.referenceRetailInclVat !== undefined && proposedInclVat > input.referenceRetailInclVat) proposedInclVat = input.referenceRetailInclVat;
  const proposedExVat = money(proposedInclVat / (1 + vatRate));
  const vatAmount = money(proposedInclVat - proposedExVat);
  const grossProfit = money(proposedExVat - costExVat);
  const grossMarginPercent = proposedExVat ? money((grossProfit / proposedExVat) * 100) : 0;
  const markupPercent = costExVat ? money((grossProfit / costExVat) * 100) : 0;
  if (band.minimumGrossProfit !== undefined && grossProfit < band.minimumGrossProfit) warnings.push("BELOW_MINIMUM_PROFIT");
  if (grossMarginPercent < band.targetGrossMarginPercent - TARGET_MARGIN_TOLERANCE_PERCENTAGE_POINTS) warnings.push("BELOW_TARGET_MARGIN");
  if (input.referenceRetailInclVat === undefined) warnings.push("MISSING_REFERENCE_RETAIL");
  else if (settings.referencePriceBehavior !== "IGNORE" && roundedInclVat > input.referenceRetailInclVat) warnings.push("ABOVE_REFERENCE_RETAIL");
  const competitiveSuggestion = input.referenceRetailInclVat !== undefined && roundedInclVat > input.referenceRetailInclVat
    ? calculateCompetitiveSuggestion(input.referenceRetailInclVat, roundedInclVat, costExVat, settings.vatRatePercent, band.targetGrossMarginPercent, band.minimumGrossProfit)
    : undefined;
  const warningDetails = warnings.map((code) => classifyPricingWarning(code, { referencePriceBehavior: settings.referencePriceBehavior }));
  return { appliedPricingBand: band, vatRatePercent: settings.vatRatePercent, targetMarginProposal, competitiveSuggestion, proposedSellingPriceExVat: proposedExVat, vatAmount, proposedSellingPriceInclVat: proposedInclVat, grossProfit, grossMarginPercent, markupPercent, referenceRetailInclVat: input.referenceRetailInclVat, warnings, warningDetails };
}

export function scoopPricingInput(input: { supplierOfferId: string; dealerPriceExVat: number; referenceRetailInclVat?: number; pricingTimestamp: string }): SupplierPricingInput {
  return { supplierId: "SCOOP", supplierOfferId: input.supplierOfferId, currency: "ZAR", supplierCostExVat: input.dealerPriceExVat, referenceRetailInclVat: input.referenceRetailInclVat, pricingTimestamp: input.pricingTimestamp };
}

export function syntechPricingInput(input: { supplierOfferId: string; effectiveDealerCostExVat: number; referenceRetailInclVat?: number; pricingTimestamp: string }): SupplierPricingInput {
  return { supplierId: "SYNTECH", supplierOfferId: input.supplierOfferId, currency: "ZAR", supplierCostExVat: input.effectiveDealerCostExVat, referenceRetailInclVat: input.referenceRetailInclVat, pricingTimestamp: input.pricingTimestamp };
}

export function tekCentralManualPricingInput(input: { supplierOfferId: string; sourceCostExVat: number; pricingTimestamp: string }): SupplierPricingInput {
  return { supplierId: "TEKCENTRAL", supplierOfferId: input.supplierOfferId, currency: "ZAR", supplierCostExVat: input.sourceCostExVat, pricingTimestamp: input.pricingTimestamp };
}

export function tvrPricingInput(input: { supplierOfferId: string; sourceCost: number; taxBasis: "EXCLUSIVE" | "INCLUSIVE"; vatRatePercent: number; pricingTimestamp: string; sourcePriceField?: string }): SupplierPricingInput {
  const supplierCostExVat = input.taxBasis === "EXCLUSIVE" ? money(input.sourceCost) : money(input.sourceCost / (1 + input.vatRatePercent / 100));
  return { supplierId: "TVR", supplierOfferId: input.supplierOfferId, currency: "ZAR", supplierCostExVat, supplierCostInclVat: input.taxBasis === "INCLUSIVE" ? money(input.sourceCost) : undefined, sourceCostAmount: money(input.sourceCost), sourceCurrency: "ZAR", sourceTaxBasis: input.taxBasis, sourcePriceField: input.sourcePriceField, pricingTimestamp: input.pricingTimestamp };
}

export function cjLandedCostPricingInput(input: { supplierOfferId: string; currency: string; productCost: number; shippingCost: number; fxRate?: number; fxBufferPercent: number; pricingTimestamp: string; includeShippingInCost?: boolean; fxCapturedAt?: string; fxProvider?: string; fxSourceReference?: string }): SupplierPricingInput {
  const sourceCost = money(input.productCost + (input.includeShippingInCost === false ? 0 : input.shippingCost));
  if (input.currency === "ZAR") return { supplierId: "CJ", supplierOfferId: input.supplierOfferId, currency: "ZAR", landedCostExVat: sourceCost, shippingCost: input.shippingCost, sourceCostAmount: input.productCost, sourceCurrency: input.currency, pricingTimestamp: input.pricingTimestamp };
  const landedCostExVat = input.fxRate === undefined ? undefined : money(sourceCost * input.fxRate * (1 + input.fxBufferPercent / 100));
  return { supplierId: "CJ", supplierOfferId: input.supplierOfferId, currency: input.currency, landedCostExVat, shippingCost: input.shippingCost, sourceCostAmount: input.productCost, sourceCurrency: input.currency, fxRateUsed: input.fxRate, fxBufferPercent: input.fxBufferPercent, fxCapturedAt: input.fxCapturedAt, fxProvider: input.fxProvider, fxSourceReference: input.fxSourceReference, pricingTimestamp: input.pricingTimestamp };
}

export function prepareSupplierPricing(input: {
  currency: string;
  vatRate: number;
  supplierCostExVat?: number;
  referenceRetailInclVat?: number;
  proposedSellingPriceInclVat?: number;
}): SupplierPricingPreparation {
  const supplierVatAmount = input.supplierCostExVat === undefined
    ? undefined
    : money(input.supplierCostExVat * input.vatRate);
  const supplierCostInclVat = input.supplierCostExVat === undefined || supplierVatAmount === undefined
    ? undefined
    : money(input.supplierCostExVat + supplierVatAmount);
  const grossProfit = input.proposedSellingPriceInclVat === undefined || supplierCostInclVat === undefined
    ? undefined
    : money(input.proposedSellingPriceInclVat - supplierCostInclVat);
  const grossMarginPercent = grossProfit === undefined || !input.proposedSellingPriceInclVat
    ? undefined
    : money((grossProfit / input.proposedSellingPriceInclVat) * 100);
  const markupPercent = grossProfit === undefined || !supplierCostInclVat
    ? undefined
    : money((grossProfit / supplierCostInclVat) * 100);

  return {
    currency: input.currency,
    vatRate: input.vatRate,
    supplierCostExVat: input.supplierCostExVat,
    supplierVatAmount,
    supplierCostInclVat,
    referenceRetailInclVat: input.referenceRetailInclVat,
    retailGrossSpreadVsCostExVat:
      input.referenceRetailInclVat === undefined || input.supplierCostExVat === undefined
        ? undefined
        : money(input.referenceRetailInclVat - input.supplierCostExVat),
    retailGrossSpreadVsCostInclVat:
      input.referenceRetailInclVat === undefined || supplierCostInclVat === undefined
        ? undefined
        : money(input.referenceRetailInclVat - supplierCostInclVat),
    proposedSellingPriceInclVat: input.proposedSellingPriceInclVat,
    grossProfit,
    grossMarginPercent,
    markupPercent,
  };
}
import type { PricingSettings, PricingBand, PricingRoundingMode, ReferencePriceBehavior } from "./businessSettingsRepository.js";

export type PricingWarning = "SELLING_BELOW_COST" | "BELOW_MINIMUM_PROFIT" | "BELOW_TARGET_MARGIN" | "ABOVE_REFERENCE_RETAIL" | "MISSING_REFERENCE_RETAIL" | "STALE_SUPPLIER_COST" | "MISSING_FX_RATE" | "STALE_FX_RATE" | "NO_VALID_PRICING_BAND";
export type PricingWarningSeverity = "INFO" | "WARNING" | "BLOCKING";
export const TARGET_MARGIN_TOLERANCE_PERCENTAGE_POINTS = 0.1;
export interface PricingWarningDetail { code: PricingWarning; severity: PricingWarningSeverity; message: string; }
export interface PricingScenario {
  suggestedPriceInclVat: number; suggestedPriceExVat: number; grossProfitExVat: number;
  grossMarginPercent: number; markupPercent: number; minimumProfitPasses: boolean;
  targetMarginPasses: boolean; referenceRetailDelta: number;
}
export interface CompetitivePricingSuggestion extends PricingScenario { viability: "VIABLE_BELOW_TARGET_MARGIN" | "NOT_COMMERCIALLY_VIABLE"; }
export interface SupplierPricingInput {
  supplierId: string; supplierOfferId: string; currency: string;
  supplierCostExVat?: number; supplierCostInclVat?: number;
  landedCostExVat?: number; landedCostInclVat?: number;
  referenceRetailInclVat?: number; shippingCost?: number;
  fxRateUsed?: number; fxBufferPercent?: number; pricingTimestamp: string;
  sourceCostAmount?: number; sourceCurrency?: string; fxCapturedAt?: string; fxProvider?: string; fxSourceReference?: string;
  sourceTaxBasis?: "EXCLUSIVE" | "INCLUSIVE"; sourcePriceField?: string;
}
export interface SupplierPricingResult {
  appliedPricingBand?: PricingBand; vatRatePercent: number;
  proposedSellingPriceExVat?: number; vatAmount?: number; proposedSellingPriceInclVat?: number;
  grossProfit?: number; grossMarginPercent?: number; markupPercent?: number;
  referenceRetailInclVat?: number; warnings: PricingWarning[]; warningDetails?: PricingWarningDetail[];
  targetMarginProposal?: PricingScenario; competitiveSuggestion?: CompetitivePricingSuggestion;
}
export interface ManualPricingPreview extends SupplierPricingResult {
  supplierCostExVat: number; targetMarginPercent: number; minimumGrossProfit: number;
  minimumProfitPasses: boolean; targetMarginPasses: boolean;
  referenceRetailDelta?: number; automatedTargetDelta: number;
}

export function calculateManualPriceOverride(input: SupplierPricingInput, settings: PricingSettings, overridePriceInclVat: number, automatedTargetPriceInclVat: number): ManualPricingPreview {
  if (!Number.isFinite(overridePriceInclVat) || overridePriceInclVat <= 0) throw new Error("Override price must be a positive finite amount.");
  const costExVat = input.landedCostExVat ?? input.supplierCostExVat;
  if (costExVat === undefined || !Number.isFinite(costExVat) || costExVat < 0) throw new Error("A valid supplier cost is required for a manual override.");
  const band = settings.pricingBands.find((item) => costExVat >= item.minimumCost && (item.maximumCost === undefined || costExVat < item.maximumCost));
  if (!band) throw new Error("No valid pricing band applies to this supplier cost.");
  const vatRate = settings.vatRatePercent / 100;
  const proposedSellingPriceExVat = money(overridePriceInclVat / (1 + vatRate));
  const vatAmount = money(overridePriceInclVat - proposedSellingPriceExVat);
  const grossProfit = money(proposedSellingPriceExVat - costExVat);
  const grossMarginPercent = proposedSellingPriceExVat ? money((grossProfit / proposedSellingPriceExVat) * 100) : 0;
  const markupPercent = costExVat ? money((grossProfit / costExVat) * 100) : 0;
  const minimumGrossProfit = band.minimumGrossProfit ?? 0;
  const warnings: PricingWarning[] = [];
  if (input.currency !== "ZAR" && !input.fxRateUsed) warnings.push("MISSING_FX_RATE");
  if (input.fxRateUsed && Date.now() - new Date(input.fxCapturedAt ?? input.pricingTimestamp).getTime() > settings.fxStaleAfterHours * 3_600_000) warnings.push("STALE_FX_RATE");
  if (grossProfit < 0) warnings.push("SELLING_BELOW_COST");
  if (grossProfit < minimumGrossProfit) warnings.push("BELOW_MINIMUM_PROFIT");
  if (grossMarginPercent < band.targetGrossMarginPercent - TARGET_MARGIN_TOLERANCE_PERCENTAGE_POINTS) warnings.push("BELOW_TARGET_MARGIN");
  if (input.referenceRetailInclVat === undefined) warnings.push("MISSING_REFERENCE_RETAIL");
  else if (settings.referencePriceBehavior !== "IGNORE" && overridePriceInclVat > input.referenceRetailInclVat) warnings.push("ABOVE_REFERENCE_RETAIL");
  return {
    appliedPricingBand: band, vatRatePercent: settings.vatRatePercent,
    proposedSellingPriceExVat, vatAmount, proposedSellingPriceInclVat: money(overridePriceInclVat),
    grossProfit, grossMarginPercent, markupPercent, referenceRetailInclVat: input.referenceRetailInclVat,
    warnings, warningDetails: warnings.map((code) => classifyPricingWarning(code, { referencePriceBehavior: settings.referencePriceBehavior })),
    supplierCostExVat: costExVat, targetMarginPercent: band.targetGrossMarginPercent, minimumGrossProfit,
    minimumProfitPasses: grossProfit >= minimumGrossProfit,
    targetMarginPasses: grossMarginPercent >= band.targetGrossMarginPercent - TARGET_MARGIN_TOLERANCE_PERCENTAGE_POINTS,
    referenceRetailDelta: input.referenceRetailInclVat === undefined ? undefined : money(overridePriceInclVat - input.referenceRetailInclVat),
    automatedTargetDelta: money(overridePriceInclVat - automatedTargetPriceInclVat),
  };
}

function priceScenario(priceInclVat: number, costExVat: number, vatRate: number, targetMargin: number, minimumProfit = 0): PricingScenario {
  const suggestedPriceExVat = money(priceInclVat / (1 + vatRate));
  const grossProfitExVat = money(suggestedPriceExVat - costExVat);
  const grossMarginPercent = suggestedPriceExVat ? money((grossProfitExVat / suggestedPriceExVat) * 100) : 0;
  const markupPercent = costExVat ? money((grossProfitExVat / costExVat) * 100) : 0;
  return {
    suggestedPriceInclVat: priceInclVat,
    suggestedPriceExVat,
    grossProfitExVat,
    grossMarginPercent,
    markupPercent,
    minimumProfitPasses: grossProfitExVat > 0 && grossProfitExVat >= minimumProfit,
    targetMarginPasses: grossMarginPercent >= targetMargin - TARGET_MARGIN_TOLERANCE_PERCENTAGE_POINTS,
    referenceRetailDelta: 0,
  };
}

export function calculateCompetitiveSuggestion(referencePrice: number, targetPrice: number, costExVat: number, vatRatePercent: number, targetMargin: number, minimumProfit = 0): CompetitivePricingSuggestion {
  const scenario = priceScenario(referencePrice, costExVat, vatRatePercent / 100, targetMargin, minimumProfit);
  return { ...scenario, referenceRetailDelta: money(referencePrice - targetPrice), viability: scenario.minimumProfitPasses ? "VIABLE_BELOW_TARGET_MARGIN" : "NOT_COMMERCIALLY_VIABLE" };
}

export function classifyPricingWarning(code: PricingWarning, context: { referencePriceBehavior: ReferencePriceBehavior }): PricingWarningDetail {
  const messages: Record<PricingWarning, string> = {
    SELLING_BELOW_COST: "Selling price is below supplier cost and would create a loss.",
    ABOVE_REFERENCE_RETAIL: "Proposed price is above the supplier retail reference.",
    BELOW_TARGET_MARGIN: "Expected gross margin is below the configured target.",
    BELOW_MINIMUM_PROFIT: "Gross profit is below the configured minimum.",
    MISSING_REFERENCE_RETAIL: "Supplier retail reference is unavailable.",
    STALE_SUPPLIER_COST: "Supplier cost data is stale.",
    MISSING_FX_RATE: "A valid foreign-exchange rate is required.",
    STALE_FX_RATE: "The foreign-exchange rate is stale.",
    NO_VALID_PRICING_BAND: "No valid pricing band applies to this supplier cost.",
  };
  const severity: PricingWarningSeverity = code === "MISSING_REFERENCE_RETAIL" ? "INFO"
    : code === "ABOVE_REFERENCE_RETAIL" ? (context.referencePriceBehavior === "SOFT_CEILING" ? "WARNING" : "WARNING")
      : code === "BELOW_TARGET_MARGIN" ? "WARNING"
        : "BLOCKING";
  return { code, severity, message: messages[code] };
}

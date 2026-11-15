import type { TvrStockState } from "./tvrSemanticParser.js";

export const TVR_COMMERCIAL_AUTHORITY = "TEKCENTRAL_BUSINESS_CONFIRMED" as const;
export const TVR_PRICE_MEANING = "DEALER_RESELLER_PURCHASE_COST" as const;
export type TvrTaxBasis = "EXCLUSIVE" | "INCLUSIVE" | "UNKNOWN";
export type TvrCommercialAvailability = "AVAILABLE" | "LOW_STOCK" | "OUT_OF_STOCK" | "UNKNOWN";

export function tvrTaxBasisForSourceField(sourceLabel?: string): TvrTaxBasis {
  const normalized = sourceLabel?.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  if (normalized === "price excl") return "EXCLUSIVE";
  if (normalized === "price" || normalized === "refurb price") return "INCLUSIVE";
  return "UNKNOWN";
}

export function tvrAvailabilityFromStock(states: TvrStockState[]): TvrCommercialAvailability {
  const unique = [...new Set(states)];
  if (unique.length !== 1) return "UNKNOWN";
  if (unique[0] === "AVAILABLE") return "AVAILABLE";
  if (unique[0] === "LOW_STOCK") return "LOW_STOCK";
  if (unique[0] === "OUT_OF_STOCK") return "OUT_OF_STOCK";
  return "UNKNOWN";
}

export function isTvrTelevisionSection(sectionContext?: string) {
  return /\btv(?:'s|s)?\b/i.test(sectionContext?.normalize("NFKC") ?? "");
}

export function normalizeTvrComplianceFlags(input: { flags: string[]; sectionContexts: Array<string | undefined> }) {
  const flags = new Set(input.flags.filter((flag) => flag !== "DEALER_TV_LICENCE_REQUIRED"));
  if (input.flags.includes("DEALER_TV_LICENCE_REQUIRED") && input.sectionContexts.some(isTvrTelevisionSection)) {
    flags.add("CUSTOMER_TV_LICENCE_REQUIRED");
  }
  return [...flags].sort();
}

export function tvrSupplierCostExVat(input: { amount: number; taxBasis: TvrTaxBasis; vatRatePercent: number }) {
  if (!Number.isFinite(input.amount) || input.amount < 0) return undefined;
  if (input.taxBasis === "EXCLUSIVE") return Number(input.amount.toFixed(2));
  if (input.taxBasis !== "INCLUSIVE") return undefined;
  return Number((input.amount / (1 + input.vatRatePercent / 100)).toFixed(2));
}

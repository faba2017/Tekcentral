import type { ScoopLogisticsMetadata, ScoopLogisticsSource, ScoopLogisticsStatus } from "./scoopTypes.js";

const sourcePriority: Record<ScoopLogisticsSource, number> = {
  ADMIN: 5,
  ADMIN_IMPORT: 4.5,
  SUPPLIER_FEED: 4,
  MANUFACTURER: 3,
  SUPPLIER_PRODUCT_PAGE: 2,
  UNKNOWN: 1,
};
export const SCOOP_LOGISTICS_LIMITS = { maximumWeightGrams: 1_000_000, maximumDimensionMm: 10_000 } as const;

export function deriveScoopLogisticsStatus(input: Pick<ScoopLogisticsMetadata, "weightGrams" | "lengthMm" | "widthMm" | "heightMm">): ScoopLogisticsStatus {
  const hasWeight = input.weightGrams !== undefined;
  const dimensions = [input.lengthMm, input.widthMm, input.heightMm];
  const completeDimensions = dimensions.every((value) => value !== undefined);
  const partialDimensions = dimensions.some((value) => value !== undefined) && !completeDimensions;
  if (partialDimensions) return "INVALID";
  if (hasWeight && completeDimensions) return "COMPLETE";
  if (hasWeight) return "WEIGHT_ONLY";
  if (completeDimensions) return "DIMENSIONS_ONLY";
  return "MISSING";
}

export function validateScoopLogisticsValues(input: { weightGrams?: number; lengthMm?: number; widthMm?: number; heightMm?: number }) {
  const values = [input.weightGrams, input.lengthMm, input.widthMm, input.heightMm];
  if (values.every((value) => value === undefined)) throw new Error("Enter a weight or all three dimensions.");
  if (values.some((value) => value !== undefined && (!Number.isFinite(value) || value <= 0))) throw new Error("Logistics values must be positive numbers.");
  if (input.weightGrams !== undefined && input.weightGrams > SCOOP_LOGISTICS_LIMITS.maximumWeightGrams) throw new Error("Weight exceeds the supported 1,000 kg validation limit.");
  if ([input.lengthMm, input.widthMm, input.heightMm].some((value) => value !== undefined && value > SCOOP_LOGISTICS_LIMITS.maximumDimensionMm)) throw new Error("A dimension exceeds the supported 10,000 mm validation limit.");
  if ([input.lengthMm, input.widthMm, input.heightMm].some((value) => value !== undefined) && [input.lengthMm, input.widthMm, input.heightMm].some((value) => value === undefined)) throw new Error("Enter length, width and height together.");
}

export function effectiveScoopLogisticsMetadata(records: ScoopLogisticsMetadata[] = []) {
  return [...records].filter((record) => record.status !== "INVALID" && record.status !== "MISSING")
    .sort((a, b) => sourcePriority[b.source] - sourcePriority[a.source] || Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
}

export function upsertScoopLogisticsSource(records: ScoopLogisticsMetadata[] = [], next: ScoopLogisticsMetadata) {
  return [next, ...records.filter((record) => record.source !== next.source)];
}

export function sourceLabel(source?: ScoopLogisticsSource) {
  return source === "ADMIN" ? "Admin" : source === "ADMIN_IMPORT" ? "Admin CSV import" : source === "SUPPLIER_FEED" ? "Supplier feed" : source === "MANUFACTURER" ? "Manufacturer" : source === "SUPPLIER_PRODUCT_PAGE" ? "Scoop product page" : "Unknown";
}

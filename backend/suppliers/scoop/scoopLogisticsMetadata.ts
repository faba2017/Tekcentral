import type { ScoopLogisticsMetadata, ScoopLogisticsSource, ScoopLogisticsStatus } from "./scoopTypes.js";

const sourcePriority: Record<ScoopLogisticsSource, number> = {
  ADMIN: 5,
  ADMIN_IMPORT: 4.5,
  SUPPLIER_PRODUCT_PAGE: 4,
  SUPPLIER_FEED: 3.5,
  MANUFACTURER: 3,
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

export function effectiveScoopLogisticsMetadata(records: ScoopLogisticsMetadata[] = []): ScoopLogisticsMetadata | undefined {
  const valid = [...records].filter((record) => record.status !== "INVALID" && record.status !== "MISSING")
    .sort((a, b) => sourcePriority[b.source] - sourcePriority[a.source] || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const admin = valid.find((record) => record.source === "ADMIN");
  if (admin) return admin;
  const product = valid.find((record) => record.measurementScope !== "PACKAGE") ?? valid[0];
  const packageRecord = valid.find((record) => record.packageWeightGrams !== undefined && record.packageLengthMm !== undefined && record.packageWidthMm !== undefined && record.packageHeightMm !== undefined);
  if (!packageRecord) return product;
  return {
    ...product,
    source: packageRecord.source,
    sourceReference: packageRecord.sourceReference,
    status: "COMPLETE" as const,
    weightGrams: packageRecord.packageWeightGrams,
    lengthMm: packageRecord.packageLengthMm,
    widthMm: packageRecord.packageWidthMm,
    heightMm: packageRecord.packageHeightMm,
    packageWeightGrams: packageRecord.packageWeightGrams,
    packageLengthMm: packageRecord.packageLengthMm,
    packageWidthMm: packageRecord.packageWidthMm,
    packageHeightMm: packageRecord.packageHeightMm,
    actualWeightKg: packageRecord.packageWeightGrams! / 1000,
    volumeM3: packageRecord.packageLengthMm! * packageRecord.packageWidthMm! * packageRecord.packageHeightMm! / 1_000_000_000,
    shippingBasis: "PACKAGE",
    measurementScope: "PRODUCT_AND_PACKAGE",
    productSource: product?.measurementScope === "PACKAGE" ? undefined : product?.source,
    packageSource: packageRecord.source,
  };
}

export function upsertScoopLogisticsSource(records: ScoopLogisticsMetadata[] = [], next: ScoopLogisticsMetadata) {
  return [next, ...records.filter((record) => record.source !== next.source)];
}

export function sourceLabel(source?: ScoopLogisticsSource) {
  return source === "ADMIN" ? "Admin" : source === "ADMIN_IMPORT" ? "Admin CSV import" : source === "SUPPLIER_FEED" ? "Supplier feed" : source === "MANUFACTURER" ? "Manufacturer" : source === "SUPPLIER_PRODUCT_PAGE" ? "Scoop product page" : "Unknown";
}

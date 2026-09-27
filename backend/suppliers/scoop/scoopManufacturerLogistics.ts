import { getScoopCatalogueProduct, saveScoopLogisticsSource } from "./scoopCatalogueRepository.js";
import { deriveScoopLogisticsStatus, validateScoopLogisticsValues } from "./scoopLogisticsMetadata.js";
import type { ScoopCatalogueProduct, ScoopLogisticsFailureReason, ScoopLogisticsMetadata } from "./scoopTypes.js";

export type IdentityConfidence = "HIGH" | "MEDIUM" | "LOW";
export interface ManufacturerIdentity { manufacturer: string; scoopSku: string; manufacturerModel: string; aliases: string[]; canonicalUrl: string; identityConfidence: IdentityConfidence }
export interface ManufacturerLogisticsLookup { identity: ManufacturerIdentity; product?: Measurements; package?: Measurements; notes?: string }
interface Measurements { weightGrams?: number; lengthMm?: number; widthMm?: number; heightMm?: number }
export interface ScoopManufacturerMetadataProvider {
  id: string;
  supportsManufacturer(manufacturer?: string): boolean;
  resolveIdentity(product: ScoopCatalogueProduct): Promise<ManufacturerLogisticsLookup | undefined>;
  fetchLogistics(identity: ManufacturerLogisticsLookup): Promise<ManufacturerLogisticsLookup>;
  verifyIdentity(product: ScoopCatalogueProduct, result: ManufacturerLogisticsLookup): IdentityConfidence;
  normalizeLogistics(result: ManufacturerLogisticsLookup): Omit<ScoopLogisticsMetadata, "capturedAt" | "updatedAt" | "fetchedAt" | "status">;
}

const normalize = (value?: string) => (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
export function matchesScoopManufacturerAlias(product: ScoopCatalogueProduct, alias: string) {
  const normalizedAlias = normalize(alias);
  return normalizedAlias === normalize(product.supplierSku) || normalize(product.description).includes(normalizedAlias);
}
export function normalizeWeight(value: number, unit: "g" | "kg" | "lb") {
  if (!Number.isFinite(value) || value <= 0) throw new Error("INVALID_SOURCE_DATA");
  return Math.round((unit === "kg" ? value * 1000 : unit === "lb" ? value * 453.59237 : value) * 1000) / 1000;
}
export function normalizeDimension(value: number, unit: "mm" | "cm" | "in") {
  if (!Number.isFinite(value) || value <= 0) throw new Error("INVALID_SOURCE_DATA");
  return Math.round((unit === "cm" ? value * 10 : unit === "in" ? value * 25.4 : value) * 1000) / 1000;
}

const records: ManufacturerLogisticsLookup[] = [
  { identity: { manufacturer: "Ubiquiti", scoopSku: "ACB-ISP", manufacturerModel: "ACB-ISP", aliases: ["airCube ISP", "ACB-ISP"], canonicalUrl: "https://techspecs.ui.com/uisp/wired/acb-isp", identityConfidence: "HIGH" }, product: { weightGrams: 280, lengthMm: 87.8, widthMm: 89.5, heightMm: 89.25 }, notes: "Official product measurements used as shipping fallback." },
  { identity: { manufacturer: "Ubiquiti", scoopSku: "AF-11", manufacturerModel: "AF-11FX", aliases: ["AF-11", "AF-11FX", "airFiber 11"], canonicalUrl: "https://dl.ui.com/datasheets/airfiber/airFiber_AF-11FX_DS.pdf", identityConfidence: "HIGH" }, product: { weightGrams: normalizeWeight(2.26, "kg"), lengthMm: 327, widthMm: 112, heightMm: 86 }, notes: "Official AF-11FX datasheet; exact AF-11 model-family alias verified." },
  { identity: { manufacturer: "Ubiquiti", scoopSku: "U7-LR", manufacturerModel: "U7-LR", aliases: ["U7-LR", "U7 LR", "UniFi U7 Long Range"], canonicalUrl: "https://techspecs.ui.com/unifi/wifi/u7-lr", identityConfidence: "HIGH" }, product: { weightGrams: 448, lengthMm: 175.7, widthMm: 175.7, heightMm: 43 }, notes: "Official Ubiquiti technical specifications; circular diameter normalized to length and width." },
  { identity: { manufacturer: "Ubiquiti", scoopSku: "UPOE48-30W", manufacturerModel: "U-POE-at", aliases: ["UPOE48-30W", "U-POE-at", "48V 30W"], canonicalUrl: "https://dl.ui.com/ds/u-poe-at_ds.pdf", identityConfidence: "HIGH" }, product: { weightGrams: 156, lengthMm: 93, widthMm: 62, heightMm: 35 }, notes: "Official U-POE-at 48V 30W adapter datasheet; Scoop identity includes the exact voltage and wattage." },
  { identity: { manufacturer: "Cudy", scoopSku: "CD-GS105P", manufacturerModel: "GS105P 1.0", aliases: ["CD-GS105P", "GS105P", "GS105P 1.0"], canonicalUrl: "https://www.cudy.com/products/gs105p-1-0", identityConfidence: "HIGH" }, product: { weightGrams: 253.6, lengthMm: 119, widthMm: 85, heightMm: 28 }, package: { weightGrams: 580, lengthMm: 165, widthMm: 123, heightMm: 60 }, notes: "Official product and retail-package specifications." },
  { identity: { manufacturer: "Cudy", scoopSku: "CD-WR1200", manufacturerModel: "WR1200 revision unresolved", aliases: ["CD-WR1200", "WR1200"], canonicalUrl: "https://www.cudy.com/products/wr1200-2-0", identityConfidence: "MEDIUM" }, notes: "Scoop identity does not state the WR1200 hardware revision; official revisions have different physical specifications." },
  { identity: { manufacturer: "MikroTik", scoopSku: "RB-260GS", manufacturerModel: "RB260GS / CSS106-5G-1S", aliases: ["RB-260GS", "RB260GS", "CSS106-5G-1S"], canonicalUrl: "https://cdn.mikrotik.com/web-assets/product_files/RB260GS_211055.pdf", identityConfidence: "HIGH" }, product: { weightGrams: 212, lengthMm: 113, widthMm: 138, heightMm: 29 }, notes: "Official brochure; unpackaged device measurements." },
  { identity: { manufacturer: "Fanvil", scoopSku: "FAN-V50G", manufacturerModel: "V50G", aliases: ["FAN-V50G", "V50G"], canonicalUrl: "https://www.fanvil.com/upload/files/20251113/16250n6hvb.pdf", identityConfidence: "HIGH" }, product: { lengthMm: 173, widthMm: 185, heightMm: 169.9 }, package: { lengthMm: 250, widthMm: 220, heightMm: 55 }, notes: "Official datasheet. Per-device weight is not stated; carton totals are not divided or inferred." },
];

class OfficialRecordProvider implements ScoopManufacturerMetadataProvider {
  constructor(public id: string, private manufacturer: string) {}
  supportsManufacturer(manufacturer?: string) { return normalize(manufacturer) === normalize(this.manufacturer); }
  async resolveIdentity(product: ScoopCatalogueProduct) {
    return records.filter((record) => normalize(record.identity.manufacturer) === normalize(product.manufacturer)).find((record) => normalize(record.identity.scoopSku) === normalize(product.supplierSku) && record.identity.aliases.some((alias) => matchesScoopManufacturerAlias(product, alias)));
  }
  async fetchLogistics(identity: ManufacturerLogisticsLookup) { return identity; }
  verifyIdentity(product: ScoopCatalogueProduct, result: ManufacturerLogisticsLookup): IdentityConfidence {
    return normalize(product.manufacturer) === normalize(result.identity.manufacturer) && normalize(product.supplierSku) === normalize(result.identity.scoopSku) && result.identity.aliases.some((alias) => matchesScoopManufacturerAlias(product, alias)) ? result.identity.identityConfidence : "LOW";
  }
  normalizeLogistics(result: ManufacturerLogisticsLookup) {
    const packageComplete = Boolean(result.package?.weightGrams && result.package.lengthMm && result.package.widthMm && result.package.heightMm);
    const shipping = packageComplete ? result.package! : result.product ?? {};
    return {
      source: "MANUFACTURER" as const, sourceReference: result.identity.canonicalUrl, manufacturer: result.identity.manufacturer, model: result.identity.manufacturerModel, supplierSku: result.identity.scoopSku,
      identityConfidence: result.identity.identityConfidence, sourceConfidence: "HIGH" as const, shippingBasis: packageComplete ? "PACKAGE" as const : "PRODUCT_DIMENSIONS_FALLBACK" as const,
      weightGrams: shipping.weightGrams, lengthMm: shipping.lengthMm, widthMm: shipping.widthMm, heightMm: shipping.heightMm,
      packageWeightGrams: result.package?.weightGrams, packageLengthMm: result.package?.lengthMm, packageWidthMm: result.package?.widthMm, packageHeightMm: result.package?.heightMm,
      actualWeightKg: shipping.weightGrams === undefined ? undefined : shipping.weightGrams / 1000,
      volumeM3: shipping.lengthMm && shipping.widthMm && shipping.heightMm ? shipping.lengthMm * shipping.widthMm * shipping.heightMm / 1_000_000_000 : undefined, notes: result.notes,
    };
  }
}

export const manufacturerProviderRegistry: ScoopManufacturerMetadataProvider[] = [
  new OfficialRecordProvider("UBIQUITI_OFFICIAL", "Ubiquiti"), new OfficialRecordProvider("MIKROTIK_OFFICIAL", "MikroTik"),
  new OfficialRecordProvider("CUDY_OFFICIAL", "Cudy"), new OfficialRecordProvider("FANVIL_OFFICIAL", "Fanvil"),
  new OfficialRecordProvider("TP_LINK_OFFICIAL", "TP-Link"), new OfficialRecordProvider("LINKBASIC_OFFICIAL", "Linkbasic"),
];

export async function acquireScoopManufacturerLogistics(supplierSku: string, providers: ScoopManufacturerMetadataProvider[] = manufacturerProviderRegistry) {
  const product = await getScoopCatalogueProduct(supplierSku); if (!product) throw new Error("Scoop product not found.");
  const compatible = providers.filter((provider) => provider.supportsManufacturer(product.manufacturer));
  if (!compatible.length) return { outcome: "FAILED" as const, reason: "MANUFACTURER_PROVIDER_NOT_AVAILABLE" as ScoopLogisticsFailureReason };
  for (const provider of compatible) {
    const identity = await provider.resolveIdentity(product); if (!identity) continue;
    const result = await provider.fetchLogistics(identity); const confidence = provider.verifyIdentity(product, result);
    if (confidence !== "HIGH") return { outcome: "FAILED" as const, reason: confidence === "MEDIUM" ? "LOW_IDENTITY_CONFIDENCE" as const : "IDENTITY_NOT_RESOLVED" as const, candidate: result };
    try {
      const values = provider.normalizeLogistics(result); validateScoopLogisticsValues(values); const now = new Date().toISOString();
      const record: ScoopLogisticsMetadata = { ...values, identityConfidence: confidence, status: deriveScoopLogisticsStatus(values), capturedAt: now, updatedAt: now, fetchedAt: now };
      const saved = await saveScoopLogisticsSource({ supplierSku, record, actor: `Manufacturer provider: ${provider.id}` });
      return { outcome: saved.outcome, product: "product" in saved ? saved.product : undefined, record, providerId: provider.id };
    } catch { return { outcome: "FAILED" as const, reason: "INVALID_SOURCE_DATA" as ScoopLogisticsFailureReason }; }
  }
  return { outcome: "FAILED" as const, reason: "IDENTITY_NOT_RESOLVED" as ScoopLogisticsFailureReason };
}

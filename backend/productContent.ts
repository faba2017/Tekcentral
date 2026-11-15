export type ProductContentOrigin = "STAFF_EDITED" | "SOURCE_DERIVED" | "APPROVED_SOURCE_DERIVED" | "AUTO_DEFAULT";
export type ProductContentSource = "STAFF" | "SCOOP_PRODUCT_PAGE" | "MANUFACTURER" | "SUPPLIER_FEED" | "AUTO_DEFAULT";
export type ProductDocumentType = "DATASHEET" | "COMPLIANCE_CERTIFICATE" | "USER_MANUAL" | "INSTALLATION_GUIDE" | "WARRANTY_DOCUMENT" | "BROCHURE" | "SPECIFICATION_SHEET" | "SAFETY_DOCUMENT" | "OTHER" | "QUICK_START_GUIDE" | "WARRANTY";

export interface ProductContentProvenance {
  source?: ProductContentSource;
  sourceUrl?: string;
  capturedAt?: string;
  approvedAt?: string;
  contentFingerprint?: string;
}

export interface PublicProductSpecification extends ProductContentProvenance {
  name: string;
  value: string;
  group?: string;
  isKey?: boolean;
  origin?: ProductContentOrigin;
}

export interface PublicProductDocument extends ProductContentProvenance {
  type: ProductDocumentType;
  title: string;
  url: string;
  verified: boolean;
  origin?: ProductContentOrigin;
  filename?: string;
  mimeType?: "application/pdf";
  size?: number;
  uploadedAt?: string;
  actor?: string;
}

const labels = new Map([
  ["max. power consumption", "Max Power Consumption"],
  ["maximum power consumption", "Max Power Consumption"],
  ["max power consumption", "Max Power Consumption"],
  ["operating temperature", "Operating Temperature"],
  ["system memory", "System Memory"],
  ["ethernet ports", "Ethernet Ports"],
  ["sfp ports", "SFP Ports"],
  ["product dimensions", "Dimensions"],
  ["dimensions", "Dimensions"],
  ["product weight", "Weight"],
  ["weight", "Weight"],
  ["poe input", "PoE Input"],
  ["poe output", "PoE Output"],
  ["input voltage", "Input Voltage"],
  ["supported voltage range", "Supported Voltage Range"],
]);

const compact = (value: string) => value.replace(/\s+/g, " ").trim();
export function normalizeSpecificationLabel(value: string) {
  const cleaned = compact(value.replace(/:$/, ""));
  return labels.get(cleaned.toLowerCase()) ?? cleaned;
}

export function mergeProductSpecifications(current: PublicProductSpecification[], proposed: PublicProductSpecification[]) {
  const result = current.filter((item) => item.name.trim() && item.value.trim());
  const conflicts: { current: PublicProductSpecification; proposed: PublicProductSpecification }[] = [];
  const additions: PublicProductSpecification[] = [];
  for (const item of proposed) {
    const normalized = { ...item, name: normalizeSpecificationLabel(item.name), value: compact(item.value) };
    if (!normalized.name || !normalized.value) continue;
    const existing = result.find((candidate) => normalizeSpecificationLabel(candidate.name).toLowerCase() === normalized.name.toLowerCase());
    if (!existing) { result.push(normalized); additions.push(normalized); }
    else if (compact(existing.value).toLowerCase() !== normalized.value.toLowerCase()) conflicts.push({ current: existing, proposed: normalized });
  }
  return { specifications: result, additions, conflicts };
}

export function deriveProductContentStatus(input: { overview?: string; overviewOrigin?: ProductContentOrigin; specifications?: PublicProductSpecification[]; documents?: PublicProductDocument[]; conflicts?: unknown[] }) {
  if (input.conflicts?.length) return "CONTENT_REVIEW_REQUIRED" as const;
  const overview = input.overview?.trim();
  if (!overview) return "CONTENT_MISSING" as const;
  if (input.overviewOrigin === "AUTO_DEFAULT" && !input.specifications?.length && !input.documents?.length) return "CONTENT_BASIC" as const;
  return input.specifications?.length || input.documents?.length || input.overviewOrigin === "APPROVED_SOURCE_DERIVED" || input.overviewOrigin === "STAFF_EDITED" ? "CONTENT_ENRICHED" as const : "CONTENT_BASIC" as const;
}

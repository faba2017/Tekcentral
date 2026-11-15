import { createHash } from "node:crypto";

export type MustekOfferClassification = "SAFE" | "REVIEW_REQUIRED" | "CONFLICT" | "MISSING_COMMERCIAL_DATA";

export interface MustekEvidenceRow {
  evidenceId: string;
  sourceId: string;
  sourceLabel?: string;
  sourceVersionId: string;
  sourceFingerprint: string;
  supplierSku?: string;
  sourceDescription?: string;
  sourceBrand?: string;
  workbookName?: string;
  worksheetName?: string;
  sourceRow?: number;
  dealerCost?: number;
  currency?: string;
  taxBasis?: string;
  observedAt: string;
}

export interface MustekNormalizedOffer {
  id: string;
  supplierId: "MUSTEK";
  supplierIdentity: string;
  supplierSku: string;
  description?: string;
  brand?: string;
  cost?: number;
  currency?: string;
  taxBasis: "UNKNOWN";
  availability: "UNKNOWN";
  fulfilmentCapability: "UNKNOWN";
  mappingStatus: "UNMAPPED";
  classification: MustekOfferClassification;
  reviewReasons: string[];
  normalizedOfferFingerprint: string;
  observedAt: string;
  updatedAt: string;
  provenance: {
    contributingEvidenceIds: string[];
    observations: Array<{
      evidenceId: string; sourceId: string; sourceLabel?: string; sourceVersionId: string; sourceFingerprint: string;
      workbookName?: string; worksheetName?: string; sourceRow?: number; supplierSku: string; observedAt: string;
    }>;
  };
}

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const clean = (value?: string) => value?.normalize("NFKC").trim().replace(/\s+/g, " ") || undefined;
export const normalizeMustekSupplierSku = (value?: string) => {
  const normalized = clean(value)?.toUpperCase();
  if (!normalized || normalized.length > 120 || !/[A-Z0-9]/.test(normalized) || /^(?:N\/?A|NONE|UNKNOWN|-)$/i.test(normalized)) return undefined;
  return normalized;
};

const unique = <T>(values: T[]) => [...new Set(values)];
const money = (value: number) => Math.round(value * 100) / 100;

/** Fingerprint inputs deliberately exclude evidence IDs, versions, rows and observation times. */
export function normalizeMustekOffers(rows: MustekEvidenceRow[], now = new Date().toISOString()) {
  const groups = new Map<string, MustekEvidenceRow[]>();
  let unresolvedEvidenceCount = 0;
  for (const row of rows) {
    const sku = normalizeMustekSupplierSku(row.supplierSku);
    if (!sku) { unresolvedEvidenceCount += 1; continue; }
    groups.set(sku, [...(groups.get(sku) ?? []), row]);
  }
  const offers = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map<MustekNormalizedOffer>(([sku, evidence]) => {
    const descriptions = unique(evidence.map((row) => clean(row.sourceDescription)).filter((value): value is string => Boolean(value))).sort();
    const brands = unique(evidence.map((row) => clean(row.sourceBrand)).filter((value): value is string => Boolean(value))).sort();
    const costs = unique(evidence.map((row) => row.dealerCost).filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0).map(money)).sort((a, b) => a - b);
    const currencies = unique(evidence.map((row) => clean(row.currency)?.toUpperCase()).filter((value): value is string => Boolean(value))).sort();
    const reasons: string[] = [];
    let classification: MustekOfferClassification = "SAFE";
    if (!descriptions.length || !costs.length || !currencies.length) { classification = "MISSING_COMMERCIAL_DATA"; reasons.push("Required description, cost or currency evidence is missing."); }
    if (descriptions.length > 1) { if (classification === "SAFE") classification = "REVIEW_REQUIRED"; reasons.push("Multiple source descriptions require review."); }
    if (brands.length > 1) { if (classification === "SAFE") classification = "REVIEW_REQUIRED"; reasons.push("Multiple source brands require review."); }
    if (costs.length > 1 || currencies.length > 1) { classification = "CONFLICT"; reasons.push("Conflicting source-backed commercial facts were retained without choosing a winner."); }
    if (evidence.some((row) => /brother/i.test(row.sourceLabel ?? row.workbookName ?? "")) && classification === "SAFE") { classification = "REVIEW_REQUIRED"; reasons.push("Brother workbook semantics require staff review."); }
    const normalizedFacts = { sku, description: descriptions.length === 1 ? descriptions[0] : undefined, brand: brands.length === 1 ? brands[0] : undefined, cost: costs.length === 1 ? costs[0] : undefined, currency: currencies.length === 1 ? currencies[0] : undefined, taxBasis: "UNKNOWN", classification, reasons };
    const observedAt = evidence.map((row) => row.observedAt).sort().at(-1) ?? now;
    return {
      id: `MUSTEK:${sku}`, supplierId: "MUSTEK", supplierIdentity: `MUSTEK:${sku}`, supplierSku: sku,
      description: normalizedFacts.description, brand: normalizedFacts.brand, cost: normalizedFacts.cost,
      currency: normalizedFacts.currency, taxBasis: "UNKNOWN", availability: "UNKNOWN", fulfilmentCapability: "UNKNOWN",
      mappingStatus: "UNMAPPED", classification, reviewReasons: reasons,
      normalizedOfferFingerprint: hash(normalizedFacts), observedAt, updatedAt: now,
      provenance: {
        contributingEvidenceIds: evidence.map((row) => row.evidenceId).sort(),
        observations: evidence.map((row) => ({ evidenceId: row.evidenceId, sourceId: row.sourceId, sourceLabel: row.sourceLabel, sourceVersionId: row.sourceVersionId, sourceFingerprint: row.sourceFingerprint, workbookName: row.workbookName, worksheetName: row.worksheetName, sourceRow: row.sourceRow, supplierSku: row.supplierSku ?? sku, observedAt: row.observedAt })).sort((a, b) => a.evidenceId.localeCompare(b.evidenceId)),
      },
    };
  });
  return { offers, unresolvedEvidenceCount };
}

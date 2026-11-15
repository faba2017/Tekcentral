import { createHash } from "node:crypto";
import type { TvrCondition, TvrSemanticEvidence, TvrStockState } from "./tvrSemanticParser.js";
import { normalizeTvrComplianceFlags, TVR_COMMERCIAL_AUTHORITY, TVR_PRICE_MEANING, tvrAvailabilityFromStock, tvrTaxBasisForSourceField, type TvrCommercialAvailability, type TvrTaxBasis } from "./tvrCommercialPolicy.js";

export type TvrOfferClassification = "SAFE" | "REVIEW_REQUIRED" | "CONFLICT" | "MISSING_COMMERCIAL_DATA";

export interface TvrOfferEvidenceRow extends TvrSemanticEvidence {
  sourceId: string;
  sourceVersionId: string;
  observedAt: string;
}

export interface TvrNormalizedOffer {
  id: string;
  supplierId: "TVR";
  supplierIdentity: string;
  /** Real TVR identifier shown to staff. The condition-qualified database key stays internal. */
  supplierSku: string;
  catalogueSupplierSku: string;
  normalizedSupplierSku: string;
  compositeIdentity?: { rawIndoorModel: string; rawOutdoorModel: string; normalizedIndoorModel: string; normalizedOutdoorModel: string };
  condition: TvrCondition;
  description?: string;
  cost?: number;
  currency?: "ZAR";
  taxBasis: TvrTaxBasis;
  priceMeaning: typeof TVR_PRICE_MEANING;
  commercialAuthority: typeof TVR_COMMERCIAL_AUTHORITY;
  availability: TvrCommercialAvailability;
  fulfilmentCapability: "UNKNOWN";
  mappingStatus: "UNMAPPED";
  classification: TvrOfferClassification;
  reviewReasons: string[];
  flags: string[];
  conditionCollision: boolean;
  priceEvidence: {
    alternatives: Array<{ raw: string | number; amount: number; sourceLabel?: string; currencyAuthority: "EXPLICIT" | "UNKNOWN"; explicitCurrency?: "ZAR"; taxBasis: "UNKNOWN" }>;
  };
  stockEvidence: { states: TvrStockState[]; observations: Array<{ state: TvrStockState; raw?: string; rawType: string }> };
  factAlternatives?: { descriptions: string[]; prices: Array<{ amount: number; raw: string | number; explicitCurrency?: "ZAR" }> };
  normalizedOfferFingerprint: string;
  lifecycleStatus: "CURRENT" | "NO_LONGER_OBSERVED";
  observedAt: string;
  updatedAt: string;
  provenance: {
    contributingEvidenceIds: string[];
    sourceVersionIds: string[];
    observations: Array<{ evidenceId: string; sourceId: string; sourceVersionId: string; sourceFingerprint: string; workbookName: string; worksheetName: string; sourceRow: number; rawIdentifier: string; observedAt: string }>;
  };
  sourceWarningsRef: { sourceVersionIds: string[]; scope: "WORKBOOK_VERSION" };
}

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const unique = <T>(values: T[]) => [...new Set(values)];
const stableUnique = <T>(values: T[], key: (value: T) => string) => [...new Map(values.map((value) => [key(value), value])).values()].sort((a, b) => key(a).localeCompare(key(b)));
const clean = (value: string) => value.normalize("NFKC").replace(/\s+/g, " ").trim();

/** Fingerprint inputs exclude source versions, row positions, evidence IDs, timestamps and provenance ordering. */
export function normalizeTvrOffers(rows: TvrOfferEvidenceRow[], now = new Date().toISOString()) {
  const groups = new Map<string, TvrOfferEvidenceRow[]>();
  for (const row of rows) {
    if (!["NEW", "CLEARANCE", "REMANUFACTURED"].includes(row.condition) || !row.normalizedIdentifier.trim()) throw new Error("TVR_INVALID_CONDITION_IDENTITY");
    const key = `${row.condition}|${row.normalizedIdentifier}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const offers = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map<TvrNormalizedOffer>(([, evidence]) => {
    const first = evidence[0];
    const descriptions = unique(evidence.map((row) => clean(row.sourceDescription))).sort();
    const prices = stableUnique(evidence.map((row) => row.price), (item) => JSON.stringify([item.amount, item.raw, item.explicitCurrency ?? null, item.sourceLabel ?? null]));
    const stock = stableUnique(evidence.map((row) => row.stock), (item) => JSON.stringify([item.state, item.rawType, item.raw ?? null]));
    const sourceFlags = unique(evidence.flatMap((row) => row.flags)).sort();
    const flags = normalizeTvrComplianceFlags({ flags: sourceFlags, sectionContexts: evidence.map((row) => row.sectionContext) });
    const conflict = evidence.some((row) => row.groupClassification === "CONFLICTING_FACTS") || descriptions.length > 1 || new Set(prices.map((item) => JSON.stringify([item.amount, item.explicitCurrency ?? null]))).size > 1;
    const reasons: string[] = [];
    let classification: TvrOfferClassification = "SAFE";
    if (!first.normalizedIdentifier || !descriptions.length || !prices.length) {
      classification = "MISSING_COMMERCIAL_DATA";
      reasons.push("Required supplier identity, description or price evidence is missing.");
    }
    if (conflict) {
      classification = "CONFLICT";
      reasons.push("Conflicting source-backed facts were retained without choosing a winner.");
    } else if (first.semanticUncertainty) {
      classification = "REVIEW_REQUIRED";
      reasons.push("Workbook semantics require staff review before downstream use.");
    }
    if (first.conditionCollision) reasons.push("The same source identifier also exists in another condition; each condition remains a separate offer.");

    const taxBases = unique(prices.map((item) => tvrTaxBasisForSourceField(item.sourceLabel)));
    const taxBasis = taxBases.length === 1 ? taxBases[0] : "UNKNOWN";
    const normalizedAvailability = conflict ? "UNKNOWN" : tvrAvailabilityFromStock(stock.map((item) => item.state));
    const facts = {
      condition: first.condition,
      normalizedIdentifier: first.normalizedIdentifier,
      descriptions,
      prices: prices.map((item) => ({ amount: item.amount, raw: item.raw, sourceLabel: item.sourceLabel ?? null, sourceCurrencyEvidence: item.explicitCurrency ?? null, sourceCurrencyAuthority: item.currencyAuthority, sourceTaxBasis: item.taxBasis, interpretedCurrency: "ZAR", interpretedTaxBasis: tvrTaxBasisForSourceField(item.sourceLabel), priceMeaning: TVR_PRICE_MEANING })),
      stock: stock.map((item) => ({ state: item.state, raw: item.raw ?? null, rawType: item.rawType })),
      flags,
      sourceFlags,
      commercialAuthority: TVR_COMMERCIAL_AUTHORITY,
      availability: normalizedAvailability,
      classification,
      reviewReasons: reasons,
      conditionCollision: first.conditionCollision,
    };
    const sourceVersionIds = unique(evidence.map((row) => row.sourceVersionId)).sort();
    const observedAt = evidence.map((row) => row.observedAt).sort().at(-1) ?? now;
    const catalogueSupplierSku = `${first.condition}:${first.normalizedIdentifier}`;
    return {
      id: `TVR:${catalogueSupplierSku}`,
      supplierId: "TVR",
      supplierIdentity: `TVR:${catalogueSupplierSku}`,
      supplierSku: first.rawIdentifier,
      catalogueSupplierSku,
      normalizedSupplierSku: first.normalizedIdentifier,
      compositeIdentity: first.compositeIdentity,
      condition: first.condition,
      description: !conflict && descriptions.length === 1 ? descriptions[0] : undefined,
      cost: !conflict && prices.length === 1 ? prices[0].amount : undefined,
      currency: !conflict && prices.length === 1 ? "ZAR" : undefined,
      taxBasis: conflict ? "UNKNOWN" : taxBasis,
      priceMeaning: TVR_PRICE_MEANING,
      commercialAuthority: TVR_COMMERCIAL_AUTHORITY,
      availability: normalizedAvailability,
      fulfilmentCapability: "UNKNOWN",
      mappingStatus: "UNMAPPED",
      classification,
      reviewReasons: reasons,
      flags,
      conditionCollision: first.conditionCollision,
      priceEvidence: { alternatives: prices },
      stockEvidence: { states: unique(stock.map((item) => item.state)).sort(), observations: stock.map((item) => ({ state: item.state, raw: item.raw, rawType: item.rawType })) },
      factAlternatives: conflict ? { descriptions, prices: prices.map((item) => ({ amount: item.amount, raw: item.raw, explicitCurrency: item.explicitCurrency })) } : undefined,
      normalizedOfferFingerprint: hash(facts),
      lifecycleStatus: "CURRENT",
      observedAt,
      updatedAt: now,
      provenance: {
        contributingEvidenceIds: evidence.map((row) => row.id).sort(),
        sourceVersionIds,
        observations: evidence.map((row) => ({ evidenceId: row.id, sourceId: row.sourceId, sourceVersionId: row.sourceVersionId, sourceFingerprint: row.sourceFingerprint, workbookName: row.workbookName, worksheetName: row.worksheetName, sourceRow: row.sourceRow, rawIdentifier: row.rawIdentifier, observedAt: row.observedAt })).sort((a, b) => a.evidenceId.localeCompare(b.evidenceId)),
      },
      sourceWarningsRef: { sourceVersionIds, scope: "WORKBOOK_VERSION" },
    };
  });
  return { offers };
}

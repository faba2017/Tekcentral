import { createHash } from "node:crypto";
import { resolveFxEvidence } from "./fxRateService.js";
import { listPricingProposals } from "./pricingProposalRepository.js";
import { getCjCatalogueProduct } from "./suppliers/cj/cjCatalogueRepository.js";
import { getScoopCatalogueProduct } from "./suppliers/scoop/scoopCatalogueRepository.js";
import { getSyntechCatalogueProduct } from "./suppliers/syntech/syntechCatalogueRepository.js";
import { getTekCentralManualOffer } from "./suppliers/tekcentral/tekcentralManualOfferRepository.js";
import { getSupplierPolicySettings } from "./businessSettingsRepository.js";
import type { BackendOrderItem, OrderLineCostBasis, SupplierCode, SupplierOrderLine, SupplierProductMapping } from "./types.js";

const authoritativeCjCostTypes = new Set(["PROCUREMENT_COST", "STOCK_UP_PRICE", "WHOLESALE_PRICE", "VARIANT_SELL_PRICE"]);
export const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function createInitialCostBasis(item: Pick<BackendOrderItem, "productId" | "sku" | "quantity" | "unitPrice" | "lineTotal">, vatRatePercent: number, now = new Date().toISOString()): OrderLineCostBasis {
  const revenueExVat = money(item.lineTotal / (1 + vatRatePercent / 100));
  return { status: "UNAVAILABLE", evaluatedAt: now, productId: item.productId, productSku: item.sku, quantity: item.quantity, customerUnitPriceInclVat: item.unitPrice, customerLineTotalInclVat: item.lineTotal, vatRatePercent, vatAmount: money(item.lineTotal - revenueExVat), revenueExVat, reason: "Supplier allocation has not been selected." };
}

interface ResolvedCost { sourceUnitCost: number; sourceCurrency: string; normalizedUnitCostZar: number; fxRate?: number; fxProvider?: string; fxEffectiveAt?: string; observedAt: string; sourceFingerprint?: string; sourceReference?: string; pricingPolicyReference?: string; }
export async function resolveSelectedSupplierCost(supplierCode: SupplierCode, mapping: SupplierProductMapping): Promise<ResolvedCost | undefined> {
  if (supplierCode === "TEKCENTRAL" && mapping.supplierOfferId) {
    const [offer, policy] = await Promise.all([getTekCentralManualOffer(mapping.supplierOfferId), getSupplierPolicySettings()]);
    if (!offer || !offer.active || offer.mappingStatus !== "VERIFIED" || offer.productId !== mapping.productId || offer.supplierSku !== mapping.supplierSku) return undefined;
    if (Date.now() - Date.parse(offer.costObservedAt) > policy.sourcePriceFreshnessHours * 3_600_000) return undefined;
    return { sourceUnitCost: offer.sourceCostExVat, sourceCurrency: "ZAR", normalizedUnitCostZar: offer.sourceCostExVat, observedAt: offer.costObservedAt, sourceFingerprint: offer.sourceFingerprint, sourceReference: `TEKCENTRAL:${offer.id}` };
  }
  if (supplierCode === "SCOOP") {
    const offer = await getScoopCatalogueProduct(mapping.supplierSku);
    if (!offer || offer.dealerPriceExVat === undefined || offer.currency !== "ZAR" || offer.staleAt) return undefined;
    const activeSource = offer.sourceObservations.find((entry) => entry.active && entry.sourceType === "XML_FEED");
    return { sourceUnitCost: offer.dealerPriceExVat, sourceCurrency: "ZAR", normalizedUnitCostZar: offer.dealerPriceExVat, observedAt: offer.lastSyncedAt, sourceReference: activeSource?.sourceReference ?? offer.sourceMetadata.feedUrl, sourceFingerprint: createHash("sha256").update(`${offer.supplierSku}|${offer.dealerPriceExVat}|${offer.lastSyncedAt}`).digest("hex") };
  }
  if (supplierCode === "CJ" && mapping.supplierProductId && mapping.supplierVariantId) {
    const product = await getCjCatalogueProduct(mapping.supplierProductId); const variant = product?.variants.find((entry) => entry.supplierVariantId === mapping.supplierVariantId); const evidence = variant?.costEvidence;
    const currency = evidence?.currency ?? variant?.currency ?? product?.currency;
    if (!evidence || !currency || !authoritativeCjCostTypes.has(evidence.classification)) return undefined;
    const fx = await resolveFxEvidence(currency, "ZAR"); if (!fx.rate || fx.status !== "FRESH") return undefined;
    return { sourceUnitCost: evidence.amount, sourceCurrency: currency, normalizedUnitCostZar: money(evidence.amount * fx.rate), fxRate: currency === "ZAR" ? undefined : fx.rate, fxProvider: currency === "ZAR" ? undefined : fx.provider, fxEffectiveAt: currency === "ZAR" ? undefined : fx.capturedAt, observedAt: evidence.capturedAt, sourceFingerprint: evidence.sourceFingerprint ?? variant?.rawSourceFingerprint, sourceReference: evidence.endpoint };
  }
  if (supplierCode === "SYNTECH") {
    const offer = await getSyntechCatalogueProduct(mapping.supplierSku);
    if (!offer || offer.sourcePresence !== "ACTIVE" || offer.effectiveDealerCostExVat === undefined || offer.currency !== "ZAR") return undefined;
    return { sourceUnitCost: offer.effectiveDealerCostExVat, sourceCurrency: "ZAR", normalizedUnitCostZar: offer.effectiveDealerCostExVat, observedAt: offer.observedAt, sourceFingerprint: offer.sourceFingerprint, sourceReference: `SYNTECH:${offer.supplierSku}` };
  }
  const offerId = mapping.supplierOfferId;
  if (!offerId) return undefined;
  const proposal = (await listPricingProposals()).filter((entry) => entry.status === "APPROVED" && entry.productId === mapping.productId && entry.supplierId === supplierCode && entry.supplierOfferId === offerId).sort((a, b) => (b.approvedAt ?? b.generatedAt).localeCompare(a.approvedAt ?? a.generatedAt))[0];
  const sourceUnitCost = proposal?.costSnapshot.sourceCostAmount ?? proposal?.costSnapshot.supplierCostExVat ?? proposal?.costSnapshot.landedCostExVat; const currency = proposal?.costSnapshot.sourceCurrency ?? proposal?.costSnapshot.currency;
  const normalized = proposal?.costSnapshot.landedCostExVat ?? proposal?.costSnapshot.supplierCostExVat;
  if (!proposal || sourceUnitCost === undefined || normalized === undefined || !currency) return undefined;
  return { sourceUnitCost, sourceCurrency: currency, normalizedUnitCostZar: normalized, fxRate: proposal.costSnapshot.fxRateUsed, fxProvider: proposal.costSnapshot.fxProvider, fxEffectiveAt: proposal.costSnapshot.fxCapturedAt, observedAt: proposal.costSnapshot.pricingTimestamp, sourceReference: proposal.costSnapshot.fxSourceReference, pricingPolicyReference: proposal.id };
}

export function finalizeCostBasis(item: BackendOrderItem, line: SupplierOrderLine, supplierId: SupplierCode, now = new Date().toISOString()): OrderLineCostBasis {
  const current = item.costBasis;
  if (current?.status === "COMPLETE") return current;
  const revenue = current ?? createInitialCostBasis(item, 15, item.costBasis?.evaluatedAt ?? now);
  if (line.normalizedUnitCostZar === undefined || line.sourceUnitCost === undefined || !line.sourceCurrency) return { ...revenue, status: "PARTIAL", evaluatedAt: now, supplierId, supplierOfferId: line.supplierOfferId, mappingId: line.mappingId, reason: "Authoritative supplier cost or FX evidence was unavailable when fulfilment was selected." };
  const normalizedLineCostZar = money(line.normalizedUnitCostZar * item.quantity); const grossProfit = money(revenue.revenueExVat - normalizedLineCostZar);
  return { ...revenue, status: "COMPLETE", evaluatedAt: now, capturedAt: now, supplierId, supplierOfferId: line.supplierOfferId, mappingId: line.mappingId, sourceCurrency: line.sourceCurrency, sourceUnitCost: line.sourceUnitCost, fxStatus: line.sourceCurrency === "ZAR" ? "NOT_REQUIRED" : "CAPTURED", fxPair: line.sourceCurrency === "ZAR" ? undefined : `${line.sourceCurrency}/ZAR`, fxRate: line.fxRate, fxProvider: line.fxProvider, fxEffectiveAt: line.fxEffectiveAt, normalizedUnitCostZar: line.normalizedUnitCostZar, normalizedLineCostZar, grossProfit, grossMarginPercent: revenue.revenueExVat > 0 ? money(grossProfit / revenue.revenueExVat * 100) : 0, pricingPolicyReference: line.pricingPolicyReference, costEvidenceObservedAt: line.costEvidenceObservedAt, sourceFingerprint: line.costSourceFingerprint, sourceReference: line.costSourceReference, reason: undefined };
}

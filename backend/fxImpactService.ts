import { createHash } from "node:crypto";
import { getBusinessSettings, type FxImpactThresholds, type PricingSettings } from "./businessSettingsRepository.js";
import { saveFxPricingImpact, listFxPricingImpacts, type FxImpactClassification, type FxPricingImpact } from "./fxImpactRepository.js";
import type { FxQuote } from "./fxRateRepository.js";
import { listAdminProducts } from "./internalProductRepository.js";
import { getPublicationSummary } from "./productPublicationRepository.js";
import { listPricingProposals, savePricingProposal, type PricingProposal } from "./pricingProposalRepository.js";
import { calculateProposedPrice, TARGET_MARGIN_TOLERANCE_PERCENTAGE_POINTS, type SupplierPricingInput } from "./supplierPricing.js";
import { notifyFxPricingImpact } from "./internalNotificationService.js";
import { bestEffortAlert, recordOperationalEvent } from "./operationalAlertService.js";

const money = (value: number) => Number(value.toFixed(2));
export function classifyFxImpact(percent: number, direction: FxPricingImpact["direction"], thresholds: FxImpactThresholds): FxImpactClassification {
  const magnitude = Math.abs(percent);
  if (magnitude < thresholds.monitorPercent) return "IGNORE";
  if (magnitude < thresholds.reviewPercent) return "MONITOR";
  if (direction === "DECREASE") return "MONITOR";
  if (magnitude < thresholds.criticalPercent) return "REVIEW";
  return "CRITICAL";
}
export function calculateMarginAtPrice(priceInclVat: number | undefined, costExVat: number, vatPercent: number) {
  if (!priceInclVat || priceInclVat <= 0) return undefined;
  const priceExVat = priceInclVat / (1 + vatPercent / 100); const profit = priceExVat - costExVat;
  return { grossProfit: money(profit), grossMarginPercent: money((profit / priceExVat) * 100) };
}
export function shouldAutoGenerateFxProposal(classification: FxImpactClassification, settings: PricingSettings) {
  return settings.fxImpactMonitoringEnabled && settings.fxImpactMonitoringMode === "ASSISTED" && (classification === "REVIEW" || classification === "CRITICAL");
}
export function evaluateFxImpact(input: { productId: string; productName: string; category?: string; proposal: PricingProposal; baselinePrice?: number; commercialBaseline: FxPricingImpact["commercialBaseline"]; currentFx: FxQuote; settings: PricingSettings; now?: string }): FxPricingImpact {
  const previousFx = input.proposal.costSnapshot.fxRateUsed!; const sourceCost = input.proposal.costSnapshot.sourceCostAmount!;
  const buffer = input.proposal.costSnapshot.fxBufferPercent ?? 0;
  const previousCost = input.proposal.costSnapshot.landedCostExVat!;
  const currentCost = money(sourceCost * input.currentFx.rate * (1 + buffer / 100));
  const delta = money(currentCost - previousCost); const deltaPercent = previousCost ? money((delta / previousCost) * 100) : 0;
  const direction = delta > 0 ? "INCREASE" as const : delta < 0 ? "DECREASE" as const : "UNCHANGED" as const;
  const previousMargin = calculateMarginAtPrice(input.baselinePrice, previousCost, input.settings.vatRatePercent);
  const currentMargin = calculateMarginAtPrice(input.baselinePrice, currentCost, input.settings.vatRatePercent);
  const nextCost: SupplierPricingInput = { ...input.proposal.costSnapshot, landedCostExVat: currentCost, fxRateUsed: input.currentFx.rate, fxCapturedAt: input.currentFx.fetchedAt, fxProvider: input.currentFx.provider, fxSourceReference: input.currentFx.sourceReference };
  const recommended = calculateProposedPrice(nextCost, input.settings);
  let classification = classifyFxImpact(deltaPercent, direction, input.settings.fxImpactThresholds); const reasons: string[] = [];
  if (direction === "DECREASE") reasons.push("FAVORABLE_COST_MOVEMENT");
  if (direction === "INCREASE" && currentMargin && recommended.appliedPricingBand) {
    if (currentMargin.grossProfit < (recommended.appliedPricingBand.minimumGrossProfit ?? 0) || currentMargin.grossMarginPercent < recommended.appliedPricingBand.targetGrossMarginPercent - TARGET_MARGIN_TOLERANCE_PERCENTAGE_POINTS) { classification = classification === "CRITICAL" ? "CRITICAL" : "REVIEW"; reasons.push("MARGIN_POLICY_AT_RISK"); }
    if (currentMargin.grossProfit <= 0) { classification = "CRITICAL"; reasons.push("NON_POSITIVE_GROSS_PROFIT"); }
  }
  const evaluatedAt = input.now ?? new Date().toISOString();
  const fingerprint = createHash("sha256").update(JSON.stringify([input.productId, input.proposal.supplierOfferId, sourceCost, input.currentFx.rate, input.baselinePrice, classification])).digest("hex");
  return { id: `${input.productId}:${input.proposal.supplierOfferId}`, productId: input.productId, productName: input.productName, category: input.category, supplierId: input.proposal.supplierId, supplierOfferId: input.proposal.supplierOfferId, sourceCurrency: input.proposal.costSnapshot.sourceCurrency!, targetCurrency: "ZAR", sourceCostAmount: sourceCost, previousFxRate: previousFx, currentFxRate: input.currentFx.rate, previousNormalizedCost: previousCost, currentNormalizedCost: currentCost, costDelta: delta, costDeltaPercent: deltaPercent, direction, commercialBaseline: input.commercialBaseline, currentRetailPrice: input.baselinePrice, previousGrossMarginPercent: previousMargin?.grossMarginPercent, currentGrossMarginPercent: currentMargin?.grossMarginPercent, marginPointChange: previousMargin && currentMargin ? money(currentMargin.grossMarginPercent - previousMargin.grossMarginPercent) : undefined, currentGrossProfit: currentMargin?.grossProfit, recommendedPrice: recommended.proposedSellingPriceInclVat, classification, reasons, evaluatedAt, fxEffectiveAt: input.currentFx.effectiveAt, fxProvider: input.currentFx.provider, fingerprint, resultingAction: classification === "IGNORE" ? "NONE" : classification === "MONITOR" ? "MONITOR" : "PRICE_REVIEW_REQUIRED", notificationRequired: classification === "REVIEW" || classification === "CRITICAL" };
}

function selectBaseline(proposals: PricingProposal[], livePrice?: number) {
  const latest = (status: PricingProposal["status"]) => proposals.filter((item) => item.status === status).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];
  if (livePrice !== undefined) return { proposal: proposals.filter((item) => item.status === "APPROVED").sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0] ?? latest("PENDING_APPROVAL"), price: livePrice, kind: "LIVE" as const };
  const approved = latest("APPROVED"); if (approved) return { proposal: approved, price: approved.proposedSellingPriceInclVat, kind: "APPROVED" as const };
  const pending = latest("PENDING_APPROVAL") ?? latest("DRAFT"); return { proposal: pending, price: pending?.proposedSellingPriceInclVat, kind: pending ? "PENDING" as const : "NONE" as const };
}
async function createImpactProposal(impact: FxPricingImpact, baseline: PricingProposal, settings: PricingSettings, quote: FxQuote) {
  const existing = (await listPricingProposals()).find((item) => item.productId === impact.productId && item.supplierOfferId === impact.supplierOfferId && item.status === "PENDING_APPROVAL" && item.costSnapshot.fxRateUsed === quote.rate && item.costSnapshot.landedCostExVat === impact.currentNormalizedCost);
  if (existing) return existing;
  const costSnapshot = { ...baseline.costSnapshot, landedCostExVat: impact.currentNormalizedCost, fxRateUsed: quote.rate, fxCapturedAt: quote.fetchedAt, fxProvider: quote.provider, fxSourceReference: quote.sourceReference };
  const result = calculateProposedPrice(costSnapshot, settings);
  return savePricingProposal({ ...result, productId: baseline.productId, supplierId: baseline.supplierId, supplierOfferId: baseline.supplierOfferId, costSnapshot, settingsSnapshot: settings, status: "PENDING_APPROVAL" });
}
export async function reconcileForeignCurrencyPricingImpact(quote: FxQuote, options?: { forceProposalIds?: string[] }) {
  const settings = (await getBusinessSettings()).pricing; const products = await listAdminProducts(); const proposals = await listPricingProposals();
  const groups = new Map<string, PricingProposal[]>();
  for (const proposal of proposals.filter((item) => item.costSnapshot.sourceCurrency === quote.sourceCurrency && item.costSnapshot.fxRateUsed && item.costSnapshot.sourceCostAmount !== undefined && item.status !== "REJECTED" && item.status !== "SUPERSEDED")) { const key = `${proposal.productId}:${proposal.supplierOfferId}`; groups.set(key, [...(groups.get(key) ?? []), proposal]); }
  const summary = { evaluated: 0, generated: 0, blocked: 0, notifications: 0 };
  for (const group of groups.values()) {
    const product = products.find((item) => item.id === group[0].productId); if (!product) { summary.blocked += 1; continue; }
    const publication = await getPublicationSummary(product.id); const baseline = selectBaseline(group, publication.state === "PUBLISHED" ? publication.activePrice : undefined); if (!baseline.proposal) { summary.blocked += 1; continue; }
    let impact = evaluateFxImpact({ productId: product.id, productName: product.name, category: product.category, proposal: baseline.proposal, baselinePrice: baseline.price, commercialBaseline: baseline.kind, currentFx: quote, settings }); summary.evaluated += 1;
    const forced = options?.forceProposalIds?.includes(impact.id); const shouldGenerate = forced || shouldAutoGenerateFxProposal(impact.classification, settings);
    if (shouldGenerate) { const proposal = await createImpactProposal(impact, baseline.proposal, settings, quote); impact = { ...impact, proposalId: proposal.id, resultingAction: "PROPOSAL_CREATED" }; summary.generated += 1; }
    const saved = await saveFxPricingImpact(impact);
    if (saved.classification === "REVIEW" || saved.classification === "CRITICAL") await bestEffortAlert({ type: "CJ_COST_MOVEMENT_REQUIRES_REVIEW", severity: saved.classification === "CRITICAL" ? "CRITICAL" : "WARNING", subsystem: "PRICING", title: "Foreign-currency cost movement requires pricing review", summary: "One or more foreign-currency supplier costs moved beyond the configured pricing-review threshold.", targetRoute: "/admin/pricing?view=fx-impact", recommendedAction: "Review pricing proposals", diagnosticCode: "FX_COST_MOVEMENT_ACTIONABLE" });
    else if (saved.classification === "MONITOR") await recordOperationalEvent({ severity: "INFO", subsystem: "PRICING", eventType: "FX_COST_MOVEMENT_MONITOR", summary: "A foreign-currency cost movement remains within the configured monitoring band.", diagnosticCode: "FX_COST_MOVEMENT_MONITOR" }).catch(() => undefined);
    if (saved.notificationRequired && saved.notificationCreatedAt === saved.evaluatedAt) {
      summary.notifications += 1;
      const proposal = saved.proposalId ? (await listPricingProposals()).find((item) => item.id === saved.proposalId) : undefined;
      await notifyFxPricingImpact(saved, proposal).catch(() => undefined);
    }
  }
  return summary;
}
export async function getFxImpactDashboard() { const impacts = await listFxPricingImpacts(); return { impacts, metrics: { healthy: impacts.filter((item) => item.classification === "IGNORE").length, monitor: impacts.filter((item) => item.classification === "MONITOR").length, review: impacts.filter((item) => item.classification === "REVIEW").length, critical: impacts.filter((item) => item.classification === "CRITICAL").length, pendingProposals: impacts.filter((item) => item.proposalId).length, notifications: impacts.filter((item) => item.notificationRequired).length } }; }

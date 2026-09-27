import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { calculateCompetitiveSuggestion, classifyPricingWarning, TARGET_MARGIN_TOLERANCE_PERCENTAGE_POINTS, type SupplierPricingInput, type SupplierPricingResult } from "./supplierPricing.js";
import type { PricingSettings } from "./businessSettingsRepository.js";

export type PricingProposalStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "SUPERSEDED";
export type PricingOverrideReasonCategory = "COMPETITIVE_ALIGNMENT" | "MARKET_PRICE" | "PROMOTION" | "MARGIN_EXCEPTION" | "CUSTOMER_QUOTE" | "OTHER";
export interface PricingManualOverrideSnapshot { override: true; priceInclVat: number; reason: string; reasonCategory?: PricingOverrideReasonCategory; actor: string; timestamp: string; originalProposalId: string; grossProfitExVat: number; grossMarginPercent: number; markupPercent: number; }
export interface PricingProposal extends SupplierPricingResult { id: string; productId: string; supplierId: string; supplierOfferId: string; costSnapshot: SupplierPricingInput; settingsSnapshot?: PricingSettings; proposalKind?: "AUTOMATED" | "MANUAL_OVERRIDE"; status: PricingProposalStatus; generatedAt: string; updatedAt: string; approvedAt?: string; rejectedAt?: string; supersededByProposalId?: string; supersededAt?: string; manualOverride?: PricingManualOverrideSnapshot; }
interface Store { version: 1; proposals: PricingProposal[]; }
function path() { return resolve(process.cwd(), ".data", "pricing-proposals.json"); }
function hydrateProposal(proposal: PricingProposal): PricingProposal {
  const costExVat = proposal.costSnapshot.landedCostExVat ?? proposal.costSnapshot.supplierCostExVat;
  const targetMargin = proposal.appliedPricingBand?.targetGrossMarginPercent;
  const minimumProfit = proposal.appliedPricingBand?.minimumGrossProfit ?? 0;
  const targetMarginProposal = proposal.targetMarginProposal ?? (proposal.proposedSellingPriceInclVat !== undefined && proposal.proposedSellingPriceExVat !== undefined && proposal.grossProfit !== undefined && proposal.grossMarginPercent !== undefined && proposal.markupPercent !== undefined && targetMargin !== undefined ? {
    suggestedPriceInclVat: proposal.proposedSellingPriceInclVat,
    suggestedPriceExVat: proposal.proposedSellingPriceExVat,
    grossProfitExVat: proposal.grossProfit,
    grossMarginPercent: proposal.grossMarginPercent,
    markupPercent: proposal.markupPercent,
    minimumProfitPasses: proposal.grossProfit > 0 && proposal.grossProfit >= minimumProfit,
    targetMarginPasses: proposal.grossMarginPercent >= targetMargin - TARGET_MARGIN_TOLERANCE_PERCENTAGE_POINTS,
    referenceRetailDelta: 0,
  } : undefined);
  const competitiveSuggestion = proposal.competitiveSuggestion ?? (proposal.referenceRetailInclVat !== undefined && proposal.proposedSellingPriceInclVat !== undefined && proposal.proposedSellingPriceInclVat > proposal.referenceRetailInclVat && costExVat !== undefined && targetMargin !== undefined
    ? calculateCompetitiveSuggestion(proposal.referenceRetailInclVat, proposal.proposedSellingPriceInclVat, costExVat, proposal.vatRatePercent, targetMargin, minimumProfit)
    : undefined);
  const warnings = proposal.warnings.filter((code) => code !== "BELOW_TARGET_MARGIN" || !targetMarginProposal?.targetMarginPasses);
  return {
    ...proposal,
    proposalKind: proposal.manualOverride ? "MANUAL_OVERRIDE" : proposal.proposalKind ?? "AUTOMATED",
    warnings,
    warningDetails: proposal.warningDetails?.filter((warning) => warnings.includes(warning.code)) ?? warnings.map((code) => classifyPricingWarning(code, { referencePriceBehavior: "WARNING_ONLY" })),
    targetMarginProposal,
    competitiveSuggestion,
  };
}
async function readStore(): Promise<Store> { try { const value = JSON.parse(await readFile(path(), "utf8")) as Store; return value.version === 1 && Array.isArray(value.proposals) ? { ...value, proposals: value.proposals.map(hydrateProposal) } : { version: 1, proposals: [] }; } catch { return { version: 1, proposals: [] }; } }
async function writeStore(store: Store) { const target = path(); const temp = `${target}.tmp`; await mkdir(dirname(target), { recursive: true }); await writeFile(temp, JSON.stringify(store, null, 2)); await rename(temp, target); }
export async function listPricingProposals() { return (await readStore()).proposals; }
export async function savePricingProposal(input: Omit<PricingProposal, "id" | "generatedAt" | "updatedAt">) {
  const store = await readStore(); const now = new Date().toISOString();
  const id = `price-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  store.proposals = store.proposals.map((item) => item.productId === input.productId && item.status !== "REJECTED" && item.status !== "SUPERSEDED" ? { ...item, status: "SUPERSEDED", supersededByProposalId: id, supersededAt: now, updatedAt: now } : item);
  const proposal: PricingProposal = { ...input, proposalKind: input.proposalKind ?? "AUTOMATED", id, generatedAt: now, updatedAt: now };
  store.proposals.unshift(proposal); await writeStore(store); return proposal;
}
export async function getPricingProposal(id: string) { return (await readStore()).proposals.find((item) => item.id === id); }
export async function saveManualOverrideProposal(originalId: string, input: Omit<PricingProposal, "id" | "generatedAt" | "updatedAt">) {
  const store = await readStore();
  const originalIndex = store.proposals.findIndex((item) => item.id === originalId);
  if (originalIndex < 0) throw new Error("Pricing proposal not found.");
  if (!["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(store.proposals[originalIndex].status)) throw new Error("Only an active pricing proposal can be overridden.");
  const now = new Date().toISOString();
  const id = `price-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  store.proposals[originalIndex] = { ...store.proposals[originalIndex], status: "SUPERSEDED", supersededByProposalId: id, supersededAt: now, updatedAt: now };
  const proposal: PricingProposal = { ...input, proposalKind: "MANUAL_OVERRIDE", id, generatedAt: now, updatedAt: now };
  store.proposals.unshift(proposal);
  await writeStore(store);
  return { proposal, superseded: store.proposals[originalIndex + 1] ?? store.proposals.find((item) => item.id === originalId)! };
}
export async function setPricingProposalStatus(id: string, status: "APPROVED" | "REJECTED") { const store = await readStore(); const index = store.proposals.findIndex((item) => item.id === id); if (index < 0) return undefined; if (store.proposals[index].status !== "PENDING_APPROVAL") throw new Error("Only pending proposals can be approved or rejected."); const now = new Date().toISOString(); store.proposals[index] = { ...store.proposals[index], status, updatedAt: now, ...(status === "APPROVED" ? { approvedAt: now } : { rejectedAt: now }) }; await writeStore(store); return store.proposals[index]; }

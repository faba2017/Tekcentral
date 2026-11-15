import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { calculateCompetitiveSuggestion, classifyPricingWarning, TARGET_MARGIN_TOLERANCE_PERCENTAGE_POINTS, type SupplierPricingInput, type SupplierPricingResult } from "./supplierPricing.js";
import type { PricingSettings } from "./businessSettingsRepository.js";
import { loadPersistenceConfig } from "./persistence/config.js";
import { readRows, replacePricing } from "./persistence/catalogueRepository.js";

export type PricingProposalStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "SUPERSEDED";
export type PricingOverrideReasonCategory = "COMPETITIVE_ALIGNMENT" | "MARKET_PRICE" | "PROMOTION" | "MARGIN_EXCEPTION" | "CUSTOMER_QUOTE" | "OTHER";
export interface PricingManualOverrideSnapshot { override: true; priceInclVat: number; reason: string; reasonCategory?: PricingOverrideReasonCategory; actor: string; timestamp: string; originalProposalId: string; grossProfitExVat: number; grossMarginPercent: number; markupPercent: number; }
export interface PricingProposal extends SupplierPricingResult { id: string; productId: string; supplierId: string; supplierOfferId: string; costSnapshot: SupplierPricingInput; settingsSnapshot?: PricingSettings; proposalKind?: "AUTOMATED" | "MANUAL_OVERRIDE"; status: PricingProposalStatus; generatedAt: string; updatedAt: string; approvedAt?: string; approvedBy?: string; rejectedAt?: string; rejectedBy?: string; supersededByProposalId?: string; supersededAt?: string; manualOverride?: PricingManualOverrideSnapshot; }
export type PricingPresentationState = "NEEDS_APPROVAL" | "APPROVED_NOT_PUBLISHED" | "LIVE" | "LIVE_PRICE_CHANGE_PENDING" | "HISTORY";
export function canApprovePricingProposal(proposal: Pick<PricingProposal, "warningDetails">) { return !proposal.warningDetails?.some((warning) => warning.severity === "BLOCKING"); }
export function derivePricingPresentation(input: { proposal: PricingProposal; publication?: { state: string; activePrice?: number; slug?: string } }) {
  if (input.proposal.status === "DRAFT" || input.proposal.status === "PENDING_APPROVAL") return { state: "NEEDS_APPROVAL" as const };
  if (input.proposal.status !== "APPROVED") return { state: "HISTORY" as const };
  if (input.publication?.state !== "PUBLISHED" || input.publication.activePrice === undefined) return { state: "APPROVED_NOT_PUBLISHED" as const };
  const approvedPrice = input.proposal.proposedSellingPriceInclVat;
  const matches = approvedPrice !== undefined && Math.abs(Number(approvedPrice) - Number(input.publication.activePrice)) < 0.005;
  return { state: matches ? "LIVE" as const : "LIVE_PRICE_CHANGE_PENDING" as const, livePrice: input.publication.activePrice, approvedNextPrice: approvedPrice, slug: input.publication.slug };
}
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
async function readStore(): Promise<Store> { if (loadPersistenceConfig().provider === "POSTGRES") return { version: 1, proposals: (await readRows<PricingProposal>("catalogue_pricing_proposals", "generated_at DESC, id")).map(hydrateProposal) }; try { const value = JSON.parse(await readFile(path(), "utf8")) as Store; return value.version === 1 && Array.isArray(value.proposals) ? { ...value, proposals: value.proposals.map(hydrateProposal) } : { version: 1, proposals: [] }; } catch { return { version: 1, proposals: [] }; } }
async function writeStore(store: Store) { if (loadPersistenceConfig().provider === "POSTGRES") { await replacePricing(store.proposals); return; } const target = path(); const temp = `${target}.tmp`; await mkdir(dirname(target), { recursive: true }); await writeFile(temp, JSON.stringify(store, null, 2)); await rename(temp, target); }
export async function listPricingProposals() { return (await readStore()).proposals; }
export async function savePricingProposal(input: Omit<PricingProposal, "id" | "generatedAt" | "updatedAt">) {
  const store = await readStore(); const now = new Date().toISOString();
  const id = `price-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  store.proposals = store.proposals.map((item) => item.productId === input.productId && (item.status === "DRAFT" || item.status === "PENDING_APPROVAL") ? { ...item, status: "SUPERSEDED", supersededByProposalId: id, supersededAt: now, updatedAt: now } : item);
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
export async function setPricingProposalStatus(id: string, status: "APPROVED" | "REJECTED", actor = "Admin staff") { const store = await readStore(); const index = store.proposals.findIndex((item) => item.id === id); if (index < 0) return undefined; if (store.proposals[index].status !== "PENDING_APPROVAL") throw new Error("Only pending proposals can be approved or rejected."); if (status === "APPROVED" && !canApprovePricingProposal(store.proposals[index])) throw new Error("Pricing proposal has blocking commercial warnings and cannot be approved."); const now = new Date().toISOString(); const staffActor = actor.trim() || "Admin staff"; store.proposals[index] = { ...store.proposals[index], status, updatedAt: now, ...(status === "APPROVED" ? { approvedAt: now, approvedBy: staffActor } : { rejectedAt: now, rejectedBy: staffActor }) }; await writeStore(store); return store.proposals[index]; }

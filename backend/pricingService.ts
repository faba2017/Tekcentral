import { getBusinessSettings } from "./businessSettingsRepository.js";
import { getAdminProductById } from "./internalProductRepository.js";
import { getAdminSupplierOrder } from "./supplierOrchestration.js";
import { getSupplierProductMapping, listSupplierProductMappings } from "./supplierProductMappingRepository.js";
import { getScoopCatalogueProduct } from "./suppliers/scoop/scoopCatalogueRepository.js";
import { calculateManualPriceOverride, calculateProposedPrice, cjLandedCostPricingInput, scoopPricingInput } from "./supplierPricing.js";
import { getPricingProposal, saveManualOverrideProposal, savePricingProposal, type PricingOverrideReasonCategory } from "./pricingProposalRepository.js";

export async function generateScoopPricingProposal(input: { productId: string; supplierSku: string }) {
  if (!await getAdminProductById(input.productId)) throw new Error("TekCentral product not found.");
  const offer = await getScoopCatalogueProduct(input.supplierSku);
  if (!offer?.dealerPriceExVat || !offer.sourceObservations.some((source) => source.sourceType === "XML_FEED" && source.active)) throw new Error("Authoritative Scoop dealer cost is not available.");
  const mapping = (await listSupplierProductMappings()).find((item) => item.supplierCode === "SCOOP" && item.productId === input.productId && item.supplierSku === input.supplierSku && item.status === "VERIFIED");
  if (!mapping) throw new Error("A verified Scoop mapping is required.");
  const settings = (await getBusinessSettings()).pricing;
  const costSnapshot = scoopPricingInput({ supplierOfferId: mapping.supplierOfferId ?? `SCOOP:${offer.supplierSku}`, dealerPriceExVat: offer.dealerPriceExVat, referenceRetailInclVat: offer.retailPriceInclVat, pricingTimestamp: offer.lastSyncedAt });
  const result = calculateProposedPrice(costSnapshot, settings);
  return savePricingProposal({ ...result, productId: input.productId, supplierId: "SCOOP", supplierOfferId: costSnapshot.supplierOfferId, costSnapshot, settingsSnapshot: settings, status: settings.proposedPricesRequireApproval ? "PENDING_APPROVAL" : "DRAFT" });
}

export async function generateCjPricingProposal(input: { supplierOrderId: string; productId: string }) {
  const supplierOrder = await getAdminSupplierOrder(input.supplierOrderId);
  if (!supplierOrder || supplierOrder.supplierCode !== "CJ") throw new Error("CJ supplier order not found.");
  if (supplierOrder.itemLines.length !== 1) throw new Error("CJ pricing proposals currently require a single-line supplier order.");
  const line = supplierOrder.itemLines.find((item) => item.productId === input.productId);
  const mapping = await getSupplierProductMapping(input.productId, "CJ");
  const productCost = supplierOrder.supplierSubtotal ?? (line?.unitCost === undefined || line.unitCost === null ? undefined : line.unitCost * line.quantity);
  const selected = supplierOrder.cjOperations?.selectedLogistics;
  if (!mapping || mapping.status !== "VERIFIED" || !mapping.supplierOfferId && !mapping.supplierVariantId) throw new Error("A verified CJ mapping is required.");
  if (productCost === undefined || productCost === null || selected?.shippingCost === undefined || !selected.currency) throw new Error("CJ product and selected logistics costs are required.");
  const settings = (await getBusinessSettings()).pricing;
  const costSnapshot = cjLandedCostPricingInput({ supplierOfferId: mapping.supplierOfferId ?? `CJ:${input.productId}:${mapping.supplierVariantId}`, currency: selected.currency, productCost, shippingCost: selected.shippingCost, fxRate: selected.currency === "ZAR" ? 1 : settings.cjManualFxRate, fxBufferPercent: settings.cjFxBufferPercent, pricingTimestamp: selected.selectedAt });
  const result = calculateProposedPrice(costSnapshot, settings);
  return savePricingProposal({ ...result, productId: input.productId, supplierId: "CJ", supplierOfferId: costSnapshot.supplierOfferId, costSnapshot, settingsSnapshot: settings, status: settings.proposedPricesRequireApproval ? "PENDING_APPROVAL" : "DRAFT" });
}

export interface PricingOverrideInput { proposalId: string; overridePriceInclVat: number; overrideReason: string; reasonCategory?: PricingOverrideReasonCategory; }
const overrideCategories = new Set<PricingOverrideReasonCategory>(["COMPETITIVE_ALIGNMENT", "MARKET_PRICE", "PROMOTION", "MARGIN_EXCEPTION", "CUSTOMER_QUOTE", "OTHER"]);

async function preparePricingOverride(input: PricingOverrideInput) {
  const proposal = await getPricingProposal(input.proposalId);
  if (!proposal) throw new Error("Pricing proposal not found.");
  if (!["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(proposal.status)) throw new Error("Only an active pricing proposal can be overridden.");
  if (!input.overrideReason?.trim()) throw new Error("A human-readable override reason is required.");
  if (input.reasonCategory && !overrideCategories.has(input.reasonCategory)) throw new Error("Override reason category is invalid.");
  const settings = proposal.settingsSnapshot ?? (await getBusinessSettings()).pricing;
  const automatedTarget = proposal.targetMarginProposal?.suggestedPriceInclVat ?? proposal.proposedSellingPriceInclVat;
  if (automatedTarget === undefined) throw new Error("The automated target price is unavailable.");
  return { proposal, settings, preview: calculateManualPriceOverride(proposal.costSnapshot, settings, input.overridePriceInclVat, automatedTarget) };
}

export async function previewPricingOverride(input: PricingOverrideInput) { return (await preparePricingOverride(input)).preview; }

export async function createPricingOverride(input: PricingOverrideInput) {
  const { proposal, settings, preview } = await preparePricingOverride(input);
  const now = new Date().toISOString();
  return saveManualOverrideProposal(proposal.id, {
    ...preview,
    productId: proposal.productId,
    supplierId: proposal.supplierId,
    supplierOfferId: proposal.supplierOfferId,
    costSnapshot: proposal.costSnapshot,
    settingsSnapshot: settings,
    status: settings.proposedPricesRequireApproval ? "PENDING_APPROVAL" : "DRAFT",
    manualOverride: {
      override: true,
      priceInclVat: preview.proposedSellingPriceInclVat!,
      reason: input.overrideReason.trim(),
      reasonCategory: input.reasonCategory,
      actor: "admin-local",
      timestamp: now,
      originalProposalId: proposal.id,
      grossProfitExVat: preview.grossProfit!,
      grossMarginPercent: preview.grossMarginPercent!,
      markupPercent: preview.markupPercent!,
    },
  });
}

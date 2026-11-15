import { getBusinessSettings, getSupplierPolicySettings } from "./businessSettingsRepository.js";
import { getAdminProductById } from "./internalProductRepository.js";
import { getAdminSupplierOrder } from "./supplierOrchestration.js";
import { getSupplierProductMapping, listSupplierProductMappings } from "./supplierProductMappingRepository.js";
import { getScoopCatalogueProduct } from "./suppliers/scoop/scoopCatalogueRepository.js";
import { getCjCatalogueProduct } from "./suppliers/cj/cjCatalogueRepository.js";
import { getCjEvidenceSettings } from "./suppliers/cj/cjEvidenceSettingsRepository.js";
import { cjVariantToSupplierOffer, deriveCjPricingEvidence } from "./suppliers/cj/cjLaunchPipeline.js";
import { calculateManualPriceOverride, calculateProposedPrice, cjLandedCostPricingInput, scoopPricingInput, syntechPricingInput, tekCentralManualPricingInput, tvrPricingInput } from "./supplierPricing.js";
import { getPricingProposal, listPricingProposals, saveManualOverrideProposal, savePricingProposal, type PricingOverrideReasonCategory } from "./pricingProposalRepository.js";
import { resolveFxEvidence } from "./fxRateService.js";
import { getSyntechCatalogueProduct } from "./suppliers/syntech/syntechCatalogueRepository.js";
import { getTekCentralManualOffer } from "./suppliers/tekcentral/tekcentralManualOfferRepository.js";
import { getTvrCatalogueOffer } from "./suppliers/tvr/tvrCatalogueService.js";
import { getSupplierSource } from "./supplierSourceRegistry.js";
import { TVR_COMMERCIAL_WORKBOOK_ID } from "./suppliers/tvr/tvrSourceManifest.js";

export async function generateTekCentralManualPricingProposal(input: { offerId: string }) {
  const offer = await getTekCentralManualOffer(input.offerId); if (!offer?.productId || offer.mappingStatus !== "VERIFIED") throw new Error("A verified Manual Supplier Product mapping is required.");
  if (!offer.active) throw new Error("The Manual Supplier offer is inactive.");
  const policy = await getSupplierPolicySettings(); if (Date.now() - Date.parse(offer.costObservedAt) > policy.sourcePriceFreshnessHours * 3_600_000) throw new Error("Manual Supplier cost evidence is stale.");
  const existing = (await listPricingProposals()).filter((proposal) => proposal.productId === offer.productId && proposal.supplierId === "TEKCENTRAL" && proposal.supplierOfferId === offer.id && !["REJECTED", "SUPERSEDED"].includes(proposal.status)).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];
  if (existing?.costSnapshot.supplierCostExVat === offer.sourceCostExVat && existing.costSnapshot.pricingTimestamp === offer.costObservedAt) return existing;
  const settings = (await getBusinessSettings()).pricing; const costSnapshot = tekCentralManualPricingInput({ supplierOfferId: offer.id, sourceCostExVat: offer.sourceCostExVat, pricingTimestamp: offer.costObservedAt }); const result = calculateProposedPrice(costSnapshot, settings);
  return savePricingProposal({ ...result, productId: offer.productId, supplierId: "TEKCENTRAL", supplierOfferId: offer.id, costSnapshot, settingsSnapshot: settings, status: "PENDING_APPROVAL" });
}

export async function generateScoopPricingProposal(input: { productId: string; supplierSku: string }) {
  if (!await getAdminProductById(input.productId)) throw new Error("TekCentral product not found.");
  const offer = await getScoopCatalogueProduct(input.supplierSku);
  if (offer?.availability === "STALE") throw new Error("The Scoop offer is stale. Refresh authoritative supplier evidence before generating a proposal.");
  if (!offer?.dealerPriceExVat || !offer.sourceObservations.some((source) => source.sourceType === "XML_FEED" && source.active)) throw new Error("Authoritative Scoop dealer cost is not available.");
  const mapping = (await listSupplierProductMappings()).find((item) => item.supplierCode === "SCOOP" && item.productId === input.productId && item.supplierSku === input.supplierSku && item.status === "VERIFIED");
  if (!mapping) throw new Error("A verified Scoop mapping is required.");
  const existing = (await listPricingProposals()).filter((proposal) => proposal.productId === input.productId && proposal.supplierId === "SCOOP" && proposal.supplierOfferId === (mapping.supplierOfferId ?? `SCOOP:${offer.supplierSku}`) && proposal.status !== "REJECTED" && proposal.status !== "SUPERSEDED").sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];
  if (existing?.costSnapshot.supplierCostExVat === offer.dealerPriceExVat) return existing;
  const settings = (await getBusinessSettings()).pricing;
  const costSnapshot = scoopPricingInput({ supplierOfferId: mapping.supplierOfferId ?? `SCOOP:${offer.supplierSku}`, dealerPriceExVat: offer.dealerPriceExVat, referenceRetailInclVat: offer.retailPriceInclVat, pricingTimestamp: offer.lastSyncedAt });
  const result = calculateProposedPrice(costSnapshot, settings);
  return savePricingProposal({ ...result, productId: input.productId, supplierId: "SCOOP", supplierOfferId: costSnapshot.supplierOfferId, costSnapshot, settingsSnapshot: settings, status: settings.proposedPricesRequireApproval ? "PENDING_APPROVAL" : "DRAFT" });
}

export async function generateSyntechPricingProposal(input: { productId: string; supplierSku: string }) {
  if (!await getAdminProductById(input.productId)) throw new Error("TekCentral product not found.");
  const offer = await getSyntechCatalogueProduct(input.supplierSku);
  if (!offer?.effectiveDealerCostExVat || offer.currency !== "ZAR") throw new Error("Authoritative Syntech dealer cost is not available.");
  const mapping = (await listSupplierProductMappings()).find((item) => item.supplierCode === "SYNTECH" && item.productId === input.productId && item.supplierSku === input.supplierSku && item.status === "VERIFIED");
  if (!mapping) throw new Error("A verified Syntech mapping is required.");
  const supplierPolicy = await getSupplierPolicySettings();
  if (Date.now() - Date.parse(offer.observedAt) > supplierPolicy.sourcePriceFreshnessHours * 3_600_000) throw new Error("Syntech dealer cost evidence is stale.");
  const supplierOfferId = mapping.supplierOfferId ?? `SYNTECH:${offer.supplierSku}`;
  const existing = (await listPricingProposals()).filter((proposal) => proposal.productId === input.productId && proposal.supplierId === "SYNTECH" && proposal.supplierOfferId === supplierOfferId && proposal.status !== "REJECTED" && proposal.status !== "SUPERSEDED").sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];
  if (existing?.costSnapshot.supplierCostExVat === offer.effectiveDealerCostExVat && existing.costSnapshot.pricingTimestamp === offer.observedAt) return existing;
  const settings = (await getBusinessSettings()).pricing;
  const costSnapshot = syntechPricingInput({ supplierOfferId, effectiveDealerCostExVat: offer.effectiveDealerCostExVat, referenceRetailInclVat: offer.rrpInclVat, pricingTimestamp: offer.observedAt });
  const result = calculateProposedPrice(costSnapshot, settings);
  return savePricingProposal({ ...result, productId: input.productId, supplierId: "SYNTECH", supplierOfferId, costSnapshot, settingsSnapshot: settings, status: "PENDING_APPROVAL" });
}

export async function generateCanonicalProductPricingProposal(productId: string) {
  const product = await getAdminProductById(productId);
  if (!product) throw new Error("TekCentral product not found.");
  const mappings = (await listSupplierProductMappings()).filter((item) => item.productId === productId && item.status === "VERIFIED");
  const sourceSupplier = "provenance" in product ? product.provenance.sourceSupplier : undefined;
  const mapping = mappings.find((item) => item.supplierCode === sourceSupplier) ?? mappings[0];
  if (!mapping) throw new Error("A verified supplier mapping is required before pricing can be generated.");
  if (mapping.supplierCode === "SYNTECH") return generateSyntechPricingProposal({ productId, supplierSku: mapping.supplierSku });
  if (mapping.supplierCode === "SCOOP") return generateScoopPricingProposal({ productId, supplierSku: mapping.supplierSku });
  if (mapping.supplierCode === "TVR" && mapping.supplierOfferId) return generateTvrPricingProposal({ productId, supplierOfferId: mapping.supplierOfferId });
  if (mapping.supplierCode === "TEKCENTRAL" && mapping.supplierOfferId) return generateTekCentralManualPricingProposal({ offerId: mapping.supplierOfferId });
  throw new Error("This Product requires the full pricing workspace to prepare its supplier-specific pricing evidence.");
}

export async function generateTvrPricingProposal(input: { productId: string; supplierOfferId: string }) {
  if (!await getAdminProductById(input.productId)) throw new Error("TekCentral product not found.");
  const [offer, mappings, supplierPolicy, settingsStore, source] = await Promise.all([getTvrCatalogueOffer(input.supplierOfferId), listSupplierProductMappings(), getSupplierPolicySettings(), getBusinessSettings(), getSupplierSource(TVR_COMMERCIAL_WORKBOOK_ID)]);
  const mapping = mappings.find((item) => item.supplierCode === "TVR" && item.productId === input.productId && item.supplierOfferId === input.supplierOfferId && item.status === "VERIFIED");
  if (!mapping) throw new Error("A verified TVR offer mapping is required.");
  if (!offer || offer.lifecycleStatus !== "CURRENT" || offer.classification === "CONFLICT") throw new Error("Current non-conflicting TVR commercial evidence is required.");
  if (source?.state !== "ACTIVE" || !source.isPrimary) throw new Error("The primary TVR commercial workbook source is not active.");
  if (offer.cost === undefined || offer.currency !== "ZAR" || !["EXCLUSIVE", "INCLUSIVE"].includes(offer.taxBasis)) throw new Error("Authoritative TVR dealer cost, currency and tax basis are required.");
  if (Date.now() - Date.parse(offer.observedAt) > supplierPolicy.sourcePriceFreshnessHours * 3_600_000) throw new Error("TVR dealer cost evidence is stale.");
  const settings = settingsStore.pricing;
  const sourcePriceField = offer.priceEvidence.alternatives.length === 1 ? offer.priceEvidence.alternatives[0].sourceLabel : undefined;
  const costSnapshot = tvrPricingInput({ supplierOfferId: offer.id, sourceCost: offer.cost, taxBasis: offer.taxBasis as "EXCLUSIVE" | "INCLUSIVE", vatRatePercent: settings.vatRatePercent, pricingTimestamp: offer.observedAt, sourcePriceField });
  const existing = (await listPricingProposals()).filter((proposal) => proposal.productId === input.productId && proposal.supplierId === "TVR" && proposal.supplierOfferId === offer.id && !["REJECTED", "SUPERSEDED"].includes(proposal.status)).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];
  if (existing?.costSnapshot.sourceCostAmount === costSnapshot.sourceCostAmount && existing.costSnapshot.sourceTaxBasis === costSnapshot.sourceTaxBasis && existing.costSnapshot.pricingTimestamp === costSnapshot.pricingTimestamp) return existing;
  const result = calculateProposedPrice(costSnapshot, settings);
  return savePricingProposal({ ...result, productId: input.productId, supplierId: "TVR", supplierOfferId: offer.id, costSnapshot, settingsSnapshot: settings, status: settings.proposedPricesRequireApproval ? "PENDING_APPROVAL" : "DRAFT" });
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
  const fx = await resolveFxEvidence(selected.currency);
  if (selected.currency !== "ZAR" && !fx.rate) throw new Error("A current FX rate is required.");
  const costSnapshot = cjLandedCostPricingInput({ supplierOfferId: mapping.supplierOfferId ?? `CJ:${input.productId}:${mapping.supplierVariantId}`, currency: selected.currency, productCost, shippingCost: selected.shippingCost, fxRate: selected.currency === "ZAR" ? 1 : fx.rate, fxBufferPercent: settings.cjFxBufferPercent, pricingTimestamp: selected.selectedAt, fxCapturedAt: fx.capturedAt, fxProvider: fx.provider, fxSourceReference: fx.sourceReference });
  const result = calculateProposedPrice(costSnapshot, settings);
  return savePricingProposal({ ...result, productId: input.productId, supplierId: "CJ", supplierOfferId: costSnapshot.supplierOfferId, costSnapshot, settingsSnapshot: settings, status: settings.proposedPricesRequireApproval ? "PENDING_APPROVAL" : "DRAFT" });
}

export async function generateCjCataloguePricingProposal(input: { productId: string; supplierProductId: string; supplierVariantId: string; shippingCost: number; currency: string; quotedAt: string }) {
  if (!await getAdminProductById(input.productId)) throw new Error("TekCentral product not found.");
  const product = await getCjCatalogueProduct(input.supplierProductId);
  const variant = product?.variants.find((item) => item.supplierVariantId === input.supplierVariantId);
  if (!product || !variant) throw new Error("Exact CJ product variant not found.");
  const mapping = (await listSupplierProductMappings()).find((item) => item.supplierCode === "CJ" && item.productId === input.productId && item.supplierProductId === input.supplierProductId && item.supplierVariantId === input.supplierVariantId && item.status === "VERIFIED");
  if (!mapping) throw new Error("A verified exact CJ variant mapping is required.");
  const [settingsStore, supplierPolicy, cjEvidenceSettings] = await Promise.all([getBusinessSettings(), getSupplierPolicySettings(), getCjEvidenceSettings()]);
  const settings = settingsStore.pricing;
  const fx = await resolveFxEvidence(variant.costEvidence?.currency ?? input.currency);
  const evidence = deriveCjPricingEvidence({ product, variant, mapping, supplierCurrencyEvidence: cjEvidenceSettings.accountCurrency, fxRate: fx.rate, fxRateUpdatedAt: fx.capturedAt, fxStaleAfterHours: settings.fxStaleAfterHours, sourcePriceFreshnessHours: supplierPolicy.sourcePriceFreshnessHours });
  if (evidence.status !== "READY_FOR_PRICING") throw new Error(`CJ pricing evidence is incomplete: ${evidence.blockers.join(", ")}.`);
  const offer = cjVariantToSupplierOffer(product, variant, mapping);
  const authoritativeCost = variant.costEvidence && ["PROCUREMENT_COST", "STOCK_UP_PRICE", "WHOLESALE_PRICE", "VARIANT_SELL_PRICE"].includes(variant.costEvidence.classification) ? variant.costEvidence.amount : undefined;
  const currency = evidence.currency;
  if (authoritativeCost === undefined || authoritativeCost <= 0 || !currency) throw new Error("Authoritative CJ variant cost and currency are required.");
  if (!Number.isFinite(input.shippingCost) || input.shippingCost < 0 || input.currency !== currency) throw new Error("CJ freight cost must use the same authoritative currency as the variant cost.");
  if (currency !== "ZAR" && !fx.rate) throw new Error("A current FX rate is required.");
  const costSnapshot = cjLandedCostPricingInput({ supplierOfferId: offer.id, currency, productCost: authoritativeCost, shippingCost: input.shippingCost, fxRate: currency === "ZAR" ? 1 : fx.rate, fxBufferPercent: settings.cjFxBufferPercent, pricingTimestamp: variant.costEvidence!.capturedAt, fxCapturedAt: fx.capturedAt, fxProvider: fx.provider, fxSourceReference: fx.sourceReference, includeShippingInCost: false });
  const result = calculateProposedPrice(costSnapshot, settings);
  const existing = (await listPricingProposals()).filter((proposal) => proposal.productId === input.productId && proposal.supplierId === "CJ" && proposal.supplierOfferId === offer.id && proposal.status !== "REJECTED" && proposal.status !== "SUPERSEDED").sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];
  if (existing && existing.costSnapshot.landedCostExVat === costSnapshot.landedCostExVat && existing.costSnapshot.shippingCost === costSnapshot.shippingCost && existing.costSnapshot.fxRateUsed === costSnapshot.fxRateUsed && existing.proposedSellingPriceInclVat === result.proposedSellingPriceInclVat && JSON.stringify(existing.warnings) === JSON.stringify(result.warnings)) return existing;
  return savePricingProposal({ ...result, productId: input.productId, supplierId: "CJ", supplierOfferId: offer.id, costSnapshot, settingsSnapshot: settings, status: "PENDING_APPROVAL" });
}

export async function reconcileCjCataloguePricingForFx(sourceCurrency: string) {
  const [products, mappings] = await Promise.all([import("./suppliers/cj/cjCatalogueRepository.js").then((module) => module.listCjCatalogueProducts()), listSupplierProductMappings()]);
  const results = { evaluated: 0, generated: 0, blocked: 0 };
  for (const mapping of mappings.filter((item) => item.supplierCode === "CJ" && item.status === "VERIFIED")) {
    const product = products.find((item) => item.supplierProductId === mapping.supplierProductId);
    const variant = product?.variants.find((item) => item.supplierVariantId === mapping.supplierVariantId);
    if (!product || !variant || variant.costEvidence?.currency !== sourceCurrency) continue;
    results.evaluated += 1;
    try { await generateCjCataloguePricingProposal({ productId: mapping.productId, supplierProductId: product.supplierProductId, supplierVariantId: variant.supplierVariantId, shippingCost: 0, currency: sourceCurrency, quotedAt: variant.costEvidence.capturedAt }); results.generated += 1; }
    catch { results.blocked += 1; }
  }
  return results;
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

import type { PricingProposal } from "../../pricingProposalRepository.js";
import type { SupplierProductMapping } from "../../types.js";
import type { ScoopCatalogueProduct, ScoopLaunchAssortmentState } from "./scoopTypes.js";

export type ScoopLaunchReadinessStatus = "NOT_READY" | "READY_FOR_PUBLISH_REVIEW";
export type ScoopLaunchBlocker =
  | "NOT_SELECTED"
  | "OFFER_UNAVAILABLE"
  | "AUTHORITATIVE_COMMERCIAL_DATA_MISSING"
  | "MAPPING_NOT_VERIFIED"
  | "LOGISTICS_INCOMPLETE"
  | "PRICING_MISSING"
  | "PRICING_NOT_APPROVED"
  | "PRICING_BLOCKING_WARNING";

export interface ScoopLaunchReadiness {
  status: ScoopLaunchReadinessStatus;
  blockers: ScoopLaunchBlocker[];
  nextAction: "Select for launch" | "Wait for XML commercial data" | "Wait for current stock" | "Verify mapping" | "Add shipping data" | "Generate price" | "Approve price" | "Review pricing warnings" | "Ready for publish review";
}

const taxonomyTerms = [
  "access point", "adapter", "cable", "camera", "charger", "computer", "cctv", "desktop", "dock", "ethernet", "fibre", "firewall", "headset", "inverter", "keyboard", "laptop", "mesh", "monitor", "mouse", "network", "nvr", "patch panel", "poe", "printer", "projector", "rack", "router", "scanner", "security", "sensor", "storage", "surge", "switch", "ups", "usb", "webcam", "wifi", "wireless",
];

const blockingWarnings = new Set([
  "SELLING_BELOW_COST",
  "BELOW_MINIMUM_PROFIT",
  "STALE_SUPPLIER_COST",
  "MISSING_FX_RATE",
  "STALE_FX_RATE",
  "NO_VALID_PRICING_BAND",
]);

export function scoopAssortmentState(product: ScoopCatalogueProduct): ScoopLaunchAssortmentState {
  return product.launchAssortment?.state ?? "NOT_SELECTED";
}

export function scoopCandidateReasons(product: ScoopCatalogueProduct) {
  const text = `${product.description} ${product.manufacturer ?? ""}`.toLowerCase();
  const reasons: string[] = [];
  if (product.availability !== "AVAILABLE" || product.staleAt) return reasons;
  if (!product.manufacturer?.trim() || !product.imageUrl?.trim()) return reasons;
  if (!product.dealerPriceExVat || !product.retailPriceInclVat) return reasons;
  if (!taxonomyTerms.some((term) => text.includes(term))) return reasons;
  reasons.push("In stock", "TekCentral taxonomy match", "Manufacturer identified", "Product image available", "Dealer and retail pricing available", "Current feed record");
  return reasons;
}

export function suggestScoopLaunchCandidates(products: ScoopCatalogueProduct[], limit = 50) {
  return products
    .filter((product) => scoopAssortmentState(product) === "NOT_SELECTED")
    .map((product) => ({ product, reasons: scoopCandidateReasons(product) }))
    .filter((candidate) => candidate.reasons.length > 0)
    .sort((a, b) => (b.product.totalStock ?? 0) - (a.product.totalStock ?? 0) || a.product.supplierSku.localeCompare(b.product.supplierSku))
    .slice(0, Math.min(Math.max(limit, 1), 50));
}

export function latestScoopProposal(proposals: PricingProposal[], supplierSku: string, productId?: string) {
  return proposals
    .filter((proposal) => proposal.supplierId === "SCOOP" && proposal.supplierOfferId === `SCOOP:${supplierSku}` && (!productId || proposal.productId === productId))
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    .find((proposal) => proposal.status !== "SUPERSEDED");
}

export function deriveScoopLaunchReadiness(input: {
  product: ScoopCatalogueProduct;
  mapping?: SupplierProductMapping;
  proposal?: PricingProposal;
}): ScoopLaunchReadiness {
  const blockers: ScoopLaunchBlocker[] = [];
  if (scoopAssortmentState(input.product) !== "SELECTED_FOR_LAUNCH") blockers.push("NOT_SELECTED");
  if (!input.product.sourceObservations.some((source) => source.sourceType === "XML_FEED" && source.active) || input.product.dealerPriceExVat === undefined || input.product.totalStock === undefined) blockers.push("AUTHORITATIVE_COMMERCIAL_DATA_MISSING");
  if (input.product.availability !== "AVAILABLE" || Boolean(input.product.staleAt)) blockers.push("OFFER_UNAVAILABLE");
  if (input.mapping?.status !== "VERIFIED") blockers.push("MAPPING_NOT_VERIFIED");
  if (input.product.logisticsMetadata?.status !== "COMPLETE") blockers.push("LOGISTICS_INCOMPLETE");
  if (!input.proposal) blockers.push("PRICING_MISSING");
  else if (input.proposal.status !== "APPROVED") blockers.push("PRICING_NOT_APPROVED");
  const hasBlockingWarning = input.proposal?.warningDetails
    ? input.proposal.warningDetails.some((warning) => warning.severity === "BLOCKING")
    : input.proposal?.warnings.some((warning) => blockingWarnings.has(warning));
  if (hasBlockingWarning) blockers.push("PRICING_BLOCKING_WARNING");

  const nextAction: ScoopLaunchReadiness["nextAction"] = blockers.includes("NOT_SELECTED") ? "Select for launch"
    : blockers.includes("AUTHORITATIVE_COMMERCIAL_DATA_MISSING") ? "Wait for XML commercial data"
    : blockers.includes("OFFER_UNAVAILABLE") ? "Wait for current stock"
      : blockers.includes("MAPPING_NOT_VERIFIED") ? "Verify mapping"
        : blockers.includes("LOGISTICS_INCOMPLETE") ? "Add shipping data"
          : blockers.includes("PRICING_MISSING") ? "Generate price"
            : blockers.includes("PRICING_NOT_APPROVED") ? "Approve price"
              : blockers.includes("PRICING_BLOCKING_WARNING") ? "Review pricing warnings"
                : "Ready for publish review";
  return { status: blockers.length ? "NOT_READY" : "READY_FOR_PUBLISH_REVIEW", blockers, nextAction };
}

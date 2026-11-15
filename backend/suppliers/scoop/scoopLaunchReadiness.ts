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
  | "PRICING_STALE"
  | "PRICING_BLOCKING_WARNING";

export interface ScoopLaunchReadiness {
  status: ScoopLaunchReadinessStatus;
  blockers: ScoopLaunchBlocker[];
  nextAction: "Select for launch" | "Wait for XML commercial data" | "Wait for current stock" | "Verify mapping" | "Add shipping data" | "Generate price" | "Approve price" | "Review pricing warnings" | "Ready for publish review";
}

export interface ScoopPublicationLifecycle {
  state: "NOT_PUBLISHED" | "READY_FOR_PUBLISH_REVIEW" | "PUBLISHED" | "UNPUBLISHED";
  versionCount: number;
  hasUnpublishedChanges?: boolean;
}

export type ScoopProductWorkflowStage = "UNMAPPED" | "MAPPING_REVIEW" | "LOGISTICS_REQUIRED" | "PRICING_REQUIRED" | "READY_FOR_LAUNCH_SELECTION" | "SELECTED_NOT_READY" | "READY_FOR_PUBLISH_REVIEW" | "PUBLISHED_CLEAN" | "PUBLISHED_CHANGES_PENDING" | "UNPUBLISHED_WITH_HISTORY";
export type ScoopProductWorkflowAction = "Match or create product" | "Verify mapping" | "Resolve logistics" | "Confirm hardware revision" | "Review pricing" | "Select for launch" | "Review & Publish" | "View storefront" | "Review changes" | "Review & Republish" | "Review blockers";
export interface ScoopProductWorkflow {
  stage: ScoopProductWorkflowStage; primaryAction: ScoopProductWorkflowAction; completedLaunchChecks: number; totalLaunchChecks: 5;
  completionState: "READY_FOR_PUBLISH_REVIEW" | "PUBLISHED" | "BLOCKED_LOGISTICS" | "BLOCKED_URL_IDENTITY" | "BLOCKED_PRICING" | "BLOCKED_MAPPING" | "DELIBERATELY_EXCLUDED" | "NEEDS_STAFF_REVIEW";
  exactBlockers: string[];
  steps: { id: "MAPPING" | "LOGISTICS" | "PRICING" | "LAUNCH_SELECTION" | "PUBLICATION"; label: string; status: string; complete: boolean }[];
}

export function deriveScoopProductWorkflow(input: { product: ScoopCatalogueProduct; mapping?: SupplierProductMapping; proposal?: PricingProposal; publication: ScoopPublicationLifecycle; publicationEligibility?: { canPublish: boolean; blockers: string[] } }): ScoopProductWorkflow {
  const hasProduct = Boolean(input.mapping?.productId); const mappingVerified = input.mapping?.status === "VERIFIED"; const logisticsComplete = input.product.logisticsMetadata?.status === "COMPLETE"; const pricingApproved = input.proposal?.status === "APPROVED"; const selected = scoopAssortmentState(input.product) === "SELECTED_FOR_LAUNCH";
  const readiness = deriveScoopLaunchReadiness(input); const checks = [hasProduct, mappingVerified, logisticsComplete, pricingApproved, selected];
  let stage: ScoopProductWorkflowStage; let primaryAction: ScoopProductWorkflowAction;
  if (!hasProduct) { stage = "UNMAPPED"; primaryAction = "Match or create product"; }
  else if (!mappingVerified) { stage = "MAPPING_REVIEW"; primaryAction = "Verify mapping"; }
  else if (!logisticsComplete) { stage = "LOGISTICS_REQUIRED"; primaryAction = input.product.logisticsLastFailure === "HARDWARE_REVISION_REQUIRED" ? "Confirm hardware revision" : "Resolve logistics"; }
  else if (!pricingApproved) { stage = "PRICING_REQUIRED"; primaryAction = "Review pricing"; }
  else if (!selected) { stage = "READY_FOR_LAUNCH_SELECTION"; primaryAction = "Select for launch"; }
  else if (input.publication.state === "PUBLISHED" && input.publication.hasUnpublishedChanges) { stage = "PUBLISHED_CHANGES_PENDING"; primaryAction = "Review changes"; }
  else if (input.publication.state === "PUBLISHED") { stage = "PUBLISHED_CLEAN"; primaryAction = "View storefront"; }
  else if (input.publication.state === "UNPUBLISHED" && input.publication.versionCount > 0) { stage = "UNPUBLISHED_WITH_HISTORY"; primaryAction = readiness.status === "READY_FOR_PUBLISH_REVIEW" ? "Review & Republish" : "Review blockers"; }
  else if (readiness.status === "READY_FOR_PUBLISH_REVIEW") { stage = "READY_FOR_PUBLISH_REVIEW"; primaryAction = "Review & Publish"; }
  else { stage = "SELECTED_NOT_READY"; primaryAction = "Review blockers"; }
  const publicationBlockers = input.publicationEligibility?.blockers.map((blocker) => blocker === "TekCentral-controlled primary image is missing." ? "PUBLIC_IMAGE_MISSING" : "PUBLIC_CONTENT_INCOMPLETE") ?? [];
  const exactBlockers = [...readiness.blockers, ...(readiness.status === "READY_FOR_PUBLISH_REVIEW" ? publicationBlockers : [])];
  const completionState: ScoopProductWorkflow["completionState"] = input.publication.state === "PUBLISHED" ? "PUBLISHED"
    : !selected ? "DELIBERATELY_EXCLUDED"
      : exactBlockers.includes("MAPPING_NOT_VERIFIED") ? "BLOCKED_MAPPING"
        : exactBlockers.includes("LOGISTICS_INCOMPLETE") ? "BLOCKED_LOGISTICS"
          : exactBlockers.some((item) => item.startsWith("PRICING_")) ? "BLOCKED_PRICING"
            : exactBlockers.length ? "NEEDS_STAFF_REVIEW"
              : "READY_FOR_PUBLISH_REVIEW";
  if (readiness.status === "READY_FOR_PUBLISH_REVIEW" && publicationBlockers.length) { stage = "SELECTED_NOT_READY"; primaryAction = "Review blockers"; }
  return { stage, primaryAction, completionState, exactBlockers, completedLaunchChecks: checks.filter(Boolean).length, totalLaunchChecks: 5, steps: [
    { id: "MAPPING", label: "Mapping", status: mappingVerified ? "Verified" : hasProduct ? "Needs verification" : "Not matched", complete: mappingVerified },
    { id: "LOGISTICS", label: "Logistics", status: logisticsComplete ? "Complete" : "Required", complete: logisticsComplete },
    { id: "PRICING", label: "Pricing", status: pricingApproved ? "Approved" : input.proposal ? "Needs review" : "Required", complete: pricingApproved },
    { id: "LAUNCH_SELECTION", label: "Launch selection", status: selected ? "Selected" : "Not selected", complete: selected },
    { id: "PUBLICATION", label: "Publication", status: input.publication.state === "PUBLISHED" ? "Published" : readiness.status === "READY_FOR_PUBLISH_REVIEW" ? "Ready for review" : "Not published", complete: input.publication.state === "PUBLISHED" },
  ] };
}

export function isInScoopLaunchReadinessCohort(input: { product: ScoopCatalogueProduct; mapping?: SupplierProductMapping; publication: ScoopPublicationLifecycle }) {
  if (scoopAssortmentState(input.product) === "SELECTED_FOR_LAUNCH") return true;
  if (input.mapping?.status !== "VERIFIED" || !input.mapping.productId) return false;
  return input.publication.state === "PUBLISHED"
    || (input.publication.state === "UNPUBLISHED" && input.publication.versionCount > 0);
}

export function deriveScoopPublicationAction(input: { readiness: ScoopLaunchReadiness; publication: ScoopPublicationLifecycle }) {
  if (input.publication.state === "PUBLISHED") return input.publication.hasUnpublishedChanges
    ? { primary: "Review changes" as const, secondary: "View storefront" as const }
    : { primary: "View storefront" as const, secondary: "Manage publication" as const };
  if (input.publication.state === "UNPUBLISHED" && input.publication.versionCount > 0) return { primary: "Review & Republish" as const, secondary: "Preview last published version" as const };
  if (input.readiness.status === "READY_FOR_PUBLISH_REVIEW") return { primary: "Review & Publish" as const };
  return { primary: input.readiness.nextAction };
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

export function isSelectedScoopLogisticsException(input: { product: ScoopCatalogueProduct; mapping?: SupplierProductMapping }) {
  return scoopAssortmentState(input.product) === "SELECTED_FOR_LAUNCH"
    && input.mapping?.status === "VERIFIED"
    && input.product.logisticsMetadata?.status !== "COMPLETE";
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
  else if (input.product.dealerPriceExVat !== undefined && input.proposal.costSnapshot?.supplierCostExVat !== undefined && input.proposal.costSnapshot.supplierCostExVat !== input.product.dealerPriceExVat) blockers.push("PRICING_STALE");
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
              : blockers.includes("PRICING_STALE") ? "Review pricing warnings"
              : blockers.includes("PRICING_BLOCKING_WARNING") ? "Review pricing warnings"
                : "Ready for publish review";
  return { status: blockers.length ? "NOT_READY" : "READY_FOR_PUBLISH_REVIEW", blockers, nextAction };
}

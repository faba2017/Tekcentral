export const PRODUCT_ONBOARDING_STEPS = [
  "SOURCE_EVIDENCE", "PRODUCT_MAPPING", "PRODUCT_IDENTITY", "TAXONOMY", "CONTENT", "MEDIA",
  "LOGISTICS", "COMMERCIAL", "PRICING", "LAUNCH", "PREVIEW", "PUBLICATION",
] as const;

export type ProductOnboardingStepId = typeof PRODUCT_ONBOARDING_STEPS[number];
export type ProductOnboardingStepState = "INCOMPLETE" | "BLOCKED" | "NEEDS_REVIEW" | "COMPLETE" | "NOT_APPLICABLE";
export type ProductOnboardingSeverity = "BLOCKER" | "WARNING" | "REVIEW";

export interface NormalizedSupplierEvidence {
  supplierCode: string;
  supplierSku?: string;
  sourceProductId?: string;
  sourceVariantId?: string;
  sourceKind: "API" | "FEED" | "MANUAL";
  title?: string;
  description?: string;
  sourceUrl?: string;
  sourceCategory?: string;
  sourceStatus: "CURRENT" | "STALE" | "UNAVAILABLE" | "UNKNOWN";
  stock?: { status: "AVAILABLE" | "OUT_OF_STOCK" | "UNKNOWN"; quantity?: number; observedAt?: string; freshness?: "FRESH" | "STALE" | "UNKNOWN" };
  logistics?: { status: "COMPLETE" | "PARTIAL" | "MISSING" | "NOT_APPLICABLE"; source?: string; observedAt?: string };
  commercial?: { status: "CURRENT" | "STALE" | "MISSING" | "NOT_APPLICABLE"; cost?: number; currency?: string; observedAt?: string; taxBasis?: "EXCLUSIVE" | "INCLUSIVE" | "UNKNOWN"; priceMeaning?: string };
  mediaCandidates?: string[];
  provenance?: Record<string, string | number | boolean | undefined>;
  lastCheckedAt?: string;
  confidence?: "LOW" | "MEDIUM" | "HIGH";
}

export interface ProductOnboardingBlocker {
  code: string;
  step: ProductOnboardingStepId;
  severity: ProductOnboardingSeverity;
  explanation: string;
  whyItMatters: string;
  recommendedResolution: string;
  actionId: string;
  target?: string;
}

export interface ProductOnboardingAction {
  id: string;
  label: string;
  step: ProductOnboardingStepId;
  target?: string;
}

export interface ProductOnboardingStepResult {
  id: ProductOnboardingStepId;
  label: string;
  state: ProductOnboardingStepState;
  blockers: ProductOnboardingBlocker[];
}

export interface ProductOnboardingContext {
  evidence: NormalizedSupplierEvidence;
  product?: { id: string; slug?: string; name?: string; sku?: string };
  mappingStatus: "VERIFIED" | "NEEDS_REVIEW" | "MISSING";
  identityStatus: "VERIFIED" | "NEEDS_REVIEW" | "MISSING";
  taxonomyStatus: "VERIFIED" | "NEEDS_REVIEW" | "MISSING";
  contentStatus: "COMPLETE" | "NEEDS_REVIEW" | "MISSING";
  hasControlledPublicImage: boolean;
  pricingStatus: "APPROVED" | "AWAITING_APPROVAL" | "STALE" | "BLOCKED" | "MISSING" | "NOT_APPLICABLE";
  launchStatus: "SELECTED" | "NOT_SELECTED" | "NOT_APPLICABLE";
  previewAvailable: boolean;
  publication: { state: "NOT_PUBLISHED" | "READY_FOR_PUBLISH_REVIEW" | "PUBLISHED" | "UNPUBLISHED"; hasUnpublishedChanges?: boolean; storefrontTarget?: string };
  legacyBlockers?: string[];
  notApplicableSteps?: ProductOnboardingStepId[];
}

export interface ProductOnboardingReadiness {
  source: NormalizedSupplierEvidence;
  product?: ProductOnboardingContext["product"];
  steps: ProductOnboardingStepResult[];
  completedStepCount: number;
  totalApplicableStepCount: number;
  blockers: ProductOnboardingBlocker[];
  warnings: ProductOnboardingBlocker[];
  firstUnresolvedStep?: ProductOnboardingStepId;
  nextAction: ProductOnboardingAction;
  publicationEligible: boolean;
  publicationState: ProductOnboardingContext["publication"]["state"];
  alreadyPublished: boolean;
}

const labels: Record<ProductOnboardingStepId, string> = {
  SOURCE_EVIDENCE: "Source evidence", PRODUCT_MAPPING: "Product mapping", PRODUCT_IDENTITY: "Canonical TekCentral Product",
  TAXONOMY: "Taxonomy", CONTENT: "Content", MEDIA: "Media", LOGISTICS: "Logistics",
  COMMERCIAL: "Commercial evidence", PRICING: "Pricing", LAUNCH: "Launch selection", PREVIEW: "Preview", PUBLICATION: "Publication",
};

const definitions: Record<string, Omit<ProductOnboardingBlocker, "code">> = {
  SOURCE_EVIDENCE_MISSING: { step: "SOURCE_EVIDENCE", severity: "BLOCKER", explanation: "Current source evidence is unavailable.", whyItMatters: "TekCentral cannot safely prepare a Product from absent source evidence.", recommendedResolution: "Refresh or verify the supplier evidence.", actionId: "REFRESH_SOURCE" },
  SOURCE_EVIDENCE_STALE: { step: "SOURCE_EVIDENCE", severity: "BLOCKER", explanation: "Supplier evidence is stale.", whyItMatters: "Stock and commercial decisions require current evidence.", recommendedResolution: "Refresh the supplier evidence before continuing.", actionId: "REFRESH_SOURCE" },
  PRODUCT_MAPPING_REQUIRED: { step: "PRODUCT_MAPPING", severity: "BLOCKER", explanation: "A verified Product mapping is required.", whyItMatters: "The source offer must resolve to one canonical TekCentral Product.", recommendedResolution: "Match or create the Product, then verify the mapping.", actionId: "REVIEW_MAPPING" },
  PRODUCT_IDENTITY_REQUIRED: { step: "PRODUCT_IDENTITY", severity: "BLOCKER", explanation: "Canonical Product identity is incomplete.", whyItMatters: "Publication requires a stable TekCentral Product identity.", recommendedResolution: "Complete and verify the Product identity.", actionId: "COMPLETE_PRODUCT_IDENTITY" },
  TAXONOMY_REQUIRED: { step: "TAXONOMY", severity: "BLOCKER", explanation: "Product taxonomy is not verified.", whyItMatters: "Verified taxonomy controls navigation and product discovery.", recommendedResolution: "Review and verify the canonical category path.", actionId: "COMPLETE_TAXONOMY" },
  CONTENT_REQUIRED: { step: "CONTENT", severity: "BLOCKER", explanation: "Public Product content is incomplete.", whyItMatters: "Customers need accurate, reviewed Product information.", recommendedResolution: "Complete and review the public Product content.", actionId: "ADD_PRODUCT_CONTENT" },
  PUBLIC_IMAGE_MISSING: { step: "MEDIA", severity: "BLOCKER", explanation: "A TekCentral-controlled public primary image is required.", whyItMatters: "Supplier URLs are not a durable public media source.", recommendedResolution: "Ingest or upload a valid public Product image.", actionId: "ADD_PUBLIC_IMAGE" },
  LOGISTICS_INCOMPLETE: { step: "LOGISTICS", severity: "BLOCKER", explanation: "Logistics evidence is incomplete.", whyItMatters: "Delivery and fulfilment viability cannot be evaluated safely.", recommendedResolution: "Complete the required logistics evidence.", actionId: "COMPLETE_LOGISTICS" },
  COMMERCIAL_EVIDENCE_MISSING: { step: "COMMERCIAL", severity: "BLOCKER", explanation: "Current commercial evidence is missing.", whyItMatters: "Pricing requires authoritative supplier cost and currency evidence.", recommendedResolution: "Refresh or enter current commercial evidence.", actionId: "REVIEW_COMMERCIAL" },
  COMMERCIAL_EVIDENCE_STALE: { step: "COMMERCIAL", severity: "BLOCKER", explanation: "Commercial evidence is stale.", whyItMatters: "An outdated cost can invalidate margin and pricing decisions.", recommendedResolution: "Refresh supplier cost evidence.", actionId: "REVIEW_COMMERCIAL" },
  PRICING_REQUIRED: { step: "PRICING", severity: "BLOCKER", explanation: "A current pricing proposal is required.", whyItMatters: "Only approved canonical selling prices may be published.", recommendedResolution: "Generate and review a pricing proposal.", actionId: "REVIEW_PRICING" },
  PRICING_APPROVAL_REQUIRED: { step: "PRICING", severity: "REVIEW", explanation: "Pricing is awaiting approval.", whyItMatters: "Proposed prices require explicit staff approval.", recommendedResolution: "Review and approve or reject the proposal.", actionId: "REVIEW_PRICING" },
  LAUNCH_SELECTION_REQUIRED: { step: "LAUNCH", severity: "BLOCKER", explanation: "The Product is not selected for launch.", whyItMatters: "Launch selection is an explicit staff decision.", recommendedResolution: "Review readiness and select the Product for launch.", actionId: "REVIEW_LAUNCH" },
  PREVIEW_REQUIRED: { step: "PREVIEW", severity: "BLOCKER", explanation: "The Product preview is not ready.", whyItMatters: "Staff must be able to review the customer-facing Product before publication.", recommendedResolution: "Resolve earlier blockers and review the Product preview.", actionId: "PREVIEW_PRODUCT" },
  PUBLICATION_REQUIRED: { step: "PUBLICATION", severity: "REVIEW", explanation: "The Product is ready for publication review.", whyItMatters: "Publication remains an explicit authorized staff action.", recommendedResolution: "Review and publish the Product.", actionId: "PUBLISH_PRODUCT" },
};

const legacyCodeMap: Record<string, string> = {
  MAPPING_NOT_VERIFIED: "PRODUCT_MAPPING_REQUIRED", TAXONOMY_NOT_VERIFIED: "TAXONOMY_REQUIRED",
  CONTENT_INCOMPLETE: "CONTENT_REQUIRED", CONTROLLED_IMAGE_REQUIRED: "PUBLIC_IMAGE_MISSING",
  "TekCentral-controlled primary image is missing.": "PUBLIC_IMAGE_MISSING", LOGISTICS_INCOMPLETE: "LOGISTICS_INCOMPLETE",
  AUTHORITATIVE_COMMERCIAL_DATA_MISSING: "COMMERCIAL_EVIDENCE_MISSING", COST_EVIDENCE_STALE: "COMMERCIAL_EVIDENCE_STALE",
  PRICING_MISSING: "PRICING_REQUIRED", PRICING_PROPOSAL_REQUIRED: "PRICING_REQUIRED", PRICING_NOT_APPROVED: "PRICING_APPROVAL_REQUIRED",
  PRICING_APPROVAL_REQUIRED: "PRICING_APPROVAL_REQUIRED", PRICING_STALE: "PRICING_REQUIRED", PRICING_REVIEW_REQUIRED: "PRICING_REQUIRED",
  NOT_SELECTED: "LAUNCH_SELECTION_REQUIRED",
  STOCK_EVIDENCE_STALE: "SOURCE_EVIDENCE_STALE",
};

// Purchase availability is not evidence availability. Normalized sourceStatus
// remains the authority for Step 1, including missing and stale evidence.
const availabilityOnlyLegacyCodes = new Set(["OFFER_UNAVAILABLE", "SOURCE_NOT_AVAILABLE"]);

function blocker(code: string, target?: string): ProductOnboardingBlocker {
  const canonical = legacyCodeMap[code] ?? code;
  const value = definitions[canonical] ?? { step: "SOURCE_EVIDENCE" as const, severity: "REVIEW" as const, explanation: code.replace(/_/g, " "), whyItMatters: "This evidence requires staff review.", recommendedResolution: "Review the source evidence and resolve the issue.", actionId: "REVIEW_SOURCE" };
  return { code: canonical, ...value, target };
}

const actionLabels: Record<string, string> = {
  REFRESH_SOURCE: "Refresh source evidence",
  REVIEW_MAPPING: "Match or create Product",
  COMPLETE_PRODUCT_IDENTITY: "Complete Product identity",
  COMPLETE_TAXONOMY: "Complete taxonomy",
  ADD_PRODUCT_CONTENT: "Complete content",
  ADD_PUBLIC_IMAGE: "Add public image",
  COMPLETE_LOGISTICS: "Complete logistics",
  REVIEW_COMMERCIAL: "Review commercial evidence",
  REVIEW_PRICING: "Review pricing",
  REVIEW_LAUNCH: "Select for launch",
  PREVIEW_PRODUCT: "Review preview",
  PUBLISH_PRODUCT: "Review & publish",
  REVIEW_SOURCE: "Review source evidence",
};

const statusBlocker = (status: "VERIFIED" | "NEEDS_REVIEW" | "MISSING", missing: string) => {
  if (status === "VERIFIED") return undefined;
  const value = blocker(missing);
  return status === "NEEDS_REVIEW" ? { ...value, severity: "REVIEW" as const } : value;
};

export function evaluateProductOnboarding(input: ProductOnboardingContext): ProductOnboardingReadiness {
  const stepBlockers: ProductOnboardingBlocker[] = [];
  if (input.evidence.sourceStatus === "STALE") stepBlockers.push(blocker("SOURCE_EVIDENCE_STALE"));
  else if (input.evidence.sourceStatus === "UNAVAILABLE" || input.evidence.sourceStatus === "UNKNOWN") stepBlockers.push(blocker("SOURCE_EVIDENCE_MISSING"));
  const mapping = statusBlocker(input.mappingStatus, "PRODUCT_MAPPING_REQUIRED"); if (mapping) stepBlockers.push(mapping);
  const identity = statusBlocker(input.identityStatus, "PRODUCT_IDENTITY_REQUIRED"); if (identity) stepBlockers.push(identity);
  const taxonomy = statusBlocker(input.taxonomyStatus, "TAXONOMY_REQUIRED"); if (taxonomy) stepBlockers.push(taxonomy);
  if (input.contentStatus !== "COMPLETE") {
    const value = blocker("CONTENT_REQUIRED");
    stepBlockers.push(input.contentStatus === "NEEDS_REVIEW" ? { ...value, severity: "REVIEW" } : value);
  }
  if (!input.hasControlledPublicImage) stepBlockers.push(blocker("PUBLIC_IMAGE_MISSING"));
  if (input.evidence.logistics?.status !== "COMPLETE" && input.evidence.logistics?.status !== "NOT_APPLICABLE") stepBlockers.push(blocker("LOGISTICS_INCOMPLETE"));
  if (input.evidence.commercial?.status === "STALE") stepBlockers.push(blocker("COMMERCIAL_EVIDENCE_STALE"));
  else if (!input.evidence.commercial || input.evidence.commercial.status === "MISSING") stepBlockers.push(blocker("COMMERCIAL_EVIDENCE_MISSING"));
  if (["MISSING", "STALE", "BLOCKED"].includes(input.pricingStatus)) stepBlockers.push(blocker("PRICING_REQUIRED"));
  else if (input.pricingStatus === "AWAITING_APPROVAL") stepBlockers.push(blocker("PRICING_APPROVAL_REQUIRED"));
  if (input.launchStatus === "NOT_SELECTED") stepBlockers.push(blocker("LAUNCH_SELECTION_REQUIRED"));
  for (const code of input.legacyBlockers ?? []) {
    if (availabilityOnlyLegacyCodes.has(code)) continue;
    if (!stepBlockers.some((item) => item.code === (legacyCodeMap[code] ?? code))) stepBlockers.push(blocker(code));
  }

  const notApplicable = new Set(input.notApplicableSteps ?? []);
  if (input.evidence.logistics?.status === "NOT_APPLICABLE") notApplicable.add("LOGISTICS");
  if (input.evidence.commercial?.status === "NOT_APPLICABLE") notApplicable.add("COMMERCIAL");
  if (input.pricingStatus === "NOT_APPLICABLE") notApplicable.add("PRICING");
  if (input.launchStatus === "NOT_APPLICABLE") notApplicable.add("LAUNCH");

  const upstreamBlocking = stepBlockers.some((item) => item.severity === "BLOCKER");
  if (!input.previewAvailable && !upstreamBlocking) stepBlockers.push(blocker("PREVIEW_REQUIRED"));
  const published = input.publication.state === "PUBLISHED";
  const prePublicationBlocking = stepBlockers.some((item) => item.severity !== "WARNING");
  if (!published && !prePublicationBlocking && input.previewAvailable) stepBlockers.push(blocker("PUBLICATION_REQUIRED"));

  const steps = PRODUCT_ONBOARDING_STEPS.map<ProductOnboardingStepResult>((id) => {
    if (notApplicable.has(id)) return { id, label: labels[id], state: "NOT_APPLICABLE", blockers: [] };
    const related = stepBlockers.filter((item) => item.step === id);
    const incomplete = id === "PRODUCT_MAPPING" && input.mappingStatus === "MISSING"
      || id === "PRODUCT_IDENTITY" && input.identityStatus === "MISSING"
      || id === "TAXONOMY" && input.taxonomyStatus === "MISSING"
      || id === "CONTENT" && input.contentStatus === "MISSING";
    if (incomplete) return { id, label: labels[id], state: "INCOMPLETE", blockers: related };
    if (id === "PREVIEW" && !input.previewAvailable && upstreamBlocking) return { id, label: labels[id], state: "BLOCKED", blockers: [] };
    if (id === "PUBLICATION") {
      if (published) return { id, label: labels[id], state: "COMPLETE", blockers: [] };
      if (prePublicationBlocking) return { id, label: labels[id], state: "BLOCKED", blockers: [] };
    }
    const state: ProductOnboardingStepState = related.some((item) => item.severity === "BLOCKER") ? "BLOCKED"
      : related.length ? "NEEDS_REVIEW" : "COMPLETE";
    return { id, label: labels[id], state, blockers: related };
  });
  const unresolved = steps.find((step) => !["COMPLETE", "NOT_APPLICABLE"].includes(step.state));
  const unresolvedBlocker = unresolved && stepBlockers.find((item) => item.step === unresolved.id);
  let nextAction: ProductOnboardingAction;
  if (published) nextAction = input.publication.hasUnpublishedChanges
    ? { id: "CREATE_NEW_VERSION", label: "Create new version", step: "PUBLICATION", target: input.product ? `/admin/products/${encodeURIComponent(input.product.id)}/publishing` : undefined }
    : { id: "VIEW_STOREFRONT", label: "View storefront", step: "PUBLICATION", target: input.publication.storefrontTarget };
  else if (unresolvedBlocker) nextAction = { id: unresolvedBlocker.actionId, label: actionLabels[unresolvedBlocker.actionId] ?? "Continue setup", step: unresolvedBlocker.step, target: unresolvedBlocker.target };
  else nextAction = { id: "CONTINUE_SETUP", label: "Continue setup", step: unresolved?.id ?? "SOURCE_EVIDENCE" };
  const applicable = steps.filter((step) => step.state !== "NOT_APPLICABLE");
  return {
    source: input.evidence, product: input.product, steps,
    completedStepCount: applicable.filter((step) => step.state === "COMPLETE").length,
    totalApplicableStepCount: applicable.length,
    blockers: stepBlockers.filter((item) => item.severity === "BLOCKER"),
    warnings: stepBlockers.filter((item) => item.severity !== "BLOCKER"),
    firstUnresolvedStep: unresolved?.id, nextAction,
    publicationEligible: !published && !stepBlockers.some((item) => item.step !== "PUBLICATION") && input.previewAvailable,
    publicationState: input.publication.state, alreadyPublished: published,
  };
}

export type SupplierEvidenceAdapterInput = Omit<NormalizedSupplierEvidence, "sourceKind"> & { sourceKind?: NormalizedSupplierEvidence["sourceKind"] };
const normalizeEvidence = (sourceKind: NormalizedSupplierEvidence["sourceKind"], input: SupplierEvidenceAdapterInput): NormalizedSupplierEvidence => ({ ...input, sourceKind: input.sourceKind ?? sourceKind });
export const normalizeScoopOnboardingEvidence = (input: SupplierEvidenceAdapterInput) => normalizeEvidence("FEED", { ...input, supplierCode: "SCOOP" });
export const normalizeSyntechOnboardingEvidence = (input: SupplierEvidenceAdapterInput) => normalizeEvidence("FEED", { ...input, supplierCode: "SYNTECH" });
export const normalizeMustekOnboardingEvidence = (input: SupplierEvidenceAdapterInput) => normalizeEvidence("FEED", { ...input, supplierCode: "MUSTEK" });
export const normalizeTvrOnboardingEvidence = (input: SupplierEvidenceAdapterInput) => normalizeEvidence("FEED", { ...input, supplierCode: "TVR" });
export const normalizeCjOnboardingEvidence = (input: SupplierEvidenceAdapterInput) => normalizeEvidence("API", { ...input, supplierCode: "CJ" });
export const normalizeManualOnboardingEvidence = (input: SupplierEvidenceAdapterInput) => normalizeEvidence("MANUAL", { ...input, supplierCode: "TEKCENTRAL" });

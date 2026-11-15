export const productOnboardingSteps = [
  "SOURCE_EVIDENCE", "PRODUCT_MAPPING", "PRODUCT_IDENTITY", "TAXONOMY", "CONTENT", "MEDIA",
  "LOGISTICS", "COMMERCIAL", "PRICING", "LAUNCH", "PREVIEW", "PUBLICATION",
] as const;

export type ProductOnboardingStepId = typeof productOnboardingSteps[number];
export type ProductOnboardingStepState = "INCOMPLETE" | "BLOCKED" | "NEEDS_REVIEW" | "COMPLETE" | "NOT_APPLICABLE";

export interface ProductOnboardingBlocker {
  code: string;
  step: ProductOnboardingStepId;
  severity: "BLOCKER" | "WARNING" | "REVIEW";
  explanation: string;
  whyItMatters: string;
  recommendedResolution: string;
  actionId: string;
  target?: string;
}

export interface ProductOnboardingReadiness {
  source: {
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
    stock?: { status: string; quantity?: number; observedAt?: string; freshness?: string };
    logistics?: { status: string; source?: string; observedAt?: string };
    commercial?: { status: string; cost?: number; currency?: string; observedAt?: string; taxBasis?: "EXCLUSIVE" | "INCLUSIVE" | "UNKNOWN"; priceMeaning?: string };
    mediaCandidates?: string[];
    provenance?: Record<string, string | number | boolean | undefined>;
    lastCheckedAt?: string;
  };
  product?: { id: string; slug?: string; name?: string; sku?: string };
  steps: Array<{ id: ProductOnboardingStepId; label: string; state: ProductOnboardingStepState; blockers: ProductOnboardingBlocker[] }>;
  completedStepCount: number;
  totalApplicableStepCount: number;
  blockers: ProductOnboardingBlocker[];
  warnings: ProductOnboardingBlocker[];
  firstUnresolvedStep?: ProductOnboardingStepId;
  nextAction: { id: string; label: string; step: ProductOnboardingStepId; target?: string };
  publicationEligible: boolean;
  publicationState: "NOT_PUBLISHED" | "READY_FOR_PUBLISH_REVIEW" | "PUBLISHED" | "UNPUBLISHED";
  alreadyPublished: boolean;
}

export function isProductOnboardingStep(value: string | null): value is ProductOnboardingStepId {
  return Boolean(value && productOnboardingSteps.includes(value as ProductOnboardingStepId));
}

export function resolveProductOnboardingFocus(readiness: ProductOnboardingReadiness, requested?: string | null) {
  return isProductOnboardingStep(requested ?? null) ? requested as ProductOnboardingStepId : readiness.firstUnresolvedStep ?? "PUBLICATION";
}

export function productConfigurationHref(pathname: string, search: string, productId: string, step?: ProductOnboardingStepId) {
  const params = new URLSearchParams(search);
  params.set("productSetup", productId);
  if (step) params.set("step", step); else params.delete("step");
  return `${pathname}?${params.toString()}`;
}

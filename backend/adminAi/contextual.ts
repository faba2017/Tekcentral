import { assertAdminAiAccess, getAdminAiAccess } from "../aiAccessControl.js";
import { getInternalProduct } from "../internalProductRepository.js";
import { getPricingProposal } from "../pricingProposalRepository.js";
import { getProductOnboardingReadiness } from "../productOnboardingService.js";
import { requirePermission, type StaffAuthorizationContext } from "../staffAuthorization.js";
import type { StaffPermission } from "../staffRbac.js";
import { getSupplierOperations } from "../supplierHubService.js";
import type { AdminAiService } from "./service.js";
import type { AdminAiGenerateResponse, AdminAiModelRole } from "./types.js";

export const ADMIN_AI_CONTEXT_TYPES = ["PRODUCT", "SUPPLIER", "PRICING_PROPOSAL"] as const;
export type AdminAiContextType = (typeof ADMIN_AI_CONTEXT_TYPES)[number];
export const ADMIN_AI_CONTEXT_INTENTS = ["SUMMARY", "BLOCKERS", "EXPLAIN", "NEXT_STEPS", "RISK_REVIEW"] as const;
export type AdminAiContextIntent = (typeof ADMIN_AI_CONTEXT_INTENTS)[number];

export interface AdminAiContextRequest {
  contextType: AdminAiContextType;
  resourceId: string;
  intent: AdminAiContextIntent;
}

export interface AdminAiSafeContext {
  contextType: AdminAiContextType;
  resourceId: string;
  title: string;
  provenance: string[];
  facts: Record<string, unknown>;
}

export class AdminAiContextError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

type ContextDependencies = {
  getProductReadiness: typeof getProductOnboardingReadiness;
  getProduct: typeof getInternalProduct;
  getSupplier: typeof getSupplierOperations;
  getProposal: typeof getPricingProposal;
};

const dependencies: ContextDependencies = {
  getProductReadiness: getProductOnboardingReadiness,
  getProduct: getInternalProduct,
  getSupplier: getSupplierOperations,
  getProposal: getPricingProposal,
};

type ContextDefinition = {
  permission: StaffPermission;
  intents: readonly AdminAiContextIntent[];
  build(resourceId: string, context: StaffAuthorizationContext, deps: ContextDependencies): Promise<AdminAiSafeContext>;
};

const limited = <T>(values: readonly T[] | undefined, maximum: number) => (values ?? []).slice(0, maximum);
const present = <T>(value: T | undefined): T | "Unavailable" => value === undefined ? "Unavailable" : value;
const money = (value: number | undefined, currency: string) => {
  if (value === undefined) return "Unavailable";
  try { return new Intl.NumberFormat("en-ZA", { style: "currency", currency }).format(value); }
  catch { return `${currency} ${value.toFixed(2)}`; }
};
const metricKeys = ["total", "safe", "reviewRequired", "conflicts", "missingCommercialData", "available", "outOfStock", "unknown", "active", "inactive", "mapped", "unitsOnHand", "staleStock", "staleCost", "new", "clearance", "remanufactured"] as const;
function allowlistedMetrics(input: unknown) {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  return Object.fromEntries(metricKeys.flatMap((key) => typeof value[key] === "number" ? [[key, value[key]]] : []));
}

async function buildProductContext(resourceId: string, _context: StaffAuthorizationContext, deps: ContextDependencies): Promise<AdminAiSafeContext> {
  let readiness: Awaited<ReturnType<typeof getProductOnboardingReadiness>>;
  try { readiness = await deps.getProductReadiness(resourceId); }
  catch { throw notFound(); }
  const product = await deps.getProduct(resourceId);
  if (!product) throw notFound();
  return {
    contextType: "PRODUCT",
    resourceId,
    title: product.name,
    provenance: ["Canonical Product", "Product Configuration readiness", "Current supplier mapping evidence"],
    facts: {
      product: { id: product.id, sku: product.sku, name: product.name, brand: product.brand, status: product.publicationStatus },
      taxonomy: { category: product.category, subcategory: present(product.subcategory), taxonomyStatus: present(product.taxonomyStatus) },
      readiness: {
        completedSteps: readiness.completedStepCount,
        applicableSteps: readiness.totalApplicableStepCount,
        publicationState: readiness.publicationState,
        publicationEligible: readiness.publicationEligible,
        firstUnresolvedStep: present(readiness.firstUnresolvedStep),
        nextAction: { label: readiness.nextAction.label, step: readiness.nextAction.step },
        steps: limited(readiness.steps, 12).map((step) => ({ id: step.id, label: step.label, state: step.state, blockerCodes: limited(step.blockers, 4).map((item) => item.code) })),
        blockers: limited(readiness.blockers, 8).map((item) => ({ code: item.code, step: item.step, explanation: item.explanation, whyItMatters: item.whyItMatters, recommendedResolution: item.recommendedResolution })),
        reviews: limited(readiness.warnings, 8).map((item) => ({ code: item.code, step: item.step, explanation: item.explanation, recommendedResolution: item.recommendedResolution })),
      },
      supplierEvidence: {
        supplier: readiness.source.supplierCode,
        sourceKind: readiness.source.sourceKind,
        sourceStatus: readiness.source.sourceStatus,
        stockStatus: present(readiness.source.stock?.status),
        stockFreshness: present(readiness.source.stock?.freshness),
        logisticsStatus: present(readiness.source.logistics?.status),
        commercialStatus: present(readiness.source.commercial?.status),
        lastCheckedAt: present(readiness.source.lastCheckedAt),
      },
    },
  };
}

async function buildSupplierContext(resourceId: string, _context: StaffAuthorizationContext, deps: ContextDependencies): Promise<AdminAiSafeContext> {
  const supplier = await deps.getSupplier(resourceId.trim().toUpperCase());
  if (!supplier) throw notFound();
  const supplierSpecific = "tvrOffers" in supplier ? { offerMetrics: allowlistedMetrics(supplier.tvrOffers) }
    : "mustekOffers" in supplier ? { offerMetrics: allowlistedMetrics(supplier.mustekOffers) }
      : "manualOffers" in supplier ? { offerMetrics: allowlistedMetrics(supplier.manualOffers) } : undefined;
  return {
    contextType: "SUPPLIER",
    resourceId: supplier.supplier.id,
    title: supplier.supplier.displayName,
    provenance: ["Supplier registry", "Supplier operations read model", "Consolidated source health"],
    facts: {
      supplier: { id: supplier.supplier.id, name: supplier.supplier.displayName, enabled: supplier.supplier.enabled },
      state: { configuration: supplier.configurationStatus, connection: supplier.connectionStatus, health: supplier.healthStatus },
      sources: supplier.supplier.sourceSummary ? {
        configured: supplier.supplier.sourceSummary.configured,
        active: supplier.supplier.sourceSummary.active,
        disabled: supplier.supplier.sourceSummary.disabled,
      } : "Unavailable",
      catalogue: supplier.catalogue,
      mappings: supplier.mappings,
      supplierOrders: supplier.orders,
      recentRuns: (supplier.syncHistory as Array<{ type: string; status: string; completedAt?: string; recordsProcessed?: number; errors?: number }>).slice(0, 5).map((run) => ({ type: run.type, status: run.status, completedAt: present(run.completedAt), recordsProcessed: present(run.recordsProcessed), errors: present(run.errors) })),
      operationalMetrics: supplierSpecific,
      currentOperationalWarning: present(supplier.lastError),
    },
  };
}

async function buildPricingContext(resourceId: string, context: StaffAuthorizationContext, deps: ContextDependencies): Promise<AdminAiSafeContext> {
  const proposal = await deps.getProposal(resourceId);
  if (!proposal) throw notFound();
  const product = await deps.getProduct(proposal.productId);
  const normalizedCurrency = proposal.costSnapshot.currency || "ZAR";
  const normalizedCost = proposal.costSnapshot.landedCostExVat ?? proposal.costSnapshot.supplierCostExVat;
  const sourceCurrency = proposal.costSnapshot.sourceCurrency ?? normalizedCurrency;
  const mayViewCommercialEvidence = context.permissions.has("pricing.view_supplier_cost") || context.permissions.has("suppliers.view_cost");
  return {
    contextType: "PRICING_PROPOSAL",
    resourceId,
    title: product?.name ?? proposal.productId,
    provenance: ["Canonical pricing proposal", "Canonical pricing calculation", "Canonical Product identity"],
    facts: {
      proposal: { id: proposal.id, status: proposal.status, kind: proposal.proposalKind ?? "AUTOMATED", generatedAt: proposal.generatedAt, updatedAt: proposal.updatedAt },
      product: { id: proposal.productId, sku: product?.sku ?? "Unavailable", name: product?.name ?? "Unavailable" },
      commercialEvidence: {
        supplier: proposal.supplierId,
        normalizedCostExVat: mayViewCommercialEvidence ? money(normalizedCost, normalizedCurrency) : "Restricted by staff permission",
        sourceCost: mayViewCommercialEvidence ? money(proposal.costSnapshot.sourceCostAmount, sourceCurrency) : "Restricted by staff permission",
        currency: normalizedCurrency,
        sourceCurrency,
        taxBasis: proposal.costSnapshot.sourceTaxBasis ?? "Unavailable",
        pricingTimestamp: proposal.costSnapshot.pricingTimestamp,
      },
      canonicalCalculation: {
        proposedSellingPriceExVat: money(proposal.proposedSellingPriceExVat, "ZAR"),
        vatAmount: money(proposal.vatAmount, "ZAR"),
        proposedSellingPriceInclVat: money(proposal.proposedSellingPriceInclVat, "ZAR"),
        referenceRetailInclVat: money(proposal.referenceRetailInclVat, "ZAR"),
        grossProfitExVat: mayViewCommercialEvidence ? money(proposal.grossProfit, "ZAR") : "Restricted by staff permission",
        grossMarginPercent: mayViewCommercialEvidence ? present(proposal.grossMarginPercent) : "Restricted by staff permission",
        markupPercent: mayViewCommercialEvidence ? present(proposal.markupPercent) : "Restricted by staff permission",
        pricingBand: present(proposal.appliedPricingBand?.id),
        targetGrossMarginPercent: present(proposal.appliedPricingBand?.targetGrossMarginPercent),
        minimumGrossProfit: money(proposal.appliedPricingBand?.minimumGrossProfit, "ZAR"),
      },
      warnings: limited(proposal.warningDetails, 8).map((warning) => ({ code: warning.code, severity: warning.severity, message: warning.message })),
    },
  };
}

const definitions: Record<AdminAiContextType, ContextDefinition> = {
  PRODUCT: { permission: "products.read", intents: ["SUMMARY", "BLOCKERS", "EXPLAIN", "NEXT_STEPS", "RISK_REVIEW"], build: buildProductContext },
  SUPPLIER: { permission: "suppliers.read", intents: ["SUMMARY", "BLOCKERS", "EXPLAIN", "NEXT_STEPS", "RISK_REVIEW"], build: buildSupplierContext },
  PRICING_PROPOSAL: { permission: "pricing.read", intents: ["SUMMARY", "BLOCKERS", "EXPLAIN", "NEXT_STEPS", "RISK_REVIEW"], build: buildPricingContext },
};

function notFound() { return new AdminAiContextError("RESOURCE_NOT_FOUND", "The requested Admin resource is unavailable.", 404); }
function invalid(message: string) { return new AdminAiContextError("INVALID_CONTEXT_REQUEST", message, 400); }

export function parseAdminAiContextRequest(input: unknown): AdminAiContextRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalid("Context request is invalid.");
  const value = input as Record<string, unknown>;
  const allowed = new Set(["contextType", "resourceId", "intent"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw invalid("Context request contains unsupported fields.");
  if (typeof value.contextType !== "string" || !ADMIN_AI_CONTEXT_TYPES.includes(value.contextType as AdminAiContextType)) throw invalid("Context type is invalid.");
  if (typeof value.intent !== "string" || !ADMIN_AI_CONTEXT_INTENTS.includes(value.intent as AdminAiContextIntent)) throw invalid("Context intent is invalid.");
  if (typeof value.resourceId !== "string" || !value.resourceId.trim() || value.resourceId.length > 160) throw invalid("Resource identifier is invalid.");
  return { contextType: value.contextType as AdminAiContextType, resourceId: value.resourceId.trim(), intent: value.intent as AdminAiContextIntent };
}

export function modelRoleForContext(contextType: AdminAiContextType, intent: AdminAiContextIntent): AdminAiModelRole {
  if (intent === "RISK_REVIEW") return "PRIMARY";
  if (contextType === "PRICING_PROPOSAL" && intent === "BLOCKERS") return "PRIMARY";
  return "ROUTINE";
}

export async function buildAdminAiSafeContext(request: AdminAiContextRequest, context: StaffAuthorizationContext, deps: ContextDependencies = dependencies) {
  const definition = definitions[request.contextType];
  if (!definition || !definition.intents.includes(request.intent)) throw invalid("Context intent is not available for this resource.");
  requirePermission(definition.permission)(context);
  return definition.build(request.resourceId, context, deps);
}

const intentInstruction: Record<AdminAiContextIntent, string> = {
  SUMMARY: "Summarize the current state concisely.",
  BLOCKERS: "Explain the supplied blockers or warnings and why they matter.",
  EXPLAIN: "Explain the supplied canonical state in practical operational language.",
  NEXT_STEPS: "Suggest a short ordered review sequence without performing any action.",
  RISK_REVIEW: "Review the supplied factors for operational risk and clearly separate facts from suggestions.",
};

export async function generateContextualAdminAi(input: {
  request: AdminAiContextRequest;
  context: StaffAuthorizationContext;
  service: AdminAiService;
  environment?: NodeJS.ProcessEnv;
  resolveAccess?: typeof getAdminAiAccess;
  dependencies?: ContextDependencies;
}): Promise<{ context: AdminAiSafeContext; result: AdminAiGenerateResponse }> {
  const definition = definitions[input.request.contextType];
  if (!definition || !definition.intents.includes(input.request.intent)) throw invalid("Context intent is not available for this resource.");
  requirePermission(definition.permission)(input.context);
  return assertAdminAiAccess(input.context, async () => {
    const safeContext = await definition.build(input.request.resourceId, input.context, input.dependencies ?? dependencies);
    const role = modelRoleForContext(input.request.contextType, input.request.intent);
    const result = await input.service.generate({
      callerFeature: "admin-ai-contextual",
      modelRole: role,
      messages: [{ role: "user", content: `${intentInstruction[input.request.intent]} Use no more than six short paragraphs or bullets.` }],
      contextBlocks: [
        { label: "Canonical Admin context", content: JSON.stringify(safeContext.facts) },
        { label: "Context provenance", content: safeContext.provenance.join("; ") },
        { label: "Read-only boundary", content: "Supplied facts are authoritative. If a fact is absent or marked unavailable, say it is unavailable. Distinguish facts from suggestions. Do not invent status, stock, pricing, approval, or completed actions. Do not expose links, HTML, credentials, or hidden reasoning. Do not claim to perform or authorize any action." },
      ],
      maxOutputTokens: 1_200,
      temperature: 0.1,
      metadata: { contextType: input.request.contextType, intent: input.request.intent },
    });
    return { context: safeContext, result };
  }, input.environment ?? process.env, input.resolveAccess ?? getAdminAiAccess);
}

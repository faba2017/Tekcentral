import { createHash, randomUUID } from "node:crypto";
import { assertAdminAiAccess, getAdminAiAccess } from "../aiAccessControl.js";
import { recordAdminAudit, type AdminAuditRecord } from "../adminAuditService.js";
import { bestEffortAlert } from "../operationalAlertService.js";
import { getPublicationReview, publishSavedDraft, savePublicationDraft } from "../productPublicationRepository.js";
import { requirePermission, staffAuditActor, type StaffAuthorizationContext } from "../staffAuthorization.js";
import type { StaffPermission } from "../staffRbac.js";
import {
  cancelActionForOwner,
  claimActionConfirmation,
  createAutomationPreparedAction,
  getAdminAiAction,
  createPreparedAction,
  getActionForOwner,
  listActionsForConversation,
  markActionFailed,
  markActionSucceeded,
  countAdminAiActionsSince,
  type AdminAiAction,
  type AdminAiActionRisk,
} from "./actionRepository.js";
import { enforceAdminAiExecutionLimit, evaluateAdminAiToolPolicy } from "./policy.js";
import type { AdminAiContextAttachment } from "./conversationRepository.js";
import type { AdminAiService } from "./service.js";
import type { AdminAiToolCall, AdminAiToolDefinition } from "./types.js";

export type AdminAiExecutionPolicy = "SUGGEST_ONLY" | "PREPARE_ONLY" | "CONFIRM_REQUIRED";
export type AdminAiAutonomyCeiling = "PREPARE";
type ProductDraftChanges = { shortDescription?: string; overview?: string };
type ProductActionInput = { changes: ProductDraftChanges };
type ProductPreview = { actionLabel: string; targetLabel: string; changes: Array<{ field: string; label: string; before: string; after: string }>; warnings: string[] };

export type AdminAiActionCard = {
  id: string;
  conversationId: string;
  turnId: string;
  toolId: string;
  toolLabel: string;
  state: AdminAiAction["state"];
  riskLevel: AdminAiActionRisk;
  targetType: string;
  targetId: string;
  targetLabel: string;
  preview: ProductPreview;
  expiresAt: string;
  confirmedAt?: string;
  executedAt?: string;
  safeResult?: Record<string, unknown>;
  failureCode?: string;
};

export class AdminAiControlledActionError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

type ProductReview = Awaited<ReturnType<typeof getPublicationReview>>;
type ControlledActionDependencies = {
  access: typeof getAdminAiAccess;
  getReview: typeof getPublicationReview;
  saveDraft: typeof savePublicationDraft;
  publishDraft: typeof publishSavedDraft;
  audit: typeof recordAdminAudit;
  evaluatePolicy: typeof evaluateAdminAiToolPolicy;
  countActions: typeof countAdminAiActionsSince;
  enforceExecutionLimit: typeof enforceAdminAiExecutionLimit;
};
const dependencies: ControlledActionDependencies = { access: getAdminAiAccess, getReview: getPublicationReview, saveDraft: savePublicationDraft, publishDraft: publishSavedDraft, audit: recordAdminAudit, evaluatePolicy: evaluateAdminAiToolPolicy, countActions: countAdminAiActionsSince, enforceExecutionLimit: enforceAdminAiExecutionLimit };

const PRODUCT_DRAFT_UPDATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["changes"],
  properties: {
    changes: {
      type: "object",
      additionalProperties: false,
      minProperties: 1,
      properties: {
        shortDescription: { type: "string", minLength: 12, maxLength: 600 },
        overview: { type: "string", minLength: 20, maxLength: 4000 },
      },
    },
  },
} as const;

const PRODUCT_PUBLISH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {},
} as const;

export const ADMIN_AI_TOOL_REGISTRY = {
  product_draft_update: {
    id: "product_draft_update",
    label: "Update Product draft",
    domain: "PRODUCTS",
    description: "Prepare a reviewable update to the attached Product's short description or overview. Rephrase only facts already present in canonical Product context. Never invent specifications, compatibility, warranty, certifications, dimensions, availability or pricing.",
    inputSchema: PRODUCT_DRAFT_UPDATE_SCHEMA,
    contextType: "PRODUCT",
    requiredPermission: "products.edit" as StaffPermission,
    riskLevel: "MEDIUM" as AdminAiActionRisk,
    executionPolicy: "CONFIRM_REQUIRED" as AdminAiExecutionPolicy,
    allowedAutonomyCeiling: "PREPARE" as AdminAiAutonomyCeiling,
    confirmationRequired: true,
    handler: "canonical_product_publication_draft_save",
    previewBuilder: "server_deterministic_field_diff",
    baselineBuilder: "sha256_short_description_and_overview",
    safeResultBuilder: "bounded_product_id_changed_fields_and_saved_at",
    h2ActionType: "PRODUCT_CONTENT_UPDATED",
    h2ProvenanceMetadata: ["Origin", "Tool ID", "Conversation ID", "Action ID"],
  },
  product_publish: {
    id: "product_publish",
    label: "Publish Product",
    domain: "PRODUCTS",
    description: "Prepare publication of the attached canonical Product only when current H.4 readiness, saved draft, approved pricing, controlled media and publication eligibility all allow it. This tool never publishes without authenticated staff confirmation.",
    inputSchema: PRODUCT_PUBLISH_SCHEMA,
    contextType: "PRODUCT",
    requiredPermission: "products.publish" as StaffPermission,
    riskLevel: "HIGH" as AdminAiActionRisk,
    executionPolicy: "CONFIRM_REQUIRED" as AdminAiExecutionPolicy,
    allowedAutonomyCeiling: "PREPARE" as AdminAiAutonomyCeiling,
    confirmationRequired: true,
    handler: "canonical_product_publish_saved_draft",
    previewBuilder: "server_deterministic_publication_facts",
    baselineBuilder: "sha256_publication_readiness_draft_price_and_version",
    safeResultBuilder: "bounded_product_publication_version_and_published_at",
    h2ActionType: "PRODUCT_PUBLISHED",
    h2ProvenanceMetadata: ["Origin", "Tool ID", "Conversation or automation run ID", "Action ID"],
  },
} as const;

export const adminAiToolRegistryDto = () => Object.values(ADMIN_AI_TOOL_REGISTRY).map((tool) => ({ id: tool.id, label: tool.label, domain: tool.domain, targetType: tool.contextType, riskLevel: tool.riskLevel, requiredPermission: tool.requiredPermission, autonomyCeiling: "PREPARE" as const, confidenceApplicable: false, valueApplicable: false }));

const productTool = ADMIN_AI_TOOL_REGISTRY.product_draft_update;
const publicationTool = ADMIN_AI_TOOL_REGISTRY.product_publish;
const CHAT_ACTION_EXPIRY_MS = 10 * 60_000;
const AUTOMATION_DRAFT_EXPIRY_MS = 24 * 60 * 60_000;
const AUTOMATION_HIGH_RISK_EXPIRY_MS = 60 * 60_000;
type RegisteredTool = (typeof ADMIN_AI_TOOL_REGISTRY)[keyof typeof ADMIN_AI_TOOL_REGISTRY];
const registeredTool = (toolId: string): RegisteredTool | undefined => ADMIN_AI_TOOL_REGISTRY[toolId as keyof typeof ADMIN_AI_TOOL_REGISTRY];
const toolPolicy = (toolId: string) => adminAiToolRegistryDto().find((item) => item.id === toolId)!;
const compact = (value: string) => value.replace(/\s+/g, " ").trim();
const fingerprint = (review: ProductReview) => createHash("sha256").update(JSON.stringify({ shortDescription: review.draft.shortDescription, overview: review.draft.overview ?? "" })).digest("hex");
const publicationFingerprint = (review: ProductReview) => createHash("sha256").update(JSON.stringify({
  state: review.state,
  readinessStatus: review.readiness.status,
  readinessBlockers: review.readiness.blockers,
  eligibility: review.eligibility,
  draftSavedAt: review.draftSavedAt,
  approvedProposal: review.currentApprovedProposal,
  activeVersionId: review.activeVersionId,
  hasActiveDraft: review.hasActiveDraft,
  hasUnpublishedChanges: review.hasUnpublishedChanges,
  draft: review.draft,
})).digest("hex");
const editable = (review: ProductReview) => review.state !== "PUBLISHED" || review.hasActiveDraft;
const actionUnavailable = () => new AdminAiControlledActionError("ADMIN_AI_ACTION_UNAVAILABLE", "Admin AI action is not available.", 404);

function parseChanges(input: unknown, review?: ProductReview): ProductActionInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new AdminAiControlledActionError("INVALID_TOOL_ARGUMENTS", "Product draft changes are invalid.");
  const root = input as Record<string, unknown>;
  if (Object.keys(root).some((key) => key !== "changes") || !root.changes || typeof root.changes !== "object" || Array.isArray(root.changes)) throw new AdminAiControlledActionError("INVALID_TOOL_ARGUMENTS", "Product draft changes are invalid.");
  const raw = root.changes as Record<string, unknown>;
  if (!Object.keys(raw).length || Object.keys(raw).some((key) => !["shortDescription", "overview"].includes(key))) throw new AdminAiControlledActionError("INVALID_TOOL_ARGUMENTS", "Only short description and overview can be prepared.");
  const changes: ProductDraftChanges = {};
  for (const [key, limit, minimum] of [["shortDescription", 600, 12], ["overview", 4000, 20]] as const) {
    if (raw[key] === undefined) continue;
    if (typeof raw[key] !== "string") throw new AdminAiControlledActionError("INVALID_TOOL_ARGUMENTS", `${key} must be text.`);
    const value = compact(raw[key]);
    if (value.length < minimum || value.length > limit) throw new AdminAiControlledActionError("INVALID_TOOL_ARGUMENTS", `${key} length is invalid.`);
    Object.assign(changes, { [key]: value });
  }
  if (!Object.keys(changes).length) throw new AdminAiControlledActionError("INVALID_TOOL_ARGUMENTS", "At least one supported Product draft field is required.");
  if (review) {
    const evidence = compact([review.draft.name, review.draft.shortDescription, review.draft.description, review.draft.overview, ...review.draft.specifications.flatMap((item) => [item.name, item.value])].filter(Boolean).join(" ")).toLowerCase();
    const proposed = Object.values(changes).join(" ").toLowerCase();
    const numericClaims = proposed.match(/\b\d+(?:[.,]\d+)?(?:\s?(?:gb|tb|mb|ghz|mhz|w|v|mm|cm|kg|year|years))?\b/g) ?? [];
    if (numericClaims.some((claim) => !evidence.includes(claim))) throw new AdminAiControlledActionError("UNSUPPORTED_PRODUCT_CLAIM", "The proposed Product wording introduces a numeric claim that is not present in canonical evidence.");
    for (const term of ["warranty", "certified", "certification", "waterproof", "compatible with", "guaranteed"]) {
      if (proposed.includes(term) && !evidence.includes(term)) throw new AdminAiControlledActionError("UNSUPPORTED_PRODUCT_CLAIM", "The proposed Product wording introduces an unsupported factual claim.");
    }
  }
  return { changes };
}

function preview(review: ProductReview, input: ProductActionInput): ProductPreview {
  const changes: ProductPreview["changes"] = [];
  if (input.changes.shortDescription !== undefined && input.changes.shortDescription !== review.draft.shortDescription) changes.push({ field: "shortDescription", label: "Short description", before: review.draft.shortDescription, after: input.changes.shortDescription });
  if (input.changes.overview !== undefined && input.changes.overview !== (review.draft.overview ?? "")) changes.push({ field: "overview", label: "Overview", before: review.draft.overview ?? "", after: input.changes.overview });
  if (!changes.length) throw new AdminAiControlledActionError("NO_PRODUCT_CHANGES", "The proposed wording does not change the current Product draft.");
  return { actionLabel: productTool.label, targetLabel: review.draft.name, changes, warnings: ["Review all wording for factual accuracy before applying."] };
}

function parsePublicationInput(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input as Record<string, unknown>).length) throw new AdminAiControlledActionError("INVALID_TOOL_ARGUMENTS", "Product publication does not accept model-supplied values.");
  return {};
}

function publicationBlockers(review: ProductReview) {
  const blockers = [...new Set([
    ...review.readiness.blockers,
    ...review.eligibility.blockers,
    ...(!review.hasActiveDraft ? ["SAVE_DRAFT_REQUIRED"] : []),
    ...(!review.currentApprovedProposal ? ["APPROVED_PRICE_REQUIRED"] : []),
    ...(review.state === "PUBLISHED" && !review.hasUnpublishedChanges ? ["NO_PUBLIC_CHANGES"] : []),
  ])];
  return blockers;
}

function publicationPreview(review: ProductReview): ProductPreview {
  const blockers = publicationBlockers(review);
  if (blockers.length || !review.eligibility.canPublish) throw new AdminAiControlledActionError("PRODUCT_NOT_READY_TO_PUBLISH", `Product is not ready to publish${blockers.length ? `: ${blockers.join(", ")}` : "."}`, 409);
  return {
    actionLabel: publicationTool.label,
    targetLabel: review.draft.name,
    changes: [
      { field: "publicationState", label: "Publication state", before: review.state, after: "PUBLISHED" },
      { field: "readiness", label: "Canonical readiness", before: review.readiness.status, after: "12 of 12 complete" },
      { field: "approvedPrice", label: "Approved storefront price", before: `ZAR ${Number(review.currentApprovedProposal!.price).toFixed(2)}`, after: `ZAR ${Number(review.currentApprovedProposal!.price).toFixed(2)}` },
      { field: "availability", label: "Current availability", before: review.availability.state, after: review.availability.state },
    ],
    warnings: ["HIGH risk · Human confirmation required.", "Publish this Product? This will make the current approved Product version available according to the existing storefront publication workflow."],
  };
}

async function recordPublicationAudit(input: { deps: ControlledActionDependencies; staff: StaffAuthorizationContext; action: AdminAiAction; review: ProductReview; version: Awaited<ReturnType<typeof publishSavedDraft>> }) {
  try {
    return await input.deps.audit({ category: "AUDIT", ...staffAuditActor(input.staff), subsystem: "PRODUCTS", actionType: publicationTool.h2ActionType, entityType: "PRODUCT", entityId: input.action.targetId, entityLabel: input.version.snapshot.name, summary: input.action.originType === "AUTOMATION" ? "Staff confirmed an automation-prepared canonical Product publication." : "Staff confirmed an Admin AI-prepared canonical Product publication.", before: [{ label: "Publication", value: input.review.state }], after: [{ label: "Publication", value: "PUBLISHED" }, { label: "Version", value: input.version.version }, { label: "Price", value: input.version.snapshot.price }], metadata: [{ label: "Origin", value: input.action.originType === "AUTOMATION" ? "ADMIN_AI_AUTOMATION" : "ADMIN_AI" }, { label: "Tool ID", value: publicationTool.id }, ...(input.action.originType === "AUTOMATION" ? [{ label: "Automation run ID", value: input.action.automationRunId }] : [{ label: "Conversation ID", value: input.action.conversationId }]), { label: "Action ID", value: input.action.id }], targetRoute: `/admin/products/${encodeURIComponent(input.action.targetId)}/publishing`, idempotencyKey: `admin-ai-action:${input.action.id}` });
  } catch {
    await bestEffortAlert({ type: "ADMIN_AI_HIGH_RISK_AUDIT_FAILED", severity: "CRITICAL", subsystem: "SYSTEM", title: "High-risk Admin AI audit attribution failed", summary: "A staff-confirmed Product publication succeeded but its H.2 audit record could not be confirmed.", entityType: "ADMIN_AI_ACTION", entityId: input.action.id, targetRoute: `/admin/products/${encodeURIComponent(input.action.targetId)}/publishing`, recommendedAction: "Reconcile the immutable Product publication version and restore the missing H.2 attribution before further high-risk actions.", diagnosticCode: "ADMIN_AI_HIGH_RISK_AUDIT_FAILED" });
    return undefined;
  }
}

export function actionCard(action: AdminAiAction): AdminAiActionCard {
  if (action.originType !== "CHAT" || !action.conversationId || !action.turnId) throw new AdminAiControlledActionError("ADMIN_AI_ACTION_UNAVAILABLE", "This action is not part of an Admin AI chat.", 404);
  const safePreview = action.safePreview as unknown as ProductPreview;
  return { id: action.id, conversationId: action.conversationId, turnId: action.turnId, toolId: action.toolId, toolLabel: registeredTool(action.toolId)?.label ?? action.toolId, state: action.state, riskLevel: action.riskLevel, targetType: action.targetType, targetId: action.targetId, targetLabel: safePreview.targetLabel ?? action.targetId, preview: safePreview, expiresAt: action.expiresAt, confirmedAt: action.confirmedAt, executedAt: action.executedAt, safeResult: action.safeResult, failureCode: action.failureCode };
}

export async function availableAdminAiTools(input: { staff: StaffAuthorizationContext; attachments: readonly AdminAiContextAttachment[]; environment?: NodeJS.ProcessEnv; deps?: ControlledActionDependencies }): Promise<AdminAiToolDefinition[]> {
  const deps = input.deps ?? dependencies;
  const access = await deps.access(input.staff, input.environment ?? process.env);
  const products = input.attachments.filter((item) => item.contextType === "PRODUCT");
  if (!access.effective || products.length !== 1) return [];
  let review: ProductReview;
  try { review = await deps.getReview(products[0].resourceId); } catch { return []; }
  const preparedActionsLastHour = await deps.countActions(input.staff.actorId ?? "", "PREPARED", new Date(Date.now() - 3_600_000));
  const result: AdminAiToolDefinition[] = [];
  for (const tool of Object.values(ADMIN_AI_TOOL_REGISTRY)) {
    if (!input.staff.permissions.has(tool.requiredPermission)) continue;
    const effective = await deps.evaluatePolicy({ staff: input.staff, tool: toolPolicy(tool.id), requestedBehavior: "PREPARE", environment: input.environment, preparedActionsLastHour });
    if (!effective.allowed) continue;
    if (tool.id === productTool.id && !editable(review)) continue;
    if (tool.id === publicationTool.id && (publicationBlockers(review).length || !review.eligibility.canPublish)) continue;
    result.push({ name: tool.id, description: tool.description, inputSchema: tool.inputSchema as unknown as Record<string, unknown> });
  }
  return result;
}

export async function prepareAdminAiAction(input: { ownerStaffId: string; conversationId: string; turnId: string; staff: StaffAuthorizationContext; attachments: readonly AdminAiContextAttachment[]; toolCall: AdminAiToolCall; environment?: NodeJS.ProcessEnv; deps?: ControlledActionDependencies; now?: Date }) {
  const deps = input.deps ?? dependencies; const now = input.now ?? new Date();
  if (!input.staff.actorId || input.staff.actorId !== input.ownerStaffId) throw actionUnavailable();
  const tool = registeredTool(input.toolCall.name);
  if (!tool) throw new AdminAiControlledActionError("UNKNOWN_ADMIN_AI_TOOL", "The requested Admin AI tool is not enabled.");
  await assertAdminAiAccess(input.staff, async () => undefined, input.environment ?? process.env, deps.access);
  requirePermission(tool.requiredPermission)(input.staff);
  const policy = await deps.evaluatePolicy({ staff: input.staff, tool: toolPolicy(tool.id), requestedBehavior: "PREPARE", now, environment: input.environment, preparedActionsLastHour: await deps.countActions(input.ownerStaffId, "PREPARED", new Date(now.getTime() - 3_600_000)) });
  if (!policy.allowed) throw new AdminAiControlledActionError(policy.denialReasons[0] ?? "ADMIN_AI_ACTION_UNAVAILABLE", "Admin AI policy does not allow this action to be prepared.", policy.denialReasons.includes("ACTION_RATE_LIMIT") ? 429 : 403);
  const products = input.attachments.filter((item) => item.contextType === tool.contextType);
  if (products.length !== 1) throw new AdminAiControlledActionError("PRODUCT_CONTEXT_REQUIRED", "Attach exactly one Product before preparing a Product draft change.", 409);
  const review = await deps.getReview(products[0].resourceId).catch(() => { throw actionUnavailable(); });
  if (tool.id === productTool.id && !editable(review)) throw new AdminAiControlledActionError("PRODUCT_DRAFT_NOT_EDITABLE", "Create an editable Product version before preparing changes.", 409);
  const parsed = tool.id === publicationTool.id ? parsePublicationInput(input.toolCall.input) : parseChanges(input.toolCall.input, review);
  const safePreview = tool.id === publicationTool.id ? publicationPreview(review) : preview(review, parsed as ProductActionInput);
  const action = await createPreparedAction({ ownerStaffId: input.ownerStaffId, conversationId: input.conversationId, turnId: input.turnId, toolId: tool.id, targetType: "PRODUCT", targetId: products[0].resourceId, safeInput: parsed, safePreview, baselineFingerprint: tool.id === publicationTool.id ? publicationFingerprint(review) : fingerprint(review), requiredPermission: tool.requiredPermission, riskLevel: tool.riskLevel, expiresAt: new Date(now.getTime() + CHAT_ACTION_EXPIRY_MS) }, now);
  return actionCard(action);
}

export async function prepareAutomationAdminAiAction(input: { ownerStaffId: string; automationRunId: string; targetId: string; staff: StaffAuthorizationContext; toolCall: AdminAiToolCall; now?: Date; deps?: ControlledActionDependencies }) {
  const deps = input.deps ?? dependencies; const now = input.now ?? new Date();
  const tool = registeredTool(input.toolCall.name);
  if (!tool) throw new AdminAiControlledActionError("UNKNOWN_ADMIN_AI_TOOL", "The requested Admin AI tool is not enabled.");
  requirePermission(tool.requiredPermission)(input.staff);
  const review = await deps.getReview(input.targetId).catch(() => { throw actionUnavailable(); });
  if (tool.id === productTool.id && !editable(review)) throw new AdminAiControlledActionError("PRODUCT_DRAFT_NOT_EDITABLE", "Create an editable Product version before preparing changes.", 409);
  const parsed = tool.id === publicationTool.id ? parsePublicationInput(input.toolCall.input) : parseChanges(input.toolCall.input, review);
  const safePreview = tool.id === publicationTool.id ? publicationPreview(review) : preview(review, parsed as ProductActionInput);
  return createAutomationPreparedAction({ ownerStaffId: input.ownerStaffId, automationRunId: input.automationRunId, toolId: tool.id, targetType: "PRODUCT", targetId: input.targetId, safeInput: parsed, safePreview, baselineFingerprint: tool.id === publicationTool.id ? publicationFingerprint(review) : fingerprint(review), requiredPermission: tool.requiredPermission, riskLevel: tool.riskLevel, expiresAt: new Date(now.getTime() + (tool.id === publicationTool.id ? AUTOMATION_HIGH_RISK_EXPIRY_MS : AUTOMATION_DRAFT_EXPIRY_MS)) }, now);
}

export function automationActionCard(action: AdminAiAction) {
  if (action.originType !== "AUTOMATION" || !action.automationRunId) throw actionUnavailable();
  return { id: action.id, automationRunId: action.automationRunId, toolId: action.toolId, toolLabel: registeredTool(action.toolId)?.label ?? action.toolId, state: action.state, riskLevel: action.riskLevel, targetType: action.targetType, targetId: action.targetId, targetLabel: (action.safePreview as unknown as ProductPreview).targetLabel ?? action.targetId, preview: action.safePreview, expiresAt: action.expiresAt, confirmedAt: action.confirmedAt, executedAt: action.executedAt, safeResult: action.safeResult, failureCode: action.failureCode };
}

export async function listAdminAiActionCards(ownerStaffId: string, conversationId: string) {
  return (await listActionsForConversation(ownerStaffId, conversationId, 50)).map(actionCard);
}

export async function cancelAdminAiAction(ownerStaffId: string, actionId: string) {
  const current = await getActionForOwner(ownerStaffId, actionId);
  if (!current || current.originType !== "CHAT") throw actionUnavailable();
  return actionCard(await cancelActionForOwner(ownerStaffId, actionId));
}

export async function confirmAdminAiAction(input: { ownerStaffId: string; actionId: string; staff: StaffAuthorizationContext; service?: AdminAiService; environment?: NodeJS.ProcessEnv; deps?: ControlledActionDependencies; now?: Date }) {
  const deps = input.deps ?? dependencies; const now = input.now ?? new Date();
  if (!input.staff.actorId || input.staff.actorId !== input.ownerStaffId) throw actionUnavailable();
  await assertAdminAiAccess(input.staff, async () => undefined, input.environment ?? process.env, deps.access);
  const action = await getActionForOwner(input.ownerStaffId, input.actionId, now);
  if (!action) throw actionUnavailable();
  if (action.originType !== "CHAT") throw actionUnavailable();
  const tool = registeredTool(action.toolId);
  if (!tool || action.targetType !== "PRODUCT" || action.requiredPermission !== tool.requiredPermission || action.riskLevel !== tool.riskLevel) throw new AdminAiControlledActionError("ACTION_POLICY_CHANGED", "This prepared action no longer matches the enabled tool policy.", 409);
  requirePermission(tool.requiredPermission)(input.staff);
  if (action.state !== "AWAITING_CONFIRMATION") return { action: actionCard(action) };
  const policy = await deps.evaluatePolicy({ staff: input.staff, tool: toolPolicy(tool.id), requestedBehavior: "PREPARE", now, environment: input.environment, preparedActionsLastHour: 0, executionsLastHour: await deps.countActions(input.ownerStaffId, "EXECUTED", new Date(now.getTime() - 3_600_000)) });
  if (!policy.allowed) throw new AdminAiControlledActionError(policy.denialReasons[0] ?? "ACTION_POLICY_CHANGED", "Admin AI policy no longer allows this action to be confirmed.", 403);
  await deps.enforceExecutionLimit(input.ownerStaffId, adminAiToolRegistryDto(), await deps.countActions(input.ownerStaffId, "EXECUTED", new Date(now.getTime() - 3_600_000)));
  let review: ProductReview;
  try { review = await deps.getReview(action.targetId); } catch { throw new AdminAiControlledActionError("PRODUCT_NOT_AVAILABLE", "The target Product is no longer available.", 409); }
  const parsed = tool.id === publicationTool.id ? parsePublicationInput(action.safeInput) : parseChanges(action.safeInput, review);
  const stale = tool.id === publicationTool.id
    ? publicationBlockers(review).length > 0 || !review.eligibility.canPublish || publicationFingerprint(review) !== action.baselineFingerprint
    : !editable(review) || fingerprint(review) !== action.baselineFingerprint;
  const claim = await claimActionConfirmation(input.ownerStaffId, action.id, `admin-ai-execution-${randomUUID()}`, now);
  if (!claim.claimed) return { action: actionCard(claim.action) };
  if (stale) return { action: actionCard(await markActionFailed(input.ownerStaffId, action.id, "TARGET_STALE", { outcome: "NOT_APPLIED", reason: "TARGET_STALE" }, now)) };
  try {
    if (tool.id === publicationTool.id) {
      const version = await deps.publishDraft({ internalProductId: action.targetId, pricingProposalId: review.currentApprovedProposal!.id, idempotencyKey: `admin-ai-action:${action.id}`, actor: input.staff.actorLabel });
      const audit = await recordPublicationAudit({ deps, staff: input.staff, action, review, version });
      const succeeded = await markActionSucceeded(input.ownerStaffId, action.id, { outcome: "PRODUCT_PUBLISHED", productId: action.targetId, publicationVersionId: version.id, version: version.version, publishedAt: version.publishedAt, auditRecorded: Boolean(audit), ...(audit ? { auditId: audit.id } : {}) }, new Date());
      return { action: actionCard(succeeded) };
    }
    const draftInput = parsed as ProductActionInput;
    const snapshot = { ...review.draft, ...draftInput.changes };
    const origins = { ...review.contentOrigins, ...(draftInput.changes.shortDescription !== undefined ? { shortDescription: "STAFF_EDITED" as const } : {}), ...(draftInput.changes.overview !== undefined ? { overview: "STAFF_EDITED" as const } : {}) };
    const saved = await deps.saveDraft({ internalProductId: action.targetId, snapshot, contentOrigins: origins, imageProvenance: review.image.provenance, actor: input.staff.actorLabel });
    const changedFields = Object.keys(draftInput.changes);
    let audit: AdminAuditRecord | undefined;
    try {
      audit = await deps.audit({ category: "AUDIT", ...staffAuditActor(input.staff), subsystem: "PRODUCTS", actionType: productTool.h2ActionType, entityType: "PRODUCT", entityId: action.targetId, entityLabel: saved.snapshot.name, summary: "Staff confirmed an Admin AI-assisted canonical Product content update.", before: (action.safePreview as unknown as ProductPreview).changes.map((change) => ({ label: change.label, value: change.before })), after: (action.safePreview as unknown as ProductPreview).changes.map((change) => ({ label: change.label, value: change.after })), metadata: [{ label: "Origin", value: "ADMIN_AI" }, { label: "Tool ID", value: productTool.id }, { label: "Conversation ID", value: action.conversationId }, { label: "Action ID", value: action.id }], targetRoute: `/admin/products/${encodeURIComponent(action.targetId)}/publishing`, idempotencyKey: `admin-ai-action:${action.id}` });
    } catch { audit = undefined; }
    const succeeded = await markActionSucceeded(input.ownerStaffId, action.id, { outcome: "DRAFT_UPDATED", productId: action.targetId, changedFields, savedAt: saved.savedAt, auditRecorded: Boolean(audit) }, new Date());
    let narration: string | undefined;
    if (input.service) {
      try {
        const result = await input.service.generate({ callerFeature: "admin-ai-action-result", modelRole: "ROUTINE", messages: [{ role: "user", content: "Briefly explain the confirmed controlled action result." }], contextBlocks: [{ label: "Controlled action result", content: JSON.stringify({ status: "ACTION_SUCCEEDED", target: saved.snapshot.name, changedFields }) }], toolContinuation: { call: { id: `action-${action.id}`, name: productTool.id, input: parsed }, result: { status: "ACTION_SUCCEEDED", changedFields } }, maxOutputTokens: 160, temperature: 0 });
        narration = result.text;
      } catch { narration = undefined; }
    }
    return { action: actionCard(succeeded), narration };
  } catch (error) {
    const failed = await markActionFailed(input.ownerStaffId, action.id, tool.id === publicationTool.id ? "PRODUCT_PUBLICATION_FAILED" : "PRODUCT_DRAFT_UPDATE_FAILED", { outcome: "NOT_APPLIED" }, new Date()).catch(() => undefined);
    if (failed) return { action: actionCard(failed) };
    throw error;
  }
}

export async function cancelAutomationAdminAiAction(input:{actionId:string;staff:StaffAuthorizationContext;now?:Date}){
  const action=await getAdminAiAction(input.actionId,input.now);if(!action||action.originType!=="AUTOMATION"||(!input.staff.actorId)||(input.staff.actorId!==action.ownerStaffId&&input.staff.role!=="SUPER_ADMIN"))throw actionUnavailable();
  return automationActionCard(await cancelActionForOwner(action.ownerStaffId,action.id,input.now));
}

export async function confirmAutomationAdminAiAction(input:{actionId:string;staff:StaffAuthorizationContext;ownerStaff:StaffAuthorizationContext;environment?:NodeJS.ProcessEnv;deps?:ControlledActionDependencies;now?:Date}) {
  const deps=input.deps??dependencies; const now=input.now??new Date(); const action=await getAdminAiAction(input.actionId,now);
  if(!action||action.originType!=="AUTOMATION"||!input.staff.actorId||(input.staff.actorId!==action.ownerStaffId&&input.staff.role!=="SUPER_ADMIN")||input.ownerStaff.actorId!==action.ownerStaffId) throw actionUnavailable();
  const tool=registeredTool(action.toolId);
  if(!tool||action.targetType!=="PRODUCT"||action.requiredPermission!==tool.requiredPermission||action.riskLevel!==tool.riskLevel) throw new AdminAiControlledActionError("ACTION_POLICY_CHANGED","This prepared action no longer matches the enabled tool policy.",409);
  await assertAdminAiAccess(input.ownerStaff,async()=>undefined,input.environment??process.env,deps.access); requirePermission(tool.requiredPermission)(input.ownerStaff); requirePermission(tool.requiredPermission)(input.staff);
  if(action.state!=="AWAITING_CONFIRMATION") return {action:automationActionCard(action)};
  const policy=await deps.evaluatePolicy({staff:input.ownerStaff,tool:toolPolicy(tool.id),requestedBehavior:"PREPARE",now,environment:input.environment,preparedActionsLastHour:0,executionsLastHour:await deps.countActions(action.ownerStaffId,"EXECUTED",new Date(now.getTime()-3_600_000))});
  if(!policy.allowed) throw new AdminAiControlledActionError(policy.denialReasons[0]??"ACTION_POLICY_CHANGED","Admin AI policy no longer allows this action to be confirmed.",403);
  await deps.enforceExecutionLimit(action.ownerStaffId,adminAiToolRegistryDto(),await deps.countActions(action.ownerStaffId,"EXECUTED",new Date(now.getTime()-3_600_000)));
  const review=await deps.getReview(action.targetId).catch(()=>{throw new AdminAiControlledActionError("PRODUCT_NOT_AVAILABLE","The target Product is no longer available.",409);});
  const parsed=tool.id===publicationTool.id?parsePublicationInput(action.safeInput):parseChanges(action.safeInput,review);
  const stale=tool.id===publicationTool.id?publicationBlockers(review).length>0||!review.eligibility.canPublish||publicationFingerprint(review)!==action.baselineFingerprint:!editable(review)||fingerprint(review)!==action.baselineFingerprint;
  const claim=await claimActionConfirmation(action.ownerStaffId,action.id,`admin-ai-automation-execution-${randomUUID()}`,now,input.staff.actorId);
  if(!claim.claimed) return {action:automationActionCard(claim.action)};
  if(stale) return {action:automationActionCard(await markActionFailed(action.ownerStaffId,action.id,"TARGET_STALE",{outcome:"NOT_APPLIED",reason:"TARGET_STALE"},now))};
  try {
    if(tool.id===publicationTool.id) {
      const version=await deps.publishDraft({internalProductId:action.targetId,pricingProposalId:review.currentApprovedProposal!.id,idempotencyKey:`admin-ai-action:${action.id}`,actor:input.staff.actorLabel});
      const audit=await recordPublicationAudit({deps,staff:input.staff,action,review,version});
      return {action:automationActionCard(await markActionSucceeded(action.ownerStaffId,action.id,{outcome:"PRODUCT_PUBLISHED",productId:action.targetId,publicationVersionId:version.id,version:version.version,publishedAt:version.publishedAt,auditRecorded:Boolean(audit),...(audit?{auditId:audit.id}:{})},new Date()))};
    }
    const draftInput=parsed as ProductActionInput; const snapshot={...review.draft,...draftInput.changes}; const origins={...review.contentOrigins,...(draftInput.changes.shortDescription!==undefined?{shortDescription:"STAFF_EDITED" as const}:{}),...(draftInput.changes.overview!==undefined?{overview:"STAFF_EDITED" as const}:{})};
    const saved=await deps.saveDraft({internalProductId:action.targetId,snapshot,contentOrigins:origins,imageProvenance:review.image.provenance,actor:input.staff.actorLabel}); const changedFields=Object.keys(draftInput.changes); let audit:AdminAuditRecord|undefined;
    try { audit=await deps.audit({category:"AUDIT",...staffAuditActor(input.staff),subsystem:"PRODUCTS",actionType:productTool.h2ActionType,entityType:"PRODUCT",entityId:action.targetId,entityLabel:saved.snapshot.name,summary:"Staff confirmed an automation-prepared Product content update.",before:(action.safePreview as unknown as ProductPreview).changes.map(change=>({label:change.label,value:change.before})),after:(action.safePreview as unknown as ProductPreview).changes.map(change=>({label:change.label,value:change.after})),metadata:[{label:"Origin",value:"ADMIN_AI_AUTOMATION"},{label:"Tool ID",value:productTool.id},{label:"Automation run ID",value:action.automationRunId},{label:"Action ID",value:action.id}],targetRoute:`/admin/products/${encodeURIComponent(action.targetId)}/publishing`,idempotencyKey:`admin-ai-action:${action.id}`}); } catch { audit=undefined; }
    return {action:automationActionCard(await markActionSucceeded(action.ownerStaffId,action.id,{outcome:"DRAFT_UPDATED",productId:action.targetId,changedFields,savedAt:saved.savedAt,auditRecorded:Boolean(audit)},new Date()))};
  } catch(error) {
    const failed=await markActionFailed(action.ownerStaffId,action.id,tool.id===publicationTool.id?"PRODUCT_PUBLICATION_FAILED":"PRODUCT_DRAFT_UPDATE_FAILED",{outcome:"NOT_APPLIED"},new Date()).catch(()=>undefined); if(failed)return{action:automationActionCard(failed)}; throw error;
  }
}

export const __controlledActionTest = { parseChanges, fingerprint, preview, editable, parsePublicationInput, publicationBlockers, publicationFingerprint, publicationPreview };

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ADMIN_AI_TOOL_REGISTRY, AdminAiControlledActionError, __controlledActionTest } from "../adminAi/controlledActions.js";
import { availableAdminAiTools, prepareAdminAiAction } from "../adminAi/controlledActions.js";
import { createStaffAuthorizationContext } from "../staffAuthorization.js";

assert.deepEqual(Object.keys(ADMIN_AI_TOOL_REGISTRY), ["product_draft_update", "product_publish"]);
const tool = ADMIN_AI_TOOL_REGISTRY.product_draft_update;
assert.equal(tool.requiredPermission, "products.edit");
assert.equal(tool.executionPolicy, "CONFIRM_REQUIRED");
assert.equal(tool.allowedAutonomyCeiling, "PREPARE");
assert.equal(tool.confirmationRequired, true);
assert.equal(tool.contextType, "PRODUCT");
assert.equal(tool.handler, "canonical_product_publication_draft_save");
assert.deepEqual(Object.keys(tool.inputSchema.properties.changes.properties).sort(), ["overview", "shortDescription"]);
const publishTool = ADMIN_AI_TOOL_REGISTRY.product_publish;
assert.equal(publishTool.requiredPermission, "products.publish");
assert.equal(publishTool.riskLevel, "HIGH");
assert.equal(publishTool.executionPolicy, "CONFIRM_REQUIRED");
assert.equal(publishTool.allowedAutonomyCeiling, "PREPARE");
assert.equal(publishTool.handler, "canonical_product_publish_saved_draft");

const review = {
  state: "UNPUBLISHED",
  hasActiveDraft: true,
  hasUnpublishedChanges: true,
  draftSavedAt: "2026-11-14T10:00:00.000Z",
  activeVersionId: undefined,
  readiness: { status: "READY_FOR_PUBLISH_REVIEW", blockers: [] },
  eligibility: { canPublish: true, blockers: [], warnings: [] },
  currentApprovedProposal: { id: "proposal-1", price: 1499 },
  availability: { state: "IN_STOCK" },
  draft: {
    name: "Fixture Router AX3000",
    shortDescription: "A wireless router for a small office.",
    description: "Dual-band wireless connectivity for office networks.",
    overview: "A compact office router grounded in canonical Product content.",
    specifications: [{ name: "Wireless standard", value: "AX3000" }],
  },
} as never;

assert.deepEqual(__controlledActionTest.parseChanges({ changes: { shortDescription: "A compact wireless router for a small office." } }, review), { changes: { shortDescription: "A compact wireless router for a small office." } });
assert.throws(() => __controlledActionTest.parseChanges({ changes: { price: "R1" } }, review), (error: unknown) => error instanceof AdminAiControlledActionError && error.code === "INVALID_TOOL_ARGUMENTS");
assert.throws(() => __controlledActionTest.parseChanges({ changes: { overview: "Includes a guaranteed 5 year warranty for every buyer." } }, review), (error: unknown) => error instanceof AdminAiControlledActionError && error.code === "UNSUPPORTED_PRODUCT_CLAIM");
assert.throws(() => __controlledActionTest.parseChanges({ changes: { overview: "Supports 9000 users with canonical enterprise performance." } }, review), (error: unknown) => error instanceof AdminAiControlledActionError && error.code === "UNSUPPORTED_PRODUCT_CLAIM");
assert.equal(__controlledActionTest.editable(review), true);
assert.equal(__controlledActionTest.editable({ ...(review as object), state: "PUBLISHED", hasActiveDraft: false } as never), false);
assert.equal(__controlledActionTest.fingerprint(review), __controlledActionTest.fingerprint(review));
assert.deepEqual(__controlledActionTest.parsePublicationInput({}), {});
assert.throws(() => __controlledActionTest.parsePublicationInput({ price: 1 }), (error: unknown) => error instanceof AdminAiControlledActionError && error.code === "INVALID_TOOL_ARGUMENTS");
assert.deepEqual(__controlledActionTest.publicationBlockers(review), []);
assert.equal(__controlledActionTest.publicationPreview(review).changes[0].after, "PUBLISHED");
assert.match(__controlledActionTest.publicationPreview(review).warnings.join(" "), /Human confirmation required/);
assert.ok(__controlledActionTest.publicationBlockers({ ...(review as object), eligibility: { canPublish: false, blockers: ["IMAGE_REQUIRED"], warnings: [] } } as never).includes("IMAGE_REQUIRED"));
assert.ok(__controlledActionTest.publicationBlockers({ ...(review as object), state: "PUBLISHED", hasUnpublishedChanges: false } as never).includes("NO_PUBLIC_CHANGES"));

const superAdmin = createStaffAuthorizationContext({ actorId: "staff-fixture", actorLabel: "Staff fixture", profile: { baseRole: "SUPER_ADMIN", grantedPermissions: [], revokedPermissions: [] } });
const noProductEditor = createStaffAuthorizationContext({ actorId: "staff-support", actorLabel: "Support fixture", profile: { baseRole: "SUPPORT", grantedPermissions: ["admin_ai.use"], revokedPermissions: [] } });
const enabledAccess = async () => ({ environmentEnabled: true, globalEnabled: true, hasPermission: true, effective: true });
const disabledAccess = async () => ({ environmentEnabled: true, globalEnabled: false, hasPermission: true, effective: false, denialReason: "GLOBAL_DISABLED" as const });
const toolDeps = { access: enabledAccess as never, getReview: async () => review as never, saveDraft: async () => { throw new Error("not invoked"); }, audit: async () => { throw new Error("not invoked"); }, countActions: async () => 0, evaluatePolicy: async () => ({ allowed: true }), enforceExecutionLimit: async () => undefined };
const productAttachment = [{ contextType: "PRODUCT" as const, resourceId: "product-fixture", attachedAt: new Date().toISOString() }];
assert.deepEqual((await availableAdminAiTools({ staff: superAdmin, attachments: productAttachment, deps: toolDeps as never })).map((item) => item.name), ["product_draft_update", "product_publish"]);
assert.deepEqual(await availableAdminAiTools({ staff: superAdmin, attachments: [], deps: toolDeps as never }), []);
assert.deepEqual(await availableAdminAiTools({ staff: noProductEditor, attachments: productAttachment, deps: toolDeps as never }), []);
assert.deepEqual(await availableAdminAiTools({ staff: superAdmin, attachments: productAttachment, deps: { ...toolDeps, access: disabledAccess } as never }), []);
await assert.rejects(() => prepareAdminAiAction({ ownerStaffId: "staff-support", conversationId: "conversation-fixture", turnId: "turn-fixture", staff: noProductEditor, attachments: productAttachment, toolCall: { id: "call-1", name: "product_draft_update", input: { changes: { overview: "A safe grounded Product overview for review." } } }, deps: toolDeps as never }), /permission/i);
await assert.rejects(() => prepareAdminAiAction({ ownerStaffId: "staff-fixture", conversationId: "conversation-fixture", turnId: "turn-fixture", staff: superAdmin, attachments: productAttachment, toolCall: { id: "call-off", name: "product_draft_update", input: { changes: { overview: "A safe grounded Product overview for review." } } }, deps: { ...toolDeps, access: disabledAccess } as never }), (error: unknown) => (error as { code?: string }).code === "GLOBAL_DISABLED");
await assert.rejects(() => prepareAdminAiAction({ ownerStaffId: "staff-fixture", conversationId: "conversation-fixture", turnId: "turn-fixture", staff: superAdmin, attachments: productAttachment, toolCall: { id: "call-2", name: "unknown_tool", input: {} }, deps: toolDeps as never }), (error: unknown) => error instanceof AdminAiControlledActionError && error.code === "UNKNOWN_ADMIN_AI_TOOL");

const source = await readFile(join(process.cwd(), "backend/adminAi/controlledActions.ts"), "utf8");
for (const forbidden of ["approve_pricing", "create_order", "refund", "supplier_order", "modify_permissions", "delete_record"]) assert.equal(source.includes(`id: "${forbidden}"`), false);
assert.match(source, /10 \* 60_000/);
assert.match(source, /claimActionConfirmation/);
assert.match(source, /Origin[\s\S]*ADMIN_AI/);
console.log("Admin AI controlled action tests passed.");

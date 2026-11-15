import assert from "node:assert/strict";
import pg from "pg";
import {
  AdminAiActionUnavailableError,
  cancelActionForOwner,
  claimActionConfirmation,
  createPreparedAction,
  getActionByTurn,
  getActionForOwner,
  listActionsForConversation,
  markActionFailed,
  markActionSucceeded,
} from "../adminAi/actionRepository.js";
import {
  appendAdminAiUserTurn,
  completeAdminAiAssistantTurn,
  createAdminAiConversation,
  deleteAdminAiConversation,
} from "../adminAi/conversationRepository.js";
import { closePostgres, query, runMigrations } from "../persistence/postgres.js";

let databaseUrl = process.env.DATABASE_URL;
if (databaseUrl && !/_test(?:\?|$)/.test(new URL(databaseUrl).pathname) && process.env.RUN_ADMIN_AI_ACTION_POSTGRES_INTEGRATION === "1") {
  const source = new URL(databaseUrl);
  const baseName = source.pathname.slice(1);
  const testName = `${baseName}_h69_test`;
  if (!/^[a-zA-Z0-9_]+$/.test(testName)) throw new Error("Derived test database name is invalid.");
  const adminUrl = new URL(source);
  adminUrl.pathname = "/postgres";
  const client = new pg.Client({ connectionString: adminUrl.toString(), ssl: process.env.DATABASE_SSL_MODE === "require" ? { rejectUnauthorized: false } : false });
  await client.connect();
  try {
    await client.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [testName]);
    await client.query(`DROP DATABASE IF EXISTS "${testName}"`);
    await client.query(`CREATE DATABASE "${testName}"`);
  } finally {
    await client.end();
  }
  source.pathname = `/${testName}`;
  databaseUrl = source.toString();
  process.env.DATABASE_URL = databaseUrl;
}
if (!databaseUrl || !/_test(?:\?|$)/.test(new URL(databaseUrl).pathname)) {
  throw new Error("Admin AI action persistence integration requires an isolated *_test PostgreSQL database.");
}

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const ownerA = `admin-ai-action-owner-a-${suffix}`;
const ownerB = `admin-ai-action-owner-b-${suffix}`;
const origin = new Date("2026-11-13T08:00:00.000Z");
const unavailable = (operation: () => Promise<unknown>) => assert.rejects(
  operation,
  (error: unknown) => error instanceof AdminAiActionUnavailableError,
);

async function createCompletedTurn(ownerStaffId: string, conversationId: string, key: string, offsetMs: number) {
  const created = await appendAdminAiUserTurn(
    ownerStaffId,
    conversationId,
    { content: `Prepare bounded action ${key}`, idempotencyKey: key },
    new Date(origin.getTime() + offsetMs),
  );
  await completeAdminAiAssistantTurn(
    ownerStaffId,
    conversationId,
    created.userMessage.turnId,
    "A safe confirmation preview is ready.",
    {},
    new Date(origin.getTime() + offsetMs + 100),
  );
  return created.userMessage.turnId;
}

function preparedInput(ownerStaffId: string, conversationId: string, turnId: string, offsetMs: number) {
  return {
    ownerStaffId,
    conversationId,
    turnId,
    toolId: "product_draft_update",
    targetType: "PRODUCT",
    targetId: "product-safe-fixture",
    safeInput: { fields: { publicTitle: "Safer public title" } },
    safePreview: {
      actionLabel: "Update Product draft",
      targetLabel: "Safe fixture Product",
      changes: [{ field: "publicTitle", before: "Old title", after: "Safer public title" }],
      warnings: [],
    },
    baselineFingerprint: "product-draft-revision-17",
    requiredPermission: "products.edit",
    riskLevel: "MEDIUM" as const,
    expiresAt: new Date(origin.getTime() + offsetMs + 10 * 60_000),
  };
}

function highRiskPublicationInput(ownerStaffId: string, conversationId: string, turnId: string, offsetMs: number) {
  return {
    ...preparedInput(ownerStaffId, conversationId, turnId, offsetMs),
    toolId: "product_publish",
    safeInput: {},
    safePreview: {
      actionLabel: "Publish Product",
      targetLabel: "Safe fixture Product",
      changes: [
        { field: "publicationState", label: "Publication state", before: "UNPUBLISHED", after: "PUBLISHED" },
      ],
      warnings: ["HIGH risk. Human confirmation is required."],
    },
    baselineFingerprint: "publication-readiness-draft-price-version-17",
    requiredPermission: "products.publish",
    riskLevel: "HIGH" as const,
  };
}

try {
  const firstMigration = await runMigrations();
  assert.equal(firstMigration.executed.includes("0012_admin_ai_actions.sql") || firstMigration.executed.includes("0013_admin_ai_automation_foundation.sql") || firstMigration.executed.length === 0, true);
  const rerun = await runMigrations();
  assert.deepEqual(rerun.executed, [], "migration runner must not reapply an applied migration");

  for (const [id, email] of [[ownerA, `${ownerA}@example.test`], [ownerB, `${ownerB}@example.test`]]) {
    await query(
      "INSERT INTO staff_accounts(id,email,normalized_email,display_name,status,base_role,created_at,updated_at) VALUES($1,$2,$2,$3,'ACTIVE','SUPER_ADMIN',$4,$4)",
      [id, email, id, origin.toISOString()],
    );
  }

  const conversationA = await createAdminAiConversation(ownerA, "Action owner A", origin);
  const conversationB = await createAdminAiConversation(ownerB, "Action owner B", new Date(origin.getTime() + 1));
  const turnA = await createCompletedTurn(ownerA, conversationA.id, "action-turn-a", 1_000);
  const turnB = await createCompletedTurn(ownerB, conversationB.id, "action-turn-b", 2_000);
  const action = await createPreparedAction(preparedInput(ownerA, conversationA.id, turnA, 1_000), new Date(origin.getTime() + 3_000));

  assert.match(action.id, /^admin-ai-action-/);
  assert.equal(action.state, "AWAITING_CONFIRMATION");
  assert.equal(action.originType, "CHAT");
  assert.equal(action.baselineFingerprint, "product-draft-revision-17");
  assert.deepEqual(action.safeInput, { fields: { publicTitle: "Safer public title" } });
  assert.equal((await getActionForOwner(ownerA, action.id, new Date(origin.getTime() + 3_010)))?.id, action.id);
  assert.equal(await getActionForOwner(ownerB, action.id, new Date(origin.getTime() + 3_010)), undefined);
  await unavailable(() => cancelActionForOwner(ownerB, action.id, new Date(origin.getTime() + 3_010)));
  await unavailable(() => claimActionConfirmation(ownerB, action.id, "foreign-confirmation", new Date(origin.getTime() + 3_010)));
  assert.deepEqual((await listActionsForConversation(ownerA, conversationA.id, 50, new Date(origin.getTime() + 3_010))).map((item) => item.id), [action.id]);
  await unavailable(() => listActionsForConversation(ownerB, conversationA.id, 50, new Date(origin.getTime() + 3_010)));
  await unavailable(() => createPreparedAction(preparedInput(ownerA, conversationB.id, turnB, 3_000), new Date(origin.getTime() + 3_010)));
  await unavailable(() => createPreparedAction(preparedInput(ownerA, conversationA.id, turnB, 3_000), new Date(origin.getTime() + 3_010)));

  const replay = await createPreparedAction({
    ...preparedInput(ownerA, conversationA.id, turnA, 1_000),
    safeInput: { fields: { publicTitle: "Ignored replay" } },
  }, new Date(origin.getTime() + 3_100));
  assert.equal(replay.id, action.id);
  assert.deepEqual(replay.safeInput, action.safeInput, "replayed preparation cannot rewrite the persisted action");

  const concurrentTurn = await createCompletedTurn(ownerA, conversationA.id, "concurrent-create", 4_000);
  const concurrentInput = preparedInput(ownerA, conversationA.id, concurrentTurn, 4_000);
  const concurrentCreates = await Promise.all([
    createPreparedAction(concurrentInput, new Date(origin.getTime() + 4_200)),
    createPreparedAction(concurrentInput, new Date(origin.getTime() + 4_201)),
  ]);
  assert.equal(concurrentCreates[0].id, concurrentCreates[1].id);
  assert.equal(Number((await query<{ count: string }>(
    "SELECT count(*)::text count FROM admin_ai_actions WHERE conversation_id=$1 AND turn_id=$2",
    [conversationA.id, concurrentTurn],
  )).rows[0].count), 1);

  const confirmationResults = await Promise.all([
    claimActionConfirmation(ownerA, action.id, "execution-request-a", new Date(origin.getTime() + 5_000)),
    claimActionConfirmation(ownerA, action.id, "execution-request-b", new Date(origin.getTime() + 5_001)),
  ]);
  assert.equal(confirmationResults.filter((result) => result.claimed).length, 1, "exactly one confirmation may claim execution");
  assert.equal(confirmationResults.filter((result) => !result.claimed).length, 1);
  const executing = confirmationResults.find((result) => result.claimed)!.action;
  assert.equal(executing.state, "EXECUTING");
  assert.equal(executing.confirmedByStaffId, ownerA);
  const succeeded = await markActionSucceeded(ownerA, action.id, { outcome: "DRAFT_UPDATED", changedFields: ["publicTitle"] }, new Date(origin.getTime() + 6_000));
  assert.equal(succeeded.state, "SUCCEEDED");
  assert.deepEqual(succeeded.safeResult, { outcome: "DRAFT_UPDATED", changedFields: ["publicTitle"] });
  assert.equal((await claimActionConfirmation(ownerA, action.id, "execution-request-c", new Date(origin.getTime() + 7_000))).claimed, false);

  const cancelledTurn = await createCompletedTurn(ownerA, conversationA.id, "cancel-action", 8_000);
  const cancelledAction = await createPreparedAction(preparedInput(ownerA, conversationA.id, cancelledTurn, 8_000), new Date(origin.getTime() + 8_200));
  assert.equal((await cancelActionForOwner(ownerA, cancelledAction.id, new Date(origin.getTime() + 8_300))).state, "CANCELLED");
  assert.equal((await cancelActionForOwner(ownerA, cancelledAction.id, new Date(origin.getTime() + 8_400))).state, "CANCELLED");
  assert.equal((await claimActionConfirmation(ownerA, cancelledAction.id, "cancelled-confirm", new Date(origin.getTime() + 8_500))).claimed, false);

  const expiredTurn = await createCompletedTurn(ownerA, conversationA.id, "expire-action", 9_000);
  const expiryInput = preparedInput(ownerA, conversationA.id, expiredTurn, 9_000);
  expiryInput.expiresAt = new Date(origin.getTime() + 9_500);
  const expiring = await createPreparedAction(expiryInput, new Date(origin.getTime() + 9_100));
  const expiredClaim = await claimActionConfirmation(ownerA, expiring.id, "expired-confirm", new Date(origin.getTime() + 9_500));
  assert.equal(expiredClaim.claimed, false);
  assert.equal(expiredClaim.action.state, "EXPIRED");

  const failedTurn = await createCompletedTurn(ownerA, conversationA.id, "fail-action", 10_000);
  const failing = await createPreparedAction(preparedInput(ownerA, conversationA.id, failedTurn, 10_000), new Date(origin.getTime() + 10_200));
  assert.equal((await claimActionConfirmation(ownerA, failing.id, "failure-request", new Date(origin.getTime() + 10_300))).claimed, true);
  const failed = await markActionFailed(ownerA, failing.id, "CANONICAL_TARGET_STALE", { outcome: "NOT_APPLIED" }, new Date(origin.getTime() + 10_400));
  assert.equal(failed.state, "FAILED");
  assert.equal(failed.failureCode, "CANONICAL_TARGET_STALE");
  assert.deepEqual(failed.safeResult, { outcome: "NOT_APPLIED" });
  assert.equal((await getActionByTurn(ownerA, conversationA.id, failedTurn, new Date(origin.getTime() + 10_500)))?.id, failing.id);

  const highRiskTurn = await createCompletedTurn(ownerA, conversationA.id, "high-risk-publication", 10_600);
  const highRiskAction = await createPreparedAction(highRiskPublicationInput(ownerA, conversationA.id, highRiskTurn, 10_600), new Date(origin.getTime() + 10_800));
  assert.equal(highRiskAction.toolId, "product_publish");
  assert.equal(highRiskAction.riskLevel, "HIGH");
  assert.equal(highRiskAction.requiredPermission, "products.publish");
  assert.equal(highRiskAction.state, "AWAITING_CONFIRMATION");
  const highRiskClaims = await Promise.all([
    claimActionConfirmation(ownerA, highRiskAction.id, "high-risk-confirm-a", new Date(origin.getTime() + 10_900)),
    claimActionConfirmation(ownerA, highRiskAction.id, "high-risk-confirm-b", new Date(origin.getTime() + 10_901)),
  ]);
  assert.equal(highRiskClaims.filter((result) => result.claimed).length, 1, "a HIGH-risk action may be claimed exactly once");
  const highRiskCancelled = await markActionFailed(ownerA, highRiskAction.id, "ACCEPTANCE_CANCELLED", { outcome: "NOT_APPLIED" }, new Date(origin.getTime() + 10_950));
  assert.equal(highRiskCancelled.state, "FAILED");
  assert.deepEqual(highRiskCancelled.safeResult, { outcome: "NOT_APPLIED" });
  assert.equal((await claimActionConfirmation(ownerA, highRiskAction.id, "high-risk-confirm-c", new Date(origin.getTime() + 10_960))).claimed, false);

  const highRiskCancelTurn = await createCompletedTurn(ownerA, conversationA.id, "high-risk-cancel", 10_970);
  const highRiskCancelAction = await createPreparedAction(highRiskPublicationInput(ownerA, conversationA.id, highRiskCancelTurn, 10_970), new Date(origin.getTime() + 10_980));
  assert.equal((await cancelActionForOwner(ownerA, highRiskCancelAction.id, new Date(origin.getTime() + 10_990))).state, "CANCELLED");
  assert.equal((await claimActionConfirmation(ownerA, highRiskCancelAction.id, "high-risk-cancelled-confirm", new Date(origin.getTime() + 11_000))).claimed, false);

  const highRiskExpiryTurn = await createCompletedTurn(ownerA, conversationA.id, "high-risk-expiry", 11_010);
  const highRiskExpiryInput = highRiskPublicationInput(ownerA, conversationA.id, highRiskExpiryTurn, 11_010);
  highRiskExpiryInput.expiresAt = new Date(origin.getTime() + 11_100);
  const highRiskExpiryAction = await createPreparedAction(highRiskExpiryInput, new Date(origin.getTime() + 11_050));
  const highRiskExpiredClaim = await claimActionConfirmation(ownerA, highRiskExpiryAction.id, "high-risk-expired-confirm", new Date(origin.getTime() + 11_100));
  assert.equal(highRiskExpiredClaim.claimed, false);
  assert.equal(highRiskExpiredClaim.action.state, "EXPIRED");

  const unsafeTurn = await createCompletedTurn(ownerA, conversationA.id, "unsafe-action", 11_200);
  await assert.rejects(
    () => createPreparedAction({
      ...preparedInput(ownerA, conversationA.id, unsafeTurn, 11_000),
      safeInput: { systemPrompt: "private reasoning and credentials" },
    }, new Date(origin.getTime() + 11_100)),
    /forbidden field/,
  );
  const columns = (await query<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_name='admin_ai_actions' ORDER BY column_name",
  )).rows.map((row) => row.column_name);
  for (const forbiddenColumn of ["reasoning", "reasoning_content", "system_prompt", "raw_request", "raw_response", "provider_payload", "transcript"]) {
    assert.equal(columns.includes(forbiddenColumn), false);
  }

  const constraints = (await query<{ conname: string }>(
    "SELECT conname FROM pg_constraint WHERE conrelid='admin_ai_actions'::regclass",
  )).rows.map((row) => row.conname);
  for (const constraint of [
    "admin_ai_actions_pkey",
    "admin_ai_actions_conversation_owner_fk",
    "admin_ai_actions_confirmation_state",
    "admin_ai_actions_execution_state",
    "admin_ai_actions_failure_state",
    "admin_ai_actions_exact_origin",
    "admin_ai_actions_origin_type",
  ]) assert.equal(constraints.includes(constraint), true, `missing ${constraint}`);
  const indexes = (await query<{ indexname: string }>(
    "SELECT indexname FROM pg_indexes WHERE tablename='admin_ai_actions'",
  )).rows.map((row) => row.indexname);
  for (const index of ["admin_ai_actions_conversation_created_idx", "admin_ai_actions_owner_state_idx", "admin_ai_actions_expiry_idx", "admin_ai_actions_chat_turn_unique_idx", "admin_ai_actions_automation_run_unique_idx"]) {
    assert.equal(indexes.includes(index), true, `missing ${index}`);
  }
  await assert.rejects(
    () => query("UPDATE admin_ai_actions SET state='SUCCEEDED',executed_at=now() WHERE id=$1", [concurrentCreates[0].id]),
    (error: unknown) => (error as { code?: string }).code === "23514",
  );

  const deleteConversation = await createAdminAiConversation(ownerA, "Delete action cascade", new Date(origin.getTime() + 12_000));
  const deleteTurn = await createCompletedTurn(ownerA, deleteConversation.id, "delete-action", 12_100);
  const deleteAction = await createPreparedAction(preparedInput(ownerA, deleteConversation.id, deleteTurn, 12_100), new Date(origin.getTime() + 12_300));
  await deleteAdminAiConversation(ownerA, deleteConversation.id);
  assert.equal(Number((await query<{ count: string }>("SELECT count(*)::text count FROM admin_ai_actions WHERE id=$1", [deleteAction.id])).rows[0].count), 0);

  assert.equal(Number((await query<{ count: string }>(
    "SELECT count(*)::text count FROM admin_audit WHERE entity_type ILIKE '%admin_ai_action%'",
  )).rows[0].count), 0, "action persistence must not create H.2 business audit events");
  console.log("Admin AI action PostgreSQL persistence tests passed.");
} finally {
  await query("DELETE FROM staff_accounts WHERE id=ANY($1::text[])", [[ownerA, ownerB]]).catch(() => undefined);
  await closePostgres();
}

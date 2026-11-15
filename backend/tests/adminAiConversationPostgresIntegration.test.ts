import assert from "node:assert/strict";
import {
  AdminAiConversationNotFoundError,
  appendAdminAiUserTurn,
  attachAdminAiContext,
  completeAdminAiAssistantTurn,
  createAdminAiConversation,
  deleteAdminAiConversation,
  detachAdminAiContext,
  failAdminAiAssistantTurn,
  getAdminAiConversation,
  listAdminAiContextAttachments,
  listAdminAiConversations,
  listAdminAiMessages,
  listAdminAiMessagesNewestPage,
  renameAdminAiConversation,
  retryAdminAiAssistantTurn,
  setAdminAiConversationStatus,
} from "../adminAi/conversationRepository.js";
import { createAdminAiChatConversation, sendAdminAiChat } from "../adminAi/chatService.js";
import { AdminAiService } from "../adminAi/service.js";
import { createStaffAuthorizationContext } from "../staffAuthorization.js";
import { closePostgres, query, runMigrations } from "../persistence/postgres.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !/_test(?:\?|$)/.test(new URL(databaseUrl).pathname)) throw new Error("Admin AI chat persistence integration requires an isolated *_test PostgreSQL database.");

const ownerA = `admin-ai-owner-a-${Date.now()}`;
const ownerB = `admin-ai-owner-b-${Date.now()}`;
const now = new Date("2026-11-09T18:00:00.000Z");
const notFound = (operation: () => Promise<unknown>) => assert.rejects(operation, (error: unknown) => error instanceof AdminAiConversationNotFoundError);

try {
  await runMigrations();
  for (const [id, email] of [[ownerA, `${ownerA}@example.test`], [ownerB, `${ownerB}@example.test`]]) {
    await query("INSERT INTO staff_accounts(id,email,normalized_email,display_name,status,base_role,created_at,updated_at) VALUES($1,$2,$2,$3,'ACTIVE','SUPER_ADMIN',$4,$4)", [id, email, id, now.toISOString()]);
  }

  const conversationA = await createAdminAiConversation(ownerA, "Owner A private conversation", now);
  const conversationB = await createAdminAiConversation(ownerB, "Owner B private conversation", new Date(now.getTime() + 1_000));
  assert.equal((await getAdminAiConversation(ownerA, conversationA.id))?.title, "Owner A private conversation");
  assert.equal(await getAdminAiConversation(ownerB, conversationA.id), undefined);
  assert.deepEqual((await listAdminAiConversations(ownerA)).items.map((item) => item.id), [conversationA.id]);
  assert.deepEqual((await listAdminAiConversations(ownerB)).items.map((item) => item.id), [conversationB.id]);

  await notFound(() => renameAdminAiConversation(ownerB, conversationA.id, "Stolen title"));
  await notFound(() => setAdminAiConversationStatus(ownerB, conversationA.id, "ARCHIVED"));
  await notFound(() => deleteAdminAiConversation(ownerB, conversationA.id));
  await notFound(() => appendAdminAiUserTurn(ownerB, conversationA.id, { content: "Unauthorized", idempotencyKey: "idor-message" }));
  await notFound(() => attachAdminAiContext(ownerB, conversationA.id, "PRODUCT", "private-product"));
  await notFound(() => detachAdminAiContext(ownerB, conversationA.id, "PRODUCT", "private-product"));

  const concurrent = await Promise.allSettled([
    appendAdminAiUserTurn(ownerA, conversationA.id, { content: "First concurrent question", idempotencyKey: "different-turn-a" }, new Date(now.getTime() + 2_000)),
    appendAdminAiUserTurn(ownerA, conversationA.id, { content: "Second concurrent question", idempotencyKey: "different-turn-b" }, new Date(now.getTime() + 3_000)),
  ]);
  assert.equal(concurrent.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(concurrent.filter((item) => item.status === "rejected").length, 1, "only one pending turn may exist per conversation");
  const first = concurrent.find((item): item is PromiseFulfilledResult<Awaited<ReturnType<typeof appendAdminAiUserTurn>>> => item.status === "fulfilled")!.value;
  await completeAdminAiAssistantTurn(ownerA, conversationA.id, first.userMessage.turnId, "First response.");
  const ordered = await listAdminAiMessages(ownerA, conversationA.id, { pageSize: 20 });
  assert.equal(ordered.items.length, 2);
  assert.deepEqual(ordered.items.map((item) => item.sequence), [1, 2]);

  const duplicateKey = "same-concurrent-turn";
  const duplicateResults = await Promise.all([
    appendAdminAiUserTurn(ownerA, conversationA.id, { content: "One logical turn", idempotencyKey: duplicateKey }, new Date(now.getTime() + 4_000)),
    appendAdminAiUserTurn(ownerA, conversationA.id, { content: "One logical turn", idempotencyKey: duplicateKey }, new Date(now.getTime() + 5_000)),
  ]);
  assert.equal(duplicateResults.filter((item) => item.created).length, 1);
  assert.equal(duplicateResults[0].userMessage.id, duplicateResults[1].userMessage.id);
  assert.equal(Number((await query<{ count: string }>("SELECT count(*)::text count FROM admin_ai_messages WHERE conversation_id=$1 AND role='USER' AND idempotency_key=$2", [conversationA.id, duplicateKey])).rows[0].count), 1);

  const failedTurn = duplicateResults[0];
  const failed = await failAdminAiAssistantTurn(ownerA, conversationA.id, failedTurn.userMessage.turnId, { requestedModelRole: "ROUTINE", internalRequestId: "safe-request-failed" });
  assert.equal(failed.generationStatus, "FAILED"); assert.equal(failed.content, undefined);
  assert.equal((await listAdminAiMessages(ownerA, conversationA.id)).items.some((item) => item.id === failedTurn.userMessage.id), true, "provider failure must retain the user message");
  assert.equal((await retryAdminAiAssistantTurn(ownerA, conversationA.id, failedTurn.userMessage.turnId)).generationStatus, "PENDING");

  const providerFixture = { reasoning_content: "never-store-this-private-reasoning", content: "Safe final answer.", usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20, reasoningTokens: 3 } };
  const completed = await completeAdminAiAssistantTurn(ownerA, conversationA.id, failedTurn.userMessage.turnId, providerFixture.content, { requestedModelRole: "ROUTINE", resolvedProvider: "digitalocean", resolvedModel: "fixture-model", ...providerFixture.usage, latencyMs: 42, fallbackUsed: false, internalRequestId: "safe-internal-request", providerRequestId: "safe-provider-request" });
  assert.equal(completed.content, "Safe final answer."); assert.equal(completed.reasoningTokens, 3);
  assert.equal(Number((await query<{ count: string }>("SELECT count(*)::text count FROM admin_ai_messages WHERE content LIKE '%never-store-this-private-reasoning%'", [])).rows[0].count), 0);
  const columns = (await query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name='admin_ai_messages'")).rows.map((row) => row.column_name);
  for (const forbidden of ["reasoning_content", "system_prompt", "raw_request", "raw_response", "provider_payload"]) assert.equal(columns.includes(forbidden), false);

  const attachmentInputs = [["PRODUCT", "product-1"], ["SUPPLIER", "TVR"], ["PRICING_PROPOSAL", "proposal-1"]] as const;
  for (const [type, resourceId] of attachmentInputs) await attachAdminAiContext(ownerA, conversationA.id, type, resourceId, now);
  await attachAdminAiContext(ownerA, conversationA.id, "PRODUCT", "product-1", new Date(now.getTime() + 1_000));
  assert.equal((await listAdminAiContextAttachments(ownerA, conversationA.id)).length, 3);
  await assert.rejects(() => attachAdminAiContext(ownerA, conversationA.id, "PRODUCT", "product-4"), (error: unknown) => (error as { code?: string }).code === "ADMIN_AI_CONTEXT_LIMIT");
  assert.equal(await detachAdminAiContext(ownerA, conversationA.id, "SUPPLIER", "TVR"), true);
  assert.deepEqual((await listAdminAiContextAttachments(ownerA, conversationA.id)).map((item) => item.contextType).sort(), ["PRICING_PROPOSAL", "PRODUCT"]);

  const paginationOwner = ownerA;
  const paginationIds: string[] = [];
  for (let index = 0; index < 23; index += 1) paginationIds.push((await createAdminAiConversation(paginationOwner, `Pagination ${index}`, new Date(now.getTime() + 10_000 + index))).id);
  const conversationPage1 = await listAdminAiConversations(paginationOwner, { page: 1, pageSize: 10 });
  const conversationPage2 = await listAdminAiConversations(paginationOwner, { page: 2, pageSize: 10 });
  assert.equal(conversationPage1.items.length, 10); assert.equal(conversationPage2.items.length, 10);
  assert.equal(new Set([...conversationPage1.items, ...conversationPage2.items].map((item) => item.id)).size, 20);
  assert.equal(conversationPage1.totalItems, 24); assert.equal(conversationPage1.totalPages, 3);
  const messagePage1 = await listAdminAiMessages(ownerA, conversationA.id, { page: 1, pageSize: 2 });
  const messagePage2 = await listAdminAiMessages(ownerA, conversationA.id, { page: 2, pageSize: 2 });
  assert.deepEqual(messagePage1.items.map((item) => item.sequence), [1, 2]); assert.deepEqual(messagePage2.items.map((item) => item.sequence), [3, 4]);
  const newestPage = await listAdminAiMessagesNewestPage(ownerA, conversationA.id, { page: 1, pageSize: 2 });
  assert.deepEqual(newestPage.items.map((item) => item.sequence), [3, 4]);

  await setAdminAiConversationStatus(ownerA, conversationA.id, "ARCHIVED", new Date(now.getTime() + 20_000));
  assert.equal((await listAdminAiConversations(ownerA)).items.some((item) => item.id === conversationA.id), false);
  assert.equal((await getAdminAiConversation(ownerA, conversationA.id))?.status, "ARCHIVED");
  assert.equal((await listAdminAiConversations(ownerA, { status: "ARCHIVED" })).items.some((item) => item.id === conversationA.id), true);

  const deleteTarget = await createAdminAiConversation(ownerA, "Delete with children", now);
  await appendAdminAiUserTurn(ownerA, deleteTarget.id, { content: "Delete this turn", idempotencyKey: "delete-turn" }, now);
  await attachAdminAiContext(ownerA, deleteTarget.id, "PRODUCT", "delete-product", now);
  await deleteAdminAiConversation(ownerA, deleteTarget.id);
  assert.equal(Number((await query<{ count: string }>("SELECT count(*)::text count FROM admin_ai_messages WHERE conversation_id=$1", [deleteTarget.id])).rows[0].count), 0);
  assert.equal(Number((await query<{ count: string }>("SELECT count(*)::text count FROM admin_ai_context_attachments WHERE conversation_id=$1", [deleteTarget.id])).rows[0].count), 0);

  let providerCalls = 0;
  const service = new AdminAiService({
    config: { enabled: true, provider: "digitalocean", apiKey: "test-only", primaryModel: "primary-test", routineModel: "routine-test", baseUrl: "https://inference.do-ai.run", timeoutMs: 20_000, maxOutputTokens: 1_200 },
    provider: { id: "digitalocean", async generate(request) { providerCalls += 1; return { text: `Read-only answer ${providerCalls}`, provider: "digitalocean", model: request.model, latencyMs: 12, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } }; } },
  });
  const staff = createStaffAuthorizationContext({ actorId: ownerA, actorLabel: "Owner A", profile: { baseRole: "SUPER_ADMIN", grantedPermissions: [], revokedPermissions: [] } });
  const dependencies = {
    access: async () => ({ environmentEnabled: true, globalEnabled: true, hasPermission: true, effective: true }),
    buildContext: async (request: { contextType: "PRODUCT" | "SUPPLIER" | "PRICING_PROPOSAL"; resourceId: string }) => ({ contextType: request.contextType, resourceId: request.resourceId, title: "Current context", provenance: ["Test canonical state"], facts: { current: true } }),
  };
  const earlyConversation = await createAdminAiChatConversation({ ownerStaffId: ownerA, titleSeed: "Start a responsive Product review", staff, environment: { ADMIN_AI_ENABLED: "true" }, dependencies });
  assert.equal((await getAdminAiConversation(ownerA, earlyConversation.id))?.title, "Start a responsive Product review");
  await deleteAdminAiConversation(ownerA, earlyConversation.id);
  const sent = await sendAdminAiChat({ ownerStaffId: ownerA, content: "Explain current operations", idempotencyKey: "chat-service-idempotency", staff, service, environment: { ADMIN_AI_ENABLED: "true" }, dependencies });
  assert.equal(sent.assistantMessage.generationStatus, "COMPLETED"); assert.equal(providerCalls, 1);
  const duplicate = await sendAdminAiChat({ ownerStaffId: ownerA, conversationId: sent.conversation.id, content: "Explain current operations", idempotencyKey: "chat-service-idempotency", staff, service, environment: { ADMIN_AI_ENABLED: "true" }, dependencies });
  assert.equal(duplicate.userMessage.id, sent.userMessage.id); assert.equal(providerCalls, 1, "idempotent replay must not invoke the provider again");

  assert.equal(Number((await query<{ count: string }>("SELECT count(*)::text count FROM admin_audit WHERE entity_type ILIKE '%admin_ai%'", [])).rows[0].count), 0, "chat persistence must not create H.2 business audit events");
  console.log("Admin AI conversation PostgreSQL persistence tests passed.");
} finally {
  await query("DELETE FROM staff_accounts WHERE id=ANY($1::text[])", [[ownerA, ownerB]]).catch(() => undefined);
  await closePostgres();
}

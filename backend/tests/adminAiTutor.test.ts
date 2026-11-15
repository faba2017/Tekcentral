import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AdminAiService } from "../adminAi/service.js";
import { explainAdminAiTutorTopic, getAdminAiTutorContext, permittedAdminAiTutorTopics, setAdminAiTutorStorePathForTests, updateAdminAiTutorPreference } from "../adminAi/tutor.js";
import { createStaffAuthorizationContext } from "../staffAuthorization.js";
import type { StaffPermission } from "../staffRbac.js";
import type { AdminAiProviderRequest } from "../adminAi/types.js";

const temporary = await mkdtemp(join(tmpdir(), "tekcentral-admin-ai-tutor-"));
const storePath = join(temporary, "tutor.json");
setAdminAiTutorStorePathForTests(storePath);
const context = (id: string, baseRole: "SUPER_ADMIN" | "SUPPORT" | "AUDITOR", grantedPermissions: StaffPermission[] = [], revokedPermissions: StaffPermission[] = []) => createStaffAuthorizationContext({ actorId: id, actorLabel: id, profile: { baseRole, grantedPermissions, revokedPermissions } });
const access = async (effective: boolean) => ({ environmentEnabled: effective, globalEnabled: effective, hasPermission: effective, effective, denialReason: effective ? undefined : "GLOBAL_DISABLED" as const });

try {
  const support = context("support", "SUPPORT", ["admin_ai.use"]);
  const supportTopics = permittedAdminAiTutorTopics(support.permissions);
  assert.equal(supportTopics.some((topic) => topic.id === "administration"), false);
  assert.equal(supportTopics.find((topic) => topic.id === "commerce")?.route, "/admin/orders");

  const overridden = context("override", "SUPPORT", ["admin_ai.use", "products.read"], ["orders.read"]);
  const overrideTopics = permittedAdminAiTutorTopics(overridden.permissions);
  assert.equal(overrideTopics.some((topic) => topic.id === "catalogue"), true);
  assert.equal(overrideTopics.find((topic) => topic.id === "commerce")?.route, "/admin/returns");

  const almostEmpty = { actorType: "STAFF_USER" as const, actorId: "minimal", actorLabel: "Minimal", role: "AUDITOR" as const, permissions: new Set<StaffPermission>(["admin_ai.use"]), provisional: false };
  assert.deepEqual(permittedAdminAiTutorTopics(almostEmpty.permissions).map((topic) => topic.id), ["welcome", "admin-ai", "finish"]);

  const owner = context("owner", "SUPER_ADMIN");
  let view = await getAdminAiTutorContext(owner, { ADMIN_AI_ENABLED: "false" });
  assert.equal(view.preference.status, "NOT_STARTED");
  assert.equal(view.invitation, false);
  await updateAdminAiTutorPreference(owner, { action: "START" }, new Date("2026-11-09T08:00:00Z"));
  await updateAdminAiTutorPreference(owner, { action: "PROGRESS", topicId: "catalogue" }, new Date("2026-11-09T08:01:00Z"));
  view = await getAdminAiTutorContext(owner, { ADMIN_AI_ENABLED: "false" });
  assert.equal(view.preference.status, "IN_PROGRESS");
  assert.equal(view.preference.currentTopicId, "catalogue");

  const revokedOwner = context("owner", "SUPER_ADMIN", [], ["products.read", "merchandising.read"]);
  const reconciled = await getAdminAiTutorContext(revokedOwner, { ADMIN_AI_ENABLED: "false" });
  assert.equal(reconciled.topics.some((topic) => topic.id === "catalogue"), false);
  assert.notEqual(reconciled.preference.currentTopicId, "catalogue");

  await updateAdminAiTutorPreference(owner, { action: "SKIP" }, new Date("2026-11-09T08:02:00Z"));
  assert.equal((await getAdminAiTutorContext(owner, { ADMIN_AI_ENABLED: "false" })).preference.status, "SKIPPED");
  await updateAdminAiTutorPreference(owner, { action: "RESTART" }, new Date("2026-11-09T08:03:00Z"));
  await updateAdminAiTutorPreference(owner, { action: "COMPLETE" }, new Date("2026-11-09T08:04:00Z"));
  assert.equal((await getAdminAiTutorContext(owner, { ADMIN_AI_ENABLED: "false" })).preference.status, "COMPLETED");

  let calls = 0; let providerRequest: AdminAiProviderRequest | undefined;
  const service = new AdminAiService({ config: { enabled: true, provider: "digitalocean", apiKey: "not-a-real-secret", primaryModel: "primary", routineModel: "routine", baseUrl: "https://inference.do-ai.run", timeoutMs: 20_000, maxOutputTokens: 1_200 }, provider: { id: "digitalocean", async generate(request) { calls += 1; providerRequest = request; return { text: "<script>alert('no')</script> Use the trusted catalogue tools shown.", provider: "digitalocean", model: request.model, latencyMs: 1 }; } } });
  const generated = await explainAdminAiTutorTopic({ context: owner, topicId: "catalogue", service, resolveAccess: () => access(true) });
  assert.equal(calls, 1); assert.equal(providerRequest?.modelRole, "ROUTINE"); assert.equal(providerRequest?.contextBlocks.some((block) => block.content.includes("password")), false); assert.match(generated.text, /<script>/);
  await assert.rejects(() => explainAdminAiTutorTopic({ context: almostEmpty, topicId: "catalogue", service, resolveAccess: () => access(true) }), (error: unknown) => (error as { code?: string }).code === "TUTOR_TOPIC_NOT_AVAILABLE");
  assert.equal(calls, 1);
  await assert.rejects(() => explainAdminAiTutorTopic({ context: owner, topicId: "catalogue", service, resolveAccess: () => access(false) }), (error: unknown) => (error as { code?: string }).code === "GLOBAL_DISABLED");
  assert.equal(calls, 1);

  const ui = await readFile("src/components/admin/AdminAiTutor.tsx", "utf8");
  assert.equal(ui.includes("dangerouslySetInnerHTML"), false);
  assert.match(ui, /Not now/); assert.match(ui, /Skip tour/); assert.match(ui, /Help/);
  const persisted = JSON.parse(await readFile(storePath, "utf8")) as { staff: Record<string, { status: string }> };
  assert.equal(persisted.staff.owner.status, "COMPLETED");
} finally {
  setAdminAiTutorStorePathForTests(undefined);
  await rm(temporary, { recursive: true, force: true });
}

console.log("Admin AI tutor tests passed.");

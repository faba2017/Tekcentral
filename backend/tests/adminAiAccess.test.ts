import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertAdminAiAccess, evaluateAdminAiAccess } from "../aiAccessControl.js";

assert.deepEqual(evaluateAdminAiAccess({ environmentEnabled: false, globalEnabled: true, hasPermission: true }), { environmentEnabled: false, globalEnabled: true, hasPermission: true, effective: false, denialReason: "ENVIRONMENT_DISABLED" });
assert.equal(evaluateAdminAiAccess({ environmentEnabled: true, globalEnabled: false, hasPermission: true }).denialReason, "GLOBAL_DISABLED");
assert.equal(evaluateAdminAiAccess({ environmentEnabled: true, globalEnabled: true, hasPermission: false }).denialReason, "PERMISSION_DENIED");
assert.equal(evaluateAdminAiAccess({ environmentEnabled: true, globalEnabled: true, hasPermission: true }).effective, true);

const context = { permissions: new Set(["admin_ai.use"] as const) };
let providerCalls = 0;
await assert.rejects(() => assertAdminAiAccess(context, async () => { providerCalls += 1; return "unsafe"; }, {}, async () => evaluateAdminAiAccess({ environmentEnabled: true, globalEnabled: false, hasPermission: true })), (error: unknown) => (error as { code?: string }).code === "GLOBAL_DISABLED");
assert.equal(providerCalls, 0, "Global OFF must prevent provider invocation");
const result = await assertAdminAiAccess(context, async () => { providerCalls += 1; return "allowed"; }, {}, async () => evaluateAdminAiAccess({ environmentEnabled: true, globalEnabled: true, hasPermission: true }));
assert.equal(result, "allowed");
assert.equal(providerCalls, 1);

const repository = await readFile("backend/businessSettingsRepository.ts", "utf8");
assert.match(repository, /key: "adminAiEnabled"[\s\S]*defaultValue: "false"/);
assert.match(repository, /key: "zeusEnabled"[\s\S]*defaultValue: "true"/);
const server = await readFile("backend/server.ts", "utf8");
assert.match(server, /staffAuditActor\(staff!\.context\)/);
assert.doesNotMatch(server, /body\.(?:actor|actorId|actorLabel|actorRole)/);
const zeus = await readFile("backend/zeus/service.ts", "utf8");
assert.match(zeus, /getAiMasterSwitches/);
const page = await readFile("src/pages/admin/AdminAiAssistantSettingsPage.tsx", "utf8");
assert.match(page, /AI & Assistant/);
assert.match(page, /admin_ai\.use/);

console.log("Admin AI access-control tests passed.");

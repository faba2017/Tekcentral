import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createStaffAuthorizationContext } from "../staffAuthorization.js";
import { adminAiToolRegistryDto } from "../adminAi/controlledActions.js";
import { ADMIN_AI_AUTONOMY, DEFAULT_PLATFORM_ADMIN_AI_POLICY, DEFAULT_STAFF_ADMIN_AI_POLICY, __adminAiPolicyTest, enforceAdminAiRequestPolicy, evaluateAdminAiToolPolicy, minimumAutonomy, validateAdminAiPolicy } from "../adminAi/policy.js";
import { readAdminAiPolicy, setAdminAiPolicyStorePathForTests, writeAdminAiPolicy } from "../adminAi/policyRepository.js";

assert.deepEqual(ADMIN_AI_AUTONOMY, ["OFF", "OBSERVE", "SUGGEST", "PREPARE", "AUTO"]);
assert.equal(minimumAutonomy("AUTO", "PREPARE"), "PREPARE");
assert.equal(__adminAiPolicyTest.insideWindow({ enabled: true, start: "08:00", end: "17:00", timezone: "Africa/Johannesburg" }, new Date("2026-11-13T10:00:00+02:00")), true);
assert.equal(__adminAiPolicyTest.insideWindow({ enabled: true, start: "08:00", end: "17:00", timezone: "Africa/Johannesburg" }, new Date("2026-11-13T20:00:00+02:00")), false);

const tool = adminAiToolRegistryDto().find((item) => item.id === "product_draft_update")!;
const highRiskTool = adminAiToolRegistryDto().find((item) => item.id === "product_publish")!;
const policy = (autonomy: "OFF"|"OBSERVE"|"SUGGEST"|"PREPARE", maxRisk: "LOW"|"MEDIUM"|"HIGH"="MEDIUM", hours = false, selectedTool = tool) => ({ ...DEFAULT_PLATFORM_ADMIN_AI_POLICY, maxRisk, operatingWindow: { ...DEFAULT_PLATFORM_ADMIN_AI_POLICY.operatingWindow, enabled: hours }, tools: { [selectedTool.id]: { enabled: autonomy !== "OFF", autonomy } } });
assert.throws(() => validateAdminAiPolicy({ ...policy("PREPARE"), tools: { [tool.id]: { enabled: true, autonomy: "AUTO" } } }, [tool], "platform"), (error: unknown) => (error as { code?: string }).code === "TOOL_AUTONOMY_EXCEEDS_CEILING");
assert.equal(validateAdminAiPolicy(policy("PREPARE", "HIGH", false, highRiskTool), [highRiskTool], "platform").maxRisk, "HIGH");
assert.throws(() => validateAdminAiPolicy({ ...policy("PREPARE", "HIGH", false, highRiskTool), tools: { [highRiskTool.id]: { enabled: true, autonomy: "AUTO" } } }, [highRiskTool], "platform"), (error: unknown) => (error as { code?: string }).code === "TOOL_AUTONOMY_EXCEEDS_CEILING");

const staff = createStaffAuthorizationContext({ actorId: "staff-a", actorLabel: "Staff A", profile: { baseRole: "SUPER_ADMIN", grantedPermissions: [], revokedPermissions: [] } });
const bundle = (platform = policy("PREPARE"), staffPolicy = policy("PREPARE")) => async () => ({ platform: { revision: 1, policy: platform }, staff: { revision: 1, policy: staffPolicy }, tools: [tool] });
const access = async () => ({ environmentEnabled: true, globalEnabled: true, hasPermission: true, effective: true });
let result = await evaluateAdminAiToolPolicy({ staff, tool, requestedBehavior: "PREPARE", deps: { access: access as never, bundle: bundle() as never } }); assert.equal(result.allowed, true); assert.equal(result.effectiveAutonomy, "PREPARE");
result = await evaluateAdminAiToolPolicy({ staff, tool, requestedBehavior: "PREPARE", deps: { access: access as never, bundle: bundle(policy("PREPARE"), policy("SUGGEST")) as never } }); assert.equal(result.allowed, false); assert.ok(result.denialReasons.includes("AUTONOMY_TOO_LOW"));
result = await evaluateAdminAiToolPolicy({ staff, tool, requestedBehavior: "OBSERVE", deps: { access: access as never, bundle: bundle(policy("OBSERVE"), policy("OBSERVE")) as never } }); assert.equal(result.allowed, true);
result = await evaluateAdminAiToolPolicy({ staff, tool, requestedBehavior: "PREPARE", deps: { access: access as never, bundle: bundle(policy("PREPARE", "LOW"), policy("PREPARE")) as never } }); assert.ok(result.denialReasons.includes("RISK_EXCEEDS_LIMIT"));
result = await evaluateAdminAiToolPolicy({ staff, tool, requestedBehavior: "PREPARE", preparedActionsLastHour: 10, deps: { access: access as never, bundle: bundle() as never } }); assert.ok(result.denialReasons.includes("ACTION_RATE_LIMIT"));
result = await evaluateAdminAiToolPolicy({ staff, tool, requestedBehavior: "PREPARE", now: new Date("2026-11-13T20:00:00+02:00"), deps: { access: access as never, bundle: bundle(policy("PREPARE", "MEDIUM", true), policy("PREPARE")) as never } }); assert.ok(result.denialReasons.includes("OUTSIDE_OPERATING_HOURS"));
const highBundle = async () => ({ platform: { revision: 1, policy: policy("PREPARE", "HIGH", false, highRiskTool) }, staff: { revision: 1, policy: policy("PREPARE", "HIGH", false, highRiskTool) }, tools: [highRiskTool] });
result = await evaluateAdminAiToolPolicy({ staff, tool: highRiskTool, requestedBehavior: "AUTO", deps: { access: access as never, bundle: highBundle as never } }); assert.equal(result.allowed, false); assert.equal(result.effectiveAutonomy, "PREPARE"); assert.ok(result.denialReasons.includes("AUTONOMY_TOO_LOW"));
result = await evaluateAdminAiToolPolicy({ staff, tool: highRiskTool, requestedBehavior: "PREPARE", deps: { access: access as never, bundle: highBundle as never } }); assert.equal(result.allowed, true); assert.equal(result.riskAllowed, true);

const noEdit = createStaffAuthorizationContext({ actorId: "staff-b", actorLabel: "Staff B", profile: { baseRole: "SUPPORT", grantedPermissions: ["admin_ai.use"], revokedPermissions: [] } });
result = await evaluateAdminAiToolPolicy({ staff: noEdit, tool, requestedBehavior: "PREPARE", deps: { access: access as never, bundle: bundle() as never } }); assert.ok(result.denialReasons.includes("PERMISSION_DENIED"));

const directory = await mkdtemp(join(tmpdir(), "admin-ai-policy-")); setAdminAiPolicyStorePathForTests(join(directory, "policies.json"));
const saved = await writeAdminAiPolicy("platform", 0, policy("PREPARE"), "Super Admin"); assert.equal(saved.revision, 1); assert.equal((await readAdminAiPolicy("platform"))?.revision, 1);
const staffPrepare = await writeAdminAiPolicy("staff-a", 0, policy("PREPARE"), "Super Admin"); assert.equal(staffPrepare.revision, 1); assert.deepEqual((await readAdminAiPolicy<ReturnType<typeof policy>>("staff-a"))?.policy.tools[tool.id], { enabled: true, autonomy: "PREPARE" });
const noOp = await writeAdminAiPolicy("staff-a", 1, policy("PREPARE"), "Super Admin"); assert.equal(noOp.revision, 1); assert.equal(noOp.changed, false);
const staffSuggest = await writeAdminAiPolicy("staff-a", 1, policy("SUGGEST"), "Super Admin"); assert.equal(staffSuggest.revision, 2); assert.deepEqual((await readAdminAiPolicy<ReturnType<typeof policy>>("staff-a"))?.policy.tools[tool.id], { enabled: true, autonomy: "SUGGEST" });
await writeAdminAiPolicy("staff-a", 2, policy("PREPARE"), "Super Admin"); assert.deepEqual((await readAdminAiPolicy<ReturnType<typeof policy>>("platform"))?.policy.tools[tool.id], { enabled: true, autonomy: "PREPARE" }); assert.equal(await readAdminAiPolicy("staff-missing"), undefined);
const requestTime = new Date("2026-11-13T10:00:00+02:00"); for (let index = 0; index < 10; index += 1) await enforceAdminAiRequestPolicy(staff, [tool], requestTime); await assert.rejects(() => enforceAdminAiRequestPolicy(staff, [tool], requestTime), (error: unknown) => (error as { code?: string }).code === "REQUEST_RATE_LIMIT");
await assert.rejects(() => writeAdminAiPolicy("platform", 0, policy("OFF"), "Other Admin"), (error: unknown) => (error as { code?: string }).code === "POLICY_REVISION_CONFLICT");
await rm(directory, { recursive: true }); setAdminAiPolicyStorePathForTests();
assert.deepEqual(DEFAULT_STAFF_ADMIN_AI_POLICY.tools, {});
const settingsPage = await readFile("src/pages/admin/AdminAiAssistantSettingsPage.tsx", "utf8"); assert.match(settingsPage, /adminAiPolicyDirty/); assert.match(settingsPage, /disabled=\{busy\|\|!dirty\}/); assert.match(settingsPage, /setPlatformDraft\(copy\(saved\.policy\)\)/); assert.match(settingsPage, /setStaffDraft\(copy\(saved\.policy\)\)/); assert.match(settingsPage, /policyRequest/);
assert.match(settingsPage, /type PendingSave=/);
assert.match(settingsPage, /kind:"staff",revision:policy\.staff\.revision,policy:copy\(staffDraft\),targetStaffId:policy\.target\.id/);
assert.match(settingsPage, /policy\/staff\/\$\{encodeURIComponent\(pending\.targetStaffId\)\}/);
assert.match(settingsPage, /revision:pending\.revision,policy:pending\.policy,confirmHighRisk:true/);
assert.match(settingsPage, /saveLock\.current/);
assert.match(settingsPage, /if\(!busy\)setPendingSave\(undefined\)/);
assert.match(settingsPage, /setPolicy\(current=>current&&current\.target\.id===pending\.targetStaffId\?\{\.\.\.refreshed,platform:current\.platform,staff:saved\}:current\)/);
console.log("Admin AI automation policy tests passed.");

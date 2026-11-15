import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { adminAiToolRegistryDto } from "../adminAi/controlledActions.js";
import {
  DEFAULT_PLATFORM_ADMIN_AI_POLICY,
  DEFAULT_STAFF_ADMIN_AI_POLICY,
  saveStaffAdminAiPolicy,
} from "../adminAi/policy.js";
import { closePostgres, query, runMigrations } from "../persistence/postgres.js";
import { hashStaffPassword, type StaffAccount } from "../staffAuth.js";
import { mutatePostgresStaffStore } from "../persistence/staffRepository.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !/_test(?:\?|$)/.test(new URL(databaseUrl).pathname)) {
  throw new Error("Admin AI policy persistence integration requires an isolated *_test PostgreSQL database.");
}

const staffId = `admin-ai-policy-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const staffKey = `staff:${staffId}`;
const routeStaffId = randomUUID();
const deniedStaffId = randomUUID();
const tools = adminAiToolRegistryDto();
const platformPolicy = {
  ...DEFAULT_PLATFORM_ADMIN_AI_POLICY,
  tools: { product_draft_update: { enabled: true, autonomy: "PREPARE" as const } },
};
const initialStaffPolicy = { ...DEFAULT_STAFF_ADMIN_AI_POLICY, tools: {} };
const desiredStaffPolicy = {
  ...DEFAULT_STAFF_ADMIN_AI_POLICY,
  tools: { product_draft_update: { enabled: true, autonomy: "PREPARE" as const } },
};

const waitForServer = (child: ChildProcess) => new Promise<void>((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("Admin AI policy route test server did not start.")), 20_000);
  const ready = (value: Buffer) => { if (value.toString().includes("listening on")) { clearTimeout(timeout); child.stdout?.off("data", ready); resolve(); } };
  child.stdout?.on("data", ready);
  child.once("exit", (code) => { clearTimeout(timeout); reject(new Error(`Admin AI policy route test server exited with ${code}.`)); });
});

try {
  await runMigrations();
  await query(
    "INSERT INTO operational_state(namespace,key,version,payload,updated_at) VALUES('admin-ai-policy','platform',1,$1::jsonb,now()) ON CONFLICT(namespace,key) DO UPDATE SET version=excluded.version,payload=excluded.payload,updated_at=excluded.updated_at",
    [JSON.stringify(platformPolicy)],
  );
  await query(
    "INSERT INTO operational_state(namespace,key,version,payload,updated_at) VALUES('admin-ai-policy',$1,1,$2::jsonb,now())",
    [staffKey, JSON.stringify(initialStaffPolicy)],
  );

  const saved = await saveStaffAdminAiPolicy(staffId, 1, desiredStaffPolicy, "Policy Integration", tools);
  assert.equal(saved.changed, true);
  assert.equal(saved.revision, 2);
  assert.deepEqual(saved.policy.tools.product_draft_update, { enabled: true, autonomy: "PREPARE" });

  const row = (await query<{ version: number; payload: typeof desiredStaffPolicy }>(
    "SELECT version,payload FROM operational_state WHERE namespace='admin-ai-policy' AND key=$1",
    [staffKey],
  )).rows[0];
  assert.equal(Number(row.version), 2);
  assert.deepEqual(row.payload.tools.product_draft_update, { enabled: true, autonomy: "PREPARE" });

  const unchanged = await saveStaffAdminAiPolicy(staffId, 2, desiredStaffPolicy, "Policy Integration", tools);
  assert.equal(unchanged.changed, false);
  assert.equal(unchanged.revision, 2);
  assert.equal(Number((await query<{ version: number }>(
    "SELECT version FROM operational_state WHERE namespace='admin-ai-policy' AND key=$1",
    [staffKey],
  )).rows[0].version), 2);

  await assert.rejects(
    () => saveStaffAdminAiPolicy(staffId, 1, desiredStaffPolicy, "Policy Integration", tools),
    (error: unknown) => (error as { code?: string }).code === "POLICY_REVISION_CONFLICT",
  );

  const routePassword = "Policy route test password 642!";
  const passwordHash = await hashStaffPassword(routePassword);
  const now = new Date().toISOString();
  const account = (id: string, role: "SUPER_ADMIN" | "SUPPORT"): StaffAccount => ({ id, email: `${id}@example.test`, normalizedEmail: `${id}@example.test`, displayName: role === "SUPER_ADMIN" ? "Policy Route Admin" : "Policy Route Support", status: "ACTIVE", passwordHash, baseRole: role, grantedPermissions: [], revokedPermissions: [], mustChangePassword: false, createdAt: now, updatedAt: now });
  await mutatePostgresStaffStore((store) => { store.accounts.push(account(routeStaffId, "SUPER_ADMIN"), account(deniedStaffId, "SUPPORT")); });
  await query(
    "INSERT INTO operational_state(namespace,key,version,payload,updated_at) VALUES('admin-ai-policy',$1,1,$2::jsonb,now())",
    [`staff:${routeStaffId}`, JSON.stringify(initialStaffPolicy)],
  );

  const port = 18_000 + Math.floor(Math.random() * 1_000);
  const child = spawn(process.execPath, ["backend-dist/backend/server.js"], { env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", FX_RECONCILIATION_SCHEDULER_ENABLED: "false", SYNTECH_SCHEDULER_ENABLED: "false" }, stdio: ["ignore", "pipe", "pipe"] });
  try {
    await waitForServer(child);
    const login = async (email: string) => {
      const response = await fetch(`http://127.0.0.1:${port}/api/admin/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:5173" }, body: JSON.stringify({ email, password: routePassword }) });
      assert.equal(response.status, 200);
      return response.headers.get("set-cookie")?.split(";")[0] ?? "";
    };
    const adminCookie = await login(`${routeStaffId}@example.test`);
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/settings/ai-assistant/policy/staff/${routeStaffId}`, { method: "PATCH", headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:5173", Cookie: adminCookie }, body: JSON.stringify({ revision: 1, policy: desiredStaffPolicy, confirmHighRisk: true, traceId: randomUUID() }) });
    assert.equal(response.status, 200);
    const routeSaved = await response.json() as { changed: boolean; revision: number; policy: typeof desiredStaffPolicy };
    assert.equal(routeSaved.changed, true);
    assert.equal(routeSaved.revision, 2);
    assert.deepEqual(routeSaved.policy.tools.product_draft_update, { enabled: true, autonomy: "PREPARE" });
    assert.equal(Number((await query<{ version: number }>("SELECT version FROM operational_state WHERE namespace='admin-ai-policy' AND key=$1", [`staff:${routeStaffId}`])).rows[0].version), 2);
    assert.equal(Number((await query<{ count: string }>("SELECT count(*)::text count FROM admin_audit WHERE action_type='ADMIN_AI_STAFF_POLICY_CHANGED' AND entity_id=$1", [routeStaffId])).rows[0].count), 1);

    const noOpResponse = await fetch(`http://127.0.0.1:${port}/api/admin/settings/ai-assistant/policy/staff/${routeStaffId}`, { method: "PATCH", headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:5173", Cookie: adminCookie }, body: JSON.stringify({ revision: 2, policy: desiredStaffPolicy, confirmHighRisk: true, traceId: randomUUID() }) });
    const routeNoOp = await noOpResponse.json() as { changed: boolean; revision: number };
    assert.equal(noOpResponse.status, 200);
    assert.equal(routeNoOp.changed, false);
    assert.equal(routeNoOp.revision, 2);
    assert.equal(Number((await query<{ count: string }>("SELECT count(*)::text count FROM admin_audit WHERE action_type='ADMIN_AI_STAFF_POLICY_CHANGED' AND entity_id=$1", [routeStaffId])).rows[0].count), 1);

    const deniedCookie = await login(`${deniedStaffId}@example.test`);
    const denied = await fetch(`http://127.0.0.1:${port}/api/admin/settings/ai-assistant/policy/staff/${deniedStaffId}`, { method: "PATCH", headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:5173", Cookie: deniedCookie }, body: JSON.stringify({ revision: 0, policy: desiredStaffPolicy, confirmHighRisk: true }) });
    assert.equal(denied.status, 403);
  } finally {
    child.kill("SIGTERM");
  }
  console.log("Admin AI policy PostgreSQL persistence tests passed.");
} finally {
  await query("DELETE FROM operational_state WHERE namespace='admin-ai-policy' AND key=ANY($1::text[])", [[staffKey, `staff:${routeStaffId}`, `staff:${deniedStaffId}`]]).catch(() => undefined);
  await query("DELETE FROM admin_audit WHERE entity_id=ANY($1::text[]) OR actor_id=ANY($1::text[])", [[routeStaffId, deniedStaffId]]).catch(() => undefined);
  await query("DELETE FROM staff_accounts WHERE id=ANY($1::text[])", [[routeStaffId, deniedStaffId]]).catch(() => undefined);
  await closePostgres();
}

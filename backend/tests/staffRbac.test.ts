import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  STAFF_PERMISSION_IDS,
  STAFF_ROLE_IDS,
  StaffAuthorizationValidationError,
  canAssignRole,
  canDelegatePermission,
  privilegedStaffPermissions,
  resolveEffectivePermissions,
  staffPermissionRegistry,
  staffRolePermissions,
  validateStaffAuthorizationProfile,
  type StaffPermission,
  type StaffRoleId,
} from "../staffRbac.js";
import {
  StaffPermissionDeniedError,
  createProvisionalOpsAuthorizationContext,
  createStaffAuthorizationContext,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  requirePermission,
  staffAuditActor,
} from "../staffAuthorization.js";

const profile = (baseRole: StaffRoleId, grantedPermissions: StaffPermission[] = [], revokedPermissions: StaffPermission[] = []) => ({ baseRole, grantedPermissions, revokedPermissions });
const permissions = (role: StaffRoleId) => resolveEffectivePermissions(profile(role));
const expectPermissions = (role: StaffRoleId, allowed: StaffPermission[], denied: StaffPermission[]) => {
  const effective = permissions(role);
  for (const permission of allowed) assert.equal(effective.has(permission), true, `${role} should have ${permission}`);
  for (const permission of denied) assert.equal(effective.has(permission), false, `${role} should not have ${permission}`);
};

assert.equal(STAFF_ROLE_IDS.length, 6);
assert.equal(STAFF_PERMISSION_IDS.length, 121);
assert.equal(new Set(STAFF_PERMISSION_IDS).size, STAFF_PERMISSION_IDS.length);
assert.equal(staffPermissionRegistry.length, STAFF_PERMISSION_IDS.length);
assert.equal(new Set(staffPermissionRegistry.map((item) => item.id)).size, staffPermissionRegistry.length);
for (const permission of staffPermissionRegistry) {
  assert.ok(permission.group);
  assert.ok(permission.label);
  assert.ok(permission.description);
  assert.ok(["READ", "STANDARD", "SENSITIVE", "HIGH_RISK"].includes(permission.risk));
  assert.ok(["READ", "MUTATION"].includes(permission.operation));
}
for (const permission of ["roles.manage", "staff.assign_role", "staff.assign_permission_override", "settings.security", "settings.payments", "settings.suppliers", "settings.zeus", "admin_ai.manage_automations", "payments.manage_config", "pricing.override", "refunds.execute"] as const) assert.equal(privilegedStaffPermissions.has(permission), true);

assert.deepEqual([...permissions("SUPER_ADMIN")], [...STAFF_PERMISSION_IDS]);
assert.equal(staffRolePermissions.SUPER_ADMIN, STAFF_PERMISSION_IDS);
assert.equal([...permissions("AUDITOR")].some((permission) => staffPermissionRegistry.find((item) => item.id === permission)?.operation === "MUTATION"), false);

expectPermissions("SUPPORT", ["contact.reply", "orders.read", "orders.resend_documents", "shipping.update_tracking"], ["pricing.view_supplier_cost", "settings.payments", "refunds.execute", "roles.manage"]);
expectPermissions("OPERATIONS", ["supplier_orders.record_reference", "inventory.adjust", "shipping.manage_fulfilment", "alerts.acknowledge"], ["staff.assign_role", "settings.security", "payments.manage_config"]);
expectPermissions("CATALOGUE", ["products.publish", "pricing.approve", "merchandising.manage_promotions", "suppliers.manage_mapping"], ["refunds.execute", "staff.create", "settings.payments"]);
expectPermissions("FINANCE", ["refunds.approve", "refunds.execute", "payments.reconcile", "reports.profitability"], ["products.publish", "inventory.adjust", "roles.manage"]);
for (const role of ["OPERATIONS", "SUPPORT", "CATALOGUE", "FINANCE", "AUDITOR"] as const) {
  assert.equal(permissions(role).has("admin_ai.use"), false, `${role} must not receive Admin AI access automatically`);
  assert.equal(permissions(role).has("admin_ai.manage_automations"), false, `${role} must not receive automation management automatically`);
}
assert.equal(permissions("SUPER_ADMIN").has("admin_ai.use"), true);
assert.equal(permissions("SUPER_ADMIN").has("admin_ai.manage_automations"), true);
assert.equal(resolveEffectivePermissions(profile("SUPPORT", ["admin_ai.use"])).has("admin_ai.use"), true);
assert.equal(resolveEffectivePermissions(profile("SUPER_ADMIN", [], ["admin_ai.use"])).has("admin_ai.use"), false);

assert.equal(resolveEffectivePermissions(profile("SUPPORT", ["shipping.manage_fulfilment"])).has("shipping.manage_fulfilment"), true);
assert.equal(resolveEffectivePermissions(profile("OPERATIONS", [], ["inventory.adjust"])).has("inventory.adjust"), false);
assert.equal(resolveEffectivePermissions(profile("SUPPORT", ["shipping.manage_fulfilment"], ["shipping.manage_fulfilment"])).has("shipping.manage_fulfilment"), false);
assert.throws(() => validateStaffAuthorizationProfile({ baseRole: "UNKNOWN", grantedPermissions: [], revokedPermissions: [] }), (error) => error instanceof StaffAuthorizationValidationError && error.code === "INVALID_ROLE");
assert.throws(() => validateStaffAuthorizationProfile({ baseRole: "SUPPORT", grantedPermissions: ["unknown.permission"], revokedPermissions: [] }), (error) => error instanceof StaffAuthorizationValidationError && error.code === "INVALID_PERMISSION");
assert.throws(() => validateStaffAuthorizationProfile({ baseRole: "SUPPORT", grantedPermissions: ["orders.read", "orders.read"], revokedPermissions: [] }), (error) => error instanceof StaffAuthorizationValidationError && error.code === "DUPLICATE_PERMISSION");

const supportContext = createStaffAuthorizationContext({ actorId: "staff-1", actorLabel: "Support User", profile: profile("SUPPORT") });
assert.equal(hasPermission(supportContext, "orders.read"), true);
assert.equal(hasPermission(supportContext, "unknown.permission"), false);
assert.equal(hasAnyPermission(supportContext, ["settings.security", "contact.reply"]), true);
assert.equal(hasAllPermissions(supportContext, ["orders.read", "contact.reply"]), true);
assert.equal(hasAllPermissions(supportContext, ["orders.read", "refunds.execute"]), false);
assert.equal(requirePermission("orders.read")(supportContext), supportContext);
assert.throws(() => requirePermission("refunds.execute")(supportContext), (error) => error instanceof StaffPermissionDeniedError && error.status === 403);
assert.deepEqual(staffAuditActor(supportContext), { actorType: "STAFF_USER", actorId: "staff-1", actorLabel: "Support User", actorRole: "SUPPORT" });

const provisional = createProvisionalOpsAuthorizationContext();
assert.equal(provisional.actorType, "OPS");
assert.equal(provisional.provisional, true);
assert.equal(provisional.permissions.size, STAFF_PERMISSION_IDS.length);
assert.deepEqual(staffAuditActor(provisional), { actorType: "OPS", actorId: undefined, actorLabel: "Ops", actorRole: undefined });

assert.equal(canDelegatePermission(supportContext.permissions, "contact.reply"), true);
assert.equal(canDelegatePermission(supportContext.permissions, "settings.security"), false);
assert.equal(canDelegatePermission(supportContext.permissions, "unknown.permission"), false);
const superPermissions = permissions("SUPER_ADMIN");
assert.equal(canAssignRole(supportContext.permissions, "SUPER_ADMIN"), false);
assert.equal(canAssignRole(superPermissions, "SUPER_ADMIN"), true);
assert.equal(canAssignRole(superPermissions, "UNKNOWN"), false);

const helperSource = await readFile("backend/staffAuthorization.ts", "utf8");
assert.doesNotMatch(helperSource, /role\s*===\s*["'](?:SUPPORT|OPERATIONS|CATALOGUE|FINANCE|AUDITOR)["']/);

console.log("Staff RBAC foundation tests passed.");

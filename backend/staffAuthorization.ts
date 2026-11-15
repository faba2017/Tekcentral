import { STAFF_PERMISSION_IDS, isStaffPermission, resolveEffectivePermissions, type StaffAuthorizationProfile, type StaffPermission, type StaffRoleId } from "./staffRbac.js";
import type { AuditActorType } from "./adminAuditService.js";

export interface StaffAuthorizationContext {
  actorType: Extract<AuditActorType, "OPS" | "STAFF_USER">;
  actorId?: string;
  actorLabel: string;
  role?: StaffRoleId;
  permissions: ReadonlySet<StaffPermission>;
  provisional: boolean;
}

export class StaffPermissionDeniedError extends Error {
  readonly code = "PERMISSION_DENIED";
  readonly status = 403;
  constructor(public permission: string) { super("You do not have permission to perform this action."); }
}

export function createStaffAuthorizationContext(input: { actorId: string; actorLabel: string; profile: StaffAuthorizationProfile }): StaffAuthorizationContext {
  return { actorType: "STAFF_USER", actorId: input.actorId, actorLabel: input.actorLabel, role: input.profile.baseRole, permissions: resolveEffectivePermissions(input.profile), provisional: false };
}

// Transitional compatibility only. Phase 2 replaces this with a server-derived staff session.
export function createProvisionalOpsAuthorizationContext(): StaffAuthorizationContext {
  return { actorType: "OPS", actorLabel: "Ops", permissions: new Set(STAFF_PERMISSION_IDS), provisional: true };
}

export function hasPermission(context: Pick<StaffAuthorizationContext, "permissions"> | undefined, permission: unknown): permission is StaffPermission {
  return Boolean(context && isStaffPermission(permission) && context.permissions.has(permission));
}

export function hasAnyPermission(context: Pick<StaffAuthorizationContext, "permissions"> | undefined, permissions: readonly unknown[]) {
  return permissions.some((permission) => hasPermission(context, permission));
}

export function hasAllPermissions(context: Pick<StaffAuthorizationContext, "permissions"> | undefined, permissions: readonly unknown[]) {
  return permissions.every((permission) => hasPermission(context, permission));
}

export function requirePermission(permission: StaffPermission) {
  return (context: StaffAuthorizationContext | undefined) => {
    if (!hasPermission(context, permission)) throw new StaffPermissionDeniedError(permission);
    return context;
  };
}

export function staffAuditActor(context: StaffAuthorizationContext) {
  return { actorType: context.actorType, actorId: context.actorId, actorLabel: context.actorLabel, actorRole: context.role } as const;
}

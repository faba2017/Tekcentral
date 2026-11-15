export const STAFF_ROLE_IDS = ["SUPER_ADMIN", "OPERATIONS", "SUPPORT", "CATALOGUE", "FINANCE", "AUDITOR"] as const;
export type StaffRoleId = (typeof STAFF_ROLE_IDS)[number];

export const staffRoleLabels: Record<StaffRoleId, string> = {
  SUPER_ADMIN: "Super Admin",
  OPERATIONS: "Operations",
  SUPPORT: "Sales & Customer Support",
  CATALOGUE: "Catalogue, Pricing & Merchandising",
  FINANCE: "Finance & Accounts",
  AUDITOR: "Auditor / Read Only",
};

export const STAFF_PERMISSION_IDS = [
  "dashboard.read",
  "orders.read", "orders.add_note", "orders.resend_documents", "orders.update_tracking", "orders.change_fulfilment", "orders.hold", "orders.release", "orders.request_cancel", "orders.cancel", "orders.override_status",
  "customers.read", "customers.read_contact_details", "customers.add_support_note", "customers.manage_account", "customers.disable_account", "customers.view_order_history",
  "contact.read", "contact.reply", "contact.retry_failed", "contact.change_status", "contact.start_conversation",
  "products.read", "products.create", "products.edit", "products.manage_media", "products.manage_category", "products.publish", "products.unpublish", "products.archive", "taxonomy.manage",
  "pricing.read", "pricing.create_proposal", "pricing.edit_proposal", "pricing.approve", "pricing.reject", "pricing.override", "pricing.view_supplier_cost", "pricing.view_margin",
  "merchandising.read", "merchandising.manage_homepage", "merchandising.manage_featured", "merchandising.manage_categories", "merchandising.manage_promotions",
  "suppliers.read", "suppliers.refresh", "suppliers.manage_mapping", "suppliers.manage_config", "suppliers.view_cost", "suppliers.view_private_stock",
  "supplier_orders.read", "supplier_orders.create", "supplier_orders.approve", "supplier_orders.record_reference", "supplier_orders.update_status", "supplier_orders.cancel", "supplier_orders.retry_api",
  "inventory.read", "inventory.receive", "inventory.adjust", "inventory.writeoff", "inventory.transfer", "inventory.manage_reorder",
  "returns.read", "returns.create", "returns.receive", "returns.disposition", "returns.restock", "returns.writeoff",
  "refunds.read", "refunds.request", "refunds.approve", "refunds.execute",
  "payments.read", "payments.view_transaction_reference", "payments.reconcile", "payments.mark_reviewed", "payments.refund", "payments.manage_config",
  "shipping.read", "shipping.quote", "shipping.update_tracking", "shipping.manage_fulfilment", "shipping.manage_rules", "shipping.manage_provider",
  "reports.sales", "reports.orders", "reports.revenue", "reports.profitability", "reports.products", "reports.suppliers", "reports.fulfilment", "reports.returns", "reports.payments", "reports.shipping", "reports.zeus", "reports.analytics",
  "alerts.read", "alerts.acknowledge", "alerts.resolve_manual",
  "audit.read", "audit.export",
  "admin_ai.use", "admin_ai.manage_automations",
  "settings.general", "settings.business_identity", "settings.payments", "settings.shipping", "settings.suppliers", "settings.email", "settings.zeus", "settings.security",
  "staff.read", "staff.create", "staff.disable", "staff.reset_password", "staff.revoke_sessions", "staff.assign_role", "staff.assign_permission_override",
  "roles.read", "roles.manage",
] as const;

export type StaffPermission = (typeof STAFF_PERMISSION_IDS)[number];
export type PermissionRisk = "READ" | "STANDARD" | "SENSITIVE" | "HIGH_RISK";
export type PermissionOperation = "READ" | "MUTATION";
export type PermissionGroup = "Dashboard" | "Orders" | "Customers" | "Contact" | "Products" | "Pricing" | "Merchandising" | "Suppliers" | "Supplier Orders" | "Inventory" | "Returns" | "Refunds" | "Payments" | "Shipping" | "Reports" | "Alerts" | "Audit" | "Admin AI" | "Settings" | "Staff" | "Roles";

export interface StaffPermissionMetadata {
  id: StaffPermission;
  group: PermissionGroup;
  label: string;
  description: string;
  risk: PermissionRisk;
  operation: PermissionOperation;
}

const groupByPrefix: Record<string, PermissionGroup> = {
  dashboard: "Dashboard", orders: "Orders", customers: "Customers", contact: "Contact", products: "Products", taxonomy: "Products", pricing: "Pricing", merchandising: "Merchandising", suppliers: "Suppliers", supplier_orders: "Supplier Orders", inventory: "Inventory", returns: "Returns", refunds: "Refunds", payments: "Payments", shipping: "Shipping", reports: "Reports", alerts: "Alerts", audit: "Audit", admin_ai: "Admin AI", settings: "Settings", staff: "Staff", roles: "Roles",
};
const labels: Partial<Record<StaffPermission, string>> = {
  "orders.add_note": "Add order note", "orders.resend_documents": "Resend customer documents", "orders.change_fulfilment": "Change fulfilment", "orders.request_cancel": "Request cancellation", "orders.override_status": "Override order status",
  "customers.read_contact_details": "View customer contact details", "customers.add_support_note": "Add customer support note", "customers.view_order_history": "View customer order history",
  "contact.retry_failed": "Retry failed message", "contact.start_conversation": "Start conversation",
  "pricing.view_supplier_cost": "View supplier cost", "pricing.view_margin": "View margin", "pricing.create_proposal": "Create pricing proposal", "pricing.edit_proposal": "Edit pricing proposal",
  "suppliers.view_private_stock": "View private supplier stock", "supplier_orders.record_reference": "Record supplier reference", "supplier_orders.retry_api": "Retry supplier API",
  "payments.view_transaction_reference": "View payment transaction reference", "payments.mark_reviewed": "Mark payment reviewed", "payments.manage_config": "Manage payment configuration",
  "shipping.manage_fulfilment": "Manage fulfilment", "staff.assign_permission_override": "Assign permission override", "staff.revoke_sessions": "Revoke staff sessions",
  "admin_ai.use": "Admin AI",
  "admin_ai.manage_automations": "Manage Admin AI automations",
};
const readActions = new Set(["read", "use", "view_contact_details", "view_order_history", "view_supplier_cost", "view_margin", "view_cost", "view_private_stock", "view_transaction_reference", "sales", "orders", "revenue", "profitability", "products", "suppliers", "fulfilment", "returns", "payments", "shipping", "zeus", "analytics"]);
const highRisk = new Set<StaffPermission>(["roles.manage", "staff.assign_role", "staff.assign_permission_override", "settings.security", "settings.payments", "settings.suppliers", "settings.zeus", "admin_ai.manage_automations", "payments.manage_config", "pricing.override", "refunds.execute", "taxonomy.manage"]);
const sensitive = new Set<StaffPermission>(["orders.override_status", "orders.cancel", "orders.resend_documents", "customers.read_contact_details", "customers.manage_account", "customers.disable_account", "pricing.view_supplier_cost", "pricing.view_margin", "suppliers.manage_config", "suppliers.view_cost", "suppliers.view_private_stock", "supplier_orders.create", "supplier_orders.approve", "supplier_orders.cancel", "supplier_orders.retry_api", "inventory.adjust", "inventory.writeoff", "returns.writeoff", "refunds.approve", "payments.view_transaction_reference", "payments.reconcile", "payments.refund", "shipping.manage_provider", "audit.export", "settings.email", "staff.create", "staff.disable", "staff.reset_password", "staff.revoke_sessions"]);
const humanize = (value: string) => value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");

export const staffPermissionRegistry: readonly StaffPermissionMetadata[] = STAFF_PERMISSION_IDS.map((id) => {
  const [prefix, action] = id.split(".");
  const group = groupByPrefix[prefix];
  if (!group || !action) throw new Error(`Invalid canonical permission: ${id}`);
  const operation: PermissionOperation = readActions.has(action) ? "READ" : "MUTATION";
  const risk: PermissionRisk = highRisk.has(id) ? "HIGH_RISK" : sensitive.has(id) ? "SENSITIVE" : operation === "READ" ? "READ" : "STANDARD";
  const label = labels[id] ?? humanize(action);
  const description = id === "admin_ai.use" ? "Use the internal Admin AI assistant." : id === "admin_ai.manage_automations" ? "Create and manage Admin AI automation definitions." : `${label} within ${group.toLowerCase()} operations.`;
  return { id, group, label, description, risk, operation };
});

export const staffPermissionMetadata = new Map(staffPermissionRegistry.map((permission) => [permission.id, permission]));
export const privilegedStaffPermissions = new Set(STAFF_PERMISSION_IDS.filter((permission) => staffPermissionMetadata.get(permission)?.risk === "HIGH_RISK"));

const operations = [
  "dashboard.read", "orders.read", "orders.add_note", "orders.resend_documents", "orders.update_tracking", "orders.change_fulfilment", "orders.hold", "orders.release", "orders.request_cancel", "orders.cancel",
  "customers.read", "customers.read_contact_details", "customers.add_support_note", "customers.view_order_history", "contact.read", "contact.reply", "contact.retry_failed", "contact.change_status", "products.read", "pricing.read",
  "suppliers.read", "suppliers.refresh", "suppliers.view_cost", "suppliers.view_private_stock", "supplier_orders.read", "supplier_orders.create", "supplier_orders.approve", "supplier_orders.record_reference", "supplier_orders.update_status", "supplier_orders.cancel",
  "inventory.read", "inventory.receive", "inventory.adjust", "inventory.writeoff", "inventory.manage_reorder", "returns.read", "returns.create", "returns.receive", "returns.disposition", "returns.restock", "returns.writeoff", "refunds.read", "refunds.request",
  "payments.read", "payments.view_transaction_reference", "shipping.read", "shipping.quote", "shipping.update_tracking", "shipping.manage_fulfilment", "shipping.manage_rules", "reports.orders", "reports.sales", "reports.suppliers", "reports.fulfilment", "reports.returns", "reports.shipping", "alerts.read", "alerts.acknowledge", "audit.read",
] as const satisfies readonly StaffPermission[];
const support = [
  "dashboard.read", "orders.read", "orders.add_note", "orders.resend_documents", "orders.update_tracking", "orders.request_cancel", "customers.read", "customers.read_contact_details", "customers.add_support_note", "customers.view_order_history", "contact.read", "contact.reply", "contact.retry_failed", "contact.change_status", "contact.start_conversation", "products.read", "returns.read", "returns.create", "refunds.read", "refunds.request", "payments.read", "shipping.read", "shipping.update_tracking", "reports.orders", "reports.returns", "reports.shipping", "alerts.read", "audit.read",
] as const satisfies readonly StaffPermission[];
const catalogue = [
  "dashboard.read", "products.read", "products.create", "products.edit", "products.manage_media", "products.manage_category", "products.publish", "products.unpublish", "pricing.read", "pricing.create_proposal", "pricing.edit_proposal", "pricing.approve", "pricing.reject", "pricing.view_supplier_cost", "pricing.view_margin", "merchandising.read", "merchandising.manage_homepage", "merchandising.manage_featured", "merchandising.manage_categories", "merchandising.manage_promotions", "suppliers.read", "suppliers.refresh", "suppliers.manage_mapping", "suppliers.view_cost", "suppliers.view_private_stock", "inventory.read", "reports.sales", "reports.products", "reports.suppliers", "reports.analytics", "alerts.read", "audit.read",
] as const satisfies readonly StaffPermission[];
const finance = [
  "dashboard.read", "orders.read", "orders.resend_documents", "customers.read", "customers.view_order_history", "contact.read", "contact.reply", "pricing.read", "pricing.create_proposal", "pricing.approve", "pricing.reject", "pricing.view_supplier_cost", "pricing.view_margin", "suppliers.read", "supplier_orders.read", "returns.read", "refunds.read", "refunds.approve", "refunds.execute", "payments.read", "payments.view_transaction_reference", "payments.reconcile", "payments.mark_reviewed", "payments.refund", "shipping.read", "reports.sales", "reports.orders", "reports.revenue", "reports.profitability", "reports.returns", "reports.payments", "alerts.read", "alerts.acknowledge", "audit.read",
] as const satisfies readonly StaffPermission[];
const auditor = [
  "dashboard.read", "orders.read", "customers.read", "customers.view_order_history", "contact.read", "products.read", "pricing.read", "merchandising.read", "suppliers.read", "supplier_orders.read", "inventory.read", "returns.read", "refunds.read", "payments.read", "shipping.read", "reports.sales", "reports.orders", "reports.revenue", "reports.profitability", "reports.products", "reports.suppliers", "reports.fulfilment", "reports.returns", "reports.payments", "reports.shipping", "reports.zeus", "reports.analytics", "alerts.read", "audit.read",
] as const satisfies readonly StaffPermission[];

export const staffRolePermissions: Readonly<Record<StaffRoleId, readonly StaffPermission[]>> = {
  SUPER_ADMIN: STAFF_PERMISSION_IDS,
  OPERATIONS: operations,
  SUPPORT: support,
  CATALOGUE: catalogue,
  FINANCE: finance,
  AUDITOR: auditor,
};

export interface StaffAuthorizationProfile {
  baseRole: StaffRoleId;
  grantedPermissions: StaffPermission[];
  revokedPermissions: StaffPermission[];
}

export class StaffAuthorizationValidationError extends Error {
  constructor(public code: "INVALID_ROLE" | "INVALID_PERMISSION" | "DUPLICATE_PERMISSION") { super(code); }
}

export const isStaffRoleId = (value: unknown): value is StaffRoleId => typeof value === "string" && (STAFF_ROLE_IDS as readonly string[]).includes(value);
export const isStaffPermission = (value: unknown): value is StaffPermission => typeof value === "string" && staffPermissionMetadata.has(value as StaffPermission);

function validatePermissionList(value: unknown, field: string): StaffPermission[] {
  if (!Array.isArray(value)) throw new StaffAuthorizationValidationError("INVALID_PERMISSION");
  if (value.some((permission) => !isStaffPermission(permission))) throw new StaffAuthorizationValidationError("INVALID_PERMISSION");
  if (new Set(value).size !== value.length) throw new StaffAuthorizationValidationError("DUPLICATE_PERMISSION");
  void field;
  return value as StaffPermission[];
}

export function validateStaffAuthorizationProfile(value: unknown): StaffAuthorizationProfile {
  if (!value || typeof value !== "object") throw new StaffAuthorizationValidationError("INVALID_ROLE");
  const profile = value as Record<string, unknown>;
  if (!isStaffRoleId(profile.baseRole)) throw new StaffAuthorizationValidationError("INVALID_ROLE");
  return { baseRole: profile.baseRole, grantedPermissions: validatePermissionList(profile.grantedPermissions, "grantedPermissions"), revokedPermissions: validatePermissionList(profile.revokedPermissions, "revokedPermissions") };
}

export function resolveEffectivePermissions(value: StaffAuthorizationProfile): Set<StaffPermission> {
  const profile = validateStaffAuthorizationProfile(value);
  const effective = new Set<StaffPermission>(staffRolePermissions[profile.baseRole]);
  for (const permission of profile.grantedPermissions) effective.add(permission);
  for (const permission of profile.revokedPermissions) effective.delete(permission);
  return effective;
}

export function canDelegatePermission(actorPermissions: ReadonlySet<StaffPermission>, permission: unknown) {
  return isStaffPermission(permission) && actorPermissions.has(permission);
}

export function canAssignRole(actorPermissions: ReadonlySet<StaffPermission>, role: unknown) {
  if (!isStaffRoleId(role) || !actorPermissions.has("staff.assign_role")) return false;
  return role !== "SUPER_ADMIN" || actorPermissions.has("roles.manage");
}

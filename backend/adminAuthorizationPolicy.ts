import type { StaffPermission } from "./staffRbac.js";

export interface AdminPermissionRule {
  method?: string;
  pattern: RegExp;
  permission: StaffPermission;
  description: string;
}

const rule = (permission: StaffPermission, pattern: RegExp, method?: string, description = permission): AdminPermissionRule => ({ permission, pattern, method, description });

// Ordered from the most specific action to broad read-only domain fallbacks.
export const adminPermissionMatrix: readonly AdminPermissionRule[] = [
  rule("dashboard.read", /^\/api\/admin\/admin-ai\/access$/, "GET"),
  rule("dashboard.read", /^\/api\/admin\/admin-ai\/conversations(?:\/|$)/, "GET"),
  rule("admin_ai.use", /^\/api\/admin\/admin-ai\/(?:chat|conversations)(?:\/|$)/),
  rule("admin_ai.use", /^\/api\/admin\/admin-ai\/actions\/(?:[^/]+)\/(?:confirm|cancel)$/, "POST"),
  rule("admin_ai.use", /^\/api\/admin\/admin-ai\/tutor(?:\/|$)/),
  rule("admin_ai.use", /^\/api\/admin\/admin-ai\/context$/, "POST"),
  rule("staff.create", /^\/api\/admin\/staff\/invitations$/, "POST"),
  rule("staff.create", /^\/api\/admin\/staff\/[^/]+\/(?:resend|revoke)-invitation$/, "POST"),
  rule("staff.disable", /^\/api\/admin\/staff\/[^/]+\/(?:disable|enable)$/, "POST"),
  rule("staff.reset_password", /^\/api\/admin\/staff\/[^/]+\/send-password-reset$/, "POST"),
  rule("staff.revoke_sessions", /^\/api\/admin\/staff\/[^/]+\/revoke-sessions$/, "POST"),
  rule("staff.assign_role", /^\/api\/admin\/staff\/[^/]+\/authorization$/, "PATCH"),
  rule("staff.read", /^\/api\/admin\/staff(?:\/[^/]+)?$/, "GET"),
  rule("roles.read", /^\/api\/admin\/roles$/, "GET"),

  rule("orders.add_note", /\/notes$/, "POST"),
  rule("orders.update_tracking", /\/shipments(?:\/[^/]+)?$/, "PATCH"),
  rule("orders.update_tracking", /\/shipments$/, "POST"),
  rule("orders.hold", /\/hold$/, "POST"),
  rule("orders.release", /\/release$/, "POST"),
  rule("orders.cancel", /\/cancel$/, "POST"),
  rule("orders.override_status", /\/status$/, "PATCH"),
  rule("orders.change_fulfilment", /\/supplier-allocation/, "PATCH"),
  rule("orders.change_fulfilment", /\/supplier-allocation/, "POST"),
  rule("orders.resend_documents", /^\/api\/admin\/orders\/[^/]+\/invoice\/(?:resend|deliveries\/[^/]+\/retry)$/, "POST"),
  rule("orders.read", /^\/api\/admin\/orders(?:\/|$)/),

  rule("returns.receive", /^\/api\/admin\/returns\/[^/]+\/receive$/, "POST"),
  rule("returns.disposition", /^\/api\/admin\/returns\/[^/]+\/(?:inspect|status)$/, "PATCH"),
  rule("returns.read", /^\/api\/admin\/returns(?:\/|$)/),
  rule("refunds.execute", /^\/api\/admin\/refunds\/[^/]+\/status$/, "PATCH"),
  rule("refunds.request", /^\/api\/admin\/orders\/[^/]+\/refunds$/, "POST"),
  rule("refunds.read", /^\/api\/admin\/refunds(?:\/|$)/),

  rule("customers.add_support_note", /^\/api\/admin\/customers\/[^/]+\/notes$/, "POST"),
  rule("customers.manage_account", /^\/api\/admin\/customers\/[^/]+/, "PATCH"),
  rule("customers.read", /^\/api\/admin\/customers(?:\/|$)/),
  rule("contact.reply", /^\/api\/admin\/contact\/[^/]+\/reply$/, "POST"),
  rule("contact.retry_failed", /^\/api\/admin\/contact\/[^/]+\/retry$/, "POST"),
  rule("contact.start_conversation", /^\/api\/admin\/contact\/new$/, "POST"),
  rule("contact.change_status", /^\/api\/admin\/contact\/[^/]+\/status$/, "PATCH"),
  rule("contact.read", /^\/api\/admin\/contact(?:\/|$)/),

  rule("products.publish", /\/publish$/, "POST"),
  rule("products.unpublish", /\/unpublish$/, "POST"),
  rule("products.publish", /\/rollback$/, "POST"),
  rule("products.manage_media", /\/(?:images|documents)(?:\/|$)/, "POST"),
  rule("products.manage_media", /\/publication-image(?:\/(?:upload|private|tvr))?$/, "POST"),
  rule("products.manage_media", /\/publication-media\/[^/]+$/, "DELETE"),
  rule("products.edit", /^\/api\/admin\/products\/[^/]+\/publication$/, "PUT"),
  rule("products.edit", /\/publication\/draft$/, "PATCH"),
  rule("products.create", /\/products\/create$/, "POST"),
  rule("products.create", /^\/api\/admin\/suppliers\/[^/]+\/products\/[^/]+\/create-product$/, "POST"),
  rule("products.edit", /^\/api\/admin\/products(?:\/|$)/, "PATCH"),
  rule("products.edit", /^\/api\/admin\/products(?:\/|$)/, "POST"),
  rule("products.read", /^\/api\/admin\/(?:products|product-taxonomy)(?:\/|$)/),
  rule("taxonomy.manage", /^\/api\/admin\/taxonomy(?:\/|$)/, "POST"),
  rule("taxonomy.manage", /^\/api\/admin\/taxonomy(?:\/|$)/, "PATCH"),
  rule("products.read", /^\/api\/admin\/taxonomy(?:\/|$)/, "GET"),
  rule("products.read", /\/publishing(?:\/|$)/, "GET"),

  rule("pricing.override", /\/pricing\/overrides?/, "POST"),
  rule("pricing.approve", /\/pricing\/proposals\/[^/]+\/approve$/, "PATCH"),
  rule("pricing.reject", /\/pricing\/proposals\/[^/]+\/reject$/, "PATCH"),
  rule("pricing.create_proposal", /\/pricing-proposals?/, "POST"),
  rule("pricing.create_proposal", /\/pricing\/proposals?/, "POST"),
  rule("pricing.create_proposal", /^\/api\/admin\/pricing\/products\/[^/]+\/proposal$/, "POST"),
  rule("pricing.read", /^\/api\/admin\/pricing(?:\/|$)/),
  rule("pricing.read", /^\/api\/admin\/settings\/(?:pricing|fx)(?:\/|$)/, "GET"),
  rule("pricing.edit_proposal", /^\/api\/admin\/settings\/pricing$/, "PATCH"),
  rule("pricing.create_proposal", /^\/api\/admin\/settings\/fx\/refresh$/, "POST"),

  rule("merchandising.manage_homepage", /^\/api\/admin\/merchandising\/homepage/, "POST"),
  rule("merchandising.manage_promotions", /^\/api\/admin\/merchandising\/promotions/, "POST"),
  rule("merchandising.manage_homepage", /^\/api\/admin\/merchandising\/sections$/, "PUT"),
  rule("merchandising.manage_promotions", /^\/api\/admin\/merchandising\/promotions$/, "PUT"),
  rule("merchandising.read", /^\/api\/admin\/merchandising(?:\/|$)/),

  rule("supplier_orders.approve", /^\/api\/admin\/supplier-orders\/[^/]+\/approve$/, "POST"),
  rule("supplier_orders.create", /\/supplier-orders$/, "POST"),
  rule("supplier_orders.read", /^\/api\/admin\/supplier-orders\/[^/]+\/syntech\/preflight$/, "POST"),
  rule("supplier_orders.retry_api", /^\/api\/admin\/supplier-orders\/[^/]+\/syntech\/create$/, "POST"),
  rule("supplier_orders.retry_api", /\/retry$/, "POST"),
  rule("supplier_orders.update_status", /^\/api\/admin\/supplier-orders\/[^/]+\//, "POST"),
  rule("supplier_orders.read", /^\/api\/admin\/supplier-orders(?:\/|$)/),
  rule("suppliers.manage_mapping", /^\/api\/admin\/(?:supplier-mappings|suppliers\/.+\/mappings)(?:\/|$)/, "POST"),
  rule("suppliers.manage_mapping", /^\/api\/admin\/suppliers\/[^/]+\/products\/[^/]+\/mapping$/, "POST"),
  rule("suppliers.manage_mapping", /^\/api\/admin\/(?:supplier-mappings|suppliers\/.+\/mappings)(?:\/|$)/, "PATCH"),
  rule("suppliers.manage_mapping", /^\/api\/admin\/suppliers\/.+\/taxonomy\/(?:verify-source-path|mappings)(?:\/|$)/, "POST"),
  rule("suppliers.refresh", /\/(?:sync|refresh|enrich|backfill|evidence-refresh)(?:\/|$)/, "POST"),
  rule("suppliers.refresh", /^\/api\/admin\/suppliers\/.+\/sources\/[^/]+\/check$/, "POST"),
  rule("suppliers.manage_config", /^\/api\/admin\/suppliers\/.+\/(?:settings|config)/, "PATCH"),
  rule("suppliers.manage_config", /^\/api\/admin\/suppliers(?:\/|$)/, "POST"),
  rule("suppliers.manage_config", /^\/api\/admin\/suppliers(?:\/|$)/, "PATCH"),
  rule("suppliers.read", /^\/api\/admin\/(?:suppliers|supplier-mappings)(?:\/|$)/),

  rule("inventory.adjust", /\/inventory\/(?:adjust|import\/commit)/, "POST"),
  rule("inventory.receive", /\/replenishments\/[^/]+\/receive$/, "POST"),
  rule("inventory.manage_reorder", /\/replenishments(?:\/|$)/, "POST"),
  rule("inventory.read", /\/inventory(?:\/|$)/, "GET"),

  rule("shipping.quote", /\/shipping\/test-estimate$/, "POST"),
  rule("shipping.manage_rules", /^\/api\/admin\/settings\/shipping$/, "PATCH"),
  rule("shipping.read", /^\/api\/admin\/(?:shipping|settings\/shipping)(?:\/|$)/),

  rule("payments.manage_config", /^\/api\/admin\/settings\/payments/, "PATCH"),
  rule("payments.manage_config", /^\/api\/admin\/settings\/payments\/.+\/test$/, "POST"),
  rule("payments.read", /^\/api\/admin\/settings\/payments(?:\/|$)/),

  rule("alerts.acknowledge", /^\/api\/admin\/alerts\/[^/]+\/acknowledge$/, "POST"),
  rule("alerts.resolve_manual", /^\/api\/admin\/alerts\/[^/]+\/resolve$/, "POST"),
  rule("alerts.read", /^\/api\/admin\/(?:alerts|operational-events|system-health)(?:\/|$)/),
  rule("audit.export", /^\/api\/admin\/audit\/export$/, "GET"),
  rule("audit.read", /^\/api\/admin\/audit(?:\/|$)/),

  rule("reports.zeus", /^\/api\/admin\/analytics\/zeus(?:\/|$)/),
  rule("reports.analytics", /^\/api\/admin\/analytics(?:\/|$)/),
  rule("reports.zeus", /^\/api\/admin\/zeus(?:\/|$)/),
  rule("settings.zeus", /^\/api\/admin\/admin-ai\/operations$/, "GET"),
  rule("admin_ai.use", /^\/api\/admin\/admin-ai\/automations\/actions(?:\/|$)/),
  rule("admin_ai.manage_automations", /^\/api\/admin\/admin-ai\/automations(?:\/|$)/),
  rule("reports.sales", /^\/api\/admin\/reports\/definitions$/, "GET"),
  rule("reports.sales", /^\/api\/admin\/reports(?:\/|$)/),
  rule("dashboard.read", /^\/api\/admin\/dashboard(?:\/|$)/),

  rule("settings.general", /^\/api\/admin\/settings(?:\/history)?$/, "GET"),
  rule("settings.general", /^\/api\/admin\/settings\/general/, undefined),
  rule("settings.business_identity", /^\/api\/admin\/settings\/(?:business|commerce)/, undefined),
  rule("suppliers.manage_config", /^\/api\/admin\/settings\/suppliers$/, "PATCH"),
  rule("settings.suppliers", /^\/api\/admin\/(?:integrations|settings\/integrations|settings\/suppliers)/, undefined),
  rule("settings.email", /^\/api\/admin\/settings\/(?:notifications|email)/, undefined),
  rule("settings.zeus", /^\/api\/admin\/settings\/ai-assistant/, undefined),
  rule("settings.zeus", /^\/api\/admin\/settings\/automation/, undefined),
  rule("settings.security", /^\/api\/admin\/settings\/(?:users-security|system|health)/, undefined),
  rule("settings.general", /^\/api\/admin\/settings(?:\/|$)/),
];

export function permissionForAdminRequest(method: string, pathname: string): StaffPermission | undefined {
  return adminPermissionMatrix.find((entry) => (!entry.method || entry.method === method) && entry.pattern.test(pathname))?.permission;
}

const reportPermissions: Record<string, StaffPermission> = {
  sales: "reports.sales", orders: "reports.orders", products: "reports.products", suppliers: "reports.suppliers", profitability: "reports.profitability", returns: "reports.returns", inventory: "inventory.read", payments: "reports.payments", fx: "pricing.read", vat: "reports.revenue",
};
export function permissionForReport(report: string | null) { return report ? reportPermissions[report] : undefined; }


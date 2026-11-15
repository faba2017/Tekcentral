import type { StaffSessionView } from "@/lib/staff-auth";
import { adminPath } from "@/lib/admin-host";
import { hasStaffPermission } from "@/state/staff-session";

const routePermissions: Array<[RegExp, string]> = [
  [/\/admin\/ai(?:\/|$)/, "dashboard.read"],
  [/\/admin\/staff(?:\/|$)/, "staff.read"], [/\/admin\/orders(?:\/|$)/, "orders.read"], [/\/admin\/(?:returns|refunds)(?:\/|$)/, "returns.read"],
  [/\/admin\/customers(?:\/|$)/, "customers.read"], [/\/admin\/contact(?:\/|$)/, "contact.read"], [/\/admin\/(?:products|taxonomy)(?:\/|$)/, "products.read"],
  [/\/admin\/pricing(?:\/|$)/, "pricing.read"], [/\/admin\/merchandising(?:\/|$)/, "merchandising.read"], [/\/admin\/supplier-orders(?:\/|$)/, "supplier_orders.read"],
  [/\/admin\/(?:suppliers|supplier-mappings)(?:\/|$)/, "suppliers.read"], [/\/admin\/shipping(?:\/|$)/, "shipping.read"], [/\/admin\/reports\/analytics(?:\/|$)/, "reports.analytics"],
  [/\/admin\/reports\/zeus(?:\/|$)/, "reports.zeus"], [/\/admin\/reports(?:\/|$)/, "reports.sales"], [/\/admin\/alerts(?:\/|$)/, "alerts.read"],
  [/\/admin\/audit(?:\/|$)/, "audit.read"], [/\/admin\/settings\/payments(?:\/|$)/, "settings.payments"], [/\/admin\/settings\/shipping(?:\/|$)/, "settings.shipping"],
  [/\/admin\/settings\/suppliers(?:\/|$)/, "settings.suppliers"], [/\/admin\/settings\/notifications(?:\/|$)/, "settings.email"], [/\/admin\/settings\/ai-assistant\/operations(?:\/|$)/, "settings.zeus"], [/\/admin\/settings\/ai-assistant\/automations(?:\/|$)/, "admin_ai.manage_automations"], [/\/admin\/settings\/(?:automation|ai-assistant)(?:\/|$)/, "settings.zeus"],
  [/\/admin\/settings(?:\/|$)/, "settings.general"], [/\/admin(?:\/)?$/, "dashboard.read"],
];
export const permissionForAdminPage = (pathname: string) => routePermissions.find(([pattern]) => pattern.test(pathname))?.[1];
export const firstAuthorizedAdminPath = (session: StaffSessionView) => {
  const destinations: Array<[string, string]> = [["dashboard.read", ""], ["orders.read", "orders"], ["contact.read", "contact"], ["products.read", "products"], ["suppliers.read", "suppliers"], ["reports.sales", "reports"], ["audit.read", "audit"]];
  return adminPath(destinations.find(([permission]) => hasStaffPermission(session, permission))?.[1] ?? "account");
};

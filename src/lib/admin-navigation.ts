export type AdminSectionId = "dashboard" | "ai" | "orders" | "returns" | "customers" | "contact" | "products" | "taxonomy" | "pricing" | "merchandising" | "suppliers" | "supplier-orders" | "shipping" | "reports" | "analytics" | "zeus" | "alerts" | "settings" | "audit";

export function adminSectionForPath(pathname: string): AdminSectionId | undefined {
  if (pathname === "/admin") return "dashboard";
  if (pathname.startsWith("/admin/ai")) return "ai";
  if (pathname.startsWith("/admin/orders")) return "orders";
  if (pathname.startsWith("/admin/returns") || pathname.startsWith("/admin/refunds")) return "returns";
  if (pathname.startsWith("/admin/customers")) return "customers";
  if (pathname.startsWith("/admin/contact")) return "contact";
  if (pathname.startsWith("/admin/taxonomy")) return "taxonomy";
  if (pathname.startsWith("/admin/products")) return "products";
  if (pathname.startsWith("/admin/pricing")) return "pricing";
  if (pathname.startsWith("/admin/merchandising")) return "merchandising";
  if (pathname.startsWith("/admin/suppliers") || pathname.startsWith("/admin/supplier-mappings") || pathname.startsWith("/admin/cj")) return "suppliers";
  if (pathname.startsWith("/admin/supplier-orders")) return "supplier-orders";
  if (pathname.startsWith("/admin/shipping")) return "shipping";
  if (pathname.startsWith("/admin/reports/analytics")) return "analytics";
  if (pathname.startsWith("/admin/reports/zeus")) return "zeus";
  if (pathname.startsWith("/admin/reports")) return "reports";
  if (pathname.startsWith("/admin/alerts")) return "alerts";
  if (pathname.startsWith("/admin/settings")) return "settings";
  if (pathname.startsWith("/admin/audit")) return "audit";
  return undefined;
}

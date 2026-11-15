import { Link, useLocation } from "react-router-dom";
import { supplierCatalogueRoute, supplierProductsRoute, type SupplierRegistryEntry } from "@/lib/supplier-registry";

export function SupplierWorkspaceNav({ supplier }: { supplier: SupplierRegistryEntry }) {
  const location = useLocation();
  const catalogueRoute = supplierCatalogueRoute(supplier);
  const productsRoute = supplierProductsRoute(supplier);
  const tabs = [
    { label: "Overview", to: `${supplier.route}/overview`, active: location.pathname === `${supplier.route}/overview` },
    supplier.capabilities.catalogueRead
      ? { label: "Catalogue", to: catalogueRoute, active: location.pathname === catalogueRoute }
      : undefined,
    supplier.capabilitiesV2.productMapping !== "UNSUPPORTED" && productsRoute !== catalogueRoute ? { label: "Products", to: productsRoute, active: location.pathname === productsRoute } : undefined,
    supplier.capabilities.mappingSupport
      ? {
          label: "Mappings",
          to: `/admin/supplier-mappings?supplier=${supplier.code}`,
          active: location.pathname === "/admin/supplier-mappings" && location.search.includes(`supplier=${supplier.code}`),
        }
      : undefined,
    supplier.capabilitiesV2.evidence !== "UNSUPPORTED" ? { label: "Evidence", to: `${supplier.route}/evidence`, active: location.pathname === `${supplier.route}/evidence` } : undefined,
    supplier.capabilities.sourceManagement ? { label: "Sources", to: `${supplier.route}/sources`, active: location.pathname === `${supplier.route}/sources` } : undefined,
    supplier.capabilitiesV2.stock !== "UNSUPPORTED" ? { label: "Stock & Delivery", to: `${supplier.route}/stock-delivery`, active: location.pathname === `${supplier.route}/stock-delivery` } : undefined,
    supplier.code === "TEKCENTRAL" ? { label: "Pricing & Cost", to: `${supplier.route}/pricing-cost`, active: location.pathname === `${supplier.route}/pricing-cost` } : undefined,
    supplier.capabilitiesV2.orderCreate !== "UNSUPPORTED" || supplier.capabilitiesV2.orderSubmitEmail !== "UNSUPPORTED" ? { label: "Supplier Orders", to: `/admin/supplier-orders?supplier=${supplier.code}`, active: location.pathname === "/admin/supplier-orders" && location.search.includes(`supplier=${supplier.code}`) } : undefined,
    supplier.capabilitiesV2.syncHistory !== "UNSUPPORTED" ? { label: "Sync History", to: `${supplier.route}/sync-history`, active: location.pathname === `${supplier.route}/sync-history` } : undefined,
    supplier.capabilitiesV2.health !== "UNSUPPORTED" ? { label: "Health", to: `${supplier.route}/health`, active: location.pathname === `${supplier.route}/health` } : undefined,
    { label: "Supplier settings", to: "/admin/settings/suppliers", active: location.pathname === "/admin/settings/suppliers" },
  ].filter((tab): tab is { label: string; to: string; active: boolean } => Boolean(tab));

  return (
    <nav className="mt-6 flex w-full min-w-0 max-w-full gap-2 overflow-x-auto rounded-lg border border-[#E4E7EC] bg-white p-2 shadow-sm" aria-label={`${supplier.displayName} workspace`}>
      {tabs.map((tab) => (
        <Link
          key={`${tab.label}-${tab.to}`}
          to={tab.to}
          className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-black ${
            tab.active
              ? "bg-[var(--tek-accent)] text-[var(--tek-accent-ink)]"
              : "text-[#3F4652] hover:bg-[#F6F7F9] hover:text-[#0A0A0A]"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

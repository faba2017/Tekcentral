import { Link, useLocation } from "react-router-dom";
import type { SupplierRegistryEntry } from "@/lib/supplier-registry";

export function SupplierWorkspaceNav({ supplier }: { supplier: SupplierRegistryEntry }) {
  const location = useLocation();
  const tabs = [
    supplier.capabilities.catalogueRead
      ? { label: "Catalogue", to: supplier.route, active: location.pathname === supplier.route }
      : undefined,
    supplier.capabilities.importedCatalogue
      ? {
          label: "Imported Products",
          to: `${supplier.route}/imported`,
          active: location.pathname === `${supplier.route}/imported`,
        }
      : undefined,
    supplier.capabilities.mappingSupport
      ? {
          label: "Mappings",
          to: `/admin/supplier-mappings?supplier=${supplier.code}`,
          active: location.pathname === "/admin/supplier-mappings" && location.search.includes(`supplier=${supplier.code}`),
        }
      : undefined,
  ].filter((tab): tab is { label: string; to: string; active: boolean } => Boolean(tab));

  return (
    <nav className="mt-6 flex gap-2 overflow-x-auto rounded-lg border border-[#E4E7EC] bg-white p-2 shadow-sm" aria-label={`${supplier.displayName} workspace`}>
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

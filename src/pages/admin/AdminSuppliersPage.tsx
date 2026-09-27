import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AdminFeedback, AdminPageHeader, AdminShell, AdminStatusBadge } from "@/components/admin/AdminShell";
import { apiRequest } from "@/lib/api";
import type { CjConnectionStatus, ScoopCatalogueStatus } from "@/lib/admin";
import { enabledSupplierRegistry, type SupplierRegistryEntry } from "@/lib/supplier-registry";
import { usePageTitle } from "@/lib/page-title";

export function AdminSuppliersPage() {
  usePageTitle("Suppliers | TekCentral Ops");
  const [cjStatus, setCjStatus] = useState<CjConnectionStatus>();
  const [scoopStatus, setScoopStatus] = useState<ScoopCatalogueStatus>();
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      enabledSupplierRegistry.some((supplier) => supplier.code === "CJ")
        ? apiRequest<CjConnectionStatus>("/api/admin/suppliers/cj/status").then(setCjStatus)
        : Promise.resolve(),
      enabledSupplierRegistry.some((supplier) => supplier.code === "SCOOP")
        ? apiRequest<ScoopCatalogueStatus>("/api/admin/suppliers/scoop/status").then(setScoopStatus)
        : Promise.resolve(),
    ])
      .catch(() => setError("Supplier status is not available right now."));
  }, []);

  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="Supplier hub"
        title="Suppliers"
        description="Open configured supplier workspaces without adding supplier-specific items to the global admin navigation."
      />
      {error && <div className="mt-6"><AdminFeedback variant="warning" message={error} /></div>}
      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {enabledSupplierRegistry.map((supplier) => (
          <SupplierCard
            key={supplier.code}
            supplier={supplier}
            cjStatus={supplier.code === "CJ" ? cjStatus : undefined}
            scoopStatus={supplier.code === "SCOOP" ? scoopStatus : undefined}
          />
        ))}
        {enabledSupplierRegistry.length === 0 && (
          <p className="rounded-lg border border-[#E4E7EC] bg-white p-6 text-sm font-semibold text-[#727986]">
            No supplier workspaces are configured.
          </p>
        )}
      </section>
    </AdminShell>
  );
}

function SupplierCard({
  supplier,
  cjStatus,
  scoopStatus,
}: {
  supplier: SupplierRegistryEntry;
  cjStatus?: CjConnectionStatus;
  scoopStatus?: ScoopCatalogueStatus;
}) {
  const configured =
    supplier.code === "CJ" ? Boolean(cjStatus?.configured) : supplier.capabilitiesV2.catalogue === "SUPPORTED";
  const connected =
    supplier.code === "CJ" ? Boolean(cjStatus?.authenticated) : Boolean(scoopStatus?.lastSync);
  return (
    <article className="rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">{supplier.displayName}</h2>
          <p className="mt-1 text-xs font-semibold text-[#727986]">Supplier code {supplier.code}</p>
        </div>
        <AdminStatusBadge
          label={connected ? "Synced" : configured ? "Configured" : "Not configured"}
          status={connected ? "PAID" : "PENDING"}
        />
      </div>
      {supplier.code === "CJ" && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Metric label="Imported" value={String(cjStatus?.importedProductsCount ?? 0)} />
          <Metric label="Verified" value={String(cjStatus?.verifiedMappingsCount ?? 0)} />
          <Metric label="Suggested" value={String(cjStatus?.suggestedMappingsCount ?? 0)} />
        </div>
      )}
      {supplier.code === "SCOOP" && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Metric label="Products" value={String(scoopStatus?.productCount ?? 0)} />
          <Metric label="Available" value={String(scoopStatus?.availableCount ?? 0)} />
          <Metric label="Stale" value={String(scoopStatus?.staleCount ?? 0)} />
        </div>
      )}
      <Link
        to={supplier.route}
        className="mt-5 inline-flex rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black text-[var(--tek-accent-ink)]"
      >
        Open supplier
      </Link>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[#F6F7F9] p-3">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-[#727986]">{label}</p>
      <p className="mt-2 text-xl font-black">{value}</p>
    </div>
  );
}

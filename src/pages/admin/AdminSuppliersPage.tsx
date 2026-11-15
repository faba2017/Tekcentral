import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AdminFeedback, AdminPageHeader, AdminShell, AdminStatusBadge } from "@/components/admin/AdminShell";
import { apiRequest } from "@/lib/api";
import type { SupplierHubResponse, SupplierOperations } from "@/lib/supplier-hub";
import { usePageTitle } from "@/lib/page-title";

export function AdminSuppliersPage() {
  usePageTitle("Suppliers | TekCentral Ops");
  const [suppliers, setSuppliers] = useState<SupplierOperations[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { void apiRequest<SupplierHubResponse>("/api/admin/suppliers/hub").then((result) => setSuppliers(result.suppliers)).catch(() => setError("Supplier status is not available right now.")); }, []);
  return <AdminShell><AdminPageHeader eyebrow="Supplier hub" title="Suppliers" description="Operate supplier catalogues, evidence, mappings, stock, synchronization and procurement readiness." />
    {error && <div className="mt-6"><AdminFeedback variant="warning" message={error} /></div>}
    <div className="mt-5 flex flex-wrap gap-2"><Link to="/admin/supplier-mappings" className="rounded-md border border-[#469D8B] px-3 py-2 text-sm font-black text-[#176B5C]">Cross-supplier mappings</Link><Link to="/admin/settings/suppliers" className="rounded-md border border-[#D0D5DD] px-3 py-2 text-sm font-black">Configure supplier settings</Link></div>
    <section className="mt-5 grid gap-4 lg:grid-cols-2">{suppliers.map((supplier) => <SupplierCard key={supplier.supplier.id} data={supplier} />)}{!error && suppliers.length === 0 && <p className="rounded-lg border border-[#E4E7EC] bg-white p-6 text-sm font-semibold text-[#667085]">Loading configured supplier workspaces...</p>}</section>
  </AdminShell>;
}

function SupplierCard({ data }: { data: SupplierOperations }) {
  const route = `/admin/suppliers/${data.supplier.id.toLowerCase()}`;
  return <article className="rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-black">{data.supplier.displayName}</h2><p className="mt-1 text-sm font-semibold text-[#667085]">{data.supplier.description}</p></div><AdminStatusBadge label={data.healthStatus} status={data.healthStatus} /></div>
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Products" value={data.catalogue.productCount} /><Metric label="Verified" value={data.mappings.verified} /><Metric label="Attention" value={data.mappings.reviewRequired + data.orders.attention} /><Metric label="Orders" value={data.orders.total} /></div>
    <dl className="mt-4 grid gap-2 text-xs font-semibold text-[#667085]"><div className="flex justify-between"><dt>Configuration</dt><dd className="font-black text-[#344054]">{data.configurationStatus.replace(/_/g, " ")}</dd></div><div className="flex justify-between"><dt>Order mode</dt><dd className="font-black text-[#344054]">{data.supplier.defaultOrderMode}</dd></div><div className="flex justify-between"><dt>Last sync/activity</dt><dd className="font-black text-[#344054]">{data.catalogue.lastSyncAt ? new Date(data.catalogue.lastSyncAt).toLocaleString("en-ZA") : "Not recorded"}</dd></div></dl>
    <Link to={`${route}/overview`} className="mt-5 inline-flex rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black text-[var(--tek-accent-ink)]">Open workspace</Link>
  </article>;
}
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-md bg-[#F6F7F9] p-3"><p className="text-[10px] font-black uppercase text-[#667085]">{label}</p><p className="mt-1 text-xl font-black">{value}</p></div>; }

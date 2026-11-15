import { Link } from "react-router-dom";
import { AdminPageHeader, AdminShell } from "@/components/admin/AdminShell";
import { usePageTitle } from "@/lib/page-title";

export function AdminNotFoundPage() {
  usePageTitle("Page not found | TekCentral Ops");
  return <AdminShell>
    <AdminPageHeader eyebrow="404" title="Page not found" description="This Admin page does not exist or is no longer available." />
    <section className="mt-6 rounded-lg border border-[#E4E7EC] bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold text-[#667085]">Use an Admin destination below to continue working.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link to="/admin" className="rounded-md bg-[var(--tek-accent)] px-4 py-2.5 text-sm font-black text-[var(--tek-accent-ink)]">Back to Dashboard</Link>
        <Link to="/admin/suppliers" className="rounded-md border border-[#D0D5DD] px-4 py-2.5 text-sm font-black text-[#344054]">Suppliers</Link>
      </div>
    </section>
  </AdminShell>;
}

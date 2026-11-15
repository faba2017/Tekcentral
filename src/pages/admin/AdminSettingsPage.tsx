import { Link } from "react-router-dom";
import { FiArrowRight, FiSettings } from "react-icons/fi";
import { SettingsWorkspace } from "@/components/admin/SettingsWorkspace";
import { settingsSections } from "@/lib/settings";
import { usePageTitle } from "@/lib/page-title";

export function AdminSettingsPage() {
  usePageTitle("Settings | TekCentral Ops");
  return <SettingsWorkspace title="Settings" description="Manage business configuration through typed, auditable settings domains."><div className="rounded-md border border-[#B2DDFF] bg-[#EFF8FF] p-4 text-sm font-semibold text-[#175CD3]">Pricing and Shipping remain managed by their existing operational pages during this migration phase.</div><section className="mt-5 grid gap-3 sm:grid-cols-2">{settingsSections.map(([label, path]) => <Link key={path} to={path} className="group flex items-center gap-3 rounded-lg border border-[#E4E7EC] bg-white p-4 shadow-sm hover:border-[#98A2B3]"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[#F2F4F7] text-[#667085]"><FiSettings /></span><span className="min-w-0 flex-1 text-sm font-black">{label}</span><FiArrowRight className="text-[#98A2B3] group-hover:text-[#176B5C]" /></Link>)}</section></SettingsWorkspace>;
}

import { Link } from "react-router-dom";
import { useStaffSession } from "@/state/staff-session";
import { firstAuthorizedAdminPath } from "@/lib/admin-page-permissions";

export function AdminForbiddenPage() { const session = useStaffSession(); return <div className="grid min-h-screen place-items-center bg-[#F6F7F9] p-6"><section className="w-full max-w-lg rounded-2xl border border-[#E4E7EC] bg-white p-8 text-center shadow-sm"><p className="text-xs font-black uppercase tracking-[0.18em] text-[#B42318]">Access denied</p><h1 className="mt-3 text-3xl font-black">You do not have permission to access this area.</h1><p className="mt-3 text-sm font-semibold text-[#727986]">Your current staff access does not include this Admin section.</p><Link className="mt-6 inline-flex rounded-lg bg-[var(--tek-accent)] px-5 py-3 font-black text-[var(--tek-accent-ink)]" to={firstAuthorizedAdminPath(session)}>Go to an authorized area</Link></section></div>; }

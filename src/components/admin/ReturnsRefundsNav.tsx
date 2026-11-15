import { NavLink } from "react-router-dom";

export function ReturnsRefundsNav() {
  return <nav aria-label="Returns and refunds" className="mt-5 inline-flex rounded-md border border-[#E4E7EC] bg-white p-1 shadow-sm"><NavLink to="/admin/returns" className={({ isActive }) => `rounded px-4 py-2 text-sm font-black ${isActive ? "bg-[var(--tek-accent)] text-[var(--tek-accent-ink)]" : "text-[#3F4652]"}`}>Returns</NavLink><NavLink to="/admin/refunds" className={({ isActive }) => `rounded px-4 py-2 text-sm font-black ${isActive ? "bg-[var(--tek-accent)] text-[var(--tek-accent-ink)]" : "text-[#3F4652]"}`}>Refunds</NavLink></nav>;
}

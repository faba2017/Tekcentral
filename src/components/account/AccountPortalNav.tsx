import { Link, useLocation } from "react-router-dom";

const items = [{ label: "Overview", to: "/account", end: true }, { label: "Profile", to: "/account?view=profile" }, { label: "Addresses", to: "/account?view=addresses" }, { label: "Orders", to: "/account/orders" }];

export function AccountPortalNav() {
  const location = useLocation(); const view = new URLSearchParams(location.search).get("view");
  return <nav className="flex gap-2 overflow-x-auto pb-1 lg:flex-col" aria-label="Account sections">{items.map((item) => { const active = item.label === "Orders" ? location.pathname.startsWith("/account/orders") : item.label === "Profile" ? location.pathname === "/account" && view === "profile" : item.label === "Addresses" ? location.pathname === "/account" && view === "addresses" : location.pathname === "/account" && !view; return <Link key={item.label} to={item.to} className={`shrink-0 rounded-md px-4 py-3 text-left text-sm font-black outline-none focus-visible:ring-2 focus-visible:ring-[var(--tek-accent)] ${active ? "bg-[#176B5C] text-white" : "bg-white text-[#3F4652]"}`} aria-current={active ? "page" : undefined}>{item.label}</Link>; })}</nav>;
}

import { FormEvent, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  FiBriefcase,
  FiMenu,
  FiSearch,
  FiShoppingCart,
  FiUser,
  FiX,
} from "react-icons/fi";
import { categories } from "@/data/catalogue";
import { useCart } from "@/state/cart";
import { cn } from "@/lib/utils";

interface CategoryNavItem {
  label: string;
  path: string;
  futureMegaMenu?: boolean;
}

const categoryNavItems: CategoryNavItem[] = [
  { label: "Shop All", path: "/shop", futureMegaMenu: true },
  ...categories.map((category) => ({
    label: category.name,
    path: `/category/${category.slug}`,
  })),
  { label: "Business Solutions", path: "/business" },
  { label: "Ask Zeus", path: "/zeus" },
];

export function AppHeader() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { itemCount } = useCart();

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    navigate(trimmed ? `/shop?q=${encodeURIComponent(trimmed)}` : "/shop");
    setOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[#E4E7EC] bg-white">
      <div className="hidden border-b border-[#E4E7EC] bg-[#0A0A0A] text-white md:block">
        <div className="mx-auto flex min-h-9 max-w-7xl items-center justify-between px-4 text-xs font-semibold sm:px-6 lg:px-8">
          <p className="text-white/[0.72]">South Africa first technology store</p>
          <div className="flex items-center gap-5 text-white/[0.72]">
            <Link className="transition hover:text-white" to="/business">
              Business procurement
            </Link>
            <Link className="transition hover:text-white" to="/contact">
              Contact
            </Link>
            <Link className="transition hover:text-[var(--tek-accent)]" to="/zeus">
              Ask Zeus
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto flex min-h-[72px] max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <button
          data-app-header-mobile-toggle
          type="button"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-[#E4E7EC] text-[#0A0A0A] transition hover:border-[#0A0A0A] min-[900px]:hidden"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label="Toggle navigation"
        >
          {open ? <FiX aria-hidden="true" /> : <FiMenu aria-hidden="true" />}
        </button>

        <Link
          to="/"
          className="flex shrink-0 items-center gap-3 rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tek-accent)] focus-visible:ring-offset-4"
          onClick={() => setOpen(false)}
        >
          <span className="leading-tight">
            <span className="block text-[1.35rem] font-black leading-none tracking-[-0.01em] text-[#0A0A0A] sm:text-[1.55rem]">
              Tek<span className="text-[var(--tek-accent)]">Central</span>
            </span>
            <span className="block text-xs font-semibold text-[#727986]">
              Technology, made easier.
            </span>
          </span>
        </Link>

        <form
          onSubmit={submitSearch}
          className="relative hidden min-w-0 flex-1 md:block"
        >
          <label htmlFor="site-search" className="sr-only">
            Search products
          </label>
          <FiSearch
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#727986]"
          />
          <input
            id="site-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search laptops, routers, printers, power..."
            className="h-12 w-full rounded-md border border-[#E4E7EC] bg-[#F6F7F9] pl-11 pr-4 text-sm font-semibold text-[#0A0A0A] outline-none transition placeholder:text-[#727986] focus:border-[var(--tek-accent)] focus:bg-white focus:ring-4 focus:ring-[rgba(70,157,139,0.14)]"
          />
        </form>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-md border border-[#E4E7EC] text-[#0A0A0A] transition hover:border-[#0A0A0A] md:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open search"
          >
            <FiSearch aria-hidden="true" />
          </button>
          <Link
            to="/account"
            className="hidden h-11 items-center gap-2 rounded-md border border-[#E4E7EC] px-3 text-sm font-bold text-[#3F4652] transition hover:border-[#0A0A0A] hover:text-[#0A0A0A] sm:inline-flex"
          >
            <FiUser aria-hidden="true" />
            Account
          </Link>
          <Link
            to="/cart"
            className="inline-flex h-11 items-center gap-2 rounded-md bg-[var(--tek-accent)] px-3 text-sm font-black text-[var(--tek-accent-ink)] transition hover:bg-[var(--tek-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tek-accent)] focus-visible:ring-offset-4"
          >
            <FiShoppingCart aria-hidden="true" />
            <span>Cart</span>
            <span className="grid min-w-6 place-items-center rounded bg-white/[0.14] px-1.5 py-0.5 text-xs">
              {itemCount}
            </span>
          </Link>
        </div>
      </div>

      <nav
        data-app-header-category-nav
        className="hidden border-t border-[#E4E7EC] bg-white min-[900px]:block"
        aria-label="Category navigation"
      >
        <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
          {categoryNavItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  "group relative flex h-12 shrink-0 items-center gap-2 px-3 text-sm font-black text-[#3F4652] transition hover:text-[#0A0A0A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tek-accent)]",
                  isActive && "text-[var(--tek-accent-ink)]",
                )
              }
            >
              {item.futureMegaMenu && <FiMenu aria-hidden="true" />}
              {item.label}
              <span className="absolute inset-x-3 bottom-0 h-0.5 origin-left scale-x-0 bg-[var(--tek-accent)] transition group-hover:scale-x-100" />
            </NavLink>
          ))}
        </div>
      </nav>

      {open && (
        <div className="border-t border-[#E4E7EC] bg-white px-4 py-4 shadow-xl min-[900px]:hidden">
          <form onSubmit={submitSearch}>
            <label htmlFor="mobile-site-search" className="sr-only">
              Search products
            </label>
            <div className="relative">
              <FiSearch
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#727986]"
              />
              <input
                id="mobile-site-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search TekCentral"
                className="h-12 w-full rounded-md border border-[#E4E7EC] bg-[#F6F7F9] pl-11 pr-4 text-sm font-semibold outline-none focus:border-[var(--tek-accent)] focus:bg-white focus:ring-4 focus:ring-[rgba(70,157,139,0.14)]"
              />
            </div>
          </form>

          <div className="mt-4 grid gap-2">
            {categoryNavItems.map((item) => (
              <Link
                key={item.label}
                to={item.path}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between rounded-md border border-[#E4E7EC] px-4 py-3 text-sm font-black text-[#0A0A0A] transition hover:border-[#0A0A0A]"
              >
                <span className="inline-flex items-center gap-2">
                  {item.label === "Business Solutions" && (
                    <FiBriefcase aria-hidden="true" />
                  )}
                  {item.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}

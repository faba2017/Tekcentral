import { Link } from "react-router-dom";
import {
  FiBookmark,
  FiBriefcase,
  FiMapPin,
  FiPackage,
  FiRefreshCw,
  FiShoppingBag,
  FiUser,
} from "react-icons/fi";
import { usePageTitle } from "@/lib/page-title";

const plannedCapabilities = [
  {
    label: "Orders",
    description: "Track purchases and order history.",
    icon: FiPackage,
    to: "/orders",
  },
  { label: "Saved addresses", description: "Prepare delivery details for checkout.", icon: FiMapPin },
  { label: "Returns", description: "Keep returns and warranty requests organized.", icon: FiRefreshCw },
  { label: "Quotes", description: "Review business solution requests.", icon: FiBriefcase },
  { label: "Saved products", description: "Build shortlists for home, work and business.", icon: FiBookmark },
];

export function AccountPage() {
  usePageTitle("Account | TekCentral");

  return (
    <section className="bg-[radial-gradient(circle_at_88%_12%,rgba(70,157,139,0.14),transparent_30%),linear-gradient(135deg,#F8FAFA_0%,#EEF5F3_100%)] px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-lg bg-[radial-gradient(circle_at_80%_18%,rgba(70,157,139,0.24),transparent_34%),linear-gradient(135deg,#080A0A_0%,#101716_60%,#10231F_100%)] p-6 text-white shadow-sm sm:p-8">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">
              TekCentral Account
            </p>
            <h1 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">
              Your technology buying profile.
            </h1>
            <p className="mt-5 text-base leading-7 text-white/72">
              Save products, manage technology planning and prepare for a smoother
              TekCentral shopping experience.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                className="rounded-md border border-white/18 bg-white/10 px-5 py-3 text-sm font-black text-white opacity-80"
                aria-disabled="true"
              >
                Sign in
              </button>
              <button
                type="button"
                className="rounded-md bg-[var(--tek-accent)] px-5 py-3 text-sm font-black text-[var(--tek-accent-ink)] opacity-80"
                aria-disabled="true"
              >
                Create account
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-[#E4E7EC] bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-[rgba(70,157,139,0.14)] text-[var(--tek-accent-ink)]">
                <FiUser aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-2xl font-black text-[#0A0A0A]">
                  Account services for smarter shopping.
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#3F4652]">
                  Keep your orders, quotes, returns and saved products in one place.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {plannedCapabilities.map((item) => {
                const Icon = item.icon;
                const content = (
                  <>
                    <Icon className="text-[var(--tek-accent)]" aria-hidden="true" />
                    <h3 className="mt-3 text-sm font-black text-[#0A0A0A]">
                      {item.label}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-[#727986]">
                      {item.description}
                    </p>
                  </>
                );
                if ("to" in item && item.to) {
                  return (
                    <Link
                      key={item.label}
                      to={item.to}
                      className="rounded-md bg-[#F6F7F9] p-4 transition hover:bg-[#EEF5F3]"
                    >
                      {content}
                    </Link>
                  );
                }
                return (
                  <article key={item.label} className="rounded-md bg-[#F6F7F9] p-4">
                    {content}
                  </article>
                );
              })}
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/shop"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--tek-accent)] px-5 py-3 text-sm font-black text-[var(--tek-accent-ink)] transition hover:bg-[var(--tek-accent-hover)]"
              >
                <FiShoppingBag aria-hidden="true" />
                Continue Shopping
              </Link>
              <Link
                to="/zeus"
                className="inline-flex items-center justify-center rounded-md border border-[#E4E7EC] px-5 py-3 text-sm font-black text-[#0A0A0A] transition hover:border-[#0A0A0A]"
              >
                Ask Zeus
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

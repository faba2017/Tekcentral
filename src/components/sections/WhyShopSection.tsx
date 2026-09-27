import { FiBriefcase, FiCpu, FiSearch, FiShoppingBag } from "react-icons/fi";

const benefits = [
  {
    title: "Curated technology",
    description: "A store structure focused on practical home, work and business needs.",
    icon: FiShoppingBag,
  },
  {
    title: "Guided discovery",
    description: "Search, categories and Zeus assistance are designed around outcomes.",
    icon: FiSearch,
  },
  {
    title: "Business-ready scope",
    description: "Procurement, office setup, networking, security and power are first-class paths.",
    icon: FiBriefcase,
  },
  {
    title: "More choice, better fit",
    description: "Find technology around your requirements rather than a single product path.",
    icon: FiCpu,
  },
];

export function WhyShopSection() {
  return (
    <section className="bg-[#F6F7F9] px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">
              Service benefits
            </p>
            <h2 className="mt-3 text-3xl font-black leading-tight text-[#0A0A0A] sm:text-4xl">
              Built for confident technology decisions.
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {benefits.map((benefit) => {
              const Icon = benefit.icon;
              return (
                <div
                  key={benefit.title}
                  className="rounded-lg border border-[#E4E7EC] bg-white p-5 transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_44px_rgba(10,10,10,0.08)]"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-md bg-[var(--tek-accent)] text-[var(--tek-accent-ink)]">
                    <Icon aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-lg font-black text-[#0A0A0A]">
                    {benefit.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[#727986]">
                    {benefit.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

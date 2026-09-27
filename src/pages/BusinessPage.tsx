import { Link, useSearchParams } from "react-router-dom";
import {
  FiArrowRight,
  FiBriefcase,
  FiCheckCircle,
  FiPrinter,
  FiServer,
  FiShield,
  FiWifi,
  FiZap,
} from "react-icons/fi";
import { getProductBySlug } from "@/data/catalogue";
import { usePageTitle } from "@/lib/page-title";

const solutionCards = [
  {
    title: "Office Setup",
    description: "Workstations, monitors, docking, meeting rooms and daily productivity equipment.",
    icon: FiBriefcase,
  },
  {
    title: "Network Infrastructure",
    description: "Routers, switching, Wi-Fi, PoE and cabling plans for practical coverage.",
    icon: FiWifi,
  },
  {
    title: "CCTV & Security",
    description: "Camera, recording and access-control product planning for sites and offices.",
    icon: FiShield,
  },
  {
    title: "Printing Solutions",
    description: "Printer and scanner selection for teams, counters and office workflows.",
    icon: FiPrinter,
  },
  {
    title: "Backup Power",
    description: "UPS and backup power equipment paths for continuity planning.",
    icon: FiZap,
  },
  {
    title: "IT Equipment Procurement",
    description: "Coordinated technology purchasing for teams, offices and sites.",
    icon: FiServer,
  },
];

const steps = [
  "Tell us about your site, users and requirements.",
  "Identify suitable technology and solution areas.",
  "Review the solution and request a quotation.",
];

export function BusinessPage() {
  usePageTitle("Business Solutions | TekCentral");
  const [params] = useSearchParams();
  const product = params.get("product")
    ? getProductBySlug(params.get("product") ?? "")
    : undefined;

  return (
    <section className="bg-white">
      <div className="bg-[radial-gradient(circle_at_78%_30%,rgba(70,157,139,0.28),transparent_34%),linear-gradient(135deg,#080A0A_0%,#0E1514_55%,#162A26_100%)] px-4 py-16 text-white sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">
              TekCentral Business
            </p>
            <h1 className="mt-4 text-4xl font-black leading-tight sm:text-6xl">
              Business technology, planned around outcomes.
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-white/70">
              Plan office technology, network infrastructure, security, printing,
              backup power and IT equipment procurement through one coordinated
              TekCentral experience.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/zeus?context=business"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--tek-accent)] px-5 py-3 text-sm font-black text-[var(--tek-accent-ink)] transition hover:bg-[var(--tek-accent-hover)]"
              >
                Ask Zeus for Business
                <FiArrowRight aria-hidden="true" />
              </Link>
              <Link
                to="/contact"
                className="inline-flex items-center justify-center rounded-md border border-white/20 bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/15"
              >
                Request a Quote
              </Link>
            </div>
          </div>
          <div className="rounded-lg border border-white/[0.12] bg-white/[0.06] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur">
            <div className="rounded-md bg-white p-5 text-[#0A0A0A]">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--tek-accent)]">
                How it works
              </p>
              <h2 className="mt-3 text-2xl font-black">Plan your solution</h2>
              <div className="mt-5 grid gap-3">
                {steps.map((step, index) => (
                  <div key={step} className="flex gap-3 rounded-md bg-[#F6F7F9] p-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--tek-accent)] text-xs font-black text-[var(--tek-accent-ink)]">
                      {index + 1}
                    </span>
                    <p className="text-sm font-semibold leading-6 text-[#3F4652]">{step}</p>
                  </div>
                ))}
              </div>
              {product && (
                <div className="mt-5 rounded-md border border-[#E4E7EC] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#727986]">
                    Product context
                  </p>
                  <p className="mt-2 text-sm font-black text-[#0A0A0A]">
                    {product.brand} {product.name}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">
              Solution areas
            </p>
            <h2 className="mt-3 text-3xl font-black leading-tight text-[#0A0A0A] sm:text-4xl">
              Practical technology paths for teams and sites.
            </h2>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {solutionCards.map((solution) => {
              const Icon = solution.icon;
              return (
                <article
                  key={solution.title}
                  className="rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-[0_18px_44px_rgba(10,10,10,0.08)]"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-md bg-[var(--tek-accent)] text-[var(--tek-accent-ink)]">
                    <Icon aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-lg font-black text-[#0A0A0A]">
                    {solution.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[#727986]">
                    {solution.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-[#F6F7F9] px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">
              Procurement
            </p>
            <h2 className="mt-3 text-3xl font-black leading-tight text-[#0A0A0A]">
              Technology procurement built around your requirements.
            </h2>
            <p className="mt-4 text-base leading-7 text-[#3F4652]">
              Build a practical path for equipment, service needs and business
              quotations.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {["Flexible procurement", "Solution guidance", "Business quotations"].map(
              (item) => (
                <div key={item} className="rounded-lg bg-white p-4 shadow-sm">
                  <FiCheckCircle className="text-[var(--tek-accent)]" aria-hidden="true" />
                  <p className="mt-3 text-sm font-black text-[#0A0A0A]">{item}</p>
                </div>
              ),
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

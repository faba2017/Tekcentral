import { FiArrowRight, FiCheckCircle } from "react-icons/fi";
import { businessSolutions } from "@/data/catalogue";

interface BusinessSolutionsSectionProps {
  onNavigate: (path: string) => void;
}

export function BusinessSolutionsSection({
  onNavigate,
}: BusinessSolutionsSectionProps) {
  return (
    <section className="bg-[#F6F7F9] px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="relative min-h-[420px] overflow-hidden rounded-lg bg-[#0A0A0A] p-6 text-white">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_28%,rgba(70,157,139,0.28),transparent_34%),linear-gradient(135deg,rgba(70,157,139,0.12),transparent_48%)]" />
          <div className="absolute bottom-8 left-8 right-8 grid h-24 grid-cols-3 gap-3 rounded-lg border border-white/[0.12] bg-white/[0.08] p-3 shadow-2xl backdrop-blur">
            <span className="rounded-md bg-white/[0.1]" />
            <span className="rounded-md bg-white/[0.08]" />
            <span className="rounded-md bg-[rgba(70,157,139,0.2)]" />
          </div>
          <div className="absolute bottom-24 left-14 h-44 w-64 rounded-lg border border-white/[0.14] bg-white/10 p-4 shadow-2xl backdrop-blur">
            <div className="h-3 w-24 rounded-full bg-[var(--tek-accent)]" />
            <div className="mt-8 grid gap-2">
              <span className="h-3 rounded-full bg-white/30" />
              <span className="h-3 w-3/4 rounded-full bg-white/20" />
              <span className="h-3 w-1/2 rounded-full bg-white/20" />
            </div>
          </div>
          <div className="absolute bottom-36 right-16 h-28 w-28 rounded-lg border border-[rgba(70,157,139,0.5)] bg-[rgba(70,157,139,0.1)]" />
          <div className="relative">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">
              Business technology
            </p>
            <p className="mt-3 max-w-sm text-2xl font-black leading-tight">
              Office equipment, networks, security and procurement in one place.
            </p>
          </div>
        </div>

        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">
            Business solutions
          </p>
          <h2 className="mt-3 text-3xl font-black leading-tight text-[#0A0A0A] sm:text-4xl lg:text-[2.65rem]">
            Technology planning for teams, offices and growing sites.
          </h2>
          <p className="mt-5 text-base leading-7 text-[#727986] sm:text-lg">
            Plan business technology with a storefront built for complete
            outcomes, from workstations and Wi-Fi to cameras, printing and
            backup power.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {businessSolutions.map((solution) => (
              <button
                key={solution}
                type="button"
                onClick={() => onNavigate("/business")}
                className="group flex items-center gap-3 rounded-md border border-[#E4E7EC] bg-white px-4 py-3 text-left text-sm font-black text-[#0A0A0A] shadow-sm transition hover:-translate-y-0.5 hover:border-[#0A0A0A] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tek-accent)]"
              >
                <FiCheckCircle
                  className="shrink-0 text-[var(--tek-accent)]"
                  aria-hidden="true"
                />
                {solution}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onNavigate("/business")}
            className="mt-8 inline-flex items-center gap-2 rounded-md bg-[var(--tek-accent)] px-5 py-3 text-sm font-black text-[var(--tek-accent-ink)] transition hover:bg-[var(--tek-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tek-accent)] focus-visible:ring-offset-4"
          >
            Explore Business Solutions
            <FiArrowRight aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}

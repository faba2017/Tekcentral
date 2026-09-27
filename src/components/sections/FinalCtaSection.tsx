interface FinalCtaSectionProps {
  onNavigate: (path: string) => void;
}

export function FinalCtaSection({ onNavigate }: FinalCtaSectionProps) {
  return (
    <section className="bg-[radial-gradient(circle_at_86%_18%,rgba(255,255,255,0.24),transparent_30%),linear-gradient(135deg,var(--tek-accent)_0%,#5EAFA0_100%)] px-4 py-20 text-[#0A0A0A] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0A0A0A]/70">
            TekCentral
          </p>
          <h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
            Shop smarter technology for home, work and business.
          </h2>
          <p className="mt-4 text-base font-semibold leading-7 text-[#0A0A0A]/72">
            Browse the store, explore business solutions, or ask Zeus to guide
            your next technology decision.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => onNavigate("/shop")}
            className="rounded-md bg-[#0A0A0A] px-5 py-3 text-sm font-black text-white transition hover:bg-[#162A26] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0A0A0A] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--tek-accent)]"
          >
            Shop Technology
          </button>
          <button
            type="button"
            onClick={() => onNavigate("/zeus")}
            className="rounded-md border border-[#0A0A0A]/20 bg-white/55 px-5 py-3 text-sm font-black text-[#0A0A0A] transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0A0A0A] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--tek-accent)]"
          >
            Ask Zeus
          </button>
          <button
            type="button"
            onClick={() => onNavigate("/business")}
            className="rounded-md border border-[#0A0A0A]/20 bg-white/55 px-5 py-3 text-sm font-black text-[#0A0A0A] transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0A0A0A] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--tek-accent)]"
          >
            Business Solutions
          </button>
        </div>
      </div>
    </section>
  );
}

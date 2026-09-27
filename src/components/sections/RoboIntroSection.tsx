import { FiArrowRight, FiMessageCircle, FiSend } from "react-icons/fi";

interface RoboIntroSectionProps {
  onNavigate: (path: string) => void;
}

const promptChips = [
  "Build office Wi-Fi",
  "Choose a printer",
  "Business laptops",
  "CCTV setup",
];

export function RoboIntroSection({ onNavigate }: RoboIntroSectionProps) {
  return (
    <section className="bg-[#0A0A0A] px-4 py-20 text-white sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">
            Meet Zeus
          </p>
          <h2 className="mt-3 text-4xl font-black leading-tight sm:text-5xl">
            Your AI technology assistant.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-white/[0.68] sm:text-lg">
            Describe what you want to achieve and Zeus helps turn technology
            choices into a clearer shopping path for home, work and business.
          </p>
          <button
            type="button"
            onClick={() => onNavigate("/zeus")}
            className="mt-8 inline-flex items-center gap-2 rounded-md bg-[var(--tek-accent)] px-5 py-3 text-sm font-black text-[var(--tek-accent-ink)] transition hover:bg-[var(--tek-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tek-accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[#0A0A0A]"
          >
            Ask Zeus
            <FiArrowRight aria-hidden="true" />
          </button>
        </div>

        <div className="rounded-lg border border-white/[0.12] bg-white/[0.06] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.36)] backdrop-blur">
          <div className="rounded-md bg-white p-4 text-[#0A0A0A]">
            <div className="flex items-center gap-3 border-b border-[#E4E7EC] pb-4">
              <span className="grid h-11 w-11 place-items-center rounded-md bg-[var(--tek-accent)] text-[var(--tek-accent-ink)]">
                <FiMessageCircle aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-black">Ask Zeus what you need...</h3>
                <p className="text-sm font-semibold text-[#727986]">
                  Product guidance for practical technology outcomes
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("/zeus")}
              className="mt-4 flex w-full items-center justify-between rounded-md border border-[#E4E7EC] bg-[#F6F7F9] px-4 py-4 text-left text-sm font-semibold text-[#727986] transition hover:border-[var(--tek-accent)] hover:bg-white"
            >
              Tell Zeus what you need for home, work or business
              <span className="grid h-9 w-9 place-items-center rounded-md bg-[var(--tek-accent)] text-[var(--tek-accent-ink)]">
                <FiSend aria-hidden="true" />
              </span>
            </button>
            <div className="mt-4 flex flex-wrap gap-2">
              {promptChips.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onNavigate("/zeus")}
                  className="rounded-full border border-[#E4E7EC] px-3 py-2 text-xs font-black text-[#3F4652] transition hover:border-[#0A0A0A] hover:text-[#0A0A0A]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

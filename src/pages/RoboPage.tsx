import { Link, useSearchParams } from "react-router-dom";
import { FiArrowRight, FiBriefcase, FiCpu, FiMessageCircle, FiSearch, FiSend } from "react-icons/fi";
import { getProductBySlug } from "@/data/catalogue";
import { usePageTitle } from "@/lib/page-title";

export function RoboPage() {
  usePageTitle("Zeus | TekCentral");
  const [params] = useSearchParams();
  const product = params.get("product")
    ? getProductBySlug(params.get("product") ?? "")
    : undefined;
  const context = params.get("context");

  const contextText = product
    ? `${product.brand} ${product.name}`
    : context
      ? context.replace("-", " ")
      : "Start with a product, category or business requirement.";

  return (
    <section className="bg-[radial-gradient(circle_at_88%_14%,rgba(70,157,139,0.16),transparent_30%),linear-gradient(135deg,#FFFFFF_0%,#EEF5F3_100%)] px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
        <div className="lg:sticky lg:top-32">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">
            Zeus assistant
          </p>
          <h1 className="mt-4 text-4xl font-black leading-tight text-[#0A0A0A] sm:text-6xl">
            Describe the outcome. Zeus helps shape the path.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[#727986]">
            Zeus is TekCentral's technology assistant for product guidance and
            business technology planning.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {[
              { icon: FiSearch, title: "Products", text: "Compare practical options." },
              { icon: FiBriefcase, title: "Business", text: "Plan teams, offices and sites." },
              { icon: FiCpu, title: "Context", text: "Start from a product or category." },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-lg border border-[#E4E7EC] p-4">
                  <Icon className="text-[var(--tek-accent)]" aria-hidden="true" />
                  <p className="mt-3 text-sm font-black text-[#0A0A0A]">{item.title}</p>
                  <p className="mt-1 text-sm leading-6 text-[#727986]">{item.text}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-[#E4E7EC] bg-[#F6F7F9] p-4 shadow-sm sm:p-6">
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3 border-b border-[#E4E7EC] pb-4">
              <span className="grid h-11 w-11 place-items-center rounded-md bg-[var(--tek-accent)] text-[var(--tek-accent-ink)]">
                <FiMessageCircle aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-black text-[#0A0A0A]">Ask Zeus</h2>
                <p className="text-sm font-semibold text-[#727986]">
                  Guided shopping assistant
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-md border border-[#E4E7EC] bg-[#F6F7F9] p-4">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#727986]">
                Current context
              </p>
              <p className="mt-2 text-sm font-black capitalize text-[#0A0A0A]">
                {contextText}
              </p>
            </div>

            <label htmlFor="zeus-question" className="mt-6 block text-sm font-black text-[#0A0A0A]">
              What do you need help choosing?
            </label>
            <div className="mt-2 flex gap-2 rounded-md border border-[#E4E7EC] bg-white p-2 focus-within:border-[var(--tek-accent)] focus-within:ring-4 focus-within:ring-[rgba(70,157,139,0.14)]">
              <input
                id="zeus-question"
                placeholder="Example: Wi-Fi for a guesthouse, laptops for a team..."
                className="min-w-0 flex-1 px-2 text-sm font-semibold outline-none placeholder:text-[#727986]"
              />
              <button
                type="button"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[var(--tek-accent)] text-[var(--tek-accent-ink)] transition hover:bg-[var(--tek-accent-hover)]"
                aria-label="Preview Zeus response"
              >
                <FiSend aria-hidden="true" />
              </button>
            </div>

            <div className="mt-6 grid gap-3">
              {[
                "I need Wi-Fi for a 20-room guesthouse.",
                "We need laptops for 15 employees.",
                "Which printer is best for 5,000 pages per month?",
                "Build me a small office network.",
              ].map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="group flex items-center justify-between gap-3 rounded-md border border-[#E4E7EC] bg-[#F6F7F9] p-4 text-left text-sm font-semibold leading-6 text-[#3F4652] transition hover:border-[#0A0A0A] hover:bg-white"
                >
                  <span>{prompt}</span>
                  <FiArrowRight
                    className="shrink-0 transition group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link
              to="/shop"
              className="rounded-md bg-[var(--tek-accent)] px-5 py-3 text-center text-sm font-black text-[var(--tek-accent-ink)] transition hover:bg-[var(--tek-accent-hover)]"
            >
              Browse Products
            </Link>
            <Link
              to="/business"
              className="rounded-md border border-[#E4E7EC] bg-white px-5 py-3 text-center text-sm font-black text-[#0A0A0A] transition hover:border-[#0A0A0A]"
            >
              Business Solutions
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

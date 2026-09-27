import { Link } from "react-router-dom";
import { FiBriefcase, FiCpu, FiMessageCircle, FiShoppingBag } from "react-icons/fi";
import { usePageTitle } from "@/lib/page-title";

const focusAreas = [
  {
    title: "Online technology shopping",
    text: "Computers, networking, printing, security, power and smart technology organised for clear product discovery.",
    icon: FiShoppingBag,
  },
  {
    title: "Guided assistance",
    text: "Zeus helps customers describe their requirements, understand options and find technology that fits.",
    icon: FiMessageCircle,
  },
  {
    title: "Business technology",
    text: "TekCentral Business supports equipment procurement, office technology, network planning, security, printing and power requirements.",
    icon: FiBriefcase,
  },
];

export function AboutPage() {
  usePageTitle("About | TekCentral");

  return (
    <section className="bg-white">
      <div className="bg-[radial-gradient(circle_at_18%_28%,rgba(70,157,139,0.24),transparent_32%),linear-gradient(145deg,#080A0A_0%,#111716_58%,#10231F_100%)] px-4 py-16 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">
            About TekCentral
          </p>
          <h1 className="mt-4 max-w-4xl text-4xl font-black leading-tight sm:text-6xl">
            Technology for home, work and business.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-white/72">
            TekCentral is a South African technology store combining practical
            ecommerce, guided technology discovery and business technology
            solutions.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-5 md:grid-cols-3">
          {focusAreas.map((item) => {
            const Icon = item.icon;
            return (
              <article
                key={item.title}
                className="rounded-lg border border-[#E4E7EC] bg-white p-6 shadow-sm"
              >
                <span className="grid h-11 w-11 place-items-center rounded-md bg-[rgba(70,157,139,0.14)] text-[var(--tek-accent-ink)]">
                  <Icon aria-hidden="true" />
                </span>
                <h2 className="mt-5 text-xl font-black text-[#0A0A0A]">
                  {item.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-[#3F4652]">{item.text}</p>
              </article>
            );
          })}
        </div>

        <div className="mt-12 grid gap-8 rounded-lg bg-[radial-gradient(circle_at_92%_18%,rgba(70,157,139,0.14),transparent_32%),linear-gradient(135deg,#F8FAFA_0%,#EEF5F3_100%)] p-6 sm:p-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.16em] text-[var(--tek-accent)]">
              Zeus
            </p>
            <h2 className="mt-3 text-3xl font-black text-[#0A0A0A]">
              A smarter way to choose technology.
            </h2>
          </div>
          <div className="space-y-4 text-base leading-7 text-[#3F4652]">
            <p>
              Zeus is TekCentral's technology assistant, designed to make product
              discovery and technology planning clearer for individuals and
              businesses.
            </p>
            <p>
              TekCentral is focused on making product discovery clearer across
              personal shopping, workplace upgrades and business procurement.
            </p>
            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <Link
                to="/shop"
                className="rounded-md bg-[var(--tek-accent)] px-5 py-3 text-center text-sm font-black text-[var(--tek-accent-ink)] transition hover:bg-[var(--tek-accent-hover)]"
              >
                Shop Technology
              </Link>
              <Link
                to="/business"
                className="rounded-md border border-[#E4E7EC] bg-white px-5 py-3 text-center text-sm font-black text-[#0A0A0A] transition hover:border-[#0A0A0A]"
              >
                TekCentral Business
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-10 flex items-center gap-3 rounded-lg border border-[#E4E7EC] p-5">
          <FiCpu className="shrink-0 text-[var(--tek-accent)]" aria-hidden="true" />
          <p className="text-sm font-semibold leading-6 text-[#3F4652]">
            Technology, made easier.
          </p>
        </div>
      </div>
    </section>
  );
}

import { FormEvent, useState } from "react";
import { FiArrowRight, FiBriefcase, FiMessageCircle, FiPackage } from "react-icons/fi";
import { Link } from "react-router-dom";
import { usePageTitle } from "@/lib/page-title";

const enquiryTypes = [
  "Product enquiry",
  "Business solution",
  "Order support",
  "Returns / warranty",
  "General enquiry",
];

export function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  usePageTitle("Contact | TekCentral");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
  };

  return (
    <section className="bg-[radial-gradient(circle_at_88%_12%,rgba(70,157,139,0.14),transparent_30%),linear-gradient(135deg,#F8FAFA_0%,#EEF5F3_100%)] px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
          <div className="rounded-lg bg-[radial-gradient(circle_at_80%_20%,rgba(70,157,139,0.24),transparent_34%),linear-gradient(135deg,#080A0A_0%,#0E1514_58%,#162A26_100%)] p-6 text-white sm:p-8">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">
              Contact
            </p>
            <h1 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">
              Send a product or business enquiry.
            </h1>
            <p className="mt-5 text-base leading-7 text-white/72">
              Share what you need and TekCentral will shape the right product or
              business technology path.
            </p>

            <div className="mt-8 grid gap-3">
              {[
                { title: "Product guidance", icon: FiPackage },
                { title: "Business planning", icon: FiBriefcase },
                { title: "Zeus assistance", icon: FiMessageCircle },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="flex items-center gap-3 rounded-md border border-white/12 bg-white/6 p-3"
                  >
                    <Icon className="text-[var(--tek-accent)]" aria-hidden="true" />
                    <span className="text-sm font-bold">{item.title}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-lg border border-[#E4E7EC] bg-white p-6 shadow-sm sm:p-8"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-black text-[#0A0A0A]">
                Name
                <input
                  required
                  className="h-12 rounded-md border border-[#E4E7EC] bg-[#F6F7F9] px-4 text-sm font-semibold outline-none focus:border-[var(--tek-accent)] focus:bg-white focus:ring-4 focus:ring-[rgba(70,157,139,0.14)]"
                  placeholder="Your name"
                />
              </label>
              <label className="grid gap-2 text-sm font-black text-[#0A0A0A]">
                Email
                <input
                  required
                  type="email"
                  className="h-12 rounded-md border border-[#E4E7EC] bg-[#F6F7F9] px-4 text-sm font-semibold outline-none focus:border-[var(--tek-accent)] focus:bg-white focus:ring-4 focus:ring-[rgba(70,157,139,0.14)]"
                  placeholder="you@example.com"
                />
              </label>
            </div>

            <label className="mt-4 grid gap-2 text-sm font-black text-[#0A0A0A]">
              Enquiry type
              <select className="h-12 rounded-md border border-[#E4E7EC] bg-[#F6F7F9] px-4 text-sm font-semibold outline-none focus:border-[var(--tek-accent)] focus:bg-white focus:ring-4 focus:ring-[rgba(70,157,139,0.14)]">
                {enquiryTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>

            <label className="mt-4 grid gap-2 text-sm font-black text-[#0A0A0A]">
              Message
              <textarea
                required
                rows={6}
                className="resize-none rounded-md border border-[#E4E7EC] bg-[#F6F7F9] px-4 py-3 text-sm font-semibold outline-none focus:border-[var(--tek-accent)] focus:bg-white focus:ring-4 focus:ring-[rgba(70,157,139,0.14)]"
                placeholder="Tell us what technology you need."
              />
            </label>

            {submitted && (
              <p className="mt-4 rounded-md bg-[rgba(70,157,139,0.14)] px-4 py-3 text-sm font-bold text-[#0A0A0A]">
                Enquiry noted. TekCentral contact handling will be available at
                launch.
              </p>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--tek-accent)] px-5 py-3 text-sm font-black text-[var(--tek-accent-ink)] transition hover:bg-[var(--tek-accent-hover)]"
              >
                Send Enquiry
                <FiArrowRight aria-hidden="true" />
              </button>
              <Link
                to="/zeus"
                className="inline-flex items-center justify-center rounded-md border border-[#E4E7EC] px-5 py-3 text-sm font-black text-[#0A0A0A] transition hover:border-[#0A0A0A]"
              >
                Ask Zeus Instead
              </Link>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

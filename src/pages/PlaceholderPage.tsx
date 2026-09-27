import { Link } from "react-router-dom";
import { usePageTitle } from "@/lib/page-title";

interface PlaceholderPageProps {
  title: string;
  eyebrow: string;
  description: string;
  isNotFound?: boolean;
}

export function PlaceholderPage({
  title,
  eyebrow,
  description,
  isNotFound = false,
}: PlaceholderPageProps) {
  usePageTitle(`${title} | TekCentral`);

  return (
    <section className="min-h-[70vh] bg-white px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-zinc-500">
          {eyebrow}
        </p>
        <h1 className="mt-4 text-4xl font-black text-zinc-950 sm:text-6xl">
          {title}
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-600">
          {description}
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            to="/"
            className="rounded-md bg-zinc-950 px-5 py-3 text-sm font-black text-white"
          >
            Back to Home
          </Link>
          <Link
            to="/shop"
            className="rounded-md border border-zinc-200 px-5 py-3 text-sm font-black text-zinc-950"
          >
            Shop Technology
          </Link>
          {isNotFound && (
            <Link
              to="/zeus"
              className="rounded-md border border-zinc-200 px-5 py-3 text-sm font-black text-zinc-950"
            >
              Ask Zeus
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

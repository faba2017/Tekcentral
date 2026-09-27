import { FiArrowRight } from "react-icons/fi";

interface FeaturedCollectionsSectionProps {
  onNavigate: (path: string) => void;
}

const collections = [
  {
    title: "Business Laptops",
    description: "Portable work machines, docks and displays for productive teams.",
    cta: "Shop laptops",
    path: "/category/computers",
    badge: "Work ready",
    visual: "Laptop fleet",
  },
  {
    title: "Build Your Wi-Fi",
    description: "Routers, access points, switches and cabling for better coverage.",
    cta: "Plan networking",
    path: "/category/networking",
    badge: "Coverage",
    visual: "Wi-Fi kit",
  },
  {
    title: "Office Printing",
    description: "Printers, scanners and office devices for everyday workflows.",
    cta: "Shop office tech",
    path: "/category/printing-office",
    badge: "Office",
    visual: "Print station",
  },
];

export function FeaturedCollectionsSection({
  onNavigate,
}: FeaturedCollectionsSectionProps) {
  return (
    <section className="bg-white px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-5 lg:grid-cols-3">
          {collections.map((collection) => (
            <button
              key={collection.title}
              type="button"
              onClick={() => onNavigate(collection.path)}
              className="group relative min-h-[340px] overflow-hidden rounded-lg bg-[#0A0A0A] p-6 text-left text-white shadow-[0_20px_60px_rgba(10,10,10,0.16)] transition duration-300 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tek-accent)] focus-visible:ring-offset-4"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(70,157,139,0.26),transparent_30%),linear-gradient(135deg,rgba(70,157,139,0.12),transparent_46%)] transition duration-500 group-hover:scale-105" />
              <div className="absolute right-5 top-5 rounded-full border border-white/[0.14] bg-white/[0.08] px-3 py-1 text-[0.65rem] font-black uppercase tracking-[0.16em] text-white/70">
                Featured
              </div>
              <div className="absolute bottom-8 right-6 hidden w-[48%] max-w-[230px] sm:block">
                <div className="aspect-[4/3] rounded-lg border border-white/[0.16] bg-white/[0.1] p-3 shadow-2xl backdrop-blur">
                  <div className="h-full rounded-md border border-white/[0.12] bg-white/[0.08] p-3">
                    <div className="h-3 w-16 rounded-full bg-[var(--tek-accent)]" />
                    <div className="mt-8 h-20 rounded-md border border-white/[0.14] bg-black/25" />
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <span className="h-2 rounded-full bg-white/30" />
                      <span className="h-2 rounded-full bg-white/20" />
                      <span className="h-2 rounded-full bg-white/20" />
                    </div>
                  </div>
                </div>
                <div className="mx-auto mt-3 h-3 w-36 rounded-full bg-black/35 blur-md" />
              </div>
              <div className="relative flex min-h-[292px] flex-col">
                <span className="w-fit rounded-full border border-white/[0.15] bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[var(--tek-accent)]">
                  {collection.badge}
                </span>
                <div className="mt-auto max-w-sm min-w-0">
                  <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-white/45">
                    {collection.visual}
                  </p>
                  <h2 className="text-3xl font-black leading-tight">
                    {collection.title}
                  </h2>
                  <p className="mt-3 max-w-[17rem] text-sm font-medium leading-6 text-white/[0.72] sm:max-w-sm">
                    {collection.description}
                  </p>
                  <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-white">
                    {collection.cta}
                    <FiArrowRight
                      className="transition group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

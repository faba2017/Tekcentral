import { FiArrowRight } from "react-icons/fi";
import { categories } from "@/data/catalogue";
import { SectionHeader } from "@/components/sections/SectionHeader";

interface CategorySectionProps {
  onNavigate: (path: string) => void;
}

const categoryInitials: Record<string, string> = {
  computers: "PC",
  networking: "Wi",
  "printing-office": "Pr",
  security: "Se",
  power: "Pw",
  "smart-tech": "Ai",
  accessories: "Ac",
};

export function CategorySection({ onNavigate }: CategorySectionProps) {
  return (
    <section className="bg-[#F6F7F9] px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeader
          eyebrow="Shop by category"
          title="Find the right technology faster."
          description="Browse the core TekCentral departments for home, work and business needs."
        />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((category, index) => (
            <button
              key={category.slug}
              type="button"
              onClick={() => onNavigate(`/category/${category.slug}`)}
              className="group overflow-hidden rounded-lg border border-[#E4E7EC] bg-white text-left shadow-sm transition duration-300 hover:-translate-y-1 hover:border-[#BFC7D4] hover:shadow-[0_20px_48px_rgba(10,10,10,0.09)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tek-accent)] focus-visible:ring-offset-4"
            >
              <div className="relative aspect-[16/10] overflow-hidden bg-[#0A0A0A]">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_32%,rgba(70,157,139,0.3),transparent_36%),linear-gradient(135deg,rgba(70,157,139,0.14),transparent_45%)] transition duration-500 group-hover:scale-105" />
                <div className="absolute bottom-4 right-4 h-20 w-28 rounded-lg border border-white/[0.15] bg-white/10 shadow-2xl backdrop-blur" />
                <div className="absolute bottom-7 right-9 h-10 w-16 rounded border border-white/[0.12] bg-black/20" />
                <div className="absolute left-5 top-5 grid h-14 w-14 place-items-center rounded-lg border border-white/[0.15] bg-white/[0.08] text-lg font-black text-white backdrop-blur">
                  {categoryInitials[category.slug] ?? category.name.slice(0, 2)}
                </div>
                {index === 1 && (
                  <div className="absolute bottom-7 right-9 h-10 w-10 rounded-full border border-[rgba(70,157,139,0.6)]" />
                )}
              </div>
              <div className="p-5">
                <h3 className="text-xl font-black text-[#0A0A0A]">
                  {category.name}
                </h3>
                <p className="mt-2 min-h-12 text-sm leading-6 text-[#727986]">
                  {category.description}
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {category.subcategories.slice(0, 3).map((subcategory) => (
                    <span
                      key={subcategory}
                      className="rounded-full bg-[#F6F7F9] px-2.5 py-1 text-[0.68rem] font-bold text-[#3F4652]"
                    >
                      {subcategory}
                    </span>
                  ))}
                </div>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-[#0A0A0A]">
                  View category
                  <FiArrowRight
                    className="transition group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

import { Link, useLocation } from "react-router-dom";
import { useStorefrontCatalogue } from "@/state/catalogue";
import { useComparison } from "@/state/comparison";

export function ComparisonBar() {
  const { products } = useStorefrontCatalogue();
  const location = useLocation();
  const { productIds, clearComparison } = useComparison();
  const selected = products.filter((product) => productIds.includes(product.id));
  const canShow =
    location.pathname === "/shop" ||
    location.pathname.startsWith("/category/") ||
    location.pathname.startsWith("/product/");

  if (!canShow || selected.length === 0) return null;

  return (
    <aside className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 px-4 py-3 shadow-[0_-12px_30px_rgba(0,0,0,0.08)] backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-black text-zinc-950">
            Comparing {selected.length} of 3 products
          </p>
          <p className="mt-1 text-xs font-semibold text-zinc-500">
            {selected.map((product) => product.name).join(" | ")}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to={`/compare?ids=${selected.map((product) => product.id).join(",")}`}
            className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-black text-white"
          >
            Compare
          </Link>
          <button
            type="button"
            onClick={clearComparison}
            className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-black text-zinc-700"
          >
            Clear
          </button>
        </div>
      </div>
    </aside>
  );
}

import type { Product } from "@/types/product";
import { Link } from "react-router-dom";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProductVisual } from "@/components/commerce/ProductVisual";

interface ProductCardProps {
  product: Product;
  onAddToCart: (productId: string) => void;
  onCompare?: (productId: string) => void;
  isCompared?: boolean;
}

const stockLabels: Record<Product["stockStatus"], string> = {
  "in-stock": "Available",
  "low-stock": "Limited",
  "out-of-stock": "Unavailable",
  unknown: "Stock TBC",
};

export function ProductCard({
  product,
  onAddToCart,
  onCompare,
  isCompared = false,
}: ProductCardProps) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-lg border border-[#E4E7EC] bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:border-[#BFC7D4] hover:shadow-[0_18px_44px_rgba(10,10,10,0.09)]">
      <Link
        to={`/product/${product.slug}`}
        className="block overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tek-accent)]"
      >
        <div className="transition duration-500 group-hover:scale-[1.025]">
          <ProductVisual product={product} />
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[0.68rem] font-black uppercase tracking-[0.16em] text-[#727986]">
              {product.brand}
            </p>
            <h3 className="mt-2 text-lg font-black leading-6 text-[#0A0A0A]">
              <Link
                to={`/product/${product.slug}`}
                className="rounded-sm hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tek-accent)]"
              >
                {product.name}
              </Link>
            </h3>
            {product.model && (
              <p className="mt-1 text-xs font-semibold text-[#727986]">
                {product.model}
              </p>
            )}
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[0.68rem] font-black",
              product.stockStatus === "in-stock" && "bg-[#17B26A]/12 text-[#067647]",
              product.stockStatus === "low-stock" && "bg-[#F79009]/14 text-[#93370D]",
              product.stockStatus === "out-of-stock" && "bg-[#E4E7EC] text-[#3F4652]",
              product.stockStatus === "unknown" && "bg-[#F6F7F9] text-[#3F4652]",
            )}
          >
            {stockLabels[product.stockStatus]}
          </span>
        </div>
        <p className="mt-3 flex-1 text-sm leading-6 text-[#3F4652]">
          {product.shortDescription}
        </p>
        <div className="mt-5 border-t border-[#E4E7EC] pt-4">
          <div className="flex items-end justify-between gap-3">
            <p className="text-xl font-black text-[#0A0A0A]">
              {formatCurrency(product.price, product.currency)}
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onAddToCart(product.id)}
            className="rounded-md bg-[var(--tek-accent)] px-3 py-2.5 text-sm font-black text-[var(--tek-accent-ink)] transition hover:bg-[var(--tek-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tek-accent)] focus-visible:ring-offset-2"
          >
            Add to Cart
          </button>
          {onCompare && (
            <button
              type="button"
              onClick={() => onCompare(product.id)}
              className={cn(
                "rounded-md border px-3 py-2.5 text-sm font-black transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tek-accent)] focus-visible:ring-offset-2",
                isCompared
                  ? "border-[#0A0A0A] bg-[#F6F7F9] text-[#0A0A0A]"
                  : "border-[#E4E7EC] text-[#3F4652] hover:border-[#0A0A0A]",
              )}
            >
              {isCompared ? "Comparing" : "Compare"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

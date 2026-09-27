import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FiMinus, FiPlus } from "react-icons/fi";
import { useStorefrontCatalogue } from "@/state/catalogue";
import { getRelatedProducts } from "@/lib/catalogue";
import { formatCurrency } from "@/lib/format";
import { useCart } from "@/state/cart";
import { ProductVisual } from "@/components/commerce/ProductVisual";
import { ProductCard } from "@/components/commerce/ProductCard";
import { useComparison } from "@/state/comparison";
import { usePageTitle } from "@/lib/page-title";
import { ApiError, apiRequest } from "@/lib/api";
import type { Product } from "@/types/product";

const stockLabels = {
  "in-stock": "Available",
  "low-stock": "Limited",
  "out-of-stock": "Unavailable",
  unknown: "Stock TBC",
};

export function ProductDetailPage() {
  const { slug = "" } = useParams();
  const { products } = useStorefrontCatalogue();
  const catalogueProduct = products.find((item) => item.slug === slug);
  const [requestedDetail, setRequestedDetail] = useState<{ slug: string; status: "FOUND" | "NOT_FOUND" | "ERROR"; product?: Product }>({ slug: "", status: "NOT_FOUND" });
  const [requestVersion, setRequestVersion] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const { addProduct } = useCart();
  const { toggleProduct, isComparing } = useComparison();
  useEffect(() => {
    if (catalogueProduct) return;
    let active = true;
    apiRequest<{ product: Product }>(`/api/public/catalogue/${encodeURIComponent(slug)}`)
      .then((result) => { if (active) setRequestedDetail({ slug, status: "FOUND", product: result.product }); })
      .catch((error) => { if (active) setRequestedDetail({ slug, status: error instanceof ApiError && error.status === 404 ? "NOT_FOUND" : "ERROR" }); });
    return () => { active = false; };
  }, [slug, requestVersion, catalogueProduct]);
  const detail = catalogueProduct ? { status: "FOUND" as const, product: catalogueProduct } : requestedDetail.slug === slug ? requestedDetail : { status: "LOADING" as const, product: undefined };
  const product = detail.product;
  usePageTitle(product ? `${product.name} | TekCentral` : detail.status === "NOT_FOUND" ? "Product Not Found | TekCentral" : "Product | TekCentral");

  if (detail.status === "LOADING") return <ProductDetailLoading />;

  if (detail.status === "ERROR") {
    return <section className="px-4 py-20 sm:px-6 lg:px-8"><div className="mx-auto max-w-4xl"><p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">Product unavailable</p><h1 className="mt-4 text-4xl font-black text-zinc-950">We could not load this product.</h1><p className="mt-4 text-base font-semibold text-[#727986]">Check your connection and try again.</p><button type="button" onClick={() => setRequestVersion((value) => value + 1)} className="mt-8 rounded-md bg-[var(--tek-accent)] px-5 py-3 text-sm font-black text-[var(--tek-accent-ink)]">Try Again</button></div></section>;
  }

  if (detail.status === "NOT_FOUND" || !product) {
    return (
      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">
            Product not found
          </p>
          <h1 className="mt-4 text-4xl font-black text-zinc-950">
            This product does not exist.
          </h1>
          <Link
            to="/shop"
            className="mt-8 inline-flex rounded-md bg-[var(--tek-accent)] px-5 py-3 text-sm font-black text-[var(--tek-accent-ink)] transition hover:bg-[var(--tek-accent-hover)]"
          >
            Back to Shop
          </Link>
        </div>
      </section>
    );
  }

  const related = getRelatedProducts(product, products);

  return (
    <section className="bg-white px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <nav className="text-sm font-semibold text-zinc-500" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-zinc-950">
            Home
          </Link>
          <span className="px-2">/</span>
          <Link to="/shop" className="hover:text-zinc-950">
            Shop
          </Link>
          <span className="px-2">/</span>
          <Link to={`/category/${product.categorySlug}`} className="hover:text-zinc-950">
            {product.category}
          </Link>
        </nav>

        <div className="mt-8 grid gap-10 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="lg:sticky lg:top-32 lg:self-start">
            <ProductVisual product={product} large />
          </div>

          <div className="rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm sm:p-6">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">
              {product.brand}
            </p>
            <h1 className="mt-3 text-4xl font-black leading-tight text-[#0A0A0A] sm:text-5xl">
              {product.name}
            </h1>
            <p className="mt-3 text-sm font-semibold text-[#727986]">
              {product.model && `Model: ${product.model}`}
              {product.sku && ` | SKU: ${product.sku}`}
            </p>
            <div className="mt-6 flex flex-col gap-3 border-y border-[#E4E7EC] py-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-3xl font-black text-[#0A0A0A]">
                  {formatCurrency(product.price, product.currency)}
                </p>
              </div>
              <p className="w-fit rounded-full bg-[#F6F7F9] px-3 py-1.5 text-sm font-black text-[#3F4652]">
                {stockLabels[product.stockStatus]}
              </p>
            </div>
            <p className="mt-6 text-lg leading-8 text-[#3F4652]">
              {product.shortDescription}
            </p>

            {(product.specifications ?? []).some((spec) => spec.name.trim() && spec.value.trim()) && <div className="mt-8 rounded-lg border border-[#E4E7EC] bg-[#F6F7F9] p-5">
              <h2 className="text-lg font-black text-[#0A0A0A]">Key specifications</h2>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                {(product.specifications ?? []).filter((spec) => spec.name.trim() && spec.value.trim()).slice(0, 4).map((spec) => (
                  <div key={spec.name} className="rounded-md bg-white p-3">
                    <dt className="text-xs font-black uppercase tracking-[0.14em] text-[#727986]">
                      {spec.name}
                    </dt>
                    <dd className="mt-1 text-sm font-bold text-[#0A0A0A]">{spec.value}</dd>
                  </div>
                ))}
              </dl>
            </div>}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex h-11 w-36 items-center justify-between rounded-md border border-[#E4E7EC]">
                <button
                  type="button"
                  onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                  className="grid h-11 w-11 place-items-center"
                  aria-label="Decrease quantity"
                >
                  <FiMinus aria-hidden="true" />
                </button>
                <span className="text-sm font-black">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((value) => Math.min(99, value + 1))}
                  className="grid h-11 w-11 place-items-center"
                  aria-label="Increase quantity"
                >
                  <FiPlus aria-hidden="true" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => addProduct(product.id, quantity)}
                className="rounded-md bg-[var(--tek-accent)] px-5 py-3 text-sm font-black text-[var(--tek-accent-ink)] transition hover:bg-[var(--tek-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tek-accent)] focus-visible:ring-offset-4"
              >
                Add to Cart
              </button>
              <Link
                to={`/zeus?product=${product.slug}`}
                className="rounded-md border border-[#E4E7EC] px-5 py-3 text-center text-sm font-black text-[#0A0A0A] transition hover:border-[#0A0A0A]"
              >
                Ask Zeus about this product
              </Link>
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <Link
                to={`/business?product=${product.slug}`}
                className="rounded-md border border-[#E4E7EC] px-5 py-3 text-center text-sm font-black text-[#0A0A0A] transition hover:border-[#0A0A0A]"
              >
                Request a Business Quote
              </Link>
              <button
                type="button"
                onClick={() => toggleProduct(product.id)}
                className="rounded-md border border-[#E4E7EC] px-5 py-3 text-sm font-black text-[#0A0A0A] transition hover:border-[#0A0A0A]"
              >
                {isComparing(product.id) ? "Remove from Compare" : "Compare Product"}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-14 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-lg bg-[#F6F7F9] p-6">
            <h2 className="text-2xl font-black text-[#0A0A0A]">Product overview</h2>
            <p className="mt-4 text-base leading-7 text-[#3F4652]">
              {product.description ??
                "A practical technology option for home, work or business needs."}
            </p>
          </div>
          {(product.specifications ?? []).some((spec) => spec.name.trim() && spec.value.trim()) && <div>
            <h2 className="text-2xl font-black text-[#0A0A0A]">Technical specifications</h2>
            <dl className="mt-4 divide-y divide-[#E4E7EC] rounded-lg border border-[#E4E7EC]">
              {(product.specifications ?? []).filter((spec) => spec.name.trim() && spec.value.trim()).map((spec) => (
                <div key={spec.name} className="grid gap-2 p-4 sm:grid-cols-[180px_1fr]">
                  <dt className="text-sm font-black text-[#3F4652]">{spec.name}</dt>
                  <dd className="text-sm font-semibold text-[#0A0A0A]">{spec.value}</dd>
                </div>
              ))}
            </dl>
          </div>}
        </div>

        {related.length > 0 && (
          <div className="mt-16">
            <h2 className="text-2xl font-black text-[#0A0A0A]">Related products</h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <ProductCard
                  key={item.id}
                  product={item}
                  onAddToCart={addProduct}
                  onCompare={toggleProduct}
                  isCompared={isComparing(item.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ProductDetailLoading() {
  return <section className="bg-white px-4 py-10 sm:px-6 lg:px-8" aria-live="polite" aria-busy="true"><div className="mx-auto max-w-7xl"><span className="sr-only">Loading product...</span><div className="h-5 w-48 animate-pulse rounded bg-[#E4E7EC]" /><div className="mt-8 grid gap-10 lg:grid-cols-[0.95fr_1.05fr]"><div className="aspect-[5/4] animate-pulse rounded-md bg-[#F2F4F7]" /><div className="rounded-lg border border-[#E4E7EC] p-6"><div className="h-4 w-28 animate-pulse rounded bg-[#D0D5DD]" /><div className="mt-5 h-12 w-4/5 animate-pulse rounded bg-[#E4E7EC]" /><div className="mt-3 h-12 w-3/5 animate-pulse rounded bg-[#E4E7EC]" /><div className="mt-8 h-20 animate-pulse rounded bg-[#F2F4F7]" /><div className="mt-6 h-24 animate-pulse rounded bg-[#F2F4F7]" /></div></div></div></section>;
}

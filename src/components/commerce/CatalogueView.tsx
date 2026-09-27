import { FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FiArrowRight, FiFilter, FiSearch, FiX } from "react-icons/fi";
import { categories } from "@/data/catalogue";
import { useStorefrontCatalogue } from "@/state/catalogue";
import {
  filterProducts,
  getBrands,
  getPriceBounds,
  sortProducts,
  type SortOption,
} from "@/lib/catalogue";
import { useCart } from "@/state/cart";
import { useComparison } from "@/state/comparison";
import type { StockStatus } from "@/types/product";
import { ProductCard } from "@/components/commerce/ProductCard";
import { usePageTitle } from "@/lib/page-title";

interface CatalogueViewProps {
  categorySlug?: string;
}

const availabilityOptions: Array<{ value: StockStatus | "all"; label: string }> = [
  { value: "all", label: "All availability" },
  { value: "in-stock", label: "Available" },
  { value: "low-stock", label: "Limited" },
  { value: "out-of-stock", label: "Unavailable" },
  { value: "unknown", label: "Stock unknown" },
];

const sortOptions: Array<{ value: SortOption; label: string }> = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "name-asc", label: "Name: A-Z" },
  { value: "newest", label: "Newest" },
];

export function CatalogueView({ categorySlug }: CatalogueViewProps) {
  const { products } = useStorefrontCatalogue();
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { addProduct } = useCart();
  const { toggleProduct, isComparing } = useComparison();
  const category = categories.find((item) => item.slug === categorySlug);
  usePageTitle(category ? `${category.name} | TekCentral` : "Shop | TekCentral");
  const bounds = getPriceBounds(products);
  const brands = getBrands(
    categorySlug
      ? products.filter((product) => product.categorySlug === categorySlug)
      : products,
  );

  const filters = {
    q: params.get("q") ?? "",
    category: categorySlug ?? params.get("category") ?? "",
    brand: params.get("brand") ?? "",
    availability: (params.get("availability") ?? "all") as StockStatus | "all",
    minPrice: params.get("min") ? Number(params.get("min")) : undefined,
    maxPrice: params.get("max") ? Number(params.get("max")) : undefined,
    sort: (params.get("sort") ?? "featured") as SortOption,
  };

  const results = sortProducts(filterProducts(products, filters), filters.sort);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    setParams(next);
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setFilter("q", String(form.get("q") ?? "").trim());
  };

  const clearFilters = () => setParams(new URLSearchParams());

  const filterPanel = (
    <div className="space-y-5">
      <form onSubmit={submitSearch}>
        <label htmlFor="catalogue-search" className="text-sm font-black text-[#0A0A0A]">
          Search
        </label>
        <div className="relative mt-2">
          <FiSearch
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#727986]"
          />
          <input
            id="catalogue-search"
            name="q"
            defaultValue={filters.q}
            placeholder="Search products"
            className="h-11 w-full rounded-md border border-[#E4E7EC] bg-white pl-10 pr-3 text-sm font-semibold outline-none transition focus:border-[var(--tek-accent)] focus:ring-4 focus:ring-[rgba(70,157,139,0.14)]"
          />
        </div>
      </form>

      {!categorySlug && (
        <div>
          <label htmlFor="category-filter" className="text-sm font-black text-[#0A0A0A]">
            Category
          </label>
          <select
            id="category-filter"
            value={filters.category}
            onChange={(event) => setFilter("category", event.target.value)}
            className="mt-2 h-11 w-full rounded-md border border-[#E4E7EC] bg-white px-3 text-sm font-semibold"
          >
            <option value="">All categories</option>
            {categories.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="brand-filter" className="text-sm font-black text-[#0A0A0A]">
          Brand
        </label>
        <select
          id="brand-filter"
          value={filters.brand}
          onChange={(event) => setFilter("brand", event.target.value)}
          className="mt-2 h-11 w-full rounded-md border border-[#E4E7EC] bg-white px-3 text-sm font-semibold"
        >
          <option value="">All brands</option>
          {brands.map((brand) => (
            <option key={brand} value={brand}>
              {brand}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="availability-filter" className="text-sm font-black text-[#0A0A0A]">
          Availability
        </label>
        <select
          id="availability-filter"
          value={filters.availability}
          onChange={(event) => setFilter("availability", event.target.value)}
          className="mt-2 h-11 w-full rounded-md border border-[#E4E7EC] bg-white px-3 text-sm font-semibold"
        >
          {availabilityOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="min-filter" className="text-sm font-black text-[#0A0A0A]">
            Min price
          </label>
          <input
            id="min-filter"
            type="number"
            min={0}
            placeholder={`${bounds.min}`}
            value={filters.minPrice ?? ""}
            onChange={(event) => setFilter("min", event.target.value)}
            className="mt-2 h-11 w-full rounded-md border border-[#E4E7EC] bg-white px-3 text-sm font-semibold"
          />
        </div>
        <div>
          <label htmlFor="max-filter" className="text-sm font-black text-[#0A0A0A]">
            Max price
          </label>
          <input
            id="max-filter"
            type="number"
            min={0}
            placeholder={`${bounds.max}`}
            value={filters.maxPrice ?? ""}
            onChange={(event) => setFilter("max", event.target.value)}
            className="mt-2 h-11 w-full rounded-md border border-[#E4E7EC] bg-white px-3 text-sm font-semibold"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={clearFilters}
        className="w-full rounded-md border border-[#E4E7EC] bg-white px-4 py-2.5 text-sm font-black text-[#3F4652] transition hover:border-[#0A0A0A]"
      >
        Clear filters
      </button>
    </div>
  );

  if (categorySlug && !category) {
    return (
      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">
            Category not found
          </p>
          <h1 className="mt-4 text-4xl font-black text-zinc-950">
            This category is not available.
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

  return (
    <section className="bg-white px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-lg bg-[radial-gradient(circle_at_92%_18%,rgba(70,157,139,0.18),transparent_30%),linear-gradient(135deg,#F8FAFA_0%,#EEF5F3_100%)] p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">
              {category ? "Category" : "Shop"}
            </p>
            <h1 className="mt-3 text-4xl font-black text-[#0A0A0A] sm:text-5xl">
              {category?.name ?? "Shop Technology"}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#3F4652]">
              {category?.description ??
                "Browse technology products across computers, networking, printing, security, power, smart tech and accessories."}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label htmlFor="sort-products" className="sr-only">
              Sort products
            </label>
            <select
              id="sort-products"
              value={filters.sort}
              onChange={(event) => setFilter("sort", event.target.value)}
              className="h-11 rounded-md border border-[#E4E7EC] bg-white px-3 text-sm font-semibold"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#E4E7EC] bg-white px-4 text-sm font-black lg:hidden"
            >
              <FiFilter aria-hidden="true" />
              Filters
            </button>
          </div>
        </div>
        </div>

        {category?.subcategories.length ? (
          <div className="mt-6 flex flex-wrap gap-2">
            {category.subcategories.map((subcategory) => (
              <span
                key={subcategory}
                className="rounded-full border border-[#E4E7EC] bg-white px-3 py-1.5 text-sm font-bold text-[#3F4652]"
              >
                {subcategory}
              </span>
            ))}
          </div>
        ) : null}

        {category && (
          <Link
            to={`/zeus?context=${category.slug}`}
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-[rgba(70,157,139,0.35)] bg-[var(--tek-accent)] px-4 py-3 text-sm font-black text-[var(--tek-accent-ink)] shadow-[0_16px_40px_rgba(10,10,10,0.12)] transition hover:bg-[var(--tek-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tek-accent)]"
          >
            Ask Zeus to help plan {category.name.toLowerCase()}
            <FiArrowRight aria-hidden="true" />
          </Link>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[280px_1fr]">
          <aside className="hidden rounded-lg border border-[#E4E7EC] bg-[#F6F7F9] p-5 lg:block">
            {filterPanel}
          </aside>

          <div>
            <div className="mb-5 flex items-center justify-between gap-4">
              <p className="text-sm font-bold text-zinc-600">
                {results.length} product{results.length === 1 ? "" : "s"}
              </p>
              {filters.q && (
                <p className="text-sm text-zinc-500">
                  Search: <span className="font-bold">{filters.q}</span>
                </p>
              )}
            </div>

            {results.length > 0 ? (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {results.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onAddToCart={addProduct}
                    onCompare={toggleProduct}
                    isCompared={isComparing(product.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-[#BFC7D4] bg-[#F6F7F9] p-10 text-center">
                <h2 className="text-2xl font-black text-[#0A0A0A]">
                  No products found.
                </h2>
                <p className="mt-3 text-sm leading-6 text-[#3F4652]">
                  Try clearing filters or searching for another technology term.
                </p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-6 rounded-md bg-[var(--tek-accent)] px-5 py-3 text-sm font-black text-[var(--tek-accent-ink)] transition hover:bg-[var(--tek-accent-hover)]"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {filtersOpen && (
        <div className="fixed inset-0 z-50 bg-zinc-950/40 lg:hidden" role="dialog" aria-modal="true">
          <div className="ml-auto flex h-full w-full max-w-sm flex-col bg-white p-5 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-black text-zinc-950">Filters</h2>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-md border border-zinc-200"
                aria-label="Close filters"
              >
                <FiX aria-hidden="true" />
              </button>
            </div>
            <div className="overflow-y-auto pb-6">{filterPanel}</div>
          </div>
        </div>
      )}
    </section>
  );
}

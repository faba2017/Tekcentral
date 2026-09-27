import type { Product, StockStatus } from "@/types/product";

export type SortOption = "featured" | "price-asc" | "price-desc" | "name-asc" | "newest";

export interface CatalogueFilters {
  q?: string;
  category?: string;
  brand?: string;
  availability?: StockStatus | "all";
  minPrice?: number;
  maxPrice?: number;
  sort?: SortOption;
}

export function getBrands(products: Product[]) {
  return Array.from(new Set(products.map((product) => product.brand))).sort();
}

export function getPriceBounds(products: Product[]) {
  return products.reduce(
    (bounds, product) => ({
      min: Math.min(bounds.min, product.price),
      max: Math.max(bounds.max, product.price),
    }),
    { min: Number.POSITIVE_INFINITY, max: 0 },
  );
}

export function filterProducts(products: Product[], filters: CatalogueFilters) {
  const q = filters.q?.trim().toLowerCase();

  return products.filter((product) => {
    const matchesQuery =
      !q ||
      [
        product.name,
        product.brand,
        product.model,
        product.category,
        product.subcategory,
        product.shortDescription,
        ...(product.tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);

    const matchesCategory =
      !filters.category || product.categorySlug === filters.category;
    const matchesBrand = !filters.brand || product.brand === filters.brand;
    const matchesAvailability =
      !filters.availability ||
      filters.availability === "all" ||
      product.stockStatus === filters.availability;
    const matchesMin =
      filters.minPrice === undefined || product.price >= filters.minPrice;
    const matchesMax =
      filters.maxPrice === undefined || product.price <= filters.maxPrice;

    return (
      matchesQuery &&
      matchesCategory &&
      matchesBrand &&
      matchesAvailability &&
      matchesMin &&
      matchesMax
    );
  });
}

export function sortProducts(products: Product[], sort: SortOption = "featured") {
  return [...products].sort((a, b) => {
    if (sort === "price-asc") return a.price - b.price;
    if (sort === "price-desc") return b.price - a.price;
    if (sort === "name-asc") return a.name.localeCompare(b.name);
    if (sort === "newest") return Number(b.newArrival) - Number(a.newArrival);

    return (
      Number(b.featured) - Number(a.featured) ||
      Number(b.newArrival) - Number(a.newArrival) ||
      a.name.localeCompare(b.name)
    );
  });
}

export function getRelatedProducts(product: Product, products: Product[]) {
  return products
    .filter(
      (candidate) =>
        candidate.id !== product.id &&
        (candidate.categorySlug === product.categorySlug ||
          candidate.brand === product.brand),
    )
    .slice(0, 3);
}

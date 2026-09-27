import type { Product } from "@/types/product";
import type { CjConnectionStatus } from "@/lib/admin";
import type { SupplierCatalogueProduct, SupplierCatalogueVariant, SupplierProductMapping } from "@/types/order";

export type AdminToastVariant = "success" | "warning" | "error" | "info";

export interface AsyncActionState {
  search?: boolean;
  autocomplete?: boolean;
  categories?: boolean;
  test?: boolean;
  viewingProductId?: string;
  importingProductId?: string;
  refreshProductId?: string;
  suggesting?: boolean;
  checkingDelivery?: boolean;
  updatingMappingId?: string;
}

export const cjAutocompleteMinLength = 2;
export const cjAutocompleteDebounceMs = 400;
export const cjAutocompleteCacheMs = 3 * 60 * 1000;
export const cjVariantFilterThreshold = 7;
export const cjImportedPageSize = 20;
export const recentCjSearchesKey = "tekcentral:admin:cj:recent-searches";
export const recentCjViewedKey = "tekcentral:admin:cj:recent-viewed";

export interface RecentCjProduct {
  supplierProductId: string;
  supplierSku?: string;
  supplierProductName: string;
  imageUrl?: string;
  categoryName?: string;
  tekcentralCategoryGroup?: string;
  tekcentralRelevanceScore?: number;
  lastViewedAt: string;
}

export function isLatestSearchResponse(activeSequence: number, responseSequence: number) {
  return activeSequence === responseSequence;
}

export function canSuggestCjMapping(input: {
  selectedProduct?: SupplierCatalogueProduct;
  selectedVariantId?: string;
  tekcentralProductId?: string;
}) {
  if (!input.selectedProduct || !input.tekcentralProductId) return false;
  if (input.selectedProduct.variants.length > 0 && !input.selectedVariantId) return false;
  return true;
}

export function shouldAutocomplete(query: string, minLength = cjAutocompleteMinLength) {
  return query.trim().length >= minLength;
}

export function suggestionCacheKey(query: string, categoryId?: string, scope: "technology" | "all" = "technology") {
  return `${scope}:${categoryId ?? "all"}:${query.trim().toLowerCase()}`;
}

export function selectedVariant(
  product: SupplierCatalogueProduct | undefined,
  selectedVariantId: string,
) {
  if (!product) return undefined;
  return product.variants.find((variant) => variant.supplierVariantId === selectedVariantId);
}

export function filterVariants(variants: SupplierCatalogueVariant[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return variants;
  return variants.filter((variant) => {
    const haystack = [
      variant.name,
      variant.supplierVariantSku,
      variant.supplierVariantId,
      ...Object.entries(variant.attributes ?? {}).flatMap(([key, value]) => [key, value]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalized);
  });
}

export function shouldShowVariantFilter(variants: SupplierCatalogueVariant[]) {
  return variants.length >= cjVariantFilterThreshold;
}

export function variantDisplayName(variant: SupplierCatalogueVariant) {
  const attributeLabel = Object.values(variant.attributes ?? {})
    .filter(Boolean)
    .join(" · ");
  return variant.name ?? (attributeLabel || variant.supplierVariantSku || "CJ variant");
}

export function filterTekcentralProducts(
  catalogue: Product[],
  query: string,
  cjProduct?: SupplierCatalogueProduct,
) {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 2) return [];
  return catalogue
    .map((product) => {
      const haystack = [product.name, product.sku, product.category, product.subcategory, product.brand, ...(product.tags ?? [])]
      .filter(Boolean)
      .join(" ")
        .toLowerCase();
      if (!haystack.includes(normalized)) return undefined;
      const samePolicyCategory = cjProduct?.tekcentralCategoryGroup
        ? cjTekcentralCategoryAliases[cjProduct.tekcentralCategoryGroup]?.includes(product.categorySlug) ?? false
        : false;
      const directCategoryMatch = cjProduct?.categoryName
        ? product.categorySlug && cjProduct.categoryName.toLowerCase().includes(product.categorySlug)
        : false;
      return {
        product,
        score: (samePolicyCategory ? 30 : 0) + (directCategoryMatch ? 10 : 0) + (product.name.toLowerCase().includes(normalized) ? 8 : 0),
      };
    })
    .filter((entry): entry is { product: Product; score: number } => Boolean(entry))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.product);
}

export function hasCategoryMismatch(cjProduct: SupplierCatalogueProduct | undefined, tekProduct: Product | undefined) {
  if (!cjProduct || !tekProduct) return false;
  const cjCategory = (cjProduct.categoryName ?? "").toLowerCase();
  const tekTokens = [tekProduct.category, tekProduct.subcategory, ...(tekProduct.tags ?? [])]
    .filter((item): item is string => Boolean(item))
    .map((item) => item.toLowerCase());
  if (!cjCategory || tekTokens.length === 0) return false;
  return !tekTokens.some((token) => token && cjCategory.includes(token));
}

export function supplierDescriptionToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function updatedStatusCounts(
  status: CjConnectionStatus | undefined,
  mappings: SupplierProductMapping[],
) {
  if (!status) return status;
  return {
    ...status,
    verifiedMappingsCount: mappings.filter((mapping) => mapping.status === "VERIFIED").length,
    suggestedMappingsCount: mappings.filter((mapping) => mapping.status === "SUGGESTED").length,
    staleMappingsCount: mappings.filter((mapping) => mapping.status === "STALE").length,
  };
}

export function upsertMapping(
  mappings: SupplierProductMapping[],
  mapping: SupplierProductMapping,
) {
  const index = mappings.findIndex((item) => item.id === mapping.id);
  if (index < 0) return [mapping, ...mappings];
  return mappings.map((item) => (item.id === mapping.id ? mapping : item));
}

export function readJsonArray<T>(key: string, fallback: T[] = []) {
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed as T[] : fallback;
  } catch {
    return fallback;
  }
}

export function writeJsonArray<T>(key: string, items: T[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(items));
}

export function addRecentSearch(searches: string[], query: string, max = 10) {
  const trimmed = query.trim();
  if (!trimmed) return searches;
  return [trimmed, ...searches.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, max);
}

export function addRecentViewed(products: RecentCjProduct[], product: SupplierCatalogueProduct, now: string, max = 10) {
  const recent: RecentCjProduct = {
    supplierProductId: product.supplierProductId,
    supplierSku: product.supplierSku,
    supplierProductName: product.supplierProductName,
    imageUrl: product.imageUrl,
    categoryName: product.categoryName,
    tekcentralCategoryGroup: product.tekcentralCategoryGroup,
    tekcentralRelevanceScore: product.tekcentralRelevanceScore,
    lastViewedAt: now,
  };
  return [
    recent,
    ...products.filter((item) => item.supplierProductId !== product.supplierProductId),
  ].slice(0, max);
}

export function supplierPriceLabel(price?: number, currency?: string) {
  if (price === undefined) return undefined;
  if (!currency) return "Price available, currency unavailable";
  return `${currency} ${price}`;
}

export type MappingStatusFilter = "all" | "UNMAPPED" | "SUGGESTED" | "VERIFIED" | "STALE" | "REJECTED";
export type SupplierStatusFilter = "all" | "available" | "unavailable" | "stale" | "needs-refresh";

export function mappingStatusForProduct(
  product: SupplierCatalogueProduct,
  mappings: SupplierProductMapping[],
) {
  const productMappings = mappings.filter((mapping) => mapping.supplierProductId === product.supplierProductId);
  if (productMappings.length === 0) return "UNMAPPED" as const;
  if (productMappings.some((mapping) => mapping.status === "STALE")) return "STALE" as const;
  if (productMappings.some((mapping) => mapping.status === "SUGGESTED")) return "SUGGESTED" as const;
  if (productMappings.some((mapping) => mapping.status === "REJECTED")) return "REJECTED" as const;
  if (productMappings.every((mapping) => mapping.status === "VERIFIED")) return "VERIFIED" as const;
  return productMappings[0]?.status ?? "UNMAPPED";
}

export function mappingSummaryForProduct(
  product: SupplierCatalogueProduct,
  mappings: SupplierProductMapping[],
) {
  const productMappings = mappings.filter((mapping) => mapping.supplierProductId === product.supplierProductId);
  if (productMappings.length === 0) return "Unmapped";
  const verifiedCount = productMappings.filter((mapping) => mapping.status === "VERIFIED").length;
  if (verifiedCount > 1) return `${verifiedCount} verified variants`;
  const status = mappingStatusForProduct(product, mappings);
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function supplierStatusForProduct(product: SupplierCatalogueProduct) {
  if (product.stockTotal !== undefined && product.stockTotal <= 0) return "unavailable" as const;
  if (!product.lastSuccessfulRefreshAt) return "needs-refresh" as const;
  const refreshedAt = Date.parse(product.lastSuccessfulRefreshAt);
  if (Number.isFinite(refreshedAt) && Date.now() - refreshedAt > 7 * 24 * 60 * 60 * 1000) {
    return "stale" as const;
  }
  return "available" as const;
}

export function filterImportedCjProducts(
  catalogue: SupplierCatalogueProduct[],
  mappings: SupplierProductMapping[],
  filters: {
    search: string;
    category: string;
    mappingStatus: MappingStatusFilter;
    supplierStatus: SupplierStatusFilter;
    variantMode: "all" | "has-variants" | "single-variant";
    sort: "recently-imported" | "recently-refreshed" | "product-name" | "mapping-status";
  },
) {
  const normalizedSearch = filters.search.trim().toLowerCase();
  return catalogue
    .filter((product) => {
      const haystack = [
        product.supplierProductName,
        product.supplierSku,
        product.supplierProductId,
      ].filter(Boolean).join(" ").toLowerCase();
      if (normalizedSearch && !haystack.includes(normalizedSearch)) return false;
      if (filters.category && product.categoryName !== filters.category) return false;
      const mappingStatus = mappingStatusForProduct(product, mappings);
      if (filters.mappingStatus !== "all" && mappingStatus !== filters.mappingStatus) return false;
      const supplierStatus = supplierStatusForProduct(product);
      if (filters.supplierStatus !== "all" && supplierStatus !== filters.supplierStatus) return false;
      if (filters.variantMode === "has-variants" && product.variants.length === 0) return false;
      if (filters.variantMode === "single-variant" && product.variants.length !== 1) return false;
      return true;
    })
    .sort((a, b) => {
      if (filters.sort === "product-name") return a.supplierProductName.localeCompare(b.supplierProductName);
      if (filters.sort === "mapping-status") {
        return mappingStatusForProduct(a, mappings).localeCompare(mappingStatusForProduct(b, mappings));
      }
      const aDate = Date.parse(filters.sort === "recently-refreshed" ? a.lastSuccessfulRefreshAt ?? "" : a.importedAt);
      const bDate = Date.parse(filters.sort === "recently-refreshed" ? b.lastSuccessfulRefreshAt ?? "" : b.importedAt);
      return (Number.isFinite(bDate) ? bDate : 0) - (Number.isFinite(aDate) ? aDate : 0);
    });
}

const cjTekcentralCategoryAliases: Record<string, string[]> = {
  "Computers & Accessories": ["computers", "accessories"],
  Networking: ["networking"],
  "Cables & Connectivity": ["accessories", "networking"],
  "Power & Charging": ["power", "accessories"],
  Storage: ["accessories", "computers"],
  "Mobile Technology": ["smart-tech", "accessories"],
  "Security & Cameras": ["security", "smart-tech"],
  "Smart Technology": ["smart-tech"],
  "Office Technology": ["printing-office", "computers"],
};

import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FiCheck, FiChevronLeft, FiChevronRight, FiLoader } from "react-icons/fi";
import { products } from "@/data/catalogue";
import {
  AdminFeedback,
  AdminPageHeader,
  AdminShell,
  AdminStatusBadge,
} from "@/components/admin/AdminShell";
import { SupplierWorkspaceNav } from "@/components/admin/SupplierWorkspaceNav";
import { AdminToastRegion, type AdminToastMessage } from "@/components/admin/AdminToast";
import { CjSupplierEvidencePanel } from "@/components/admin/CjSupplierEvidencePanel";
import { ProductConfigurationLink } from "@/components/admin/ProductConfigurationWorkspace";
import { ApiError, apiRequest } from "@/lib/api";
import type { AsyncActionState, AdminToastVariant } from "@/lib/cj-workflow";
import {
  addRecentSearch,
  addRecentViewed,
  canSuggestCjMapping,
  cjAutocompleteCacheMs,
  cjAutocompleteDebounceMs,
  cjAutocompleteMinLength,
  filterTekcentralProducts,
  filterVariants,
  hasCategoryMismatch,
  isLatestSearchResponse,
  isCjMappingSuggestionComplete,
  mappingSummaryForProduct,
  mappingStatusForProduct,
  readJsonArray,
  recentCjSearchesKey,
  recentCjViewedKey,
  type RecentCjProduct,
  selectedVariant,
  shouldShowCjMappingEditor,
  shouldAutocomplete,
  shouldShowVariantFilter,
  suggestionCacheKey,
  supplierPriceLabel,
  supplierStatusForProduct,
  updatedStatusCounts,
  upsertMapping,
  variantDisplayName,
  writeJsonArray,
} from "@/lib/cj-workflow";
import { formatDateTime } from "@/lib/order-utils";
import { usePageTitle } from "@/lib/page-title";
import { supplierByCode } from "@/lib/supplier-registry";
import type {
  AdminInternalProduct,
  CjConnectionStatus,
  CjCategoriesResponse,
  CjCategoryNode,
  CjLaunchReadinessResponse,
  CjProductSearchResponse,
  CjVariantDeliveryCheck,
  SupplierMappingsResponse,
} from "@/lib/admin";
import type { SupplierCatalogueProduct, SupplierProductMapping } from "@/types/order";

type Feedback = { variant: AdminToastVariant; message: string };
type CjMappingSuggestionResponse = {
  mapping: SupplierProductMapping;
  tekcentralProduct: unknown;
  cjProduct: SupplierCatalogueProduct;
  variant?: SupplierCatalogueProduct["variants"][number];
};
type CjMappingPreview = {
  proposalVersion?: number;
  proposalFingerprint?: string;
  action: "MAP_EXISTING" | "CREATE_NEW";
  confidence: "HIGH" | "LOW";
  reason: string;
  existingProduct?: { id: string; name: string };
  product: SupplierCatalogueProduct;
  variant: SupplierCatalogueProduct["variants"][number];
  proposal: {
    name: string;
    brand: string;
    model: string;
    categorySlug: string;
    categoryName?: string;
    subcategory: string;
    proposedSku: string;
    imageUrl?: string;
    shortDescription: string;
    categoryReviewRequired: boolean;
    variantAttributes?: Record<string, string> | null;
    evidenceNote?: string | null;
    sourceReference?: string | null;
    fieldConfidence?: Record<"title" | "brand" | "model" | "category" | "subcategory" | "description", "HIGH" | "MEDIUM" | "LOW"> | null;
    evidenceSummary?: string[] | null;
  };
};

type SuggestionCacheEntry = {
  createdAt: number;
  response: CjProductSearchResponse;
};

type FlattenedCjCategory = {
  key: string;
  categoryId?: string;
  name: string;
  label: string;
  parentPath: string;
};

function adminErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  if (error.message.includes("CJ_INVALID_RESPONSE")) return "CJ returned a product that could not be identified.";
  if (error.message.includes("CJ_PRODUCT_NOT_FOUND")) return "This CJ product is no longer available.";
  if (error.message.includes("CJ_VARIANT_REQUIRED")) return "Select a CJ variant before creating the mapping.";
  if (error.message.includes("CJ_TECH_POLICY_UNAVAILABLE")) return "TekCentral technology catalogue is temporarily unavailable.";
  if (error.message.includes("CJ_MAPPING_EXISTS")) return "A mapping already exists for this TekCentral product and CJ variant.";
  if (error.message.includes("SUPPLIER_MAPPING_REQUIRED")) return "Supplier mapping details are required before this action can continue.";
  return error.message;
}

export function AdminCjSupplierPage() {
  usePageTitle("CJ Dropshipping | TekCentral Ops");
  const [searchParams, setSearchParams] = useSearchParams();
  const cjSupplier = supplierByCode("CJ");
  const [status, setStatus] = useState<CjConnectionStatus>();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [discoveryTab, setDiscoveryTab] = useState<"search" | "browse" | "recent" | "imported">("search");
  const [catalogueScope, setCatalogueScope] = useState<"technology" | "all">("technology");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [selectedCategoryName, setSelectedCategoryName] = useState("");
  const [results, setResults] = useState<SupplierCatalogueProduct[]>([]);
  const [suggestions, setSuggestions] = useState<SupplierCatalogueProduct[]>([]);
  const [autocompleteFeedback, setAutocompleteFeedback] = useState<Feedback>({
    variant: "info",
    message: `Type at least ${cjAutocompleteMinLength} characters.`,
  });
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [categories, setCategories] = useState<CjCategoryNode[]>([]);
  const [categoryGroups, setCategoryGroups] = useState<NonNullable<CjCategoriesResponse["groups"]>>([]);
  const [importedProducts, setImportedProducts] = useState<SupplierCatalogueProduct[]>([]);
  const [mappings, setMappings] = useState<SupplierProductMapping[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<SupplierCatalogueProduct>();
  const [tekcentralProductId, setTekcentralProductId] = useState("");
  const [tekcentralSearch, setTekcentralSearch] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [variantSearch, setVariantSearch] = useState("");
  const [loading, setLoading] = useState<AsyncActionState>({});
  const [searchFeedback, setSearchFeedback] = useState<Feedback>();
  const [connectionFeedback, setConnectionFeedback] = useState<Feedback>();
  const [detailFeedback, setDetailFeedback] = useState<Feedback>();
  const [importFeedback, setImportFeedback] = useState<Record<string, Feedback>>({});
  const [mappingFeedback, setMappingFeedback] = useState<Feedback>();
  const [mappingPreview, setMappingPreview] = useState<CjMappingPreview>();
  const [mappingEditorOpen, setMappingEditorOpen] = useState(false);
  const [adminProducts, setAdminProducts] = useState<AdminInternalProduct[]>([]);
  const [launchData, setLaunchData] = useState<CjLaunchReadinessResponse>();
  const [creationDraft, setCreationDraft] = useState({ name: "", brand: "", model: "", categorySlug: "", subcategory: "", shortDescription: "", evidenceNote: "", sourceReference: "" });
  const [deliveryCheck, setDeliveryCheck] = useState<CjVariantDeliveryCheck>();
  const [deliveryCheckFeedback, setDeliveryCheckFeedback] = useState<Feedback>();
  const [recentSearches, setRecentSearches] = useState<string[]>(() => readJsonArray<string>(recentCjSearchesKey));
  const [recentViewed, setRecentViewed] = useState<RecentCjProduct[]>(() => readJsonArray<RecentCjProduct>(recentCjViewedKey));
  const [toasts, setToasts] = useState<AdminToastMessage[]>([]);
  const toastIdPrefix = useId();
  const toastCounter = useRef(0);
  const searchSequence = useRef(0);
  const autocompleteSequence = useRef(0);
  const suggestionCache = useRef(new Map<string, SuggestionCacheEntry>());
  const detailRef = useRef<HTMLDivElement>(null);
  const deliveryCheckPending = useRef(false);
  const deliveryCooldownTimer = useRef<number>();
  const [deliveryCooldownActive, setDeliveryCooldownActive] = useState(false);

  useEffect(() => () => {
    if (deliveryCooldownTimer.current) window.clearTimeout(deliveryCooldownTimer.current);
  }, []);

  const addToast = (variant: AdminToastVariant, message: string) => {
    toastCounter.current += 1;
    const id = `${toastIdPrefix}-${toastCounter.current}`;
    setToasts((current) => [...current, { id, variant, message }]);
    if (variant === "success" || variant === "info") {
      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, 4200);
    }
  };

  const dismissToast = (id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  const rememberSearch = (value: string) => {
    const updated = addRecentSearch(recentSearches, value);
    setRecentSearches(updated);
    writeJsonArray(recentCjSearchesKey, updated);
  };

  const rememberViewed = (product: SupplierCatalogueProduct) => {
    const updated = addRecentViewed(recentViewed, product, new Date().toISOString());
    setRecentViewed(updated);
    writeJsonArray(recentCjViewedKey, updated);
  };

  useEffect(() => {
    Promise.all([
      apiRequest<CjConnectionStatus>("/api/admin/suppliers/cj/status"),
      apiRequest<{ products: SupplierCatalogueProduct[] }>("/api/admin/suppliers/cj/products"),
      apiRequest<SupplierMappingsResponse>("/api/admin/supplier-mappings?supplier=CJ"),
      apiRequest<CjCategoriesResponse>("/api/admin/suppliers/cj/categories"),
      apiRequest<{ products: AdminInternalProduct[] }>("/api/admin/products"),
      apiRequest<CjLaunchReadinessResponse>("/api/admin/suppliers/cj/launch-readiness"),
    ])
      .then(([statusResponse, importedResponse, mappingsResponse, categoriesResponse, adminProductsResponse, launchResponse]) => {
        setStatus(statusResponse);
        setImportedProducts(importedResponse.products);
        setMappings(mappingsResponse.mappings);
        setCategories(categoriesResponse.categories);
        setCategoryGroups(categoriesResponse.groups ?? []);
        setAdminProducts(adminProductsResponse.products);
        setLaunchData(launchResponse);
      })
      .catch(() => {
        setStatus(undefined);
        setImportedProducts([]);
        setMappings([]);
        setCategories([]);
        setCategoryGroups([]);
      });
  }, []);

  useEffect(() => {
    const supplierProductId = searchParams.get("pid");
    const supplierVariantId = searchParams.get("vid");
    if (!supplierProductId || !supplierVariantId || selectedProduct?.supplierProductId === supplierProductId) return;
    const product = importedProducts.find((item) => item.supplierProductId === supplierProductId);
    if (!product || !product.variants.some((variant) => variant.supplierVariantId === supplierVariantId)) return;
    const timeout = window.setTimeout(() => {
      setSelectedProduct(product);
      setSelectedVariantId(supplierVariantId);
      setDiscoveryTab("imported");
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [importedProducts, searchParams, selectedProduct?.supplierProductId]);

  const selectedTekProduct = products.find((product) => product.id === tekcentralProductId);
  const selectedCjVariant = selectedVariant(selectedProduct, selectedVariantId);
  const visibleVariants = filterVariants(selectedProduct?.variants ?? [], variantSearch);
  const visibleTekProducts = filterTekcentralProducts(products, tekcentralSearch, selectedProduct).slice(0, 16);
  const flatCategories = useMemo(() => flattenCategories(categories).slice(0, 36), [categories]);
  const visibleRecentViewed = catalogueScope === "technology"
    ? recentViewed.filter((product) => product.tekcentralCategoryGroup).slice(0, 6)
    : recentViewed.slice(0, 6);
  const filteredResults = results;
  const selectedProductMappings = mappings.filter(
    (mapping) => mapping.supplierCode === "CJ" && mapping.supplierProductId === selectedProduct?.supplierProductId && (!selectedVariantId || mapping.supplierVariantId === selectedVariantId) && !["SUPERSEDED", "REJECTED"].includes(mapping.status ?? ""),
  );
  const activeSelectedMapping = [...selectedProductMappings].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const hasVerifiedMapping = activeSelectedMapping?.status === "VERIFIED";
  const hasSuggestedMapping = isCjMappingSuggestionComplete(activeSelectedMapping?.status);
  const mappedAdminProduct = adminProducts.find((product) => product.id === activeSelectedMapping?.productId);
  const selectedLaunchRow = launchData?.rows.find((row) => row.product.supplierProductId === selectedProduct?.supplierProductId && row.variant.supplierVariantId === selectedVariantId);
  const canSuggest = canSuggestCjMapping({ selectedProduct, selectedVariantId, tekcentralProductId });
  const isSelectedImported = Boolean(selectedProduct && importedProducts.some((item) => item.supplierProductId === selectedProduct.supplierProductId));
  const selectedMappingStatus = selectedProduct ? selectedVariantId ? activeSelectedMapping?.status ?? "UNMAPPED" : mappingStatusForProduct(selectedProduct, mappings) : "UNMAPPED";
  const selectedMappingSummary = selectedProduct ? selectedVariantId ? (activeSelectedMapping?.status ?? "UNMAPPED").replace(/_/g, " ").toLowerCase().replace(/^./, (value) => value.toUpperCase()) : mappingSummaryForProduct(selectedProduct, mappings) : "Unmapped";
  const selectedSupplierStatus = selectedProduct ? supplierStatusForProduct(selectedProduct) : "needs-refresh";
  const showVariantFilter = shouldShowVariantFilter(selectedProduct?.variants ?? []);
  const categoryWarning = hasCategoryMismatch(selectedProduct, selectedTekProduct);
  const selectedVariantDeliveryWarning =
    deliveryCheck &&
    deliveryCheck.supplierVariantId === selectedVariantId &&
    deliveryCheck.status === "NO_ROUTE";
  const refreshSelectedEvidence = async () => {
    const [launchResponse, productsResponse] = await Promise.all([
      apiRequest<CjLaunchReadinessResponse>("/api/admin/suppliers/cj/launch-readiness"),
      apiRequest<{ products: SupplierCatalogueProduct[] }>("/api/admin/suppliers/cj/products"),
    ]);
    setLaunchData(launchResponse);
    setImportedProducts(productsResponse.products);
    setSelectedProduct((current) => productsResponse.products.find((item) => item.supplierProductId === current?.supplierProductId) ?? current);
  };

  const clearSelection = () => {
    setSelectedProduct(undefined);
    setSelectedVariantId("");
    setTekcentralProductId("");
    setTekcentralSearch("");
    setVariantSearch("");
    setDetailFeedback(undefined);
    setMappingFeedback(undefined);
    setDeliveryCheck(undefined);
    setDeliveryCheckFeedback(undefined);
    setDeliveryCooldownActive(false);
    if (deliveryCooldownTimer.current) window.clearTimeout(deliveryCooldownTimer.current);
  };

  const selectVariant = (supplierVariantId: string) => {
    setSelectedVariantId(supplierVariantId);
    setDeliveryCheck(undefined);
    setDeliveryCheckFeedback(undefined);
    setDeliveryCooldownActive(false);
    if (deliveryCooldownTimer.current) window.clearTimeout(deliveryCooldownTimer.current);
    setMappingPreview(undefined);
    setMappingEditorOpen(false);
  };

  const loadCategories = async (scope: "technology" | "all") => {
    setLoading((current) => ({ ...current, categories: true }));
    try {
      const response = await apiRequest<CjCategoriesResponse>(`/api/admin/suppliers/cj/categories?scope=${scope}`);
      setCategories(response.categories);
      setCategoryGroups(response.groups ?? []);
    } catch (error) {
      addToast("error", adminErrorMessage(error, "CJ categories unavailable."));
      setCategories([]);
      setCategoryGroups([]);
    } finally {
      setLoading((current) => ({ ...current, categories: false }));
    }
  };

  const changeScope = (scope: "technology" | "all") => {
    setCatalogueScope(scope);
    setSelectedCategoryId("");
    setSelectedCategoryName("");
    clearSelection();
    setResults([]);
    setSuggestions([]);
    setAutocompleteOpen(false);
    suggestionCache.current.clear();
    void loadCategories(scope);
  };

  const clearSearch = () => {
    setQuery("");
    setResults([]);
    setSuggestions([]);
    setAutocompleteOpen(false);
    setActiveSuggestionIndex(-1);
    clearSelection();
    setSearchFeedback(undefined);
    setAutocompleteFeedback({
      variant: "info",
      message: `Type at least ${cjAutocompleteMinLength} characters.`,
    });
  };

  const testConnection = async () => {
    setLoading((current) => ({ ...current, test: true }));
    setConnectionFeedback(undefined);
    try {
      const response = await apiRequest<CjConnectionStatus>("/api/admin/suppliers/cj/test", {
        method: "POST",
      });
      setStatus(response);
      setConnectionFeedback({ variant: "success", message: "CJ connection is available." });
      addToast("success", "CJ connection is available.");
    } catch (error) {
      const message = adminErrorMessage(error, "CJ connection test failed.");
      setConnectionFeedback({ variant: "error", message });
      addToast("error", message);
    } finally {
      setLoading((current) => ({ ...current, test: false }));
    }
  };

  useEffect(() => {
    const trimmed = query.trim();
    const sequence = autocompleteSequence.current + 1;
    autocompleteSequence.current = sequence;
    if (!shouldAutocomplete(trimmed)) {
      const timeout = window.setTimeout(() => {
        setSuggestions([]);
        setAutocompleteOpen(false);
        setAutocompleteFeedback({
          variant: "info",
          message: `Type at least ${cjAutocompleteMinLength} characters.`,
        });
      }, 0);
      return () => window.clearTimeout(timeout);
    }

    const cacheKey = suggestionCacheKey(trimmed, selectedCategoryId, catalogueScope);
    const cached = suggestionCache.current.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < cjAutocompleteCacheMs) {
      const timeout = window.setTimeout(() => {
        setSuggestions(cached.response.suggestions ?? cached.response.products);
        setAutocompleteOpen(true);
        setAutocompleteFeedback({ variant: "success", message: `${cached.response.products.length} suggestions.` });
      }, 0);
      return () => window.clearTimeout(timeout);
    }

    const timeout = window.setTimeout(() => {
      setLoading((current) => ({ ...current, autocomplete: true }));
      setAutocompleteFeedback({ variant: "info", message: "Searching CJ..." });
      apiRequest<CjProductSearchResponse>(
        `/api/admin/suppliers/cj/autocomplete?keyword=${encodeURIComponent(trimmed)}&categoryId=${encodeURIComponent(selectedCategoryId)}&scope=${catalogueScope}&size=8`,
      )
        .then((response) => {
          if (!isLatestSearchResponse(autocompleteSequence.current, sequence)) return;
          suggestionCache.current.set(cacheKey, { createdAt: Date.now(), response });
          const nextSuggestions = response.suggestions ?? response.products;
          setSuggestions(nextSuggestions);
          setAutocompleteOpen(true);
          setActiveSuggestionIndex(nextSuggestions.length > 0 ? 0 : -1);
          setAutocompleteFeedback({
            variant: nextSuggestions.length > 0 ? "success" : "warning",
            message: nextSuggestions.length > 0 ? `${nextSuggestions.length} suggestions.` : "No matching CJ products.",
          });
        })
        .catch((error) => {
          if (!isLatestSearchResponse(autocompleteSequence.current, sequence)) return;
          setSuggestions([]);
          setAutocompleteOpen(true);
          setAutocompleteFeedback({ variant: "error", message: adminErrorMessage(error, "CJ search unavailable.") });
        })
        .finally(() => {
          if (isLatestSearchResponse(autocompleteSequence.current, sequence)) {
            setLoading((current) => ({ ...current, autocomplete: false }));
          }
        });
    }, cjAutocompleteDebounceMs);

    return () => window.clearTimeout(timeout);
  }, [query, selectedCategoryId, catalogueScope]);

  const selectDiscoveryProduct = (product: SupplierCatalogueProduct) => {
    setSelectedProduct(product);
    setSelectedVariantId("");
    setTekcentralProductId("");
    setTekcentralSearch("");
    setVariantSearch("");
    setMappingFeedback(undefined);
    setAutocompleteOpen(false);
    setSuggestions([]);
    setDetailFeedback({ variant: "info", message: "CJ product selected. View details before mapping." });
    rememberViewed(product);
  };

  const handleAutocompleteKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setAutocompleteOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setAutocompleteOpen(true);
      setActiveSuggestionIndex((current) => Math.min(suggestions.length - 1, current + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setAutocompleteOpen(true);
      setActiveSuggestionIndex((current) => Math.max(0, current - 1));
      return;
    }
    if (event.key === "Enter" && autocompleteOpen && activeSuggestionIndex >= 0 && suggestions[activeSuggestionIndex]) {
      event.preventDefault();
      selectDiscoveryProduct(suggestions[activeSuggestionIndex]);
    }
  };

  const search = async (
    event?: FormEvent<HTMLFormElement>,
    nextPage = page,
    categoryIdOverride = selectedCategoryId,
    queryOverride = query,
    categoryNameOverride = selectedCategoryName,
  ) => {
    event?.preventDefault();
    const searchQuery = queryOverride.trim();
    const sequence = searchSequence.current + 1;
    searchSequence.current = sequence;
    setLoading((current) => ({ ...current, search: true }));
    clearSelection();
    setResults([]);
    setSearchFeedback({ variant: "info", message: "Searching CJ catalogue..." });
    try {
      const response = await apiRequest<CjProductSearchResponse>(
        `/api/admin/suppliers/cj/search?keyword=${encodeURIComponent(searchQuery)}&categoryId=${encodeURIComponent(categoryIdOverride)}&scope=${catalogueScope}&page=${nextPage}&size=${pageSize}`,
      );
      if (!isLatestSearchResponse(searchSequence.current, sequence)) return;
      setPage(nextPage);
      setResults(response.products);
      if (response.exactLookup?.status === "MATCH" && response.exactLookup.selectedVariantId && response.products[0]) {
        const exactProduct = response.products[0];
        setSelectedProduct(exactProduct);
        selectVariant(response.exactLookup.selectedVariantId);
        setTekcentralProductId("");
        setTekcentralSearch("");
        setVariantSearch("");
        setMappingFeedback(undefined);
        rememberViewed(exactProduct);
        window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      }
      rememberSearch(searchQuery || categoryNameOverride);
      const validCount = response.products.length;
      const invalidCount = response.invalidResultsCount ?? 0;
      const noTechnologyMatches = catalogueScope === "technology" && searchQuery.length > 0 && validCount === 0;
      const exactLookup = response.exactLookup;
      const message = exactLookup?.used
        ? exactLookup.message
        : validCount > 0
          ? `${validCount} products found${invalidCount > 0 ? ` · ${invalidCount} invalid result discarded` : ""}.`
          : noTechnologyMatches
            ? `No strong technology matches found for '${searchQuery}'.`
            : invalidCount > 0
              ? `No valid CJ products found. ${invalidCount} invalid result discarded.`
              : "No valid CJ products found.";
      setSearchFeedback({
        variant: exactLookup?.status === "MATCH" ? "success" : validCount > 0 && !exactLookup ? "success" : "warning",
        message,
      });
    } catch (error) {
      if (!isLatestSearchResponse(searchSequence.current, sequence)) return;
      const message = adminErrorMessage(error, "CJ catalogue search failed.");
      setSearchFeedback({ variant: "error", message });
      addToast("error", message);
    } finally {
      if (isLatestSearchResponse(searchSequence.current, sequence)) {
        setLoading((current) => ({ ...current, search: false }));
      }
    }
  };

  const importProduct = async (product: SupplierCatalogueProduct) => {
    setLoading((current) => ({ ...current, importingProductId: product.supplierProductId }));
    setImportFeedback((current) => ({
      ...current,
      [product.supplierProductId]: { variant: "info", message: "Importing..." },
    }));
    try {
      const response = await apiRequest<{ product: SupplierCatalogueProduct }>("/api/admin/suppliers/cj/products/import", {
        method: "POST",
        body: JSON.stringify({ pid: product.supplierProductId }),
      });
      setImportedProducts((current) => {
        const exists = current.some((item) => item.supplierProductId === response.product.supplierProductId);
        return exists
          ? current.map((item) => item.supplierProductId === response.product.supplierProductId ? response.product : item)
          : [response.product, ...current];
      });
      setStatus((current) => current ? { ...current, importedProductsCount: Math.max(current.importedProductsCount, importedProducts.length + 1) } : current);
      setImportFeedback((current) => ({
        ...current,
        [product.supplierProductId]: { variant: "success", message: "Product imported successfully." },
      }));
      setSelectedProduct((current) =>
        current?.supplierProductId === response.product.supplierProductId
          ? { ...current, ...response.product }
          : current,
      );
      addToast("success", "CJ product imported.");
    } catch (error) {
      const message = adminErrorMessage(error, "CJ product import failed.");
      setImportFeedback((current) => ({
        ...current,
        [product.supplierProductId]: { variant: "error", message },
      }));
      addToast("error", message);
    } finally {
      setLoading((current) => ({ ...current, importingProductId: undefined }));
    }
  };

  const refreshProduct = async (product: SupplierCatalogueProduct) => {
    setLoading((current) => ({ ...current, refreshProductId: product.supplierProductId }));
    try {
      const response = await apiRequest<{ product: SupplierCatalogueProduct }>(
        `/api/admin/suppliers/cj/products/${encodeURIComponent(product.supplierProductId)}/refresh`,
        { method: "PATCH" },
      );
      setImportedProducts((current) => current.map((item) => item.supplierProductId === response.product.supplierProductId ? response.product : item));
      if (selectedProduct?.supplierProductId === response.product.supplierProductId) setSelectedProduct(response.product);
      addToast("success", "CJ product refreshed.");
    } catch (error) {
      addToast("error", adminErrorMessage(error, "CJ product refresh failed."));
    } finally {
      setLoading((current) => ({ ...current, refreshProductId: undefined }));
    }
  };

  const refreshVariantAvailability = async (product: SupplierCatalogueProduct, variant: SupplierCatalogueProduct["variants"][number]) => {
    setLoading((current) => ({ ...current, refreshAvailabilityId: variant.supplierVariantId }));
    try {
      const response = await apiRequest<{ product: SupplierCatalogueProduct }>(
        `/api/admin/suppliers/cj/products/${encodeURIComponent(product.supplierProductId)}/variants/${encodeURIComponent(variant.supplierVariantId)}/refresh-availability`,
        { method: "POST", body: JSON.stringify({ supplierVariantSku: variant.supplierVariantSku }) },
      );
      setImportedProducts((current) => current.map((item) => item.supplierProductId === response.product.supplierProductId ? response.product : item));
      setSelectedProduct(response.product);
      addToast("success", "CJ availability refreshed for the exact variant.");
    } catch (error) {
      addToast("error", adminErrorMessage(error, "CJ availability refresh failed."));
    } finally {
      setLoading((current) => ({ ...current, refreshAvailabilityId: undefined }));
    }
  };

  const viewProduct = async (product: SupplierCatalogueProduct) => {
    setLoading((current) => ({ ...current, viewingProductId: product.supplierProductId }));
    setDetailFeedback({ variant: "info", message: "Loading product..." });
    setVariantSearch("");
    setSelectedVariantId("");
    try {
      const response = await apiRequest<{ product: SupplierCatalogueProduct; variants: SupplierCatalogueProduct["variants"] }>(
        `/api/admin/suppliers/cj/detail?pid=${encodeURIComponent(product.supplierProductId)}`,
      );
      const nextProduct = { ...response.product, variants: response.variants };
      setSelectedProduct(nextProduct);
      rememberViewed(nextProduct);
      setDetailFeedback({ variant: "success", message: "Product details loaded ↓" });
      window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (error) {
      const message = adminErrorMessage(error, "CJ product detail failed.");
      setDetailFeedback({ variant: "error", message });
      addToast("error", message);
    } finally {
      setLoading((current) => ({ ...current, viewingProductId: undefined }));
    }
  };

  const suggestMapping = async () => {
    if (!selectedProduct || !canSuggest) return;
    setLoading((current) => ({ ...current, suggesting: true }));
    setMappingFeedback(undefined);
    try {
      const response = await apiRequest<CjMappingSuggestionResponse>("/api/admin/supplier-mappings/cj/suggest", {
        method: "POST",
        body: JSON.stringify({
          tekcentralProductId,
          supplierProductId: selectedProduct.supplierProductId,
          supplierVariantId: selectedVariantId || undefined,
        }),
      });
      const nextMappings = upsertMapping(mappings, response.mapping);
      setMappings(nextMappings);
      setStatus((current) => updatedStatusCounts(current, nextMappings));
      setMappingFeedback({ variant: "success", message: "Suggested mapping created." });
      addToast("success", "Suggested CJ mapping created.");
    } catch (error) {
      const message = adminErrorMessage(error, "CJ mapping suggestion failed.");
      setMappingFeedback({ variant: "error", message });
      addToast("error", message);
    } finally {
      setLoading((current) => ({ ...current, suggesting: false }));
    }
  };

  const previewExactMapping = async () => {
    if (!selectedProduct || !selectedCjVariant) return;
    setLoading((current) => ({ ...current, mappingPreview: true }));
    setMappingFeedback(undefined);
    try {
      const preview = await apiRequest<CjMappingPreview>("/api/admin/suppliers/cj/mapping-preview", { method: "POST", cache: "no-store", body: JSON.stringify({ supplierProductId: selectedProduct.supplierProductId, supplierVariantId: selectedCjVariant.supplierVariantId }) });
      if (preview.proposalVersion !== 2) throw new ApiError("The CJ Product suggestion service is out of date. Restart the backend and preview again.", 409, "CJ_PREVIEW_VERSION_STALE");
      setMappingPreview(preview);
      setCreationDraft({ name: preview.proposal.name, brand: preview.proposal.brand, model: preview.proposal.model, categorySlug: preview.proposal.categorySlug, subcategory: preview.proposal.subcategory, shortDescription: preview.proposal.shortDescription, evidenceNote: preview.proposal.evidenceNote ?? "", sourceReference: preview.proposal.sourceReference ?? `CJ PID ${preview.product.supplierProductId} / VID ${preview.variant.supplierVariantId}` });
    } catch (error) {
      setMappingFeedback({ variant: "error", message: adminErrorMessage(error, "CJ mapping preview failed.") });
    } finally {
      setLoading((current) => ({ ...current, mappingPreview: false }));
    }
  };

  const applyExactMapping = async () => {
    if (!selectedProduct || !selectedCjVariant || !mappingPreview) return;
    setLoading((current) => ({ ...current, mappingApply: true }));
    try {
      const response = await apiRequest<{ mapping: SupplierProductMapping; product: AdminInternalProduct; created: boolean }>("/api/admin/suppliers/cj/products/create", { method: "POST", body: JSON.stringify({ supplierProductId: selectedProduct.supplierProductId, supplierVariantId: selectedCjVariant.supplierVariantId, name: creationDraft.name, brand: creationDraft.brand, model: creationDraft.model, categorySlug: creationDraft.categorySlug, subcategory: creationDraft.subcategory || undefined, shortDescription: creationDraft.shortDescription, evidenceNote: creationDraft.evidenceNote, sourceReference: creationDraft.sourceReference, confirmed: true }) });
      const nextMappings = upsertMapping(mappings, response.mapping);
      setMappings(nextMappings);
      setAdminProducts((current) => current.some((product) => product.id === response.product.id) ? current.map((product) => product.id === response.product.id ? response.product : product) : [response.product, ...current]);
      setLaunchData(await apiRequest<CjLaunchReadinessResponse>("/api/admin/suppliers/cj/launch-readiness"));
      setStatus((current) => updatedStatusCounts(current, nextMappings));
      setMappingFeedback({ variant: "success", message: response.created ? "TekCentral product created and exact CJ variant mapping verified." : "Exact CJ variant mapped to the existing TekCentral product." });
      setMappingPreview(undefined);
      setMappingEditorOpen(false);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("productSetup", response.product.id);
      setSearchParams(nextParams);
    } catch (error) {
      setMappingFeedback({ variant: "error", message: adminErrorMessage(error, "CJ exact mapping could not be applied.") });
    } finally {
      setLoading((current) => ({ ...current, mappingApply: false }));
    }
  };

  const checkDeliveryToSouthAfrica = async () => {
    if (!selectedCjVariant) {
      setDeliveryCheckFeedback({ variant: "warning", message: "Select an exact CJ variant first." });
      return;
    }
    if (deliveryCheckPending.current || deliveryCooldownActive) return;
    deliveryCheckPending.current = true;
    setLoading((current) => ({ ...current, checkingDelivery: true }));
    setDeliveryCheckFeedback({ variant: "info", message: "Checking CJ delivery..." });
    try {
      const response = await apiRequest<{ deliveryCheck: CjVariantDeliveryCheck }>("/api/admin/suppliers/cj/delivery-check", {
        method: "POST",
        body: JSON.stringify({ supplierProductId: selectedProduct?.supplierProductId, supplierVariantId: selectedCjVariant.supplierVariantId }),
      });
      setDeliveryCheck(response.deliveryCheck);
      setDeliveryCheckFeedback(undefined);
      if (response.deliveryCheck.status === "RATE_LIMITED") {
        setDeliveryCooldownActive(true);
        if (deliveryCooldownTimer.current) window.clearTimeout(deliveryCooldownTimer.current);
        deliveryCooldownTimer.current = window.setTimeout(() => setDeliveryCooldownActive(false), (response.deliveryCheck.retryAfterSeconds ?? 60) * 1_000);
      }
    } catch (error) {
      setDeliveryCheckFeedback({ variant: "error", message: adminErrorMessage(error, "CJ delivery check failed.") });
    } finally {
      deliveryCheckPending.current = false;
      setLoading((current) => ({ ...current, checkingDelivery: false }));
    }
  };

  const selectCategory = (category: FlattenedCjCategory) => {
    setSelectedCategoryId(category.categoryId ?? "");
    setSelectedCategoryName(category.label);
    clearSelection();
    setResults([]);
    setSuggestions([]);
    setSearchFeedback({ variant: "info", message: `${category.label} selected. Search within this category or run a category browse.` });
  };

  const browseCategory = (category: FlattenedCjCategory) => {
    selectCategory(category);
    setQuery("");
    void search(undefined, 1, category.categoryId ?? "", "", category.label);
  };

  return (
    <AdminShell>
      <AdminToastRegion toasts={toasts} onDismiss={dismissToast} />
      <AdminPageHeader
        eyebrow="Supplier catalogue"
        title="CJ Dropshipping"
        description="Read-only CJ API foundation for catalogue search, selected imports and verified supplier mappings."
        actions={
          <Link to="/admin/supplier-mappings?supplier=CJ" className="rounded-md border border-[#E4E7EC] bg-white px-4 py-2 text-sm font-black">
            Supplier Mappings
          </Link>
        }
      />
      {cjSupplier && <SupplierWorkspaceNav supplier={cjSupplier} />}

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Connection" value={status?.authenticated ? "Connected" : status?.configured ? "Configured" : "Not configured"} tone={status?.authenticated ? "PAID" : "PENDING"} />
        <Metric label="Last request" value={status?.lastSuccessfulRequestAt ? formatDateTime(status.lastSuccessfulRequestAt) : "None"} />
        <Metric label="Imported products" value={String(status?.importedProductsCount ?? importedProducts.length)} />
        <Metric label="Verified mappings" value={String(status?.verifiedMappingsCount ?? 0)} />
        <Metric label="Suggested mappings" value={String(status?.suggestedMappingsCount ?? 0)} />
      </section>

      <section className="mt-6 rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-black">CJ connection</h2>
            <p className="mt-1 text-sm font-semibold text-[#727986]">
              Uses backend-only `CJ_API_KEY`. Tokens are never returned to the browser.
            </p>
          </div>
          <button type="button" onClick={testConnection} disabled={loading.test} className="inline-flex w-fit items-center gap-2 rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black text-[var(--tek-accent-ink)] disabled:cursor-wait disabled:opacity-70">
            {loading.test && <FiLoader className="animate-spin" aria-hidden="true" />}
            {loading.test ? "Testing..." : "Test Connection"}
          </button>
        </div>
        {connectionFeedback && <div className="mt-3"><AdminFeedback {...connectionFeedback} /></div>}
        {status?.lastError && <p className="mt-3 text-sm font-semibold text-[#B42318]">{status.lastError}</p>}
      </section>

      <section className="mt-6 rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--tek-accent)]">Discover</p>
            <h2 className="mt-1 text-lg font-black">CJ catalogue workspace</h2>
            <p className="mt-1 max-w-3xl text-sm font-semibold text-[#727986]">
              Search and browse real CJ catalogue records through TekCentral's technology category lens before import, mapping and verification.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 rounded-md bg-[#F6F7F9] p-2">
            <button type="button" onClick={() => changeScope("technology")} className={`rounded-md px-3 py-2 text-sm font-black ${catalogueScope === "technology" ? "bg-white text-[#101828] shadow-sm" : "text-[#727986]"}`}>
              TekCentral technology
            </button>
            <button type="button" onClick={() => changeScope("all")} className={`rounded-md px-3 py-2 text-sm font-black ${catalogueScope === "all" ? "bg-white text-[#101828] shadow-sm" : "text-[#727986]"}`}>
              All CJ catalogue
            </button>
          </div>
        </div>

        {catalogueScope === "all" && (
          <div className="mt-4 rounded-md border border-[#FEDF89] bg-[#FFFAEB] px-3 py-2 text-sm font-semibold text-[#B54708]">
            All CJ catalogue can include products outside TekCentral's current technology range. Use it only when intentionally checking the wider supplier catalogue.
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2 border-b border-[#E4E7EC] pb-3">
          {(["search", "browse", "recent", "imported"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setDiscoveryTab(tab)}
              className={`rounded-md px-3 py-2 text-sm font-black capitalize ${discoveryTab === tab ? "bg-[#101828] text-white" : "bg-[#F6F7F9] text-[#3F4652]"}`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-5">
          <div>
            {discoveryTab === "search" && (
              <div>
                <form onSubmit={(event) => search(event, 1)} className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                  <div className="relative">
                    <label htmlFor="cj-autocomplete" className="text-sm font-black">
                      Search CJ catalogue
                    </label>
                    <div className="relative mt-2">
                      <input
                        id="cj-autocomplete"
                        value={query}
                        placeholder="Search technology products..."
                        onChange={(event) => {
                          setQuery(event.target.value);
                          setAutocompleteOpen(true);
                          if (!event.target.value.trim()) {
                            setResults([]);
                            setSuggestions([]);
                            setSearchFeedback(undefined);
                            setActiveSuggestionIndex(-1);
                          }
                        }}
                        onFocus={() => setAutocompleteOpen(true)}
                        onKeyDown={handleAutocompleteKeyDown}
                        role="combobox"
                        aria-autocomplete="list"
                        aria-expanded={autocompleteOpen}
                        aria-controls="cj-autocomplete-listbox"
                        aria-activedescendant={activeSuggestionIndex >= 0 ? `cj-suggestion-${activeSuggestionIndex}` : undefined}
                        className="h-11 w-full rounded-md border border-[#E4E7EC] px-3 pr-10 text-sm font-semibold outline-none focus:border-[var(--tek-accent)]"
                      />
                      {query && (
                        <button
                          type="button"
                          onClick={clearSearch}
                          className="absolute right-9 top-2 rounded-md px-2 py-1 text-sm font-black text-[#727986] hover:bg-[#F6F7F9]"
                          aria-label="Clear CJ search"
                        >
                          ×
                        </button>
                      )}
                      {loading.autocomplete && <FiLoader className="absolute right-3 top-3 animate-spin text-[#727986]" aria-hidden="true" />}
                    </div>
                    {autocompleteOpen && (
                      <div id="cj-autocomplete-listbox" role="listbox" className="absolute z-30 mt-2 max-h-96 w-full overflow-y-auto rounded-lg border border-[#E4E7EC] bg-white p-2 shadow-xl">
                        <p className="px-2 py-1 text-xs font-black uppercase tracking-[0.12em] text-[#727986]">Suggestions</p>
                        {suggestions.map((product, index) => (
                          <button
                            id={`cj-suggestion-${index}`}
                            key={product.supplierProductId}
                            type="button"
                            role="option"
                            aria-selected={activeSuggestionIndex === index}
                            onMouseEnter={() => setActiveSuggestionIndex(index)}
                            onClick={() => selectDiscoveryProduct(product)}
                            className={`grid w-full grid-cols-[48px_1fr] gap-3 rounded-md p-2 text-left ${activeSuggestionIndex === index ? "bg-[#EFFFFB]" : "hover:bg-[#F6F7F9]"}`}
                          >
                            <span className="h-12 w-12 overflow-hidden rounded bg-[#F6F7F9]">
                              {product.imageUrl && <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-black">{product.supplierProductName}</span>
                              <span className="mt-1 block truncate text-xs font-semibold text-[#727986]">CJ SKU {product.supplierSku ?? "Unknown"}</span>
                              <span className="mt-1 block truncate text-xs font-semibold text-[#727986]">
                                {product.categoryName ?? "Category unavailable"}{supplierPriceLabel(product.supplierPrice, product.currency) ? ` · ${supplierPriceLabel(product.supplierPrice, product.currency)}` : ""}
                              </span>
                            </span>
                          </button>
                        ))}
                        {suggestions.length === 0 && <p className="px-2 py-3 text-sm font-semibold text-[#727986]">{autocompleteFeedback.message}</p>}
                      </div>
                    )}
                  </div>
                  <button type="submit" disabled={loading.search} className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black text-[var(--tek-accent-ink)] disabled:cursor-wait disabled:opacity-70">
                    {loading.search && <FiLoader className="animate-spin" aria-hidden="true" />}
                    {loading.search ? "Searching..." : "Search"}
                  </button>
                </form>
                {selectedCategoryName && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-[#3F4652]">
                    <span className="rounded-md bg-[#EFFFFB] px-2 py-1">Category: {selectedCategoryName}</span>
                    <button type="button" onClick={() => { setSelectedCategoryId(""); setSelectedCategoryName(""); clearSelection(); }} className="text-xs font-black text-[#727986] underline">
                      Clear category
                    </button>
                  </div>
                )}
                {!query.trim() ? (
                  <p className="mt-3 text-sm font-semibold text-[#727986]">Start typing to search CJ's technology catalogue, or browse by category.</p>
                ) : (
                  <div className="mt-3"><AdminFeedback {...autocompleteFeedback} /></div>
                )}
              </div>
            )}

            {discoveryTab === "browse" && (
              <div className="rounded-md border border-[#E4E7EC] p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--tek-accent)]">Browse</p>
                    <h3 className="mt-1 text-sm font-black">Browse CJ categories</h3>
                  </div>
                  {loading.categories && <p className="text-sm font-semibold text-[#727986]">Loading categories...</p>}
                </div>
                {catalogueScope === "technology" ? (
                  <div className="mt-4 grid gap-4">
                    {categoryGroups.map((group) => (
                      <div key={group.name} className="rounded-md bg-[#F6F7F9] p-4">
                        <h4 className="text-sm font-black">{group.name}</h4>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                          {group.categories.map((category) => (
                            <button
                              key={category.categoryId}
                              type="button"
                              onClick={() => browseCategory({ key: category.categoryId, categoryId: category.categoryId, name: category.categoryName, label: category.categoryPath, parentPath: group.name })}
                              className={`rounded-md border px-3 py-3 text-left hover:bg-white ${selectedCategoryId === category.categoryId ? "border-[var(--tek-accent)] bg-[#EFFFFB]" : "border-[#E4E7EC] bg-white"}`}
                            >
                              <span className="block text-sm font-black">{category.categoryName}</span>
                              <span className="mt-1 block text-xs font-semibold text-[#727986]">{category.categoryPath}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {!loading.categories && categoryGroups.length === 0 && <p className="text-sm font-semibold text-[#727986]">TekCentral technology catalogue is temporarily unavailable.</p>}
                  </div>
                ) : (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {flatCategories.map((category) => (
                      <button key={category.key} type="button" onClick={() => browseCategory(category)} className={`rounded-md border px-3 py-3 text-left hover:bg-[#F6F7F9] ${selectedCategoryId === category.categoryId ? "border-[var(--tek-accent)] bg-[#EFFFFB]" : "border-[#E4E7EC] bg-white"}`}>
                        <span className="block text-sm font-black">{category.name}</span>
                        <span className="mt-1 block text-xs font-semibold text-[#727986]">{category.parentPath || "Top level"}{category.categoryId ? ` · ${category.categoryId}` : ""}</span>
                      </button>
                    ))}
                    {!loading.categories && flatCategories.length === 0 && <p className="text-sm font-semibold text-[#727986]">No CJ categories returned yet.</p>}
                  </div>
                )}
              </div>
            )}

            {discoveryTab === "recent" && (
              <div className="grid gap-4 lg:grid-cols-2">
                <DiscoveryList title="Recent searches" empty="No recent searches yet.">
                  {recentSearches.map((item) => (
                    <button key={item} type="button" onClick={() => { setQuery(item); setDiscoveryTab("search"); void search(undefined, 1, selectedCategoryId, item); }} className="rounded-md border border-[#E4E7EC] bg-white px-3 py-2 text-left text-sm font-black hover:bg-[#F6F7F9]">
                      {item}
                    </button>
                  ))}
                </DiscoveryList>
                <DiscoveryList title="Recently viewed" empty="No recently viewed CJ products in this scope yet.">
                  {visibleRecentViewed.map((product) => (
                    <RecentProductButton key={product.supplierProductId} product={product} onClick={() => void viewProduct(productToCatalogueProduct(product))} />
                  ))}
                </DiscoveryList>
                <button type="button" onClick={() => { setRecentSearches([]); setRecentViewed([]); writeJsonArray(recentCjSearchesKey, []); writeJsonArray(recentCjViewedKey, []); }} className="w-fit rounded-md border border-[#E4E7EC] bg-white px-4 py-2 text-sm font-black">
                  Clear recent activity
                </button>
              </div>
            )}

            {discoveryTab === "imported" && (
              <div className="rounded-md bg-[#F6F7F9] p-4">
                <h3 className="text-sm font-black">Imported CJ Products</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric label="Products" value={String(importedProducts.length)} />
                  <Metric label="Verified mappings" value={String(status?.verifiedMappingsCount ?? mappings.filter((mapping) => mapping.status === "VERIFIED").length)} />
                  <Metric label="Suggested mappings" value={String(status?.suggestedMappingsCount ?? mappings.filter((mapping) => mapping.status === "SUGGESTED").length)} />
                  <Metric label="Needs review" value={String(mappings.filter((mapping) => mapping.status === "STALE" || mapping.status === "SUGGESTED").length)} />
                </div>
                <Link to="/admin/suppliers/cj/imported" className="mt-4 inline-flex rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black text-[var(--tek-accent-ink)]">
                  View imported products
                </Link>
              </div>
            )}

            {searchFeedback && <div className="mt-4"><AdminFeedback {...searchFeedback} /></div>}
            <div className="mt-5 grid gap-3">
              {loading.search && <p className="rounded-md bg-[#F6F7F9] p-4 text-sm font-semibold text-[#727986]">Searching CJ catalogue...</p>}
              {!loading.search && filteredResults.map((product) => (
                <ProductRow
                  key={product.supplierProductId}
                  product={product}
                  onImport={() => importProduct(product)}
                  onView={() => viewProduct(product)}
                  showVariantCount={false}
                  viewLoading={loading.viewingProductId === product.supplierProductId}
                  importLoading={loading.importingProductId === product.supplierProductId}
                  imported={importedProducts.some((item) => item.supplierProductId === product.supplierProductId)}
                  feedback={importFeedback[product.supplierProductId]}
                />
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold text-[#727986]">Page {page} · {pageSize} requested per page · {catalogueScope === "technology" ? "TekCentral technology lens" : "All CJ catalogue"}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => search(undefined, Math.max(1, page - 1))} disabled={loading.search || page === 1} className="inline-flex items-center gap-2 rounded-md border border-[#E4E7EC] px-3 py-2 text-sm font-black disabled:cursor-not-allowed disabled:text-[#727986]">
                  <FiChevronLeft aria-hidden="true" /> Previous
                </button>
                <button type="button" onClick={() => search(undefined, page + 1)} disabled={loading.search} className="inline-flex items-center gap-2 rounded-md border border-[#E4E7EC] px-3 py-2 text-sm font-black disabled:cursor-wait disabled:text-[#727986]">
                  Next <FiChevronRight aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          <div ref={detailRef} className="rounded-lg border border-[#E4E7EC] bg-[#F6F7F9] p-4">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--tek-accent)]">Current selection</p>
            <h3 className="mt-1 text-sm font-black">Selected CJ product</h3>
            {selectedProduct ? (
              <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                <div className="grid gap-4">
                  <div className="rounded-md bg-white p-4">
                    <div className="grid gap-4 sm:grid-cols-[128px_1fr]">
                      <div className="h-32 w-32 overflow-hidden rounded bg-[#F6F7F9]">
                        {selectedProduct.imageUrl && <img src={selectedProduct.imageUrl} alt="" className="h-full w-full object-cover" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-base font-black">{selectedProduct.supplierProductName}</p>
                        <p className="mt-2 break-all text-xs font-semibold text-[#727986]">CJ SKU: {selectedProduct.supplierSku ?? "Unknown"}</p>
                        <p className="mt-1 break-all text-xs font-semibold text-[#727986]">Product ID: {selectedProduct.supplierProductId}</p>
                        <p className="mt-1 text-xs font-semibold text-[#727986]">{selectedProduct.categoryName ?? "Category unavailable"}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {selectedProduct.tekcentralCategoryGroup && <span className="rounded-md bg-[#F6F7F9] px-2 py-1 text-xs font-black text-[#3F4652]">{selectedProduct.tekcentralCategoryGroup}</span>}
                          <span className="rounded-md bg-[#F6F7F9] px-2 py-1 text-xs font-black text-[#3F4652]">{selectedProduct.variants.length} variant{selectedProduct.variants.length === 1 ? "" : "s"}</span>
                          <span className="rounded-md bg-[#F6F7F9] px-2 py-1 text-xs font-black text-[#3F4652]">{supplierPriceLabel(selectedProduct.supplierPrice, selectedProduct.currency) ?? "Price unavailable"}</span>
                        </div>
                      </div>
                    </div>
                    {detailFeedback && <div className="mt-3"><AdminFeedback {...detailFeedback} /></div>}
                  </div>

                  <div className="rounded-md bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-[0.12em] text-[#727986]">Variant selection</h4>
                        <p className="mt-1 text-xs font-semibold text-[#727986]">{selectedProduct.variants.length} variant{selectedProduct.variants.length === 1 ? "" : "s"} returned. Choose one exact CJ-returned variant.</p>
                      </div>
                      <button type="button" onClick={() => viewProduct(selectedProduct)} disabled={loading.viewingProductId === selectedProduct.supplierProductId} className="rounded-md border border-[#E4E7EC] px-3 py-2 text-xs font-black disabled:cursor-wait disabled:text-[#727986]">
                        {loading.viewingProductId === selectedProduct.supplierProductId ? "Loading..." : "Load detail"}
                      </button>
                    </div>
                  {selectedProduct.variants.length === 0 ? (
                    <p className="mt-3 text-sm font-semibold text-[#727986]">No selectable CJ variants were returned for this product.</p>
                  ) : (
                    <div className="mt-3">
                      {showVariantFilter && (
                        <label className="block text-xs font-black text-[#3F4652]">
                          Filter available variants
                          <input value={variantSearch} onChange={(event) => setVariantSearch(event.target.value)} placeholder="Filter available variants..." className="mt-2 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm font-semibold" />
                        </label>
                      )}
                      <div className="mt-3 grid max-h-[25rem] gap-2 overflow-y-auto pr-1">
                        {visibleVariants.map((variant) => (
                          <label key={variant.supplierVariantId} className={`grid cursor-pointer gap-2 rounded-md border p-3 ${selectedVariantId === variant.supplierVariantId ? "border-[var(--tek-accent)] bg-[#EFFFFB]" : "border-[#E4E7EC] bg-[#F6F7F9]"}`}>
                            <span className="flex items-start gap-2">
                              <input
                                className="mt-1"
                                type="radio"
                                name="cjVariant"
                                checked={selectedVariantId === variant.supplierVariantId}
                                onChange={() => selectVariant(variant.supplierVariantId)}
                              />
                              <span className="min-w-0">
                                <span className="block text-sm font-black">{variantDisplayName(variant)}</span>
                                <span className="mt-1 block break-all text-xs font-semibold text-[#727986]">SKU: {variant.supplierVariantSku ?? "Unknown"}</span>
                                <span className="mt-1 block break-all text-xs font-semibold text-[#727986]">VID: {variant.supplierVariantId}</span>
                                <span className="mt-1 block text-xs font-semibold text-[#727986]">
                                  {supplierPriceLabel(variant.price ?? selectedProduct.supplierPrice, variant.currency ?? selectedProduct.currency) ?? "Price unavailable"}
                                  <span className="block">{variant.stockTotal !== undefined ? `Stock: ${variant.stockTotal}` : "Stock not checked"}</span>
                                </span>
                              </span>
                            </span>
                          </label>
                        ))}
                        {variantSearch.trim() && visibleVariants.length === 0 && <p className="py-3 text-sm font-semibold text-[#727986]">No variants match this filter.</p>}
                      </div>
                    </div>
                  )}
                  {selectedCjVariant && (
                    <div className="mt-3 grid gap-3">
                      <div className="rounded-md border border-[#E4E7EC] bg-[#F6F7F9] p-3 text-xs font-semibold text-[#3F4652]">
                        <p className="font-black">Selected variant</p>
                        <p className="mt-1">{variantDisplayName(selectedCjVariant)}</p>
                        <p>SKU: {selectedCjVariant.supplierVariantSku ?? "Unknown"}</p>
                        <p>VID: {selectedCjVariant.supplierVariantId}</p>
                        <p>{supplierPriceLabel(selectedCjVariant.price ?? selectedProduct.supplierPrice, selectedCjVariant.currency ?? selectedProduct.currency) ?? "Price unavailable"}</p>
                      </div>
                    </div>
                  )}
                </div>

                  {selectedCjVariant && (
                    <div className="rounded-md bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#727986]">South Africa delivery</p>
                          <p className="mt-1 text-xs font-semibold text-[#727986]">Checks this exact CJ variant against current CJ logistics.</p>
                        </div>
                        <button
                          type="button"
                          onClick={checkDeliveryToSouthAfrica}
                          disabled={loading.checkingDelivery || deliveryCooldownActive}
                          className="rounded-md border border-[#E4E7EC] px-3 py-2 text-xs font-black disabled:cursor-wait disabled:bg-[#E4E7EC] disabled:text-[#727986]"
                        >
                          {loading.checkingDelivery ? "Checking..." : deliveryCooldownActive ? "Try again shortly" : "Check delivery to South Africa"}
                        </button>
                      </div>
                      {deliveryCheckFeedback && <div className="mt-3"><AdminFeedback {...deliveryCheckFeedback} /></div>}
                      {!deliveryCheckFeedback && !deliveryCheck && <p className="mt-3 text-xs font-semibold text-[#727986]">Not checked</p>}
                      {deliveryCheck && deliveryCheck.supplierVariantId === selectedCjVariant.supplierVariantId && (
                        <div className={`mt-3 rounded-md border px-3 py-2 text-xs font-semibold ${deliveryCheck.status === "AVAILABLE" ? "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]" : "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]"}`}>
                          <p className="font-black">{deliveryCheck.message}</p>
                          <p className="mt-1">{deliveryCheck.cached ? "Using recent check from" : "Last checked"}: {formatDateTime(deliveryCheck.checkedAt)}</p>
                          {deliveryCheck.sourceCountries.length > 0 && <p>Source: {deliveryCheck.sourceCountries.join(", ")}</p>}
                          {!["AVAILABLE", "RATE_LIMITED", "TEMPORARY_ERROR"].includes(deliveryCheck.status) && deliveryCheck.diagnosticReasons && deliveryCheck.diagnosticReasons.length > 0 && (
                            <div className="mt-2 grid gap-1">
                              {deliveryCheck.diagnosticReasons.map((reason) => (
                                <p key={reason}>{reason}</p>
                              ))}
                            </div>
                          )}
                          {deliveryCheck.status === "AVAILABLE" && (
                            <div className="mt-2 grid gap-1">
                              <p>{deliveryCheck.logisticsOptions.length} logistics method{deliveryCheck.logisticsOptions.length === 1 ? "" : "s"} returned.</p>
                              {deliveryCheck.logisticsOptions.map((option) => (
                                <p key={`${option.fromCountryCode}-${option.logisticName}-${option.id ?? "method"}`}>
                                  {option.logisticName}
                                  {option.shippingCost !== undefined ? ` · ${option.currency} ${option.shippingCost}` : ""}
                                  {option.estimatedDelivery ? ` · ${option.estimatedDelivery}` : ""}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid content-start gap-4">
                  <div className="rounded-md bg-white p-3">
                    <h4 className="text-xs font-black uppercase tracking-[0.12em] text-[#727986]">Selection summary</h4>
                    <p className="mt-2 text-sm font-black">{selectedProduct.supplierProductName}</p>
                    <p className="mt-1 break-all text-xs font-semibold text-[#727986]">Product ID: {selectedProduct.supplierProductId}</p>
                    {selectedCjVariant && <p className="mt-1 break-all text-xs font-semibold text-[#727986]">VID: {selectedCjVariant.supplierVariantId}</p>}
                  </div>

                  <div className="rounded-md bg-white p-3">
                    <h4 className="text-xs font-black uppercase tracking-[0.12em] text-[#727986]">Workflow</h4>
                    <ol className="mt-3 space-y-2 text-sm font-semibold text-[#3F4652]">
                      <WorkflowStep done={Boolean(selectedProduct)} label="Product reviewed" />
                      <WorkflowStep done={Boolean(selectedCjVariant)} label="Variant selected" />
                      <WorkflowStep done={isSelectedImported} label="Imported" />
                      <WorkflowStep done={hasSuggestedMapping} active={!hasSuggestedMapping && Boolean(selectedCjVariant)} label="Mapping suggested" />
                      <WorkflowStep done={hasVerifiedMapping} label="Mapping verified" />
                    </ol>
                  </div>

                  <div className="rounded-md bg-white p-3">
                  <h4 className="text-xs font-black uppercase tracking-[0.12em] text-[#727986]">Import status</h4>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <AdminStatusBadge label={isSelectedImported ? "Imported" : "Not imported"} status={isSelectedImported ? "PAID" : "PENDING"} />
                    <AdminStatusBadge label={selectedSupplierStatus} status={selectedSupplierStatus} />
                  </div>
                  {importFeedback[selectedProduct.supplierProductId] && <div className="mt-3"><AdminFeedback {...importFeedback[selectedProduct.supplierProductId]} /></div>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {isSelectedImported ? (
                      <>
                        <Link to="/admin/suppliers/cj/imported" className="rounded-md border border-[#E4E7EC] px-3 py-2 text-sm font-black">
                          View imported products
                        </Link>
                        <button type="button" onClick={() => refreshProduct(selectedProduct)} disabled={loading.refreshProductId === selectedProduct.supplierProductId} className="rounded-md border border-[#E4E7EC] px-3 py-2 text-sm font-black disabled:cursor-wait disabled:text-[#727986]">
                          {loading.refreshProductId === selectedProduct.supplierProductId ? "Refreshing..." : "Refresh"}
                        </button>
                        {selectedCjVariant && <button type="button" onClick={() => void refreshVariantAvailability(selectedProduct, selectedCjVariant)} disabled={loading.refreshAvailabilityId === selectedCjVariant.supplierVariantId} className="rounded-md border border-[#E4E7EC] px-3 py-2 text-sm font-black disabled:cursor-wait disabled:text-[#727986]">
                          {loading.refreshAvailabilityId === selectedCjVariant.supplierVariantId ? "Refreshing availability..." : "Refresh availability"}
                        </button>}
                      </>
                    ) : (
                      <button type="button" onClick={() => importProduct(selectedProduct)} disabled={loading.importingProductId === selectedProduct.supplierProductId} className="rounded-md bg-[var(--tek-accent)] px-3 py-2 text-sm font-black text-[var(--tek-accent-ink)] disabled:cursor-wait disabled:opacity-70">
                        {loading.importingProductId === selectedProduct.supplierProductId ? "Importing..." : "Import product"}
                      </button>
                    )}
                  </div>
                </div>

                  <div className="rounded-md bg-white p-3">
                  <h4 className="text-xs font-black uppercase tracking-[0.12em] text-[#727986]">Mapping progress</h4>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <AdminStatusBadge label={selectedMappingSummary} status={selectedMappingStatus} />
                  </div>
                  {selectedCjVariant ? (
                    !shouldShowCjMappingEditor(activeSelectedMapping?.status, mappingEditorOpen) ? (
                      <div className="mt-3 grid gap-3">
                        <section className="rounded-md border border-[#B8E3DA] bg-[#F0FBF8] p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-[#176B5C]">Mapped TekCentral Product</p><h5 className="mt-1 text-base font-black">{mappedAdminProduct?.name ?? activeSelectedMapping?.productId}</h5><p className="mt-1 text-xs font-semibold text-[#3F4652]">{mappedAdminProduct?.sku ?? "SKU unavailable"}{mappedAdminProduct?.brand ? ` · ${mappedAdminProduct.brand}` : ""}{mappedAdminProduct?.category ? ` · ${mappedAdminProduct.category}${mappedAdminProduct.subcategory ? ` / ${mappedAdminProduct.subcategory}` : ""}` : ""}</p></div><AdminStatusBadge label="Verified" status="VERIFIED" /></div>
                          <dl className="mt-3 grid gap-2 text-xs font-semibold text-[#3F4652] sm:grid-cols-2"><div><dt className="font-black">CJ PID</dt><dd className="break-all">{selectedProduct.supplierProductId}</dd></div><div><dt className="font-black">Exact CJ VID</dt><dd className="break-all">{selectedCjVariant.supplierVariantId}</dd></div><div><dt className="font-black">Variant SKU</dt><dd>{selectedCjVariant.supplierVariantSku ?? "Unavailable"}</dd></div><div><dt className="font-black">Mapping evidence</dt><dd>{activeSelectedMapping?.evidence?.slice(-1)[0] ?? "Verified by staff"}</dd></div></dl>
                          <div className="mt-4 flex flex-wrap gap-2">{activeSelectedMapping?.productId && <ProductConfigurationLink productId={activeSelectedMapping.productId} className="rounded-md bg-[var(--tek-accent)] px-3 py-2 text-sm font-black text-[var(--tek-accent-ink)]">Continue Product setup</ProductConfigurationLink>}<button type="button" onClick={() => setMappingEditorOpen(true)} className="rounded-md border border-[#E4E7EC] bg-white px-3 py-2 text-sm font-black">Change mapping</button></div>
                        </section>
                        <CjSupplierEvidencePanel key={selectedCjVariant.supplierVariantId} product={selectedProduct} variant={selectedCjVariant} row={selectedLaunchRow} deliveryStatus={deliveryCheck?.supplierVariantId === selectedCjVariant.supplierVariantId ? deliveryCheck.status : undefined} onSaved={refreshSelectedEvidence} />
                      </div>
                    ) : (
                    <div className="mt-3 grid gap-4">
                      {hasVerifiedMapping && <div className="rounded-md border border-[#FEDF89] bg-[#FFFAEB] p-3 text-xs font-semibold text-[#B54708]"><p className="font-black">You are changing a verified mapping.</p><p className="mt-1">The current mapping remains active until a replacement is confirmed. Previous mapping evidence will be preserved as superseded history.</p><button type="button" onClick={() => { setMappingEditorOpen(false); setMappingPreview(undefined); }} className="mt-3 rounded-md border border-[#E4E7EC] bg-white px-3 py-2 font-black text-[#3F4652]">Cancel</button></div>}
                      <section className="rounded-md border border-[#B8E3DA] bg-[#F0FBF8] p-3">
                      <h5 className="text-sm font-black">Create new TekCentral Product</h5>
                      <p className="mt-1 text-xs font-semibold text-[#727986]">Use this path when the exact sellable Product does not exist in TekCentral.</p>
                      {!mappingPreview && <button type="button" onClick={() => void previewExactMapping()} disabled={loading.mappingPreview} className="mt-3 w-full rounded-md border border-[#469D8B] bg-white px-3 py-2 text-sm font-black text-[#176B5C] disabled:opacity-60">{loading.mappingPreview ? "Preparing preview..." : "Preview suggested TekCentral Product"}</button>}
                      {mappingPreview && <div className="mt-3 rounded-md border border-[#E4E7EC] bg-[#F6F7F9] p-3 text-xs font-semibold text-[#3F4652]">
                        <div className="flex items-center justify-between gap-2"><p className="font-black">Suggested TekCentral Product</p><AdminStatusBadge label={`${mappingPreview.confidence} confidence`} status={mappingPreview.confidence === "HIGH" ? "APPROVED" : "PENDING"} /></div>
                        <p className="mt-2">{mappingPreview.reason}</p>
                        {mappingPreview.existingProduct && <p className="mt-2 font-black">Existing product: {mappingPreview.existingProduct.name}</p>}
                        {mappingPreview.action === "CREATE_NEW" && <div className="mt-3 grid gap-2"><label className="font-black">Public product title<input value={creationDraft.name} onChange={(event) => setCreationDraft({ ...creationDraft, name: event.target.value })} className="mt-1 w-full px-3" /></label><label className="font-black">Brand<input value={creationDraft.brand} onChange={(event) => setCreationDraft({ ...creationDraft, brand: event.target.value })} className="mt-1 w-full px-3" /></label><label className="font-black">Model<input value={creationDraft.model} onChange={(event) => setCreationDraft({ ...creationDraft, model: event.target.value })} placeholder="Leave blank if unknown" className="mt-1 w-full px-3" /></label><label className="font-black">TekCentral category<select value={creationDraft.categorySlug} onChange={(event) => setCreationDraft({ ...creationDraft, categorySlug: event.target.value })} className="mt-1 w-full px-3"><option value="">Select category</option><option value="computers">Computers</option><option value="networking">Networking</option><option value="printing-office">Printing & Office</option><option value="security">Security</option><option value="power">Power</option><option value="smart-tech">Smart Tech</option><option value="accessories">Accessories</option></select></label><label className="font-black">Subcategory<input value={creationDraft.subcategory} onChange={(event) => setCreationDraft({ ...creationDraft, subcategory: event.target.value })} className="mt-1 w-full px-3" /></label></div>}
                        {mappingPreview.action === "CREATE_NEW" && <label className="mt-3 block font-black">Safe description candidate<textarea value={creationDraft.shortDescription} onChange={(event) => setCreationDraft({ ...creationDraft, shortDescription: event.target.value })} rows={3} className="mt-1 w-full rounded-md border border-[#E4E7EC] px-3 py-2 font-semibold" /></label>}
                        {mappingPreview.action === "CREATE_NEW" && Object.keys(mappingPreview.proposal.fieldConfidence ?? {}).length > 0 && <p className="mt-2 text-[11px] font-semibold text-[#727986]">Proposal confidence: {Object.entries(mappingPreview.proposal.fieldConfidence ?? {}).map(([field, confidence]) => `${field} ${confidence}`).join(" · ")}</p>}
                        {mappingPreview.action === "CREATE_NEW" && <div className="mt-3 grid gap-3"><div className="rounded-md bg-white p-3"><p><strong>Proposed SKU:</strong> {mappingPreview.proposal.proposedSku}</p><p className="mt-1 break-all"><strong>Exact CJ identity:</strong> PID {mappingPreview.product.supplierProductId} · VID {mappingPreview.variant.supplierVariantId}</p>{Object.keys(mappingPreview.proposal.variantAttributes ?? {}).length > 0 ? Object.entries(mappingPreview.proposal.variantAttributes ?? {}).map(([key, value]) => <p key={key}>{key}: {value}</p>) : <p className="mt-1 text-[#727986]">No structured attributes available.</p>}</div>{mappingPreview.proposal.imageUrl && <img src={mappingPreview.proposal.imageUrl} alt="CJ product candidate" className="h-24 w-24 rounded-md object-cover" />}<div><p className="font-black">Safe description candidate</p><p className="mt-1">{mappingPreview.proposal.shortDescription}</p></div>{(mappingPreview.proposal.evidenceSummary ?? []).length > 0 && <div><p className="font-black">Evidence summary</p><ul className="mt-1 list-disc space-y-1 pl-4">{(mappingPreview.proposal.evidenceSummary ?? []).map((item) => <li key={item}>{item}</li>)}</ul></div>}</div>}
                        <div className="mt-3 grid gap-2"><label className="font-black">Evidence note<input value={creationDraft.evidenceNote} onChange={(event) => setCreationDraft({ ...creationDraft, evidenceNote: event.target.value })} className="mt-1 w-full px-3" /><span className="mt-1 block font-semibold text-[#727986]">Used internally to record why this supplier item was confirmed as the TekCentral Product. Prefilled from CJ evidence and editable by staff.</span></label><label className="font-black">Source/reference<input value={creationDraft.sourceReference} onChange={(event) => setCreationDraft({ ...creationDraft, sourceReference: event.target.value })} className="mt-1 w-full px-3" /></label></div>
                        <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setMappingPreview(undefined)} className="rounded-md border border-[#E4E7EC] bg-white px-3 py-2 font-black">Cancel</button><button type="button" onClick={() => void applyExactMapping()} disabled={loading.mappingApply || !creationDraft.evidenceNote.trim() || !creationDraft.sourceReference.trim() || (mappingPreview.action === "CREATE_NEW" && (!creationDraft.name.trim() || !creationDraft.categorySlug))} className="rounded-md bg-[var(--tek-accent)] px-3 py-2 font-black disabled:cursor-not-allowed disabled:bg-[#D0D5DD]">{mappingPreview.action === "MAP_EXISTING" ? "Map exact existing Product" : "Create TekCentral Product & Map"}</button></div>
                      </div>}
                      </section>
                      <section className="rounded-md border border-[#E4E7EC] bg-white p-3">
                      <h5 className="text-sm font-black">Map to existing TekCentral Product</h5>
                      <p className="mt-1 text-xs font-semibold text-[#727986]">Search and select an existing exact Product when it represents the same sellable item.</p>
                      <label className="block text-sm font-black">
                        Search TekCentral products
                        <input value={tekcentralSearch} onChange={(event) => setTekcentralSearch(event.target.value)} placeholder="USB cable, charger, network cable..." className="mt-2 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm font-semibold" />
                      </label>
                      <div className="mt-3 max-h-52 overflow-y-auto rounded-md border border-[#E4E7EC] bg-white">
                        {visibleTekProducts.map((product) => (
                          <button
                            key={product.id}
                            type="button"
                            onClick={() => setTekcentralProductId(product.id)}
                            className={`flex w-full items-start justify-between gap-3 border-b border-[#E4E7EC] px-3 py-2 text-left last:border-b-0 ${tekcentralProductId === product.id ? "bg-[#EFFFFB]" : "hover:bg-[#F6F7F9]"}`}
                          >
                            <span>
                              <span className="block text-sm font-black">{product.name}</span>
                              <span className="mt-1 block text-xs font-semibold text-[#727986]">{product.sku ?? product.id} · {product.category}{product.subcategory ? ` · ${product.subcategory}` : ""}</span>
                            </span>
                            {tekcentralProductId === product.id && <FiCheck className="mt-1 shrink-0 text-[var(--tek-accent)]" aria-hidden="true" />}
                          </button>
                        ))}
                        {visibleTekProducts.length === 0 && tekcentralSearch.trim().length < 2 && <p className="p-3 text-sm font-semibold text-[#727986]">Enter at least 2 characters to search TekCentral products.</p>}
                        {visibleTekProducts.length === 0 && tekcentralSearch.trim().length >= 2 && <div className="p-3"><p className="text-sm font-semibold text-[#727986]">No matching TekCentral Product found.</p><button type="button" onClick={() => void previewExactMapping()} disabled={loading.mappingPreview} className="mt-3 rounded-md border border-[#469D8B] px-3 py-2 text-xs font-black text-[#176B5C] disabled:opacity-50">Create a new TekCentral Product from this CJ item</button></div>}
                      </div>
                      {!tekcentralProductId && <p className="mt-3 text-xs font-black text-[#727986]">Choose an exact existing Product to continue with this path.</p>}
                      {categoryWarning && <p className="mt-3 rounded-md border border-[#FEDF89] bg-[#FFFAEB] px-3 py-2 text-xs font-black text-[#B54708]">These products appear to be from different categories. Verify before mapping.</p>}
                      {selectedVariantDeliveryWarning && <p className="mt-3 rounded-md border border-[#FEDF89] bg-[#FFFAEB] px-3 py-2 text-xs font-black text-[#B54708]">Not currently deliverable to South Africa via CJ.</p>}
                      {mappingFeedback && <div className="mt-3"><AdminFeedback {...mappingFeedback} /></div>}
                      {selectedTekProduct && (
                        <div className="mt-3 rounded-md border border-[#E4E7EC] bg-[#F6F7F9] p-3 text-xs font-semibold text-[#3F4652]">
                          <p className="font-black">Mapping summary</p>
                          <p className="mt-1">TekCentral: {selectedTekProduct.name}</p>
                          <p>CJ product: {selectedProduct.supplierProductName}</p>
                          <p>CJ variant: {variantDisplayName(selectedCjVariant)}</p>
                        </div>
                      )}
                      <button type="button" onClick={suggestMapping} disabled={!canSuggest || loading.suggesting} className="mt-4 inline-flex rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black text-[var(--tek-accent-ink)] disabled:cursor-not-allowed disabled:bg-[#E4E7EC] disabled:text-[#727986]">
                        {loading.suggesting ? "Creating..." : "Map selected Product for review"}
                      </button>
                      </section>
                    </div>
                    )
                  ) : (
                    <p className="mt-3 text-sm font-semibold text-[#727986]">Select the exact CJ variant to continue mapping.</p>
                  )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm font-semibold text-[#727986]">Select a suggestion or open a product from search or browse results.</p>
            )}
          </div>
        </div>
      </section>
    </AdminShell>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <article className="rounded-lg border border-[#E4E7EC] bg-white p-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-[#727986]">{label}</p>
      <div className="mt-2 text-sm font-black">
        {tone ? <AdminStatusBadge label={value} status={tone} /> : value}
      </div>
    </article>
  );
}

function WorkflowStep({ done, active, label }: { done: boolean; active?: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={done ? "text-[#067647]" : active ? "text-[#B54708]" : "text-[#727986]"}>
        {done ? "✓" : active ? "●" : "○"}
      </span>
      {label}
    </li>
  );
}

function flattenCategories(categories: CjCategoryNode[], parentPath = ""): FlattenedCjCategory[] {
  return categories.flatMap((category) => {
    const label = parentPath ? `${parentPath} → ${category.name}` : category.name;
    return [
      {
        key: `${category.level}:${category.categoryId ?? label}`,
        categoryId: category.categoryId,
        name: category.name,
        label,
        parentPath,
      },
      ...flattenCategories(category.children, label),
    ];
  });
}

function productToCatalogueProduct(product: RecentCjProduct): SupplierCatalogueProduct {
  return {
    supplierCode: "CJ",
    supplierProductId: product.supplierProductId,
    supplierSku: product.supplierSku,
    supplierProductName: product.supplierProductName,
    imageUrl: product.imageUrl,
    categoryName: product.categoryName,
    tekcentralCategoryGroup: product.tekcentralCategoryGroup,
    tekcentralRelevanceScore: product.tekcentralRelevanceScore,
    variants: [],
    importedAt: product.lastViewedAt,
    lastFetchedAt: product.lastViewedAt,
    rawSourceFingerprint: product.supplierProductId,
  };
}

function DiscoveryList({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode;
}) {
  const hasItems = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="rounded-md bg-[#F6F7F9] p-4">
      <h3 className="text-sm font-black">{title}</h3>
      <div className="mt-3 grid gap-2">
        {hasItems ? children : <p className="text-sm font-semibold text-[#727986]">{empty}</p>}
      </div>
    </div>
  );
}

function RecentProductButton({
  product,
  onClick,
}: {
  product: RecentCjProduct;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="grid grid-cols-[40px_1fr] gap-3 rounded-md border border-[#E4E7EC] bg-white px-3 py-2 text-left hover:bg-[#F6F7F9]">
      <span className="h-10 w-10 overflow-hidden rounded bg-[#F6F7F9]">
        {product.imageUrl && <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-black">{product.supplierProductName}</span>
        <span className="mt-1 block truncate text-xs font-semibold text-[#727986]">CJ SKU {product.supplierSku ?? "Unknown"}</span>
      </span>
    </button>
  );
}

function ProductRow({
  product,
  onImport,
  onView,
  onRefresh,
  imported = false,
  showVariantCount = true,
  viewLoading = false,
  importLoading = false,
  refreshLoading = false,
  feedback,
}: {
  product: SupplierCatalogueProduct;
  onImport?: () => void;
  onView?: () => void;
  onRefresh?: () => void;
  imported?: boolean;
  showVariantCount?: boolean;
  viewLoading?: boolean;
  importLoading?: boolean;
  refreshLoading?: boolean;
  feedback?: Feedback;
}) {
  return (
    <article className="grid gap-3 rounded-md bg-[#F6F7F9] p-4 md:grid-cols-[72px_1fr_auto] md:items-center">
      <div className="h-16 w-16 overflow-hidden rounded-md bg-white">
        {product.imageUrl && <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />}
      </div>
      <div>
        <p className="text-sm font-black">{product.supplierProductName}</p>
        <p className="mt-1 break-all text-xs font-semibold text-[#727986]">
          CJ SKU {product.supplierSku ?? "Unknown"} · Product ID {product.supplierProductId}
        </p>
        <p className="mt-1 text-xs font-semibold text-[#727986]">
          {product.categoryName ?? "Category unavailable"} · {showVariantCount ? `${product.variants.length} variants` : "View for variants"}
          {supplierPriceLabel(product.supplierPrice, product.currency) ? ` · ${supplierPriceLabel(product.supplierPrice, product.currency)}` : ""}
        </p>
        {feedback && <div className="mt-2"><AdminFeedback {...feedback} /></div>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onView} disabled={viewLoading} className="w-fit rounded-md border border-[#E4E7EC] bg-white px-4 py-2 text-sm font-black disabled:cursor-not-allowed disabled:bg-[#E4E7EC] disabled:text-[#727986]">
          {viewLoading ? "Loading..." : "View"}
        </button>
        {onRefresh && (
          <button type="button" onClick={onRefresh} disabled={refreshLoading} className="w-fit rounded-md border border-[#E4E7EC] bg-white px-4 py-2 text-sm font-black disabled:cursor-wait disabled:bg-[#E4E7EC] disabled:text-[#727986]">
            {refreshLoading ? "Refreshing..." : "Refresh"}
          </button>
        )}
        {imported ? (
          <AdminStatusBadge label="Imported" status="PAID" />
        ) : (
          <button type="button" onClick={onImport} disabled={importLoading} className="w-fit rounded-md border border-[#E4E7EC] bg-white px-4 py-2 text-sm font-black disabled:cursor-not-allowed disabled:bg-[#E4E7EC] disabled:text-[#727986]">
            {importLoading ? "Importing..." : "Import"}
          </button>
        )}
      </div>
    </article>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FiChevronLeft, FiChevronRight, FiLoader } from "react-icons/fi";
import { AdminFeedback, AdminPageHeader, AdminShell, AdminStatusBadge } from "@/components/admin/AdminShell";
import { SupplierWorkspaceNav } from "@/components/admin/SupplierWorkspaceNav";
import { ApiError, apiRequest } from "@/lib/api";
import type { AdminToastVariant } from "@/lib/cj-workflow";
import {
  cjImportedPageSize,
  filterImportedCjProducts,
  mappingStatusForProduct,
  mappingSummaryForProduct,
  supplierPriceLabel,
  supplierStatusForProduct,
  variantDisplayName,
  type MappingStatusFilter,
  type SupplierStatusFilter,
} from "@/lib/cj-workflow";
import { formatDateTime } from "@/lib/order-utils";
import { usePageTitle } from "@/lib/page-title";
import { supplierByCode } from "@/lib/supplier-registry";
import type { SupplierMappingsResponse } from "@/lib/admin";
import type { SupplierCatalogueProduct, SupplierProductMapping } from "@/types/order";

type Feedback = { variant: AdminToastVariant; message: string };

export function AdminCjImportedProductsPage() {
  usePageTitle("Imported CJ products | TekCentral Ops");
  const cjSupplier = supplierByCode("CJ");
  const [importedProducts, setImportedProducts] = useState<SupplierCatalogueProduct[]>([]);
  const [mappings, setMappings] = useState<SupplierProductMapping[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<SupplierCatalogueProduct>();
  const [feedback, setFeedback] = useState<Feedback>();
  const [loading, setLoading] = useState<Record<string, boolean>>({ load: true });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [mappingStatus, setMappingStatus] = useState<MappingStatusFilter>("all");
  const [supplierStatus, setSupplierStatus] = useState<SupplierStatusFilter>("all");
  const [variantMode, setVariantMode] = useState<"all" | "has-variants" | "single-variant">("all");
  const [sort, setSort] = useState<"recently-imported" | "recently-refreshed" | "product-name" | "mapping-status">("recently-imported");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<{ products: SupplierCatalogueProduct[] }>("/api/admin/suppliers/cj/products"),
      apiRequest<SupplierMappingsResponse>("/api/admin/supplier-mappings?supplier=CJ"),
    ])
      .then(([productsResponse, mappingsResponse]) => {
        if (!active) return;
        setImportedProducts(productsResponse.products);
        setMappings(mappingsResponse.mappings);
      })
      .catch((error) => {
        if (!active) return;
        setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "Imported CJ products unavailable." });
      })
      .finally(() => {
        if (active) setLoading((current) => ({ ...current, load: false }));
      });
    return () => {
      active = false;
    };
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(importedProducts.map((product) => product.categoryName).filter((item): item is string => Boolean(item)))).sort(),
    [importedProducts],
  );
  const filteredProducts = useMemo(
    () =>
      filterImportedCjProducts(importedProducts, mappings, {
        search,
        category,
        mappingStatus,
        supplierStatus,
        variantMode,
        sort,
      }),
    [category, importedProducts, mappingStatus, mappings, search, sort, supplierStatus, variantMode],
  );
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / cjImportedPageSize));
  const pageProducts = filteredProducts.slice((page - 1) * cjImportedPageSize, page * cjImportedPageSize);

  const refreshProduct = async (product: SupplierCatalogueProduct) => {
    setLoading((current) => ({ ...current, [product.supplierProductId]: true }));
    setFeedback(undefined);
    try {
      const response = await apiRequest<{ product: SupplierCatalogueProduct }>(
        `/api/admin/suppliers/cj/products/${encodeURIComponent(product.supplierProductId)}/refresh`,
        { method: "PATCH" },
      );
      setImportedProducts((current) => current.map((item) => item.supplierProductId === response.product.supplierProductId ? response.product : item));
      setSelectedProduct((current) => current?.supplierProductId === response.product.supplierProductId ? response.product : current);
      setFeedback({ variant: "success", message: "CJ product refreshed." });
    } catch (error) {
      setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "CJ product refresh failed." });
    } finally {
      setLoading((current) => ({ ...current, [product.supplierProductId]: false }));
    }
  };

  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="Supplier catalogue"
        title="Imported CJ products"
        description="Manage CJ supplier catalogue records TekCentral has deliberately imported. Ordering actions remain out of scope."
        actions={
          <Link to="/admin/suppliers/cj" className="rounded-md border border-[#E4E7EC] bg-white px-4 py-2 text-sm font-black">
            Back to discovery
          </Link>
        }
      />
      {cjSupplier && <SupplierWorkspaceNav supplier={cjSupplier} />}

      <section className="mt-6 rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_180px_180px_180px_180px]">
          <label className="text-sm font-black">
            Search
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Product name, CJ SKU or product ID" className="mt-2 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm font-semibold" />
          </label>
          <label className="text-sm font-black">
            Category
            <select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }} className="mt-2 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm font-semibold">
              <option value="">All categories</option>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-sm font-black">
            Mapping
            <select value={mappingStatus} onChange={(event) => { setMappingStatus(event.target.value as MappingStatusFilter); setPage(1); }} className="mt-2 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm font-semibold">
              {["all", "UNMAPPED", "SUGGESTED", "VERIFIED", "STALE", "REJECTED"].map((item) => <option key={item} value={item}>{item.replace(/_/g, " ")}</option>)}
            </select>
          </label>
          <label className="text-sm font-black">
            Supplier status
            <select value={supplierStatus} onChange={(event) => { setSupplierStatus(event.target.value as SupplierStatusFilter); setPage(1); }} className="mt-2 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm font-semibold">
              {["all", "available", "unavailable", "stale", "needs-refresh"].map((item) => <option key={item} value={item}>{item.replace(/-/g, " ")}</option>)}
            </select>
          </label>
          <label className="text-sm font-black">
            Variants
            <select value={variantMode} onChange={(event) => { setVariantMode(event.target.value as typeof variantMode); setPage(1); }} className="mt-2 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm font-semibold">
              <option value="all">All</option>
              <option value="has-variants">Has variants</option>
              <option value="single-variant">Single variant</option>
            </select>
          </label>
          <label className="text-sm font-black">
            Sort
            <select value={sort} onChange={(event) => { setSort(event.target.value as typeof sort); setPage(1); }} className="mt-2 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm font-semibold">
              <option value="recently-imported">Recently imported</option>
              <option value="recently-refreshed">Recently refreshed</option>
              <option value="product-name">Product name</option>
              <option value="mapping-status">Mapping status</option>
            </select>
          </label>
        </div>
        {feedback && <div className="mt-4"><AdminFeedback {...feedback} /></div>}
      </section>

      <section className="mt-6 overflow-hidden rounded-lg border border-[#E4E7EC] bg-white shadow-sm">
        <div className="hidden grid-cols-[1.45fr_150px_1fr_90px_140px_150px_140px_220px] gap-4 border-b border-[#E4E7EC] bg-[#F6F7F9] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-[#727986] xl:grid">
          <span>Product</span>
          <span>CJ SKU</span>
          <span>Category</span>
          <span>Variants</span>
          <span>Mapping</span>
          <span>Last refresh</span>
          <span>Supplier status</span>
          <span>Actions</span>
        </div>
        <div className="divide-y divide-[#E4E7EC]">
          {loading.load && <p className="p-6 text-sm font-semibold text-[#727986]">Loading imported CJ products...</p>}
          {!loading.load && pageProducts.map((product) => {
            const supplierStatusLabel = supplierStatusForProduct(product);
            return (
              <article key={product.supplierProductId} className="grid gap-4 px-4 py-4 xl:grid-cols-[1.45fr_150px_1fr_90px_140px_150px_140px_220px] xl:items-center">
                <div className="grid grid-cols-[56px_1fr] gap-3">
                  <span className="h-14 w-14 overflow-hidden rounded-md bg-[#F6F7F9]">
                    {product.imageUrl && <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-black">{product.supplierProductName}</span>
                    <span className="mt-1 block break-all text-xs font-semibold text-[#727986]">CJ Product ID {product.supplierProductId}</span>
                  </span>
                </div>
                <p className="break-all text-xs font-semibold text-[#727986]">{product.supplierSku ?? "Unknown"}</p>
                <p className="text-xs font-semibold text-[#727986]">{product.categoryName ?? "Category unavailable"}</p>
                <p className="text-sm font-black">{product.variants.length}</p>
                <AdminStatusBadge label={mappingSummaryForProduct(product, mappings)} status={mappingStatusForProduct(product, mappings)} />
                <p className="text-xs font-semibold text-[#727986]">{product.lastSuccessfulRefreshAt ? formatDateTime(product.lastSuccessfulRefreshAt) : "Not refreshed"}</p>
                <AdminStatusBadge label={supplierStatusLabel} status={supplierStatusLabel} />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setSelectedProduct(product)} className="rounded-md border border-[#E4E7EC] bg-white px-3 py-2 text-sm font-black">
                    View
                  </button>
                  <button type="button" onClick={() => refreshProduct(product)} disabled={loading[product.supplierProductId]} className="inline-flex items-center gap-2 rounded-md border border-[#E4E7EC] bg-white px-3 py-2 text-sm font-black disabled:cursor-wait disabled:text-[#727986]">
                    {loading[product.supplierProductId] && <FiLoader className="animate-spin" aria-hidden="true" />}
                    Refresh
                  </button>
                  <Link to="/admin/supplier-mappings?supplier=CJ" className="rounded-md border border-[#E4E7EC] bg-white px-3 py-2 text-sm font-black">
                    {mappingStatusForProduct(product, mappings) === "UNMAPPED" ? "Map" : "Review Mapping"}
                  </Link>
                </div>
              </article>
            );
          })}
          {!loading.load && pageProducts.length === 0 && <p className="p-6 text-sm font-semibold text-[#727986]">No imported CJ products match these filters.</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E4E7EC] bg-[#F6F7F9] px-4 py-3">
          <p className="text-xs font-semibold text-[#727986]">
            Showing {pageProducts.length} of {filteredProducts.length} imported products · Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} className="inline-flex items-center gap-2 rounded-md border border-[#E4E7EC] bg-white px-3 py-2 text-sm font-black disabled:cursor-not-allowed disabled:text-[#727986]">
              <FiChevronLeft aria-hidden="true" /> Previous
            </button>
            <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages} className="inline-flex items-center gap-2 rounded-md border border-[#E4E7EC] bg-white px-3 py-2 text-sm font-black disabled:cursor-not-allowed disabled:text-[#727986]">
              Next <FiChevronRight aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      {selectedProduct && (
        <section className="mt-6 rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm">
          <div className="grid gap-5 lg:grid-cols-[160px_1fr]">
            <div className="h-40 w-40 overflow-hidden rounded-md bg-[#F6F7F9]">
              {selectedProduct.imageUrl && <img src={selectedProduct.imageUrl} alt="" className="h-full w-full object-cover" />}
            </div>
            <div>
              <h2 className="text-lg font-black">{selectedProduct.supplierProductName}</h2>
              <p className="mt-2 text-xs font-semibold text-[#727986]">CJ Product ID {selectedProduct.supplierProductId} · CJ SKU {selectedProduct.supplierSku ?? "Unknown"}</p>
              <p className="mt-1 text-xs font-semibold text-[#727986]">{selectedProduct.categoryName ?? "Category unavailable"}</p>
              <p className="mt-1 text-xs font-semibold text-[#727986]">{supplierPriceLabel(selectedProduct.supplierPrice, selectedProduct.currency) ?? "Price unavailable"}</p>
              <div className="mt-4 grid gap-2">
                {selectedProduct.variants.slice(0, 12).map((variant) => (
                  <div key={variant.supplierVariantId} className="rounded-md bg-[#F6F7F9] p-3 text-sm font-semibold text-[#3F4652]">
                    <p className="font-black">{variantDisplayName(variant)}</p>
                    <p className="mt-1 text-xs text-[#727986]">SKU: {variant.supplierVariantSku ?? "Unknown"} · VID: {variant.supplierVariantId}</p>
                    <p className="mt-1 text-xs text-[#727986]">{supplierPriceLabel(variant.price ?? selectedProduct.supplierPrice, variant.currency ?? selectedProduct.currency) ?? "Price unavailable"} · {variant.stockTotal !== undefined ? `Stock: ${variant.stockTotal}` : "Stock not checked"}</p>
                  </div>
                ))}
                {selectedProduct.variants.length > 12 && <p className="text-xs font-semibold text-[#727986]">Showing 12 of {selectedProduct.variants.length} variants.</p>}
              </div>
            </div>
          </div>
        </section>
      )}
    </AdminShell>
  );
}

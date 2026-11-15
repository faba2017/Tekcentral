import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FiBox } from "react-icons/fi";
import {
  AdminPageHeader,
  AdminShell,
  AdminStatusBadge,
} from "@/components/admin/AdminShell";
import {
  AdminIdentityCell,
  AdminPagination,
  AdminTable,
  AdminTableActions,
  AdminTableBody,
  AdminTableCell,
  AdminTableContainer,
  AdminTableHead,
  AdminTableHeader,
  AdminTableRow,
  AdminTableState,
  AdminTableToolbar,
} from "@/components/admin/AdminTable";
import { ProductConfigurationLink } from "@/components/admin/ProductConfigurationWorkspace";
import { normalizeAdminPagination } from "@/lib/admin-table";
import { apiRequest } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import type { AdminInternalProduct } from "@/lib/admin";
import { usePageTitle } from "@/lib/page-title";
import type { ProductAvailabilityState } from "@/types/product";

type ProductRow = AdminInternalProduct & {
  canonicalInternalProductId?: string;
  publicationActionAvailable: boolean;
  recordQuality: "CANONICAL" | "LEGACY_ORPHAN";
  publicationState: string;
  launchReadiness: string;
  approvedPrice?: number;
  availabilityState: ProductAvailabilityState;
  availabilityReason: string;
  availabilityFreshness: "FRESH" | "STALE" | "UNKNOWN";
  supplierCount: number;
  suppliers: string[];
  lastUpdatedAt?: string;
  attention: string[];
};
type TaxonomyNode = {
  id: string;
  name: string;
  label: string;
  children: TaxonomyNode[];
  productTypes?: TaxonomyNode[];
};
type View = "ALL" | "ATTENTION" | "READY" | "PUBLISHED";
const views: [View, string][] = [
  ["ALL", "All Products"],
  ["ATTENTION", "Needs Attention"],
  ["READY", "Ready for Review"],
  ["PUBLISHED", "Published"],
];
const availabilityOptions: [string, string][] = [
  ["IN_STOCK,LOW_STOCK", "In stock"],
  ["AVAILABLE_FROM_SUPPLIER", "Available from supplier"],
  ["OUT_OF_STOCK", "Out of stock"],
  ["CHECK_REQUIRED,DELIVERY_CHECK_REQUIRED", "Check required"],
  ["AVAILABILITY_UNKNOWN", "Unknown"],
];
const availabilityLabels: Record<ProductAvailabilityState, string> = {
  IN_STOCK: "In stock",
  LOW_STOCK: "Limited stock",
  AVAILABLE_FROM_SUPPLIER: "Available from supplier",
  OUT_OF_STOCK: "Out of stock",
  CHECK_REQUIRED: "Check required",
  DELIVERY_CHECK_REQUIRED: "Check required",
  AVAILABILITY_UNKNOWN: "Unknown",
  BACKORDER: "Backorder",
  PREORDER: "Pre-order",
  DISCONTINUED: "Discontinued",
};

export function AdminProductsPage() {
  usePageTitle("Products | TekCentral Ops");
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [taxonomy, setTaxonomy] = useState<TaxonomyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [legacyDetail, setLegacyDetail] = useState<ProductRow>();
  const view = (params.get("view") ?? "ALL") as View;
  const query = params.get("search") ?? "";
  const categoryId = params.get("category") ?? "";
  const subcategoryId = params.get("subcategory") ?? "";
  const productTypeId = params.get("productType") ?? "";
  const taxonomyState = params.get("taxonomy") ?? "";
  const availabilityState = params.get("availability") ?? "";
  const update = (values: Record<string, string | undefined>, reset = false) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        Object.entries(values).forEach(([key, value]) =>
          value ? next.set(key, value) : next.delete(key),
        );
        if (reset) next.set("page", "1");
        return next;
      },
      { replace: true },
    );
  useEffect(() => {
    void Promise.all([
      apiRequest<{ products: ProductRow[] }>("/api/admin/products"),
      apiRequest<{ categories: TaxonomyNode[] }>("/api/admin/product-taxonomy"),
    ])
      .then(([result, taxonomyResult]) => {
        setProducts(result.products);
        setTaxonomy(taxonomyResult.categories);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);
  const matchView = (product: ProductRow, id: View) =>
    id === "ALL" ||
    (id === "ATTENTION" && product.attention.length > 0) ||
    (id === "READY" &&
      product.publicationState === "READY_FOR_PUBLISH_REVIEW") ||
    (id === "PUBLISHED" && product.publicationState === "PUBLISHED");
  const visible = useMemo(
    () =>
      products.filter((product) => {
        const search = query.trim().toLowerCase();
        const availabilityMatches =
          !availabilityState ||
          availabilityState.split(",").includes(product.availabilityState);
        return (
          matchView(product, view) &&
          availabilityMatches &&
          (!search ||
            `${product.name} ${product.sku} ${product.brand} ${product.taxonomyLabels?.category ?? product.category} ${product.taxonomyLabels?.subcategory ?? ""} ${product.taxonomyLabels?.productType ?? ""}`
              .toLowerCase()
              .includes(search)) &&
          (!categoryId || product.categoryId === categoryId) &&
          (!subcategoryId || product.subcategoryId === subcategoryId) &&
          (!productTypeId || product.productTypeId === productTypeId) &&
          (!taxonomyState || product.taxonomyStatus === taxonomyState)
        );
      }),
    [
      products,
      query,
      view,
      categoryId,
      subcategoryId,
      productTypeId,
      taxonomyState,
      availabilityState,
    ],
  );
  const productTaxonomy = taxonomy;
  const selectedCategory = taxonomy.find((item) => item.id === categoryId);
  const selectedSubcategory = selectedCategory?.children.find(
    (item) => item.id === subcategoryId,
  );
  const pagination = normalizeAdminPagination(
    Number(params.get("page") ?? 1),
    Number(params.get("pageSize") ?? 15),
    visible.length,
  );
  const rows = visible.slice(
    (pagination.page - 1) * pagination.pageSize,
    pagination.page * pagination.pageSize,
  );
  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="Product operations"
        title="Products"
        description="Manage supplier-neutral TekCentral Products, readiness, content and storefront publication."
      />
      <AdminTableToolbar>
        <div className="flex flex-wrap gap-2">
          {views.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() =>
                update({ view: id === "ALL" ? undefined : id }, true)
              }
              className={`rounded-md border px-3 py-2 text-xs font-black ${view === id ? "border-[#176B5C] bg-[#E8F7F3] text-[#176B5C]" : "border-[#D0D5DD] bg-white"}`}
            >
              {label} (
              {products.filter((product) => matchView(product, id)).length})
            </button>
          ))}
        </div>
        <div className="grid w-full gap-2 md:grid-cols-2 xl:grid-cols-6">
          <label className="text-xs font-black uppercase text-[#667085]">
            Search
            <input
              value={query}
              onChange={(event) =>
                update({ search: event.target.value || undefined }, true)
              }
              className="mt-1 h-10 w-full rounded-md border border-[#D0D5DD] px-3 text-sm normal-case"
              placeholder="Product, SKU, brand or category"
            />
          </label>
          <Filter
            label="Category"
            value={categoryId}
            onChange={(value) =>
              update(
                {
                  category: value,
                  subcategory: undefined,
                  productType: undefined,
                },
                true,
              )
            }
            options={productTaxonomy.map((item) => [item.id, item.label])}
          />
          <Filter
            label="Subcategory"
            value={subcategoryId}
            onChange={(value) =>
              update({ subcategory: value, productType: undefined }, true)
            }
            options={(selectedCategory?.children ?? []).map((item) => [
              item.id,
              item.label,
            ])}
          />
          <Filter
            label="Product type"
            value={productTypeId}
            onChange={(value) => update({ productType: value }, true)}
            options={(selectedSubcategory?.productTypes ?? []).map((item) => [
              item.id,
              item.label,
            ])}
          />
          <Filter
            label="Taxonomy state"
            value={taxonomyState}
            onChange={(value) => update({ taxonomy: value }, true)}
            options={[
              ["VERIFIED", "Verified"],
              ["REVIEW_REQUIRED", "Review required"],
              ["UNMAPPED", "Unmapped"],
            ]}
          />
          <Filter
            label="Availability"
            value={availabilityState}
            onChange={(value) => update({ availability: value }, true)}
            options={availabilityOptions}
          />
        </div>
      </AdminTableToolbar>
      <AdminTableContainer label="Products">
        <AdminTable minWidth={1040}>
          <AdminTableHead>
            <AdminTableRow>
              <AdminTableHeader>Product</AdminTableHeader>
              <AdminTableHeader>Publication</AdminTableHeader>
              <AdminTableHeader>Readiness</AdminTableHeader>
              <AdminTableHeader align="right">Price</AdminTableHeader>
              <AdminTableHeader>Availability</AdminTableHeader>
              <AdminTableHeader>Suppliers</AdminTableHeader>
              <AdminTableHeader align="right">Action</AdminTableHeader>
            </AdminTableRow>
          </AdminTableHead>
          <AdminTableBody>
            {loading && (
              <AdminTableState
                colSpan={7}
                kind="loading"
                title="Loading products..."
              />
            )}
            {failed && (
              <AdminTableState
                colSpan={7}
                kind="error"
                title="Products could not be loaded."
              />
            )}
            {!loading &&
              !failed &&
              rows.map((product) => {
                const setupId = product.canonicalInternalProductId;
                const legacy = product.recordQuality === "LEGACY_ORPHAN";
                const taxonomy =
                  [
                    product.taxonomyLabels?.category,
                    product.taxonomyLabels?.subcategory,
                    product.taxonomyLabels?.productType,
                  ]
                    .filter(Boolean)
                    .join(" / ") || "Unmapped";
                return (
                  <AdminTableRow key={product.id}>
                    <AdminTableCell>
                      <AdminIdentityCell
                        imageUrl={product.images?.[0]}
                        imageAlt={product.name}
                        fallback={<FiBox />}
                        primary={
                          setupId ? (
                            <ProductConfigurationLink
                              productId={setupId}
                              className="hover:text-[#176B5C]"
                            >
                              {product.name}
                            </ProductConfigurationLink>
                          ) : (
                            product.name
                          )
                        }
                        primaryTitle={product.name}
                        secondary={`${product.sku} · ${product.brand} · ${taxonomy}`}
                        tertiary={
                          legacy
                            ? "Legacy record · No canonical Product"
                            : product.attention.length
                              ? product.attention
                                  .map((item) => item.replace(/_/g, " "))
                                  .join(" · ")
                              : undefined
                        }
                      />
                    </AdminTableCell>
                    <AdminTableCell>
                      <AdminStatusBadge
                        label={
                          legacy
                            ? "Needs repair"
                            : product.publicationState.replace(/_/g, " ")
                        }
                        status={legacy ? "FAILED" : product.publicationState}
                      />
                    </AdminTableCell>
                    <AdminTableCell className="font-bold">
                      {legacy
                        ? "Publication unavailable until repaired"
                        : product.launchReadiness.replace(/_/g, " ")}
                    </AdminTableCell>
                    <AdminTableCell
                      align="right"
                      className="font-black text-[#101828]"
                    >
                      {product.approvedPrice === undefined
                        ? "Not approved"
                        : formatCurrency(product.approvedPrice, "ZAR")}
                    </AdminTableCell>
                    <AdminTableCell>
                      <span
                        title={product.availabilityReason}
                        className="inline-flex"
                        tabIndex={0}
                        aria-label={`${availabilityLabels[product.availabilityState]}. ${product.availabilityReason}`}
                      >
                        <AdminStatusBadge
                          label={availabilityLabels[product.availabilityState]}
                          status={
                            product.availabilityState === "IN_STOCK" ||
                            product.availabilityState === "LOW_STOCK" ||
                            product.availabilityState ===
                              "AVAILABLE_FROM_SUPPLIER"
                              ? "PAID"
                              : product.availabilityState === "OUT_OF_STOCK" ||
                                  product.availabilityState === "DISCONTINUED"
                                ? "FAILED"
                                : "PENDING"
                          }
                        />
                      </span>
                    </AdminTableCell>
                    <AdminTableCell>
                      {product.supplierCount}
                      <span className="block text-xs text-[#667085]">
                        {product.suppliers.join(", ") || "No supplier"}
                      </span>
                    </AdminTableCell>
                    <AdminTableCell align="right">
                      <AdminTableActions
                        primary={
                          setupId ? (
                            <ProductConfigurationLink
                              productId={setupId}
                              className="rounded-md border border-[#D0D5DD] px-3 py-2 text-xs font-black"
                            >
                              Continue setup
                            </ProductConfigurationLink>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setLegacyDetail(product)}
                              className="rounded-md border border-[#D0D5DD] px-3 py-2 text-xs font-black"
                            >
                              Details
                            </button>
                          )
                        }
                      />
                    </AdminTableCell>
                  </AdminTableRow>
                );
              })}
            {!loading && !failed && rows.length === 0 && (
              <AdminTableState
                colSpan={7}
                kind="empty"
                title="No Products match this view."
              />
            )}
          </AdminTableBody>
        </AdminTable>
        <AdminPagination
          meta={pagination}
          noun="products"
          onPageChange={(page) => update({ page: String(page) })}
          onPageSizeChange={(pageSize) =>
            update({ pageSize: String(pageSize) }, true)
          }
        />
      </AdminTableContainer>
      {legacyDetail && (
        <LegacyProductDialog
          product={legacyDetail}
          close={() => setLegacyDetail(undefined)}
        />
      )}
    </AdminShell>
  );
}

function Filter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[][];
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-black uppercase text-[#667085]">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-md border border-[#D0D5DD] bg-white px-2 text-sm font-semibold normal-case"
      >
        <option value="">All</option>
        {options.map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function LegacyProductDialog({
  product,
  close,
}: {
  product: ProductRow;
  close: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="legacy-product-title"
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-2xl"
      >
        <p className="text-xs font-black uppercase text-[#B42318]">
          Needs repair
        </p>
        <h2 id="legacy-product-title" className="mt-2 text-xl font-black">
          {product.name}
        </h2>
        <p className="mt-2 text-sm font-semibold text-[#667085]">
          This legacy catalogue record is not linked to a canonical TekCentral
          Product. Publication is unavailable until a controlled repair workflow
          is completed.
        </p>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-bold text-[#667085]">SKU</dt>
            <dd className="mt-1 font-black">{product.sku}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-[#667085]">Record state</dt>
            <dd className="mt-1 font-black">Legacy record</dd>
          </div>
        </dl>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            disabled
            className="rounded-md border border-[#D0D5DD] px-3 py-2 text-sm font-black opacity-50"
          >
            Repair workflow coming next
          </button>
          <button
            type="button"
            autoFocus
            onClick={close}
            className="rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black"
          >
            Close
          </button>
        </div>
      </section>
    </div>
  );
}

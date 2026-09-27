import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { products } from "@/data/catalogue";
import { AdminFeedback, AdminPageHeader, AdminShell, AdminStatusBadge } from "@/components/admin/AdminShell";
import { SupplierWorkspaceNav } from "@/components/admin/SupplierWorkspaceNav";
import { AdminToastRegion, type AdminToastMessage } from "@/components/admin/AdminToast";
import { ApiError, apiRequest } from "@/lib/api";
import type { AdminToastVariant } from "@/lib/cj-workflow";
import { upsertMapping } from "@/lib/cj-workflow";
import { usePageTitle } from "@/lib/page-title";
import { supplierByCode } from "@/lib/supplier-registry";
import type { ScoopCatalogueProduct, SupplierMappingsResponse } from "@/lib/admin";
import type { SupplierCode, SupplierProductMapping } from "@/types/order";

export function AdminSupplierMappingsPage() {
  usePageTitle("Supplier mappings | TekCentral Ops");
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const supplierCode = (query.get("supplier") || "CJ") as SupplierCode;
  const selectedSupplierSku = query.get("supplierSku") ?? "";
  const supplier = supplierByCode(supplierCode);
  const [mappings, setMappings] = useState<SupplierProductMapping[]>([]);
  const [scoopProduct, setScoopProduct] = useState<ScoopCatalogueProduct>();
  const [selectedTekcentralProductId, setSelectedTekcentralProductId] = useState("");
  const [feedback, setFeedback] = useState<Record<string, { variant: AdminToastVariant; message: string }>>({});
  const [loadingMappingId, setLoadingMappingId] = useState<string>();
  const [toasts, setToasts] = useState<AdminToastMessage[]>([]);
  const toastIdPrefix = useId();
  const toastCounter = useRef(0);

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

  useEffect(() => {
    apiRequest<SupplierMappingsResponse>(`/api/admin/supplier-mappings?supplier=${encodeURIComponent(supplierCode)}`)
      .then((response) => setMappings(response.mappings))
      .catch(() => setMappings([]));
  }, [supplierCode]);

  useEffect(() => {
    if (supplierCode !== "SCOOP" || !selectedSupplierSku) return;
    apiRequest<{ product?: ScoopCatalogueProduct }>(
      `/api/admin/suppliers/scoop/products/${encodeURIComponent(selectedSupplierSku)}`,
    )
      .then((response) => setScoopProduct(response.product))
      .catch(() => setScoopProduct(undefined));
  }, [selectedSupplierSku, supplierCode]);

  const grouped = useMemo(
    () => mappings.sort((a, b) => (a.status ?? "").localeCompare(b.status ?? "")),
    [mappings],
  );

  const updateMapping = async (id: string | undefined, action: "verify" | "reject" | "check-stale") => {
    if (!id) return;
    const currentMapping = mappings.find((mapping) => mapping.id === id);
    const confirmWeakMatch = action === "verify" && currentMapping?.supplierCode === "SCOOP" && currentMapping.confidenceLevel === "LOW"
      ? window.confirm("This appears to be a weak product match. Confirm that both records represent the same physical product before verifying.")
      : false;
    if (action === "verify" && currentMapping?.supplierCode === "SCOOP" && currentMapping.confidenceLevel === "LOW" && !confirmWeakMatch) return;
    setLoadingMappingId(id);
    try {
      const response = await apiRequest<{ mapping: SupplierProductMapping }>(`/api/admin/supplier-mappings/${encodeURIComponent(id)}/${action}`, {
        method: "PATCH",
        ...(confirmWeakMatch ? { body: JSON.stringify({ confirmWeakMatch }) } : {}),
      });
      setMappings((current) => upsertMapping(current, response.mapping));
      const message =
        action === "verify"
          ? "Mapping verified."
          : action === "reject"
            ? "Mapping rejected."
            : "Mapping checked.";
      setFeedback((current) => ({ ...current, [id]: { variant: "success", message } }));
      addToast("success", message);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Supplier mapping update failed.";
      setFeedback((current) => ({ ...current, [id]: { variant: "error", message } }));
      addToast("error", message);
    } finally {
      setLoadingMappingId(undefined);
    }
  };

  const suggestScoopMapping = async () => {
    if (!selectedTekcentralProductId || !scoopProduct) return;
    try {
      const response = await apiRequest<{ mapping: SupplierProductMapping }>("/api/admin/supplier-mappings/scoop/suggest", {
        method: "POST",
        body: JSON.stringify({
          tekcentralProductId: selectedTekcentralProductId,
          supplierSku: scoopProduct.supplierSku,
        }),
      });
      setMappings((current) => upsertMapping(current, response.mapping));
      addToast("success", "Scoop mapping suggested.");
    } catch (error) {
      addToast("error", error instanceof ApiError ? error.message : "Scoop mapping could not be suggested.");
    }
  };

  return (
    <AdminShell>
      <AdminToastRegion toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
      <AdminPageHeader
        eyebrow="Supplier mappings"
        title={`${supplier?.displayName ?? supplierCode} mapping review`}
        description="Staff verification for product-to-supplier mappings. Suggested mappings are not eligible for automated procurement until verified."
      />
      {supplier && <SupplierWorkspaceNav supplier={supplier} />}
      {supplierCode === "SCOOP" && scoopProduct && (
        <section className="mt-6 rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#727986]">Selected Scoop offer</p>
          <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_280px_auto] lg:items-end">
            <div>
              <p className="text-sm font-black">{scoopProduct.supplierSku}</p>
              <p className="mt-1 text-sm font-semibold text-[#3F4652]">{scoopProduct.description}</p>
              <p className="mt-1 text-xs font-semibold text-[#727986]">{scoopProduct.manufacturer ?? "Manufacturer unknown"}</p>
            </div>
            <label className="text-sm font-black">
              TekCentral product
              <select
                value={selectedTekcentralProductId}
                onChange={(event) => setSelectedTekcentralProductId(event.target.value)}
                className="mt-2 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm font-semibold"
              >
                <option value="">Choose product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={suggestScoopMapping}
              disabled={!selectedTekcentralProductId}
              className="rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black text-[var(--tek-accent-ink)] disabled:cursor-not-allowed disabled:bg-[#E4E7EC] disabled:text-[#727986]"
            >
              Suggest mapping
            </button>
          </div>
        </section>
      )}
      <section className="mt-6 rounded-lg border border-[#E4E7EC] bg-white shadow-sm">
        <div className="hidden grid-cols-[1fr_1.25fr_120px_200px] gap-4 border-b border-[#E4E7EC] bg-[#F6F7F9] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-[#727986] lg:grid">
          <span>TekCentral product</span>
          <span>CJ product / variant</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        <div className="divide-y divide-[#E4E7EC]">
          {grouped.map((mapping) => {
            const tekProduct = products.find((product) => product.id === mapping.productId);
            const mappingSupplier = supplierByCode(mapping.supplierCode);
            return (
              <article key={mapping.id ?? `${mapping.productId}-${mapping.supplierSku}`} className="grid gap-4 px-4 py-4 lg:grid-cols-[1fr_1.25fr_120px_200px] lg:items-center">
                <div>
                  <p className="text-sm font-black">{tekProduct?.name ?? mapping.productId}</p>
                  <p className="mt-1 text-xs font-semibold text-[#727986]">TekCentral SKU {tekProduct?.sku ?? mapping.productId}</p>
                  <p className="mt-1 text-xs font-semibold text-[#727986]">{tekProduct?.category ?? "Category unknown"}</p>
                </div>
                <div>
                  <p className="text-sm font-black">{mappingSupplier?.displayName ?? mapping.supplierCode} SKU: {mapping.supplierProductSku ?? mapping.supplierSku}</p>
                  <p className="mt-1 text-xs font-semibold text-[#727986]">
                    Product ID {mapping.supplierProductId ?? "Pending"} · Variant SKU {mapping.supplierVariantSku ?? "Pending"} · Variant ID {mapping.supplierVariantId ?? "Pending"}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[#727986]">
                    Confidence {mapping.confidenceLevel ?? (mapping.confidence !== undefined ? `${Math.round(mapping.confidence * 100)}%` : "Pending")} · Evidence {(mapping.evidence ?? []).join(", ") || "Staff review"}
                  </p>
                  {mapping.id && feedback[mapping.id] && <div className="mt-2"><AdminFeedback {...feedback[mapping.id]} /></div>}
                </div>
                <AdminStatusBadge label={mapping.status ?? "Suggested"} status={mapping.status ?? "SUGGESTED"} />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => updateMapping(mapping.id, "verify")} disabled={mapping.status === "VERIFIED" || loadingMappingId === mapping.id} className="rounded-md bg-[var(--tek-accent)] px-3 py-2 text-sm font-black text-[var(--tek-accent-ink)] disabled:cursor-not-allowed disabled:bg-[#E4E7EC] disabled:text-[#727986]">
                    {loadingMappingId === mapping.id ? "Updating..." : "Verify"}
                  </button>
                  <button type="button" onClick={() => updateMapping(mapping.id, "reject")} disabled={mapping.status === "REJECTED" || loadingMappingId === mapping.id} className="rounded-md border border-[#FDA29B] px-3 py-2 text-sm font-black text-[#B42318] disabled:cursor-not-allowed disabled:border-[#E4E7EC] disabled:text-[#727986]">
                    Reject
                  </button>
                  {mapping.supplierCode === "CJ" && (
                    <button type="button" onClick={() => updateMapping(mapping.id, "check-stale")} disabled={loadingMappingId === mapping.id} className="rounded-md border border-[#E4E7EC] px-3 py-2 text-sm font-black disabled:cursor-wait disabled:text-[#727986]">
                      Check
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          {grouped.length === 0 && <p className="p-6 text-sm font-semibold text-[#727986]">No {supplier?.displayName ?? supplierCode} mappings yet.</p>}
        </div>
      </section>
    </AdminShell>
  );
}

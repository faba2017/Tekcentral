import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FiChevronLeft, FiChevronRight, FiLoader } from "react-icons/fi";
import { AdminFeedback, AdminPageHeader, AdminShell, AdminStatusBadge } from "@/components/admin/AdminShell";
import { AdminTable, AdminTableActions, AdminTableBody, AdminTableCell, AdminTableContainer, AdminTableHead, AdminTableHeader, AdminTableRow, AdminTableState } from "@/components/admin/AdminTable";
import { SupplierAvailability, SupplierCommercialEvidence, SupplierMappingStatus, SupplierProductIdentity, SupplierProductNextAction, SupplierProductReadiness } from "@/components/admin/SupplierProductTable";
import { SupplierWorkspaceNav } from "@/components/admin/SupplierWorkspaceNav";
import { ProductConfigurationLink } from "@/components/admin/ProductConfigurationWorkspace";
import { ApiError, apiRequest } from "@/lib/api";
import type { AdminToastVariant } from "@/lib/cj-workflow";
import {
  cjImportedPageSize,
  filterImportedCjProducts,
  mappingStatusForProduct,
  shouldShowCjMappingEditor,
  supplierPriceLabel,
  supplierStatusForProduct,
  variantDisplayName,
  type MappingStatusFilter,
  type SupplierStatusFilter,
} from "@/lib/cj-workflow";
import { usePageTitle } from "@/lib/page-title";
import { supplierByCode } from "@/lib/supplier-registry";
import type { AdminInternalProduct, CjLaunchReadinessResponse, CjLaunchReadinessRow, SupplierMappingsResponse } from "@/lib/admin";
import type { SupplierCatalogueProduct, SupplierProductMapping } from "@/types/order";

type Feedback = { variant: AdminToastVariant; message: string };
type CjProductCreationPreview = {
  proposalVersion?: number;
  proposalFingerprint?: string;
  action: "MAP_EXISTING" | "CREATE_NEW";
  reason: string;
  currentMapping?: SupplierProductMapping;
  currentMappedProduct?: AdminInternalProduct;
  existingProduct?: AdminInternalProduct;
  candidates: { product: Pick<AdminInternalProduct, "id" | "name" | "sku" | "brand" | "model" | "category"> & { publicationStatus: string }; exactIdentity: boolean; confidence: "HIGH" | "MEDIUM" | "LOW"; evidence: string[]; supplierCodes: string[]; demoProduct: boolean }[];
  proposal: { name: string; brand: string; model: string; categorySlug: string; categoryName?: string; subcategory: string; proposedSku: string; imageUrl?: string; shortDescription: string; categoryReviewRequired: boolean; variantAttributes?: Record<string, string> | null; evidenceNote?: string | null; sourceReference?: string | null; fieldConfidence?: Record<"title" | "brand" | "model" | "category" | "subcategory" | "description", "HIGH" | "MEDIUM" | "LOW"> | null; evidenceSummary?: string[] | null };
  categories?: { slug: string; name: string; subcategories: string[] }[] | null;
};

export function AdminCjImportedProductsPage() {
  usePageTitle("Imported CJ products | TekCentral Ops");
  const cjSupplier = supplierByCode("CJ");
  const [importedProducts, setImportedProducts] = useState<SupplierCatalogueProduct[]>([]);
  const [mappings, setMappings] = useState<SupplierProductMapping[]>([]);
  const [launchData, setLaunchData] = useState<CjLaunchReadinessResponse>();
  const [selectedProduct, setSelectedProduct] = useState<SupplierCatalogueProduct>();
  const [feedback, setFeedback] = useState<Feedback>();
  const [loading, setLoading] = useState<Record<string, boolean>>({ load: true });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [mappingStatus, setMappingStatus] = useState<MappingStatusFilter>("all");
  const [supplierStatus, setSupplierStatus] = useState<SupplierStatusFilter>("all");
  const [variantMode, setVariantMode] = useState<"all" | "has-variants" | "single-variant">("all");
  const [launchFilter, setLaunchFilter] = useState<"all" | "CANDIDATE" | "SELECTED_FOR_LAUNCH">("all");
  const [logisticsFilter, setLogisticsFilter] = useState<"all" | "COMPLETE" | "PARTIAL" | "MISSING">("all");
  const [pricingFilter, setPricingFilter] = useState<"all" | "MISSING" | "PENDING_APPROVAL" | "APPROVED">("all");
  const [sort, setSort] = useState<"recently-imported" | "recently-refreshed" | "product-name" | "mapping-status">("recently-imported");
  const [page, setPage] = useState(1);
  const [currencyDraft, setCurrencyDraft] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [reviewVariantId, setReviewVariantId] = useState<string>();
  const [costDraft, setCostDraft] = useState("");
  const [logisticsDraft, setLogisticsDraft] = useState({ weightGrams: "", lengthMm: "", widthMm: "", heightMm: "", classification: "" });
  const [adminProducts, setAdminProducts] = useState<AdminInternalProduct[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [mappingTargetId, setMappingTargetId] = useState("");
  const [confirmDemoProduct, setConfirmDemoProduct] = useState(false);
  const [currencyEvidenceType, setCurrencyEvidenceType] = useState("");
  const [newProductDraft, setNewProductDraft] = useState({ name: "", brand: "", model: "", categorySlug: "", subcategory: "", shortDescription: "" });
  const [creationPreview, setCreationPreview] = useState<CjProductCreationPreview>();
  const [mappingEditorOpen, setMappingEditorOpen] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<{ products: SupplierCatalogueProduct[] }>("/api/admin/suppliers/cj/products"),
      apiRequest<SupplierMappingsResponse>("/api/admin/supplier-mappings?supplier=CJ"),
      apiRequest<CjLaunchReadinessResponse>("/api/admin/suppliers/cj/launch-readiness"),
      apiRequest<{ products: AdminInternalProduct[] }>("/api/admin/products"),
    ])
      .then(([productsResponse, mappingsResponse, launchResponse, adminProductsResponse]) => {
        if (!active) return;
        setImportedProducts(productsResponse.products);
        setMappings(mappingsResponse.mappings);
        setLaunchData(launchResponse);
        setAdminProducts(adminProductsResponse.products);
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
      }).filter((product) => product.variants.some((variant) => {
        const row = launchData?.rows.find((item) => item.variant.supplierVariantId === variant.supplierVariantId);
        const launchMatches = launchFilter === "all" || variant.launch?.state === launchFilter;
        const logisticsMatches = logisticsFilter === "all" || (variant.launch?.logistics.status ?? "MISSING") === logisticsFilter;
        const pricingState = row?.proposal?.status ?? "MISSING";
        return launchMatches && logisticsMatches && (pricingFilter === "all" || pricingState === pricingFilter);
      })),
    [category, importedProducts, launchData, launchFilter, logisticsFilter, mappingStatus, mappings, pricingFilter, search, sort, supplierStatus, variantMode],
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

  const launchRow = (variantId: string): CjLaunchReadinessRow | undefined => launchData?.rows.find((row) => row.variant.supplierVariantId === variantId);
  const currentProductMapping = selectedProduct && reviewVariantId ? mappings
    .filter((mapping) => mapping.supplierCode === "CJ" && mapping.supplierProductId === selectedProduct.supplierProductId && mapping.supplierVariantId === reviewVariantId && mapping.status !== "SUPERSEDED" && mapping.status !== "REJECTED")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] : undefined;
  const effectiveCurrency = reviewVariantId ? launchRow(reviewVariantId)?.evidence.currency ?? undefined : undefined;
  const productCandidates = adminProducts.filter((product) => !productSearch.trim() || [product.name, product.brand, product.model, product.sku].some((value) => value?.toLowerCase().includes(productSearch.trim().toLowerCase()))).slice(0, 12);
  const mappingTarget = adminProducts.find((product) => product.id === mappingTargetId);
  const mappedProduct = adminProducts.find((product) => product.id === currentProductMapping?.productId);
  const selectedLaunchRow = reviewVariantId ? launchRow(reviewVariantId) : undefined;
  const mappingTargetIsDemo = Boolean(mappingTarget && /(?:^|[-_\s])(demo|test|sample|placeholder)(?:$|[-_\s])/i.test(`${mappingTarget.id} ${mappingTarget.name}`));

  const runEvidenceAudit = async () => {
    setLoading((current) => ({ ...current, audit: true }));
    setFeedback(undefined);
    try {
      const result = await apiRequest<{ controlledProducts: number; downgradedMappings: string[] }>("/api/admin/suppliers/cj/evidence-audit", { method: "POST" });
      const [mappingsResponse, launchResponse] = await Promise.all([apiRequest<SupplierMappingsResponse>("/api/admin/supplier-mappings?supplier=CJ"), apiRequest<CjLaunchReadinessResponse>("/api/admin/suppliers/cj/launch-readiness")]);
      setMappings(mappingsResponse.mappings);
      setLaunchData(launchResponse);
      setFeedback({ variant: "success", message: `Reviewed ${result.controlledProducts} CJ products. ${result.downgradedMappings.length} weak historical mapping(s) moved to review required.` });
    } catch (error) {
      setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "CJ evidence audit failed." });
    } finally {
      setLoading((current) => ({ ...current, audit: false }));
    }
  };

  const refreshEvidenceCohort = async () => {
    setLoading((current) => ({ ...current, cohortRefresh: true }));
    setFeedback(undefined);
    try {
      const result = await apiRequest<{ controlledProducts: number; refreshed: number; failed: number }>("/api/admin/suppliers/cj/evidence-refresh", { method: "POST" });
      const [productsResponse, mappingsResponse, launchResponse] = await Promise.all([apiRequest<{ products: SupplierCatalogueProduct[] }>("/api/admin/suppliers/cj/products"), apiRequest<SupplierMappingsResponse>("/api/admin/supplier-mappings?supplier=CJ"), apiRequest<CjLaunchReadinessResponse>("/api/admin/suppliers/cj/launch-readiness")]);
      setImportedProducts(productsResponse.products); setMappings(mappingsResponse.mappings); setLaunchData(launchResponse);
      setSelectedProduct((current) => productsResponse.products.find((item) => item.supplierProductId === current?.supplierProductId));
      setFeedback({ variant: result.failed ? "error" : "success", message: `CJ evidence refresh: ${result.refreshed} refreshed, ${result.failed} failed, ${result.controlledProducts} controlled products.` });
    } catch (error) {
      setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "Controlled CJ evidence refresh failed." });
    } finally { setLoading((current) => ({ ...current, cohortRefresh: false })); }
  };

  const confirmCurrency = async () => {
    if (!selectedProduct) return;
    setLoading((current) => ({ ...current, currency: true }));
    setFeedback(undefined);
    try {
      await apiRequest("/api/admin/suppliers/cj/evidence-settings/currency", { method: "PATCH", body: JSON.stringify({ currency: currencyDraft, evidenceType: currencyEvidenceType, evidenceNote, sourceReference }) });
      setLaunchData(await apiRequest<CjLaunchReadinessResponse>("/api/admin/suppliers/cj/launch-readiness"));
      setCurrencyDraft("");
      setEvidenceNote(""); setSourceReference("");
      setCurrencyEvidenceType("");
      setFeedback({ variant: "success", message: `CJ account currency confirmed as ${currencyDraft}.` });
    } catch (error) {
      setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "Supplier currency confirmation failed." });
    } finally {
      setLoading((current) => ({ ...current, currency: false }));
    }
  };

  const saveVariantEvidence = async (action: "verify" | "cost" | "logistics") => {
    if (!selectedProduct || !reviewVariantId) return;
    setLoading((current) => ({ ...current, evidenceSave: true })); setFeedback(undefined);
    try {
      const body = action === "verify" ? { evidenceNote } : action === "cost" ? { amount: Number(costDraft), currency: currencyDraft || effectiveCurrency || selectedProduct.currency, evidenceType: currencyEvidenceType, evidenceNote, sourceReference } : { ...Object.fromEntries(Object.entries(logisticsDraft).map(([key, value]) => key === "classification" ? [key, value] : [key, Number(value)])), evidenceNote, sourceReference };
      const response = await apiRequest<{ product: SupplierCatalogueProduct }>(`/api/admin/suppliers/cj/products/${encodeURIComponent(selectedProduct.supplierProductId)}/variants/${encodeURIComponent(reviewVariantId)}/${action}`, { method: "PATCH", body: JSON.stringify(body) });
      setImportedProducts((current) => current.map((item) => item.supplierProductId === response.product.supplierProductId ? response.product : item)); setSelectedProduct(response.product);
      setLaunchData(await apiRequest<CjLaunchReadinessResponse>("/api/admin/suppliers/cj/launch-readiness"));
      setEvidenceNote(""); setSourceReference(""); setCostDraft("");
      setFeedback({ variant: "success", message: action === "verify" ? "Exact variant evidence recorded." : action === "cost" ? "Authoritative procurement cost recorded." : "Variant logistics evidence recorded." });
    } catch (error) { setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "Evidence update failed." }); }
    finally { setLoading((current) => ({ ...current, evidenceSave: false })); }
  };

  const resolveMapping = async (mode: "verify" | "replace") => {
    if (!selectedProduct || !reviewVariantId) return;
    setLoading((current) => ({ ...current, mapping: true })); setFeedback(undefined);
    try {
      if (mode === "verify") {
        if (!currentProductMapping?.id) throw new Error("No current mapping is available.");
        await apiRequest("/api/admin/suppliers/cj/mappings/verify-evidence", { method: "POST", body: JSON.stringify({ mappingId: currentProductMapping.id, evidenceNote, sourceReference }) });
      } else {
        await apiRequest("/api/admin/suppliers/cj/mappings/map-existing", { method: "POST", body: JSON.stringify({ supplierProductId: selectedProduct.supplierProductId, supplierVariantId: reviewVariantId, productId: mappingTargetId, previousMappingId: currentProductMapping?.id, evidenceNote, sourceReference, confirmDemoProduct }) });
      }
      const [mappingsResponse, launchResponse] = await Promise.all([apiRequest<SupplierMappingsResponse>("/api/admin/supplier-mappings?supplier=CJ"), apiRequest<CjLaunchReadinessResponse>("/api/admin/suppliers/cj/launch-readiness")]);
      setMappings(mappingsResponse.mappings); setLaunchData(launchResponse); setEvidenceNote(""); setSourceReference(""); setMappingTargetId(""); setConfirmDemoProduct(false);
      setFeedback({ variant: "success", message: mode === "verify" ? "Current mapping verified with evidence." : "Previous mapping preserved and replacement mapping activated." });
      setMappingEditorOpen(false);
    } catch (error) { setFeedback({ variant: "error", message: error instanceof Error ? error.message : "Mapping resolution failed." }); }
    finally { setLoading((current) => ({ ...current, mapping: false })); }
  };

  const previewProductCreation = async () => {
    if (!selectedProduct || !reviewVariantId) return;
    setLoading((current) => ({ ...current, creationPreview: true })); setFeedback(undefined);
    try {
      const preview = await apiRequest<CjProductCreationPreview>("/api/admin/suppliers/cj/mapping-preview", { method: "POST", cache: "no-store", body: JSON.stringify({ supplierProductId: selectedProduct.supplierProductId, supplierVariantId: reviewVariantId }) });
      if (preview.proposalVersion !== 2) throw new ApiError("The CJ Product suggestion service is out of date. Restart the backend and preview again.", 409, "CJ_PREVIEW_VERSION_STALE");
      setCreationPreview(preview);
      setNewProductDraft({ name: preview.proposal.name, brand: preview.proposal.brand, model: preview.proposal.model, categorySlug: preview.proposal.categorySlug, subcategory: preview.proposal.subcategory, shortDescription: preview.proposal.shortDescription });
      setEvidenceNote(preview.proposal.evidenceNote ?? "");
      setSourceReference(preview.proposal.sourceReference ?? `CJ PID ${selectedProduct.supplierProductId} / VID ${reviewVariantId}`);
      if (preview.existingProduct) setMappingTargetId(preview.existingProduct.id);
    } catch (error) { setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "Product preview failed." }); }
    finally { setLoading((current) => ({ ...current, creationPreview: false })); }
  };

  const createProduct = async () => {
    if (!selectedProduct || !reviewVariantId || !creationPreview) return;
    setLoading((current) => ({ ...current, createProduct: true })); setFeedback(undefined);
    try {
      const result = await apiRequest<{ product: AdminInternalProduct }>("/api/admin/suppliers/cj/products/create", {
        method: "POST",
        body: JSON.stringify({ supplierProductId: selectedProduct.supplierProductId, supplierVariantId: reviewVariantId, ...newProductDraft, evidenceNote, sourceReference, previousMappingId: currentProductMapping?.id, confirmDemoProduct, confirmed: true }),
      });
      const [productsResponse, mappingsResponse, launchResponse] = await Promise.all([apiRequest<{ products: AdminInternalProduct[] }>("/api/admin/products"), apiRequest<SupplierMappingsResponse>("/api/admin/supplier-mappings?supplier=CJ"), apiRequest<CjLaunchReadinessResponse>("/api/admin/suppliers/cj/launch-readiness")]);
      setAdminProducts(productsResponse.products); setMappings(mappingsResponse.mappings); setLaunchData(launchResponse);
      setNewProductDraft({ name: "", brand: "", model: "", categorySlug: "", subcategory: "", shortDescription: "" }); setCreationPreview(undefined); setEvidenceNote(""); setSourceReference("");
      setFeedback({ variant: "success", message: `${result.product.name} created as an internal supplier-neutral Product and mapped to the exact CJ variant.` });
      setMappingEditorOpen(false);
    } catch (error) { setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "Product creation failed." }); }
    finally { setLoading((current) => ({ ...current, createProduct: false })); }
  };

  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="Supplier catalogue"
        title="Imported CJ products"
        description="Manage CJ supplier catalogue records TekCentral has deliberately imported. Ordering actions remain out of scope."
        actions={<div className="flex flex-wrap gap-2"><button type="button" onClick={() => void refreshEvidenceCohort()} disabled={loading.cohortRefresh} className="rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black disabled:opacity-60">{loading.cohortRefresh ? "Refreshing 9-product cohort..." : "Refresh source evidence"}</button><button type="button" onClick={() => void runEvidenceAudit()} disabled={loading.audit} className="rounded-md border border-[#E4E7EC] bg-white px-4 py-2 text-sm font-black disabled:opacity-60">{loading.audit ? "Reviewing evidence..." : "Review cohort evidence"}</button><Link to="/admin/suppliers/cj" className="rounded-md border border-[#E4E7EC] bg-white px-4 py-2 text-sm font-black">Back to discovery</Link></div>}
      />
      {cjSupplier && <SupplierWorkspaceNav supplier={cjSupplier} />}

      {launchData && <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8" aria-label="CJ launch metrics">
        {[["Imported products", launchData.metrics.importedProducts], ["Exact offers", launchData.metrics.importedOffers], ["Candidates", launchData.metrics.candidates], ["Selected", launchData.metrics.selected], ["Verified", launchData.metrics.verified], ["Logistics complete", launchData.metrics.logisticsComplete], ["Pricing approved", launchData.metrics.pricingApproved], ["Ready for review", launchData.metrics.readyForPublishReview]].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-[#E4E7EC] bg-white p-4"><p className="text-xs font-black uppercase text-[#727986]">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>)}
      </section>}

      <section className="mt-6 rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
              {["all", "UNMAPPED", "SUGGESTED", "VERIFIED", "REVIEW_REQUIRED", "SUPERSEDED", "STALE", "REJECTED"].map((item) => <option key={item} value={item}>{item.replace(/_/g, " ")}</option>)}
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
          <label className="text-sm font-black">Launch state<select value={launchFilter} onChange={(event) => { setLaunchFilter(event.target.value as typeof launchFilter); setPage(1); }} className="mt-2 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm font-semibold"><option value="all">All launch states</option><option value="CANDIDATE">Candidate</option><option value="SELECTED_FOR_LAUNCH">Selected for launch</option></select></label>
          <label className="text-sm font-black">Logistics<select value={logisticsFilter} onChange={(event) => { setLogisticsFilter(event.target.value as typeof logisticsFilter); setPage(1); }} className="mt-2 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm font-semibold"><option value="all">All logistics states</option><option value="COMPLETE">Complete</option><option value="PARTIAL">Partial</option><option value="MISSING">Missing</option></select></label>
          <label className="text-sm font-black">Pricing<select value={pricingFilter} onChange={(event) => { setPricingFilter(event.target.value as typeof pricingFilter); setPage(1); }} className="mt-2 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm font-semibold"><option value="all">All pricing states</option><option value="MISSING">Missing</option><option value="PENDING_APPROVAL">Pending approval</option><option value="APPROVED">Approved</option></select></label>
        </div>
        {feedback && <div className="mt-4"><AdminFeedback {...feedback} /></div>}
      </section>

      <AdminTableContainer label="Imported CJ products"><AdminTable minWidth={1760}><AdminTableHead><AdminTableRow><AdminTableHeader>Product identity</AdminTableHeader><AdminTableHeader>Exact CJ reference</AdminTableHeader><AdminTableHeader>Source category</AdminTableHeader><AdminTableHeader>Commercial evidence</AdminTableHeader><AdminTableHeader>Stock / availability</AdminTableHeader><AdminTableHeader>Mapping</AdminTableHeader><AdminTableHeader>Product readiness</AdminTableHeader><AdminTableHeader>Next action</AdminTableHeader></AdminTableRow></AdminTableHead><AdminTableBody>
          {loading.load ? <AdminTableState colSpan={8} kind="loading" title="Loading imported CJ products..." /> : pageProducts.length === 0 ? <AdminTableState colSpan={8} kind="empty" title="No imported CJ products match these filters." /> : pageProducts.map((product) => {
            const row = launchData?.rows.find((candidate) => candidate.product.supplierProductId === product.supplierProductId && candidate.mapping?.status === "VERIFIED") ?? launchData?.rows.find((candidate) => candidate.product.supplierProductId === product.supplierProductId);
            const supplierStatusLabel = supplierStatusForProduct(product);
            const selectedVariant = row?.variant ?? product.variants[0];
            return <AdminTableRow key={product.supplierProductId}><AdminTableCell><SupplierProductIdentity imageUrl={product.imageUrl} supplierTitle={product.supplierProductName} brand={product.manufacturer ?? product.brand} canonicalName={row?.canonicalProduct?.name} canonicalSku={row?.canonicalProduct?.sku} reference={`PID ${product.supplierProductId}`} /></AdminTableCell><AdminTableCell><p className="max-w-52 break-all text-xs font-black">{selectedVariant?.supplierVariantSku ?? product.supplierSku ?? "Unknown SKU"}</p><p className="mt-1 max-w-52 break-all text-xs text-[#667085]">VID {selectedVariant?.supplierVariantId ?? "Select exact variant"}</p><p className="mt-1 text-xs text-[#667085]">{product.variants.length} variant(s)</p></AdminTableCell><AdminTableCell><p className="max-w-48 text-xs font-semibold">Supplier: {product.categoryName ?? "Unclassified"}</p></AdminTableCell><AdminTableCell><SupplierCommercialEvidence cost={row?.evidence.authoritativeCost} currency={row?.evidence.currency ?? undefined} secondary={<>{row?.evidence.fxStatus?.replace(/_/g, " ") ?? "FX not evaluated"}{row?.evidence.normalizedCostZar !== undefined ? ` · ZAR ${row.evidence.normalizedCostZar.toFixed(2)}` : ""}</>} /></AdminTableCell><AdminTableCell><SupplierAvailability supplierLabel={supplierStatusLabel} supplierQuantity={selectedVariant?.stockTotal} observedAt={product.lastSuccessfulRefreshAt} canonical={row?.canonicalAvailability} /></AdminTableCell><AdminTableCell><SupplierMappingStatus status={row?.mapping?.status ?? mappingStatusForProduct(product, mappings)} /></AdminTableCell><AdminTableCell><SupplierProductReadiness readiness={row?.onboarding} /></AdminTableCell><AdminTableCell><AdminTableActions primary={<SupplierProductNextAction readiness={row?.onboarding} productId={row?.mapping?.productId} storefrontSlug={row?.publication.slug} onUnmapped={() => setSelectedProduct(product)} />}><button type="button" onClick={() => setSelectedProduct(product)}>View supplier evidence</button><button type="button" onClick={() => refreshProduct(product)} disabled={loading[product.supplierProductId]}>{loading[product.supplierProductId] && <FiLoader className="animate-spin" aria-hidden="true" />} Refresh source</button><Link to="/admin/supplier-mappings?supplier=CJ">Review Mapping</Link></AdminTableActions></AdminTableCell></AdminTableRow>;
          })}
        </AdminTableBody></AdminTable>
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
      </AdminTableContainer>

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
              <div className="mt-4 grid gap-3 rounded-md border border-[#E4E7EC] bg-[#F6F7F9] p-4 sm:grid-cols-2 lg:grid-cols-4">
                <div><p className="text-xs font-black uppercase text-[#727986]">Identity</p><p className="mt-1 text-sm font-black">{launchData?.rows.find((row) => row.product.supplierProductId === selectedProduct.supplierProductId)?.evidence.identityStatus.replace(/_/g, " ") ?? "REVIEW REQUIRED"}</p></div>
                <div><p className="text-xs font-black uppercase text-[#727986]">Currency</p><p className="mt-1 text-sm font-black">{selectedProduct.currency ? `${selectedProduct.currency} · ${selectedProduct.currencyEvidence?.source ?? "UNKNOWN SOURCE"}` : "UNKNOWN"}</p></div>
                <div><p className="text-xs font-black uppercase text-[#727986]">Manufacturer / model</p><p className="mt-1 text-sm font-black">{selectedProduct.manufacturer ?? selectedProduct.brand ?? "Unconfirmed"} · {selectedProduct.model ?? selectedProduct.manufacturerPartNumber ?? "Unconfirmed"}</p></div>
                <div><p className="text-xs font-black uppercase text-[#727986]">Product codes</p><p className="mt-1 break-all text-sm font-black">{selectedProduct.gtin ?? selectedProduct.ean ?? selectedProduct.upc ?? "No GTIN/EAN/UPC"}</p></div>
              </div>
              <div className="mt-3 rounded-md border border-[#E4E7EC] p-4">
                <p className="text-xs font-black uppercase text-[#727986]">1. Resolve Product</p>
                <p className="mt-2 text-sm font-semibold">Current mapping: <strong>{currentProductMapping?.productId ?? "Unmapped"}</strong> · {currentProductMapping?.status?.replace(/_/g, " ") ?? "UNMAPPED"}</p>
                {currentProductMapping?.productId?.toLowerCase().includes("demo") && <p className="mt-2 rounded-md border border-[#FDA29B] bg-[#FEF3F2] px-3 py-2 text-sm font-black text-[#B42318]">This target appears to be a demo/test Product and should not normally be used for production supplier mapping.</p>}
                {reviewVariantId && currentProductMapping && !shouldShowCjMappingEditor(currentProductMapping.status, mappingEditorOpen) && <div className="mt-4 grid gap-3">
                  <section className="rounded-md border border-[#B8E3DA] bg-[#F0FBF8] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-[#176B5C]">Mapped TekCentral Product</p><h3 className="mt-1 font-black">{mappedProduct?.name ?? currentProductMapping.productId}</h3><p className="mt-1 text-xs font-semibold text-[#3F4652]">{mappedProduct?.sku ?? "SKU unavailable"}{mappedProduct?.brand ? ` · ${mappedProduct.brand}` : ""}{mappedProduct?.category ? ` · ${mappedProduct.category}${mappedProduct.subcategory ? ` / ${mappedProduct.subcategory}` : ""}` : ""}</p></div><AdminStatusBadge label="Verified" status="VERIFIED" /></div><dl className="mt-3 grid gap-2 text-xs font-semibold text-[#3F4652] sm:grid-cols-2"><div><dt className="font-black">CJ PID</dt><dd className="break-all">{selectedProduct.supplierProductId}</dd></div><div><dt className="font-black">Exact CJ VID</dt><dd className="break-all">{reviewVariantId}</dd></div><div><dt className="font-black">Variant SKU</dt><dd>{selectedProduct.variants.find((variant) => variant.supplierVariantId === reviewVariantId)?.supplierVariantSku ?? "Unavailable"}</dd></div><div><dt className="font-black">Mapping evidence</dt><dd>{currentProductMapping.evidence?.slice(-1)[0] ?? "Verified by staff"}</dd></div></dl><div className="mt-4 flex flex-wrap gap-2"><ProductConfigurationLink productId={currentProductMapping.productId} ariaLabel="View TekCentral Product" className="rounded-md bg-[var(--tek-accent)] px-3 py-2 text-xs font-black">Continue Product setup</ProductConfigurationLink><button type="button" onClick={() => setMappingEditorOpen(true)} className="rounded-md border border-[#E4E7EC] bg-white px-3 py-2 text-xs font-black">Change mapping</button></div></section>
                  <section className="rounded-md border border-[#E4E7EC] bg-white p-4"><h3 className="text-sm font-black">Supplier evidence</h3><div className="mt-3 grid gap-2 text-xs font-semibold sm:grid-cols-2"><p><strong>Currency:</strong> {selectedLaunchRow?.evidence.currency ?? "Unknown"}</p><p><strong>Procurement cost:</strong> {selectedLaunchRow?.evidence.costStatus === "AUTHORITATIVE" ? "Confirmed" : "Missing"}</p><p><strong>FX:</strong> {selectedLaunchRow?.evidence.fxStatus?.replace(/_/g, " ") ?? "Not evaluated"}</p><p><strong>Logistics:</strong> {selectedLaunchRow?.evidence.logistics.status ?? "Missing"}</p></div><p className="mt-3 text-xs font-black text-[#176B5C]">{selectedLaunchRow?.evidence.status === "READY_FOR_PRICING" ? "Supplier evidence complete · Ready for pricing" : `Next action: ${selectedLaunchRow?.evidence.nextAction ?? "Review supplier evidence"}`}</p><Link to={`/admin/suppliers/cj?pid=${encodeURIComponent(selectedProduct.supplierProductId)}&vid=${encodeURIComponent(reviewVariantId)}`} className="mt-3 inline-flex rounded-md bg-[var(--tek-accent)] px-3 py-2 text-xs font-black">Resolve supplier evidence</Link></section>
                </div>}
                {!reviewVariantId && <p className="mt-3 text-sm font-semibold text-[#727986]">Select the exact CJ variant first.</p>}
                {reviewVariantId && shouldShowCjMappingEditor(currentProductMapping?.status, mappingEditorOpen) && <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {currentProductMapping?.status === "VERIFIED" && <div className="rounded-md border border-[#FEDF89] bg-[#FFFAEB] p-3 text-xs font-semibold text-[#B54708] lg:col-span-2"><p className="font-black">You are changing a verified mapping.</p><p className="mt-1">The current mapping remains active until a replacement is confirmed. Existing evidence will be preserved as superseded history.</p><button type="button" onClick={() => { setMappingEditorOpen(false); setCreationPreview(undefined); setMappingTargetId(""); }} className="mt-3 rounded-md border border-[#E4E7EC] bg-white px-3 py-2 font-black text-[#3F4652]">Cancel</button></div>}
                  <section className="rounded-md border border-[#E4E7EC] p-3">
                    <h3 className="text-sm font-black">Map to existing TekCentral Product</h3>
                    <p className="mt-1 text-xs text-[#727986]">Use this only when the Product is genuinely the same sellable item.</p>
                    <input aria-label="Search existing Products" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Title, SKU, brand or model" className="mt-3 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm" />
                    <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                      {productCandidates.map((product) => { const supplierCodes = [...new Set(mappings.filter((mapping) => mapping.productId === product.id && mapping.status !== "SUPERSEDED").map((mapping) => mapping.supplierCode))]; const demo = /(?:^|[-_\s])(demo|test|sample|placeholder)(?:$|[-_\s])/i.test(`${product.id} ${product.name}`); return <button key={product.id} type="button" onClick={() => { setMappingTargetId(product.id); setConfirmDemoProduct(false); }} className={`w-full rounded-md border p-3 text-left ${mappingTargetId === product.id ? "border-[#469D8B] bg-[#F0FBF8]" : "border-[#E4E7EC] bg-white"}`}><span className="block text-sm font-black">{product.name}</span><span className="mt-1 block text-xs text-[#727986]">{product.brand}{product.model ? ` · ${product.model}` : ""} · {product.sku} · {product.category}</span><span className="mt-1 block text-xs text-[#727986]">{supplierCodes.length ? `Supplier offers: ${supplierCodes.join(", ")}` : "No active supplier mapping"} · {product.publicationStatus === "INTERNAL_DRAFT" ? "Not published" : product.publicationStatus}</span>{demo && <span className="mt-1 block text-xs font-black text-[#B42318]">Demo/test Product warning</span>}</button>; })}
                      {productCandidates.length === 0 && <div className="rounded-md bg-[#F6F7F9] p-3"><p className="text-xs font-semibold text-[#727986]">No matching TekCentral Product found.</p><button type="button" onClick={() => void previewProductCreation()} disabled={loading.creationPreview} className="mt-3 rounded-md border border-[#469D8B] bg-white px-3 py-2 text-xs font-black text-[#176B5C] disabled:opacity-50">Create a new TekCentral Product from this CJ item</button></div>}
                    </div>
                    {mappingTargetIsDemo && <label className="mt-3 flex items-start gap-2 text-xs font-black text-[#B42318]"><input type="checkbox" checked={confirmDemoProduct} onChange={(event) => setConfirmDemoProduct(event.target.checked)} /> I understand this target is demo/test data and have evidence for intentionally using it.</label>}
                    <button type="button" disabled={loading.mapping || !mappingTargetId || (mappingTargetIsDemo && !confirmDemoProduct) || !evidenceNote.trim() || !sourceReference.trim()} onClick={() => void resolveMapping("replace")} className="mt-3 rounded-md bg-[var(--tek-accent)] px-3 py-2 text-xs font-black disabled:opacity-50">{currentProductMapping ? "Replace mapping" : "Map selected Product"}</button>
                  </section>
                  <section className="rounded-md border border-[#E4E7EC] p-3">
                    <h3 className="text-sm font-black">Create new TekCentral Product</h3>
                    <p className="mt-1 text-xs text-[#727986]">Use when this product does not exist in TekCentral yet.</p>
                    {!creationPreview && <button type="button" onClick={() => void previewProductCreation()} disabled={loading.creationPreview} className="mt-3 rounded-md border border-[#469D8B] px-3 py-2 text-xs font-black text-[#176B5C] disabled:opacity-50">{loading.creationPreview ? "Preparing preview..." : "Preview suggested TekCentral Product"}</button>}
                    {creationPreview && <div className="mt-3 space-y-3">
                      {creationPreview.existingProduct && <div className="rounded-md border border-[#FEDF89] bg-[#FFFAEB] p-3 text-xs text-[#B54708]"><p className="font-black">An exact Product may already exist: {creationPreview.existingProduct.name}</p><p className="mt-1">Map to the existing Product instead of creating a duplicate.</p></div>}
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="text-xs font-black">Public title<input value={newProductDraft.name} onChange={(event) => setNewProductDraft({ ...newProductDraft, name: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm" /></label>
                        <label className="text-xs font-black">Brand/manufacturer<input value={newProductDraft.brand} onChange={(event) => setNewProductDraft({ ...newProductDraft, brand: event.target.value })} placeholder="Unbranded if confirmed" className="mt-1 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm" /></label>
                        <label className="text-xs font-black">Model<input value={newProductDraft.model} onChange={(event) => setNewProductDraft({ ...newProductDraft, model: event.target.value })} placeholder="Leave blank if unknown" className="mt-1 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm" /></label>
                        <label className="text-xs font-black">Category<select value={newProductDraft.categorySlug} onChange={(event) => setNewProductDraft({ ...newProductDraft, categorySlug: event.target.value, subcategory: "" })} className="mt-1 h-10 w-full rounded-md border border-[#E4E7EC] px-2 text-sm"><option value="">Category review required</option>{(creationPreview.categories ?? []).map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}</select></label>
                        <label className="text-xs font-black">Subcategory<select value={newProductDraft.subcategory} onChange={(event) => setNewProductDraft({ ...newProductDraft, subcategory: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-[#E4E7EC] px-2 text-sm"><option value="">None</option>{(creationPreview.categories ?? []).find((category) => category.slug === newProductDraft.categorySlug)?.subcategories.map((subcategory) => <option key={subcategory} value={subcategory}>{subcategory}</option>)}</select></label>
                        <label className="text-xs font-black">Proposed SKU<input readOnly value={creationPreview.proposal.proposedSku} className="mt-1 h-10 w-full rounded-md border border-[#E4E7EC] bg-[#F6F7F9] px-3 text-sm" /></label>
                      </div>
                      <label className="block text-xs font-black">Safe description candidate<textarea value={newProductDraft.shortDescription} onChange={(event) => setNewProductDraft({ ...newProductDraft, shortDescription: event.target.value })} rows={3} className="mt-1 w-full rounded-md border border-[#E4E7EC] px-3 py-2 text-sm font-semibold" /></label>
                      {Object.keys(creationPreview.proposal.fieldConfidence ?? {}).length > 0 && <p className="text-[11px] font-semibold text-[#727986]">Proposal confidence: {Object.entries(creationPreview.proposal.fieldConfidence ?? {}).map(([field, confidence]) => `${field} ${confidence}`).join(" · ")}</p>}
                      <div className="rounded-md bg-[#F6F7F9] p-3 text-xs text-[#3F4652]"><p className="font-black">Exact variant identity</p><p className="mt-1 break-all">CJ PID {selectedProduct.supplierProductId} · VID {reviewVariantId}</p>{Object.keys(creationPreview.proposal.variantAttributes ?? {}).length > 0 ? Object.entries(creationPreview.proposal.variantAttributes ?? {}).map(([key, value]) => <p key={key}>{key}: {value}</p>) : <p className="mt-1 text-[#727986]">No structured attributes available.</p>}</div>
                      {creationPreview.proposal.imageUrl && <img src={creationPreview.proposal.imageUrl} alt="CJ source candidate" className="h-24 w-24 rounded-md object-cover" />}
                      {(creationPreview.proposal.evidenceSummary ?? []).length > 0 && <div className="rounded-md border border-[#E4E7EC] bg-white p-3 text-xs text-[#3F4652]"><p className="font-black">Evidence summary</p><ul className="mt-1 list-disc space-y-1 pl-4">{(creationPreview.proposal.evidenceSummary ?? []).map((item) => <li key={item}>{item}</li>)}</ul></div>}
                      <div className="flex gap-2"><button type="button" onClick={() => setCreationPreview(undefined)} className="rounded-md border border-[#E4E7EC] bg-white px-3 py-2 text-xs font-black">Cancel</button><button type="button" onClick={() => void createProduct()} disabled={loading.createProduct || Boolean(creationPreview.existingProduct) || !newProductDraft.name.trim() || !newProductDraft.categorySlug || !evidenceNote.trim() || !sourceReference.trim()} className="rounded-md bg-[var(--tek-accent)] px-3 py-2 text-xs font-black disabled:opacity-50">Create TekCentral Product &amp; Map</button></div>
                    </div>}
                  </section>
                  <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2"><label className="text-xs font-black uppercase text-[#727986]">Evidence note<input value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm normal-case" /><span className="mt-1 block text-[11px] font-semibold normal-case">Used internally to record why this supplier item was confirmed as the TekCentral Product. Prefilled from CJ evidence and editable by staff.</span></label><label className="text-xs font-black uppercase text-[#727986]">Source/reference<input value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm normal-case" /></label></div>
                  {currentProductMapping?.id && <button type="button" disabled={loading.mapping || !evidenceNote.trim() || !sourceReference.trim()} onClick={() => void resolveMapping("verify")} className="w-fit rounded-md border border-[#E4E7EC] bg-white px-3 py-2 text-xs font-black disabled:opacity-50">Verify current mapping with evidence</button>}
                </div>}
              </div>
              {!launchData?.rows.find((row) => row.product.supplierProductId === selectedProduct.supplierProductId)?.evidence.currency && <div className="mt-3 grid gap-2 rounded-md border border-[#E4E7EC] p-3 sm:grid-cols-2 lg:grid-cols-[120px_180px_1fr_1fr_auto]"><label className="text-xs font-black uppercase text-[#727986]">Currency<input value={currencyDraft} onChange={(event) => setCurrencyDraft(event.target.value.toUpperCase())} maxLength={3} placeholder="ISO code" className="mt-1 block h-10 w-full rounded-md border border-[#E4E7EC] bg-white px-3 text-sm font-black" /></label><label className="text-xs font-black uppercase text-[#727986]">Evidence type<select value={currencyEvidenceType} onChange={(event) => setCurrencyEvidenceType(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-[#E4E7EC] px-2 text-sm normal-case"><option value="">Select</option>{["CJ_ACCOUNT_UI", "CJ_DOCUMENTATION", "CJ_INVOICE", "CJ_ORDER_SCREEN", "CJ_SUPPORT_CONFIRMATION", "ADMIN_DOCUMENTED_SOURCE", "OTHER_DOCUMENTED"].map((item) => <option key={item} value={item}>{item.replace(/_/g, " ")}</option>)}</select></label><label className="text-xs font-black uppercase text-[#727986]">Evidence note<input value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm normal-case" /></label><label className="text-xs font-black uppercase text-[#727986]">Source/reference<input value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm normal-case" /></label><button type="button" onClick={() => void confirmCurrency()} disabled={loading.currency || !/^[A-Z]{3}$/.test(currencyDraft) || !currencyEvidenceType || !evidenceNote.trim() || !sourceReference.trim()} className="mt-5 h-10 rounded-md border border-[#E4E7EC] bg-white px-3 text-sm font-black disabled:opacity-50">Confirm account currency</button></div>}
              <div className="mt-4 grid gap-2">
                {selectedProduct.variants.slice(0, 12).map((variant) => {
                  const row = launchRow(variant.supplierVariantId);
                  const selected = variant.launch?.state === "SELECTED_FOR_LAUNCH";
                  return <div key={variant.supplierVariantId} className="rounded-md border border-[#E4E7EC] bg-[#F6F7F9] p-3 text-sm font-semibold text-[#3F4652]">
                    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-black">{variantDisplayName(variant)}</p><p className="mt-1 break-all text-xs text-[#727986]">SKU: {variant.supplierVariantSku ?? "Unknown"} · VID: {variant.supplierVariantId}</p></div><div className="flex gap-2"><AdminStatusBadge label={variant.launch?.state?.replace(/_/g, " ") ?? "NOT SELECTED"} status={selected ? "APPROVED" : "PENDING"} /><AdminStatusBadge label={variant.launch?.logistics.status ?? "MISSING"} status={variant.launch?.logistics.status === "COMPLETE" ? "APPROVED" : "PENDING"} /></div></div>
                    <p className="mt-2 text-xs text-[#727986]">{supplierPriceLabel(variant.price ?? selectedProduct.supplierPrice, variant.currency ?? selectedProduct.currency) ?? "Price unavailable"} · {variant.stockTotal !== undefined ? `Stock: ${variant.stockTotal}` : "Stock not checked"}</p>
                    <div className="mt-2 grid gap-1 text-xs text-[#727986] sm:grid-cols-4"><p><strong>Variant:</strong> {row?.evidence.variantStatus.replace(/_/g, " ") ?? "REVIEW REQUIRED"}</p><p><strong>Currency:</strong> {row?.evidence.currency ?? "UNKNOWN"}</p><p><strong>Cost:</strong> {row?.evidence.costStatus ?? "MISSING"}</p><p><strong>Logistics:</strong> {row?.evidence.logistics.status ?? "MISSING"}</p></div>
                    <p className="mt-2 text-xs font-black text-[#176B5C]">Next action: {row?.evidence.nextAction ?? "Review product identity"}</p>
                    {row?.evidence.blockers.length ? <p className="mt-1 text-xs text-[#727986]">{row.evidence.blockers.map((item) => item.replace(/_/g, " ")).join(" · ")}</p> : null}
                    <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => { setReviewVariantId(variant.supplierVariantId); setCreationPreview(undefined); setMappingEditorOpen(false); setMappingTargetId(""); setConfirmDemoProduct(false); }} className="rounded-md bg-[var(--tek-accent)] px-3 py-2 text-xs font-black">Review evidence</button><Link to={`/admin/suppliers/cj?pid=${encodeURIComponent(selectedProduct.supplierProductId)}&vid=${encodeURIComponent(variant.supplierVariantId)}`} className="rounded-md border border-[#E4E7EC] bg-white px-3 py-2 text-xs font-black">Open product workflow</Link></div>
                  </div>;
                })}
                {selectedProduct.variants.length > 12 && <p className="text-xs font-semibold text-[#727986]">Showing 12 of {selectedProduct.variants.length} variants.</p>}
              </div>
              {reviewVariantId && (() => { const variant = selectedProduct.variants.find((item) => item.supplierVariantId === reviewVariantId); if (!variant) return null; return <div className="mt-4 rounded-md border border-[#B8E3DA] bg-[#F0FBF8] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-[#176B5C]">Selected evidence variant</p><h3 className="mt-1 font-black">{variantDisplayName(variant)}</h3><p className="mt-1 break-all text-xs text-[#727986]">VID {variant.supplierVariantId} · SKU {variant.supplierVariantSku ?? "Unknown"}</p></div><button type="button" onClick={() => setReviewVariantId(undefined)} className="rounded-md border border-[#E4E7EC] bg-white px-3 py-2 text-xs font-black">Close</button></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="text-xs font-black uppercase text-[#727986]">Evidence note<input value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-[#E4E7EC] bg-white px-3 text-sm normal-case" /></label><label className="text-xs font-black uppercase text-[#727986]">Source/reference<input value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-[#E4E7EC] bg-white px-3 text-sm normal-case" /></label></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={loading.evidenceSave || !evidenceNote.trim()} onClick={() => void saveVariantEvidence("verify")} className="rounded-md border border-[#E4E7EC] bg-white px-3 py-2 text-xs font-black disabled:opacity-50">Verify exact variant</button><Link to={`/admin/suppliers/cj?pid=${encodeURIComponent(selectedProduct.supplierProductId)}&vid=${encodeURIComponent(variant.supplierVariantId)}`} className="rounded-md bg-[var(--tek-accent)] px-3 py-2 text-xs font-black">Resolve currency, cost &amp; FX</Link></div><div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">{(["weightGrams", "lengthMm", "widthMm", "heightMm"] as const).map((field) => <label key={field} className="text-xs font-black uppercase text-[#727986]">{field.replace(/([A-Z])/g, " $1")}<input type="number" min="0" value={logisticsDraft[field]} onChange={(event) => setLogisticsDraft({ ...logisticsDraft, [field]: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-[#E4E7EC] bg-white px-3 text-sm" /></label>)}<label className="text-xs font-black uppercase text-[#727986]">Classification<select value={logisticsDraft.classification} onChange={(event) => setLogisticsDraft({ ...logisticsDraft, classification: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-[#E4E7EC] bg-white px-2 text-sm"><option value="">Select</option><option value="PRODUCT">Product</option><option value="PACKAGE">Package</option><option value="SHIPPING">Shipping</option></select></label><button type="button" disabled={loading.evidenceSave || !Object.values(logisticsDraft).every(Boolean) || !evidenceNote.trim() || !sourceReference.trim()} onClick={() => void saveVariantEvidence("logistics")} className="mt-5 h-10 rounded-md border border-[#E4E7EC] bg-white px-3 text-xs font-black disabled:opacity-50">Confirm logistics</button></div></div>; })()}
            </div>
          </div>
        </section>
      )}
    </AdminShell>
  );
}

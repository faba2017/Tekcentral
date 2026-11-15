import { useEffect, useMemo, useState } from "react";
import { FiSearch } from "react-icons/fi";
import { useLocation, useNavigate } from "react-router-dom";
import { AdminFeedback, AdminStatusBadge } from "@/components/admin/AdminShell";
import { SupplierAvailability, SupplierCommercialEvidence, SupplierMappingStatus, SupplierProductIdentity, SupplierProductNextAction, SupplierProductReadiness } from "@/components/admin/SupplierProductTable";
import { ApiError, apiRequest } from "@/lib/api";
import type { ScoopLaunchReadinessResponse, ScoopLaunchReadinessRow } from "@/lib/admin";
import { productConfigurationHref, type ProductOnboardingStepId } from "@/lib/product-onboarding";

type AssortmentState = "NOT_SELECTED" | "CANDIDATE" | "SELECTED_FOR_LAUNCH";
type WorkflowFocus = "mapping" | "logistics" | "pricing";
type Props = { initialSearch: string; onSearchChange: (search: string) => void; onOpenWorkflow: (supplierSku: string, focus: WorkflowFocus) => void };

export function ScoopLaunchReadiness({ initialSearch, onSearchChange, onOpenWorkflow }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState<ScoopLaunchReadinessResponse>();
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState<{ variant: "success" | "error" | "info"; message: string }>();
  const [filters, setFilters] = useState({ search: initialSearch, assortment: "ALL", stock: "ALL", manufacturer: "ALL", mapping: "ALL", logistics: "ALL", pricing: "ALL", minimum: "", maximum: "" });
  const load = async () => setData(await apiRequest<ScoopLaunchReadinessResponse>("/api/admin/suppliers/scoop/launch-readiness"));

  useEffect(() => {
    let active = true;
    apiRequest<ScoopLaunchReadinessResponse>("/api/admin/suppliers/scoop/launch-readiness")
      .then((response) => { if (active) setData(response); })
      .catch((error) => { if (active) setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "Launch readiness could not be loaded." }); });
    return () => { active = false; };
  }, []);

  const manufacturers = useMemo(() => [...new Set((data?.rows ?? []).map(({ product }) => product.manufacturer).filter((value): value is string => Boolean(value)))].sort(), [data]);
  const rows = useMemo(() => (data?.rows ?? []).filter(({ product, mapping, proposal }) => {
    const state = product.launchAssortment?.state ?? "NOT_SELECTED";
    const term = filters.search.trim().toLowerCase();
    const price = product.dealerPriceExVat;
    return (!term || `${product.supplierSku} ${product.description} ${product.manufacturer ?? ""}`.toLowerCase().includes(term))
      && (filters.assortment === "ALL" || (filters.assortment === "ACTIVE" ? state !== "NOT_SELECTED" : state === filters.assortment))
      && (filters.stock === "ALL" || product.availability === filters.stock)
      && (filters.manufacturer === "ALL" || product.manufacturer === filters.manufacturer)
      && (filters.mapping === "ALL" || (filters.mapping === "UNMAPPED" ? !mapping : mapping?.status === filters.mapping))
      && (filters.logistics === "ALL" || (filters.logistics === "MISSING" ? product.logisticsMetadata?.status !== "COMPLETE" : product.logisticsMetadata?.status === filters.logistics))
      && (filters.pricing === "ALL" || (filters.pricing === "MISSING" ? !proposal : proposal?.status === filters.pricing))
      && (!filters.minimum || (price !== undefined && price >= Number(filters.minimum)))
      && (!filters.maximum || (price !== undefined && price <= Number(filters.maximum)));
  }), [data, filters]);

  const setState = async (supplierSku: string, state: AssortmentState) => {
    setBusy(supplierSku); setFeedback(undefined);
    try {
      await apiRequest(`/api/admin/suppliers/scoop/products/${encodeURIComponent(supplierSku)}/launch-state`, { method: "PATCH", body: JSON.stringify({ state }) });
      await load();
      setFeedback({ variant: "success", message: "Launch assortment state updated." });
    } catch (error) { setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "Assortment state could not be updated." }); }
    finally { setBusy(""); }
  };

  const openBlocker = (row: ScoopLaunchReadinessRow) => {
    const { product, proposal, readiness } = row;
    const sku = product.supplierSku;
    const focus: ProductOnboardingStepId = row.onboarding?.firstUnresolvedStep ?? (readiness.blockers.includes("MAPPING_NOT_VERIFIED") ? "PRODUCT_MAPPING" : readiness.blockers.includes("LOGISTICS_INCOMPLETE") ? "LOGISTICS" : readiness.blockers.some((blocker) => blocker.includes("IMAGE")) ? "MEDIA" : "PRICING");
    if (row.mapping?.productId) navigate(productConfigurationHref(location.pathname, location.search, row.mapping.productId, focus));
    else if ((readiness.blockers.includes("PRICING_NOT_APPROVED") || readiness.blockers.includes("PRICING_BLOCKING_WARNING")) && proposal) {
      const returnTo = `/admin/suppliers/scoop?view=launch&sku=${encodeURIComponent(sku)}`;
      navigate(`/admin/pricing?proposal=${encodeURIComponent(proposal.id)}&returnTo=${encodeURIComponent(returnTo)}`);
    } else if (readiness.blockers.includes("MAPPING_NOT_VERIFIED")) onOpenWorkflow(sku, "mapping");
    else if (readiness.blockers.includes("LOGISTICS_INCOMPLETE")) onOpenWorkflow(sku, "logistics");
    else onOpenWorkflow(sku, "pricing");
  };

  const metrics = data?.metrics;
  const runPrimaryAction = (row: ScoopLaunchReadinessRow) => {
    if (row.workflow.primaryAction === "Select for launch") void setState(row.product.supplierSku, "SELECTED_FOR_LAUNCH");
    else if (row.workflow.primaryAction === "View storefront" && row.publication.slug) navigate(`/product/${row.publication.slug}`);
    else if (row.mapping?.productId) navigate(productConfigurationHref(location.pathname, location.search, row.mapping.productId, row.onboarding?.firstUnresolvedStep));
    else openBlocker(row);
  };
  const exactGuidance = data?.guidanceRows.find(({ product }) => product.supplierSku.toLowerCase() === filters.search.trim().toLowerCase());
  return <div className="mt-6 space-y-5">
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      <Metric label="Selected" value={metrics?.selectedForLaunch} /><Metric label="Ready for review" value={metrics?.readyForPublishReview} emphasis /><Metric label="Published" value={metrics?.published} /><Metric label="Blocked: logistics" value={metrics?.blockedLogistics} /><Metric label="Blocked: pricing" value={metrics?.blockedPricing} /><Metric label="Blocked: mapping" value={metrics?.blockedMapping} /><Metric label="Staff review" value={metrics?.needsStaffReview} />
    </section>
    <section className="rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm">
      <div><h2 className="text-lg font-black">Launch readiness</h2><p className="mt-1 text-sm font-semibold text-[#727986]">Complete the selected assortment and review managed publication lifecycles. Broader candidate discovery remains in Catalogue.</p></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-black">Search<div className="relative mt-1"><FiSearch className="absolute left-3 top-3 text-[#727986]" /><input value={filters.search} onChange={(event) => { const search = event.target.value; setFilters({ ...filters, search }); onSearchChange(search); }} placeholder="SKU, description, category" className="h-10 w-full rounded-md border border-[#E4E7EC] pl-9 pr-3 text-sm" /></div></label>
        <Select label="Assortment" value={filters.assortment} options={["ALL", "SELECTED_FOR_LAUNCH"]} onChange={(value) => setFilters({ ...filters, assortment: value })} />
        <Select label="Stock" value={filters.stock} options={["AVAILABLE", "ALL", "OUT_OF_STOCK", "UNKNOWN", "STALE"]} onChange={(value) => setFilters({ ...filters, stock: value })} />
        <label className="text-xs font-black">Manufacturer<select value={filters.manufacturer} onChange={(event) => setFilters({ ...filters, manufacturer: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm"><option value="ALL">All</option>{manufacturers.map((item) => <option key={item}>{item}</option>)}</select></label>
        <Select label="Mapping" value={filters.mapping} options={["ALL", "UNMAPPED", "SUGGESTED", "VERIFIED", "REJECTED"]} onChange={(value) => setFilters({ ...filters, mapping: value })} />
        <Select label="Logistics" value={filters.logistics} options={["ALL", "COMPLETE", "MISSING"]} onChange={(value) => setFilters({ ...filters, logistics: value })} />
        <Select label="Pricing" value={filters.pricing} options={["ALL", "MISSING", "PENDING_APPROVAL", "APPROVED", "REJECTED"]} onChange={(value) => setFilters({ ...filters, pricing: value })} />
        <div className="grid grid-cols-2 gap-2"><label className="text-xs font-black">Min cost<input type="number" min="0" value={filters.minimum} onChange={(event) => setFilters({ ...filters, minimum: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-[#E4E7EC] px-2 text-sm" /></label><label className="text-xs font-black">Max cost<input type="number" min="0" value={filters.maximum} onChange={(event) => setFilters({ ...filters, maximum: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-[#E4E7EC] px-2 text-sm" /></label></div>
      </div>
      {feedback && <div className="mt-4"><AdminFeedback {...feedback} /></div>}
    </section>
    <section className="overflow-x-auto rounded-lg border border-[#E4E7EC] bg-white shadow-sm">
      <div className="hidden min-w-[1380px] grid-cols-[110px_300px_150px_170px_105px_150px_130px_170px] gap-3 border-b border-[#E4E7EC] bg-[#F6F7F9] px-4 py-3 text-xs font-black uppercase text-[#727986] xl:grid"><span>Supplier SKU</span><span>Product identity</span><span>Commercial</span><span>Stock / availability</span><span>Mapping</span><span>Product readiness</span><span>Publication</span><span>Next action</span></div>
      <div className="divide-y divide-[#E4E7EC]">
        {!data && <p className="p-6 text-sm font-semibold text-[#727986]">Loading launch readiness...</p>}
        {rows.map((row) => {
          const { product, mapping, proposal } = row;
          const state = product.launchAssortment?.state ?? "NOT_SELECTED";
          return <article key={product.supplierSku} className="grid gap-3 px-4 py-4 xl:min-w-[1380px] xl:grid-cols-[110px_300px_150px_170px_105px_150px_130px_170px] xl:items-center">
            <p className="break-all text-sm font-black">{product.supplierSku}</p>
            <SupplierProductIdentity imageUrl={product.imageUrl} supplierTitle={product.description} brand={product.manufacturer} canonicalName={row.onboarding?.product?.name} canonicalSku={row.onboarding?.product?.sku} reference={state.replace(/_/g, " ")} />
            <SupplierCommercialEvidence cost={product.dealerPriceExVat} currency="ZAR" label="Dealer cost excl. VAT" secondary={proposal ? `Pricing: ${proposal.status.replace(/_/g, " ")}` : "Pricing not generated"} />
            <div><SupplierAvailability supplierLabel={product.availability.replace(/_/g, " ")} supplierQuantity={product.totalStock} observedAt={product.lastSyncedAt} canonical={row.canonicalAvailability} /><p className="mt-1 text-xs text-[#667085]">Logistics: {product.logisticsMetadata?.status ?? "MISSING"}</p></div>
            <SupplierMappingStatus status={mapping?.status} />
            <SupplierProductReadiness readiness={row.onboarding} />
            <div><AdminStatusBadge label={row.publication.state.replace(/_/g, " ")} status={row.publication.state === "PUBLISHED" ? "PAID" : "PENDING"} />{row.publication.versionCount > 0 && <p className="mt-2 text-xs font-semibold text-[#727986]">{row.publication.versionCount} version(s)</p>}</div>
            <div className="flex flex-col gap-2"><SupplierProductNextAction readiness={row.onboarding} productId={mapping?.productId} storefrontSlug={row.publication.slug} unmappedLabel={row.workflow.primaryAction} onUnmapped={() => runPrimaryAction(row)} />{row.publication.state !== "PUBLISHED" && row.publication.versionCount === 0 && <button type="button" onClick={() => void setState(product.supplierSku, "CANDIDATE")} disabled={busy === product.supplierSku} className="rounded-md border border-[#E4E7EC] px-3 py-2 text-xs font-black disabled:opacity-60">Return to candidate</button>}</div>
          </article>;
        })}
        {data && rows.length === 0 && exactGuidance && <div className="p-6"><p className="text-sm font-black">{exactGuidance.product.supplierSku} is verified, logistics complete and pricing approved, but it has not been selected for launch.</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => void setState(exactGuidance.product.supplierSku, "SELECTED_FOR_LAUNCH")} disabled={busy === exactGuidance.product.supplierSku} className="rounded-md bg-[var(--tek-accent)] px-3 py-2 text-sm font-black disabled:opacity-60">Select for launch</button><button type="button" onClick={() => onOpenWorkflow(exactGuidance.product.supplierSku, "pricing")} className="rounded-md border border-[#E4E7EC] px-3 py-2 text-sm font-black">Open product</button></div></div>}
        {data && rows.length === 0 && !exactGuidance && <p className="p-6 text-sm font-semibold text-[#727986]">No Scoop offers match these launch filters.</p>}
      </div>
    </section>
  </div>;
}

function Metric({ label, value, emphasis = false }: { label: string; value?: number; emphasis?: boolean }) { return <div className={`rounded-lg border bg-white p-4 shadow-sm ${emphasis ? "border-[#469D8B]" : "border-[#E4E7EC]"}`}><p className="text-xs font-black uppercase text-[#727986]">{label}</p><p className="mt-2 text-xl font-black">{value ?? "-"}</p></div>; }
function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) { return <label className="text-xs font-black">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm">{options.map((option) => <option key={option} value={option}>{option.replace(/_/g, " ")}</option>)}</select></label>; }

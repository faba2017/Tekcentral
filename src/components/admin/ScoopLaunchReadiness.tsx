import { useEffect, useMemo, useState } from "react";
import { FiLoader, FiSearch } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { AdminFeedback, AdminStatusBadge } from "@/components/admin/AdminShell";
import { ApiError, apiRequest } from "@/lib/api";
import type { ScoopLaunchReadinessResponse, ScoopLaunchReadinessRow } from "@/lib/admin";

type AssortmentState = "NOT_SELECTED" | "CANDIDATE" | "SELECTED_FOR_LAUNCH";
type WorkflowFocus = "mapping" | "logistics" | "pricing";
type Props = { initialSearch: string; onSearchChange: (search: string) => void; onOpenWorkflow: (supplierSku: string, focus: WorkflowFocus) => void };

const money = (value?: number) => value === undefined ? "Unavailable" : new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(value);

export function ScoopLaunchReadiness({ initialSearch, onSearchChange, onOpenWorkflow }: Props) {
  const navigate = useNavigate();
  const [data, setData] = useState<ScoopLaunchReadinessResponse>();
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState<{ variant: "success" | "error" | "info"; message: string }>();
  const [filters, setFilters] = useState({ search: initialSearch, assortment: "ACTIVE", stock: "AVAILABLE", manufacturer: "ALL", mapping: "ALL", logistics: "ALL", pricing: "ALL", minimum: "", maximum: "" });
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

  const suggest = async () => {
    setBusy("suggest"); setFeedback(undefined);
    try {
      const result = await apiRequest<{ suggested: number }>("/api/admin/suppliers/scoop/launch-candidates/suggest", { method: "POST", body: JSON.stringify({ limit: 50 }) });
      await load();
      setFeedback({ variant: "success", message: `${result.suggested} advisory launch candidates added. Staff selection is still required.` });
    } catch (error) { setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "Candidate suggestions could not be generated." }); }
    finally { setBusy(""); }
  };

  const openBlocker = (row: ScoopLaunchReadinessRow) => {
    const { product, proposal, readiness } = row;
    const sku = product.supplierSku;
    if ((readiness.blockers.includes("PRICING_NOT_APPROVED") || readiness.blockers.includes("PRICING_BLOCKING_WARNING")) && proposal) {
      const returnTo = `/admin/suppliers/scoop?view=launch&sku=${encodeURIComponent(sku)}`;
      navigate(`/admin/settings/pricing?proposal=${encodeURIComponent(proposal.id)}&returnTo=${encodeURIComponent(returnTo)}`);
    } else if (readiness.blockers.includes("MAPPING_NOT_VERIFIED")) onOpenWorkflow(sku, "mapping");
    else if (readiness.blockers.includes("LOGISTICS_INCOMPLETE")) onOpenWorkflow(sku, "logistics");
    else onOpenWorkflow(sku, "pricing");
  };

  const actionLabel = (row: ScoopLaunchReadinessRow) => row.readiness.blockers.includes("PRICING_BLOCKING_WARNING")
    ? "View blocking warning"
    : row.readiness.blockers.includes("PRICING_NOT_APPROVED") ? "Review pricing proposal" : row.readiness.nextAction;

  const metrics = data?.metrics;
  return <div className="mt-6 space-y-5">
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      <Metric label="Scoop offers" value={metrics?.totalOffers} /><Metric label="Candidates" value={metrics?.launchCandidates} /><Metric label="Selected" value={metrics?.selectedForLaunch} /><Metric label="Verified" value={metrics?.verifiedMappings} /><Metric label="Logistics complete" value={metrics?.logisticsComplete} /><Metric label="Approved pricing" value={metrics?.approvedPricing} /><Metric label="Ready for review" value={metrics?.readyForPublishReview} emphasis />
    </section>
    <section className="rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-black">Launch readiness</h2><p className="mt-1 text-sm font-semibold text-[#727986]">Build a staff-verified assortment. Ready status does not publish products.</p></div><button type="button" onClick={() => void suggest()} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-md border border-[#469D8B] px-3 py-2 text-sm font-black text-[#176B5C] disabled:opacity-60">{busy === "suggest" && <FiLoader className="animate-spin" />}Suggest up to 50 candidates</button></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-black">Search<div className="relative mt-1"><FiSearch className="absolute left-3 top-3 text-[#727986]" /><input value={filters.search} onChange={(event) => { const search = event.target.value; setFilters({ ...filters, search }); onSearchChange(search); }} placeholder="SKU, description, category" className="h-10 w-full rounded-md border border-[#E4E7EC] pl-9 pr-3 text-sm" /></div></label>
        <Select label="Assortment" value={filters.assortment} options={["ACTIVE", "ALL", "CANDIDATE", "SELECTED_FOR_LAUNCH", "NOT_SELECTED"]} onChange={(value) => setFilters({ ...filters, assortment: value })} />
        <Select label="Stock" value={filters.stock} options={["AVAILABLE", "ALL", "OUT_OF_STOCK", "UNKNOWN", "STALE"]} onChange={(value) => setFilters({ ...filters, stock: value })} />
        <label className="text-xs font-black">Manufacturer<select value={filters.manufacturer} onChange={(event) => setFilters({ ...filters, manufacturer: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm"><option value="ALL">All</option>{manufacturers.map((item) => <option key={item}>{item}</option>)}</select></label>
        <Select label="Mapping" value={filters.mapping} options={["ALL", "UNMAPPED", "SUGGESTED", "VERIFIED", "REJECTED"]} onChange={(value) => setFilters({ ...filters, mapping: value })} />
        <Select label="Logistics" value={filters.logistics} options={["ALL", "COMPLETE", "MISSING"]} onChange={(value) => setFilters({ ...filters, logistics: value })} />
        <Select label="Pricing" value={filters.pricing} options={["ALL", "MISSING", "PENDING_APPROVAL", "APPROVED", "REJECTED"]} onChange={(value) => setFilters({ ...filters, pricing: value })} />
        <div className="grid grid-cols-2 gap-2"><label className="text-xs font-black">Min cost<input type="number" min="0" value={filters.minimum} onChange={(event) => setFilters({ ...filters, minimum: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-[#E4E7EC] px-2 text-sm" /></label><label className="text-xs font-black">Max cost<input type="number" min="0" value={filters.maximum} onChange={(event) => setFilters({ ...filters, maximum: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-[#E4E7EC] px-2 text-sm" /></label></div>
      </div>
      {feedback && <div className="mt-4"><AdminFeedback {...feedback} /></div>}
    </section>
    <section className="overflow-hidden rounded-lg border border-[#E4E7EC] bg-white shadow-sm">
      <div className="hidden grid-cols-[110px_1.4fr_100px_100px_110px_140px_130px_160px] gap-3 border-b border-[#E4E7EC] bg-[#F6F7F9] px-4 py-3 text-xs font-black uppercase text-[#727986] xl:grid"><span>SKU</span><span>Product</span><span>Mapping</span><span>Logistics</span><span>Pricing</span><span>Readiness</span><span>Publication</span><span>Next action</span></div>
      <div className="divide-y divide-[#E4E7EC]">
        {!data && <p className="p-6 text-sm font-semibold text-[#727986]">Loading launch readiness...</p>}
        {rows.map((row) => {
          const { product, mapping, proposal, readiness } = row;
          const state = product.launchAssortment?.state ?? "NOT_SELECTED";
          return <article key={product.supplierSku} className="grid gap-3 px-4 py-4 xl:grid-cols-[110px_1.4fr_100px_100px_110px_140px_130px_160px] xl:items-center">
            <p className="break-all text-sm font-black">{product.supplierSku}</p>
            <div><p className="text-sm font-semibold">{product.description}</p><p className="mt-1 text-xs font-semibold text-[#727986]">{product.manufacturer ?? "Unknown manufacturer"} · {money(product.dealerPriceExVat)} · {product.availability.replace(/_/g, " ")}</p><p className="mt-1 text-xs font-black text-[#176B5C]">{state.replace(/_/g, " ")}</p></div>
            <AdminStatusBadge label={mapping?.status ?? "UNMAPPED"} status={mapping?.status === "VERIFIED" ? "PAID" : "PENDING"} />
            <AdminStatusBadge label={product.logisticsMetadata?.status ?? "MISSING"} status={product.logisticsMetadata?.status === "COMPLETE" ? "PAID" : "PENDING"} />
            <div><p className="text-xs font-black">{proposal?.status ?? "MISSING"}</p>{proposal?.proposedSellingPriceInclVat !== undefined && <p className="mt-1 text-xs font-semibold text-[#727986]">{money(proposal.proposedSellingPriceInclVat)}</p>}{Boolean(proposal?.warnings.length) && <p className="mt-1 text-xs font-semibold text-[#B54708]">{proposal!.warnings.length} warning(s)</p>}</div>
            <div><AdminStatusBadge label={readiness.status.replace(/_/g, " ")} status={readiness.status === "READY_FOR_PUBLISH_REVIEW" ? "PAID" : "PENDING"} /><p className="mt-2 text-xs font-semibold text-[#727986]">{readiness.blockers.map((item) => item.replace(/_/g, " ")).join(" · ") || "All checks complete"}</p></div>
            <div><AdminStatusBadge label={row.publication.state.replace(/_/g, " ")} status={row.publication.state === "PUBLISHED" ? "PAID" : "PENDING"} />{row.publication.versionCount > 0 && <p className="mt-2 text-xs font-semibold text-[#727986]">{row.publication.versionCount} version(s)</p>}</div>
            <div className="flex flex-col gap-2">{state !== "SELECTED_FOR_LAUNCH" ? <button type="button" onClick={() => void setState(product.supplierSku, "SELECTED_FOR_LAUNCH")} disabled={busy === product.supplierSku} className="rounded-md bg-[var(--tek-accent)] px-3 py-2 text-xs font-black disabled:opacity-60">Select for launch</button> : <>{readiness.status === "READY_FOR_PUBLISH_REVIEW" && mapping?.productId ? <button type="button" onClick={() => navigate(`/admin/products/${encodeURIComponent(mapping.productId)}/publishing`)} className="rounded-md bg-[var(--tek-accent)] px-3 py-2 text-xs font-black">Review &amp; Publish</button> : <button type="button" onClick={() => openBlocker(row)} className="rounded-md bg-[var(--tek-accent)] px-3 py-2 text-xs font-black">{actionLabel(row)}</button>}<button type="button" onClick={() => void setState(product.supplierSku, "CANDIDATE")} disabled={busy === product.supplierSku} className="rounded-md border border-[#E4E7EC] px-3 py-2 text-xs font-black disabled:opacity-60">Return to candidate</button></>}</div>
          </article>;
        })}
        {data && rows.length === 0 && <p className="p-6 text-sm font-semibold text-[#727986]">No Scoop offers match these launch filters.</p>}
      </div>
    </section>
  </div>;
}

function Metric({ label, value, emphasis = false }: { label: string; value?: number; emphasis?: boolean }) { return <div className={`rounded-lg border bg-white p-4 shadow-sm ${emphasis ? "border-[#469D8B]" : "border-[#E4E7EC]"}`}><p className="text-xs font-black uppercase text-[#727986]">{label}</p><p className="mt-2 text-xl font-black">{value ?? "-"}</p></div>; }
function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) { return <label className="text-xs font-black">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-[#E4E7EC] px-3 text-sm">{options.map((option) => <option key={option} value={option}>{option.replace(/_/g, " ")}</option>)}</select></label>; }

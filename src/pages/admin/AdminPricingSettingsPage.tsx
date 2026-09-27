import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AdminFeedback, AdminPageHeader, AdminShell, AdminStatusBadge } from "@/components/admin/AdminShell";
import { ApiError, apiRequest } from "@/lib/api";
import type { ManualPricingPreview, PricingProposal, PricingSettings, SettingsAuditEntry } from "@/lib/admin";
import { formatDateTime } from "@/lib/order-utils";
import { usePageTitle } from "@/lib/page-title";

const money = (value?: number) => value === undefined ? "Unavailable" : new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(value);

export function AdminPricingSettingsPage() {
  usePageTitle("Pricing settings | TekCentral Ops");
  const [searchParams] = useSearchParams();
  const [settings, setSettings] = useState<PricingSettings>();
  const [saved, setSaved] = useState<PricingSettings>();
  const [audit, setAudit] = useState<SettingsAuditEntry[]>([]);
  const [proposals, setProposals] = useState<PricingProposal[]>([]);
  const [feedback, setFeedback] = useState<{ variant: "success" | "error" | "info"; message: string }>();
  const [saving, setSaving] = useState(false);
  const focusedProposalId = searchParams.get("proposal");
  const requestedReturnTo = searchParams.get("returnTo");
  const returnTo = requestedReturnTo?.startsWith("/admin/suppliers/scoop?view=launch") ? requestedReturnTo : undefined;

  useEffect(() => {
    Promise.all([
      apiRequest<{ pricing: PricingSettings; audit: SettingsAuditEntry[] }>("/api/admin/settings/pricing"),
      apiRequest<{ proposals: PricingProposal[] }>("/api/admin/pricing/proposals"),
    ]).then(([settingResponse, proposalResponse]) => { setSettings(settingResponse.pricing); setSaved(settingResponse.pricing); setAudit(settingResponse.audit); setProposals(proposalResponse.proposals); }).catch(() => setFeedback({ variant: "error", message: "Pricing settings could not be loaded." }));
  }, []);

  useEffect(() => {
    const proposalIndex = proposals.findIndex((proposal) => proposal.id === focusedProposalId);
    if (proposalIndex < 0) return;
    const heading = [...document.querySelectorAll("h2")].find((item) => item.textContent === "Proposed prices");
    const target = heading?.closest("section")?.querySelectorAll("article")[proposalIndex] as HTMLElement | undefined;
    if (!target) return;
    target.tabIndex = -1;
    target.classList.add("rounded-md", "bg-[#FFF7E8]", "ring-2", "ring-[#F79009]");
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.focus({ preventScroll: true });
    return () => target.classList.remove("rounded-md", "bg-[#FFF7E8]", "ring-2", "ring-[#F79009]");
  }, [focusedProposalId, proposals]);

  const changed = settings && saved && JSON.stringify(settings) !== JSON.stringify(saved);
  const updateBand = (index: number, field: string, value: number | undefined) => setSettings((current) => current ? { ...current, pricingBands: current.pricingBands.map((band, bandIndex) => bandIndex === index ? { ...band, [field]: value } : band) } : current);
  const save = async () => {
    if (!settings) return; setSaving(true);
    try { const response = await apiRequest<{ pricing: PricingSettings; audit: SettingsAuditEntry[] }>("/api/admin/settings/pricing", { method: "PATCH", body: JSON.stringify({ pricing: { ...settings, cjFxRateUpdatedAt: settings.cjManualFxRate !== saved?.cjManualFxRate ? new Date().toISOString() : settings.cjFxRateUpdatedAt } }) }); setSettings(response.pricing); setSaved(response.pricing); setAudit(response.audit); setFeedback({ variant: "success", message: "Pricing settings saved. Existing public prices were not changed." }); }
    catch (error) { setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "Pricing settings could not be saved." }); }
    finally { setSaving(false); }
  };
  const updateProposal = async (proposal: PricingProposal, action: "approve" | "reject") => { const response = await apiRequest<{ proposal: PricingProposal }>(`/api/admin/pricing/proposals/${proposal.id}/${action}`, { method: "PATCH" }); setProposals((current) => current.map((item) => item.id === proposal.id ? response.proposal : item)); };
  const applyOverride = (proposal: PricingProposal, superseded: PricingProposal) => setProposals((current) => [proposal, ...current.map((item) => item.id === superseded.id ? superseded : item)]);

  return <AdminShell>
    <AdminPageHeader eyebrow="Business settings" title="Pricing" description="Configure internal pricing rules and review proposed prices before any future storefront publishing." actions={<button type="button" onClick={save} disabled={!changed || saving} className="rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black text-[var(--tek-accent-ink)] disabled:cursor-not-allowed disabled:bg-[#E4E7EC] disabled:text-[#727986]">{saving ? "Saving..." : "Save settings"}</button>} />
    {returnTo && <div className="mt-5"><Link to={returnTo} className="inline-flex rounded-md border border-[#469D8B] bg-white px-3 py-2 text-sm font-black text-[#176B5C]">Back to Scoop Launch readiness</Link></div>}
    {feedback && <div className="mt-5"><AdminFeedback {...feedback} /></div>}
    {changed && <div className="mt-5"><AdminFeedback variant="info" message={`${proposals.filter((item) => item.status === "PENDING_APPROVAL" || item.status === "DRAFT").length} active proposal(s) may be affected. Saving settings will not recalculate proposals or alter public prices.`} /></div>}
    {settings && <>
      <section className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className="rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm"><h2 className="text-lg font-black">Tax and policy</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><NumberField label="VAT rate %" value={settings.vatRatePercent} onChange={(value) => setSettings({ ...settings, vatRatePercent: value ?? 0 })} /><label className="text-sm font-black">Rounding<select value={settings.roundingMode} onChange={(event) => setSettings({ ...settings, roundingMode: event.target.value as PricingSettings["roundingMode"] })} className="mt-2 h-10 w-full rounded-md border border-[#E4E7EC] px-3">{["NONE", "NEAREST_1", "NEAREST_5", "NEAREST_10", "END_99"].map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-sm font-black">Reference retail<select value={settings.referencePriceBehavior} onChange={(event) => setSettings({ ...settings, referencePriceBehavior: event.target.value as PricingSettings["referencePriceBehavior"] })} className="mt-2 h-10 w-full rounded-md border border-[#E4E7EC] px-3">{["IGNORE", "WARNING_ONLY", "SOFT_CEILING"].map((item) => <option key={item}>{item}</option>)}</select><span className="mt-2 block text-xs font-semibold leading-5 text-[#727986]">Supplier retail price is used as a warning benchmark only and does not automatically cap TekCentral pricing.</span></label><label className="flex items-center gap-3 text-sm font-black"><input type="checkbox" checked={settings.proposedPricesRequireApproval} onChange={(event) => setSettings({ ...settings, proposedPricesRequireApproval: event.target.checked })} />Proposals require approval</label><p className="text-xs font-semibold text-[#727986]">Automatic publishing: <span className="font-black">Off</span></p></div><p className="mt-4 text-sm font-semibold text-[#3F4652]">Delivery charges are managed separately from product pricing.</p></div>
        <div className="rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm"><h2 className="text-lg font-black">CJ foreign exchange</h2><div className="mt-4 grid gap-4 sm:grid-cols-3"><NumberField label="Manual ZAR rate" value={settings.cjManualFxRate} onChange={(value) => setSettings({ ...settings, cjManualFxRate: value })} /><NumberField label="FX buffer %" value={settings.cjFxBufferPercent} onChange={(value) => setSettings({ ...settings, cjFxBufferPercent: value ?? 0 })} /><NumberField label="Stale after hours" value={settings.fxStaleAfterHours} onChange={(value) => setSettings({ ...settings, fxStaleAfterHours: value ?? 24 })} /></div><p className="mt-3 text-xs font-semibold text-[#727986]">No live FX source is connected. CJ proposals record this manual rate and its timestamp.</p></div>
      </section>
      <section className="mt-6 rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm"><h2 className="text-lg font-black">Pricing bands</h2><p className="mt-1 text-sm font-semibold text-[#727986]">Gross margin is calculated from selling price, not as a markup on cost.</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead><tr className="border-b border-[#E4E7EC] text-xs uppercase text-[#727986]"><th className="py-3">Band</th><th>Minimum cost</th><th>Maximum cost</th><th>Target gross margin</th><th>Minimum profit</th></tr></thead><tbody>{settings.pricingBands.map((band, index) => <tr key={band.id} className="border-b border-[#E4E7EC]"><td className="py-3 font-black">{band.id}</td><td><SmallNumber value={band.minimumCost} onChange={(value) => updateBand(index, "minimumCost", value)} /></td><td><SmallNumber value={band.maximumCost} onChange={(value) => updateBand(index, "maximumCost", value)} /></td><td><SmallNumber value={band.targetGrossMarginPercent} onChange={(value) => updateBand(index, "targetGrossMarginPercent", value)} /></td><td><SmallNumber value={band.minimumGrossProfit} onChange={(value) => updateBand(index, "minimumGrossProfit", value)} /></td></tr>)}</tbody></table></div></section>
    </>}
    <section className="mt-6 rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black">Proposed prices</h2>
      <p className="mt-1 text-sm font-semibold text-[#727986]">Approved confirms staff review of the proposal record. Publish-review readiness also requires every blocking commercial and catalogue check to pass.</p>
      <div className="mt-4 divide-y divide-[#E4E7EC]">
        {proposals.map((proposal) => <PricingProposalCard key={proposal.id} proposal={proposal} updateProposal={updateProposal} applyOverride={applyOverride} />)}
        {proposals.length === 0 && <p className="py-5 text-sm font-semibold text-[#727986]">No pricing proposals generated yet.</p>}
      </div>
    </section>
    <section className="mt-6 rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm"><h2 className="text-lg font-black">Settings history</h2><div className="mt-3 divide-y divide-[#E4E7EC]">{audit.slice(0, 30).map((entry) => <div key={entry.id} className="grid gap-2 py-3 text-sm md:grid-cols-[1fr_180px_180px]"><span className="font-black">{entry.setting}</span><span className="font-semibold text-[#727986]">{entry.actor}</span><span className="font-semibold text-[#727986]">{formatDateTime(entry.timestamp)}</span></div>)}{audit.length === 0 && <p className="py-3 text-sm font-semibold text-[#727986]">No pricing settings changes recorded.</p>}</div></section>
  </AdminShell>;
}

function NumberField({ label, value, onChange }: { label: string; value?: number; onChange: (value?: number) => void }) { return <label className="text-sm font-black">{label}<input type="number" step="0.01" value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))} className="mt-2 h-10 w-full rounded-md border border-[#E4E7EC] px-3" /></label>; }
function SmallNumber({ value, onChange }: { value?: number; onChange: (value?: number) => void }) { return <input aria-label="Pricing band value" type="number" step="0.01" value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))} className="h-9 w-28 rounded-md border border-[#E4E7EC] px-2" />; }

function PricingProposalCard({ proposal, updateProposal, applyOverride }: { proposal: PricingProposal; updateProposal: (proposal: PricingProposal, action: "approve" | "reject") => Promise<void>; applyOverride: (proposal: PricingProposal, superseded: PricingProposal) => void }) {
  const [showOverride, setShowOverride] = useState(false);
  const target = proposal.targetMarginProposal;
  const competitive = proposal.competitiveSuggestion;
  const warnings = proposal.warningDetails ?? proposal.warnings.map((code) => ({ code, severity: "WARNING" as const, message: code.replace(/_/g, " ").toLowerCase() }));
  return <article className="py-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2"><p className="text-sm font-black">{proposal.productId}</p><span className="rounded bg-[#F2F4F7] px-2 py-1 text-[10px] font-black">{proposal.proposalKind === "MANUAL_OVERRIDE" || proposal.manualOverride ? "MANUAL OVERRIDE" : "AUTOMATED"}</span></div><p className="mt-1 text-xs font-semibold text-[#727986]">{proposal.supplierId} · {proposal.supplierOfferId} · {formatDateTime(proposal.generatedAt)}</p>{proposal.status === "SUPERSEDED" && <p className="mt-1 text-xs font-semibold text-[#727986]">Superseded by {proposal.supersededByProposalId ?? "a newer proposal"}{proposal.supersededAt ? ` on ${formatDateTime(proposal.supersededAt)}` : ""}</p>}</div>
      <div className="flex flex-wrap items-center gap-3"><AdminStatusBadge label={proposal.status} status={proposal.status === "APPROVED" ? "PAID" : proposal.status === "REJECTED" ? "CANCELLED" : "PENDING"} /><div className="flex gap-2">{["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(proposal.status) && <button type="button" onClick={() => setShowOverride((value) => !value)} className="rounded-md border border-[#98A2B3] px-3 py-2 text-sm font-black">Override price</button>}<button type="button" onClick={() => void updateProposal(proposal, "approve")} disabled={proposal.status !== "PENDING_APPROVAL"} className="rounded-md bg-[var(--tek-accent)] px-3 py-2 text-sm font-black disabled:bg-[#E4E7EC]">Approve</button><button type="button" onClick={() => void updateProposal(proposal, "reject")} disabled={proposal.status !== "PENDING_APPROVAL"} className="rounded-md border border-[#FDA29B] px-3 py-2 text-sm font-black text-[#B42318] disabled:border-[#E4E7EC] disabled:text-[#727986]">Reject</button></div></div>
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div className="rounded-md border border-[#E4E7EC] p-4"><p className="text-xs font-black uppercase text-[#727986]">Target-margin proposal</p><p className="mt-2 text-xl font-black">{money(target?.suggestedPriceInclVat ?? proposal.proposedSellingPriceInclVat)}</p><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><Value label="Gross margin" value={`${target?.grossMarginPercent ?? proposal.grossMarginPercent ?? 0}%`} /><Value label="Gross profit excl VAT" value={money(target?.grossProfitExVat ?? proposal.grossProfit)} /><Value label="Target margin" value={`${proposal.appliedPricingBand?.targetGrossMarginPercent ?? "-"}%`} /><Value label="Minimum profit" value={money(proposal.appliedPricingBand?.minimumGrossProfit)} /></dl></div>
      {competitive ? <div className="rounded-md border border-[#F5C26B] bg-[#FFFDF7] p-4"><p className="text-xs font-black uppercase text-[#727986]">Competitive/reference suggestion</p><p className="mt-2 text-xl font-black">{money(competitive.suggestedPriceInclVat)}</p><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><Value label="Gross margin" value={`${competitive.grossMarginPercent}%`} /><Value label="Gross profit excl VAT" value={money(competitive.grossProfitExVat)} /><Value label="Minimum profit" value={competitive.minimumProfitPasses ? "Passes" : "Fails"} /><Value label="Target margin" value={competitive.targetMarginPasses ? "Passes" : "Does not pass"} /></dl><p className={`mt-3 text-xs font-black ${competitive.viability === "NOT_COMMERCIALLY_VIABLE" ? "text-[#B42318]" : "text-[#176B5C]"}`}>{competitive.viability.replace(/_/g, " ")}</p><p className="mt-2 text-xs font-semibold leading-5 text-[#727986]">Target-margin pricing is above the supplier retail reference. The reference price {competitive.minimumProfitPasses ? "remains profitable and meets the minimum-profit rule, but delivers a lower gross margin" : "does not meet the minimum-profit rule"}.</p></div> : <div className="rounded-md border border-[#E4E7EC] p-4"><p className="text-xs font-black uppercase text-[#727986]">Reference comparison</p><p className="mt-2 text-sm font-semibold">No lower reference-price scenario applies.</p></div>}
    </div>
    {warnings.length > 0 && <div className="mt-4 space-y-2">{warnings.map((warning) => <p key={warning.code} className={`text-sm font-semibold ${warning.severity === "BLOCKING" ? "text-[#B42318]" : warning.severity === "WARNING" ? "text-[#B54708]" : "text-[#727986]"}`}><span className="mr-2 text-xs font-black">{warning.severity}</span>{warning.message}</p>)}</div>}
    {showOverride && <PricingOverridePanel proposal={proposal} onCancel={() => setShowOverride(false)} onCreated={(created, superseded) => { applyOverride(created, superseded); setShowOverride(false); }} />}
  </article>;
}

function PricingOverridePanel({ proposal, onCancel, onCreated }: { proposal: PricingProposal; onCancel: () => void; onCreated: (proposal: PricingProposal, superseded: PricingProposal) => void }) {
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<ManualPricingPreview>();
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const amount = Number(price);
    const timer = window.setTimeout(() => {
      if (!Number.isFinite(amount) || amount <= 0 || !reason.trim()) { setPreview(undefined); return; }
      apiRequest<{ preview: ManualPricingPreview }>(`/api/admin/pricing/proposals/${proposal.id}/override-preview`, { method: "POST", body: JSON.stringify({ overridePriceInclVat: amount, overrideReason: reason, reasonCategory: category || undefined }) })
        .then((response) => { setPreview(response.preview); setError(""); })
        .catch((requestError) => { setPreview(undefined); setError(requestError instanceof ApiError ? requestError.message : "Override preview could not be calculated."); });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [category, price, proposal.id, reason]);
  const create = async () => {
    if (!preview || !confirmed) return;
    setSaving(true);
    try {
      const response = await apiRequest<{ proposal: PricingProposal; superseded: PricingProposal }>(`/api/admin/pricing/proposals/${proposal.id}/override`, { method: "POST", body: JSON.stringify({ overridePriceInclVat: Number(price), overrideReason: reason, reasonCategory: category || undefined }) });
      onCreated(response.proposal, response.superseded);
    } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : "Override proposal could not be created."); }
    finally { setSaving(false); }
  };
  return <div className="mt-5 rounded-md border border-[#98A2B3] bg-[#F9FAFB] p-4">
    <h3 className="text-sm font-black">Create manual price override</h3>
    <p className="mt-1 text-xs font-semibold text-[#727986]">This creates a new proposal for approval and preserves the current proposal in history.</p>
    <div className="mt-4 grid gap-4 md:grid-cols-3"><Value label="Current automated proposal" value={money(proposal.targetMarginProposal?.suggestedPriceInclVat ?? proposal.proposedSellingPriceInclVat)} /><Value label="Competitive reference" value={money(proposal.competitiveSuggestion?.suggestedPriceInclVat ?? proposal.referenceRetailInclVat)} /><NumberField label="Manual override incl VAT" value={price === "" ? undefined : Number(price)} onChange={(value) => { setPrice(value === undefined ? "" : String(value)); setConfirmed(false); }} /></div>
    <div className="mt-4 grid gap-4 md:grid-cols-2"><label className="text-sm font-black">Reason category<select value={category} onChange={(event) => { setCategory(event.target.value); setConfirmed(false); }} className="mt-2 h-10 w-full rounded-md border border-[#E4E7EC] px-3"><option value="">Select category (optional)</option>{["COMPETITIVE_ALIGNMENT", "MARKET_PRICE", "PROMOTION", "MARGIN_EXCEPTION", "CUSTOMER_QUOTE", "OTHER"].map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-sm font-black">Reason / staff note<textarea value={reason} onChange={(event) => { setReason(event.target.value); setConfirmed(false); }} rows={3} className="mt-2 w-full rounded-md border border-[#E4E7EC] px-3 py-2" /></label></div>
    {preview && <div className="mt-4 rounded-md border border-[#E4E7EC] bg-white p-4"><dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><Value label="Price excl VAT" value={money(preview.proposedSellingPriceExVat)} /><Value label="VAT" value={money(preview.vatAmount)} /><Value label="Supplier cost excl VAT" value={money(preview.supplierCostExVat)} /><Value label="Gross profit excl VAT" value={money(preview.grossProfit)} /><Value label="Gross margin" value={`${preview.grossMarginPercent}%`} /><Value label="Markup" value={`${preview.markupPercent}%`} /><Value label="Target margin" value={`${preview.targetMarginPercent}%`} /><Value label="Minimum profit" value={`${money(preview.minimumGrossProfit)} · ${preview.minimumProfitPasses ? "Pass" : "Fail"}`} /><Value label="Reference delta" value={money(preview.referenceRetailDelta)} /><Value label="Automated target delta" value={money(preview.automatedTargetDelta)} /></dl>{preview.warningDetails.length > 0 && <div className="mt-4 space-y-1">{preview.warningDetails.map((warning) => <p key={warning.code} className={`text-sm font-semibold ${warning.severity === "BLOCKING" ? "text-[#B42318]" : warning.severity === "WARNING" ? "text-[#B54708]" : "text-[#727986]"}`}>{warning.severity}: {warning.message}</p>)}</div>}</div>}
    {error && <p className="mt-3 text-sm font-semibold text-[#B42318]">{error}</p>}
    <label className="mt-4 flex items-start gap-2 text-sm font-semibold"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I confirm this exceptional manual price and its commercial impact.</label>
    <div className="mt-4 flex gap-2"><button type="button" onClick={onCancel} className="rounded-md border border-[#98A2B3] px-3 py-2 text-sm font-black">Cancel</button><button type="button" onClick={() => void create()} disabled={!preview || !confirmed || saving} className="rounded-md bg-[var(--tek-accent)] px-3 py-2 text-sm font-black text-[var(--tek-accent-ink)] disabled:bg-[#E4E7EC]">{saving ? "Creating..." : "Create override proposal"}</button></div>
  </div>;
}

function Value({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold text-[#727986]">{label}</dt><dd className="mt-1 font-black">{value}</dd></div>; }

import { type ReactNode, useEffect, useState } from "react";
import { AdminFeedback } from "@/components/admin/AdminShell";
import { ApiError, apiRequest } from "@/lib/api";
import type { CjLaunchReadinessRow, FxRateResponse, PricingSettings } from "@/lib/admin";
import type { SupplierCatalogueProduct } from "@/types/order";

const evidenceTypes = ["CJ_ACCOUNT_UI", "CJ_PRODUCT_PAGE", "CJ_CART", "CJ_PURCHASE_SCREEN", "CJ_QUOTE", "CJ_INVOICE", "CJ_SUPPORT_CONFIRMATION", "ADMIN_DOCUMENTED_SOURCE", "OTHER_DOCUMENTED"];
type Mode = "currency" | "cost" | "fx";

export function CjSupplierEvidencePanel({ product, variant, row, deliveryStatus, onSaved }: { product: SupplierCatalogueProduct; variant: SupplierCatalogueProduct["variants"][number]; row?: CjLaunchReadinessRow; deliveryStatus?: string; onSaved: () => Promise<void> }) {
  const [mode, setMode] = useState<Mode>();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ variant: "success" | "error"; message: string }>();
  const [currency, setCurrency] = useState("");
  const [amount, setAmount] = useState("");
  const [evidenceType, setEvidenceType] = useState("");
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [accountLevel, setAccountLevel] = useState(false);
  const [fxRate, setFxRate] = useState("");
  const [fxCapturedAt, setFxCapturedAt] = useState("");
  const [fxReason, setFxReason] = useState("");
  const [fxActor, setFxActor] = useState("TekCentral Staff");
  const [pricing, setPricing] = useState<PricingSettings>();
  const [pricingRevision, setPricingRevision] = useState(0);
  const [fx, setFx] = useState<FxRateResponse>();
  const [refreshingFx, setRefreshingFx] = useState(false);
  const [refreshingSourcePrice, setRefreshingSourcePrice] = useState(false);
  const evidence = row?.evidence;
  const sourcePriceStale = Boolean(evidence?.blockers.includes("SOURCE_PRICE_STALE"));

  useEffect(() => {
    apiRequest<{ pricing: PricingSettings; revision: number }>("/api/admin/settings/pricing").then((response) => { setPricing(response.pricing); setPricingRevision(response.revision); }).catch(() => undefined);
    if (evidence?.currency && evidence.currency !== "ZAR") apiRequest<FxRateResponse>(`/api/admin/settings/fx?sourceCurrency=${encodeURIComponent(evidence.currency)}&targetCurrency=ZAR`).then(setFx).catch(() => undefined);
  }, [evidence?.currency]);
  const primaryMode: Mode | undefined = !evidence?.currency ? "currency" : evidence.costStatus !== "AUTHORITATIVE" ? "cost" : evidence.currency !== "ZAR" && ["REQUIRED", "STALE"].includes(evidence.fxStatus) ? "fx" : undefined;
  const open = (next: Mode) => {
    setMode(next); setFeedback(undefined);
    if (next === "cost") setCurrency(evidence?.currency ?? "");
    if (next === "fx") { setCurrency(evidence?.currency ?? ""); setFxRate(pricing?.cjManualFxRate?.toString() ?? ""); setReference(pricing?.cjFxSourceReference ?? ""); }
  };
  const reset = () => { setMode(undefined); setAmount(""); setEvidenceType(""); setNote(""); setReference(""); setFxRate(""); setFxCapturedAt(""); };
  const save = async () => {
    if (!mode) return;
    setBusy(true); setFeedback(undefined);
    try {
      if (mode === "currency") {
        const path = accountLevel ? "/api/admin/suppliers/cj/evidence-settings/currency" : `/api/admin/suppliers/cj/products/${encodeURIComponent(product.supplierProductId)}/currency`;
        await apiRequest(path, { method: "PATCH", body: JSON.stringify({ currency, evidenceType, evidenceNote: note, sourceReference: reference }) });
      } else if (mode === "cost") {
        await apiRequest(`/api/admin/suppliers/cj/products/${encodeURIComponent(product.supplierProductId)}/variants/${encodeURIComponent(variant.supplierVariantId)}/cost`, { method: "PATCH", body: JSON.stringify({ amount: Number(amount), currency: evidence?.currency, evidenceType, evidenceNote: note, sourceReference: reference }) });
      } else {
        if (!pricing) throw new Error("Pricing settings are unavailable.");
        await apiRequest("/api/admin/settings/pricing", { method: "PATCH", body: JSON.stringify({ pricing: { ...pricing, cjManualFxRate: Number(fxRate), cjFxRateUpdatedAt: new Date(fxCapturedAt).toISOString(), cjFxSourceCurrency: evidence?.currency, cjFxSourceReference: reference, cjFxManualReason: fxReason, cjFxManualActor: fxActor }, revision: pricingRevision, confirmHighRisk: true }) });
      }
      await onSaved();
      setFeedback({ variant: "success", message: mode === "currency" ? "CJ currency evidence saved." : mode === "cost" ? "Exact-variant procurement cost saved." : "FX evidence saved." });
      reset();
    } catch (error) {
      setFeedback({ variant: "error", message: error instanceof ApiError || error instanceof Error ? error.message : "Supplier evidence could not be saved." });
    } finally { setBusy(false); }
  };
  const valid = mode === "currency" ? /^[A-Z]{3}$/.test(currency) && evidenceType && note.trim() && reference.trim()
    : mode === "cost" ? Number(amount) > 0 && evidenceType && note.trim() && reference.trim()
      : mode === "fx" ? Number(fxRate) > 0 && reference.trim() && fxReason.trim() && fxActor.trim() && Boolean(fxCapturedAt) : false;
  const refreshFx = async () => { if (!evidence?.currency) return; setRefreshingFx(true); setFeedback(undefined); try { const response = await apiRequest<FxRateResponse>("/api/admin/settings/fx/refresh", { method: "POST", body: JSON.stringify({ sourceCurrency: evidence.currency, targetCurrency: "ZAR" }) }); setFx(response); await onSaved(); setFeedback({ variant: "success", message: "Current FX retrieved and pricing readiness reconciled." }); } catch (error) { setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "FX refresh failed. Existing evidence was preserved." }); } finally { setRefreshingFx(false); } };
  const refreshSourcePrice = async () => {
    setRefreshingSourcePrice(true); setFeedback(undefined);
    try {
      await apiRequest(`/api/admin/suppliers/cj/products/${encodeURIComponent(product.supplierProductId)}/variants/${encodeURIComponent(variant.supplierVariantId)}/refresh-source-price`, { method: "POST", body: JSON.stringify({ supplierVariantSku: variant.supplierVariantSku }) });
      await onSaved();
      setFeedback({ variant: "success", message: "CJ source price refreshed and pricing reconciled." });
    } catch (error) {
      const message = error instanceof ApiError && error.code === "CJ_RATE_LIMITED"
        ? "CJ is temporarily limiting source-price checks. Please try again shortly."
        : error instanceof ApiError && ["CJ_API_UNAVAILABLE", "NETWORK_UNAVAILABLE"].includes(error.code ?? "")
          ? "CJ source price could not be refreshed. Try again. Existing evidence was preserved."
          : error instanceof ApiError ? error.message : "CJ source price could not be refreshed. Existing evidence was preserved.";
      setFeedback({ variant: "error", message });
    } finally { setRefreshingSourcePrice(false); }
  };

  return <section className="rounded-md border border-[#E4E7EC] bg-white p-4">
    <h5 className="text-sm font-black">Supplier evidence</h5>
    <div className="mt-3 grid gap-2 text-xs font-semibold sm:grid-cols-2">
      <p><strong>Currency:</strong> {evidence?.currency ?? "Unknown"}{evidence?.currency ? ` · ${evidence.currencySource.replace(/_/g, " ")}` : ""}</p>
      <p><strong>Procurement price:</strong> {evidence?.costStatus === "AUTHORITATIVE" ? `${evidence.currency === "USD" ? "$" : ""}${evidence.authoritativeCost} ${evidence.currency}` : "Missing"}</p>
      <p><strong>Price source:</strong> {evidence?.costSourceField ?? "Unavailable"}</p>
      <p><strong>Observed:</strong> {variant.costEvidence?.capturedAt ? new Date(variant.costEvidence.capturedAt).toLocaleString("en-ZA") : "Unavailable"}</p>
      <p><strong>Source-price status:</strong> {sourcePriceStale ? "STALE" : evidence?.costStatus === "AUTHORITATIVE" ? "FRESH" : "MISSING"}</p>
      <p><strong>FX:</strong> {evidence?.fxStatus?.replace(/_/g, " ") ?? "Not evaluated"}</p>
      <p><strong>Logistics:</strong> {evidence?.logistics.status ?? "Missing"}</p>
      <p><strong>Delivery:</strong> {deliveryStatus?.replace(/_/g, " ") ?? "Not checked"}</p>
    </div>
    {evidence?.normalizedCostZar !== undefined && <p className="mt-2 text-xs font-semibold text-[#3F4652]"><strong>ZAR normalized cost:</strong> {new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(evidence.normalizedCostZar)}</p>}
    {evidence?.currency !== "ZAR" && fx?.quote && <p className="mt-2 text-xs font-semibold text-[#727986]">FX 1 {fx.quote.sourceCurrency} = R {fx.quote.rate} · {fx.quote.provider} · {new Date(fx.quote.fetchedAt).toLocaleString("en-ZA")} · {fx.status}</p>}
    <p className="mt-3 text-xs font-black text-[#176B5C]">{evidence?.status === "READY_FOR_PRICING" ? "Supplier evidence complete · Ready for pricing" : `Next action: ${evidence?.nextAction ?? "Review supplier evidence"}`}</p>
    <p className="mt-2 break-all text-xs font-semibold text-[#727986]">This evidence applies to the selected {variant.name ?? "variant"}. VID {variant.supplierVariantId} · SKU {variant.supplierVariantSku ?? "Unavailable"}</p>
    <div className="mt-3 flex flex-wrap gap-2">
      {sourcePriceStale && <button type="button" onClick={() => void refreshSourcePrice()} disabled={refreshingSourcePrice} className="rounded-md bg-[var(--tek-accent)] px-3 py-2 text-xs font-black disabled:opacity-50">{refreshingSourcePrice ? "Refreshing CJ source price..." : "Refresh CJ source price"}</button>}
      {primaryMode && primaryMode !== "fx" && <button type="button" onClick={() => open(primaryMode)} className="rounded-md bg-[var(--tek-accent)] px-3 py-2 text-xs font-black">{primaryMode === "currency" ? "Confirm CJ currency" : "Record procurement cost"}</button>}
      {evidence?.currency && evidence.currency !== "ZAR" && <button type="button" onClick={() => void refreshFx()} disabled={refreshingFx} className={`rounded-md px-3 py-2 text-xs font-black disabled:opacity-50 ${primaryMode === "fx" && !sourcePriceStale ? "bg-[var(--tek-accent)]" : "border border-[#E4E7EC]"}`}>{refreshingFx ? "Refreshing..." : fx?.quote ? "Refresh FX" : "Get current FX"}</button>}
      {evidence?.currency && <button type="button" onClick={() => open("currency")} className="rounded-md border border-[#E4E7EC] px-3 py-2 text-xs font-black">Override currency evidence</button>}
      {evidence?.costStatus === "AUTHORITATIVE" && <button type="button" onClick={() => open("cost")} className="rounded-md border border-[#E4E7EC] px-3 py-2 text-xs font-black">Override supplier price</button>}
      {evidence?.currency && evidence.currency !== "ZAR" && <button type="button" onClick={() => open("fx")} className="rounded-md border border-[#E4E7EC] px-3 py-2 text-xs font-black">Manual FX fallback</button>}
    </div>
    {feedback && <div className="mt-3"><AdminFeedback {...feedback} /></div>}
    {mode && <div className="mt-4 grid gap-3 rounded-md border border-[#E4E7EC] bg-[#F9FAFB] p-3 sm:grid-cols-2">
      {mode === "currency" && <><Field label="Currency code"><input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} placeholder="USD" /></Field><Field label="Evidence type"><select value={evidenceType} onChange={(event) => setEvidenceType(event.target.value)}><option value="">Select evidence</option>{evidenceTypes.map((item) => <option key={item} value={item}>{item.replace(/_/g, " ")}</option>)}</select></Field><Field label="Evidence note"><input value={note} onChange={(event) => setNote(event.target.value)} /></Field><Field label="Source/reference"><input value={reference} onChange={(event) => setReference(event.target.value)} /></Field><label className="flex items-start gap-2 text-xs font-black sm:col-span-2"><input type="checkbox" checked={accountLevel} onChange={(event) => setAccountLevel(event.target.checked)} />Apply this as CJ account purchasing currency</label></>}
      {mode === "cost" && <><Field label="Procurement amount"><input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></Field><Field label="Currency"><input value={evidence?.currency ?? ""} readOnly /></Field><Field label="Evidence type"><select value={evidenceType} onChange={(event) => setEvidenceType(event.target.value)}><option value="">Select evidence</option>{evidenceTypes.map((item) => <option key={item} value={item}>{item.replace(/_/g, " ")}</option>)}</select></Field><Field label="Evidence/reference"><input value={reference} onChange={(event) => setReference(event.target.value)} /></Field><Field label="Evidence note" wide><input value={note} onChange={(event) => setNote(event.target.value)} /></Field></>}
      {mode === "fx" && <><Field label="Source currency"><input value={evidence?.currency ?? ""} readOnly /></Field><Field label="Target currency"><input value="ZAR" readOnly /></Field><Field label="Rate"><input type="number" min="0" step="0.0001" value={fxRate} onChange={(event) => setFxRate(event.target.value)} /></Field><Field label="Captured/effective time"><input type="datetime-local" value={fxCapturedAt} onChange={(event) => setFxCapturedAt(event.target.value)} /></Field><Field label="Source/reference"><input value={reference} onChange={(event) => setReference(event.target.value)} /></Field><Field label="Reason"><input value={fxReason} onChange={(event) => setFxReason(event.target.value)} /></Field><Field label="Actor" wide><input value={fxActor} onChange={(event) => setFxActor(event.target.value)} /></Field></>}
      <div className="flex gap-2 sm:col-span-2"><button type="button" onClick={() => void save()} disabled={busy || !valid} className="rounded-md bg-[var(--tek-accent)] px-3 py-2 text-xs font-black disabled:opacity-50">{busy ? "Saving..." : "Save evidence"}</button><button type="button" onClick={reset} disabled={busy} className="rounded-md border border-[#E4E7EC] bg-white px-3 py-2 text-xs font-black">Cancel</button></div>
    </div>}
  </section>;
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) { return <label className={`text-xs font-black ${wide ? "sm:col-span-2" : ""}`}>{label}<span className="mt-1 block [&>input]:h-11 [&>input]:w-full [&>input]:rounded-md [&>input]:border [&>input]:border-[#E5E7EB] [&>input]:px-3 [&>select]:h-11 [&>select]:w-full [&>select]:rounded-md [&>select]:border [&>select]:border-[#E5E7EB] [&>select]:px-3">{children}</span></label>; }

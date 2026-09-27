import { useEffect, useMemo, useState } from "react";
import { FiLoader } from "react-icons/fi";
import { AdminFeedback, AdminStatusBadge } from "@/components/admin/AdminShell";
import { ApiError, apiRequest } from "@/lib/api";
import type { AdminInternalProduct, ScoopProductCreationPreview } from "@/lib/admin";
import type { SupplierProductMapping } from "@/types/order";

export function ScoopProductCreationPanel({ supplierSku, hasVerifiedMapping, open, onOpenChange, onCreated }: { supplierSku: string; hasVerifiedMapping: boolean; open: boolean; onOpenChange: (open: boolean) => void; onCreated: (product: AdminInternalProduct, mapping: SupplierProductMapping) => void }) {
  const [preview, setPreview] = useState<ScoopProductCreationPreview>();
  const [name, setName] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ variant: "error" | "success"; message: string }>();

  useEffect(() => {
    let active = true;
    apiRequest<ScoopProductCreationPreview>(`/api/admin/suppliers/scoop/products/${encodeURIComponent(supplierSku)}/product-creation-preview`)
      .then((result) => { if (!active) return; setPreview(result); setName(result.titleSuggestions[0] ?? result.offer.description); setCategorySlug(result.categorySuggestion.slug); setSubcategory(result.categorySuggestion.subcategories[0] ?? ""); })
      .catch(() => { if (active) setFeedback({ variant: "error", message: "Product creation preview could not be loaded." }); });
    return () => { active = false; };
  }, [supplierSku]);

  const category = useMemo(() => preview?.categories.find((item) => item.slug === categorySlug), [categorySlug, preview]);
  const create = async () => {
    if (!confirmed) return; setBusy(true); setFeedback(undefined);
    try {
      const result = await apiRequest<{ product: AdminInternalProduct; mapping: SupplierProductMapping }>(`/api/admin/suppliers/scoop/products/${encodeURIComponent(supplierSku)}/create-tekcentral-product`, { method: "POST", body: JSON.stringify({ name, categorySlug, subcategory: subcategory || undefined, confirmed }) });
      onCreated(result.product, result.mapping); onOpenChange(false); setFeedback({ variant: "success", message: "Internal TekCentral product created and mapping verified. Nothing was published." });
    } catch (error) { setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "Product could not be created." }); }
    finally { setBusy(false); }
  };

  return <div id="scoop-product-creation" className="order-3 rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm xl:col-start-2 xl:row-start-3">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.12em] text-[#727986]">Create new</p><h2 className="mt-1 text-lg font-black">Create TekCentral product</h2><p className="mt-1 text-xs font-semibold text-[#727986]">Create an unpublished internal product from this exact SupplierOffer.</p>{hasVerifiedMapping && <p className="mt-2 text-xs font-black text-[#B54708]">Reject the current verified mapping before creating a replacement product.</p>}</div><button type="button" onClick={() => onOpenChange(!open)} disabled={hasVerifiedMapping} className="rounded-md border border-[#469D8B] px-3 py-2 text-sm font-black text-[#176B5C] disabled:cursor-not-allowed disabled:border-[#E4E7EC] disabled:text-[#727986]">{open ? "Close" : "Create new product"}</button></div>
    {feedback && <div className="mt-3"><AdminFeedback {...feedback} /></div>}
    {open && preview && <div className="mt-4 rounded-md border border-[#E4E7EC] bg-[#F9FAFB] p-4">
      <div className="grid gap-4 md:grid-cols-[120px_1fr]">
        <div className="flex h-28 items-center justify-center overflow-hidden rounded-md border border-[#E4E7EC] bg-white">{preview.offer.imageUrl ? <img src={preview.offer.imageUrl} alt="" className="h-full w-full object-contain" /> : <span className="px-2 text-center text-xs font-semibold text-[#727986]">Image missing</span>}</div>
        <div><p className="text-xs font-black uppercase text-[#727986]">Source review</p><p className="mt-2 text-sm font-black">{preview.offer.manufacturer ?? "Manufacturer pending review"}</p><p className="mt-1 text-xs font-semibold text-[#727986]">Source SKU {preview.offer.supplierSku} · SupplierOffer SCOOP:{preview.offer.supplierSku}</p><p className="mt-2 text-sm font-semibold text-[#3F4652]">{preview.offer.description}</p><p className="mt-2 text-xs font-semibold text-[#727986]">Stock {preview.offer.totalStock ?? "Unknown"} · Retail reference {preview.offer.retailPriceInclVat === undefined ? "Unavailable" : `R${preview.offer.retailPriceInclVat.toFixed(2)}`}. Supplier cost remains internal.</p></div>
      </div>
      <div className="mt-4 grid gap-4">
        <label className="text-sm font-black">Product title<input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-[#E4E7EC] bg-white px-3 text-sm" /></label>
        <div><p className="text-sm font-black">Title suggestions</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{preview.titleSuggestions.map((title) => <button key={title} type="button" onClick={() => setName(title)} className={`min-h-9 rounded-md border px-2 py-1.5 text-left text-xs font-semibold leading-4 ${name === title ? "border-[#469D8B] bg-[#E8F4F1] text-[#176B5C]" : "border-[#E4E7EC] bg-white"}`}>{title}</button>)}</div></div>
        <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-black">Category<select value={categorySlug} onChange={(event) => { const next = preview.categories.find((item) => item.slug === event.target.value); setCategorySlug(event.target.value); setSubcategory(next?.subcategories[0] ?? ""); }} className="mt-2 h-10 w-full rounded-md border border-[#E4E7EC] bg-white px-3 text-sm">{preview.categories.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label>
        <label className="text-sm font-black">Subcategory<select value={subcategory} onChange={(event) => setSubcategory(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-[#E4E7EC] bg-white px-3 text-sm">{category?.subcategories.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
      </div>
      <div className="mt-4 border-l-2 border-[#469D8B] bg-white px-3 py-2"><p className="text-xs font-black uppercase text-[#727986]">Provenance</p><p className="mt-1 text-xs font-semibold">Supplier identity and source-image provenance remain internal. Creates a supplier-neutral INTERNAL_DRAFT; nothing is published.</p></div>
      <label className="mt-4 flex items-start gap-3 text-sm font-semibold"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" /><span>I confirm the title, manufacturer identity, category, and that this offer represents the product being created.</span></label>
      <button type="button" onClick={() => void create()} disabled={!confirmed || !name.trim() || !categorySlug || busy} className="mt-4 inline-flex items-center gap-2 rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black disabled:bg-[#E4E7EC]">{busy && <FiLoader className="animate-spin" />}Create internal product and verify mapping</button>
    </div>}
  </div>;
}

export function MatchConfidence({ level }: { level: "HIGH" | "MEDIUM" | "LOW" }) { return <AdminStatusBadge label={`${level} confidence`} status={level === "HIGH" ? "PAID" : level === "LOW" ? "CANCELLED" : "PENDING"} />; }

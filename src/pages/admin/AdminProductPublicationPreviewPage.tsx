import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FiArrowLeft, FiExternalLink, FiFileText } from "react-icons/fi";
import { ProductVisual } from "@/components/commerce/ProductVisual";
import { ApiError, apiRequest } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import type { Product } from "@/types/product";

interface PreviewResponse {
  product: Product;
  priceAvailable: boolean;
  publicationState: "PUBLISHED" | "UNPUBLISHED";
  versionNumber: number;
  draftSavedAt?: string;
}

const stockLabels = { "in-stock": "Available", "low-stock": "Limited", "out-of-stock": "Unavailable", unknown: "Stock TBC" };
const documentLabels: Record<NonNullable<Product["documents"]>[number]["type"], string> = {
  DATASHEET: "Datasheet", COMPLIANCE_CERTIFICATE: "Compliance Certificate", USER_MANUAL: "User Manual",
  INSTALLATION_GUIDE: "Installation Guide", WARRANTY_DOCUMENT: "Warranty Document", BROCHURE: "Brochure",
  SPECIFICATION_SHEET: "Specification Sheet", SAFETY_DOCUMENT: "Safety Document", OTHER: "Document",
  QUICK_START_GUIDE: "Quick Start Guide", WARRANTY: "Warranty",
};

export function AdminProductPublicationPreviewPage() {
  const { productId = "" } = useParams();
  const [preview, setPreview] = useState<PreviewResponse>();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiRequest<PreviewResponse>(`/api/admin/products/${encodeURIComponent(productId)}/publication-preview`)
      .then((data) => { if (active) setPreview(data); })
      .catch((reason) => { if (active) setError(reason instanceof ApiError ? reason.message : "Publication preview could not be loaded."); });
    return () => { active = false; };
  }, [productId]);

  if (error) return <main className="min-h-screen bg-[#F6F7F9] p-6"><p className="font-bold text-[#B42318]">{error}</p></main>;
  if (!preview) return <main className="min-h-screen bg-[#F6F7F9] p-6"><p className="text-sm font-bold text-[#727986]">Loading publication preview...</p></main>;
  if (!preview.priceAvailable) return <main className="min-h-screen bg-[#F6F7F9] p-6"><p className="font-bold text-[#B42318]">Price unavailable</p><p className="mt-2 text-sm font-semibold text-[#727986]">A current approved Product price is required before this draft can be previewed or published.</p><Link to={`/admin/products?productSetup=${encodeURIComponent(productId)}&step=PUBLICATION`} className="mt-4 inline-flex items-center gap-2 text-sm font-black text-[#176B5C]"><FiArrowLeft />Back to Product configuration</Link></main>;
  const { product } = preview;
  const about = product.description?.trim() || product.overview?.trim() || "A practical technology option for home, work or business needs.";
  const specifications = (product.specifications ?? []).filter((item) => item.name.trim() && item.value.trim());
  const keySpecifications = specifications.filter((item) => item.isKey).slice(0, 8);
  const fullSpecifications = specifications.filter((item) => !keySpecifications.includes(item));
  const documents = (product.documents ?? []).filter((document) => document.verified && document.title.trim());

  return <main className="min-h-screen bg-white">
    <div className="border-b border-[#E4E7EC] bg-[#101828] px-4 py-3 text-white sm:px-6 lg:px-8"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-black">Draft preview</p><p className="text-xs text-white/70">Saved draft · active storefront is unchanged{preview.draftSavedAt ? ` · ${new Date(preview.draftSavedAt).toLocaleString("en-ZA")}` : ""}</p></div><Link to={`/admin/products?productSetup=${encodeURIComponent(productId)}&step=PREVIEW`} className="inline-flex items-center gap-2 text-sm font-black"><FiArrowLeft />Back to Product configuration</Link></div></div>
    <section className="px-4 py-10 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><nav className="text-sm font-semibold text-zinc-500">Shop / {product.category}</nav><div className="mt-8 grid gap-10 lg:grid-cols-[0.95fr_1.05fr]"><ProductVisual product={product} large /><div className="min-w-0 rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm sm:p-6"><p className="text-sm font-black uppercase text-[var(--tek-accent)]">{product.brand}</p><h1 className="mt-3 break-words text-4xl font-black leading-tight text-[#0A0A0A] sm:text-5xl">{product.name}</h1><p className="mt-3 text-sm font-semibold text-[#727986]">{product.model && `Model: ${product.model}`}{product.sku && ` | SKU: ${product.sku}`}</p><div className="mt-6 flex items-end justify-between gap-4 border-y border-[#E4E7EC] py-5"><p className="text-3xl font-black">{formatCurrency(product.price, product.currency)}</p><p className="rounded-full bg-[#F6F7F9] px-3 py-1.5 text-sm font-black">{stockLabels[product.stockStatus]}</p></div>{product.shortDescription && <p className="mt-6 max-w-2xl whitespace-pre-line text-lg leading-8 text-[#3F4652]">{product.shortDescription}</p>}</div></div><div className="mt-14 space-y-12"><section><h2 className="text-2xl font-black">About this product</h2><div className="mt-4 max-w-4xl space-y-4">{about.split(/\n{2,}/).map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 20)}`} className="whitespace-pre-line leading-7 text-[#3F4652]">{paragraph}</p>)}</div></section>{keySpecifications.length > 0 && <section><h2 className="text-2xl font-black">Key specifications</h2><dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{keySpecifications.map((item) => <div key={`${item.name}-${item.value}`} className="rounded-md border border-[#E4E7EC] bg-[#F6F7F9] p-4"><dt className="text-xs font-black uppercase text-[#727986]">{item.name}</dt><dd className="mt-2 text-sm font-bold">{item.value}</dd></div>)}</dl></section>}{fullSpecifications.length > 0 && <section><h2 className="text-2xl font-black">Full technical specifications</h2><dl className="mt-5 divide-y divide-[#E4E7EC] border-y border-[#E4E7EC]">{fullSpecifications.map((item) => <div key={`${item.name}-${item.value}`} className="grid gap-2 py-4 sm:grid-cols-[180px_1fr]"><dt className="text-sm font-black text-[#3F4652]">{item.name}</dt><dd className="text-sm font-semibold">{item.value}</dd></div>)}</dl></section>}{documents.length > 0 && <section><h2 className="text-2xl font-black">Downloads</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">{documents.map((document) => <a key={document.url} href={document.url} target="_blank" rel="noreferrer" className="flex items-center gap-4 rounded-md border border-[#E4E7EC] p-4"><span className="grid h-11 w-11 place-items-center rounded-md bg-[#F2F9F7] text-[#176B5C]"><FiFileText /></span><span className="min-w-0 flex-1"><span className="block text-xs font-black uppercase text-[#727986]">{documentLabels[document.type]} · PDF</span><span className="mt-1 block truncate text-sm font-black">{document.title}</span></span><FiExternalLink className="text-[#176B5C]" /></a>)}</div></section>}</div></div></section>
  </main>;
}

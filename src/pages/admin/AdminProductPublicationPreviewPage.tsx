import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";
import { ProductVisual } from "@/components/commerce/ProductVisual";
import { ApiError, apiRequest } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import type { Product } from "@/types/product";

interface PreviewResponse {
  product: Product;
  publicationState: "PUBLISHED" | "UNPUBLISHED";
  versionNumber: number;
}

const stockLabels = { "in-stock": "Available", "low-stock": "Limited", "out-of-stock": "Unavailable", unknown: "Stock TBC" };

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
  const { product } = preview;

  return <main className="min-h-screen bg-white">
    <div className="border-b border-[#E4E7EC] bg-[#101828] px-4 py-3 text-white sm:px-6 lg:px-8"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-black">{preview.publicationState === "UNPUBLISHED" ? "Previewing unpublished product" : "Admin storefront preview"}</p><p className="text-xs text-white/70">Publication version {preview.versionNumber}</p></div><Link to={`/admin/products/${encodeURIComponent(productId)}/publishing`} className="inline-flex items-center gap-2 text-sm font-black"><FiArrowLeft />Back to publication review</Link></div></div>
    <section className="px-4 py-10 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><nav className="text-sm font-semibold text-zinc-500">Shop / {product.category}</nav><div className="mt-8 grid gap-10 lg:grid-cols-[0.95fr_1.05fr]"><ProductVisual product={product} large /><div className="rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm sm:p-6"><p className="text-sm font-black uppercase text-[var(--tek-accent)]">{product.brand}</p><h1 className="mt-3 text-4xl font-black leading-tight text-[#0A0A0A] sm:text-5xl">{product.name}</h1><p className="mt-3 text-sm font-semibold text-[#727986]">{product.model && `Model: ${product.model}`}{product.sku && ` | SKU: ${product.sku}`}</p><div className="mt-6 flex items-end justify-between gap-4 border-y border-[#E4E7EC] py-5"><p className="text-3xl font-black">{formatCurrency(product.price, product.currency)}</p><p className="rounded-full bg-[#F6F7F9] px-3 py-1.5 text-sm font-black">{stockLabels[product.stockStatus]}</p></div>{product.shortDescription && <p className="mt-6 text-lg leading-8 text-[#3F4652]">{product.shortDescription}</p>}{product.description && <p className="mt-4 leading-7 text-[#3F4652]">{product.description}</p>}{(product.specifications ?? []).some((item) => item.name.trim() && item.value.trim()) && <div className="mt-8 rounded-lg border border-[#E4E7EC] bg-[#F6F7F9] p-5"><h2 className="text-lg font-black">Key specifications</h2><dl className="mt-4 grid gap-3 sm:grid-cols-2">{product.specifications?.filter((item) => item.name.trim() && item.value.trim()).map((item) => <div key={`${item.name}-${item.value}`} className="rounded-md bg-white p-3"><dt className="text-xs font-black uppercase text-[#727986]">{item.name}</dt><dd className="mt-1 text-sm font-bold">{item.value}</dd></div>)}</dl></div>}</div></div></div></section>
  </main>;
}

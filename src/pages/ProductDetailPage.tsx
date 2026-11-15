import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FiChevronDown, FiExternalLink, FiFileText, FiMinus, FiPlus } from "react-icons/fi";
import { useStorefrontCatalogue } from "@/state/catalogue";
import { getRelatedProducts } from "@/lib/catalogue";
import { formatCurrency } from "@/lib/format";
import { useCart } from "@/state/cart";
import { ProductGallery } from "@/components/commerce/ProductGallery";
import { ProductCard } from "@/components/commerce/ProductCard";
import { useComparison } from "@/state/comparison";
import { breadcrumbJsonLd, productJsonLd, usePageMetadata } from "@/lib/page-metadata";
import { ApiError, apiRequest } from "@/lib/api";
import { presentProductBody } from "@/lib/product-content";
import type { Product } from "@/types/product";
import { productAvailability } from "@/lib/product-availability";

const documentLabels: Record<NonNullable<Product["documents"]>[number]["type"], string> = {
  DATASHEET: "Datasheet",
  USER_MANUAL: "User Manual",
  QUICK_START_GUIDE: "Quick Start Guide",
  INSTALLATION_GUIDE: "Installation Guide",
  WARRANTY_DOCUMENT: "Warranty Document",
  BROCHURE: "Brochure",
  SPECIFICATION_SHEET: "Specification Sheet",
  SAFETY_DOCUMENT: "Safety Document",
  WARRANTY: "Warranty",
  COMPLIANCE_CERTIFICATE: "Compliance Certificate",
  OTHER: "Document",
};

export function ProductDetailPage() {
  const { slug = "" } = useParams();
  const { products, taxonomy } = useStorefrontCatalogue();
  const catalogueProduct = products.find((item) => item.slug === slug);
  const [requestedDetail, setRequestedDetail] = useState<{ slug: string; status: "FOUND" | "NOT_FOUND" | "ERROR"; product?: Product }>({ slug: "", status: "NOT_FOUND" });
  const [requestVersion, setRequestVersion] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [specificationsExpanded, setSpecificationsExpanded] = useState(false);
  const { addProduct } = useCart();
  const { toggleProduct, isComparing } = useComparison();
  useEffect(() => {
    if (catalogueProduct) return;
    let active = true;
    apiRequest<{ product: Product }>(`/api/public/catalogue/${encodeURIComponent(slug)}`)
      .then((result) => { if (active) setRequestedDetail({ slug, status: "FOUND", product: result.product }); })
      .catch((error) => { if (active) setRequestedDetail({ slug, status: error instanceof ApiError && error.status === 404 ? "NOT_FOUND" : "ERROR" }); });
    return () => { active = false; };
  }, [slug, requestVersion, catalogueProduct]);
  const detail = catalogueProduct ? { status: "FOUND" as const, product: catalogueProduct } : requestedDetail.slug === slug ? requestedDetail : { status: "LOADING" as const, product: undefined };
  const product = detail.product;
  usePageMetadata({ title: product ? `${product.name} | TekCentral` : detail.status === "NOT_FOUND" ? "Product Not Found | TekCentral" : "Product | TekCentral", description: product?.shortDescription ?? "View TekCentral product information, pricing and availability.", path: `/product/${slug}`, robots: product ? "index,follow" : "noindex,nofollow", type: "product", image: product?.images?.[0], jsonLd: product ? [productJsonLd(product), breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Shop", path: "/shop" }, { name: product.name, path: `/product/${product.slug}` }])] : undefined });

  if (detail.status === "LOADING") return <ProductDetailLoading />;

  if (detail.status === "ERROR") {
    return <section className="px-4 py-20 sm:px-6 lg:px-8"><div className="mx-auto max-w-4xl"><p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">Product unavailable</p><h1 className="mt-4 text-4xl font-black text-zinc-950">We could not load this product.</h1><p className="mt-4 text-base font-semibold text-[#727986]">Check your connection and try again.</p><button type="button" onClick={() => setRequestVersion((value) => value + 1)} className="mt-8 rounded-md bg-[var(--tek-accent)] px-5 py-3 text-sm font-black text-[var(--tek-accent-ink)]">Try Again</button></div></section>;
  }

  if (detail.status === "NOT_FOUND" || !product) {
    return (
      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">
            Product not found
          </p>
          <h1 className="mt-4 text-4xl font-black text-zinc-950">
            This product does not exist.
          </h1>
          <Link
            to="/shop"
            className="mt-8 inline-flex rounded-md bg-[var(--tek-accent)] px-5 py-3 text-sm font-black text-[var(--tek-accent-ink)] transition hover:bg-[var(--tek-accent-hover)]"
          >
            Back to Shop
          </Link>
        </div>
      </section>
    );
  }

  const related = getRelatedProducts(product, products);
  const specifications = (product.specifications ?? []).filter((spec) => spec.name.trim() && spec.value.trim());
  const keySpecifications = specifications.filter((spec) => spec.isKey).slice(0, 8);
  const fullSpecifications = specifications.filter((spec) => !keySpecifications.includes(spec));
  const productBody = presentProductBody(product.description, product.overview, specifications);
  const showAllSpecifications = fullSpecifications.length <= 6 || specificationsExpanded;
  const documents = (product.documents ?? []).filter((document) => document.verified && document.title.trim() && (document.url.startsWith("https://") || document.url.startsWith("/api/public/assets/documents/")));
  const availability = productAvailability(product);
  const category = taxonomy.find((item) => item.id === product.categoryId || item.slug === product.categorySlug);
  const subcategory = category?.children.find((item) => item.id === product.subcategoryId || item.name === product.subcategory);
  const productType = subcategory?.productTypes?.find((item) => item.id === product.productTypeId);
  const canonicalPath = { category, subcategory, productType };

  return (
    <section className="bg-white px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <nav className="text-sm font-semibold text-zinc-500" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-zinc-950">
            Home
          </Link>
          <span className="px-2">/</span>
          <Link to="/shop" className="hover:text-zinc-950">
            Shop
          </Link>
          {canonicalPath.category && <><span className="px-2">/</span><Link to={`/shop/${canonicalPath.category.slug}`} className="hover:text-zinc-950">{canonicalPath.category.label}</Link></>}
          {canonicalPath.subcategory && <><span className="px-2">/</span><Link to={`/shop/${canonicalPath.category!.slug}/${canonicalPath.subcategory.slug}`} className="hover:text-zinc-950">{canonicalPath.subcategory.label}</Link></>}
          {canonicalPath.productType && <><span className="px-2">/</span><Link to={`/shop/${canonicalPath.category!.slug}/${canonicalPath.subcategory!.slug}/${canonicalPath.productType.slug}`} className="hover:text-zinc-950">{canonicalPath.productType.label}</Link></>}
          <span className="px-2">/</span><span aria-current="page">{product.name}</span>
        </nav>

        <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="min-w-0 lg:sticky lg:top-32 lg:self-start">
            <ProductGallery key={product.id} product={product} />
          </div>

          <div className="min-w-0 rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm sm:p-6">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">
              {product.brand}
            </p>
            <h1 className="mt-3 break-words text-4xl font-black leading-tight text-[#0A0A0A] sm:text-5xl">
              {product.name}
            </h1>
            <p className="mt-3 text-sm font-semibold text-[#727986]">
              {product.model && `Model: ${product.model}`}
              {product.sku && ` | SKU: ${product.sku}`}
            </p>
            <div className="mt-6 flex flex-col gap-3 border-y border-[#E4E7EC] py-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                {product.promotion && (
                  <p className="mb-2 w-fit rounded-full bg-[#E8F7F3] px-3 py-1 text-xs font-black uppercase tracking-wide text-[#176B5C]">
                    {product.promotion.badgeText}
                  </p>
                )}
                <p className="text-3xl font-black text-[#0A0A0A]">
                  {formatCurrency(product.price, product.currency)}
                </p>
                {product.regularPrice && product.regularPrice > product.price && (
                  <p className="mt-1 text-sm font-bold text-[#727986] line-through">
                    {formatCurrency(product.regularPrice, product.currency)}
                    <span className="sr-only"> regular price</span>
                  </p>
                )}
              </div>
              <p className="w-fit rounded-full bg-[#F6F7F9] px-3 py-1.5 text-sm font-black text-[#3F4652]">
                {availability.label}
              </p>
            </div>
            <p className="mt-6 max-w-2xl whitespace-pre-line text-lg leading-8 text-[#3F4652]">
              {product.shortDescription}
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex h-11 w-36 items-center justify-between rounded-md border border-[#E4E7EC]">
                <button
                  type="button"
                  onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                  className="grid h-11 w-11 place-items-center"
                  aria-label="Decrease quantity"
                >
                  <FiMinus aria-hidden="true" />
                </button>
                <span className="text-sm font-black">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((value) => Math.min(99, value + 1))}
                  className="grid h-11 w-11 place-items-center"
                  aria-label="Increase quantity"
                >
                  <FiPlus aria-hidden="true" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => addProduct(product.id, quantity)}
                disabled={!availability.purchasable}
                className="rounded-md bg-[var(--tek-accent)] px-5 py-3 text-sm font-black text-[var(--tek-accent-ink)] transition hover:bg-[var(--tek-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tek-accent)] focus-visible:ring-offset-4 disabled:cursor-not-allowed disabled:bg-[#D0D5DD] disabled:text-[#667085]"
              >
                {availability.purchasable ? "Add to Cart" : "Currently unavailable"}
              </button>
              <Link
                to={`/zeus?product=${product.slug}`}
                className="rounded-md border border-[#E4E7EC] px-5 py-3 text-center text-sm font-black text-[#0A0A0A] transition hover:border-[#0A0A0A]"
              >
                Ask Zeus about this product
              </Link>
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <Link
                to={`/business?product=${product.slug}`}
                className="rounded-md border border-[#E4E7EC] px-5 py-3 text-center text-sm font-black text-[#0A0A0A] transition hover:border-[#0A0A0A]"
              >
                Request a Business Quote
              </Link>
              <button
                type="button"
                onClick={() => toggleProduct(product.id)}
                className="rounded-md border border-[#E4E7EC] px-5 py-3 text-sm font-black text-[#0A0A0A] transition hover:border-[#0A0A0A]"
              >
                {isComparing(product.id) ? "Remove from Compare" : "Compare Product"}
              </button>
            </div>
          </div>
        </div>

        {(productBody || documents.length > 0) && <div className={`mt-12 grid items-start gap-6 ${productBody && documents.length > 0 ? "lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]" : "grid-cols-1"}`}>
          {productBody && <section aria-labelledby="product-information" className="min-w-0 rounded-lg border border-[#E4E7EC] bg-[#F8F9FA] p-5 sm:p-7"><h2 id="product-information" className="text-2xl font-black text-[#0A0A0A]">{productBody.kind === "details" && productBody.paragraphs.length === 0 ? "Product details" : "About this product"}</h2>{productBody.paragraphs.length > 0 && <div className="mt-4 max-w-3xl space-y-4">{productBody.paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 24)}`} className="whitespace-pre-line text-base leading-7 text-[#3F4652]">{paragraph}</p>)}</div>}{productBody.kind === "details" && productBody.details.length > 0 && <dl className="mt-5 grid gap-x-8 sm:grid-cols-2">{productBody.details.map((detail, index) => <div key={`${detail.label}-${index}`} className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-3 border-t border-[#E4E7EC] py-3 first:border-t-0 sm:first:border-t"><dt className="text-sm font-semibold text-[#727986]">{detail.label}</dt><dd className="break-words text-sm font-bold text-[#0A0A0A]">{detail.value}</dd></div>)}</dl>}</section>}
          {documents.length > 0 && <section className={`rounded-lg border border-[#E4E7EC] bg-white p-5 ${productBody ? "lg:sticky lg:top-32" : "max-w-xl"}`} aria-labelledby="downloads"><h2 id="downloads" className="text-xl font-black text-[#0A0A0A]">Downloads</h2><div className="mt-4 space-y-3">{documents.map((document) => { const typeLabel = documentLabels[document.type]; return <a key={document.url} href={document.url} target="_blank" rel="noreferrer" aria-label={`Open ${typeLabel}: ${document.title} (PDF)`} className="group flex min-h-20 items-center gap-3 rounded-md border border-[#E4E7EC] bg-white p-3 transition hover:border-[#469D8B]"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[#F2F9F7] text-[#176B5C]"><FiFileText size={19} aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="block text-xs font-black uppercase text-[#727986]">{typeLabel} · PDF</span><span className="mt-1 block truncate text-sm font-black text-[#0A0A0A]">{document.title}</span></span><span className="inline-flex shrink-0 items-center gap-1 text-xs font-black text-[#176B5C]">Open<FiExternalLink aria-hidden="true" /></span></a>; })}</div></section>}
        </div>}

        <div className="mt-12 space-y-12">
          {keySpecifications.length > 0 && <section aria-labelledby="key-specifications"><h2 id="key-specifications" className="text-2xl font-black text-[#0A0A0A]">Key specifications</h2><dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{keySpecifications.map((spec, index) => <div key={`${spec.name}-${index}`} className="rounded-md border border-[#E4E7EC] bg-[#F6F7F9] p-4"><dt className="text-xs font-black uppercase tracking-[0.14em] text-[#727986]">{spec.name}</dt><dd className="mt-2 text-sm font-bold text-[#0A0A0A]">{spec.value}</dd></div>)}</dl></section>}
          {fullSpecifications.length > 0 && <section aria-labelledby="full-specifications">
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="full-specifications" className="text-2xl font-black text-[#0A0A0A]">Full technical specifications</h2>{fullSpecifications.length > 6 && <button type="button" aria-expanded={specificationsExpanded} onClick={() => setSpecificationsExpanded((value) => !value)} className="inline-flex items-center gap-2 text-sm font-black text-[#176B5C]">{specificationsExpanded ? "Show less" : "View all technical specifications"}<FiChevronDown className={specificationsExpanded ? "rotate-180" : ""} aria-hidden="true" /></button>}</div>
            {showAllSpecifications && <dl className="mt-5 divide-y divide-[#E4E7EC] border-y border-[#E4E7EC]">
              {fullSpecifications.map((spec, index) => (
                <div key={`${spec.name}-${index}`} className="grid gap-2 py-4 sm:grid-cols-[minmax(180px,0.7fr)_1.3fr]">
                  <dt className="text-sm font-black text-[#3F4652]">{spec.name}</dt>
                  <dd className="text-sm font-semibold text-[#0A0A0A]">{spec.value}</dd>
                </div>
              ))}
            </dl>}
          </section>}
        </div>

        {related.length > 0 && (
          <div className="mt-14 border-t border-[#E4E7EC] pt-12">
            <h2 className="text-2xl font-black text-[#0A0A0A]">Related products</h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <ProductCard
                  key={item.id}
                  product={item}
                  onAddToCart={addProduct}
                  onCompare={toggleProduct}
                  isCompared={isComparing(item.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ProductDetailLoading() {
  return <section className="bg-white px-4 py-10 sm:px-6 lg:px-8" aria-live="polite" aria-busy="true"><div className="mx-auto max-w-7xl"><span className="sr-only">Loading product...</span><div className="h-5 w-48 animate-pulse rounded bg-[#E4E7EC]" /><div className="mt-8 grid gap-10 lg:grid-cols-[0.95fr_1.05fr]"><div className="aspect-[5/4] animate-pulse rounded-md bg-[#F2F4F7]" /><div className="rounded-lg border border-[#E4E7EC] p-6"><div className="h-4 w-28 animate-pulse rounded bg-[#D0D5DD]" /><div className="mt-5 h-12 w-4/5 animate-pulse rounded bg-[#E4E7EC]" /><div className="mt-3 h-12 w-3/5 animate-pulse rounded bg-[#E4E7EC]" /><div className="mt-8 h-20 animate-pulse rounded bg-[#F2F4F7]" /><div className="mt-6 h-24 animate-pulse rounded bg-[#F2F4F7]" /></div></div></div></section>;
}

import { useMemo, useState } from "react";
import { ProductVisual } from "@/components/commerce/ProductVisual";
import { resolveProductImageUrl } from "@/lib/image-url";
import { normalizeProductImages } from "@/lib/product-media";
import type { Product } from "@/types/product";

export function ProductGallery({ product }: { product: Product }) {
  const images = useMemo(() => normalizeProductImages([
    ...[...(product.media ?? [])].sort((a, b) => a.displayOrder - b.displayOrder).map((item) => item.url),
    ...(product.images ?? []),
  ]).map(resolveProductImageUrl).filter((url): url is string => Boolean(url)), [product.images, product.media]);
  return <ProductGalleryViewer key={images.join("|")} product={product} images={images} />;
}

function ProductGalleryViewer({ product, images }: { product: Product; images: string[] }) {
  const [availableImages, setAvailableImages] = useState(images);
  const [selectedImage, setSelectedImage] = useState(images[0]);
  const altText = (url: string) => product.media?.find((item) => resolveProductImageUrl(item.url) === url)?.altText || product.name;

  const removeBrokenImage = (url: string) => {
    setAvailableImages((current) => {
      const next = current.filter((item) => item !== url);
      setSelectedImage((selected) => selected === url ? next[0] : selected);
      return next;
    });
  };

  if (!selectedImage) return <ProductVisual product={product} large />;

  return <div className="min-w-0" aria-label={`${product.name} product images`}>
    <div className="relative aspect-[5/4] overflow-hidden rounded-md border border-[#E4E7EC] bg-[#F6F7F9] p-5 sm:p-8">
      <img src={selectedImage} alt={altText(selectedImage)} onError={() => removeBrokenImage(selectedImage)} className="h-full w-full object-contain" />
    </div>
    {availableImages.length > 1 && <div className="mt-3 flex max-w-full gap-2 overflow-x-auto pb-2" role="list" aria-label="Choose a product image">
      {availableImages.map((url, index) => <button key={url} type="button" role="listitem" aria-label={`View ${product.name} image ${index + 1}${url === selectedImage ? ", currently selected" : ""}`} aria-pressed={url === selectedImage} aria-current={url === selectedImage ? "true" : undefined} onClick={() => setSelectedImage(url)} className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-md border bg-white p-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tek-accent)] focus-visible:ring-offset-2 ${url === selectedImage ? "border-[#176B5C] ring-2 ring-[#176B5C]" : "border-[#E4E7EC]"}`}>
        <img src={url} alt="" loading="lazy" onError={() => removeBrokenImage(url)} className="h-full w-full object-contain" />
        {url === selectedImage && <span className="sr-only">Selected image</span>}
      </button>)}
    </div>}
  </div>;
}

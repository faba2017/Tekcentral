export const MAX_PRODUCT_IMAGES = 8;
export interface PublicProductImage { id: string; url: string; altText: string; isPrimary: boolean; displayOrder: number; }
const normalizeUrl = (value: string) => value.trim();
export function normalizeProductImages(images: string[]) { return [...new Set(images.map(normalizeUrl).filter((value) => value.startsWith("https://") || value.startsWith("/api/public/assets/products/")))].slice(0, MAX_PRODUCT_IMAGES); }
export function publicProductMedia(productName: string, images: string[], existing: PublicProductImage[] = []) {
  return normalizeProductImages(images).map((url, displayOrder) => { const prior = existing.find((item) => item.url === url); return { id: prior?.id ?? `image-${displayOrder + 1}-${url.split("/").at(-1)}`, url, altText: prior?.altText?.trim() || `${productName}${displayOrder ? ` — view ${displayOrder + 1}` : ""}`, isPrimary: displayOrder === 0, displayOrder }; });
}
export function moveProductImage(images: string[], from: number, to: number) { const next = normalizeProductImages(images); if (from < 0 || from >= next.length || to < 0 || to >= next.length) return next; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; }

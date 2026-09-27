import type { PublicProductSnapshot } from "./productPublicationRepository.js";

const text = (value?: string) => value?.trim() ?? "";
export function normalizedPublicSnapshot(snapshot: PublicProductSnapshot) {
  return {
    id: text(snapshot.id), slug: text(snapshot.slug), sku: text(snapshot.sku), name: text(snapshot.name), brand: text(snapshot.brand), model: text(snapshot.model),
    category: text(snapshot.category), categorySlug: text(snapshot.categorySlug), subcategory: text(snapshot.subcategory), price: snapshot.price, currency: snapshot.currency,
    shortDescription: text(snapshot.shortDescription), description: text(snapshot.description), images: snapshot.images.map(text),
    specifications: snapshot.specifications.map((item) => ({ name: text(item.name), value: text(item.value) })).filter((item) => item.name || item.value).sort((a, b) => `${a.name}\0${a.value}`.localeCompare(`${b.name}\0${b.value}`)),
    seoTitle: text(snapshot.seoTitle), seoDescription: text(snapshot.seoDescription), deliveryDisplay: text(snapshot.deliveryDisplay), vatRate: snapshot.vatRate,
    availabilityDisplay: text(snapshot.availabilityDisplay), stockPolicySnapshot: snapshot.stockPolicySnapshot,
  };
}
export function hasMaterialPublicChanges(current: PublicProductSnapshot, active: PublicProductSnapshot) {
  return JSON.stringify(normalizedPublicSnapshot(current)) !== JSON.stringify(normalizedPublicSnapshot(active));
}

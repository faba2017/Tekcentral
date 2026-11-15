import type { PublicProductSnapshot } from "./productPublicationRepository.js";

const text = (value?: string) => value?.trim() ?? "";
export function normalizedPublicSnapshot(snapshot: PublicProductSnapshot) {
  return {
    id: text(snapshot.id), slug: text(snapshot.slug), sku: text(snapshot.sku), name: text(snapshot.name), brand: text(snapshot.brand), model: text(snapshot.model),
    category: text(snapshot.category), categorySlug: text(snapshot.categorySlug), subcategory: text(snapshot.subcategory), price: snapshot.price, currency: snapshot.currency,
    shortDescription: text(snapshot.shortDescription), description: text(snapshot.description), overview: text(snapshot.overview), images: snapshot.images.map(text),
    specifications: snapshot.specifications.map((item) => ({ name: text(item.name), value: text(item.value), group: text(item.group), isKey: Boolean(item.isKey), source: item.source, sourceUrl: text(item.sourceUrl), capturedAt: text(item.capturedAt), approvedAt: text(item.approvedAt), contentFingerprint: text(item.contentFingerprint), origin: item.origin })).filter((item) => item.name || item.value).sort((a, b) => `${a.name}\0${a.value}`.localeCompare(`${b.name}\0${b.value}`)),
    documents: (snapshot.documents ?? []).map((item) => ({ type: item.type, title: text(item.title), url: text(item.url), verified: item.verified, source: item.source, sourceUrl: text(item.sourceUrl), capturedAt: text(item.capturedAt), approvedAt: text(item.approvedAt), contentFingerprint: text(item.contentFingerprint), origin: item.origin, filename: text(item.filename), mimeType: item.mimeType, size: item.size, uploadedAt: text(item.uploadedAt), actor: text(item.actor) })).filter((item) => item.title && item.url).sort((a, b) => `${a.type}\0${a.title}\0${a.url}`.localeCompare(`${b.type}\0${b.title}\0${b.url}`)),
    seoTitle: text(snapshot.seoTitle), seoDescription: text(snapshot.seoDescription), deliveryDisplay: text(snapshot.deliveryDisplay), vatRate: snapshot.vatRate,
    availabilityDisplay: text(snapshot.availabilityDisplay), stockPolicySnapshot: snapshot.stockPolicySnapshot,
  };
}
export function hasMaterialPublicChanges(current: PublicProductSnapshot, active: PublicProductSnapshot) {
  return JSON.stringify(normalizedPublicSnapshot(current)) !== JSON.stringify(normalizedPublicSnapshot(active));
}

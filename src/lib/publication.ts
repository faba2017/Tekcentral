interface PublicationDraftForEligibility {
  name: string;
  slug: string;
  brand: string;
  category: string;
  categorySlug: string;
  images: string[];
}

export function clientPublicationBlockers(input: { draft: PublicationDraftForEligibility; backendBlockers: string[] }) {
  const blockers = input.backendBlockers.filter((blocker) => blocker !== "TekCentral-controlled primary image is missing.");
  if (!input.draft.name.trim()) blockers.push("Public title is required.");
  if (!input.draft.slug.trim()) blockers.push("Public slug is required.");
  if (!input.draft.brand.trim()) blockers.push("Brand is required.");
  if (!input.draft.category.trim() || !input.draft.categorySlug.trim()) blockers.push("Public category and category slug are required.");
  if (!input.draft.images[0]?.startsWith("/api/public/assets/products/")) blockers.push("TekCentral-controlled primary image is missing.");
  return [...new Set(blockers)];
}

const normalizedText = (value?: string) => value?.trim() ?? "";
export function hasMaterialPublicationChanges(current: Record<string, unknown>, active: Record<string, unknown>) {
  const normalize = (snapshot: Record<string, unknown>) => ({
    id: normalizedText(snapshot.id as string), slug: normalizedText(snapshot.slug as string), sku: normalizedText(snapshot.sku as string), name: normalizedText(snapshot.name as string), brand: normalizedText(snapshot.brand as string), model: normalizedText(snapshot.model as string), category: normalizedText(snapshot.category as string), categorySlug: normalizedText(snapshot.categorySlug as string), subcategory: normalizedText(snapshot.subcategory as string),
    price: snapshot.price, currency: snapshot.currency, shortDescription: normalizedText(snapshot.shortDescription as string), description: normalizedText(snapshot.description as string),
    images: ((snapshot.images as string[] | undefined) ?? []).map(normalizedText),
    specifications: ((snapshot.specifications as { name: string; value: string }[] | undefined) ?? []).map((item) => ({ name: normalizedText(item.name), value: normalizedText(item.value) })).filter((item) => item.name || item.value).sort((a, b) => `${a.name}\0${a.value}`.localeCompare(`${b.name}\0${b.value}`)),
    seoTitle: normalizedText(snapshot.seoTitle as string), seoDescription: normalizedText(snapshot.seoDescription as string), deliveryDisplay: normalizedText(snapshot.deliveryDisplay as string), vatRate: snapshot.vatRate, availabilityDisplay: normalizedText(snapshot.availabilityDisplay as string), stockPolicySnapshot: snapshot.stockPolicySnapshot,
  });
  return JSON.stringify(normalize(current)) !== JSON.stringify(normalize(active));
}

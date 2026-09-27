import type { InternalProduct } from "./internalProductRepository.js";
import type { PublicProductSnapshot } from "./productPublicationRepository.js";

export type PublicationContentOrigin = "AUTO_DEFAULT" | "SOURCE_DERIVED" | "STAFF_EDITED";
export type PublicationContentOrigins = Partial<Record<"shortDescription" | "description" | "seoTitle" | "seoDescription" | "deliveryDisplay", PublicationContentOrigin>>;
const compact = (value: string) => value.replace(/\s+/g, " ").trim();
const identity = (value: string) => compact(value).toLowerCase().replace(/wi[\s-]?fi/g, "wifi").replace(/[^a-z0-9]+/g, " ").trim();
const meaningful = (value: string | undefined, title: string) => Boolean(value && identity(value) !== identity(title) && identity(value).split(" ").length >= 4);
const trimAtWord = (value: string, limit: number) => value.length <= limit ? value : `${value.slice(0, limit - 1).replace(/\s+\S*$/, "").trim()}…`;
export const defaultSeoTitle = (title: string) => trimAtWord(`${compact(title)} | TekCentral`, 60);

export function preparePublicationContentDefaults(input: { product: InternalProduct; draft: PublicProductSnapshot; origins?: PublicationContentOrigins }) {
  const draft = { ...input.draft }; const origins: PublicationContentOrigins = { ...input.origins };
  const sourceDescription = compact(input.product.provenance.sourceDescription || input.product.description || "");
  const safeCategory = compact(input.product.subcategory || input.product.category).toLowerCase();
  const fallbackShort = `${input.product.brand} ${safeCategory} technology for home, work and business.`;
  const fallbackLong = `${input.product.name} is part of TekCentral's ${input.product.category} range for home, work and business.`;
  const assign = (field: keyof PublicationContentOrigins, value: string, origin: PublicationContentOrigin) => {
    if (origins[field] === "STAFF_EDITED") return;
    if (!String(draft[field] ?? "").trim() || ((field === "shortDescription" || field === "description") && identity(String(draft[field])) === identity(draft.name))) {
      Object.assign(draft, { [field]: value }); origins[field] = origin;
    }
  };
  assign("shortDescription", meaningful(sourceDescription, draft.name) ? sourceDescription : fallbackShort, meaningful(sourceDescription, draft.name) ? "SOURCE_DERIVED" : "AUTO_DEFAULT");
  assign("description", meaningful(sourceDescription, draft.name) ? sourceDescription : fallbackLong, meaningful(sourceDescription, draft.name) ? "SOURCE_DERIVED" : "AUTO_DEFAULT");
  assign("seoTitle", defaultSeoTitle(draft.name), "AUTO_DEFAULT");
  assign("seoDescription", trimAtWord(`Shop ${draft.name} from TekCentral. ${draft.category}${draft.subcategory ? ` and ${draft.subcategory}` : ""} technology for home, work and business.`, 160), "AUTO_DEFAULT");
  assign("deliveryDisplay", "Delivery calculated at checkout based on your delivery address.", "AUTO_DEFAULT");
  return { draft, origins };
}

import type { Product } from "../../../src/types/product.js";
import { categories } from "../../../src/data/catalogue.js";
import { getAdminProductById, listAdminProducts, saveInternalProduct } from "../../internalProductRepository.js";
import { listSupplierProductMappings, saveSupplierProductMapping } from "../../supplierProductMappingRepository.js";
import { getScoopCatalogueProduct } from "./scoopCatalogueRepository.js";
import type { ScoopCatalogueProduct } from "./scoopTypes.js";

export type MappingConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";
const genericTerms = new Set(["network", "wireless", "bracket", "switch", "device", "product", "system"]);
const categoryRules = [
  { slug: "networking", terms: ["access point", "router", "network", "switch", "ethernet", "wifi", "wi-fi", "poe", "fibre"] },
  { slug: "security", terms: ["camera", "cctv", "nvr", "security", "access control"] },
  { slug: "power", terms: ["ups", "inverter", "surge", "power supply"] },
  { slug: "printing-office", terms: ["printer", "scanner", "projector", "pos"] },
  { slug: "computers", terms: ["laptop", "desktop", "monitor", "dock", "mini pc"] },
  { slug: "accessories", terms: ["cable", "adapter", "keyboard", "mouse", "headset", "webcam", "charger", "storage"] },
  { slug: "smart-tech", terms: ["sensor", "iot", "automation", "smart"] },
];

const normalize = (value: string) => value.toLowerCase().replace(/wi[ -]?fi/g, "wifi").replace(/[^a-z0-9]+/g, " ").trim();
const tokens = (value: string) => [...new Set(normalize(value).split(" ").filter((token) => token.length > 2 && !genericTerms.has(token)))];
const titleCaseWifi = (value: string) => value.replace(/\bwi[ -]?fi\b/gi, "Wi-Fi").replace(/\s+/g, " ").trim();
const slugify = (value: string) => normalize(value).replace(/\s+/g, "-");

export function scoreScoopProductMatch(offer: ScoopCatalogueProduct, product: Pick<Product, "sku" | "name" | "brand" | "model" | "category">) {
  const offerText = normalize(`${offer.description} ${offer.supplierSku}`);
  const productText = normalize(`${product.name} ${product.model ?? ""} ${product.sku ?? ""}`);
  const exactSku = Boolean(product.sku && normalize(product.sku) === normalize(offer.supplierSku));
  const model = Boolean(product.model && offerText.includes(normalize(product.model)));
  const manufacturer = Boolean(offer.manufacturer && normalize(product.brand) === normalize(offer.manufacturer));
  const overlap = tokens(productText).filter((token) => tokens(offerText).includes(token));
  const categoryMatch = categoryRules.some((rule) => normalize(product.category).includes(rule.slug.replace("-", " ")) && rule.terms.some((term) => offerText.includes(normalize(term))));
  const score = Math.min(1, (exactSku ? 0.65 : 0) + (model ? 0.35 : 0) + (manufacturer ? 0.25 : 0) + (categoryMatch ? 0.15 : 0) + Math.min(overlap.length * 0.08, 0.24));
  const confidenceLevel: MappingConfidenceLevel = (exactSku && manufacturer) || (model && manufacturer && overlap.length >= 1) ? "HIGH" : manufacturer && (model || categoryMatch) && overlap.length >= 1 ? "MEDIUM" : "LOW";
  const evidence = [exactSku && "Exact SKU match", model && "Model identity overlap", manufacturer && "Manufacturer match", categoryMatch && "Product type/category match", overlap.length > 0 && `Strong title terms: ${overlap.join(", ")}`].filter((value): value is string => Boolean(value));
  return { confidence: score, confidenceLevel, evidence: evidence.length ? evidence : ["No strong identity evidence"] };
}

export function suggestScoopCategory(offer: ScoopCatalogueProduct) {
  const text = normalize(`${offer.description} ${offer.manufacturer ?? ""}`);
  const rule = categoryRules.find((candidate) => candidate.terms.some((term) => text.includes(normalize(term))));
  return categories.find((category) => category.slug === rule?.slug) ?? categories.find((category) => category.slug === "accessories")!;
}

export function suggestScoopProductTitles(offer: ScoopCatalogueProduct) {
  const manufacturer = titleCaseWifi(offer.manufacturer?.trim() ?? "");
  const source = titleCaseWifi(offer.description).replace(new RegExp(`^${manufacturer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), "").trim();
  const full = [manufacturer, source].filter(Boolean).join(" ");
  const shortSource = source.replace(/\bUISP\b/gi, "").replace(/\bWi-Fi\b/gi, "").replace(/\s+/g, " ").trim();
  return [...new Set([full, [manufacturer, shortSource].filter(Boolean).join(" "), `${full} (${offer.supplierSku})`].map(titleCaseWifi).filter((title) => title && !/tekcentral/i.test(title)))].slice(0, 3);
}

export async function getScoopProductCreationPreview(supplierSku: string) {
  const offer = await getScoopCatalogueProduct(supplierSku); if (!offer) return undefined;
  const category = suggestScoopCategory(offer);
  const matches = (await listAdminProducts()).map((product) => ({ product: { id: product.id, name: product.name, sku: product.sku, brand: product.brand, model: product.model, category: product.category }, ...scoreScoopProductMatch(offer, product) })).sort((a, b) => b.confidence - a.confidence).slice(0, 12);
  return { offer, titleSuggestions: suggestScoopProductTitles(offer), categorySuggestion: { slug: category.slug, name: category.name, subcategories: category.subcategories }, categories: categories.map(({ slug, name, subcategories }) => ({ slug, name, subcategories })), matches };
}

export async function createTekCentralProductFromScoop(input: { supplierSku: string; name: string; categorySlug: string; subcategory?: string; confirmed: boolean }) {
  if (!input.confirmed) throw new Error("PRODUCT_CREATION_CONFIRMATION_REQUIRED");
  const offer = await getScoopCatalogueProduct(input.supplierSku); if (!offer) throw new Error("SCOOP_PRODUCT_NOT_FOUND");
  if ((await listSupplierProductMappings()).some((mapping) => mapping.supplierCode === "SCOOP" && mapping.supplierSku === offer.supplierSku && mapping.status === "VERIFIED")) throw new Error("SCOOP_OFFER_ALREADY_VERIFIED");
  const name = titleCaseWifi(input.name); if (!name || /tekcentral/i.test(name)) throw new Error("INVALID_PRODUCT_NAME");
  const category = categories.find((item) => item.slug === input.categorySlug); if (!category) throw new Error("CATEGORY_CONFIRMATION_REQUIRED");
  if (input.subcategory && !category.subcategories.includes(input.subcategory)) throw new Error("INVALID_SUBCATEGORY");
  const manufacturer = offer.manufacturer?.trim() || "Manufacturer pending review";
  const now = new Date().toISOString();
  const product = await saveInternalProduct({ slug: slugify(name), sku: `TC-${offer.supplierSku.replace(/[^a-z0-9]/gi, "-").toUpperCase()}`, name, brand: manufacturer, category: category.name, categorySlug: category.slug, subcategory: input.subcategory, shortDescription: titleCaseWifi(offer.description), description: titleCaseWifi(offer.description), images: offer.imageUrl ? [offer.imageUrl] : [], publicationStatus: "INTERNAL_DRAFT", provenance: { createdFromSupplierOffer: true, sourceSupplier: "SCOOP", sourceSupplierOfferId: `SCOOP:${offer.supplierSku}`, sourceSupplierSku: offer.supplierSku, sourceDescription: offer.description, manufacturer: offer.manufacturer, sourceImage: offer.imageUrl ? { source: "SCOOP", originalUrl: offer.imageUrl, capturedAt: now } : undefined } });
  const mapping = await saveSupplierProductMapping({ productId: product.id, supplierCode: "SCOOP", supplierSku: offer.supplierSku, supplierOfferId: `SCOOP:${offer.supplierSku}`, supplierProductId: offer.supplierSku, supplierProductSku: offer.supplierSku, status: "VERIFIED", confidence: 1, confidenceLevel: "HIGH", matchMethod: "STAFF_CONFIRMED_PRODUCT_CREATION", evidence: ["Created from exact Scoop SupplierOffer", `Scoop SKU ${offer.supplierSku}`, offer.manufacturer ? `Manufacturer ${offer.manufacturer}` : "Manufacturer pending review"], verifiedBy: "TekCentral Staff", verifiedAt: now, source: "SCOOP_PRODUCT_CREATION" });
  return { product, mapping };
}

export async function scoreSelectedScoopMapping(supplierSku: string, productId: string) {
  const offer = await getScoopCatalogueProduct(supplierSku); const product = await getAdminProductById(productId);
  if (!offer || !product) return undefined;
  return scoreScoopProductMatch(offer, product);
}

export function requireWeakMappingConfirmation(confidenceLevel: MappingConfidenceLevel | undefined, confirmed: boolean) {
  if (confidenceLevel === "LOW" && !confirmed) throw new Error("WEAK_MAPPING_CONFIRMATION_REQUIRED");
}

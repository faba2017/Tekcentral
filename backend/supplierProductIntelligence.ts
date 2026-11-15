import type { SupplierCode, SupplierProductMapping } from "./types.js";
import type { InternalProduct } from "./internalProductRepository.js";
import { listAdminProducts } from "./internalProductRepository.js";
import { listSupplierProductMappings } from "./supplierProductMappingRepository.js";

type AdminProduct = Awaited<ReturnType<typeof listAdminProducts>>[number];
export type ProductMatchConfidence = "EXACT" | "HIGH" | "MEDIUM" | "LOW";
export interface SupplierIdentityEvidence {
  supplierCode: SupplierCode;
  supplierSku: string;
  supplierProductId?: string;
  supplierVariantId?: string;
  title?: string;
  brand?: string;
  model?: string;
  manufacturerPartNumber?: string;
  gtin?: string;
  ean?: string;
  upc?: string;
  productTypeId?: string;
}
export interface ProductMatchCandidate {
  product: { id: string; sku?: string; name: string; brand: string; model?: string; manufacturerPartNumber?: string };
  confidence: ProductMatchConfidence;
  score: number;
  evidence: string[];
  automaticMappingAllowed: boolean;
}
export interface ProductIdentitySuggestion { sourceTitle: string; suggestedTitle: string; suggestedBrand?: string; model?: string; rulesApplied: string[]; }

export const normalizeIdentityValue = (value?: string) => value?.normalize("NFKC").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() ?? "";
const compactIdentity = (value?: string) => normalizeIdentityValue(value).replace(/\s+/g, "");
const canonicalBrand = (source: string | undefined, products: AdminProduct[]) => {
  const normalized = normalizeIdentityValue(source).replace(/\b(networks?|technologies|technology|inc|ltd|pty)\b/g, "").trim();
  if (!normalized) return source?.trim();
  const existing = products.map((item) => item.brand).find((brand) => normalizeIdentityValue(brand).replace(/\b(networks?|technologies|technology|inc|ltd|pty)\b/g, "").trim() === normalized);
  return existing ?? source?.trim().replace(/\s+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export function suggestCanonicalProductIdentity(input: SupplierIdentityEvidence, products: AdminProduct[] = []): ProductIdentitySuggestion {
  const sourceTitle = input.title?.trim() || input.supplierSku;
  const brand = canonicalBrand(input.brand, products);
  const rulesApplied: string[] = [];
  let title = sourceTitle.normalize("NFKC").replace(/[_\s]+/g, " ").replace(/([!?.;,])\1+/g, "$1").trim();
  if (title !== sourceTitle) rulesApplied.push("Normalized whitespace and repeated punctuation.");
  if (brand) {
    const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const repeated = new RegExp(`^(?:${escaped}\\s+){2,}`, "i");
    if (repeated.test(title)) { title = title.replace(repeated, `${brand} `); rulesApplied.push("Removed a repeated brand prefix."); }
    else if (normalizeIdentityValue(input.brand) && title.toUpperCase() === title && /[A-Z]/.test(title)) { title = title.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); rulesApplied.push("Normalized excessive uppercase while preserving identifiers."); }
  }
  const model = input.model?.trim() || input.manufacturerPartNumber?.trim();
  if (model && !compactIdentity(title).includes(compactIdentity(model))) { title = `${title} ${model}`.trim(); rulesApplied.push("Preserved the source model identifier."); }
  return { sourceTitle, suggestedTitle: title, suggestedBrand: brand, model, rulesApplied };
}

function productIdentifiers(product: AdminProduct | InternalProduct) {
  return {
    brand: normalizeIdentityValue(product.brand), model: compactIdentity(product.model),
    mpn: compactIdentity("manufacturerPartNumber" in product ? product.manufacturerPartNumber : undefined),
    gtin: compactIdentity("gtin" in product ? product.gtin : undefined), ean: compactIdentity("ean" in product ? product.ean : undefined), upc: compactIdentity("upc" in product ? product.upc : undefined),
    title: normalizeIdentityValue(product.name), type: "productTypeId" in product ? product.productTypeId : undefined,
  };
}

export async function findCanonicalProductCandidates(input: SupplierIdentityEvidence, dependencies?: { products?: AdminProduct[]; mappings?: SupplierProductMapping[] }) {
  const [products, mappings] = await Promise.all([dependencies?.products ?? listAdminProducts(), dependencies?.mappings ?? listSupplierProductMappings()]);
  const exactHistory = mappings.filter((mapping) => mapping.status === "VERIFIED" && mapping.supplierCode === input.supplierCode && [mapping.supplierSku, mapping.supplierProductId, mapping.supplierVariantId].filter(Boolean).some((value) => compactIdentity(value) === compactIdentity(input.supplierSku) || compactIdentity(value) === compactIdentity(input.supplierProductId) || compactIdentity(value) === compactIdentity(input.supplierVariantId)));
  const inputBrand = normalizeIdentityValue(input.brand).replace(/\bnetworks?\b/g, "").trim();
  const inputMpn = compactIdentity(input.manufacturerPartNumber); const inputModel = compactIdentity(input.model);
  const sourceCodes = [input.gtin, input.ean, input.upc].map(compactIdentity).filter(Boolean);
  const candidates = products.map((product): ProductMatchCandidate | undefined => {
    const ids = productIdentifiers(product); const evidence: string[] = []; let score = 0; let authoritative = false;
    if (exactHistory.some((mapping) => mapping.productId === product.id)) { score = 100; authoritative = true; evidence.push("Existing verified supplier identity maps to this Product."); }
    if (sourceCodes.length && sourceCodes.some((code) => [ids.gtin, ids.ean, ids.upc].includes(code))) { score = Math.max(score, 100); authoritative = true; evidence.push("Exact GTIN/EAN/UPC match."); }
    if (inputMpn && ids.mpn === inputMpn && inputBrand && ids.brand.replace(/\bnetworks?\b/g, "").trim() === inputBrand) { score = Math.max(score, 100); authoritative = true; evidence.push("Exact manufacturer part number and brand match."); }
    if (inputModel && ids.model === inputModel && inputBrand && ids.brand.replace(/\bnetworks?\b/g, "").trim() === inputBrand) { score = Math.max(score, 88); evidence.push("Exact model and brand match."); }
    const sourceTitle = normalizeIdentityValue(input.title); if (sourceTitle && ids.title === sourceTitle) { score = Math.max(score, inputBrand && ids.brand.includes(inputBrand) ? 78 : 55); evidence.push("Normalized source title matches."); }
    if (input.productTypeId && ids.type === input.productTypeId && score) { score += 3; evidence.push("Canonical Product type is compatible."); }
    if (!score) return undefined;
    const confidence: ProductMatchConfidence = score >= 100 ? "EXACT" : score >= 85 ? "HIGH" : score >= 65 ? "MEDIUM" : "LOW";
    return { product: { id: product.id, sku: product.sku, name: product.name, brand: product.brand, model: product.model, manufacturerPartNumber: "manufacturerPartNumber" in product ? product.manufacturerPartNumber : undefined }, confidence, score: Math.min(100, score), evidence, automaticMappingAllowed: authoritative };
  }).filter((item): item is ProductMatchCandidate => Boolean(item)).sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name));
  return candidates;
}

export function requiresDuplicateOverride(candidates: ProductMatchCandidate[]) { return candidates.some((candidate) => candidate.confidence === "EXACT" || candidate.confidence === "HIGH"); }

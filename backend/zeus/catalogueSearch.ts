import { listPublicProducts } from "../productPublicationRepository.js";
import { canonicalTaxonomyPath, getCanonicalTaxonomyTree } from "../canonicalTaxonomyService.js";
import type { ZeusProductMatch, ZeusPublicProduct } from "./types.js";

export type ZeusResultIntent = "DISCOVER" | "COMPARE" | "CHEAPEST" | "ACCESSORIES";
export interface ZeusProductSearchIntent {
  query: string; correctedQuery: string; brand?: string; categoryId?: string; subcategoryId?: string;
  budgetMin?: number; budgetMax?: number; useCase?: string; specFilters: string[];
  requiredTerms: string[]; optionalTerms: string[]; excludedTerms: string[]; resultIntent: ZeusResultIntent;
  corrections: { from: string; to: string }[];
}

const corrections: Readonly<Record<string, string>> = { mikrotic: "MikroTik", ubiquity: "Ubiquiti", ugren: "UGREEN", "tp link": "TP-Link", wirless: "wireless", "acess piont": "access point", "acess point": "access point", piont: "point", etherent: "ethernet", laptob: "laptop", swich: "switch" };
const correctedBrands = new Set(["MikroTik", "Ubiquiti", "UGREEN", "TP-Link"]);
const synonyms: Readonly<Record<string, string>> = { wifi: "wireless", "wi-fi": "wireless", "network cable": "ethernet cable", "lan cable": "ethernet cable", notebook: "laptop", screen: "monitor", ups: "uninterruptible power supply" };
const stopWords = new Set(["a", "an", "and", "anything", "do", "for", "from", "i", "in", "is", "it", "me", "my", "of", "one", "option", "please", "prefer", "product", "sell", "show", "something", "the", "this", "to", "under", "with", "you"]);
const normalize = (value: string) => value.toLowerCase().replace(/[–—]/g, "-").replace(/[^a-z0-9+.-]+/g, " ").replace(/\s+/g, " ").trim();
const words = (value: string) => normalize(value).split(" ").filter((term) => term.length > 1 && !stopWords.has(term) && !/^r?\d/.test(term));
const moneyValue = (value: string) => Number(value.replace(/[r,\s]/gi, "").replace(/k$/i, "000"));

function budget(query: string) {
  const normalized = query.toLowerCase();
  const range = normalized.match(/r?\s*([\d,.]+k?)\s*(?:to|-|and)\s*r?\s*([\d,.]+k?)/i);
  if (range) return { budgetMin: moneyValue(range[1]), budgetMax: moneyValue(range[2]) };
  const maximum = normalized.match(/(?:under|below|less than|up to|not more than|budget(?: of)?)\s*r?\s*([\d,.]+k?)/i);
  if (maximum) return { budgetMax: moneyValue(maximum[1]) };
  const around = normalized.match(/around\s*r?\s*([\d,.]+k?)/i);
  if (around) { const value = moneyValue(around[1]); return { budgetMin: Math.max(0, value * 0.85), budgetMax: value * 1.15 }; }
  return {};
}

async function taxonomyIntent(query: string) {
  const value = normalize(query);
  const productTaxonomy = await getCanonicalTaxonomyTree();
  const candidates = productTaxonomy.flatMap((category) => [
    { category, subcategory: undefined, text: normalize(`${category.name} ${category.slug}`) },
    ...category.children.flatMap((subcategory) => [{ category, subcategory, text: normalize(`${subcategory.name} ${subcategory.slug}`) }, ...(subcategory.productTypes ?? []).map((type) => ({ category, subcategory, text: normalize(`${type.name} ${type.slug}`) }))]),
  ]).sort((a, b) => b.text.length - a.text.length);
  const direct = candidates.find((item) => value.includes(item.text));
  if (direct) return { categoryId: direct.category.id, subcategoryId: direct.subcategory?.id };
  const known=(categoryId:string,subcategoryId:string)=>productTaxonomy.some((category)=>category.id===categoryId&&category.children.some((subcategory)=>subcategory.id===subcategoryId))?{categoryId,subcategoryId}:{};
  if (/\brouter\b|mesh/.test(value)) return known("CAT_NETWORKING", "SUB_ROUTERS_MESH");
  if (/access point|ceiling.*wireless|wireless.*ceiling/.test(value)) return known("CAT_NETWORKING", "SUB_ACCESS_POINTS");
  if (/\bswitch\b/.test(value)) return known("CAT_NETWORKING", "SUB_SWITCHES");
  if (/ethernet cable|network cable|lan cable|cat ?[56]/.test(value)) return known("CAT_CABLES_CONNECTIVITY", "SUB_NETWORK_CABLES");
  if (/\blaptop\b|notebook/.test(value)) return known("CAT_COMPUTERS", "SUB_LAPTOPS");
  if (/\bmonitor\b|\bscreen\b/.test(value)) return known("CAT_PERIPHERALS_ACCESSORIES", "SUB_MONITORS");
  if (/\bups\b|uninterruptible/.test(value)) return known("CAT_POWER_BACKUP", "SUB_UPS");
  return {};
}

const knownUseCases = ["small office", "home use", "working from home", "business network", "call centre", "gaming", "cctv", "travelling"];
const specPatterns = [/\b\d+\s*-?port\b/i, /\bpoe\+?\b/i, /\bgigabit\b/i, /\bwi-?fi\s*6\b/i, /\bdual[- ]band\b/i, /\b\d+\s*gb\s*(?:ram)?\b/i, /\b\d+\s*tb\s*ssd\b/i, /\busb[- ]?c\b/i, /\b\d+\s*(?:inch|")\b/i];

export async function interpretProductSearch(input: Partial<ZeusProductSearchIntent> & { query?: string; brand?: string; category?: string; subcategory?: string; budgetMin?: number; budgetMax?: number; budget?: number; intendedUse?: string; specFilters?: string[]; requiredTerms?: string[]; optionalTerms?: string[]; excludedTerms?: string[]; resultIntent?: ZeusResultIntent }): Promise<ZeusProductSearchIntent> {
  const original = input.query?.trim() ?? ""; let correctedQuery = original; const applied: { from: string; to: string }[] = [];
  for (const [from, to] of Object.entries(corrections)) { const pattern = new RegExp(`\\b${from.replace(" ", "\\s+")}\\b`, "i"); if (pattern.test(correctedQuery)) { correctedQuery = correctedQuery.replace(pattern, to); applied.push({ from, to }); } }
  for (const [from, to] of Object.entries(synonyms)) correctedQuery = correctedQuery.replace(new RegExp(`\\b${from.replace("-", "[- ]?").replace(" ", "\\s+")}\\b`, "gi"), to);
  const products = await listPublicProducts(); const brands = [...new Set(products.map((item) => item.brand).filter(Boolean))]; const correctedBrand = applied.map((item) => item.to).find((item) => correctedBrands.has(item)); const requestedBrand = input.brand ?? brands.find((brand) => normalize(correctedQuery).includes(normalize(brand))) ?? correctedBrand; const brand = requestedBrand ? brands.find((item) => normalize(item) === normalize(requestedBrand)) ?? correctedBrand : undefined;
  const taxonomy=await getCanonicalTaxonomyTree(); const derivedTaxonomy = await taxonomyIntent(correctedQuery);
  const categoryInput = input.category;
  const requestedCategory = categoryInput ? taxonomy.find((item)=>item.id===categoryInput||item.slug===categoryInput||item.name.toLowerCase()===categoryInput.toLowerCase()) : undefined;
  const category = requestedCategory ?? taxonomy.find((item)=>item.id===derivedTaxonomy.categoryId);
  const subcategoryInput = input.subcategory;
  const requestedSubcategory = subcategoryInput ? category?.children.find((item)=>item.id===subcategoryInput||item.slug===subcategoryInput||item.name.toLowerCase()===subcategoryInput.toLowerCase()) : undefined;
  const subcategory = requestedSubcategory ?? category?.children.find((item)=>item.id===derivedTaxonomy.subcategoryId);
  const budgets = budget(correctedQuery); const useCase = input.intendedUse ?? input.useCase ?? knownUseCases.find((item) => normalize(correctedQuery).includes(item));
  const specs = [...new Set([...(input.specFilters ?? []), ...specPatterns.flatMap((pattern) => correctedQuery.match(pattern)?.[0] ?? [])].map(normalize).filter(Boolean))];
  const queryTerms = words(correctedQuery).filter((term) => !brand || !normalize(brand).split(" ").includes(term));
  return { query: original, correctedQuery, brand, categoryId: category?.id, subcategoryId: subcategory?.id, budgetMin: input.budgetMin ?? budgets.budgetMin, budgetMax: input.budgetMax ?? input.budget ?? budgets.budgetMax, useCase, specFilters: specs, requiredTerms: [...new Set(input.requiredTerms?.map(normalize) ?? [])], optionalTerms: [...new Set([...(input.optionalTerms?.map(normalize) ?? []), ...queryTerms])], excludedTerms: [...new Set(input.excludedTerms?.map(normalize) ?? [])], resultIntent: input.resultIntent ?? (/cheapest|cheaper/.test(normalize(correctedQuery)) ? "CHEAPEST" : /\baccessor(?:y|ies)\b/.test(normalize(correctedQuery)) ? "ACCESSORIES" : /compare/.test(normalize(correctedQuery)) ? "COMPARE" : "DISCOVER"), corrections: applied };
}

type PublicProduct = Awaited<ReturnType<typeof listPublicProducts>>[number];
const publicProduct = (product: PublicProduct): ZeusPublicProduct => ({ id: product.id, slug: product.slug, name: product.name, brand: product.brand, category: product.category, price: product.price, currency: product.currency, shortDescription: product.shortDescription, image: product.images[0], specifications: product.specifications.slice(0, 12).map(({ name, value }) => ({ name, value })), availability: { state: product.availability.state, label: product.availability.label, purchasable: product.availability.purchasable }, url: `/product/${product.slug}` });
const availabilityScore = (state: string) => state === "IN_STOCK" ? 15 : state === "LOW_STOCK" || state === "AVAILABLE_FROM_SUPPLIER" ? 10 : state === "OUT_OF_STOCK" ? -12 : 0;

export async function searchPublishedProducts(raw: Parameters<typeof interpretProductSearch>[0], limit = 8) {
  const intent = await interpretProductSearch(raw); const products = await listPublicProducts(); const ranked: ZeusProductMatch[] = [];
  for (const product of products) {
    const path = await canonicalTaxonomyPath(product); const evidenceText = normalize(`${product.name} ${product.brand} ${path.labels.join(" ")} ${product.shortDescription} ${product.description ?? ""} ${product.specifications.map((item) => `${item.name} ${item.value}`).join(" ")}`);
    if (intent.excludedTerms.some((term) => evidenceText.includes(term))) continue;
    const categoryMatch = !intent.categoryId || product.categoryId === intent.categoryId; const subcategoryMatch = !intent.subcategoryId || product.subcategoryId === intent.subcategoryId;
    const brandMatch = !intent.brand || normalize(product.brand) === normalize(intent.brand); const budgetMatch = (intent.budgetMin === undefined || product.price >= intent.budgetMin) && (intent.budgetMax === undefined || product.price <= intent.budgetMax);
    if (!budgetMatch) continue;
    const requiredMatch = intent.requiredTerms.every((term) => evidenceText.includes(term)); const specMatches = intent.specFilters.filter((term) => evidenceText.includes(term)); const specsMatch = specMatches.length === intent.specFilters.length;
    const termMatches = intent.optionalTerms.filter((term) => evidenceText.includes(term));
    const accessory = Boolean(intent.subcategoryId && ["SUB_NETWORK_CABLES", "SUB_NETWORK_ACCESSORIES", "SUB_POE_EQUIPMENT", "SUB_POWER_ACCESSORIES", "SUB_COMPUTER_ACCESSORIES"].includes(product.subcategoryId ?? "") && product.subcategoryId !== intent.subcategoryId);
    const coreEvidenceMatch = Boolean(intent.categoryId || intent.subcategoryId) || termMatches.length > 0 || Boolean(intent.brand && brandMatch) || specMatches.length > 0;
    if (!coreEvidenceMatch) continue;
    let matchType: ZeusProductMatch["matchType"] = categoryMatch && subcategoryMatch && brandMatch && budgetMatch && requiredMatch && specsMatch ? "PRIMARY_MATCH" : categoryMatch && !accessory ? "ALTERNATIVE" : accessory ? "RELATED_ACCESSORY" : "ALTERNATIVE";
    if (intent.resultIntent === "ACCESSORIES" && accessory) matchType = "PRIMARY_MATCH";
    if (matchType === "ALTERNATIVE" && !categoryMatch && termMatches.length === 0) continue;
    if (matchType === "ALTERNATIVE" && intent.categoryId && !categoryMatch) continue;
    const score = (categoryMatch ? 40 : 0) + (subcategoryMatch ? 35 : 0) + (brandMatch ? 18 : -8) + (budgetMatch ? 16 : -20) + specMatches.length * 12 + termMatches.length * 4 + availabilityScore(product.availability.state);
    const matchedEvidence = [...(categoryMatch && intent.categoryId ? [`Category: ${path.category?.label}`] : []), ...(subcategoryMatch && intent.subcategoryId ? [`Product type: ${path.subcategory?.label}`] : []), ...(intent.brand && brandMatch ? [`Brand: ${product.brand}`] : []), ...(intent.budgetMax !== undefined && budgetMatch ? [`Within R${Math.round(intent.budgetMax).toLocaleString("en-ZA")} budget`] : []), ...specMatches.map((item) => `Specification: ${item}`), ...termMatches.slice(0, 2).map((item) => `Catalogue evidence: ${item}`)];
    const unmatchedPreferences = [...(intent.brand && !brandMatch ? [`Brand ${intent.brand}`] : []), ...(intent.budgetMax !== undefined && !budgetMatch ? ["Budget"] : []), ...intent.specFilters.filter((item) => !evidenceText.includes(item)).map((item) => `Specification ${item}`)];
    ranked.push({ product: publicProduct(product), matchType, matchedEvidence, unmatchedPreferences, score });
  }
  const order = { PRIMARY_MATCH: 0, ALTERNATIVE: 1, RELATED_ACCESSORY: 2 }; ranked.sort((a, b) => order[a.matchType] - order[b.matchType] || b.score - a.score || a.product.price - b.product.price);
  const selected = ranked.slice(0, Math.max(1, Math.min(10, limit))); return { intent, results: selected, products: selected.map((item) => item.product), telemetry: { typoCorrected: intent.corrections.length > 0, brandDetected: Boolean(intent.brand), categoryDetected: Boolean(intent.categoryId), budgetUsed: intent.budgetMin !== undefined || intent.budgetMax !== undefined, noResult: selected.length === 0, primaryMatches: selected.filter((item) => item.matchType === "PRIMARY_MATCH").length, alternatives: selected.filter((item) => item.matchType === "ALTERNATIVE").length, accessories: selected.filter((item) => item.matchType === "RELATED_ACCESSORY").length } };
}

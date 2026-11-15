import type { SupplierOffer } from "../../supplierDomain.js";
import { getAdminProductById, getProductCreatedFromOffer, listAdminProducts, saveInternalProduct } from "../../internalProductRepository.js";
import { getSyntechCatalogueProduct, listSyntechCatalogueProducts } from "./syntechCatalogueRepository.js";
import { listSupplierProductMappings, saveSupplierProductMapping } from "../../supplierProductMappingRepository.js";
import { quantityAvailability, resolveProductAvailability } from "../../productAvailability.js";
import { getSupplierPolicySettings } from "../../businessSettingsRepository.js";
import { listPricingProposals } from "../../pricingProposalRepository.js";
import { findIngestedPublicImage } from "../../publicImageIngestion.js";
import type { SyntechCatalogueProduct } from "./syntechTypes.js";
import { listSupplierCategoryMappings, normalizeSupplierSourcePath, saveSupplierCategoryMapping } from "../../supplierCategoryMappingRepository.js";
import { suggestCanonicalCategory } from "../../categorySuggestionService.js";
import { findCanonicalProductCandidates, requiresDuplicateOverride, suggestCanonicalProductIdentity } from "../../supplierProductIntelligence.js";
import { canonicalTaxonomyPath } from "../../canonicalTaxonomyService.js";

const clean = (value?: string) => value?.replace(/<br\s*\/?\s*>/gi, ". ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim() ?? "";
const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const attr = (product: SyntechCatalogueProduct, ...names: string[]) => product.attributes.find((item) => names.includes(item.key.toLowerCase()))?.value;
const merchandising = new Set(["just arrived", "coming soon", "last chance", "unboxed", "on promotion"]);

export function syntechProductToSupplierOffer(product: SyntechCatalogueProduct, mapping?: Awaited<ReturnType<typeof listSupplierProductMappings>>[number]): SupplierOffer {
  return { id: `SYNTECH:${product.supplierSku}`, tekcentralProductId: mapping?.productId ?? "", supplierId: "SYNTECH", supplierProductId: product.supplierSku, supplierSku: product.supplierSku, cost: product.effectiveDealerCostExVat ?? null, currency: product.currency, availability: product.totalStock === undefined ? "UNKNOWN" : product.totalStock > 0 ? "IN_STOCK" : "OUT_OF_STOCK", fulfilmentCapability: "MANUAL", mappingStatus: mapping?.status ?? (product.taxonomyMappingStatus === "MAPPED" ? "SUGGESTED" : product.taxonomyMappingStatus), lastVerifiedAt: mapping?.verifiedAt ?? product.observedAt, metadata: { normalDealerCostExVat: product.normalDealerCostExVat, promoPriceExVat: product.promoPriceExVat, promotionActive: product.promotionActive, promoStarts: product.promoStarts, promoEnds: product.promoEnds, effectiveDealerCostExVat: product.effectiveDealerCostExVat, rrpInclVat: product.rrpInclVat, recommendedMargin: product.recommendedMargin, branchStock: product.branchStock, totalStock: product.totalStock, nextShipmentEta: product.nextShipmentEta, sourceFingerprint: product.sourceFingerprint, observedAt: product.observedAt } };
}

export async function getSyntechOnboardingPreview(supplierSku: string) {
  const product = await getSyntechCatalogueProduct(supplierSku); if (!product) throw new Error("Syntech product not found.");
  const mappings = (await listSupplierProductMappings()).filter((item) => item.supplierCode === "SYNTECH" && item.supplierSku === supplierSku && item.status !== "SUPERSEDED" && item.status !== "REJECTED");
  const products = await listAdminProducts();
  const productCandidates = await findCanonicalProductCandidates({ supplierCode: "SYNTECH", supplierSku: product.supplierSku, title: product.name, brand: product.brand, model: product.modelNumber, manufacturerPartNumber: product.manufacturerPartNumber, ean: attr(product, "ean", "gtin", "barcode") }, { products });
  const identitySuggestion = suggestCanonicalProductIdentity({ supplierCode: "SYNTECH", supplierSku: product.supplierSku, title: product.name, brand: product.brand, model: product.modelNumber, manufacturerPartNumber: product.manufacturerPartNumber }, products);
  const images = [...new Set([product.featuredImage, ...product.additionalImages].filter((item): item is string => Boolean(item?.startsWith("https://"))))];
  const sourcePath = product.sourceCategoryTrees.join("|"); const normalizedSourcePath = normalizeSupplierSourcePath(sourcePath); const verifiedCategory = (await listSupplierCategoryMappings("SYNTECH")).find((item) => item.status === "VERIFIED" && item.normalizedSourcePath === normalizedSourcePath);
  const sharedSuggestion = await suggestCanonicalCategory({ supplierId: "SYNTECH", sourceCategoryPath: sourcePath, sourceCategoryLabel: product.sourceCategories.join(", "), productName: product.name, supplierSku: product.supplierSku, brand: product.brand, specifications: product.attributes.map((item) => ({ name: item.key, value: item.value })) });
  const verifiedPath = verifiedCategory ? await canonicalTaxonomyPath(verifiedCategory) : undefined;
  const reusableVerifiedCategory = verifiedCategory && verifiedPath?.category?.status === "ACTIVE" && (!verifiedCategory.subcategoryId || verifiedPath.subcategory?.status === "ACTIVE") && (!verifiedCategory.productTypeId || verifiedPath.productType?.status === "ACTIVE") ? verifiedCategory : undefined;
  const taxonomySuggestion = reusableVerifiedCategory ? { categoryId: reusableVerifiedCategory.categoryId, subcategoryId: reusableVerifiedCategory.subcategoryId, productTypeId: reusableVerifiedCategory.productTypeId, taxonomyVersion: 1 as const, taxonomyStatus: "VERIFIED" as const, labels: verifiedPath!.labels, confidence: "HIGH" as const, evidence: ["Exact source category has a staff-verified mapping."], source: "VERIFIED_SUPPLIER_MAPPING" as const } : { categoryId: sharedSuggestion.suggestedCategoryId ?? "", subcategoryId: sharedSuggestion.suggestedSubcategoryId, productTypeId: sharedSuggestion.suggestedProductTypeId, taxonomyVersion: 1 as const, taxonomyStatus: sharedSuggestion.suggestedCategoryId ? "REVIEW_REQUIRED" as const : "UNMAPPED" as const, labels: sharedSuggestion.labels, confidence: sharedSuggestion.confidence, evidence: sharedSuggestion.evidence, source: sharedSuggestion.source };
  const identicalSourcePathCount = (await listSyntechCatalogueProducts()).filter((item) => item.sourceCategoryTrees.some((path) => normalizeSupplierSourcePath(path) === normalizedSourcePath) || normalizeSupplierSourcePath(item.sourceCategoryTrees.join("|")) === normalizedSourcePath).length;
  return { product, offer: syntechProductToSupplierOffer(product, mappings[0]), currentMapping: mappings[0], taxonomySuggestion, identitySuggestion, productCandidates: productCandidates.slice(0, 10), duplicateWarning: requiresDuplicateOverride(productCandidates), identicalSourcePathCount, content: { title: product.name ?? product.supplierSku, brand: product.brand, model: product.modelNumber, manufacturerPartNumber: product.manufacturerPartNumber, ean: attr(product, "ean", "gtin", "barcode"), shortDescription: clean(product.shortDescription) || clean(product.description).slice(0, 180), longDescription: clean(product.description), specifications: product.attributes, imageCandidates: images }, exactProductCandidates: productCandidates.slice(0, 10).map((item) => ({ id: item.product.id, sku: item.product.sku, name: item.product.name, brand: item.product.brand, model: item.product.model, confidence: item.confidence, evidence: item.evidence })) };
}

export async function verifySyntechSourceCategory(input: { sourceCategoryPath: string; sourceCategoryLabel?: string; categoryId: string; subcategoryId?: string; productTypeId?: string; confirmed: boolean; actor?: string }) {
  if (!input.confirmed) throw new Error("Explicit confirmation is required for bulk taxonomy mapping.");
  const taxonomy = await reviewedTaxonomy(input);
  return saveSupplierCategoryMapping({ supplierId: "SYNTECH", sourceCategoryPath: input.sourceCategoryPath.trim(), sourceCategoryLabel: input.sourceCategoryLabel?.trim(), categoryId: taxonomy.categoryId, subcategoryId: taxonomy.subcategoryId, productTypeId: taxonomy.productTypeId, reviewedBy: input.actor, status: "VERIFIED" });
}

async function reviewedTaxonomy(input: { categoryId: string; subcategoryId?: string; productTypeId?: string }) {
  const {category,subcategory,productType}=await canonicalTaxonomyPath(input);
  if (!category || category.status !== "ACTIVE" || input.subcategoryId && (!subcategory || subcategory.status !== "ACTIVE") || input.productTypeId && (!productType || productType.status !== "ACTIVE")) throw new Error("A valid active canonical taxonomy selection is required.");
  return { category, subcategory, productType, categoryId: category.id, subcategoryId: subcategory?.id, productTypeId: productType?.id, taxonomyVersion: 1 as const, taxonomyStatus: "VERIFIED" as const };
}

export async function createTekCentralProductFromSyntech(input: { supplierSku: string; name: string; brand?: string; shortDescription?: string; categoryId: string; subcategoryId?: string; productTypeId?: string; confirmed: boolean; duplicateOverrideConfirmed?: boolean; actor?: string }) {
  if (!input.confirmed) throw new Error("Staff confirmation is required.");
  const preview = await getSyntechOnboardingPreview(input.supplierSku); const existing = await getProductCreatedFromOffer(`SYNTECH:${input.supplierSku}`);
  if (existing) return { product: existing, mapping: preview.currentMapping, reused: true as const };
  if (preview.duplicateWarning && !input.duplicateOverrideConfirmed) throw new Error("LIKELY_EXISTING_PRODUCT_REQUIRES_CONFIRMATION");
  const taxonomy = await reviewedTaxonomy(input); const now = new Date().toISOString(); const source = preview.product;
  const product = await saveInternalProduct({ slug: slugify(input.name), sku: `TC-${source.supplierSku.replace(/[^a-z0-9]/gi, "-").toUpperCase()}`, name: input.name.trim(), brand: input.brand?.trim() || source.brand || "Unbranded", model: source.modelNumber, manufacturerPartNumber: source.manufacturerPartNumber, ean: preview.content.ean, category: taxonomy.category.name, categorySlug: taxonomy.category.slug, subcategory: taxonomy.subcategory?.name, categoryId: taxonomy.categoryId, subcategoryId: taxonomy.subcategoryId, productTypeId: taxonomy.productTypeId, taxonomyVersion: taxonomy.taxonomyVersion, taxonomyStatus: taxonomy.taxonomyStatus, tags: source.sourceCategories.filter((item) => merchandising.has(item.toLowerCase())), shortDescription: input.shortDescription?.trim() || preview.content.shortDescription || input.name.trim(), description: preview.content.longDescription || undefined, images: preview.content.imageCandidates.slice(0, 8), publicationStatus: "INTERNAL_DRAFT", provenance: { createdFromSupplierOffer: true, sourceSupplier: "SYNTECH", sourceSupplierOfferId: `SYNTECH:${source.supplierSku}`, sourceSupplierSku: source.supplierSku, sourceDescription: source.name ?? source.supplierSku, sourceCategory: { supplierId: "SYNTECH", sourceCategoryPath: source.sourceCategoryTrees.join(" | "), sourceCategoryLabel: source.sourceCategories.join(", ") }, manufacturer: source.brand, sourceImage: source.featuredImage ? { source: "SYNTECH", originalUrl: source.featuredImage, capturedAt: now } : undefined } });
  const mapping = await saveSupplierProductMapping({ productId: product.id, supplierCode: "SYNTECH", supplierSku: source.supplierSku, supplierOfferId: `SYNTECH:${source.supplierSku}`, supplierProductId: source.supplierSku, supplierProductSku: source.supplierSku, status: "VERIFIED", confidence: 1, confidenceLevel: "HIGH", matchMethod: "STAFF_CONFIRMED_PRODUCT_CREATION", evidence: [`Exact Syntech SKU ${source.supplierSku}`, `Source fingerprint ${source.sourceFingerprint}`], verifiedBy: input.actor ?? "TekCentral Staff", verifiedAt: now, source: "SYNTECH_PRODUCT_ONBOARDING" });
  return { product, mapping, reused: false as const };
}

export async function mapSyntechProductToExisting(input: { supplierSku: string; productId: string; confirmed: boolean; actor?: string }) {
  if (!input.confirmed) throw new Error("Staff confirmation is required.");
  const [source, product] = await Promise.all([getSyntechCatalogueProduct(input.supplierSku), getAdminProductById(input.productId)]); if (!source || !product) throw new Error("Syntech source or TekCentral product not found.");
  const now = new Date().toISOString();
  const mapping = await saveSupplierProductMapping({ productId: product.id, supplierCode: "SYNTECH", supplierSku: source.supplierSku, supplierOfferId: `SYNTECH:${source.supplierSku}`, supplierProductId: source.supplierSku, supplierProductSku: source.supplierSku, status: "VERIFIED", confidence: 1, confidenceLevel: "HIGH", matchMethod: "STAFF_CONFIRMED_EXISTING_PRODUCT", evidence: [`Exact Syntech SKU ${source.supplierSku}`, `Staff reviewed source fingerprint ${source.sourceFingerprint}`], verifiedBy: input.actor ?? "TekCentral Staff", verifiedAt: now, source: "SYNTECH_PRODUCT_ONBOARDING" });
  return { product, mapping };
}

export async function getSyntechProductReadiness(supplierSku: string) {
  const source = await getSyntechCatalogueProduct(supplierSku); if (!source) throw new Error("Syntech product not found.");
  const mapping = (await listSupplierProductMappings()).find((item) => item.supplierCode === "SYNTECH" && item.supplierSku === supplierSku && item.status === "VERIFIED");
  const product = mapping ? await getAdminProductById(mapping.productId) : undefined; const proposals = mapping ? (await listPricingProposals()).filter((item) => item.productId === mapping.productId && item.supplierId === "SYNTECH" && item.supplierOfferId === `SYNTECH:${supplierSku}`) : [];
  const proposal = proposals.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0]; const policy = await getSupplierPolicySettings();
  const availability = resolveProductAvailability([{ state: quantityAvailability(source.totalStock) ?? "AVAILABILITY_UNKNOWN", quantity: source.totalStock, observedAt: source.observedAt, freshnessHours: policy.stockFreshnessHours, source: "SYNTECH_BRANCH_STOCK" }]);
  const controlledImage = mapping ? await findIngestedPublicImage({ internalProductId: mapping.productId }) : undefined;
  const blockers = [...(!mapping ? ["MAPPING_NOT_VERIFIED"] : []), ...(!product || product.taxonomyStatus !== "VERIFIED" ? ["TAXONOMY_NOT_VERIFIED"] : []), ...(product && "launchSelection" in product && product.launchSelection?.state !== "SELECTED_FOR_LAUNCH" ? ["NOT_SELECTED"] : []), ...(!controlledImage ? ["CONTROLLED_IMAGE_REQUIRED"] : []), ...(!proposal ? ["PRICING_PROPOSAL_REQUIRED"] : proposal.status !== "APPROVED" ? ["PRICING_APPROVAL_REQUIRED"] : []), ...(availability.freshness !== "FRESH" ? ["STOCK_EVIDENCE_STALE"] : []), ...(["OUT_OF_STOCK", "AVAILABILITY_UNKNOWN"].includes(availability.state) ? ["SOURCE_NOT_AVAILABLE"] : [])];
  return { status: blockers.length ? "NOT_READY" as const : "READY_FOR_PUBLISH_REVIEW" as const, blockers, product, mapping, proposal, availability, offer: syntechProductToSupplierOffer(source, mapping) };
}

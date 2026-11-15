import { resolveProductTaxonomy } from "../src/lib/product-taxonomy.js";
import { listSupplierCategoryMappings, normalizeSupplierSourcePath } from "./supplierCategoryMappingRepository.js";
import { listCanonicalTaxonomyNodes } from "./canonicalTaxonomyRepository.js";

export type CategorySuggestionConfidence = "HIGH" | "MEDIUM" | "LOW" | "NONE";
export interface CategorySuggestion {
  suggestedCategoryId?: string;
  suggestedSubcategoryId?: string;
  suggestedProductTypeId?: string;
  confidence: CategorySuggestionConfidence;
  evidence: string[];
  source: "VERIFIED_SUPPLIER_MAPPING" | "DETERMINISTIC_PRODUCT_EVIDENCE" | "NONE";
  labels: string[];
}

export interface CategorySuggestionInput {
  supplierId: string;
  sourceCategoryId?: string;
  sourceCategoryPath?: string;
  sourceCategoryLabel?: string;
  productName?: string;
  supplierSku?: string;
  brand?: string;
  productType?: string;
  specifications?: Array<{ name: string; value: string }>;
}

const normalized = (value?: string) => value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() ?? "";
function exactSourceMatch(input: CategorySuggestionInput, mapping: Awaited<ReturnType<typeof listSupplierCategoryMappings>>[number]) {
  if (input.sourceCategoryPath?.trim()) return mapping.normalizedSourcePath === normalizeSupplierSourcePath(input.sourceCategoryPath);
  if (input.sourceCategoryId?.trim()) return mapping.sourceCategoryId === input.sourceCategoryId;
  return Boolean(input.sourceCategoryLabel && normalized(mapping.sourceCategoryLabel) === normalized(input.sourceCategoryLabel));
}

async function validSuggestion(categoryId?: string, subcategoryId?: string, productTypeId?: string) {
  const nodes=await listCanonicalTaxonomyNodes(); const category=nodes.find(item=>item.id===categoryId&&item.level==="CATEGORY"&&item.status==="ACTIVE"); const subcategory=nodes.find(item=>item.id===subcategoryId&&item.parentId===category?.id&&item.level==="SUBCATEGORY"&&item.status==="ACTIVE"); const productType=nodes.find(item=>item.id===productTypeId&&item.parentId===subcategory?.id&&item.level==="PRODUCT_TYPE"&&item.status==="ACTIVE");
  if (!category || subcategoryId && !subcategory || productTypeId && !productType) return undefined;
  return { categoryId: category.id, subcategoryId: subcategory?.id, productTypeId: productType?.id, labels: [category.name,subcategory?.name,productType?.name].filter((item):item is string=>Boolean(item)) };
}

export async function suggestCanonicalCategory(input: CategorySuggestionInput): Promise<CategorySuggestion> {
  const verified = (await listSupplierCategoryMappings(input.supplierId)).filter((item) => item.status === "VERIFIED" && exactSourceMatch(input, item));
  const verifiedTargets = new Map(verified.map((item) => [`${item.categoryId}:${item.subcategoryId ?? ""}:${item.productTypeId ?? ""}`, item]));
  if (verifiedTargets.size === 1) {
    const mapping = [...verifiedTargets.values()][0]; const target = await validSuggestion(mapping.categoryId, mapping.subcategoryId, mapping.productTypeId);
    if (target) return { suggestedCategoryId: target.categoryId, suggestedSubcategoryId: target.subcategoryId, suggestedProductTypeId: target.productTypeId, confidence: "HIGH", evidence: ["Exact supplier category has a staff-verified canonical mapping."], source: "VERIFIED_SUPPLIER_MAPPING", labels: target.labels };
  }
  const specificationText = input.specifications?.map((item) => `${item.name} ${item.value}`).join(" ") ?? "";
  const assignment = resolveProductTaxonomy({ name: `${input.productName ?? ""} ${input.productType ?? ""} ${specificationText}`, sku: input.supplierSku, category: `${input.sourceCategoryLabel ?? ""} ${input.brand ?? ""}`, categorySlug: input.sourceCategoryPath });
  const target = await validSuggestion(assignment.categoryId, assignment.subcategoryId, assignment.productTypeId);
  if (!target || assignment.taxonomyStatus === "UNMAPPED") return { confidence: "NONE", evidence: ["Supplier and Product evidence did not resolve confidently to the canonical taxonomy."], source: "NONE", labels: [] };
  const genericOnly = /^(accessories|products?|technology|electronics|general|other|miscellaneous)$/i.test((input.sourceCategoryLabel ?? input.sourceCategoryPath ?? "").trim()) && !input.productName?.trim();
  if (genericOnly) return { confidence: "NONE", evidence: ["The supplier category is too broad to classify without Product evidence."], source: "NONE", labels: [] };
  const sourceText = `${input.sourceCategoryPath ?? ""} ${input.sourceCategoryLabel ?? ""}`.toLowerCase();
  const productText = `${input.productName ?? ""} ${input.brand ?? ""} ${input.productType ?? ""}`.toLowerCase();
  const processorEvidence = /\b(cpu|processor)\b/.test(sourceText) && /\b(cpu|processor|ryzen|core i[3579])\b/.test(productText) && target.subcategoryId === "SUB_CPUS";
  const confidence: CategorySuggestionConfidence = target.productTypeId || processorEvidence ? "HIGH" : target.subcategoryId ? "MEDIUM" : "LOW";
  const evidence = processorEvidence
    ? ["Supplier source path identifies CPU products.", "Product title identifies a processor or CPU model.", ...(input.brand ? [`Supplier brand is ${input.brand}.`] : []), "Canonical Product evidence resolves to Computer Components > CPUs."]
    : [target.productTypeId ? "Product title, source category and Product type resolve to a canonical Product type." : target.subcategoryId ? "Product title and supplier category resolve to a canonical subcategory." : "Evidence supports a broad canonical category; staff review is required."];
  return { suggestedCategoryId: target.categoryId, suggestedSubcategoryId: target.subcategoryId, suggestedProductTypeId: target.productTypeId, confidence, evidence, source: "DETERMINISTIC_PRODUCT_EVIDENCE", labels: target.labels };
}

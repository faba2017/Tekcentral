import { products } from "../../../src/data/catalogue.js";
import { createHash } from "node:crypto";
import {
  getSupplierProductMappingById,
  listSupplierProductMappings,
  saveSupplierProductMapping,
} from "../../supplierProductMappingRepository.js";
import type { SupplierCatalogueProduct, SupplierProductMapping } from "../../types.js";
import { CjAuthService } from "./cjAuthService.js";
import { CjClient } from "./cjClient.js";
import { CjApiError } from "./cjErrors.js";
import {
  allowedCjTechnologyCategoryIds,
  applyCjCatalogueScope,
  assertCjTechnologyPolicyAvailable,
  annotateTechnologyProduct,
  createCjCategoryLookup,
  enrichCjProductCategory,
  technologyPolicyResponse,
} from "./cjCataloguePolicy.js";
import { getCjCatalogueProduct, listCjCatalogueProducts, saveCjCatalogueProduct, updateCjCatalogueVariant } from "./cjCatalogueRepository.js";
import { applyCjProductDetailPricing, extractProductList, normalizeCjCategories, normalizeCjProduct, normalizeCjStock, normalizeCjVariant } from "./cjProductMapper.js";
import type { CjProductLookup, CjSearchParams } from "./cjTypes.js";

const authService = new CjAuthService();
const client = new CjClient(authService);
type CjCatalogueClient = Pick<CjClient, "request">;
let cachedCategoryLookup:
  | { expiresAt: number; lookup: ReturnType<typeof createCjCategoryLookup> }
  | undefined;

export async function getCjConnectionStatus() {
  const status = await authService.getStatus();
  const importedProducts = await listCjCatalogueProducts();
  const mappings = (await listSupplierProductMappings()).filter(
    (mapping) => mapping.supplierCode === "CJ",
  );
  return {
    ...status,
    importedProductsCount: importedProducts.length,
    verifiedMappingsCount: mappings.filter((mapping) => mapping.status === "VERIFIED").length,
    suggestedMappingsCount: mappings.filter((mapping) => mapping.status === "SUGGESTED").length,
    staleMappingsCount: mappings.filter((mapping) => mapping.status === "STALE").length,
  };
}

export async function testCjConnection() {
  await client.request("/setting/get");
  return getCjConnectionStatus();
}

type ExactCjLookupKind = "PRODUCT_ID" | "PRODUCT_SKU" | "VID" | "VARIANT_SKU";

function exactIdentifier(value: string) {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed) || trimmed.length < 8) return undefined;
  if (/^\d{10,}$/.test(trimmed)) return trimmed;
  if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(trimmed)) return trimmed;
  if (/^[a-z0-9][a-z0-9_-]{7,}$/i.test(trimmed) && (/\d/.test(trimmed) || /^cj/i.test(trimmed))) return trimmed;
  return undefined;
}

async function maybeDetail(lookup: CjProductLookup, requestClient: CjCatalogueClient) {
  try {
    return await getCjProductDetail(lookup, requestClient);
  } catch (error) {
    if (error instanceof CjApiError) return undefined;
    throw error;
  }
}

async function exactLookupByIdentifier(identifier: string, requestClient: CjCatalogueClient) {
  const attempts: { kind: ExactCjLookupKind; run: () => Promise<Awaited<ReturnType<typeof getCjProductDetail>> | undefined> }[] = [];
  if (/^\d{10,}$/.test(identifier)) {
    attempts.push({
      kind: "VID",
      run: async () => {
        const variant = await getCjVariantByVid(identifier, requestClient).catch((error) => {
          if (error instanceof CjApiError) return undefined;
          throw error;
        });
        if (!variant?.supplierVariantId) return undefined;
        const detail = await maybeDetail(
          { pid: variant.supplierProductId, productSku: variant.supplierProductSku },
          requestClient,
        );
        return detail
          ? {
              ...detail,
              variants: detail.variants.some((item) => item.supplierVariantId === variant.supplierVariantId)
                ? detail.variants
                : [variant, ...detail.variants],
            }
          : undefined;
      },
    });
  }
  if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(identifier)) {
    attempts.push({ kind: "PRODUCT_ID", run: () => maybeDetail({ pid: identifier }, requestClient) });
  }
  attempts.push(
    { kind: "PRODUCT_SKU", run: () => maybeDetail({ productSku: identifier }, requestClient) },
    { kind: "VARIANT_SKU", run: () => maybeDetail({ variantSku: identifier }, requestClient) },
    { kind: "PRODUCT_ID", run: () => maybeDetail({ pid: identifier }, requestClient) },
  );
  const tried = new Set<string>();
  for (const attempt of attempts) {
    const key = `${attempt.kind}:${identifier}`;
    if (tried.has(key)) continue;
    tried.add(key);
    const detail = await attempt.run();
    if (!detail) continue;
    const selectedVariant =
      attempt.kind === "VID"
        ? detail.variants.find((variant) => variant.supplierVariantId === identifier)
        : attempt.kind === "VARIANT_SKU"
          ? detail.variants.find((variant) => variant.supplierVariantSku === identifier)
          : undefined;
    return { kind: attempt.kind, detail, selectedVariantId: selectedVariant?.supplierVariantId };
  }
  return undefined;
}

export async function searchCjProducts(params: CjSearchParams, requestClient: CjCatalogueClient = client) {
  const page = Math.max(1, Math.min(1000, Math.trunc(params.page ?? 1)));
  const size = Math.max(1, Math.min(100, Math.trunc(params.size ?? 20)));
  const scope = params.scope ?? "technology";
  if (scope === "technology") assertCjTechnologyPolicyAvailable();
  const exact = exactIdentifier(params.keyword);
  if (exact) {
    const match = await exactLookupByIdentifier(exact, requestClient);
    if (!match) {
      return {
        products: [],
        rawResultsCount: 0,
        categoryResolvedCount: 0,
        technologyAllowedCount: 0,
        invalidResultsCount: 0,
        exactLookup: {
          used: true,
          identifier: exact,
          identifierType: undefined,
          status: "NOT_FOUND" as const,
          message: "No CJ product or variant found for this identifier.",
        },
      };
    }
    const categoryLookup = await getCachedCjCategoryLookup(requestClient).catch(() => undefined);
    const scoped = applyCjCatalogueScope([match.detail.product], scope, params.keyword, categoryLookup);
    if (scope === "technology" && scoped.products.length === 0) {
      return {
        requestId: match.detail.requestId,
        products: [],
        rawResultsCount: 1,
        categoryResolvedCount: scoped.categoryResolvedCount,
        technologyAllowedCount: scoped.technologyAllowedCount,
        invalidResultsCount: 0,
        exactLookup: {
          used: true,
          identifier: exact,
          identifierType: match.kind,
          status: "OUTSIDE_SCOPE" as const,
          message: "Exact CJ identifier found outside the TekCentral technology scope. Switch to All CJ catalogue to inspect it.",
          selectedVariantId: match.selectedVariantId,
        },
      };
    }
    return {
      requestId: match.detail.requestId,
      products: scoped.products,
      rawResultsCount: 1,
      categoryResolvedCount: scoped.categoryResolvedCount,
      technologyAllowedCount: scoped.technologyAllowedCount,
      invalidResultsCount: 0,
      exactLookup: {
        used: true,
        identifier: exact,
        identifierType: match.kind,
        status: "MATCH" as const,
        message: "Exact CJ match",
        selectedVariantId: match.selectedVariantId,
      },
    };
  }
  const response = await requestClient.request<unknown>("/product/listV2", {
    query: { keyWord: params.keyword, categoryId: params.categoryId, page, size },
  });
  const rawProducts = extractProductList(response.data);
  const products = [];
  let invalidResultsCount = 0;
  for (const item of rawProducts) {
    try {
      products.push(normalizeCjProduct(item));
    } catch (error) {
      if (error instanceof CjApiError && error.code === "CJ_INVALID_RESPONSE") {
        invalidResultsCount += 1;
      } else {
        throw error;
      }
    }
  }
  const categoryLookup = await getCachedCjCategoryLookup(requestClient).catch(() => undefined);
  const scoped = applyCjCatalogueScope(products, scope, params.keyword, categoryLookup);
  return {
    requestId: response.requestId,
    products: scoped.products,
    rawResultsCount: rawProducts.length,
    categoryResolvedCount: scoped.categoryResolvedCount,
    technologyAllowedCount: scoped.technologyAllowedCount,
    invalidResultsCount,
  };
}

export async function autocompleteCjProducts(params: CjSearchParams) {
  const result = await searchCjProducts({
    ...params,
    page: 1,
    size: Math.min(params.size ?? 8, 8),
  });
  return { ...result, suggestions: result.products };
}

export async function getCjCategories() {
  assertCjTechnologyPolicyAvailable();
  const response = await client.request<unknown[]>("/product/getCategory").catch((error) => {
    if (allowedCjTechnologyCategoryIds().size > 0) {
      return {
        requestId: undefined,
        data: [],
      };
    }
    throw error;
  });
  const categories = normalizeCjCategories(response.data);
  return {
    requestId: response.requestId,
    ...technologyPolicyResponse(categories),
  };
}

export async function getAllCjCategories() {
  const response = await client.request<unknown[]>("/product/getCategory");
  return {
    requestId: response.requestId,
    mode: "all" as const,
    categories: normalizeCjCategories(response.data),
  };
}

export async function getCjProductDetail(lookup: CjProductLookup, requestClient: CjCatalogueClient = client) {
  if (!lookup.pid && !lookup.productSku && !lookup.variantSku) {
    throw new CjApiError("CJ_PRODUCT_NOT_FOUND", "CJ product lookup is required.");
  }
  const response = await requestClient.request<unknown>("/product/query", {
    query: {
      pid: lookup.pid,
      productSku: lookup.productSku,
      variantSku: lookup.variantSku,
    },
  });
  if (!response.data) throw new CjApiError("CJ_PRODUCT_NOT_FOUND", "CJ product not found.", response.requestId);
  const categoryLookup = await getCachedCjCategoryLookup(requestClient).catch(() => undefined);
  const product = annotateTechnologyProduct(
    categoryLookup
      ? enrichCjProductCategory(normalizeCjProduct(response.data), categoryLookup)
      : normalizeCjProduct(response.data),
  );
  const variants = await getCjProductVariants(
    { pid: product.supplierProductId || lookup.pid, productSku: product.supplierSku ?? lookup.productSku, variantSku: lookup.variantSku },
    requestClient,
  );
  const fullDetail = await requestClient.request<unknown>("/product/productDetail/query", { method: "POST", body: { id: product.supplierProductId } }).catch(() => undefined);
  const pricedVariants = fullDetail?.data ? applyCjProductDetailPricing(variants, fullDetail.data) : variants;
  const detailProduct = categoryLookup
    ? enrichCjProductCategory(normalizeCjProduct(response.data, pricedVariants), categoryLookup)
    : normalizeCjProduct(response.data, pricedVariants);
  return {
    requestId: response.requestId,
    product: annotateTechnologyProduct(detailProduct),
    variants: pricedVariants,
  };
}

async function getCachedCjCategoryLookup(requestClient: CjCatalogueClient = client) {
  const now = Date.now();
  if (cachedCategoryLookup && cachedCategoryLookup.expiresAt > now) return cachedCategoryLookup.lookup;
  const response = await requestClient.request<unknown[]>("/product/getCategory");
  const lookup = createCjCategoryLookup(normalizeCjCategories(response.data));
  cachedCategoryLookup = {
    expiresAt: now + 15 * 60 * 1000,
    lookup,
  };
  return lookup;
}

export async function getCjProductVariants(lookup: CjProductLookup, requestClient: CjCatalogueClient = client) {
  const response = await requestClient.request<unknown[]>("/product/variant/query", {
    query: {
      pid: lookup.pid,
      productSku: lookup.productSku,
      variantSku: lookup.variantSku,
    },
  });
  return (Array.isArray(response.data) ? response.data : []).map(normalizeCjVariant);
}

export async function getCjVariantByVid(vid: string, requestClient: CjCatalogueClient = client) {
  const response = await requestClient.request<unknown>("/product/variant/queryByVid", {
    query: { vid, features: "enable_inventory" },
  });
  return normalizeCjVariant(response.data);
}

export async function refreshCjVariantSourcePrice(input: { supplierProductId: string; supplierVariantId: string; supplierVariantSku?: string }, requestClient: CjCatalogueClient = client) {
  const existing = await getCjCatalogueProduct(input.supplierProductId);
  const existingVariant = existing?.variants.find((variant) => variant.supplierVariantId === input.supplierVariantId);
  if (!existing || !existingVariant) throw new CjApiError("CJ_PRODUCT_NOT_FOUND", "Imported CJ product or exact variant not found.");
  if (existingVariant.costEvidence?.classification === "PROCUREMENT_COST") throw new CjApiError("CJ_INVALID_RESPONSE", "Manual procurement evidence cannot be refreshed from the CJ API.");
  const expectedSku = input.supplierVariantSku ?? existingVariant.supplierVariantSku;
  const identity = await getCjVariantByVid(input.supplierVariantId, requestClient);
  if (identity.supplierProductId && identity.supplierProductId !== input.supplierProductId) throw new CjApiError("CJ_INVALID_RESPONSE", "CJ returned a different parent product for the selected variant.");
  if (expectedSku && identity.supplierVariantSku !== expectedSku) throw new CjApiError("CJ_INVALID_RESPONSE", "CJ returned a different SKU for the selected variant.");
  const response = await requestClient.request<unknown>("/product/productDetail/query", { method: "POST", body: { id: input.supplierProductId } });
  const refreshedVariant = applyCjProductDetailPricing([existingVariant], response.data)[0];
  if (!refreshedVariant?.costEvidence || refreshedVariant === existingVariant) throw new CjApiError("CJ_INVALID_RESPONSE", "CJ did not return authoritative pricing for the selected variant.", response.requestId);
  const previousCostEvidence = existingVariant.costEvidence;
  const product = await updateCjCatalogueVariant(input.supplierProductId, input.supplierVariantId, (variant) => ({
    ...variant,
    price: refreshedVariant.price,
    currency: refreshedVariant.currency,
    currencyEvidence: refreshedVariant.currencyEvidence,
    costEvidence: refreshedVariant.costEvidence,
    costEvidenceHistory: previousCostEvidence
      ? [...(variant.costEvidenceHistory ?? []), previousCostEvidence].filter((entry, index, rows) => rows.findIndex((candidate) => candidate.capturedAt === entry.capturedAt && candidate.sourceFingerprint === entry.sourceFingerprint) === index).slice(-25)
      : variant.costEvidenceHistory,
  }));
  return { product: product!, variant: product!.variants.find((variant) => variant.supplierVariantId === input.supplierVariantId)!, previousCostEvidence, requestId: response.requestId };
}

export async function getCjStockByVid(vid: string) {
  const response = await client.request<unknown[]>("/product/stock/queryByVid", {
    query: { vid },
  });
  return normalizeCjStock(response.data);
}

export async function refreshCjVariantAvailability(input: { supplierProductId: string; supplierVariantId: string; supplierVariantSku?: string }, requestClient: CjCatalogueClient = client) {
  const existing = await getCjCatalogueProduct(input.supplierProductId);
  const existingVariant = existing?.variants.find((variant) => variant.supplierVariantId === input.supplierVariantId);
  if (!existing || !existingVariant) throw new CjApiError("CJ_PRODUCT_NOT_FOUND", "Imported CJ product or exact variant not found.");
  const expectedSku = input.supplierVariantSku ?? existingVariant.supplierVariantSku;
  const identity = await getCjVariantByVid(input.supplierVariantId, requestClient);
  if (identity.supplierVariantId !== input.supplierVariantId || (identity.supplierProductId && identity.supplierProductId !== input.supplierProductId)) {
    throw new CjApiError("CJ_INVALID_RESPONSE", "CJ returned a different product or variant identity.");
  }
  if (expectedSku && identity.supplierVariantSku !== expectedSku) throw new CjApiError("CJ_INVALID_RESPONSE", "CJ returned a different SKU for the selected variant.");
  const response = await requestClient.request<unknown[]>("/product/stock/queryByVid", { query: { vid: input.supplierVariantId } });
  const stock = normalizeCjStock(response.data);
  const resolvedStock = stock.stockByWarehouse.length > 0 ? stock : { stockTotal: identity.stockTotal, stockByWarehouse: identity.stockByWarehouse };
  const observedAt = new Date().toISOString();
  const sourceFingerprint = createHash("sha256").update(JSON.stringify(response.data ?? null)).digest("hex");
  const fields = Array.from(new Set((Array.isArray(response.data) ? response.data : []).flatMap((row) => row && typeof row === "object" ? Object.keys(row) : []))).sort();
  const product = await updateCjCatalogueVariant(input.supplierProductId, input.supplierVariantId, (variant) => ({
    ...variant,
    stockTotal: resolvedStock.stockTotal,
    stockByWarehouse: resolvedStock.stockByWarehouse,
    stockEvidence: { observedAt, source: "CJ_STOCK_BY_VID", sourceFingerprint, endpoint: "/product/stock/queryByVid", fields },
    evidenceHistory: [...(variant.evidenceHistory ?? []), { endpoint: "/product/stock/queryByVid", capturedAt: observedAt, sourceFingerprint, fields }],
  }));
  if (!product) throw new CjApiError("CJ_PRODUCT_NOT_FOUND", "Imported CJ product or exact variant not found.");
  const refreshed = await saveCjCatalogueProduct({ ...product, lastFetchedAt: observedAt, lastSuccessfulRefreshAt: observedAt });
  return { product: refreshed, variant: refreshed.variants.find((variant) => variant.supplierVariantId === input.supplierVariantId)!, requestId: response.requestId };
}

export async function importCjProduct(lookup: CjProductLookup) {
  const detail = await getCjProductDetail(lookup);
  const product = await saveCjCatalogueProduct({
    ...detail.product,
    importedAt: new Date().toISOString(),
    lastFetchedAt: new Date().toISOString(),
    lastSuccessfulRefreshAt: new Date().toISOString(),
  });
  return product;
}

export async function refreshCjProduct(supplierProductId: string, requestClient: CjCatalogueClient = client) {
  const existing = await getCjCatalogueProduct(supplierProductId);
  if (!existing) throw new CjApiError("CJ_PRODUCT_NOT_FOUND", "Imported CJ product not found.");
  const detail = await getCjProductDetail({ pid: existing.supplierProductId }, requestClient);
  return saveCjCatalogueProduct({ ...detail.product, importedAt: existing.importedAt, lastFetchedAt: new Date().toISOString(), lastSuccessfulRefreshAt: new Date().toISOString() });
}

export async function refreshCjEvidenceCohort(requestClient: CjCatalogueClient = client) {
  const products = await listCjCatalogueProducts();
  const results: { supplierProductId: string; status: "REFRESHED" | "FAILED"; refreshedAt?: string; error?: string }[] = [];
  for (const product of products) {
    try {
      const refreshed = await refreshCjProduct(product.supplierProductId, requestClient);
      results.push({ supplierProductId: product.supplierProductId, status: "REFRESHED", refreshedAt: refreshed.lastSuccessfulRefreshAt });
    } catch (error) {
      results.push({ supplierProductId: product.supplierProductId, status: "FAILED", error: error instanceof CjApiError ? error.code : "CJ_API_UNAVAILABLE" });
    }
  }
  return { controlledProducts: products.length, refreshed: results.filter((item) => item.status === "REFRESHED").length, failed: results.filter((item) => item.status === "FAILED").length, results };
}

function normalizeMatch(value?: string) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function selectedCjVariant(cjProduct: SupplierCatalogueProduct, supplierVariantId?: string) {
  if (cjProduct.variants.length > 1 && !supplierVariantId) {
    throw new CjApiError("CJ_VARIANT_REQUIRED", "Select a CJ variant before creating the mapping.");
  }
  if (!supplierVariantId) return cjProduct.variants[0];
  const variant = cjProduct.variants.find((item) => item.supplierVariantId === supplierVariantId);
  if (!variant) throw new CjApiError("CJ_PRODUCT_NOT_FOUND", "This CJ variant is no longer available.");
  return variant;
}

export async function suggestCjMapping(input: {
  tekcentralProductId: string;
  supplierProductId: string;
  supplierVariantId?: string;
}) {
  const tekProduct = products.find((product) => product.id === input.tekcentralProductId);
  const cjProduct = await getCjCatalogueProduct(input.supplierProductId);
  if (!tekProduct || !cjProduct) throw new CjApiError("CJ_PRODUCT_NOT_FOUND", "Product mapping source not found.");
  const variant = selectedCjVariant(cjProduct, input.supplierVariantId);
  const supplierSku = variant?.supplierVariantSku ?? cjProduct.supplierSku;
  if (!supplierSku) throw new CjApiError("CJ_INVALID_RESPONSE", "CJ supplier SKU is missing.");
  const titleMatch = normalizeMatch(tekProduct.name) === normalizeMatch(variant?.name ?? cjProduct.supplierProductName);
  const mapping = await saveSupplierProductMapping({
    productId: tekProduct.id,
    supplierCode: "CJ",
    supplierSku,
    supplierProductId: cjProduct.supplierProductId,
    supplierProductSku: cjProduct.supplierSku,
    supplierVariantId: variant?.supplierVariantId,
    supplierVariantSku: variant?.supplierVariantSku,
    status: "SUGGESTED",
    confidence: titleMatch ? 0.65 : 0.35,
    matchMethod: titleMatch ? "normalized_title" : "staff_candidate",
    evidence: titleMatch ? ["Normalized title match"] : ["Staff-selected CJ candidate"],
    source: "CJ API",
  });
  return { mapping, tekcentralProduct: tekProduct, cjProduct, variant };
}

export async function verifySupplierMapping(mapping: SupplierProductMapping) {
  return saveSupplierProductMapping({
    ...mapping,
    status: "VERIFIED",
    verifiedBy: "TekCentral Staff",
    verifiedAt: new Date().toISOString(),
    source: "CJ API",
  });
}

export async function verifySupplierMappingById(id: string) {
  const mapping = await getSupplierProductMappingById(id);
  if (!mapping || mapping.supplierCode !== "CJ") throw new CjApiError("CJ_PRODUCT_NOT_FOUND", "Supplier mapping not found.");
  return verifySupplierMapping(mapping);
}

export async function rejectSupplierMappingById(id: string) {
  const mapping = await getSupplierProductMappingById(id);
  if (!mapping || mapping.supplierCode !== "CJ") throw new CjApiError("CJ_PRODUCT_NOT_FOUND", "Supplier mapping not found.");
  return saveSupplierProductMapping({
    ...mapping,
    status: "REJECTED",
    source: mapping.source ?? "CJ API",
  });
}

export async function checkCjMappingStalenessById(id: string) {
  const mapping = await getSupplierProductMappingById(id);
  if (!mapping || mapping.supplierCode !== "CJ") throw new CjApiError("CJ_PRODUCT_NOT_FOUND", "Supplier mapping not found.");
  const product = mapping.supplierProductId
    ? await getCjCatalogueProduct(mapping.supplierProductId)
    : undefined;
  if (!product) return markCjMappingStale(mapping);
  if (
    mapping.supplierVariantId &&
    !product.variants.some((variant) => variant.supplierVariantId === mapping.supplierVariantId)
  ) {
    return markCjMappingStale(mapping);
  }
  return mapping;
}

export async function markCjMappingStale(mapping: SupplierProductMapping) {
  return saveSupplierProductMapping({
    ...mapping,
    status: "STALE",
    source: mapping.source ?? "CJ API",
  });
}

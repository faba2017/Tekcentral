import { createHash } from "node:crypto";
import { CjApiError } from "./cjErrors.js";
import type { CjCategoryNode } from "./cjTypes.js";
import type { SupplierCatalogueProduct, SupplierCatalogueVariant } from "../../types.js";

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  if (/^\s*-/.test(value)) return undefined;
  const first = value.match(/\d+(?:\.\d+)?/)?.[0];
  return first ? Number(first) : undefined;
}

function numericField(item: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    const value = numberValue(item[field]);
    if (value !== undefined) return { field, value };
  }
  return undefined;
}

function currencyField(item: Record<string, unknown>) {
  for (const field of ["currency", "currencyCode"]) {
    const value = text(item[field]);
    if (value) return { field, value: value.toUpperCase() };
  }
  return undefined;
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export function selectCjExactVariantPrice(raw: unknown, quantity = 1) {
  const item = objectValue(raw);
  const tier = (rows: unknown, sourceField: string, classification: "STOCK_UP_PRICE" | "WHOLESALE_PRICE") => {
    const row = arrayValue(rows).map(objectValue).find((candidate) => quantity >= (numberValue(candidate.minimumOrderQuantity) ?? 1) && quantity <= (numberValue(candidate.maximumOrderQuantity) ?? Number.MAX_SAFE_INTEGER) && numberValue(candidate.wholeDiscountPrice ?? candidate.wholePrice) !== undefined);
    return row ? { amount: numberValue(row.wholeDiscountPrice ?? row.wholePrice)!, sourceField, classification } : undefined;
  };
  const wholesale = objectValue(item.wholesalePrice);
  return tier(item.tradePrice, "tradePrice", "STOCK_UP_PRICE")
    ?? tier(wholesale.cjWholesalePrice, "wholesalePrice.cjWholesalePrice", "WHOLESALE_PRICE")
    ?? tier(wholesale.directWholesalePrice, "wholesalePrice.directWholesalePrice", "WHOLESALE_PRICE")
    ?? (numberValue(item.variantSellPrice ?? item.sellprice ?? item.sellPrice) !== undefined ? { amount: numberValue(item.variantSellPrice ?? item.sellprice ?? item.sellPrice)!, sourceField: item.variantSellPrice !== undefined ? "variantSellPrice" : "sellprice", classification: "VARIANT_SELL_PRICE" as const } : undefined);
}

export function applyCjProductDetailPricing(variants: SupplierCatalogueVariant[], raw: unknown) {
  const detailVariants = arrayValue(objectValue(raw).stanProducts ?? objectValue(raw).variants);
  return variants.map((variant) => {
    const detail = detailVariants.map(objectValue).find((candidate) => text(candidate.id ?? candidate.vid) === variant.supplierVariantId);
    const selected = detail ? selectCjExactVariantPrice(detail, 1) : undefined;
    if (!detail || !selected) return variant;
    const capturedAt = new Date().toISOString();
    return { ...variant, price: selected.amount, currency: "USD", currencyEvidence: { currency: "USD", source: "CJ_API_CONTRACT" as const, sourceField: selected.sourceField, sourceReference: "/product/productDetail/query", confidence: "HIGH" as const, confirmedAt: capturedAt }, costEvidence: { amount: selected.amount, currency: "USD", sourceField: selected.sourceField, endpoint: "/product/productDetail/query", classification: selected.classification, confidence: "HIGH" as const, capturedAt, sourceFingerprint: fingerprint(detail) } };
  });
}

function categoryName(item: Record<string, unknown>) {
  return (
    text(item.categoryName ?? item.categoryNameEn) ??
    ([item.oneCategoryName, item.twoCategoryName, item.threeCategoryName]
      .map(text)
      .filter(Boolean)
      .join(" > ") ||
      undefined)
  );
}

export function normalizeCjVariant(raw: unknown): SupplierCatalogueVariant {
  const item = objectValue(raw);
  const embeddedStock = normalizeCjStock(item.inventories);
  const attributes = objectValue(item.variantKeyMap ?? item.variantMap ?? item.attributes);
  const capturedAt = new Date().toISOString();
  const sourceFingerprint = fingerprint(raw);
  const weight = numericField(item, ["variantWeight", "weight"]);
  const length = numericField(item, ["variantLength", "length"]);
  const width = numericField(item, ["variantWidth", "width"]);
  const height = numericField(item, ["variantHeight", "height"]);
  const currency = currencyField(item);
  const price = numericField(item, ["variantSellPrice", "sellPrice", "price", "nowPrice"]);
  const apiCurrency = price && ["variantSellPrice", "sellPrice"].includes(price.field) ? "USD" : currency?.value;
  const observations = [
    weight && { field: weight.field, value: weight.value, unit: "g" as const, classification: "SHIPPING" as const, confidence: "HIGH" as const, sourceFingerprint, capturedAt },
    length && { field: length.field, value: length.value, unit: "mm" as const, classification: "PRODUCT" as const, confidence: "MEDIUM" as const, sourceFingerprint, capturedAt },
    width && { field: width.field, value: width.value, unit: "mm" as const, classification: "PRODUCT" as const, confidence: "MEDIUM" as const, sourceFingerprint, capturedAt },
    height && { field: height.field, value: height.value, unit: "mm" as const, classification: "PRODUCT" as const, confidence: "MEDIUM" as const, sourceFingerprint, capturedAt },
  ].filter((value): value is NonNullable<typeof value> => Boolean(value && value.value > 0));
  const hasDimensions = [length, width, height].every((value) => value && value.value > 0);
  return {
    supplierVariantId: text(item.vid ?? item.id ?? item.variantId) ?? "",
    supplierVariantSku: text(item.variantSku ?? item.sku),
    supplierProductId: text(item.pid ?? item.productId),
    supplierProductSku: text(item.productSku),
    name: text(item.variantNameEn ?? item.variantName ?? item.nameEn ?? item.name),
    attributes: Object.fromEntries(
      Object.entries(attributes).map(([key, value]) => [key, String(value)]),
    ),
    price: price?.value,
    currency: apiCurrency,
    currencyEvidence: { currency: apiCurrency, source: apiCurrency === "USD" && price && ["variantSellPrice", "sellPrice"].includes(price.field) ? "CJ_API_CONTRACT" : currency ? "API_FIELD" : "UNKNOWN", sourceField: price && ["variantSellPrice", "sellPrice"].includes(price.field) ? price.field : currency?.field, sourceReference: apiCurrency === "USD" ? "/product/variant/query" : undefined, confidence: apiCurrency ? "HIGH" : "LOW", confirmedAt: capturedAt },
    costEvidence: price ? { amount: price.value, currency: apiCurrency, sourceField: price.field, endpoint: "/product/variant/query", classification: ["variantSellPrice", "sellPrice"].includes(price.field) ? "VARIANT_SELL_PRICE" : "UNKNOWN_PRICE_TYPE", confidence: "HIGH", capturedAt, sourceFingerprint } : undefined,
    weight: weight?.value,
    lengthMm: length?.value,
    widthMm: width?.value,
    heightMm: height?.value,
    imageUrl: text(item.variantImage ?? item.image ?? item.bigImage),
    stockTotal: numberValue(item.totalInventoryNum ?? item.storageNum ?? item.inventoryNum ?? item.inventory) ?? (embeddedStock.stockByWarehouse.length > 0 ? embeddedStock.stockTotal : undefined),
    stockByWarehouse: embeddedStock.stockByWarehouse.length > 0 ? embeddedStock.stockByWarehouse : undefined,
    rawSourceFingerprint: sourceFingerprint,
    identityEvidence: {
      status: "VARIANT_REVIEW_REQUIRED",
      source: "CJ_API",
      evidence: [text(item.vid ?? item.id ?? item.variantId) ? "Exact CJ VID returned; sellable variant meaning still requires staff review." : "CJ VID missing."],
      reviewedAt: capturedAt,
    },
    logisticsEvidence: {
      observations,
      status: weight && hasDimensions ? "COMPLETE" : weight || hasDimensions ? "PARTIAL" : "MISSING",
      reviewedAt: capturedAt,
    },
    evidenceHistory: [{ endpoint: "/product/variant/query", capturedAt, sourceFingerprint, fields: Object.keys(item).sort() }],
  };
}

export function normalizeCjProduct(raw: unknown, variants: SupplierCatalogueVariant[] = []): SupplierCatalogueProduct {
  const item = objectValue(raw);
  const pid = text(item.pid ?? item.id ?? item.productId);
  if (!pid) {
    throw new CjApiError(
      "CJ_INVALID_RESPONSE",
      "CJ product response is missing product identity.",
    );
  }
  const productSku = text(item.productSku ?? item.sku ?? item.productCode ?? item.spu);
  const embeddedVariants = arrayValue(item.variants ?? item.variantList ?? item.variantListV2).map(normalizeCjVariant);
  const mergedVariants = variants.length ? variants : embeddedVariants;
  const price = numericField(item, ["sellPrice", "nowPrice", "price"]);
  const currency = currencyField(item);
  const apiCurrency = price && ["sellPrice", "nowPrice"].includes(price.field) ? "USD" : currency?.value;
  const capturedAt = new Date().toISOString();
  return {
    supplierCode: "CJ",
    supplierProductId: pid,
    supplierSku: productSku,
    supplierProductName: text(item.productNameEn ?? item.nameEn ?? item.productName ?? item.name) ?? `CJ product ${pid}`,
    brand: text(item.brandName ?? item.brand),
    manufacturer: text(item.manufacturer),
    manufacturerPartNumber: text(item.mpn ?? item.manufacturerPartNumber),
    model: text(item.model),
    gtin: text(item.gtin ?? item.barcode),
    ean: text(item.ean),
    upc: text(item.upc),
    categoryId: text(item.categoryId ?? item.categoryIdPath),
    categoryName: categoryName(item),
    description: text(item.description ?? item.descriptionEn),
    imageUrl: text(item.bigImage ?? item.productImage ?? item.image),
    weight: numberValue(item.weight ?? item.productWeight),
    supplierPrice: price?.value,
    currency: apiCurrency,
    currencyEvidence: {
      currency: apiCurrency,
      source: apiCurrency === "USD" && price && ["sellPrice", "nowPrice"].includes(price.field) ? "CJ_API_CONTRACT" : currency ? "API_FIELD" : "UNKNOWN",
      sourceField: price?.field ?? currency?.field,
      sourceReference: apiCurrency === "USD" ? "/product/query" : undefined,
      confirmedAt: capturedAt,
      confidence: apiCurrency ? "HIGH" : "LOW",
    },
    stockTotal: numberValue(item.totalInventoryNum ?? item.storageNum),
    variants: mergedVariants,
    sourceUpdatedAt: text(item.updateTime ?? item.updatedAt),
    importedAt: new Date().toISOString(),
    lastFetchedAt: new Date().toISOString(),
    lastSuccessfulRefreshAt: new Date().toISOString(),
    rawSourceFingerprint: fingerprint(raw),
    evidenceHistory: [{ endpoint: "/product/query", capturedAt, sourceFingerprint: fingerprint(raw), fields: Object.keys(item).sort() }],
  };
}

export function normalizeCjStock(raw: unknown) {
  const rows = arrayValue(raw);
  const stockByWarehouse = rows.map((row) => {
    const item = objectValue(row);
    return {
      warehouseId: text(item.areaId ?? item.stockId),
      warehouseName: text(item.areaEn ?? item.area ?? item.storageName),
      countryCode: text(item.countryCode),
      quantity: numberValue(item.totalInventoryNum ?? item.storageNum ?? item.inventoryNum ?? item.inventory) ?? 0,
    };
  });
  return {
    stockTotal: stockByWarehouse.reduce((sum, item) => sum + item.quantity, 0),
    stockByWarehouse,
  };
}

export function extractProductList(data: unknown) {
  const root = objectValue(data);
  const content = arrayValue(root.content);
  if (content.length > 0) {
    return content.flatMap((entry) => {
      const group = objectValue(entry);
      return arrayValue(group.productList);
    });
  }
  return arrayValue(root.productList ?? root.list ?? root.records ?? data);
}

export function normalizeCjCategories(raw: unknown): CjCategoryNode[] {
  return arrayValue(raw)
    .map((first): CjCategoryNode | undefined => {
      const firstItem = objectValue(first);
      const firstName = text(firstItem.categoryFirstName ?? firstItem.name);
      if (!firstName) return undefined;
      const children = arrayValue(firstItem.categoryFirstList)
        .map((second): CjCategoryNode | undefined => {
          const secondItem = objectValue(second);
          const secondName = text(secondItem.categorySecondName ?? secondItem.name);
          if (!secondName) return undefined;
          return {
            categoryId: text(secondItem.categoryId),
            name: secondName,
            level: 2,
            children: arrayValue(secondItem.categorySecondList)
              .map((third): CjCategoryNode | undefined => {
                const thirdItem = objectValue(third);
                const thirdName = text(thirdItem.categoryName ?? thirdItem.name);
                if (!thirdName) return undefined;
                return {
                  categoryId: text(thirdItem.categoryId),
                  name: thirdName,
                  level: 3,
                  children: [],
                };
              })
              .filter((item): item is CjCategoryNode => Boolean(item)),
          };
        })
        .filter((item): item is CjCategoryNode => Boolean(item));
      return {
        categoryId: text(firstItem.categoryId),
        name: firstName,
        level: 1,
        children,
      };
    })
    .filter((item): item is CjCategoryNode => Boolean(item));
}

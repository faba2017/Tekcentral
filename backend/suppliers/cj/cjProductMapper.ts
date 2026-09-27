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
  const first = value.match(/\d+(?:\.\d+)?/)?.[0];
  return first ? Number(first) : undefined;
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
  const attributes = objectValue(item.variantKeyMap ?? item.variantMap ?? item.attributes);
  return {
    supplierVariantId: text(item.vid ?? item.id ?? item.variantId) ?? "",
    supplierVariantSku: text(item.variantSku ?? item.sku),
    supplierProductId: text(item.pid ?? item.productId),
    supplierProductSku: text(item.productSku),
    name: text(item.variantNameEn ?? item.variantName ?? item.nameEn ?? item.name),
    attributes: Object.fromEntries(
      Object.entries(attributes).map(([key, value]) => [key, String(value)]),
    ),
    price: numberValue(item.variantSellPrice ?? item.sellPrice ?? item.price ?? item.nowPrice),
    currency: text(item.currency ?? item.currencyCode),
    weight: numberValue(item.variantWeight ?? item.weight),
    imageUrl: text(item.variantImage ?? item.image ?? item.bigImage),
    stockTotal: numberValue(item.totalInventoryNum ?? item.storageNum ?? item.inventory),
    rawSourceFingerprint: fingerprint(raw),
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
  const price = numberValue(item.sellPrice ?? item.nowPrice ?? item.price);
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
    supplierPrice: price,
    currency: text(item.currency ?? item.currencyCode),
    stockTotal: numberValue(item.totalInventoryNum ?? item.storageNum),
    variants: mergedVariants,
    sourceUpdatedAt: text(item.updateTime ?? item.updatedAt),
    importedAt: new Date().toISOString(),
    lastFetchedAt: new Date().toISOString(),
    lastSuccessfulRefreshAt: new Date().toISOString(),
    rawSourceFingerprint: fingerprint(raw),
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
      quantity: numberValue(item.totalInventoryNum ?? item.storageNum ?? item.inventory) ?? 0,
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

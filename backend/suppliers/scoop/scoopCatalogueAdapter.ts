import { createHash } from "node:crypto";
import type { SupplierOffer } from "../../supplierDomain.js";
import type { SupplierProductMapping } from "../../types.js";
import { syncScoopCatalogueProducts } from "./scoopCatalogueRepository.js";
import type { ScoopCatalogueProduct, ScoopFeedParseResult } from "./scoopTypes.js";

export const SCOOP_XML_FEED_URL = "https://scoop.co.za/scoop_pricelist.xml";
const SCOOP_VAT_RATE = 0.15;
const FEED_TIMEOUT_MS = 20_000;

export class ScoopFeedError extends Error {
  constructor(
    public code: "SCOOP_FEED_UNAVAILABLE" | "SCOOP_FEED_INVALID",
    message: string,
  ) {
    super(message);
  }
}

const fieldAliases = {
  sku: ["sku"],
  description: ["description"],
  cpt: ["cpt"],
  jhb: ["jhb"],
  dbn: ["dbn"],
  totalStock: ["totalstock", "total"],
  dealerPrice: ["dealerprice", "dealer"],
  retailPrice: ["retailprice", "retail"],
  manufacturer: ["manufacturer", "brand"],
  imageUrl: ["imageurl", "image", "imagepath", "mainimage"],
};

function canonicalKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function parseMoney(value: string | undefined) {
  if (!value) return undefined;
  const cleaned = value.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseStock(value: string | undefined) {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}

function fieldValue(fields: Map<string, string>, aliases: string[]) {
  for (const alias of aliases) {
    const value = fields.get(alias);
    if (value !== undefined) return value;
  }
  return undefined;
}

function parseChildFields(block: string) {
  const fields = new Map<string, string>();
  const tagRegex = /<([A-Za-z_][\w:.-]*)\b[^>]*>([\s\S]*?)<\/\1>/g;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(block))) {
    const key = canonicalKey(match[1].split(":").pop() ?? match[1]);
    const cdataUnwrapped = match[2].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
    const value = decodeXml(cdataUnwrapped.replace(/<[^>]+>/g, ""));
    if (value) fields.set(key, value);
  }
  return fields;
}

function extractRootTag(xml: string) {
  const withoutDeclaration = xml.replace(/^\s*<\?xml[\s\S]*?\?>/, "").trim();
  return withoutDeclaration.match(/^<([A-Za-z_][\w:.-]*)\b/)?.[1];
}

function extractFeedTimestamp(xml: string) {
  const fields = parseChildFields(xml.slice(0, Math.min(xml.length, 4000)));
  return (
    fieldValue(fields, ["generatedat", "generated", "createdat", "timestamp", "date", "reportdate"]) ??
    undefined
  );
}

export function parseScoopPricelistXml(xml: string): ScoopFeedParseResult {
  const rootTag = extractRootTag(xml);
  const products: ScoopFeedParseResult["products"] = [];
  let itemTag: string | undefined;
  const seenSkus = new Set<string>();
  const sourceFeedTimestamp = extractFeedTimestamp(xml);
  const visitBlocks = (source: string, depth = 0) => {
    if (depth > 6) return;
    const blockRegex = /<([A-Za-z_][\w:.-]*)\b[^>]*>([\s\S]*?)<\/\1>/g;
    let match: RegExpExecArray | null;
    while ((match = blockRegex.exec(source))) {
      const fields = parseChildFields(match[2]);
      const sku = fieldValue(fields, fieldAliases.sku)?.trim();
      const description = fieldValue(fields, fieldAliases.description)?.trim();
      const knownFieldCount = Object.values(fieldAliases).filter((aliases) =>
        fieldValue(fields, aliases),
      ).length;
      if (sku && description && knownFieldCount >= 5 && !seenSkus.has(sku)) {
        seenSkus.add(sku);
        itemTag ??= match[1];
        const cpt = parseStock(fieldValue(fields, fieldAliases.cpt));
        const jhb = parseStock(fieldValue(fields, fieldAliases.jhb));
        const dbn = parseStock(fieldValue(fields, fieldAliases.dbn));
        const totalStock = parseStock(fieldValue(fields, fieldAliases.totalStock));
        const dealerPriceExVat = parseMoney(fieldValue(fields, fieldAliases.dealerPrice));
        const retailPriceInclVat = parseMoney(fieldValue(fields, fieldAliases.retailPrice));
        const now = new Date().toISOString();
        products.push({
          supplierId: "SCOOP",
          supplierSku: sku,
          description,
          manufacturer: fieldValue(fields, fieldAliases.manufacturer)?.trim() || undefined,
          imageUrl: fieldValue(fields, fieldAliases.imageUrl)?.trim() || undefined,
          branchStock: {
            ...(cpt !== undefined ? { CPT: cpt } : {}),
            ...(jhb !== undefined ? { JHB: jhb } : {}),
            ...(dbn !== undefined ? { DBN: dbn } : {}),
          },
          ...(totalStock !== undefined ? { totalStock } : {}),
          availability:
            totalStock === undefined ? "UNKNOWN" : totalStock > 0 ? "AVAILABLE" : "OUT_OF_STOCK",
          ...(dealerPriceExVat !== undefined
            ? {
                dealerPriceExVat,
                dealerVatAmount: Number((dealerPriceExVat * SCOOP_VAT_RATE).toFixed(2)),
                dealerPriceInclVat: Number((dealerPriceExVat * (1 + SCOOP_VAT_RATE)).toFixed(2)),
              }
            : {}),
          ...(retailPriceInclVat !== undefined ? { retailPriceInclVat } : {}),
          currency: "ZAR",
          vatRate: SCOOP_VAT_RATE,
          priceSemantics: {
            dealerPrice: "EXCLUDING_VAT",
            retailPrice: "INCLUDING_VAT",
          },
          sourceMetadata: {
            feedUrl: SCOOP_XML_FEED_URL,
            xmlRootTag: rootTag,
            xmlItemTag: match[1],
            sourceFields: Object.fromEntries(fields.entries()),
          },
          sourceObservations: [{
            sourceType: "XML_FEED",
            sourceReference: SCOOP_XML_FEED_URL,
            firstSeenAt: now,
            lastSeenAt: now,
            lastSuccessfulRefreshAt: now,
            active: true,
            fields: Object.fromEntries(fields.entries()),
          }],
          reconciliationStatus: "XML_ONLY",
          lastSyncedAt: now,
          sourceFeedTimestamp,
        });
      }
      if (/<[A-Za-z_][\w:.-]*\b[^>]*>/.test(match[2])) visitBlocks(match[2], depth + 1);
    }
  };
  visitBlocks(xml);
  if (products.length === 0) {
    throw new ScoopFeedError("SCOOP_FEED_INVALID", "Scoop XML feed did not contain recognizable product rows.");
  }
  return { products, xmlRootTag: rootTag, xmlItemTag: itemTag, sourceFeedTimestamp };
}

export async function fetchScoopPricelistXml(fetchImpl: typeof fetch = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const response = await fetchImpl(SCOOP_XML_FEED_URL, { signal: controller.signal });
    if (!response.ok) {
      throw new ScoopFeedError(
        "SCOOP_FEED_UNAVAILABLE",
        `Scoop XML feed returned HTTP ${response.status}.`,
      );
    }
    return await response.text();
  } catch (error) {
    if (error instanceof ScoopFeedError) throw error;
    throw new ScoopFeedError("SCOOP_FEED_UNAVAILABLE", "Scoop XML feed could not be downloaded.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchAndParseScoopPricelist(fetchImpl: typeof fetch = fetch) {
  return parseScoopPricelistXml(await fetchScoopPricelistXml(fetchImpl));
}

export async function syncScoopCatalogueFromFeed(fetchImpl: typeof fetch = fetch) {
  return syncScoopCatalogueProducts(await fetchAndParseScoopPricelist(fetchImpl));
}

export function scoopProductToSupplierOffer(
  product: ScoopCatalogueProduct,
  mapping?: SupplierProductMapping,
): SupplierOffer {
  return {
    id: `SCOOP:${product.supplierSku}`,
    tekcentralProductId: mapping?.productId ?? "",
    supplierId: "SCOOP",
    supplierSku: product.supplierSku,
    cost: product.dealerPriceExVat ?? null,
    currency: product.currency,
    availability:
      product.availability === "AVAILABLE"
        ? "IN_STOCK"
        : product.availability === "OUT_OF_STOCK"
          ? "OUT_OF_STOCK"
          : "UNKNOWN",
    fulfilmentCapability: "MANUAL",
    mappingStatus: mapping?.status ?? product.mappingStatus,
    lastVerifiedAt: mapping?.verifiedAt ?? product.lastSyncedAt,
    metadata: {
      description: product.description,
      manufacturer: product.manufacturer,
      dealerPriceExVat: product.dealerPriceExVat,
      dealerVatAmount: product.dealerVatAmount,
      dealerPriceInclVat: product.dealerPriceInclVat,
      retailPriceInclVat: product.retailPriceInclVat,
      branchStock: product.branchStock,
      totalStock: product.totalStock,
      imageUrl: product.imageUrl,
      productPageUrl: product.productPageResolution?.productPageUrl,
      productPageResolution: product.productPageResolution,
      logistics: product.logisticsMetadata,
      logisticsSources: product.logisticsSources,
      sourceHash: createHash("sha256").update(JSON.stringify(product.sourceMetadata.sourceFields)).digest("hex"),
    },
  };
}

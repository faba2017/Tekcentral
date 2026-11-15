import { createHash } from "node:crypto";
import { getScoopCatalogueProduct } from "./scoopCatalogueRepository.js";
import { normalizeSpecificationLabel, type PublicProductDocument, type PublicProductSpecification } from "../../productContent.js";

const decode = (value: string) => value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&times;|&#215;/gi, "×").replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"').replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const blockedLabels = /price|dealer|retail|stock|review|rating|related product|package|shipping|carton/i;
const trustedDocumentHosts = ["scoop.co.za", "ui.com", "ubiquiti.com", "reyee.com", "ruijienetworks.com", "cudy.com", "fanvil.com"];

function absoluteUrl(href: string, sourceUrl: string) { try { return new URL(href, sourceUrl); } catch { return undefined; } }
function documentType(title: string): PublicProductDocument["type"] {
  if (/data\s*sheet/i.test(title)) return "DATASHEET";
  if (/quick\s*start/i.test(title)) return "QUICK_START_GUIDE";
  if (/install/i.test(title)) return "INSTALLATION_GUIDE";
  if (/manual|user guide/i.test(title)) return "USER_MANUAL";
  if (/warranty/i.test(title)) return "WARRANTY";
  return "OTHER";
}

export function parseScoopProductContent(content: string, sourceUrl: string) {
  const withoutNoise = content.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<(?:section|div)[^>]*(?:review|related|price)[^>]*>[\s\S]*?<\/(?:section|div)>/gi, " ");
  const text = decode(withoutNoise); const pageSku = text.match(/\bSKU\s*:?\s*([A-Z0-9][A-Z0-9._/-]*)/i)?.[1];
  const detailSection = withoutNoise.match(/<h[1-6][^>]*>\s*(?:Details|Description)\s*<\/h[1-6]>([\s\S]*?)(?=<h[1-6][^>]*>|$)/i)?.[1];
  const overview = detailSection ? decode(detailSection) : undefined;
  const specifications: PublicProductSpecification[] = [];
  for (const match of withoutNoise.matchAll(/<tr[^>]*>[\s\S]*?<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>[\s\S]*?<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>[\s\S]*?<\/tr>/gi)) {
    const name = normalizeSpecificationLabel(decode(match[1])); const value = decode(match[2]);
    if (!name || !value || blockedLabels.test(name)) continue;
    specifications.push({ name, value, group: "Technical specifications", source: "SCOOP_PRODUCT_PAGE", sourceUrl, capturedAt: new Date().toISOString(), origin: "APPROVED_SOURCE_DERIVED" });
  }
  const documents: PublicProductDocument[] = [];
  for (const match of withoutNoise.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = decode(match[2]); const url = absoluteUrl(match[1], sourceUrl);
    if (!url || url.protocol !== "https:" || !trustedDocumentHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)) || (!/\.pdf(?:$|\?)/i.test(url.href) && !/datasheet|manual|guide|warranty/i.test(title))) continue;
    documents.push({ type: documentType(title), title: title || "Product document", url: url.href, verified: true, source: "SCOOP_PRODUCT_PAGE", sourceUrl, capturedAt: new Date().toISOString(), origin: "APPROVED_SOURCE_DERIVED" });
  }
  const uniqueSpecifications = [...new Map(specifications.map((item) => [`${item.name.toLowerCase()}\0${item.value.toLowerCase()}`, item])).values()];
  return { pageSku, brand: uniqueSpecifications.find((item) => item.name === "Brand")?.value, supplierCode: uniqueSpecifications.find((item) => item.name === "Supplier Code")?.value, overview, specifications: uniqueSpecifications, documents: [...new Map(documents.map((item) => [item.url, item])).values()] };
}

export async function previewScoopProductContent(input: { supplierSku: string; sourceUrl: string; content: string }) {
  const product = await getScoopCatalogueProduct(input.supplierSku); if (!product) throw new Error("Scoop product not found.");
  let source: URL; try { source = new URL(input.sourceUrl); } catch { throw new Error("A valid Scoop product URL is required."); }
  if (source.protocol !== "https:" || source.hostname !== "scoop.co.za") throw new Error("Content preview requires a public Scoop product URL.");
  const parsed = parseScoopProductContent(input.content, source.href);
  const exactIdentity = parsed.pageSku?.toUpperCase() === product.supplierSku.toUpperCase();
  return {
    supplierSku: product.supplierSku, sourceUrl: source.href, identityConfidence: exactIdentity ? "HIGH" as const : "LOW" as const,
    blocker: exactIdentity ? undefined : parsed.pageSku ? "IDENTITY_MISMATCH" as const : "IDENTITY_LOW_CONFIDENCE" as const,
    overview: exactIdentity ? parsed.overview : undefined, specifications: exactIdentity ? parsed.specifications : [], documents: exactIdentity ? parsed.documents : [],
    contentFingerprint: createHash("sha256").update(`${source.href}\n${input.content}`).digest("hex"),
  };
}

export function productPhysicalSpecifications(product: Awaited<ReturnType<typeof getScoopCatalogueProduct>>) {
  const metadata = product?.logisticsMetadata; if (!metadata || metadata.status !== "COMPLETE") return [];
  const provenance = { source: metadata.source === "MANUFACTURER" ? "MANUFACTURER" as const : "SCOOP_PRODUCT_PAGE" as const, sourceUrl: metadata.sourceReference, capturedAt: metadata.capturedAt, origin: "APPROVED_SOURCE_DERIVED" as const };
  const result: PublicProductSpecification[] = [];
  if (metadata.lengthMm !== undefined && metadata.widthMm !== undefined && metadata.heightMm !== undefined) result.push({ name: "Dimensions", value: `${metadata.lengthMm} × ${metadata.widthMm} × ${metadata.heightMm} mm`, group: "Physical", ...provenance });
  if (metadata.weightGrams !== undefined) result.push({ name: "Weight", value: metadata.weightGrams >= 1000 ? `${Number((metadata.weightGrams / 1000).toFixed(3))} kg` : `${metadata.weightGrams} g`, group: "Physical", ...provenance });
  return result;
}

export function manufacturerContentDocuments(product: Awaited<ReturnType<typeof getScoopCatalogueProduct>>) {
  const metadata = product?.logisticsMetadata;
  if (metadata?.source !== "MANUFACTURER" || metadata.identityConfidence !== "HIGH" || !metadata.sourceReference) return [];
  let url: URL; try { url = new URL(metadata.sourceReference); } catch { return []; }
  if (url.protocol !== "https:" || !/\.pdf(?:$|\?)/i.test(url.href)) return [];
  return [{ type: "DATASHEET" as const, title: `${metadata.model ?? product?.supplierSku ?? "Product"} datasheet`, url: url.href, verified: true, source: "MANUFACTURER" as const, sourceUrl: url.href, capturedAt: metadata.capturedAt, origin: "APPROVED_SOURCE_DERIVED" as const }];
}

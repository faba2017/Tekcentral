import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { products as codeSeededProducts } from "../../src/data/catalogue.js";
import { catalogueFingerprint, catalogueImportExists, readCatalogueProducts, readPublicationStore, readRows, readSupplierStore, recordCatalogueImport, replaceCatalogueProducts, replaceCategoryMappings, replaceCodeSeededProducts, replaceMappings, replaceMedia, replaceMerchandising, replacePricing, replacePublicationStore, replaceSupplierStore } from "./catalogueRepository.js";
import { query } from "./postgres.js";
export { catalogueFingerprint } from "./catalogueRepository.js";

type Json = Record<string, unknown>;
const read = async <T>(relative: string, fallback: T): Promise<T> => { try { return JSON.parse(await readFile(resolve(process.cwd(), relative), "utf8")) as T; } catch { return fallback; } };
export interface CatalogueSource {
  products: { version: 1; products: Json[] };
  publications: { version: 1; publications: Json[]; drafts: Json[]; audit: Json[] };
  mappings: { version: 1; mappings: Json[] };
  categoryMappings: { version: 1; mappings: Json[] };
  pricing: { version: 1; proposals: Json[] };
  merchandising: { version: 1; sections: Json[]; promotions: Json[]; audit: Json[] };
  media: { version: number; records: Json[] };
  suppliers: Record<"CJ" | "SCOOP" | "SYNTECH" | "TEKCENTRAL", { version: number; products: Json[]; [key: string]: unknown }>;
}
export async function readLegacyCatalogue(): Promise<CatalogueSource> {
  const manual = await read<{ version: number; offers: Json[] }>(".data/supplier-catalogue-tekcentral.json", { version: 2, offers: [] });
  return {
    products: await read(".data/internal-products.json", { version: 1, products: [] }),
    publications: await read(".data/product-publications.json", { version: 1, publications: [], drafts: [], audit: [] }),
    mappings: await read(".data/supplier-product-mappings.json", { version: 1, mappings: [] }),
    categoryMappings: await read(".data/supplier-category-mappings.json", { version: 1, mappings: [] }),
    pricing: await read(".data/pricing-proposals.json", { version: 1, proposals: [] }),
    merchandising: await read(".data/merchandising.json", { version: 1, sections: [], promotions: [], audit: [] }),
    media: await read(".data/public-assets/image-records.json", { version: 2, records: [] }),
    suppliers: {
      CJ: await read(".data/supplier-catalogue-cj.json", { version: 1, products: [] }),
      SCOOP: await read(".data/supplier-catalogue-scoop.json", { version: 1, products: [] }),
      SYNTECH: await read(".data/supplier-catalogue-syntech.json", { version: 1, products: [] }),
      TEKCENTRAL: { version: manual.version, products: manual.offers },
    },
  };
}

export function catalogueSummary(source: CatalogueSource) {
  return { products: source.products.products.length, codeSeededProducts: codeSeededProducts.length, publications: source.publications.publications.length, publicationVersions: source.publications.publications.reduce((sum, row) => sum + ((row.versions as unknown[] | undefined)?.length ?? 0), 0), publicationDrafts: source.publications.drafts.length, mappings: source.mappings.mappings.length, categoryMappings: source.categoryMappings.mappings.length, pricingProposals: source.pricing.proposals.length, merchandisingSections: source.merchandising.sections.length, promotions: source.merchandising.promotions.length, mediaRecords: source.media.records.length, supplierOffers: Object.fromEntries(Object.entries(source.suppliers).map(([key, value]) => [key, value.products.length])) };
}

export async function inspectLegacyMedia(source: CatalogueSource) {
  const seen = new Set<string>(); let duplicateReferences = 0; let brokenMetadata = 0; let missingFiles = 0;
  for (const row of source.media.records) {
    const publicUrl = typeof row.publicUrl === "string" ? row.publicUrl : ""; const productId = typeof row.internalProductId === "string" ? row.internalProductId : "";
    if (!publicUrl || !productId || !row.provenance) brokenMetadata += 1;
    if (seen.has(`${productId}:${publicUrl}`)) duplicateReferences += 1; else seen.add(`${productId}:${publicUrl}`);
    const filename = publicUrl.split("/").pop(); if (!filename) { missingFiles += 1; continue; }
    try { await access(resolve(process.cwd(), ".data", "public-assets", "products", filename)); } catch { try { await access(resolve(process.cwd(), ".data", "object-storage", "public", "products", filename)); } catch { missingFiles += 1; } }
  }
  return { metadataRecords: source.media.records.length, duplicateReferences, brokenMetadata, missingFiles, bytesCopied: 0, byteMigration: "PENDING" as const };
}

export async function destinationCatalogueCounts() {
  const tables = ["catalogue_products", "catalogue_publications", "catalogue_publication_versions", "catalogue_publication_drafts", "catalogue_product_mappings", "catalogue_category_mappings", "catalogue_pricing_proposals", "catalogue_merchandising_sections", "catalogue_promotions", "catalogue_media_records"];
  const counts: Record<string, number> = {};
  for (const table of tables) counts[table] = Number((await query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table}`)).rows[0].count);
  for (const supplier of ["CJ", "SCOOP", "SYNTECH", "TEKCENTRAL"]) counts[`supplier:${supplier}`] = Number((await query<{ count: string }>("SELECT count(*)::text AS count FROM catalogue_supplier_offers WHERE supplier_code=$1", [supplier])).rows[0].count);
  return counts;
}

export async function importCatalogue(source: CatalogueSource) {
  const fingerprint = catalogueFingerprint(source); const summary = catalogueSummary(source);
  if (await catalogueImportExists(fingerprint)) return { imported: false, idempotent: true, fingerprint, summary };
  const destination = await destinationCatalogueCounts();
  if (Object.values(destination).some((count) => count > 0) && !await compatiblePartialImport(source, destination)) throw new Error("Catalogue destination contains data from a different or conflicting import.");
  await replaceCodeSeededProducts(codeSeededProducts); await replaceCatalogueProducts(source.products.products);
  for (const supplier of ["CJ", "SCOOP", "SYNTECH", "TEKCENTRAL"] as const) await replaceSupplierStore(supplier, source.suppliers[supplier]);
  await replaceMappings(source.mappings.mappings); await replaceCategoryMappings(source.categoryMappings.mappings); await replacePricing(source.pricing.proposals); await replacePublicationStore(source.publications); await replaceMerchandising(source.merchandising); await replaceMedia(source.media.records); await recordCatalogueImport(fingerprint, summary);
  return { imported: true, idempotent: false, fingerprint, summary };
}

async function compatiblePartialImport(source: CatalogueSource, counts: Record<string, number>) {
  const match = (left: unknown[], right: unknown[], key: (value: Json) => string) => isDeepStrictEqual(stable(left, key), stable(right, key));
  if (counts.catalogue_products && counts.catalogue_products !== source.products.products.length + codeSeededProducts.length) return false;
  if (counts.catalogue_products && !match(source.products.products, await readCatalogueProducts<Json>(), (row) => String(row.id))) return false;
  for (const code of ["CJ", "SCOOP", "SYNTECH", "TEKCENTRAL"] as const) if (counts[`supplier:${code}`] && !match(source.suppliers[code].products, (await readSupplierStore<Json>(code)).products, (row) => String(row.supplierProductId ?? row.supplierSku ?? row.id))) return false;
  if (counts.catalogue_product_mappings && !match(source.mappings.mappings, await readRows<Json>("catalogue_product_mappings", "id"), (row) => String(row.id))) return false;
  if (counts.catalogue_pricing_proposals && !match(source.pricing.proposals, await readRows<Json>("catalogue_pricing_proposals", "id"), (row) => String(row.id))) return false;
  return true;
}

const stable = (rows: unknown[], key: (value: Json) => string) => [...rows].map((row) => row as Json).sort((a, b) => key(a).localeCompare(key(b)));
const same = (left: unknown, right: unknown) => isDeepStrictEqual(left, right) ? "MATCH" as const : "MISMATCH" as const;
export async function verifyCatalogue(source: CatalogueSource) {
  const products = await readCatalogueProducts<Json>(); const publications = await readPublicationStore<Json>();
  const suppliers = Object.fromEntries(await Promise.all((["CJ", "SCOOP", "SYNTECH", "TEKCENTRAL"] as const).map(async (code) => [code, await readSupplierStore<Json>(code)])));
  const checks = {
    products: same(stable(source.products.products, (x) => String(x.id)), stable(products, (x) => String(x.id))),
    publicationsAndVersions: same(stable(source.publications.publications, (x) => String(x.internalProductId)), stable(publications.publications, (x) => String(x.internalProductId))),
    publicationDrafts: same(stable(source.publications.drafts, (x) => String(x.internalProductId)), stable(publications.drafts, (x) => String(x.internalProductId))),
    mappings: same(stable(source.mappings.mappings, (x) => String(x.id)), stable(await readRows<Json>("catalogue_product_mappings", "id"), (x) => String(x.id))),
    categoryMappings: same(stable(source.categoryMappings.mappings, (x) => String(x.id)), stable(await readRows<Json>("catalogue_category_mappings", "id"), (x) => String(x.id))),
    pricing: same(stable(source.pricing.proposals, (x) => String(x.id)), stable(await readRows<Json>("catalogue_pricing_proposals", "id"), (x) => String(x.id))),
    merchandising: same({ sections: stable(source.merchandising.sections, (x) => String(x.id)), promotions: stable(source.merchandising.promotions, (x) => String(x.id)) }, { sections: stable(await readRows<Json>("catalogue_merchandising_sections", "id"), (x) => String(x.id)), promotions: stable(await readRows<Json>("catalogue_promotions", "id"), (x) => String(x.id)) }),
    mediaMetadata: same(stable(source.media.records, (x) => String(x.publicUrl)), stable(await readRows<Json>("catalogue_media_records", "public_url"), (x) => String(x.publicUrl))),
    supplierOffers: Object.fromEntries(Object.entries(source.suppliers).map(([code, value]) => [code, same(stable(value.products, (x) => String(x.supplierProductId ?? x.supplierSku)), stable((suppliers[code] as { products: Json[] }).products, (x) => String(x.supplierProductId ?? x.supplierSku)))])),
  };
  const foreignKeys = Number((await query<{ count: string }>("SELECT count(*)::text AS count FROM catalogue_product_mappings m LEFT JOIN catalogue_products p ON p.id=m.product_id WHERE p.id IS NULL")).rows[0].count) === 0 ? "MATCH" as const : "MISMATCH" as const;
  return { source: catalogueSummary(source), destination: await destinationCatalogueCounts(), checks: { ...checks, foreignKeys }, success: !JSON.stringify({ ...checks, foreignKeys }).includes("MISMATCH") };
}

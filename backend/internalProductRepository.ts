import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { products as publicProducts } from "../src/data/catalogue.js";
import type { TaxonomyStatus } from "../src/lib/product-taxonomy.js";
import { withCanonicalTaxonomy } from "./canonicalTaxonomyService.js";
import { loadPersistenceConfig } from "./persistence/config.js";
import { readCatalogueProducts, replaceCatalogueProducts } from "./persistence/catalogueRepository.js";

export interface InternalProduct {
  id: string;
  slug: string;
  sku: string;
  name: string;
  brand: string;
  model?: string;
  manufacturerPartNumber?: string;
  gtin?: string;
  ean?: string;
  upc?: string;
  category: string;
  categorySlug: string;
  subcategory?: string;
  categoryId?: string;
  subcategoryId?: string;
  productTypeId?: string;
  taxonomyVersion?: 1;
  taxonomyStatus?: TaxonomyStatus;
  tags?: string[];
  collections?: string[];
  shortDescription: string;
  description?: string;
  images: string[];
  publicationStatus: "INTERNAL_DRAFT";
  launchSelection?: {
    state: "NOT_SELECTED" | "SELECTED_FOR_LAUNCH";
    updatedAt: string;
    updatedBy: string;
  };
  createdAt: string;
  updatedAt: string;
  provenance: {
    createdFromSupplierOffer: true;
    sourceSupplier: "SCOOP" | "CJ" | "SYNTECH" | "TEKCENTRAL" | "MUSTEK" | "TVR";
    sourceSupplierOfferId: string;
    sourceSupplierSku: string;
    sourceDescription: string;
    sourceCategory?: { supplierId: string; sourceCategoryId?: string; sourceCategoryPath?: string; sourceCategoryLabel?: string };
    manufacturer?: string;
    sourceImage?: { source: "SCOOP" | "CJ" | "SYNTECH" | "TEKCENTRAL" | "MUSTEK"; originalUrl: string; capturedAt: string };
  };
}

interface Store { version: 1; products: InternalProduct[]; }
const storePath = () => resolve(process.cwd(), ".data", "internal-products.json");
async function readStore(): Promise<Store> { if (loadPersistenceConfig().provider === "POSTGRES") return { version: 1, products: await readCatalogueProducts<InternalProduct>() }; try { const parsed = JSON.parse(await readFile(storePath(), "utf8")) as Store; return parsed.version === 1 && Array.isArray(parsed.products) ? parsed : { version: 1, products: [] }; } catch { return { version: 1, products: [] }; } }
async function writeStore(store: Store) { if (loadPersistenceConfig().provider === "POSTGRES") { await replaceCatalogueProducts(store.products); return; } await mkdir(dirname(storePath()), { recursive: true }); await writeFile(storePath(), JSON.stringify(store, null, 2)); }

export async function listInternalProducts() { return (await readStore()).products; }
export async function getInternalProduct(id: string) { return (await readStore()).products.find((product) => product.id === id); }
export async function getProductCreatedFromOffer(supplierOfferId: string) { return (await readStore()).products.find((product) => product.provenance.sourceSupplierOfferId === supplierOfferId); }
export async function getAdminProductById(id: string): Promise<(typeof publicProducts)[number] | InternalProduct | undefined> { const product = publicProducts.find((item) => item.id === id) ?? await getInternalProduct(id); return product ? withCanonicalTaxonomy(product) : undefined; }
export async function listAdminProducts(): Promise<Array<(typeof publicProducts)[number] | InternalProduct>> { return Promise.all([...publicProducts, ...await listInternalProducts()].map(withCanonicalTaxonomy)); }

export async function saveInternalProduct(input: Omit<InternalProduct, "id" | "createdAt" | "updatedAt">) {
  const store = await readStore();
  if (store.products.some((product) => product.provenance.sourceSupplierOfferId === input.provenance.sourceSupplierOfferId)) throw new Error("PRODUCT_ALREADY_CREATED_FROM_OFFER");
  if ([...publicProducts, ...store.products].some((product) => product.sku?.toLowerCase() === input.sku.trim().toLowerCase())) throw new Error("PRODUCT_SKU_ALREADY_EXISTS");
  const now = new Date().toISOString();
  const baseId = `product-${input.slug}`;
  const id = store.products.some((product) => product.id === baseId) || publicProducts.some((product) => product.id === baseId) ? `${baseId}-${Date.now().toString(36)}` : baseId;
  const product: InternalProduct = { ...input, id, createdAt: now, updatedAt: now };
  store.products.unshift(product); await writeStore(store); return product;
}

export async function setInternalProductLaunchSelection(input: { productId: string; state: "NOT_SELECTED" | "SELECTED_FOR_LAUNCH"; actor?: string }) {
  const store = await readStore();
  const index = store.products.findIndex((product) => product.id === input.productId);
  if (index < 0) return undefined;
  const now = new Date().toISOString();
  store.products[index] = {
    ...store.products[index],
    launchSelection: { state: input.state, updatedAt: now, updatedBy: input.actor?.trim() || "Admin staff" },
    updatedAt: now,
  };
  await writeStore(store);
  return store.products[index];
}

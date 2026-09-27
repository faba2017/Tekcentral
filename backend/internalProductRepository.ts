import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { products as publicProducts } from "../src/data/catalogue.js";

export interface InternalProduct {
  id: string;
  slug: string;
  sku: string;
  name: string;
  brand: string;
  model?: string;
  category: string;
  categorySlug: string;
  subcategory?: string;
  shortDescription: string;
  description?: string;
  images: string[];
  publicationStatus: "INTERNAL_DRAFT";
  createdAt: string;
  updatedAt: string;
  provenance: {
    createdFromSupplierOffer: true;
    sourceSupplier: "SCOOP";
    sourceSupplierOfferId: string;
    sourceSupplierSku: string;
    sourceDescription: string;
    manufacturer?: string;
    sourceImage?: { source: "SCOOP"; originalUrl: string; capturedAt: string };
  };
}

interface Store { version: 1; products: InternalProduct[]; }
const storePath = () => resolve(process.cwd(), ".data", "internal-products.json");
async function readStore(): Promise<Store> { try { const parsed = JSON.parse(await readFile(storePath(), "utf8")) as Store; return parsed.version === 1 && Array.isArray(parsed.products) ? parsed : { version: 1, products: [] }; } catch { return { version: 1, products: [] }; } }
async function writeStore(store: Store) { await mkdir(dirname(storePath()), { recursive: true }); await writeFile(storePath(), JSON.stringify(store, null, 2)); }

export async function listInternalProducts() { return (await readStore()).products; }
export async function getInternalProduct(id: string) { return (await readStore()).products.find((product) => product.id === id); }
export async function getProductCreatedFromOffer(supplierOfferId: string) { return (await readStore()).products.find((product) => product.provenance.sourceSupplierOfferId === supplierOfferId); }
export async function getAdminProductById(id: string) { return publicProducts.find((product) => product.id === id) ?? getInternalProduct(id); }
export async function listAdminProducts() { return [...publicProducts, ...await listInternalProducts()]; }

export async function saveInternalProduct(input: Omit<InternalProduct, "id" | "createdAt" | "updatedAt">) {
  const store = await readStore();
  if (store.products.some((product) => product.provenance.sourceSupplierOfferId === input.provenance.sourceSupplierOfferId)) throw new Error("PRODUCT_ALREADY_CREATED_FROM_OFFER");
  const now = new Date().toISOString();
  const baseId = `product-${input.slug}`;
  const id = store.products.some((product) => product.id === baseId) || publicProducts.some((product) => product.id === baseId) ? `${baseId}-${Date.now().toString(36)}` : baseId;
  const product: InternalProduct = { ...input, id, createdAt: now, updatedAt: now };
  store.products.unshift(product); await writeStore(store); return product;
}

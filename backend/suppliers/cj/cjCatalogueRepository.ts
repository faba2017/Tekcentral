import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { SupplierCatalogueProduct } from "../../types.js";

interface CjCatalogueStore {
  version: 1;
  products: SupplierCatalogueProduct[];
}

function getStorePath() {
  return resolve(process.cwd(), ".data", "supplier-catalogue-cj.json");
}

async function readStore(): Promise<CjCatalogueStore> {
  try {
    const raw = await readFile(getStorePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<CjCatalogueStore>;
    if (parsed.version !== 1 || !Array.isArray(parsed.products)) {
      return { version: 1, products: [] };
    }
    return { version: 1, products: parsed.products };
  } catch {
    return { version: 1, products: [] };
  }
}

async function writeStore(store: CjCatalogueStore) {
  const storePath = getStorePath();
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2));
}

export async function listCjCatalogueProducts() {
  const store = await readStore();
  return store.products;
}

export async function getCjCatalogueProduct(supplierProductId: string) {
  const store = await readStore();
  return store.products.find((product) => product.supplierProductId === supplierProductId);
}

export async function saveCjCatalogueProduct(product: SupplierCatalogueProduct) {
  const store = await readStore();
  const index = store.products.findIndex(
    (item) => item.supplierProductId === product.supplierProductId,
  );
  if (index >= 0) store.products[index] = { ...store.products[index], ...product };
  else store.products.unshift(product);
  await writeStore(store);
  return product;
}

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { SupplierOrder } from "./types.js";

interface SupplierOrderStore {
  version: 1;
  supplierOrders: SupplierOrder[];
}

function getStorePath() {
  return resolve(process.cwd(), ".data", "supplier-orders.json");
}

async function readStore(): Promise<SupplierOrderStore> {
  try {
    const raw = await readFile(getStorePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<SupplierOrderStore>;
    if (parsed.version !== 1 || !Array.isArray(parsed.supplierOrders)) {
      return { version: 1, supplierOrders: [] };
    }
    return { version: 1, supplierOrders: parsed.supplierOrders };
  } catch {
    return { version: 1, supplierOrders: [] };
  }
}

async function writeStore(store: SupplierOrderStore) {
  const storePath = getStorePath();
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2));
}

export async function saveSupplierOrder(supplierOrder: SupplierOrder) {
  const store = await readStore();
  const index = store.supplierOrders.findIndex((item) => item.id === supplierOrder.id);
  if (index >= 0) store.supplierOrders[index] = supplierOrder;
  else store.supplierOrders.unshift(supplierOrder);
  await writeStore(store);
  return supplierOrder;
}

export async function listSupplierOrders() {
  const store = await readStore();
  return store.supplierOrders;
}

export async function getSupplierOrder(id: string) {
  const store = await readStore();
  return store.supplierOrders.find((item) => item.id === id);
}

export async function updateSupplierOrder(
  id: string,
  updater: (supplierOrder: SupplierOrder) => SupplierOrder,
) {
  const store = await readStore();
  const index = store.supplierOrders.findIndex((item) => item.id === id);
  if (index < 0) return undefined;
  const updated = updater(store.supplierOrders[index]);
  store.supplierOrders[index] = updated;
  await writeStore(store);
  return updated;
}

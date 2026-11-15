import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { SupplierOrder } from "./types.js";
import { loadPersistenceConfig } from "./persistence/config.js";
import { claimPostgresSupplierOrderSubmission, listPostgresSupplierOrders, mutatePostgresSupplierOrder, savePostgresSupplierOrder } from "./persistence/commerceRepository.js";

interface SupplierOrderStore {
  version: 1;
  supplierOrders: SupplierOrder[];
}
let writeQueue = Promise.resolve();

function getStorePath() {
  return resolve(process.cwd(), ".data", "supplier-orders.json");
}

async function readStore(): Promise<SupplierOrderStore> {
  if (loadPersistenceConfig().provider === "POSTGRES") return {version:1,supplierOrders:await listPostgresSupplierOrders()};
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
  if(loadPersistenceConfig().provider==="POSTGRES")return savePostgresSupplierOrder(supplierOrder);
  const run = writeQueue.then(async () => { const store = await readStore(); const index = store.supplierOrders.findIndex((item) => item.id === supplierOrder.id); if (index >= 0) store.supplierOrders[index] = supplierOrder; else store.supplierOrders.unshift(supplierOrder); await writeStore(store); });
  writeQueue = run.catch(() => undefined); await run;
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
  if(loadPersistenceConfig().provider==="POSTGRES")return mutatePostgresSupplierOrder(id,updater);
  let updated: SupplierOrder | undefined;
  const run = writeQueue.then(async () => { const store = await readStore(); const index = store.supplierOrders.findIndex((item) => item.id === id); if (index < 0) return; updated = updater(store.supplierOrders[index]); store.supplierOrders[index] = updated; await writeStore(store); });
  writeQueue = run.catch(() => undefined); await run; return updated;
}

export async function claimSupplierOrderSubmission(id: string, requestFingerprint: string, updater: (supplierOrder: SupplierOrder) => SupplierOrder) {
  if (loadPersistenceConfig().provider === "POSTGRES") return claimPostgresSupplierOrderSubmission(id, requestFingerprint, updater);
  let result: { state: "CLAIMED" | "REUSED" | "BLOCKED"; order: SupplierOrder } | undefined;
  const run = writeQueue.then(async () => {
    const store = await readStore(); const index = store.supplierOrders.findIndex((item) => item.id === id); if (index < 0) return;
    const current = store.supplierOrders[index]; const status = current.externalSubmission?.status;
    if (status === "CREATED") { result = { state: "REUSED", order: current }; return; }
    if (status === "SUBMITTING" || status === "UNKNOWN_RESULT") { result = { state: "BLOCKED", order: current }; return; }
    const next = updater(current); if (next.externalSubmission?.requestFingerprint !== requestFingerprint) throw new Error("Supplier submission claim fingerprint mismatch.");
    store.supplierOrders[index] = next; result = { state: "CLAIMED", order: next }; await writeStore(store);
  });
  writeQueue = run.catch(() => undefined); await run; return result;
}

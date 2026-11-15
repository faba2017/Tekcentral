import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { BackendOrder, PaymentStatus } from "./types.js";
import { loadPersistenceConfig } from "./persistence/config.js";
import { claimPostgresOrder, getPostgresOrderById, listPostgresOrders, mutatePostgresOrder, mutatePostgresOrderForVerifiedPaidTransition, savePostgresOrder, saveProspectivePostgresOrder } from "./persistence/commerceRepository.js";

interface OrderStore {
  version: 1;
  orders: BackendOrder[];
}

let storePathOverride: string | undefined;
let claimWriteQueue = Promise.resolve();
export function setOrderStorePathForTests(path?: string) { storePathOverride = path; claimWriteQueue = Promise.resolve(); }
function getStorePath() { return storePathOverride ?? resolve(process.cwd(), ".data", "orders.json"); }

async function readStore(): Promise<OrderStore> {
  if (!storePathOverride && loadPersistenceConfig().provider === "POSTGRES") return { version: 1, orders: await listPostgresOrders() };
  try {
    const raw = await readFile(getStorePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<OrderStore>;
    if (parsed.version !== 1 || !Array.isArray(parsed.orders)) {
      return { version: 1, orders: [] };
    }
    return { version: 1, orders: parsed.orders };
  } catch {
    return { version: 1, orders: [] };
  }
}

function withOrderDefaults(order: BackendOrder): BackendOrder {
  const payment = { gatewayProvider: "PAYFAST" as const, gatewayReference: order.payment.paymentReference, paymentMethod: "HOSTED_CHECKOUT", amount: order.payment.grossAmount ?? order.total, currency: "ZAR" as const, createdAt: order.createdAt, ...order.payment };
  return {
    ...order,
    payment,
    returns: order.returns ?? [],
    refunds: order.refunds ?? [],
    internalNotes: order.internalNotes ?? [],
    supplierAllocations: order.supplierAllocations ?? [],
    statusHistory: order.statusHistory ?? [],
    operationalHold: order.operationalHold ?? { active: false },
    parcels: order.parcels ?? [],
    shipments: order.shipments ?? [],
  };
}

async function writeStore(store: OrderStore) {
  if (!storePathOverride && loadPersistenceConfig().provider === "POSTGRES") { for (const order of store.orders) await savePostgresOrder(withOrderDefaults(order)); return; }
  const storePath = getStorePath();
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2));
}

export async function saveOrder(order: BackendOrder) {
  if (!storePathOverride && loadPersistenceConfig().provider === "POSTGRES") return savePostgresOrder(withOrderDefaults(order));
  const store = await readStore();
  const normalizedOrder = withOrderDefaults(order);
  const existingIndex = store.orders.findIndex(
    (item) => item.orderNumber === normalizedOrder.orderNumber,
  );
  if (existingIndex >= 0) store.orders[existingIndex] = normalizedOrder;
  else store.orders.unshift(normalizedOrder);
  await writeStore(store);
  return normalizedOrder;
}

export async function saveProspectiveOrder(order: BackendOrder) {
  if (!storePathOverride && loadPersistenceConfig().provider === "POSTGRES") return saveProspectivePostgresOrder(withOrderDefaults(order));
  return saveOrder(order);
}

export async function listOrders() {
  const store = await readStore();
  return store.orders.map(withOrderDefaults);
}

export async function getOrder(orderNumber: string) {
  const store = await readStore();
  const order = store.orders.find((item) => item.orderNumber === orderNumber);
  return order ? withOrderDefaults(order) : undefined;
}

export async function getOrderById(orderId: string) {
  if (!storePathOverride && loadPersistenceConfig().provider === "POSTGRES") {
    const order = await getPostgresOrderById(orderId);
    return order ? withOrderDefaults(order) : undefined;
  }
  const store = await readStore();
  const order = store.orders.find((item) => item.id === orderId);
  return order ? withOrderDefaults(order) : undefined;
}

export async function updateOrder(
  orderNumber: string,
  updater: (order: BackendOrder) => BackendOrder,
) {
  if (!storePathOverride && loadPersistenceConfig().provider === "POSTGRES") return mutatePostgresOrder({ orderNumber }, (order) => withOrderDefaults(updater(withOrderDefaults(order))));
  const store = await readStore();
  const orderIndex = store.orders.findIndex((item) => item.orderNumber === orderNumber);
  if (orderIndex < 0) return undefined;
  const nextOrder = updater(withOrderDefaults(store.orders[orderIndex]));
  store.orders[orderIndex] = withOrderDefaults(nextOrder);
  await writeStore(store);
  return store.orders[orderIndex];
}

export async function updateOrderById(
  orderId: string,
  updater: (order: BackendOrder) => BackendOrder,
) {
  if (!storePathOverride && loadPersistenceConfig().provider === "POSTGRES") return mutatePostgresOrder({ id: orderId }, (order) => withOrderDefaults(updater(withOrderDefaults(order))));
  const store = await readStore();
  const orderIndex = store.orders.findIndex((item) => item.id === orderId);
  if (orderIndex < 0) return undefined;
  const nextOrder = updater(withOrderDefaults(store.orders[orderIndex]));
  store.orders[orderIndex] = withOrderDefaults(nextOrder);
  await writeStore(store);
  return store.orders[orderIndex];
}

export async function updatePaymentStatus(
  orderNumber: string,
  status: PaymentStatus,
  fields: Partial<BackendOrder["payment"]> = {},
) {
  if (!storePathOverride && loadPersistenceConfig().provider === "POSTGRES") return mutatePostgresOrder({ orderNumber }, (order) => { const now=new Date().toISOString();const next=withOrderDefaults({...order,payment:{...order.payment,...fields,status,updatedAt:now},updatedAt:now});if(status==="PAID"&&next.status==="PENDING"){next.status="CONFIRMED";next.statusHistory.push({status:"CONFIRMED",label:"Confirmed",createdAt:now,note:"Payment confirmed by PayFast."});}return next; });
  const store = await readStore();
  const order = store.orders.find((item) => item.orderNumber === orderNumber);
  if (!order) return undefined;
  const now = new Date().toISOString();
  order.payment = {
    ...order.payment,
    ...fields,
    status,
    updatedAt: now,
  };
  order.updatedAt = now;
  if (status === "PAID" && order.status === "PENDING") {
    order.status = "CONFIRMED";
    order.statusHistory.push({
      status: "CONFIRMED",
      label: "Confirmed",
      createdAt: now,
      note: "Payment confirmed by PayFast.",
    });
  }
  await writeStore(store);
  return order;
}

export async function confirmVerifiedPayfastPayment(
  orderNumber: string,
  fields: Partial<BackendOrder["payment"]> = {},
) {
  if (!storePathOverride && loadPersistenceConfig().provider === "POSTGRES") {
    return mutatePostgresOrderForVerifiedPaidTransition(orderNumber, (order) => {
      const now = new Date().toISOString();
      const next = withOrderDefaults({ ...order, payment: { ...order.payment, ...fields, status: "PAID", updatedAt: now }, updatedAt: now });
      if (next.status === "PENDING") {
        next.status = "CONFIRMED";
        next.statusHistory.push({ status: "CONFIRMED", label: "Confirmed", createdAt: now, note: "Payment confirmed by PayFast." });
      }
      return next;
    });
  }
  return updatePaymentStatus(orderNumber, "PAID", fields);
}

export async function claimGuestOrderOwnership(orderNumber: string, customerAccountId: string, now = new Date()) {
  if (!storePathOverride && loadPersistenceConfig().provider === "POSTGRES") return claimPostgresOrder(orderNumber, customerAccountId, now.toISOString());
  let claimed: BackendOrder | undefined;
  const run = claimWriteQueue.then(async () => {
    const store = await readStore();
    const index = store.orders.findIndex((item) => item.orderNumber === orderNumber);
    if (index < 0 || store.orders[index].customerAccountId) return;
    store.orders[index] = withOrderDefaults({ ...store.orders[index], customerAccountId, updatedAt: now.toISOString() });
    claimed = store.orders[index];
    await writeStore(store);
  });
  claimWriteQueue = run.catch(() => undefined);
  await run;
  return claimed;
}

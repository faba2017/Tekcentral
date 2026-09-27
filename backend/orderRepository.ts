import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { BackendOrder, PaymentStatus } from "./types.js";

interface OrderStore {
  version: 1;
  orders: BackendOrder[];
}

function getStorePath() {
  return resolve(process.cwd(), ".data", "orders.json");
}

async function readStore(): Promise<OrderStore> {
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
  return {
    ...order,
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
  const storePath = getStorePath();
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2));
}

export async function saveOrder(order: BackendOrder) {
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

export async function listOrders() {
  const store = await readStore();
  return store.orders.map(withOrderDefaults);
}

export async function getOrder(orderNumber: string) {
  const store = await readStore();
  const order = store.orders.find((item) => item.orderNumber === orderNumber);
  return order ? withOrderDefaults(order) : undefined;
}

export async function updateOrder(
  orderNumber: string,
  updater: (order: BackendOrder) => BackendOrder,
) {
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

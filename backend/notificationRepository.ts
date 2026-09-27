import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type InternalNotificationStatus = "PENDING" | "SENDING" | "SENT" | "FAILED";
export type InternalNotificationType = "SCOOP_ACTION_REQUIRED";

export interface InternalNotification {
  notificationId: string;
  notificationType: InternalNotificationType;
  supplierOrderId: string;
  customerOrderId: string;
  recipient: string;
  status: InternalNotificationStatus;
  createdAt: string;
  attemptedAt?: string;
  sentAt?: string;
  failedAt?: string;
  failureReason?: string;
  retryCount: number;
  idempotencyKey: string;
}

interface NotificationStore { version: 1; notifications: InternalNotification[] }
const storePath = () => resolve(process.cwd(), ".data", "internal-notifications.json");

async function readStore(): Promise<NotificationStore> {
  try {
    const parsed = JSON.parse(await readFile(storePath(), "utf8")) as Partial<NotificationStore>;
    return parsed.version === 1 && Array.isArray(parsed.notifications)
      ? { version: 1, notifications: parsed.notifications }
      : { version: 1, notifications: [] };
  } catch { return { version: 1, notifications: [] }; }
}

async function writeStore(store: NotificationStore) {
  await mkdir(dirname(storePath()), { recursive: true });
  await writeFile(storePath(), JSON.stringify(store, null, 2));
}

export async function getInternalNotificationByKey(idempotencyKey: string) {
  return (await readStore()).notifications.find((item) => item.idempotencyKey === idempotencyKey);
}

export async function getSupplierOrderNotification(supplierOrderId: string, notificationType: InternalNotificationType) {
  return (await readStore()).notifications.find((item) => item.supplierOrderId === supplierOrderId && item.notificationType === notificationType);
}

export async function saveInternalNotification(notification: InternalNotification) {
  const store = await readStore();
  const index = store.notifications.findIndex((item) => item.notificationId === notification.notificationId || item.idempotencyKey === notification.idempotencyKey);
  if (index >= 0) store.notifications[index] = notification;
  else store.notifications.unshift(notification);
  await writeStore(store);
  return notification;
}

export async function updateInternalNotification(notificationId: string, updater: (current: InternalNotification) => InternalNotification) {
  const store = await readStore();
  const index = store.notifications.findIndex((item) => item.notificationId === notificationId);
  if (index < 0) return undefined;
  store.notifications[index] = updater(store.notifications[index]);
  await writeStore(store);
  return store.notifications[index];
}

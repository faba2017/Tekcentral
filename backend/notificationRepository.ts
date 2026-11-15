import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadPersistenceConfig } from "./persistence/config.js";
import { query, withTransaction } from "./persistence/postgres.js";

export type InternalNotificationStatus = "PENDING" | "SENDING" | "SENT" | "FAILED";
export type InternalNotificationType = "SCOOP_ACTION_REQUIRED" | "FX_PRICING_ACTION_REQUIRED" | "FX_PRICING_TEST" | "SETTINGS_NOTIFICATION_TEST";

export interface InternalNotification {
  notificationId: string;
  notificationType: InternalNotificationType;
  supplierOrderId?: string;
  customerOrderId?: string;
  productId?: string;
  impactId?: string;
  impactFingerprint?: string;
  impactClassification?: "REVIEW" | "CRITICAL";
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
  if(loadPersistenceConfig().provider==="POSTGRES")return{version:1,notifications:(await query<{payload:InternalNotification}>("SELECT payload FROM internal_notifications ORDER BY created_at DESC,id")).rows.map(row=>row.payload)};
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

export async function getFxImpactNotification(impactId: string, impactFingerprint: string) {
  return (await readStore()).notifications.find((item) => item.notificationType === "FX_PRICING_ACTION_REQUIRED" && item.impactId === impactId && item.impactFingerprint === impactFingerprint);
}
export async function getLatestNotificationByType(notificationType: InternalNotificationType) { return (await readStore()).notifications.filter((item) => item.notificationType === notificationType).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]; }

export async function saveInternalNotification(notification: InternalNotification) {
  if(loadPersistenceConfig().provider==="POSTGRES"){await query("INSERT INTO internal_notifications(id,type,recipient,idempotency_key,status,safe_metadata,created_at,sent_at,updated_at,payload) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb) ON CONFLICT(id) DO UPDATE SET status=excluded.status,sent_at=excluded.sent_at,updated_at=excluded.updated_at,payload=excluded.payload",[notification.notificationId,notification.notificationType,notification.recipient,notification.idempotencyKey,notification.status,JSON.stringify({supplierOrderId:notification.supplierOrderId,productId:notification.productId}),notification.createdAt,notification.sentAt??null,notification.attemptedAt??notification.createdAt,JSON.stringify(notification)]);return notification;}
  const store = await readStore();
  const index = store.notifications.findIndex((item) => item.notificationId === notification.notificationId || item.idempotencyKey === notification.idempotencyKey);
  if (index >= 0) store.notifications[index] = notification;
  else store.notifications.unshift(notification);
  await writeStore(store);
  return notification;
}

export async function updateInternalNotification(notificationId: string, updater: (current: InternalNotification) => InternalNotification) {
  if(loadPersistenceConfig().provider==="POSTGRES")return withTransaction(async client=>{const found=await client.query<{payload:InternalNotification}>("SELECT payload FROM internal_notifications WHERE id=$1 FOR UPDATE",[notificationId]);if(!found.rows[0])return undefined;const next=updater(found.rows[0].payload);await client.query("UPDATE internal_notifications SET status=$2,sent_at=$3,updated_at=$4,payload=$5::jsonb WHERE id=$1",[notificationId,next.status,next.sentAt??null,next.attemptedAt??next.createdAt,JSON.stringify(next)]);return next;});
  const store = await readStore();
  const index = store.notifications.findIndex((item) => item.notificationId === notificationId);
  if (index < 0) return undefined;
  store.notifications[index] = updater(store.notifications[index]);
  await writeStore(store);
  return store.notifications[index];
}

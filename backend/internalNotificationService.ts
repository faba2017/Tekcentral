import type { BackendOrder, SupplierOrder } from "./types.js";
import { smtpMailTransport, type MailMessage, type MailTransport } from "./mailService.js";
import {
  getInternalNotificationByKey,
  getSupplierOrderNotification,
  saveInternalNotification,
  updateInternalNotification,
  type InternalNotification,
} from "./notificationRepository.js";
import { getOrder } from "./orderRepository.js";
import { getSupplierOrder, updateSupplierOrder } from "./supplierOrderRepository.js";

const notificationType = "SCOOP_ACTION_REQUIRED" as const;
const activeNotificationKeys = new Set<string>();
const activeSends = new Set<string>();
const keyFor = (supplierOrderId: string) => `${notificationType}:${supplierOrderId}`;
const safeFailure = (error: unknown) => error instanceof Error && error.message === "CONFIGURATION_MISSING" ? "CONFIGURATION_MISSING" : "DELIVERY_FAILED";
const money = (value: number, currency: string) => new Intl.NumberFormat("en-ZA", { style: "currency", currency }).format(value);
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export function buildScoopActionRequiredEmail(order: BackendOrder, supplierOrder: SupplierOrder, recipient: string): MailMessage {
  const baseUrl = process.env.APP_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (!baseUrl) throw new Error("CONFIGURATION_MISSING");
  const adminUrl = `${baseUrl}/admin/supplier-orders/${encodeURIComponent(supplierOrder.id)}`;
  const itemCount = supplierOrder.itemLines.reduce((sum, line) => sum + line.quantity, 0);
  const subject = `Action required: Paid TekCentral order ${order.orderNumber}`;
  const text = [
    "ACTION REQUIRED", "", "A paid TekCentral order requires manual Scoop procurement.", "",
    `Order: ${order.orderNumber}`, `Supplier order: ${supplierOrder.id}`, `Items: ${itemCount}`,
    `Customer total: ${money(order.total, order.currency)}`, "Status: Payment confirmed", "",
    "Next action: Open TekCentral Admin, acknowledge the procurement task, approve procurement, then place the order in the Scoop reseller portal.",
    `Open Supplier Order: ${adminUrl}`, `Created: ${supplierOrder.createdAt}`,
  ].join("\n");
  const html = `<h1>ACTION REQUIRED</h1><p>A paid TekCentral order requires manual Scoop procurement.</p><dl><dt>Order</dt><dd>${escapeHtml(order.orderNumber)}</dd><dt>Supplier order</dt><dd>${escapeHtml(supplierOrder.id)}</dd><dt>Items</dt><dd>${itemCount}</dd><dt>Customer total</dt><dd>${escapeHtml(money(order.total, order.currency))}</dd><dt>Status</dt><dd>Payment confirmed</dd></dl><p><strong>Next action:</strong> Open TekCentral Admin, acknowledge the procurement task, approve procurement, then place the order in the Scoop reseller portal.</p><p><a href="${escapeHtml(adminUrl)}">Open Supplier Order</a></p><p>${escapeHtml(supplierOrder.createdAt)}</p>`;
  return { to: recipient, subject, text, html };
}

async function appendNotificationEvent(supplierOrderId: string, type: string, description: string) {
  await updateSupplierOrder(supplierOrderId, (current) => ({ ...current, updatedAt: new Date().toISOString(), events: [...current.events, { timestamp: new Date().toISOString(), type, description }] }));
}

async function sendRecord(record: InternalNotification, order: BackendOrder, supplierOrder: SupplierOrder, transport: MailTransport, retry: boolean) {
  if (activeSends.has(record.notificationId)) return record;
  activeSends.add(record.notificationId);
  try {
  const sending = await updateInternalNotification(record.notificationId, (current) => ({ ...current, status: "SENDING", attemptedAt: new Date().toISOString(), retryCount: current.retryCount + (retry ? 1 : 0), failedAt: undefined, failureReason: undefined }));
  if (!sending) return undefined;
  await appendNotificationEvent(supplierOrder.id, retry ? "NOTIFICATION_RETRIED" : "NOTIFICATION_SEND_ATTEMPTED", retry ? "Operations notification retry started." : "Operations notification send started.");
  try {
    await transport.send(buildScoopActionRequiredEmail(order, supplierOrder, record.recipient));
    const sent = await updateInternalNotification(record.notificationId, (current) => ({ ...current, status: "SENT", sentAt: new Date().toISOString(), failedAt: undefined, failureReason: undefined }));
    await appendNotificationEvent(supplierOrder.id, "NOTIFICATION_SENT", "Operations action-required notification sent.");
    return sent;
  } catch (error) {
    const failureReason = safeFailure(error);
    const failed = await updateInternalNotification(record.notificationId, (current) => ({ ...current, status: "FAILED", failedAt: new Date().toISOString(), failureReason }));
    await appendNotificationEvent(supplierOrder.id, "NOTIFICATION_FAILED", `Operations notification failed: ${failureReason}.`);
    console.error("Internal operations notification failed", { notificationId: record.notificationId, supplierOrderId: supplierOrder.id, failureReason });
    return failed;
  }
  } finally { activeSends.delete(record.notificationId); }
}

export async function notifyNewScoopActionRequired(order: BackendOrder, supplierOrder: SupplierOrder, transport: MailTransport = smtpMailTransport) {
  if (supplierOrder.supplierCode !== "SCOOP" || supplierOrder.status !== "ACTION_REQUIRED") return undefined;
  const idempotencyKey = keyFor(supplierOrder.id);
  if (activeNotificationKeys.has(idempotencyKey)) return getInternalNotificationByKey(idempotencyKey);
  activeNotificationKeys.add(idempotencyKey);
  try {
  const existing = await getInternalNotificationByKey(idempotencyKey);
  if (existing) return existing;
  const now = new Date().toISOString();
  const recipient = process.env.OPERATIONS_NOTIFICATION_EMAIL?.trim() ?? "";
  const record = await saveInternalNotification({ notificationId: `notification-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, notificationType, supplierOrderId: supplierOrder.id, customerOrderId: order.orderNumber, recipient, status: "PENDING", createdAt: now, retryCount: 0, idempotencyKey });
  await appendNotificationEvent(supplierOrder.id, "NOTIFICATION_CREATED", "Operations action-required notification created.");
  if (!recipient) {
    const failed = await updateInternalNotification(record.notificationId, (current) => ({ ...current, status: "FAILED", attemptedAt: now, failedAt: now, failureReason: "CONFIGURATION_MISSING" }));
    await appendNotificationEvent(supplierOrder.id, "NOTIFICATION_FAILED", "Operations notification failed: CONFIGURATION_MISSING.");
    return failed;
  }
  return sendRecord(record, order, supplierOrder, transport, false);
  } finally { activeNotificationKeys.delete(idempotencyKey); }
}

export async function retryScoopActionRequiredNotification(supplierOrderId: string, transport: MailTransport = smtpMailTransport) {
  const supplierOrder = await getSupplierOrder(supplierOrderId);
  const record = await getSupplierOrderNotification(supplierOrderId, notificationType);
  if (!supplierOrder || !record) return undefined;
  if (record.status === "SENT" || record.status === "SENDING") return record;
  const order = await getOrder(supplierOrder.customerOrderNumber);
  if (!order) return undefined;
  const recipient = process.env.OPERATIONS_NOTIFICATION_EMAIL?.trim();
  if (!recipient) return updateInternalNotification(record.notificationId, (current) => ({ ...current, status: "FAILED", attemptedAt: new Date().toISOString(), failedAt: new Date().toISOString(), failureReason: "CONFIGURATION_MISSING", retryCount: current.retryCount + 1 }));
  const refreshed = await updateInternalNotification(record.notificationId, (current) => ({ ...current, recipient }));
  return refreshed ? sendRecord(refreshed, order, supplierOrder, transport, true) : undefined;
}

export { getSupplierOrderNotification };

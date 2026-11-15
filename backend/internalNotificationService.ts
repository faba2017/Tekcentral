import type { BackendOrder, SupplierOrder } from "./types.js";
import { smtpMailTransport, type MailMessage, type MailTransport } from "./mailService.js";
import {
  getInternalNotificationByKey,
  getLatestNotificationByType,
  getSupplierOrderNotification,
  saveInternalNotification,
  updateInternalNotification,
  type InternalNotification,
} from "./notificationRepository.js";
import { getOrder } from "./orderRepository.js";
import { getSupplierOrder, updateSupplierOrder } from "./supplierOrderRepository.js";
import type { FxPricingImpact } from "./fxImpactRepository.js";
import type { PricingProposal } from "./pricingProposalRepository.js";
import { getEffectiveNotificationSettings } from "./businessSettingsRepository.js";

const notificationType = "SCOOP_ACTION_REQUIRED" as const;
const activeNotificationKeys = new Set<string>();
const activeSends = new Set<string>();
const keyFor = (supplierOrderId: string) => `${notificationType}:${supplierOrderId}`;
export function classifyNotificationFailure(error: unknown) {
  const message = error instanceof Error ? error.message.toUpperCase() : "";
  if (message === "CONFIGURATION_MISSING") return "SMTP_CONFIG_MISSING";
  if (/ENOTFOUND|EAI_AGAIN|DNS/.test(message)) return "SMTP_DNS_FAILED";
  if (/SMTP_(535|534|530)|AUTH/.test(message)) return "SMTP_AUTH_FAILED";
  if (/TLS|CERT|SSL/.test(message)) return "SMTP_TLS_FAILED";
  if (/SMTP_(550|551|552|553|554)|RECIPIENT/.test(message)) return "RECIPIENT_REJECTED";
  if (/ECONN|TIMEOUT|SOCKET/.test(message)) return "SMTP_CONNECTION_FAILED";
  if (message.startsWith("SMTP_") || error instanceof Error) return "DELIVERY_FAILED";
  return "UNKNOWN";
}
const money = (value: number, currency: string) => new Intl.NumberFormat("en-ZA", { style: "currency", currency }).format(value);
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const fxNotificationPolicy = () => getEffectiveNotificationSettings();

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

function fxReason(impact: FxPricingImpact) {
  if (impact.reasons.includes("NON_POSITIVE_GROSS_PROFIT")) return "Current gross profit is no longer positive.";
  if (impact.reasons.includes("MARGIN_POLICY_AT_RISK")) return "Current pricing no longer satisfies configured margin or minimum-profit rules.";
  if (impact.classification === "CRITICAL") return "Normalized supplier cost increased materially and requires urgent pricing review.";
  return "Current pricing should be reviewed following a material normalized-cost change.";
}

export function buildFxPricingEmail(impact: FxPricingImpact, proposal: PricingProposal | undefined, recipient: string, options?: { test?: boolean }): MailMessage {
  const baseUrl = process.env.APP_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (!baseUrl) throw new Error("CONFIGURATION_MISSING");
  const adminUrl = `${baseUrl}/admin/pricing?view=fx&search=${encodeURIComponent(impact.productId)}&status=${encodeURIComponent(impact.classification)}`;
  const critical = impact.classification === "CRITICAL";
  const prefix = options?.test ? "TEST — " : "";
  const subject = options?.test
    ? `${prefix}TekCentral FX pricing review alert`
    : `${prefix}${critical ? "TekCentral critical pricing alert" : "TekCentral pricing review required"}: ${impact.productName}`;
  const rows = [
    `Product: ${impact.productName}`,
    `Classification: ${impact.classification}`,
    `Current live/approved price: ${impact.currentRetailPrice === undefined ? "Unavailable" : money(impact.currentRetailPrice, "ZAR")}`,
    `Recommended price: ${impact.recommendedPrice === undefined ? "Unavailable" : money(impact.recommendedPrice, "ZAR")}`,
    `Previous normalized cost: ${money(impact.previousNormalizedCost, "ZAR")}`,
    `Current normalized cost: ${money(impact.currentNormalizedCost, "ZAR")}`,
    `Current margin: ${impact.currentGrossMarginPercent === undefined ? "Unavailable" : `${impact.currentGrossMarginPercent}%`}`,
    `Margin drift: ${impact.marginPointChange === undefined ? "Unavailable" : `${impact.marginPointChange} percentage points`}`,
    `Source currency: ${impact.sourceCurrency}`,
    `FX pair: ${impact.sourceCurrency}/${impact.targetCurrency}`,
    `Current FX rate: ${impact.currentFxRate}`,
    `Reason: ${fxReason(impact)}`,
    proposal ? `Proposal state: ${proposal.status}` : "Proposal state: No new proposal",
    `Review pricing: ${adminUrl}`,
  ];
  if (impact.commercialBaseline === "LIVE") rows.splice(rows.length - 1, 0, "Live storefront price has not been changed.");
  const intro = critical ? "CRITICAL PRICING ACTION REQUIRED" : "PRICING REVIEW REQUIRED";
  const text = [intro, "", ...rows].join("\n");
  const html = `<h1>${escapeHtml(intro)}</h1><dl>${rows.slice(0, -1).map((row) => { const [label, ...value] = row.split(": "); return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value.join(": "))}</dd>`; }).join("")}</dl><p><a href="${escapeHtml(adminUrl)}">Review pricing impact</a></p>`;
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
    const failureReason = classifyNotificationFailure(error);
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
    const failed = await updateInternalNotification(record.notificationId, (current) => ({ ...current, status: "FAILED", attemptedAt: now, failedAt: now, failureReason: "SMTP_CONFIG_MISSING" }));
    await appendNotificationEvent(supplierOrder.id, "NOTIFICATION_FAILED", "Operations notification failed: SMTP_CONFIG_MISSING.");
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
  if (!recipient) {
    const failed = await updateInternalNotification(record.notificationId, (current) => ({ ...current, status: "FAILED", attemptedAt: new Date().toISOString(), failedAt: new Date().toISOString(), failureReason: "SMTP_CONFIG_MISSING", retryCount: current.retryCount + 1 }));
    await appendNotificationEvent(supplierOrder.id, "NOTIFICATION_FAILED", "Operations notification retry failed: SMTP_CONFIG_MISSING.");
    return failed;
  }
  const refreshed = await updateInternalNotification(record.notificationId, (current) => ({ ...current, recipient }));
  return refreshed ? sendRecord(refreshed, order, supplierOrder, transport, true) : undefined;
}

async function sendFxRecord(record: InternalNotification, impact: FxPricingImpact, proposal: PricingProposal | undefined, transport: MailTransport, retry: boolean, test = false) {
  if (activeSends.has(record.notificationId)) return record;
  activeSends.add(record.notificationId);
  try {
    const sending = await updateInternalNotification(record.notificationId, (current) => ({ ...current, status: "SENDING", attemptedAt: new Date().toISOString(), retryCount: current.retryCount + (retry ? 1 : 0), failedAt: undefined, failureReason: undefined }));
    if (!sending) return undefined;
    try {
      await transport.send(buildFxPricingEmail(impact, proposal, record.recipient, { test }));
      return updateInternalNotification(record.notificationId, (current) => ({ ...current, status: "SENT", sentAt: new Date().toISOString(), failedAt: undefined, failureReason: undefined }));
    } catch (error) {
      const failureReason = classifyNotificationFailure(error);
      const failed = await updateInternalNotification(record.notificationId, (current) => ({ ...current, status: "FAILED", failedAt: new Date().toISOString(), failureReason }));
      console.error("FX pricing notification failed", { notificationId: record.notificationId, impactId: impact.id, failureReason });
      return failed;
    }
  } finally { activeSends.delete(record.notificationId); }
}

export async function notifyFxPricingImpact(impact: FxPricingImpact, proposal?: PricingProposal, transport: MailTransport = smtpMailTransport) {
  if (impact.classification !== "REVIEW" && impact.classification !== "CRITICAL") return undefined;
  const policy = await fxNotificationPolicy();
  if (!policy.notifications.fxPricingEmailEnabled || !policy.notifications.fxPricingNotifyOn.includes(impact.classification)) return undefined;
  const idempotencyKey = `FX_PRICING_ACTION_REQUIRED:${impact.id}:${impact.classification}:${impact.fingerprint}`;
  if (activeNotificationKeys.has(idempotencyKey)) return getInternalNotificationByKey(idempotencyKey);
  activeNotificationKeys.add(idempotencyKey);
  try {
    const existing = await getInternalNotificationByKey(idempotencyKey);
    if (existing) return existing;
    const record = await saveInternalNotification({ notificationId: `notification-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, notificationType: "FX_PRICING_ACTION_REQUIRED", productId: impact.productId, impactId: impact.id, impactFingerprint: impact.fingerprint, impactClassification: impact.classification, recipient: policy.notifications.fxPricingRecipientEmail ?? "", status: "PENDING", createdAt: new Date().toISOString(), retryCount: 0, idempotencyKey });
    return sendFxRecord(record, impact, proposal, transport, false);
  } finally { activeNotificationKeys.delete(idempotencyKey); }
}

export async function retryFxPricingNotification(record: InternalNotification, impact: FxPricingImpact, proposal?: PricingProposal, transport: MailTransport = smtpMailTransport) {
  if (!["FX_PRICING_ACTION_REQUIRED", "FX_PRICING_TEST"].includes(record.notificationType) || record.status === "SENT" || record.status === "SENDING") return record;
  return sendFxRecord(record, impact, proposal, transport, true, record.notificationType === "FX_PRICING_TEST");
}

export async function sendControlledFxPricingTest(impact: FxPricingImpact, transport: MailTransport = smtpMailTransport) {
  const now = new Date().toISOString();
  const policy = await fxNotificationPolicy();
  const record = await saveInternalNotification({ notificationId: `notification-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, notificationType: "FX_PRICING_TEST", productId: impact.productId, impactId: impact.id, impactFingerprint: impact.fingerprint, impactClassification: impact.classification === "CRITICAL" ? "CRITICAL" : "REVIEW", recipient: policy.notifications.fxPricingRecipientEmail ?? "", status: "PENDING", createdAt: now, retryCount: 0, idempotencyKey: `FX_PRICING_TEST:${now}` });
  return sendFxRecord(record, impact, undefined, transport, false, true);
}

export async function sendSettingsNotificationTest(transport: MailTransport = smtpMailTransport) {
  const policy = await fxNotificationPolicy(); const recipient = policy.notifications.fxPricingRecipientEmail ?? ""; const now = new Date().toISOString();
  const record = await saveInternalNotification({ notificationId: `notification-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, notificationType: "SETTINGS_NOTIFICATION_TEST", recipient, status: "PENDING", createdAt: now, retryCount: 0, idempotencyKey: `SETTINGS_NOTIFICATION_TEST:${now}` });
  const sending = await updateInternalNotification(record.notificationId, (current) => ({ ...current, status: "SENDING", attemptedAt: new Date().toISOString() })); if (!sending) return undefined;
  try { await transport.send({ to: recipient, subject: "TEST — TekCentral settings notification", text: "This controlled test confirms the currently saved TekCentral notification recipient and SMTP transport.", html: "<h1>TekCentral notification test</h1><p>This controlled test confirms the currently saved notification recipient and SMTP transport.</p>" }); return updateInternalNotification(record.notificationId, (current) => ({ ...current, status: "SENT", sentAt: new Date().toISOString() })); }
  catch (error) { return updateInternalNotification(record.notificationId, (current) => ({ ...current, status: "FAILED", failedAt: new Date().toISOString(), failureReason: classifyNotificationFailure(error) })); }
}
export async function getSettingsNotificationTestStatus() { return getLatestNotificationByType("SETTINGS_NOTIFICATION_TEST"); }

export { getSupplierOrderNotification };

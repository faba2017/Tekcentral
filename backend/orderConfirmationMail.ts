import type { MailMessage } from "./mailService.js";
import type { BackendOrder, PaymentStatus } from "./types.js";
import { publicBusiness } from "../src/lib/public-business.js";

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const money = (value: number, currency: string) => new Intl.NumberFormat("en-ZA", { style: "currency", currency }).format(value);
const date = (value: string) => new Intl.DateTimeFormat("en-ZA", { dateStyle: "long", timeZone: "Africa/Johannesburg" }).format(new Date(value));
const label = (value: string) => value.toLowerCase().replace(/_/g, " ").replace(/^./, (character) => character.toUpperCase());

export function orderConfirmationPaymentCopy(status: PaymentStatus) {
  switch (status) {
    case "PAID": return "Payment has been confirmed. Your order can now progress through processing and fulfilment.";
    case "FAILED": return "Payment was not confirmed. Review your order before attempting payment again.";
    case "CANCELLED": return "The payment attempt was cancelled. Your order remains available for the permitted next step shown in your order view.";
    case "REFUND_PENDING": return "A refund is being processed for this order.";
    case "PARTIALLY_REFUNDED": return "This order has been partially refunded.";
    case "REFUNDED": return "This order has been refunded.";
    case "UNPAID":
    case "PENDING":
    default: return "We are waiting for payment confirmation. We will only progress the order after payment is confirmed.";
  }
}

function publicOrigin(environment: NodeJS.ProcessEnv) {
  const candidate = environment.PUBLIC_APP_URL?.trim() || publicBusiness.websiteUrl;
  try { return new URL(candidate).origin; } catch { return publicBusiness.websiteUrl; }
}

export function renderOrderConfirmation(order: BackendOrder, environment: NodeJS.ProcessEnv = process.env): MailMessage {
  const customerName = `${order.customer.firstName} ${order.customer.lastName}`.trim() || "Customer";
  const paymentCopy = orderConfirmationPaymentCopy(order.payment.status);
  const address = [order.deliveryAddress.streetAddress, order.deliveryAddress.suburb, order.deliveryAddress.city, order.deliveryAddress.province, order.deliveryAddress.postalCode, order.deliveryAddress.country].filter(Boolean);
  const origin = publicOrigin(environment);
  const accountUrl = order.customerAccountId ? `${origin}/account/orders/${encodeURIComponent(order.orderNumber)}` : undefined;
  const logoUrl = `${origin}/images/logo/tekcentral.logo.jpeg`;
  const textItems = order.items.map((item) => `- ${item.name}${item.sku ? ` (${item.sku})` : ""}\n  ${item.quantity} × ${money(item.unitPrice, order.currency)} = ${money(item.lineTotal, order.currency)}`).join("\n");
  const text = [
    publicBusiness.name,
    "Order received",
    `Hello ${customerName},`,
    `We have received order ${order.orderNumber}. This is an order confirmation, not an invoice or payment receipt.`,
    `Order date: ${date(order.createdAt)}`,
    `Order status: ${label(order.status)}`,
    `Payment status: ${label(order.payment.status)}`,
    paymentCopy,
    "Items", textItems,
    `Subtotal: ${money(order.subtotal, order.currency)}`,
    `Delivery: ${money(order.deliveryAmount, order.currency)}`,
    `Total: ${money(order.total, order.currency)}`,
    `Delivery method: ${order.deliveryMethod.name} (${order.deliveryMethod.estimatedRange})`,
    "Delivery address:", ...address,
    ...(accountUrl ? [`View your order: ${accountUrl}`] : ["Keep this order reference for support and secure guest-order access."]),
    `Need help? ${publicBusiness.email.support} · ${publicBusiness.phone.display}`,
    publicBusiness.legalName,
  ].join("\n\n");
  const rows = order.items.map((item) => `<tr><td style="padding:10px 0;border-bottom:1px solid #e4e7ec"><strong>${escapeHtml(item.name)}</strong>${item.sku ? `<br><span style="color:#667085">SKU ${escapeHtml(item.sku)}</span>` : ""}</td><td style="padding:10px;text-align:center;border-bottom:1px solid #e4e7ec">${item.quantity}</td><td style="padding:10px 0;text-align:right;border-bottom:1px solid #e4e7ec">${escapeHtml(money(item.unitPrice, order.currency))}</td><td style="padding:10px 0;text-align:right;border-bottom:1px solid #e4e7ec"><strong>${escapeHtml(money(item.lineTotal, order.currency))}</strong></td></tr>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f5f7f9;color:#101828;font-family:Arial,sans-serif"><div style="max-width:680px;margin:0 auto;padding:24px"><div style="background:#101828;padding:20px 24px;border-radius:12px 12px 0 0"><img src="${escapeHtml(logoUrl)}" alt="TekCentral" width="180" style="display:block;max-width:100%;height:auto"><span style="display:none;color:#fff;font-size:24px;font-weight:700">TekCentral</span></div><div style="background:#fff;padding:28px 24px;border:1px solid #e4e7ec;border-top:0;border-radius:0 0 12px 12px"><p style="margin:0;color:#158574;font-weight:700;text-transform:uppercase;letter-spacing:.08em">Order received</p><h1 style="margin:10px 0 8px;font-size:28px">${escapeHtml(order.orderNumber)}</h1><p>Hello ${escapeHtml(customerName)},</p><p>We have received your order. This message is an order confirmation, not an invoice or payment receipt.</p><div style="background:#f2f4f7;border-radius:8px;padding:16px"><strong>Order date:</strong> ${escapeHtml(date(order.createdAt))}<br><strong>Order status:</strong> ${escapeHtml(label(order.status))}<br><strong>Payment status:</strong> ${escapeHtml(label(order.payment.status))}<p style="margin:10px 0 0">${escapeHtml(paymentCopy)}</p></div><h2 style="margin-top:28px">Items</h2><table role="presentation" style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left">Product</th><th>Qty</th><th style="text-align:right">Unit</th><th style="text-align:right">Total</th></tr></thead><tbody>${rows}</tbody></table><div style="margin:20px 0 0 auto;max-width:300px"><p style="display:flex;justify-content:space-between"><span>Subtotal</span><strong>${escapeHtml(money(order.subtotal, order.currency))}</strong></p><p style="display:flex;justify-content:space-between"><span>Delivery</span><strong>${escapeHtml(money(order.deliveryAmount, order.currency))}</strong></p><p style="display:flex;justify-content:space-between;font-size:20px;border-top:1px solid #e4e7ec;padding-top:12px"><span>Total</span><strong>${escapeHtml(money(order.total, order.currency))}</strong></p></div><h2>Delivery</h2><p><strong>${escapeHtml(order.deliveryMethod.name)}</strong><br>${escapeHtml(order.deliveryMethod.estimatedRange)}</p><p>${address.map(escapeHtml).join("<br>")}</p>${accountUrl ? `<p><a href="${escapeHtml(accountUrl)}" style="display:inline-block;background:#16d9c1;color:#061713;padding:12px 18px;border-radius:7px;text-decoration:none;font-weight:700">View your order</a></p>` : "<p>Keep this order reference for support and secure guest-order access.</p>"}<hr style="border:0;border-top:1px solid #e4e7ec;margin:28px 0"><p style="color:#667085">Need help? <a href="mailto:${escapeHtml(publicBusiness.email.support)}">${escapeHtml(publicBusiness.email.support)}</a> · ${escapeHtml(publicBusiness.phone.display)}</p><p style="color:#667085;font-size:12px">${escapeHtml(publicBusiness.legalName)} · Registration ${escapeHtml(publicBusiness.registrationNumber)}</p></div></div></body></html>`;
  return { to: order.customer.email, fromEmail: publicBusiness.email.support, fromName: publicBusiness.name, replyTo: publicBusiness.email.support, subject: `Order received — ${order.orderNumber}`, text, html };
}

export const orderConfirmationHtmlEscape = escapeHtml;

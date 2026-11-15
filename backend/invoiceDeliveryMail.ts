import type { MailMessage } from "./mailService.js";
import type { CommerceInvoice } from "./persistence/invoiceDeliveryRepository.js";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const money = (value: number) => `R ${value.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (value: string) => new Intl.DateTimeFormat("en-ZA", { dateStyle: "long", timeZone: "Africa/Johannesburg" }).format(new Date(value));

function accountOrderUrl(orderNumber: string, environment: NodeJS.ProcessEnv) {
  const origin = environment.PUBLIC_STOREFRONT_ORIGIN?.trim();
  if (!origin || !/^https?:\/\//i.test(origin)) return undefined;
  return `${origin.replace(/\/$/, "")}/account/orders/${encodeURIComponent(orderNumber)}`;
}

export function renderInvoiceDeliveryEmail(invoice: CommerceInvoice, pdfBytes: Uint8Array, registeredCustomer: boolean, environment: NodeJS.ProcessEnv = process.env): Omit<MailMessage, "to"> {
  const snapshot = invoice.snapshot;
  const customerName = snapshot.customer.name.trim() || "Customer";
  const orderUrl = registeredCustomer ? accountOrderUrl(snapshot.orderNumber, environment) : undefined;
  const subject = `Your TekCentral invoice — ${invoice.invoiceNumber}`;
  const text = [
    `Hello ${customerName},`, "", "Thank you for shopping with TekCentral. Your invoice is attached.", "",
    `Invoice: ${invoice.invoiceNumber}`, `Order: ${snapshot.orderNumber}`, `Invoice date: ${date(invoice.issuedAt)}`,
    `Payment status: Payment confirmed`, `Total: ${money(invoice.total)}`,
    ...(orderUrl ? ["", `View your order: ${orderUrl}`] : []), "", `Need help? ${snapshot.seller.email}${snapshot.seller.phone ? ` · ${snapshot.seller.phone}` : ""}`,
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f5f7f9;color:#101828;font-family:Arial,sans-serif"><div style="max-width:680px;margin:0 auto;padding:24px"><div style="background:#101828;padding:20px 24px;color:#fff;font-size:24px;font-weight:700">TekCentral</div><div style="background:#fff;padding:28px 24px;border:1px solid #e4e7ec"><p style="margin:0;color:#158574;font-weight:700;text-transform:uppercase;letter-spacing:.08em">Invoice attached</p><h1 style="margin:10px 0 8px;font-size:28px">${escapeHtml(invoice.invoiceNumber)}</h1><p>Hello ${escapeHtml(customerName)},</p><p>Thank you for shopping with TekCentral. Your invoice is attached to this email.</p><div style="background:#f2f4f7;border-radius:8px;padding:16px"><strong>Order:</strong> ${escapeHtml(snapshot.orderNumber)}<br><strong>Invoice date:</strong> ${escapeHtml(date(invoice.issuedAt))}<br><strong>Payment status:</strong> Payment confirmed<br><strong>Total:</strong> ${escapeHtml(money(invoice.total))}</div>${orderUrl ? `<p><a href="${escapeHtml(orderUrl)}" style="display:inline-block;background:#16d9c1;color:#061713;padding:12px 18px;border-radius:7px;text-decoration:none;font-weight:700">View your order</a></p>` : ""}<hr style="border:0;border-top:1px solid #e4e7ec;margin:28px 0"><p style="color:#667085">Need help? <a href="mailto:${escapeHtml(snapshot.seller.email)}">${escapeHtml(snapshot.seller.email)}</a>${snapshot.seller.phone ? ` · ${escapeHtml(snapshot.seller.phone)}` : ""}</p></div></div></body></html>`;
  return { subject, text, html, attachments: [{ filename: `${invoice.invoiceNumber}.pdf`, contentType: "application/pdf", bytes: pdfBytes }] };
}

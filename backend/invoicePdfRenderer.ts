import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import PDFDocument from "pdfkit";
import type { InvoiceCommercialSnapshot } from "./persistence/invoiceDeliveryRepository.js";

export const INVOICE_PDF_RENDERER_VERSION = "invoice-pdf-v1";
export const INVOICE_PDF_LOGO_PATH = resolve(process.cwd(), "public", "images", "logo", "tekcentral.logo.jpeg");

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 44;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const CONTENT_BOTTOM = PAGE_HEIGHT - 72;
const INK = "#101828";
const MUTED = "#667085";
const BORDER = "#D0D5DD";
const TEAL = "#469D8B";

export interface InvoicePdfRenderResult {
  bytes: Uint8Array;
  pageCount: number;
  rendererVersion: typeof INVOICE_PDF_RENDERER_VERSION;
}

function safeText(value: unknown, fallback = "—") {
  if (typeof value !== "string") return fallback;
  const normalized = Array.from(value.normalize("NFC"))
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join("")
    .trim();
  return normalized || fallback;
}

function money(value: number) {
  if (!Number.isFinite(value)) throw new Error("INVOICE_PDF_AMOUNT_INVALID");
  return `R ${value.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("INVOICE_PDF_DATE_INVALID");
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(date);
}

function providerLabel(value: string) {
  const safe = safeText(value);
  return safe.toLowerCase() === "payfast" ? "PayFast" : safe;
}

function line(doc: PDFKit.PDFDocument, y: number) {
  doc.strokeColor(BORDER).lineWidth(0.7).moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).stroke();
}

function labelValue(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width: number) {
  doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED).text(label.toUpperCase(), x, y, { width, characterSpacing: 0.4 });
  doc.font("Helvetica").fontSize(9).fillColor(INK).text(value, x, y + 13, { width, lineGap: 2 });
}

function tableHeader(doc: PDFKit.PDFDocument, y: number) {
  doc.save().rect(MARGIN, y, CONTENT_WIDTH, 24).fill("#F2F4F7").restore();
  const columns = [
    { label: "Item", x: MARGIN + 7, width: 225, align: "left" as const },
    { label: "SKU", x: MARGIN + 236, width: 90, align: "left" as const },
    { label: "Qty", x: MARGIN + 330, width: 35, align: "right" as const },
    { label: "Unit price", x: MARGIN + 370, width: 64, align: "right" as const },
    { label: "Total", x: MARGIN + 438, width: 62, align: "right" as const },
  ];
  for (const column of columns) doc.font("Helvetica-Bold").fontSize(8).fillColor(INK).text(column.label, column.x, y + 8, { width: column.width, align: column.align });
  return y + 24;
}

function continuationHeader(doc: PDFKit.PDFDocument, snapshot: InvoiceCommercialSnapshot) {
  doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text("INVOICE — CONTINUED", MARGIN, MARGIN, { width: 260 });
  doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(snapshot.invoiceNumber, PAGE_WIDTH - MARGIN - 170, MARGIN + 2, { width: 170, align: "right" });
  line(doc, MARGIN + 24);
  return tableHeader(doc, MARGIN + 36);
}

function addFooter(doc: PDFKit.PDFDocument, snapshot: InvoiceCommercialSnapshot, page: number, total: number) {
  doc.page.margins.bottom = 20;
  const y = PAGE_HEIGHT - 45;
  line(doc, y - 10);
  doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(`TekCentral · ${snapshot.invoiceNumber}`, MARGIN, y, { width: 260 });
  doc.text(`Page ${page} of ${total}`, PAGE_WIDTH - MARGIN - 120, y, { width: 120, align: "right" });
}

export async function renderInvoicePdf(snapshot: InvoiceCommercialSnapshot, options: { logoPath?: string } = {}): Promise<InvoicePdfRenderResult> {
  if (snapshot.schemaVersion !== 1) throw new Error("INVOICE_SNAPSHOT_VERSION_UNSUPPORTED");
  if (!/^INV-\d{4}-\d{6}$/.test(snapshot.invoiceNumber)) throw new Error("INVOICE_NUMBER_INVALID");
  if (snapshot.currency !== "ZAR") throw new Error("INVOICE_PDF_CURRENCY_UNSUPPORTED");
  if (!snapshot.lines.length) throw new Error("INVOICE_PDF_LINES_REQUIRED");
  let logo: Buffer;
  try { logo = await readFile(options.logoPath ?? INVOICE_PDF_LOGO_PATH); } catch { throw new Error("INVOICE_LOGO_MISSING"); }
  if (logo.length < 4 || logo[0] !== 0xff || logo[1] !== 0xd8 || logo[2] !== 0xff) throw new Error("INVOICE_LOGO_INVALID");

  const issuedDate = new Date(snapshot.issuedAt);
  if (!Number.isFinite(issuedDate.getTime())) throw new Error("INVOICE_PDF_DATE_INVALID");
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGIN, right: MARGIN, bottom: 70, left: MARGIN },
    bufferPages: true,
    compress: true,
    autoFirstPage: true,
    info: { Title: `Invoice ${snapshot.invoiceNumber}`, Author: "TekCentral", Subject: `Order ${snapshot.orderNumber}`, CreationDate: issuedDate, ModDate: issuedDate },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolveBuffer, reject) => { doc.once("end", () => resolveBuffer(Buffer.concat(chunks))); doc.once("error", reject); });

  doc.image(logo, MARGIN, MARGIN, { fit: [154, 72] });
  doc.font("Helvetica-Bold").fontSize(24).fillColor(INK).text("INVOICE", PAGE_WIDTH - MARGIN - 200, MARGIN + 2, { width: 200, align: "right" });
  doc.font("Helvetica-Bold").fontSize(12).fillColor(TEAL).text(snapshot.invoiceNumber, PAGE_WIDTH - MARGIN - 220, MARGIN + 34, { width: 220, align: "right" });
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text("Payment confirmed", PAGE_WIDTH - MARGIN - 200, MARGIN + 54, { width: 200, align: "right" });

  let y = MARGIN + 92;
  line(doc, y);
  y += 18;
  const half = (CONTENT_WIDTH - 24) / 2;
  doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text("Seller", MARGIN, y, { width: half });
  doc.text("Customer / Delivery Address", MARGIN + half + 24, y, { width: half });
  y += 18;
  const sellerLines = [snapshot.seller.legalName, snapshot.seller.registrationNumber ? `Registration No. ${snapshot.seller.registrationNumber}` : undefined, ...snapshot.seller.registeredAddress.lines, snapshot.seller.registeredAddress.country, snapshot.seller.email, snapshot.seller.phone].filter(Boolean).map((item) => safeText(item));
  const customerLines = [snapshot.customer.name, snapshot.customer.companyName, snapshot.customer.vatNumber ? `Customer VAT No. ${snapshot.customer.vatNumber}` : undefined, ...snapshot.deliveryAddress?.lines ?? snapshot.billingAddress.lines, snapshot.deliveryAddress?.country ?? snapshot.billingAddress.country, snapshot.customer.email, snapshot.customer.mobile].filter(Boolean).map((item) => safeText(item));
  const sellerHeight = doc.font("Helvetica").fontSize(9).heightOfString(sellerLines.join("\n"), { width: half, lineGap: 2 });
  const customerHeight = doc.heightOfString(customerLines.join("\n"), { width: half, lineGap: 2 });
  doc.fillColor(INK).text(sellerLines.join("\n"), MARGIN, y, { width: half, lineGap: 2 });
  doc.text(customerLines.join("\n"), MARGIN + half + 24, y, { width: half, lineGap: 2 });
  y += Math.max(sellerHeight, customerHeight) + 20;
  line(doc, y);
  y += 16;

  const refWidth = CONTENT_WIDTH / 4;
  labelValue(doc, "Order", safeText(snapshot.orderNumber), MARGIN, y, refWidth - 8);
  labelValue(doc, "Order date", dateTime(snapshot.orderCreatedAt), MARGIN + refWidth, y, refWidth - 8);
  labelValue(doc, "Invoice date", dateTime(snapshot.issuedAt), MARGIN + refWidth * 2, y, refWidth - 8);
  labelValue(doc, "Payment method", providerLabel(snapshot.payment.provider), MARGIN + refWidth * 3, y, refWidth);
  y += 47;

  y = tableHeader(doc, y);
  for (const item of snapshot.lines) {
    const product = safeText(item.description);
    const sku = safeText(item.sku);
    const rowHeight = Math.max(32, doc.font("Helvetica").fontSize(8.5).heightOfString(product, { width: 218, lineGap: 2 }) + 14, doc.heightOfString(sku, { width: 88, lineGap: 2 }) + 14);
    if (y + rowHeight > CONTENT_BOTTOM) { doc.addPage(); y = continuationHeader(doc, snapshot); }
    doc.font("Helvetica").fontSize(8.5).fillColor(INK).text(product, MARGIN + 7, y + 8, { width: 218, lineGap: 2 });
    doc.text(sku, MARGIN + 236, y + 8, { width: 88, lineGap: 2 });
    doc.text(String(item.quantity), MARGIN + 330, y + 8, { width: 35, align: "right" });
    doc.text(money(item.unitPrice), MARGIN + 370, y + 8, { width: 64, align: "right" });
    doc.font("Helvetica-Bold").text(money(item.lineTotal), MARGIN + 438, y + 8, { width: 62, align: "right" });
    y += rowHeight;
    line(doc, y);
  }

  if (y + 210 > CONTENT_BOTTOM) { doc.addPage(); y = continuationHeader(doc, snapshot) + 18; }
  y += 16;
  const totalsX = PAGE_WIDTH - MARGIN - 220;
  const totalRow = (label: string, value: string, emphasized = false) => {
    doc.font(emphasized ? "Helvetica-Bold" : "Helvetica").fontSize(emphasized ? 12 : 9).fillColor(emphasized ? INK : MUTED).text(label, totalsX, y, { width: 110 });
    doc.fillColor(INK).text(value, totalsX + 110, y, { width: 110, align: "right" });
    y += emphasized ? 25 : 19;
  };
  totalRow("Subtotal", money(snapshot.subtotal));
  totalRow("Delivery", money(snapshot.deliveryAmount));
  line(doc, y - 4);
  y += 6;
  totalRow("Total", money(snapshot.total), true);
  doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text("Amounts reflect the commercial record captured when the order was placed.", totalsX, y, { width: 220, align: "right" });
  y += 34;

  line(doc, y);
  y += 16;
  doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text("Payment received", MARGIN, y, { width: half });
  doc.text("Delivery", MARGIN + half + 24, y, { width: half });
  y += 17;
  const paymentLines = [`Method: ${providerLabel(snapshot.payment.provider)}`, `Amount: ${money(snapshot.total)}`, `Reference: ${safeText(snapshot.payment.reference)}`, `Confirmed: ${dateTime(snapshot.payment.confirmedAt)}`];
  const deliveryLines = [...snapshot.deliveryAddress?.lines ?? snapshot.billingAddress.lines, snapshot.deliveryAddress?.country ?? snapshot.billingAddress.country].map((item) => safeText(item));
  doc.font("Helvetica").fontSize(8.5).fillColor(INK).text(paymentLines.join("\n"), MARGIN, y, { width: half, lineGap: 2 });
  doc.text(deliveryLines.join("\n"), MARGIN + half + 24, y, { width: half, lineGap: 2 });

  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) { doc.switchToPage(index); addFooter(doc, snapshot, index + 1, range.count); }
  doc.end();
  const buffer = await finished;
  if (buffer.length < 5 || buffer.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("INVOICE_PDF_INVALID");
  return { bytes: new Uint8Array(buffer), pageCount: range.count, rendererVersion: INVOICE_PDF_RENDERER_VERSION };
}

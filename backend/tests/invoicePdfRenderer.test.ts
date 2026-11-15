import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { INVOICE_PDF_LOGO_PATH, INVOICE_PDF_RENDERER_VERSION, renderInvoicePdf } from "../invoicePdfRenderer.js";
import type { InvoiceCommercialSnapshot } from "../persistence/invoiceDeliveryRepository.js";

const pdfParse = createRequire(import.meta.url)("pdf-parse") as typeof import("pdf-parse");

const lines = Array.from({ length: 48 }, (_, index) => ({
  productId: `product-${index + 1}`,
  description: index === 0 ? "Professional managed network switch with an intentionally long customer-facing Product name that must wrap safely <script>alert('never')</script>" : `Canonical test Product ${index + 1}`,
  sku: index === 0 ? "TC-LONG-SKU-001<script>" : `TC-${String(index + 1).padStart(4, "0")}`,
  quantity: 1,
  unitPrice: 100 + index,
  lineTotal: 100 + index,
}));
const subtotal = lines.reduce((sum, item) => sum + item.lineTotal, 0);
const snapshot: InvoiceCommercialSnapshot = {
  schemaVersion: 1,
  invoiceNumber: "INV-2026-000901",
  issuedAt: "2026-11-14T10:05:00.000Z",
  orderId: "internal-order-must-not-render",
  orderNumber: "TC-2026-PDF-SAMPLE",
  orderCreatedAt: "2026-11-14T09:55:00.000Z",
  seller: { legalName: "TEKCENTRAL (Pty) Ltd", tradingName: "TekCentral", registrationNumber: "2026/701802/07", registeredAddress: { lines: ["6 Parklands Main Road", "Table View", "Blouberg", "7441"], country: "South Africa" }, email: "info@tekcentral.co.za", phone: "+27 87 351 1146" },
  customer: { name: "José Müller — Safe Test Customer <b>literal</b>", email: "customer@example.test", mobile: "+27 82 000 0000", companyName: "Example Integration Company with a deliberately long registered trading name", vatNumber: "CUSTOMER-VAT-123" },
  billingAddress: { lines: ["123 A deliberately long sample street address for wrapping", "Sample Suburb", "Cape Town", "Western Cape", "8000"], country: "South Africa", source: "DELIVERY_ADDRESS_ONLY" },
  deliveryAddress: { lines: ["123 A deliberately long sample street address for wrapping", "Sample Suburb", "Cape Town", "Western Cape", "8000"], country: "South Africa" },
  lines,
  subtotal,
  deliveryAmount: 0,
  taxAmount: 0,
  total: subtotal,
  currency: "ZAR",
  payment: { provider: "payfast", reference: "SAFE-PAYMENT-REFERENCE", status: "PAID", confirmedAt: "2026-11-14T10:05:00.000Z" },
  taxEvidence: { treatment: "UNRESOLVED" },
};

const first = await renderInvoicePdf(snapshot);
const second = await renderInvoicePdf(structuredClone(snapshot));
assert.equal(first.rendererVersion, INVOICE_PDF_RENDERER_VERSION);
assert.equal(first.pageCount >= 2, true, "large invoice must span multiple pages");
assert.deepEqual(first.bytes, second.bytes, "same snapshot and renderer version must produce deterministic PDF bytes");
assert.equal(createHash("sha256").update(first.bytes).digest("hex"), createHash("sha256").update(second.bytes).digest("hex"));
const parsed = await pdfParse(Buffer.from(first.bytes));
assert.equal(parsed.numpages, first.pageCount);
for (const expected of ["INVOICE", snapshot.invoiceNumber, snapshot.orderNumber, "TEKCENTRAL (Pty) Ltd", "José Müller", "Safe Test Customer", "SAFE-PAYMENT-REFERENCE", `Page ${first.pageCount} of ${first.pageCount}`]) assert.match(parsed.text, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
assert.match(parsed.text.replace(/\s/g, ""), /TC-LONG-SKU-001/i);
assert.match(parsed.text, /R 0[,.]00/);
assert.match(parsed.text, /<script>alert\('never'\)<\/script>/i, "dynamic markup must render as literal text");
for (const forbidden of ["TAX INVOICE", "VAT REGISTERED", "merchant VAT", "supplier cost", "gross margin", "allocation", "passphrase", "signature", "ITN payload", "internal-order-must-not-render"]) assert.equal(parsed.text.toLowerCase().includes(forbidden.toLowerCase()), false, `forbidden PDF content: ${forbidden}`);
assert.equal(first.bytes.length < 1_500_000, true, "moderate multi-page PDF must remain bounded");
await assert.rejects(() => renderInvoicePdf({ ...snapshot, schemaVersion: 2 }), /INVOICE_SNAPSHOT_VERSION_UNSUPPORTED/);
await assert.rejects(() => renderInvoicePdf(snapshot, { logoPath: "/tmp/tekcentral-j4-logo-does-not-exist.jpeg" }), /INVOICE_LOGO_MISSING/);
assert.match(INVOICE_PDF_LOGO_PATH, /public\/images\/logo\/tekcentral\.logo\.jpeg$/);
const sampleDirectory = "/tmp/tekcentral-j4-acceptance";
const samplePath = `${sampleDirectory}/invoice-sample.pdf`;
await mkdir(sampleDirectory, { recursive: true });
await writeFile(samplePath, first.bytes);
console.log(JSON.stringify({ rendererVersion: first.rendererVersion, samplePath, pages: first.pageCount, bytes: first.bytes.length, contentHash: createHash("sha256").update(first.bytes).digest("hex"), parsedText: true, deterministicBytes: true }));

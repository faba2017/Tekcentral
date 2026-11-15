import assert from "node:assert/strict";
import { renderInvoiceDeliveryEmail } from "../invoiceDeliveryMail.js";
import { buildMailMime, validateMailAttachments } from "../mailService.js";
import type { CommerceInvoice } from "../persistence/invoiceDeliveryRepository.js";

const invoice: CommerceInvoice = {
  id: "invoice-mail-test",
  orderId: "order-mail-test",
  invoiceNumber: "INV-2026-000001",
  status: "ISSUED",
  issuedAt: "2026-11-14T10:00:00.000Z",
  currency: "ZAR",
  subtotal: 100,
  deliveryAmount: 20,
  taxAmount: 15.65,
  total: 120,
  paymentReference: "SAFE-REFERENCE",
  snapshotHash: "a".repeat(64),
  snapshotSchemaVersion: 1,
  createdAt: "2026-11-14T10:00:00.000Z",
  snapshot: {
    schemaVersion: 1,
    invoiceNumber: "INV-2026-000001",
    issuedAt: "2026-11-14T10:00:00.000Z",
    orderNumber: "TC-2026-000001",
    seller: { legalName: "TEKCENTRAL (Pty) Ltd", registeredAddress: { lines: ["Registered address"], country: "South Africa" }, email: "support@tekcentral.co.za", phone: "+27 87 351 1146" },
    customer: { name: "<script>alert(1)</script>", email: "customer@example.test" },
    billingAddress: { lines: ["Delivery address"], country: "South Africa" },
    lines: [{ productId: "product-1", description: "Canonical Product", sku: "SKU-1", quantity: 1, unitPrice: 100, lineTotal: 100 }],
    subtotal: 100,
    deliveryAmount: 20,
    taxAmount: 15.65,
    total: 120,
    currency: "ZAR",
    payment: { provider: "payfast", reference: "SAFE-REFERENCE", status: "PAID", confirmedAt: "2026-11-14T10:00:00.000Z" },
  },
};
const pdf = Buffer.from("%PDF-1.4\ncontrolled invoice fixture\n%%EOF");

const registered = renderInvoiceDeliveryEmail(invoice, pdf, true, { PUBLIC_STOREFRONT_ORIGIN: "https://tekcentral.example" });
assert.equal(registered.subject, "Your TekCentral invoice — INV-2026-000001");
assert.match(registered.text, /invoice is attached/i);
assert.match(registered.text, /TC-2026-000001/);
assert.match(registered.text, /Payment status: Payment confirmed/);
assert.match(registered.text, /account\/orders\/TC-2026-000001/);
assert.equal(registered.attachments?.length, 1);
assert.equal(registered.attachments?.[0].filename, "INV-2026-000001.pdf");
assert.equal(registered.attachments?.[0].contentType, "application/pdf");
assert.deepEqual(registered.attachments?.[0].bytes, pdf);
assert.match(registered.html!, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.doesNotMatch(registered.html!, /<script>alert\(1\)<\/script>/);
assert.doesNotMatch(registered.text, /supplier|margin|object key|media object/i);

const guest = renderInvoiceDeliveryEmail(invoice, pdf, false, { PUBLIC_STOREFRONT_ORIGIN: "https://tekcentral.example" });
assert.doesNotMatch(guest.text, /account\/orders|guest.*token|token=/i);
assert.doesNotMatch(guest.html!, /account\/orders|token=/i);
assert.equal(guest.attachments?.length, 1);

const mime = buildMailMime({ ...registered, to: "customer@example.test" }, "invoice-test");
assert.match(mime.contentType, /^multipart\/mixed/);
assert.match(mime.body, /Content-Type: application\/pdf/);
assert.match(mime.body, /Content-Disposition: attachment; filename="INV-2026-000001.pdf"/);
assert.match(mime.body, new RegExp(pdf.toString("base64").slice(0, 20)));

assert.throws(() => validateMailAttachments([{ filename: "unsafe.pdf", contentType: "application/pdf", bytes: pdf }]), /MAIL_ATTACHMENT_INVALID/);
assert.throws(() => validateMailAttachments([{ filename: "INV-2026-000001.pdf", contentType: "application/pdf", bytes: Buffer.from("not a PDF") }]), /MAIL_ATTACHMENT_INVALID/);
assert.throws(() => validateMailAttachments([{ filename: "INV-2026-000001.pdf", contentType: "application/pdf", bytes: Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(2 * 1024 * 1024)]) }]), /MAIL_ATTACHMENT_INVALID/);
assert.throws(() => validateMailAttachments([{ filename: "INV-2026-000001.pdf", contentType: "application/pdf", bytes: pdf }, { filename: "INV-2026-000002.pdf", contentType: "application/pdf", bytes: pdf }]), /MAIL_ATTACHMENT_LIMIT_EXCEEDED/);

console.log("Invoice delivery renderer and bounded PDF attachment tests passed.");

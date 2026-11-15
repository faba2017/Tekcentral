import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ContactRateLimiter, ContactSubmissionError, contactRecipientForCategory, submitContactEnquiry } from "../contactService.js";
import { listContactEnquiries, setContactEnquiryStorePathForTests } from "../contactEnquiryRepository.js";
import type { MailMessage, MailTransport } from "../mailService.js";
import type { BackendOrder } from "../types.js";
import { contactCategories, type ContactSubmissionInput } from "../../src/lib/contact.js";

const directory = await mkdtemp(join(tmpdir(), "tekcentral-contact-"));
const store = join(directory, "contact.json"); setContactEnquiryStorePathForTests(store);
const customer = { id: "customer-1", email: "owner@example.com", firstName: "Owner", lastName: "Customer", status: "ACTIVE" as const, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
const order = { orderNumber: "TC-2026-000001", customerAccountId: customer.id, status: "PROCESSING", payment: { status: "PAID" } } as BackendOrder;
const input: ContactSubmissionInput = { category: "GENERAL_ENQUIRY", name: "  Jane Customer  ", email: " JANE@EXAMPLE.COM ", message: " Please help with my enquiry. ", sourcePage: "/contact" };
const messages: MailMessage[] = [];
const mail: MailTransport = { async send(message) { messages.push(message); } };
const dependency = (overrides: Partial<Parameters<typeof submitContactEnquiry>[1]> = {}) => ({ mail, clientKey: `ip-${Math.random()}`, rateLimiter: new ContactRateLimiter(), getOrder: async (number: string) => number === order.orderNumber ? order : undefined, getProduct: async (id: string) => id === "product-1" ? { id, name: "Public Product", sku: "PUBLIC-SKU", slug: "public-product" } : undefined, ...overrides });

const routing = new Map(contactCategories.map(([category]) => [category, contactRecipientForCategory(category)]));
assert.equal(routing.get("GENERAL_ENQUIRY"), "info@tekcentral.co.za"); assert.equal(routing.get("OTHER"), "info@tekcentral.co.za");
for (const category of ["PRODUCT_QUESTION", "SALES_QUOTE", "BUSINESS_BULK_ORDERS"] as const) assert.equal(routing.get(category), "sales@tekcentral.co.za");
assert.equal(routing.get("PAYMENT_BILLING"), "accounts@tekcentral.co.za");
for (const category of ["ORDER_ASSISTANCE", "DELIVERY_TRACKING", "RETURNS_REFUNDS", "CANCELLATION_REQUEST", "ACCOUNT_LOGIN_HELP", "TECHNICAL_SUPPORT", "ZEUS_AI_HELP"] as const) assert.equal(routing.get(category), "support@tekcentral.co.za");

const accepted = await submitContactEnquiry({ ...input, recipient: "attacker@example.com", customerAccountId: "fake" }, dependency());
assert.equal(accepted.received, true); assert.equal(messages[0].to, "info@tekcentral.co.za"); assert.equal(messages[0].replyTo, "jane@example.com");
let saved = await listContactEnquiries(); assert.equal(saved[0].status, "EMAIL_SENT"); assert.equal(saved[0].name, "Jane Customer"); assert.equal(saved[0].email, "jane@example.com"); assert.equal(saved[0].customerAccountId, undefined);

let persistedBeforeSend = false;
await submitContactEnquiry({ ...input, category: "SALES_QUOTE", email: "sales.customer@example.com", message: "Please prepare a product quotation.", productId: "product-1" }, dependency({ mail: { async send(message) { persistedBeforeSend = (await listContactEnquiries()).some((item) => item.email === "sales.customer@example.com" && item.status === "RECEIVED"); assert.equal(message.to, "sales@tekcentral.co.za"); assert.match(message.text, /Public Product/); assert.doesNotMatch(message.text, /supplier|cost basis|margin|Syntech|Scoop|CJ/i); } } }));
assert.equal(persistedBeforeSend, true);

await submitContactEnquiry({ ...input, category: "PAYMENT_BILLING", email: "billing@example.com", message: "Please explain the billing total.", orderNumber: order.orderNumber }, dependency());
saved = await listContactEnquiries(); assert.equal(saved[0].orderVerified, false); assert.equal(saved[0].customerAccountId, undefined); assert.equal(messages.at(-1)?.to, "accounts@tekcentral.co.za"); assert.match(messages.at(-1)?.text ?? "", /customer-supplied reference only/);

await submitContactEnquiry({ ...input, category: "ORDER_ASSISTANCE", email: customer.email, message: "Please help with this account order.", orderNumber: order.orderNumber, customerAccountId: "attacker" }, dependency({ customer }));
saved = await listContactEnquiries(); assert.equal(saved[0].customerAccountId, customer.id); assert.equal(saved[0].orderVerified, true); assert.match(messages.at(-1)?.text ?? "", /Customer-facing order status: PROCESSING/); assert.match(messages.at(-1)?.text ?? "", /Payment status: PAID/);
await assert.rejects(() => submitContactEnquiry({ ...input, email: "foreign@example.com", message: "Please access a foreign account order.", orderNumber: "TC-2026-999999" }, dependency({ customer })), (error: unknown) => error instanceof ContactSubmissionError && error.code === "ORDER_NOT_FOUND");

await submitContactEnquiry({ ...input, category: "TECHNICAL_SUPPORT", email: "smtp-failure@example.com", message: "This should persist despite email failure." }, dependency({ mail: { async send() { throw new Error("SMTP_550"); } } }));
saved = await listContactEnquiries(); assert.equal(saved[0].status, "EMAIL_FAILED"); assert.equal(saved[0].failureCategory, "SMTP_REJECTED"); assert.equal("recipient" in saved[0], false); assert.equal("smtpPassword" in saved[0], false);

for (const [body, code] of [
  [{ ...input, category: "UNKNOWN" }, "INVALID_CATEGORY"], [{ ...input, name: "" }, "INVALID_NAME"], [{ ...input, email: "invalid" }, "INVALID_EMAIL"],
  [{ ...input, subject: "Injected\nBcc: attacker@example.com" }, "INVALID_SUBJECT"], [{ ...input, message: "short" }, "INVALID_MESSAGE"], [{ ...input, message: "x".repeat(5001) }, "PAYLOAD_LIMIT"], [{ ...input, website: "spam" }, "SUBMISSION_REJECTED"],
] as const) await assert.rejects(() => submitContactEnquiry(body as ContactSubmissionInput, dependency()), (error: unknown) => error instanceof ContactSubmissionError && error.code === code);

const limiter = new ContactRateLimiter();
for (let index = 0; index < 5; index += 1) await submitContactEnquiry({ ...input, email: `limit-${index}@example.com`, message: `Legitimate support message number ${index}.` }, dependency({ clientKey: "rate-ip", rateLimiter: limiter }));
await assert.rejects(() => submitContactEnquiry({ ...input, email: "limit-final@example.com", message: "This request should be rate limited." }, dependency({ clientKey: "rate-ip", rateLimiter: limiter })), (error: unknown) => error instanceof ContactSubmissionError && error.code === "RATE_LIMITED");

const serverSource = await readFile(join(process.cwd(), "backend/server.ts"), "utf8"); const pageSource = await readFile(join(process.cwd(), "src/pages/ContactPage.tsx"), "utf8"); const categorySource = await readFile(join(process.cwd(), "src/lib/contact.ts"), "utf8");
assert.match(serverSource, /url\.pathname === "\/api\/contact"/); assert.match(serverSource, /isTrustedCustomerOrigin\(request\.headers\.origin\)/); assert.match(serverSource, /readBody\(request, 32_000\)/);
assert.match(categorySource, /Returns & Refunds/); assert.match(pageSource, /Cancellation is never automatic/); assert.match(pageSource, /Use Forgot Password/); assert.match(pageSource, /Submit enquiry/);
await rm(directory, { recursive: true, force: true }); setContactEnquiryStorePathForTests();
console.log("Contact enquiry tests passed.");

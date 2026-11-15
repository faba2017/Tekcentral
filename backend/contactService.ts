import { createHash, randomBytes } from "node:crypto";
import type { SafeCustomer } from "./customerAuth.js";
import type { BackendOrder } from "./types.js";
import type { MailTransport } from "./mailService.js";
import { publicBusiness } from "../src/lib/public-business.js";
import { contactCategoryLabels, isContactCategory, type ContactCategory, type ContactSubmissionInput } from "../src/lib/contact.js";
import { listContactEnquiries, saveContactEnquiry, updateContactDelivery, type ContactEnquiry } from "./contactEnquiryRepository.js";
import { loadPersistenceConfig } from "./persistence/config.js";
import { consumeSharedRateLimit } from "./persistence/rateLimit.js";

export class ContactSubmissionError extends Error { constructor(public code: string, message: string, public status = 400) { super(message); } }
const route: Record<ContactCategory, string> = {
  GENERAL_ENQUIRY: publicBusiness.email.general, PRODUCT_QUESTION: publicBusiness.email.sales, SALES_QUOTE: publicBusiness.email.sales,
  ORDER_ASSISTANCE: publicBusiness.email.support, DELIVERY_TRACKING: publicBusiness.email.support, RETURNS_REFUNDS: publicBusiness.email.support,
  CANCELLATION_REQUEST: publicBusiness.email.support, ACCOUNT_LOGIN_HELP: publicBusiness.email.support, PAYMENT_BILLING: publicBusiness.email.accounts,
  BUSINESS_BULK_ORDERS: publicBusiness.email.sales, TECHNICAL_SUPPORT: publicBusiness.email.support, ZEUS_AI_HELP: publicBusiness.email.support, OTHER: publicBusiness.email.general,
};
export const contactRecipientForCategory = (category: ContactCategory) => route[category];
const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const safeHeader = (value: string) => !/[\r\n]/.test(value);
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && safeHeader(value);
const validPhone = (value: string) => !value || (/^[+()\d\s-]{7,25}$/.test(value) && safeHeader(value));
const validOrder = (value: string) => !value || /^TC-\d{4}-\d{6}$/.test(value);
const xml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
const smtpFailure = (error: unknown) => error instanceof Error && error.message === "CONFIGURATION_MISSING" ? "SMTP_CONFIG_MISSING" : error instanceof Error && /^SMTP_\d+$/.test(error.message) ? "SMTP_REJECTED" : "SMTP_DELIVERY_FAILED";
const id = () => `contact-${Date.now().toString(36)}-${randomBytes(5).toString("hex")}`;
const reference = () => `ENQ-${new Date().getFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`;

export class ContactRateLimiter {
  private attempts = new Map<string, number[]>();
  check(keys: string[], now = Date.now()) { for (const key of keys) { const recent = (this.attempts.get(key) ?? []).filter((time) => now - time < 15 * 60_000); if (recent.length >= 5) throw new ContactSubmissionError("RATE_LIMITED", "Too many enquiries have been submitted. Please try again later.", 429); recent.push(now); this.attempts.set(key, recent); } }
}

interface Dependencies {
  mail: MailTransport; customer?: SafeCustomer; clientKey: string; now?: Date; rateLimiter?: ContactRateLimiter;
  getOrder(orderNumber: string): Promise<BackendOrder | undefined>;
  getProduct(productId: string): Promise<{ id: string; name: string; sku?: string; slug?: string } | undefined>;
}
export async function submitContactEnquiry(raw: Partial<ContactSubmissionInput> & { customerAccountId?: string; recipient?: string }, dependencies: Dependencies) {
  const category = raw.category; if (!isContactCategory(category)) throw new ContactSubmissionError("INVALID_CATEGORY", "Select a valid enquiry type.");
  if (raw.website) throw new ContactSubmissionError("SUBMISSION_REJECTED", "We couldn't submit your enquiry.");
  if ((raw.name?.length ?? 0) > 120 || (raw.email?.length ?? 0) > 254 || (raw.phone?.length ?? 0) > 25 || (raw.subject?.length ?? 0) > 160 || (raw.message?.length ?? 0) > 5000 || (raw.orderNumber?.length ?? 0) > 32 || (raw.productId?.length ?? 0) > 120 || (raw.sourcePage?.length ?? 0) > 300) throw new ContactSubmissionError("PAYLOAD_LIMIT", "One or more fields are too long.", 413);
  const name = clean(raw.name, 120); const email = clean(raw.email, 254).toLowerCase(); const phone = clean(raw.phone, 25); const subject = clean(raw.subject, 160); const message = clean(raw.message, 5000); const orderNumber = clean(raw.orderNumber, 32).toUpperCase(); const productId = clean(raw.productId, 120); const sourcePage = clean(raw.sourcePage, 300);
  if (name.length < 2 || !safeHeader(name)) throw new ContactSubmissionError("INVALID_NAME", "Enter your name.");
  if (!validEmail(email)) throw new ContactSubmissionError("INVALID_EMAIL", "Enter a valid email address.");
  if (!validPhone(phone)) throw new ContactSubmissionError("INVALID_PHONE", "Enter a valid phone number.");
  if (subject && !safeHeader(subject)) throw new ContactSubmissionError("INVALID_SUBJECT", "Enter a valid subject.");
  if (message.length < 10) throw new ContactSubmissionError("INVALID_MESSAGE", "Enter at least 10 characters in your message.");
  if (!validOrder(orderNumber)) throw new ContactSubmissionError("INVALID_ORDER", "Enter a valid TekCentral order number.");
  const now = dependencies.now ?? new Date();
  if(dependencies.rateLimiter)dependencies.rateLimiter.check([`client:${dependencies.clientKey}`,`email:${email}`],now.getTime());else if(loadPersistenceConfig().provider==="POSTGRES"){for(const key of [`client:${dependencies.clientKey}`,`email:${email}`]){const result=await consumeSharedRateLimit({keyHash:createHash("sha256").update(`contact:${key}`).digest("hex"),limit:5,windowSeconds:15*60,now});if(!result.allowed)throw new ContactSubmissionError("RATE_LIMITED","Too many enquiries have been submitted. Please try again later.",429);}}else defaultRateLimiter.check([`client:${dependencies.clientKey}`,`email:${email}`],now.getTime());
  let order: BackendOrder | undefined; let orderVerified = false;
  if (orderNumber && dependencies.customer) { order = await dependencies.getOrder(orderNumber); if (!order || order.customerAccountId !== dependencies.customer.id) throw new ContactSubmissionError("ORDER_NOT_FOUND", "This order could not be found in your account.", 404); orderVerified = true; }
  const product = productId ? await dependencies.getProduct(productId) : undefined;
  if (productId && !product) throw new ContactSubmissionError("PRODUCT_NOT_FOUND", "The selected product could not be found.", 404);
  const fingerprint = createHash("sha256").update([category, email, orderNumber, productId, message].join("\0")).digest("hex");
  const recentDuplicate = (await listContactEnquiries()).find((item) => item.requestFingerprint === fingerprint && now.getTime() - Date.parse(item.createdAt) < 60_000);
  if (recentDuplicate) return { reference: recentDuplicate.reference, received: true as const };
  const enquiry: ContactEnquiry = { id: id(), reference: reference(), category, name, email, phone: phone || undefined, subject: subject || undefined, message, customerAccountId: dependencies.customer?.id, orderNumber: orderNumber || undefined, orderVerified, productId: product?.id, sourcePage: sourcePage || undefined, status: "RECEIVED", createdAt: now.toISOString(), requestFingerprint: fingerprint };
  await saveContactEnquiry(enquiry);
  const label = contactCategoryLabels[category]; const suffix = orderNumber || product?.name; const mailSubject = `[TEKCENTRAL] ${label}${suffix ? ` - ${suffix}` : ""}`.replace(/[\r\n]/g, " ");
  const safeOrderContext = orderVerified && order ? `\nOrder verified: yes\nOrder number: ${order.orderNumber}\nCustomer-facing order status: ${order.status}\nPayment status: ${order.payment.status}` : orderNumber ? `\nOrder verified: no (customer-supplied reference only)\nOrder number: ${orderNumber}` : "";
  const productContext = product ? `\nProduct: ${product.name}\nProduct SKU: ${product.sku || "Not recorded"}\nProduct URL: ${publicBusiness.websiteUrl}/product/${encodeURIComponent(product.slug || product.id)}` : "";
  const text = `Enquiry reference: ${enquiry.reference}\nCategory: ${label}\nName: ${name}\nEmail: ${email}\nPhone: ${phone || "Not supplied"}\nAuthenticated customer: ${dependencies.customer ? "yes" : "no"}${safeOrderContext}${productContext}\nSubject: ${subject || "Not supplied"}\nSubmitted: ${enquiry.createdAt}\n\nMessage:\n${message}`;
  const html = `<h1>${xml(label)}</h1><p><strong>Reference:</strong> ${xml(enquiry.reference)}</p><pre style="white-space:pre-wrap;font-family:sans-serif">${xml(text)}</pre>`;
  try { await dependencies.mail.send({ to: contactRecipientForCategory(category), replyTo: email, subject: mailSubject, text, html }); await updateContactDelivery(enquiry.id, { status: "EMAIL_SENT", deliveryAttemptedAt: now.toISOString(), deliveredAt: now.toISOString(), failureCategory: undefined }); console.info("Contact enquiry accepted", { enquiryId: enquiry.id, category, deliveryState: "EMAIL_SENT", timestamp: now.toISOString() }); }
  catch (error) { const failureCategory = smtpFailure(error); await updateContactDelivery(enquiry.id, { status: "EMAIL_FAILED", deliveryAttemptedAt: now.toISOString(), deliveredAt: undefined, failureCategory }); console.error("Contact enquiry email failed", { enquiryId: enquiry.id, category, deliveryState: "EMAIL_FAILED", failureCategory, timestamp: now.toISOString() }); }
  return { reference: enquiry.reference, received: true as const };
}
const defaultRateLimiter = new ContactRateLimiter();

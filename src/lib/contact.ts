export const contactCategories = [
  ["GENERAL_ENQUIRY", "General Enquiry"],
  ["PRODUCT_QUESTION", "Product Question"],
  ["SALES_QUOTE", "Sales / Quote"],
  ["ORDER_ASSISTANCE", "Order Assistance"],
  ["DELIVERY_TRACKING", "Delivery / Tracking"],
  ["RETURNS_REFUNDS", "Returns & Refunds"],
  ["CANCELLATION_REQUEST", "Cancellation Request"],
  ["ACCOUNT_LOGIN_HELP", "Account / Login Help"],
  ["PAYMENT_BILLING", "Payment / Billing"],
  ["BUSINESS_BULK_ORDERS", "Business / Bulk Orders"],
  ["TECHNICAL_SUPPORT", "Technical Support"],
  ["ZEUS_AI_HELP", "Zeus / AI Assistant Help"],
  ["OTHER", "Other"],
] as const;

export type ContactCategory = (typeof contactCategories)[number][0];
export const contactCategoryLabels = Object.fromEntries(contactCategories) as Record<ContactCategory, string>;
export const orderContactCategories: readonly ContactCategory[] = ["ORDER_ASSISTANCE", "DELIVERY_TRACKING", "RETURNS_REFUNDS", "CANCELLATION_REQUEST", "PAYMENT_BILLING"];
export const productContactCategories: readonly ContactCategory[] = ["PRODUCT_QUESTION", "SALES_QUOTE"];
export function isContactCategory(value: unknown): value is ContactCategory { return typeof value === "string" && contactCategories.some(([category]) => category === value); }

export interface ContactSubmissionInput {
  category: ContactCategory;
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  message: string;
  orderNumber?: string;
  productId?: string;
  sourcePage?: string;
  website?: string;
}

export interface ContactSubmissionResult { reference: string; received: true }

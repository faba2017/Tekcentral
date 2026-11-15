import { randomUUID } from "node:crypto";
import { recordAdminAuditBestEffort } from "./adminAuditService.js";
import { bestEffortAlert, bestEffortResolve } from "./operationalAlertService.js";
import { issueInvoiceForOrderTransactionally, type CommerceInvoice, type InvoiceCommercialSnapshot } from "./persistence/invoiceDeliveryRepository.js";
import { publicBusiness } from "../src/lib/public-business.js";
import { ensureInvoiceDocumentOperationally } from "./invoiceDocumentService.js";
import type { BackendOrder } from "./types.js";

export const INVOICE_SNAPSHOT_SCHEMA_VERSION = 1;
const ISSUANCE_ALERT = { type: "INVOICE_ISSUANCE_OUTAGE", subsystem: "PAYMENTS" as const, diagnosticCode: "INVOICE_ISSUANCE_FAILED" };

export class InvoiceEligibilityError extends Error {
  constructor(public readonly code: "PAYMENT_NOT_PAID" | "CURRENCY_UNSUPPORTED" | "COMMERCIAL_TOTALS_INVALID", message: string) { super(message); }
}

export interface InvoiceSellerSnapshot {
  legalName: string;
  tradingName?: string;
  registrationNumber?: string;
  registeredAddress: { lines: string[]; country: string };
  email: string;
  phone?: string;
}

export const canonicalInvoiceSeller = (): InvoiceSellerSnapshot => ({
  legalName: publicBusiness.legalName,
  tradingName: publicBusiness.name,
  registrationNumber: publicBusiness.registrationNumber,
  registeredAddress: { lines: [...publicBusiness.registeredAddress.lines], country: publicBusiness.registeredAddress.country },
  email: publicBusiness.email.general,
  phone: publicBusiness.phone.display,
});

const moneyEqual = (left: number, right: number) => Math.abs(left - right) <= 0.01;
const finiteMoney = (value: number) => Number.isFinite(value) && value >= 0;

export function validateInvoiceEligibility(order: BackendOrder) {
  if (order.payment.status !== "PAID") throw new InvoiceEligibilityError("PAYMENT_NOT_PAID", "Only a backend-confirmed paid Order is invoice eligible.");
  if (order.currency !== "ZAR" || (order.payment.currency && order.payment.currency !== "ZAR")) throw new InvoiceEligibilityError("CURRENCY_UNSUPPORTED", "Only the canonical ZAR checkout flow is invoice eligible.");
  const values = [order.subtotal, order.deliveryAmount, order.taxAmount, order.total, ...order.items.flatMap((item) => [item.unitPrice, item.lineTotal])];
  const lineTotal = order.items.reduce((sum, item) => sum + item.lineTotal, 0);
  const validItems = order.items.length > 0 && order.items.every((item) => Number.isInteger(item.quantity) && item.quantity > 0 && moneyEqual(item.unitPrice * item.quantity, item.lineTotal));
  const paymentAmount = order.payment.grossAmount ?? order.payment.amount;
  if (!values.every(finiteMoney) || !validItems || !moneyEqual(lineTotal, order.subtotal) || !moneyEqual(order.subtotal + order.deliveryAmount, order.total) || order.taxAmount > order.total || (paymentAmount !== undefined && !moneyEqual(paymentAmount, order.total))) throw new InvoiceEligibilityError("COMMERCIAL_TOTALS_INVALID", "The paid Order commercial totals are not internally consistent.");
}

function addressLines(order: BackendOrder) {
  return [order.deliveryAddress.streetAddress, order.deliveryAddress.suburb, order.deliveryAddress.city, order.deliveryAddress.province, order.deliveryAddress.postalCode].filter(Boolean);
}

export function buildInvoiceSnapshot(input: { order: BackendOrder; invoiceNumber: string; issuedAt: string; seller?: InvoiceSellerSnapshot }): InvoiceCommercialSnapshot {
  const { order, invoiceNumber, issuedAt } = input;
  const seller = input.seller ?? canonicalInvoiceSeller();
  const deliveryLines = addressLines(order);
  const rates = [...new Set(order.items.map((item) => item.costBasis?.vatRatePercent).filter((value): value is number => Number.isFinite(value)))];
  const hasCompleteTaxEvidence = rates.length === 1 && order.items.every((item) => item.costBasis?.vatRatePercent === rates[0]);
  return {
    schemaVersion: INVOICE_SNAPSHOT_SCHEMA_VERSION,
    invoiceNumber,
    issuedAt,
    orderId: order.id,
    orderNumber: order.orderNumber,
    orderCreatedAt: order.createdAt,
    seller: { ...seller, registeredAddress: { lines: [...seller.registeredAddress.lines], country: seller.registeredAddress.country } },
    customer: { name: `${order.customer.firstName} ${order.customer.lastName}`.trim(), email: order.customer.email, mobile: order.customer.mobile, companyName: order.customer.companyName, vatNumber: order.customer.vatNumber },
    billingAddress: { lines: [...deliveryLines], country: order.deliveryAddress.country, source: "DELIVERY_ADDRESS_ONLY" },
    deliveryAddress: { lines: [...deliveryLines], country: order.deliveryAddress.country },
    lines: order.items.map((item) => ({ productId: item.productId, description: item.name, sku: item.sku, quantity: item.quantity, unitPrice: item.unitPrice, lineTotal: item.lineTotal })),
    subtotal: order.subtotal,
    deliveryAmount: order.deliveryAmount,
    taxAmount: order.taxAmount,
    total: order.total,
    currency: order.currency,
    payment: { provider: order.payment.provider, reference: order.payment.payfastPaymentId ?? order.payment.gatewayTransactionId ?? order.payment.paymentReference, status: order.payment.status, confirmedAt: order.payment.confirmedAt },
    taxEvidence: { ratePercent: hasCompleteTaxEvidence ? rates[0] : undefined, treatment: hasCompleteTaxEvidence ? "INCLUDED" : "UNRESOLVED" },
  };
}

export async function ensureInvoiceForPaidOrder(orderId: string, options: { seller?: InvoiceSellerSnapshot } = {}) {
  const result = await issueInvoiceForOrderTransactionally({
    orderId,
    validate: validateInvoiceEligibility,
    prepare: ({ order, invoiceNumber, issuedAt }) => ({
      invoiceId: `invoice-${randomUUID()}`,
      deliveryId: `customer-delivery-${randomUUID()}`,
      currency: order.currency,
      subtotal: order.subtotal,
      deliveryAmount: order.deliveryAmount,
      taxAmount: order.taxAmount,
      total: order.total,
      paymentReference: order.payment.payfastPaymentId ?? order.payment.gatewayTransactionId ?? order.payment.paymentReference,
      snapshot: buildInvoiceSnapshot({ order, invoiceNumber, issuedAt, seller: options.seller }),
      snapshotSchemaVersion: INVOICE_SNAPSHOT_SCHEMA_VERSION,
    }),
  });
  if (result.created) await recordAdminAuditBestEffort({ category: "ACTIVITY", actorType: "SYSTEM", subsystem: "PAYMENTS", actionType: "INVOICE_ISSUED", entityType: "INVOICE", entityId: result.invoice.id, entityLabel: result.invoice.invoiceNumber, summary: "A canonical invoice was issued after backend-confirmed payment.", after: [{ label: "Invoice number", value: result.invoice.invoiceNumber }, { label: "Order ID", value: result.order.id }, { label: "Order number", value: result.order.orderNumber }, { label: "Document fingerprint", value: result.invoice.snapshotHash }], targetRoute: `/admin/orders/${encodeURIComponent(result.order.orderNumber)}`, idempotencyKey: `invoice-issued:${result.invoice.id}` });
  await bestEffortResolve(ISSUANCE_ALERT);
  return result;
}

export async function ensureInvoiceForPaidOrderOperationally(orderId: string, orderNumber: string, options: { ensureDocument?: boolean } = {}) {
  try {
    const result = await ensureInvoiceForPaidOrder(orderId);
    if (options.ensureDocument !== false) await ensureInvoiceDocumentOperationally(result.invoice.id, result.invoice.invoiceNumber);
    console.info("Invoice issuance ensured", { orderId, orderNumber, invoiceId: result.invoice.id, invoiceNumber: result.invoice.invoiceNumber, outcome: result.created ? "ISSUED" : "EXISTING" });
    return result;
  } catch (error) {
    const eligibility = error instanceof InvoiceEligibilityError;
    const safeCode = eligibility ? error.code : "INVOICE_ISSUANCE_FAILED";
    console.error("Invoice issuance failed", { orderId, orderNumber, outcome: "FAILED", code: safeCode });
    await bestEffortAlert({ type: eligibility ? "PAID_ORDER_INVOICE_INELIGIBLE" : ISSUANCE_ALERT.type, severity: "CRITICAL", subsystem: "PAYMENTS", title: eligibility ? "Paid order is not invoice eligible" : "Invoice issuance is unavailable", summary: eligibility ? "A backend-confirmed Order failed canonical invoice eligibility validation." : "Canonical invoice issuance failed after payment remained safely persisted.", entityType: eligibility ? "ORDER" : undefined, entityId: eligibility ? orderId : undefined, targetRoute: `/admin/orders/${encodeURIComponent(orderNumber)}`, recommendedAction: "Review the paid order and invoice health", diagnosticCode: safeCode, customerImpactCount: 1 });
    return undefined;
  }
}

export type InvoiceRendererInput = InvoiceCommercialSnapshot;
export function invoiceRendererInput(invoice: CommerceInvoice): InvoiceRendererInput { return structuredClone(invoice.snapshot); }

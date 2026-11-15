import type { Order, OrderStatus, PaymentStatus, RefundStatus, ReturnStatus } from "@/types/order";

export interface AccountOrderSummary {
  orderNumber: string;
  createdAt: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  returnStatus?: ReturnStatus;
  refundStatus?: RefundStatus;
  returnEligible: boolean;
  itemCount: number;
  total: number;
  currency: "ZAR";
  primaryItem?: { name: string };
  deliverySummary: string;
}

export interface AccountOrderPage {
  orders: AccountOrderSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AccountOrderDetail extends Omit<Order, "id" | "internalNotes" | "supplierAllocations" | "operationalHold" | "parcels" | "shipments" | "shipment"> {
  returnEligible: boolean;
  returnStatus?: ReturnStatus;
  refundStatus?: RefundStatus;
  tracking?: { carrier?: string; trackingNumber?: string; trackingUrl?: string; shippedAt?: string };
  invoice?: { invoiceNumber: string; issuedAt: string; status: "ISSUED"; documentReady: boolean; downloadAvailable: boolean };
}

export function statusTone(status: string) {
  if (["PAID", "DELIVERED", "REFUNDED", "COMPLETED"].includes(status)) return "bg-[#ECFDF3] text-[#067647]";
  if (["FAILED", "CANCELLED", "REJECTED"].includes(status)) return "bg-[#FEF3F2] text-[#B42318]";
  if (["SHIPPED", "PROCESSING", "CONFIRMED", "APPROVED"].includes(status)) return "bg-[#EFF8FF] text-[#175CD3]";
  return "bg-[#FFFAEB] text-[#93370D]";
}

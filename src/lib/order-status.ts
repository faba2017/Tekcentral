import type {
  OperationalHoldReason,
  OrderStatus,
  PaymentStatus,
  RefundStatus,
  ReturnStatus,
  SupplierAllocationStatus,
  SupplierOrderStatus,
} from "@/types/order";

export const orderStatusLabels: Record<OrderStatus, string> = {
  PENDING: "Order placed",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  PARTIALLY_SHIPPED: "Partially shipped",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  RETURN_REQUESTED: "Return requested",
  RETURN_IN_PROGRESS: "Return in progress",
  RETURNED: "Returned",
  REFUND_REQUESTED: "Refund requested",
  REFUND_APPROVED: "Refund approved",
  REFUND_REJECTED: "Refund rejected",
  REFUNDED: "Refunded",
};

export const returnStatusLabels: Record<ReturnStatus, string> = {
  REQUESTED: "Requested",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  AWAITING_RETURN: "Awaiting return",
  RECEIVED: "Received",
  COMPLETED: "Completed",
};

export const refundStatusLabels: Record<RefundStatus, string> = {
  NOT_REQUIRED: "Not started",
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PROCESSING: "Processing",
  REFUNDED: "Completed",
};

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  UNPAID: "Unpaid",
  PENDING: "Pending",
  PAID: "Paid",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  REFUND_PENDING: "Refund pending",
  PARTIALLY_REFUNDED: "Partially refunded",
  REFUNDED: "Refunded",
};

export const supplierAllocationStatusLabels: Record<SupplierAllocationStatus, string> = {
  UNASSIGNED: "Unassigned",
  ASSIGNED: "Assigned",
  READY_TO_ORDER: "Ready to order",
  ORDER_PENDING_APPROVAL: "Pending approval",
  APPROVED_FOR_ORDER: "Approved for order",
  ORDER_SUBMITTED: "Order submitted",
  SUPPLIER_CONFIRMED: "Supplier confirmed",
  BACKORDERED: "Backordered",
  DISPATCHED: "Dispatched",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const supplierOrderStatusLabels: Record<SupplierOrderStatus, string> = {
  DRAFT: "Draft",
  ACTION_REQUIRED: "Action required",
  READY_FOR_APPROVAL: "Ready for approval",
  APPROVED: "Approved",
  SUBMITTING: "Submitting",
  SUBMITTED: "Submitted",
  ACKNOWLEDGED: "Acknowledged",
  ORDERED: "Ordered",
  CONFIRMED: "Confirmed",
  BACKORDERED: "Backordered",
  PARTIALLY_CONFIRMED: "Partially confirmed",
  REJECTED: "Rejected",
  DISPATCHED: "Dispatched",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  SUPERSEDED: "Superseded",
};

export const operationalHoldReasonLabels: Record<OperationalHoldReason, string> = {
  ADDRESS_REVIEW: "Address review",
  PAYMENT_REVIEW: "Payment review",
  INVENTORY_EXCEPTION: "Inventory exception",
  CUSTOMER_REQUEST: "Customer request",
  MANUAL: "Manual hold",
};

export const normalOrderTimeline: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
];

export function canRequestCancellation(status: OrderStatus) {
  return status === "PENDING" || status === "CONFIRMED" || status === "PROCESSING";
}

export function canRequestReturn(status: OrderStatus) {
  return status === "DELIVERED" || status === "RETURN_REQUESTED";
}

export function isTerminalOrderStatus(status: OrderStatus) {
  return status === "CANCELLED" || status === "RETURNED" || status === "REFUNDED";
}

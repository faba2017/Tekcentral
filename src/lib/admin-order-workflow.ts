import type { Order, SupplierAllocation, SupplierOrder } from "@/types/order";

const inactiveSupplierStatuses = new Set(["CANCELLED", "REJECTED", "SUPERSEDED"]);
const lockedSupplierStatuses = new Set([
  "APPROVED",
  "SUBMITTING",
  "SUBMITTED",
  "ORDERED",
  "CONFIRMED",
  "BACKORDERED",
  "PARTIALLY_CONFIRMED",
  "DISPATCHED",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
]);

export function getCurrentAllocation(order: Order) {
  return [...(order.supplierAllocations ?? [])]
    .reverse()
    .find((allocation) => allocation.status !== "CANCELLED");
}

export function getCurrentSupplierOrder(supplierOrders: SupplierOrder[]) {
  return supplierOrders.find((supplierOrder) => !inactiveSupplierStatuses.has(supplierOrder.status));
}

export function isAllocationLocked(supplierOrders: SupplierOrder[]) {
  return supplierOrders.some((supplierOrder) => lockedSupplierStatuses.has(supplierOrder.status));
}

export function allocationFormMatches(
  allocation: SupplierAllocation | undefined,
  form: Pick<SupplierAllocation, "supplierCode" | "status" | "orderItemIds"> & {
    supplierOrderReference: string;
    notes: string;
  },
) {
  if (!allocation) return false;
  const persistedItems = [...allocation.orderItemIds].sort();
  const selectedItems = [...form.orderItemIds].sort();
  return allocation.supplierCode === form.supplierCode
    && allocation.status === form.status
    && persistedItems.length === selectedItems.length
    && persistedItems.every((item, index) => item === selectedItems[index])
    && (allocation.supplierOrderReference ?? "") === form.supplierOrderReference.trim()
    && (allocation.notes ?? "") === form.notes.trim();
}

export function hasShipmentEvidence(order: Order, supplierOrder?: SupplierOrder) {
  return Boolean(
    supplierOrder?.courier
    || supplierOrder?.trackingNumber
    || supplierOrder?.dispatchedAt
    || order.shipment?.courierName
    || order.shipment?.trackingNumber
    || order.shipment?.dispatchDate
    || (order.shipments ?? []).some((shipment) =>
      shipment.courier || shipment.trackingNumber || shipment.dispatchedAt,
    ),
  );
}

export function deriveAdminOrderWorkflow(order: Order, supplierOrders: SupplierOrder[]) {
  const allocation = getCurrentAllocation(order);
  const supplierOrder = getCurrentSupplierOrder(supplierOrders);
  const trackingAvailable = Boolean(
    supplierOrder?.trackingNumber
    || order.shipment?.trackingNumber
    || (order.shipments ?? []).some((shipment) => shipment.trackingNumber),
  );
  const shipmentEvidence = hasShipmentEvidence(order, supplierOrder);
  const freightReconciled = Boolean(order.shippingQuoteSnapshot?.freightReconciliation);
  const procurementStatus = supplierOrder
    ? supplierOrder.status === "ACTION_REQUIRED" ? "Action required"
      : supplierOrder.status === "ACKNOWLEDGED" ? "Acknowledged"
        : supplierOrder.status === "APPROVED" ? "Approved for placement"
          : supplierOrder.status.charAt(0) + supplierOrder.status.slice(1).toLowerCase().replace(/_/g, " ")
    : "Not generated";
  const supplierReference = supplierOrder?.supplierOrderReference
    ?? supplierOrder?.externalReference
    ?? supplierOrder?.externalSubmission?.externalOrderNumber
    ?? supplierOrder?.externalSubmission?.externalOrderId;

  const steps = [
    { label: "Payment", status: order.payment.status === "PAID" ? "Paid" : order.payment.status, tone: order.payment.status === "PAID" ? "done" : "warning" },
    { label: "Allocation", status: allocation?.supplierName ?? "Required", tone: allocation ? "done" : "warning" },
    { label: "Procurement", status: procurementStatus, tone: ["ORDERED", "CONFIRMED", "DISPATCHED", "SHIPPED", "DELIVERED", "COMPLETED"].includes(supplierOrder?.status ?? "") ? "done" : supplierOrder ? "warning" : "pending" },
    { label: "Supplier reference", status: supplierReference ?? "Not recorded", tone: supplierReference ? "done" : "pending" },
    { label: "Fulfilment", status: order.status === "DELIVERED" ? "Delivered" : order.status === "SHIPPED" || order.status === "PARTIALLY_SHIPPED" ? "Shipped" : "Waiting", tone: ["SHIPPED", "PARTIALLY_SHIPPED", "DELIVERED"].includes(order.status) ? "done" : "pending" },
    { label: "Tracking", status: trackingAvailable ? "Available" : "Not available", tone: trackingAvailable ? "done" : "pending" },
  ] as const;

  let nextAction = "Review order";
  if (order.operationalHold?.active) nextAction = "Release or resolve operational hold";
  else if (order.payment.status !== "PAID") nextAction = "Await PayFast payment confirmation";
  else if (!allocation) nextAction = "Resolve supplier allocation";
  else if (!supplierOrder) nextAction = "Generate supplier order";
  else if (supplierOrder.status === "ACTION_REQUIRED") nextAction = "Acknowledge paid order";
  else if (supplierOrder.status === "ACKNOWLEDGED" || supplierOrder.status === "READY_FOR_APPROVAL") nextAction = "Approve procurement";
  else if (supplierOrder.supplierCode === "CJ" && ["CJ_ORDER_LOGISTICS_REQUIRED", "CJ_LOGISTICS_NO_ROUTE", "CJ_LOGISTICS_API_REJECTED", "CJ_LOGISTICS_SOURCE_UNRESOLVED"].includes(supplierOrder.externalSubmission?.lastErrorCode ?? "")) nextAction = "Resolve CJ logistics availability";
  else if (supplierOrder.supplierCode === "CJ" && supplierOrder.status === "APPROVED" && supplierOrder.externalSubmission?.status !== "CREATED") nextAction = "Prepare and create CJ order";
  else if (supplierOrder.status === "APPROVED") nextAction = supplierOrder.supplierCode === "SCOOP" ? "Place Scoop order" : "Complete supplier procurement";
  else if (order.status === "DELIVERED") nextAction = freightReconciled ? "No operational action required" : "Reconcile actual freight";
  else if (order.status === "SHIPPED") nextAction = "Monitor delivery";
  else if (["ORDERED", "CONFIRMED", "DISPATCHED", "SHIPPED", "DELIVERED", "COMPLETED"].includes(supplierOrder.status)) {
    nextAction = shipmentEvidence ? "Confirm shipment" : "Add supplier tracking when available";
  }

  return { allocation, supplierOrder, steps, nextAction, trackingAvailable, shipmentEvidence };
}

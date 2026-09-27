import { listOrders, updateOrder, updateOrderById } from "./orderRepository.js";
import { getSupplierDisplayName } from "./supplierRegistry.js";
import type {
  AdminActivityEntry,
  AttentionReason,
  BackendOrder,
  BackendRefund,
  BackendRefundItem,
  BackendReturnRequest,
  InternalNote,
  OperationalHoldReason,
  OrderStatus,
  Parcel,
  RefundStatus,
  ReturnStatus,
  Shipment,
  ShipmentItem,
  ShipmentRecord,
  ShipmentStatus,
  SupplierAllocation,
  SupplierAllocationStatus,
  SupplierCode,
} from "./types.js";

export const attentionConfig = {
  paymentPendingHours: 24,
};

export const supplierOptions: Record<SupplierCode, string> = {
  SCOOP: getSupplierDisplayName("SCOOP"),
  PINNACLE: getSupplierDisplayName("PINNACLE"),
  MIRO: getSupplierDisplayName("MIRO"),
  RECTRON: getSupplierDisplayName("RECTRON"),
  MUSTEK: getSupplierDisplayName("MUSTEK"),
  AXIZ: getSupplierDisplayName("AXIZ"),
  CJ: getSupplierDisplayName("CJ"),
  MANUAL: getSupplierDisplayName("MANUAL"),
};

const orderStatusLabels: Record<OrderStatus, string> = {
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

const allowedOrderTransitions: Partial<Record<OrderStatus, OrderStatus[]>> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["PARTIALLY_SHIPPED", "SHIPPED", "CANCELLED"],
  PARTIALLY_SHIPPED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: ["RETURN_REQUESTED"],
  RETURN_REQUESTED: ["RETURN_IN_PROGRESS"],
  RETURN_IN_PROGRESS: ["RETURNED"],
  REFUND_REQUESTED: ["REFUND_APPROVED", "REFUND_REJECTED"],
  REFUND_APPROVED: ["REFUNDED"],
};

const allowedReturnTransitions: Partial<Record<ReturnStatus, ReturnStatus[]>> = {
  REQUESTED: ["UNDER_REVIEW", "APPROVED", "REJECTED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["AWAITING_RETURN"],
  AWAITING_RETURN: ["RECEIVED"],
  RECEIVED: ["COMPLETED"],
};

const allowedRefundTransitions: Partial<Record<RefundStatus, RefundStatus[]>> = {
  PENDING: ["APPROVED", "REJECTED"],
  APPROVED: ["PROCESSING"],
  PROCESSING: ["REFUNDED"],
};

const allowedSupplierTransitions: Partial<
  Record<SupplierAllocationStatus, SupplierAllocationStatus[]>
> = {
  UNASSIGNED: ["ASSIGNED"],
  ASSIGNED: ["READY_TO_ORDER", "CANCELLED"],
  READY_TO_ORDER: ["ORDER_PENDING_APPROVAL", "CANCELLED"],
  ORDER_PENDING_APPROVAL: ["APPROVED_FOR_ORDER", "CANCELLED"],
  APPROVED_FOR_ORDER: ["ORDER_SUBMITTED", "CANCELLED"],
  ORDER_SUBMITTED: ["SUPPLIER_CONFIRMED", "BACKORDERED", "DISPATCHED", "CANCELLED"],
  SUPPLIER_CONFIRMED: ["DISPATCHED", "BACKORDERED", "CANCELLED"],
  BACKORDERED: ["SUPPLIER_CONFIRMED", "CANCELLED"],
  DISPATCHED: ["COMPLETED"],
};

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function appendStatusHistory(order: BackendOrder, status: OrderStatus, note?: string) {
  return [
    ...order.statusHistory,
    {
      status,
      label: orderStatusLabels[status],
      createdAt: new Date().toISOString(),
      note,
    },
  ];
}

function assertOrderTransition(order: BackendOrder, nextStatus: OrderStatus) {
  if (order.status === nextStatus) return;
  if (
    order.operationalHold?.active &&
    ["PROCESSING", "PARTIALLY_SHIPPED", "SHIPPED"].includes(nextStatus)
  ) {
    throw new Error("Release the operational hold before fulfilment transitions.");
  }
  if (
    ["CONFIRMED", "PROCESSING", "PARTIALLY_SHIPPED", "SHIPPED"].includes(nextStatus) &&
    order.payment.status !== "PAID"
  ) {
    throw new Error("Paid payment confirmation is required for this order transition.");
  }
  if (!allowedOrderTransitions[order.status]?.includes(nextStatus)) {
    throw new Error(`Invalid order transition from ${order.status} to ${nextStatus}.`);
  }
}

function orderAgeHours(order: BackendOrder, now = new Date()) {
  return Math.max(0, (now.getTime() - new Date(order.createdAt).getTime()) / 3_600_000);
}

export function deriveAttentionReasons(
  order: BackendOrder,
  now = new Date(),
): AttentionReason[] {
  const reasons: AttentionReason[] = [];
  if (
    order.payment.status === "PENDING" &&
    orderAgeHours(order, now) >= attentionConfig.paymentPendingHours
  ) {
    reasons.push({
      code: "PAYMENT_PENDING_TOO_LONG",
      label: "Payment pending",
      detail: `Payment pending for ${Math.floor(orderAgeHours(order, now))}h`,
      createdAt: order.createdAt,
    });
  }
  if (order.payment.status === "CANCELLED" && order.status !== "CANCELLED") {
    reasons.push({
      code: "PAYMENT_CANCELLED_ORDER_OPEN",
      label: "Payment cancelled",
      detail: "Payment cancelled while order remains open",
      createdAt: order.payment.updatedAt,
    });
  }
  if (order.operationalHold?.active) {
    reasons.push({
      code: "ORDER_ON_HOLD",
      label: "On hold",
      detail: (order.operationalHold.reason ?? "MANUAL").replace(/_/g, " "),
      createdAt: order.operationalHold.createdAt,
    });
  }
  const activeAllocationItemIds = (order.supplierAllocations ?? [])
    .filter((allocation) => allocation.status !== "CANCELLED")
    .flatMap((allocation) => allocation.orderItemIds);
  if (new Set(activeAllocationItemIds).size < activeAllocationItemIds.length) {
    reasons.push({
      code: "DUPLICATE_PROCUREMENT_BLOCKED",
      label: "Duplicate procurement",
      detail: "Multiple active allocations reference the same order item",
      createdAt: order.updatedAt,
    });
  }
  if (
    order.payment.status === "PAID" &&
    ["CONFIRMED", "PROCESSING"].includes(order.status) &&
    (order.supplierAllocations ?? []).length === 0
  ) {
    reasons.push({
      code: "FULFILMENT_UNASSIGNED",
      label: "Fulfilment",
      detail: "Supplier allocation required",
      createdAt: order.updatedAt,
    });
  }
  if (order.returns.some((entry) => entry.status === "REQUESTED")) {
    reasons.push({
      code: "RETURN_AWAITING_REVIEW",
      label: "Return review",
      detail: "Return awaiting review",
      createdAt: order.returns.find((entry) => entry.status === "REQUESTED")?.createdAt,
    });
  }
  if (order.refunds.some((entry) => entry.status === "PENDING")) {
    reasons.push({
      code: "REFUND_AWAITING_REVIEW",
      label: "Refund review",
      detail: "Refund awaiting review",
      createdAt: order.refunds.find((entry) => entry.status === "PENDING")?.createdAt,
    });
  }
  if (
    order.shipments?.some(
      (shipment) =>
        shipment.status === "DISPATCHED" &&
        (!shipment.trackingNumber || !shipment.trackingUrl),
    )
  ) {
    reasons.push({
      code: "SHIPMENT_MISSING_TRACKING",
      label: "Tracking",
      detail: "Dispatched shipment missing tracking",
      createdAt: order.shipments.find((entry) => entry.status === "DISPATCHED")?.updatedAt,
    });
  }
  return reasons;
}

function shippedQuantityMap(shipments: Shipment[] = []) {
  const quantities = new Map<string, number>();
  shipments
    .filter((shipment) => shipment.status === "DISPATCHED" || shipment.status === "DELIVERED")
    .forEach((shipment) => {
      shipment.items.forEach((item) => {
        quantities.set(item.orderItemId, (quantities.get(item.orderItemId) ?? 0) + item.quantity);
      });
    });
  return quantities;
}

export function deriveShipmentOrderStatus(order: BackendOrder): OrderStatus {
  const quantities = shippedQuantityMap(order.shipments);
  const orderedTotal = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const shippedTotal = order.items.reduce(
    (sum, item) => sum + Math.min(item.quantity, quantities.get(item.productId) ?? 0),
    0,
  );
  if (shippedTotal <= 0) return order.status === "PARTIALLY_SHIPPED" ? "PROCESSING" : order.status;
  if (shippedTotal >= orderedTotal) return "SHIPPED";
  return "PARTIALLY_SHIPPED";
}

function validateItemQuantities(order: BackendOrder, items: ShipmentItem[]) {
  if (items.length === 0) throw new Error("At least one order item is required.");
  const ordered = new Map(order.items.map((item) => [item.productId, item.quantity]));
  const totals = new Map<string, number>();
  items.forEach((item) => {
    const orderedQuantity = ordered.get(item.orderItemId);
    if (!orderedQuantity || item.quantity < 1) throw new Error("Invalid item quantity.");
    totals.set(item.orderItemId, (totals.get(item.orderItemId) ?? 0) + item.quantity);
  });
  totals.forEach((quantity, itemId) => {
    if (quantity > (ordered.get(itemId) ?? 0)) {
      throw new Error("Shipment quantity exceeds ordered quantity.");
    }
  });
}

function calculateRefundItems(
  order: BackendOrder,
  returnRequest?: BackendReturnRequest,
): BackendRefundItem[] {
  if (returnRequest) {
    return returnRequest.items.map((item) => ({
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    }));
  }
  return order.items.map((item) => ({
    productId: item.productId,
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
  }));
}

export async function listAdminOrders() {
  return listOrders();
}

export interface PaidOrderAlert {
  orderNumber: string;
  total: number;
  currency: BackendOrder["currency"];
  paidAt?: string;
}

export function derivePaidOrderAlerts(orders: BackendOrder[]): PaidOrderAlert[] {
  return orders
    .filter((order) => order.payment.status === "PAID" && !order.opsPaymentAcknowledgedAt)
    .map((order) => ({
      orderNumber: order.orderNumber,
      total: order.total,
      currency: order.currency,
      paidAt: order.payment.confirmedAt ?? order.payment.updatedAt,
    }));
}

export async function acknowledgePaidOrder(orderNumber: string) {
  return updateOrder(orderNumber, (order) => {
    if (order.payment.status !== "PAID" || order.opsPaymentAcknowledgedAt) return order;
    return {
      ...order,
      opsPaymentAcknowledgedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });
}

export async function baselinePaidOrderAlerts(baselineAt = new Date().toISOString()) {
  const orders = await listOrders();
  const orderNumbers = orders
    .filter((order) => order.payment.status === "PAID" && !order.opsPaymentAcknowledgedAt)
    .map((order) => order.orderNumber);

  for (const orderNumber of orderNumbers) {
    await updateOrder(orderNumber, (order) => {
      if (order.payment.status !== "PAID" || order.opsPaymentAcknowledgedAt) return order;
      return {
        ...order,
        opsPaymentAcknowledgedAt: baselineAt,
        updatedAt: baselineAt,
      };
    });
  }

  return { count: orderNumbers.length, orderNumbers, baselineAt };
}

export async function updateAdminOrderStatus(
  orderNumber: string,
  status: OrderStatus,
  note?: string,
) {
  return updateOrder(orderNumber, (order) => {
    assertOrderTransition(order, status);
    const now = new Date().toISOString();
    return {
      ...order,
      status,
      updatedAt: now,
      statusHistory: appendStatusHistory(order, status, note || "Staff status update."),
    };
  });
}

export async function addInternalNote(
  orderNumber: string,
  body: string,
  authorLabel = "TekCentral Staff",
) {
  const trimmedBody = body.trim();
  if (!trimmedBody) throw new Error("Note body is required.");
  return updateOrder(orderNumber, (order) => {
    const now = new Date().toISOString();
    const note: InternalNote = {
      id: createLocalId("note"),
      orderId: order.id,
      createdAt: now,
      authorLabel,
      body: trimmedBody,
    };
    return {
      ...order,
      updatedAt: now,
      internalNotes: [...(order.internalNotes ?? []), note],
    };
  });
}

export async function listAdminReturns() {
  const orders = await listOrders();
  return orders.flatMap((order) =>
    order.returns.map((returnRequest) => ({ order, returnRequest })),
  );
}

export async function updateAdminReturnStatus(returnId: string, status: ReturnStatus) {
  const orders = await listOrders();
  const owner = orders.find((order) =>
    order.returns.some((returnRequest) => returnRequest.id === returnId),
  );
  if (!owner) return undefined;

  return updateOrderById(owner.id, (order) => {
    const returnRequest = order.returns.find((item) => item.id === returnId);
    if (!returnRequest) return order;
    if (!allowedReturnTransitions[returnRequest.status]?.includes(status)) {
      throw new Error(
        `Invalid return transition from ${returnRequest.status} to ${status}.`,
      );
    }
    const now = new Date().toISOString();
    return {
      ...order,
      status:
        status === "COMPLETED"
          ? "RETURNED"
          : status === "REJECTED"
            ? order.status
            : "RETURN_IN_PROGRESS",
      updatedAt: now,
      returns: order.returns.map((item) =>
        item.id === returnId ? { ...item, status, updatedAt: now } : item,
      ),
      statusHistory:
        status === "COMPLETED"
          ? appendStatusHistory(order, "RETURNED", "Return completed by staff.")
          : order.statusHistory,
    };
  });
}

export async function listAdminRefunds() {
  const orders = await listOrders();
  return orders.flatMap((order) =>
    order.refunds.map((refund) => ({ order, refund })),
  );
}

export async function createAdminRefund(orderNumber: string, returnRequestId?: string) {
  return updateOrder(orderNumber, (order) => {
    const returnRequest = returnRequestId
      ? order.returns.find((item) => item.id === returnRequestId)
      : undefined;
    const items = calculateRefundItems(order, returnRequest);
    const now = new Date().toISOString();
    const refund: BackendRefund = {
      id: createLocalId("refund"),
      orderId: order.id,
      returnRequestId: returnRequest?.id,
      items,
      amount: items.reduce((sum, item) => sum + item.lineTotal, 0),
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
      note: returnRequest ? "Refund review for returned items." : "Refund review.",
    };
    return {
      ...order,
      status: "REFUND_REQUESTED",
      updatedAt: now,
      refunds: [...order.refunds, refund],
      statusHistory: appendStatusHistory(order, "REFUND_REQUESTED", "Refund review opened."),
    };
  });
}

export async function updateAdminRefundStatus(refundId: string, status: RefundStatus) {
  const orders = await listOrders();
  const owner = orders.find((order) => order.refunds.some((refund) => refund.id === refundId));
  if (!owner) return undefined;

  return updateOrderById(owner.id, (order) => {
    const refund = order.refunds.find((item) => item.id === refundId);
    if (!refund) return order;
    if (!allowedRefundTransitions[refund.status]?.includes(status)) {
      throw new Error(`Invalid refund transition from ${refund.status} to ${status}.`);
    }
    const now = new Date().toISOString();
    return {
      ...order,
      status:
        status === "APPROVED"
          ? "REFUND_APPROVED"
          : status === "REJECTED"
            ? "REFUND_REJECTED"
            : status === "REFUNDED"
              ? "REFUNDED"
              : order.status,
      payment:
        status === "REFUNDED"
          ? { ...order.payment, status: "REFUNDED", updatedAt: now }
          : status === "PROCESSING"
            ? { ...order.payment, status: "REFUND_PENDING", updatedAt: now }
            : order.payment,
      updatedAt: now,
      refunds: order.refunds.map((item) =>
        item.id === refundId ? { ...item, status, updatedAt: now } : item,
      ),
      statusHistory:
        status === "APPROVED" || status === "REJECTED" || status === "REFUNDED"
          ? appendStatusHistory(
              order,
              status === "APPROVED"
                ? "REFUND_APPROVED"
                : status === "REJECTED"
                  ? "REFUND_REJECTED"
                  : "REFUNDED",
              "Refund status updated by staff.",
            )
          : order.statusHistory,
    };
  });
}

export async function createSupplierAllocation(input: {
  orderNumber: string;
  orderItemIds: string[];
  supplierCode: SupplierCode;
  status?: SupplierAllocationStatus;
  supplierOrderReference?: string;
  notes?: string;
}) {
  return updateOrder(input.orderNumber, (order) => {
    const validItemIds = new Set(order.items.map((item) => item.productId));
    const orderItemIds = input.orderItemIds.filter((itemId) => validItemIds.has(itemId));
    if (orderItemIds.length === 0) throw new Error("Supplier allocation requires order items.");
    const now = new Date().toISOString();
    const allocation: SupplierAllocation = {
      id: createLocalId("allocation"),
      orderId: order.id,
      orderItemIds,
      supplierCode: input.supplierCode,
      supplierName: supplierOptions[input.supplierCode],
      status: input.status ?? "ASSIGNED",
      supplierOrderReference: input.supplierOrderReference?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    return {
      ...order,
      updatedAt: now,
      supplierAllocations: [...(order.supplierAllocations ?? []), allocation],
    };
  });
}

export async function updateSupplierAllocation(input: {
  orderNumber: string;
  allocationId: string;
  orderItemIds?: string[];
  supplierCode?: SupplierCode;
  status?: SupplierAllocationStatus;
  supplierOrderReference?: string;
  notes?: string;
}) {
  return updateOrder(input.orderNumber, (order) => {
    const allocation = order.supplierAllocations?.find((item) => item.id === input.allocationId);
    if (!allocation) throw new Error("Supplier allocation not found.");
    if (
      input.status &&
      input.status !== allocation.status &&
      !allowedSupplierTransitions[allocation.status]?.includes(input.status)
    ) {
      throw new Error(
        `Invalid supplier allocation transition from ${allocation.status} to ${input.status}.`,
      );
    }
    const validItemIds = new Set(order.items.map((item) => item.productId));
    const nextItemIds = input.orderItemIds
      ? input.orderItemIds.filter((itemId) => validItemIds.has(itemId))
      : allocation.orderItemIds;
    if (nextItemIds.length === 0) throw new Error("Supplier allocation requires order items.");
    const now = new Date().toISOString();
    return {
      ...order,
      updatedAt: now,
      supplierAllocations: (order.supplierAllocations ?? []).map((item) =>
        item.id === input.allocationId
          ? {
              ...item,
              orderItemIds: nextItemIds,
              supplierCode: input.supplierCode ?? item.supplierCode,
              supplierName: input.supplierCode
                ? supplierOptions[input.supplierCode]
                : item.supplierName,
              status: input.status ?? item.status,
              supplierOrderReference:
                input.supplierOrderReference !== undefined
                  ? input.supplierOrderReference.trim() || undefined
                  : item.supplierOrderReference,
              notes: input.notes !== undefined ? input.notes.trim() || undefined : item.notes,
              updatedAt: now,
            }
          : item,
      ),
    };
  });
}

export async function updateShipment(orderNumber: string, shipment: ShipmentRecord) {
  return updateOrder(orderNumber, (order) => ({
    ...order,
    updatedAt: new Date().toISOString(),
    shipment: {
      ...order.shipment,
      ...shipment,
      updatedAt: new Date().toISOString(),
    },
  }));
}

export async function setOperationalHold(input: {
  orderNumber: string;
  reason: OperationalHoldReason;
  notes?: string;
}) {
  return updateOrder(input.orderNumber, (order) => {
    const now = new Date().toISOString();
    return {
      ...order,
      updatedAt: now,
      operationalHold: {
        active: true,
        reason: input.reason,
        notes: input.notes?.trim() || undefined,
        createdAt: now,
      },
    };
  });
}

export async function releaseOperationalHold(orderNumber: string) {
  return updateOrder(orderNumber, (order) => ({
    ...order,
    updatedAt: new Date().toISOString(),
    operationalHold: {
      ...order.operationalHold,
      active: false,
      releasedAt: new Date().toISOString(),
    },
  }));
}

export async function createParcel(input: {
  orderNumber: string;
  itemQuantities: Parcel["itemQuantities"];
  weightKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  packageType?: string;
  declaredValue?: number;
  reference?: string;
}) {
  return updateOrder(input.orderNumber, (order) => {
    validateItemQuantities(
      order,
      input.itemQuantities.map((item) => ({
        orderItemId: item.orderItemId,
        quantity: item.quantity,
      })),
    );
    const now = new Date().toISOString();
    const parcel: Parcel = {
      id: createLocalId("parcel"),
      orderId: order.id,
      itemQuantities: input.itemQuantities,
      weightKg: input.weightKg,
      lengthCm: input.lengthCm,
      widthCm: input.widthCm,
      heightCm: input.heightCm,
      packageType: input.packageType?.trim() || undefined,
      declaredValue: input.declaredValue,
      reference: input.reference?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    return {
      ...order,
      updatedAt: now,
      parcels: [...(order.parcels ?? []), parcel],
    };
  });
}

export async function createAdminShipment(input: {
  orderNumber: string;
  items: ShipmentItem[];
  courier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  dispatchedAt?: string;
  deliveredAt?: string;
  status?: ShipmentStatus;
}) {
  return updateOrder(input.orderNumber, (order) => {
    if (order.operationalHold?.active) {
      throw new Error("Release the operational hold before shipping.");
    }
    if (order.payment.status !== "PAID") {
      throw new Error("Paid payment confirmation is required before shipping.");
    }
    validateItemQuantities(order, [
      ...(order.shipments ?? [])
        .filter((shipment) => shipment.status !== "CANCELLED")
        .flatMap((shipment) => shipment.items),
      ...input.items,
    ]);
    const now = new Date().toISOString();
    const shipment: Shipment = {
      id: createLocalId("shipment"),
      orderId: order.id,
      items: input.items,
      courier: input.courier?.trim() || undefined,
      trackingNumber: input.trackingNumber?.trim() || undefined,
      trackingUrl: input.trackingUrl?.trim() || undefined,
      dispatchedAt: input.dispatchedAt || undefined,
      deliveredAt: input.deliveredAt || undefined,
      status: input.status ?? "DISPATCHED",
      createdAt: now,
      updatedAt: now,
    };
    const nextOrder = {
      ...order,
      updatedAt: now,
      shipments: [...(order.shipments ?? []), shipment],
    };
    const nextStatus = deriveShipmentOrderStatus(nextOrder);
    return {
      ...nextOrder,
      status: nextStatus,
      statusHistory:
        nextStatus !== order.status
          ? appendStatusHistory(nextOrder, nextStatus, "Shipment quantities updated.")
          : order.statusHistory,
    };
  });
}

export function buildAdminActivity(order: BackendOrder): AdminActivityEntry[] {
  const activities: AdminActivityEntry[] = [
    {
      timestamp: order.createdAt,
      type: "ORDER_CREATED",
      description: `Order ${order.orderNumber} created.`,
    },
    ...order.statusHistory.map((entry) => ({
      timestamp: entry.createdAt,
      type: "ORDER_STATUS",
      description: entry.note ? `${entry.label}: ${entry.note}` : entry.label,
    })),
    ...order.returns.map((entry) => ({
      timestamp: entry.updatedAt ?? entry.createdAt,
      type: "RETURN",
      description: `Return ${entry.id} is ${entry.status}.`,
    })),
    ...order.refunds.map((entry) => ({
      timestamp: entry.updatedAt,
      type: "REFUND",
      description: `Refund ${entry.id} is ${entry.status}.`,
    })),
    ...(order.supplierAllocations ?? []).map((entry) => ({
      timestamp: entry.updatedAt,
      type: "SUPPLIER_ALLOCATION",
      description: `${entry.supplierName} allocation is ${entry.status}.`,
    })),
    ...(order.parcels ?? []).map((entry) => ({
      timestamp: entry.updatedAt,
      type: "PARCEL",
      description: `Parcel ${entry.reference ?? entry.id} prepared.`,
    })),
    ...(order.shipments ?? []).map((entry) => ({
      timestamp: entry.updatedAt,
      type: "SHIPMENT",
      description: `Shipment ${entry.id} is ${entry.status}.`,
    })),
    ...(order.operationalHold?.createdAt
      ? [
          {
            timestamp: order.operationalHold.releasedAt ?? order.operationalHold.createdAt,
            type: "OPERATIONAL_HOLD",
            description: order.operationalHold.active
              ? `Hold active: ${(order.operationalHold.reason ?? "MANUAL").replace(/_/g, " ")}.`
              : "Operational hold released.",
          },
        ]
      : []),
    ...(order.internalNotes ?? []).map((entry) => ({
      timestamp: entry.createdAt,
      type: "INTERNAL_NOTE",
      description: `${entry.authorLabel} added an internal note.`,
    })),
  ];
  return activities.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

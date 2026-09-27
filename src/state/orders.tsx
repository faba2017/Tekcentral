import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { orderStatusLabels } from "@/lib/order-status";
import { createLocalId } from "@/lib/order-utils";
import type {
  CheckoutCustomer,
  DeliveryAddress,
  DeliveryMethod,
  Order,
  OrderItem,
  OrderStatus,
  OrderTotals,
  PaymentMethod,
  Refund,
  RefundStatus,
  ReturnRequest,
  ReturnRequestItem,
} from "@/types/order";

interface CreateOrderInput {
  customer: CheckoutCustomer;
  deliveryAddress: DeliveryAddress;
  deliveryMethod: DeliveryMethod;
  paymentMethod: PaymentMethod;
  items: OrderItem[];
  totals: OrderTotals;
}

interface CreateReturnInput {
  orderNumber: string;
  items: ReturnRequestItem[];
  reason: string;
  notes?: string;
}

interface OrdersContextValue {
  orders: Order[];
  createOrder: (input: CreateOrderInput) => Order;
  saveOrderMirror: (order: Order) => void;
  replaceOrderMirrors: (orders: Order[]) => void;
  getOrder: (orderNumber: string) => Order | undefined;
  updateOrderStatus: (orderNumber: string, status: OrderStatus, note?: string) => void;
  updatePaymentStatus: (
    orderNumber: string,
    status: Order["payment"]["status"],
  ) => void;
  requestCancellation: (orderNumber: string, reason?: string) => void;
  createReturnRequest: (input: CreateReturnInput) => ReturnRequest | undefined;
  requestRefund: (orderNumber: string, returnRequestId?: string) => Refund | undefined;
  updateRefundStatus: (
    orderNumber: string,
    refundId: string,
    status: RefundStatus,
  ) => void;
}

interface StoredOrders {
  version: 1;
  orders: Order[];
}

const storageKey = "tekcentral-demo-orders-v1";
const schemaVersion = 1;

function isOrder(value: unknown): value is Order {
  const candidate = value as Partial<Order>;
  return (
    typeof candidate?.id === "string" &&
    typeof candidate.orderNumber === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string" &&
    Array.isArray(candidate.items) &&
    typeof candidate.total === "number" &&
    typeof candidate.status === "string" &&
    Array.isArray(candidate.statusHistory) &&
    Array.isArray(candidate.returns) &&
    Array.isArray(candidate.refunds)
  );
}

function withOrderDefaults(order: Order): Order {
  return {
    ...order,
    payment: order.payment ?? {
      provider: "payfast",
      status: "PENDING",
      updatedAt: order.updatedAt,
    },
    returns: order.returns ?? [],
    refunds: order.refunds ?? [],
    internalNotes: order.internalNotes ?? [],
    supplierAllocations: order.supplierAllocations ?? [],
    operationalHold: order.operationalHold ?? { active: false },
    parcels: order.parcels ?? [],
    shipments: order.shipments ?? [],
  };
}

function readOrders(): Order[] {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as Partial<StoredOrders>;
    if (parsed.version !== schemaVersion || !Array.isArray(parsed.orders)) {
      return [];
    }
    return parsed.orders.filter(isOrder).map(withOrderDefaults);
  } catch {
    return [];
  }
}

function nextOrderNumber(orders: Order[]) {
  const year = new Date().getFullYear();
  const currentYearPrefix = `TC-${year}-`;
  const maxSequence = orders.reduce((max, order) => {
    if (!order.orderNumber.startsWith(currentYearPrefix)) return max;
    const sequence = Number(order.orderNumber.slice(currentYearPrefix.length));
    return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
  }, 0);

  return `${currentYearPrefix}${String(maxSequence + 1).padStart(6, "0")}`;
}

function historyEntry(status: OrderStatus, note?: string) {
  return {
    status,
    label: orderStatusLabels[status],
    createdAt: new Date().toISOString(),
    note,
  };
}

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>(readOrders);

  useEffect(() => {
    const payload: StoredOrders = { version: schemaVersion, orders };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [orders]);

  const createOrder = useCallback((input: CreateOrderInput) => {
    const now = new Date().toISOString();
    let createdOrder: Order | undefined;

    setOrders((current) => {
      const order: Order = {
        id: createLocalId("order"),
        orderNumber: nextOrderNumber(current),
        createdAt: now,
        updatedAt: now,
        customer: input.customer,
        deliveryAddress: input.deliveryAddress,
        deliveryMethod: input.deliveryMethod,
        paymentMethod: input.paymentMethod,
        payment: {
          provider: input.paymentMethod.id === "payfast" ? "payfast" : "manual",
          status: "PENDING",
          paymentReference: undefined,
          updatedAt: now,
        },
        items: input.items,
        subtotal: input.totals.subtotal,
        deliveryAmount: input.totals.deliveryAmount,
        taxAmount: input.totals.taxAmount,
        total: input.totals.total,
        currency: "ZAR",
        status: "PENDING",
        statusHistory: [historyEntry("PENDING", "Order received.")],
        returns: [],
        refunds: [],
      };
      createdOrder = order;
      return [order, ...current];
    });

    if (!createdOrder) {
      throw new Error("Order creation failed");
    }
    return createdOrder;
  }, []);

  const saveOrderMirror = useCallback((order: Order) => {
    setOrders((current) => {
      const existingIndex = current.findIndex(
        (item) => item.orderNumber === order.orderNumber,
      );
      if (existingIndex < 0) return [order, ...current];
      return current.map((item) =>
        item.orderNumber === order.orderNumber ? order : item,
      );
    });
  }, []);

  const replaceOrderMirrors = useCallback((nextOrders: Order[]) => {
    setOrders(nextOrders.map(withOrderDefaults));
  }, []);

  const getOrder = useCallback(
    (orderNumber: string) => orders.find((order) => order.orderNumber === orderNumber),
    [orders],
  );

  const updateOrderStatus = useCallback(
    (orderNumber: string, status: OrderStatus, note?: string) => {
      setOrders((current) =>
        current.map((order) =>
          order.orderNumber === orderNumber
            ? {
                ...order,
                status,
                updatedAt: new Date().toISOString(),
                statusHistory: [...order.statusHistory, historyEntry(status, note)],
              }
            : order,
        ),
      );
    },
    [],
  );

  const updatePaymentStatus = useCallback(
    (orderNumber: string, status: Order["payment"]["status"]) => {
      setOrders((current) =>
        current.map((order) =>
          order.orderNumber === orderNumber
            ? {
                ...order,
                status:
                  status === "PAID" && order.status === "PENDING"
                    ? "CONFIRMED"
                    : order.status,
                payment: {
                  ...order.payment,
                  status,
                  updatedAt: new Date().toISOString(),
                },
              }
            : order,
        ),
      );
    },
    [],
  );

  const requestCancellation = useCallback((orderNumber: string, reason?: string) => {
    setOrders((current) =>
      current.map((order) =>
        order.orderNumber === orderNumber
          ? {
              ...order,
              status: "CANCELLED",
              updatedAt: new Date().toISOString(),
              cancellationReason: reason,
              statusHistory: [
                ...order.statusHistory,
                historyEntry("CANCELLED", reason || "Cancellation requested."),
              ],
              refunds:
                order.refunds.length > 0
                  ? order.refunds
                  : [
                      {
                        id: createLocalId("refund"),
                        orderId: order.id,
                        amount: order.total,
                        status: "PENDING",
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        note: "Cancellation refund review.",
                      },
                    ],
            }
          : order,
      ),
    );
  }, []);

  const createReturnRequest = useCallback((input: CreateReturnInput) => {
    let createdReturn: ReturnRequest | undefined;
    setOrders((current) =>
      current.map((order) => {
        if (order.orderNumber !== input.orderNumber) return order;

        const returnRequest: ReturnRequest = {
          id: createLocalId("return"),
          orderId: order.id,
          items: input.items,
          reason: input.reason,
          notes: input.notes,
          createdAt: new Date().toISOString(),
          status: "REQUESTED",
        };
        createdReturn = returnRequest;

        return {
          ...order,
          status: "RETURN_REQUESTED",
          updatedAt: new Date().toISOString(),
          statusHistory: [
            ...order.statusHistory,
            historyEntry("RETURN_REQUESTED", "Return request received."),
          ],
          returns: [...order.returns, returnRequest],
        };
      }),
    );
    return createdReturn;
  }, []);

  const requestRefund = useCallback((orderNumber: string, returnRequestId?: string) => {
    let createdRefund: Refund | undefined;
    setOrders((current) =>
      current.map((order) => {
        if (order.orderNumber !== orderNumber) return order;
        const returnRequest = returnRequestId
          ? order.returns.find((request) => request.id === returnRequestId)
          : order.returns[0];
        const amount =
          returnRequest?.items.reduce((sum, item) => sum + item.lineTotal, 0) ??
          order.total;

        const refund: Refund = {
          id: createLocalId("refund"),
          orderId: order.id,
          returnRequestId: returnRequest?.id,
          amount,
          status: "PENDING",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          note: "Refund request received.",
        };
        createdRefund = refund;

        return {
          ...order,
          status: "REFUND_REQUESTED",
          updatedAt: new Date().toISOString(),
          statusHistory: [
            ...order.statusHistory,
            historyEntry("REFUND_REQUESTED", "Refund request received."),
          ],
          refunds: [...order.refunds, refund],
        };
      }),
    );
    return createdRefund;
  }, []);

  const updateRefundStatus = useCallback(
    (orderNumber: string, refundId: string, status: RefundStatus) => {
      setOrders((current) =>
        current.map((order) =>
          order.orderNumber === orderNumber
            ? {
                ...order,
                updatedAt: new Date().toISOString(),
                refunds: order.refunds.map((refund) =>
                  refund.id === refundId
                    ? { ...refund, status, updatedAt: new Date().toISOString() }
                    : refund,
                ),
              }
            : order,
        ),
      );
    },
    [],
  );

  const value = useMemo(
    () => ({
      orders,
      createOrder,
      saveOrderMirror,
      replaceOrderMirrors,
      getOrder,
      updateOrderStatus,
      updatePaymentStatus,
      requestCancellation,
      createReturnRequest,
      requestRefund,
      updateRefundStatus,
    }),
    [
      createOrder,
      createReturnRequest,
      getOrder,
      orders,
      requestCancellation,
      requestRefund,
      replaceOrderMirrors,
      saveOrderMirror,
      updateOrderStatus,
      updatePaymentStatus,
      updateRefundStatus,
    ],
  );

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}

const OrdersContext = createContext<OrdersContextValue | null>(null);

export function useOrders() {
  const context = useContext(OrdersContext);
  if (!context) throw new Error("useOrders must be used inside OrdersProvider");
  return context;
}

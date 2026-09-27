import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FiPackage, FiRefreshCw, FiXCircle } from "react-icons/fi";
import { OrderSummary } from "@/components/commerce/OrderSummary";
import { OrderTimeline } from "@/components/commerce/OrderTimeline";
import { PaymentStatusNotice } from "@/components/commerce/PaymentStatusNotice";
import { apiRequest } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import {
  canRequestCancellation,
  canRequestReturn,
  orderStatusLabels,
  paymentStatusLabels,
  refundStatusLabels,
  returnStatusLabels,
} from "@/lib/order-status";
import { formatDateTime } from "@/lib/order-utils";
import { usePageTitle } from "@/lib/page-title";
import { getCustomerPaymentError } from "@/lib/payment-errors";
import { useOrders } from "@/state/orders";
import type { OrderStatus, RefundStatus } from "@/types/order";

const cancellationReasons = [
  "Ordered by mistake",
  "Need to change item",
  "Delivery timing",
  "Found another option",
  "Other",
];

const devStatusActions: { label: string; status: OrderStatus }[] = [
  { label: "Confirm", status: "CONFIRMED" },
  { label: "Start Processing", status: "PROCESSING" },
  { label: "Ship", status: "SHIPPED" },
  { label: "Deliver", status: "DELIVERED" },
];

const devRefundActions: { label: string; status: RefundStatus }[] = [
  { label: "Approve refund", status: "APPROVED" },
  { label: "Process refund", status: "PROCESSING" },
  { label: "Complete refund", status: "REFUNDED" },
];

type RetryPaymentState = "redirecting" | "error" | null;

export function OrderDetailPage() {
  const { orderNumber = "" } = useParams();
  const {
    getOrder,
    requestCancellation,
    requestRefund,
    updateOrderStatus,
    updateRefundStatus,
  } = useOrders();
  const { saveOrderMirror } = useOrders();
  const localOrder = getOrder(orderNumber);
  const [backendOrder, setBackendOrder] = useState(localOrder);
  const [loading, setLoading] = useState(Boolean(orderNumber));
  const order = backendOrder ?? localOrder;
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState(cancellationReasons[0]);
  const [customReason, setCustomReason] = useState("");
  const [paymentState, setPaymentState] = useState<RetryPaymentState>(null);
  const [paymentError, setPaymentError] = useState("");
  const [isPaymentRedirecting, setIsPaymentRedirecting] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const paymentNoticeRef = useRef<HTMLDivElement | null>(null);

  usePageTitle(order ? `${order.orderNumber} | TekCentral` : "Order | TekCentral");

  const latestReturn = order?.returns[0];
  const latestRefund = order?.refunds[0];
  const refundReturnIds = useMemo(
    () => new Set(order?.refunds.map((refund) => refund.returnRequestId) ?? []),
    [order],
  );

  useEffect(() => {
    if (!orderNumber) {
      return;
    }
    apiRequest<{ order: NonNullable<typeof localOrder> }>(
      `/api/orders/${encodeURIComponent(orderNumber)}`,
    )
      .then((response) => {
        setBackendOrder(response.order);
        saveOrderMirror(response.order);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [orderNumber, saveOrderMirror]);

  if (!order && loading) {
    return (
      <section className="bg-white px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-lg border border-[#E4E7EC] bg-white p-8 text-center text-sm font-semibold text-[#727986] shadow-sm">
          Loading order...
        </div>
      </section>
    );
  }

  if (!order) {
    return (
      <section className="bg-white px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-lg border border-[#E4E7EC] bg-white p-8 text-center shadow-sm">
          <h1 className="text-3xl font-black text-[#0A0A0A]">Order not found.</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#3F4652]">
            Check your order number or return to your order history.
          </p>
          <Link
            to="/orders"
            className="mt-6 inline-flex rounded-md bg-[var(--tek-accent)] px-5 py-3 text-sm font-black text-[var(--tek-accent-ink)]"
          >
            View Orders
          </Link>
        </div>
      </section>
    );
  }

  const submitCancellation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const finalReason = reason === "Other" ? customReason.trim() : reason;
    requestCancellation(order.orderNumber, finalReason || undefined);
    setCancelOpen(false);
  };

  const requestRefundForReturn = (returnRequestId: string) => {
    requestRefund(order.orderNumber, returnRequestId);
  };

  const redirectToPayfast = (actionUrl: string, fields: Record<string, string>) => {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = actionUrl;
    Object.entries(fields).forEach(([name, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  };

  const retryPayment = async () => {
    if (isPaymentRedirecting) return;
    setPaymentState("redirecting");
    setPaymentError("");
    setIsPaymentRedirecting(true);
    try {
      const paymentRequest = await apiRequest<{
        actionUrl: string;
        fields: Record<string, string>;
      }>("/api/payments/payfast/create", {
        method: "POST",
        body: JSON.stringify({ orderNumber: order.orderNumber }),
      });
      redirectToPayfast(paymentRequest.actionUrl, paymentRequest.fields);
    } catch (error) {
      console.error(error);
      setPaymentError(getCustomerPaymentError(error));
      setPaymentState("error");
      setIsPaymentRedirecting(false);
      window.setTimeout(() => paymentNoticeRef.current?.focus(), 0);
    }
  };

  return (
    <section className="bg-[#F6F7F9] px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">
              Order
            </p>
            <h1 className="mt-3 text-4xl font-black text-[#0A0A0A]">
              {order.orderNumber}
            </h1>
            <p className="mt-3 text-sm font-semibold text-[#727986]">
              Placed {formatDateTime(order.createdAt)}
            </p>
          </div>
          <Link
            to="/orders"
            className="inline-flex justify-center rounded-md border border-[#E4E7EC] bg-white px-5 py-3 text-sm font-black text-[#0A0A0A] transition hover:border-[#0A0A0A]"
          >
            Back to Orders
          </Link>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatusCard label="Order Status" value={orderStatusLabels[order.status]} />
              <StatusCard
                label="Payment Status"
                value={paymentStatusLabels[order.payment.status]}
              />
              <StatusCard
                label="Return Status"
                value={latestReturn ? returnStatusLabels[latestReturn.status] : "Not started"}
              />
              <StatusCard
                label="Refund Status"
                value={latestRefund ? refundStatusLabels[latestRefund.status] : "Not started"}
              />
            </div>

            <OrderTimeline order={order} />

            <div className="rounded-lg border border-[#E4E7EC] bg-white p-5">
              <h2 className="text-lg font-black text-[#0A0A0A]">Delivery details</h2>
              <div className="mt-4 grid gap-4 text-sm leading-6 text-[#3F4652] md:grid-cols-2">
                <div>
                  <p className="font-black text-[#0A0A0A]">{order.deliveryMethod.name}</p>
                  <p>{order.deliveryMethod.description}</p>
                  <p>{order.deliveryMethod.estimatedRange}</p>
                </div>
                <div>
                  <p>{order.deliveryAddress.streetAddress}</p>
                  <p>
                    {order.deliveryAddress.suburb}, {order.deliveryAddress.city}
                  </p>
                  <p>
                    {order.deliveryAddress.province}, {order.deliveryAddress.postalCode}
                  </p>
                  <p>{order.deliveryAddress.country}</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-[#E4E7EC] bg-white p-5">
              <h2 className="text-lg font-black text-[#0A0A0A]">Customer details</h2>
              <div className="mt-4 grid gap-4 text-sm leading-6 text-[#3F4652] md:grid-cols-2">
                <div>
                  <p className="font-black text-[#0A0A0A]">
                    {order.customer.firstName} {order.customer.lastName}
                  </p>
                  <p>{order.customer.email}</p>
                  <p>{order.customer.mobile}</p>
                </div>
                <div>
                  <p className="font-black text-[#0A0A0A]">Payment method</p>
                  <p>{order.paymentMethod.name}</p>
                  <p>{order.paymentMethod.settlementNote}</p>
                </div>
              </div>
            </div>

            {(order.returns.length > 0 || order.refunds.length > 0) && (
              <div className="rounded-lg border border-[#E4E7EC] bg-white p-5">
                <h2 className="text-lg font-black text-[#0A0A0A]">Returns and refunds</h2>
                <div className="mt-5 space-y-4">
                  {order.returns.map((returnRequest) => (
                    <article key={returnRequest.id} className="rounded-md bg-[#F6F7F9] p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-black text-[#0A0A0A]">
                            {returnStatusLabels[returnRequest.status]}
                          </p>
                          <p className="mt-1 text-sm text-[#727986]">
                            {returnRequest.reason} | {formatDateTime(returnRequest.createdAt)}
                          </p>
                          <p className="mt-2 text-sm text-[#3F4652]">
                            {returnRequest.items
                              .map((item) => `${item.quantity} x ${item.name}`)
                              .join(", ")}
                          </p>
                        </div>
                        {!refundReturnIds.has(returnRequest.id) && (
                          <button
                            type="button"
                            onClick={() => requestRefundForReturn(returnRequest.id)}
                            className="inline-flex justify-center rounded-md border border-[#E4E7EC] bg-white px-4 py-2 text-sm font-black text-[#0A0A0A] transition hover:border-[#0A0A0A]"
                          >
                            Request Refund
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                  {order.refunds.map((refund) => (
                    <article key={refund.id} className="rounded-md bg-[#F6F7F9] p-4">
                      <p className="text-sm font-black text-[#0A0A0A]">
                        Refund {refundStatusLabels[refund.status]}
                      </p>
                      <p className="mt-1 text-sm text-[#727986]">
                        {formatCurrency(refund.amount, order.currency)}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-lg border border-[#E4E7EC] bg-white p-5">
              <h2 className="text-lg font-black text-[#0A0A0A]">Available actions</h2>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                {canRequestCancellation(order.status) && (
                  <button
                    type="button"
                    onClick={() => {
                      setCancelOpen(true);
                      window.setTimeout(() => closeButtonRef.current?.focus(), 0);
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-[#E4E7EC] px-5 py-3 text-sm font-black text-[#0A0A0A] transition hover:border-[#0A0A0A]"
                  >
                    <FiXCircle aria-hidden="true" />
                    Request Cancellation
                  </button>
                )}
                {order.payment.status !== "PAID" && (
                  <button
                    type="button"
                    onClick={retryPayment}
                    disabled={isPaymentRedirecting}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--tek-accent)] px-5 py-3 text-sm font-black text-[var(--tek-accent-ink)] transition hover:bg-[var(--tek-accent-hover)] disabled:cursor-wait disabled:opacity-70"
                  >
                    {isPaymentRedirecting ? "Redirecting to PayFast..." : "Try PayFast Again"}
                  </button>
                )}
                {canRequestReturn(order.status) && (
                  <Link
                    to={`/order/${order.orderNumber}/return`}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--tek-accent)] px-5 py-3 text-sm font-black text-[var(--tek-accent-ink)] transition hover:bg-[var(--tek-accent-hover)]"
                  >
                    <FiRefreshCw aria-hidden="true" />
                    Request Return
                  </Link>
                )}
                {!canRequestCancellation(order.status) && !canRequestReturn(order.status) && (
                  <p className="text-sm leading-6 text-[#727986]">
                    No self-service actions are available for this order status.
                  </p>
                )}
              </div>
              {paymentState && (
                <div ref={paymentNoticeRef} tabIndex={-1} className="mt-4 outline-none">
                  <PaymentStatusNotice
                    variant={paymentState === "error" ? "error" : "pending"}
                    loading={paymentState === "redirecting"}
                    title={
                      paymentState === "error"
                        ? "Unable to start PayFast checkout"
                        : "Redirecting to PayFast"
                    }
                    message={
                      paymentState === "error"
                        ? paymentError
                        : "We're securely transferring you to PayFast to complete your payment."
                    }
                    helper={
                      paymentState === "error"
                        ? "Please try again from this order."
                        : "Please wait a moment and do not close this window."
                    }
                    actions={
                      paymentState === "error" ? (
                        <>
                          <button
                            type="button"
                            onClick={retryPayment}
                            className="inline-flex justify-center rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black text-[var(--tek-accent-ink)] transition hover:bg-[var(--tek-accent-hover)]"
                          >
                            Try Again
                          </button>
                          <Link
                            to="/orders"
                            className="inline-flex justify-center rounded-md border border-[#E4E7EC] bg-white px-4 py-2 text-sm font-black text-[#0A0A0A] transition hover:border-[#0A0A0A]"
                          >
                            View Orders
                          </Link>
                        </>
                      ) : undefined
                    }
                  />
                </div>
              )}
            </div>

            {import.meta.env.DEV && (
              <div className="rounded-lg border border-dashed border-[#BFC7D4] bg-white p-5">
                <h2 className="text-lg font-black text-[#0A0A0A]">
                  Development order testing
                </h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {devStatusActions.map((action) => (
                    <button
                      key={action.status}
                      type="button"
                      onClick={() =>
                        updateOrderStatus(
                          order.orderNumber,
                          action.status,
                          `${action.label} test action.`,
                        )
                      }
                      className="rounded-md border border-[#E4E7EC] px-3 py-2 text-xs font-black text-[#0A0A0A] transition hover:border-[#0A0A0A]"
                    >
                      {action.label}
                    </button>
                  ))}
                  {order.refunds.map((refund) =>
                    devRefundActions.map((action) => (
                      <button
                        key={`${refund.id}-${action.status}`}
                        type="button"
                        onClick={() =>
                          updateRefundStatus(order.orderNumber, refund.id, action.status)
                        }
                        className="rounded-md border border-[#E4E7EC] px-3 py-2 text-xs font-black text-[#0A0A0A] transition hover:border-[#0A0A0A]"
                      >
                        {action.label}
                      </button>
                    )),
                  )}
                </div>
              </div>
            )}
          </div>

          <OrderSummary order={order} />
        </div>
      </div>

      {cancelOpen && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-black/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-title"
        >
          <form
            onSubmit={submitCancellation}
            className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="cancel-title" className="text-2xl font-black text-[#0A0A0A]">
                  Request cancellation
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#3F4652]">
                  Tell us why you want to cancel this order.
                </p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setCancelOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-md border border-[#E4E7EC]"
                aria-label="Close cancellation dialog"
              >
                <FiXCircle aria-hidden="true" />
              </button>
            </div>
            <fieldset className="mt-5 space-y-3">
              <legend className="sr-only">Cancellation reason</legend>
              {cancellationReasons.map((item) => (
                <label key={item} className="flex items-center gap-3 text-sm font-semibold">
                  <input
                    type="radio"
                    name="cancelReason"
                    checked={reason === item}
                    onChange={() => setReason(item)}
                  />
                  {item}
                </label>
              ))}
            </fieldset>
            {reason === "Other" && (
              <label className="mt-4 block text-sm font-black text-[#0A0A0A]">
                Reason
                <textarea
                  value={customReason}
                  onChange={(event) => setCustomReason(event.target.value)}
                  className="mt-2 min-h-24 w-full rounded-md border border-[#E4E7EC] p-3 text-sm font-semibold outline-none focus:border-[var(--tek-accent)] focus:ring-4 focus:ring-[rgba(70,157,139,0.14)]"
                />
              </label>
            )}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setCancelOpen(false)}
                className="rounded-md border border-[#E4E7EC] px-5 py-3 text-sm font-black text-[#0A0A0A]"
              >
                Keep Order
              </button>
              <button
                type="submit"
                className="rounded-md bg-[var(--tek-accent)] px-5 py-3 text-sm font-black text-[var(--tek-accent-ink)]"
              >
                Submit Cancellation
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#E4E7EC] bg-white p-5">
      <FiPackage className="text-[var(--tek-accent)]" aria-hidden="true" />
      <p className="mt-4 text-xs font-black uppercase tracking-[0.14em] text-[#727986]">
        {label}
      </p>
      <p className="mt-2 text-sm font-black text-[#0A0A0A]">{value}</p>
    </div>
  );
}

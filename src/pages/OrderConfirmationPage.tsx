import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FiCheckCircle, FiClock, FiXCircle } from "react-icons/fi";
import { OrderSummary } from "@/components/commerce/OrderSummary";
import { apiRequest } from "@/lib/api";
import { paymentStatusLabels } from "@/lib/order-status";
import { formatDateTime } from "@/lib/order-utils";
import { usePageTitle } from "@/lib/page-title";
import { useOrders } from "@/state/orders";

export function OrderConfirmationPage() {
  usePageTitle("Order received | TekCentral");
  const { orderNumber = "" } = useParams();
  const { getOrder, saveOrderMirror } = useOrders();
  const [loading, setLoading] = useState(Boolean(orderNumber));
  const localOrder = getOrder(orderNumber);
  const [backendOrder, setBackendOrder] = useState(localOrder);
  const order = backendOrder ?? localOrder;

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
    return <LoadingOrder />;
  }

  if (!order) {
    return (
      <section className="bg-white px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-lg border border-[#E4E7EC] bg-white p-8 text-center shadow-sm">
          <h1 className="text-3xl font-black text-[#0A0A0A]">Order not found.</h1>
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

  const paid = order.payment.status === "PAID";
  const cancelled = order.payment.status === "CANCELLED" || order.payment.status === "FAILED";
  const headline = paid
    ? "Payment confirmed"
    : cancelled
      ? "Payment not completed"
      : "Confirming your payment";
  const body = paid
    ? "Your PayFast payment has been confirmed and your order is ready for the next step."
    : cancelled
      ? "Your order has not been paid. You can view the order and try payment again."
      : "Your order has been created and is waiting for PayFast payment confirmation.";

  return (
    <section className="bg-[#F6F7F9] px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-lg bg-[radial-gradient(circle_at_82%_20%,rgba(70,157,139,0.22),transparent_34%),linear-gradient(135deg,#080A0A_0%,#101716_66%,#10231F_100%)] p-6 text-white sm:p-8">
          {paid ? (
            <FiCheckCircle className="text-4xl text-[var(--tek-accent)]" aria-hidden="true" />
          ) : cancelled ? (
            <FiXCircle className="text-4xl text-[#F79009]" aria-hidden="true" />
          ) : (
            <FiClock className="text-4xl text-[var(--tek-accent)]" aria-hidden="true" />
          )}
          <p className="mt-6 text-sm font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">
            Order received
          </p>
          <h1 className="mt-3 text-4xl font-black sm:text-5xl">
            {headline}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/72">
            {body}
          </p>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <InfoBlock label="Order number" value={order.orderNumber} />
            <InfoBlock label="Order date" value={formatDateTime(order.createdAt)} />
            <InfoBlock label="Customer email" value={order.customer.email} />
            <InfoBlock label="Delivery method" value={order.deliveryMethod.name} />
            <InfoBlock label="Payment method" value={order.paymentMethod.name} />
            <InfoBlock
              label="Payment status"
              value={paymentStatusLabels[order.payment.status]}
            />
            <div className="rounded-lg border border-[#E4E7EC] bg-white p-5">
              <h2 className="text-lg font-black text-[#0A0A0A]">Delivery address</h2>
              <p className="mt-3 text-sm leading-6 text-[#3F4652]">
                {order.deliveryAddress.streetAddress}
                <br />
                {order.deliveryAddress.suburb}, {order.deliveryAddress.city}
                <br />
                {order.deliveryAddress.province}, {order.deliveryAddress.postalCode}
                <br />
                {order.deliveryAddress.country}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                to={`/order/${order.orderNumber}`}
                className="inline-flex justify-center rounded-md bg-[var(--tek-accent)] px-5 py-3 text-sm font-black text-[var(--tek-accent-ink)]"
              >
                View Order
              </Link>
              <Link
                to="/shop"
                className="inline-flex justify-center rounded-md border border-[#E4E7EC] bg-white px-5 py-3 text-sm font-black text-[#0A0A0A] transition hover:border-[#0A0A0A]"
              >
                Continue Shopping
              </Link>
            </div>
          </div>
          <OrderSummary order={order} />
        </div>
      </div>
    </section>
  );
}

function LoadingOrder() {
  return (
    <section className="bg-white px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-lg border border-[#E4E7EC] bg-white p-8 text-center text-sm font-semibold text-[#727986] shadow-sm">
        Loading order...
      </div>
    </section>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#E4E7EC] bg-white p-5">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#727986]">
        {label}
      </p>
      <p className="mt-2 text-lg font-black text-[#0A0A0A]">{value}</p>
    </div>
  );
}

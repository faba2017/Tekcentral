import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiPackage } from "react-icons/fi";
import { apiRequest } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { orderStatusLabels } from "@/lib/order-status";
import { formatDateTime } from "@/lib/order-utils";
import { usePageTitle } from "@/lib/page-title";
import { useOrders } from "@/state/orders";

export function OrdersPage() {
  usePageTitle("Orders | TekCentral");
  const { orders, replaceOrderMirrors } = useOrders();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<{ orders: typeof orders }>("/api/orders")
      .then((response) => replaceOrderMirrors(response.orders))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [replaceOrderMirrors]);

  return (
    <section className="bg-[#F6F7F9] px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">
          Orders
        </p>
        <h1 className="mt-3 text-4xl font-black text-[#0A0A0A]">Your orders</h1>
        <p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-[#727986]">
          Orders placed in this browser appear here.
        </p>

        {loading ? (
          <div className="mt-10 rounded-lg border border-[#E4E7EC] bg-white p-8 text-sm font-semibold text-[#727986]">
            Loading orders...
          </div>
        ) : orders.length === 0 ? (
          <div className="mt-10 rounded-lg border border-dashed border-[#BFC7D4] bg-white p-10 text-center">
            <FiPackage className="mx-auto text-3xl text-[var(--tek-accent)]" />
            <h2 className="mt-4 text-2xl font-black text-[#0A0A0A]">No orders yet.</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#3F4652]">
              Once you complete checkout, your order history will appear here.
            </p>
            <Link
              to="/shop"
              className="mt-6 inline-flex rounded-md bg-[var(--tek-accent)] px-5 py-3 text-sm font-black text-[var(--tek-accent-ink)]"
            >
              Shop Technology
            </Link>
          </div>
        ) : (
          <div className="mt-10 space-y-4">
            {orders.map((order) => (
              <article
                key={order.id}
                className="grid gap-4 rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm md:grid-cols-[1.2fr_1fr_1fr_auto]"
              >
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#727986]">
                    Order
                  </p>
                  <h2 className="mt-2 text-lg font-black text-[#0A0A0A]">
                    {order.orderNumber}
                  </h2>
                  <p className="mt-1 text-sm text-[#727986]">
                    {formatDateTime(order.createdAt)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#727986]">
                    Status
                  </p>
                  <p className="mt-2 text-sm font-black text-[#0A0A0A]">
                    {orderStatusLabels[order.status]}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#727986]">
                    Total
                  </p>
                  <p className="mt-2 text-sm font-black text-[#0A0A0A]">
                    {formatCurrency(order.total, order.currency)}
                  </p>
                  <p className="mt-1 text-sm text-[#727986]">
                    {order.items.reduce((sum, item) => sum + item.quantity, 0)} items
                  </p>
                </div>
                <Link
                  to={`/order/${order.orderNumber}`}
                  className="inline-flex h-11 items-center justify-center rounded-md border border-[#E4E7EC] px-4 text-sm font-black text-[#0A0A0A] transition hover:border-[#0A0A0A]"
                >
                  View Order
                </Link>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

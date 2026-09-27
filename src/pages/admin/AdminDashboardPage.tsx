import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AdminPageHeader, AdminShell, AdminStatusBadge } from "@/components/admin/AdminShell";
import { apiRequest } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { itemCount } from "@/lib/admin";
import { paymentStatusLabels, orderStatusLabels } from "@/lib/order-status";
import { formatDateTime } from "@/lib/order-utils";
import { usePageTitle } from "@/lib/page-title";
import type { AdminOrdersResponse, AdminSupplierOrdersResponse } from "@/lib/admin";
import type { AttentionReason, Order, SupplierOrder } from "@/types/order";

export function AdminDashboardPage() {
  usePageTitle("Admin dashboard | TekCentral");
  const [orders, setOrders] = useState<Order[]>([]);
  const [attention, setAttention] = useState<AdminOrdersResponse["attention"]>([]);
  const [supplierOrders, setSupplierOrders] = useState<SupplierOrder[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest<AdminOrdersResponse>("/api/admin/orders")
      .then((response) => {
        setOrders(response.orders);
        setAttention(response.attention);
      })
      .catch(() => setError("Admin order data is not available right now."));
    apiRequest<AdminSupplierOrdersResponse>("/api/admin/supplier-orders")
      .then((response) => setSupplierOrders(response.supplierOrders))
      .catch(() => setSupplierOrders([]));
  }, []);

  const attentionRows = useMemo(
    () =>
      attention
        .filter((entry) => entry.reasons.length > 0)
        .map((entry) => ({
          order: orders.find((order) => order.orderNumber === entry.orderNumber),
          reasons: entry.reasons,
        }))
        .filter((entry): entry is { order: Order; reasons: AttentionReason[] } =>
          Boolean(entry.order),
        ),
    [attention, orders],
  );

  const supplierMetrics = useMemo(
    () => [
      {
        label: "Awaiting approval",
        value: supplierOrders.filter((item) => item.status === "READY_FOR_APPROVAL").length,
        to: "/admin/supplier-orders",
      },
      {
        label: "Submitted",
        value: supplierOrders.filter((item) => item.status === "SUBMITTED").length,
        to: "/admin/supplier-orders",
      },
      {
        label: "Backordered",
        value: supplierOrders.filter(
          (item) => item.status === "BACKORDERED" || item.status === "PARTIALLY_CONFIRMED",
        ).length,
        to: "/admin/supplier-orders",
      },
      {
        label: "Rejected",
        value: supplierOrders.filter((item) => item.status === "REJECTED").length,
        to: "/admin/supplier-orders",
      },
    ],
    [supplierOrders],
  );

  const reasonBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    attentionRows.forEach(({ reasons }) => {
      reasons.forEach((reason) => counts.set(reason.label, (counts.get(reason.label) ?? 0) + 1));
    });
    return Array.from(counts.entries()).map(([label, count]) => `${count} ${label.toLowerCase()}`);
  }, [attentionRows]);

  const metrics = useMemo(
    () => [
      {
        label: "Orders requiring attention",
        value: attentionRows.length,
        to: "/admin/orders?attention=true",
        helper: reasonBreakdown.slice(0, 3).join(" · "),
      },
      {
        label: "Paid awaiting processing",
        value: orders.filter(
          (order) => order.payment.status === "PAID" && order.status === "CONFIRMED",
        ).length,
        to: "/admin/orders?filter=confirmed",
      },
      {
        label: "Processing",
        value: orders.filter((order) => order.status === "PROCESSING").length,
        to: "/admin/orders?filter=processing",
      },
      {
        label: "Partially shipped",
        value: orders.filter((order) => order.status === "PARTIALLY_SHIPPED").length,
        to: "/admin/orders?filter=partially shipped",
      },
      { label: "Shipped", value: orders.filter((order) => order.status === "SHIPPED").length, to: "/admin/orders?filter=shipped" },
      {
        label: "Returns awaiting review",
        value: orders.flatMap((order) => order.returns).filter((item) => item.status === "REQUESTED")
          .length,
        to: "/admin/orders?filter=return requested",
      },
      {
        label: "Refunds awaiting review",
        value: orders.flatMap((order) => order.refunds).filter((item) => item.status === "PENDING")
          .length,
        to: "/admin/orders?filter=refund requested",
      },
    ],
    [attentionRows.length, orders, reasonBreakdown],
  );

  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="Internal operations"
        title="Admin dashboard"
        description="Operational order summary from the current backend demo order store."
      />
      {error && <p className="mt-6 rounded-md border border-[#FDA29B] bg-[#FFFBFA] p-4 text-sm font-semibold">{error}</p>}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
        {metrics.map((metric) => (
          <Link key={metric.label} to={metric.to} className="rounded-lg border border-[#E4E7EC] bg-white p-4 shadow-sm transition hover:border-[var(--tek-accent)]">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[#727986]">
              {metric.label}
            </p>
            <p className="mt-3 text-3xl font-black text-[#0A0A0A]">{metric.value}</p>
            {metric.helper && <p className="mt-2 text-xs font-semibold leading-5 text-[#727986]">{metric.helper}</p>}
          </Link>
        ))}
      </div>
      <section className="mt-8 rounded-lg border border-[#E4E7EC] bg-white shadow-sm">
        <div className="border-b border-[#E4E7EC] p-4">
          <h2 className="text-lg font-black">Attention queue</h2>
        </div>
        <div className="divide-y divide-[#E4E7EC]">
          {attentionRows.slice(0, 6).map(({ order, reasons }) => (
            <Link key={order.orderNumber} to={`/admin/orders/${order.orderNumber}`} className="grid gap-3 p-4 transition hover:bg-[#F6F7F9] md:grid-cols-[1fr_1.2fr_110px]">
              <div>
                <p className="text-sm font-black">{order.orderNumber}</p>
                <p className="mt-1 text-xs font-semibold text-[#727986]">{order.customer.firstName} {order.customer.lastName}</p>
              </div>
              <div>
                <p className="text-sm font-black text-[#0A0A0A]">{reasons[0].label}</p>
                <p className="mt-1 text-xs font-semibold text-[#727986]">{reasons[0].detail}</p>
              </div>
              <span className="self-start rounded-md bg-[var(--tek-accent)] px-3 py-2 text-center text-sm font-black text-[var(--tek-accent-ink)]">
                Review
              </span>
            </Link>
          ))}
          {attentionRows.length === 0 && <p className="p-6 text-sm font-semibold text-[#727986]">No attention items right now.</p>}
        </div>
      </section>
      <section className="mt-8 rounded-lg border border-[#E4E7EC] bg-white p-4 shadow-sm">
        <h2 className="text-lg font-black">Supplier operations</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {supplierMetrics.map((metric) => (
            <Link
              key={metric.label}
              to={metric.to}
              className="rounded-lg border border-[#E4E7EC] bg-[#F6F7F9] p-4 transition hover:border-[var(--tek-accent)]"
            >
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[#727986]">
                {metric.label}
              </p>
              <p className="mt-3 text-3xl font-black">{metric.value}</p>
            </Link>
          ))}
        </div>
      </section>
      <section className="mt-8 rounded-lg border border-[#E4E7EC] bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-[#E4E7EC] p-4">
          <h2 className="text-lg font-black">Recent orders</h2>
          <Link to="/admin/orders" className="text-sm font-black text-[var(--tek-accent)]">
            View all
          </Link>
        </div>
        <div className="divide-y divide-[#E4E7EC]">
          {orders.slice(0, 6).map((order) => (
            <Link
              key={order.orderNumber}
              to={`/admin/orders/${order.orderNumber}`}
              className="grid gap-3 p-4 transition hover:bg-[#F6F7F9] md:grid-cols-[1.2fr_1fr_0.8fr_0.8fr]"
            >
              <div>
                <p className="text-sm font-black">{order.orderNumber}</p>
                <p className="mt-1 text-xs font-semibold text-[#727986]">
                  {order.customer.firstName} {order.customer.lastName} | {itemCount(order)} items
                </p>
              </div>
              <p className="text-sm font-semibold text-[#3F4652]">
                {formatDateTime(order.createdAt)}
              </p>
              <div className="flex flex-wrap gap-2">
                <AdminStatusBadge label={paymentStatusLabels[order.payment.status]} status={order.payment.status} />
                <AdminStatusBadge label={orderStatusLabels[order.status]} status={order.status} />
              </div>
              <p className="text-sm font-black md:text-right">
                {formatCurrency(order.total, order.currency)}
              </p>
            </Link>
          ))}
          {orders.length === 0 && (
            <p className="p-6 text-sm font-semibold text-[#727986]">No backend orders found.</p>
          )}
        </div>
      </section>
    </AdminShell>
  );
}

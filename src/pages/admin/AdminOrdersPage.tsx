import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { AdminPageHeader, AdminShell, AdminStatusBadge } from "@/components/admin/AdminShell";
import { apiRequest } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import {
  attentionForOrder,
  itemCount,
  latestRefundStatus,
  latestReturnStatus,
  productContext,
} from "@/lib/admin";
import { orderStatusLabels, paymentStatusLabels } from "@/lib/order-status";
import { formatDateTime } from "@/lib/order-utils";
import { usePageTitle } from "@/lib/page-title";
import type { AdminOrdersResponse } from "@/lib/admin";
import type { Order } from "@/types/order";

const filters = [
  "all",
  "unpaid/pending",
  "paid",
  "confirmed",
  "processing",
  "partially shipped",
  "shipped",
  "delivered",
  "cancelled",
  "return requested",
  "refund requested",
];

const pageSize = 20;

export function AdminOrdersPage() {
  usePageTitle("Admin orders | TekCentral");
  const [params] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [attention, setAttention] = useState<AdminOrdersResponse["attention"]>([]);
  const [filter, setFilter] = useState(params.get("filter") ?? "all");
  const [search, setSearch] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(params.get("attention") === "true");
  const [copied, setCopied] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    apiRequest<AdminOrdersResponse>("/api/admin/orders")
      .then((response) => {
        setOrders(response.orders);
        setAttention(response.attention);
      })
      .catch(() => setOrders([]));
  }, []);

  const copyText = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1400);
  };

  const visibleOrders = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesSearch =
        !searchTerm ||
        order.orderNumber.toLowerCase().includes(searchTerm) ||
        `${order.customer.firstName} ${order.customer.lastName}`.toLowerCase().includes(searchTerm) ||
        order.customer.email.toLowerCase().includes(searchTerm);
      const matchesFilter =
        filter === "all" ||
        (attentionOnly && attentionForOrder(attention, order.orderNumber).length > 0) ||
        (filter === "unpaid/pending" && order.payment.status !== "PAID") ||
        (filter === "paid" && order.payment.status === "PAID") ||
        (filter === "confirmed" && order.status === "CONFIRMED") ||
        (filter === "processing" && order.status === "PROCESSING") ||
        (filter === "partially shipped" && order.status === "PARTIALLY_SHIPPED") ||
        (filter === "shipped" && order.status === "SHIPPED") ||
        (filter === "delivered" && order.status === "DELIVERED") ||
        (filter === "cancelled" && order.status === "CANCELLED") ||
        (filter === "return requested" &&
          order.returns.some((item) => item.status === "REQUESTED")) ||
        (filter === "refund requested" &&
          order.refunds.some((item) => item.status === "PENDING"));
      return matchesSearch && matchesFilter && (!attentionOnly || attentionForOrder(attention, order.orderNumber).length > 0);
    });
  }, [attention, attentionOnly, filter, orders, search]);

  const totalPages = Math.max(1, Math.ceil(visibleOrders.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStartIndex = (currentPage - 1) * pageSize;
  const pagedOrders = visibleOrders.slice(pageStartIndex, pageStartIndex + pageSize);

  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="Order operations"
        title="Orders"
        description="Search and filter backend orders without exposing internal operations to customers."
      />
      {copied && (
        <p role="status" aria-live="polite" className="mt-4 w-fit rounded-md border border-[#B9E2DB] bg-[#EFFFFB] px-3 py-2 text-sm font-black">
          Copied {copied}
        </p>
      )}
      <div className="mt-6 grid gap-3 lg:grid-cols-[260px_1fr]">
        <label className="block text-sm font-black">
          Search
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="mt-2 h-11 w-full rounded-md border border-[#E4E7EC] bg-white px-3 text-sm font-semibold outline-none focus:border-[var(--tek-accent)]"
            placeholder="Order, customer or email"
          />
        </label>
        <div className="flex flex-wrap gap-2 self-end">
          <button
            type="button"
            onClick={() => {
              setAttentionOnly((current) => !current);
              setPage(1);
            }}
            className={`rounded-md border px-3 py-2 text-xs font-black ${
              attentionOnly ? "border-[#FEDF89] bg-[#FFFAEB]" : "border-[#E4E7EC] bg-white"
            }`}
          >
            Needs attention
          </button>
          {filters.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setFilter(item);
                setPage(1);
              }}
              className={`rounded-md border px-3 py-2 text-xs font-black capitalize ${
                filter === item
                  ? "border-[var(--tek-accent)] bg-[#EFFFFB]"
                  : "border-[#E4E7EC] bg-white"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <section className="mt-6 overflow-hidden rounded-lg border border-[#E4E7EC] bg-white shadow-sm">
        <div className="hidden grid-cols-[64px_1fr_1fr_0.7fr_1.1fr_1.2fr_120px] gap-4 border-b border-[#E4E7EC] bg-[#F6F7F9] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-[#727986] lg:grid">
          <span>#</span>
          <span>Order</span>
          <span>Customer</span>
          <span>Total</span>
          <span>Items</span>
          <span>Statuses</span>
          <span>Action</span>
        </div>
        <div className="divide-y divide-[#E4E7EC]">
          {pagedOrders.map((order, index) => (
            (() => {
              const attentionReasons = attentionForOrder(attention, order.orderNumber);
              return (
            <article
              key={order.orderNumber}
              className="grid gap-3 px-4 py-4 lg:grid-cols-[64px_1fr_1fr_0.7fr_1.1fr_1.2fr_120px] lg:items-center"
            >
              <p className="text-xs font-black text-[#727986]">
                <span className="lg:hidden">Row </span>{pageStartIndex + index + 1}
              </p>
              <div>
                <p className="flex flex-wrap items-center gap-2 text-sm font-black">
                  {order.orderNumber}
                  {order.payment.status === "PAID" && !order.opsPaymentAcknowledgedAt && (
                    <span className="rounded-full bg-[#B42318] px-2 py-0.5 text-[0.65rem] font-black uppercase tracking-[0.08em] text-white">
                      NEW
                    </span>
                  )}
                </p>
                <p className="mt-1 text-xs font-semibold text-[#727986]">
                  {formatDateTime(order.createdAt)}
                </p>
                {attentionReasons[0] && (
                  <p className="mt-2 text-xs font-black text-[#B54708]">
                    Needs attention · {attentionReasons[0].detail}
                  </p>
                )}
              </div>
              <div>
                <p className="text-sm font-black">
                  {order.customer.firstName} {order.customer.lastName}
                </p>
                <p className="mt-1 break-all text-xs font-semibold text-[#727986]">
                  {order.customer.email}
                </p>
              </div>
              <p className="text-sm font-black">{formatCurrency(order.total, order.currency)}</p>
              <div>
                <p className="text-sm font-semibold text-[#3F4652]">{itemCount(order)} items</p>
                <p className="mt-1 text-xs font-semibold text-[#727986]">{productContext(order)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <AdminStatusBadge label={paymentStatusLabels[order.payment.status]} status={order.payment.status} />
                <AdminStatusBadge label={orderStatusLabels[order.status]} status={order.status} />
                {order.returns.length > 0 && <AdminStatusBadge label={`Return ${latestReturnStatus(order)}`} status={order.returns[0]?.status} />}
                {order.refunds.length > 0 && <AdminStatusBadge label={`Refund ${latestRefundStatus(order)}`} status={order.refunds[0]?.status} />}
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to={`/admin/orders/${order.orderNumber}`}
                  className="inline-flex justify-center rounded-md bg-[var(--tek-accent)] px-3 py-2 text-sm font-black text-[var(--tek-accent-ink)]"
                >
                  View
                </Link>
                <details className="relative">
                  <summary className="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-md border border-[#E4E7EC] font-black" aria-label="Order quick actions">
                    ...
                  </summary>
                  <div className="absolute right-0 z-10 mt-2 w-48 rounded-md border border-[#E4E7EC] bg-white p-2 shadow-lg">
                    <button type="button" onClick={() => copyText(order.orderNumber, "order number")} className="block w-full rounded px-2 py-2 text-left text-xs font-black hover:bg-[#F6F7F9]">Copy order number</button>
                    <button type="button" onClick={() => copyText(order.customer.email, "customer email")} className="block w-full rounded px-2 py-2 text-left text-xs font-black hover:bg-[#F6F7F9]">Copy customer email</button>
                    <Link to={`/admin/orders/${order.orderNumber}/packing-slip`} className="block rounded px-2 py-2 text-xs font-black hover:bg-[#F6F7F9]">Print packing slip</Link>
                    {order.payment.status === "PAID" && <Link to={`/admin/orders/${order.orderNumber}`} className="block rounded px-2 py-2 text-xs font-black hover:bg-[#F6F7F9]">Add tracking</Link>}
                    {!order.operationalHold?.active && <Link to={`/admin/orders/${order.orderNumber}`} className="block rounded px-2 py-2 text-xs font-black hover:bg-[#F6F7F9]">Put on hold</Link>}
                  </div>
                </details>
              </div>
            </article>
              );
            })()
          ))}
          {visibleOrders.length === 0 && (
            <p className="p-6 text-sm font-semibold text-[#727986]">No orders match this view.</p>
          )}
        </div>
        {visibleOrders.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E4E7EC] bg-[#F6F7F9] px-4 py-3">
            <p className="text-xs font-semibold text-[#727986]">
              Showing {pageStartIndex + 1}-{Math.min(pageStartIndex + pagedOrders.length, visibleOrders.length)} of {visibleOrders.length} orders · Page {currentPage} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="inline-flex items-center gap-2 rounded-md border border-[#E4E7EC] bg-white px-3 py-2 text-sm font-black disabled:cursor-not-allowed disabled:text-[#727986]"
              >
                <FiChevronLeft aria-hidden="true" /> Previous
              </button>
              <span className="inline-flex items-center rounded-md border border-[#E4E7EC] bg-white px-3 py-2 text-sm font-black text-[#3F4652]">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="inline-flex items-center gap-2 rounded-md border border-[#E4E7EC] bg-white px-3 py-2 text-sm font-black disabled:cursor-not-allowed disabled:text-[#727986]"
              >
                Next <FiChevronRight aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </section>
    </AdminShell>
  );
}

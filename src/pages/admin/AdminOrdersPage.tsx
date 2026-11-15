import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AdminPageHeader, AdminShell, AdminStatusBadge } from "@/components/admin/AdminShell";
import { AdminIdentityCell, AdminPagination, AdminTable, AdminTableActions, AdminTableBody, AdminTableCell, AdminTableContainer, AdminTableHead, AdminTableHeader, AdminTableRow, AdminTableState, AdminTableToolbar } from "@/components/admin/AdminTable";
import { normalizeAdminPagination } from "@/lib/admin-table";
import { apiRequest } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { attentionForOrder, itemCount, latestRefundStatus, latestReturnStatus, productContext } from "@/lib/admin";
import { orderStatusLabels, paymentStatusLabels } from "@/lib/order-status";
import { formatDateTime } from "@/lib/order-utils";
import { usePageTitle } from "@/lib/page-title";
import type { AdminOrdersResponse } from "@/lib/admin";
import type { Order } from "@/types/order";

const filters = ["all", "unpaid/pending", "paid", "confirmed", "processing", "partially shipped", "shipped", "delivered", "cancelled", "return requested", "refund requested"];

export function AdminOrdersPage() {
  usePageTitle("Admin orders | TekCentral");
  const [params, setParams] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [attention, setAttention] = useState<AdminOrdersResponse["attention"]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const filter = params.get("filter") ?? "all";
  const search = params.get("search") ?? "";
  const attentionOnly = params.get("attention") === "true";
  const requestedPage = Number(params.get("page") ?? 1);
  const requestedPageSize = Number(params.get("pageSize") ?? 15);
  const updateParams = (values: Record<string, string | undefined>, resetPage = false) => setParams((current) => { const next = new URLSearchParams(current); Object.entries(values).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key)); if (resetPage) next.set("page", "1"); return next; }, { replace: true });

  useEffect(() => { apiRequest<AdminOrdersResponse>("/api/admin/orders").then((response) => { setOrders(response.orders); setAttention(response.attention); }).catch(() => setFailed(true)).finally(() => setLoading(false)); }, []);
  const visibleOrders = useMemo(() => { const term = search.trim().toLowerCase(); return orders.filter((order) => { const reasons = attentionForOrder(attention, order.orderNumber); const matchesSearch = !term || `${order.orderNumber} ${order.customer.firstName} ${order.customer.lastName} ${order.customer.email}`.toLowerCase().includes(term); const matchesFilter = filter === "all" || filter === "unpaid/pending" && order.payment.status !== "PAID" || filter === "paid" && order.payment.status === "PAID" || filter === "confirmed" && order.status === "CONFIRMED" || filter === "processing" && order.status === "PROCESSING" || filter === "partially shipped" && order.status === "PARTIALLY_SHIPPED" || filter === "shipped" && order.status === "SHIPPED" || filter === "delivered" && order.status === "DELIVERED" || filter === "cancelled" && order.status === "CANCELLED" || filter === "return requested" && order.returns.some((item) => item.status === "REQUESTED") || filter === "refund requested" && order.refunds.some((item) => item.status === "PENDING"); return matchesSearch && matchesFilter && (!attentionOnly || reasons.length > 0); }); }, [attention, attentionOnly, filter, orders, search]);
  const pagination = normalizeAdminPagination(requestedPage, requestedPageSize, visibleOrders.length);
  const pageOrders = visibleOrders.slice((pagination.page - 1) * pagination.pageSize, pagination.page * pagination.pageSize);

  return <AdminShell><AdminPageHeader eyebrow="Order operations" title="Orders" description="Search and filter backend orders without exposing internal operations to customers." />
    <AdminTableToolbar><label className="block text-sm font-black">Search<input value={search} onChange={(event) => updateParams({ search: event.target.value || undefined }, true)} className="mt-2 h-11 w-full min-w-64 rounded-md border border-[#E4E7EC] bg-white px-3 text-sm font-semibold" placeholder="Order, customer or email" /></label><div className="flex flex-wrap gap-2"><button type="button" onClick={() => updateParams({ attention: attentionOnly ? undefined : "true" }, true)} className={`rounded-md border px-3 py-2 text-xs font-black ${attentionOnly ? "border-[#FEDF89] bg-[#FFFAEB]" : "border-[#E4E7EC] bg-white"}`}>Needs attention</button>{filters.map((item) => <button key={item} type="button" onClick={() => updateParams({ filter: item === "all" ? undefined : item }, true)} className={`rounded-md border px-3 py-2 text-xs font-black capitalize ${filter === item ? "border-[var(--tek-accent)] bg-[#EFFFFB]" : "border-[#E4E7EC] bg-white"}`}>{item}</button>)}</div></AdminTableToolbar>
    <AdminTableContainer label="Orders"><AdminTable minWidth={1120}><AdminTableHead><AdminTableRow><AdminTableHeader>#</AdminTableHeader><AdminTableHeader>Order</AdminTableHeader><AdminTableHeader>Customer</AdminTableHeader><AdminTableHeader align="right">Total</AdminTableHeader><AdminTableHeader>Items</AdminTableHeader><AdminTableHeader>Statuses</AdminTableHeader><AdminTableHeader align="right">Action</AdminTableHeader></AdminTableRow></AdminTableHead><AdminTableBody>
      {loading && <AdminTableState colSpan={7} kind="loading" title="Loading orders..." />}{failed && <AdminTableState colSpan={7} kind="error" title="Orders could not be loaded." detail="Refresh the page to try again." />}{!loading && !failed && pageOrders.map((order, index) => { const reasons = attentionForOrder(attention, order.orderNumber); return <AdminTableRow key={order.orderNumber}><AdminTableCell>{(pagination.page - 1) * pagination.pageSize + index + 1}</AdminTableCell><AdminTableCell><AdminIdentityCell primary={<Link to={`/admin/orders/${order.orderNumber}`} className="hover:text-[#176B5C] focus-visible:underline">{order.orderNumber}{order.payment.status === "PAID" && !order.opsPaymentAcknowledgedAt && <span className="ml-2 rounded-full bg-[#B42318] px-2 py-0.5 text-[.62rem] text-white">NEW</span>}</Link>} secondary={formatDateTime(order.createdAt)} tertiary={reasons[0] ? `Needs attention · ${reasons[0].detail}` : undefined} /></AdminTableCell><AdminTableCell><strong className="text-[#101828]">{order.customer.firstName} {order.customer.lastName}</strong><span className="block text-xs text-[#667085]">{order.customer.email}</span></AdminTableCell><AdminTableCell align="right" className="font-black text-[#101828]">{formatCurrency(order.total, order.currency)}</AdminTableCell><AdminTableCell>{itemCount(order)} items<span className="block text-xs text-[#667085]">{productContext(order)}</span></AdminTableCell><AdminTableCell><div className="flex flex-wrap gap-1.5"><AdminStatusBadge label={paymentStatusLabels[order.payment.status]} status={order.payment.status} /><AdminStatusBadge label={orderStatusLabels[order.status]} status={order.status} />{order.returns.length > 0 && <AdminStatusBadge label={`Return ${latestReturnStatus(order)}`} status={order.returns[0]?.status} />}{order.refunds.length > 0 && <AdminStatusBadge label={`Refund ${latestRefundStatus(order)}`} status={order.refunds[0]?.status} />}</div></AdminTableCell><AdminTableCell align="right"><AdminTableActions primary={<Link to={`/admin/orders/${order.orderNumber}`} className="rounded-md bg-[var(--tek-accent)] px-3 py-2 text-xs font-black text-[var(--tek-accent-ink)]">View</Link>}><Link to={`/admin/orders/${order.orderNumber}/packing-slip`}>Print packing slip</Link><Link to={`/admin/orders/${order.orderNumber}`}>Order operations</Link></AdminTableActions></AdminTableCell></AdminTableRow>; })}{!loading && !failed && pageOrders.length === 0 && <AdminTableState colSpan={7} kind="empty" title="No orders match these filters." />}
    </AdminTableBody></AdminTable><AdminPagination meta={pagination} noun="orders" onPageChange={(page) => updateParams({ page: String(page) })} onPageSizeChange={(pageSize) => updateParams({ pageSize: String(pageSize) }, true)} /></AdminTableContainer>
  </AdminShell>;
}

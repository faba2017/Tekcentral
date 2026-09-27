import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AdminPageHeader, AdminShell, AdminStatusBadge } from "@/components/admin/AdminShell";
import { apiRequest } from "@/lib/api";
import { supplierOrderStatusLabels } from "@/lib/order-status";
import { usePageTitle } from "@/lib/page-title";
import type { AdminSupplierOrdersResponse } from "@/lib/admin";
import type { AttentionReason, SupplierOrder, SupplierOrderStatus } from "@/types/order";

const supplierOrderFilters: { label: string; value: "ALL" | SupplierOrderStatus }[] = [
  { label: "All", value: "ALL" },
  { label: "Ready for approval", value: "READY_FOR_APPROVAL" },
  { label: "Approved", value: "APPROVED" },
  { label: "Submitted", value: "SUBMITTED" },
  { label: "Confirmed", value: "CONFIRMED" },
  { label: "Partially confirmed", value: "PARTIALLY_CONFIRMED" },
  { label: "Backordered", value: "BACKORDERED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Dispatched", value: "DISPATCHED" },
  { label: "Superseded", value: "SUPERSEDED" },
];

function supplierOrderAttention(
  attention: AdminSupplierOrdersResponse["attention"],
  supplierOrderId: string,
) {
  return attention.find((entry) => entry.supplierOrderId === supplierOrderId)?.reasons ?? [];
}

function orderAge(createdAt: string) {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 3_600_000));
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

export function AdminSupplierOrdersPage() {
  usePageTitle("Supplier orders | TekCentral");
  const [supplierOrders, setSupplierOrders] = useState<SupplierOrder[]>([]);
  const [attention, setAttention] = useState<AdminSupplierOrdersResponse["attention"]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | SupplierOrderStatus>("ALL");

  useEffect(() => {
    apiRequest<AdminSupplierOrdersResponse>("/api/admin/supplier-orders")
      .then((response) => {
        setSupplierOrders(response.supplierOrders);
        setAttention(response.attention);
      })
      .catch(() => {
        setSupplierOrders([]);
        setAttention([]);
      });
  }, []);

  const visibleSupplierOrders = useMemo(() => {
    const search = query.trim().toLowerCase();
    return supplierOrders.filter((supplierOrder) => {
      const matchesFilter = filter === "ALL" || supplierOrder.status === filter;
      const matchesSearch =
        !search ||
        supplierOrder.id.toLowerCase().includes(search) ||
        supplierOrder.customerOrderNumber.toLowerCase().includes(search) ||
        supplierOrder.supplierName.toLowerCase().includes(search) ||
        (supplierOrder.supplierOrderReference ?? "").toLowerCase().includes(search);
      return matchesFilter && matchesSearch;
    });
  }, [filter, query, supplierOrders]);

  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="Mock supplier orchestration"
        title="Supplier orders"
        description="Internal mock supplier orders generated from staff allocations. No external supplier request is sent."
      />
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <label className="block max-w-sm text-sm font-black">
          Search
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mt-2 h-11 w-full rounded-md border border-[#E4E7EC] bg-white px-3 text-sm font-semibold outline-none focus:border-[var(--tek-accent)]"
            placeholder="Supplier order, customer order, supplier or ref"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {supplierOrderFilters.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
              className={`rounded-md border px-3 py-2 text-xs font-black ${
                filter === item.value
                  ? "border-[var(--tek-accent)] bg-[var(--tek-accent)] text-[var(--tek-accent-ink)]"
                  : "border-[#E4E7EC] bg-white text-[#3F4652]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <section className="mt-6 overflow-hidden rounded-lg border border-[#E4E7EC] bg-white shadow-sm">
        <div className="hidden grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_80px_1fr_90px] gap-4 border-b border-[#E4E7EC] bg-[#F6F7F9] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-[#727986] xl:grid">
          <span>Supplier order</span>
          <span>Customer order</span>
          <span>Supplier</span>
          <span>Items</span>
          <span>Status</span>
          <span>Supplier ref</span>
          <span>Age</span>
          <span>Attention</span>
          <span>Action</span>
        </div>
        <div className="divide-y divide-[#E4E7EC]">
          {visibleSupplierOrders.map((supplierOrder) => {
            const reasons: AttentionReason[] = supplierOrderAttention(attention, supplierOrder.id);
            return (
              <article
                key={supplierOrder.id}
                className="grid gap-3 px-4 py-4 xl:grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_80px_1fr_90px] xl:items-center"
              >
                <div>
                  <p className="text-sm font-black">{supplierOrder.id}</p>
                  {reasons[0] && (
                    <p className="mt-2 text-xs font-black text-[#B54708]">
                      {reasons[0].label} · {reasons[0].detail}
                    </p>
                  )}
                </div>
                <Link
                  to={`/admin/orders/${supplierOrder.customerOrderNumber}`}
                  className="text-sm font-black text-[var(--tek-accent)]"
                >
                  {supplierOrder.customerOrderNumber}
                </Link>
                <p className="text-sm font-semibold text-[#3F4652]">{supplierOrder.supplierName}</p>
                <p className="text-sm font-semibold text-[#3F4652]">
                  {supplierOrder.itemLines
                    .slice(0, 2)
                    .map((line) => `${line.customerSku ?? line.productId} x${line.quantity}`)
                    .join(" · ")}
                  {supplierOrder.itemLines.length > 2 ? ` · +${supplierOrder.itemLines.length - 2} more` : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  <AdminStatusBadge label={supplierOrderStatusLabels[supplierOrder.status]} status={supplierOrder.status} />
                </div>
                <p className="text-sm font-semibold text-[#3F4652]">
                  {supplierOrder.supplierOrderReference ?? "Not generated"}
                </p>
                <p className="text-sm font-semibold text-[#3F4652]">{orderAge(supplierOrder.createdAt)}</p>
                <div className="flex flex-wrap gap-2">
                  {reasons.map((reason) => (
                    <span key={reason.code} className="rounded-md bg-[#FFFAEB] px-2 py-1 text-xs font-black text-[#B54708]">
                      {reason.label}
                    </span>
                  ))}
                  {reasons.length === 0 && <span className="text-sm font-semibold text-[#727986]">None</span>}
                </div>
                <Link
                  to={`/admin/supplier-orders/${supplierOrder.id}`}
                  className="inline-flex justify-center rounded-md bg-[var(--tek-accent)] px-3 py-2 text-sm font-black text-[var(--tek-accent-ink)]"
                >
                  View
                </Link>
              </article>
            );
          })}
          {visibleSupplierOrders.length === 0 && (
            <p className="p-6 text-sm font-semibold text-[#727986]">
              No supplier orders found.
            </p>
          )}
        </div>
      </section>
    </AdminShell>
  );
}

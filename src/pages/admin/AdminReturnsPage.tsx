import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AdminFeedback,
  AdminPageHeader,
  AdminShell,
  AdminStatusBadge,
} from "@/components/admin/AdminShell";
import { adminReturnActions } from "@/lib/admin";
import { apiRequest } from "@/lib/api";
import { returnStatusLabels } from "@/lib/order-status";
import { formatDateTime } from "@/lib/order-utils";
import { usePageTitle } from "@/lib/page-title";
import type { AdminOrderResponse, AdminReturnRow } from "@/lib/admin";
import type { ReturnStatus } from "@/types/order";

export function AdminReturnsPage() {
  usePageTitle("Admin returns | TekCentral");
  const [rows, setRows] = useState<AdminReturnRow[]>([]);
  const [feedback, setFeedback] = useState<{ variant: "success" | "error"; message: string }>();

  const loadRows = () => {
    apiRequest<{ returns: AdminReturnRow[] }>("/api/admin/returns")
      .then((response) => setRows(response.returns))
      .catch(() => setRows([]));
  };

  useEffect(loadRows, []);

  const updateStatus = async (returnId: string, status: ReturnStatus) => {
    try {
      await apiRequest<AdminOrderResponse>(
        `/api/admin/returns/${encodeURIComponent(returnId)}/status`,
        { method: "PATCH", body: JSON.stringify({ status }) },
      );
      setFeedback({ variant: "success", message: `Return marked ${returnStatusLabels[status]}.` });
      loadRows();
    } catch {
      setFeedback({ variant: "error", message: "Invalid return status transition." });
    }
  };

  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="Returns"
        title="Return management"
        description="Review customer return requests, selected items, reasons and operational state."
      />
      {feedback && <div className="mt-5"><AdminFeedback {...feedback} /></div>}
      <section className="mt-6 space-y-4">
        {rows.map(({ order, returnRequest }) => (
          <article key={returnRequest.id} className="rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm">
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr_180px] lg:items-start">
              <div>
                <p className="text-sm font-black">{returnRequest.id}</p>
                <Link to={`/admin/orders/${order.orderNumber}`} className="mt-1 block text-sm font-black text-[var(--tek-accent)]">
                  {order.orderNumber}
                </Link>
                <p className="mt-2 text-sm font-semibold text-[#3F4652]">
                  {order.customer.firstName} {order.customer.lastName} | {order.customer.email}
                </p>
                <p className="mt-2 text-xs font-semibold text-[#727986]">
                  {formatDateTime(returnRequest.createdAt)}
                </p>
              </div>
              <div>
                <p className="text-sm font-black">Customer request</p>
                <p className="mt-1 text-sm leading-6 text-[#3F4652]">{returnRequest.reason}</p>
                {returnRequest.notes && (
                  <p className="mt-1 text-sm leading-6 text-[#727986]">{returnRequest.notes}</p>
                )}
                <ul className="mt-3 space-y-1 text-sm text-[#3F4652]">
                  {returnRequest.items.map((item) => (
                    <li key={item.productId}>{item.quantity} x {item.name}</li>
                  ))}
                </ul>
              </div>
              <div>
                <AdminStatusBadge label={returnRequest.status} />
                <div className="mt-3 flex flex-col gap-2">
                  {adminReturnActions.map((action) => (
                    <button
                      key={action.status}
                      type="button"
                      onClick={() => updateStatus(returnRequest.id, action.status)}
                      className="rounded-md border border-[#E4E7EC] px-3 py-2 text-left text-xs font-black hover:border-[#0A0A0A]"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </article>
        ))}
        {rows.length === 0 && (
          <p className="rounded-lg border border-[#E4E7EC] bg-white p-6 text-sm font-semibold text-[#727986]">
            No return requests found.
          </p>
        )}
      </section>
    </AdminShell>
  );
}

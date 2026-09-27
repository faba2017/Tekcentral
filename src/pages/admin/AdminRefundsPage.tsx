import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AdminFeedback,
  AdminPageHeader,
  AdminShell,
  AdminStatusBadge,
} from "@/components/admin/AdminShell";
import { adminRefundActions } from "@/lib/admin";
import { apiRequest } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { refundStatusLabels } from "@/lib/order-status";
import { formatDateTime } from "@/lib/order-utils";
import { usePageTitle } from "@/lib/page-title";
import type { AdminOrderResponse, AdminRefundRow } from "@/lib/admin";
import type { RefundStatus } from "@/types/order";

export function AdminRefundsPage() {
  usePageTitle("Admin refunds | TekCentral");
  const [rows, setRows] = useState<AdminRefundRow[]>([]);
  const [feedback, setFeedback] = useState<{ variant: "success" | "warning" | "error"; message: string }>();

  const loadRows = () => {
    apiRequest<{ refunds: AdminRefundRow[] }>("/api/admin/refunds")
      .then((response) => setRows(response.refunds))
      .catch(() => setRows([]));
  };

  useEffect(loadRows, []);

  const updateStatus = async (refundId: string, status: RefundStatus) => {
    try {
      await apiRequest<AdminOrderResponse>(
        `/api/admin/refunds/${encodeURIComponent(refundId)}/status`,
        { method: "PATCH", body: JSON.stringify({ status }) },
      );
      setFeedback({
        variant: status === "REFUNDED" ? "warning" : "success",
        message:
          status === "REFUNDED"
            ? "Refund marked complete internally. No PayFast refund API call was executed."
            : status === "PROCESSING"
              ? "Refund ready for PayFast dashboard completion. No PayFast refund API call was executed."
            : `Refund marked ${refundStatusLabels[status]}.`,
      });
      loadRows();
    } catch {
      setFeedback({ variant: "error", message: "Invalid refund status transition." });
    }
  };

  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="Refunds"
        title="Refund management"
        description="Review calculated refund amounts from stored order item snapshots. PayFast refund APIs are not executed in Phase 5."
      />
      {feedback && <div className="mt-5"><AdminFeedback {...feedback} /></div>}
      <section className="mt-6 space-y-4">
        {rows.map(({ order, refund }) => (
          <article key={refund.id} className="rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm">
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr_170px] lg:items-start">
              <div>
                <p className="text-sm font-black">{refund.id}</p>
                <Link to={`/admin/orders/${order.orderNumber}`} className="mt-1 block text-sm font-black text-[var(--tek-accent)]">
                  {order.orderNumber}
                </Link>
                <p className="mt-2 text-sm font-semibold text-[#3F4652]">
                  {order.customer.firstName} {order.customer.lastName}
                </p>
                <p className="mt-2 text-xs font-semibold text-[#727986]">
                  {formatDateTime(refund.createdAt)}
                </p>
              </div>
              <div>
                <p className="text-2xl font-black text-[#0A0A0A]">
                  {formatCurrency(refund.amount, order.currency)}
                </p>
                <p className="mt-2 text-sm leading-6 text-[#3F4652]">
                  {refund.returnRequestId ? `Related return: ${refund.returnRequestId}` : "Order-level refund review"}
                </p>
                <p className="mt-2 text-sm leading-6 text-[#3F4652]">
                  PayFast reference: {order.payment.payfastPaymentId ?? order.payment.paymentReference ?? "Pending"}
                </p>
                <p className="mt-1 text-sm leading-6 text-[#3F4652]">
                  {refund.items && refund.items.length < order.items.length ? "Partial refund" : "Full refund"}
                </p>
                {refund.items && (
                  <ul className="mt-3 space-y-1 text-sm text-[#3F4652]">
                    {refund.items.map((item) => (
                      <li key={item.productId}>{item.quantity} x {item.name}</li>
                    ))}
                  </ul>
                )}
                {refund.note && <p className="mt-2 text-sm text-[#727986]">{refund.note}</p>}
              </div>
              <div>
                <AdminStatusBadge label={refund.status} />
                <div className="mt-3 flex flex-col gap-2">
                  {adminRefundActions.map((action) => (
                    <button
                      key={action.status}
                      type="button"
                      onClick={() => updateStatus(refund.id, action.status)}
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
            No refund requests found.
          </p>
        )}
      </section>
    </AdminShell>
  );
}

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
import { ReturnsRefundsNav } from "@/components/admin/ReturnsRefundsNav";
import { AdminIdentityCell, AdminTable, AdminTableActions, AdminTableBody, AdminTableCell, AdminTableContainer, AdminTableHead, AdminTableHeader, AdminTableRow, AdminTableState } from "@/components/admin/AdminTable";

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
      <ReturnsRefundsNav />
      {feedback && <div className="mt-5"><AdminFeedback {...feedback} /></div>}
      <AdminTableContainer label="Refunds"><AdminTable minWidth={920}><AdminTableHead><AdminTableRow><AdminTableHeader>Refund</AdminTableHeader><AdminTableHeader>Context</AdminTableHeader><AdminTableHeader align="right">Amount</AdminTableHeader><AdminTableHeader>Status</AdminTableHeader><AdminTableHeader align="right">Action</AdminTableHeader></AdminTableRow></AdminTableHead><AdminTableBody>
        {rows.map(({ order, refund }) => <AdminTableRow key={refund.id}><AdminTableCell><AdminIdentityCell primary={<Link to={`/admin/orders/${order.orderNumber}`} className="hover:text-[#176B5C]">{refund.id}</Link>} secondary={`${order.orderNumber} · ${formatDateTime(refund.createdAt)}`} tertiary={`${order.customer.firstName} ${order.customer.lastName}`} /></AdminTableCell><AdminTableCell>{refund.returnRequestId ? `Related return: ${refund.returnRequestId}` : "Order-level refund"}<span className="block text-xs text-[#667085]">{refund.items && refund.items.length < order.items.length ? "Partial refund" : "Full refund"}</span></AdminTableCell><AdminTableCell align="right" className="font-black text-[#101828]">{formatCurrency(refund.amount, order.currency)}</AdminTableCell><AdminTableCell><AdminStatusBadge label={refund.status} status={refund.status} /></AdminTableCell><AdminTableCell align="right"><AdminTableActions primary={<Link to={`/admin/orders/${order.orderNumber}`} className="rounded-md border border-[#D0D5DD] px-3 py-2 text-xs font-black">View</Link>}>{adminRefundActions.map((action) => <button key={action.status} type="button" onClick={() => updateStatus(refund.id, action.status)}>{action.label}</button>)}</AdminTableActions></AdminTableCell></AdminTableRow>)}
        {rows.length === 0 && <AdminTableState colSpan={5} kind="empty" title="No refund requests found." />}
      </AdminTableBody></AdminTable></AdminTableContainer>
    </AdminShell>
  );
}

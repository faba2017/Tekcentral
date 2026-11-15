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
import { ReturnsRefundsNav } from "@/components/admin/ReturnsRefundsNav";
import { AdminIdentityCell, AdminTable, AdminTableActions, AdminTableBody, AdminTableCell, AdminTableContainer, AdminTableHead, AdminTableHeader, AdminTableRow, AdminTableState } from "@/components/admin/AdminTable";

export function AdminReturnsPage() {
  usePageTitle("Admin returns | TekCentral");
  const [rows, setRows] = useState<AdminReturnRow[]>([]);
  const [feedback, setFeedback] = useState<{ variant: "success" | "error"; message: string }>();
  const [inventoryBusy, setInventoryBusy] = useState(false);

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

  const inventoryAction = async (returnId: string, action: "receive" | "inspect" | "decide", body: Record<string, unknown>) => {
    if (inventoryBusy) return;
    setInventoryBusy(true);
    try {
      await apiRequest(`/api/admin/returns/${encodeURIComponent(returnId)}/inventory/${action}`, { method: "POST", body: JSON.stringify(body) });
      setFeedback({ variant: "success", message: action === "receive" ? "Physical return received. Sellable stock is unchanged pending inspection." : action === "inspect" ? "Inspection started." : "Inventory decision recorded." }); loadRows();
    } catch (error) { setFeedback({ variant: "error", message: error instanceof Error ? error.message : "Inventory action failed." }); } finally { setInventoryBusy(false); }
  };

  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="Returns"
        title="Return management"
        description="Review customer return requests, selected items, reasons and operational state."
      />
      <ReturnsRefundsNav />
      {feedback && <div className="mt-5"><AdminFeedback {...feedback} /></div>}
      <AdminTableContainer label="Returns"><AdminTable minWidth={920}><AdminTableHead><AdminTableRow><AdminTableHeader>Return</AdminTableHeader><AdminTableHeader>Customer request</AdminTableHeader><AdminTableHeader>Items</AdminTableHeader><AdminTableHeader>Status</AdminTableHeader><AdminTableHeader align="right">Action</AdminTableHeader></AdminTableRow></AdminTableHead><AdminTableBody>
        {rows.map(({ order, returnRequest, inventory }) => <AdminTableRow key={returnRequest.id}><AdminTableCell><AdminIdentityCell primary={<Link to={`/admin/orders/${order.orderNumber}`} className="hover:text-[#176B5C]">{returnRequest.id}</Link>} secondary={`${order.orderNumber} · ${formatDateTime(returnRequest.createdAt)}`} tertiary={`${order.customer.firstName} ${order.customer.lastName}`} /></AdminTableCell><AdminTableCell><strong>{returnRequest.reason}</strong>{returnRequest.notes && <span className="block text-xs text-[#667085]">{returnRequest.notes}</span>}</AdminTableCell><AdminTableCell>{returnRequest.items.map((item) => { const stock = inventory?.items.find((entry) => entry.productId === item.productId); const received = stock?.reconciliations.reduce((sum, entry) => sum + entry.quantity, 0) ?? 0; const reconciled = stock?.reconciliations.filter((entry) => entry.inspectionState === "RECONCILED").reduce((sum, entry) => sum + entry.quantity, 0) ?? 0; return <div key={item.productId} className="mb-3 last:mb-0"><strong className="block">{item.quantity} x {item.name}</strong>{stock?.eligible && <div className="mt-2 rounded-md border border-[#D0D5DD] bg-[#F9FAFB] p-2 text-xs"><p>{stock.supplierSku} · Fulfilled {stock.fulfilledQuantity} · Received {received} · Reconciled {reconciled}</p>{stock.offer && <p className="text-[#667085]">On hand {stock.offer.onHand} · Reserved {stock.offer.reserved} · Available {stock.offer.available}</p>}<div className="mt-2 flex flex-wrap gap-2">{received < item.quantity && ["APPROVED", "AWAITING_RETURN", "RECEIVED"].includes(returnRequest.status) && <button disabled={inventoryBusy} className="rounded bg-[#176B5C] px-2 py-1 font-bold text-white" onClick={() => inventoryAction(returnRequest.id, "receive", { productId: item.productId, quantity: item.quantity - received })}>Receive Return</button>}{stock.reconciliations.map((entry) => entry.inspectionState === "RECEIVED" ? <button disabled={inventoryBusy} key={entry.id} className="rounded border px-2 py-1 font-bold" onClick={() => inventoryAction(returnRequest.id, "inspect", { productId: item.productId, reconciliationId: entry.id })}>Start Inspection</button> : entry.inspectionState !== "RECONCILED" ? <span key={entry.id} className="flex flex-wrap gap-1"><button disabled={inventoryBusy} className="rounded border px-2 py-1 font-bold disabled:opacity-50" onClick={() => window.confirm(`Restock ${entry.quantity} x ${item.name} as sellable?`) && inventoryAction(returnRequest.id, "decide", { productId: item.productId, reconciliationId: entry.id, decision: "RESTOCK_SELLABLE" })}>Restock Sellable</button><button disabled={inventoryBusy} className="rounded border px-2 py-1 font-bold disabled:opacity-50" onClick={() => window.confirm(`Write off ${entry.quantity} x ${item.name} as damaged? Stock will not increase.`) && inventoryAction(returnRequest.id, "decide", { productId: item.productId, reconciliationId: entry.id, decision: "DAMAGED_WRITE_OFF" })}>Write Off Damaged</button><button disabled={inventoryBusy} className="rounded border px-2 py-1 font-bold disabled:opacity-50" onClick={() => window.confirm(`Write off ${entry.quantity} x ${item.name} as non-sellable? Stock will not increase.`) && inventoryAction(returnRequest.id, "decide", { productId: item.productId, reconciliationId: entry.id, decision: "NON_SELLABLE_WRITE_OFF" })}>Write Off Non-Sellable</button></span> : <span key={entry.id} className="font-bold text-[#176B5C]">{entry.decision?.replace(/_/g, " ")}</span>)}</div></div>}</div>; })}</AdminTableCell><AdminTableCell><AdminStatusBadge label={returnRequest.status} status={returnRequest.status} /></AdminTableCell><AdminTableCell align="right"><AdminTableActions primary={<Link to={`/admin/orders/${order.orderNumber}`} className="rounded-md border border-[#D0D5DD] px-3 py-2 text-xs font-black">View</Link>}>{adminReturnActions.map((action) => <button key={action.status} type="button" onClick={() => updateStatus(returnRequest.id, action.status)}>{action.label}</button>)}</AdminTableActions></AdminTableCell></AdminTableRow>)}
        {rows.length === 0 && <AdminTableState colSpan={5} kind="empty" title="No return requests found." />}
      </AdminTableBody></AdminTable></AdminTableContainer>
    </AdminShell>
  );
}

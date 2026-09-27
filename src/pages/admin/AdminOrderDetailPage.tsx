import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AdminFeedback,
  AdminPageHeader,
  AdminShell,
  AdminStatusBadge,
} from "@/components/admin/AdminShell";
import {
  type AdminOrderResponse,
  type AdminSupplierOrdersResponse,
  adminOrderActions,
  supplierCodes,
  supplierStatuses,
} from "@/lib/admin";
import { ApiError, apiRequest } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import {
  operationalHoldReasonLabels,
  orderStatusLabels,
  paymentStatusLabels,
  refundStatusLabels,
  returnStatusLabels,
  supplierAllocationStatusLabels,
  supplierOrderStatusLabels,
} from "@/lib/order-status";
import { formatDateTime } from "@/lib/order-utils";
import { usePageTitle } from "@/lib/page-title";
import type {
  AdminActivityEntry,
  AttentionReason,
  Order,
  OperationalHoldReason,
  OrderStatus,
  SupplierOrder,
  SupplierAllocationStatus,
  SupplierCode,
} from "@/types/order";

export function AdminOrderDetailPage() {
  const { orderNumber = "" } = useParams();
  usePageTitle(`${orderNumber || "Order"} admin | TekCentral`);
  const [order, setOrder] = useState<Order | undefined>();
  const [activity, setActivity] = useState<AdminActivityEntry[]>([]);
  const [attentionReasons, setAttentionReasons] = useState<AttentionReason[]>([]);
  const [supplierOrders, setSupplierOrders] = useState<SupplierOrder[]>([]);
  const [feedback, setFeedback] = useState<{ variant: "success" | "warning" | "error" | "info"; message: string }>();
  const [note, setNote] = useState("");
  const [supplierCode, setSupplierCode] = useState<SupplierCode>("MANUAL");
  const [supplierStatus, setSupplierStatus] = useState<SupplierAllocationStatus>("ASSIGNED");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [supplierReference, setSupplierReference] = useState("");
  const [supplierNotes, setSupplierNotes] = useState("");
  const [allocationDirty, setAllocationDirty] = useState(false);
  const [allocationSaved, setAllocationSaved] = useState(false);
  const [generatingSupplierOrders, setGeneratingSupplierOrders] = useState(false);
  const [generatedSupplierOrders, setGeneratedSupplierOrders] = useState<SupplierOrder[]>([]);
  const [paidOrderReviewed, setPaidOrderReviewed] = useState(false);
  const [shipment, setShipment] = useState({
    courierName: "",
    trackingNumber: "",
    trackingUrl: "",
    dispatchDate: "",
    notes: "",
  });
  const [holdReason, setHoldReason] = useState<OperationalHoldReason>("ADDRESS_REVIEW");
  const [holdNotes, setHoldNotes] = useState("");
  const [parcelWeight, setParcelWeight] = useState("");
  const [parcelReference, setParcelReference] = useState("");
  const [actualFreightCost, setActualFreightCost] = useState("");
  const [freightNote, setFreightNote] = useState("");
  const paidAcknowledgementRequestsRef = useRef(new Set<string>());

  const reconcileFreight = async () => {
    if (!order || actualFreightCost === "") return;
    try {
      const response = await apiRequest<AdminOrderResponse>(`/api/admin/orders/${encodeURIComponent(order.orderNumber)}/freight-reconciliation`, { method: "PATCH", body: JSON.stringify({ actualFreightCost: Number(actualFreightCost), note: freightNote }) });
      setOrder(response.order); setActivity(response.activity); setAttentionReasons(response.attentionReasons); setFeedback({ variant: "success", message: "Actual freight cost recorded for internal reconciliation." });
    } catch (error) { setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "Freight reconciliation could not be saved." }); }
  };

  const loadOrder = () => {
    apiRequest<AdminOrderResponse>(`/api/admin/orders/${encodeURIComponent(orderNumber)}`)
      .then((response) => {
        setOrder(response.order);
        setPaidOrderReviewed(false);
        setActivity(response.activity);
        setAttentionReasons(response.attentionReasons);
        setSelectedItems((current) =>
          current.length ? current : response.order.items.map((item) => item.productId),
        );
        setShipment({
          courierName: response.order.shipment?.courierName ?? "",
          trackingNumber: response.order.shipment?.trackingNumber ?? "",
          trackingUrl: response.order.shipment?.trackingUrl ?? "",
          dispatchDate: response.order.shipment?.dispatchDate ?? "",
          notes: response.order.shipment?.notes ?? "",
        });
        if (
          response.order.payment.status === "PAID" &&
          !response.order.opsPaymentAcknowledgedAt &&
          !paidAcknowledgementRequestsRef.current.has(response.order.orderNumber)
        ) {
          paidAcknowledgementRequestsRef.current.add(response.order.orderNumber);
          void apiRequest<AdminOrderResponse>(
            `/api/admin/orders/${encodeURIComponent(orderNumber)}/paid-acknowledgement`,
            { method: "POST" },
          ).then((acknowledgedResponse) => {
            if (!acknowledgedResponse.order.opsPaymentAcknowledgedAt) {
              throw new Error("Paid order acknowledgement was not persisted.");
            }
            setOrder(acknowledgedResponse.order);
            setActivity(acknowledgedResponse.activity);
            setAttentionReasons(acknowledgedResponse.attentionReasons);
            setPaidOrderReviewed(true);
            window.dispatchEvent(
              new CustomEvent("tekcentral:paid-order-acknowledged", {
                detail: { orderNumber: acknowledgedResponse.order.orderNumber },
              }),
            );
          }).catch(() => {
            paidAcknowledgementRequestsRef.current.delete(response.order.orderNumber);
            setFeedback({
              variant: "error",
              message: "Paid order review acknowledgement failed. The order remains marked NEW.",
            });
          });
        }
      })
      .catch(() =>
        setFeedback({ variant: "error", message: "Admin order data is not available." }),
      );
    apiRequest<AdminSupplierOrdersResponse>("/api/admin/supplier-orders")
      .then((response) =>
        setSupplierOrders(
          response.supplierOrders.filter(
            (supplierOrder) => supplierOrder.customerOrderNumber === orderNumber,
          ),
        ),
      )
      .catch(() => setSupplierOrders([]));
  };

  useEffect(loadOrder, [orderNumber]);

  const applyOrderStatus = async (status: OrderStatus) => {
    try {
      const response = await apiRequest<AdminOrderResponse>(
        `/api/admin/orders/${encodeURIComponent(orderNumber)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status, note: `Staff moved order to ${orderStatusLabels[status]}.` }),
        },
      );
      setOrder(response.order);
      setActivity(response.activity);
      setAttentionReasons(response.attentionReasons);
      setFeedback({ variant: "success", message: `Order moved to ${orderStatusLabels[status]}.` });
    } catch {
      setFeedback({ variant: "error", message: "Invalid status transition." });
    }
  };

  const submitNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const response = await apiRequest<AdminOrderResponse>(
        `/api/admin/orders/${encodeURIComponent(orderNumber)}/notes`,
        {
          method: "POST",
          body: JSON.stringify({ body: note, authorLabel: "TekCentral Staff" }),
        },
      );
      setOrder(response.order);
      setActivity(response.activity);
      setAttentionReasons(response.attentionReasons);
      setNote("");
      setFeedback({ variant: "success", message: "Internal note added." });
    } catch {
      setFeedback({ variant: "error", message: "Internal note could not be saved." });
    }
  };

  const submitAllocation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const response = await apiRequest<AdminOrderResponse>(
        `/api/admin/orders/${encodeURIComponent(orderNumber)}/supplier-allocations`,
        {
          method: "POST",
          body: JSON.stringify({
            supplierCode,
            status: supplierStatus,
            orderItemIds: selectedItems,
            supplierOrderReference: supplierReference,
            notes: supplierNotes,
          }),
        },
      );
      setOrder(response.order);
      setActivity(response.activity);
      setAttentionReasons(response.attentionReasons);
      setSupplierReference("");
      setSupplierNotes("");
      setAllocationDirty(false);
      setAllocationSaved(true);
      setFeedback({ variant: "success", message: "Supplier allocation saved." });
    } catch {
      setFeedback({ variant: "error", message: "Supplier allocation required valid order items." });
    }
  };

  const updateAllocationStatus = async (allocationId: string, status: SupplierAllocationStatus) => {
    try {
      const response = await apiRequest<AdminOrderResponse>(
        `/api/admin/orders/${encodeURIComponent(orderNumber)}/supplier-allocations/${encodeURIComponent(allocationId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        },
      );
      setOrder(response.order);
      setActivity(response.activity);
      setAttentionReasons(response.attentionReasons);
      setFeedback({ variant: "success", message: "Supplier allocation updated." });
    } catch {
      setFeedback({ variant: "error", message: "Invalid supplier allocation transition." });
    }
  };

  const submitShipment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const response = await apiRequest<AdminOrderResponse>(
        `/api/admin/orders/${encodeURIComponent(orderNumber)}/shipment`,
        { method: "PATCH", body: JSON.stringify(shipment) },
      );
      setOrder(response.order);
      setActivity(response.activity);
      setAttentionReasons(response.attentionReasons);
      setFeedback({ variant: "success", message: "Shipment details saved." });
    } catch {
      setFeedback({ variant: "error", message: "Shipment details could not be saved." });
    }
  };

  const submitHold = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const response = await apiRequest<AdminOrderResponse>(
        `/api/admin/orders/${encodeURIComponent(orderNumber)}/hold`,
        {
          method: "POST",
          body: JSON.stringify({ reason: holdReason, notes: holdNotes }),
        },
      );
      setOrder(response.order);
      setActivity(response.activity);
      setAttentionReasons(response.attentionReasons);
      setHoldNotes("");
      setFeedback({ variant: "warning", message: "Operational hold applied." });
    } catch {
      setFeedback({ variant: "error", message: "Operational hold could not be applied." });
    }
  };

  const releaseHold = async () => {
    try {
      const response = await apiRequest<AdminOrderResponse>(
        `/api/admin/orders/${encodeURIComponent(orderNumber)}/hold/release`,
        { method: "POST" },
      );
      setOrder(response.order);
      setActivity(response.activity);
      setAttentionReasons(response.attentionReasons);
      setFeedback({ variant: "success", message: "Operational hold released." });
    } catch {
      setFeedback({ variant: "error", message: "Operational hold could not be released." });
    }
  };

  const submitParcel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const response = await apiRequest<AdminOrderResponse>(
        `/api/admin/orders/${encodeURIComponent(orderNumber)}/parcels`,
        {
          method: "POST",
          body: JSON.stringify({
            itemQuantities: selectedItems.map((itemId) => ({ orderItemId: itemId, quantity: 1 })),
            weightKg: parcelWeight ? Number(parcelWeight) : undefined,
            reference: parcelReference,
          }),
        },
      );
      setOrder(response.order);
      setActivity(response.activity);
      setAttentionReasons(response.attentionReasons);
      setParcelWeight("");
      setParcelReference("");
      setFeedback({ variant: "success", message: "Parcel prepared." });
    } catch {
      setFeedback({ variant: "error", message: "Parcel quantities must match order items." });
    }
  };

  const submitConceptualShipment = async () => {
    try {
      const response = await apiRequest<AdminOrderResponse>(
        `/api/admin/orders/${encodeURIComponent(orderNumber)}/shipments`,
        {
          method: "POST",
          body: JSON.stringify({
            items: selectedItems.map((itemId) => ({ orderItemId: itemId, quantity: 1 })),
            courier: shipment.courierName,
            trackingNumber: shipment.trackingNumber,
            trackingUrl: shipment.trackingUrl,
            dispatchedAt: shipment.dispatchDate,
            status: "DISPATCHED",
          }),
        },
      );
      setOrder(response.order);
      setActivity(response.activity);
      setAttentionReasons(response.attentionReasons);
      setFeedback({ variant: "success", message: "Shipment recorded." });
    } catch {
      setFeedback({ variant: "error", message: "Shipment quantity exceeds ordered quantity." });
    }
  };

  const generateSupplierOrders = async () => {
    if (allocationDirty || (order?.supplierAllocations ?? []).length === 0) {
      setFeedback({ variant: "warning", message: "Save the supplier allocation first." });
      return;
    }
    setGeneratingSupplierOrders(true);
    try {
      const response = await apiRequest<{ supplierOrders: SupplierOrder[] }>(
        `/api/admin/orders/${encodeURIComponent(orderNumber)}/supplier-orders`,
        { method: "POST" },
      );
      setSupplierOrders((current) => [
        ...response.supplierOrders,
        ...current.filter(
          (existing) => !response.supplierOrders.some((created) => created.id === existing.id),
        ),
      ]);
      setGeneratedSupplierOrders(response.supplierOrders);
      setFeedback({
        variant: response.supplierOrders.length > 0 ? "success" : "info",
        message:
          response.supplierOrders.length > 0
            ? `Supplier order generated: ${response.supplierOrders.map((item) => item.id).join(", ")}.`
            : "No new supplier orders were needed for current allocations.",
      });
      loadOrder();
    } catch (error) {
      setFeedback({
        variant: "error",
        message:
          error instanceof ApiError
            ? error.message
            : "Supplier orders require paid order status, no active hold and valid allocations.",
      });
    } finally {
      setGeneratingSupplierOrders(false);
    }
  };

  if (!order) {
    return (
      <AdminShell>
        <AdminPageHeader eyebrow="Order operations" title={orderNumber || "Order"} />
        <p className="mt-6 rounded-lg border border-[#E4E7EC] bg-white p-6 text-sm font-semibold text-[#727986]">
          Loading order...
        </p>
      </AdminShell>
    );
  }
  const orderHeld = order.operationalHold?.active === true;
  const hasSavedAllocation = (order.supplierAllocations ?? []).some(
    (allocation) => allocation.status !== "CANCELLED",
  );
  const generateDisabled = orderHeld || allocationDirty || !hasSavedAllocation || generatingSupplierOrders;
  const workflow = deriveOrderWorkflow(order, supplierOrders);

  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="Order operations"
        title={order.orderNumber}
        description={`${order.customer.firstName} ${order.customer.lastName} | ${formatCurrency(order.total, order.currency)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to={`/admin/orders/${order.orderNumber}/packing-slip`} className="rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black text-[var(--tek-accent-ink)]">
              Print Packing Slip
            </Link>
            <Link to="/admin/orders" className="rounded-md border border-[#E4E7EC] bg-white px-4 py-2 text-sm font-black">
              Back to orders
            </Link>
          </div>
        }
      />
      {feedback && <div className="mt-5"><AdminFeedback {...feedback} /></div>}
      {(paidOrderReviewed || order.opsPaymentAcknowledgedAt) && order.payment.status === "PAID" && (
        <p role="status" className="mt-5 w-fit rounded-md border border-[#B9E2DB] bg-[#EFFFFB] px-3 py-2 text-sm font-black text-[#14584E]">
          Paid order reviewed ✓
        </p>
      )}
      <Panel title="Next action">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
          {workflow.steps.map((step) => (
            <div key={step.label} className="rounded-md border border-[#E4E7EC] bg-[#F6F7F9] p-3">
              <p className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-[#727986]">
                {step.label}
              </p>
              <p className={`mt-2 text-sm font-black ${step.tone === "warning" ? "text-[#B54708]" : step.tone === "done" ? "text-[#067647]" : "text-[#3F4652]"}`}>
                {step.status}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-4 rounded-md bg-[#0A0A0A] px-4 py-3 text-sm font-black text-white">
          Next action: {workflow.nextAction}
        </p>
      </Panel>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <InfoCard label="Payment" value={<AdminStatusBadge label={paymentStatusLabels[order.payment.status]} status={order.payment.status} />} />
            <InfoCard label="Order" value={<AdminStatusBadge label={orderStatusLabels[order.status]} status={order.status} />} />
            <InfoCard label="Return" value={order.returns[0] ? <AdminStatusBadge label={returnStatusLabels[order.returns[0].status]} status={order.returns[0].status} /> : "Not started"} />
            <InfoCard label="Refund" value={order.refunds[0] ? <AdminStatusBadge label={refundStatusLabels[order.refunds[0].status]} status={order.refunds[0].status} /> : "Not started"} />
          </section>
          {attentionReasons.length > 0 && (
            <Panel title="Attention">
              <div className="grid gap-2 sm:grid-cols-2">
                {attentionReasons.map((reason) => (
                  <div key={reason.code} className="rounded-md border border-[#FEDF89] bg-[#FFFAEB] p-3">
                    <p className="text-sm font-black text-[#0A0A0A]">{reason.label}</p>
                    <p className="mt-1 text-xs font-semibold text-[#B54708]">{reason.detail}</p>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {orderHeld && (
            <section className="rounded-lg border border-[#FEDF89] bg-[#FFFAEB] p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-black text-[#0A0A0A]">Order on hold</h2>
                  <p className="mt-2 text-sm font-semibold text-[#B54708]">
                    Supplier procurement and fulfilment are blocked until this hold is released.
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#3F4652]">
                    {operationalHoldReasonLabels[order.operationalHold?.reason ?? "MANUAL"]}
                  </p>
                </div>
                <button type="button" onClick={releaseHold} className="rounded-md border border-[#E4E7EC] bg-white px-4 py-2 text-sm font-black">
                  Release Hold
                </button>
              </div>
            </section>
          )}

          <Panel title="Items">
            <div className="divide-y divide-[#E4E7EC]">
              {order.items.map((item) => (
                <div key={item.productId} className="grid gap-2 py-3 md:grid-cols-[1fr_80px_110px]">
                  <div>
                    <p className="text-sm font-black">{item.name}</p>
                    <p className="mt-1 text-xs font-semibold text-[#727986]">{item.brand} {item.sku ? `| ${item.sku}` : ""}</p>
                  </div>
                  <p className="text-sm font-semibold">Qty {item.quantity}</p>
                  <p className="text-sm font-black md:text-right">{formatCurrency(item.lineTotal, order.currency)}</p>
                </div>
              ))}
            </div>
          </Panel>

          {order.shippingQuoteSnapshot && (
            <Panel title="Delivery economics">
              <div className="grid gap-3 sm:grid-cols-3">
                <InfoCard label="Customer delivery charge" value={formatCurrency(order.shippingQuoteSnapshot.amountCharged, order.currency)} />
                <InfoCard label="Estimated internal freight" value={order.shippingQuoteSnapshot.estimatedInternalFreightCost === undefined ? "Not available" : formatCurrency(order.shippingQuoteSnapshot.estimatedInternalFreightCost, order.currency)} />
                <InfoCard label="Actual freight cost" value={order.shippingQuoteSnapshot.freightReconciliation ? formatCurrency(order.shippingQuoteSnapshot.freightReconciliation.actualFreightCost, order.currency) : "Not reconciled"} />
              </div>
              <div className="mt-4 divide-y divide-[#E4E7EC]">{order.shippingQuoteSnapshot.fulfilmentGroups.map((group, index) => <div key={`${group.customerLabel}-${index}`} className="grid gap-1 py-3 text-sm sm:grid-cols-2"><span className="font-black">{group.customerLabel}</span><span className="font-semibold sm:text-right">Customer {formatCurrency(group.customerCharge, order.currency)}{group.supplierShippingCost === undefined ? "" : ` · Internal ${formatCurrency(group.supplierShippingCost, order.currency)}`}</span></div>)}</div>
              {order.shippingQuoteSnapshot.freightReconciliation && <p className="mt-4 text-sm font-semibold text-[#3F4652]">{order.shippingQuoteSnapshot.freightReconciliation.status.replace(/_/g, " ")} · Variance {formatCurrency(order.shippingQuoteSnapshot.freightReconciliation.varianceRand, order.currency)}</p>}
              {order.shippingQuoteSnapshot.estimatedInternalFreightCost !== undefined && <div className="mt-4 grid gap-3 sm:grid-cols-[180px_1fr_auto]"><label className="text-xs font-black">Actual freight cost<input type="number" min="0" step="0.01" value={actualFreightCost} onChange={(event) => setActualFreightCost(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-[#E4E7EC] px-3" /></label><label className="text-xs font-black">Reconciliation note<input value={freightNote} onChange={(event) => setFreightNote(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-[#E4E7EC] px-3" /></label><button type="button" onClick={() => void reconcileFreight()} disabled={actualFreightCost === ""} className="self-end rounded-md border border-[#E4E7EC] px-3 py-2 text-sm font-black disabled:text-[#727986]">Record actual cost</button></div>}
            </Panel>
          )}

          <Panel title="Staff actions">
            <div className="flex flex-wrap gap-2">
              {adminOrderActions.map((action) => (
                <button
                  key={action.status}
                  type="button"
                  onClick={() => applyOrderStatus(action.status)}
                  disabled={orderHeld && ["PROCESSING", "PARTIALLY_SHIPPED", "SHIPPED"].includes(action.status)}
                  className="rounded-md border border-[#E4E7EC] bg-white px-3 py-2 text-sm font-black hover:border-[#0A0A0A] disabled:cursor-not-allowed disabled:bg-[#F6F7F9] disabled:text-[#727986]"
                >
                  {action.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs font-semibold text-[#727986]">
              PayFast payment status is view-only. Staff cannot manually mark PayFast payments paid.
            </p>
          </Panel>

          <Panel title="Operational hold">
            {order.operationalHold?.active ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <AdminStatusBadge label="On Hold" status="PENDING" />
                  <p className="mt-2 text-sm font-semibold text-[#3F4652]">
                    {operationalHoldReasonLabels[order.operationalHold.reason ?? "MANUAL"]}
                  </p>
                  {order.operationalHold.notes && <p className="mt-1 text-sm text-[#727986]">{order.operationalHold.notes}</p>}
                </div>
                <button type="button" onClick={releaseHold} className="rounded-md border border-[#E4E7EC] px-4 py-2 text-sm font-black">
                  Release Hold
                </button>
              </div>
            ) : (
              <form onSubmit={submitHold} className="grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-end">
                <label className="text-sm font-black">
                  Reason
                  <select value={holdReason} onChange={(event) => setHoldReason(event.target.value as OperationalHoldReason)} className="mt-2 h-11 w-full rounded-md border border-[#E4E7EC] px-3">
                    <option value="ADDRESS_REVIEW">Address review</option>
                    <option value="PAYMENT_REVIEW">Payment review</option>
                    <option value="INVENTORY_EXCEPTION">Inventory exception</option>
                    <option value="CUSTOMER_REQUEST">Customer request</option>
                    <option value="MANUAL">Manual</option>
                  </select>
                </label>
                <Input label="Hold Notes" value={holdNotes} onChange={setHoldNotes} />
                <button type="submit" className="rounded-md border border-[#E4E7EC] px-4 py-2 text-sm font-black">
                  Put on Hold
                </button>
              </form>
            )}
          </Panel>

          <Panel title="Supplier allocation">
            <form onSubmit={submitAllocation} className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm font-black">
                  Supplier
                  <select value={supplierCode} onChange={(event) => { setSupplierCode(event.target.value as SupplierCode); setAllocationDirty(true); setAllocationSaved(false); }} className="mt-2 h-11 w-full rounded-md border border-[#E4E7EC] px-3">
                    {supplierCodes.map((supplier) => <option key={supplier.code} value={supplier.code}>{supplier.label}</option>)}
                  </select>
                </label>
                <label className="text-sm font-black">
                  Status
                  <select value={supplierStatus} onChange={(event) => { setSupplierStatus(event.target.value as SupplierAllocationStatus); setAllocationDirty(true); setAllocationSaved(false); }} className="mt-2 h-11 w-full rounded-md border border-[#E4E7EC] px-3">
                    {supplierStatuses.map((status) => <option key={status} value={status}>{supplierAllocationStatusLabels[status]}</option>)}
                  </select>
                </label>
              </div>
              <fieldset>
                <legend className="text-sm font-black">Order items</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {order.items.map((item) => (
                    <label key={item.productId} className="flex items-center gap-2 rounded-md border border-[#E4E7EC] p-3 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={selectedItems.includes(item.productId)}
                        onChange={(event) =>
                          { setAllocationDirty(true); setAllocationSaved(false); setSelectedItems((current) =>
                            event.target.checked
                              ? [...current, item.productId]
                              : current.filter((id) => id !== item.productId),
                          ); }
                        }
                      />
                      {item.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-3 md:grid-cols-2">
                <Input label="Supplier Order Reference" value={supplierReference} onChange={(value) => { setSupplierReference(value); setAllocationDirty(true); setAllocationSaved(false); }} />
                <Input label="Internal Notes" value={supplierNotes} onChange={(value) => { setSupplierNotes(value); setAllocationDirty(true); setAllocationSaved(false); }} />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" className="w-fit rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black text-[var(--tek-accent-ink)]">
                  Save Allocation
                </button>
                {allocationDirty && <span className="rounded-md border border-[#FEDF89] bg-[#FFFAEB] px-3 py-2 text-xs font-black text-[#B54708]">Unsaved allocation changes</span>}
                {allocationSaved && !allocationDirty && <span className="rounded-md border border-[#ABEFC6] bg-[#ECFDF3] px-3 py-2 text-xs font-black text-[#067647]">Allocation saved ✓</span>}
              </div>
            </form>
            <div className="mt-5 space-y-3">
              {(order.supplierAllocations ?? []).map((allocation) => (
                <article key={allocation.id} className="rounded-md bg-[#F6F7F9] p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-black">{allocation.supplierName}</p>
                      <p className="mt-1 text-xs font-semibold text-[#727986]">{allocation.orderItemIds.join(", ")}</p>
                      {allocation.supplierOrderReference && <p className="mt-1 text-xs font-semibold text-[#727986]">Ref {allocation.supplierOrderReference}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <AdminStatusBadge label={supplierAllocationStatusLabels[allocation.status]} />
                      <select value={allocation.status} onChange={(event) => updateAllocationStatus(allocation.id, event.target.value as SupplierAllocationStatus)} className="h-9 rounded-md border border-[#E4E7EC] px-2 text-xs font-black">
                        {supplierStatuses.map((status) => <option key={status} value={status}>{supplierAllocationStatusLabels[status]}</option>)}
                      </select>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </Panel>

          <Panel title="Supplier orders">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={generateSupplierOrders}
                disabled={generateDisabled}
                className="rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black text-[var(--tek-accent-ink)] disabled:cursor-not-allowed disabled:bg-[#E4E7EC] disabled:text-[#727986]"
              >
                {generatingSupplierOrders ? "Generating..." : "Generate Supplier Orders"}
              </button>
              <Link
                to="/admin/supplier-orders"
                className="rounded-md border border-[#E4E7EC] px-4 py-2 text-sm font-black"
              >
                View Supplier Orders
              </Link>
            </div>
            <p className="mt-3 text-xs font-semibold text-[#727986]">
              {allocationDirty || !hasSavedAllocation
                ? "Save the supplier allocation first."
                : "Generated supplier orders require staff approval before submission."}
            </p>
            {generatedSupplierOrders.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {generatedSupplierOrders.map((supplierOrder) => (
                  <Link
                    key={supplierOrder.id}
                    to={`/admin/supplier-orders/${supplierOrder.id}`}
                    className="rounded-md border border-[#B9E2DB] bg-[#EFFFFB] px-3 py-2 text-sm font-black text-[#14584E]"
                  >
                    Open {supplierOrder.id}
                  </Link>
                ))}
              </div>
            )}
            <div className="mt-5 space-y-3">
              {supplierOrders.map((supplierOrder) => (
                <Link
                  key={supplierOrder.id}
                  to={`/admin/supplier-orders/${supplierOrder.id}`}
                  className="grid gap-3 rounded-md bg-[#F6F7F9] p-4 transition hover:bg-[#EEF1F5] md:grid-cols-[1fr_1fr_auto]"
                >
                  <div>
                    <p className="text-sm font-black">{supplierOrder.id}</p>
                    <p className="mt-1 text-xs font-semibold text-[#727986]">
                      {supplierOrder.supplierName}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-[#3F4652]">
                    {supplierOrder.itemLines.map((line) => `${line.customerSku ?? line.productId} x${line.quantity}`).join(" · ")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <AdminStatusBadge label={supplierOrderStatusLabels[supplierOrder.status]} status={supplierOrder.status} />
                    {supplierOrder.status === "SUPERSEDED" && <span className="rounded-md bg-[#F6F7F9] px-2 py-1 text-xs font-black text-[#727986]">Superseded</span>}
                    {supplierOrder.itemLines.some((line) => !line.supplierSku) && supplierOrder.supplierCode !== "MANUAL" && <span className="rounded-md bg-[#FFFAEB] px-2 py-1 text-xs font-black text-[#B54708]">Mapping required</span>}
                    {orderHeld && <span className="rounded-md bg-[#FFFAEB] px-2 py-1 text-xs font-black text-[#B54708]">On hold</span>}
                  </div>
                </Link>
              ))}
              {supplierOrders.length === 0 && (
                <p className="text-sm font-semibold text-[#727986]">
                  No supplier orders generated yet.
                </p>
              )}
            </div>
          </Panel>

          <Panel title="Parcel and shipment">
            <form onSubmit={submitShipment} className="grid gap-3 md:grid-cols-2">
              <Input label="Courier Name" value={shipment.courierName} onChange={(value) => setShipment((current) => ({ ...current, courierName: value }))} />
              <Input label="Tracking Number" value={shipment.trackingNumber} onChange={(value) => setShipment((current) => ({ ...current, trackingNumber: value }))} />
              <Input label="Tracking URL" value={shipment.trackingUrl} onChange={(value) => setShipment((current) => ({ ...current, trackingUrl: value }))} />
              <Input label="Dispatch Date" type="date" value={shipment.dispatchDate} onChange={(value) => setShipment((current) => ({ ...current, dispatchDate: value }))} />
              <label className="block text-sm font-black md:col-span-2">
                Notes
                <textarea value={shipment.notes} onChange={(event) => setShipment((current) => ({ ...current, notes: event.target.value }))} className="mt-2 min-h-24 w-full rounded-md border border-[#E4E7EC] p-3" />
              </label>
              <button type="submit" className="w-fit rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black text-[var(--tek-accent-ink)]">
                Save Tracking Draft
              </button>
            </form>
            <form onSubmit={submitParcel} className="mt-5 grid gap-3 border-t border-[#E4E7EC] pt-5 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <Input label="Parcel Reference" value={parcelReference} onChange={setParcelReference} />
              <Input label="Weight Kg" type="number" value={parcelWeight} onChange={setParcelWeight} />
              <button type="submit" className="rounded-md border border-[#E4E7EC] px-4 py-2 text-sm font-black">
                Prepare Parcel
              </button>
            </form>
            <button type="button" onClick={submitConceptualShipment} disabled={orderHeld} className="mt-3 rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black text-[var(--tek-accent-ink)] disabled:cursor-not-allowed disabled:bg-[#E4E7EC] disabled:text-[#727986]">
              Add Tracking Shipment
            </button>
            <div className="mt-5 grid gap-3">
              {(order.parcels ?? []).map((parcel) => (
                <div key={parcel.id} className="rounded-md bg-[#F6F7F9] p-3 text-sm font-semibold">
                  Parcel {parcel.reference ?? parcel.id} · {parcel.itemQuantities.length} item lines
                </div>
              ))}
              {(order.shipments ?? []).map((entry) => (
                <div key={entry.id} className="rounded-md bg-[#F6F7F9] p-3 text-sm font-semibold">
                  Shipment {entry.status.replace(/_/g, " ")} · {entry.courier ?? "Courier pending"} · {entry.trackingNumber ?? "Tracking pending"}
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel title="Customer and delivery">
            <div className="space-y-4 text-sm leading-6 text-[#3F4652]">
              <div>
                <p className="font-black text-[#0A0A0A]">{order.customer.firstName} {order.customer.lastName}</p>
                <p>{order.customer.email}</p>
                <p>{order.customer.mobile}</p>
              </div>
              <div>
                <p>{order.deliveryAddress.streetAddress}</p>
                <p>{order.deliveryAddress.suburb}</p>
                <p>{order.deliveryAddress.city}</p>
                <p>{order.deliveryAddress.province}</p>
                <p>{order.deliveryAddress.postalCode}</p>
                <p>{order.deliveryAddress.country}</p>
              </div>
            </div>
          </Panel>

          <Panel title="Internal notes">
            <form onSubmit={submitNote}>
              <textarea value={note} onChange={(event) => setNote(event.target.value)} className="min-h-28 w-full rounded-md border border-[#E4E7EC] p-3 text-sm" />
              <button type="submit" className="mt-3 w-full rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black text-[var(--tek-accent-ink)]">
                Add Note
              </button>
            </form>
            <div className="mt-4 space-y-3">
              {(order.internalNotes ?? []).map((entry) => (
                <article key={entry.id} className="rounded-md bg-[#F6F7F9] p-3">
                  <p className="text-xs font-black text-[#0A0A0A]">{entry.authorLabel}</p>
                  <p className="mt-1 text-xs font-semibold text-[#727986]">{formatDateTime(entry.createdAt)}</p>
                  <p className="mt-2 text-sm leading-6 text-[#3F4652]">{entry.body}</p>
                </article>
              ))}
            </div>
          </Panel>

          <Panel title="Activity timeline">
            <div className="space-y-3">
              {activity.map((entry) => (
                <article key={`${entry.timestamp}-${entry.type}-${entry.description}`} className="border-l-2 border-[var(--tek-accent)] pl-3">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-[#727986]">{entry.type.replace(/_/g, " ")}</p>
                  <p className="mt-1 text-sm font-semibold text-[#0A0A0A]">{entry.description}</p>
                  <p className="mt-1 text-xs font-semibold text-[#727986]">{formatDateTime(entry.timestamp)}</p>
                </article>
              ))}
            </div>
          </Panel>
        </aside>
      </div>
    </AdminShell>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black text-[#0A0A0A]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function InfoCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <article className="rounded-lg border border-[#E4E7EC] bg-white p-4">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-[#727986]">{label}</p>
      <div className="mt-2 text-lg font-black text-[#0A0A0A]">{value}</div>
    </article>
  );
}

function deriveOrderWorkflow(order: Order, supplierOrders: SupplierOrder[]) {
  const activeAllocations = (order.supplierAllocations ?? []).filter(
    (allocation) => allocation.status !== "CANCELLED",
  );
  const activeSupplierOrder = supplierOrders.find(
    (supplierOrder) =>
      !["CANCELLED", "REJECTED", "SUPERSEDED"].includes(supplierOrder.status),
  );
  const hasShipment = (order.shipments ?? []).some(
    (shipment) => shipment.status === "DISPATCHED" || shipment.status === "DELIVERED",
  );
  const externalStatus = activeSupplierOrder?.externalSubmission?.status;
  const cjLogisticsBlocked =
    activeSupplierOrder?.supplierCode === "CJ" &&
    ["CJ_ORDER_LOGISTICS_REQUIRED", "CJ_LOGISTICS_NO_ROUTE", "CJ_LOGISTICS_API_REJECTED", "CJ_LOGISTICS_SOURCE_UNRESOLVED"].includes(
      activeSupplierOrder.externalSubmission?.lastErrorCode ?? "",
    );

  const steps = [
    {
      label: "Payment",
      status: order.payment.status === "PAID" ? "Paid" : paymentStatusLabels[order.payment.status],
      tone: order.payment.status === "PAID" ? "done" : "warning",
    },
    {
      label: "Allocation",
      status: activeAllocations.length ? activeAllocations.map((item) => item.supplierCode).join(", ") : "Required",
      tone: activeAllocations.length ? "done" : "warning",
    },
    {
      label: "Supplier Order",
      status: activeSupplierOrder ? activeSupplierOrder.id : "Not generated",
      tone: activeSupplierOrder ? "done" : "pending",
    },
    {
      label: "Approval",
      status: activeSupplierOrder?.status === "APPROVED" ? "Approved" : activeSupplierOrder ? supplierOrderStatusLabels[activeSupplierOrder.status] : "Waiting",
      tone: activeSupplierOrder?.status === "APPROVED" ? "done" : activeSupplierOrder ? "warning" : "pending",
    },
    {
      label: "CJ Preflight",
      status: cjLogisticsBlocked ? "Logistics unavailable" : externalStatus === "READY" ? "Ready" : activeSupplierOrder?.supplierCode === "CJ" ? "Not prepared" : "N/A",
      tone: cjLogisticsBlocked ? "warning" : externalStatus === "READY" ? "done" : "pending",
    },
    {
      label: "External Order",
      status: externalStatus === "CREATED" ? "Created" : "Not created",
      tone: externalStatus === "CREATED" ? "done" : "pending",
    },
    {
      label: "Fulfilment",
      status: hasShipment ? "Shipment recorded" : "Waiting",
      tone: hasShipment ? "done" : "pending",
    },
  ] as const;

  let nextAction = "Review order";
  if (order.operationalHold?.active) nextAction = "Release or resolve operational hold";
  else if (order.payment.status !== "PAID") nextAction = "Await PayFast payment confirmation";
  else if (!activeAllocations.length) nextAction = "Save supplier allocation";
  else if (!activeSupplierOrder) nextAction = "Generate supplier order";
  else if (activeSupplierOrder.itemLines.some((line) => !line.supplierSku) && activeSupplierOrder.supplierCode !== "MANUAL") nextAction = "Verify supplier product mapping";
  else if (activeSupplierOrder.status === "READY_FOR_APPROVAL") nextAction = `Approve ${activeSupplierOrder.id}`;
  else if (activeSupplierOrder.supplierCode === "CJ" && cjLogisticsBlocked) nextAction = "Resolve CJ logistics availability";
  else if (activeSupplierOrder.supplierCode === "CJ" && externalStatus !== "CREATED") nextAction = "Prepare and create CJ order";
  else if (activeSupplierOrder.status === "APPROVED") nextAction = activeSupplierOrder.supplierCode === "MANUAL" ? "Record supplier reference" : "Submit supplier order";
  else if (!hasShipment) nextAction = "Add supplier tracking when available";
  return { steps, nextAction };
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm font-black">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded-md border border-[#E4E7EC] px-3 text-sm font-semibold outline-none focus:border-[var(--tek-accent)]"
      />
    </label>
  );
}

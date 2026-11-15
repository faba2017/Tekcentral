import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AdminFeedback,
  AdminPageHeader,
  AdminShell,
  AdminStatusBadge,
} from "@/components/admin/AdminShell";
import { ApiError, apiRequest } from "@/lib/api";
import { mockSupplierScenarios, type CjOrderPreflight, type SyntechOrderPreflight } from "@/lib/admin";
import { formatCurrency as formatCurrencyBase } from "@/lib/format";
import {
  operationalHoldReasonLabels,
  supplierOrderStatusLabels,
} from "@/lib/order-status";
import { formatDateTime } from "@/lib/order-utils";
import { usePageTitle } from "@/lib/page-title";
import type {
  AdminSupplierOrderResponse,
} from "@/lib/admin";
import type {
  AttentionReason,
  MockSupplierScenario,
  Order,
  SupplierOrder,
} from "@/types/order";

const formatCurrency = (amount: number, currency: "ZAR" = "ZAR") => formatCurrencyBase(amount, currency);

export function AdminSupplierOrderDetailPage() {
  const { supplierOrderId = "" } = useParams();
  usePageTitle(`${supplierOrderId || "Supplier order"} | TekCentral Ops`);
  const [supplierOrder, setSupplierOrder] = useState<SupplierOrder | undefined>();
  const [customerOrder, setCustomerOrder] = useState<Order | undefined>();
  const [attentionReasons, setAttentionReasons] = useState<AttentionReason[]>([]);
  const [payloadPreview, setPayloadPreview] = useState<unknown>();
  const [supplierConfiguration, setSupplierConfiguration] = useState<AdminSupplierOrderResponse["supplierConfiguration"]>();
  const [operationsNotification, setOperationsNotification] = useState<AdminSupplierOrderResponse["operationsNotification"]>();
  const [tekcentralStock, setTekcentralStock] = useState<AdminSupplierOrderResponse["tekcentralStock"]>();
  const [notificationRetrying, setNotificationRetrying] = useState(false);
  const [cjPreflight, setCjPreflight] = useState<CjOrderPreflight | undefined>();
  const [selectedLogisticsKey, setSelectedLogisticsKey] = useState("");
  const [cjBusy, setCjBusy] = useState(false);
  const [syntechPreflight, setSyntechPreflight] = useState<SyntechOrderPreflight>();
  const [syntechBusy, setSyntechBusy] = useState(false);
  const [syntechShipping, setSyntechShipping] = useState<"DELIVERY" | "COLLECTION_CPT" | "COLLECTION_JHB">("DELIVERY");
  const [consigneeIdInput, setConsigneeIdInput] = useState("");
  const [scenario, setScenario] = useState<MockSupplierScenario>("SUCCESS");
  const [feedback, setFeedback] = useState<{ variant: "success" | "warning" | "error" | "info"; message: string }>();
  const [dispatch, setDispatch] = useState({
    courier: "",
    trackingNumber: "",
    trackingUrl: "",
    dispatchedAt: "",
  });
  const [supplierSkuInputs, setSupplierSkuInputs] = useState<Record<string, string>>({});
  const [manualOrder, setManualOrder] = useState({ supplierReference: "", note: "" });

  const loadSupplierOrder = () => {
    apiRequest<AdminSupplierOrderResponse>(
      `/api/admin/supplier-orders/${encodeURIComponent(supplierOrderId)}`,
    )
      .then((response) => {
        setSupplierOrder(response.supplierOrder);
        setCustomerOrder(response.customerOrder);
        setAttentionReasons(response.attentionReasons);
        setPayloadPreview(response.payloadPreview);
        setSupplierConfiguration(response.supplierConfiguration);
        setOperationsNotification(response.operationsNotification);
        setTekcentralStock(response.tekcentralStock);
      })
      .catch(() =>
        setFeedback({ variant: "error", message: "Supplier order data is not available." }),
      );
  };

  useEffect(loadSupplierOrder, [supplierOrderId]);

  const runAction = async (
    path: string,
    init: RequestInit,
    successMessage: string,
    warning = false,
  ) => {
    try {
      const response = await apiRequest<{ supplierOrder: SupplierOrder }>(path, init);
      setSupplierOrder(response.supplierOrder);
      setFeedback({ variant: warning ? "warning" : "success", message: successMessage });
      loadSupplierOrder();
    } catch (error) {
      setFeedback({
        variant: "error",
        message: error instanceof ApiError ? error.message : "Supplier order action was rejected.",
      });
    }
  };

  const selectedLogistics = cjPreflight?.logisticsOptions.find(
    (option) => `${option.fromCountryCode}::${option.logisticName}` === selectedLogisticsKey,
  );

  const syntechShippingPayload = syntechShipping === "DELIVERY"
    ? { type: "DELIVERY" as const }
    : { type: "COLLECTION" as const, location: syntechShipping === "COLLECTION_CPT" ? "cpt" as const : "jhb" as const };

  const prepareSyntechOrder = async () => {
    setSyntechBusy(true);
    try {
      const response = await apiRequest<{ preflight: SyntechOrderPreflight }>(`/api/admin/supplier-orders/${encodeURIComponent(supplierOrderId)}/syntech/preflight`, { method: "POST", body: JSON.stringify({ shipping: syntechShippingPayload }) });
      setSyntechPreflight(response.preflight);
      setFeedback({ variant: response.preflight.status === "READY_FOR_CONTROLLED_UAT" ? "success" : "warning", message: response.preflight.status === "READY_FOR_CONTROLLED_UAT" ? "Syntech procurement is ready for controlled UAT." : [...response.preflight.blockers, ...response.preflight.submissionBlockers].join(" ") });
    } catch (error) { setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "Syntech preflight failed." }); }
    finally { setSyntechBusy(false); }
  };

  const createSyntechOrder = async () => {
    if (syntechPreflight?.status !== "READY_FOR_CONTROLLED_UAT") return;
    const confirmed = window.confirm(`Create Syntech UAT order?\n\nEnvironment: UAT / TEST\nReference: ${syntechPreflight.externalReference}\nLines: ${syntechPreflight.lines.length}\nQuantity: ${syntechPreflight.lines.reduce((sum, line) => sum + line.quantity, 0)}\nShipping: ${syntechShipping.replace(/_/g, " ")}\nBackorder: NO\nEstimated product cost: ${formatCurrency(syntechPreflight.estimatedProductCostZar)}\n\nThis updates private supplier procurement only. It does not publish products, create pricing proposals, pay Syntech, or fulfil the customer order.`);
    if (!confirmed) return;
    setSyntechBusy(true);
    try {
      const response = await apiRequest<{ supplierOrder: SupplierOrder; preflight?: SyntechOrderPreflight; reused?: boolean }>(`/api/admin/supplier-orders/${encodeURIComponent(supplierOrderId)}/syntech/create`, { method: "POST", body: JSON.stringify({ shipping: syntechShippingPayload, confirmed: true }) });
      setSupplierOrder(response.supplierOrder); if (response.preflight) setSyntechPreflight(response.preflight); setFeedback({ variant: "success", message: response.reused ? "The existing Syntech UAT order reference was reused; no second order was submitted." : "Syntech UAT order created and its sales order reference was persisted." });
    } catch (error) { setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "Syntech UAT order creation failed." }); loadSupplierOrder(); }
    finally { setSyntechBusy(false); }
  };

  const prepareCjOrder = async (selection = selectedLogistics) => {
    setCjBusy(true);
    setFeedback({ variant: "info", message: "Checking CJ stock and logistics..." });
    try {
      const response = await apiRequest<{ preflight: CjOrderPreflight }>(
        `/api/admin/supplier-orders/${encodeURIComponent(supplierOrderId)}/cj/preflight`,
        {
          method: "POST",
          body: JSON.stringify({
            selectedLogistics: selection
              ? {
                  logisticName: selection.logisticName,
                  fromCountryCode: selection.fromCountryCode,
                }
              : undefined,
          }),
        },
      );
      setCjPreflight(response.preflight);
      if (response.preflight.selectedLogistics) {
        setSelectedLogisticsKey(
          `${response.preflight.selectedLogistics.fromCountryCode}::${response.preflight.selectedLogistics.logisticName}`,
        );
      }
      setFeedback({
        variant: response.preflight.status === "READY" ? "success" : "warning",
        message:
          response.preflight.status === "READY"
            ? "CJ order ready for review."
            : response.preflight.blockers.join(" ") || "CJ order preflight needs staff review.",
      });
      if (
        response.preflight.recipientValidation?.consigneeId.status === "NEEDS_CORRECTION" &&
        response.preflight.recipientRequirements?.consigneeId === "REQUIRED"
      ) {
        window.dispatchEvent(
          new CustomEvent("tekcentral:admin-toast", {
            detail: {
              id: `cj-recipient-${supplierOrderId}`,
              variant: "warning",
              title: "CJ fulfilment paused",
              message: `CJ fulfilment paused for ${supplierOrder?.customerOrderNumber ?? "this order"}. Recipient information or shipping selection is required.`,
            },
          }),
        );
      }
    } catch (error) {
      setFeedback({
        variant: "error",
        message: error instanceof ApiError ? error.message : "CJ preflight was rejected.",
      });
    } finally {
      setCjBusy(false);
    }
  };

  const createCjOrder = async () => {
    if (!cjPreflight?.selectedLogistics || cjPreflight.status !== "READY") return;
    const confirmed = window.confirm(
      `Create real CJ order?\n\nTekCentral order: ${supplierOrder?.customerOrderNumber ?? ""}\nSupplier order: ${supplierOrderId}\nItems: ${cjPreflight.lines.reduce((sum, line) => sum + line.quantity, 0)}\nCJ total: ${
        cjPreflight.supplierTotalAmount !== undefined
          ? `${cjPreflight.currency ?? ""} ${cjPreflight.supplierTotalAmount.toFixed(2)}`
          : "not confirmed"
      }\n\nThis creates an unpaid external supplier order.`,
    );
    if (!confirmed) return;
    setCjBusy(true);
    try {
      const response = await apiRequest<{ supplierOrder: SupplierOrder; preflight?: CjOrderPreflight }>(
        `/api/admin/supplier-orders/${encodeURIComponent(supplierOrderId)}/cj/create`,
        {
          method: "POST",
          body: JSON.stringify({
            selectedLogistics: {
              logisticName: cjPreflight.selectedLogistics.logisticName,
              fromCountryCode: cjPreflight.selectedLogistics.fromCountryCode,
            },
          }),
        },
      );
      setSupplierOrder(response.supplierOrder);
      if (response.preflight) setCjPreflight(response.preflight);
      setFeedback({ variant: "success", message: "CJ order created. Supplier payment was not initiated." });
      loadSupplierOrder();
    } catch (error) {
      setFeedback({
        variant: "error",
        message: error instanceof ApiError ? error.message : "CJ order creation was rejected.",
      });
      loadSupplierOrder();
    } finally {
      setCjBusy(false);
    }
  };

  const generateCjPricingProposal = async () => {
    const productId = supplierOrder?.itemLines[0]?.productId;
    if (!productId || !cjReadyForCreate) return;
    setCjBusy(true);
    try {
      await apiRequest("/api/admin/pricing/proposals/cj", { method: "POST", body: JSON.stringify({ supplierOrderId, productId }) });
      setFeedback({ variant: "success", message: "CJ landed-cost pricing proposal generated. No storefront price was changed." });
    } catch (error) {
      setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "CJ pricing proposal could not be generated." });
    } finally { setCjBusy(false); }
  };

  const runCjReadAction = async (action: "reconcile" | "refresh-status", message: string) => {
    setCjBusy(true);
    try {
      const response = await apiRequest<{ supplierOrder: SupplierOrder }>(
        `/api/admin/supplier-orders/${encodeURIComponent(supplierOrderId)}/cj/${action}`,
        { method: "POST" },
      );
      setSupplierOrder(response.supplierOrder);
      setFeedback({ variant: "success", message });
      loadSupplierOrder();
    } catch (error) {
      setFeedback({
        variant: "error",
        message: error instanceof ApiError ? error.message : "CJ read action was rejected.",
      });
    } finally {
      setCjBusy(false);
    }
  };

  const saveConsigneeId = async () => {
    setCjBusy(true);
    try {
      const response = await apiRequest<{ supplierOrder: SupplierOrder; preflight?: CjOrderPreflight }>(
        `/api/admin/supplier-orders/${encodeURIComponent(supplierOrderId)}/cj/consignee-id`,
        { method: "POST", body: JSON.stringify({ consigneeId: consigneeIdInput }) },
      );
      setSupplierOrder(response.supplierOrder);
      if (response.preflight) setCjPreflight(response.preflight);
      setConsigneeIdInput("");
      setFeedback({ variant: "success", message: "CJ consignee ID saved for this supplier order." });
      loadSupplierOrder();
    } catch (error) {
      setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "Consignee ID was rejected." });
    } finally {
      setCjBusy(false);
    }
  };

  const removeConsigneeId = async () => {
    setCjBusy(true);
    try {
      const response = await apiRequest<{ supplierOrder: SupplierOrder; preflight?: CjOrderPreflight }>(
        `/api/admin/supplier-orders/${encodeURIComponent(supplierOrderId)}/cj/consignee-id`,
        { method: "DELETE" },
      );
      setSupplierOrder(response.supplierOrder);
      if (response.preflight) setCjPreflight(response.preflight);
      setFeedback({ variant: "success", message: "CJ consignee ID removed for this supplier order." });
      loadSupplierOrder();
    } catch (error) {
      setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "Consignee ID could not be removed." });
    } finally {
      setCjBusy(false);
    }
  };

  const approve = () =>
    runAction(
      `/api/admin/supplier-orders/${encodeURIComponent(supplierOrderId)}/approve`,
      { method: "PATCH" },
      "Supplier order approved.",
    );

  const acknowledge = () =>
    runAction(
      `/api/admin/supplier-orders/${encodeURIComponent(supplierOrderId)}/acknowledge`,
      { method: "PATCH" },
      "Procurement task acknowledged.",
    );

  const markOrdered = () => {
    if (!window.confirm("Record this supplier reference and mark the approved SupplierOrder as ordered? This confirms that staff placed the external supplier order.")) return;
    return runAction(
      `/api/admin/supplier-orders/${encodeURIComponent(supplierOrderId)}/manual-order`,
      { method: "POST", body: JSON.stringify(manualOrder) },
      "Supplier order reference recorded. Procurement is marked ordered.",
    );
  };

  const retryNotification = async () => {
    if (notificationRetrying) return;
    setNotificationRetrying(true);
    setOperationsNotification((current) => current ? { ...current, status: "SENDING" } : current);
    try {
      const response = await apiRequest<{ notification: NonNullable<AdminSupplierOrderResponse["operationsNotification"]> }>(`/api/admin/supplier-orders/${encodeURIComponent(supplierOrderId)}/notifications/scoop-action-required/retry`, { method: "POST" });
      setOperationsNotification(response.notification);
      setFeedback({ variant: response.notification.status === "SENT" ? "success" : "warning", message: response.notification.status === "SENT" ? "Operations notification sent." : "Operations notification could not be sent." });
      loadSupplierOrder();
    } catch (error) {
      setFeedback({ variant: "error", message: error instanceof ApiError ? error.message : "Notification retry was rejected." });
      loadSupplierOrder();
    } finally {
      setNotificationRetrying(false);
    }
  };

  const mockSubmit = () =>
    runAction(
      `/api/admin/supplier-orders/${encodeURIComponent(supplierOrderId)}/mock-submit`,
      { method: "POST", body: JSON.stringify({ scenario }) },
      "Mock supplier submission recorded.",
      true,
    );

  const applyOutcome = () =>
    runAction(
      `/api/admin/supplier-orders/${encodeURIComponent(supplierOrderId)}/mock-confirm`,
      { method: "PATCH" },
      "Mock supplier outcome applied.",
      true,
    );

  const reject = () =>
    runAction(
      `/api/admin/supplier-orders/${encodeURIComponent(supplierOrderId)}/mock-reject`,
      { method: "PATCH", body: JSON.stringify({ reason: "Rejected through mock supplier testing." }) },
      "Supplier order rejected in mock mode.",
      true,
    );

  const submitDispatch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runAction(
      `/api/admin/supplier-orders/${encodeURIComponent(supplierOrderId)}/dispatch`,
      { method: "PATCH", body: JSON.stringify(dispatch) },
      "Mock supplier dispatch recorded.",
      true,
    );
  };

  const mapSupplierSku = (productId: string) =>
    runAction(
      `/api/admin/supplier-orders/${encodeURIComponent(supplierOrderId)}/lines/${encodeURIComponent(productId)}/supplier-sku`,
      {
        method: "PATCH",
        body: JSON.stringify({ supplierSku: supplierSkuInputs[productId] ?? "" }),
      },
      "Supplier SKU mapped.",
      true,
    );

  const runTekCentralAction = (action: "START_PICKING" | "MARK_PACKED" | "MARK_READY") => runAction(`/api/admin/supplier-orders/${encodeURIComponent(supplierOrderId)}/tekcentral/progress`, { method: "POST", body: JSON.stringify({ action }) }, action === "START_PICKING" ? "Picking started." : action === "MARK_PACKED" ? "Internal order marked packed." : "Internal order is ready for dispatch.");
  const fulfilTekCentral = () => { if (!window.confirm("Mark this internal order fulfilled?\n\nThis permanently decrements on-hand stock once. It does not create a courier booking or customer refund.")) return; void runAction(`/api/admin/supplier-orders/${encodeURIComponent(supplierOrderId)}/tekcentral/fulfil`, { method: "POST", body: "{}" }, "Internal order fulfilled. Reserved stock was permanently consumed."); };
  const cancelTekCentral = () => { if (!window.confirm("Cancel this internal allocation?\n\nReserved stock will be released. Fulfilled stock is never restored by this action.")) return; void runAction(`/api/admin/supplier-orders/${encodeURIComponent(supplierOrderId)}/tekcentral/cancel`, { method: "POST", body: JSON.stringify({ reason: "Cancelled by staff before fulfilment." }) }, "Internal allocation cancelled and reservation released.", true); };

  if (!supplierOrder) {
    return (
      <AdminShell>
        <AdminPageHeader eyebrow="Mock supplier orchestration" title={supplierOrderId || "Supplier order"} />
        {feedback && <div className="mt-5"><AdminFeedback {...feedback} /></div>}
        <p className="mt-6 rounded-lg border border-[#E4E7EC] bg-white p-6 text-sm font-semibold text-[#727986]">
          Loading supplier order...
        </p>
      </AdminShell>
    );
  }

  const customerOrderHeld = customerOrder?.operationalHold?.active === true;
  const missingMappings = supplierOrder.itemLines.filter((line) => !line.supplierSku?.trim());
  const mappingRequired = supplierOrder.supplierCode !== "MANUAL" && missingMappings.length > 0;
  const actionsBlocked = customerOrderHeld || supplierOrder.status === "SUPERSEDED" || supplierOrder.status === "COMPLETED" || supplierOrder.status === "CANCELLED";
  const isScoopOrder = supplierOrder.supplierCode === "SCOOP";
  const canAcknowledge = isScoopOrder && !actionsBlocked && supplierOrder.status === "ACTION_REQUIRED";
  const canApprove = !actionsBlocked && !mappingRequired && (supplierOrder.status === "READY_FOR_APPROVAL" || (isScoopOrder && supplierOrder.status === "ACKNOWLEDGED"));
  const canReject = !actionsBlocked && ["READY_FOR_APPROVAL", "APPROVED", "SUBMITTED", "ACKNOWLEDGED", "PARTIALLY_CONFIRMED", "BACKORDERED"].includes(supplierOrder.status);
  const canMockSubmit = !actionsBlocked && !mappingRequired && supplierOrder.status === "APPROVED";
  const canApplyOutcome = !actionsBlocked && ["SUBMITTED", "ACKNOWLEDGED"].includes(supplierOrder.status);
  const canDispatch = !actionsBlocked && supplierOrder.status === "CONFIRMED";
  const isCjOrder = supplierOrder.supplierCode === "CJ";
  const isSyntechOrder = supplierOrder.supplierCode === "SYNTECH";
  const syntechUatEnabled = Boolean(supplierConfiguration?.apiProcurement?.effectiveEnabled);
  const isTekCentralOrder = supplierOrder.supplierCode === "TEKCENTRAL";
  const isManualSupplierOrder = supplierOrder.supplierCode === "MUSTEK" || supplierOrder.supplierCode === "TVR";
  const submissionDisplay = isCjOrder ? "CJ API" : isScoopOrder ? "Scoop reseller portal" : supplierOrder.submissionMode;
  const fulfilmentDisplay = isCjOrder
    ? supplierOrder.fulfilmentMode === "DIRECT_TO_CUSTOMER"
      ? "Direct to customer"
      : "CJ fulfilment pending logistics selection"
    : supplierOrder.fulfilmentMode.replace(/_/g, " ");
  const canPrepareCj = isCjOrder && !actionsBlocked && supplierOrder.status === "APPROVED";
  const canCreateCj =
    canPrepareCj &&
    cjPreflight?.status === "READY" &&
    cjPreflight.featureEnabled &&
    Boolean(cjPreflight.selectedLogistics) &&
    supplierOrder.externalSubmission?.status !== "CREATED";
  const canReconcileCj =
    isCjOrder &&
    ["SUBMITTING", "UNKNOWN_RESULT"].includes(supplierOrder.externalSubmission?.status ?? "");
  const canRefreshCjStatus = isCjOrder && supplierOrder.externalSubmission?.status === "CREATED";
  const cjHasMethods = (cjPreflight?.logisticsOptions.length ?? 0) > 0;
  const cjNeedsDeliveryChoice = Boolean(cjPreflight && cjHasMethods && !cjPreflight.selectedLogistics);
  const cjReadyForCreate = Boolean(cjPreflight?.selectedLogistics && cjPreflight.status === "READY");
  const cjNextActionTitle = !cjPreflight
    ? "Run CJ preflight"
    : cjPreflight.blockers.length > 0
      ? "Resolve blocked preflight"
      : cjNeedsDeliveryChoice
        ? "Choose delivery method"
        : cjReadyForCreate
          ? "Create CJ order"
          : "Review CJ order";
  const cjNextActionDetail = !cjPreflight
    ? "Check CJ variant data, stock, logistics and order readiness."
    : cjPreflight.blockers.length > 0
      ? "Review the blocker before creating a CJ order."
      : cjNeedsDeliveryChoice
        ? "Select one CJ-returned delivery method before reviewing cost and payload."
        : cjReadyForCreate
          ? "CJ cost and payload are ready. Creation still requires confirmation and the server feature flag."
          : "Review the selected delivery method and CJ cost snapshot.";

  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="Supplier operations"
        title={supplierOrder.id}
        description={`${supplierOrder.supplierName} for ${supplierOrder.customerOrderNumber}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/admin/supplier-orders"
              className="rounded-md border border-[#E4E7EC] bg-white px-4 py-2 text-sm font-black"
            >
              Back to Supplier Orders
            </Link>
            <Link
              to={`/admin/orders/${supplierOrder.customerOrderNumber}`}
              className="rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black text-[var(--tek-accent-ink)]"
            >
              Customer Order
            </Link>
          </div>
        }
      />
      {feedback && <div className="mt-5"><AdminFeedback {...feedback} /></div>}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Panel title="Status">
              <AdminStatusBadge label={supplierOrderStatusLabels[supplierOrder.status]} status={supplierOrder.status} />
            </Panel>
            <Panel title="Submission">
              <p className="text-sm font-black">{submissionDisplay}</p>
              <p className="mt-1 text-xs font-semibold text-[#727986]">
                {fulfilmentDisplay}
              </p>
            </Panel>
            <Panel title={isCjOrder ? "External ref" : "Supplier ref"}>
              <p className="text-sm font-black">
                {supplierOrder.externalSubmission?.externalOrderNumber ??
                  supplierOrder.supplierOrderReference ??
                  "Not generated"}
              </p>
              <p className="mt-1 text-xs font-semibold text-[#727986]">
                {isCjOrder ? "CJ order creation does not initiate supplier payment" : isScoopOrder ? "Separate from TekCentral order references" : "Internal supplier reference"}
              </p>
            </Panel>
            <Panel title="Cost">
              <p className="text-sm font-black">
                {supplierOrder.supplierSubtotal !== null && supplierOrder.supplierSubtotal !== undefined
                  ? `${formatCurrency(supplierOrder.supplierSubtotal, "ZAR")} excl. VAT`
                  : "Supplier cost unknown"}
              </p>
              <p className="mt-1 text-xs font-semibold text-[#727986]">
                Selling revenue{" "}
                {formatCurrency(
                  supplierOrder.itemLines.reduce(
                    (sum, line) => sum + line.sellingPriceSnapshot * line.quantity,
                    0,
                  ),
                  customerOrder?.currency ?? "ZAR",
                )}
              </p>
            </Panel>
          </section>

          {customerOrderHeld && (
            <section className="rounded-lg border border-[#FEDF89] bg-[#FFFAEB] p-5">
              <h2 className="text-base font-black text-[#0A0A0A]">Customer order is on hold</h2>
              <p className="mt-2 text-sm font-semibold text-[#B54708]">
                Supplier procurement and fulfilment are blocked until this hold is released.
              </p>
              <p className="mt-1 text-sm font-semibold text-[#3F4652]">
                {operationalHoldReasonLabels[customerOrder.operationalHold?.reason ?? "MANUAL"]}
              </p>
            </section>
          )}

          {attentionReasons.length > 0 && (
            <Panel title="Attention">
              <div className="grid gap-2 sm:grid-cols-2">
                {attentionReasons.map((reason) => (
                  <div key={reason.code} className="rounded-md border border-[#FEDF89] bg-[#FFFAEB] p-3">
                    <p className="text-sm font-black">{reason.label}</p>
                    <p className="mt-1 text-xs font-semibold text-[#B54708]">{reason.detail}</p>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {isTekCentralOrder && supplierOrder.tekcentralOperations && (
            <Panel title="TekCentral internal fulfilment">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <WorkflowCard step="1" title="Reserved" active={supplierOrder.status === "READY_FOR_APPROVAL"} done={supplierOrder.status !== "READY_FOR_APPROVAL"}>Stock was reserved when this paid allocation was created.</WorkflowCard>
                <WorkflowCard step="2" title="Picking" active={supplierOrder.tekcentralOperations.stage === "PICKING"} done={["PACKED", "READY_FOR_DISPATCH", "FULFILLED"].includes(supplierOrder.tekcentralOperations.stage)}>Pick only the exact reserved quantity.</WorkflowCard>
                <WorkflowCard step="3" title="Packed" active={supplierOrder.tekcentralOperations.stage === "PACKED"} done={["READY_FOR_DISPATCH", "FULFILLED"].includes(supplierOrder.tekcentralOperations.stage)}>Confirm the complete internal order is packed.</WorkflowCard>
                <WorkflowCard step="4" title="Ready / fulfilled" active={supplierOrder.tekcentralOperations.stage === "READY_FOR_DISPATCH"} done={supplierOrder.tekcentralOperations.stage === "FULFILLED"}>Fulfilment permanently consumes reserved stock once.</WorkflowCard>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">{tekcentralStock?.map((offer) => <article key={offer.offerId} className="rounded-md border border-[#E4E7EC] bg-[#F9FAFB] p-3"><p className="text-sm font-black">{offer.supplierSku}</p><dl className="mt-2 grid grid-cols-3 gap-2 text-xs"><div><dt className="font-bold text-[#667085]">On hand</dt><dd className="text-lg font-black">{offer.onHand}</dd></div><div><dt className="font-bold text-[#667085]">Reserved</dt><dd className="text-lg font-black">{offer.reserved}</dd></div><div><dt className="font-bold text-[#667085]">Available</dt><dd className="text-lg font-black">{offer.available}</dd></div></dl><p className="mt-2 text-xs font-semibold text-[#667085]">Current cost {formatCurrency(offer.sourceCostExVat)} excl. VAT · Stock observed {formatDateTime(offer.stockObservedAt)}</p></article>)}</div>
              <div className="mt-4 flex flex-wrap gap-2">
                {supplierOrder.status === "READY_FOR_APPROVAL" && <button type="button" onClick={approve} disabled={!canApprove} className="rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black disabled:opacity-50">Approve reserved order</button>}
                {supplierOrder.status === "APPROVED" && supplierOrder.tekcentralOperations.stage === "RESERVED" && <button type="button" onClick={() => runTekCentralAction("START_PICKING")} className="rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black">Start picking</button>}
                {supplierOrder.tekcentralOperations.stage === "PICKING" && <button type="button" onClick={() => runTekCentralAction("MARK_PACKED")} className="rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black">Mark packed</button>}
                {supplierOrder.tekcentralOperations.stage === "PACKED" && <button type="button" onClick={() => runTekCentralAction("MARK_READY")} className="rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black">Ready for dispatch</button>}
                {supplierOrder.tekcentralOperations.stage === "READY_FOR_DISPATCH" && <button type="button" onClick={fulfilTekCentral} className="rounded-md bg-[#101828] px-4 py-2 text-sm font-black text-white">Mark fulfilled</button>}
                {!['FULFILLED', 'CANCELLED'].includes(supplierOrder.tekcentralOperations.stage) && <button type="button" onClick={cancelTekCentral} className="rounded-md border border-[#FDA29B] px-4 py-2 text-sm font-black text-[#B42318]">Cancel allocation</button>}
              </div>
              <p className="mt-3 text-xs font-semibold text-[#667085]">Manual courier and tracking details remain in the customer order shipment workflow. Returns and restocking are not part of this action.</p>
            </Panel>
          )}

          {isScoopOrder && (
            <Panel title="Scoop procurement">
              <div className="grid gap-3 sm:grid-cols-3">
                <WorkflowCard step="1" title="Acknowledge" active={canAcknowledge} done={["ACKNOWLEDGED", "APPROVED", "ORDERED", "CONFIRMED", "SHIPPED", "DELIVERED"].includes(supplierOrder.status)}>
                  Confirm that a staff member has seen this paid procurement task.
                </WorkflowCard>
                <WorkflowCard step="2" title="Approve procurement" active={supplierOrder.status === "ACKNOWLEDGED"} done={["APPROVED", "ORDERED", "CONFIRMED", "SHIPPED", "DELIVERED"].includes(supplierOrder.status)}>
                  Authorize external procurement without placing the order.
                </WorkflowCard>
                <WorkflowCard step="3" title="Place and record" active={supplierOrder.status === "APPROVED"} done={["ORDERED", "CONFIRMED", "SHIPPED", "DELIVERED"].includes(supplierOrder.status)}>
                  Place the order manually, then record Scoop's reference.
                </WorkflowCard>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {canAcknowledge && <button type="button" onClick={acknowledge} className="rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black text-[var(--tek-accent-ink)]">Acknowledge</button>}
                {supplierOrder.status === "ACKNOWLEDGED" && <button type="button" onClick={approve} disabled={!canApprove} className="rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black text-[var(--tek-accent-ink)] disabled:opacity-50">Approve procurement</button>}
              </div>
              {supplierOrder.status === "APPROVED" && (
                <div className="mt-4 rounded-md border border-[#E4E7EC] bg-[#F6F7F9] p-4">
                  <a href={supplierConfiguration?.manualProcurementUrl} target="_blank" rel="noopener noreferrer" className={`inline-flex rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black text-[var(--tek-accent-ink)] ${supplierConfiguration?.manualProcurementUrl ? "" : "pointer-events-none opacity-50"}`}>
                    Open Scoop reseller portal
                  </a>
                  <p className="mt-2 text-xs font-semibold text-[#727986]">Place the order in Scoop, then return here and record the supplier reference. Opening the portal does not change this order.</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Input label="Scoop order reference" value={manualOrder.supplierReference} onChange={(value) => setManualOrder((current) => ({ ...current, supplierReference: value }))} />
                    <Input label="Internal note (optional)" value={manualOrder.note} onChange={(value) => setManualOrder((current) => ({ ...current, note: value }))} />
                  </div>
                  <button type="button" onClick={markOrdered} disabled={!manualOrder.supplierReference.trim()} className="mt-3 rounded-md bg-[#0A0A0A] px-4 py-2 text-sm font-black text-white disabled:bg-[#E4E7EC] disabled:text-[#727986]">Mark as ordered</button>
                </div>
              )}
              {supplierOrder.status === "ORDERED" && <p className="mt-4 rounded-md border border-[#ABEFC6] bg-[#ECFDF3] p-3 text-sm font-black text-[#067647]">Scoop order recorded as {supplierOrder.supplierOrderReference}. Ordered {supplierOrder.orderedAt ? formatDateTime(supplierOrder.orderedAt) : "by staff"}.</p>}
            </Panel>
          )}

          {isScoopOrder && operationsNotification && (
            <Panel title="Operations notification">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black">{operationsNotification.status === "SENT" ? "SENT ✓" : operationsNotification.status}</p>
                  <div className="mt-1 space-y-1 text-xs font-semibold text-[#727986]">
                    <p>Recipient: {operationsNotification.recipient || "Not configured"}</p>
                    <p>Last attempted: {operationsNotification.attemptedAt ? formatDateTime(operationsNotification.attemptedAt) : "Not attempted"}</p>
                    {operationsNotification.failureReason && <p>Failure category: {operationsNotification.failureReason === "CONFIGURATION_MISSING" ? "SMTP_CONFIG_MISSING" : operationsNotification.failureReason}</p>}
                    <p>Retry count: {operationsNotification.retryCount}</p>
                    {operationsNotification.sentAt && <p>Sent: {formatDateTime(operationsNotification.sentAt)}</p>}
                  </div>
                </div>
                {operationsNotification.status === "FAILED" && <button type="button" onClick={() => void retryNotification()} disabled={notificationRetrying} className="rounded-md border border-[#E4E7EC] bg-white px-3 py-2 text-xs font-black disabled:text-[#727986]">{notificationRetrying ? "Retrying..." : "Retry notification"}</button>}
              </div>
            </Panel>
          )}

          {isManualSupplierOrder && (
            <Panel title={`${supplierOrder.supplierName} manual procurement`}>
              <div className="grid gap-3 sm:grid-cols-3">
                <WorkflowCard step="1" title="Approve procurement" active={supplierOrder.status === "READY_FOR_APPROVAL"} done={["APPROVED", "ORDERED", "CONFIRMED", "SHIPPED", "DELIVERED"].includes(supplierOrder.status)}>Confirm the paid SupplierOrder and its exact supplier mapping.</WorkflowCard>
                <WorkflowCard step="2" title="Place order manually" active={supplierOrder.status === "APPROVED"} done={["ORDERED", "CONFIRMED", "SHIPPED", "DELIVERED"].includes(supplierOrder.status)}>Place the order through the approved supplier channel outside TekCentral.</WorkflowCard>
                <WorkflowCard step="3" title="Record reference" active={supplierOrder.status === "APPROVED"} done={["ORDERED", "CONFIRMED", "SHIPPED", "DELIVERED"].includes(supplierOrder.status)}>Record the supplier reference to complete the exclusive procurement transition.</WorkflowCard>
              </div>
              {supplierOrder.status === "READY_FOR_APPROVAL" && <button type="button" onClick={approve} disabled={!canApprove} className="mt-4 rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black disabled:opacity-50">Approve procurement</button>}
              {supplierOrder.status === "APPROVED" && <div className="mt-4 rounded-md border border-[#E4E7EC] bg-[#F6F7F9] p-4"><div className="grid gap-3 sm:grid-cols-2"><Input label={`${supplierOrder.supplierName} order reference`} value={manualOrder.supplierReference} onChange={(value) => setManualOrder((current) => ({ ...current, supplierReference: value }))} /><Input label="Internal note (optional)" value={manualOrder.note} onChange={(value) => setManualOrder((current) => ({ ...current, note: value }))} /></div><button type="button" onClick={markOrdered} disabled={!manualOrder.supplierReference.trim()} className="mt-3 rounded-md bg-[#0A0A0A] px-4 py-2 text-sm font-black text-white disabled:bg-[#E4E7EC] disabled:text-[#727986]">Record reference and mark ordered</button></div>}
              {supplierOrder.status === "ORDERED" && <p className="mt-4 rounded-md border border-[#ABEFC6] bg-[#ECFDF3] p-3 text-sm font-black text-[#067647]">Manual supplier order recorded as {supplierOrder.supplierOrderReference}.</p>}
            </Panel>
          )}

          <Panel title="Items">
            <div className="divide-y divide-[#E4E7EC]">
              {supplierOrder.itemLines.map((line) => (
                <div key={line.orderItemId} className="grid gap-2 py-3 md:grid-cols-[1fr_90px_120px_120px]">
                  <div>
                    <p className="text-sm font-black">{line.description}</p>
                    <p className="mt-1 text-xs font-semibold text-[#727986]">
                      TekCentral SKU: {line.customerSku ?? line.productId}
                    </p>
                    <p className={`mt-1 text-xs font-black ${line.supplierSku ? "text-[#3F4652]" : "text-[#B54708]"}`}>
                      {supplierOrder.supplierCode === "CJ"
                        ? line.supplierSku
                          ? `Verified CJ SKU: ${line.supplierSku}`
                          : "No CJ mapping"
                        : `Supplier SKU: ${line.supplierSku ?? "Not mapped"}`}
                    </p>
                    {!line.supplierSku && supplierOrder.supplierCode === "CJ" && (
                      <p className="mt-2 rounded-md bg-[#FFFAEB] px-3 py-2 text-xs font-semibold text-[#B54708]">
                        CJ mapping awaiting verification or not yet created. Use Supplier Mappings to verify a CJ API mapping.
                      </p>
                    )}
                    {!line.supplierSku && !["MANUAL", "CJ"].includes(supplierOrder.supplierCode) && (
                      <div className="mt-3 grid max-w-md gap-2 sm:grid-cols-[1fr_auto]">
                        <input
                          value={supplierSkuInputs[line.productId] ?? ""}
                          onChange={(event) =>
                            setSupplierSkuInputs((current) => ({
                              ...current,
                              [line.productId]: event.target.value,
                            }))
                          }
                          placeholder="Supplier SKU"
                          className="h-10 rounded-md border border-[#FEDF89] px-3 text-sm font-semibold outline-none focus:border-[var(--tek-accent)]"
                        />
                        <button
                          type="button"
                          onClick={() => mapSupplierSku(line.productId)}
                          className="rounded-md border border-[#E4E7EC] px-3 py-2 text-sm font-black"
                        >
                          Add Supplier SKU
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-sm font-semibold">Qty {line.quantity}</p>
                  <p className="text-sm font-semibold">Confirmed {line.confirmedQuantity ?? 0}</p>
                  <p className="text-sm font-semibold">Backorder {line.backorderedQuantity ?? 0}</p>
                </div>
              ))}
            </div>
          </Panel>

          {isSyntechOrder && !syntechUatEnabled && (
            <Panel title="Syntech manual procurement">
              <div className="rounded-md border border-[#FEDF89] bg-[#FFFAEB] p-4">
                <p className="text-xs font-black uppercase text-[#B54708]">Manual procurement required</p>
                <h3 className="mt-1 text-lg font-black">Syntech automatic ordering is not yet enabled</h3>
                <p className="mt-2 text-sm font-semibold text-[#475467]">Place this order manually in the Syntech reseller portal, then record the supplier order reference.</p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <WorkflowCard step="1" title="Approve procurement" active={supplierOrder.status === "READY_FOR_APPROVAL"} done={["APPROVED", "ORDERED", "CONFIRMED", "SHIPPED", "DELIVERED"].includes(supplierOrder.status)}>Confirm the paid SupplierOrder is ready for manual procurement.</WorkflowCard>
                <WorkflowCard step="2" title="Place order manually" active={supplierOrder.status === "APPROVED"} done={["ORDERED", "CONFIRMED", "SHIPPED", "DELIVERED"].includes(supplierOrder.status)}>Use the Syntech reseller portal. TekCentral does not submit an API order from this state.</WorkflowCard>
                <WorkflowCard step="3" title="Record reference" active={supplierOrder.status === "APPROVED"} done={["ORDERED", "CONFIRMED", "SHIPPED", "DELIVERED"].includes(supplierOrder.status)}>Return here and record Syntech's supplier order reference.</WorkflowCard>
              </div>
              {supplierOrder.status === "READY_FOR_APPROVAL" && <button type="button" onClick={approve} disabled={!canApprove} className="mt-4 rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black disabled:opacity-50">Approve procurement</button>}
              {supplierOrder.status === "APPROVED" && <div className="mt-4 rounded-md border border-[#E4E7EC] bg-[#F6F7F9] p-4"><div className="grid gap-3 sm:grid-cols-2"><Input label="Syntech supplier order reference" value={manualOrder.supplierReference} onChange={(value) => setManualOrder((current) => ({ ...current, supplierReference: value }))} /><Input label="Internal note (optional)" value={manualOrder.note} onChange={(value) => setManualOrder((current) => ({ ...current, note: value }))} /></div><button type="button" onClick={markOrdered} disabled={!manualOrder.supplierReference.trim()} className="mt-3 rounded-md bg-[#0A0A0A] px-4 py-2 text-sm font-black text-white disabled:bg-[#E4E7EC] disabled:text-[#727986]">Record reference and mark ordered</button></div>}
              {supplierOrder.status === "ORDERED" && <p className="mt-4 rounded-md border border-[#ABEFC6] bg-[#ECFDF3] p-3 text-sm font-black text-[#067647]">Syntech manual order recorded as {supplierOrder.supplierOrderReference}.</p>}
            </Panel>
          )}

          {isSyntechOrder && syntechUatEnabled && (
            <Panel title="SYNTECH UAT OPERATIONS">
              <div className="grid gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#B9E2DB] bg-[#EFFFFB] p-4">
                  <div><p className="text-xs font-black uppercase text-[#176B5C]">UAT / TEST</p><h3 className="mt-1 text-lg font-black">Staff-controlled procurement</h3><p className="mt-1 text-sm font-semibold text-[#475467]">Refresh current SKU, cost, promotion, stock and address evidence before creating one unpaid Syntech UAT order.</p></div>
                  <AdminStatusBadge label={supplierOrder.externalSubmission?.status?.replace(/_/g, " ") ?? "NOT STARTED"} status={supplierOrder.externalSubmission?.status === "CREATED" ? "PAID" : supplierOrder.externalSubmission?.status === "UNKNOWN_RESULT" ? "FAILED" : "PENDING"} />
                </div>
                <label className="text-sm font-black">Fulfilment mode<select value={syntechShipping} onChange={(event) => { setSyntechShipping(event.target.value as typeof syntechShipping); setSyntechPreflight(undefined); }} className="mt-2 h-11 w-full rounded-md border border-[#D0D5DD] bg-white px-3 md:max-w-md"><option value="DELIVERY">Delivery to customer address</option><option value="COLLECTION_CPT">Collection: Cape Town</option><option value="COLLECTION_JHB">Collection: Johannesburg</option></select></label>
                {syntechPreflight && <div className="grid gap-3 rounded-md border border-[#E4E7EC] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-black">{syntechPreflight.status.replace(/_/g, " ")}</p><p className="text-xs font-semibold text-[#667085]">Checked {formatDateTime(syntechPreflight.checkedAt)}</p></div>
                  <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-xs font-bold text-[#667085]">External reference</dt><dd className="font-black break-all">{syntechPreflight.externalReference}</dd></div><div><dt className="text-xs font-bold text-[#667085]">Backorder</dt><dd className="font-black">NO</dd></div><div><dt className="text-xs font-bold text-[#667085]">Estimated products</dt><dd className="font-black">{formatCurrency(syntechPreflight.estimatedProductCostZar)}</dd></div><div><dt className="text-xs font-bold text-[#667085]">Environment</dt><dd className="font-black">UAT / TEST</dd></div></dl>
                  {syntechPreflight.lines.map((line) => <div key={line.productId} className="rounded-md bg-[#F6F7F9] p-3 text-xs font-semibold text-[#475467]"><p className="font-black text-[#101828]">{line.description}</p><p className="mt-1">Syntech SKU {line.supplierSku} · Qty {line.quantity} · Current cost {formatCurrency(line.unitCostZar)} · Stock CPT {line.branchStock.CPT ?? "-"} / JHB {line.branchStock.JHB ?? "-"} / DBN {line.branchStock.DBN ?? "-"}</p><p className="mt-1">Promotion {line.promotionActive ? "active" : "inactive"} · Evidence {formatDateTime(line.observedAt)}</p></div>)}
                  {syntechPreflight.warnings.map((warning) => <p key={warning} className="rounded-md border border-[#FEDF89] bg-[#FFFAEB] p-3 text-sm font-semibold text-[#B54708]">{warning}</p>)}
                  {syntechPreflight.blockers.map((blocker) => <p key={blocker} className="rounded-md border border-[#FECDCA] bg-[#FEF3F2] p-3 text-sm font-semibold text-[#B42318]">{blocker}</p>)}
                </div>}
                <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void prepareSyntechOrder()} disabled={syntechBusy || supplierOrder.externalSubmission?.status === "CREATED" || supplierOrder.externalSubmission?.status === "UNKNOWN_RESULT"} className="rounded-md border border-[#D0D5DD] bg-white px-4 py-2 text-sm font-black disabled:opacity-50">{syntechBusy ? "Checking..." : "Refresh evidence"}</button><button type="button" onClick={() => void createSyntechOrder()} disabled={syntechBusy || syntechPreflight?.status !== "READY_FOR_CONTROLLED_UAT" || supplierOrder.externalSubmission?.status === "CREATED" || supplierOrder.externalSubmission?.status === "UNKNOWN_RESULT"} className="rounded-md bg-[#101828] px-4 py-2 text-sm font-black text-white disabled:bg-[#E4E7EC] disabled:text-[#667085]">Create Syntech UAT order</button></div>
                <p className="text-xs font-semibold text-[#667085]">Syntech pricing is authoritative at creation. Shipping fees may be added by Syntech and are not estimated here. This action never pays the supplier or advances customer fulfilment.</p>
                {supplierOrder.externalSubmission?.externalOrderNumber && <p className="rounded-md border border-[#ABEFC6] bg-[#ECFDF3] p-3 text-sm font-black text-[#067647]">Syntech sales order: {supplierOrder.externalSubmission.externalOrderNumber}</p>}
                {supplierOrder.externalSubmission?.status === "UNKNOWN_RESULT" && <p className="rounded-md border border-[#FECDCA] bg-[#FEF3F2] p-3 text-sm font-black text-[#B42318]">Result unknown. Do not retry. Investigate the stable external reference with Syntech before any further create attempt.</p>}
                {supplierOrder.externalSubmission?.status === "FAILED" && supplierOrder.status === "APPROVED" && <div className="rounded-md border border-[#FEDF89] bg-[#FFFAEB] p-4"><p className="text-xs font-black uppercase tracking-[0.12em] text-[#B54708]">Procurement action required</p><p className="mt-1 text-sm font-black text-[#B54708]">Supplier submission failed. Manual procurement remains available.</p><p className="mt-1 text-xs font-semibold text-[#475467]">{supplierOrder.externalSubmission.lastErrorCode === "RC3" ? "Syntech could not resolve the reseller accounting account. Do not retry the API submission. Place the order through the approved manual reseller-portal process and record the Syntech reference, or wait for Syntech account configuration to be corrected." : "Review the safe diagnostic. Correct the issue before an explicit retry, or use the approved manual reseller-portal process and record its reference."}</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><Input label="Syntech supplier order reference" value={manualOrder.supplierReference} onChange={(value) => setManualOrder((current) => ({ ...current, supplierReference: value }))} /><Input label="Internal note (optional)" value={manualOrder.note} onChange={(value) => setManualOrder((current) => ({ ...current, note: value }))} /></div><button type="button" onClick={markOrdered} disabled={!manualOrder.supplierReference.trim()} className="mt-3 rounded-md bg-[#0A0A0A] px-4 py-2 text-sm font-black text-white disabled:bg-[#E4E7EC] disabled:text-[#727986]">Record manual Syntech reference</button></div>}
              </div>
            </Panel>
          )}

          {isCjOrder && (
            <Panel title="REAL CJ OPERATIONS">
              <div className="grid gap-4">
                <div className="rounded-md border border-[var(--tek-accent)] bg-[#EFFFFB] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-[#14584E]">Next action</p>
                  <h3 className="mt-1 text-lg font-black">{cjNextActionTitle}</h3>
                  <p className="mt-1 text-sm font-semibold text-[#3F4652]">{cjNextActionDetail}</p>
                  {cjNeedsDeliveryChoice && cjPreflight && (
                    <label className="mt-4 block text-sm font-black">
                      Choose delivery method
                      <select
                        value={selectedLogisticsKey}
                        onChange={(event) => {
                          const value = event.target.value;
                          setSelectedLogisticsKey(value);
                          const option = cjPreflight.logisticsOptions.find(
                            (item) => `${item.fromCountryCode}::${item.logisticName}` === value,
                          );
                          if (option) void prepareCjOrder(option);
                        }}
                        className="mt-2 h-11 w-full rounded-md border border-[#B9E2DB] bg-white px-3"
                      >
                        <option value="">Select CJ logistics</option>
                        {cjPreflight.logisticsOptions.map((option) => (
                          <option key={`${option.fromCountryCode}::${option.logisticName}`} value={`${option.fromCountryCode}::${option.logisticName}`}>
                            {deliveryOptionLabel(option)} · {routeRequirementLabel(option.logisticName)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {cjPreflight?.selectionMode === "AUTO" && cjPreflight.selectedLogistics && (
                    <p className="mt-3 rounded-md border border-[#B9E2DB] bg-white p-3 text-xs font-black text-[#14584E]">
                      Automatically selected: {cjPreflight.selectedLogistics.logisticName}
                    </p>
                  )}
                  {cjReadyForCreate && cjPreflight?.selectedLogistics && (
                    <div className="mt-4 rounded-md bg-white p-3">
                      <p className="text-sm font-black">Selected method</p>
                      <p className="mt-1 text-sm font-semibold text-[#3F4652]">{deliveryOptionLabel(cjPreflight.selectedLogistics)}</p>
                      <div className="mt-3 grid gap-2 text-sm font-semibold text-[#3F4652] sm:grid-cols-3">
                        <p>Products: <span className="font-black">{formatSupplierAmount(cjPreflight.supplierProductAmount, cjPreflight.currency)}</span></p>
                        <p>Shipping: <span className="font-black">{formatSupplierAmount(cjPreflight.supplierShippingAmount, cjPreflight.currency)}</span></p>
                        <p>Total: <span className="font-black">{formatSupplierAmount(cjPreflight.supplierTotalAmount, cjPreflight.currency)}</span></p>
                      </div>
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {!cjPreflight && (
                      <button type="button" onClick={() => prepareCjOrder()} disabled={!canPrepareCj || cjBusy} className="rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black text-[var(--tek-accent-ink)] disabled:cursor-not-allowed disabled:bg-[#E4E7EC] disabled:text-[#727986]">
                        {cjBusy ? "Checking CJ stock and logistics..." : "Run CJ Preflight"}
                      </button>
                    )}
                    {cjPreflight && !canCreateCj && (
                      <button type="button" onClick={() => prepareCjOrder(selectedLogistics)} disabled={!canPrepareCj || cjBusy} className="rounded-md border border-[#B9E2DB] bg-white px-4 py-2 text-sm font-black disabled:cursor-not-allowed disabled:bg-[#E4E7EC] disabled:text-[#727986]">
                        {cjBusy ? "Checking CJ stock and logistics..." : selectedLogistics ? "Review CJ Order" : "Refresh Preflight"}
                      </button>
                    )}
                    <button type="button" onClick={createCjOrder} disabled={!canCreateCj || cjBusy} className="rounded-md bg-[#0A0A0A] px-4 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-[#E4E7EC] disabled:text-[#727986]">
                      Create CJ Order
                    </button>
                    <button type="button" onClick={generateCjPricingProposal} disabled={!cjReadyForCreate || supplierOrder.itemLines.length !== 1 || cjBusy} className="rounded-md border border-[#469D8B] bg-white px-4 py-2 text-sm font-black text-[#176B5C] disabled:cursor-not-allowed disabled:border-[#E4E7EC] disabled:text-[#727986]">
                      Generate pricing proposal
                    </button>
                  </div>
                  {cjPreflight && !cjPreflight.featureEnabled && (
                    <p className="mt-3 rounded-md border border-[#FEDF89] bg-[#FFFAEB] p-3 text-xs font-black text-[#B54708]">
                      Real CJ order creation disabled.
                    </p>
                  )}
                </div>

                <div className="grid gap-3 lg:grid-cols-3">
                  <WorkflowCard step="1" title="Choose delivery" active={!cjPreflight || cjNeedsDeliveryChoice} done={Boolean(cjPreflight?.selectedLogistics)}>
                    {cjPreflight?.selectedLogistics ? deliveryOptionLabel(cjPreflight.selectedLogistics) : cjHasMethods ? "Select a CJ-returned method above." : "Run preflight to fetch CJ delivery methods."}
                  </WorkflowCard>
                  <WorkflowCard step="2" title="Review CJ cost" active={Boolean(selectedLogistics && !cjReadyForCreate)} done={cjReadyForCreate}>
                    {cjPreflight ? `Total ${formatSupplierAmount(cjPreflight.supplierTotalAmount, cjPreflight.currency)}` : "Cost appears after delivery review."}
                  </WorkflowCard>
                  <WorkflowCard step="3" title="Create CJ order" active={canCreateCj} done={supplierOrder.externalSubmission?.status === "CREATED"}>
                    Creates one unpaid CJ supplier order after confirmation.
                  </WorkflowCard>
                </div>

                <div className="rounded-md border border-[#E4E7EC] bg-[#F6F7F9] p-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-black">
                        {supplierOrder.externalSubmission?.status
                          ? supplierOrder.externalSubmission.status.replace(/_/g, " ")
                          : "Not prepared"}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-[#727986]">
                        Creating a CJ order sends an unpaid external supplier order. It does not pay CJ or fulfil the customer order.
                      </p>
                      {supplierOrder.externalSubmission?.externalOrderNumber && (
                        <p className="mt-2 text-xs font-black text-[#3F4652]">
                          CJ order: {supplierOrder.externalSubmission.externalOrderNumber}
                        </p>
                      )}
                      {supplierOrder.externalSubmission?.externalStatus && (
                        <p className="mt-1 text-xs font-semibold text-[#727986]">
                          CJ status: {supplierOrder.externalSubmission.externalStatus}
                        </p>
                      )}
                      {supplierOrder.externalSubmission?.lastSyncedAt && (
                        <p className="mt-1 text-xs font-semibold text-[#727986]">
                          Last synced: {formatDateTime(supplierOrder.externalSubmission.lastSyncedAt)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => runCjReadAction("reconcile", "CJ reconciliation completed.")} disabled={!canReconcileCj || cjBusy} className="rounded-md border border-[#E4E7EC] bg-white px-3 py-2 text-xs font-black disabled:cursor-not-allowed disabled:text-[#727986]">
                        Reconcile
                      </button>
                      <button type="button" onClick={() => runCjReadAction("refresh-status", "CJ status refreshed.")} disabled={!canRefreshCjStatus || cjBusy} className="rounded-md border border-[#E4E7EC] bg-white px-3 py-2 text-xs font-black disabled:cursor-not-allowed disabled:text-[#727986]">
                        Refresh CJ Status
                      </button>
                    </div>
                  </div>
                </div>

                {cjPreflight && (
                  <div className="grid gap-4 rounded-md border border-[#E4E7EC] p-4">
                    {supplierOrder.cjOperations?.attention?.active && (
                      <div className="rounded-md border border-[#FEDF89] bg-[#FFFAEB] p-4">
                        <p className="text-sm font-black text-[#B54708]">Action required before CJ fulfilment</p>
                        <p className="mt-1 text-sm font-semibold text-[#3F4652]">
                          The customer has already paid, but CJ fulfilment cannot continue with the currently available shipping options.
                        </p>
                        <p className="mt-2 text-xs font-black text-[#B54708]">
                          Provide the required recipient information or select another shipping method.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <a href="#cj-consignee-id" className="rounded-md bg-white px-3 py-2 text-xs font-black text-[#0A0A0A]">
                            Enter consignee ID
                          </a>
                          <button type="button" onClick={() => prepareCjOrder()} disabled={!canPrepareCj || cjBusy} className="rounded-md border border-[#FEDF89] bg-white px-3 py-2 text-xs font-black disabled:cursor-not-allowed disabled:text-[#727986]">
                            Choose another shipping method
                          </button>
                        </div>
                      </div>
                    )}
                    {cjPreflight.customerShipping && (
                      <div>
                        <p className="text-sm font-black">Customer delivery</p>
                        <p className="mt-1 text-sm font-semibold text-[#3F4652]">
                          {cjPreflight.customerShipping.customerName}, {cjPreflight.customerShipping.address}
                          {cjPreflight.customerShipping.address2 ? `, ${cjPreflight.customerShipping.address2}` : ""},{" "}
                          {cjPreflight.customerShipping.city}, {cjPreflight.customerShipping.province},{" "}
                          {cjPreflight.customerShipping.postalCode}, {cjPreflight.customerShipping.countryCode}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-[#727986]">
                          Phone: {cjPreflight.customerShipping.phone}
                        </p>
                        {cjPreflight.recipientValidation && (
                          <div className="mt-3 grid gap-2 text-xs font-semibold text-[#3F4652] sm:grid-cols-2">
                            <div className="rounded-md border border-[#E4E7EC] bg-[#F6F7F9] p-3">
                              <p className="font-black">Phone</p>
                              <p className={recipientReadinessClass(cjPreflight, "phone")}>
                                {recipientReadinessLabel(cjPreflight, "phone")}
                              </p>
                            </div>
                            <div className="rounded-md border border-[#E4E7EC] bg-[#F6F7F9] p-3">
                              <p className="font-black">Consignee ID</p>
                              <p className={recipientReadinessClass(cjPreflight, "consigneeId")}>
                                {recipientReadinessLabel(cjPreflight, "consigneeId")}
                              </p>
                            </div>
                          </div>
                        )}
                        <div id="cj-consignee-id" className="mt-3 rounded-md border border-[#E4E7EC] bg-[#F6F7F9] p-3">
                          <p className="text-sm font-black">Operational consignee ID</p>
                          <p className="mt-1 text-xs font-semibold text-[#727986]">
                            {supplierOrder.cjOperations?.recipientInfo?.consigneeIdMasked
                              ? `Provided (${supplierOrder.cjOperations.recipientInfo.consigneeIdMasked})`
                              : "Not stored for this supplier order."}
                          </p>
                          {supplierOrder.cjOperations?.recipientInfo?.invalidReason && (
                            <p className="mt-1 text-xs font-black text-[#B54708]">{supplierOrder.cjOperations.recipientInfo.invalidReason}</p>
                          )}
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                            <input
                              value={consigneeIdInput}
                              onChange={(event) => setConsigneeIdInput(event.target.value)}
                              placeholder="13-digit consignee ID"
                              className="h-10 min-w-0 flex-1 rounded-md border border-[#D0D5DD] bg-white px-3 text-sm font-semibold"
                            />
                            <button type="button" onClick={saveConsigneeId} disabled={cjBusy || !consigneeIdInput.trim()} className="rounded-md bg-[#0A0A0A] px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-[#E4E7EC] disabled:text-[#727986]">
                              Save
                            </button>
                            {supplierOrder.cjOperations?.recipientInfo?.consigneeIdMasked && (
                              <button type="button" onClick={removeConsigneeId} disabled={cjBusy} className="rounded-md border border-[#E4E7EC] bg-white px-3 py-2 text-xs font-black disabled:cursor-not-allowed disabled:text-[#727986]">
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-black">CJ items</p>
                      <div className="mt-2 divide-y divide-[#E4E7EC]">
                        {cjPreflight.lines.map((line) => (
                          <div key={line.orderItemId} className="py-2 text-sm">
                            <p className="font-black">{line.tekcentralProduct} x{line.quantity}</p>
                            <p className="mt-1 text-xs font-semibold text-[#727986]">
                              {line.cjProductName ?? line.cjProductId} · Product {line.cjProductSku} · Variant {line.cjVariantSku}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                    {cjPreflight.blockers.length > 0 && (
                      <div className="rounded-md border border-[#FEDF89] bg-[#FFFAEB] p-3">
                        <p className="text-sm font-black">Preflight blocked</p>
                        <ul className="mt-2 space-y-1 text-xs font-semibold text-[#B54708]">
                          {cjPreflight.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                        </ul>
                        {cjPreflight.logisticsOptions.length === 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Link to="/admin/suppliers/cj" className="rounded-md bg-white px-3 py-2 text-xs font-black text-[#0A0A0A]">
                              Choose another variant
                            </Link>
                            <Link to="/admin/suppliers/cj/imported" className="rounded-md border border-[#FEDF89] bg-white px-3 py-2 text-xs font-black text-[#0A0A0A]">
                              Back to CJ catalogue
                            </Link>
                            <button type="button" onClick={() => prepareCjOrder()} disabled={!canPrepareCj || cjBusy} className="rounded-md border border-[#FEDF89] bg-white px-3 py-2 text-xs font-black disabled:cursor-not-allowed disabled:text-[#727986]">
                              Refresh preflight
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <details className="rounded-md border border-[#E4E7EC] p-3">
                      <summary className="cursor-pointer text-sm font-black">Developer details</summary>
                      {cjPreflight.diagnostics && (
                        <div className="mt-3 rounded-md bg-[#F6F7F9] p-3">
                          <p className="text-sm font-black">CJ logistics check</p>
                          <div className="mt-2 grid gap-2 text-xs font-semibold text-[#3F4652] sm:grid-cols-2">
                            <p>Destination: {cjPreflight.diagnostics.destinationCountryCode ?? "Not resolved"}</p>
                            <p>Items: {cjPreflight.diagnostics.itemCount ?? cjPreflight.lines.length}</p>
                            <p>Postal code: {cjPreflight.diagnostics.postalCodePresent ? "Present" : "Missing"}</p>
                            <p>Source: {cjPreflight.diagnostics.sourceCountries?.join(", ") || "Not resolved"}</p>
                          </div>
                          {cjPreflight.diagnostics.responseMessage && (
                            <p className="mt-2 text-xs font-black text-[#B54708]">
                              CJ response: {cjPreflight.diagnostics.responseMessage}
                            </p>
                          )}
                        </div>
                      )}
                      {Boolean(cjPreflight.payloadPreview) && (
                        <pre className="mt-3 max-h-[260px] overflow-auto rounded-md bg-[#0A0A0A] p-3 text-xs leading-5 text-white">
                          {JSON.stringify(cjPreflight.payloadPreview, null, 2)}
                        </pre>
                      )}
                    </details>
                  </div>
                )}
              </div>
            </Panel>
          )}

          {import.meta.env.DEV && !isTekCentralOrder && (
            <>
              <Panel title="MOCK SUPPLIER TESTING">
                {isCjOrder && (
                  <p className="mb-4 rounded-md border border-[#E4E7EC] bg-[#F6F7F9] p-3 text-xs font-semibold text-[#727986]">
                    Mock controls are secondary for CJ API supplier orders. Use Real CJ Operations for the live unpaid CJ order flow.
                  </p>
                )}
                {mappingRequired && (
                  <div className="mb-4 rounded-md border border-[#FEDF89] bg-[#FFFAEB] p-3">
                    <p className="text-sm font-black text-[#0A0A0A]">Supplier SKU required</p>
                    <p className="mt-1 text-xs font-semibold text-[#B54708]">
                      {supplierOrder.supplierCode === "CJ"
                        ? "Verify a CJ API mapping for every line before approval or mock submission."
                        : "Map every supplier SKU before approval or mock submission."}
                    </p>
                  </div>
                )}
                <div className="grid gap-3 md:grid-cols-[220px_1fr]">
                  <label className="text-sm font-black">
                    Scenario
                    <select
                      value={scenario}
                      onChange={(event) => setScenario(event.target.value as MockSupplierScenario)}
                      className="mt-2 h-11 w-full rounded-md border border-[#E4E7EC] px-3"
                    >
                      {mockSupplierScenarios.map((item) => (
                        <option key={item} value={item}>
                          {item.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex flex-wrap items-end gap-2">
                    <button type="button" onClick={approve} disabled={!canApprove} className="rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black text-[var(--tek-accent-ink)] disabled:cursor-not-allowed disabled:bg-[#E4E7EC] disabled:text-[#727986]">
                      Approve
                    </button>
                    <button type="button" onClick={mockSubmit} disabled={!canMockSubmit} className="rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black text-[var(--tek-accent-ink)] disabled:cursor-not-allowed disabled:bg-[#E4E7EC] disabled:text-[#727986]">
                      Mock Submit
                    </button>
                    <button type="button" onClick={applyOutcome} disabled={!canApplyOutcome} className="rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black text-[var(--tek-accent-ink)] disabled:cursor-not-allowed disabled:bg-[#E4E7EC] disabled:text-[#727986]">
                      Apply Mock Outcome
                    </button>
                    <button type="button" onClick={reject} disabled={!canReject} className="rounded-md border border-[#FDA29B] px-4 py-2 text-sm font-black text-[#B42318] disabled:cursor-not-allowed disabled:border-[#E4E7EC] disabled:text-[#727986]">
                      Reject
                    </button>
                  </div>
                </div>
                <p className="mt-3 text-xs font-semibold text-[#727986]">
                  These controls only update local mock supplier records. No email, API, portal, courier or supplier request is sent.
                </p>
              </Panel>

              <Panel title="Mock dispatch">
                {!canDispatch && (
                  <p className="mb-4 rounded-md bg-[#F6F7F9] p-3 text-xs font-semibold text-[#727986]">
                    Dispatch is available after supplier confirmation and requires courier, tracking number and dispatch date.
                  </p>
                )}
                <form onSubmit={submitDispatch} className="grid gap-3 md:grid-cols-2">
                  <Input label="Courier" value={dispatch.courier} onChange={(value) => setDispatch((current) => ({ ...current, courier: value }))} />
                  <Input label="Tracking Number" value={dispatch.trackingNumber} onChange={(value) => setDispatch((current) => ({ ...current, trackingNumber: value }))} />
                  <Input label="Tracking URL" value={dispatch.trackingUrl} onChange={(value) => setDispatch((current) => ({ ...current, trackingUrl: value }))} />
                  <Input label="Dispatch Date" type="date" value={dispatch.dispatchedAt} onChange={(value) => setDispatch((current) => ({ ...current, dispatchedAt: value }))} />
                  <button type="submit" disabled={!canDispatch} className="w-fit rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black text-[var(--tek-accent-ink)] disabled:cursor-not-allowed disabled:bg-[#E4E7EC] disabled:text-[#727986]">
                    Mark Supplier Dispatched
                  </button>
                </form>
              </Panel>
            </>
          )}
        </div>

        <aside className="space-y-6">
          {!isCjOrder && !isTekCentralOrder && (
            <Panel title="Payload preview">
              {mappingRequired && (
                <div className="mb-3 rounded-md border border-[#FEDF89] bg-[#FFFAEB] p-3">
                  <p className="text-sm font-black text-[#0A0A0A]">Payload not ready</p>
                  <p className="mt-1 text-xs font-semibold text-[#B54708]">
                    Supplier SKU mapping is incomplete.
                  </p>
                </div>
              )}
              <pre className="max-h-[420px] overflow-auto rounded-md bg-[#0A0A0A] p-3 text-xs leading-5 text-white">
                {JSON.stringify(payloadPreview, null, 2)}
              </pre>
            </Panel>
          )}
          <Panel title="Activity timeline">
            <div className="space-y-3">
              {supplierOrder.events.map((entry) => (
                <article key={`${entry.timestamp}-${entry.type}`} className="border-l-2 border-[var(--tek-accent)] pl-3">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-[#727986]">
                    {entry.type.replace(/_/g, " ")}
                  </p>
                  <p className="mt-1 text-sm font-semibold">{entry.description}</p>
                  <p className="mt-1 text-xs font-semibold text-[#727986]">
                    {formatDateTime(entry.timestamp)}
                  </p>
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
      <h2 className="text-sm font-black uppercase tracking-[0.12em] text-[#727986]">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function WorkflowCard({
  step,
  title,
  active,
  done,
  children,
}: {
  step: string;
  title: string;
  active?: boolean;
  done?: boolean;
  children: ReactNode;
}) {
  return (
    <article
      className={`rounded-md border p-3 ${
        done
          ? "border-[#B9E2DB] bg-[#EFFFFB]"
          : active
            ? "border-[var(--tek-accent)] bg-white"
            : "border-[#E4E7EC] bg-[#F6F7F9]"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-black ${
            done
              ? "bg-[var(--tek-accent)] text-[var(--tek-accent-ink)]"
              : active
                ? "bg-[#0A0A0A] text-white"
                : "bg-white text-[#727986]"
          }`}
        >
          {done ? "OK" : step}
        </span>
        <p className="text-sm font-black">{title}</p>
      </div>
      <p className="mt-2 text-xs font-semibold text-[#727986]">{children}</p>
    </article>
  );
}

function deliveryOptionLabel(option: CjOrderPreflight["logisticsOptions"][number]) {
  const parts = [
    option.logisticName,
    `from ${option.fromCountryCode}`,
    option.shippingCost !== undefined ? formatSupplierAmount(option.shippingCost, option.currency) : undefined,
    "estimatedDelivery" in option && option.estimatedDelivery ? option.estimatedDelivery : undefined,
  ];
  return parts.filter(Boolean).join(" · ");
}

function routeRequirementLabel(logisticName: string) {
  if (["CJPacket Liquid Line", "CJPacket Sensitive", "CJPacket Postal"].includes(logisticName)) {
    return "Consignee ID required";
  }
  if (["PostNL", "DHL Official"].includes(logisticName)) return "No ID required";
  return "Requirement unknown";
}

function recipientReadinessLabel(preflight: CjOrderPreflight, field: "phone" | "consigneeId") {
  const validation = preflight.recipientValidation?.[field];
  if (!validation) return "Not required";
  if (field === "phone") return validation.status === "READY" ? "Ready" : "Needs correction";
  const consigneeValidation = preflight.recipientValidation?.consigneeId;
  if (!consigneeValidation) return "Not required";
  if (validation.status === "READY") {
    return `Ready${consigneeValidation.maskedValue ? ` (${consigneeValidation.maskedValue})` : ""}`;
  }
  if (validation.status === "NOT_REQUIRED") return "Not required";
  if (validation.status === "UNKNOWN") return "Requirement not yet confirmed";
  if (preflight.recipientRequirements?.consigneeId === "REQUIRED") return "Required by selected CJ route";
  return "Needs correction";
}

function recipientReadinessClass(preflight: CjOrderPreflight, field: "phone" | "consigneeId") {
  const status = preflight.recipientValidation?.[field]?.status;
  if (status === "READY" || status === "NOT_REQUIRED") return "mt-1 text-[#14584E]";
  if (status === "UNKNOWN") return "mt-1 text-[#727986]";
  return "mt-1 text-[#B54708]";
}

function formatSupplierAmount(value?: number, currency?: string) {
  if (value === undefined) return "Not confirmed";
  return `${currency ?? ""} ${value.toFixed(2)}`.trim();
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

import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PaymentStatusNotice } from "@/components/commerce/PaymentStatusNotice";
import { apiRequest } from "@/lib/api";
import { paymentStatusLabels } from "@/lib/order-status";
import {
  clearPayfastCartSnapshot,
  readPayfastCartSnapshot,
} from "@/lib/payfast-cart";
import { usePageTitle } from "@/lib/page-title";
import { useCart } from "@/state/cart";
import { useOrders } from "@/state/orders";
import type { PaymentStatus } from "@/types/order";

interface PaymentStatusResponse {
  orderNumber: string;
  orderStatus: string;
  paymentStatus: PaymentStatus;
}

export function PayfastReturnPage() {
  usePageTitle("Confirming payment | TekCentral");
  const [params] = useSearchParams();
  const orderNumber = params.get("order") ?? "";
  const { clearCart, restoreCart } = useCart();
  const { updatePaymentStatus } = useOrders();
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("PENDING");
  const [statusUnavailable, setStatusUnavailable] = useState(!orderNumber);

  const checkStatus = useCallback(async () => {
    if (!orderNumber) {
      setStatusUnavailable(true);
      return;
    }
    try {
      const response = await apiRequest<PaymentStatusResponse>(
        `/api/payments/${encodeURIComponent(orderNumber)}/status`,
      );
      setStatusUnavailable(false);
      setPaymentStatus(response.paymentStatus);
      updatePaymentStatus(orderNumber, response.paymentStatus);
      if (response.paymentStatus === "PAID") {
        clearCart();
        clearPayfastCartSnapshot(orderNumber);
        window.localStorage.removeItem("tekcentral-checkout-draft-v1");
      } else {
        const snapshot = readPayfastCartSnapshot(orderNumber);
        if (snapshot.length > 0) restoreCart(snapshot);
      }
    } catch (error) {
      console.error(error);
      setStatusUnavailable(true);
    }
  }, [clearCart, orderNumber, restoreCart, updatePaymentStatus]);

  useEffect(() => {
    if (!orderNumber) return;

    let cancelled = false;
    const safeCheckStatus = async () => {
      if (!cancelled) await checkStatus();
    };

    safeCheckStatus();
    const interval = window.setInterval(safeCheckStatus, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [checkStatus, orderNumber]);

  const paid = paymentStatus === "PAID";
  const failed = paymentStatus === "FAILED";
  const cancelledPayment = paymentStatus === "CANCELLED";
  const title = statusUnavailable
    ? "Payment status is not available yet"
    : paid
      ? "Payment confirmed"
      : cancelledPayment
        ? "Payment cancelled"
        : failed
          ? "Payment could not be completed"
          : "Confirming your payment";
  const message = statusUnavailable
    ? "We couldn't refresh this payment status right now."
    : paid
      ? "Your PayFast payment has been confirmed and your order is ready for processing."
      : cancelledPayment
        ? "Your PayFast payment was cancelled. Your order is still saved and you can try again."
        : failed
          ? "PayFast did not confirm this payment. You can try again from your order."
          : "We're waiting for confirmation from PayFast.";

  return (
    <section className="bg-[#F6F7F9] px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-lg border border-[#E4E7EC] bg-white p-6 shadow-sm sm:p-8">
        <p className="mt-6 text-sm font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">
          PayFast
        </p>
        <h1 className="mt-3 text-3xl font-black text-[#0A0A0A]">Payment status</h1>
        {orderNumber && (
          <p className="mt-3 text-sm font-semibold text-[#727986]">
            Order {orderNumber} | {paymentStatusLabels[paymentStatus]}
          </p>
        )}
        <PaymentStatusNotice
          className="mt-6"
          variant={
            statusUnavailable ? "warning" : paid ? "success" : failed ? "error" : "pending"
          }
          loading={!statusUnavailable && paymentStatus === "PENDING"}
          title={title}
          message={message}
          helper={
            statusUnavailable
              ? "You can refresh the status or view the order."
              : paid
                ? undefined
                : "This usually takes a few moments. You can safely stay on this page while we check."
          }
          actions={
            <>
              <Link
                to={paid ? `/order/${orderNumber}/confirmation` : `/order/${orderNumber}`}
                className="inline-flex justify-center rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black text-[var(--tek-accent-ink)]"
              >
                {paid ? "View Confirmation" : "View Order"}
              </Link>
              {!paid && (
                <Link
                  to="/orders"
                  className="inline-flex justify-center rounded-md border border-[#E4E7EC] bg-white px-4 py-2 text-sm font-black text-[#0A0A0A]"
                >
                  View Orders
                </Link>
              )}
              {!paid && (
                <button
                  type="button"
                  onClick={checkStatus}
                  className="inline-flex justify-center rounded-md border border-[#E4E7EC] bg-white px-4 py-2 text-sm font-black text-[#0A0A0A]"
                >
                  Refresh Status
                </button>
              )}
            </>
          }
        />
      </div>
    </section>
  );
}

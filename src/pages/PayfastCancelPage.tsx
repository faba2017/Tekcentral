import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PaymentStatusNotice } from "@/components/commerce/PaymentStatusNotice";
import { apiRequest } from "@/lib/api";
import { readPayfastCartSnapshot } from "@/lib/payfast-cart";
import { usePageTitle } from "@/lib/page-title";
import { useCart } from "@/state/cart";
import { useOrders } from "@/state/orders";

export function PayfastCancelPage() {
  usePageTitle("Payment cancelled | TekCentral");
  const [params] = useSearchParams();
  const orderNumber = params.get("order") ?? "";
  const { restoreCart } = useCart();
  const { updatePaymentStatus } = useOrders();
  const [statusUpdated, setStatusUpdated] = useState(false);

  useEffect(() => {
    if (!orderNumber) return;
    apiRequest<{ paymentStatus: "CANCELLED" }>("/api/payments/payfast/cancel", {
      method: "POST",
      body: JSON.stringify({ orderNumber }),
    })
      .then(() => {
        updatePaymentStatus(orderNumber, "CANCELLED");
        setStatusUpdated(true);
      })
      .catch((error) => {
        console.error(error);
      });
    const snapshot = readPayfastCartSnapshot(orderNumber);
    if (snapshot.length > 0) restoreCart(snapshot);
  }, [orderNumber, restoreCart, updatePaymentStatus]);

  return (
    <section className="bg-[#F6F7F9] px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-lg border border-[#E4E7EC] bg-white p-6 shadow-sm sm:p-8">
        <p className="mt-6 text-sm font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">
          PayFast
        </p>
        <h1 className="mt-3 text-3xl font-black text-[#0A0A0A]">Payment cancelled</h1>
        <PaymentStatusNotice
          className="mt-6"
          variant="warning"
          title="Payment cancelled"
          message="Your PayFast payment was cancelled. Your order is still saved and you can try again."
          helper={
            statusUpdated
              ? "The payment status has been updated."
              : "Your order remains available while the payment status updates."
          }
          actions={
            <>
              {orderNumber && (
                <Link
                  to={`/order/${orderNumber}`}
                  className="inline-flex justify-center rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black text-[var(--tek-accent-ink)]"
                >
                  Try PayFast Again
                </Link>
              )}
              {orderNumber && (
                <Link
                  to={`/order/${orderNumber}`}
                  className="inline-flex justify-center rounded-md border border-[#E4E7EC] bg-white px-4 py-2 text-sm font-black text-[#0A0A0A]"
                >
                  View Order
                </Link>
              )}
              <Link
                to="/shop"
                className="inline-flex justify-center rounded-md border border-[#E4E7EC] bg-white px-4 py-2 text-sm font-black text-[#0A0A0A]"
              >
                Continue Shopping
              </Link>
            </>
          }
        />
      </div>
    </section>
  );
}

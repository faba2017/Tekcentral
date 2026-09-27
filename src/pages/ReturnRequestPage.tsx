import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FiMinus, FiPlus, FiRefreshCw } from "react-icons/fi";
import { apiRequest } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { canRequestReturn } from "@/lib/order-status";
import { usePageTitle } from "@/lib/page-title";
import { useOrders } from "@/state/orders";
import type { ReturnRequestItem } from "@/types/order";

const returnReasons = [
  "Incorrect item",
  "Damaged",
  "Faulty",
  "Not as expected",
  "No longer required",
  "Other",
];

export function ReturnRequestPage() {
  usePageTitle("Request return | TekCentral");
  const { orderNumber = "" } = useParams();
  const navigate = useNavigate();
  const { getOrder, createReturnRequest, saveOrderMirror } = useOrders();
  const localOrder = getOrder(orderNumber);
  const [backendOrder, setBackendOrder] = useState(localOrder);
  const [loading, setLoading] = useState(Boolean(orderNumber));
  const order = backendOrder ?? localOrder;
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState(returnReasons[0]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const returnedQuantities = useMemo(() => {
    const totals: Record<string, number> = {};
    order?.returns.forEach((returnRequest) => {
      returnRequest.items.forEach((item) => {
        totals[item.productId] = (totals[item.productId] ?? 0) + item.quantity;
      });
    });
    return totals;
  }, [order]);

  useEffect(() => {
    if (!orderNumber) {
      return;
    }
    apiRequest<{ order: NonNullable<typeof localOrder> }>(
      `/api/orders/${encodeURIComponent(orderNumber)}`,
    )
      .then((response) => {
        setBackendOrder(response.order);
        saveOrderMirror(response.order);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [orderNumber, saveOrderMirror]);

  if (!order && loading) {
    return (
      <section className="bg-white px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-lg border border-[#E4E7EC] bg-white p-8 text-center text-sm font-semibold text-[#727986] shadow-sm">
          Loading order...
        </div>
      </section>
    );
  }

  if (!order) {
    return (
      <section className="bg-white px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-lg border border-[#E4E7EC] bg-white p-8 text-center shadow-sm">
          <h1 className="text-3xl font-black text-[#0A0A0A]">Order not found.</h1>
          <Link
            to="/orders"
            className="mt-6 inline-flex rounded-md bg-[var(--tek-accent)] px-5 py-3 text-sm font-black text-[var(--tek-accent-ink)]"
          >
            View Orders
          </Link>
        </div>
      </section>
    );
  }

  const eligible = canRequestReturn(order.status);

  const updateQuantity = (productId: string, nextQuantity: number, maxQuantity: number) => {
    setQuantities((current) => ({
      ...current,
      [productId]: Math.max(0, Math.min(maxQuantity, nextQuantity)),
    }));
  };

  const selectedItems: ReturnRequestItem[] = order.items
    .map((item) => {
      const quantity = quantities[item.productId] ?? 0;
      return quantity > 0
        ? {
            productId: item.productId,
            name: item.name,
            quantity,
            unitPrice: item.unitPrice,
            lineTotal: quantity * item.unitPrice,
          }
        : null;
    })
    .filter((item): item is ReturnRequestItem => Boolean(item));

  const submitReturn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!eligible) {
      setError("This order is not currently eligible for a return request.");
      return;
    }
    if (selectedItems.length === 0) {
      setError("Select at least one item to return.");
      return;
    }
    createReturnRequest({
      orderNumber: order.orderNumber,
      items: selectedItems,
      reason,
      notes: notes.trim() || undefined,
    });
    navigate(`/order/${order.orderNumber}`);
  };

  return (
    <section className="bg-[#F6F7F9] px-4 py-12 sm:px-6 lg:px-8">
      <form onSubmit={submitReturn} className="mx-auto max-w-5xl">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">
          Return request
        </p>
        <h1 className="mt-3 text-4xl font-black text-[#0A0A0A]">
          Select items to return.
        </h1>
        <p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-[#727986]">
          Choose the item quantities and reason for order {order.orderNumber}.
        </p>

        {!eligible ? (
          <div className="mt-8 rounded-lg border border-[#E4E7EC] bg-white p-6">
            <h2 className="text-xl font-black text-[#0A0A0A]">
              Return requests are not available for this order.
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#3F4652]">
              Return actions appear when the order reaches an eligible status.
            </p>
            <Link
              to={`/order/${order.orderNumber}`}
              className="mt-5 inline-flex rounded-md bg-[var(--tek-accent)] px-5 py-3 text-sm font-black text-[var(--tek-accent-ink)]"
            >
              Back to Order
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              {order.items.map((item) => {
                const alreadyReturned = returnedQuantities[item.productId] ?? 0;
                const maxQuantity = Math.max(0, item.quantity - alreadyReturned);
                const quantity = quantities[item.productId] ?? 0;

                return (
                  <article
                    key={item.productId}
                    className="rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="text-lg font-black text-[#0A0A0A]">{item.name}</h2>
                        <p className="mt-1 text-sm text-[#727986]">
                          Purchased {item.quantity} | Available to return {maxQuantity}
                        </p>
                        <p className="mt-2 text-sm font-black text-[#0A0A0A]">
                          {formatCurrency(item.unitPrice, order.currency)} each
                        </p>
                      </div>
                      <div className="flex h-10 items-center rounded-md border border-[#E4E7EC]">
                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(item.productId, quantity - 1, maxQuantity)
                          }
                          disabled={maxQuantity === 0}
                          className="grid h-10 w-10 place-items-center disabled:opacity-40"
                          aria-label={`Decrease return quantity for ${item.name}`}
                        >
                          <FiMinus aria-hidden="true" />
                        </button>
                        <span className="w-8 text-center text-sm font-black">{quantity}</span>
                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(item.productId, quantity + 1, maxQuantity)
                          }
                          disabled={maxQuantity === 0}
                          className="grid h-10 w-10 place-items-center disabled:opacity-40"
                          aria-label={`Increase return quantity for ${item.name}`}
                        >
                          <FiPlus aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <aside className="h-fit rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm">
              <FiRefreshCw className="text-[var(--tek-accent)]" aria-hidden="true" />
              <h2 className="mt-4 text-lg font-black text-[#0A0A0A]">Return details</h2>
              <label className="mt-5 block text-sm font-black text-[#0A0A0A]">
                Reason
                <select
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="mt-2 h-12 w-full rounded-md border border-[#E4E7EC] bg-white px-3 text-sm font-semibold outline-none focus:border-[var(--tek-accent)] focus:ring-4 focus:ring-[rgba(70,157,139,0.14)]"
                >
                  {returnReasons.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-4 block text-sm font-black text-[#0A0A0A]">
                Notes
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="mt-2 min-h-28 w-full rounded-md border border-[#E4E7EC] p-3 text-sm font-semibold outline-none focus:border-[var(--tek-accent)] focus:ring-4 focus:ring-[rgba(70,157,139,0.14)]"
                />
              </label>
              <p aria-live="polite" className="mt-3 min-h-5 text-sm font-semibold text-red-700">
                {error}
              </p>
              <button
                type="submit"
                className="mt-4 w-full rounded-md bg-[var(--tek-accent)] px-5 py-3 text-sm font-black text-[var(--tek-accent-ink)] transition hover:bg-[var(--tek-accent-hover)]"
              >
                Submit Return Request
              </button>
              <Link
                to={`/order/${order.orderNumber}`}
                className="mt-3 block rounded-md border border-[#E4E7EC] px-5 py-3 text-center text-sm font-black text-[#0A0A0A] transition hover:border-[#0A0A0A]"
              >
                Back to Order
              </Link>
            </aside>
          </div>
        )}
      </form>
    </section>
  );
}

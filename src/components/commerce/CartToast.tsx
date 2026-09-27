import { Link } from "react-router-dom";
import { useEffect } from "react";
import { FiCheckCircle, FiX } from "react-icons/fi";
import { useCart } from "@/state/cart";

export function CartToast() {
  const { toast, dismissToast } = useCart();
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(dismissToast, 5000);
    return () => window.clearTimeout(timeout);
  }, [dismissToast, toast]);
  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[70] w-[calc(100vw-2.5rem)] max-w-sm rounded-lg border border-[#B9E2DB] bg-white p-4 shadow-[0_18px_50px_rgba(10,10,10,0.18)]"
    >
      <div className="flex items-start gap-3">
        <FiCheckCircle className="mt-0.5 shrink-0 text-[var(--tek-accent)]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-[#0A0A0A]">
            {toast.productName} added to cart.
          </p>
          {toast.quantity > 1 && (
            <p className="mt-1 text-xs font-semibold text-[#727986]">Quantity {toast.quantity}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to="/cart"
              onClick={dismissToast}
              className="rounded-md bg-[var(--tek-accent)] px-3 py-2 text-xs font-black text-[var(--tek-accent-ink)]"
            >
              View cart
            </Link>
            <Link
              to="/checkout"
              onClick={dismissToast}
              className="rounded-md border border-[#E4E7EC] px-3 py-2 text-xs font-black text-[#0A0A0A]"
            >
              Checkout
            </Link>
          </div>
        </div>
        <button
          type="button"
          onClick={dismissToast}
          className="grid h-8 w-8 place-items-center rounded-md text-[#727986] hover:bg-[#F6F7F9] hover:text-[#0A0A0A]"
          aria-label="Dismiss cart confirmation"
        >
          <FiX aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

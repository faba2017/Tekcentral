import { Link } from "react-router-dom";
import { demoTaxConfig } from "@/lib/checkout-config";
import { formatCurrency } from "@/lib/format";
import type { Order } from "@/types/order";

export function OrderSummary({ order }: { order: Order }) {
  return (
    <div className="rounded-lg border border-[#E4E7EC] bg-white p-5">
      <h2 className="text-lg font-black text-[#0A0A0A]">Order summary</h2>
      <div className="mt-5 space-y-4">
        {order.items.map((item) => (
          <div key={item.productId} className="flex items-start justify-between gap-4">
            <div>
              <Link
                to={`/product/${item.slug}`}
                className="text-sm font-black text-[#0A0A0A] hover:underline"
              >
                {item.name}
              </Link>
              <p className="mt-1 text-xs font-semibold text-[#727986]">
                {item.brand} {item.sku ? `| ${item.sku}` : ""}
              </p>
              <p className="mt-1 text-sm text-[#3F4652]">Qty {item.quantity}</p>
            </div>
            <p className="text-sm font-black text-[#0A0A0A]">
              {formatCurrency(item.lineTotal, order.currency)}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-5 space-y-3 border-t border-[#E4E7EC] pt-5 text-sm">
        <div className="flex justify-between gap-4">
          <span className="font-semibold text-[#3F4652]">Subtotal</span>
          <span className="font-black text-[#0A0A0A]">
            {formatCurrency(order.subtotal, order.currency)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="font-semibold text-[#3F4652]">Delivery</span>
          <span className="font-black text-[#0A0A0A]">
            {formatCurrency(order.deliveryAmount, order.currency)}
          </span>
        </div>
        <div className="flex justify-between gap-4 border-t border-[#E4E7EC] pt-3">
          <span className="text-base font-black text-[#0A0A0A]">Total</span>
          <span className="text-xl font-black text-[#0A0A0A]">
            {formatCurrency(order.total, order.currency)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="font-semibold text-[#3F4652]">{demoTaxConfig.label}</span>
          <span className="font-black text-[#0A0A0A]">
            {formatCurrency(order.taxAmount, order.currency)}
          </span>
        </div>
      </div>
    </div>
  );
}

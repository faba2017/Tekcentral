import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AdminShell } from "@/components/admin/AdminShell";
import { apiRequest } from "@/lib/api";
import { formatDateTime } from "@/lib/order-utils";
import { usePageTitle } from "@/lib/page-title";
import type { AdminOrderResponse } from "@/lib/admin";
import type { Order } from "@/types/order";

export function AdminPackingSlipPage() {
  const { orderNumber = "" } = useParams();
  usePageTitle(`Packing slip ${orderNumber} | TekCentral`);
  const [order, setOrder] = useState<Order | undefined>();

  useEffect(() => {
    apiRequest<AdminOrderResponse>(`/api/admin/orders/${encodeURIComponent(orderNumber)}`)
      .then((response) => setOrder(response.order))
      .catch(() => setOrder(undefined));
  }, [orderNumber]);

  if (!order) {
    return (
      <AdminShell>
        <p className="rounded-lg border border-[#E4E7EC] bg-white p-6 text-sm font-semibold">
          Loading packing slip...
        </p>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black text-[var(--tek-accent-ink)]"
        >
          Print Packing Slip
        </button>
        <Link
          to={`/admin/orders/${order.orderNumber}`}
          className="rounded-md border border-[#E4E7EC] bg-white px-4 py-2 text-sm font-black"
        >
          Back to Order
        </Link>
      </div>
      <section className="bg-white p-8 text-[#0A0A0A] shadow-sm print:shadow-none">
        <div className="flex flex-col gap-4 border-b border-[#0A0A0A] pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-black">
              <span>Tek</span>
              <span className="text-[var(--tek-accent)] print:text-[#0A0A0A]">Central</span>
            </h1>
            <p className="mt-2 text-sm font-black uppercase tracking-[0.16em]">
              Packing Slip
            </p>
          </div>
          <div className="text-sm leading-6 sm:text-right">
            <p className="font-black">{order.orderNumber}</p>
            <p>{formatDateTime(order.createdAt)}</p>
          </div>
        </div>
        <div className="grid gap-6 border-b border-[#E4E7EC] py-6 md:grid-cols-2">
          <div>
            <h2 className="text-sm font-black uppercase tracking-[0.12em]">Customer</h2>
            <p className="mt-3 text-sm font-semibold">
              {order.customer.firstName} {order.customer.lastName}
            </p>
            <p className="text-sm">{order.customer.email}</p>
            <p className="text-sm">{order.customer.mobile}</p>
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-[0.12em]">
              Delivery address
            </h2>
            <p className="mt-3 text-sm leading-6">
              {order.deliveryAddress.streetAddress}
              <br />
              {order.deliveryAddress.suburb}, {order.deliveryAddress.city}
              <br />
              {order.deliveryAddress.province}, {order.deliveryAddress.postalCode}
              <br />
              {order.deliveryAddress.country}
            </p>
          </div>
        </div>
        <table className="mt-6 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[#0A0A0A]">
              <th className="py-3 pr-3">Pick</th>
              <th className="py-3 pr-3">SKU</th>
              <th className="py-3 pr-3">Product</th>
              <th className="py-3 text-right">Qty</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.productId} className="border-b border-[#E4E7EC]">
                <td className="py-4 pr-3">
                  <span className="inline-block h-5 w-5 border border-[#0A0A0A]" />
                </td>
                <td className="py-4 pr-3 font-semibold">{item.sku ?? item.productId}</td>
                <td className="py-4 pr-3">{item.name}</td>
                <td className="py-4 text-right font-black">{item.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-8 rounded-md border border-[#E4E7EC] p-4">
          <h2 className="text-sm font-black uppercase tracking-[0.12em]">
            Parcel / shipment notes
          </h2>
          <div className="mt-8 h-24 border-b border-[#BFC7D4]" />
        </div>
      </section>
    </AdminShell>
  );
}

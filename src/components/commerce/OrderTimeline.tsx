import { normalOrderTimeline, orderStatusLabels } from "@/lib/order-status";
import { formatDateTime } from "@/lib/order-utils";
import type { Order } from "@/types/order";

export function OrderTimeline({ order }: { order: Order }) {
  const currentIndex = normalOrderTimeline.indexOf(order.status);
  const isShipmentStatus = currentIndex >= 0;

  if (!isShipmentStatus) {
    return (
      <div className="rounded-lg border border-[#E4E7EC] bg-white p-5">
        <h2 className="text-lg font-black text-[#0A0A0A]">Order activity</h2>
        <ol className="mt-5 space-y-4">
          {order.statusHistory.map((entry) => (
            <li key={`${entry.status}-${entry.createdAt}`} className="flex gap-3">
              <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-[var(--tek-accent)]" />
              <div>
                <p className="text-sm font-black text-[#0A0A0A]">{entry.label}</p>
                <p className="mt-1 text-xs font-semibold text-[#727986]">
                  {formatDateTime(entry.createdAt)}
                </p>
                {entry.note && (
                  <p className="mt-1 text-sm leading-6 text-[#3F4652]">{entry.note}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#E4E7EC] bg-white p-5">
      <h2 className="text-lg font-black text-[#0A0A0A]">Order progress</h2>
      <ol className="mt-5 grid gap-4 sm:grid-cols-5">
        {normalOrderTimeline.map((status, index) => {
          const reached = index <= currentIndex;
          const history = order.statusHistory.find((entry) => entry.status === status);

          return (
            <li key={status} className="relative">
              <span
                className={`grid h-9 w-9 place-items-center rounded-full text-sm font-black ${
                  reached
                    ? "bg-[var(--tek-accent)] text-[var(--tek-accent-ink)]"
                    : "bg-[#F6F7F9] text-[#727986]"
                }`}
              >
                {index + 1}
              </span>
              <p className="mt-3 text-sm font-black text-[#0A0A0A]">
                {orderStatusLabels[status]}
              </p>
              <p className="mt-1 text-xs font-semibold text-[#727986]">
                {history ? formatDateTime(history.createdAt) : "Pending"}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

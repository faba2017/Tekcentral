import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  FiAlertCircle,
  FiCheckCircle,
  FiChevronDown,
  FiClock,
  FiHome,
  FiLayers,
  FiLink,
  FiPauseCircle,
  FiRotateCcw,
  FiSettings,
  FiShoppingBag,
  FiTruck,
} from "react-icons/fi";
import { AdminToastRegion, type AdminToastMessage } from "@/components/admin/AdminToast";
import { apiRequest } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import type { AdminOrdersResponse } from "@/lib/admin";
import { enabledSupplierRegistry } from "@/lib/supplier-registry";
import type { OrderStatus, PaymentStatus, RefundStatus, ReturnStatus } from "@/types/order";

const adminLinks = [
  { to: "/admin", label: "Dashboard", icon: FiHome },
  { to: "/admin/orders", label: "Orders", icon: FiShoppingBag },
  { to: "/admin/returns", label: "Returns", icon: FiRotateCcw },
  { to: "/admin/refunds", label: "Refunds", icon: FiTruck },
  { to: "/admin/supplier-orders", label: "Supplier Orders", icon: FiLayers },
  { to: "/admin/supplier-mappings", label: "Supplier Mappings", icon: FiLink },
  { to: "/admin/settings/pricing", label: "Pricing", icon: FiSettings },
  { to: "/admin/settings/shipping", label: "Shipping", icon: FiTruck },
];

const paidOrderSeenStorageKey = "tekcentral.ops.seenPaidOrderNotifications";

type PaidOrderAlert = NonNullable<AdminOrdersResponse["paidOrderAlerts"]>[number];

function readSeenPaidOrderNotifications() {
  try {
    const stored = window.localStorage.getItem(paidOrderSeenStorageKey);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? new Set(parsed.filter((item): item is string => typeof item === "string")) : new Set<string>();
  } catch {
    return new Set<string>();
  }
}

function storeSeenPaidOrderNotifications(values: Set<string>) {
  try {
    window.localStorage.setItem(paidOrderSeenStorageKey, JSON.stringify([...values]));
  } catch {
    // Local persistence is best-effort; backend acknowledgement still controls the badge.
  }
}

function paidOrderNotificationKey(alert: PaidOrderAlert) {
  return `${alert.orderNumber}::${alert.paidAt ?? "paid"}`;
}

function paidOrderAlertsFromResponse(response: AdminOrdersResponse): PaidOrderAlert[] {
  const alertsByOrderNumber = new Map<string, PaidOrderAlert>();
  response.orders
    .filter((order) => order.payment.status === "PAID" && !order.opsPaymentAcknowledgedAt)
    .forEach((order) => {
      alertsByOrderNumber.set(order.orderNumber, {
        orderNumber: order.orderNumber,
        total: order.total,
        currency: order.currency,
        paidAt: order.payment.confirmedAt ?? order.payment.updatedAt,
      });
    });
  (response.paidOrderAlerts ?? []).forEach((alert) => {
    alertsByOrderNumber.set(alert.orderNumber, alert);
  });
  return [...alertsByOrderNumber.values()];
}

function playPaidOrderNotificationSound() {
  const AudioContextClass =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, context.currentTime);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.2);
  window.setTimeout(() => void context.close().catch(() => undefined), 260);
}

export function AdminShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [suppliersOpen, setSuppliersOpen] = useState(false);
  const [paidOrderAlerts, setPaidOrderAlerts] = useState<PaidOrderAlert[]>([]);
  const [paidOrderToasts, setPaidOrderToasts] = useState<AdminToastMessage[]>([]);
  const [adminToasts, setAdminToasts] = useState<AdminToastMessage[]>([]);
  const suppliersMenuRef = useRef<HTMLDivElement>(null);
  const seenPaidOrderNotificationsRef = useRef<Set<string>>(readSeenPaidOrderNotifications());
  const suppliersActive = location.pathname.startsWith("/admin/suppliers");

  const dismissPaidOrderToast = (id: string) => {
    setPaidOrderToasts((current) => current.filter((toast) => toast.id !== id));
    setAdminToasts((current) => current.filter((toast) => toast.id !== id));
  };

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!suppliersMenuRef.current?.contains(event.target as Node)) setSuppliersOpen(false);
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setSuppliersOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const handlePaidOrderAcknowledged = (event: Event) => {
      const orderNumber = (event as CustomEvent<{ orderNumber?: string }>).detail?.orderNumber;
      if (!orderNumber) return;
      setPaidOrderAlerts((current) => current.filter((alert) => alert.orderNumber !== orderNumber));
      setPaidOrderToasts((current) => current.filter((toast) => toast.id !== `paid-${orderNumber}`));
    };
    window.addEventListener("tekcentral:paid-order-acknowledged", handlePaidOrderAcknowledged);
    return () => {
      window.removeEventListener("tekcentral:paid-order-acknowledged", handlePaidOrderAcknowledged);
    };
  }, []);

  useEffect(() => {
    const handleAdminToast = (event: Event) => {
      const toast = (event as CustomEvent<AdminToastMessage>).detail;
      if (!toast?.id) return;
      setAdminToasts((current) => {
        if (current.some((item) => item.id === toast.id)) return current;
        return [...current, toast];
      });
    };
    window.addEventListener("tekcentral:admin-toast", handleAdminToast);
    return () => {
      window.removeEventListener("tekcentral:admin-toast", handleAdminToast);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const pollPaidOrderAlerts = () => {
      apiRequest<AdminOrdersResponse>("/api/admin/orders")
        .then((response) => {
          if (cancelled) return;
          const alerts = paidOrderAlertsFromResponse(response);
          setPaidOrderAlerts(alerts);
          const nextAlerts = alerts.filter(
            (alert) => !seenPaidOrderNotificationsRef.current.has(paidOrderNotificationKey(alert)),
          );
          if (nextAlerts.length === 0) return;

          const nextSeen = new Set(seenPaidOrderNotificationsRef.current);
          nextAlerts.forEach((alert) => nextSeen.add(paidOrderNotificationKey(alert)));
          seenPaidOrderNotificationsRef.current = nextSeen;
          storeSeenPaidOrderNotifications(nextSeen);

          setPaidOrderToasts((current) => [
            ...current,
            ...nextAlerts.map((alert) => ({
              id: `paid-${alert.orderNumber}`,
              variant: "success" as const,
              title: "New paid order",
              message: (
                <>
                  <span className="block">{alert.orderNumber}</span>
                  <span className="block">{formatCurrency(alert.total, alert.currency)}</span>
                </>
              ),
              action: {
                label: "Open order",
                onClick: () => {
                  dismissPaidOrderToast(`paid-${alert.orderNumber}`);
                  navigate(`/admin/orders/${encodeURIComponent(alert.orderNumber)}`);
                },
              },
            })),
          ]);

          nextAlerts.forEach(() => {
            try {
              playPaidOrderNotificationSound();
            } catch {
              // Browsers can block audio until user interaction; visual notification remains primary.
            }
          });
        })
        .catch(() => undefined);
    };

    pollPaidOrderAlerts();
    const intervalId = window.setInterval(pollPaidOrderAlerts, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [navigate]);

  const handleSuppliersKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSuppliersOpen((open) => !open);
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSuppliersOpen(true);
      window.setTimeout(() => {
        suppliersMenuRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
      }, 0);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F7F9] text-[#0A0A0A]">
      <AdminToastRegion toasts={[...paidOrderToasts, ...adminToasts]} onDismiss={dismissPaidOrderToast} />
      <header className="sticky top-0 z-40 border-b border-[#E4E7EC] bg-white/92 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <Link to="/admin" className="text-xl font-black tracking-tight">
              <span>Tek</span>
              <span className="text-[var(--tek-accent)]">Central</span>
              <span className="ml-2 text-sm font-black text-[#727986]">Ops</span>
            </Link>
            <p className="mt-1 text-xs font-semibold text-[#727986]">
              Development internal workspace. Production staff authentication is pending.
            </p>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Admin navigation">
            {adminLinks.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/admin"}
                className={({ isActive }) =>
                  `group relative inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-black transition ${
                    isActive
                      ? "bg-[var(--tek-accent)] text-[var(--tek-accent-ink)]"
                      : "text-[#3F4652] hover:bg-[#F6F7F9] hover:text-[#0A0A0A]"
                  }`
                }
              >
                <Icon aria-hidden="true" />
                {label}
                {label === "Orders" && paidOrderAlerts.length > 0 && (
                  <span className="relative ml-1">
                    <span
                      aria-label={`${paidOrderAlerts.length} new paid ${paidOrderAlerts.length === 1 ? "order" : "orders"} awaiting review`}
                      aria-describedby="orders-paid-alert-tooltip"
                      className="rounded-full bg-[#B42318] px-2 py-0.5 text-[11px] font-black text-white"
                    >
                      {paidOrderAlerts.length}
                    </span>
                    <span
                      id="orders-paid-alert-tooltip"
                      role="tooltip"
                      className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-max max-w-56 -translate-x-1/2 rounded-md border border-[#E4E7EC] bg-[#0A0A0A] px-3 py-2 text-xs font-black text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100 group-focus-within:opacity-100"
                    >
                      {paidOrderAlerts.length} new paid {paidOrderAlerts.length === 1 ? "order" : "orders"} awaiting review
                    </span>
                  </span>
                )}
              </NavLink>
            ))}
            <div ref={suppliersMenuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setSuppliersOpen((open) => !open)}
                onKeyDown={handleSuppliersKeyDown}
                aria-expanded={suppliersOpen}
                aria-haspopup="menu"
                className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-black transition ${
                  suppliersActive
                    ? "bg-[var(--tek-accent)] text-[var(--tek-accent-ink)]"
                    : "text-[#3F4652] hover:bg-[#F6F7F9] hover:text-[#0A0A0A]"
                }`}
              >
                <FiLayers aria-hidden="true" />
                Suppliers
                <FiChevronDown aria-hidden="true" />
              </button>
              {suppliersOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-50 mt-2 min-w-64 rounded-lg border border-[#E4E7EC] bg-white p-2 shadow-xl"
                >
                  <Link
                    to="/admin/suppliers"
                    role="menuitem"
                    onClick={() => setSuppliersOpen(false)}
                    className="block rounded-md px-3 py-2 text-sm font-black text-[#0A0A0A] hover:bg-[#F6F7F9]"
                  >
                    Supplier Hub
                  </Link>
                  <div className="my-2 border-t border-[#E4E7EC]" />
                  {enabledSupplierRegistry.map((supplier) => (
                    <Link
                      key={supplier.code}
                      to={supplier.route}
                      role="menuitem"
                      onClick={() => setSuppliersOpen(false)}
                      className="block rounded-md px-3 py-2 text-sm font-black text-[#3F4652] hover:bg-[#F6F7F9] hover:text-[#0A0A0A]"
                    >
                      {supplier.displayName}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
    </div>
  );
}

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--tek-accent)]">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-3xl font-black text-[#0A0A0A] sm:text-4xl">{title}</h1>
        {description && (
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#727986]">
            {description}
          </p>
        )}
      </div>
      {actions}
    </div>
  );
}

type BadgeTone = "neutral" | "positive" | "teal" | "amber" | "red" | "blue" | "violet";

function toneForStatus(status?: string): BadgeTone {
  if (!status) return "neutral";
  if (["PAID", "DELIVERED", "REFUNDED", "COMPLETED"].includes(status)) return "positive";
  if (["CONFIRMED", "APPROVED"].includes(status)) return "teal";
  if (["PENDING", "REQUESTED", "REFUND_PENDING", "AWAITING_RETURN"].includes(status)) return "amber";
  if (["FAILED", "CANCELLED", "REJECTED"].includes(status)) return "red";
  if (["PROCESSING", "UNDER_REVIEW", "PARTIALLY_SHIPPED"].includes(status)) return "blue";
  if (["SHIPPED", "DISPATCHED", "READY_TO_ORDER", "ORDER_PENDING_APPROVAL"].includes(status)) return "violet";
  return "neutral";
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: "border-[#D7DCE5] bg-white text-[#3F4652]",
  positive: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]",
  teal: "border-[#B9E2DB] bg-[#EFFFFB] text-[#14584E]",
  amber: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]",
  red: "border-[#FDA29B] bg-[#FFFBFA] text-[#B42318]",
  blue: "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]",
  violet: "border-[#D9D6FE] bg-[#F4F3FF] text-[#5925DC]",
};

function StatusIcon({ tone }: { tone: BadgeTone }) {
  if (tone === "positive" || tone === "teal") return <FiCheckCircle aria-hidden="true" />;
  if (tone === "amber" || tone === "blue" || tone === "violet") return <FiClock aria-hidden="true" />;
  if (tone === "red") return <FiAlertCircle aria-hidden="true" />;
  return <FiPauseCircle aria-hidden="true" />;
}

export function AdminStatusBadge({
  label,
  status,
}: {
  label?: string;
  status?: OrderStatus | PaymentStatus | ReturnStatus | RefundStatus | string;
}) {
  const tone = toneForStatus(status ?? label);
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-black ${toneClasses[tone]}`}
    >
      <StatusIcon tone={tone} />
      {(label ?? status ?? "").replace(/_/g, " ")}
    </span>
  );
}

export function AdminFeedback({
  variant,
  message,
}: {
  variant: "success" | "warning" | "error" | "info";
  message: string;
}) {
  const className =
    variant === "success"
      ? "border-[#B8EACF] bg-[#F0FFF6]"
      : variant === "warning"
        ? "border-[#FEDF89] bg-[#FFFAEB]"
        : variant === "error"
          ? "border-[#FDA29B] bg-[#FFFBFA]"
          : "border-[#B9E2DB] bg-[#EFFFFB]";
  return (
    <p
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
      className={`rounded-md border px-4 py-3 text-sm font-semibold text-[#0A0A0A] ${className}`}
    >
      {message}
    </p>
  );
}

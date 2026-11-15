import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import type { IconType } from "react-icons";
import {
  FiActivity,
  FiAlertCircle,
  FiBarChart2,
  FiBox,
  FiCheckCircle,
  FiChevronsLeft,
  FiChevronsRight,
  FiClock,
  FiCpu,
  FiDollarSign,
  FiHome,
  FiMenu,
  FiMessageSquare,
  FiPackage,
  FiPauseCircle,
  FiRotateCcw,
  FiShoppingBag,
  FiSliders,
  FiTruck,
  FiUsers,
  FiUserCheck,
  FiX,
} from "react-icons/fi";
import { AdminToastRegion, type AdminToastMessage } from "@/components/admin/AdminToast";
import { apiRequest } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import type { AdminOrdersResponse, FxPricingAttention } from "@/lib/admin";
import type { OperationalAlertSummary } from "@/lib/operational-alerts";
import type { OrderStatus, PaymentStatus, RefundStatus, ReturnStatus } from "@/types/order";
import { adminSectionForPath } from "@/lib/admin-navigation";
import { useStaffSession } from "@/state/staff-session";
import { ProductConfigurationWorkspaceHost } from "@/components/admin/ProductConfigurationWorkspace";
import { AdminAiTutor } from "@/components/admin/AdminAiTutor";

const sidebarPreferenceKey = "tekcentral.ops.sidebarCollapsed";

interface AdminNavigationItem { id: string; to: string; label: string; icon: IconType; permission: string; requiresAdminAi?: boolean; disabled?: boolean }
const adminNavigationGroups: { label: string; items: AdminNavigationItem[] }[] = [
  { label: "Overview", items: [{ id: "dashboard", to: "/admin", label: "Dashboard", icon: FiHome, permission: "dashboard.read" }, { id: "ai", to: "/admin/ai", label: "Admin AI", icon: FiCpu, permission: "dashboard.read", requiresAdminAi: true }] },
  { label: "Commerce", items: [{ id: "orders", to: "/admin/orders", label: "Orders", icon: FiShoppingBag, permission: "orders.read" }, { id: "returns", to: "/admin/returns", label: "Returns & Refunds", icon: FiRotateCcw, permission: "returns.read" }, { id: "customers", to: "/admin/customers", label: "Customers", icon: FiUsers, permission: "customers.read" }, { id: "contact", to: "/admin/contact", label: "Contact Inbox", icon: FiMessageSquare, permission: "contact.read" }] },
  { label: "Catalogue", items: [{ id: "products", to: "/admin/products", label: "Products", icon: FiBox, permission: "products.read" }, { id: "taxonomy", to: "/admin/taxonomy", label: "Taxonomy", icon: FiBox, permission: "products.read" }, { id: "pricing", to: "/admin/pricing", label: "Pricing", icon: FiDollarSign, permission: "pricing.read" }, { id: "merchandising", to: "/admin/merchandising", label: "Merchandising", icon: FiBarChart2, permission: "merchandising.read" }] },
  { label: "Supply & fulfilment", items: [{ id: "suppliers", to: "/admin/suppliers", label: "Suppliers", icon: FiUsers, permission: "suppliers.read" }, { id: "supplier-orders", to: "/admin/supplier-orders", label: "Supplier Orders", icon: FiPackage, permission: "supplier_orders.read" }, { id: "shipping", to: "/admin/shipping", label: "Shipping", icon: FiTruck, permission: "shipping.read" }] },
  { label: "Insights", items: [{ id: "reports", to: "/admin/reports", label: "Reports", icon: FiBarChart2, permission: "reports.sales" }, { id: "analytics", to: "/admin/reports/analytics", label: "Analytics", icon: FiActivity, permission: "reports.analytics" }, { id: "zeus", to: "/admin/reports/zeus", label: "Zeus", icon: FiAlertCircle, permission: "reports.zeus" }] },
  { label: "Administration", items: [{ id: "alerts", to: "/admin/alerts", label: "System Alerts", icon: FiAlertCircle, permission: "alerts.read" }, { id: "settings", to: "/admin/settings", label: "Settings", icon: FiSliders, permission: "settings.general" }, { id: "staff", to: "/admin/staff", label: "Staff", icon: FiUserCheck, permission: "staff.read" }, { id: "audit", to: "/admin/audit", label: "Audit / Activity", icon: FiActivity, permission: "audit.read" }] },
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

function AdminSidebar({ collapsed, activeSection, paidOrderCount, pricingAttention, criticalAlertCount, warningAlertCount, permissions, adminAiEffective, onNavigate, onToggle }: { collapsed: boolean; activeSection?: string; paidOrderCount: number; pricingAttention: number; criticalAlertCount: number; warningAlertCount: number; permissions: readonly string[]; adminAiEffective: boolean; onNavigate?: () => void; onToggle?: () => void }) {
  return <div className="flex h-full flex-col bg-[#101828] text-white">
    <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
      <Link to="/admin" onClick={onNavigate} className="min-w-0 font-black tracking-tight" aria-label="TekCentral Ops dashboard">
        {collapsed ? <span className="text-xl text-[var(--tek-accent)]">T</span> : <><span>Tek</span><span className="text-[var(--tek-accent)]">Central</span><span className="ml-2 text-xs text-white/60">Ops</span></>}
      </Link>
      {onToggle && <button type="button" onClick={onToggle} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="hidden h-9 w-9 place-items-center rounded-md text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tek-accent)] lg:grid">{collapsed ? <FiChevronsRight /> : <FiChevronsLeft />}</button>}
    </div>
    <nav aria-label="Admin navigation" className="flex-1 overflow-y-auto px-3 py-4">
      {adminNavigationGroups.map((group) => ({ ...group, items: group.items.filter((item) => permissions.includes(item.permission) && (!item.requiresAdminAi || adminAiEffective)) })).filter((group) => group.items.length).map((group) => <div key={group.label} className="mb-5 last:mb-0">
        {!collapsed && <p className="mb-1 px-3 text-[0.65rem] font-black uppercase tracking-[0.14em] text-white/45">{group.label}</p>}
        <div className="space-y-1">{group.items.map(({ id, to, label, icon: Icon, ...item }) => {
          const disabled = "disabled" in item && item.disabled;
          const active = activeSection === id;
          const count = id === "orders" ? paidOrderCount : id === "pricing" ? pricingAttention : id === "alerts" ? criticalAlertCount || warningAlertCount : 0;
          const className = `group relative flex min-h-10 items-center rounded-md px-3 text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tek-accent)] ${collapsed ? "justify-center" : "gap-3"} ${active ? "bg-[var(--tek-accent)] text-[var(--tek-accent-ink)]" : disabled ? "cursor-not-allowed text-white/35" : "text-white/75 hover:bg-white/8 hover:text-white"}`;
          const badgeLabel = id === "orders" ? `${count} new paid orders awaiting review` : id === "pricing" ? `${count} products requiring pricing review` : criticalAlertCount ? `${criticalAlertCount} critical operational issues require attention` : `${warningAlertCount} operational warnings require attention`;
          const content = <><Icon className="shrink-0 text-lg" aria-hidden="true" />{!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}{!collapsed && disabled && <span className="text-[0.6rem] font-black uppercase text-white/40">Soon</span>}{count > 0 && <span aria-label={badgeLabel} className={`${collapsed ? "absolute right-0.5 top-0.5" : "ml-auto"} rounded-full ${id === "alerts" && !criticalAlertCount ? "bg-[#B54708]" : "bg-[#D92D20]"} px-1.5 py-0.5 text-[10px] font-black text-white`}>{count > 99 ? "99+" : count}</span>}{collapsed && <span role="tooltip" className="pointer-events-none absolute left-full z-50 ml-3 w-max rounded-md bg-[#0A0A0A] px-2.5 py-1.5 text-xs font-black text-white opacity-0 shadow-lg group-hover:opacity-100 group-focus-visible:opacity-100">{label}{disabled ? " · Coming Soon" : ""}</span>}</>;
          return disabled ? <div key={id} aria-disabled="true" className={className}>{content}</div> : <NavLink key={id} to={to} onClick={onNavigate} aria-current={active ? "page" : undefined} className={className}>{content}</NavLink>;
        })}</div>
      </div>)}
    </nav>
    {!collapsed && <div className="border-t border-white/10 p-4"><p className="text-xs font-black text-white/75">Internal workspace</p><p className="mt-1 text-[0.68rem] leading-4 text-white/45">Development environment · staff authentication pending</p></div>}
  </div>;
}

export function AdminShell({ children }: { children: ReactNode }) {
  const staffSession = useStaffSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem(sidebarPreferenceKey) === "true");
  const [paidOrderAlerts, setPaidOrderAlerts] = useState<PaidOrderAlert[]>([]);
  const [paidOrderToasts, setPaidOrderToasts] = useState<AdminToastMessage[]>([]);
  const [adminToasts, setAdminToasts] = useState<AdminToastMessage[]>([]);
  const [pricingAttention, setPricingAttention] = useState(0);
  const [operationalAlerts, setOperationalAlerts] = useState<OperationalAlertSummary>({ critical: 0, warning: 0, alerts: [] });
  const [adminAiEffective, setAdminAiEffective] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const seenPaidOrderNotificationsRef = useRef<Set<string>>(readSeenPaidOrderNotifications());
  const activeSection = adminSectionForPath(location.pathname);

  const dismissPaidOrderToast = (id: string) => {
    setPaidOrderToasts((current) => current.filter((toast) => toast.id !== id));
    setAdminToasts((current) => current.filter((toast) => toast.id !== id));
  };

  useEffect(() => { const close = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") setDrawerOpen(false); }; document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close); }, []);
  useEffect(() => { if (!drawerOpen) return; window.requestAnimationFrame(() => drawerRef.current?.querySelector<HTMLButtonElement>("button")?.focus()); }, [drawerOpen]);
  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [drawerOpen]);

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

  useEffect(() => { let cancelled = false; const poll = () => apiRequest<OperationalAlertSummary>("/api/admin/alerts/summary").then((result) => { if (!cancelled) setOperationalAlerts(result); }).catch(() => undefined); void poll(); const intervalId = window.setInterval(poll, 30_000); return () => { cancelled = true; window.clearInterval(intervalId); }; }, []);
  useEffect(() => { let cancelled = false; const poll = () => apiRequest<{ adminAi: { effective: boolean } }>("/api/admin/admin-ai/access").then((result) => { if (!cancelled) setAdminAiEffective(result.adminAi.effective); }).catch(() => { if (!cancelled) setAdminAiEffective(false); }); void poll(); const intervalId = window.setInterval(poll, 30_000); return () => { cancelled = true; window.clearInterval(intervalId); }; }, []);

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
          ].slice(-3));

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

  useEffect(() => { if (!paidOrderToasts.length) return; const timers = paidOrderToasts.map((toast) => window.setTimeout(() => setPaidOrderToasts((current) => current.filter((item) => item.id !== toast.id)), 12_000)); return () => timers.forEach(window.clearTimeout); }, [paidOrderToasts]);

  useEffect(() => {
    let cancelled = false;
    const poll = () => apiRequest<FxPricingAttention>("/api/admin/pricing/fx/reconciliation").then((response) => { if (!cancelled) setPricingAttention(response.count); }).catch(() => undefined);
    void poll(); const intervalId = window.setInterval(poll, 60_000);
    return () => { cancelled = true; window.clearInterval(intervalId); };
  }, []);

  return (
    <div className={`admin-workspace min-h-screen w-full max-w-full overflow-x-hidden bg-[#F6F7F9] text-[#0A0A0A] lg:grid lg:h-[100dvh] lg:min-h-0 lg:overflow-hidden ${sidebarCollapsed ? "lg:grid-cols-[72px_minmax(0,1fr)]" : "lg:grid-cols-[248px_minmax(0,1fr)]"}`}>
      <AdminToastRegion toasts={[...paidOrderToasts, ...adminToasts]} onDismiss={dismissPaidOrderToast} />
      <ProductConfigurationWorkspaceHost />
      <aside className="hidden h-[100dvh] min-h-0 overflow-hidden lg:block"><AdminSidebar collapsed={sidebarCollapsed} activeSection={activeSection} paidOrderCount={paidOrderAlerts.length} pricingAttention={pricingAttention} criticalAlertCount={operationalAlerts.critical} warningAlertCount={operationalAlerts.warning} permissions={staffSession.effectivePermissions ?? []} adminAiEffective={adminAiEffective} onToggle={() => setSidebarCollapsed((current) => { const next = !current; window.localStorage.setItem(sidebarPreferenceKey, String(next)); return next; })} /></aside>
      {drawerOpen && <div className="fixed inset-0 z-50 lg:hidden"><button type="button" aria-label="Close admin navigation" onClick={() => setDrawerOpen(false)} className="absolute inset-0 bg-black/45" /><aside ref={drawerRef} id="admin-mobile-navigation" role="dialog" aria-modal="true" aria-label="Admin navigation" className="relative h-[100dvh] w-[min(86vw,300px)] overflow-y-auto shadow-2xl"><button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close admin navigation" className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-md text-white hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[var(--tek-accent)]"><FiX /></button><AdminSidebar collapsed={false} activeSection={activeSection} paidOrderCount={paidOrderAlerts.length} pricingAttention={pricingAttention} criticalAlertCount={operationalAlerts.critical} warningAlertCount={operationalAlerts.warning} permissions={staffSession.effectivePermissions ?? []} adminAiEffective={adminAiEffective} onNavigate={() => setDrawerOpen(false)} /></aside></div>}
      <div className="min-w-0 max-w-full overflow-x-hidden lg:h-[100dvh] lg:overflow-y-auto">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-[#E4E7EC] bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3"><button type="button" aria-label="Open admin navigation" aria-controls="admin-mobile-navigation" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-[#E4E7EC] lg:hidden"><FiMenu /></button><div className="min-w-0"><p className="truncate text-sm font-black">{adminNavigationGroups.flatMap((group) => group.items).find((item) => item.id === activeSection)?.label ?? "TekCentral Ops"}</p><p className="text-xs font-semibold text-[#727986]">Internal workspace</p></div></div>
          <div className="flex shrink-0 items-center gap-2">{adminAiEffective && <AdminAiTutor />}<span className="rounded-md border border-[#FEDF89] bg-[#FFFAEB] px-2.5 py-1 text-[0.68rem] font-black text-[#93370D]">Development</span></div>
        </header>
        <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
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

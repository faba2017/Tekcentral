import { Link, Navigate, useParams } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { AdminFeedback, AdminPageHeader, AdminShell, AdminStatusBadge } from "@/components/admin/AdminShell";
import { SupplierWorkspaceNav } from "@/components/admin/SupplierWorkspaceNav";
import { apiRequest } from "@/lib/api";
import { supplierByCode, supplierCatalogueRoute, supplierDefaultRoute } from "@/lib/supplier-registry";
import type { SupplierOperations } from "@/lib/supplier-hub";
import type { SupplierCode } from "@/types/order";
import { usePageTitle } from "@/lib/page-title";
import { ConfirmationModal } from "@/components/admin/ConfirmationModal";
import { ApiError } from "@/lib/api";
import { TekCentralManualOffersWorkspace } from "@/components/admin/TekCentralManualOffersWorkspace";
import { SupplierSourcesWorkspace } from "@/components/admin/MustekSourcesWorkspace";
import { SharedSupplierProductWorkspace } from "@/components/admin/SharedSupplierProductWorkspace";
import { AdminAiContextPanel } from "@/components/admin/AdminAiContextPanel";

const labels: Record<string, string> = { overview: "Overview", products: "Products", evidence: "Evidence", sources: "Sources", "stock-delivery": "Stock & Delivery", "pricing-cost": "Pricing & Cost", "sync-history": "Sync History", health: "Health" };
export function AdminSupplierBaseRedirect() {
  const { supplierId = "" } = useParams();
  const supplier = supplierByCode(supplierId.toUpperCase() as SupplierCode);
  return <Navigate to={supplier ? supplierDefaultRoute(supplier) : "/admin/suppliers"} replace />;
}
export function AdminSupplierWorkspacePage() {
  const { supplierId = "", section = "overview" } = useParams();
  const code = supplierId.toUpperCase() as SupplierCode;
  const supplier = supplierByCode(code);
  const [data, setData] = useState<SupplierOperations>();
  const [error, setError] = useState("");
  usePageTitle(`${supplier?.displayName ?? "Supplier"} ${labels[section] ?? "Workspace"} | TekCentral Ops`);
  const loadOperations = useCallback(() => { if (!supplier) return Promise.resolve(); return apiRequest<SupplierOperations>(`/api/admin/suppliers/${supplier.code.toLowerCase()}/operations`).then((result) => { setData(result); setError(""); }).catch(() => setError("Supplier operations could not be loaded.")); }, [supplier]);
  useEffect(() => { void loadOperations(); }, [loadOperations]);
  if (!supplier || !["TEKCENTRAL", "CJ", "SCOOP", "SYNTECH", "MUSTEK", "TVR"].includes(supplier.code)) return <Navigate to="/admin/suppliers" replace />;
  if (!labels[section]) return <Navigate to={supplierDefaultRoute(supplier)} replace />;
  const support = section === "evidence" ? supplier.capabilitiesV2.evidence : section === "stock-delivery" ? supplier.capabilitiesV2.stock : section === "sync-history" ? supplier.capabilitiesV2.syncHistory : section === "health" ? supplier.capabilitiesV2.health : "SUPPORTED";
  return <AdminShell><AdminPageHeader eyebrow={`Suppliers / ${supplier.displayName}`} title={labels[section]} description="Supplier-specific operational data. Shared supplier policy remains in Settings." /><SupplierWorkspaceNav supplier={supplier} />
    {error && <div className="mt-5"><AdminFeedback variant="warning" message={error} /></div>}
    {data && <div className="mt-5"><AdminAiContextPanel contextType="SUPPLIER" resourceId={supplier.code} intents={["SUMMARY", "BLOCKERS", "NEXT_STEPS", "RISK_REVIEW"]} compact /></div>}
    {section === "sources" && supplier.capabilities.sourceManagement ? <SupplierSourcesWorkspace supplierCode={supplier.code} /> : support === "UNSUPPORTED" ? <section className="mt-5 rounded-lg border border-[#E4E7EC] bg-white p-5"><h2 className="text-lg font-black">Not supported</h2><p className="mt-2 text-sm font-semibold text-[#667085]">This supplier does not support this operational capability.</p></section> : data && <WorkspaceSection section={section} data={data} catalogueRoute={supplierCatalogueRoute(supplier)} onRefresh={loadOperations} />}
  </AdminShell>;
}

function WorkspaceSection({ section, data, catalogueRoute, onRefresh }: { section: string; data: SupplierOperations; catalogueRoute: string; onRefresh: () => Promise<void> }) {
  if (data.supplier.id === "TEKCENTRAL" && (section === "products" || section === "stock-delivery" || section === "pricing-cost")) return <TekCentralManualOffersWorkspace />;
  if ((data.supplier.id === "MUSTEK" || data.supplier.id === "TVR") && section === "products") return <SharedSupplierProductWorkspace supplierCode={data.supplier.id} />;
  if (section === "sync-history") return <><SyntechFullSyncAction data={data} onRefresh={onRefresh} /><section className="mt-5 overflow-hidden rounded-lg border border-[#E4E7EC] bg-white"><div className="grid grid-cols-[1fr_1fr_100px] gap-3 bg-[#F9FAFB] px-4 py-3 text-xs font-black uppercase text-[#667085]"><span>Sync</span><span>Completed</span><span>Status</span></div>{data.syncHistory.length ? data.syncHistory.map((sync) => <div key={`${sync.type}-${sync.completedAt}`} className="grid grid-cols-[1fr_1fr_100px] gap-3 border-t border-[#E4E7EC] px-4 py-3 text-sm"><div><p className="font-black">{sync.type}</p><p className="text-xs text-[#667085]">{sync.source}{sync.recordsProcessed !== undefined ? ` · ${sync.recordsProcessed} records` : ""}</p>{sync.expectedCount !== undefined && <p className="mt-1 text-xs text-[#667085]">Expected {sync.expectedCount} · Parsed {sync.parsedCount ?? 0} · Created {sync.createdCount ?? 0} · Updated {sync.updatedCount ?? 0} · Missing {sync.missingCount ?? 0} · Warnings {sync.warningCount ?? 0}</p>}</div><span>{new Date(sync.completedAt).toLocaleString("en-ZA")}</span><AdminStatusBadge label={sync.status} status={sync.status} /></div>) : <p className="p-5 text-sm font-semibold text-[#667085]">No persisted synchronization history is available.</p>}</section></>;
  if (section === "health") return <section className="mt-5 grid gap-3 sm:grid-cols-2"><Panel title="Connection" value={data.connectionStatus} /><Panel title="Configuration" value={data.configurationStatus} /><Panel title="Catalogue" value={`${data.catalogue.productCount} products`} /><Panel title="Last successful activity" value={data.catalogue.lastSyncAt ? new Date(data.catalogue.lastSyncAt).toLocaleString("en-ZA") : "Not recorded"} />{data.lastError && <div className="sm:col-span-2"><AdminFeedback variant="warning" message={data.lastError} /></div>}</section>;
  if (section === "products") return <section className="mt-5 rounded-lg border border-[#E4E7EC] bg-white p-5"><h2 className="text-lg font-black">Supplier product relationships</h2><p className="mt-2 text-sm font-semibold text-[#667085]">{data.mappings.total} mapped relationships · {data.mappings.verified} verified · {data.mappings.reviewRequired} requiring review.</p><div className="mt-4 flex gap-2"><Link to={`/admin/supplier-mappings?supplier=${data.supplier.id}`} className="rounded-md bg-[var(--tek-accent)] px-3 py-2 text-sm font-black">Review mappings</Link><Link to="/admin/products" className="rounded-md border border-[#D0D5DD] px-3 py-2 text-sm font-black">Open TekCentral Products</Link></div></section>;
  if (section === "evidence") return <section className="mt-5 grid gap-3 sm:grid-cols-3"><Panel title="Identity and mapping" value={`${data.mappings.verified} verified`} /><Panel title="Review required" value={String(data.mappings.reviewRequired)} /><Panel title="Source freshness" value={data.catalogue.lastSyncAt ? `Observed ${new Date(data.catalogue.lastSyncAt).toLocaleString("en-ZA")}` : "No observation recorded"} /><p className="sm:col-span-3 text-sm font-semibold text-[#667085]">Detailed identity, pricing, FX, logistics, and stock evidence remains attached to each supplier item in the existing catalogue workflow.</p></section>;
  if (section === "stock-delivery") return <section className="mt-5 grid gap-3 sm:grid-cols-3"><Panel title="Catalogue products" value={String(data.catalogue.productCount)} /><Panel title="Available" value={data.catalogue.availableCount === undefined ? "See item evidence" : String(data.catalogue.availableCount)} /><Panel title="Stale" value={data.catalogue.staleCount === undefined ? "See item evidence" : String(data.catalogue.staleCount)} /><Link to={catalogueRoute} className="sm:col-span-3 rounded-md border border-[#469D8B] px-3 py-2 text-center text-sm font-black text-[#176B5C]">Open catalogue stock and delivery tools</Link></section>;
  return <section className="mt-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Panel title={data.supplier.id === "TEKCENTRAL" ? "Health" : "Connection"} value={data.supplier.id === "TEKCENTRAL" ? data.healthStatus : data.connectionStatus} /><Panel title="Catalogue" value={`${data.catalogue.productCount} products`} /><Panel title="Verified mappings" value={String(data.mappings.verified)} /><Panel title={data.supplier.id === "TEKCENTRAL" ? "Units on hand" : "Order attention"} value={String(data.manualOffers?.unitsOnHand ?? data.orders.attention)} /></div><SyntechProcurementControl data={data} onRefresh={onRefresh} /><SyntechFullSyncAction data={data} onRefresh={onRefresh} /><div className="mt-4 flex flex-wrap gap-2"><Link to={catalogueRoute} className="rounded-md bg-[var(--tek-accent)] px-3 py-2 text-sm font-black">{data.supplier.id === "TEKCENTRAL" ? "Manage manual offers" : "Open catalogue"}</Link><Link to={`/admin/settings/suppliers`} className="rounded-md border border-[#D0D5DD] px-3 py-2 text-sm font-black">Configure supplier settings</Link></div></section>;
}

function SyntechProcurementControl({ data, onRefresh }: { data: SupplierOperations; onRefresh: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ variant: "success" | "warning"; message: string }>();
  const state = data.syntechProcurement;
  if (data.supplier.id !== "SYNTECH" || !state) return null;
  const nextEnabled = !state.operational.enabled;
  const save = async () => {
    if (busy) return;
    setBusy(true); setFeedback(undefined);
    try {
      await apiRequest("/api/admin/suppliers/syntech/settings/api-procurement", { method: "PATCH", body: JSON.stringify({ revision: state.operational.revision, enabled: nextEnabled, confirmed: true }) });
      setConfirming(false);
      setFeedback({ variant: "success", message: `Syntech API procurement ${nextEnabled ? "enabled" : "disabled"}. Manual procurement remains available.` });
      await onRefresh();
    } catch (error) {
      setFeedback({ variant: "warning", message: error instanceof ApiError ? error.message : "Syntech API procurement settings could not be saved." });
    } finally { setBusy(false); }
  };
  const effectiveLabel = state.effectiveEnabled ? "Operational" : state.blockedBy === "DEPLOYMENT_DISABLED" ? "Blocked by deployment" : state.blockedBy === "CONFIGURATION_INCOMPLETE" ? "Configuration incomplete" : state.blockedBy === "ENVIRONMENT_NOT_APPROVED" ? "Environment not approved" : "Disabled";
  const lastResult = state.lastAttempt?.code === "RC3" ? "RC3 — Reseller accounting account could not be resolved" : state.lastAttempt ? `${state.lastAttempt.status?.replace(/_/g, " ") ?? "Recorded"}${state.lastAttempt.code ? ` — ${state.lastAttempt.code}` : ""}` : "Not recently attempted";
  return <section className="mt-5 rounded-lg border border-[#D0D5DD] bg-white p-5 shadow-sm" aria-labelledby="syntech-api-procurement-title"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div><h2 id="syntech-api-procurement-title" className="text-lg font-black">API procurement</h2><p className="mt-1 max-w-2xl text-sm font-semibold text-[#667085]">Controls future Syntech API submissions only. Approved manual procurement remains available independently.</p></div><button type="button" aria-label={`${nextEnabled ? "Enable" : "Disable"} Syntech API procurement`} disabled={busy} onClick={() => setConfirming(true)} className={`rounded-md px-4 py-2 text-sm font-black disabled:opacity-50 ${nextEnabled ? "bg-[#101828] text-white" : "border border-[#D0D5DD] bg-white"}`}>{busy ? "Saving..." : nextEnabled ? "Enable API procurement" : "Disable API procurement"}</button></div><dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><StatusItem label="Operational switch" value={state.operational.enabled ? "Enabled" : "Disabled"} /><StatusItem label="Environment" value={state.deployment.environment} /><StatusItem label="Effective state" value={effectiveLabel} /><StatusItem label="Manual fallback" value={state.manualFallbackEnabled ? "Enabled" : "Unavailable"} /><StatusItem label="Last API result" value={lastResult} /></dl>{state.lastAttempt && <p className="mt-3 text-xs font-semibold text-[#667085]">Last attempted {new Date(state.lastAttempt.at).toLocaleString("en-ZA")}. A recorded result is not a permanent health guarantee.</p>}{feedback && <div className="mt-4"><AdminFeedback variant={feedback.variant} message={feedback.message} /></div>}<ConfirmationModal open={confirming} title={`${nextEnabled ? "Enable" : "Disable"} Syntech API procurement?`} description={nextEnabled ? "This permits future staff-confirmed Syntech UAT API submissions only when deployment safety configuration also allows them. It does not place an order now, and manual procurement remains available." : "This stops future Syntech API submissions. It does not cancel submitted orders, alter customer Orders or remove external references. Manual procurement remains available where reconciliation rules permit it."} confirmLabel={nextEnabled ? "Enable API procurement" : "Disable API procurement"} busy={busy} onCancel={() => setConfirming(false)} onConfirm={() => void save()} /></section>;
}

function StatusItem({ label, value }: { label: string; value: string }) { return <div className="rounded-md bg-[#F9FAFB] p-3"><dt className="text-xs font-black uppercase tracking-[0.08em] text-[#667085]">{label}</dt><dd className="mt-1 text-sm font-black text-[#101828]">{value}</dd></div>; }

function SyntechFullSyncAction({ data, onRefresh }: { data: SupplierOperations; onRefresh: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [feedback, setFeedback] = useState<{ variant: "success" | "warning"; message: string }>();
  if (data.supplier.id !== "SYNTECH" || !data.syntechSync) return null;
  const state = data.syntechSync;
  const blockedMessage = state.blockReason === "NOT_CONFIGURED" ? "Configure Syntech before running a full sync." : state.blockReason === "SYNC_IN_PROGRESS" ? "A Syntech sync is already running." : state.blockReason === "ACCOUNT_BLOCKED" ? "The Syntech account is currently blocked." : state.blockReason === "RATE_LIMITED" ? `Request budget unavailable${state.requestBudget.rateLimitedUntil ? ` until ${new Date(state.requestBudget.rateLimitedUntil).toLocaleString("en-ZA")}` : ""}.` : undefined;
  const run = async () => {
    if (running) return;
    setRunning(true); setFeedback(undefined);
    try {
      const result = await apiRequest<{ run: { parsedCount: number; createdCount: number; updatedCount: number; missingCount: number } }>("/api/admin/suppliers/syntech/sync/full", { method: "POST" });
      setConfirming(false);
      setFeedback({ variant: "success", message: `Full sync completed: ${result.run.parsedCount} parsed, ${result.run.createdCount} created, ${result.run.updatedCount} updated, ${result.run.missingCount} missing.` });
      await onRefresh();
    } catch (error) {
      const code = error instanceof ApiError ? error.code : undefined;
      const message = code === "RATE_LIMITED" ? "Syntech is temporarily rate limited. Try again after the hold expires." : code === "ACCOUNT_BLOCKED" ? "The Syntech account is blocked." : code === "INVALID_FEED" ? "Syntech returned an invalid feed." : code === "SYNC_IN_PROGRESS" ? "A Syntech sync is already in progress." : "Syntech is currently unavailable.";
      setFeedback({ variant: "warning", message });
    } finally { setRunning(false); }
  };
  return <section className="mt-5 rounded-lg border border-[#D0D5DD] bg-white p-5 shadow-sm"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="text-lg font-black">Private catalogue sync</h2><p className="mt-1 text-sm font-semibold text-[#667085]">Request budget: {state.requestBudget.remaining} of {state.requestBudget.limit} requests available this hour.</p>{blockedMessage && <p className="mt-2 text-sm font-bold text-[#B54708]">{blockedMessage}</p>}</div><button type="button" disabled={!state.canRunFullSync || running} onClick={() => setConfirming(true)} className="rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50">{running ? "Running Full Sync..." : "Run Full Sync"}</button></div>{feedback && <div className="mt-4"><AdminFeedback variant={feedback.variant} message={feedback.message} /></div>}<ConfirmationModal open={confirming} title="Run Syntech full catalogue sync?" description="This will fetch the complete Syntech JSON catalogue and update private supplier evidence. It will not publish products, create pricing proposals, or place supplier orders." confirmLabel="Run Full Sync" busy={running} onCancel={() => setConfirming(false)} onConfirm={() => void run()} /></section>;
}
function Panel({ title, value }: { title: string; value: string }) { return <article className="rounded-lg border border-[#E4E7EC] bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase text-[#667085]">{title}</p><p className="mt-2 text-lg font-black">{value.replace(/_/g, " ")}</p></article>; }

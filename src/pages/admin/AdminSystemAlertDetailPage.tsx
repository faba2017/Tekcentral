import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AdminFeedback, AdminPageHeader, AdminShell, AdminStatusBadge } from "@/components/admin/AdminShell";
import { apiRequest } from "@/lib/api";
import type { OperationalAlert, OperationalEvent } from "@/lib/operational-alerts";
import { usePageTitle } from "@/lib/page-title";

export function AdminSystemAlertDetailPage() {
  usePageTitle("System Alert | TekCentral Ops");
  const { alertId = "" } = useParams();
  const [data, setData] = useState<{ alert: OperationalAlert; events: OperationalEvent[] }>();
  const [error, setError] = useState("");
  const load = useCallback(() => apiRequest<{ alert: OperationalAlert; events: OperationalEvent[] }>(`/api/admin/alerts/${encodeURIComponent(alertId)}`).then(setData).catch(() => setError("System alert could not be loaded.")), [alertId]);
  useEffect(() => { void load(); }, [load]);
  const acknowledge = () => apiRequest(`/api/admin/alerts/${encodeURIComponent(alertId)}/acknowledge`, { method: "POST" }).then(load).catch(() => setError("Alert acknowledgement failed."));
  if (!data) return <AdminShell><AdminPageHeader eyebrow="Operations" title="System Alert" />{error ? <div className="mt-5"><AdminFeedback variant="error" message={error} /></div> : <p className="mt-5 text-sm font-semibold">Loading alert...</p>}</AdminShell>;
  const { alert } = data;
  return <AdminShell><AdminPageHeader eyebrow={`${alert.severity} · ${alert.subsystem}`} title={alert.title} description={alert.summary} actions={<div className="flex gap-2">{alert.status === "OPEN" && <button type="button" onClick={() => void acknowledge()} className="rounded-md border border-[#2E8B78] px-4 py-2 text-sm font-black text-[#176B5C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E8B78]">Acknowledge</button>}<Link to={alert.targetRoute} className="rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E8B78]">{alert.recommendedAction}</Link></div>} />
    {error && <div className="mt-5"><AdminFeedback variant="error" message={error} /></div>}
    <section className="mt-5 grid gap-4 rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-4"><Metric label="Status" value={alert.status} /><Metric label="Occurrences" value={String(alert.occurrenceCount)} /><Metric label="Customer impact" value={String(alert.customerImpactCount)} /><Metric label="Diagnostic code" value={alert.diagnosticCode} /><Metric label="First seen" value={new Date(alert.firstSeenAt).toLocaleString("en-ZA")} /><Metric label="Last seen" value={new Date(alert.lastSeenAt).toLocaleString("en-ZA")} /><div><p className="text-xs font-black uppercase text-[#667085]">Lifecycle</p><div className="mt-2"><AdminStatusBadge label={alert.status} status={alert.status === "RESOLVED" ? "COMPLETED" : "UNDER_REVIEW"} /></div></div>{alert.entityId && <Metric label={alert.entityType ?? "Entity"} value={alert.entityId} />}</section>
    <section className="mt-5 rounded-lg border border-[#E4E7EC] bg-white p-5 shadow-sm"><h2 className="font-black">Related operational events</h2><div className="mt-4 divide-y divide-[#E4E7EC]">{data.events.map((event) => <article key={event.id} className="py-3"><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-black">{event.eventType}</p><time className="text-xs font-semibold text-[#667085]">{new Date(event.timestamp).toLocaleString("en-ZA")}</time></div><p className="mt-1 text-sm text-[#3F4652]">{event.summary}</p><p className="mt-1 text-xs font-semibold text-[#667085]">Code: {event.diagnosticCode}</p></article>)}</div></section>
  </AdminShell>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-black uppercase text-[#667085]">{label}</p><p className="mt-2 break-words text-sm font-black">{value}</p></div>; }

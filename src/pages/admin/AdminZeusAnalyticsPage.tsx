import { useEffect, useState } from "react";
import { AdminFeedback, AdminPageHeader, AdminShell } from "@/components/admin/AdminShell";
import { apiRequest } from "@/lib/api";
import { usePageTitle } from "@/lib/page-title";
import type { ZeusAnalyticsReport } from "@/lib/storefront-analytics";

export function AdminZeusAnalyticsPage() {
  usePageTitle("Zeus analytics | TekCentral Ops");
  const [data, setData] = useState<ZeusAnalyticsReport>();
  const [error, setError] = useState("");
  useEffect(() => { void apiRequest<ZeusAnalyticsReport>("/api/admin/analytics/zeus?days=30").then(setData).catch(() => setError("Zeus analytics could not be loaded.")); }, []);
  const metrics: [string, string | number][] = data ? [
    ["Requests", data.requests], ["Successful", data.successful], ["Failed", data.failed],
    ["Guest", data.guest], ["Authenticated", data.authenticated], ["Average latency", `${data.averageLatencyMs} ms`],
    ["Total tokens", data.totalTokens], ["Quota blocks", data.quotaBlocks],
    ["Provider failures", data.providerFailures], ["Tool-loop prevents", data.toolLoopPrevents],
  ] : [];
  return <AdminShell><AdminPageHeader eyebrow="Reports" title="Zeus" description="Safe usage, intent, tool and provider-health analytics without conversation content."/>
    {error && <div className="mt-5"><AdminFeedback variant="warning" message={error}/></div>}
    {data && <><section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{metrics.map(([label, value]) => <article key={label} className="rounded-lg border bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase text-[#667085]">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></article>)}</section>
      <section className="mt-6 grid gap-5 lg:grid-cols-2"><List title="Intent groups" rows={data.intents}/><List title="Tool activity" rows={data.tools}/></section>
      <section className="mt-6 rounded-lg border bg-white shadow-sm"><div className="border-b px-5 py-4"><h2 className="font-black">Recent safe activity</h2><p className="text-xs text-[#667085]">No prompts or customer identity.</p></div><div className="divide-y">{data.recent.map((item, index) => <div key={`${item.occurredAt}-${index}`} className="grid gap-1 px-5 py-3 text-sm sm:grid-cols-[160px_1fr_160px]"><strong>{item.audience}</strong><span>{item.intent.replace(/_/g, " ")}</span><span className="text-[#667085]">{item.outcome.replace(/_/g, " ")}</span></div>)}</div></section>
    </>}
  </AdminShell>;
}

function List({ title, rows }: { title: string; rows: Record<string, number> }) {
  return <article className="rounded-lg border bg-white p-5 shadow-sm"><h2 className="font-black">{title}</h2><div className="mt-4 space-y-3">{Object.entries(rows).sort((a, b) => b[1] - a[1]).map(([label, value]) => <div key={label} className="flex justify-between text-sm"><span>{label.replace(/_/g, " ")}</span><strong>{value}</strong></div>)}</div></article>;
}

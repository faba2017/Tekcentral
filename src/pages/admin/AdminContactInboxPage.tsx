import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AdminPageHeader, AdminShell, AdminStatusBadge } from "@/components/admin/AdminShell";
import { apiRequest } from "@/lib/api";
import { contactCategoryLabels } from "@/lib/contact";
import { departmentLabels, type ContactInboxResponse } from "@/lib/admin-contact";
import { usePageTitle } from "@/lib/page-title";

export function AdminContactInboxPage() {
  usePageTitle("Contact Inbox | TekCentral Ops");
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<ContactInboxResponse>();
  const [error, setError] = useState("");
  const query = params.toString();
  useEffect(() => { let active = true; void apiRequest<ContactInboxResponse>(`/api/admin/contact?${query}`).then((value) => { if (active) { setData(value); setError(""); } }).catch((reason: Error) => { if (active) setError(reason.message); }); return () => { active = false; }; }, [query]);
  const update = (key: string, value: string, resetPage = true) => { const next = new URLSearchParams(params); if (value && value !== "ALL") next.set(key, value); else next.delete(key); if (resetPage) next.set("page", "1"); setParams(next); };
  const search = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); update("search", String(new FormData(event.currentTarget).get("search") ?? "").trim()); };
  return <AdminShell>
    <AdminPageHeader eyebrow="Customer operations" title="Contact Inbox" description="Contact-form conversations and messages sent from TekCentral Admin. Direct replies received by external mailboxes are not synchronized here." actions={<Link to="/admin/contact/new" className="rounded-md bg-[#176B5C] px-4 py-2 text-sm font-black text-white">New message</Link>} />
    <form onSubmit={search} className="mt-5 flex flex-col gap-2 sm:flex-row"><label className="sr-only" htmlFor="contact-search">Search conversations</label><input id="contact-search" name="search" defaultValue={params.get("search") ?? ""} placeholder="Name, email, subject, reference or order" className="h-10 min-w-0 flex-1 rounded-md border bg-white px-3" /><button className="rounded-md border bg-white px-4 text-sm font-black">Search</button></form>
    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{["ALL", "GENERAL", "SALES", "ACCOUNTS", "SUPPORT"].map((item) => <button key={item} onClick={() => update("department", item)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-black ${(params.get("department") ?? "ALL") === item ? "bg-[#176B5C] text-white" : "border bg-white"}`}>{item === "ALL" ? "All" : departmentLabels[item as keyof typeof departmentLabels]}</button>)}<button onClick={() => update("delivery", params.get("delivery") === "FAILED" ? "ALL" : "FAILED")} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-black ${params.get("delivery") === "FAILED" ? "bg-[#B42318] text-white" : "border bg-white"}`}>Delivery failed</button></div>
    {error && <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
    <section className="mt-5 overflow-hidden rounded-lg border bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#F8F9FA] text-xs uppercase text-[#667085]"><tr><th className="p-3">Last activity</th><th className="p-3">Department</th><th className="p-3">Contact</th><th className="p-3">Subject</th><th className="p-3">Context</th><th className="p-3">Status</th><th className="p-3"></th></tr></thead><tbody className="divide-y">{data?.conversations.map((row) => <tr key={row.id}><td className="whitespace-nowrap p-3">{new Date(row.lastActivityAt).toLocaleString("en-ZA")}</td><td className="p-3"><strong>{departmentLabels[row.department]}</strong><p className="text-xs text-[#667085]">{contactCategoryLabels[row.category]}</p></td><td className="p-3"><strong>{row.contactName}</strong><p className="text-xs text-[#667085]">{row.contactEmail}</p></td><td className="max-w-xs p-3"><span className="line-clamp-2 font-bold">{row.subject}</span><p className="text-xs text-[#667085]">{row.reference}</p></td><td className="p-3 text-xs">{row.customerAccountId ? "Registered customer" : "External contact"}{row.orderNumber && <p>{row.orderNumber}</p>}</td><td className="p-3"><AdminStatusBadge label={row.deliveryState} status={row.deliveryState} /></td><td className="p-3"><Link to={`/admin/contact/${encodeURIComponent(row.id)}`} className="font-black text-[#176B5C]">Open</Link></td></tr>)}</tbody></table></div>
      {data && !data.conversations.length && <p className="p-8 text-center text-sm text-[#667085]">No conversations match these filters.</p>}
      <footer className="flex items-center justify-between border-t p-3 text-sm"><button disabled={!data || data.page <= 1} onClick={() => update("page", String((data?.page ?? 1) - 1), false)} className="rounded border px-3 py-1.5 font-bold disabled:opacity-40">Previous</button><span>Page {data?.page ?? 1} of {data?.totalPages ?? 1} · {data?.totalItems ?? 0} conversations</span><button disabled={!data || data.page >= data.totalPages} onClick={() => update("page", String((data?.page ?? 1) + 1), false)} className="rounded border px-3 py-1.5 font-bold disabled:opacity-40">Next</button></footer>
    </section>
  </AdminShell>;
}

import { useEffect, useId, useState } from "react";
import { FiCpu } from "react-icons/fi";
import { Link } from "react-router-dom";
import { ApiError, apiRequest } from "@/lib/api";
import { requestAdminAiContext, type AdminAiContextIntent, type AdminAiContextResponse, type AdminAiContextType } from "@/lib/admin-ai-context";
import { hasStaffPermission, useStaffSession } from "@/state/staff-session";

const labels: Record<AdminAiContextIntent, string> = {
  SUMMARY: "Summarize",
  BLOCKERS: "Explain blockers",
  EXPLAIN: "Explain",
  NEXT_STEPS: "Suggested next steps",
  RISK_REVIEW: "Review risks",
};

export function AdminAiContextPanel({ contextType, resourceId, intents, compact = false }: {
  contextType: AdminAiContextType;
  resourceId: string;
  intents: readonly AdminAiContextIntent[];
  compact?: boolean;
}) {
  const session = useStaffSession();
  const resultId = useId();
  const [available, setAvailable] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState<AdminAiContextIntent>();
  const [result, setResult] = useState<AdminAiContextResponse>();
  const [error, setError] = useState("");
  const permitted = hasStaffPermission(session, "admin_ai.use");

  useEffect(() => {
    let active = true;
    if (!permitted) return () => { active = false; };
    void apiRequest<{ access: { effective: boolean } }>("/api/admin/admin-ai/tutor")
      .then((response) => { if (active) setAvailable(response.access.effective); })
      .catch(() => { if (active) setAvailable(false); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [contextType, permitted, resourceId]);

  if (!permitted || checking || !available) return null;

  const run = async (intent: AdminAiContextIntent) => {
    if (busy) return;
    setBusy(intent); setError("");
    try { setResult(await requestAdminAiContext({ contextType, resourceId, intent })); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : "Admin AI could not complete this review."); }
    finally { setBusy(undefined); }
  };

  return <section aria-label="Admin AI contextual assistance" className={`rounded-lg border border-[#B2DDFF] bg-[#F5FAFF] ${compact ? "p-3" : "p-4"}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[#E0F2FE] text-[#026AA2]"><FiCpu aria-hidden="true" /></span><div><h3 className="text-sm font-black text-[#101828]">Admin AI</h3><p className="mt-0.5 text-xs font-semibold text-[#667085]">Read-only guidance from current canonical data.</p></div></div>
      <div className="flex flex-wrap gap-2">{intents.map((intent) => <button key={intent} type="button" disabled={Boolean(busy)} aria-controls={resultId} onClick={() => void run(intent)} className="rounded-md border border-[#84CAFF] bg-white px-3 py-2 text-xs font-black text-[#175CD3] disabled:cursor-wait disabled:opacity-60">{busy === intent ? "Reviewing..." : labels[intent]}</button>)}<Link to={`/admin/ai?contextType=${encodeURIComponent(contextType)}&resourceId=${encodeURIComponent(resourceId)}`} className="rounded-md bg-[#175CD3] px-3 py-2 text-xs font-black text-white">Open in Admin AI</Link></div>
    </div>
    <p className="mt-3 text-[11px] font-semibold text-[#667085]">Canonical status remains authoritative. Suggestions do not change business state.</p>
    <div id={resultId} aria-live="polite" aria-busy={Boolean(busy)}>
      {error && <p role="alert" className="mt-3 rounded-md border border-[#FDA29B] bg-[#FEF3F2] p-3 text-sm font-bold text-[#B42318]">{error}</p>}
      {result?.context.resourceId === resourceId && <div className="mt-3 rounded-md border border-[#D0D5DD] bg-white p-3"><p className="whitespace-pre-wrap text-sm font-semibold leading-6 text-[#344054]">{result.response}</p><p className="mt-3 text-[11px] font-semibold text-[#667085]">AI commentary · {result.modelRole.toLowerCase()} review{result.fallbackUsed ? " · fallback used" : ""}</p></div>}
    </div>
  </section>;
}

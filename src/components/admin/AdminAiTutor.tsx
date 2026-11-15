import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowLeft, FiArrowRight, FiHelpCircle, FiX, FiZap } from "react-icons/fi";
import { ApiError } from "@/lib/api";
import { explainAdminAiTutorTopic, getAdminAiTutor, updateAdminAiTutor, type AdminAiTutorContext } from "@/lib/admin-ai-tutor";

export function AdminAiTutor() {
  const navigate = useNavigate();
  const [context, setContext] = useState<AdminAiTutorContext>();
  const [open, setOpen] = useState(false);
  const [invitation, setInvitation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [explanation, setExplanation] = useState<string>();
  const [error, setError] = useState<string>();
  const closeRef = useRef<HTMLButtonElement>(null);

  const refresh = async () => { const next = await getAdminAiTutor(); setContext(next); return next; };
  useEffect(() => { let active = true; void getAdminAiTutor().then((next) => { if (!active) return; setContext(next); setInvitation(next.invitation); }).catch(() => undefined); return () => { active = false; }; }, []);
  useEffect(() => { if (!open) return; const prior = document.activeElement as HTMLElement | null; requestAnimationFrame(() => closeRef.current?.focus()); const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); }; document.addEventListener("keydown", onKey); return () => { document.removeEventListener("keydown", onKey); prior?.focus(); }; }, [open]);

  if (!context) return null;
  const currentIndex = Math.max(0, context.topics.findIndex((topic) => topic.id === context.preference.currentTopicId));
  const topic = context.topics[currentIndex] ?? context.topics[0];
  const mutate = async (action: "START" | "PROGRESS" | "COMPLETE" | "SKIP" | "RESTART", topicId?: string) => { setBusy(true); setError(undefined); setExplanation(undefined); try { const result = await updateAdminAiTutor(action, topicId); const next = await refresh(); setContext({ ...next, preference: result.preference }); setInvitation(false); if (action === "START" || action === "RESTART") setOpen(true); if (action === "SKIP" || action === "COMPLETE") setOpen(false); } catch (reason) { setError(reason instanceof ApiError ? reason.message : "The Admin Tour could not be updated."); } finally { setBusy(false); } };
  const move = async (index: number) => { const next = context.topics[index]; if (!next) return; await mutate("PROGRESS", next.id); };
  const explain = async () => { if (!topic) return; setBusy(true); setError(undefined); try { const result = await explainAdminAiTutorTopic(topic.id); setExplanation(result.explanation); } catch (reason) { setError(reason instanceof ApiError ? reason.message : "Admin AI is currently unavailable."); } finally { setBusy(false); } };
  const openHelp = () => { setInvitation(false); if (context.preference.status === "IN_PROGRESS") setOpen(true); else void mutate("RESTART"); };

  return <>
    <button type="button" onClick={openHelp} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#D0D5DD] bg-white px-3 text-sm font-black text-[#344054] hover:bg-[#F9FAFB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tek-accent)]"><FiHelpCircle aria-hidden="true" /> <span className="hidden sm:inline">Help</span><span className="sr-only sm:hidden">Open Admin Tour</span></button>
    {invitation && <aside aria-label="Admin AI tour invitation" className="fixed bottom-4 right-4 z-[70] w-[min(92vw,390px)] rounded-xl border border-[#B2DDFF] bg-white p-5 shadow-2xl">
      <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#E8FBF6] text-[#087A68]"><FiZap /></span><div><h2 className="text-base font-black">Welcome to TekCentral Ops</h2><p className="mt-1 text-sm font-semibold leading-5 text-[#667085]">Take a short tour based on the areas you can actually access.</p></div></div>
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void mutate("START")} className="rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black disabled:opacity-50">Start tour</button><button type="button" onClick={() => setInvitation(false)} className="rounded-md border border-[#D0D5DD] px-4 py-2 text-sm font-black">Not now</button><button type="button" disabled={busy} onClick={() => void mutate("SKIP")} className="px-3 py-2 text-sm font-black text-[#667085]">Skip tour</button></div>
    </aside>}
    {open && topic && <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#101828]/45 p-0 sm:items-center sm:p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="admin-tour-title" className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[#EAECF0] bg-white px-5 py-4"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--tek-accent-dark)]">Admin Tour · {currentIndex + 1} of {context.topics.length}</p><h2 id="admin-tour-title" className="mt-1 text-xl font-black">{topic.label}</h2></div><button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Close Admin Tour" className="grid h-10 w-10 place-items-center rounded-md hover:bg-[#F2F4F7] focus-visible:ring-2 focus-visible:ring-[var(--tek-accent)]"><FiX /></button></header>
        <div className="p-5 sm:p-7"><p className="text-sm font-semibold leading-6 text-[#475467]">{topic.description}</p>
          {topic.kind === "WELCOME" && <p className="mt-4 rounded-lg bg-[#F2F4F7] p-4 text-sm font-semibold text-[#344054]">Your {context.roleLabel} title provides context. Every topic in this tour is selected from your current effective permissions.</p>}
          {topic.kind === "AI" && <div className="mt-4 rounded-lg border border-[#B2DDFF] bg-[#EFF8FF] p-4 text-sm font-semibold leading-6 text-[#175CD3]"><p>Admin AI can explain this tour and summarize trusted supplied context.</p><p className="mt-2">It cannot change Products or pricing, approve proposals, publish, modify orders, issue refunds, run supplier operations or automate work.</p></div>}
          {topic.route && <button type="button" onClick={() => { setOpen(false); navigate(topic.route!); }} className="mt-5 rounded-md border border-[#D0D5DD] px-4 py-2 text-sm font-black">Open {topic.label}</button>}
          {context.access.effective ? <button type="button" disabled={busy} onClick={() => void explain()} className="mt-5 ml-2 inline-flex items-center gap-2 rounded-md border border-[#A6F4C5] bg-[#ECFDF3] px-4 py-2 text-sm font-black text-[#067647] disabled:opacity-50"><FiZap /> {busy ? "Generating..." : "Explain with Admin AI"}</button> : <p role="status" className="mt-5 rounded-md bg-[#FFFAEB] p-3 text-sm font-bold text-[#B54708]">Admin AI is currently unavailable. The static tour remains available.</p>}
          {explanation && <div role="status" className="mt-4 rounded-lg border border-[#D0D5DD] bg-[#F9FAFB] p-4"><p className="text-xs font-black uppercase tracking-[0.12em] text-[#667085]">Admin AI explanation</p><p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-[#344054]">{explanation}</p></div>}
          {error && <p role="alert" className="mt-4 text-sm font-bold text-[#B42318]">{error}</p>}
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EAECF0] px-5 py-4"><button type="button" disabled={busy} onClick={() => void mutate("SKIP")} className="text-sm font-black text-[#667085]">Skip tour</button><div className="flex gap-2">{currentIndex > 0 && <button type="button" disabled={busy} onClick={() => void move(currentIndex - 1)} className="inline-flex items-center gap-2 rounded-md border border-[#D0D5DD] px-4 py-2 text-sm font-black"><FiArrowLeft /> Back</button>}{currentIndex < context.topics.length - 1 ? <button type="button" disabled={busy} onClick={() => void move(currentIndex + 1)} className="inline-flex items-center gap-2 rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black">Next <FiArrowRight /></button> : <button type="button" disabled={busy} onClick={() => void mutate("COMPLETE")} className="rounded-md bg-[var(--tek-accent)] px-4 py-2 text-sm font-black">Finish tour</button>}</div></footer>
      </section>
    </div>}
  </>;
}

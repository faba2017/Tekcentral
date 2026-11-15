import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { FiArchive, FiCpu, FiEdit2, FiMessageSquare, FiPlus, FiSend, FiTrash2, FiX } from "react-icons/fi";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AdminFeedback, AdminPageHeader, AdminShell } from "@/components/admin/AdminShell";
import { ApiError, apiRequest } from "@/lib/api";
import { adminAiContextTypes, type AdminAiContextType } from "@/lib/admin-ai-context";
import { attachAdminAiContext, cancelAdminAiAction, confirmAdminAiAction, createAdminAiConversation, deleteAdminAiConversation, detachAdminAiContext, getAdminAiConversation, listAdminAiConversations, renameAdminAiConversation, retryAdminAiMessage, sendAdminAiMessage, setAdminAiConversationStatus, validAdminAiConversationId, type AdminAiAccess, type AdminAiActionCard, type AdminAiAttachment, type AdminAiConversation, type AdminAiMessage } from "@/lib/admin-ai-chat";
import { buildAdminAiTimeline } from "@/lib/admin-ai-timeline";
import { usePageTitle } from "@/lib/page-title";

const newIdempotencyKey = () => globalThis.crypto?.randomUUID?.() ?? `admin-ai-${Date.now()}-${Math.random().toString(36).slice(2)}`;
type OptimisticTurn = { requestKey: string; conversationId: string | null; content: string };
type ActionBusy = { id: string; operation: "confirm" | "cancel" };

function AdminAiProcessingIndicator() {
  return <article className="mr-auto max-w-[88%] rounded-xl border border-[#E4E7EC] bg-[#F9FAFB] px-4 py-3 text-[#101828]" role="status" aria-live="polite" aria-label="Admin AI is processing your request.">
    <p className="text-xs font-black uppercase tracking-wide text-[#667085]">Admin AI</p>
    <div className="mt-2 flex items-center gap-1.5" aria-hidden="true"><span className="h-2 w-2 rounded-full bg-[#2E8B78] motion-safe:animate-pulse" /><span className="h-2 w-2 rounded-full bg-[#2E8B78] motion-safe:animate-pulse [animation-delay:150ms]" /><span className="h-2 w-2 rounded-full bg-[#2E8B78] motion-safe:animate-pulse [animation-delay:300ms]" /></div>
    <span className="sr-only">Admin AI is processing your request.</span>
  </article>;
}

function AdminAiControlledActionCard({ action, actionBusy, access, onMutate }: { action: AdminAiActionCard; actionBusy?: ActionBusy; access?: AdminAiAccess; onMutate: (action: AdminAiActionCard, operation: "confirm" | "cancel") => void }) {
  const pendingAction = actionBusy?.id === action.id ? actionBusy.operation : undefined;
  const confirm = () => { if (action.riskLevel !== "HIGH" || window.confirm("Publish this Product? This will make the current approved Product version available according to the existing storefront publication workflow.")) onMutate(action, "confirm"); };
  return <section className={`w-full max-w-3xl rounded-xl border p-4 ${action.riskLevel === "HIGH" ? "border-[#F79009] bg-[#FFFAEB]" : "border-[#FEC84B] bg-[#FFFCF5]"}`} aria-label={`${action.toolLabel} controlled action`} aria-busy={Boolean(pendingAction)} data-admin-ai-action-id={action.id} data-admin-ai-turn-id={action.turnId}>
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-black uppercase tracking-wide text-[#B54708]">Controlled action · {action.riskLevel.toLowerCase()} risk</p><h3 className="mt-1 font-black text-[#101828]">{action.toolLabel}</h3><p className="text-sm font-semibold text-[#667085]">{action.targetLabel}</p></div><span className="rounded-full bg-[#F2F4F7] px-2.5 py-1 text-xs font-black text-[#344054]">{pendingAction === "confirm" ? "EXECUTING" : pendingAction === "cancel" ? "CANCELLING" : action.state.replaceAll("_", " ")}</span></div>
    {action.riskLevel === "HIGH" && <p className="mt-3 rounded-md bg-white p-3 text-sm font-black text-[#B54708]">Human approval required · Admin AI cannot execute this action unattended.</p>}
    <div className="mt-3 space-y-2">{action.preview.changes.map((change) => <div key={change.field} className="grid min-w-0 gap-1 rounded-lg bg-white p-3 text-sm sm:grid-cols-2"><div className="min-w-0"><span className="text-xs font-black uppercase text-[#667085]">Current {change.label}</span><p className="mt-1 break-words font-semibold text-[#475467]">{change.before || "Not set"}</p></div><div className="min-w-0"><span className="text-xs font-black uppercase text-[#176B5C]">Proposed {change.label}</span><p className="mt-1 break-words font-semibold text-[#101828]">{change.after}</p></div></div>)}</div>
    {action.preview.warnings.map((warning) => <p key={warning} className="mt-2 text-xs font-bold text-[#B54708]">{warning}</p>)}
    {pendingAction && <p className="mt-3 text-sm font-black text-[#176B5C]" role="status">{pendingAction === "confirm" ? "Applying change…" : "Cancelling action…"}</p>}
    <p className="mt-3 text-xs font-semibold text-[#667085]">Expires {new Date(action.expiresAt).toLocaleString("en-ZA")}</p>
    {action.state === "AWAITING_CONFIRMATION" && <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={Boolean(actionBusy) || !access?.effective} onClick={confirm} className="rounded-md bg-[#176B5C] px-4 py-2 text-sm font-black text-white disabled:opacity-40">{pendingAction === "confirm" ? "Applying..." : action.riskLevel === "HIGH" ? "Review & confirm publication" : "Confirm & apply"}</button><button type="button" disabled={Boolean(actionBusy)} onClick={() => onMutate(action, "cancel")} className="rounded-md border border-[#D0D5DD] bg-white px-4 py-2 text-sm font-black text-[#344054] disabled:opacity-40">{pendingAction === "cancel" ? "Cancelling..." : "Cancel"}</button></div>}
    {action.state === "FAILED" && <p className="mt-3 text-sm font-bold text-[#B42318]">The change was not applied{action.failureCode ? ` (${action.failureCode})` : ""}.</p>}
    {action.state === "SUCCEEDED" && <p className="mt-3 text-sm font-black text-[#067647]">{action.toolId === "product_publish" ? "Product published after staff confirmation." : "Product draft updated successfully."}</p>}
  </section>;
}

class AdminAiChatErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { if (import.meta.env.DEV) console.error("Admin AI workspace render failed", { error, componentStack: info.componentStack }); }
  render() { return this.state.failed ? <AdminShell><AdminPageHeader eyebrow="Internal intelligence" title="Admin AI" description="The conversation could not be displayed safely." /><div className="mt-5"><AdminFeedback variant="error" message="Admin AI encountered a display error. Reload the workspace or start a new conversation." /></div></AdminShell> : this.props.children; }
}

function AdminAiChatWorkspace() {
  usePageTitle("Admin AI | TekCentral");
  const location = useLocation(); const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requestedConversationId = params.get("conversation");
  const selectedId = validAdminAiConversationId(requestedConversationId) ? requestedConversationId : null;
  const invalidConversationLink = Boolean(requestedConversationId && !selectedId);
  const contextType = params.get("contextType"); const resourceId = params.get("resourceId");
  const pendingContext = useMemo(() => adminAiContextTypes.includes(contextType as AdminAiContextType) && resourceId ? { contextType: contextType as AdminAiContextType, resourceId } : undefined, [contextType, resourceId]);
  const [access, setAccess] = useState<AdminAiAccess>(); const [conversations, setConversations] = useState<AdminAiConversation[]>([]); const [archived, setArchived] = useState(false); const [conversationPage, setConversationPage] = useState(1); const [conversationPages, setConversationPages] = useState(1);
  const [messages, setMessages] = useState<AdminAiMessage[]>([]); const [attachments, setAttachments] = useState<AdminAiAttachment[]>([]); const [actions, setActions] = useState<AdminAiActionCard[]>([]); const [draft, setDraft] = useState(""); const [messagePage, setMessagePage] = useState(1); const [messagePages, setMessagePages] = useState(1);
  const [busy, setBusy] = useState(false); const [optimisticTurn, setOptimisticTurn] = useState<OptimisticTurn>(); const [loadedConversationId, setLoadedConversationId] = useState<string>(); const [actionBusy, setActionBusy] = useState<ActionBusy>(); const [error, setError] = useState(""); const [actionWarning, setActionWarning] = useState(""); const [sidebarOpen, setSidebarOpen] = useState(false); const endRef = useRef<HTMLDivElement>(null); const transcriptRef = useRef<HTMLDivElement>(null); const composerRef = useRef<HTMLTextAreaElement>(null); const selectedIdRef = useRef<string | null>(selectedId); const sendLockRef = useRef(false); const autoScrollRef = useRef(true);
  const loadingConversation = Boolean(selectedId && loadedConversationId !== selectedId);
  const selected = conversations.find((item) => item.id === selectedId);
  const optimisticVisible = Boolean(optimisticTurn && optimisticTurn.conversationId === selectedId);
  const timeline = useMemo(() => buildAdminAiTimeline(messages, actions), [messages, actions]);

  const loadAccess = () => apiRequest<{ adminAi: AdminAiAccess }>("/api/admin/admin-ai/access").then((value) => setAccess(value.adminAi));
  const loadList = async () => { const result = await listAdminAiConversations(archived ? "ARCHIVED" : "ACTIVE", conversationPage); setConversations(result.items); setConversationPages(Math.max(1, result.totalPages)); };
  const loadSelected = async (id: string) => { const result = await getAdminAiConversation(id); setMessages(Array.isArray(result.messages.items) ? result.messages.items : []); setMessagePage(1); setMessagePages(Math.max(1, Number(result.messages.totalPages) || 1)); setAttachments(Array.isArray(result.attachments) ? result.attachments : []); setActions(result.actions); setActionWarning(result.actionPayloadWarning ?? ""); setAccess(result.access); setLoadedConversationId(id); return result; };
  useEffect(() => { if (location.pathname === "/admin/ai/") void navigate(`/admin/ai${location.search}`, { replace: true }); }, [location.pathname, location.search, navigate]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { void loadAccess().catch(() => undefined); const timer = window.setInterval(() => void loadAccess().catch(() => undefined), 30_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { let active = true; void listAdminAiConversations(archived ? "ARCHIVED" : "ACTIVE", conversationPage).then((result) => { if (active) { setConversations(result.items); setConversationPages(Math.max(1, result.totalPages)); } }).catch(() => { if (active) setError("Conversation history could not be loaded."); }); return () => { active = false; }; }, [archived, conversationPage]);
  useEffect(() => { if (!selectedId) return; let active = true; void getAdminAiConversation(selectedId).then((result) => { if (!active) return; setMessages(Array.isArray(result.messages.items) ? result.messages.items : []); setAttachments(Array.isArray(result.attachments) ? result.attachments : []); setActions(result.actions); setActionWarning(result.actionPayloadWarning ?? ""); setAccess(result.access); setLoadedConversationId(selectedId); }).catch((cause) => { if (active) { setError(cause instanceof ApiError ? cause.message : "This conversation is not available."); setMessages([]); setAttachments([]); setActions([]); setActionWarning(""); setLoadedConversationId(selectedId); } }); return () => { active = false; }; }, [selectedId]);
  useEffect(() => { if (autoScrollRef.current) endRef.current?.scrollIntoView({ block: "nearest" }); }, [messages, actions, optimisticVisible]);
  useEffect(() => { if (!selectedId || !pendingContext || attachments.some((item) => item.contextType === pendingContext.contextType && item.resourceId === pendingContext.resourceId) || !access?.effective) return; let active = true; void attachAdminAiContext(selectedId, pendingContext.contextType, pendingContext.resourceId).then(() => getAdminAiConversation(selectedId)).then((result) => { if (active) { setMessages(result.messages.items); setAttachments(result.attachments); setAccess(result.access); } }).catch((cause) => { if (active) setError(cause instanceof ApiError ? cause.message : "Context could not be attached."); }); return () => { active = false; }; }, [selectedId, pendingContext, attachments, access?.effective]);

  const contextChips = useMemo(() => [...attachments, ...(pendingContext && !selectedId ? [{ ...pendingContext, attachedAt: "" }] : [])], [attachments, pendingContext, selectedId]);
  const send = async () => {
    const content = draft.trim(); if (sendLockRef.current || busy || !content || !access?.effective) return;
    const requestKey = newIdempotencyKey(); const originConversationId = selectedId; let targetConversationId = originConversationId;
    sendLockRef.current = true; autoScrollRef.current = true; setBusy(true); setError(""); setDraft(""); setOptimisticTurn({ requestKey, conversationId: originConversationId, content });
    try {
      if (!targetConversationId) {
        const started = await createAdminAiConversation(content); targetConversationId = started.conversation.id;
        if (selectedIdRef.current === null) { selectedIdRef.current = targetConversationId; setOptimisticTurn((current) => current?.requestKey === requestKey ? { ...current, conversationId: targetConversationId } : current); setParams({ conversation: targetConversationId }); }
        setConversationPage(1); await loadList();
      }
      const result = await sendAdminAiMessage({ conversationId: targetConversationId, content, idempotencyKey: requestKey, attachments: !originConversationId && pendingContext ? [pendingContext] : undefined });
      setConversationPage(1); await loadList();
      const stillViewingOrigin = selectedIdRef.current === targetConversationId;
      if (stillViewingOrigin) {
        await loadSelected(result.conversation.id); setOptimisticTurn((current) => current?.requestKey === requestKey ? undefined : current);
      }
    } catch (cause) {
      const stillViewingOrigin = selectedIdRef.current === (targetConversationId ?? originConversationId);
      if (stillViewingOrigin) {
        const canonical = targetConversationId ? await loadSelected(targetConversationId).catch(() => undefined) : undefined;
        const durableUserTurn = canonical?.messages.items.some((message) => message.role === "USER" && message.content === content);
        if (!durableUserTurn) setDraft((current) => current || content);
        setOptimisticTurn((current) => current?.requestKey === requestKey ? undefined : current);
        setError(cause instanceof ApiError ? cause.message : "Admin AI could not respond.");
      }
      void loadAccess().catch(() => undefined); void loadList().catch(() => undefined);
    } finally {
      sendLockRef.current = false; setBusy(false); setOptimisticTurn((current) => current?.requestKey === requestKey ? undefined : current);
      if (selectedIdRef.current === targetConversationId) window.setTimeout(() => composerRef.current?.focus(), 0);
    }
  };
  const loadOlder = async () => { if (!selectedId || messagePage >= messagePages || busy) return; setBusy(true); try { const next = messagePage + 1; const result = await getAdminAiConversation(selectedId, next); setMessages((current) => [...result.messages.items, ...current]); setMessagePage(next); setMessagePages(Math.max(1, result.messages.totalPages)); } catch { setError("Older messages could not be loaded."); } finally { setBusy(false); } };
  const mutateConversation = async (operation: () => Promise<unknown>, clear = false) => { setError(""); try { await operation(); if (clear) { setParams({}); setMessages([]); setAttachments([]); } await loadList(); if (selectedId && !clear) await loadSelected(selectedId); } catch (cause) { setError(cause instanceof ApiError ? cause.message : "Conversation could not be updated."); } };
  const mutateAction = async (action: AdminAiActionCard, operation: "confirm" | "cancel") => { if (!selectedId || actionBusy) return; const conversationId = selectedId; setActionBusy({ id: action.id, operation }); setError(""); try { await (operation === "confirm" ? confirmAdminAiAction(action.id) : cancelAdminAiAction(action.id)); if (selectedIdRef.current === conversationId) await loadSelected(conversationId); } catch (cause) { setError(cause instanceof ApiError ? cause.message : "Controlled action could not be updated."); if (selectedIdRef.current === conversationId) await loadSelected(conversationId).catch(() => undefined); } finally { setActionBusy(undefined); } };

  return <AdminShell><AdminPageHeader eyebrow="Internal intelligence" title="Admin AI" description="Private operational guidance with controlled, staff-confirmed Product draft actions." actions={<button type="button" onClick={() => { setParams({}); setMessages([]); setAttachments([]); setActions([]); setSidebarOpen(false); }} className="inline-flex items-center gap-2 rounded-md bg-[#176B5C] px-4 py-2.5 text-sm font-black text-white"><FiPlus /> New conversation</button>} />
    {error && <div className="mt-5"><AdminFeedback variant="error" message={error} /></div>}
    {invalidConversationLink && <div className="mt-5"><AdminFeedback variant="error" message="This conversation link is invalid." /></div>}
    {actionWarning && <div className="mt-5"><AdminFeedback variant="warning" message={actionWarning} /></div>}
    {loadingConversation && <div className="mt-5" role="status"><AdminFeedback variant="info" message="Loading Admin AI conversation..." /></div>}
    {access && !access.effective && <div className="mt-5"><AdminFeedback variant="warning" message="Admin AI generation is currently unavailable. Your private conversation history remains readable." /></div>}
    <div className="mt-5 grid min-h-[70vh] overflow-hidden rounded-xl border border-[#D0D5DD] bg-white shadow-sm lg:grid-cols-[290px_minmax(0,1fr)]">
      <aside className={`${sidebarOpen ? "block" : "hidden"} border-b border-[#E4E7EC] bg-[#F9FAFB] p-3 lg:block lg:border-b-0 lg:border-r`}><div className="mb-3 flex items-center justify-between"><p className="text-xs font-black uppercase tracking-wider text-[#667085]">Conversations</p><button type="button" onClick={() => { setArchived((value) => !value); setConversationPage(1); }} className="text-xs font-black text-[#176B5C]">{archived ? "Active" : "Archived"}</button></div><div className="space-y-1">{conversations.map((conversation) => <button key={conversation.id} type="button" onClick={() => { setParams({ conversation: conversation.id }); setSidebarOpen(false); }} className={`w-full rounded-md p-3 text-left ${selectedId === conversation.id ? "bg-[#EFFFFB] text-[#14584E]" : "hover:bg-white"}`}><span className="block truncate text-sm font-black">{conversation.title}</span><span className="mt-1 block text-xs font-semibold text-[#667085]">{new Date(conversation.updatedAt).toLocaleString("en-ZA")}</span></button>)}{!conversations.length && <p className="p-3 text-sm font-semibold text-[#667085]">No {archived ? "archived" : "active"} conversations.</p>}</div>{conversationPages > 1 && <div className="mt-3 flex items-center justify-between gap-2 text-xs font-black"><button type="button" disabled={conversationPage <= 1} onClick={() => setConversationPage((value) => value - 1)} className="rounded border border-[#D0D5DD] px-2 py-1 disabled:opacity-40">Previous</button><span>{conversationPage} / {conversationPages}</span><button type="button" disabled={conversationPage >= conversationPages} onClick={() => setConversationPage((value) => value + 1)} className="rounded border border-[#D0D5DD] px-2 py-1 disabled:opacity-40">Next</button></div>}</aside>
      <section className="flex min-h-[70vh] min-w-0 flex-col"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E7EC] px-4 py-3"><div className="flex items-center gap-3"><button type="button" onClick={() => setSidebarOpen((value) => !value)} className="rounded-md border border-[#D0D5DD] p-2 lg:hidden" aria-label="Toggle conversation history"><FiMessageSquare /></button><span className="grid h-9 w-9 place-items-center rounded-md bg-[#E0F2FE] text-[#026AA2]"><FiCpu /></span><div><h2 className="font-black">{selected?.title ?? "New conversation"}</h2><p className="text-xs font-semibold text-[#667085]">Controlled changes require explicit staff confirmation</p></div></div>{selected && <div className="flex gap-1"><button type="button" aria-label="Rename conversation" onClick={() => { const title = window.prompt("Conversation title", selected.title); if (title?.trim()) void mutateConversation(() => renameAdminAiConversation(selected.id, title)); }} className="rounded-md p-2 text-[#667085] hover:bg-[#F2F4F7]"><FiEdit2 /></button><button type="button" aria-label={selected.status === "ARCHIVED" ? "Unarchive conversation" : "Archive conversation"} onClick={() => void mutateConversation(() => setAdminAiConversationStatus(selected.id, selected.status === "ARCHIVED" ? "ACTIVE" : "ARCHIVED"), true)} className="rounded-md p-2 text-[#667085] hover:bg-[#F2F4F7]"><FiArchive /></button><button type="button" aria-label="Delete conversation" onClick={() => { if (window.confirm("Delete this private Admin AI conversation? This cannot be undone.")) void mutateConversation(() => deleteAdminAiConversation(selected.id), true); }} className="rounded-md p-2 text-[#B42318] hover:bg-[#FEF3F2]"><FiTrash2 /></button></div>}</div>
        {contextChips.length > 0 && <div className="flex flex-wrap gap-2 border-b border-[#E4E7EC] px-4 py-3">{contextChips.map((item) => <span key={`${item.contextType}:${item.resourceId}`} className="inline-flex max-w-full items-center gap-2 rounded-full bg-[#EFF8FF] px-3 py-1.5 text-xs font-black text-[#175CD3]"><span className="truncate">{item.contextType.replace("_", " ")} · {item.resourceId}</span>{selectedId && access?.effective && <button type="button" aria-label="Detach context" onClick={() => void mutateConversation(() => detachAdminAiContext(selectedId, item.contextType, item.resourceId))}><FiX /></button>}</span>)}</div>}
        {messagePage < messagePages && <div className="border-b border-[#E4E7EC] p-2 text-center"><button type="button" disabled={busy} onClick={() => void loadOlder()} className="rounded-md border border-[#D0D5DD] px-3 py-2 text-xs font-black text-[#344054]">Load older messages</button></div>}
        <div ref={transcriptRef} onScroll={(event) => { const element = event.currentTarget; autoScrollRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120; }} className="flex-1 space-y-4 overflow-x-hidden overflow-y-auto p-4 sm:p-6" aria-live="polite">
          {!messages.length && !optimisticVisible && <div className="mx-auto mt-16 max-w-lg text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-[#EFFFFB] text-2xl text-[#176B5C]"><FiCpu /></span><h2 className="mt-4 text-xl font-black">How can Admin AI help?</h2><p className="mt-2 text-sm font-semibold leading-6 text-[#667085]">Ask for an explanation, summary, risk review or next-step guidance. Canonical Admin state remains authoritative.</p></div>}
          {timeline.map((item) => {
            if (item.kind === "action") return <AdminAiControlledActionCard key={item.key} action={item.action} actionBusy={actionBusy} access={access} onMutate={(action, operation) => void mutateAction(action, operation)} />;
            const message = item.message;
            if (message.role === "ASSISTANT" && message.generationStatus === "PENDING") return <AdminAiProcessingIndicator key={item.key} />;
            return <article key={item.key} data-admin-ai-message-id={message.id} data-admin-ai-turn-id={message.turnId} className={`max-w-[88%] rounded-xl px-4 py-3 ${message.role === "USER" ? "ml-auto bg-[#176B5C] text-white" : "mr-auto border border-[#E4E7EC] bg-[#F9FAFB] text-[#101828]"}`}><p className="whitespace-pre-wrap break-words text-sm font-semibold leading-6">{message.generationStatus === "FAILED" ? "Admin AI could not complete this response." : message.content}</p>{message.role === "ASSISTANT" && message.generationStatus === "FAILED" && access?.effective && <button type="button" disabled={busy} onClick={() => { setBusy(true); void retryAdminAiMessage(message.conversationId, message.turnId).then(() => loadSelected(message.conversationId)).catch((cause) => setError(cause instanceof ApiError ? cause.message : "Retry failed.")).finally(() => setBusy(false)); }} className="mt-2 text-xs font-black text-[#175CD3]">Retry response</button>}{message.role === "ASSISTANT" && message.generationStatus === "COMPLETED" && <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-[#98A2B3]">AI guidance{message.requestedModelRole ? ` · ${message.requestedModelRole.toLowerCase()}` : ""}</p>}</article>;
          })}
          {optimisticVisible && <><article data-optimistic-message={optimisticTurn?.requestKey} className="ml-auto max-w-[88%] rounded-xl bg-[#176B5C] px-4 py-3 text-white"><p className="whitespace-pre-wrap break-words text-sm font-semibold leading-6">{optimisticTurn?.content}</p><p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-white/70">Sending</p></article><AdminAiProcessingIndicator /></>}
          <div ref={endRef} />
        </div>
        <div className="border-t border-[#E4E7EC] p-3 sm:p-4"><div className="flex items-end gap-2 rounded-xl border border-[#D0D5DD] bg-white p-2 focus-within:ring-2 focus-within:ring-[#2E8B78]"><textarea ref={composerRef} value={draft} disabled={!access?.effective || busy || selected?.status === "ARCHIVED"} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} rows={2} maxLength={8000} placeholder={busy ? "Admin AI is processing your request..." : access?.effective ? "Ask about current Admin operations..." : "Admin AI generation is unavailable"} className="min-h-12 flex-1 resize-none border-0 px-2 py-2 text-sm font-semibold outline-none disabled:bg-white" /><button type="button" disabled={!draft.trim() || !access?.effective || busy || selected?.status === "ARCHIVED"} onClick={() => void send()} aria-label={busy ? "Admin AI is processing your request" : "Send message"} aria-busy={busy} className="grid h-11 w-11 place-items-center rounded-lg bg-[#176B5C] text-white disabled:cursor-not-allowed disabled:opacity-40"><FiSend className={busy ? "motion-safe:animate-pulse" : ""} /></button></div><p className="mt-2 text-xs font-semibold text-[#667085]">{busy ? "Admin AI is processing your request." : "Enter to send · Shift+Enter for a new line. Product draft changes are prepared for explicit review and confirmation."}</p></div>
      </section>
    </div>
  </AdminShell>;
}

export function AdminAiChatPage() {
  return <AdminAiChatErrorBoundary><AdminAiChatWorkspace /></AdminAiChatErrorBoundary>;
}

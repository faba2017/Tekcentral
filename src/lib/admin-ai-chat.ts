import { ApiError, apiRequest } from "@/lib/api";
import type { AdminAiContextType } from "@/lib/admin-ai-context";

export type AdminAiAccess = { environmentEnabled: boolean; globalEnabled: boolean; hasPermission: boolean; effective: boolean; denialReason?: string };
export type AdminAiConversation = { id: string; title: string; status: "ACTIVE" | "ARCHIVED"; createdAt: string; updatedAt: string };
export type AdminAiMessage = { id: string; conversationId: string; turnId: string; sequence: number; role: "USER" | "ASSISTANT"; content?: string; generationStatus: "PENDING" | "COMPLETED" | "FAILED"; requestedModelRole?: "PRIMARY" | "ROUTINE"; latencyMs?: number; createdAt: string; updatedAt: string };
export type AdminAiAttachment = { contextType: AdminAiContextType; resourceId: string; attachedAt: string };
export type AdminAiActionState = ("AWAITING_CONFIRMATION" | "EXECUTING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "EXPIRED") & { replaceAll(search: string, replacement: string): string };
export type AdminAiActionCard = { id: string; conversationId: string; turnId: string; toolId: string; toolLabel: string; state: AdminAiActionState; riskLevel: "LOW" | "MEDIUM" | "HIGH"; targetType: string; targetId: string; targetLabel: string; preview: { actionLabel: string; targetLabel: string; changes: Array<{ field: string; label: string; before: string; after: string }>; warnings: string[] }; expiresAt: string; safeResult?: Record<string, unknown>; failureCode?: string };
export type Page<T> = { items: T[]; page: number; pageSize: number; totalItems: number; totalPages: number };
export type ConversationView = { conversation: AdminAiConversation; messages: Page<AdminAiMessage>; attachments: AdminAiAttachment[]; actions: AdminAiActionCard[]; access: AdminAiAccess; actionPayloadWarning?: string };

export const validAdminAiConversationId = (value: string | null | undefined) => typeof value === "string" && /^admin-ai-conversation-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const actionStates = new Set(["AWAITING_CONFIRMATION", "EXECUTING", "SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED"]);
const actionRisks = new Set(["LOW", "MEDIUM", "HIGH"]);
const stringValue = (value: unknown) => typeof value === "string" ? value : undefined;

export function normalizeAdminAiActions(value: unknown) {
  if (value === undefined) return { actions: [] as AdminAiActionCard[], warning: undefined };
  if (!Array.isArray(value)) return { actions: [] as AdminAiActionCard[], warning: "Controlled action data could not be displayed safely." };
  const actions: AdminAiActionCard[] = [];
  let invalid = false;
  for (const candidate of value) {
    const item = candidate && typeof candidate === "object" ? candidate as Record<string, unknown> : undefined;
    const preview = item?.preview && typeof item.preview === "object" ? item.preview as Record<string, unknown> : undefined;
    const changes = Array.isArray(preview?.changes) ? preview.changes.flatMap((change) => {
      const row = change && typeof change === "object" ? change as Record<string, unknown> : undefined;
      const field = stringValue(row?.field); const label = stringValue(row?.label); const before = stringValue(row?.before); const after = stringValue(row?.after);
      return field && label && before !== undefined && after !== undefined ? [{ field, label, before, after }] : [];
    }) : [];
    const state = stringValue(item?.state); const risk = stringValue(item?.riskLevel);
    if (!item || !stringValue(item.id) || !stringValue(item.conversationId) || !stringValue(item.turnId) || !stringValue(item.toolId) || !stringValue(item.toolLabel) || !state || !actionStates.has(state) || !risk || !actionRisks.has(risk) || !stringValue(item.targetType) || !stringValue(item.targetId) || !stringValue(item.targetLabel) || !preview || !stringValue(preview.actionLabel) || !stringValue(preview.targetLabel) || !stringValue(item.expiresAt) || !Array.isArray(preview.changes) || changes.length !== preview.changes.length) { invalid = true; continue; }
    actions.push({ id: item.id as string, conversationId: item.conversationId as string, turnId: item.turnId as string, toolId: item.toolId as string, toolLabel: item.toolLabel as string, state: state as AdminAiActionState, riskLevel: risk as AdminAiActionCard["riskLevel"], targetType: item.targetType as string, targetId: item.targetId as string, targetLabel: item.targetLabel as string, preview: { actionLabel: preview.actionLabel as string, targetLabel: preview.targetLabel as string, changes, warnings: Array.isArray(preview.warnings) ? preview.warnings.filter((warning): warning is string => typeof warning === "string") : [] }, expiresAt: item.expiresAt as string, ...(item.safeResult && typeof item.safeResult === "object" && !Array.isArray(item.safeResult) ? { safeResult: item.safeResult as Record<string, unknown> } : {}), ...(typeof item.failureCode === "string" ? { failureCode: item.failureCode } : {}) });
  }
  return { actions, warning: invalid ? "One controlled action could not be displayed safely. No action was enabled." : undefined };
}

function normalizeConversationView(value: unknown): ConversationView {
  if (!value || typeof value !== "object") throw new ApiError("Conversation response was invalid.", 502, "INVALID_ADMIN_AI_RESPONSE");
  const raw = value as Record<string, unknown>; const normalized = normalizeAdminAiActions(raw.actions);
  if (!raw.conversation || !raw.messages || !raw.access || !Array.isArray(raw.attachments)) throw new ApiError("Conversation response was incomplete.", 502, "INVALID_ADMIN_AI_RESPONSE");
  return { conversation: raw.conversation as AdminAiConversation, messages: raw.messages as Page<AdminAiMessage>, attachments: raw.attachments as AdminAiAttachment[], actions: normalized.actions, access: raw.access as AdminAiAccess, ...(normalized.warning ? { actionPayloadWarning: normalized.warning } : {}) };
}

export const listAdminAiConversations = (status: "ACTIVE" | "ARCHIVED", page = 1) => apiRequest<Page<AdminAiConversation>>(`/api/admin/admin-ai/conversations?status=${status}&page=${page}`);
export const createAdminAiConversation = (titleSeed: string) => apiRequest<{ conversation: AdminAiConversation }>("/api/admin/admin-ai/conversations", { method: "POST", body: JSON.stringify({ titleSeed }) });
export const getAdminAiConversation = async (id: string, page = 1) => {
  if (!validAdminAiConversationId(id)) throw new ApiError("This conversation is not available.", 400, "INVALID_ADMIN_AI_CONVERSATION_ID");
  return normalizeConversationView(await apiRequest<unknown>(`/api/admin/admin-ai/conversations/${encodeURIComponent(id)}?page=${page}`));
};
export const sendAdminAiMessage = (input: { conversationId?: string; content: string; idempotencyKey: string; attachments?: Array<{ contextType: AdminAiContextType; resourceId: string }> }) => apiRequest<{ conversation: AdminAiConversation; userMessage: AdminAiMessage; assistantMessage: AdminAiMessage; processing: boolean }>("/api/admin/admin-ai/chat/send", { method: "POST", body: JSON.stringify(input) });
export const retryAdminAiMessage = (conversationId: string, turnId: string) => apiRequest<{ assistantMessage: AdminAiMessage }>(`/api/admin/admin-ai/conversations/${encodeURIComponent(conversationId)}/turns/${encodeURIComponent(turnId)}/retry`, { method: "POST", body: "{}" });
export const renameAdminAiConversation = (id: string, title: string) => apiRequest<{ conversation: AdminAiConversation }>(`/api/admin/admin-ai/conversations/${encodeURIComponent(id)}/title`, { method: "PATCH", body: JSON.stringify({ title }) });
export const setAdminAiConversationStatus = (id: string, status: "ACTIVE" | "ARCHIVED") => apiRequest<{ conversation: AdminAiConversation }>(`/api/admin/admin-ai/conversations/${encodeURIComponent(id)}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
export const deleteAdminAiConversation = (id: string) => apiRequest<{ deleted: true }>(`/api/admin/admin-ai/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });
export const attachAdminAiContext = (id: string, contextType: AdminAiContextType, resourceId: string) => apiRequest<{ attachment: AdminAiAttachment }>(`/api/admin/admin-ai/conversations/${encodeURIComponent(id)}/contexts`, { method: "POST", body: JSON.stringify({ contextType, resourceId }) });
export const detachAdminAiContext = (id: string, contextType: AdminAiContextType, resourceId: string) => apiRequest<{ detached: boolean }>(`/api/admin/admin-ai/conversations/${encodeURIComponent(id)}/contexts?contextType=${encodeURIComponent(contextType)}&resourceId=${encodeURIComponent(resourceId)}`, { method: "DELETE" });
export const confirmAdminAiAction = (id: string) => apiRequest<{ action: AdminAiActionCard; narration?: string }>(`/api/admin/admin-ai/actions/${encodeURIComponent(id)}/confirm`, { method: "POST", body: "{}" });
export const cancelAdminAiAction = (id: string) => apiRequest<{ action: AdminAiActionCard }>(`/api/admin/admin-ai/actions/${encodeURIComponent(id)}/cancel`, { method: "POST", body: "{}" });

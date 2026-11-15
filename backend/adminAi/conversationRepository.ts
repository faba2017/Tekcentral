import { randomUUID } from "node:crypto";
import type { QueryResult, QueryResultRow } from "pg";
import { query, withTransaction } from "../persistence/postgres.js";
import type { AdminAiContextType } from "./contextual.js";
import type { AdminAiModelRole } from "./types.js";

export type AdminAiConversationStatus = "ACTIVE" | "ARCHIVED";
export type AdminAiMessageRole = "USER" | "ASSISTANT";
export type AdminAiGenerationStatus = "PENDING" | "COMPLETED" | "FAILED";

export interface AdminAiConversation {
  id: string;
  title: string;
  status: AdminAiConversationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAiSafeGenerationMetadata {
  requestedModelRole?: AdminAiModelRole;
  resolvedProvider?: string;
  resolvedModel?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  latencyMs?: number;
  fallbackUsed?: boolean;
  internalRequestId?: string;
  providerRequestId?: string;
}

export interface AdminAiMessage extends AdminAiSafeGenerationMetadata {
  id: string;
  conversationId: string;
  turnId: string;
  sequence: number;
  role: AdminAiMessageRole;
  content?: string;
  generationStatus: AdminAiGenerationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAiContextAttachment {
  contextType: AdminAiContextType;
  resourceId: string;
  attachedAt: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

type ConversationRow = { id: string; title: string; status: AdminAiConversationStatus; created_at: Date | string; updated_at: Date | string };
type MessageRow = {
  id: string; conversation_id: string; turn_id: string; sequence: string | number; role: AdminAiMessageRole; content: string | null;
  generation_status: AdminAiGenerationStatus; requested_model_role: AdminAiModelRole | null; resolved_provider: string | null;
  resolved_model: string | null; input_tokens: number | null; output_tokens: number | null; total_tokens: number | null;
  reasoning_tokens: number | null; latency_ms: number | null; fallback_used: boolean | null; internal_request_id: string | null;
  provider_request_id: string | null; created_at: Date | string; updated_at: Date | string;
};
type AttachmentRow = { context_type: AdminAiContextType; resource_id: string; attached_at: Date | string };

export class AdminAiConversationNotFoundError extends Error {
  readonly code = "ADMIN_AI_CONVERSATION_NOT_FOUND";
  readonly status = 404;
  constructor() { super("Admin AI conversation is not available."); }
}

const iso = (value: Date | string) => value instanceof Date ? value.toISOString() : new Date(value).toISOString();
const conversationDto = (row: ConversationRow): AdminAiConversation => ({ id: row.id, title: row.title, status: row.status, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) });
const messageDto = (row: MessageRow): AdminAiMessage => ({
  id: row.id, conversationId: row.conversation_id, turnId: row.turn_id, sequence: Number(row.sequence), role: row.role,
  ...(row.content === null ? {} : { content: row.content }), generationStatus: row.generation_status,
  ...(row.requested_model_role ? { requestedModelRole: row.requested_model_role } : {}),
  ...(row.resolved_provider ? { resolvedProvider: row.resolved_provider } : {}), ...(row.resolved_model ? { resolvedModel: row.resolved_model } : {}),
  ...(row.input_tokens === null ? {} : { inputTokens: row.input_tokens }), ...(row.output_tokens === null ? {} : { outputTokens: row.output_tokens }),
  ...(row.total_tokens === null ? {} : { totalTokens: row.total_tokens }), ...(row.reasoning_tokens === null ? {} : { reasoningTokens: row.reasoning_tokens }),
  ...(row.latency_ms === null ? {} : { latencyMs: row.latency_ms }), ...(row.fallback_used === null ? {} : { fallbackUsed: row.fallback_used }),
  ...(row.internal_request_id ? { internalRequestId: row.internal_request_id } : {}), ...(row.provider_request_id ? { providerRequestId: row.provider_request_id } : {}),
  createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
});
const attachmentDto = (row: AttachmentRow): AdminAiContextAttachment => ({ contextType: row.context_type, resourceId: row.resource_id, attachedAt: iso(row.attached_at) });
const boundedPage = (value?: number) => Number.isInteger(value) && Number(value) > 0 ? Number(value) : 1;
const boundedPageSize = (value?: number) => Number.isInteger(value) && Number(value) > 0 ? Math.min(Number(value), 100) : 20;
const boundedText = (value: string, maximum: number, label: string) => { const normalized = value.trim(); if (!normalized || normalized.length > maximum) throw Object.assign(new Error(`${label} must be between 1 and ${maximum} characters.`), { code: "INVALID_ADMIN_AI_CHAT_INPUT", status: 400 }); return normalized; };

type DatabaseQuery = <T extends QueryResultRow = QueryResultRow>(sql: string, parameters?: unknown[]) => Promise<QueryResult<T>>;

async function ownedConversation(client: { query: DatabaseQuery }, ownerStaffId: string, conversationId: string, lock = false) {
  const result = await client.query<ConversationRow>(`SELECT id,title,status,created_at,updated_at FROM admin_ai_conversations WHERE id=$1 AND owner_staff_id=$2${lock ? " FOR UPDATE" : ""}`, [conversationId, ownerStaffId]);
  const row = result.rows[0]; if (!row) throw new AdminAiConversationNotFoundError(); return row;
}

export async function createAdminAiConversation(ownerStaffId: string, title: string, now = new Date()) {
  const id = `admin-ai-conversation-${randomUUID()}`; const timestamp = now.toISOString();
  const result = await query<ConversationRow>("INSERT INTO admin_ai_conversations(id,owner_staff_id,title,status,created_at,updated_at) VALUES($1,$2,$3,'ACTIVE',$4,$4) RETURNING id,title,status,created_at,updated_at", [id, ownerStaffId, boundedText(title, 160, "Conversation title"), timestamp]);
  return conversationDto(result.rows[0]);
}

export async function listAdminAiConversations(ownerStaffId: string, options: { status?: AdminAiConversationStatus | "ALL"; page?: number; pageSize?: number } = {}): Promise<Page<AdminAiConversation>> {
  const page = boundedPage(options.page); const pageSize = boundedPageSize(options.pageSize); const status = options.status ?? "ACTIVE";
  const where = status === "ALL" ? "owner_staff_id=$1" : "owner_staff_id=$1 AND status=$2"; const parameters = status === "ALL" ? [ownerStaffId] : [ownerStaffId, status];
  const totalItems = Number((await query<{ count: string }>(`SELECT count(*)::text count FROM admin_ai_conversations WHERE ${where}`, parameters)).rows[0]?.count ?? 0);
  const rows = await query<ConversationRow>(`SELECT id,title,status,created_at,updated_at FROM admin_ai_conversations WHERE ${where} ORDER BY updated_at DESC,id DESC LIMIT $${parameters.length + 1} OFFSET $${parameters.length + 2}`, [...parameters, pageSize, (page - 1) * pageSize]);
  return { items: rows.rows.map(conversationDto), page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) };
}

export async function getAdminAiConversation(ownerStaffId: string, conversationId: string) {
  try { return conversationDto(await ownedConversation({ query }, ownerStaffId, conversationId)); }
  catch (error) { if (error instanceof AdminAiConversationNotFoundError) return undefined; throw error; }
}

export async function renameAdminAiConversation(ownerStaffId: string, conversationId: string, title: string, now = new Date()) {
  const result = await query<ConversationRow>("UPDATE admin_ai_conversations SET title=$3,updated_at=$4 WHERE id=$1 AND owner_staff_id=$2 RETURNING id,title,status,created_at,updated_at", [conversationId, ownerStaffId, boundedText(title, 160, "Conversation title"), now.toISOString()]);
  if (!result.rows[0]) throw new AdminAiConversationNotFoundError(); return conversationDto(result.rows[0]);
}

export async function setAdminAiConversationStatus(ownerStaffId: string, conversationId: string, status: AdminAiConversationStatus, now = new Date()) {
  const result = await query<ConversationRow>("UPDATE admin_ai_conversations SET status=$3,updated_at=$4 WHERE id=$1 AND owner_staff_id=$2 RETURNING id,title,status,created_at,updated_at", [conversationId, ownerStaffId, status, now.toISOString()]);
  if (!result.rows[0]) throw new AdminAiConversationNotFoundError(); return conversationDto(result.rows[0]);
}

export async function deleteAdminAiConversation(ownerStaffId: string, conversationId: string) {
  const result = await query("DELETE FROM admin_ai_conversations WHERE id=$1 AND owner_staff_id=$2", [conversationId, ownerStaffId]);
  if (!result.rowCount) throw new AdminAiConversationNotFoundError();
}

export async function appendAdminAiUserTurn(ownerStaffId: string, conversationId: string, input: { content: string; idempotencyKey: string }, now = new Date()) {
  const content = boundedText(input.content, 12_000, "Message"); const idempotencyKey = boundedText(input.idempotencyKey, 128, "Idempotency key");
  return withTransaction(async (client) => {
    await ownedConversation(client, ownerStaffId, conversationId, true);
    const existing = await client.query<MessageRow>("SELECT * FROM admin_ai_messages WHERE conversation_id=$1 AND role='USER' AND idempotency_key=$2", [conversationId, idempotencyKey]);
    if (existing.rows[0]) { const assistant = await client.query<MessageRow>("SELECT * FROM admin_ai_messages WHERE conversation_id=$1 AND turn_id=$2 AND role='ASSISTANT'", [conversationId, existing.rows[0].turn_id]); return { created: false, userMessage: messageDto(existing.rows[0]), assistantMessage: messageDto(assistant.rows[0]) }; }
    const pending = await client.query<{ count: string }>("SELECT count(*)::text count FROM admin_ai_messages WHERE conversation_id=$1 AND role='ASSISTANT' AND generation_status='PENDING'", [conversationId]);
    if (Number(pending.rows[0]?.count ?? 0) > 0) throw Object.assign(new Error("Wait for the current Admin AI response before sending another message."), { code: "ADMIN_AI_TURN_IN_PROGRESS", status: 409 });
    const nextSequence = Number((await client.query<{ sequence: string }>("SELECT COALESCE(max(sequence),0)+1 AS sequence FROM admin_ai_messages WHERE conversation_id=$1", [conversationId])).rows[0].sequence);
    const turnId = `admin-ai-turn-${randomUUID()}`; const timestamp = now.toISOString();
    const userId = `admin-ai-message-${randomUUID()}`; const assistantId = `admin-ai-message-${randomUUID()}`;
    const user = await client.query<MessageRow>("INSERT INTO admin_ai_messages(id,conversation_id,turn_id,sequence,role,content,generation_status,idempotency_key,created_at,updated_at) VALUES($1,$2,$3,$4,'USER',$5,'COMPLETED',$6,$7,$7) RETURNING *", [userId, conversationId, turnId, nextSequence, content, idempotencyKey, timestamp]);
    const assistant = await client.query<MessageRow>("INSERT INTO admin_ai_messages(id,conversation_id,turn_id,sequence,role,content,generation_status,created_at,updated_at) VALUES($1,$2,$3,$4,'ASSISTANT',NULL,'PENDING',$5,$5) RETURNING *", [assistantId, conversationId, turnId, nextSequence + 1, timestamp]);
    await client.query("UPDATE admin_ai_conversations SET updated_at=$3 WHERE id=$1 AND owner_staff_id=$2", [conversationId, ownerStaffId, timestamp]);
    return { created: true, userMessage: messageDto(user.rows[0]), assistantMessage: messageDto(assistant.rows[0]) };
  });
}

export async function listRecentAdminAiMessages(ownerStaffId: string, conversationId: string, limit = 20) {
  await ownedConversation({ query }, ownerStaffId, conversationId);
  const boundedLimit = Math.max(1, Math.min(Math.trunc(limit), 20));
  const rows = await query<MessageRow>("SELECT * FROM admin_ai_messages WHERE conversation_id=$1 ORDER BY sequence DESC LIMIT $2", [conversationId, boundedLimit]);
  return rows.rows.reverse().map(messageDto);
}

export async function getAdminAiTurn(ownerStaffId: string, conversationId: string, turnId: string) {
  await ownedConversation({ query }, ownerStaffId, conversationId);
  const rows = await query<MessageRow>("SELECT * FROM admin_ai_messages WHERE conversation_id=$1 AND turn_id=$2 ORDER BY sequence", [conversationId, turnId]);
  if (rows.rows.length !== 2) throw Object.assign(new Error("Admin AI turn is not available."), { code: "ADMIN_AI_TURN_NOT_AVAILABLE", status: 404 });
  return { userMessage: messageDto(rows.rows[0]), assistantMessage: messageDto(rows.rows[1]) };
}

function metadataValues(metadata: AdminAiSafeGenerationMetadata) { return [metadata.requestedModelRole ?? null, metadata.resolvedProvider ?? null, metadata.resolvedModel ?? null, metadata.inputTokens ?? null, metadata.outputTokens ?? null, metadata.totalTokens ?? null, metadata.reasoningTokens ?? null, metadata.latencyMs ?? null, metadata.fallbackUsed ?? null, metadata.internalRequestId ?? null, metadata.providerRequestId ?? null]; }

export async function completeAdminAiAssistantTurn(ownerStaffId: string, conversationId: string, turnId: string, content: string, metadata: AdminAiSafeGenerationMetadata = {}, now = new Date()) {
  return updateAssistant(ownerStaffId, conversationId, turnId, "COMPLETED", boundedText(content, 48_000, "Assistant message"), metadata, now);
}
export async function failAdminAiAssistantTurn(ownerStaffId: string, conversationId: string, turnId: string, metadata: AdminAiSafeGenerationMetadata = {}, now = new Date()) {
  return updateAssistant(ownerStaffId, conversationId, turnId, "FAILED", null, metadata, now);
}
export async function retryAdminAiAssistantTurn(ownerStaffId: string, conversationId: string, turnId: string, now = new Date()) {
  return updateAssistant(ownerStaffId, conversationId, turnId, "PENDING", null, {}, now, ["FAILED"]);
}

async function updateAssistant(ownerStaffId: string, conversationId: string, turnId: string, status: AdminAiGenerationStatus, content: string | null, metadata: AdminAiSafeGenerationMetadata, now: Date, allowed: AdminAiGenerationStatus[] = ["PENDING", "FAILED"]) {
  return withTransaction(async (client) => {
    await ownedConversation(client, ownerStaffId, conversationId, true); const timestamp = now.toISOString(); const values = metadataValues(metadata);
    const result = await client.query<MessageRow>(`UPDATE admin_ai_messages SET content=$4,generation_status=$5,requested_model_role=$6,resolved_provider=$7,resolved_model=$8,input_tokens=$9,output_tokens=$10,total_tokens=$11,reasoning_tokens=$12,latency_ms=$13,fallback_used=$14,internal_request_id=$15,provider_request_id=$16,updated_at=$17 WHERE conversation_id=$1 AND turn_id=$2 AND role='ASSISTANT' AND generation_status=ANY($3::text[]) RETURNING *`, [conversationId, turnId, allowed, content, status, ...values, timestamp]);
    if (!result.rows[0]) throw Object.assign(new Error("Admin AI turn is not available for this transition."), { code: "ADMIN_AI_TURN_NOT_AVAILABLE", status: 409 });
    await client.query("UPDATE admin_ai_conversations SET updated_at=$3 WHERE id=$1 AND owner_staff_id=$2", [conversationId, ownerStaffId, timestamp]); return messageDto(result.rows[0]);
  });
}

export async function listAdminAiMessages(ownerStaffId: string, conversationId: string, options: { page?: number; pageSize?: number } = {}): Promise<Page<AdminAiMessage>> {
  const page = boundedPage(options.page); const pageSize = boundedPageSize(options.pageSize); await ownedConversation({ query }, ownerStaffId, conversationId);
  const totalItems = Number((await query<{ count: string }>("SELECT count(*)::text count FROM admin_ai_messages WHERE conversation_id=$1", [conversationId])).rows[0]?.count ?? 0);
  const rows = await query<MessageRow>("SELECT * FROM admin_ai_messages WHERE conversation_id=$1 ORDER BY sequence ASC LIMIT $2 OFFSET $3", [conversationId, pageSize, (page - 1) * pageSize]);
  return { items: rows.rows.map(messageDto), page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) };
}

export async function listAdminAiMessagesNewestPage(ownerStaffId: string, conversationId: string, options: { page?: number; pageSize?: number } = {}): Promise<Page<AdminAiMessage>> {
  const page = boundedPage(options.page); const pageSize = boundedPageSize(options.pageSize); await ownedConversation({ query }, ownerStaffId, conversationId);
  const totalItems = Number((await query<{ count: string }>("SELECT count(*)::text count FROM admin_ai_messages WHERE conversation_id=$1", [conversationId])).rows[0]?.count ?? 0);
  const rows = await query<MessageRow>("SELECT * FROM admin_ai_messages WHERE conversation_id=$1 ORDER BY sequence DESC LIMIT $2 OFFSET $3", [conversationId, pageSize, (page - 1) * pageSize]);
  return { items: rows.rows.reverse().map(messageDto), page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) };
}

export async function listAdminAiContextAttachments(ownerStaffId: string, conversationId: string) {
  await ownedConversation({ query }, ownerStaffId, conversationId); const rows = await query<AttachmentRow>("SELECT context_type,resource_id,attached_at FROM admin_ai_context_attachments WHERE conversation_id=$1 ORDER BY attached_at,context_type,resource_id", [conversationId]); return rows.rows.map(attachmentDto);
}
export async function attachAdminAiContext(ownerStaffId: string, conversationId: string, contextType: AdminAiContextType, resourceId: string, now = new Date()) {
  const normalizedResourceId = boundedText(resourceId, 240, "Context resource ID");
  return withTransaction(async (client) => {
    await ownedConversation(client, ownerStaffId, conversationId, true);
    const existing = await client.query<AttachmentRow>("SELECT context_type,resource_id,attached_at FROM admin_ai_context_attachments WHERE conversation_id=$1 AND context_type=$2 AND resource_id=$3", [conversationId, contextType, normalizedResourceId]);
    if (existing.rows[0]) return attachmentDto(existing.rows[0]);
    const count = Number((await client.query<{ count: string }>("SELECT count(*)::text count FROM admin_ai_context_attachments WHERE conversation_id=$1", [conversationId])).rows[0]?.count ?? 0);
    if (count >= 3) throw Object.assign(new Error("Admin AI supports up to three attached contexts per conversation."), { code: "ADMIN_AI_CONTEXT_LIMIT", status: 409 });
    const result = await client.query<AttachmentRow>("INSERT INTO admin_ai_context_attachments(conversation_id,context_type,resource_id,attached_at) VALUES($1,$2,$3,$4) RETURNING context_type,resource_id,attached_at", [conversationId, contextType, normalizedResourceId, now.toISOString()]);
    return attachmentDto(result.rows[0]);
  });
}
export async function detachAdminAiContext(ownerStaffId: string, conversationId: string, contextType: AdminAiContextType, resourceId: string) {
  await ownedConversation({ query }, ownerStaffId, conversationId); const result = await query("DELETE FROM admin_ai_context_attachments WHERE conversation_id=$1 AND context_type=$2 AND resource_id=$3", [conversationId, contextType, resourceId]); return Boolean(result.rowCount);
}

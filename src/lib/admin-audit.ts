import { apiRequest } from "@/lib/api";

export type AuditActorType = "SYSTEM" | "OPS" | "STAFF_USER";
export type AuditCategory = "AUDIT" | "ACTIVITY";
export type AuditValue = { label: string; value?: string | number | boolean | null };
export interface AdminAuditRecord { id: string; timestamp: string; category: AuditCategory; actorType: AuditActorType; actorLabel: string; actorId?: string; actorRole?: string; subsystem: string; actionType: string; entityType: string; entityId: string; entityLabel: string; summary: string; before?: AuditValue[]; after?: AuditValue[]; metadata?: AuditValue[]; targetRoute: string; }
export interface AdminAuditPageResult { records: AdminAuditRecord[]; page: number; pageSize: number; totalItems: number; totalPages: number; filters: { actors: string[]; subsystems: string[]; actionTypes: string[]; entityTypes: string[] }; }
export function listAdminAudit(params: URLSearchParams) { return apiRequest<AdminAuditPageResult>(`/api/admin/audit?${params.toString()}`); }
export async function getAdminAuditRecord(id: string) { return (await apiRequest<{ record: AdminAuditRecord }>(`/api/admin/audit/${encodeURIComponent(id)}`)).record; }
export function humanizeAuditCode(value: string) { return value.toLowerCase().replace(/_/g, " ").replace(/(^|\s)\S/g, (letter: string) => letter.toUpperCase()); }

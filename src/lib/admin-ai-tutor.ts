import { apiRequest } from "@/lib/api";

export type AdminAiTutorStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";
export type AdminAiTutorAction = "START" | "PROGRESS" | "COMPLETE" | "SKIP" | "RESTART";
export interface AdminAiTutorTopic { id: string; label: string; description: string; route?: string; kind: "WELCOME" | "AREA" | "AI" | "FINISH" }
export interface AdminAiTutorContext {
  access: { environmentEnabled: boolean; globalEnabled: boolean; hasPermission: boolean; effective: boolean; denialReason?: string };
  role: string;
  roleLabel: string;
  preference: { status: AdminAiTutorStatus; currentTopicId?: string; startedAt?: string; completedAt?: string; skippedAt?: string; updatedAt?: string };
  topics: AdminAiTutorTopic[];
  invitation: boolean;
}
export const getAdminAiTutor = () => apiRequest<AdminAiTutorContext>("/api/admin/admin-ai/tutor");
export const updateAdminAiTutor = (action: AdminAiTutorAction, topicId?: string) => apiRequest<{ preference: AdminAiTutorContext["preference"] }>("/api/admin/admin-ai/tutor/state", { method: "POST", body: JSON.stringify({ action, topicId }) });
export const explainAdminAiTutorTopic = (topicId: string) => apiRequest<{ explanation: string; modelRole: "ROUTINE"; fallbackUsed: boolean }>("/api/admin/admin-ai/tutor/explain", { method: "POST", body: JSON.stringify({ topicId }) });

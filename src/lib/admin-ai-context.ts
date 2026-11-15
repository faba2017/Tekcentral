import { apiRequest } from "@/lib/api";

export const adminAiContextTypes = ["PRODUCT", "SUPPLIER", "PRICING_PROPOSAL"] as const;
export type AdminAiContextType = (typeof adminAiContextTypes)[number];
export const adminAiContextIntents = ["SUMMARY", "BLOCKERS", "EXPLAIN", "NEXT_STEPS", "RISK_REVIEW"] as const;
export type AdminAiContextIntent = (typeof adminAiContextIntents)[number];

export interface AdminAiContextResponse {
  response: string;
  context: { type: AdminAiContextType; resourceId: string; title: string; provenance: string[] };
  modelRole: "PRIMARY" | "ROUTINE";
  fallbackUsed: boolean;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number; reasoningTokens?: number };
}

export function requestAdminAiContext(input: { contextType: AdminAiContextType; resourceId: string; intent: AdminAiContextIntent }) {
  return apiRequest<AdminAiContextResponse>("/api/admin/admin-ai/context", { method: "POST", body: JSON.stringify(input) });
}


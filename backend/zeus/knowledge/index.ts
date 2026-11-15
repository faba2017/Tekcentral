import { aboutTekCentralKnowledge } from "./aboutTekCentral.js";
import { businessCustomersKnowledge } from "./businessCustomers.js";
import { shoppingGuidanceKnowledge } from "./shoppingGuidance.js";
import { supportGuidanceKnowledge } from "./supportGuidance.js";
import type { ZeusKnowledgeModule } from "./types.js";

export type { ZeusKnowledgeId, ZeusKnowledgeModule } from "./types.js";

export function selectZeusKnowledge(message: string): ZeusKnowledgeModule[] {
  const value = message.trim().toLowerCase();
  if (/\b(bulk|business|corporate|company|office procurement|quotation|quote|large order)\b/.test(value)) return [businessCustomersKnowledge];
  if (/\b(contact|support|help desk|human|person|call|email|billing|accounts|password|sign in|login)\b/.test(value)) return [supportGuidanceKnowledge];
  if (/\b(who|what)\s+(?:is|are)\s+(?:tekcentral|you)\b|\babout tekcentral\b/.test(value)) return [aboutTekCentralKnowledge];
  if (/\b(find|search|shop|recommend|compare|budget|product|router|laptop|access point|monitor|cable)\b/.test(value)) return [shoppingGuidanceKnowledge];
  return [];
}

export function composeZeusKnowledgeInstructions(modules: ZeusKnowledgeModule[]) {
  return modules.length ? `\nRelevant TekCentral knowledge:\n${modules.map((item) => `- ${item.instructions}`).join("\n")}` : "";
}

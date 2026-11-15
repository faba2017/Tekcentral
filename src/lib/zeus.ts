import type { StorePolicyKnowledge } from "./store-policy-knowledge";
import type { ZeusAction } from "./zeus-actions";

const API_URL = (import.meta.env.VITE_PUBLIC_API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
export type ZeusMessage = { role: "user" | "assistant"; content: string };
export interface ZeusProduct { id: string; slug: string; name: string; brand: string; category: string; price: number; currency: "ZAR"; shortDescription: string; image?: string; specifications: { name: string; value: string }[]; availability: { state: string; label: string; purchasable: boolean }; url: string }
export type ZeusProductMatchType = "PRIMARY_MATCH" | "ALTERNATIVE" | "RELATED_ACCESSORY";
export interface ZeusProductMatch { product: ZeusProduct; matchType: ZeusProductMatchType; matchedEvidence: string[]; unmatchedPreferences: string[]; score: number }
export interface ZeusOrder { orderNumber: string; createdAt: string; orderStatus: string; paymentStatus: string; total: number; currency: "ZAR"; itemSummary: string; trackingSummary: string; returnStatus?: string; refundStatus?: string; url: string }
export interface ZeusAddress { id: string; label: string; recipient: string; phone?: string; company?: string; addressLine1: string; addressLine2?: string; suburb: string; city: string; province: string; postalCode: string; country: string; isDefault: boolean }
export interface ZeusCart { lines: { lineId: string; productId: string; name: string; image?: string; quantity: number; unitPrice: number; lineTotal: number; availability: { state: string; label: string; purchasable: boolean } }[]; itemCount: number; subtotal: number; currency: "ZAR" }
export interface ZeusReply { requestId: string; message: string; products: ZeusProduct[]; productResults?: ZeusProductMatch[]; orders: ZeusOrder[]; addresses: ZeusAddress[]; cart?: ZeusCart; pendingCartAction?: import("./cart-api").PendingCartAction; actions?: ZeusAction[]; policy?: StorePolicyKnowledge; consentRequired?: boolean; searchPerformed?: boolean }
export type ZeusGuardAction = "LOGIN" | "SIGNUP" | "BROWSE_PRODUCTS";
export class ZeusApiError extends Error {
  constructor(message: string, public code?: string, public actions: ZeusGuardAction[] = [], public quota?: { tier: "GUEST" | "AUTHENTICATED"; remaining: number; resetAt: string }) { super(message); }
}
export async function askZeus(messages: ZeusMessage[], contextProductIds: string[] = []): Promise<ZeusReply> {
  const response = await fetch(`${API_URL}/api/zeus/chat`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages, ...(contextProductIds.length ? { contextProductIds: contextProductIds.slice(0, 8) } : {}) }) });
  const body = await response.json().catch(() => ({})) as ZeusReply & { error?: string; code?: string; actions?: ZeusGuardAction[]; quota?: { tier: "GUEST" | "AUTHENTICATED"; remaining: number; resetAt: string } };
  if (!response.ok) throw new ZeusApiError(body.error ?? "Zeus could not complete the request.", body.code, body.actions, body.quota);
  return body;
}
export async function getZeusConsent() { const response = await fetch(`${API_URL}/api/account/zeus-consent`, { credentials: "include" }); if (!response.ok) return { granted: false, version: 1 }; return response.json() as Promise<{ granted: boolean; version: number; grantedAt?: string }>; }
export async function grantZeusConsent() { const response = await fetch(`${API_URL}/api/account/zeus-consent`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" }); if (!response.ok) throw new Error("Zeus account-data permission could not be saved."); return response.json() as Promise<{ granted: boolean; version: number; grantedAt?: string }>; }
export async function revokeZeusConsent() { const response = await fetch(`${API_URL}/api/account/zeus-consent`, { method: "DELETE", credentials: "include", headers: { "Content-Type": "application/json" } }); if (!response.ok) throw new Error("Zeus account-data permission could not be revoked."); return response.json() as Promise<{ granted: boolean; version: number }>; }


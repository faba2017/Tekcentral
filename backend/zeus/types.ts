import type { StorePolicyKnowledge } from "../../src/lib/store-policy-knowledge.js";
import type { ZeusAction } from "../../src/lib/zeus-actions.js";

export type ZeusClientMessage = { role: "user" | "assistant"; content: string };

export interface ZeusToolCall { id: string; name: string; input: unknown }
export interface ZeusToolResult { toolCallId: string; name: string; input: unknown; output: unknown }

export interface ZeusProviderRequest {
  system: string;
  messages: ZeusClientMessage[];
  tools: { name: string; description: string; inputSchema: Record<string, unknown>; requiresAuthentication: boolean }[];
  toolResults?: ZeusToolResult[];
  authenticated: boolean;
  forceFinalAnswer?: boolean;
}

export interface ZeusProviderResponse {
  message?: string;
  toolCalls?: ZeusToolCall[];
  provider: string;
  model: string;
  requestId?: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}

export interface ZeusAIProvider {
  generate(request: ZeusProviderRequest): Promise<ZeusProviderResponse>;
}

export interface ZeusPublicProduct {
  id: string;
  slug: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  currency: "ZAR";
  shortDescription: string;
  image?: string;
  specifications: { name: string; value: string }[];
  availability: { state: string; label: string; purchasable: boolean };
  url: string;
}
export type ZeusProductMatchType = "PRIMARY_MATCH" | "ALTERNATIVE" | "RELATED_ACCESSORY";
export interface ZeusProductMatch { product: ZeusPublicProduct; matchType: ZeusProductMatchType; matchedEvidence: string[]; unmatchedPreferences: string[]; score: number }

export interface ZeusOrderSummary {
  orderNumber: string; createdAt: string; orderStatus: string; paymentStatus: string;
  total: number; currency: "ZAR"; itemSummary: string; trackingSummary: string;
  returnStatus?: string; refundStatus?: string; url: string;
}

export interface ZeusAddressSummary {
  id: string; label: string; recipient: string; phone?: string; company?: string;
  addressLine1: string; addressLine2?: string; suburb: string; city: string;
  province: string; postalCode: string; country: string; isDefault: boolean;
}
export interface ZeusCart { lines: { lineId: string; productId: string; name: string; image?: string; quantity: number; unitPrice: number; lineTotal: number; availability: { state: string; label: string; purchasable: boolean } }[]; itemCount: number; subtotal: number; currency: "ZAR" }
export interface ZeusPendingCartAction { pendingActionId: string; operation: "ADD" | "UPDATE" | "REMOVE"; product: { id: string; name: string; image?: string; price: number; currency: "ZAR" }; quantity: number; expiresAt: string }

export interface ZeusChatResponse {
  requestId: string;
  message: string;
  products: ZeusPublicProduct[];
  productResults?: ZeusProductMatch[];
  orders: ZeusOrderSummary[];
  addresses: ZeusAddressSummary[];
  cart?: ZeusCart;
  pendingCartAction?: ZeusPendingCartAction;
  actions?: ZeusAction[];
  policy?: StorePolicyKnowledge;
  consentRequired?: boolean;
  searchPerformed?: boolean;
}


import { apiRequest } from "./api";
export interface ServerCart { lines: { lineId: string; productId: string; name: string; image?: string; quantity: number; unitPrice: number; lineTotal: number; availability: { state: string; label: string; purchasable: boolean } }[]; itemCount: number; subtotal: number; currency: "ZAR" }
export interface PendingCartAction { pendingActionId: string; operation: "ADD" | "UPDATE" | "REMOVE"; product: { id: string; name: string; image?: string; price: number; currency: "ZAR" }; quantity: number; expiresAt: string }
export const getServerCart = () => apiRequest<ServerCart>("/api/cart");
export const replaceServerCart = (lines: { productId: string; quantity: number }[]) => apiRequest<ServerCart>("/api/cart", { method: "PUT", body: JSON.stringify({ lines }) });
export const createPendingCartAction = (operation: PendingCartAction["operation"], productId: string, quantity: number) => apiRequest<PendingCartAction>("/api/zeus/cart/actions", { method: "POST", body: JSON.stringify({ operation, productId, quantity }) });
export const confirmPendingCartAction = (id: string) => apiRequest<{ state: "CART_UPDATED" | "CART_PRICE_CHANGED"; cart?: ServerCart; replayed?: boolean; pendingActionId?: string; product?: PendingCartAction["product"]; quantity?: number; expiresAt?: string }>(`/api/zeus/cart/actions/${encodeURIComponent(id)}/confirm`, { method: "POST", body: "{}" });
export const cancelPendingCartAction = (id: string) => apiRequest<{ cancelled: true }>(`/api/zeus/cart/actions/${encodeURIComponent(id)}/cancel`, { method: "POST", body: "{}" });

import type { ContactCategory } from "./contact.js";

export type ZeusActionType = "LOGIN" | "SIGNUP" | "TRACK_GUEST_ORDER" | "VIEW_ORDER" | "VIEW_ORDERS" | "START_RETURN" | "VIEW_RETURN" | "VIEW_REFUND_POLICY" | "VIEW_RETURN_POLICY" | "VIEW_CANCELLATION_POLICY" | "VIEW_SHIPPING_POLICY" | "VIEW_PRIVACY_POLICY" | "CONTACT_SUPPORT" | "CONTACT_SALES" | "CONTACT_ACCOUNTS" | "CONTACT_TECHNICAL" | "CALL_TEKCENTRAL" | "BROWSE_PRODUCTS";
export interface ZeusAction { type: ZeusActionType; label: string; orderNumber?: string; contactCategory?: ContactCategory }

export const zeusAction = (type: ZeusActionType, label: string, detail: Pick<ZeusAction, "orderNumber" | "contactCategory"> = {}): ZeusAction => ({ type, label, ...detail });

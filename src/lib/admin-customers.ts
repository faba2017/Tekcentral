export interface AdminCustomerSummary { id: string; firstName: string; lastName: string; email: string; phone?: string; status: "ACTIVE" | "DISABLED"; createdAt: string; orderCount: number; paidOrderCount: number; paidSpend: number; latestOrder?: { orderNumber: string; createdAt: string; status: string; paymentStatus: string }; returnCount: number; openReturn: boolean }
export interface AdminCustomersResponse { customers: AdminCustomerSummary[]; page: number; pageSize: number; totalItems: number; totalPages: number; guestOrderMatch?: { orderNumber: string; guest: true } }
export interface AdminCustomerDetailResponse {
  customer: AdminCustomerSummary;
  addresses: { id: string; label: string; recipientFirstName: string; recipientLastName: string; company?: string; phone: string; addressLine1: string; addressLine2?: string; suburb: string; city: string; province: string; postalCode: string; country: string; isDefault: boolean }[];
  recentOrders: AdminCustomerOrder[];
  orders: Page<AdminCustomerOrder>;
  returns: Page<{ id: string; orderNumber: string; createdAt: string; status: string; refundStatus?: string; items: { name: string; quantity: number }[] }>;
  support: Page<{ id: string; conversationId: string; reference: string; createdAt: string; category: string; subject?: string; status: string; orderNumber?: string }>;
  zeusConsent: { active: boolean; scope: "SESSION"; usedForAccountAssistance: boolean };
  passwordHelpPath: string;
}
export interface AdminCustomerOrder { orderNumber: string; createdAt: string; paymentStatus: string; orderStatus: string; total: number; currency: string; items: { name: string; quantity: number; unitPrice: number; lineTotal: number }[]; deliveryAddress: { streetAddress: string; suburb: string; city: string; province: string; postalCode: string; country: string }; tracking?: { status?: string; carrier?: string; trackingNumber?: string; trackingUrl?: string; dispatchedAt?: string; deliveredAt?: string }; returnCount: number; refundCount: number }
interface Page<T> { rows: T[]; page: number; pageSize: number; totalItems: number; totalPages: number }

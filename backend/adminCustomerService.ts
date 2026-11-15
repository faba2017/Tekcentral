import { listAdminCustomerSupportIdentities } from "./customerAuth.js";
import { listContactEnquiries } from "./contactEnquiryRepository.js";
import { listOrders } from "./orderRepository.js";
import type { BackendOrder } from "./types.js";

export type CustomerSort = "NEWEST" | "OLDEST" | "LATEST_ORDER" | "ORDER_COUNT" | "PAID_SPEND";
export type CustomerFilter = "ALL" | "HAS_ORDERS" | "NO_ORDERS" | "OPEN_RETURN" | "RECENT_ORDER";
export interface AdminCustomerQuery { search?: string; sort?: CustomerSort; filter?: CustomerFilter; page?: number; pageSize?: number }
export type AdminCustomerSources = { identities: typeof listAdminCustomerSupportIdentities; orders: typeof listOrders; enquiries: typeof listContactEnquiries };
type Sources = AdminCustomerSources;
const sources: Sources = { identities: listAdminCustomerSupportIdentities, orders: listOrders, enquiries: listContactEnquiries };
const openReturns = new Set(["REQUESTED", "UNDER_REVIEW", "APPROVED", "AWAITING_RETURN", "RECEIVED"]);
const normalize = (value?: string) => value?.trim().toLowerCase().replace(/[^a-z0-9@+]/g, "") ?? "";
const pagination = (pageInput = 1, sizeInput = 15) => { const pageSize = [10, 15, 25, 50].includes(Math.trunc(sizeInput)) ? Math.trunc(sizeInput) : 15; return { page: Math.max(1, Math.trunc(pageInput) || 1), pageSize }; };
const paid = (order: BackendOrder) => order.payment.status === "PAID";
const currentShipment = (order: BackendOrder) => [...(order.shipments ?? [])].reverse().find((item) => item.status !== "CANCELLED") ?? order.shipment;
const safeTracking = (order: BackendOrder) => {
  const shipment = currentShipment(order); if (!shipment) return undefined;
  return "status" in shipment
    ? { status: shipment.status, carrier: shipment.courier, trackingNumber: shipment.trackingNumber, trackingUrl: /^https:\/\//i.test(shipment.trackingUrl ?? "") ? shipment.trackingUrl : undefined, dispatchedAt: shipment.dispatchedAt, deliveredAt: shipment.deliveredAt }
    : { carrier: shipment.courierName, trackingNumber: shipment.trackingNumber, trackingUrl: /^https:\/\//i.test(shipment.trackingUrl ?? "") ? shipment.trackingUrl : undefined, dispatchedAt: shipment.dispatchDate };
};
const returnCount = (orders: BackendOrder[]) => orders.reduce((sum, order) => sum + order.returns.length, 0);
const hasOpenReturn = (orders: BackendOrder[]) => orders.some((order) => order.returns.some((item) => openReturns.has(item.status)) || order.refunds.some((item) => !["REFUNDED", "REJECTED", "NOT_REQUIRED"].includes(item.status)));
const summary = (identity: Awaited<ReturnType<Sources["identities"]>>[number], orders: BackendOrder[]) => {
  const latest = orders[0];
  return { id: identity.customer.id, firstName: identity.customer.firstName, lastName: identity.customer.lastName, email: identity.customer.email, phone: identity.customer.phone, status: identity.customer.status, createdAt: identity.customer.createdAt, orderCount: orders.length, paidOrderCount: orders.filter(paid).length, paidSpend: orders.filter(paid).reduce((sum, order) => sum + order.total, 0), latestOrder: latest ? { orderNumber: latest.orderNumber, createdAt: latest.createdAt, status: latest.status, paymentStatus: latest.payment.status } : undefined, returnCount: returnCount(orders), openReturn: hasOpenReturn(orders) };
};

export class AdminCustomerError extends Error { constructor(public code: string, message: string, public status = 400) { super(message); } }

export async function listAdminCustomers(query: AdminCustomerQuery, dependencies: Sources = sources) {
  const [identities, allOrders] = await Promise.all([dependencies.identities(), dependencies.orders()]);
  const byCustomer = new Map<string, BackendOrder[]>();
  allOrders.forEach((order) => { if (order.customerAccountId) byCustomer.set(order.customerAccountId, [...(byCustomer.get(order.customerAccountId) ?? []), order]); });
  byCustomer.forEach((orders) => orders.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
  const search = normalize(query.search); const matchingOrder = search ? allOrders.find((order) => normalize(order.orderNumber) === search) : undefined;
  let rows = identities.map((identity) => summary(identity, byCustomer.get(identity.customer.id) ?? []));
  if (search) rows = rows.filter((row) => normalize(`${row.firstName}${row.lastName}`).includes(search) || normalize(row.email).includes(search) || normalize(row.phone).includes(search) || byCustomer.get(row.id)?.some((order) => normalize(order.orderNumber).includes(search)));
  const filter = query.filter ?? "ALL"; const recentCutoff = Date.now() - 30 * 86_400_000;
  rows = rows.filter((row) => filter === "ALL" || filter === "HAS_ORDERS" && row.orderCount > 0 || filter === "NO_ORDERS" && row.orderCount === 0 || filter === "OPEN_RETURN" && row.openReturn || filter === "RECENT_ORDER" && Boolean(row.latestOrder && Date.parse(row.latestOrder.createdAt) >= recentCutoff));
  const sort = query.sort ?? "NEWEST";
  rows.sort((a, b) => sort === "OLDEST" ? Date.parse(a.createdAt) - Date.parse(b.createdAt) : sort === "LATEST_ORDER" ? Date.parse(b.latestOrder?.createdAt ?? "0") - Date.parse(a.latestOrder?.createdAt ?? "0") : sort === "ORDER_COUNT" ? b.orderCount - a.orderCount : sort === "PAID_SPEND" ? b.paidSpend - a.paidSpend : Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const { page, pageSize } = pagination(query.page, query.pageSize); const totalItems = rows.length; const totalPages = Math.max(1, Math.ceil(totalItems / pageSize)); const safePage = Math.min(page, totalPages);
  return { customers: rows.slice((safePage - 1) * pageSize, safePage * pageSize), page: safePage, pageSize, totalItems, totalPages, guestOrderMatch: matchingOrder && !matchingOrder.customerAccountId ? { orderNumber: matchingOrder.orderNumber, guest: true } : undefined };
}

export async function getAdminCustomer(customerId: string, query: { ordersPage?: number; returnsPage?: number; supportPage?: number; pageSize?: number } = {}, dependencies: Sources = sources) {
  const [identities, allOrders, allEnquiries] = await Promise.all([dependencies.identities(), dependencies.orders(), dependencies.enquiries()]);
  const identity = identities.find((item) => item.customer.id === customerId); if (!identity) throw new AdminCustomerError("CUSTOMER_NOT_FOUND", "Customer not found.", 404);
  const owned = allOrders.filter((order) => order.customerAccountId === customerId).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const orderRows = owned.map((order) => ({ orderNumber: order.orderNumber, createdAt: order.createdAt, paymentStatus: order.payment.status, orderStatus: order.status, total: order.total, currency: order.currency, items: order.items.map((item) => ({ name: item.name, quantity: item.quantity, unitPrice: item.unitPrice, lineTotal: item.lineTotal })), deliveryAddress: order.deliveryAddress, tracking: safeTracking(order), returnCount: order.returns.length, refundCount: order.refunds.length }));
  const returns = owned.flatMap((order) => order.returns.map((entry) => ({ id: entry.id, orderNumber: order.orderNumber, createdAt: entry.createdAt, status: entry.status, refundStatus: order.refunds.find((refund) => refund.returnRequestId === entry.id)?.status, items: entry.items.map((item) => ({ name: item.name, quantity: item.quantity })) }))).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const support = allEnquiries.filter((entry) => entry.customerAccountId === customerId).map((entry) => ({ id: entry.id, conversationId: `conversation-${entry.id}`, reference: entry.reference, createdAt: entry.createdAt, category: entry.category, subject: entry.subject, status: entry.status, orderNumber: entry.orderVerified ? entry.orderNumber : undefined })).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const slice = <T>(rows: T[], pageInput?: number) => { const { page, pageSize } = pagination(pageInput, query.pageSize); const totalPages = Math.max(1, Math.ceil(rows.length / pageSize)); const safePage = Math.min(page, totalPages); return { rows: rows.slice((safePage - 1) * pageSize, safePage * pageSize), page: safePage, pageSize, totalItems: rows.length, totalPages }; };
  return { customer: summary(identity, owned), addresses: identity.addresses.map(({ customerAccountId: _owner, ...address }) => { void _owner; return address; }), recentOrders: orderRows.slice(0, 5), orders: slice(orderRows, query.ordersPage), returns: slice(returns, query.returnsPage), support: slice(support, query.supportPage), zeusConsent: identity.zeusConsent, passwordHelpPath: "/account?view=forgot-password" };
}

export const adminCustomerTest = { normalize };

import { toCustomerOrder } from "./customerOrderView.js";
import { getOrder, listOrders } from "./orderRepository.js";
import { getCustomerInvoiceMetadata } from "./invoiceAccessService.js";

export async function listCustomerAccountOrders(customerAccountId: string, pageInput = 1, pageSizeInput = 10) {
  const pageSize = Math.max(1, Math.min(50, Math.trunc(pageSizeInput) || 10)); const page = Math.max(1, Math.trunc(pageInput) || 1);
  const owned = (await listOrders()).filter((order) => order.customerAccountId === customerAccountId).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const total = owned.length; const totalPages = Math.max(1, Math.ceil(total / pageSize)); const safePage = Math.min(page, totalPages);
  const orders = owned.slice((safePage - 1) * pageSize, safePage * pageSize).map((order) => ({ orderNumber: order.orderNumber, createdAt: order.createdAt, orderStatus: order.status, paymentStatus: order.payment.status, returnStatus: order.returns.at(-1)?.status, refundStatus: order.refunds.at(-1)?.status, returnEligible: order.status === "DELIVERED" || order.status === "RETURN_REQUESTED", itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0), total: order.total, currency: "ZAR", primaryItem: order.items[0] ? { name: order.items[0].name } : undefined, deliverySummary: `${order.deliveryAddress.city}, ${order.deliveryAddress.province}` }));
  return { orders, page: safePage, pageSize, total, totalPages };
}

export async function getCustomerAccountOrder(customerAccountId: string, orderNumber: string) {
  const order = await getOrder(orderNumber); if (!order || order.customerAccountId !== customerAccountId) return undefined;
  const safe = toCustomerOrder(order);
  const { id: _repositoryId, ...accountOrder } = safe;
  void _repositoryId;
  return {
    ...accountOrder,
    returns: safe.returns.map(({ orderId: _orderId, ...entry }) => { void _orderId; return entry; }),
    refunds: safe.refunds.map(({ orderId: _orderId, ...entry }) => { void _orderId; return entry; }),
    returnEligible: order.status === "DELIVERED" || order.status === "RETURN_REQUESTED",
    returnStatus: order.returns.at(-1)?.status,
    refundStatus: order.refunds.at(-1)?.status,
    invoice: await getCustomerInvoiceMetadata(order.id),
  };
}

import { randomBytes } from "node:crypto";
import { getOrder, listOrders, updateOrder } from "./orderRepository.js";
import { listSupplierOrders } from "./supplierOrderRepository.js";
import { getTekCentralManualOffer, reconcileTekCentralManualReturn } from "./suppliers/tekcentral/tekcentralManualOfferRepository.js";
import type { ReturnInventoryDecision, ReturnInventoryReconciliation } from "./types.js";

const identifier = () => `return-stock-${Date.now().toString(36)}-${randomBytes(5).toString("hex")}`;
const authorised = new Set(["APPROVED", "AWAITING_RETURN", "RECEIVED"]);

async function context(returnId: string, productId: string) {
  const orders = await listOrders(); const order = orders.find((entry) => entry.returns.some((item) => item.id === returnId));
  if (!order) throw new Error("Return not found."); const request = order.returns.find((item) => item.id === returnId)!; const item = request.items.find((entry) => entry.productId === productId);
  if (!item) throw new Error("Return item not found.");
  const supplierOrder = (await listSupplierOrders()).find((entry) => entry.customerOrderNumber === order.orderNumber && entry.supplierCode === "TEKCENTRAL" && entry.status === "COMPLETED" && entry.tekcentralOperations?.stage === "FULFILLED" && entry.itemLines.some((line) => line.productId === productId));
  if (!supplierOrder) throw new Error("Only fulfilled TekCentral Manual Supplier items can be physically reconciled here.");
  const line = supplierOrder.itemLines.find((entry) => entry.productId === productId)!; const reservation = supplierOrder.tekcentralOperations!.reservations.find((entry) => entry.manualOfferId === line.supplierOfferId && entry.consumedAt);
  if (!line.supplierOfferId || !reservation) throw new Error("Fulfilment evidence is incomplete for this return item.");
  return { order, request, item, supplierOrder, line, reservation };
}

export async function receiveTekCentralReturn(input: { returnId: string; productId: string; quantity: number; actor?: string; note?: string }, now = new Date()) {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) throw new Error("Received quantity must be a positive whole number.");
  const value = await context(input.returnId, input.productId); if (!authorised.has(value.request.status)) throw new Error("Approve the return before receiving physical stock.");
  const receivedForRequest = value.item.inventoryReconciliations?.reduce((sum, entry) => sum + entry.quantity, 0) ?? 0;
  const receivedAcrossOrder = value.order.returns.flatMap((entry) => entry.items).filter((entry) => entry.productId === input.productId).flatMap((entry) => entry.inventoryReconciliations ?? []).reduce((sum, entry) => sum + entry.quantity, 0);
  if (receivedForRequest + input.quantity > value.item.quantity || receivedAcrossOrder + input.quantity > value.line.quantity) throw new Error("Received quantity exceeds the unreconciled fulfilled return quantity.");
  const timestamp = now.toISOString(); const receipt: ReturnInventoryReconciliation = { id: identifier(), supplierOrderId: value.supplierOrder.id, manualOfferId: value.line.supplierOfferId!, supplierSku: value.line.supplierSku ?? value.reservation.supplierSku, productId: input.productId, quantity: input.quantity, receivedAt: timestamp, receivedBy: input.actor?.trim() || "TekCentral Staff", inspectionState: "RECEIVED", note: input.note?.trim() || undefined };
  return updateOrder(value.order.orderNumber, (order) => ({ ...order, updatedAt: timestamp, returns: order.returns.map((request) => request.id !== input.returnId ? request : { ...request, status: "RECEIVED", updatedAt: timestamp, items: request.items.map((item) => item.productId !== input.productId ? item : { ...item, inventoryReconciliations: [...(item.inventoryReconciliations ?? []), receipt] }) }) }));
}

export async function startTekCentralReturnInspection(input: { returnId: string; productId: string; reconciliationId: string; actor?: string }, now = new Date()) {
  const value = await context(input.returnId, input.productId); if (!value.item.inventoryReconciliations?.some((entry) => entry.id === input.reconciliationId)) throw new Error("Return receipt not found."); const timestamp = now.toISOString();
  return updateOrder(value.order.orderNumber, (order) => ({ ...order, updatedAt: timestamp, returns: order.returns.map((request) => request.id !== input.returnId ? request : { ...request, updatedAt: timestamp, items: request.items.map((item) => item.productId !== input.productId ? item : { ...item, inventoryReconciliations: (item.inventoryReconciliations ?? []).map((entry) => entry.id !== input.reconciliationId || entry.inspectionState === "RECONCILED" ? entry : { ...entry, inspectionState: "DECISION_REQUIRED", inspectionStartedAt: entry.inspectionStartedAt ?? timestamp }) }) }) }));
}

export async function decideTekCentralReturn(input: { returnId: string; productId: string; reconciliationId: string; decision: ReturnInventoryDecision; actor?: string; note?: string }, now = new Date()) {
  if (!["RESTOCK_SELLABLE", "DAMAGED_WRITE_OFF", "NON_SELLABLE_WRITE_OFF"].includes(input.decision)) throw new Error("A valid inventory disposition is required.");
  const value = await context(input.returnId, input.productId); const receipt = value.item.inventoryReconciliations?.find((entry) => entry.id === input.reconciliationId); if (!receipt) throw new Error("Return receipt not found."); if (receipt.inspectionState === "RECONCILED") return getOrder(value.order.orderNumber); if (receipt.inspectionState !== "DECISION_REQUIRED" && receipt.inspectionState !== "INSPECTING") throw new Error("Start inspection before recording a stock decision.");
  await reconcileTekCentralManualReturn({ reconciliationId: receipt.id, returnId: input.returnId, orderNumber: value.order.orderNumber, supplierOrderId: receipt.supplierOrderId, offerId: receipt.manualOfferId, productId: input.productId, quantity: receipt.quantity, decision: input.decision, note: input.note, actor: input.actor }, now);
  const timestamp = now.toISOString(); return updateOrder(value.order.orderNumber, (order) => ({ ...order, updatedAt: timestamp, returns: order.returns.map((request) => request.id !== input.returnId ? request : { ...request, updatedAt: timestamp, items: request.items.map((item) => item.productId !== input.productId ? item : { ...item, inventoryReconciliations: (item.inventoryReconciliations ?? []).map((entry) => entry.id !== input.reconciliationId ? entry : { ...entry, inspectionState: "RECONCILED", decision: input.decision, reconciledAt: timestamp, reconciledBy: input.actor?.trim() || "TekCentral Staff", note: input.note?.trim() || entry.note }) }) }) }));
}

export async function getTekCentralReturnInventoryView(returnId: string) {
  const orders = await listOrders(); const order = orders.find((entry) => entry.returns.some((request) => request.id === returnId)); if (!order) return undefined; const request = order.returns.find((entry) => entry.id === returnId)!;
  const items = await Promise.all(request.items.map(async (item) => { try { const value = await context(returnId, item.productId); return { productId: item.productId, eligible: true, supplierOrderId: value.supplierOrder.id, manualOfferId: value.line.supplierOfferId, supplierSku: value.line.supplierSku, fulfilledQuantity: value.line.quantity, requestedQuantity: item.quantity, reconciliations: item.inventoryReconciliations ?? [], offer: await getTekCentralManualOffer(value.line.supplierOfferId!) }; } catch { return { productId: item.productId, eligible: false, requestedQuantity: item.quantity, reconciliations: item.inventoryReconciliations ?? [] }; } }));
  return { returnId, items };
}

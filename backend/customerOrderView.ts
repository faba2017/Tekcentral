import type { BackendOrder } from "./types.js";

export function toCustomerOrder(order: BackendOrder) {
  const {
    id: _repositoryId,
    internalNotes: _internalNotes,
    supplierAllocations: _supplierAllocations,
    operationalHold: _operationalHold,
    parcels: _parcels,
    shipments: _shipments,
    shipment: _shipment,
    customerAccountId: _customerAccountId,
    ...customerOrder
  } = order;
  void _internalNotes;
  void _repositoryId;
  void _supplierAllocations;
  void _operationalHold;
  void _parcels;
  void _shipments;
  void _shipment;
  void _customerAccountId;
  return {
    ...customerOrder,
    id: order.orderNumber,
    items: order.items.map(({ costBasis: _costBasis, ...item }) => { void _costBasis; return item; }),
    payment: {
      provider: order.payment.provider,
      status: order.payment.status,
      amount: order.payment.amount ?? order.payment.grossAmount,
      currency: order.payment.currency ?? "ZAR",
      createdAt: order.payment.createdAt,
      confirmedAt: order.payment.confirmedAt,
      updatedAt: order.payment.updatedAt,
    },
    statusHistory: order.statusHistory.map(({ status, label, createdAt }) => ({ status, label, createdAt })),
    returns: order.returns.map((entry) => ({ ...entry, orderId: order.orderNumber, items: entry.items.map(({ inventoryReconciliations: _inventoryReconciliations, ...item }) => { void _inventoryReconciliations; return item; }) })),
    refunds: order.refunds.map(({ note: _note, ...refund }) => { void _note; return { ...refund, orderId: order.orderNumber }; }),
    tracking: order.shipment && (order.shipment.courierName || order.shipment.trackingNumber || order.shipment.trackingUrl || order.shipment.dispatchDate)
      ? {
          carrier: order.shipment.courierName,
          trackingNumber: order.shipment.trackingNumber,
          trackingUrl: /^https:\/\//i.test(order.shipment.trackingUrl ?? "") ? order.shipment.trackingUrl : undefined,
          shippedAt: order.shipment.dispatchDate,
        }
      : undefined,
    shippingQuoteSnapshot: order.shippingQuoteSnapshot
      ? {
          quoteId: order.shippingQuoteSnapshot.quoteId,
          amountCharged: order.shippingQuoteSnapshot.amountCharged,
          fulfilmentGroups: order.shippingQuoteSnapshot.fulfilmentGroups.map((group) => ({
            customerLabel: group.customerLabel,
            customerDescription: group.customerDescription,
            customerCharge: group.customerCharge,
            estimate: group.estimate,
          })),
          acceptedAt: order.shippingQuoteSnapshot.acceptedAt,
          generatedAt: order.shippingQuoteSnapshot.generatedAt,
          expiresAt: order.shippingQuoteSnapshot.expiresAt,
        }
      : undefined,
  };
}

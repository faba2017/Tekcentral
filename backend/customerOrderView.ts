import type { BackendOrder } from "./types.js";

export function toCustomerOrder(order: BackendOrder) {
  const {
    internalNotes: _internalNotes,
    supplierAllocations: _supplierAllocations,
    operationalHold: _operationalHold,
    parcels: _parcels,
    shipments: _shipments,
    shipment: _shipment,
    ...customerOrder
  } = order;
  void _internalNotes;
  void _supplierAllocations;
  void _operationalHold;
  void _parcels;
  void _shipments;
  void _shipment;
  return {
    ...customerOrder,
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

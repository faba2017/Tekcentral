# Supplier Allocation

## CONFIRMED ARCHITECTURE

- Phase 5 adds internal supplier allocation records on backend orders.
- Phase 6 uses allocation records as the input for mock supplier order
  generation.
- One customer order can have multiple allocation records so future fulfilment
  can split items across suppliers or manual sourcing.
- Allocation records store order item IDs, supplier code, supplier name,
  internal fulfilment status, optional supplier reference and internal notes.
- Supplier allocation is never shown on customer-facing order pages.
- Parcel and shipment records prepare future fulfilment integration while
  keeping packed dimensions, weights and shipped quantities staff-editable.
- Generated supplier orders store allocation IDs so the same allocation is not
  ordered twice.
- Phase 6.1 additionally validates active procurement by item quantity so
  duplicated allocations cannot accidentally create duplicate active supplier
  orders.

## DEMO/INTERNAL WORKFLOW

- Known supplier codes are planning identifiers only: `SCOOP`, `PINNACLE`,
  `MIRO`, `RECTRON`, `MUSTEK`, `AXIZ`, `CJ` and `MANUAL`.
- Staff can store manual supplier order/reference numbers.
- Entering a reference does not confirm supplier acceptance.
- `APPROVE & ORDER` is modeled as internal allocation states such as
  `READY_TO_ORDER`, `ORDER_PENDING_APPROVAL` and `APPROVED_FOR_ORDER`.
- Staff can generate one or more supplier orders after allocating paid order
  items to suppliers.
- Rejected or backordered supplier orders can be reviewed and the affected items
  can be reallocated through additional supplier allocation records.
- Partial supplier confirmations allow reallocation only for the unconfirmed
  quantity.
- Partial shipment state is derived from shipment item quantities.
- Shipment quantities cannot exceed stored order quantities.

## PHASE 6.1 SAFETY RULES

- Allocation history is retained.
- Supplier order generation rejects duplicate active procurement coverage.
- Draft or ready supplier orders can be superseded by a newer generated supplier
  order.
- Approved or later supplier orders must not be silently superseded.
- Operational holds block supplier order generation.
- Supplier SKU mapping is handled on supplier orders, not on allocation records.
- Supplier allocation form changes must be saved before supplier-order
  generation. The admin UI should show unsaved allocation changes and disable
  generation with clear guidance until the allocation is persisted.
- Supplier-order generation must never fail silently. Staff should see
  generating progress, a direct generated supplier-order link on success or an
  exact backend rejection reason.

## PENDING BUSINESS POLICY

- Supplier selection rules.
- Margin and cost rules.
- Fulfilment ownership.
- Stock reservation process.

## FUTURE REAL SUPPLIER INTEGRATION

- Real supplier APIs, order submission, stock checks, cost prices and supplier
  confirmations are deferred to later phases.
- Real courier APIs and tracking integrations are deferred.
- Supplier capabilities remain pending confirmation in `docs/suppliers/`.

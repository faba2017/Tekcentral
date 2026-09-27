# Returns And Refunds

## CONFIRMED DEMO ARCHITECTURE

- Phase 4 adds `/order/:orderNumber/return`.
- Delivered orders can create return requests in the demo lifecycle.
- Return requests support selecting individual items and quantities.
- Refunds are modeled separately from order status and return status.
- Refund amounts derive from selected order item snapshots.
- Refund status changes are simulated through development-only controls.

## PLANNED FUTURE BACKEND

- Return authorization and customer communication.
- Supplier RMA mapping.
- Refund provider reconciliation.
- Warehouse or courier return tracking.

## PENDING BUSINESS POLICY

- Legal return terms.
- Warranty rules.
- Return shipping responsibility.
- Refund timing.
- Partial return eligibility.

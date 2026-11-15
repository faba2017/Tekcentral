# Returns And Refunds

Zeus Phase B may summarize the signed-in customer's customer-visible return and refund states. It does not receive inventory reconciliation, supplier return mechanics, staff notes or processor internals, and it cannot create, approve or modify a return or refund.

## CONFIRMED DEMO ARCHITECTURE

- Phase 4 adds `/order/:orderNumber/return`.
- Delivered orders can create return requests in the demo lifecycle.
- Return requests support selecting individual items and quantities.
- Refunds are modeled separately from order status and return status.
- Refund amounts derive from selected order item snapshots.
- Refund status changes are simulated through development-only controls.

## TEKCENTRAL PHYSICAL RECONCILIATION

- Fulfilled internal-supplier lines may be received against an approved canonical return in partial quantities.
- Receipt, inspection and disposition are private staff operations, separate from return and refund status.
- Only an explicit sellable disposition increases stock; damaged/non-sellable disposition records evidence without increasing sellable stock.

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

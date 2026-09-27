# Admin Returns And Refunds

## CONFIRMED ARCHITECTURE

- Phase 5 adds `/admin/returns` and `/admin/refunds`.
- Return and refund status updates are submitted to backend admin endpoints.
- Return status transitions and refund status transitions are centralized in
  backend operations code.
- Refund amounts are calculated from stored order item snapshots or selected
  return items.
- Approved refunds can be marked ready for manual PayFast dashboard handling.

## DEMO/INTERNAL WORKFLOW

- Returns can move through review, approval, awaiting return, received and
  completed states where the backend transition rules allow it.
- Refunds can move through pending, approved, processing and refunded states.
- Marking a refund complete is an internal workflow state only.
- No customer bank details are collected for PayFast refunds.
- No PayFast refund API call is executed.

## PENDING BUSINESS POLICY

- Final refund timing.
- Return shipping responsibility.
- Warranty handling.
- Staff approval requirements.

## FUTURE REAL SUPPLIER INTEGRATION

- Supplier RMA mapping and PayFast refund API execution are deferred.
- Customer-facing return communication rules are deferred.

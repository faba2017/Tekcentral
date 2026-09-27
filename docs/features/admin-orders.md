# Admin Orders

## CONFIRMED ARCHITECTURE

- Phase 5 adds `/admin`, `/admin/orders` and `/admin/orders/:orderNumber`.
- Admin pages use a separated internal shell, not the customer storefront
  header/footer.
- Admin order data is loaded from the backend order repository.
- Staff order status changes are submitted to the backend.
- Internal notes are stored on backend orders and are not shown on customer
  order pages.
- The admin activity timeline is derived from existing status history plus
  internal order records such as notes, returns, refunds and supplier
  allocations.
- Admin attention reasons are derived by the backend.
- Newly paid orders remain in the Ops paid-order alert queue until that
  specific order is opened and acknowledged. Until production staff
  authentication exists, acknowledgement is global to the demo backend store,
  not per staff user.
- Historical paid test orders can be explicitly baselined with
  `npm run admin:baseline-paid-alerts` before future paid-order alert testing.
  The command marks only existing paid, unacknowledged orders as reviewed and
  does not change payment, order or fulfilment status. It never runs
  automatically.
- Operational holds are separate from customer-facing order status.
- Packing slips are available at `/admin/orders/:orderNumber/packing-slip`.

## DEMO/INTERNAL WORKFLOW

- Direct-route access is used during development.
- Staff can move paid eligible orders through confirmed, processing, shipped and
  delivered states.
- Invalid transitions are rejected server-side.
- PayFast payment status is view-only in admin. Staff cannot mark a PayFast
  payment paid.
- Active operational holds block fulfilment transitions until released.
- Packing slips support internal picking and packing. They are not tax invoices.
- Copy actions are available for order number and customer email.

## PENDING BUSINESS POLICY

- Production staff roles and permissions.
- Final order acceptance and fulfilment procedures.
- Customer notification rules.
- Permanent attention thresholds.

## FUTURE REAL SUPPLIER INTEGRATION

- Supplier order placement will need authenticated staff controls, supplier
  adapter execution and reconciliation.

# Orders

## CONFIRMED DEMO ARCHITECTURE

- Phase 4 adds `/orders`, `/order/:orderNumber` and `/order/:orderNumber/confirmation`.
- Orders are stored in a versioned local browser repository through `OrderProvider`.
- Order numbers are readable customer-facing identifiers such as `TC-2026-000001`.
- Order items snapshot product details at purchase time and do not depend entirely on the live catalogue.
- The customer order status model is typed and centralized.
- Development-only lifecycle controls can advance local orders through test states.
- Phase 4.5 adds separate payment status to orders.

## PLANNED FUTURE BACKEND

- Persistent customer order storage.
- Authentication-linked order history.
- Payment reconciliation.
- Fulfilment orchestration.
- Supplier status synchronization.
- Customer notifications.

## PENDING BUSINESS POLICY

- Final order acceptance terms.
- Cancellation windows.
- Status names and customer communication rules.

## CONFIRMED PAYFAST SANDBOX

- Orders created for PayFast start pending payment.
- Paid state comes from backend PayFast ITN validation.
- Order detail displays order, payment, return and refund statuses separately.
- Payment retry can reuse the existing order where eligible.

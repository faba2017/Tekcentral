# Checkout

## CONFIRMED DEMO ARCHITECTURE

- Phase 4 implements a four-step checkout at `/checkout`.
- Steps are Customer, Delivery, Payment and Review.
- Checkout supports guest checkout without account-specific UI or requirements.
- Guest order creation issues a random order-scoped access credential once. The frontend keeps it in tab-scoped `sessionStorage` and attaches it only to TekCentral order/payment APIs; it is not stored in `localStorage` or included in PayFast form fields, payment references, return URLs, or ITN validation.
- Customer authentication remains optional. When a valid customer session exists, new orders store its internal account ID; guest orders store no account ID. Historical guest orders are never attached by email matching; they require the account-scoped, one-time email verification flow before ownership is assigned.
- Checkout draft data is persisted locally with no payment credentials collected.
- When signed in, empty customer fields are prefilled from the account profile and empty delivery fields may be prefilled from the default saved address. Existing checkout draft or edited values are never overwritten.
- Signed-in customers can explicitly choose another saved address. The selected values are copied into the immutable order delivery snapshot; checkout does not store only an address ID.
- Saving a new checkout address back to the account is deferred and no checkout address is saved silently.
- Delivery methods and payment methods are configuration objects, not supplier or provider integrations.
- Order creation snapshots cart products into an internal order model.
- Cart is cleared only after local order creation succeeds.
- Demo totals are calculated centrally in `src/lib/checkout-config.ts`.

## PLANNED FUTURE BACKEND

- Server-side checkout orchestration.
- Stock reservation.
- PayFast live-mode cutover after sandbox approval.
- Supplier order placement.
- Optional save-to-account control for newly entered checkout addresses.
- Email or SMS confirmations.

## PENDING BUSINESS POLICY

- VAT treatment.
- Delivery pricing.
- Fulfilment process.
- Fraud checks.

## CONFIRMED PAYFAST SANDBOX

- Checkout uses PayFast as the hosted payment option.
- The review CTA is `Pay {total} with PayFast`.
- Final review links to `/terms`, `/privacy`, `/refund-policy`, `/cancellation-policy`, and `/shipping-delivery`. The existing checkout remains non-blocking because no separate terms-consent state is part of the order contract.
- PayFast request creation happens through the backend.
- The frontend sends cart/customer details to create a server order, then sends only the order number to create the PayFast request.
- PayFast return and cancel URLs retain only the order number. Same-tab return restores secure access from `sessionStorage`; losing that tab fails closed rather than falling back to order-number-only access.
- The cart is not cleared when redirecting to PayFast.
- Collection is not shown.
Checkout availability is advisory across suppliers. TEKCENTRAL contributes only fresh `available` quantity (`onHand - reserved`) to supplier-neutral availability. The authoritative oversell boundary is the atomic reservation created after payment during controlled staff allocation; checkout never reserves manual stock itself.

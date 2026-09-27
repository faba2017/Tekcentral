# Checkout

## CONFIRMED DEMO ARCHITECTURE

- Phase 4 implements a four-step checkout at `/checkout`.
- Steps are Customer, Delivery, Payment and Review.
- Checkout supports guest checkout.
- Checkout draft data is persisted locally with no payment credentials collected.
- Delivery methods and payment methods are configuration objects, not supplier or provider integrations.
- Order creation snapshots cart products into an internal order model.
- Cart is cleared only after local order creation succeeds.
- Demo totals are calculated centrally in `src/lib/checkout-config.ts`.

## PLANNED FUTURE BACKEND

- Server-side checkout orchestration.
- Stock reservation.
- PayFast live-mode cutover after sandbox approval.
- Supplier order placement.
- Customer account saved addresses.
- Email or SMS confirmations.

## PENDING BUSINESS POLICY

- VAT treatment.
- Delivery pricing.
- Fulfilment process.
- Fraud checks.

## CONFIRMED PAYFAST SANDBOX

- Checkout uses PayFast as the hosted payment option.
- The review CTA is `Pay {total} with PayFast`.
- PayFast request creation happens through the backend.
- The frontend sends cart/customer details to create a server order, then sends only the order number to create the PayFast request.
- The cart is not cleared when redirecting to PayFast.
- Collection is not shown.

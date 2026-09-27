# Shipping Quotes

TekCentral calculates customer delivery separately from product selling prices. Product gross-margin policy never absorbs customer delivery, and checkout cannot continue when a required fulfilment group has no safe quote.

`ShippingQuote` is a short-lived backend record containing the destination, cart fingerprint, fulfilment groups, customer charge, known internal supplier cost, warnings, generation/expiry timestamps and the shipping-settings snapshot. Public responses remove supplier identity, internal routes and supplier costs.

Verified supplier mappings determine fulfilment groups. Lines sharing a local source are quoted once; international mapped variants are evaluated independently. Mixed carts sum ready group charges and tell the customer that deliveries may arrive separately.

- CJ groups reuse the read-only South Africa logistics trial and only auto-select an eligible confirmed no-ID route. A current manual FX rate is required for non-ZAR costs.
- Scoop groups use an explicit local policy. The default remains `MANUAL_QUOTE`; `ZONE_ESTIMATE` becomes available only after staff explicitly configure and enable a versioned TekCentral rate card. These estimates are not Scoop or courier quotes.
- Unmapped catalogue products retain the established TekCentral standard/express configured delivery policy.

Quotes expire after the configured validity period. Checkout revalidates before creating an order and again before PayFast payment creation. A changed charge requires customer review. Accepted orders retain an immutable shipping snapshot; later settings changes do not recalculate historical orders.

Shipping settings and their audit history are managed at `/admin/settings/shipping`. Free-shipping thresholds, supplier ordering and tracking are outside this feature.

Checkout obtains delivery options from `/api/shipping/options`; only `READY` quotes with a numeric customer charge become selectable. The endpoint also returns a customer-safe outcome so a configured manual-quote policy is distinguishable from an invalid address or technical quote failure without exposing supplier identity. Mapped Scoop/CJ fulfilment exposes Standard delivery only unless a future estimator provides a genuine Express quote. Before calculation the UI asks for an address, during calculation it shows progress, and success/failure/expiry all derive from the same quote state.

Checkout requests delivery automatically after a complete structured address is selected or entered. Manual edits are debounced, cart quantity/content changes trigger a new quote, and request sequencing prevents stale address/cart responses from replacing newer results. There is no customer-facing calculate-delivery action. South African checkout may proceed to shipping estimation when Google Address Validation is unavailable, provided the structured address is locally complete.

Internal quote diagnostics use structured codes such as `INVALID_ADDRESS`, `MISSING_LOGISTICS`, `MISSING_WEIGHT`, `MISSING_DIMENSIONS`, `STALE_LOGISTICS`, `UNSUPPORTED_FULFILMENT`, and `UNKNOWN_PRODUCT_SOURCE`. Logs contain product/group/source context but public quote responses strip these internal diagnostics and supplier details.

## Local Zone Estimation

The supplier-neutral local estimator uses structured South African destination data, complete product logistics metadata and a versioned rate card. Actual kilograms are summed by quantity. Volumetric kilograms are calculated per item as package cubic centimetres divided by the configured divisor, then summed conservatively by quantity; this is deterministic estimation rather than carton optimization. Billable weight is the greater of aggregate actual and aggregate volumetric weight.

Zone matching prioritizes configured postal-code ranges, then exact configured city names, then province fallback rules. A zone contains base charge, included kilograms, additional per-kilogram rate, minimum/optional maximum charge and an estimated transit window. The internal freight estimate is calculated first, then the configured percentage and fixed operational buffers are recorded separately before shipping-specific rounding is applied.

Shipping Settings exposes current Scoop policy, estimator enabled state, rate-card version, origin and enabled-zone count. Its admin-only tester evaluates a Scoop SKU, quantity and destination against the saved configuration and reports the match method, weight calculation, rate components, buffer, customer charge, transit window or exact blocker.

No production rates are seeded. The default rate card is disabled, version zero and empty. Material configuration changes increment the rate-card version. Quotes snapshot rate-card and calculation versions, dimensional weights, internal estimate, buffer and provenance. Public checkout responses expose only method, customer charge, estimated transit window and expiry.

Address/cart changes fail quote fingerprint validation. Revalidation also compares rate-card version and dimensional calculation values, so logistics or rate changes require a new customer review. Historical accepted order snapshots remain immutable.

## Freight Reconciliation

Estimated internal freight, actual supplier/courier freight and customer shipping charge are separate values. Operations may later record an actual freight cost against an accepted order snapshot. TekCentral derives Rand/percentage variance and `WITHIN_TOLERANCE`, `UNDER_RECOVERED` or `OVER_RECOVERED` status for internal analysis only. Reconciliation never charges, refunds or changes customer/order fulfilment state automatically.

# Internal Pricing

Phase 9C stores business pricing settings in `.data/business-settings.json` and
pricing proposals in `.data/pricing-proposals.json`. Settings include VAT,
cost bands, target gross margin, optional minimum profit, rounding, reference
retail policy, approval requirements and manual CJ foreign exchange inputs.

Gross margin divides gross profit by selling price. Markup divides gross profit
by cost. The pricing engine uses supplier cost excluding VAT and keeps these
measures separate.

Scoop uses dealer price excluding VAT as cost and Scoop retail including VAT as
a reference only. CJ uses product cost plus selected logistics cost. Non-ZAR CJ
landed cost requires a manually configured FX rate until an approved FX source
exists; the used rate, buffer and timestamp remain in the proposal snapshot.

Proposal states are `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED` and
`SUPERSEDED`. Generating or approving a proposal never updates the public
product price. Storefront publishing requires a later explicit boundary.

Pricing-setting changes are audited with previous/new values, timestamp and a
staff actor placeholder. Saving settings does not silently recalculate existing
proposals.

The approved initial cost bands target gross margin of 35%, 28%, 20% and 15%
for LOW, STANDARD, HIGH and PREMIUM costs, with minimum gross profit of R50,
R125, R300 and R750 respectively. VAT defaults to 15%, rounding to nearest R1,
reference retail to warning-only, approval to required and auto-publishing to
off.

Product pricing and customer delivery charges are separate. Customer shipping
is handled by checkout and is not absorbed into product margin. CJ supplier
logistics may form part of internal landed-cost viability, but does not replace
the separate customer delivery charge.

## Warning Severity And Market Reference

Target-margin comparison allows a tolerance of 0.10 percentage points after
customer-price rounding. For example, 34.97% against a 35% target is accepted;
a material shortfall remains visible.

Pricing proposals persist warning details as `INFO`, `WARNING` or `BLOCKING`.
Missing/invalid pricing inputs, minimum-profit failures and required FX failures
block launch readiness. Target-margin shortfalls remain warnings when minimum
profit is protected. Under `WARNING_ONLY`, a price above supplier retail remains
visible but does not block readiness. `IGNORE` omits that reference warning.
`SOFT_CEILING` retains the existing cap behavior and evaluates the capped price
against margin and minimum-profit rules.

When the rounded target-margin price exceeds a valid retail reference, the
proposal also stores a `competitiveSuggestion`. This scenario uses the reference
price and reports selling price excluding VAT, gross profit, gross margin,
markup, target/minimum-profit checks and the delta from the target price. A
profitable scenario meeting minimum profit is `VIABLE_BELOW_TARGET_MARGIN`;
otherwise it is `NOT_COMMERCIALLY_VIABLE`. It never replaces the primary proposal
or updates the storefront automatically.

`APPROVED` means staff approved that proposal record. It does not itself mean
the product is ready for publish review; mapping, logistics, stock and all
blocking commercial checks must also pass.

## Manual Overrides

Manual price overrides are exceptional proposal actions. Staff must enter a
positive selling price including VAT and a human-readable reason, then review a
non-persistent preview of VAT, profit, gross margin, markup, policy thresholds,
reference deltas and regenerated warning severities.

Confirming an override creates a new `MANUAL_OVERRIDE` proposal from the
original supplier-cost and pricing-settings snapshots. The prior active record
is retained as `SUPERSEDED`; it is never edited or deleted. Overrides follow the
normal approval requirement and do not update a public product price.

Launch readiness considers the newest non-superseded proposal only. A pending
or rejected override therefore leaves pricing not approved and does not fall
back to an older superseded approval. An approved override can proceed with
warning/info conditions, while any blocking warning still prevents readiness.

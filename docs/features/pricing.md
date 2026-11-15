# Internal Pricing

Active merchandising promotions are resolved with backend time at the canonical public Product boundary. The effective selling price is shared by homepage, Shop, Product detail, Zeus, cart, checkout and order creation. Conflicting windows are rejected; a promotion that is no longer below a changed regular price is ignored. Historical orders retain accepted item-price snapshots.

Pricing proposal approval is a supplier-neutral Product workflow. Approval records the staff actor and timestamp while retaining the source-cost, FX, policy, margin, and recommended-price snapshots used to make the decision. Approval never publishes a price; publication must explicitly create a new immutable storefront version.

## Pricing Operations Workspace

`/admin/pricing` is the decision workspace, while `/admin/settings/pricing` remains the policy authority. The operational workspace uses URL-backed Overview, Needs Approval, FX Impact and Price History views. Its summary cards navigate to canonical FX classifications or reviewable proposals, and its shared admin tables use controlled Product imagery, compact economics, semantic statuses and a single primary Review action.

Review opens an inline decision workspace for Product context, authoritative economics, recommendation, evidence and guarded approval, rejection or manual override. Approval never publishes; manual override creates a new pending proposal and preserves the superseded proposal in history. Dashboard, Product publication and FX notification links deep-link into this workspace. Admin status semantics remain green for ready/approved, amber for monitor/review, red for blocked/critical and neutral for historical or informational records.

Phase 9C stores business pricing settings in `.data/business-settings.json` and
pricing proposals in `.data/pricing-proposals.json`. Current supplier-neutral FX
quotes and bounded evidence history are stored in `.data/fx-rates.json`. Settings include VAT,
cost bands, target gross margin, optional minimum profit, rounding, reference
retail policy, approval requirements and FX freshness policy.

Gross margin divides gross profit by selling price. Markup divides gross profit
by cost. The pricing engine uses supplier cost excluding VAT and keeps these
measures separate.

Scoop uses dealer price excluding VAT as cost and Scoop retail including VAT as
a reference only. CJ uses product cost plus selected logistics cost. Non-ZAR CJ
foreign-currency cost uses the shared Frankfurter ECB reference-rate provider,
with a documented manual rate available only as a secondary fallback. FX quotes
are cached per currency pair and are fresh for 24 hours by default. A stale or
missing quote blocks normalization rather than using an invented rate. The
admin contracts are `GET /api/admin/settings/fx` and
`POST /api/admin/settings/fx/refresh`. The proposal snapshot preserves the
source amount/currency, used rate, provider, reference, timestamp and normalized
ZAR cost.

Proposal states are `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED` and
`SUPERSEDED`. Generating or approving a proposal never updates the public
product price. Storefront publishing requires a later explicit boundary.

## Foreign Currency Impact Monitoring

FX refresh evaluates only active pricing snapshots whose source currency
matches the refreshed pair. The commercial baseline is the live published
price first, then an approved unpublished price, then the current pending
proposal. Normalized-cost movement is `(current cost - baseline cost) /
baseline cost × 100`; source-currency cost remains unchanged.

Monitoring defaults to `ASSISTED`: below 3% is ignored, 3% to below 7% is
monitored, 7% to below 12% requires review, and 12% or more is critical.
Margin or minimum-profit failure escalates unfavorable movement. Favorable
movement is informational and does not force a customer price reduction.

`MANUAL` records assessments without generating proposals. `ASSISTED` creates
or reuses `PENDING_APPROVAL` proposals for review and critical impacts.
`AUTO_WITH_GUARDRAILS` is reserved configuration only and does not approve or
publish prices. Impact records and deduplicated attention fingerprints are
stored in `.data/fx-pricing-impacts.json`. Published versions and historical
order snapshots remain immutable.

## Scheduled Reconciliation

`runFxPricingReconciliation()` discovers required source-currency/ZAR pairs
from active foreign-currency pricing snapshots. It reuses fresh quotes,
refreshes each stale or missing pair once, reconciles impacts and proposals,
and stores a compact run summary in `.data/fx-reconciliation-runs.json`.
Runs are process-locked so concurrent scheduled/manual triggers share one
execution. The default cadence is 24 hours.

The in-process scheduler is enabled automatically only in production, or
explicitly with `FX_SCHEDULER_ENABLED=true`; development and tests make no
scheduled external requests. It is suitable for a single backend instance.
A future cron, n8n workflow or cloud scheduler can invoke
`POST /api/admin/pricing/fx/reconcile` without duplicating business logic.

Pricing attention counts unique Products with unresolved `REVIEW` or
`CRITICAL` impacts. `IGNORE` and `MONITOR` are excluded, and an approved
replacement price resolves FX pricing attention even if publication remains a
separate next step. Repeated unchanged runs do not duplicate proposals or
notifications.

Actionable `REVIEW` and `CRITICAL` impact fingerprints also create an internal
email notification through the existing SMTP transport. `IGNORE` and `MONITOR`
remain in-app evidence only. The default recipient is
`reports@tekcentral.co.za` and can be overridden with the backend-only
`FX_PRICING_NOTIFICATION_EMAIL` setting. Deduplication includes Product,
supplier-offer context, classification and the material impact fingerprint;
unchanged reconciliation runs cannot send again, while a failed SMTP delivery
remains retryable. Email failure never rolls back the impact assessment or a
pending proposal, and neither notification nor retry approves or publishes a
price.

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

## Syntech evidence

Syntech pricing uses ZAR dealer cost excluding VAT through the shared pricing engine. Active promotional cost can become the proposal cost basis; normal cost, promotion dates, RRP including VAT, recommended margin, source observation, and fingerprint remain internal evidence. RRP is reference-only and generated proposals remain pending staff approval.

## TekCentral Manual Supplier evidence

Manual Supplier cost is stored in ZAR excluding VAT, matching the shared pricing engine's canonical cost convention. Cost observations use the configured supplier source-price freshness threshold and retain a deterministic evidence fingerprint. Phase A does not automatically generate, approve, supersede, or publish pricing proposals when staff edits an offer. Existing approved/public prices and immutable historical order cost bases remain unchanged.

Phase B adds an explicit staff action to generate a proposal from current verified Manual Supplier cost. The shared engine applies configured VAT, gross-margin bands, minimum gross profit, rounding, and warning policy. Proposals require normal approval and never auto-publish.

Each cost update records old/new cost, reason, actor, timestamp, and fingerprint. Stale cost blocks proposal generation until current evidence is recorded.
Operational pricing visibility reuses existing FX impact classifications and proposal state. REVIEW maps to Warning and CRITICAL maps to Critical when raised; alerts link to the pricing workspace and never recalculate, approve or mutate prices.
## Audit projection

Pricing approval and rejection actions project safe status and effective-price summaries into Admin Audit / Activity. Supplier payloads and credentials are never copied into audit.

# Business Rules

## CONFIRMED

- The platform is South Africa first.
- The platform should support B2C and B2B use cases.
- Supplier capabilities must be confirmed before implementation.
- The app must remain supplier-independent.
- The store should use an internal product model rather than rendering supplier-specific objects directly.
- Zeus must be preserved unless explicit approval is given.
- Phase 3 catalogue products, prices and availability are demo data only.
- Phase 3 cart state is frontend-only and does not reserve stock, create orders or process payments.
- Checkout, account, contact, quote and Zeus assistant experiences are polished frontend surfaces only until backend services are approved.
- Phase 4 checkout, orders, cancellations, returns and refunds are frontend demo flows only and use local browser persistence.
- Phase 4 order numbers use readable TekCentral demo numbering such as `TC-2026-000001`.
- PayFast is the first payment gateway path and is sandbox-only in Phase 4.5.
- Phase 5 admin operations are development/internal only and are not production
  staff tooling.
- Phase 6 supplier orchestration is mock-only and does not contact external
  suppliers.
- Phase 6.1 enforces one active supplier procurement path per customer order
  item quantity.
- Phase 7A-CJ is read-only against CJ and does not place supplier orders.
- Phase 7B-CJ allows staff-approved unpaid CJ order creation only after
  verified mapping, operational hold, logistics and idempotency checks pass.

## PLANNED

Commerce should eventually support:

- ZAR pricing
- Product markup
- Business quotations
- Product sales
- TekCentral Business IT solution packages
- Installation opportunities
- Configuration opportunities
- Remote setup opportunities
- Support or maintenance packages

Supplier selection may eventually consider:

- Availability
- Cost
- Delivery time
- Location
- Fulfilment capability
- Reliability
- Warranty arrangements
- Margin

## PENDING CONFIRMATION

Supplier capabilities:

- Product APIs
- XML feeds
- CSV feeds
- Dropshipping
- Blind shipping
- Direct fulfilment
- Automated ordering
- Real-time stock
- Reseller discounts
- Credit accounts
- Specific shipping arrangements

Commerce rules:

- VAT handling
- Delivery pricing
- Warranty terms
- Returns policy
- Supplier fulfilment terms
- Installation coverage areas
- Support service terms

## Phase 4 Demo Commerce Rules

- Guest checkout is supported in the frontend demo.
- No account creation is required for checkout.
- Checkout must not collect card numbers, CVV, expiry dates or real payment credentials.
- Payment method selection is a customer preference only until a real payment provider is approved.
- Delivery methods are configurable demo options and do not represent final courier or collection operations.
- Demo order calculations treat current catalogue prices as VAT-inclusive for display only.
- VAT handling remains pending and the Phase 4 calculation must not be treated as final tax policy.
- Orders snapshot product ID, slug, SKU, name, brand, quantity, unit price and line total at creation.
- Cancellation is available before an order reaches shipped or delivered status.
- Return requests are available for delivered orders in the demo lifecycle.
- Return and refund models must remain customer-level and independent from future supplier RMA workflows.

## Phase 4.5 PayFast Sandbox Rules

- PayFast credentials must be server-only.
- The frontend must not contain merchant keys, passphrases or PayFast signatures.
- Browser return from PayFast must not mark an order as paid.
- PayFast ITN is the authoritative payment confirmation.
- Orders created for PayFast start with `PaymentStatus = PENDING`.
- `PaymentStatus` remains separate from order, return and refund status.
- Cart contents must not be cleared merely because PayFast redirect begins.
- Cart contents may be cleared once payment is confirmed or safely associated with a paid order.
- Collection is removed until a public collection location or workflow is approved.
- Current totals present included VAT after total; included VAT is not added a second time.
- Sandbox configuration must remain separate from future live configuration.

## Phase 5 Internal Operations Rules

- Admin routes live under `/admin` and are direct-route development/internal
  access only until production staff authentication is approved.
- Payment status remains separate and PayFast payments may not be manually
  marked `PAID` by staff.
- Paid order confirmation from PayFast is required before staff can move an
  order into processing.
- Backend transition rules reject invalid order, return and refund state moves.
- Admin attention reasons are derived from stored operational data. The
  demo payment-pending age threshold is operational configuration, not permanent
  business policy.
- No PayFast fraud score or provider risk classification is assumed in admin
  attention logic.
- Operational holds are separate from customer order status and block
  fulfilment until released.
- Internal notes are staff-only and must not render on customer order pages.
- Supplier allocation records are internal planning records only.
- Supplier identities and internal fulfilment statuses must not be exposed to
  customers.
- Supplier order/reference numbers may be stored manually but do not imply
  external supplier confirmation.
- Refund amounts derive from stored order item snapshots. Arbitrary frontend
  refund amounts are not trusted.
- Marking a refund complete in Phase 5 is an internal workflow state only and
  does not call PayFast refund APIs.
- Approved PayFast refunds move through a manual dashboard-ready step until a
  real refund API integration is approved.
- Parcel dimensions, weights and shipment quantities are staff-editable
  operational data and do not call courier APIs.

## Phase 6 Mock Supplier Orchestration Rules

- Supplier orders are internal operational records generated from paid backend
  orders and staff supplier allocations.
- Supplier order creation requires paid payment confirmation and no active
  operational hold.
- One customer order can split into multiple supplier orders.
- Backend order item snapshots remain authoritative for product identity, SKU,
  quantity and selling price snapshot.
- Supplier cost can remain unknown. Unknown cost must not be used to calculate
  margin.
- Supplier order approval is a staff action before mock submission.
- Mock supplier submission records must be idempotent for the same supplier
  order.
- Mock outcomes may confirm, partially confirm, backorder or reject supplier
  orders.
- Confirmed and backordered quantities may not exceed ordered quantities.
- Rejected or backordered supplier orders require staff review and may be
  reallocated through supplier allocation records.
- Mock supplier dispatch can create backend shipment records, but does not call
  courier APIs or send tracking notifications.
- Supplier identities, supplier order records and supplier attention reasons
  must remain internal and must not render on customer-facing order pages.
- Phase 6 must not send supplier emails, call supplier APIs, automate supplier
  portals, scrape websites, use real credentials, enable PayFast live mode or
  create production authentication.

## Phase 6.1 Supplier Workflow Hardening Rules

- Only one active supplier procurement path may cover a customer order item
  quantity at a time.
- Historical supplier orders must not be deleted when replaced.
- `DRAFT` and `READY_FOR_APPROVAL` supplier orders may be superseded by a newer
  generated supplier order for the same quantity.
- Approved, submitted, acknowledged, confirmed, dispatched and completed
  supplier orders cannot be silently superseded.
- Superseded supplier orders are non-actionable.
- Operational holds block supplier order generation, approval, mock submission,
  mock outcome application and supplier dispatch.
- Supplier SKU mappings are specific to `productId + supplierCode`.
- Non-manual supplier orders require supplier SKU mapping before approval or
  mock submission.
- Do not assume TekCentral SKU equals supplier SKU unless a supplier mapping
  explicitly records it.
- Dispatch requires courier, tracking number and dispatch date.
- Partial confirmation reserves confirmed quantities only. Backordered or
  unconfirmed quantities may be reallocated.
- Confirmed plus backordered quantity may not exceed supplier order quantity.
- Active supplier-order quantity across a customer order item may not exceed
  the customer ordered quantity.
- Customer-facing order APIs must not expose supplier identity, supplier SKU,
  supplier order IDs, supplier costs, supplier notes, supplier references, mock
  scenarios or operational hold details.

## Phase 8 Multi-Supplier Operations Rules

- Supplier capabilities must be declared centrally as `SUPPORTED`, `MANUAL`,
  `UNSUPPORTED` or `UNKNOWN`.
- Unknown capability must not be treated as automated support.
- `SupplierOffer` is an internal procurement concept and must not replace or
  leak into the public product model.
- Automated supplier procurement requires a verified product-to-supplier
  mapping or offer preserving exact supplier product and variant identity.
- Supplier-order submission mode must come from the supplier adapter or
  registry, not from hardcoded supplier branches in generic orchestration.
- Supplier-specific state belongs under namespaced operational metadata such
  as `cjOperations`.
- Future suppliers may be represented as manual or email-capable only when
  those capabilities are actually supported.
- Supplier payment remains unsupported until explicitly approved and must fail
  closed.

## Phase 9A Scoop Catalogue Rules

- Scoop catalogue ingestion uses the published XML dealer price-list feed and
  identifies offers by Scoop SKU.
- Dealer Price is preserved as excluding VAT. Retail Price is preserved as
  including VAT. A 15% dealer-price VAT derivation is internal comparison data
  and must not silently change TekCentral selling prices.
- CPT, JHB and DBN stock remain separate branch snapshots. Positive total stock
  means available, explicit zero means out of stock and missing stock means
  unknown.
- Offers absent from a later successful feed remain stored and are marked stale
  rather than deleted.
- Scoop feed records and `SupplierOffer` values are internal procurement data
  and must not be exposed directly as public storefront products.
- Scoop mappings require staff review. Feed ingestion does not authorize order
  submission, supplier email, portal automation or customer fulfilment.

## Phase 9B Scoop Mapping And Pricing Preparation Rules

- Scoop mapping identity consists of the Scoop SKU, `SCOOP:<sku>` SupplierOffer
  ID and the selected TekCentral product ID.
- Mapping assistance is advisory. Only an explicit staff action may move a
  mapping from suggested to verified.
- Zero stock does not invalidate a verified mapping. Stale offers retain their
  mapping identity and become current again when the same Scoop SKU returns.
- Supplier cost excluding VAT, VAT amount, supplier cost including VAT and
  reference retail including VAT remain separate internal values.
- Markup percentage uses cost as its denominator. Gross margin percentage uses
  selling price as its denominator.
- Proposed selling price and profit fields are preparation fields only. Phase
  9B must not mutate public TekCentral product prices or select suppliers
  automatically.

## Phase 9E Scoop Multi-source Catalogue Rules

- A Scoop SKU has one canonical `SCOOP:<sku>` SupplierOffer across XML and
  approved website-discovery sources.
- Current XML observations are authoritative for dealer price and structured
  stock. Website observations cannot override those fields.
- Website-only offers have unknown stock and cannot generate pricing or become
  ready for publish review without current authoritative commercial data.
- Source upgrades preserve mappings, logistics, launch selection, pricing
  history and internal-product provenance.
- Website protection must not be bypassed. HTTP 403 or challenge responses stop
  safe direct discovery and require an approved manual import path.

## Phase 9C Configurable Pricing Rules

- VAT, pricing bands, minimum profit, rounding, reference-price behavior and CJ
  manual FX inputs are backend-persisted business settings.
- Gross margin is profit divided by selling price; markup is profit divided by
  cost. They must not be substituted for one another.
- Scoop proposals use dealer cost excluding VAT. Scoop retail including VAT is
  a reference and does not overwrite the proposed price unless the configured
  policy applies a soft ceiling.
- CJ proposals require product cost plus selected logistics cost. Non-ZAR
  landed cost requires the configured manual FX rate and records the rate,
  buffer and timestamp used.
- Pricing proposals require internal approval by default. Generation and
  approval never publish or mutate public product prices.
- Settings changes are audited and do not silently recalculate existing
  proposals.
- The approved initial gross-margin bands are LOW 35%/R50 minimum profit,
  STANDARD 28%/R125, HIGH 20%/R300 and PREMIUM 15%/R750.
- Product margin and customer delivery charges are separate. Checkout shipping
  uses a time-limited backend ShippingQuote and must be READY before payment.
- Mixed-source carts are grouped by expected fulfilment source. Customer delivery
  is the sum of independently quoted groups; supplier identity and cost remain internal.
- Accepted orders keep an immutable shipping/settings snapshot. Later policy changes
  never recalculate paid or historical orders.
  must not be silently absorbed into a product proposal. CJ logistics remains
  part of internal landed-cost viability only.
- Supplier-offer product creation produces an unpublished internal product.
  Staff must confirm title and an existing category; supplier provenance remains
  internal and the exact offer mapping is verified only by that explicit action.
- Mapping confidence is advisory. Generic term overlap cannot establish product
  identity, and low-confidence verification requires explicit staff confirmation.

## Phase 11 Local Delivery Estimation Rules

- Customer shipping charge, estimated internal freight, actual freight and freight variance are separate values.
- Local `ZONE_ESTIMATE` shipping requires complete authoritative logistics metadata and an explicitly enabled, versioned rate card. Missing configuration or logistics never means free shipping.
- Manufacturer logistics may auto-apply only for HIGH-confidence exact identity. Package measurements are preferred for shipping; product measurements remain an explicit fallback. Admin overrides retain highest authority and are never silently replaced by automated enrichment.
- Billable weight is the greater of aggregate actual weight and conservative per-item volumetric weight. The volumetric divisor, zones, rates, buffers, rounding and transit windows are staff configuration, not hard-coded courier assumptions.
- TekCentral local delivery prices are estimates and must not be represented as exact supplier or courier charges.
- Public shipping responses must not reveal suppliers, origin, internal freight estimates, buffers, zones or rate-card internals.
- Accepted orders retain immutable quote calculation snapshots. Later rate or logistics changes do not rewrite historical customer charges.
- Freight reconciliation is internal analytics only and never automatically charges/refunds a customer or advances fulfilment.

## Scoop paid-order operations

- A paid line may auto-allocate only when exactly one current verified and available Scoop offer resolves the internal product and no operational hold exists.
- Missing, stale, unavailable or multiple eligible sources require manual allocation; TekCentral never guesses.
- Automatic Scoop allocation creates one idempotent `ACTION_REQUIRED` SupplierOrder grouped independently from other suppliers.
- Staff acknowledgement, procurement approval and actual manual portal placement are separate states.
- Manual placement reaches `ORDERED` only after a real supplier reference is recorded. Opening the reseller portal changes no state.
- Scoop dealer cost excluding VAT and source offer identity are snapshotted at SupplierOrder creation and are not rewritten by later feed changes.
- Supplier operations do not alter customer totals, payment state, selling prices, accepted shipping charges or shipping quote snapshots.
- A newly created Scoop `ACTION_REQUIRED` SupplierOrder creates one idempotent internal operations email notification. Email failure never changes payment or procurement state, and successful automatic delivery is never repeated by duplicate payment processing.
- Internal procurement alerts exclude customer contact/address data, supplier economics, raw payment data and credentials. Customer notifications are not part of this workflow.

## Phase 7A-CJ Supplier API Foundation Rules

- `CJ_API_KEY` must remain server-side and must not be exposed to frontend code,
  browser storage, logs or admin responses.
- CJ access and refresh tokens are backend-only.
- Phase 7A may call CJ read-only authentication, settings, product search,
  product detail, variant and stock endpoints.
- Phase 7A must not call CJ order creation, order submission, payment,
  cancellation or any external write endpoint.
- Imported CJ products remain supplier catalogue records and must not be added
  directly to the public TekCentral storefront.
- CJ product ID, product SKU, variant ID and variant SKU must be preserved
  separately.
- CJ supplier SKU values must originate from the CJ API.
- CJ mappings remain `SUGGESTED` until staff explicitly verifies them.
- Only `VERIFIED` CJ mappings may eventually be used for real CJ supplier order
  creation.
- `STALE` mappings require staff review and must not be silently remapped.
- CJ supplier price snapshots do not change TekCentral selling prices.
- Preserve CJ price currency; do not assume ZAR or perform conversion in this
  phase.
- CJ stock snapshots are admin/internal only and must not be exposed as public
  customer availability.
- Staff CJ discovery defaults to TekCentral technology categories selected from
  real CJ category IDs; unrelated broad-marketplace categories are hidden unless
  staff explicitly switch to full-catalogue inspection.
- Full-catalogue CJ inspection is read-only and does not relax import, exact
  variant selection, mapping suggestion or staff verification requirements.
- CJ search relevance must treat short technology terms such as `UPS`, `USB`,
  `SSD`, `RAM` and `AP` as tokens rather than broad substrings.
- CJ supplier prices must display with their source currency when available; do
  not imply ZAR conversion during Phase 7A.

## Phase 7B-CJ Real Supplier Submission Rules

- Real CJ order creation requires an approved internal CJ SupplierOrder.
- The linked customer order must be paid, not cancelled and not under an active
  operational hold at preflight and submit time.
- Every CJ supplier line must resolve to a `VERIFIED` exact CJ product and
  variant mapping.
- Real order creation uses backend-only CJ credentials and the server-only
  `CJ_REAL_ORDER_CREATION_ENABLED` flag.
- Preflight may build a staff review payload while real creation is disabled,
  but external creation is rejected until the flag is enabled server-side.
- CJ logistics choices must come from CJ logistics/freight responses. Staff
  must select one returned logistics option before create.
- TekCentral creates CJ orders with `payType=3`, which is the create-only
  unpaid mode documented by CJ for Create Order V2.
- Local idempotency and an external TekCentral reference are mandatory before a
  create request is sent.
- `UNKNOWN_RESULT` must be reconciled through CJ read APIs before retrying
  creation.
- Creating a CJ order does not pay CJ, confirm supplier fulfilment, dispatch
  goods, alter PayFast state or change the customer order lifecycle.
- Supplier allocations must be saved before supplier-order generation. The
  admin UI must not silently generate from unsaved allocation form state.
- Supplier-order generation must show progress, success links or exact failure
  reasons.
- Operational next-action guidance must be derived from actual order,
  allocation, supplier-order, hold and shipment state.
- Real CJ supplier orders must be labeled as `CJ API` or equivalent, not as
  manual sourcing.
- CJ logistics failures must distinguish unavailable shipping routes from
  incomplete or malformed local request data where possible.
- Customer Add to Cart actions must provide immediate accessible confirmation
  feedback and update cart counts without a page refresh.

## UNDECIDED

- V1 business model scope
- Whether checkout or quotation flow launches first
- Whether services are sold directly, quoted manually, or attached as add-ons
- Pricing margin rules
- Stock reservation rules

## Phase 3 UI Rules

- Product pages may offer `Add to Cart`, `Ask Zeus about this product`, `Request a Business Quote` and comparison actions.
- Business quote actions are UI-only and must not imply a quotation backend exists.
- Availability labels must remain demo-labelled until real supplier stock is integrated.
- The cart may link to a safe checkout placeholder, but must not imply that payment, fulfilment or an order was created.
- Account UI must not imply real authentication is connected.
- Contact UI must not invent phone numbers, addresses, support hours or email addresses.

Do not invent legal, tax, payment, warranty, or supplier policies.
## Storefront publication

- `READY_FOR_PUBLISH_REVIEW` never makes a product public. Staff must explicitly publish it.
- Public selling price must come from the current approved pricing proposal. Supplier cost changes and newly approved prices do not alter an active public version until another explicit publish.
- Publication versions are immutable. Presentation changes, price changes, republishing, and rollback create a new version.
- Unpublish removes listing/detail visibility without deleting the internal product, supplier mapping, pricing history, publication versions, or audit history.
- Rollback is allowed only when the current approved proposal supports the historical version price.
- Current authoritative stock controls the customer availability label but does not automatically unpublish a product.
- Supplier identity and private commercial or operational fields are never included in the public catalogue DTO.

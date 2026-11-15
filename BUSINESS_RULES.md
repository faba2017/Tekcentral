# Business Rules

## Staff Admin authorization

- Admin pages and APIs require an authenticated active staff session and the specific canonical permission for the requested area or action.
- Staff with enabled 2FA receive no full Admin session until a valid TOTP or unused recovery code succeeds. Production Super Admin and effective high-risk permission holders must enable 2FA; reminder deferment is development/non-mandatory only.
- Production business state must use shared durable persistence; local `.data` and application-container files are development/test adapters only. Schema migration, seed data and production import are separate controlled operations.
- Product media is TekCentral-controlled and content-verified. Public Product objects and private customer documents use separate object-storage access policies; private files require application authorization and short-lived download access.
- Recovery codes are one-time, hash-only and never emailed. Authenticator secrets are encrypted at rest and never returned after enrollment.
- Role names are default bundles, not route checks; explicit revocations win over grants and defaults.
- Staff cannot change their own role or overrides, delegate access they do not possess, or remove the final active Super Admin recovery path.

## Scoop evidence and pricing proposals

- A published Product may retain a stale Scoop SupplierOffer; publication never implies fresh supplier evidence.
- Scoop pricing proposals require a verified exact mapping and current active XML dealer cost. Generation remains approval-only and has no storefront side effect.
- Scoop Product-page evidence may enrich specifications/logistics but cannot refresh stock, dealer cost, or SupplierOffer freshness.
- Staff-entered logistics is preserved unless verified authoritative replacement is explicitly accepted.

## Contact messaging

- Original public enquiries are immutable; staff replies append messages.
- Contact category determines the General, Sales, Accounts or Support department and sender identity.
- An SMTP-accepted message is `SENT`; no delivered/read claim is made.
- Failed messages remain visible and may be retried explicitly without creating a second history record.
- Customer and order links require explicit canonical identity; anonymous enquiries are never linked by email alone.
- Contact messaging is one-to-one operational communication, not bulk marketing or mailbox synchronization.

## Merchandising and promotional pricing

- Publication makes a Product discoverable but never automatically Featured, popular, on sale or homepage-selected.
- Homepage manual placement references published canonical Products only. Manual order precedes explicitly configured deterministic fallback.
- Promotional prices must be positive, below current regular public price and non-overlapping for a Product. Server time determines activation.
- If regular-price drift makes a promotion contradictory, regular price wins.
- Effective price is revalidated for cart, checkout and order creation; historical order snapshots do not change when a promotion ends.
- Supplier identity, supplier SKU, cost and margin never enter public merchandising payloads.

## Zeus product discovery

- Zeus may interpret shopping intent but may recommend only active published TekCentral Products.
- Canonical storefront price, supplier-neutral availability, taxonomy and approved public content remain authoritative.
- Hard budgets, required brands and required specifications cannot be silently relaxed for primary matches.
- Alternatives must disclose unmet preferences; accessories are always separated from primary products.
- Sparse content cannot support capability or suitability claims beyond title, taxonomy, approved description and specifications.

## Zeus Phase A

- Zeus may provide public product discovery, detail, comparison and supplier-neutral availability information only.
- Product facts and selling prices come from the published catalogue; availability comes from the canonical availability service.
- Zeus tools never receive or return supplier identity, supplier cost, margin, procurement data, credentials, internal notes, security records or customer-private data.
- Zeus cannot perform order, payment, refund, account, inventory, publication or supplier actions. Future authenticated tools must derive the customer exclusively from the server session.
- Authenticated Zeus tools are read-only and may access only the current HttpOnly-session customer's orders, tracking, returns/refunds and saved addresses.
- Order ownership cannot be established by customer-supplied IDs, email, phone, order claims, or model-generated identity. Foreign and unknown order numbers are indistinguishable.
- Historical Zeus order answers use immutable order-time customer-facing snapshots. Account data is loaded only for the relevant tool invocation and is never preloaded into every request.
- Guest order access remains a separate bearer-credential workflow and is never routed through Zeus.

## CONFIRMED

- The platform is South Africa first.
- The platform should support B2C and B2B use cases.
- Customer accounts are optional for commerce. Guest checkout remains supported, customer sessions cannot authorize admin routes, and historical guest orders are never linked to an account from email matching alone.
- Saved addresses are account-owned future-use records, not order history. Orders keep their checkout-time address snapshots; address edits or deletion never rewrite them. Account order access requires exact server-side `customerAccountId` ownership.
- Supplier capabilities must be confirmed before implementation.
- TekCentral Manual Supplier Phase A records internal manual SupplierOffers only. It supports staff-maintained ZAR cost excluding VAT, stock evidence, verified Product mapping, and supplier-neutral availability; it does not support allocation, SupplierOrder creation, reservation, stock decrement, fulfilment, tracking, or supplier payment.
- Manual supplier SKUs are unique within `TEKCENTRAL`, remain internal, and need not match Product SKUs. Offers are deactivated rather than deleted so evidence and audit history remain available.
- Manual cost and stock use the shared supplier freshness policies. Stale cost requires attention before future pricing use; stale stock degrades availability to `CHECK_REQUIRED`. Manual evidence never changes an approved or published price automatically.
- TekCentral Manual Supplier Phase B stock changes remain append-only adjustments. Phase C adds separate atomic reservation records: `available = onHand - reserved`, and neither reservations nor releases rewrite stock-adjustment history.
- TEKCENTRAL allocation requires a PAID order, active verified exact offer mapping, fresh stock/cost evidence, and full line quantity availability. Phase C does not split one customer line across suppliers.
- Creating a TEKCENTRAL SupplierOrder reserves stock before approval. Approval finalizes the shared immutable order-line cost basis in ZAR with no FX. Picking and packing do not decrement stock.
- Confirmed internal fulfilment consumes reserved stock exactly once and records `ORDER_FULFILMENT`. Cancellation before consumption releases reservation; cancellation, refund, or return after consumption never restocks automatically.
- Physical TEKCENTRAL returns require explicit receipt, inspection and disposition. Refund/customer-return status never mutates stock. Sellable restock and write-off evidence never rewrite immutable order-time cost basis.
- Manual Supplier onboarding uses the canonical Product, taxonomy, controlled asset, pricing proposal, and immutable publication pipelines. Product creation or mapping never publishes or approves pricing automatically.
- A Manual Supplier cost change records evidence and may require pricing review, but never mutates completed order cost basis, an approved price, or an active publication version.
- The app must remain supplier-independent.
- The store should use an internal product model rather than rendering supplier-specific objects directly.
- Zeus must be preserved unless explicit approval is given.
- Product content edits are not public until staff explicitly saves a draft and publishes a new immutable version. Unsaved browser state, saved drafts, and active storefront versions are separate.
- Launch selection belongs to the supplier-neutral TekCentral Product after a verified supplier mapping exists. Pricing approval, Product selection, content review, and publication must not mutate the originating supplier offer.
- Foreign-currency Product publication requires current supplier-cost and FX evidence. Later FX movement may create pricing attention or a proposal but never changes an active storefront version automatically.
- Product document uploads and trusted imports must be copied into TekCentral-controlled storage before publication. Removing a draft reference does not delete bytes used by historical versions.
- Phase 3 catalogue products, prices and availability are demo data only.
- Phase 3 cart state is frontend-only and does not reserve stock, create orders or process payments.
- Checkout, account, contact, quote and Zeus assistant experiences are polished frontend surfaces only until backend services are approved.
- Contact enquiries are persisted before SMTP delivery and routed by a backend-controlled category map. Authenticated customer context comes only from the server session; account order context requires exact ownership, while guest-entered order numbers remain unverified references.
- Contact submission never creates a cancellation, return, refund, payment action, supplier operation, or account mutation. Structured order and return workflows remain authoritative.
- Guest checkout, order reads, cancellation requests, and return requests are canonical backend operations. Browser order mirrors are convenience state only and never authorize access.
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
- Historical product-line gross profit is net product revenue excluding VAT minus the immutable normalized procurement cost for net fulfilled quantity. Gross margin is gross profit divided by net product revenue excluding VAT.
- New order lines capture revenue/VAT context at checkout and finalize supplier cost at SupplierOrder approval, when the selected fulfilment source is commercially accepted. A `COMPLETE` cost basis is immutable.
- Current supplier prices, Product prices, mappings or FX must never backfill or recalculate historical profitability. Legacy and incomplete lines remain unavailable and reporting must expose coverage.
- Customer shipping charges remain separate from product-line profitability. Supplier/courier cost is included only when an authoritative component is explicitly captured; estimates are not silently deducted.
- Completed line-attributable refunds reduce revenue and cost for refunded quantity. Unattributable refunds make profitability partial rather than triggering invented allocation.

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

## Customer Account Ownership Rules

- Guest checkout remains available and creates orders without a customer account owner.
- A historical guest order may be attached to an authenticated account only after a short-lived, one-time proof code is delivered to and verified through the email snapshot on that exact order.
- Matching account and order email addresses is not ownership proof. Order number, phone, name, and browser state are also insufficient on their own.
- A claim may assign only an order with no existing `customerAccountId`; it must never replace an owner.
- Guest orders require their canonical order number plus a random order-scoped bearer credential. Order number, email, phone, customer name, and browser mirrors are not authorization. The credential remains valid until explicit revocation or a successful account claim.
- Account-owned orders are authorized only through the authenticated server session and exact `customerAccountId`; guest credentials cannot bypass ownership.
- Claiming changes ownership association only. Historical order, customer, address, price, payment, delivery, tracking, return, refund, and supplier-operation evidence remains unchanged.
- Customer account mutations reject untrusted browser origins. Session tokens remain HttpOnly cookies and are stored only as hashes server-side.

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
- Payment, customer-order status and SupplierOrder status are independent state
  machines.
- Persisted supplier allocation is authoritative and normal editing is locked
  after supplier procurement reaches approval or a later material state.
- Customer orders require recorded shipment evidence before a `SHIPPED`
  transition.
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

## Phase 12.1 CJ Product Evidence Rules

- CJ launch identity is variant-specific. Product-level similarity cannot substitute for an exact VID.
- Weak historical mapping evidence must be retained but moved to `REVIEW_REQUIRED`; it must not remain procurement or pricing authority.
- Official CJ catalogue and exact-variant API prices are USD and retain source-field provenance. Exact-VID quantity-applicable stock-up/wholesale pricing is preferred before `variantSellPrice`; product range pricing cannot substitute for an exact variant.
- CJ merchandise cost is normalized to ZAR through recorded supplier-neutral FX evidence. Freight remains separate from the public product price, and pricing proposals remain pending approval until staff acts.
- Supplier prices without authoritative currency provenance are observations only and cannot enter pricing.
- Non-ZAR supplier costs require fresh supplier-neutral FX evidence. Automatic reference rates are cached by currency pair; stale/missing rates block pricing, and documented manual evidence is only a fallback. TekCentral must not assume a currency or exchange rate.
- CJ logistics observations retain field, unit, classification, timestamp, VID and source fingerprint. Product dimensions are not package dimensions.
- Historical numeric logistics values without field-level provenance remain partial evidence and cannot produce `LOGISTICS_COMPLETE`.
- Freight eligibility is route evidence, not a replacement for static product/package logistics.
- `READY_FOR_PRICING` is derived from verified identity, exact variant, authoritative cost/currency, required FX and complete logistics. It does not approve or publish a price.
- Controlled CJ evidence refresh is read-only and limited to already imported cohort PIDs. It must preserve historical observations and staff confirmations.
- CJ sell/display price fields are not procurement cost unless explicit supplier evidence establishes that classification.
- Staff evidence confirmations require a source note/reference, actor and timestamp; there is no force-ready action.
- Unselected sibling variants do not block one explicitly reviewed exact VID.

## Phase 9A Scoop Catalogue Rules

- Scoop catalogue ingestion uses the published XML dealer price-list feed and
  identifies offers by Scoop SKU.
- Selected Scoop offers with incomplete logistics remain internal evidence
  exceptions. Staff capture must prove exact Scoop/manufacturer identity before
  measurements or hardware revision data can be applied; retailer evidence,
  inferred revisions and automatic publication are prohibited.
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

- VAT, pricing bands, minimum profit, rounding, reference-price behavior, FX
  freshness and foreign-currency impact thresholds are backend-persisted business settings.
- Gross margin is profit divided by selling price; markup is profit divided by
  cost. They must not be substituted for one another.
- Scoop proposals use dealer cost excluding VAT. Scoop retail including VAT is
  a reference and does not overwrite the proposed price unless the configured
  policy applies a soft ceiling.
- Non-ZAR supplier pricing requires fresh shared FX evidence and records source
  amount, rate, provider, timestamp and normalized ZAR cost. Catalogue freight
  remains separate from merchandise pricing.
- Pricing proposals require internal approval by default. Generation and
  approval never publish or mutate public product prices.
- Foreign-currency monitoring defaults to ASSISTED with 3% monitor, 7% review
  and 12% critical boundaries. Material unfavorable movement may create a new
  pending proposal; favorable movement is informational. Margin and
  minimum-profit failure can escalate risk.
- FX reconciliation defaults to a daily cadence, processes only currency pairs
  currently used by active foreign-currency pricing, and never approves or
  publishes proposals. Admin attention counts unique Products with unresolved
  REVIEW/CRITICAL pricing impact; MONITOR and IGNORE do not count.

## Phase 12 CJ Product Launch Rules

- An exact CJ variant is a SupplierOffer identified by CJ product ID plus VID; product and variant SKUs remain supporting identities.
- The current Product model represents one exact sellable unit per materially different CJ variant. Variant data must not leak across sibling variants.
- Existing exact Products must be reused across suppliers. Fuzzy title similarity cannot verify a CJ mapping or create a duplicate Product.
- CJ launch selection, logistics completeness, pricing approval, content review and publication use the shared TekCentral lifecycle. Importing does not select or publish a product.
- CJ catalogue cost remains in its authoritative source currency. Non-ZAR landed-cost pricing requires the configured manual FX rate and timestamp, and customer shipping remains separate.
- CJ supplier identity, product/variant identifiers, cost, margin and source metadata remain internal and must not appear in public snapshots.
- Product launch processing never creates, pays, confirms, dispatches or fulfils a CJ order.
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
- Launch selection is explicit. Verified mapping, complete logistics or approved pricing never selects a Scoop offer automatically. Launch Readiness contains only verified internal products selected for launch or already managed through publication history.
- Approved pricing changes no public price by itself. `LIVE` is derived from the active immutable publication version; a different approved next price remains pending until staff publishes a new version.
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

- For selected supplier offers blocked on mapping, search exact existing product
  identity before creating a supplier-independent internal Product. Family or
  fuzzy-title similarity cannot be auto-verified.
- Exact-offer product creation preserves launch selection and existing logistics,
  records source provenance, and rolls forward to pricing/readiness evaluation
  without approving pricing or publishing.

- `READY_FOR_PUBLISH_REVIEW` never makes a product public. Staff must explicitly publish it.
- Public selling price must come from the current approved pricing proposal. Supplier cost changes and newly approved prices do not alter an active public version until another explicit publish.
- Publication versions are immutable. Presentation changes, price changes, republishing, and rollback create a new version.
- Unpublish removes listing/detail visibility without deleting the internal product, supplier mapping, pricing history, publication versions, or audit history.
- Rollback is allowed only when the current approved proposal supports the historical version price.
- Current authoritative stock controls the customer availability label but does not automatically unpublish a product.
- Product availability is resolved supplier-neutrally across active verified supplier offers. Fresh positive evidence outranks fresh zero-stock evidence; all fresh zero-stock evidence resolves out of stock; stale evidence resolves to a non-purchasable check-required state; and unknown is reserved for Products without trustworthy current evidence.
- Supplier identity and private commercial or operational fields are never included in the public catalogue DTO.
- Scoop XML remains authoritative for commercial price and stock fields. Exact
  Scoop product pages may supplement physical logistics only. Admin logistics
  overrides remain highest priority; package measurements are preferred for
  shipping, and separate kit components must never be fabricated into a carton.
- A canonical Scoop product URL may be attached only to an exact Scoop SKU at
  HIGH identity confidence. URL conflicts require review, and Scoop page access
  failure must not invalidate a previously verified URL.
- Scoop launch selection is explicit and occurs only after verified mapping,
  complete logistics and approved pricing. Launch readiness and publication do
  not auto-select or auto-publish products.
- Public content authority is `STAFF_EDITED`, then approved exact-source
  content, then safe automatic defaults. Source refresh must not overwrite
  staff edits or an active immutable publication version.
- Product overview, specifications and documents are structured independently.
  Source-derived specifications require exact model identity; conflicts remain
  review-required rather than selecting a source silently.
- Only approved HTTPS product documents from a trusted supplier, manufacturer
  or explicit staff entry may be published. Supplier reviews, related-product
  blocks, dealer prices and supplier-only account data are never imported.
- Product dimensions and weight may reuse authoritative product-level logistics
  observations. Package/carton dimensions and shipping weight remain internal
  and must not be presented as product measurements.
- CJ commercial readiness is resolved at exact VID level. Staff-confirmed
  Product identity, supplier currency and procurement cost require documented
  evidence, actor and timestamp. A replaced mapping is retained as
  `SUPERSEDED`; it is never deleted or silently treated as current.
- Account-level CJ purchasing currency may be reused across the controlled
  cohort only when its provenance is recorded. Non-ZAR costs require a current
  configured FX rate. CJ sell-price observations are not procurement cost.
- Changing the selected CJ VID re-evaluates readiness against that variant and
  never transfers cost evidence from the previously selected VID.
- `READY_FOR_PRICING` may feed the shared pricing engine, but the resulting
  proposal remains `PENDING_APPROVAL`. It does not select for launch, approve,
  publish, order or pay a supplier.
- Importing a CJ catalogue record does not create a TekCentral Product. Staff
  must select an exact VID, then deliberately map it to an exact existing
  supplier-neutral Product or review and create a new internal Product.
- New CJ-backed Products require a confirmed title, taxonomy category and
  documented identity source. Unknown model data may remain blank and a
  confirmed unbranded item may use `Unbranded`; supplier IDs must not be
  presented as invented manufacturer models.
- Exact cross-supplier identity reuses the existing Product. Fuzzy title
  similarity is advisory and never auto-verifies a mapping. Demo/test targets
  require explicit warning acknowledgement and evidence.

## Product taxonomy

- Every Product has one canonical supplier-neutral taxonomy path; supplier categories are evidence, not storefront categories.
- Existing verified taxonomy wins over feed refresh or deterministic suggestions.
- Unknown source categories remain review-required or unmapped and never create public categories automatically.
- SSDs, HDDs, NAS and external drives belong to Storage. IP phones, conference phones and VoIP gateways/ATAs belong to Office & Business Technology > Business Communication.
- Taxonomy changes alone never alter price, availability, checkout eligibility, publication state or immutable publication versions.
- Future orders snapshot canonical taxonomy IDs. Historical order lines are never destructively recategorized.
- Supplier merchandising groups map to tags or collections, not categories.

## Zeus usage policy

- Guest and authenticated allowances are separate, configurable service policies. Authentication raises the allowance but does not remove account, IP, platform or provider safety controls.
- Phase C.3 counts completed useful requests rather than weighted cost units. Cost tiers remain operational telemetry only.
- Successful inference and safety tool-loop failures consume allowance. Provider outages, validation failures, consent prompts and deduplicated submissions do not consume normal customer allowance.
- Reaching a Zeus limit never blocks Product browsing, cart, checkout, customer account access or existing order access.

## Zeus policy and escalation

- Published TekCentral policy is authoritative. Zeus explains customer-safe canonical policy records and never decides refund approval, return eligibility, cancellation approval, warranty outcome, delivery ETA, or payment outcome.
- General policy questions remain public. Personal order, tracking, return, refund, cancellation, payment, and address facts require an owned authenticated workflow with AI consent or the secure guest-order path.
- Human escalation follows General, Sales, Accounts, Support, and Technical intent through existing Contact categories. Recipient selection remains in the Contact service; Zeus cannot select an email address or submit an enquiry.
- Zeus may offer secure workflow links and the canonical public telephone action, but cannot perform customer mutations or claim that staff has been contacted.
## Syntech Procurement

- Syntech customer payment never triggers unattended supplier ordering.
- External creation requires paid customer state, staff-approved SupplierOrder, exact verified SKU mapping, fresh cost and stock evidence, explicit confirmation, and UAT configuration.
- Syntech backorders are disabled (`backorder = no`). Collection is limited to documented Cape Town and Johannesburg locations.
- A submission attempt is persisted before the provider request. Ambiguous outcomes become `UNKNOWN_RESULT` and must not be blindly retried.
- The Syntech `salesorder` is the canonical provider reference. External creation does not imply supplier payment, dispatch, or customer fulfilment.

## TekCentral Manual Inventory Operations

- The Phase D stock ledger remains authoritative. Reorder settings, forecasts, imports, exports and replenishment plans are operational views over that ledger, not parallel stock authority.
- Reorder recommendations are advisory. TekCentral never auto-orders, auto-prices or auto-publishes because a threshold is reached.
- Replenishment planning does not change stock. Only a confirmed physical receipt may append an idempotent stock receipt movement.
- The current inventory pool is logically identified as `TEKCENTRAL_MAIN`. Location-level quantities and reservations are not inferred or fabricated.

## Public Commercial Policies

- Canonical public policy routes are `/terms`, `/privacy`, `/refund-policy`, `/cancellation-policy`, and `/shipping-delivery`.
- Checkout policy acknowledgement does not alter order creation, payment, pricing, delivery quoting, cancellation, return or refund state.
- Public policies describe request and review behavior conservatively; they do not promise automatic fulfilment, cancellation, returns, refunds, warranty outcomes or delivery dates.
- Public business details must come from verified configuration. Missing support and legal-entity details remain launch blockers and must not be invented.

## Storefront analytics

- Online visitors are anonymous analytics sessions active within the last five minutes; a new session begins after 30 minutes of inactivity.
- Conversion is orders placed divided by storefront sessions for the selected period. Paid revenue uses canonical backend payment state and never browser redirects.
- Public analytics accepts only the fixed event vocabulary. Product views must resolve to a currently public Product; cart additions are recorded by the canonical server cart.
- Search terms are normalized and bounded. Analytics never stores raw Zeus prompts, form fields, payment details, customer contact details, IP addresses or session replay data.
- Detailed activity is retained for 30 days and daily aggregates for 400 days. Bot/headless and marked test traffic is excluded where identifiable.

## Admin customer support

- The Customers workspace is a registered-account support directory, not a marketing segmentation or behavioral-scoring system.
- Paid customer spend is the sum of canonical historical order totals whose payment state is `PAID`; current Product prices never rewrite it.
- Only orders with the account's persisted `customerAccountId` appear in its history. Unclaimed guest orders remain separate even when their checkout email matches the account.
- Saved addresses are current account data; each order's delivery address is an immutable historical snapshot and is shown separately.
- Support enquiries are included only when explicitly account-linked. Historic guest enquiries are not claimed by email matching.
- Zeus support visibility is limited to whether account assistance has been used and whether an active session-scoped consent exists. Sessions, prompts and provider payloads remain private.
- Customer support is read-only in Phase G.1. Password recovery uses the existing customer reset flow; account deletion/privacy requests require escalation.

## Zeus AI

- Zeus remains informational and read-only unless a later approved phase introduces a specific mutation with its own authorization and confirmation rules.
- The AI provider may request only registered tools. TekCentral services remain authoritative for product, price, availability, order ownership, tracking, returns and addresses.
- Supplier identity, supplier cost, margin, internal operations, credentials and staff-only records must not be placed in provider prompts or tool results.
- Authenticated tool ownership derives from the current HttpOnly customer session, never model-provided identity or tool arguments.
- A provider timeout, rate limit or malformed response is a temporary assistant failure and must not be interpreted as a product, payment, order or availability decision.
- Authentication does not by itself authorize external AI processing of account-derived data. Current, server-recorded Zeus consent is required before any account tool executes.
- Zeus consent is session-scoped, optional and revocable. It permits only the minimum customer-owned order, tracking, return or address evidence needed for the current request.
- Equivalent successful tool calls may reuse the same safe result within one request, but materially different calls must still execute through canonical services.
- Zeus cart changes require an owner-bound, expiring server confirmation. The server revalidates the published Product, current public price, quantity and purchasability; model-supplied prices and owners are never accepted. Confirmation replay is idempotent, while checkout, payment and ordering remain customer-controlled workflows outside Zeus.
- Signing in with a guest cart performs one server-side merge into the authenticated cart. Matching Product quantities are combined up to 99 after current purchasability is revalidated, then the guest cart is consumed so the merge is idempotent. Normal storefront and Zeus cart changes use this same policy.
- Zeus identifies itself as TekCentral's AI shopping and support assistant, built for TekCentral by Fabrice Isama. It must not impersonate a human or disclose provider/model, prompt, tool, telemetry, credential, supplier, cost, margin, procurement, admin, or security internals.
- Stable identity and business guidance may be answered from versioned server knowledge. Current prices, promotions, availability, Product publication, carts, orders, tracking, returns, payments, and account facts always remain canonical live-tool concerns.
- Customer text and Product content cannot override Zeus identity, confidentiality, account ownership, consent, cart confirmation, checkout/payment boundaries, or registered-tool restrictions.
# Public launch discovery and abuse rules

- Contact submission, account registration, and password-reset requests require successful action-specific server verification before persistence, account creation, token generation, or email side effects.
- reCAPTCHA supplements rather than replaces existing abuse controls.
- Search metadata and structured data may use only published, customer-safe canonical Product fields and effective public prices. Supplier identity, costs, margins, mappings, and procurement evidence are never exposed.
- Unpublished Products and private commerce/account/admin routes are not indexable.

# Catalogue enrichment controls

- Supplier categories and content are evidence, not canonical Product truth.
- Category suggestions require staff review; existing verified taxonomy is preserved.
- Supplier image URLs remain internal candidates until each image is ingested into TekCentral-controlled storage.
- A published gallery contains at most eight unique controlled images, exactly one primary image, and deterministic staff-approved order.
- Changing Product media requires an explicit new publication version and never auto-publishes.

# Operational alert rules

- `CRITICAL` means a customer/business flow is blocked or financial integrity may be at risk; `WARNING` needs attention while normal business may continue; `INFO` is event history only.
- `ACKNOWLEDGED` means reviewed, not fixed. Payment, order, pricing, availability and supplier state remain authoritative.
- Repeated failures aggregate by stable type, subsystem, entity and diagnostic code.
- Alerts navigate to existing audited workflows and never perform refunds, pricing approval, procurement retries or other risky actions directly.
- No customer PII, addresses, private messages, credentials, signatures, reset/session values or raw provider payloads may be persisted in alert summaries.

# Admin audit rules

- Audit/Activity is append-only historical evidence and never authorizes or replaces a canonical business mutation.
- Current human-originated Admin actions use actor `OPS`; automated outcomes use `SYSTEM`. Named staff identities must wait for real staff authentication.
- Before/after values are bounded business summaries, not serialized domain objects. Secrets, credentials, hashes, sessions, tokens, signatures, raw messages/prompts/payloads and unnecessary customer data are prohibited.
- Audit acknowledgement does not resolve an H.1 incident, and alert occurrence aggregation does not create duplicate audit noise. Only alert acknowledgement and manual resolution are audited.
- Expiry of the 365-day operational projection must never delete canonical order, payment, inventory, publication, supplier, pricing, or return history.

# Production dependency rules

- A successful local SMTP connection does not prove that every public department alias can receive and send production mail. Alias acceptance and customer receipt require controlled production checks.
- Password-reset mail uses the canonical Support identity. Registration currently has no registration-email workflow and must not be described as if one exists.
- When Syntech reseller API writes are disabled or UAT credentials are absent, approved Syntech SupplierOrders use the existing manual procurement and supplier-reference workflow. The UI must not imply that automatic ordering is available.
- Production launch is blocked until authoritative commerce, account, supplier, Contact, settings, alert, audit and analytics records have durable storage appropriate to their recovery requirements.
- Production Admin access requires real staff authentication and authorization; route obscurity or frontend navigation is not an access-control boundary.

# Staff authorization rules

- Business authorization is permission-based. Role IDs define default bundles but must not be used as shortcuts for action authorization.
- Effective permissions equal the base-role bundle plus explicit grants minus explicit revocations. Revocation wins.
- Unknown roles, unknown permissions, malformed overrides and duplicate stored override values fail closed.
- `SUPER_ADMIN` receives the complete registered permission set through the same resolver and guard path as every other role.
- `AUDITOR` contains only permissions classified as read operations.
- Physical return decisions and financial refund authority remain separate permissions.
- A future staff manager cannot grant a permission they do not possess. `SUPER_ADMIN` assignment and high-risk overrides require separately enforced privileged authority.
- Once staff lifecycle exists, at least one active `SUPER_ADMIN` must remain.
- Frontend permission checks are presentation only. Backend permission guards remain authoritative.
- Automated `SYSTEM` jobs are not staff users and receive no staff permission bundle.

# Staff authentication rules

- Staff and customer identities, sessions, resets and cookies remain separate even when email addresses match.
- Staff onboarding is invitation-only; no public staff registration exists.
- Invitations expire after 24 hours and resets after 30 minutes; both are one-time and hash-only at rest.
- Staff sessions have a 12-hour absolute lifetime and a two-hour inactivity timeout. Disabled accounts fail immediately.
- Bootstrap creates at most one initial Super Admin and requires a password change. Remove bootstrap secrets after the controlled checkpoint.
- Password change rotates the current session and revokes old sessions; reset and disablement revoke all sessions.
- The last active Super Admin cannot be disabled, demoted or stripped of critical recovery permissions.
- Failed-login responses do not disclose account existence, and routine failures do not flood Audit.
- State-changing staff-auth endpoints require trusted-origin checks. Customer sessions never authorize Admin APIs.

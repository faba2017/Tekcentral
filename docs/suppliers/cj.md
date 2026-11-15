# CJ Dropshipping

CJ operations are organized through the Supplier Hub. The CJ workspace owns catalogue discovery, imported supplier products, exact variant evidence, stock and logistics checks, mappings, synchronization status, health, and links to filtered Supplier Orders. Settings owns shared supplier policy; TekCentral Product publication remains Product-level.

## Product handoff

After an exact CJ PID/VID mapping is verified and commercial evidence is complete, the mapped TekCentral Product owns pricing approval, launch selection, controlled image storage, content review, readiness, and publication. CJ offer state is not changed by Product launch selection or publication. Published versions retain the exact mapping internally for future procurement while public snapshots omit CJ identity, cost, and FX evidence.

Stale CJ API source-price evidence is refreshed read-only for the exact PID, VID, and variant SKU. TekCentral re-applies the standard quantity-one source-price priority, retains prior observations, reuses fresh FX evidence, and reconciles pending Product pricing without approving it. Manual supplier-price overrides remain a fallback rather than the normal refresh path.

## CONFIRMED PHASE 7A-CJ

- CJ Dropshipping API V2 is TekCentral's first real supplier API foundation.
- API base URL: `https://developers.cjdropshipping.com/api2.0/v1`.
- Authentication uses backend-only `CJ_API_KEY` with
  `POST /authentication/getAccessToken`.
- Token refresh uses `POST /authentication/refreshAccessToken`.
- Read-only product search uses `GET /product/listV2`.
- Autocomplete uses the same read-only `GET /product/listV2` normalization path
  through TekCentral's backend with a small result size.
- Category browsing uses `GET /product/getCategory`; category product browsing
  passes CJ category IDs back to ListV2 where supported.
- Default category/search/autocomplete behavior applies TekCentral's internal
  technology lens from `backend/suppliers/cj/cjCataloguePolicy.ts`.
- Current ListV2 responses group products under `data.content[].productList[]`.
  Search normalization must extract individual product rows from that nested
  path.
- Product detail lookup uses `GET /product/query`.
- Variant lookup uses `GET /product/variant/query` and
  `GET /product/variant/queryByVid`.
- Stock lookup uses `GET /product/stock/queryByVid`.
- Tokens and credentials must never be exposed to the browser.

## PHASE BOUNDARY

Phase 7A-CJ may read authentication, settings, categories, products, variants
and stock data.

Phase 7B-CJ may create one unpaid CJ order from an approved internal CJ
SupplierOrder when staff explicitly confirms the action and
`CJ_REAL_ORDER_CREATION_ENABLED=true`.

Phase 7B-CJ must not pay, balance-pay, confirm, cancel, dispatch or fulfil CJ
orders automatically.

## DISCOVERY UX

The CJ admin page separates supplier discovery from operational actions:

- Discover: autocomplete, search and category browse call TekCentral backend
  endpoints and default to TekCentral technology groups.
- Select: staff choose a real CJ product ID/SKU from CJ results.
- Review: the right-side current-selection workflow shows the selected product
  and exact CJ-returned variant choices.
- Import: staff store the CJ product in TekCentral's supplier catalogue from
  the same workflow panel.
- Map: staff suggest association with a TekCentral storefront product only
  after an exact variant is selected.
- Verify: staff confirm the mapped product/variant is the same sellable item.

Recent searches and recently viewed CJ products are local admin browser state.
Recently imported products come from `.data/supplier-catalogue-cj.json`.
No CJ credentials or tokens are exposed to the browser.

TekCentral technology groups currently include real CJ category IDs for:

- Computers & Accessories
- Networking
- Cables & Connectivity
- Power & Charging
- Storage
- Mobile Technology
- Security & Cameras
- Smart Technology
- Office Technology

`All CJ catalogue` is an explicit read-only inspection mode for the wider CJ
marketplace. It must not create supplier orders, bypass import review or relax
mapping verification.

Variant filtering is local over variants already returned for the selected CJ
product. Staff cannot invent a variant SKU or VID.

Pasted exact CJ identifiers are resolved before normal keyword search. Product
IDs and product SKUs use `GET /product/query`; VID lookup uses
`GET /product/variant/queryByVid` before resolving the parent product; variant
SKU lookup uses `GET /product/query` with `variantSku`. Unknown identifiers
return a specific no-match response and do not fall back to fuzzy search.
Technology scope remains active for exact matches; if a real identifier is
outside TekCentral's technology lens, staff are prompted to switch to
`All CJ catalogue`.

Staff can run a read-only `Check delivery to South Africa` action after an
exact CJ variant is selected. The check verifies the current VID, resolves
source warehouse country data from CJ stock, reads weight and product logistics
properties from CJ product/variant data, and calls
`POST /logistic/freightCalculateTip` with `destAreaCode=ZA` and quantity `1`.
If the freight trial returns no methods, TekCentral calls
`POST /logistic/unavailableShippingMethods` with the same normalized trial
payload to show safe diagnostic reasons. Available exact-VID results are cached
briefly by CJ PID, VID and `ZA` destination and retain `checkedAt`; concurrent
identical checks share one request. CJ throttling is reported as `RATE_LIMITED`
with a retry cooldown and temporary upstream failures remain retryable. Neither
condition is converted to a no-route result or cached as unavailable. The check
does not create orders, reserve stock, select a supplier, update mappings or
persist permanent availability. An empty logistics result means that
exact variant currently has no CJ route to South Africa, not that all CJ
products are unsuitable.

Imported CJ catalogue records are managed at `/admin/suppliers/cj/imported`.
That page provides search, category/mapping/supplier-status filters, sorting
and pagination. It does not include CJ ordering actions.

The staff-confirmed Product creation preview derives an editable supplier-neutral
draft from the exact CJ PID and selected VID. Deterministic cleanup removes
marketplace noise and duplicate title fragments, preserves distinguishing
variant attributes, maps only to existing TekCentral categories/subcategories,
and prefills internal evidence provenance. Brand and model are proposed only
when supported by source identity; unknown values remain blank. Previewing is
read-only and Product creation still requires explicit staff confirmation.

## IDENTIFIERS

CJ product ID, product SKU, variant ID and variant SKU must be preserved
separately. A verified TekCentral mapping must identify the exact CJ variant
when variant choice changes the physical product.

For ListV2 search rows, TekCentral currently treats `id` as the CJ product ID,
`sku` as the CJ product SKU, `nameEn` as the preferred display name and
`bigImage` as the preferred search-result image.

## PENDING CONFIRMATION

- Supplier cost interpretation.
- Currency conversion rules.
- Direct fulfilment terms.
- Returns and supplier RMA workflow.

## PHASE 7B-CJ ORDER CREATION

TekCentral uses current CJ API V2 `POST /shopping/order/createOrderV2` for the
initial write path.

Chosen mode:

- `payType=3`
- create order only
- no CJ balance payment
- no add-to-cart or order confirmation automation

Required TekCentral gates:

- paid customer order
- no active operational hold
- approved internal CJ SupplierOrder
- exact `VERIFIED` CJ product and variant mapping on every line
- shipping snapshot with recipient name, phone, country/code, province, city,
  address and postal code
- South Africa shipments must pass local recipient validation before CJ order
  creation. Phone must normalize to CJ's accepted ZA format. Consignee ID is
  optional by default because CJ's generic create-order contract marks
  `consigneeID` optional; TekCentral only blocks missing consignee ID when the
  selected CJ route is known to require it. If a consignee ID is supplied, it
  must normalize to exactly 13 digits and is masked in admin diagnostics.
  Current sandbox evidence for the tested ZA variant shows `CJPacket Liquid
  Line`, `CJPacket Sensitive` and `CJPacket Postal` require consignee ID, while
  `PostNL` and `DHL Official` accepted sandbox create requests without it.
- When no consignee ID is stored, CJ preflight can automatically select a
  confirmed no-ID route. The initial policy selects the available route with
  the lowest total CJ cost, excludes routes known to require consignee ID,
  excludes routes with unknown ID requirement, and requires a delivery estimate.
  The selected route, source country, cost snapshot, estimate and selection
  reason are stored on the SupplierOrder. Staff can override the selected CJ
  logistics method before create.
- Operational consignee ID is scoped to the SupplierOrder. It is not collected
  in public checkout or stored on a permanent customer profile. Saved values are
  masked in admin views and payload previews; malformed values are rejected
  locally.
- If no confirmed no-ID route can be selected and no valid consignee ID is
  available for an ID-required route, TekCentral records
  `CJ_RECIPIENT_INFORMATION_REQUIRED` attention so paid orders do not remain
  silently blocked.
- fresh CJ variant and stock checks
- CJ-returned logistics option selected by staff
- deterministic external TekCentral order reference
- local idempotency/request fingerprint

Freight preflight uses the same CJ freight trial path as the catalogue
delivery eligibility check:

- `POST /logistic/freightCalculateTip`
- source warehouse country from CJ stock
- destination country from the customer delivery snapshot
- authoritative CJ VID/SKU, weight and product logistics properties
- actual supplier-order quantity

If the trial returns no methods, TekCentral calls
`POST /logistic/unavailableShippingMethods` with the same normalized payload
to capture safe diagnostic reasons.

If no logistics options are returned, TekCentral blocks create and shows a
sanitized admin diagnostic. This may mean the request data is incomplete or the
selected CJ variant currently has no route to South Africa. Staff should choose
another CJ variant/product or another supplier unless the diagnostic shows a
local request-data problem.

CJ shipping payload is built only from the backend order delivery snapshot.
Customer email, notes and unrelated customer data are not sent unless a future
documented CJ contract requires them.

If a create request has an uncertain network result, TekCentral stores
`UNKNOWN_RESULT`. Staff must use Reconcile CJ Order before any retry can create
another external order.

CJ order refresh/reconciliation uses the read-only `GET /shopping/order/list`
lookup with the stored external reference/order content. Refresh must preserve a
valid `CREATED` external submission if CJ lookup fails or temporarily returns
no match.

## PRODUCT LAUNCH PIPELINE

CJ catalogue products use the same TekCentral launch lifecycle as other suppliers. An exact CJ variant is normalized as a `SupplierOffer` with identity `CJ:<productId>:<VID>`. Product ID, product SKU, VID and variant SKU remain separate throughout mapping and later SupplierOrder creation.

The current TekCentral public Product model does not contain a variant collection. Each materially different CJ variant is therefore treated as an exact sellable-unit mapping to one supplier-independent Product. Variant attributes remain variant-scoped suggestions and are not copied to sibling variants.

Before creation, TekCentral searches existing products using exact manufacturer and model evidence. Supplier titles alone never qualify. An exact cross-supplier match maps CJ to the existing Product; otherwise staff may create one Product only when manufacturer/model identity and category are explicitly confirmed. Generic or weak-identity products remain `REVIEW_REQUIRED`.

CJ variant launch selection is curated and uses `NOT_SELECTED`, `CANDIDATE` and `SELECTED_FOR_LAUNCH`. Imported products are not selected automatically. Readiness requires an exact verified mapping, complete source-backed logistics, authoritative cost/currency, approved shared pricing, and staff launch selection. Publication continues through the existing immutable TekCentral publication system.

CJ product and variant prices remain in their source currency. Catalogue pricing uses the shared pricing engine and supplier-neutral FX evidence. Current automatic quotes are cached by currency pair; documented manual FX is a secondary fallback. Proposals remain pending approval and never publish automatically. Dynamic customer checkout shipping remains separate.

CJ participates in the shared foreign-currency impact monitor as a normal
supplier offer. FX refresh can surface margin drift and create a pending review
proposal in ASSISTED mode, but CJ does not own thresholds or approval. Live
storefront prices change only through explicit approval and publication.

CJ source images enter publication through TekCentral's existing content-addressed image ingestion. Supplier descriptions are stripped of HTML, scripts, supplier contact language and shipping claims before becoming reviewable draft content. Public snapshots never expose CJ IDs, SKUs, costs, API metadata or supplier identity.

Exact-VID publication enrichment normalizes cached CJ Product detail into
supplier-neutral review suggestions. Product-level facts may supplement the
selected variant, but variant identity such as length comes only from that
exact VID. Suggested copy and specifications remain separate from saved staff
content until explicitly accepted, and additional CJ image URLs remain
controlled-ingestion candidates rather than public hotlinks.

## PRODUCT EVIDENCE GATE

CJ launch evidence is reviewed at exact product and VID level. A historical `VERIFIED` label is not sufficient when its evidence is only a staff candidate or fuzzy title; the explicit cohort audit moves that mapping to `REVIEW_REQUIRED` without replacing its identifier, timestamps, actor or evidence history. Exact manufacturer/model, manufacturer SKU, GTIN/EAN/UPC, or a staff-confirmed Product created from the exact CJ variant can support verification.

Currency has explicit provenance: `CJ_API_CONTRACT`, `API_FIELD`, `ACCOUNT_CONFIGURATION`, `CJ_DOCUMENTED_DEFAULT`, `ADMIN_CONFIRMED`, or `UNKNOWN`. CJ catalogue `sellPrice` and exact-variant `variantSellPrice` are USD under the official API contract. Non-ZAR costs require configured FX evidence and never receive an implicit exchange rate.

Variant logistics observations retain the CJ source field, source fingerprint, capture time, unit, classification and confidence. `variantWeight`/`weight` are treated as shipping-weight evidence in grams only when captured by the current CJ normalizer. Dimensions are retained as product-dimension evidence in millimetres and do not become package dimensions. Historical numbers without field-level provenance remain partial review evidence. Freight quotes corroborate route eligibility only and do not fill static dimensions.

`READY_FOR_PRICING` is derived only when product mapping and exact VID are verified, cost and currency are authoritative, FX evidence exists when required, and variant logistics are complete. The evidence audit does not select products for launch, create or approve pricing, publish products, or call CJ order endpoints.

The controlled source refresh calls only CJ product detail, variant detail, and cached category endpoints for products already imported into the evidence cohort. Refresh observations retain endpoint, source fields, fingerprints and capture times; repeated identical fingerprints are deduplicated while prior observations and staff evidence remain stored.

Exact-variant availability refresh is a separate read-only action. It verifies the stored PID, VID, and variant SKU through `/product/variant/queryByVid?features=enable_inventory`, then reads `/product/stock/queryByVid` for that VID. Normalized stock stores the total, warehouse rows, observation time, endpoint, source fingerprint, and returned field names. Product publication versions are not changed. Fresh exact quantity drives `IN_STOCK`, `LOW_STOCK`, or `OUT_OF_STOCK`; fresh complete logistics without quantity drives `DELIVERY_CHECK_REQUIRED`; stale evidence degrades to `AVAILABILITY_UNKNOWN`. The storefront receives only the supplier-neutral state and label.

CJ exact-variant source pricing preserves commercial semantics. Quantity-applicable stock-up `tradePrice` is preferred, followed by applicable wholesale/direct-wholesale tiers and then `variantSellPrice`. Product-level range prices never replace an exact VID price. Each observation stores USD amount, source field, endpoint, timestamp and fingerprint. Manual procurement evidence remains an explicit higher-authority fallback/override with reason and source history.

One exact intended variant can progress independently of unselected sibling variants. A VID returned by CJ proves supplier identity but does not by itself prove the business meaning of that sellable option; staff must review its SKU, title and properties before marking `VARIANT_VERIFIED`.

The imported-products evidence workspace resolves product identity before commercial evidence. Staff may reverify a correct historical relationship, deliberately map the exact VID to an existing supplier-neutral Product, or create a new internal Product from documented identity evidence. Replacing a relationship marks the prior mapping `SUPERSEDED` and links it to the verified replacement; history is never deleted. Demo/test Product targets remain visibly warned and require explicit confirmation.

Supplier-catalogue import, Product creation, mapping and publication are separate actions. For an exact selected VID, staff can either map to an exact existing TekCentral Product or preview an editable supplier-neutral Product candidate. Preview is read-only and includes a cleaned title, source-backed brand/model, taxonomy suggestion, shared SKU proposal, variant attributes, image candidate and provenance summary. Brand may remain `Unbranded` and model may remain unknown when CJ does not provide defensible evidence; title, category, exact VID and documented review evidence remain mandatory.

Before creation, strong identity checks use manufacturer/model, manufacturer SKU, GTIN/EAN/UPC, exact source-offer identity and existing supplier relationships. An exact Scoop-backed Product is reused rather than duplicated. Fuzzy descriptive matches are advisory only. Creation and exact mapping share a source-offer idempotency boundary, so retries reuse a Product already created for the same PID/VID and recover a missing mapping instead of creating another Product. New Products remain internal drafts and source images remain publication candidates subject to normal TekCentral ingestion.

The selected evidence VID is stored at product level with actor, timestamp, note and selection history. Procurement cost remains attached to the exact variant, so changing the selected VID does not transfer an old variant's cost or readiness. Account-level CJ purchasing currency may be confirmed once with a documented source and is then derived by the cohort without copying unexplained currency values into products. Non-ZAR readiness requires a configured, non-stale supplier-neutral FX rate.

The canonical CJ product workspace exposes currency, exact-VID procurement cost, shared current FX and normalized ZAR cost. Account-level currency is applied only after explicit staff selection. FX refresh reconciles eligible pending proposals but does not approve pricing, publish products, or call CJ order/payment APIs. Imported Products links back to this canonical workflow instead of maintaining a second editor.

`READY_FOR_PRICING` requires a verified active mapping, the verified selected VID, a current exact-VID source-price observation, complete logistics and valid FX evidence where applicable. USD is normalized to ZAR using the recorded rate and timestamp. Merchandise pricing excludes freight; supplier logistics remains separate operational evidence. Reaching this state creates or reuses only a shared `PENDING_APPROVAL` pricing proposal and never approves pricing, selects launch assortment, publishes, or writes to CJ.

## First Real CJ Order Test

Requirements:

- use a very low-value test item
- verify the TekCentral product is mapped to the exact CJ product and variant
- use a controlled test shipping address supplied by the user
- ensure the local TekCentral customer order is `PAID`
- ensure no operational hold is active
- run CJ preflight and select a CJ-returned logistics method
- check the supplier amount and source currency
- explicitly confirm `Create CJ Order`
- verify the CJ dashboard/API shows exactly one unpaid order for the
  TekCentral external reference
- do not pay the CJ order during Phase 7B testing
- remove or cancel the test order manually in the CJ dashboard if needed
# Catalogue enrichment

CJ Product, exact variant and source-category evidence uses the shared canonical suggestion service. Exact VID identity remains required where applicable. Image candidates are reviewed and ingested into controlled Product media; neither taxonomy nor images publish automatically.

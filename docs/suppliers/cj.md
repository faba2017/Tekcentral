# CJ Dropshipping

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
payload to show safe diagnostic reasons. The result is transient UI state with
`checkedAt`; it does not create orders, reserve stock, select a supplier,
update mappings or persist availability. An empty logistics result means that
exact variant currently has no CJ route to South Africa, not that all CJ
products are unsuitable.

Imported CJ catalogue records are managed at `/admin/suppliers/cj/imported`.
That page provides search, category/mapping/supplier-status filters, sorting
and pagination. It does not include CJ ordering actions.

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

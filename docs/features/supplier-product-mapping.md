# Supplier Product Mapping

## PHASE 7A-CJ

Supplier mappings connect TekCentral internal products to supplier catalogue
products and, where required, exact supplier variants.

CJ mappings must be keyed by:

- TekCentral `productId`
- supplier code `CJ`
- CJ product ID
- CJ product SKU
- CJ variant ID where applicable
- CJ variant SKU where applicable

Do not treat a CJ parent product SKU as interchangeable with a CJ variant SKU.

The CJ admin workflow must require staff to select the exact CJ variant before
TekCentral product matching controls are enabled. A single returned CJ variant
still requires an explicit staff click in the UI so the mapping summary is tied
to the same selected variant object shown in review.

Variant options must come from the selected CJ product's returned variant data.
For small variant sets the UI shows all variants directly. Larger variant sets
may expose `Filter available variants`, which filters only the already-loaded
variant list by name, SKU and structured attributes. It is not a CJ catalogue
search and must not create free-text supplier identifiers.

TekCentral product candidate matching is search-first. The UI should not show
unrelated default TekCentral products before staff enter at least two search
characters, and ranking should prefer category-compatible results when CJ
technology group metadata is available.

## STATUS MODEL

Mappings support:

- `UNMAPPED`
- `SUGGESTED`
- `VERIFIED`
- `REJECTED`
- `STALE`

Only `VERIFIED` CJ mappings may eventually be used for real CJ supplier order
creation. Phase 7A still does not place real supplier orders.

## SOURCE RULE

For CJ, supplier SKU values must originate from the CJ API. Staff may suggest or
verify mappings, but they must not manually guess CJ supplier SKU values.

## STAFF VERIFICATION

Automatic or staff-selected candidate matches remain `SUGGESTED` until a staff
member explicitly verifies them.

Before creating a suggested CJ mapping, staff should see a summary of the
TekCentral product, CJ product and CJ variant that will be linked.

If a verified CJ mapping later points to a missing imported product or missing
variant, it must become `STALE` and require staff review. TekCentral must not
silently remap to a different CJ product or variant.

## CUSTOMER BOUNDARY

Supplier mappings are internal operational data. Customer-facing APIs must not
expose supplier identity, supplier SKU, CJ product IDs, CJ variant IDs, supplier
cost, stock snapshots, API status, request IDs or mapping metadata.

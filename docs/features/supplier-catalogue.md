# Supplier Catalogue

## PHASE 7A-CJ

Phase 7A introduces a normalized internal supplier catalogue for selected CJ
Dropshipping products.

The CJ ListV2 search response is normalized from
`data.content[].productList[]`. Rows without an authoritative CJ product ID are
counted as invalid internal parse results and are not rendered as actionable
View/Import products.

Autocomplete suggestions use the same canonical ListV2 normalization path and
are limited to real CJ products with product identity. The frontend may cache
autocomplete responses briefly for the current admin session, but it must not
fabricate supplier suggestions.

CJ category browsing uses real CJ categories from the supplier category API.
When a category is selected, TekCentral passes the CJ `categoryId` to supported
catalogue search requests rather than inventing local category mappings.

Phase 7A-CJ.4 adds a TekCentral technology catalogue lens on top of real CJ
categories. The backend policy groups selected CJ category IDs into:

- Computers & Accessories
- Networking
- Cables & Connectivity
- Power & Charging
- Storage
- Mobile Technology
- Security & Cameras
- Smart Technology
- Office Technology

Search, autocomplete and browse default to this technology lens. Staff can
switch to `All CJ catalogue` for read-only inspection of broader CJ results,
but that mode does not change import or mapping rules.

Short technology searches such as `UPS`, `USB`, `SSD`, `RAM` and `AP` must use
deterministic token/relevance matching to avoid unrelated marketplace matches.
Supplier prices should show their source currency when available, otherwise the
UI should avoid implying a converted or confirmed price.

Supplier catalogue records are separate from public TekCentral storefront
products. Importing a CJ product does not add it to the customer catalogue and
does not change TekCentral selling prices.

## CJ STORAGE

Imported CJ products are stored locally in:

- `.data/supplier-catalogue-cj.json`

This is development/staging persistence only until a real database is approved.

## NORMALIZED FIELDS

Supplier catalogue products preserve:

- supplier code
- supplier product ID
- supplier product SKU
- product name
- category ID and name
- image URL
- description
- supplier price snapshot and currency where available
- variants
- stock snapshots where queried
- source fingerprint
- TekCentral technology group annotation where the CJ category policy can
  identify one
- import and refresh timestamps

CJ-specific product and variant identifiers are preserved for future order
creation, but Phase 7A does not create, submit, pay or cancel CJ orders.

## IMPORT RULE

TekCentral must not mirror the entire CJ catalogue. Staff search CJ, inspect a
product, import selected candidates and then create supplier mappings for staff
verification.

Discovery, selection, import, mapping and verification remain separate actions.
Selecting an autocomplete suggestion does not import a supplier product or
create a mapping.

Recent searches and recently viewed products are local admin discovery aids.
Recently imported products are read from the supplier catalogue repository.

The `/admin/suppliers/cj` discovery page must not render an unbounded imported
product list. It shows a compact imported summary and links to the dedicated
`/admin/suppliers/cj/imported` page.

The imported CJ products page supports staff management of deliberately
imported supplier catalogue records with product/CJ SKU/product ID search,
category filtering, mapping-status filtering, supplier-status filtering,
variant count filtering, sorting and pagination. Actions are limited to view,
read-only refresh and mapping review paths.

## CUSTOMER BOUNDARY

Supplier catalogue data is admin/internal only and must not be exposed through
customer order or storefront APIs.

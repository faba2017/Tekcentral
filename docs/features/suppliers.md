# Supplier Operations Ownership

Syntech supports catalogue, content/image/attribute evidence, dealer pricing, promotions, branch stock, shipment ETA, sync history, verified Product mapping, and staff-controlled UAT order creation. Production ordering, order-status polling, tracking, and supplier payment remain unsupported.

TekCentral separates supplier policy, supplier operations, public Product lifecycle, and procurement:

- **Settings → Suppliers** owns shared supplier policy, freshness defaults, enablement policy, and global defaults.
- **Supplier Hub** at `/admin/suppliers` owns supplier catalogues, mappings, evidence, stock, logistics, synchronization, supplier health, and operational actions.
- **Products** at `/admin/products` owns supplier-neutral TekCentral Product content, pricing readiness, launch selection, publication review, and storefront versions.
- **Supplier Orders** remains a top-level cross-supplier procurement workspace and can be filtered by supplier from a supplier workspace.

## Registry and capabilities

Operational suppliers are registered with stable IDs and explicit capability support. Current operational workspaces are `TEKCENTRAL`, `CJ`, `SCOOP`, and `SYNTECH`. Existing legacy allocation supplier codes remain available to historical order data but are not presented as configured Hub workspaces.

## TekCentral Manual Supplier

`TEKCENTRAL` is an internal/manual supplier, not a customer-facing brand or an external integration. Staff create offers beneath existing canonical Products using a supplier-scoped unique SKU, ZAR source cost excluding VAT, current physical stock quantity, active state, and optional private notes/reference. The offer repository stores separate cost and stock observations, a deterministic fingerprint, mapping identity, and create/update/deactivate audit summaries.

Creation confirms an exact `VERIFIED` mapping without copying or overwriting Product title, taxonomy, content, imagery, SEO, approved price, publication, or other supplier offers. Active stock contributes to the shared multi-supplier availability resolver. Shared supplier settings control cost and stock freshness; stale stock becomes `CHECK_REQUIRED`, while stale cost is visible to staff and cannot silently support future pricing indefinitely. Inactive offers are ignored but retained.

Phase A has no external connection to test and reports internal repository health. It does not provide SupplierOrder creation, API/email/portal ordering, reservation, stock decrement, warehouse operations, packing, dispatch, tracking, returns/restocking, supplier payment, CSV import/export, or public supplier disclosure. Product creation/onboarding and procurement/cost-basis operations begin in later Manual Supplier phases.

### Phase B operations

- Offers may begin unmapped, then map to an existing Product or create a canonical Product after staff confirmation.
- Product creation requires a distinct canonical SKU, canonical taxonomy, reviewed content, and the existing controlled image pipeline.
- Initial stock and every later change are adjustments recording before/after quantity, reason, actor, and timestamp. `onHand` equals available stock; reserved remains zero.
- Cost updates retain old/new evidence and do not mutate approved/public prices or historical order cost.
- Current verified cost can generate a shared-engine pricing proposal requiring normal approval.
- Readiness combines mapping, taxonomy, content, controlled image, current stock/cost, launch selection, and approved pricing. Ready state opens explicit publication review only.

Phase B does not allocate orders or create Manual SupplierOrders.

Capabilities distinguish catalogue, product/variant detail, stock/warehouse stock, pricing, logistics, images/content, evidence, synchronization, health, mappings, ordering, tracking, and payment support. Unsupported capabilities are never presented as working controls.

Settings exposes these registry capabilities and procurement modes as read-only facts. The shared source-price and stock freshness thresholds are editable policy and are consumed by supplier pricing/readiness and public availability evaluation. Refresh scheduling, evidence capture, mappings, stock correction, and other operational actions remain supplier-workspace responsibilities.

Adding a future supplier requires a registry entry, adapter/capability implementation, configuration status, and workspace integration. It must not add supplier-specific global navigation.

Supplier integration configuration is visible under Settings -> Integrations. CJ credentials and its provider endpoint are environment/system managed. Scoop's XML feed URL is revisioned policy restricted to the approved Scoop HTTPS host. Testing a Scoop feed parses it without mutating the catalogue; the separate refresh action remains the only feed-sync operation.

## Routes

Supplier workspace sections use `/admin/suppliers/:supplierId/:section`. Current catalogue pages remain canonical operational tools at `/admin/suppliers/cj` and `/admin/suppliers/scoop`. Existing CJ imported-product, mapping, and Scoop deep links remain valid.

The Hub summary endpoint returns only backend-derived catalogue, mapping, order-attention, synchronization, configuration, and health data. It does not expose credentials or raw customer-facing supplier internals.

## Supplier catalogue table semantics

Primary Scoop, Syntech, CJ, and TekCentral Manual supplier lists share a common operational hierarchy: supplier identity/reference, source category evidence where available, commercial evidence, raw supplier stock, canonical TekCentral availability, mapping, canonical 12-step Product readiness, and next action. Supplier-specific evidence and secondary operations remain local to each workspace.

Mapped-row actions are serialized from the canonical Product onboarding service and open the shared Product Configuration Workspace at its server-selected step. Unmapped rows continue into the supplier's exact mapping/review flow. Raw supplier availability is never presented as customer availability; the canonical availability service supplies the separate TekCentral state and freshness consequence. Admin response redaction remains authoritative for supplier cost, margin, and private stock fields.

## Syntech Product workflow

The Syntech workspace provides server-paginated catalogue filtering and a staff review drawer for taxonomy, create-new, map-existing, pricing, and readiness work. Syntech is attached as another SupplierOffer beneath a supplier-neutral Product; CJ and Scoop offers coexist and are not replaced. No Syntech ordering capability is enabled.

## Syntech procurement capability

Syntech `ORDER_CREATE` is implemented only as a staff-controlled UAT capability. Provider support and TekCentral implementation do not imply production readiness. Production order creation remains disabled, and the integration configuration test validates settings without making an order request.

## TekCentral Internal Fulfilment

TEKCENTRAL is staff-selectable only for paid lines with an active verified exact manual offer, fresh cost and stock evidence, and enough `available` stock for the complete line. The current SupplierOrder model does not split one line, so partial manual allocation is intentionally blocked.

SupplierOrder creation atomically reserves stock. Approval captures immutable per-line ZAR cost basis. Staff then progress the internal order through picking, packed, and ready before a confirmed fulfilment consumes stock once. Cancellation before consumption releases the reservation; consumed stock is never restored by cancellation or refund. Supplier identity, manual SKU, quantities, costs, stages, and audit remain internal.

Phase D links physically received returns to exact fulfilled SupplierOrders and manual offers. Receipt never changes stock. Explicit inspection disposition appends either a sellable `RETURN_RESTOCK` movement or non-sellable `RETURN_WRITE_OFF` evidence. Invalid stock/reservation invariants degrade internal supplier health. Multi-warehouse, barcode, reorder and purchase-order automation remain Phase E boundaries.

### Phase E inventory operations

- Optional per-offer reorder thresholds and target levels create staff attention only. They never order stock or change pricing.
- Inventory CSV changes require an all-or-nothing preview and explicit commit. Stock rows append canonical ledger movements; cost rows append cost history. Import/export remains private to admin operations.
- Exact keyboard-wedge lookup supports manual supplier SKU, canonical Product SKU, and internal Product EAN/GTIN/UPC. Camera scanning is not implemented.
- Replenishment plans are internal records. Planning or marking an external order does not change stock; only a confirmed physical receipt appends an idempotent `STOCK_RECEIVED` movement.
- `TEKCENTRAL_MAIN` is the current logical location. True multi-location quantities, reservations, transfers, picking allocation, and location-level availability remain deferred so the proven single inventory pool stays authoritative.
- Forecasts use fulfilled TekCentral SupplierOrder quantities over 7 and 30 days. They are advisory and show no velocity when evidence is insufficient.
Supplier refresh and post-payment procurement failures feed the shared operational-alert service. Supplier-wide failures aggregate rather than creating one alert per SKU. Expected Syntech manual procurement is not itself treated as a failure.

## Audit projection

Supplier refresh completion is recorded as `SYSTEM` activity; staff mapping decisions and manual procurement references are `OPS` audit events. Supplier credentials and raw feed payloads are excluded.

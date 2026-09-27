# Supplier Workspaces

## Permanent Admin Navigation Standard

TekCentral admin navigation is function-based, not supplier-based.

Global admin navigation must remain:

- Dashboard
- Orders
- Returns
- Refunds
- Supplier Orders
- Supplier Mappings
- Suppliers

Supplier names must not become top-level global navigation items. Do not add
global items such as `Scoop`, `Scoop Imported`, `MiRO`, `Pinnacle`, `Mustek`,
`CJ` or `CJ Imported`.

## Supplier Entry Point

`Suppliers` is the single global supplier entry point.

Routes:

- `/admin/suppliers` is the Supplier Hub.
- `/admin/suppliers/:supplierCode` is the supplier workspace.
- `/admin/suppliers/:supplierCode/imported` is the supplier-local imported
  catalogue page where implemented.
- `/admin/suppliers/:supplierCode/catalogue` may be used for future supplier
  catalogue routes.
- `/admin/suppliers/:supplierCode/settings` may be used for future supplier
  settings routes.

Only create routes that are actually needed. Do not scaffold empty supplier
pages.

## Central Supplier Registry

All supplier workspaces must register through the central supplier registry.
The registry is the source of truth for supplier display names, routes, enabled
state and workspace capabilities.

Adding a supplier must not require manually adding global admin navigation
items.

Future suppliers such as Scoop, MiRO, Pinnacle and Mustek must follow this
structure when their integrations are approved.

Backend supplier operations use the same registry principle. Supplier adapters
declare supported order modes and capability states, and generic orchestration
must gate supplier actions through those declarations. Supplier-local pages may
surface only capabilities that are actually implemented or safely manual.

## Supplier Workspace Navigation

Supplier-specific navigation lives inside the supplier workspace.

Standard supplier-local tabs are capability-driven and may include:

- Overview
- Catalogue
- Imported Products
- Mappings
- Settings

Each supplier should show only tabs backed by implemented capabilities. For
example, a supplier with catalogue read and imported catalogue support can show
`Catalogue` and `Imported Products`, while mappings can link to the global
Supplier Mappings operation with a supplier filter.

## Operational Boundaries

Supplier Orders and Supplier Mappings may remain global admin functions because
they are cross-supplier operational work queues.

Supplier-local catalogue, imported catalogue and settings pages should remain
inside `/admin/suppliers/:supplierCode`.

Supplier hub cards may show only real data already available through
TekCentral backend/admin APIs. Do not fabricate connection state, stock state,
capabilities or future supplier readiness.

Real supplier order operations, where approved, belong on the Supplier Order
detail workflow and may link back to the supplier workspace for catalogue or
mapping context. Do not add supplier-specific global navigation items for real
order creation.

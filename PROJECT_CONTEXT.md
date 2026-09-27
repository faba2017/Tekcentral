# Project Context

## CONFIRMED

TekCentral is an existing React application being transformed into a commercial AI-powered technology store and IT procurement platform.

The current app is frontend-only and renders a working interactive 3D robot hero. The existing interactive robot and future AI technology assistant is named Zeus.

Primary public domain:

- `https://tekcentral.co.za`

Initial geographical focus:

- South Africa

Target customer types:

- B2C customers
- B2B customers

Current development phase:

- Phase 7B-CJ - Staff-approved real CJ order creation

Accepted public brand:

- TekCentral

Accepted AI assistant identity:

- Zeus

## PLANNED

The platform should eventually combine:

- E-commerce
- Technology procurement
- AI-assisted product discovery
- Business IT solution recommendations
- Quotations
- Supplier integration
- Installation and configuration service opportunities

Zeus should eventually help customers describe requirements and receive suitable technology recommendations. Example use cases include equipping an office for employees or planning Wi-Fi for a guesthouse.

Potential product areas:

- Computers
- Networking
- Printing and office technology
- Security
- Power
- Smart technology
- Accessories

Potential revenue areas:

- Product sales
- TekCentral Business IT solution packages
- Installation
- Configuration
- Remote setup
- Support or maintenance packages
- Business quotations

## PENDING CONFIRMATION

- Confirmed launch suppliers
- Supplier APIs or feeds
- Product data source
- Stock and cost availability
- VAT handling
- Delivery and fulfilment model
- Warranty and return terms
- Zeus AI provider and recommendation logic

## UNDECIDED

- V1 launch scope for Zeus assistance
- V1 product scope
- Backend platform and database
- Authentication requirements
- Image provider or asset pipeline

## CONFIRMED Phase 4 Demo Commerce

Phase 4 adds a customer-facing checkout, order confirmation, order history,
order detail, cancellation request, return request and refund status experience.

This remains frontend-only demo commerce. Orders, returns and refunds are stored
locally in the browser to validate customer journeys before real backend,
payment, supplier, fulfilment, authentication or notification services are
approved.

## CONFIRMED Phase 4.5 PayFast Sandbox

PayFast is the first payment gateway integration path for TekCentral.

Phase 4.5 is sandbox-only. Hosted PayFast checkout is initiated through a
server-side payment boundary, and payment confirmation depends on PayFast ITN
validation rather than the customer returning to the browser.

Live payments, production credentials, supplier ordering, refunds through the
PayFast API and automated fulfilment remain out of scope.

## CONFIRMED Phase 5 Internal Operations

Phase 5 adds a development/internal staff workspace at `/admin`.

The admin workspace uses the current backend demo order persistence and supports
operations review for orders, returns, refunds, internal notes, supplier
allocation preparation and shipment metadata. Supplier allocation is internal
planning only; no real supplier order placement, supplier API, courier API,
PayFast refund API or production staff authentication is active.

Phase 5.1 refines the workspace with derived attention queues, semantic status
badges, operational holds, packing slips, parcel records and shipment records.
These remain internal/demo operations tools.

## CONFIRMED Phase 6 Mock Supplier Orchestration

Phase 6 adds internal supplier order records generated from paid customer orders
and staff supplier allocations.

Supplier orders move through approval, mock submission, mock confirmation,
backorder, rejection and dispatch states without contacting real suppliers,
calling supplier APIs, sending emails, automating portals or calling courier
services.

Supplier order data is internal only. Customer order APIs strip supplier
allocations, internal notes, operational holds, parcels and shipment internals
from public order responses.

## CONFIRMED Phase 6.1 Supplier Workflow Hardening

Phase 6.1 hardens mock supplier orchestration with server-side procurement
exclusivity, supplier order supersession, operational hold gating, supplier SKU
mapping requirements, dispatch field validation and customer/internal data
separation regression coverage.

Only one active supplier procurement path may cover a customer order item
quantity at a time. Historical supplier orders remain for audit and can be
marked superseded when an unapproved draft/ready supplier order is replaced.

## CONFIRMED Phase 7A-CJ Read-Only Supplier Foundation

Phase 7A-CJ adds TekCentral's first real supplier API foundation using CJ
Dropshipping API V2 through backend-only authentication.

This phase may read CJ authentication, settings, product search, product detail,
variant and stock endpoints. It may import selected CJ catalogue records and
create staff-verified mapping records.

This phase must not create, submit, pay or cancel real CJ orders. CJ credentials
and tokens remain backend-only and are never returned to the browser.

Phase 7A-CJ.3 improves internal supplier catalogue discovery without changing
the ordering boundary. The CJ admin page now supports backend-mediated
autocomplete from real CJ ListV2 results, CJ category browsing from
`/product/getCategory`, local recent searches, local recently viewed products
and recently imported products. Autocomplete suggestions are never fabricated
locally and selecting a suggestion does not import, map or verify anything.

Phase 7A-CJ.4 adds a TekCentral technology catalogue lens for CJ discovery.
CJ remains a broad general marketplace, so staff default to curated technology
groups backed by real CJ category IDs. An explicit `All CJ catalogue` scope can
be used for wider supplier inspection, but it remains read-only and visually
warns staff that results may sit outside TekCentral's current product range.

Phase 7A-CJ.5 refines staff product selection by moving CJ variant selection,
import status and mapping progress into the right-side current-selection
workflow panel. Imported CJ products now have a dedicated admin page at
`/admin/suppliers/cj/imported` with filters, sorting and pagination so the
discovery page does not grow with every imported catalogue record.

Admin supplier navigation is now standardized around a function-based global
nav plus a Supplier Hub. Supplier-specific routes live under
`/admin/suppliers/:supplierCode`, and future suppliers must be registered in
the central supplier registry rather than added as top-level admin navigation
items.

## CONFIRMED Phase 7B-CJ Staff-Approved Order Creation

Phase 7B-CJ adds TekCentral's first real supplier write boundary for CJ
Dropshipping.

Authorized staff can prepare a real CJ order from an approved internal CJ
SupplierOrder, review the normalized outbound payload, select CJ-returned
logistics, and explicitly create one unpaid CJ order when the server-only
`CJ_REAL_ORDER_CREATION_ENABLED` flag is enabled.

No CJ payment, balance deduction, automatic confirmation, cancellation,
dispatch or customer fulfilment transition is performed in this phase.

Phase 7B-CJ.1 hardens the operational UX around this flow. Admin order detail
now surfaces derived next-action guidance, makes unsaved supplier allocation
changes explicit before supplier-order generation, and gives direct links to
generated supplier orders. CJ supplier-order detail labels real CJ work as
`CJ API` rather than manual sourcing and shows sanitized logistics diagnostics
when freight preflight cannot find a route.

Customer Add to Cart actions now provide immediate accessible confirmation
feedback while keeping cart state local to the storefront.

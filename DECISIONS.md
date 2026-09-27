# Decisions

Use this file for meaningful durable architectural and product decisions. Do not use it as a daily development diary.

## 2026-08-17 - Preserve Zeus

Status: Accepted

Decision:
Zeus, the existing interactive 3D robot and future AI technology assistant, must be preserved unless explicit approval is given.

Reason:
Zeus is a working core visual identity element and is intended to evolve into TekCentral's AI technology assistant.

## 2026-08-17 - Supplier Abstraction

Status: Accepted

Decision:
External suppliers must integrate through an internal supplier abstraction rather than being accessed directly by UI code.

Reason:
The business is evaluating multiple suppliers and must remain supplier-independent.

## 2026-08-17 - Internal Product Catalogue

Status: Accepted

Decision:
The storefront should render internal product models rather than supplier-specific objects.

Reason:
The platform may need to combine offers from multiple suppliers for the same or equivalent products.

## 2026-08-17 - No Major Restructure During Phase 0

Status: Accepted

Decision:
Keep the current frontend structure during Phase 0 and recommend future architecture before restructuring.

Reason:
The current application is working, the immediate task is audit and documentation, and backend requirements remain undecided.

## 2026-08-17 - Lightweight Phase 1 Routing

Status: Accepted

Decision:
Use a lightweight internal History API router for Phase 1 route placeholders instead of adding React Router.

Reason:
The current app only needs simple page scaffolds. Avoiding a routing dependency keeps the storefront foundation lean while still allowing route URLs.

## 2026-08-17 - Demo Product Data Is Internal

Status: Accepted

Decision:
Phase 1 product cards use typed internal mock products with demo ZAR prices.

Reason:
The project must not render supplier-specific objects or imply live supplier pricing, inventory, or confirmed supplier availability.

## 2026-08-17 - ESLint Setup

Status: Accepted

Decision:
Add a minimal ESLint flat config for TypeScript React and install the packages required by the existing `npm run lint` script.

Reason:
The lint script existed but failed because ESLint was not installed. Phase 1 requires working validation without overconfiguring the toolchain.

## 2026-08-17 - React Router For Phase 2

Status: Accepted

Decision:
Replace the Phase 1 lightweight History API router with React Router.

Reason:
The application now needs category parameters, product detail URLs, URL search parameters, cart routes, comparison routes, 404 handling and future route growth.

## 2026-08-17 - Frontend-Only Demo Cart

Status: Accepted

Decision:
Implement Phase 2 cart behaviour as client-side state persisted to localStorage.

Reason:
The storefront needs shopping UX validation, but checkout, payment, backend sessions, stock reservation and order processing are explicitly out of scope.

## 2026-08-17 - Category Product Visual Placeholders

Status: Accepted

Decision:
Use category-specific local visual placeholders for product imagery during Phase 2.

Reason:
Approved supplier/manufacturer product images are not available yet, and unrelated stock photos must not represent exact products.

## 2026-08-17 - Public Brand and AI Assistant Identity

Status: Accepted

Decision:
The public-facing platform brand is TekCentral.

The primary public domain is `tekcentral.co.za`.

The existing interactive robot and future AI technology assistant is named Zeus.

The approved primary tagline is `Technology, made easier.`

Reason:
The branding supports both consumer technology retail and future B2B IT procurement without limiting the platform to a simple electronics store. Zeus provides a distinct identity for the AI-assisted shopping and technology recommendation experience.

## 2026-08-24 - Premium Ecommerce Visual Direction

Status: Accepted

Decision:
Reject the prior corporate SaaS-style homepage direction and use a premium ecommerce technology store direction instead.

The approved visual system is based on Primary Black `#0A0A0A`, Zeus Teal `#00E6C3`, Electric Blue `#2457FF`, Background `#F6F7F9`, White `#FFFFFF`, Dark Slate `#3F4652`, Muted Text `#727986`, Border `#E4E7EC`, Success `#17B26A` and Warning `#F79009`.

The homepage should lead with ecommerce navigation, prominent search, product merchandising, visual category cards, early featured products, business technology editorial content and a Zeus assistant experience. Zeus must remain the existing interactive Three.js robot and should be visually important in the dark hero.

Reason:
TekCentral must immediately feel like a real premium online technology store for home, work and business, not a generic SaaS landing page. The storefront needs stronger shopping affordances while preserving the existing architecture, routes, product model, commerce logic, ProductCard foundation and Zeus implementation.

## 2026-08-25 - Contained Molten Homepage Hero

Status: Accepted

Decision:
Replace the rejected full-width homepage hero and separate white homepage header with a contained rounded hero that owns its floating navigation.

The homepage hero uses dark base `#07090C`, a subtle OGL MoltenMetal atmospheric layer in `#003F46`, `#00E6C3` and `#FFFFFF`, centered ecommerce copy, clear Shop Technology and Ask Zeus actions, and Zeus positioned behind the copy.

Zeus remains the existing procedural Three.js robot with pointer tracking, blinking, head/body movement, heart-eye interaction and material behaviour. The implementation may expose a reusable Zeus scene wrapper for composition, but should not replace Zeus with an image or redesign its geometry.

Reason:
The homepage must feel like a polished technology storefront and AI-assisted shopping experience without public developer-status copy. Navigation should be available immediately inside the hero while preserving the existing route architecture and the downstream product-led homepage sections.

## 2026-09-04 - Phase 3 Storefront UI Completion

Status: Accepted

Decision:
Phase 3 completes the customer-facing storefront UI while keeping the app frontend-only. TekCentral is the accepted public brand, Zeus is the accepted AI assistant identity, and the homepage headline is `Everything tech. One smarter store.`

The homepage hero direction supersedes the earlier contained-hero details where they conflict: the current hero is full-width and edge-to-edge, with MoltenMetal filling the first viewport, Zeus positioned in the left visual field, and a compact floating glass store header. The homepage store header uses an explicit `900px` breakpoint so desktop navigation appears before Tailwind `lg`.

Backend-dependent surfaces such as checkout, account, contact submissions, business quotes and Zeus AI responses remain polished demo or placeholder UI until later platform phases.

Reason:
The storefront now needs to feel like a complete ecommerce experience across home, catalogue, product, cart, compare, business, Zeus, account, about and contact routes without pretending that supplier integration, authentication, payments, orders, quotes or AI orchestration are live.

## 2026-09-05 - TekCentral Accent Teal

Status: Accepted

Decision:
Use `#469D8B` as the canonical TekCentral brand accent token for customer-facing primary actions, wordmark `Central` accents, section markers, selected states and restrained non-home page atmosphere. Use `#3D8E7E` as the darker hover state and dark ink text for primary teal buttons to preserve contrast.

Keep `#00E6C3` as the brighter Zeus/homepage-hero/MoltenMetal-specific teal where that approved hero composition depends on it. Keep Electric Blue `#2457FF` as a restrained supporting accent rather than the default section or button color.

Reason:
The storefront needed a stronger TekCentral-owned identity beyond black, white and grey while preserving the already-approved homepage hero, Zeus implementation, layout structure and ecommerce hierarchy.

## 2026-09-05 - Frontend Demo Order Lifecycle

Status: Accepted

Decision:
Phase 4 implements checkout, order confirmation, order history, order detail,
cancellation requests, return requests and refund status as frontend-only demo
commerce using typed internal models and versioned localStorage persistence.

Payment providers, supplier APIs, backend order processing, authentication,
notifications, real refunds and supplier RMA flows remain out of scope.

Reason:
TekCentral needs to validate the complete customer order journey before final
payment, supplier, fulfilment, tax, account and operations policies are selected.

## 2026-09-05 - PayFast Sandbox Payment Boundary

Status: Accepted

Decision:
PayFast is introduced as TekCentral's first payment gateway path through a
sandbox-only hosted checkout integration. PayFast credentials, passphrase,
signature generation and ITN validation live in a minimal server-side backend.

The browser never receives merchant secrets and does not mark payments as paid
based on the return URL. PayFast ITN is the authoritative payment confirmation.

Reason:
Hosted PayFast checkout can validate the customer payment journey while keeping
live payments, real refunds, supplier ordering and production operations out of
scope until launch policies and credentials are ready.

## 2026-09-06 - Internal Admin Operations Workspace

Status: Accepted

Decision:
Phase 5 introduces a separated `/admin` operations workspace backed by the
current local backend order store. The backend is authoritative for staff order
transitions, internal notes, return/refund transitions, supplier allocation
preparation, shipment metadata and calculated refund amounts.

Supplier allocation prepares the model for split fulfilment across potential
suppliers, but no real supplier ordering, supplier API calls, courier API calls,
PayFast refund API calls or production staff authentication are implemented.

Reason:
TekCentral needs to validate internal order operations before supplier
integrations and production staff systems are selected. Keeping these workflows
server-authoritative avoids training the UI to mutate operational state directly.

## 2026-09-06 - Derived Admin Attention And Fulfilment Preparation

Status: Accepted

Decision:
Phase 5.1 refines TekCentral Ops with semantic internal status badges,
backend-derived attention reasons, operational holds separate from customer
order status, print-friendly packing slips, parcel records and shipment records.

Shipment state such as partially shipped vs shipped is derived from stored
shipment item quantities rather than manually toggled. Refund readiness remains
an internal/manual PayFast dashboard workflow and does not execute PayFast refund
APIs.

Reason:
Operations staff need a scannable workspace that surfaces exceptions without
inventing supplier, courier, fraud or refund-provider capabilities.

## 2026-09-06 - Mock Supplier Orchestration Boundary

Status: Accepted

Decision:
Phase 6 introduces internal supplier orders generated from backend supplier
allocations, plus mock supplier adapters for approval, submission, confirmation,
partial confirmation, backorder, rejection and dispatch testing.

All supplier adapters are mock-only in this phase. They may create payload
previews and local mock submission records, but they must not send supplier
emails, call supplier APIs, automate supplier portals, scrape external systems
or call courier services.

Supplier order data remains internal. Public customer order responses strip
supplier allocations, internal notes, operational holds, parcels and shipment
internals.

Reason:
TekCentral needs to validate order-to-supplier operational architecture before
real supplier credentials, ordering channels, fulfilment terms and staff
permissions are approved.

## 2026-09-06 - Supplier Workflow Hardening

Status: Accepted

Decision:
Phase 6.1 enforces one active supplier procurement path per customer order item
quantity and introduces explicit supplier order supersession for unapproved
draft/ready supplier orders that are replaced.

Supplier SKU mappings are internal records keyed by `productId + supplierCode`.
Non-manual supplier orders cannot be approved or mock submitted until every
line has a supplier SKU mapping.

Operational holds block supplier procurement and fulfilment progression.
Supplier dispatch requires courier, tracking number and dispatch date.

Reason:
Mock orchestration must validate operational safety before TekCentral connects
any real supplier ordering channel. Preventing duplicate procurement and
incomplete supplier payloads is more important than making the mock workflow
permissive.

## 2026-09-08 - CJ Read-Only API Foundation

Status: Accepted

Decision:
Phase 7A-CJ introduces a backend-only CJ Dropshipping API V2 foundation for
authentication, connection status, read-only catalogue search, product detail,
variant lookup, stock lookup, selected supplier catalogue imports and staff
verified mapping records.

`CJ_API_KEY`, CJ access tokens and CJ refresh tokens remain backend-only. The
admin UI may show safe connection metadata, imported product counts and mapping
counts, but never credentials or token values.

CJ mappings preserve product and variant identity separately and remain
`SUGGESTED` until explicitly verified by staff. Phase 7A does not create,
submit, pay or cancel CJ orders.

Reason:
TekCentral needs a real supplier catalogue and mapping foundation before order
submission can be safely added behind the existing staff approval boundary.

## 2026-09-09 - CJ Catalogue Discovery UX

Status: Accepted

Decision:
Phase 7A-CJ.3 upgrades the CJ admin page with real CJ autocomplete,
category browsing, recent searches, recently viewed products and recently
imported products while preserving the read-only supplier boundary.

Autocomplete suggestions are retrieved through TekCentral's backend from CJ
ListV2 search results and must contain authoritative CJ product identity before
they can be selected. CJ categories are loaded from the real CJ category
endpoint and category browsing passes supported `categoryId` filters to CJ.

Discovery, selection, detail review, import, mapping and verification remain
separate staff actions. Selecting an autocomplete suggestion never creates a
mapping, imports a product or verifies supplier identity.

Reason:
Staff need to discover what CJ sells without knowing exact supplier wording in
advance, but supplier catalogue trust depends on keeping every downstream
action explicit and backend-mediated.

## 2026-09-10 - CJ Technology Catalogue Lens

Status: Accepted

Decision:
Phase 7A-CJ.4 makes TekCentral technology discovery the default CJ admin
experience. The backend owns a maintainable category policy in
`backend/suppliers/cj/cjCataloguePolicy.ts` using real CJ category IDs grouped
as Computers & Accessories, Networking, Cables & Connectivity, Power &
Charging, Storage, Mobile Technology, Security & Cameras, Smart Technology and
Office Technology.

Search, autocomplete and category browsing default to that technology lens.
Operators may explicitly switch to `All CJ catalogue` for read-only broad
catalogue inspection, with a warning that results may sit outside TekCentral's
current range.

Reason:
CJ is a broad marketplace, while TekCentral is a technology store. Defaulting
to a backend-owned technology lens keeps staff workflows focused without
modifying CJ's real category taxonomy or weakening the read-only supplier
boundary.

## 2026-09-10 - CJ Selection Workflow And Imported Catalogue

Status: Accepted

Decision:
Phase 7A-CJ.5 keeps the approved CJ discovery workspace but moves exact variant
selection, import status and mapping progress into the right-side current
selection panel. Variants shown there must come from the loaded CJ product
variant data only; filtering is local over those loaded variants and never a
free-text supplier SKU or VID entry.

Imported CJ catalogue records are managed on `/admin/suppliers/cj/imported`
with search, filters, sorting and pagination. The discovery page shows only a
compact imported summary and a link to the dedicated page.

Reason:
Staff need the selected product workflow visible while searching and browsing,
and the imported catalogue needs to scale independently from discovery without
introducing CJ order placement before Phase 7B.

## 2026-09-10 - Function-Based Admin Supplier Navigation

Status: Accepted

Decision:
Admin navigation is function-based, not supplier-based.

The approved global admin structure is Dashboard, Orders, Returns, Refunds,
Supplier Orders, Supplier Mappings and Suppliers. Supplier names and
supplier-local subpages must not become top-level global admin navigation
items.

Supplier-specific navigation starts at the Supplier Hub
`/admin/suppliers`, then enters supplier workspaces under
`/admin/suppliers/:supplierCode`. Supplier-local pages such as catalogue,
imported catalogue and settings live inside that workspace. Supplier Orders and
Supplier Mappings may remain global operational functions where appropriate.

Reason:
TekCentral will support multiple suppliers. A supplier-per-menu design does not
scale, creates header overflow and makes every new supplier integration edit
global navigation manually.

## 2026-09-10 - Staff-Approved CJ Order Creation

Status: Accepted

Decision:
Phase 7B-CJ introduces the first real supplier write integration through a
backend-only CJ order creation boundary.

TekCentral uses CJ Create Order V2 with `payType=3` for create-only unpaid
orders. Staff must approve the internal SupplierOrder, run preflight, select a
CJ-returned logistics option, review the payload and explicitly confirm Create
CJ Order. The server feature flag `CJ_REAL_ORDER_CREATION_ENABLED` controls
whether the external write is allowed.

Local idempotency, deterministic external references and `UNKNOWN_RESULT`
reconciliation are required before any retry can create another external
supplier order.

Reason:
Real supplier writes can create financial and operational obligations even
without payment. TekCentral needs a conservative supplier submission boundary
that preserves verified mapping, operational hold gating and separation between
supplier and customer order lifecycles.

## 2026-09-11 - Supplier Operations UX Hardening

Status: Accepted

Decision:
Admin order detail must make supplier allocation save state explicit before
supplier-order generation. Unsaved allocation changes disable generation with
clear guidance, successful generation provides direct supplier-order links, and
the order page shows a derived next-action summary.

Real CJ supplier orders are displayed as CJ API workflow, with fulfilment
pending logistics selection until a CJ order is created for direct customer
shipping. CJ logistics failures surface sanitized diagnostics without exposing
credentials or unnecessary customer address data.

Customer Add to Cart interactions must show immediate accessible confirmation
feedback and prevent accidental rapid duplicate additions.

Reason:
The backend rules were safe, but staff workflows were too easy to misread.
Operational UX should make backend dependencies visible instead of allowing
silent no-op attempts or misleading supplier metadata.

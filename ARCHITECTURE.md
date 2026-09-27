# Architecture

## CONFIRMED Current Frontend

Current stack:

- Vite
- React 18
- TypeScript
- Tailwind CSS
- Three.js
- `@react-three/fiber`
- `@react-three/drei`
- Framer Motion
- React Icons
- Node HTTP backend for the narrow Phase 4.5 PayFast sandbox boundary

Current entry points:

- `index.html`
- `src/main.tsx`
- `src/App.tsx`
- `backend/server.ts`

Current render chain:

```text
src/main.tsx
  -> src/App.tsx
  -> src/components/layout/AppShell.tsx
  -> route-level pages under src/pages/
  -> homepage lazy loads src/components/ui/robot-hero.tsx
  -> src/components/ui/robot-hero.tsx
```

Vite config:

- React plugin enabled.
- `@` alias points to `./src`.

TypeScript config:

- `strict` enabled.
- `jsx` uses `react-jsx`.
- `baseUrl` is `.`.
- `@/*` maps to `./src/*`.
- App config includes `src`.

Tailwind config:

- Scans `index.html` and `src/**/*.{js,ts,jsx,tsx}`.
- Uses CSS variables for semantic colors.
- Extends radius values and a `glow` box shadow.
- No Tailwind plugins configured.

## CONFIRMED Current Structure

- `src/` contains runtime application source.
- `src/components/layout/` contains storefront layout components.
- `src/components/navigation/` contains navigation components.
- `src/components/sections/` contains homepage sections.
- `src/components/commerce/` contains storefront commerce UI components.
- `src/components/ui/robot-hero.tsx` contains the main Zeus hero implementation through the existing technical `RobotHero` component.
- `src/components/ui/demo.tsx` wraps `RobotHero`.
- `src/data/` contains isolated mock storefront data.
- `src/pages/` contains route-level page components.
- `src/types/` contains shared frontend types.
- `backend/` contains the server-side commerce and integration boundaries.
- `backend/localShippingEstimator.ts` contains supplier-neutral local zone-estimation and freight-variance calculations. Supplier adapters provide authoritative logistics inputs; checkout does not contain supplier rate logic.
- Scoop physical-spec enrichment uses a manufacturer-provider registry. Providers resolve exact manufacturer/SKU/model identity, normalize official measurements, and retain provenance as separate observations before the lower-authority Scoop product-page fallback is considered.
- `src/lib/utils.ts` exists as a utility entry point.
- Root `components/ui/robot-hero.tsx` re-exports from `src/components/ui/robot-hero.tsx`.
- `dist/` contains generated build output.
- `node_modules/` contains installed dependencies.

## CONFIRMED Phase 3 Frontend Routing

Phase 3 uses React Router via `react-router-dom`.

The Phase 1 lightweight History API router was removed because the application now has product routes, category parameters, search parameters, a cart route, comparison route and 404 handling.

Primary public domain:

- `https://tekcentral.co.za`

V1 should assume normal routes under the main domain, such as:

- `https://tekcentral.co.za/`
- `https://tekcentral.co.za/shop`
- `https://tekcentral.co.za/business`
- `https://tekcentral.co.za/zeus`
- `https://tekcentral.co.za/contact`

Scaffolded routes:

- `/`
- `/shop`
- `/category/:slug`
- `/product/:slug`
- `/business`
- `/zeus`
- `/robo` compatibility redirect
- `/about`
- `/contact`
- `/cart`
- `/checkout`
- `/orders`
- `/order/:orderNumber`
- `/order/:orderNumber/confirmation`
- `/order/:orderNumber/return`
- `/payment/payfast/return`
- `/payment/payfast/cancel`
- `/compare`
- `/account`
- `/privacy`
- `/terms`
- `/returns`
- `*` 404 route

## CONFIRMED Phase 3 Mock Data

Phase 3 demo products use internal product objects in `src/types/product.ts` and `src/data/catalogue.ts`.

Mock prices are demo-only ZAR values and are not live supplier pricing or confirmed inventory.

The product model now supports:

- `slug`
- optional `sku`
- optional `model`
- `categorySlug`
- optional `subcategory`
- optional `description`
- optional `images`
- `unknown` stock status
- specifications
- featured/new-arrival flags
- tags

## CONFIRMED Phase 3 Frontend State

Cart state is client-side only and stored in localStorage through `src/state/cart.tsx`.

Comparison state is client-side only through `src/state/comparison.tsx` and supports up to three products.

Order state is client-side only through `src/state/orders.tsx`.

Phase 4 orders use a typed internal order model, versioned localStorage
persistence and customer-safe lifecycle operations for checkout, order status,
cancellation requests, return requests and refund status testing. This state is
isolated from the cart and supplier concepts so it can later be replaced by
backend APIs.

Checkout configuration lives in `src/lib/checkout-config.ts`, including demo
delivery methods, payment method selections and demo VAT-inclusive calculation
presentation.

## CONFIRMED Phase 4.5 Payment Backend

The PayFast sandbox integration uses a narrow Node HTTP backend rather than
placing payment credentials or signatures in the Vite frontend.

Backend endpoints:

- `POST /api/orders`
- `POST /api/payments/payfast/create`
- `POST /api/payments/payfast/itn`
- `POST /api/payments/payfast/cancel`
- `GET /api/payments/:orderNumber/status`
- `GET /api/admin/orders`
- `GET /api/admin/orders/:orderNumber`
- `POST /api/admin/orders/:orderNumber/paid-acknowledgement`
- `PATCH /api/admin/orders/:orderNumber/status`
- `POST /api/admin/orders/:orderNumber/notes`
- `POST /api/admin/orders/:orderNumber/supplier-allocations`
- `PATCH /api/admin/orders/:orderNumber/supplier-allocations/:id`
- `PATCH /api/admin/orders/:orderNumber/shipment`
- `POST /api/admin/orders/:orderNumber/hold`
- `POST /api/admin/orders/:orderNumber/hold/release`
- `POST /api/admin/orders/:orderNumber/parcels`
- `POST /api/admin/orders/:orderNumber/shipments`
- `GET /api/admin/returns`
- `PATCH /api/admin/returns/:id/status`
- `GET /api/admin/refunds`
- `POST /api/admin/orders/:orderNumber/refunds`
- `PATCH /api/admin/refunds/:id/status`
- `GET /api/admin/supplier-orders`
- `GET /api/admin/supplier-orders/:id`
- `POST /api/admin/orders/:orderNumber/supplier-orders`
- `PATCH /api/admin/supplier-orders/:id/approve`
- `POST /api/admin/supplier-orders/:id/cj/preflight`
- `POST /api/admin/supplier-orders/:id/cj/create`
- `POST /api/admin/supplier-orders/:id/cj/reconcile`
- `POST /api/admin/supplier-orders/:id/cj/refresh-status`
- `POST /api/admin/supplier-orders/:id/mock-submit`
- `PATCH /api/admin/supplier-orders/:id/mock-confirm`
- `PATCH /api/admin/supplier-orders/:id/mock-reject`
- `PATCH /api/admin/supplier-orders/:id/dispatch`
- `PATCH /api/admin/supplier-orders/:id/lines/:productId/supplier-sku`
- `GET /api/admin/suppliers/cj/status`
- `POST /api/admin/suppliers/cj/test`
- `GET /api/admin/suppliers/cj/search`
- `GET /api/admin/suppliers/cj/autocomplete`
- `GET /api/admin/suppliers/cj/categories`
- `GET /api/admin/suppliers/cj/detail`
- `GET /api/admin/suppliers/cj/stock/:vid`
- `GET /api/admin/suppliers/cj/products`
- `GET /api/admin/suppliers/cj/products/:supplierProductId`
- `POST /api/admin/suppliers/cj/products/import`
- `PATCH /api/admin/suppliers/cj/products/:supplierProductId/refresh`
- `GET /api/admin/supplier-mappings`
- `POST /api/admin/supplier-mappings/cj/suggest`
- `PATCH /api/admin/supplier-mappings/:id/verify`
- `PATCH /api/admin/supplier-mappings/:id/reject`
- `PATCH /api/admin/supplier-mappings/:id/check-stale`

Frontend admin supplier routes:

- `/admin/suppliers`
- `/admin/suppliers/cj`
- `/admin/suppliers/cj/imported`
- `/admin/cj` redirects to `/admin/suppliers/cj`
- `/admin/cj/imported` redirects to `/admin/suppliers/cj/imported`

The backend stores demo orders in `.data/orders.json`, which is ignored by git.
This is a temporary local/staging persistence mechanism until a real database is
approved.

Mock supplier orders are stored separately in `.data/supplier-orders.json`,
which is also local ignored persistence. Supplier orders are generated from
backend order item snapshots and supplier allocation records, not from frontend
submitted price or supplier data.

Supplier product SKU mappings are stored in
`.data/supplier-product-mappings.json` and keyed by `productId + supplierCode`.
Supplier SKUs are not stored globally on products because different suppliers
may use different identifiers.

CJ authentication tokens are stored backend-only in `.data/cj-auth.json`.
`CJ_API_KEY` is read from backend environment variables and is not persisted in
that token cache.

Selected imported CJ catalogue products are stored in
`.data/supplier-catalogue-cj.json`.

Scoop catalogue products are stored in `.data/supplier-catalogue-scoop.json`
and reconciled by canonical Scoop SKU. XML feed, website discovery and admin
import provenance are observations on one `SCOOP:<sku>` identity. Approved
website captures use backend preview/apply endpoints; no raw supplier catalogue
or private supplier access is exposed to the storefront.

PayFast signatures are generated server-side. ITN processing verifies signature,
merchant identity, payment reference, gross amount, completion status and origin
according to the current sandbox/live constraints. ITN is idempotent through
stored processed notification identifiers.

## CONFIRMED Phase 5 Admin Operations

The `/admin` route family is a separated development/internal operations
workspace. It uses its own compact admin shell rather than the customer
storefront header and footer.

Admin operations call backend endpoints. The backend remains authoritative for
order status transitions, internal notes, supplier allocation records, shipment
metadata, return status transitions, refund status transitions and calculated
refund amounts.

Admin attention queues are derived by the backend from stored order data. The
demo payment-pending attention threshold is configurable in backend operations
code and is not permanent business policy. No fraud score or provider risk
signal is assumed.

Operational holds are separate from customer `OrderStatus`. Active holds block
fulfilment transitions and shipment creation until released.

Parcels and shipments prepare for future courier integration. Shipment item
quantities are validated against stored order item snapshots, and partial vs
full shipment state is derived from shipped quantities.

Supplier allocation records are internal planning data only. They can split one
customer order across multiple supplier allocation records, but no supplier API
or external order placement is executed in Phase 5.

Production staff authentication is pending and is not simulated with hard-coded
passwords.

## CONFIRMED Phase 6 Mock Supplier Orchestration

Phase 6 introduces a backend supplier adapter boundary in
`backend/mockSupplierAdapters.ts` and supplier order orchestration in
`backend/supplierOrchestration.ts`.

Adapters expose supplier identity, documented capability flags, payload preview
creation, mock submission and mock status lookup. All Phase 6 adapters are
mock-only and must not perform network, email, portal, scraping or courier side
effects.

Supplier orders are internal records with a lifecycle separate from customer
`OrderStatus`. They support:

- `READY_FOR_APPROVAL`
- `APPROVED`
- `SUBMITTED`
- `ACKNOWLEDGED`
- `CONFIRMED`
- `PARTIALLY_CONFIRMED`
- `BACKORDERED`
- `REJECTED`
- `DISPATCHED`
- `COMPLETED`
- `CANCELLED`
- `SUPERSEDED`

The admin supplier-order workspace lives at `/admin/supplier-orders` and
`/admin/supplier-orders/:supplierOrderId`. It uses the existing admin shell and
calls backend endpoints only.

Backend-derived attention now combines order-level operational attention with
supplier-order attention, including supplier approval, rejection, backorder,
delayed confirmation and overdue dispatch reasons.

Public order APIs return customer-safe order objects and do not include
supplier orders, supplier allocations, internal notes, operational holds,
parcels or shipment internals.

## CONFIRMED Phase 6.1 Supplier Workflow Hardening

Supplier order generation now validates active procurement coverage by customer
order item quantity. Approved, submitted, confirmed, dispatched and completed
supplier orders reserve their covered quantities. Partially confirmed supplier
orders reserve only confirmed quantities, allowing unconfirmed remainder to be
reallocated. Rejected, cancelled, backordered and superseded supplier orders do
not reserve active procurement quantity.

If a new supplier order replaces an existing `DRAFT` or `READY_FOR_APPROVAL`
supplier order for the same item quantity, the older supplier order is marked
`SUPERSEDED`, linked to the replacement and kept in history. Approved or later
supplier orders cannot be silently superseded.

Operational holds block supplier order generation, approval, mock submission,
mock outcome application and supplier dispatch. Holds also continue to block
fulfilment transitions and shipment creation.

Supplier orders for non-manual suppliers require every line to have a mapped
supplier SKU before approval or mock submission. Mapping is a local internal
Phase 6.1 action and does not perform supplier lookup.

Supplier dispatch requires courier, tracking number and dispatch date before a
shipment record is created.

## CONFIRMED Phase 8 Multi-Supplier Operations Foundation

The supplier operations foundation is supplier-agnostic. The central backend
registry in `backend/supplierRegistry.ts` is built from supplier adapters and
exposes supplier display names, enabled state, supported order modes,
capability declarations and adapter availability.

`backend/supplierDomain.ts` defines the shared supplier contract:

- supplier capabilities use `SUPPORTED`, `MANUAL`, `UNSUPPORTED` or `UNKNOWN`
  so unverified integrations do not appear more automated than they are.
- supplier order modes are normalized as `API`, `EMAIL`,
  `PORTAL_AUTOMATION` and `MANUAL`.
- `SupplierOffer` represents an internal supplier-specific source for one
  TekCentral product or variant. It carries supplier identity, product/variant
  IDs, SKU data, cost/availability snapshots, fulfilment capability, mapping
  status and verification metadata. It remains internal and separate from the
  customer-facing product model.
- `SupplierAdapterContract` defines optional operations such as preflight,
  submit, refresh, reconcile and tracking. Orchestration gates actions by
  declared capabilities instead of assuming every supplier has API support.

Supplier orders remain the cross-supplier operational record. Core fields cover
customer order, allocated item lines, supplier, selected offer or mapping,
approval state, submission mode, external submission status, supplier
confirmation, tracking and operational attention. Supplier-specific operational
data stays namespaced, such as `cjOperations`.

CJ is registered as an API supplier through this model using only already
implemented capabilities. Future suppliers such as Scoop can use `EMAIL` or
`MANUAL` modes without cloning the CJ API workflow or pretending API order
creation exists.

## CONFIRMED Phase 7A-CJ Read-Only API Foundation

The CJ integration uses official CJ Dropshipping API V2 under:

- `https://developers.cjdropshipping.com/api2.0/v1`

Backend modules live under `backend/suppliers/cj/`:

- `cjAuthService.ts`
- `cjClient.ts`
- `cjCatalogueAdapter.ts`
- `cjCataloguePolicy.ts`
- `cjCatalogueRepository.ts`
- `cjProductMapper.ts`
- `cjTypes.ts`
- `cjErrors.ts`

The CJ auth service reads `CJ_API_KEY`, obtains and caches access/refresh token
metadata, refreshes tokens when needed and reauthenticates with the API key when
refresh is unavailable. Token values are never returned by admin APIs.

The CJ client adds `CJ-Access-Token`, applies a request timeout, throttles calls
to avoid uncontrolled request bursts and normalizes API errors.

Phase 7A supports read-only CJ settings, product search, product detail,
variant and stock calls. It does not implement or call CJ order creation,
submission, payment or cancellation endpoints.

CJ product normalization preserves product ID, product SKU, variant ID, variant
SKU, category, price/currency snapshots, stock snapshots and source
fingerprints. Imported supplier catalogue records remain separate from public
TekCentral products.

`cjCataloguePolicy.ts` defines TekCentral's internal technology category lens
over real CJ category IDs. The default CJ search, autocomplete and category
browse endpoints apply that policy and annotate results with TekCentral
technology group metadata. The same endpoints accept an explicit
`scope=all` query parameter for read-only full-catalogue inspection without
changing supplier ordering, mapping verification or storefront product models.

The CJ discovery route `/admin/suppliers/cj` keeps catalogue discovery on the
left and a sticky current-selection workflow on the right. That panel owns
product review, exact CJ-returned variant selection, import status and mapping
progress. The imported supplier catalogue is managed separately at
`/admin/suppliers/cj/imported`, which reads existing imported CJ records and
supplier mappings and provides client-side filtering, sorting and pagination.

Admin supplier navigation is controlled by a central frontend supplier registry
in `src/lib/supplier-registry.ts`. The global admin header remains
function-based and exposes `Suppliers` as the single supplier entry point.
Supplier-local pages expose capability-driven workspace tabs through the shared
supplier workspace navigation component.

## CONFIRMED Phase 9A Scoop Catalogue Feed

Scoop catalogue ingestion is backend-only and uses the published XML dealer
price-list feed. `backend/suppliers/scoop/scoopCatalogueAdapter.ts` owns feed
download, XML normalization, VAT semantics and conversion to the shared
`SupplierOffer` model. `scoopCatalogueRepository.ts` persists normalized offers
in `.data/supplier-catalogue-scoop.json` using Scoop SKU as identity and marks
offers stale when they disappear from a later successful sync.

The Scoop supplier workspace is `/admin/suppliers/scoop`. Its admin API surface
is:

- `GET /api/admin/suppliers/scoop/status`
- `GET /api/admin/suppliers/scoop/products`
- `GET /api/admin/suppliers/scoop/products/:supplierSku`
- `POST /api/admin/suppliers/scoop/sync`
- `POST /api/admin/supplier-mappings/scoop/suggest`

These routes support manual catalogue sync, offer inspection and mapping
readiness only. Phase 9A adds no Scoop order, email or portal write path.

Phase 9B keeps mapping records in the shared supplier mapping repository and
uses Scoop SKU plus `SCOOP:<sku>` as stable supplier identity. The Scoop
workspace joins catalogue offers to those mappings for coverage metrics and
staff verification. Stale state is derived from the offer feed and does not
erase a verified mapping.

`backend/supplierPricing.ts` defines supplier-neutral pricing preparation for
cost excluding VAT, VAT amount, cost including VAT, reference retail,
informational spread and future proposed-price profit metrics. It performs pure
calculations only and does not write public product prices.

Phase 9C persists configurable pricing settings and audit history in
`.data/business-settings.json` and internal proposals in
`.data/pricing-proposals.json`. `supplierPricing.ts` owns supplier-neutral band,
VAT, profit, margin, markup, rounding and warning calculations. Supplier input
adapters normalize Scoop ex-VAT feed cost and CJ product-plus-logistics landed
cost before invoking the engine.

The admin settings route is `/admin/settings/pricing`. Proposal approval is an
internal state transition only; no route writes approved proposals into the
public product catalogue.

## CONFIRMED Phase 7B-CJ Real Order Creation Boundary

Real CJ order creation lives in `backend/suppliers/cj/cjOrderAdapter.ts`.

The module owns:

- server-only `CJ_REAL_ORDER_CREATION_ENABLED` feature flag checks
- customer order and operational hold preconditions
- exact `VERIFIED` CJ product/variant mapping validation
- shipping normalization from the immutable order delivery snapshot
- fresh CJ variant and stock checks
- CJ freight/logistics retrieval
- human-reviewable Create Order V2 payload construction
- deterministic request fingerprint/idempotency key
- local submit locking before the external write
- `UNKNOWN_RESULT` classification for uncertain network failures
- read-only reconciliation and status refresh

The chosen CJ write endpoint is
`POST /shopping/order/createOrderV2` with `payType=3`, because current CJ API V2
documentation describes that mode as creating the order only without initiating
payment, add-to-cart or order confirmation.

SupplierOrder `externalSubmission` stores real CJ submission metadata separately
from mock submissions. CJ order creation does not mutate customer payment,
shipping, return, refund or fulfilment state.

Phase 7B-CJ.1 adds a strict `buildCjFreightRequest` helper for the documented
CJ freight shape:

- `startCountryCode`
- `endCountryCode`
- `products[]` with `vid` and `quantity`

When CJ returns no logistics methods, preflight remains blocked and records a
sanitized diagnostic summary on `externalSubmission.diagnostics`. The diagnostic
includes destination country code, postal-code presence, item count, safe
variant IDs, source countries, request body shape and response summary. It does
not include credentials or full customer address.

Admin order detail derives workflow guidance from backend order state,
allocation state, supplier order state, external submission state, operational
holds and shipment state. The allocation form remains explicit-save: unsaved
changes disable supplier-order generation until saved.

## CONFIRMED Phase 1 Performance Boundary

The Zeus hero is lazy-loaded from the homepage with React `lazy` and `Suspense`. This keeps the Three.js-heavy implementation isolated from non-home placeholder routes while preserving the existing `RobotHero` component.

## PLANNED Future Backend

A backend will likely be required before real commerce, supplier integration, quotations, authentication, payments, or Zeus AI orchestration.

Backend responsibilities should include:

- Supplier adapters
- Product imports and normalization
- Stock and cost retrieval
- Supplier selection logic
- Retail pricing and margin logic
- Quotation persistence
- Checkout/order orchestration
- Secrets and API keys
- Server-side AI calls for Zeus

## PLANNED Supplier Abstraction

Future suppliers should integrate through an adapter layer, not through UI code.

Conceptual shape:

```typescript
interface SupplierAdapter {
  getProducts(): Promise<Product[]>;
  getProduct(sku: string): Promise<Product | null>;
  getStock(sku: string): Promise<number | null>;
  getCost(sku: string): Promise<number | null>;
  createOrder?(order: SupplierOrder): Promise<OrderResult>;
  getOrderStatus?(orderId: string): Promise<OrderStatus>;
}
```

This interface is guidance only. Do not implement supplier integrations until supplier capabilities are confirmed.

## PLANNED Product Catalogue Boundary

The platform should own an internal product catalogue. Frontend components should render internal product models, not supplier-specific objects.

Conceptual model:

```text
Internal Product
  Supplier Offer A
  Supplier Offer B
  Supplier Offer C
```

## PLANNED Integration Boundaries

- Zeus AI should communicate through a backend/API boundary, not directly expose AI secrets in frontend code.
- Authentication should be separated from UI components and selected only after requirements are documented.
- Payments should be integrated server-side where required by provider rules.
- Quotations should be designed as a first-class B2B workflow, not as a checkout afterthought.
- Product and marketing assets should be managed in a clear project asset structure.

## PENDING CONFIRMATION

- Backend framework
- Database
- Authentication provider
- Payment provider
- AI provider
- Supplier capabilities
- Product import strategy
- Deployment platform

## Recommendation

Keep the current project as a single frontend during Phase 3. When backend or integration work is approved, evolve toward:

```text
frontend/
backend/
shared/
```

Do not perform a large restructure yet. There is no immediate technical reason during the storefront foundation phase.

## Phase 4.5 Environment Boundary

Server-only environment variables:

- `PAYFAST_MERCHANT_ID`
- `PAYFAST_MERCHANT_KEY`
- `PAYFAST_PASSPHRASE`
- `PAYFAST_MODE`
- `PUBLIC_APP_URL`
- `PUBLIC_API_URL`

`VITE_API_BASE_URL` is allowed in the frontend because it is a public API
location, not a secret.

PayFast ITN requires a publicly reachable HTTPS backend endpoint. Localhost can
serve frontend testing, but PayFast server-to-server notifications require a
public tunnel or staging backend URL.
## Storefront publication boundary

Supplier-backed products reach the storefront only through the backend publication service. Launch readiness is eligibility, not publication. Explicit staff publication writes an immutable version to `.data/product-publications.json`; the active version is exposed through `/api/public/catalogue` and slug lookup while supplier, mapping, pricing, cost, margin, logistics-source, and audit fields remain behind admin endpoints.

The frontend catalogue provider combines public published DTOs with clearly tagged demo seed fixtures during the Phase 10 migration. Cart, shipping quote, and order creation resolve published product identity and price again on the backend. Public price is the immutable version price; current supplier stock is overlaid as a safe availability state.

Checkout address assistance uses a browser-restricted Google Maps key for Places Autocomplete (New). Address Validation is a separate backend-only integration and its key is never included in frontend code or public responses. Publication image ingestion likewise runs on the backend and serves validated, content-addressed public assets through TekCentral's API boundary.

## Scoop paid-order orchestration

After an authoritative PayFast `PAID` transition, backend supplier
orchestration may resolve exactly one current verified Scoop mapping per line,
persist deterministic automatic allocations, and generate one Scoop
SupplierOrder per fulfilment group. SupplierOrder generation remains
idempotent through allocation IDs and active quantity checks. Scoop procurement
is manual: the supplier registry supplies the external reseller URL, while
acknowledgement, approval and reference-backed `ORDERED` transitions remain in
TekCentral. No portal credentials or automation are stored.

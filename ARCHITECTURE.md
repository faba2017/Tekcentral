# Architecture

## Untrusted remote media and document retrieval

Product image ingestion, Product PDF import and TVR public-catalogue image ingestion use the shared `safeRemoteFetch` boundary. Retrieval is HTTPS-only, rejects credentials and custom ports, resolves every hostname before every request, rejects the entire DNS answer when any address is non-public, and manually validates at most four redirects. Production HTTPS connections are pinned to an address from the validated DNS answer while retaining hostname TLS verification, preventing a second unvalidated DNS lookup at connection time. Supplier-specific hostname/path allowlists remain additional controls.

Responses are timeout- and stream-size-bounded. Product images require an approved declared MIME type and matching JPEG, PNG, WebP or GIF signature before public object storage or gallery association. Product PDFs require `application/pdf`, `%PDF-`, and reject bounded obvious active-content markers (`/JavaScript`, `/JS`, `/Launch`, `/EmbeddedFile`); this is defensive static validation, not malware scanning. Public Product media uses `X-Content-Type-Options: nosniff`, and public supplier-origin PDFs download as attachments. Fixed, backend-owned provider APIs remain outside this untrusted-media boundary.

## Prospective commerce document reconciliation

Phase J.6B runs a bounded PostgreSQL reconciliation pipeline only for Orders explicitly marked by migration 0016. `order_confirmation_required_at` gates missing order-confirmation delivery recovery and `invoice_required_at` gates paid-invoice, invoice-document and invoice-delivery recovery. A null marker is an absolute historical exclusion; payment state or a missing artifact alone never creates eligibility.

The opt-in `COMMERCE_RECONCILIATION_WORKER_ENABLED` worker coordinates existing canonical ensure services under a non-blocking PostgreSQL advisory lock. Each stage is capped at 20 records and uses a three-minute grace period so normal checkout/payment processing can finish first. Development polling defaults to 60 seconds and production polling to five minutes. Resource uniqueness remains the final concurrency guard if two processes race.

Reconciliation creates logical pending deliveries only and never sends SMTP. Retryable failures and expired `SENDING` leases remain owned by the customer-delivery worker; permanent recipient failures are not requeued. Existing invoice-document associations are integrity-checked before a missing delivery is created. Missing/corrupt objects fail closed through the J.4 H.1 path and immutable associations are not replaced. Canonical SYSTEM audit events remain attached to actual invoice/document creation; no extra no-op reconciliation event is written.

## H.6.10 Admin AI operations boundary

Admin AI operations is a read-only projection over the existing `admin_ai_messages`, `admin_ai_actions`, `admin_ai_automations`, `admin_ai_automation_runs`, policy and H.1 records. It excludes message content, safe action payloads, raw provider responses and credentials. The endpoint requires `settings.zeus`; inference access alone is insufficient.

Provider configuration remains environment-owned. The operations API exposes only configured provider/model identifiers and deterministic health classifications. Reliable provider cost metadata is unavailable, so monetary cost is reported as unavailable rather than estimated. Worker liveness is process-local runtime state, while leases, retries and run outcomes remain durable PostgreSQL evidence. No H.6.10 migration or new mutation capability exists.

## Supplier Source Registry

`supplierSourceRegistry.ts` owns persisted supplier-neutral source configuration; purpose, transport and format are separate. PostgreSQL migration `0010_supplier_source_registry.sql` is authoritative for persisted sources, immutable versions, sync runs and normalized evidence. `supplierSourcePlatform.ts` is the shared source-definition and capability layer for Scoop, Syntech, CJ, TekCentral Manual, Mustek and TVR. It delegates acquisition and parsing to each existing supplier adapter and emits redacted Admin DTOs; it is not a second persistence registry. Retrieval is private, allowlisted and SSRF-protected; source bytes use private object storage. Source evidence cannot publish a Product or become customer-visible without canonical onboarding and publication.

## Canonical Product onboarding

All supplier and manual Product sources converge on the supplier-neutral onboarding model in `backend/productOnboarding.ts`. Supplier adapters normalize partial evidence; `backend/productOnboardingService.ts` combines that evidence with canonical Product, mapping, pricing and publication state and derives the ordered readiness result. Readiness is not separately persisted. The admin-only `GET /api/admin/products/:productId/onboarding-readiness` endpoint is protected by `products.read`; public catalogue APIs never receive supplier evidence. See `docs/features/product-onboarding.md`.

## Durable persistence and stateless deployment

Production is designed around DigitalOcean Managed PostgreSQL for authoritative structured state and S3-compatible DigitalOcean Spaces for public/private object bytes. `backend/persistence` owns configuration, pooling, transactions, migrations, shared rate-limit primitives and readiness; `backend/storage` owns the object interface. Containers are disposable and production/staging fail configuration validation when local providers are selected. Domain services retain business rules.

PostgreSQL uses separate migration and runtime identities. Only the controlled migration/bootstrap job receives `DATABASE_MIGRATION_URL`; web and worker components receive the restricted `DATABASE_URL`. The runtime role cannot own the database/schema, run DDL, manage roles, or read migration bookkeeping. It receives explicit schema usage, application DML, sequence use and approved function execution, with additional update/delete revocation on immutable audit/invoice/delivery records. Public and private Spaces buckets likewise use distinct bucket-scoped credentials and clients; private reads require application authorization plus an exact-key, short-lived signed URL. See `docs/security/k-sec-r3.md`.

The schema and migration path are expand/contract. Migrations run once through a controlled job, not on each web startup. Current JSON repositories remain local-development adapters until each domain completes import, count/invariant verification and provider cutover; production launch remains blocked during that staged migration. See `docs/production-persistence.md`.

Admin AI automation definitions use durable retirement (`retired_at` plus the authenticated retiring staff reference) rather than hard deletion. Normal definition, schedule and event queries exclude retired rows, while direct lookup and relational history remain intact. Retirement disables the definition and blocks later edit or enable operations; already prepared human-review actions retain their independent guarded lifecycle.

## Staff Admin security and host boundary

The production storefront and Admin application have separate canonical origins: `PUBLIC_STOREFRONT_ORIGIN` and `ADMIN_ORIGIN`. Staff cookies are host-only and distinct from customer cookies. Every `/api/admin/*` request outside authentication resolves the current staff session, live account profile and effective permissions. State-changing requests accept the configured Admin origin only in production. The Vite codebase uses a host-aware routing abstraction in preparation for `admin.tekcentral.co.za`; deployment and DNS remain pending.

## HTTP security boundary

The backend applies one shared HTTP security policy before route handling. All responses receive `nosniff`, `DENY`/`frame-ancestors 'none'`, `strict-origin-when-cross-origin`, a conservative Permissions Policy and an enforced CSP. The storefront CSP permits only the browser dependencies currently used by Google Maps/Places and reCAPTCHA; PayFast is permitted only as a form destination. `connect-src` includes same-origin plus the existing configured TekCentral API origin when the frontend/API are separated. The Admin CSP excludes customer-only script/frame dependencies. Production and preview prohibit inline script and eval; inline styles remain a documented compatibility allowance for current React component styling. Vite development alone permits inline script for the React Refresh preamble and the exact `127.0.0.1:5173`/`localhost:5173` WebSocket origins used by HMR. Production adds HSTS and `upgrade-insecure-requests`; local HTTP development does not.

Vite development and production-preview servers apply the same path-aware document policy, so storefront and Admin browser behavior can be tested locally. A static App Platform deployment must configure these same headers at its serving edge; generated files cannot carry transport headers by themselves. That deployment verification belongs to staging and must precede launch.

Credentialed CORS reflects only the configured storefront or Admin origin and sends `Vary: Origin`. Public APIs do not receive wildcard CORS. Public immutable Product media may continue to use wildcard CORS and immutable caching. Admin, account, cart, order, payment, checkout, contact and AI responses are globally `no-store`. Unknown exceptions are returned as a generic 500 envelope with a server-generated request ID; detailed messages and stacks are not sent to clients.

Production startup requires distinct public HTTPS storefront and Admin origins and rejects localhost origins, `PAYFAST_DEBUG_SIGNATURE=true` and `RECAPTCHA_TEST_BYPASS=true`. Forwarded client-IP headers are not broadly trusted. The current loopback-bounded PayFast tunnel behavior remains unchanged; DigitalOcean App Platform proxy behavior must be proven in staging before trusted-proxy configuration is widened.

Staff two-factor authentication uses RFC 6238 TOTP as the primary second factor and hash-only, one-time recovery codes as backup. Password verification for a 2FA-enabled account creates only a five-minute server-side pre-auth challenge; a full staff session is issued after the second factor succeeds. TOTP secrets are protected with AES-256-GCM using the server-only `STAFF_2FA_ENCRYPTION_KEY`. Production Super Admin and effective high-risk permission holders are restricted to Security setup and logout until 2FA is enabled. WebAuthn remains an explicit future extension; SMS is not part of the architecture.

## Scoop public Product evidence

Scoop XML/feed ingestion owns price, stock, and freshness. A separate bounded public-page evidence path owns canonical URL identity, labelled specifications, safe document references, and logistics measurements. It permits only public HTTPS `scoop.co.za` URLs, validates every redirect, applies timeout/response-size bounds, and requires exact SKU identity before persistence. Publication state is independent from both evidence streams.

## Contact conversation boundary

The persisted Contact enquiry store evolves version-1 enquiries into version-2 conversations and append-only message history. Public Contact submission remains the only inbound ingestion path. Admin replies and new one-to-one operational messages persist before SMTP and use category-derived department senders, idempotency keys and explicit retry. External mailbox replies are not synchronized.

## Merchandising boundary

Homepage curation is resolved by the supplier-neutral merchandising service. It stores canonical Product/category references separately from publication and exposes a customer-safe resolved homepage endpoint. Canonical public Product listing applies active promotions before the same Product data is consumed by storefront, Zeus, cart, checkout and order creation. See `docs/features/merchandising.md`.

## Zeus presentation boundary

`RoboPage` owns conversation, consent and request state. `components/zeus/ZeusWorkspace` owns responsive presentation and typed result rendering. Backend responses carry structured policy knowledge and approved actions; frontend components do not derive navigation or business state from assistant prose.

## Admin AI private chat persistence

Admin AI chat is separate from Zeus and Contact Inbox. PostgreSQL tables `admin_ai_conversations`, `admin_ai_messages` and `admin_ai_context_attachments` provide staff-owned conversations, deterministic ordered turns, database-backed idempotency and identifier-only H.6.4 context attachments. Repository operations always include the authenticated staff owner; no user-facing operation accepts an unscoped conversation ID. System prompts, reasoning content, raw provider payloads and context snapshots are never persisted. H.6.5A provides persistence only; the chat API and workspace remain a later phase.

## Admin AI automation persistence

PostgreSQL tables `admin_ai_automations`, `admin_ai_automation_events` and `admin_ai_automation_runs` provide the durable H.6.8 foundation for owner-bound definitions, trusted internal event deduplication, logical run occurrences, retries, leases and escalation. Definitions preserve separate owner/policy-subject and creator identities and use optimistic revisions. Runs are unique by automation and occurrence key; retries remain attempts on the same row. Definitions are disabled rather than hard-deleted so run provenance remains intact.

`admin_ai_actions` has explicit `CHAT` and `AUTOMATION` origins. Chat actions retain conversation/turn ownership and cascade semantics. Automation actions reference one durable run and never fabricate chat messages. Exactly one origin is required by PostgreSQL constraints.

The H.6.8B runtime is an opt-in background worker (`ADMIN_AI_AUTOMATION_WORKER_ENABLED=true`) that materializes due schedule and trusted-event occurrences before provider work, claims each durable run with an expiring lease, retries only transient failures on that same row, and coalesces missed schedules. Every execution reloads the active owner as policy subject and rechecks global Admin AI state, RBAC, domain permission, risk, operating hours and usage limits. Runtime work is SYSTEM-origin; a human-confirmed Product change remains attributed to the authenticated reviewing `STAFF_USER`.

OBSERVE and SUGGEST produce bounded safe run results. A requested AUTO cannot exceed the registered tool ceiling. The current `product_draft_update` and HIGH-risk `product_publish` tools are both capped at PREPARE. Publication is exposed only when canonical H.4 readiness and publication eligibility pass; confirmation rechecks Admin AI access, `products.publish`, policy, operating limits and the full publication baseline before atomically claiming the action and invoking the canonical idempotent publication service. Automation can prepare but cannot confirm or execute HIGH-risk work unattended. Pricing, refunds, procurement, order status, permissions, deletion, mapping/taxonomy and inventory remain outside the executable registry. Event publication is an internal allowlisted service rather than a public webhook, and self-origin events are ignored.

## Zeus catalogue discovery

`backend/zeus/catalogueSearch.ts` is the validated search-planning and ranking boundary. It interprets conservative typo, synonym, brand, taxonomy, ZAR budget, specification and use-case signals, then searches only `listPublicProducts()`. Ranking and `PRIMARY_MATCH` / `ALTERNATIVE` / `RELATED_ACCESSORY` classification are deterministic and evidence-based. Model-generated taxonomy and filters never become arbitrary repository queries.

## Zeus provider response boundary

`DigitalOceanZeusProvider` exclusively owns DigitalOcean/OpenAI-compatible response parsing. It accepts plain assistant text, null or text content alongside registered tool calls, multiple registered calls, and benign extra metadata. Tool arguments must be a JSON object satisfying the server-supplied schema before orchestration sees them. Unknown tools, structured assistant content, malformed arguments, inconsistent tool-call finish states, refusals and ambiguous termination fail closed. `finish_reason: length` maps to `OUTPUT_LIMIT`, preserving returned usage telemetry where available. Provider calls are not automatically retried; future mutation tools require separate idempotency and confirmation boundaries.

Zeus Phase A uses a server-only orchestration boundary: React calls `POST /api/zeus/chat`, `ZeusService` invokes a provider abstraction, and only a server-owned registry may call customer-safe domain tools. The deterministic local provider is the initial adapter. Conversation history is bounded and client-supplied, but only `user` and `assistant` roles are accepted; system policy, tool definitions and results remain server-owned. Product tools reuse published catalogue snapshots and canonical supplier-neutral availability. Future account tools must derive ownership exclusively from the HttpOnly customer session.

Zeus Phase B passes the server-resolved `SafeCustomer` only into the tool execution context. Authenticated tool schemas cannot select identity. Account orders reuse `listCustomerAccountOrders` and `getCustomerAccountOrder`, addresses reuse `listCustomerAddresses`, and every repository query is scoped to the current session customer. Provider context receives only the minimum serializer output needed for the invoked question; raw domain records, guest credentials and authenticated tool outputs are not retained in browser conversation history.

Customer authentication is isolated from the development admin workspace, supplier credentials, and payment-provider authentication. Customer accounts, opaque hashed sessions, hashed single-use password-reset tokens, and sanitized security events persist backend-only in `.data/customer-accounts.json`. Passwords use Node scrypt with a unique salt. The storefront receives an HttpOnly, SameSite=Lax session cookie; frontend JavaScript never stores or reads authentication tokens.

`backend/adminCustomerService.ts` is the customer-support read boundary. It receives safe account identities from `customerAuth`, joins account-owned orders once per request, and emits dedicated admin DTOs for directory and profile views. Password hashes, reset/session records, guest credentials, raw contact messages, contact fingerprints, supplier costs and provider secrets never enter these DTOs. Support enquiries are linked only by persisted `customerAccountId`; matching email text alone never establishes ownership. Customer metrics use immutable order snapshots and `PAID` order totals.

Public contact enquiries use the canonical `POST /api/contact` boundary. Validated records persist in `.data/contact-enquiries.json` before the shared SMTP transport is called. Category-to-mailbox routing is backend-controlled. Optional account context derives from the HttpOnly session, and order context is verified against canonical ownership before safe customer-facing order/payment states can enter the internal message. Guest order numbers remain unverified references. SMTP failure changes delivery state without deleting the enquiry.

Guest-order claims use a separate backend-only `.data/customer-order-claims.json` challenge/audit store. Random one-time proof codes are hash-only at rest, expire after 20 minutes, and are scoped to one authenticated account and one order. The order repository performs ownership assignment inside a critical section and never overwrites an existing owner. Claiming does not rewrite any commerce snapshot or supplier state.

Guest order access uses a separate backend-only `.data/guest-order-access.json` store. Guest checkout creates a random 256-bit URL-safe bearer token and returns it once; only its SHA-256 hash is persisted. The browser retains the raw credential in `sessionStorage` for the active tab and sends it only to TekCentral APIs in `X-Guest-Order-Access`. A bearer link may bootstrap that session through an `access` query parameter, which the client immediately removes from browser history; the API itself does not accept query credentials. The token is never sent to PayFast, persisted in order records, logged, or exposed through customer/admin serializers. Account-owned orders use server session ownership instead. Claiming a guest order revokes its bearer credential.

`GET /api/orders` is intentionally unavailable. `GET /api/orders/:orderNumber`, guest payment status/create/cancel, cancellation requests, and return requests require either the exact guest credential or authenticated ownership. Unknown orders and invalid, missing, or revoked credentials share the same neutral response. Legacy guest records without a credential fail closed; recovery is deferred to a verified-email reissue flow rather than an insecure compatibility bypass.

Syntech catalogue ingestion is backend-only. Secret full/update feed URLs remain in environment configuration; normalized observations and sanitized sync history persist in `.data/supplier-catalogue-syntech.json`. A supplier-specific lock, hourly request budget, and offset scheduler protect the external five-request-per-hour allowance.

TekCentral is registered as the internal `TEKCENTRAL` supplier. Staff-maintained offers persist in `.data/supplier-catalogue-tekcentral.json` and attach to canonical Products through the existing verified `SupplierProductMapping` repository. Each offer records a unique internal supplier SKU, ZAR source cost excluding VAT, current integer stock, active state, separate cost/stock observation timestamps, deterministic evidence fingerprint, and bounded private notes/reference fields. Updates retain audit summaries and never modify Product content, approved prices, publication versions, or historical order cost basis.

Manual stock enters `productAvailabilityService.ts` as another verified supplier evidence source. Active fresh available quantities (`onHand - reserved`) resolve through the shared supplier-neutral availability ranking; stale stock degrades to `CHECK_REQUIRED`, and inactive offers are ignored.

TekCentral Manual Supplier Phase C reuses canonical SupplierOrders. Paid staff-selected allocations reserve full line quantities atomically in the manual-offer repository. Canonical SupplierOrder approval finalizes the existing immutable cost basis; namespaced `tekcentralOperations` metadata records reserved, picking, packed, ready, fulfilled, or cancelled internal stages. Fulfilment consumes reservations and appends one irreversible stock movement. Pre-fulfilment cancellation releases reservations. There is no external supplier request, courier API, warehouse model, return restock, or supplier payment.

TekCentral Manual Supplier Phase D extends canonical customer returns with private receipt, inspection and disposition records linked by persisted Product, SupplierOrder and manual-offer identifiers. Explicit restock/write-off decisions are idempotently recorded in the manual inventory ledger. Public serializers strip these records, and refund state remains independent from physical inventory.

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
- Supplier administration follows four ownership boundaries: Settings owns shared supplier policy, Supplier Hub owns supplier-source operations and evidence, Products owns the supplier-neutral public Product lifecycle, and Supplier Orders owns cross-supplier procurement workflow. Supplier workspaces are registry/capability driven and do not add supplier-specific global navigation.
- Product publication separates unsaved editor state, backend-persisted publication drafts, and immutable active publication versions. Public catalogue APIs read active versions only; admin draft preview reads the saved draft.
- Product PDFs use the controlled public-asset boundary under `.data/public-assets/documents`, addressed by content hash without exposing filesystem paths.
- `backend/localShippingEstimator.ts` contains supplier-neutral local zone-estimation and freight-variance calculations. Supplier adapters provide authoritative logistics inputs; checkout does not contain supplier rate logic.
- CJ catalogue normalization stores currency provenance and variant-scoped logistics observations before shared pricing consumes supplier cost. The CJ launch pipeline derives evidence blockers and `READY_FOR_PRICING`; shared pricing remains supplier-neutral and receives only normalized currency-aware cost.
- CJ catalogue pricing derives USD from the official API contract, selects a quantity-applicable exact-VID price observation, and snapshots source amount, source field, FX rate/timestamp and normalized ZAR merchandise cost. Customer shipping remains outside catalogue product cost; supplier-order landed-cost analysis may still include logistics for operational viability.
- `backend/fxRateService.ts` isolates the supplier-neutral FX provider. Current quotes are persisted by pair with bounded history in `.data/fx-rates.json`; pricing snapshots the rate, provider, reference and timestamp so historical proposals do not depend on live FX.
- `backend/fxImpactService.ts` evaluates matching foreign-currency pricing snapshots after FX refresh. It selects live, approved, then pending commercial baselines; calculates normalized-cost and margin drift with the shared pricing engine; and persists assessments through `fxImpactRepository.ts`. ASSISTED mode may create pending proposals but cannot approve, publish, mutate storefront versions, or change order snapshots.
- `backend/fxReconciliationJob.ts` is the reusable scheduled/manual orchestration boundary. It discovers active currency pairs, reuses fresh quotes, refreshes stale pairs once, prevents overlapping process-local runs, and persists bounded summaries. The daily in-process scheduler is production/explicitly enabled and is single-instance appropriate; an external scheduler can call the same admin endpoint later.
- CJ source refresh keeps bounded product/variant observation history by endpoint and response fingerprint. Current API observations and documented staff evidence are merged independently so an API refresh cannot erase a higher-authority staff confirmation or mapping review history.
- CJ and Scoop converge on the same supplier-neutral Product repository. The
  source lifecycle is `SupplierOffer -> Product -> SupplierProductMapping`;
  catalogue import never creates a public Product. CJ creation preview is
  read-only, while confirmed creation uses exact PID/VID source-offer identity
  for idempotency and can supersede a historical mapping without deleting it.
- Scoop physical-spec enrichment uses a manufacturer-provider registry. Providers resolve exact manufacturer/SKU/model identity, normalize official measurements, and retain provenance as separate observations before the lower-authority Scoop product-page fallback is considered.
- Scoop logistics observations resolve product and package measurements independently. Manufacturer product specifications can remain the product fallback while an authoritative Scoop package observation supplies shipping measurements; admin overrides retain operational precedence.
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

CJ launch state is stored per exact imported variant in the same catalogue record. The normalized SupplierOffer key is `CJ:<supplierProductId>:<supplierVariantId>`. CJ product creation and mapping reuse the shared internal Product, supplier mapping, pricing proposal, controlled image, content and publication repositories; no separate CJ storefront catalogue is created.

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

Scoop public-page logistics ingestion reuses canonical website observations and
stores source-specific product, package and component measurements. It performs
only safe public fetches, caches successful observations, and requires explicit
preview/apply for staff-provided page captures. XML remains the commercial
authority and public-page logistics cannot overwrite commercial fields.

Canonical Scoop product URLs remain on the existing product-page resolution
record with identity status, provenance, timestamps and history. Phase 9E
website observations and controlled SKU-to-URL imports can promote exact
HIGH-confidence mappings; conflicts remain review-only. URL identity is stored
separately from public-page fetch accessibility.

## Canonical product taxonomy

The PostgreSQL canonical taxonomy registry is the supplier-neutral runtime authority shared by backend and storefront services. `src/lib/product-taxonomy.ts` is retained only as bootstrap/test data and conservative normalization vocabulary; it cannot establish live taxonomy identity without registry validation. Supplier category labels remain source evidence and pass through a supplier-category mapping boundary before canonical Product assignment. Existing flat fields and routes are compatibility inputs only.

Publication versions are not rewritten for taxonomy migration. Public catalogue reads add the current canonical assignment to the immutable snapshot, and future order lines capture stable taxonomy IDs at order time. This keeps historical orders and publication versions intact while category reporting can move to canonical IDs.

Scoop catalogue, Launch Readiness and publication navigation consume one
backend-derived product workflow state. The model combines mapping, logistics,
pricing, launch selection and publication state into one stage and one primary
next action, while retaining each domain's underlying state independently.

Structured public product content remains inside immutable publication
snapshots. Overview, dynamic specifications, verified documents and field-level
provenance are separate fields rather than one rich-text blob. Exact Scoop page
captures reuse the existing page-ingestion boundary to produce a read-only
content preview; accepted additions remain in the staff publication draft until
an explicit publish creates a new version. Product-level manufacturer or Scoop
measurements may become public specifications, while package measurements stay
inside logistics. Existing live versions never change during source refresh.

## Scoop paid-order orchestration

After an authoritative PayFast `PAID` transition, backend supplier
orchestration may resolve exactly one current verified Scoop mapping per line,
persist deterministic automatic allocations, and generate one Scoop
SupplierOrder per fulfilment group. SupplierOrder generation remains
idempotent through allocation IDs and active quantity checks. Scoop procurement
is manual: the supplier registry supplies the external reseller URL, while
acknowledgement, approval and reference-backed `ORDERED` transitions remain in
TekCentral. No portal credentials or automation are stored.
## Syntech UAT order adapter

`backend/suppliers/syntech/syntechOrderAdapter.ts` is the server-only boundary for Syntech Reseller API ordering. It reuses canonical orders, mappings, catalogue evidence, immutable cost basis, SupplierOrder persistence, and external-submission states. The frontend can request preflight or a confirmed UAT create through narrow permission-protected admin routes, but it cannot choose the supplier, SKU, cost, address, actor, endpoint, or credential. UAT endpoints are HTTPS allowlisted; production submission is deliberately rejected.

Preflight revalidates paid/unheld state, approval, exact verified mapping, bounded quantity and address fields, procurement exclusivity, current stock, cost freshness, and source fingerprint. A PostgreSQL row-locked claim owns idempotency across processes. Ambiguous transport/provider outcomes persist `UNKNOWN_RESULT` and fail closed because the documented Syntech API provides no read-side lookup/status capability. Production procurement therefore remains the authenticated, reference-backed manual workflow unless separately approved provider access is proven.
## Customer account ownership

Customer sessions are opaque, server-managed records separate from admin authentication. Saved addresses and account order routes derive the customer ID from the authenticated session; request payloads cannot select an owner. Orders snapshot customer and delivery values at creation, while `customerAccountId` is the sole account-history authorization key. Guest orders have no account owner and are never backfilled from email matching.

## Zeus inference providers

## First-party storefront analytics

`backend/storefrontAnalytics.ts` is the bounded first-party analytics boundary. Public clients submit only fixed event types through `/api/analytics/events`; the server assigns an opaque HttpOnly analytics session, derives account audience from the customer session, validates public Product identity and normalizes paths. Detailed anonymous activity is retained for 30 days and daily aggregates for 400 days in `.data/storefront-analytics.json`. Raw prompts, IP addresses, form values, payment data and replay data are not stored.

Canonical repositories remain authoritative for orders, paid revenue, Product availability and active carts. Zeus reporting aggregates the existing usage guard rather than copying conversations. Admin reports are exposed under the existing development admin-access convention at `/api/admin/analytics` and `/api/admin/analytics/zeus`; production admin authentication remains a deployment prerequisite shared by the wider Ops workspace.

## Zeus conversational cart

The shared cart is persisted behind a server-owned guest or authenticated session identity and consumed by the existing `CartProvider`; Zeus does not maintain a second cart. Writes use opaque ten-minute pending actions binding owner, operation, Product, quantity, confirmed price, expiry and idempotency state. Confirmation revalidates publication, current price and supplier-neutral purchasability. Replays return the stored result, price changes require renewed confirmation, and checkout, order creation and payment remain outside Zeus.

Zeus uses a server-only `ZeusAIProvider` boundary. The deterministic local provider remains available for development, while the DigitalOcean adapter calls Serverless Inference at `https://inference.do-ai.run/v1/chat/completions` when explicitly selected by environment configuration. Provider adapters translate messages, tool declarations and responses; they never own authorization or commerce rules.

The server executes every requested tool through the canonical registry and bounded orchestration loop. DigitalOcean credentials are backend-only, the model is configurable, unknown providers fail closed, and incomplete paid-provider configuration never silently falls back. Timeouts, provider failures, request IDs and usage metadata are normalized without exposing credentials or private tool data.

Equivalent Zeus tool calls are identified through normalized server-side fingerprints. Completed safe results may be reused within the same request, after which the provider receives a final-answer-only pass with no tools. This preserves legitimate sequential progress while preventing repeated catalogue execution and unbounded real-provider loops.

Authenticated Zeus tools have a second boundary beyond account ownership: current-session external-AI consent. Consent is versioned and persisted only on the opaque server session, is checked before private tool execution, and can be revoked immediately. The browser cannot forge consent through chat payloads, and only minimized tool output is sent to the configured provider.

Zeus usage enforcement sits in front of provider orchestration. It derives guest or account ownership from server-observed request state, persists only pseudonymous bounded telemetry, deduplicates submissions within one identity, and applies customer burst/hour/day limits plus platform circuit breakers. Provider/tool ceilings remain independent safety boundaries. Quota failure never disables catalogue, cart, checkout or account APIs.

Zeus policy knowledge is a customer-safe structured projection of the published commercial/legal policies and is exposed through the fixed `getStorePolicy` tool. Clear public-policy and signed-out personal-order intent may resolve deterministically before provider inference. All next-step actions are server enums; the browser maps only known enums to existing routes, Contact categories, or the canonical `publicBusiness` telephone value. The model cannot supply executable URLs or recipients.

Zeus identity and stable business knowledge are server-owned. A small versioned identity instruction is always present, while deterministic routing injects at most the relevant About, Shopping, Business, or Support knowledge module. Identity, creator, implementation-confidentiality, prompt-extraction, straightforward business FAQ, and secure-workflow boundary questions resolve before inference where possible. Live Product, price, availability, cart, order, tracking, return, payment, and account facts still require canonical tools. Provider/model/tool metadata remains internal telemetry and is not part of the customer chat response.

## TekCentral Manual Supplier Phase B

Manual supplier evidence remains in `.data/supplier-catalogue-tekcentral.json`, upgraded compatibly to version 2 with append-only stock adjustments, cost history, and audit entries. Offers may begin unmapped and then use the canonical Product repository and verified supplier mapping service.

Product creation reuses canonical taxonomy, controlled public assets, pricing proposals, readiness, and immutable publication review. Fresh active `onHand` stock participates in the shared supplier-neutral availability resolver; stale stock becomes `CHECK_REQUIRED`. Private SKU, exact stock, cost, notes, fingerprints, actors, and histories remain backend/admin data.

Paid-order allocation, SupplierOrder generation, reservations, order decrements, picking, packing, dispatch, returns/restocks, courier operations, and Manual Supplier order-cost finalization remain blocked for Phase C.

## TekCentral Manual Inventory Operations

Phase E remains layered on the Phase D manual supplier repository and stock movement ledger. Reorder settings, CSV preview/export, exact identifier lookup, fulfilled-unit forecasts and replenishment records are private operational services; they do not introduce a second inventory authority. CSV reconciliation and physical replenishment receipt append canonical stock movements, while planning and threshold changes never mutate stock.

The current location-ready model assigns manual offers to logical location `TEKCENTRAL_MAIN`. True location balances, transfers and reservation allocation are deferred because introducing them would change the proven single-pool reservation invariant. Customer DTOs continue to expose only supplier-neutral semantic availability.
# Launch SEO and public-form abuse protection

Public abuse-prone submissions obtain action-bound reCAPTCHA v3 tokens lazily in the browser. `backend/recaptchaService.ts` is the sole verifier and validates action, score, age, and production hostname before route side effects. Existing origin, rate-limit, honeypot, validation, and body-size controls remain independent layers.

Public route metadata is managed through `src/lib/page-metadata.ts`. Published catalogue state is the sole source for Product metadata and the dynamic `/sitemap.xml`; `/robots.txt` and per-route `noindex` directives protect private surfaces. The Vite storefront remains an SPA, so deployment must preserve history fallback and route sitemap/robots requests to the backend. A separate SSR stack was intentionally not introduced.

# Canonical catalogue enrichment

Supplier catalogue evidence is converted into advisory canonical taxonomy suggestions by one deterministic backend service. Suggestions are validated against the TekCentral taxonomy and never verify, publish, or overwrite staff-verified taxonomy automatically.

Published Product media is an ordered, immutable gallery of up to eight TekCentral-controlled images. Position zero is the primary image used by cards, cart, merchandising, SEO defaults and Zeus; the full ordered gallery is available only through the customer-safe public Product contract.

# Operational incident visibility

Phase H.1 adds a centralized operational-event and alert service beside the canonical System Health snapshot. Events are bounded diagnostic history; alerts aggregate actionable failures with persisted fingerprints and lifecycle state. Alert recording is best-effort and never becomes a payment, order, supplier, pricing or email source of truth. Admin deep links are allowlisted internal routes and all persisted text is sanitized.

# Admin audit and activity projection

Phase H.2 adds `backend/adminAuditService.ts` as an append-only read projection over successful canonical business mutations and meaningful system activity. It uses atomic bounded JSON, 365-day retention, hashed idempotency keys, explicit sensitive-field filtering, allowlisted Admin deep links, and server-side filtering/pagination. It is not a replacement for domain publication, pricing, order, payment, inventory, supplier, return, Contact, settings, or alert histories. The API is read-only and the actor model truthfully distinguishes `OPS` from `SYSTEM`, with compatible optional fields reserved for future authenticated staff.

# Production persistence boundary

The current `.data` JSON repositories and local public-asset directories are development persistence behind service/repository boundaries, not a production storage guarantee. Production launch requires transactional and identity state to move to durable managed database storage, public Product assets to object storage, and operational projections to durable storage with backup and recovery. App Platform instance filesystems must not be treated as authoritative commerce storage. `docs/production-readiness.md` owns the detailed migration inventory.

The Admin surface still uses the project's provisional development access convention. Real staff authentication and authorization must protect every `/api/admin/*` route and Admin page before public production launch.

# Staff authorization foundation

`backend/staffRbac.ts` is the canonical registry for staff roles, permission metadata and role bundles. Effective permissions are role defaults plus explicit user grants minus explicit user revocations, with revocation taking precedence. Unknown roles and permissions fail closed. Authorization code checks permission IDs rather than role names.

`backend/staffAuthorization.ts` provides reusable permission checks, a future staff authorization context and H.2 audit actor projection. A temporary full-permission `OPS` context preserves the existing provisional Admin boundary; it is not a staff identity or production authentication mechanism. `SYSTEM` remains separate and receives no human permissions. Phase 2 supplies authenticated staff sessions and Phase 3 applies guards comprehensively.

# Staff authentication and secure sessions

`backend/staffAuth.ts` owns a staff identity store, scrypt password hashes, hash-only invitations/resets/sessions, lifecycle state and current-profile RBAC resolution. It never consults customer identity for Admin access. Invitation and reset mail is isolated in `backend/staffAuthMail.ts` and uses canonical Support identity.

The dedicated `tc_staff_session` cookie carries a random bearer token while persistence stores only its SHA-256 hash. Sessions expire after 12 hours or two hours of inactivity. Disablement, password reset and password change revoke sessions immediately. Current account status and permissions resolve on each lookup rather than being permanently embedded in the session.

The one-time environment bootstrap creates an active Super Admin only if none exists and forces a password change. The local atomic store remains a migration boundary, not production-durable storage. Phase 3 applies staff sessions and permission guards comprehensively to Admin routes.
## Phase J invoice and customer-delivery persistence

Migration `0015_commerce_invoice_delivery_foundation.sql` adds the relational foundation for immutable issued invoices, one private PDF association, durable customer-delivery state, and append-only delivery attempts. `commerce_invoices.order_id` and `invoice_number` are independently unique; future `INV-YYYY-NNNNNN` allocation uses the existing transactional `app_sequences` allocator under the `invoice` sequence name. Issued invoice rows, document associations, and delivery attempts reject ordinary update/delete semantics. Customer-delivery rows remain mutable only through lease-aware repository transitions and include durable retry scheduling.

Migration `0016_commerce_recovery_scope.sql` adds nullable, write-once prospective workflow markers to the Order aggregate. New PostgreSQL checkout Orders receive `order_confirmation_required_at` in the same transaction as initial persistence; authoritative verified PayFast transitions receive `invoice_required_at` in the same transaction as the `PAID` state. Existing rows remain `NULL`, and no timestamp heuristic or payment-state inference may place them in recovery scope. Bounded repository queries can identify marked Orders missing their canonical confirmation delivery or invoice, but J.6A runs no worker and performs no recovery. J.6B depends on these explicit markers.

This foundation does not issue invoices, render PDFs, send email, expose HTTP routes, or backfill historical paid orders. J.2B owns order-confirmation delivery runtime, J.3 owns invoice eligibility/snapshot creation/number allocation, J.4 owns deterministic PDF rendering and private storage, and later phases own authorized access and retry operations. Seller identity will be snapshotted from the canonical public-business source at issuance. A distinct billing address does not yet exist, and merchant VAT registration/document wording remains unresolved.

### J.2B durable order-received confirmation

After a new Order is durably persisted, the backend idempotently creates one `ORDER_CONFIRMATION` delivery from the email in the Order snapshot. Checkout does not send SMTP inline: a PostgreSQL-backed worker claims due deliveries with a 90-second lease, renders multipart customer mail from canonical Order values, records an append-only attempt, and transitions the logical delivery to `SENT` or `FAILED`. Four attempts are allowed with persisted 1-minute, 5-minute and 30-minute retry delays for transient SMTP failures. Permanent recipient/provider failures have no retry timestamp.

The worker starts only where scheduled background work and PostgreSQL persistence are active, stops with the backend lifecycle, and never scans Orders to infer missing deliveries. Existing Orders therefore receive no historical backfill. Repeated transient SMTP failures coalesce an Email H.1 incident and a successful send resolves it; one invalid recipient does not create a systemic alert. Automated deliveries use `SYSTEM` origin. This phase creates no invoice, PDF, receipt, invoice-delivery record, or customer-facing resend endpoint.

### J.3 paid-order invoice issuance

After a verified PayFast ITN has committed a PostgreSQL Order payment as `PAID`, `ensureInvoiceForPaidOrder(orderId)` locks and reloads the canonical Order inside one transaction. It returns an existing invoice before allocating anything, otherwise validates the ZAR Order totals, allocates `INV-YYYY-NNNNNN` through the existing yearly `invoice` business sequence, snapshots commercial evidence, hashes canonical JSON with SHA-256, inserts one immutable `ISSUED` invoice, and creates one dormant `INVOICE_DELIVERY` row. The year and `issuedAt` use database time, with the sequence year derived in the `Africa/Johannesburg` business timezone.

The snapshot is renderer-ready and self-contained: issuance-time seller identity, persisted customer and delivery-address evidence, order references, order lines, exact persisted totals, safe payment evidence, and only tax evidence already present on the Order. The delivery address is explicitly marked as the source of the billing-address evidence because checkout has no separate billing-address model. Supplier identity, supplier cost, margin, allocations, raw ITN data, secrets, and consignee ID are excluded. Merchant VAT registration and the final invoice document title remain unresolved; J.3 does not claim `TAX INVOICE` or fabricate a merchant VAT number. Existing checkout VAT calculation still has the previously identified hard-coded 15% versus configurable-policy drift; issued snapshots preserve the Order values rather than correcting them.

Issuance is prospective and event-driven only. There is no startup scan or historical paid-Order backfill. A duplicate valid ITN safely re-runs the idempotent ensure operation, while row locking and database uniqueness preserve one invoice, one number, and one delivery per Order. An issuance failure occurs after payment persistence, so the Order remains paid and an H.1 alert records a recoverable operational failure. Successful later issuance resolves the systemic issuance alert. Automatic issuance emits one idempotent `SYSTEM` H.2 event with safe identifiers and the snapshot fingerprint.

The pending `INVOICE_DELIVERY` is not claimable by the J.2B worker, which remains restricted to `ORDER_CONFIRMATION`; no PDF or SMTP action occurs. J.4 must render exclusively from the persisted versioned snapshot through the stable renderer input contract. Refunds after issuance do not rewrite or delete the invoice; credit notes are a future accounting phase.

### J.4 invoice PDF rendering and private storage

`backend/invoicePdfRenderer.ts` uses PDFKit as a Node-native renderer with no browser or graphical desktop dependency. Renderer `invoice-pdf-v1` accepts only `InvoiceCommercialSnapshot` schema version 1 and loads the packaged `public/images/logo/tekcentral.logo.jpeg` asset. It creates deterministic A4 portrait bytes using issuance-time metadata, wrapped customer-safe fields, repeated item-table headers, right-aligned ZAR totals, payment confirmation, delivery-address evidence and page X/Y footers. Unsupported snapshots and missing/invalid brand assets fail closed. The title remains `INVOICE`; merchant VAT registration, `TAX INVOICE` wording and separate tax claims remain excluded pending policy confirmation. Snapshot v1 has no delivery method/estimate, so the renderer does not resolve those values from live shipping state.

`ensureInvoiceDocument(invoiceId)` returns a verified existing document or renders, SHA-256 hashes and writes a new PDF through the private object-storage abstraction. Objects use `invoices/<invoice-number>/<hash>.pdf`, `PRIVATE_INVOICE`, `application/pdf` and the configured private bucket. Media metadata and the immutable one-document-per-invoice association are then persisted under the existing migration 0015 schema. Reads validate object presence, PDF signature, byte size and content hash before accepting an existing document. Missing/corrupt objects fail closed rather than silently regenerating a second canonical association.

PDF bytes are deterministic for the same snapshot and renderer version, so concurrent workers target the same content-addressed object; invoice row locking and database uniqueness select one immutable association. A storage failure creates no association. If object storage succeeds but the following database transaction fails, the content-addressed private object can remain as a recoverable orphan for J.6; retries reuse the same key instead of creating unbounded variants. Successful recovery resolves renderer/storage/integrity H.1 incidents, and first creation records one idempotent `SYSTEM` H.2 event with identifiers, renderer version and content fingerprint only.

Invoice issuance now best-effort ensures the private PDF after the invoice transaction has committed. PDF failure never rolls back the paid state or immutable invoice. No public/Admin download route, signed URL, invoice SMTP delivery, receipt, historical backfill or credit note is introduced. The dormant `INVOICE_DELIVERY` remains unsent. A future payment receipt is a separate document domain referencing the Order, invoice and safe payment evidence; it is not persisted or rendered in J.4.

### J.5 authorized invoice access and delivery

Registered-customer invoice metadata is projected only after canonical Order ownership succeeds. Customer and Admin download routes resolve the invoice and immutable `PRIVATE_INVOICE` association server-side, verify PDF signature/size/hash, and then either stream local bytes through the authorized application route or issue a short-lived exact-object Spaces URL. Browser input never selects an invoice ID, media ID, object key, filename or recipient. Guest invoice access uses a bounded verified PDF email attachment; no reconstructable guest credential or enumerable invoice URL is introduced.

The existing customer-delivery worker now claims both confirmation and invoice rows. Invoice delivery is deferred without an SMTP attempt until the canonical document is ready, then renders deterministic snapshot-only mail and attaches one verified PDF (maximum 2 MiB). Existing leases, append-only attempts, transient backoff, permanent SMTP classification and H.1 incident coalescing remain shared. Automated sends use `SYSTEM`; manual resend/retry uses the authenticated `STAFF_USER` and `orders.resend_documents` permission.

Admin resend creates a new idempotent logical `INVOICE_DELIVERY` that references the same invoice/document and original persisted recipient, preserving the previous `SENT` history. Retry requeues the same failed logical delivery and rejects permanent recipient/provider failures. Neither action regenerates a PDF, allocates another invoice number, changes the snapshot, creates a receipt/credit note, or scans historical Orders. Migration `0015` remains sufficient.

### Phase J accepted commerce-document boundary

Phase J is accepted as the production architecture for prospective Order confirmation and paid-order invoice delivery. New PostgreSQL checkout Orders receive an explicit confirmation-recovery marker and one durable confirmation delivery. Only a backend-verified, persisted PayFast `PAID` transition sets the invoice-recovery marker and permits immutable invoice issuance. Invoice numbering uses the independent PostgreSQL business sequence; rendering, storage, access, delivery, retry and reconciliation all reuse the same canonical invoice, snapshot and private PDF association.

Customer access is authorized through exact Order ownership. Guest access is delivery-only through the verified attachment flow, and Admin access is Order-scoped with separate read and resend permissions. Invoice numbers, media IDs and object keys are never authorization credentials. Manual resend cannot change the persisted recipient, and no public invoice URL exists.

Production must run the customer-delivery worker and commerce-reconciliation worker with PostgreSQL and private object storage available. `CUSTOMER_DELIVERY_WORKER_ENABLED` defaults on unless explicitly disabled; `COMMERCE_RECONCILIATION_WORKER_ENABLED` remains an explicit opt-in and must be `true` for production recovery. Environment changes require a process restart. Claims, leases, advisory locks, unique constraints and canonical ensure operations make restart and multi-instance execution safe. Neither worker backfills Orders whose migration-0016 recovery markers are `NULL`.

Intentional exclusions remain payment receipts, credit notes, historical invoice backfill, merchant VAT-registration claims and a distinct checkout billing-address model. The invoice title remains `INVOICE`. Issuance preserves persisted Order tax evidence; the older checkout inclusive-tax calculation and configurable VAT policy remain a future production-readiness drift risk.

## Distributed scheduled-work coordination

Syntech catalogue scheduling and FX pricing reconciliation run only when `APP_ROLE=worker`. Web processes never start either scheduler. Their logical executions use stable PostgreSQL advisory-lock identities (`job:syntech-scheduler` and `job:fx-scheduler`) through a small dedicated coordination pool. Claims are non-blocking: ordinary contention skips the tick without an H.1 incident or provider request. The checked-out session owns the lock and releases it in `finally`; process shutdown also stops future interval ticks. Existing domain idempotency remains the second line of defence.

One worker replica is recommended for the initial production deployment to simplify operations, but it is not the correctness boundary. PostgreSQL coordination protects accidental worker scaling. Scheduler enablement and process role remain server environment configuration and are not mutable through browser or Admin APIs.

Production Contact and Admin AI rate limits use shared PostgreSQL buckets. Remaining process-local maps in Zeus, CJ and Syntech are short-lived request coalescing, token caching, or same-process click protection; provider-side quotas and durable domain claims remain authoritative. They are not cross-instance scheduling locks.

## Supplier procurement viability boundary

Product/content readiness and procurement viability are independent. Publication requires both the existing canonical readiness rules and an operationally accepted supplier procurement path. Checkout revalidates the same supplier-neutral policy before creating an Order and fails closed with `This item is temporarily unavailable for purchase.` when no verified mapped path remains viable.

The server-owned policy is: TekCentral internal fulfilment supported; Scoop, Mustek and TVR manual procurement supported; Syntech manual reseller-portal procurement supported independently from its deployment-and-operationally gated UAT API path; CJ controlled unpaid API creation/manual downstream operations supported but not automatic. Publication and checkout both consume this supplier-neutral capability policy, with checkout remaining the defence-in-depth gate.

Supplier failures after payment remain internal operational exceptions on the SupplierOrder. They do not rewrite invoices, alter the paid customer Order into a supplier-specific state, or expose provider codes. Staff resolve persisted attention through an accepted manual path, an approved alternate supplier where existing rules permit, or the customer-support/refund workflow.

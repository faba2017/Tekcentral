# Decisions

## 2026-10-30 - PostgreSQL and Spaces are the production persistence baseline

Status: Accepted

TekCentral production uses DigitalOcean Managed PostgreSQL for authoritative structured business state and DigitalOcean Spaces through an S3-compatible abstraction for object bytes. Containers are stateless. Local JSON/files remain first-class development adapters but are prohibited for staging/production. Cutover is domain-by-domain using expand/import/verify/switch/retire; generic JSONB dumping is rejected. Managed rolling replacement is standard deployment, with blue/green reserved for unusually risky releases.

## 2026-10-30 - Staff TOTP is the production second-factor baseline

Status: Accepted

TekCentral staff 2FA uses RFC 6238 authenticator-app TOTP plus one-time recovery codes. Password success creates a short-lived pre-auth challenge rather than a privileged session. TOTP secrets use application-layer AES-256-GCM with a server-only key; recovery values are hash-only. Production Super Admin and high-risk effective permissions require 2FA. WebAuthn is deferred behind clean factor extension points, and SMS OTP is explicitly excluded.

## 2026-10-30 - Dedicated authenticated Admin security boundary

Status: Accepted

TekCentral Admin uses backend-authoritative staff sessions and granular permission checks for every privileged API. Production Admin is prepared for `admin.tekcentral.co.za`, separate from storefront origin and customer authentication. The current Vite codebase remains shared with a host-aware path abstraction; deployment may create a dedicated Admin build output without duplicating domain code. Storefront `/admin` should be excluded or return 404 rather than remain canonical.

## Scoop feed and public-page responsibilities

Scoop XML remains the commercial availability source. Public Product pages are a separate, read-only identity/specification/logistics evidence source. Authenticated URLs and browser sessions are unsupported. This separation prevents Product-page verification or publication from falsely refreshing stock evidence.

## Phase G.3 is an operational conversation log, not an email client

TekCentral extends its existing persisted Contact workflow with internal conversations and outbound messages. It does not ingest arbitrary mailbox traffic, implement IMAP, or claim mailbox read state. Internal conversation IDs are canonical; department mailboxes remain the destination for customer replies outside the Admin application.

## Phase G.2 uses explicit homepage placement

Homepage placement is represented by merchandising sections rather than another Product `featured` flag. Featured is manual-only by default; other sections may opt into deterministic taxonomy-scoped fallback. Promotions are bounded runtime overrides over approved public regular prices and are applied at the canonical public Product-list boundary. Campaigns are deferred because current sections and promotions do not justify a broader marketing model.

## Zeus is a typed conversation workspace

The Zeus customer experience is conversation-first. Canonical Product, order, address and policy data render through typed result components, while mutations remain excluded until an explicit structured-action contract is approved. The existing interactive Zeus scene remains the assistant identity.

## Catalogue search is deterministic after intent interpretation

Zeus uses controlled normalization and strict tool fields to interpret customer language. The server validates taxonomy against the canonical registry, derives brands from published Products where possible, and ranks canonical evidence deterministically. Embeddings, vector databases and external web search are deferred until measured catalogue-search quality demonstrates a need.

Use this file for meaningful durable architectural and product decisions. Do not use it as a daily development diary.

## 2026-10-23 - Zeus server-only provider boundary

Status: Accepted

Zeus uses a backend provider interface rather than a browser/provider integration. Phase A keeps validated client-supplied history because long-term memory is not yet justified; history is bounded and cannot include system or tool roles. A deterministic local provider enables development while DigitalOcean inference remains deferred. Security is enforced by customer-safe serializers and a fixed tool registry, not by model instructions alone.

## 2026-10-23 - Zeus authenticated tools use session-owned execution context

Status: Accepted

Authenticated Zeus tools receive identity only through the server execution context populated from the existing HttpOnly customer session. Their schemas contain no identity fields. The provider receives minimal customer-safe projections only after a relevant tool call, while guest access and all mutations remain separate secure workflows.

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

## 2026-10-23 - DigitalOcean Serverless Inference for Zeus

Status: Accepted

Decision:
Zeus retains its provider-independent server orchestration and adds DigitalOcean Serverless Inference as the first real model provider. Selection is explicit through `ZEUS_PROVIDER`; the deterministic local provider remains available and is the default for credential-free development.

## Zeus launch quotas use request counts and pseudonymous persistence

Phase C.3 uses configurable request-count allowances rather than weighted units. Deterministic cost tiers and token totals are recorded for aggregate operations, allowing evidence-based weighting later without making the first launch policy harder to reason about. A bounded 48-hour JSON store matches the current lightweight persistence architecture; quota identities are hashed and raw prompts or private tool payloads are never stored.

## Zeus actions are server enums, not model URLs

Phase C.4 keeps policy, authentication and support routing deterministic. The provider can request a canonical policy topic or express intent, but the server returns only approved action enums and safe context. Existing frontend routes, Contact categories and centralized business identity resolve the destination. This prevents arbitrary links, recipients, phone numbers and guest credentials from entering model-controlled output.

DigitalOcean integration uses the OpenAI-compatible chat-completions endpoint, a configurable tool-capable model and a server-only model access key. Tool execution remains inside TekCentral's bounded registry loop. No DigitalOcean Agent, Knowledge Base, Function, App Platform app, Dedicated Inference resource or other infrastructure is provisioned by this decision.

Reason:
This introduces real conversational and tool-calling capability without moving customer authorization, supplier confidentiality or commerce decisions into the model, and without coupling Zeus to DigitalOcean-specific behavior above the provider boundary.

## 2026-10-23 - Zeus Tool Progress and Account-Data Consent

Status: Accepted

Decision:
Zeus normalizes and fingerprints tool calls within each request. Equivalent successful calls reuse safe evidence and trigger a tool-disabled final-answer pass; different calls remain available for legitimate sequential reasoning. Existing iteration and execution ceilings remain unchanged.

Private customer tool output may reach an external AI provider only after explicit, versioned consent stored on the current server-managed session. Customers can decline or revoke consent, and revocation immediately blocks subsequent private tool execution. Authentication and frontend state alone are not consent.

Reason:
Real models may repeat function calls despite receiving successful results, and authenticated assistance introduces a distinct external-processing decision. Server-side loop progress and consent enforcement preserve cost control, data minimization and account ownership without weakening public product assistance.

## 2026-10-27 - Zeus Identity and Business Knowledge Stay Server-Owned

Status: Accepted

Decision:
Zeus has a versioned server-side identity as TekCentral's AI shopping and support assistant, built for TekCentral by Fabrice Isama. Provider/model and orchestration details are customer-confidential. Straightforward identity, confidentiality and business FAQ requests resolve deterministically; non-deterministic requests receive only one relevant bounded business-knowledge module. Canonical policy remains in the existing policy registry and live commerce facts remain behind registered tools. No external Knowledge Base or vector retrieval service is introduced.

Reason:
This gives Zeus a consistent TekCentral identity and useful stable business context while reducing paid inference, minimizing provider payloads, preventing duplicated policy truth, and keeping live commerce authority in TekCentral services.

## 2026-10-25 - Zeus Provider Parsing Remains Strict and Isolated

## 2026-10-25 - Zeus Uses the Shared Server-Owned Cart

Status: Accepted

Decision:
The existing cart UI reconciles with one server-owned cart identified from the customer session or an opaque HttpOnly guest cookie. Zeus writes require a ten-minute pending action and explicit confirmation; completed actions retain their result for idempotent replay. Product price, publication and availability are revalidated at confirmation. No cart write is automatically retried, and Zeus cannot submit checkout or payment.

Reason:
The prior browser-only cart could not enforce ownership, tamper resistance or mutation idempotency. A shared service keeps the header, cart page, checkout and Zeus aligned without granting the model purchasing authority.

## 2026-10-25 - First-party privacy-conscious storefront analytics

Status: Accepted

Decision:
TekCentral uses a bounded first-party event store with opaque HttpOnly visitor sessions for traffic and funnel reporting. Browser events use a fixed enum and contain only normalized routes, canonical public Product identifiers and bounded search terms. Orders, revenue, availability and carts remain derived from their canonical backend services; Zeus metrics reuse its existing pseudonymous usage telemetry. Detailed activity expires after 30 days and daily aggregates after 400 days.

Reason:
Operational visibility is needed without introducing third-party trackers, session replay, raw conversation storage or a competing source of truth for commerce state.

## 2026-10-26 - Customer support uses explicit account ownership

Status: Accepted

Decision:
The admin Customers workspace is read-only and uses a dedicated least-privilege serializer. Registered-customer history contains only records with explicit `customerAccountId` ownership. Guest orders and contact enquiries are never attached solely because an email address matches. Paid spend is derived from immutable paid-order snapshots, and Zeus visibility is limited to safe consent/use summaries.

Reason:
Staff need a fast support view without weakening guest-order claims, exposing authentication records or creating invasive personal activity timelines.


Status: Accepted

Decision:
DigitalOcean response compatibility is normalized only inside `DigitalOceanZeusProvider`. Valid text and registered tool-call variants are accepted, including the bounded inline argument form observed from `glm-5.3-flash`; every normalized call must still satisfy the canonical tool schema. Output-limit termination has its own safe error category and token usage remains accountable. No automatic provider retry is performed.

Reason:
Read-only catalogue assistance can tolerate a safe retry by the customer, while automatic retries increase cost and create an unsafe precedent for Phase E mutations. Unknown tools, malformed JSON and unsupported content must continue to fail closed.
# Launch SEO and anti-abuse decisions

- Use score-based Google reCAPTCHA v3 only on actual unauthenticated abuse-prone writes, loaded lazily per protected action.
- Fail closed when verification is missing, invalid, unavailable, or misconfigured. A bypass is allowed only through explicit non-production configuration.
- Use `https://tekcentral.co.za` as the canonical production origin while retaining environment-aware backend sitemap generation.
- Derive sitemap Product and taxonomy URLs from published canonical catalogue data; omit fabricated `lastmod` values.
- Keep the existing Vite SPA for this phase. Route metadata is hydrated client-side and crawl discovery is server-generated; production prerender/SSR remains a deployment architecture decision rather than a duplicate catalogue pipeline.

# Supplier-neutral enrichment and Product galleries

TekCentral uses one supplier-neutral canonical category suggestion service for Scoop, Syntech, CJ and manual Product workflows. The service returns confidence and evidence but never auto-verifies taxonomy.

Canonical Product media remains an ordered array for backward compatibility and also exposes structured public media metadata. Index zero is primary. Public publication accepts only TekCentral-controlled assets, with a maximum of eight images.

## 2026-10-28 - Operational events are separate from actionable alerts

Status: Accepted

Decision: TekCentral records bounded sanitized operational events and evaluates only business-significant failures into aggregated Admin alerts. Alert acknowledgement is not resolution, and alerts never replace canonical commerce state. Current lightweight persistence uses atomic bounded JSON behind a service abstraction; production staff authentication remains required before launch.

Reason: Staff need immediate, actionable incident visibility without a noisy raw-log UI, duplicate health architecture, leaked customer/provider data, or observability becoming a new failure point.

## 2026-10-29 - Unified Admin audit is an append-only projection

Status: Accepted

Decision: Important successful Admin mutations and meaningful system operations project into one read-only Audit / Activity stream. Alerts remain current incident state; canonical domain repositories remain authoritative. The initial actor model uses truthful `OPS` and `SYSTEM` labels and reserves optional authenticated-staff fields for the later staff-auth phase. The projection uses bounded atomic JSON, 365-day retention, safe summaries, allowlisted internal links, and idempotency hashes.

Reason: Operations need one searchable history without fabricating old events, duplicating source-of-truth state, exposing secrets/PII, or implying named staff identities before production staff authentication exists.

## 2026-10-29 - Production Storage and Admin Authentication Are Launch Gates

Status: Accepted

Decision:
TekCentral's current atomic `.data` repositories remain valid development implementations behind repository boundaries, but App Platform local filesystems are not accepted as authoritative production commerce storage. Transactional, account, Product, supplier, Contact and settings state must migrate to durable managed persistence; controlled public assets must move to object storage; operational projections require durable retention and recovery. Every Admin page and `/api/admin/*` route must be protected by real staff authentication and authorization before public launch.

Reason:
Deploying the existing local stores unchanged could lose or split authoritative state across restarts or instances, while the provisional Admin access convention does not establish staff identity or least privilege.

## 2026-10-29 - Syntech Manual Procurement Is the Safe Launch Fallback

Status: Accepted

Decision:
When Syntech reseller API writes are disabled or UAT configuration is incomplete, Syntech SupplierOrders use the existing approval, manual reseller-portal procurement and recorded supplier-reference workflow. The controlled UAT workspace is shown only when the backend reports real-order submission capability. Production Syntech submission remains disabled unless a separately authorized integration phase proves it.

Reason:
Catalogue evidence and order allocation can remain operational without implying an unavailable supplier capability or weakening write guards.

## 2026-10-29 - Staff Authorization Uses Canonical Permissions and Overrides

Status: Accepted

Decision:
TekCentral defines six staff role bundles—Super Admin, Operations, Support, Catalogue, Finance and Auditor—over one canonical permission registry. Effective authority is the base role plus explicit grants minus explicit revocations, with revocation winning. Backend decisions check permissions rather than role names; Super Admin receives the complete permission set without bypassing guards. `SYSTEM` is not a staff role.

Phase 1 retains a clearly marked full-permission provisional `OPS` context so existing Admin behavior remains unchanged. Future authenticated sessions will supply `STAFF_USER` identity and effective permissions, after which comprehensive route/action enforcement and 2FA follow in separate phases.

Reason:
Granular permissions support least privilege and exceptional staff responsibilities without role proliferation, while a single resolver keeps future backend enforcement, Admin UX and H.2 audit identity consistent and testable.

## 2026-10-29 - Staff Authentication Is Separate, Invite-Only and Server-Session Based

Status: Accepted

Decision:
Staff identities use a dedicated repository, credential/reset/invitation lifecycle and `tc_staff_session` cookie separate from customer authentication. Onboarding is invitation-only except for a one-time first-Super-Admin environment bootstrap. Tokens are random and hash-only at rest; sessions resolve current account and RBAC state on every lookup, expire after 12 hours or two hours of inactivity, and are revoked on reset, disablement or password rotation.

The final active Super Admin cannot be disabled, demoted or stripped of critical recovery permissions. Authentication lifecycle events project `STAFF_USER` identity into H.2, automated work remains `SYSTEM`, and transitional development access remains `OPS`. Full Admin permission enforcement and 2FA remain separate phases.

Reason:
Admin access requires revocable, attributable staff identity without allowing customer sessions, stale permissions, plaintext credentials or permanent bootstrap secrets to become security boundaries.

## 2026-11-09 - Admin AI is isolated from public Zeus

Status: Accepted

Decision:
Admin AI uses a backend-only service boundary with independent `ADMIN_AI_*` configuration, credentials, instructions, model-role routing, usage metadata and operational logging. Public Zeus retains its own provider adapter and `ZEUS_*` configuration. Admin AI callers select only `PRIMARY` or `ROUTINE`; fallback is bounded service behavior, and the provider endpoint and model identifiers are not browser-controlled. The foundation has no HTTP generation route, tools, direct database access, persistence or business mutations.

Future Admin AI actions must use permission-checked, bounded canonical service tools and a truthful dedicated automation identity. They must not impersonate the current staff account, Super Admin or OPS actor.

Reason:
Separate trust, cost, prompt, permission and audit boundaries prevent an internal operations assistant from inheriting customer-assistant behavior or bypassing canonical TekCentral services as later H.6 capabilities are introduced.

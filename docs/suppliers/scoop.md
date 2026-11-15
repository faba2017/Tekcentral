# Scoop Distribution

Scoop operations are organized through the Supplier Hub. The Scoop workspace owns feed/catalogue operations, supplier-product evidence, mappings, stock observations, launch-source operations, synchronization status, health, and links to filtered Supplier Orders. Settings owns shared supplier policy; public Product lifecycle remains under Products.

## Selected-offer mapping completion

- Selected-for-launch offers remain selected while mapping is completed.
- Existing TekCentral Products are searched by exact manufacturer/model,
  supplier aliases and source provenance before another Product is created.
- Fuzzy title or product-family similarity is never sufficient for automatic
  verification.
- Creating a Product from an exact Scoop offer is idempotent, records immutable
  source-offer provenance, and creates a HIGH-confidence VERIFIED mapping.
- Mapping completion reuses existing logistics observations and advances to one
  current pricing proposal without approving or publishing it.
- Products remain supplier-independent; Scoop identity stays in SupplierOffer,
  mapping and provenance records rather than customer-facing product identity.

## Paid-order procurement

Scoop is a manual procurement supplier. Its operational channel is the Scoop
reseller portal and its configured procurement URL is
`https://scoop.co.za/products/wired-networking/routing/`. TekCentral stores no
Scoop login credentials, cookies or portal session data and performs no portal
automation.

When a paid order line has exactly one current `VERIFIED` mapping to an
available Scoop offer and no operational hold, TekCentral creates an automatic
Scoop allocation and one idempotent SupplierOrder. Missing, stale, unavailable
or ambiguous mappings remain for manual allocation. Mixed orders remain split
by supplier.

The real Scoop workflow is `ACTION_REQUIRED` -> `ACKNOWLEDGED` -> `APPROVED` ->
manual portal placement -> `ORDERED` -> `CONFIRMED` -> `SHIPPED` -> `DELIVERED`.
Opening the portal never changes status. `ORDERED` requires staff to record the
real Scoop reference. Mock controls are development-only and do not represent
real procurement.

SupplierOrder creation snapshots Scoop SKU, offer identity, dealer unit cost
excluding VAT, quantity, merchandise cost and capture time. Later catalogue
price changes do not rewrite that historical snapshot. Customer payment,
selling price, delivery charge and shipping quote remain unchanged.

New Scoop SupplierOrders entering `ACTION_REQUIRED` create one internal
`SCOOP_ACTION_REQUIRED` email notification. The notification is keyed by
SupplierOrder ID, so duplicate PayFast ITNs, reloads and acknowledgement do not
resend a successful delivery. Delivery failure leaves procurement state intact
and can be retried explicitly from SupplierOrder detail. Historical records are
not emailed on backend startup.

The recipient and SMTP transport come from backend environment configuration.
Messages contain order identifiers, item count, customer total, next action and
an admin link only. They exclude customer contact/address data, supplier cost,
margin, payment payloads and credentials. This is an internal alert channel;
customer email and future n8n handoff remain separate work.

## Multi-source catalogue reconciliation

Scoop catalogue identity remains one canonical `SCOOP:<sku>` SupplierOffer per
SKU. XML feed and approved website-discovery imports are stored as source
observations on that record; they never create separate XML and website offers.
Existing mappings, logistics, launch selection, pricing history and internal
product provenance survive source upgrades.

Observations record source type (`XML_FEED`, `WEBSITE` or `ADMIN_IMPORT`),
reference/batch information, first and last seen timestamps, last successful
refresh, source fields and active/stale state. Reconciliation states are
`XML_ONLY`, `WEBSITE_ONLY`, `BOTH`, `SOURCE_MISMATCH` and `STALE`. Material
manufacturer conflicts require review; punctuation, capitalization, SEO title
expansion, `WiFi`/`Wi-Fi` and harmless company suffixes do not.

Current XML is authoritative for dealer/retail pricing, branch and total stock,
structured description, manufacturer and XML image. Website data may discover
an SKU and contribute public metadata, but never overrides current XML dealer
cost or stock. Website-only records have `UNKNOWN` stock and cannot generate
pricing or reach publish-review readiness without current XML commercial data.

The Scoop workspace accepts an approved CSV or JSON website capture through
preview and apply steps. Imports reject missing identity, duplicate SKUs and
malformed URLs, then record a batch and timestamps. Repeated observations are
idempotent. If a website-only SKU later appears in XML, the same canonical
record upgrades to `BOTH` without remapping or duplicating its internal product.

Safe direct-discovery providers stop on HTTP 403, Cloudflare challenges or bot
protection. TekCentral does not bypass protection, automate dealer login,
imitate authenticated sessions or use private/undocumented catalogue endpoints.

## Confirmed Catalogue Feed

Phase 9A uses Scoop's published dealer price-list feed for backend-only catalogue
ingestion:

- Price-list information: `https://scoop.co.za/information/become-a-dealer/price-list/`
- Primary XML feed: `https://scoop.co.za/scoop_pricelist.xml`
- Available CSV feed: `https://scoop.co.za/scoop_pricelist.csv`
- Order tracking information: `https://scoop.co.za/information/become-a-dealer/track-your-order/`

The XML feed is the Phase 9A source. The CSV feed is documented but is not used
as a fallback unless XML ingestion fails and a later phase explicitly approves
that change.

The feed fields normalized by TekCentral are:

- `SKU`: stable Scoop offer identity
- `Description`: supplier product description
- `CPT`, `JHB`, `DBN`: branch stock quantities
- `Total Stock`: combined stock quantity
- `Dealer Price`: dealer cost excluding VAT
- `Retail Price`: recommended retail price including VAT
- `Manufacturer`: supplier manufacturer value
- `Image URL`: supplier image reference

Live production XML verification confirmed this structure:

- root element: `products`
- repeated item element: `product`
- child tags: `sku`, `description`, `cpt`, `jhb`, `dbn`,
  `total_stock`, `dealer_price`, `retail_price`, `manufacturer`, `image_url`
- field values are wrapped in CDATA
- no XML namespace is currently present

The parser treats these observations as source metadata rather than requiring a
hard-coded root/item name. This retains compatibility if Scoop adds a wrapper
while preserving the documented product field aliases.

TekCentral preserves the dealer price excluding VAT and the retail price
including VAT as separate values. A dealer-price including-VAT value may be
derived at the South African 15% VAT rate for internal comparison only. Feed
prices do not automatically alter customer-facing selling prices.

Stock is normalized as follows:

- positive `Total Stock`: `AVAILABLE`
- explicit zero `Total Stock`: `OUT_OF_STOCK`
- missing or unparseable stock: `UNKNOWN`
- an offer absent from a later successful feed: `STALE`

Branch values remain available independently so zero stock is not confused
with missing stock data.

## Sync And Persistence

Staff run a manual catalogue sync from `/admin/suppliers/scoop`. The backend
downloads the XML feed, normalizes records by Scoop SKU and persists them in
`.data/supplier-catalogue-scoop.json`. Repeated syncs update existing offers
without creating duplicate SKUs; records missing from a later successful sync
are retained and marked stale.

Normalized records produce internal `SupplierOffer` values and can be selected
for staff-reviewed product mapping. They remain separate from the public
TekCentral product catalogue.

## Product Logistics Enrichment

Scoop's XML feed does not contain shipping weight or dimensions. Backend
enrichment first resolves exact manufacturer/model identity through a registered
manufacturer provider, then falls back to an exact Scoop public product page.
Scoop access challenges are recorded and never bypassed.

Normalized logistics metadata is stored on the Scoop catalogue product and its
internal SupplierOffer metadata:

- weight in grams and derived actual weight in kilograms
- length, width and height in millimetres
- derived cubic volume in cubic metres
- raw source values, canonical page URL and fetch timestamp
- `COMPLETE`, `WEIGHT_ONLY`, `DIMENSIONS_ONLY`, `MISSING` or `INVALID` quality state
- product-page resolution state: `RESOLVED`, `NOT_FOUND`, `AMBIGUOUS` or `ERROR`

The action at `/admin/suppliers/scoop` processes at most 25 products per run and
supports missing-only, selected-for-launch, verified-mapping and
manufacturer-filtered batches. Selected launch products, verified mappings and
approved pricing are prioritized in that order. Successful
physical specifications are cached for 30 days; a forced staff retry is still
available. A later request failure records a structured reason but does not
delete a previous valid logistics snapshot.

No courier tariff or fulfilment branch is inferred from these fields. When
staff explicitly enable TekCentral's supplier-neutral `ZONE_ESTIMATE` policy,
the effective weight and dimensions become authoritative inputs to the
configured local estimator. The resulting customer charge is a TekCentral
estimate, not Scoop's freight charge. Direct automated page retrieval may be rejected by Scoop's Cloudflare
access challenge; this is recorded as an enrichment error and is not bypassed.

### Provenance And Overrides

Logistics values are retained as separate source records. Supported sources are
`ADMIN`, `ADMIN_IMPORT`, `SUPPLIER_FEED`, `MANUFACTURER`,
`SUPPLIER_PRODUCT_PAGE` and `UNKNOWN`.
The deterministic effective-source priority is:

1. admin override
2. admin CSV import
3. structured supplier feed
4. manufacturer source
5. Scoop product page
6. unknown source

An admin override is explicit, validated and audited by SKU, changed fields,
previous/new values, timestamp and staff actor placeholder. Weight may be entered
in grams or kilograms and dimensions in millimetres. Weight-only and complete
three-axis-dimension records are allowed; partial dimensions, zero/negative
values and values beyond validation limits are rejected.

Automatic enrichment writes separate manufacturer or product-page observations
and cannot replace an admin override. Clearing the admin record exposes the next
valid source without deleting it. Feed synchronization preserves all source
records.

## Scalable Logistics Acquisition

The Scoop workspace supports a two-step CSV import using the exact header:

`sku,weight_grams,length_mm,width_mm,height_mm`

Preview performs strict Scoop-SKU matching and rejects unknown SKUs, duplicate
rows, invalid numbers, non-positive measurements and partial three-axis
dimensions without writing data. Apply requires the preview fingerprint to
match the unchanged CSV and rejects the entire import while any row is invalid.
Applied records use `ADMIN_IMPORT`, retain a generated batch reference and audit
actor, and are idempotent when measurements have not changed. Hand-entered
`ADMIN` records remain higher priority.

Staff can export a missing-data template containing SKU, description,
manufacturer and the logistics columns. Supplier costs are excluded.

Manufacturer acquisition uses supplier-neutral provider contracts with
`supportsManufacturer`, `resolveIdentity`, `fetchLogistics`, `verifyIdentity`
and `normalizeLogistics` boundaries. Exact SKU, manufacturer and a known model
alias must agree. Only `HIGH` identity confidence auto-applies; weaker matches
remain review candidates.

The initial official-source records include:

- Ubiquiti `ACB-ISP`, model `ACB-ISP`, using the canonical Ubiquiti technical
  specification page
- Cudy `CD-GS105P`, model `GS105P 1.0`, using the canonical Cudy product page
- Ubiquiti `AF-11`, MikroTik `RB-260GS` and Fanvil `FAN-V50G`, using official
  specification documents. Fanvil remains partial because the official source
  does not provide a defensible per-device weight.
- Ubiquiti `U7-LR` and `UPOE48-30W` using exact official Ubiquiti technical
  specifications. Cudy `CD-WR1200` remains a review candidate because Scoop
  does not identify the hardware revision and official revisions differ.

Package measurements are stored separately from product measurements. Complete
official package data is preferred for shipping; otherwise product measurements
are explicitly marked `PRODUCT_DIMENSIONS_FALLBACK`. There is no generic
manufacturer scraper. Unsupported or mismatched identities remain missing with
structured failure reasons. Operational
coverage emphasizes verified mappings, verified in-stock mappings and complete
shipping-ready mapped offers rather than implying the entire feed is ready.

Launch-focused runs are bounded to selected, verified, logistics-incomplete
offers (maximum 25). They return per-SKU identity, evidence attempted, source,
confidence, product/package measurements, shipping basis, quality state,
failure reason, pricing outcome and next action. Completion reuses the existing
pricing proposal service and never auto-approves a proposal. Revision-specific
measurements are not applied when the exact hardware revision is unresolved;
`CD-WR1200` remains mapped and reports `HARDWARE_REVISION_REQUIRED` until an
authoritative Scoop capture or manufacturer label confirms its revision.
Manual page capture or an admin override remains an explicit staff exception
when authoritative automatic data cannot complete the record.

### Scoop Product-Page Logistics

The Scoop workspace can ingest physical specifications from an exact public
Scoop product page without changing XML-backed dealer cost, retail price, stock,
branch stock or commercial description. Automatic application requires a
canonical `scoop.co.za` URL and `HIGH` identity confidence. Successful page
observations use `SUPPLIER_PRODUCT_PAGE`, retain the source URL, capture time,
content fingerprint and extraction confidence, and are cached for 30 days.

Retrieval uses a normal public request only. HTTP 403, challenge pages and rate
limits are recorded as structured failures and are never bypassed. Staff may
paste an approved public-page HTML or text capture, preview the parsed identity,
product/package/component measurements and shipping basis, then explicitly
apply it. Reapplying identical content is idempotent.

Product and package measurements remain independent. A complete authoritative
package observation supplies the shipping basis; otherwise a complete product
observation is marked `PRODUCT_DIMENSIONS_FALLBACK`. Kit component measurements
are retained separately and are never combined into a fabricated carton.
Manufacturer and Scoop-page observations coexist, and an `ADMIN` override stays
highest priority. Targeted page-ingestion batches use the existing launch,
mapping, missing-logistics and manufacturer scopes, process at most 25 SKUs, and
never crawl the full catalogue by default.

### Launch Logistics Evidence Queue

`Scoop → Logistics exceptions` is the staff queue for selected, verified offers
whose effective logistics state is incomplete. It shows the exact stored
failure and keeps source capture on the same screen. Staff may paste text or
relevant HTML from the exact Scoop product page, an official manufacturer page
or datasheet, or an approved internal capture. Retailer evidence is rejected.

Analyze is read-only. It verifies exact identity, previews product and package
measurements separately, reports remaining evidence, and flags conflicts with
an existing authoritative observation. Apply requires high identity confidence
and explicit conflict confirmation. Identical fingerprints remain idempotent.
An exact Scoop capture is also passed through canonical URL reconciliation and
its normalized content specifications/documents are retained as reviewable
publication suggestions; the raw page is not retained and nothing is published
automatically.

`CD-WR1200` accepts revision evidence separately from measurements. Confirming
the revision retains the verified product mapping and re-runs the existing
manufacturer provider; revision-specific values remain blocked until that
confirmation. Manual `ADMIN` measurements remain a last-resort exception and
must retain an evidence reference and staff rationale in the audit trail.

After evidence application, effective logistics, pricing proposal availability,
launch readiness and the primary next action are recalculated. Complete offers
leave the exception queue; pending pricing remains a staff `Review pricing`
decision and blocking pricing warnings are preserved.

### Canonical Scoop Product URLs

`productPageResolution.productPageUrl` is the exact public Scoop product page
for one canonical `SCOOP:<sku>` offer. Its metadata records `VERIFIED`,
`REVIEW_REQUIRED`, `UNKNOWN` or `CONFLICT`, the URL source, identity confidence,
verification/check timestamps and prior URL history. Manufacturer, image, feed,
procurement and catalogue landing-page URLs are not canonical product URLs.

Authority order is: a previously verified URL, an exact trusted Phase 9E website
observation, a trusted SKU-to-URL import, an exact staff URL verified from page
content, then safe exact discovery. Automatic persistence requires `HIGH`
identity confidence. Conflicting URLs for one SKU, or one URL claimed by
multiple SKUs, are not applied silently.

Website imports run an idempotent canonical-URL backfill. Separate URL-mapping
CSV/JSON imports provide `ADD`, `KEEP`, `CHANGE_REVIEW`, `CONFLICT` and `REJECT`
preview actions before safe mappings are applied. URL identity and fetch
accessibility are independent: a verified URL remains verified when Scoop
returns HTTP 403, while logistics ingestion records `SOURCE_BLOCKED`. Staff can
open that public page and use the existing page-capture preview/apply workflow.
No cookies, sessions, credentials or Cloudflare bypass are used.

## Managed Launch Cohort

Launch Readiness is not a second catalogue. It contains only verified mappings
with an internal TekCentral product that are explicitly selected for launch, or
published/unpublished products already inside the managed publication lifecycle.
Unmapped and unselected candidates remain in Catalogue until staff explicitly
select them.

Readiness and publication are displayed independently. A ready first launch is
sent to publish review; a clean published product links to the storefront; a
published product with draft changes links to change review; and an unpublished
historical product links to republish review. Publication never occurs
automatically.

Pricing presentation is derived from the active immutable public version and the
newest active proposal: pending proposals need approval, approved non-live prices
await publication, matching approved/public prices are live, and differing
approved prices remain pending publication.

### Product Workflow Guidance

Scoop product operations use one derived workflow sequence: match or create the
internal product, verify mapping, complete logistics, approve pricing, explicitly
select for launch, review publication, then publish. Catalogue rows, the selected
product workspace and Launch Readiness use the same primary next action. Launch
selection and publication always remain explicit staff actions.

The selected workspace presents mapping, logistics, pricing, launch selection
and publication consistently. Exact-SKU searches in Launch Readiness can explain
that an otherwise complete product is excluded because it is not selected, and
can select it without losing SKU context. Published products lead to their
storefront instead of repeating first-publication actions.

Canonical Scoop URL verification requires the exact observed page SKU. A trusted
import without page identity remains review-required; a different observed SKU
is a conflict. Quarantining an incorrect URL preserves URL history and valid
manufacturer logistics while removing any supplier-page logistics observation
that came from the mismatched product.

## Mapping And Pricing Preparation

The Scoop workspace supports search by SKU, description and manufacturer,
mapping-state filters and explicit `SUGGESTED`, `VERIFIED` and `REJECTED`
mapping actions. Suggestions based on SKU, manufacturer and normalized product
terms are advisory only. Staff verification is always required.

A mapping preserves the Scoop SKU, `SCOOP:<sku>` SupplierOffer identity and the
TekCentral product ID. Temporary zero stock does not affect mapping status. If
an offer disappears from a later feed, the offer is shown as stale while its
verified mapping identity is retained; the current offer state is restored if
the same SKU returns.

Internal pricing preparation exposes supplier cost excluding VAT, VAT amount,
supplier cost including VAT and Scoop's VAT-inclusive reference retail price.
The workspace also displays reference retail spread against both excluding-VAT
and including-VAT supplier cost. These calculations do not set or update a
TekCentral storefront price.

For future pricing rules, markup and gross margin are distinct:

- markup percentage divides profit by cost
- gross margin percentage divides profit by selling price

Pricing proposals preserve the target-margin result and, when that result is
above Scoop's retail reference, a separate reference-price viability scenario.
Neither scenario updates the storefront automatically.

## Launch Assortment Readiness

The Scoop workspace keeps launch assortment state separate from supplier-product
mapping. Each offer is `NOT_SELECTED`, an advisory `CANDIDATE`, or explicitly
`SELECTED_FOR_LAUNCH`. Candidate generation is capped at 50 and considers only
current in-stock feed records with a recognized TekCentral taxonomy term,
manufacturer, image, and valid dealer and retail pricing. Suggestions never
create or verify mappings and never select or publish products.

`READY_FOR_PUBLISH_REVIEW` is an internal review state, not publication. It
requires explicit launch selection, a staff-verified mapping, complete logistics
metadata, current stock, an approved pricing proposal, and no blocking pricing
warning. Missing requirements remain `NOT_READY` with a specific next action.
Reference-retail and target-margin warnings remain advisory when minimum profit
is protected. Explicit `BLOCKING` warnings, including minimum-profit, stale-cost,
required FX and invalid-band failures, prevent readiness.

The Launch Readiness view combines these states while retaining Scoop SKU as the
stable supplier identity. Supplier cost and offer identity remain internal. No
readiness action writes to the storefront or creates a supplier order.

The selected-cohort completion view includes every explicitly selected offer,
including unmapped offers. It derives one completion state, exact blockers and
one primary next action from the shared workflow. Public-content eligibility is
checked after source readiness; a missing controlled image or other required
public field remains a staff-review blocker. Canonical Scoop URL status stays
visible as provenance, but an unresolved or conflicting URL does not block a
product whose authoritative logistics and all other publication checks pass.

The current controlled assortment has eleven selected offers. `ACB-ISP` remains
published at R840 and `AF-11` is ready for publish review with its exact Scoop
feed image ingested and manufacturer logistics retained. The other nine offers
remain blocked at mapping until staff matches or creates the exact internal
product: `CC-W6`, `CD-WR1200`, `FB-T1`, `FF-SCLC-S1A`, `RG-ES228GP`, `T50R`,
`TERM-JACK`, `U7-LR`, and `UPOE48-30W`. No equivalence is inferred; in
particular, `CD-WR1200` still requires exact hardware-revision confirmation.

## Product Content Enrichment

Exact Scoop product-page captures can produce a review-only content preview for
overview copy, structured technical specifications and trusted documents. The
preview requires the page SKU to match the mapped Scoop SKU. Pricing, reviews,
ratings, related-product content and package measurements are excluded from
public content.

Staff content has priority over approved source-derived content, which has
priority over automatic fallback copy. Safe additions can be applied to the
publication draft, but same-label value disagreements remain visible for staff
review and no refresh overwrites a staff-edited overview. Manufacturer or exact
Scoop product measurements may be represented as public dimensions and weight;
package measurements remain internal shipping data.

Content status is derived as `CONTENT_MISSING`, `CONTENT_BASIC`,
`CONTENT_ENRICHED` or `CONTENT_REVIEW_REQUIRED`. Specifications and documents
improve content quality but are not universally required for first publication.
Accepted overview, specifications, documents and provenance become public only
when staff explicitly publishes a new immutable version. Scoop reviews are not
imported and the storefront does not render an empty reviews section.

## Mapping Quality And Product Creation

Scoop mapping suggestions carry `HIGH`, `MEDIUM` or `LOW` confidence with
identity evidence. Exact SKU/model and manufacturer evidence rank above product
type and normalized title overlap. Generic words such as network, wireless,
bracket and switch cannot produce high confidence alone. Confidence never
auto-verifies a mapping. A low-confidence mapping requires an additional staff
confirmation that both records are the same physical product.

When no exact internal product exists, staff may open a creation review from the
selected Scoop offer. The review uses only feed-backed manufacturer, SKU,
description, image, stock and reference-price data. It provides editable title
suggestions, normalizes Wi-Fi spelling, avoids TekCentral private-label naming,
and requires confirmation of an existing TekCentral category. No category or
unsupported specification is invented.

Confirmed products are stored as `INTERNAL_DRAFT` and are not added to the
public storefront catalogue. Internal provenance records Scoop, the exact
`SCOOP:<sku>` SupplierOffer, source description, manufacturer and original image
URL/capture time. A valid Scoop image is retained by reference; a missing image
remains missing. The provenance shape permits later media mirroring without
bulk downloading now.

Creation also records a staff-verified mapping to the exact Scoop SKU. This
clears only the mapping blocker; logistics, pricing, stock and explicit launch
selection remain independently enforced before publish review.

Phase 9A does not submit orders, send supplier email, automate a portal, expose
supplier costs publicly or schedule background feed jobs.

## Pending Confirmation

- API access beyond the public price-list feed
- Automated ordering
- Direct fulfilment
- Dropshipping and blind shipping
- Reseller discounts and credit account terms
- Shipping arrangements
# Product Content Drafts

Publication maintenance keeps browser editor state, the backend-persisted saved draft, and the immutable active storefront version separate. `Save draft` never changes the storefront. Draft preview renders the saved candidate; publishing creates a new active version from that candidate. Uploaded or trusted-imported PDFs are content-addressed TekCentral assets and remain draft-only until publication.
# Catalogue workflow boundaries

- The Scoop XML feed remains authoritative for supplier stock, dealer cost, and offer freshness. Product publication and Product-page verification never make an absent XML offer fresh.
- `Generate proposal` requires an exact verified mapping, a canonical TekCentral Product, and an active current XML dealer-cost observation. It creates or reuses a pending proposal only; it does not verify mappings, approve pricing, publish, or create a Product version.
- Product-page enrichment accepts only public HTTPS `scoop.co.za` Product URLs. Account, login, checkout, cart, session, token, and customer URLs are rejected; backend fetches never reuse browser cookies.
- Public-page fetches use an eight-second timeout, a 2 MiB response limit, bounded redirects with host revalidation, and normalized diagnostics. Raw fetched HTML is never rendered.
- Exact page SKU identity is required before specifications, documents, or logistics evidence can be accepted. The common labelled More Information table is normalized without replacing curated public Product copy.
- Manual logistics remains effective until staff explicitly accepts verified authoritative extraction. Failed, incomplete, or mismatched extraction does not overwrite it.
# Catalogue enrichment

Scoop category and Product evidence uses the shared canonical suggestion service. Suggestions are advisory and staff-overridable. Supplier image URLs remain private candidates until controlled Product-media ingestion.

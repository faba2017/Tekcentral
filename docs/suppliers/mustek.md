# Mustek supplier evidence

Mustek is registered through the central Supplier Hub and is the first adopter of the PostgreSQL-authoritative Supplier Source Registry. H.5A stores private source configuration, immutable source versions, sync runs, and normalized supplier evidence. It does not create canonical Products, mappings, customer prices, publications, promotions, or supplier orders.

## Sources

The owner-provided Google Sheet is normalized into a deterministic one-time/idempotent bootstrap manifest. Google Sheets is not a runtime dependency; PostgreSQL source records are authoritative after initialization.

- `PRICE_LIST`: Mustek commercial authority, normally XLSX.
- `HTML_CATALOGUE`: supplementary content/media evidence for one explicitly configured page.
- `MARKETING_ASSET`: private brochure evidence with `REVIEW_REQUIRED` reuse eligibility.

Incentives are deliberately excluded. No incentive workflow, promotion, or customer output is created.

## Security and synchronization

Retrieval accepts HTTPS URLs on `shop.mustek.co.za` only. Initial URLs and redirects are revalidated. DNS resolutions to loopback/private/link-local ranges, credentials, and custom ports are rejected. Downloads have timeout and size bounds, MIME is checked, and XLSX files must be valid ZIP/OpenXML containers. Bytes use private object storage.

Checks use `HEAD` opportunistically and safe `GET` fallback. ETag, Last-Modified, length, and SHA-256 are recorded. Metadata changes with identical bytes do not re-import. A changed hash creates an immutable version and idempotent evidence rows. Failed runs retain prior evidence and raise an H.1 alert. PostgreSQL prevents concurrent unfinished runs for a source.

Bootstrap records are `DISABLED`. Authorized staff may add disabled sources; only a Super Admin may activate/prefer a source after confirmation. Important changes create H.2 audit records. Sources are disabled or archived, not hard deleted.

## Workbook parsing and provenance

OpenXML workbook tabs are discovered dynamically. The parser inspects each sheet for deterministic SKU/part-number and description headers plus optional dealer price, web link, and stock fields. Unsupported sheets are recorded as ignored rather than guessed.

## Procurement

Mustek has an accepted manual procurement path and no procurement API. A valid verified Mustek offer may pass supplier-neutral publication and purchase gates when its normal Product, commercial-evidence and availability requirements pass. After payment, staff use the canonical SupplierOrder workflow, approve procurement, place the order through the approved external channel and record a bounded Mustek reference. The shared transition enforces permission, authenticated H.2 attribution, exclusivity and duplicate prevention; supplier operational detail remains internal.

Evidence preserves source/version, workbook, worksheet, row, Mustek SKU, description/brand, dealer cost, currency, tax basis, stock evidence, content URL, observation time, and fingerprint. Duplicate rows retain row provenance. Cross-source SKU collisions are review conditions; no last-import-wins merge is used.

Dealer cost stays private and is not a TekCentral selling price. Manufacturer links may enrich content later but are not Mustek commercial truth. Marketing evidence is never automatically public.

H.5B consumes this evidence through the normalized private SupplierOffer layer and canonical Product onboarding. TVR uploads/downloads can reuse the same purpose/transport/format model. Existing Scoop, Syntech, CJ, and Manual TekCentral configs are not migrated in H.5A.
# Normalized SupplierOffer foundation (H.5B.1)

H.5A source versions and evidence remain immutable input. H.5B.1 groups only the current evidence from active Mustek price-list sources by a defensible normalized supplier SKU and upserts private supplier offers using identity `MUSTEK:<normalized SKU>`.

Offer facts are classified as `SAFE`, `REVIEW_REQUIRED`, `CONFLICT`, or `MISSING_COMMERCIAL_DATA`. Conflicting rows are aggregated and retained; row order and “last row wins” are never used. The normalized fingerprint covers SKU, unambiguous description/brand/cost/currency, `UNKNOWN` tax basis, classification and reasons. It deliberately excludes source version IDs, evidence IDs, row order and timestamps, preventing catalogue churn when unchanged facts arrive in a new immutable source version.

The offer payload contains references to contributing source, source-version, fingerprint and evidence IDs plus workbook, worksheet and row context. It does not duplicate raw files or expose private object keys.

Mustek onboarding uses the shared `FEED` evidence type and the canonical 12-step Product workflow. Offers remain unlinked unless staff uses the existing mapping workflow. No mapping is automatically verified and no Product is automatically created.

Current Mustek commercial restrictions:

- tax basis remains `UNKNOWN`; no pricing proposal or margin calculation is permitted;
- stock authority has not been established; availability remains `UNKNOWN`;
- MSI HTML is retained as non-commercial source evidence and emits no priced offer in this slice;
- private marketing assets remain review-required evidence and are not attached to Products;
- normalization does not publish Products, create supplier orders, or activate sources.

## Shared Product mapping and H.4 handoff (H.5B.2)

Mustek exposes normalized offers in the shared Supplier Product table. Candidate matching uses the supplier-neutral Product intelligence service and is advisory only. Staff with mapping authority may prepare a `SUGGESTED` mapping and then explicitly verify or reject it through the canonical mapping state machine. Staff with Product-creation authority may explicitly create an internal canonical Product from reviewed source identity evidence; that Product then opens in the same 12-step Product Configuration Workspace used by every supplier.

The H.4 source step identifies Mustek as `FEED` evidence and retains offer classification, provenance count, freshness, and review warnings. A verified mapping satisfies only the mapping step. It does not resolve conflicting commercial facts or complete taxonomy, content, media, logistics, pricing, launch, preview, or publication work.

Mustek tax basis remains `UNKNOWN` and Mustek stock remains non-authoritative. Mapping therefore creates no pricing proposal, contributes no canonical availability, and does not publish a Product. Brother ambiguity remains review-required. MSI catalogue content and private marketing media remain deferred.

The accepted source evidence contains 421 distinct raw SKU strings but 420 canonical normalized SKU identities. `TN-3607XXL` and `Tn-3607XXL` differ only by case and intentionally reconcile to the single identity `TN-3607XXL`; both observations and row provenance remain attached. No evidence row is discarded and no additional offer is manufactured.
## MSI immutable non-commercial evidence

H.5B.3A parses the privately stored immutable `MSI Notebooks Dealer Catalogue November 2026` HTML source without executing supplier scripts or fetching additional URLs. The broad H.5A `structuredProductMarkers` value is diagnostic HTML metadata only; it is not a Product count. The current immutable source contains 19 actual records in its literal `products[]` data and 19 unique normalized MSI SKUs.

Normalized MSI evidence preserves source-backed category, series, summary, notes, tag, explicit specification values, immutable source/version provenance and private embedded-image fingerprints. The HTML display price is marked non-authoritative and is not dealer cost, tax evidence, a pricing proposal input or a storefront price. Source category remains advisory and does not change canonical taxonomy.

Embedded images remain private evidence references. H.5B.3A does not copy them into public Product media, associate evidence with Products, create SupplierOffers or mappings, or contribute pricing or availability. The current MSI records have no exact match in the accepted Mustek SupplierOffer catalogue and therefore have no canonical Product associations.

Logical identity fingerprints hash the normalized supplier, source kind and MSI SKU. Evidence fingerprints hash normalized source facts, including sorted summary/specification facts and private image content metadata, while excluding source-version IDs, retrieval times and processing timestamps. The same facts in a later immutable source version therefore retain their logical evidence identity; changed facts produce a changed evidence fingerprint.

## Shared content and specification enrichment (H.5B.3B)

MSI content can reach the shared H.4.3C recommendation path only through an exact normalized MSI SKU, the exact Mustek SupplierOffer, and a `VERIFIED` mapping to the canonical Product. Unlinked, suggested, rejected, ambiguous, fuzzy, brand-only and title-only associations produce no Product recommendations. The current development evidence still has zero exact MSI offer matches and therefore zero live MSI Product associations or recommendations.

The narrow Mustek adapter sends source-backed series, summary, notes, tag and structured specifications through `buildSupplierProductEnrichment()` and the existing Step 5 content intelligence. Category remains advisory and cannot alter taxonomy. The HTML display price remains non-authoritative and never enters cost, VAT, margin, pricing proposal or storefront pricing. Recommendations are derived at read time and cannot overwrite canonical staff content; accepted values become durable only after the existing publication draft save. Ignore state remains local and non-durable.

Recommendation freshness is supplied from immutable source-version identity: evidence matching the active source ID, version ID and fingerprint is current; a different known version is stale; missing current-version context is unknown. No Mustek-only age threshold or processing-time reset is used.

## Controlled private media workflow (H.5B.3C)

An exact MSI SKU, exact Mustek SupplierOffer and `VERIFIED` Product mapping may expose the embedded private image as a review-required Step 6 candidate. Candidate metadata contains an opaque deterministic ID, MIME type, byte size and immutable content fingerprint; it never contains the private object key, source URL, signed URL or embedded bytes. The current development catalogue still has zero live exact MSI associations, so it produces zero live candidates and performs no migration.

Authorized staff must explicitly choose **Ingest controlled copy**. The server then resolves the candidate again from current canonical mapping and immutable source evidence, reads private bytes server-side, verifies the source-version and image fingerprints, validates MIME/signature/size, deduplicates by content hash and stores a controlled public Product asset. Only that controlled copy can enter the canonical gallery and publication draft. Missing, stale, changed, invalid or oversized evidence fails closed and creates no public asset. Reject remains a local review convenience and does not mutate immutable supplier evidence.

The route requires both Product media management and supplier read authority. Successful ingestion and later primary-image selection use authenticated staff identity in H.2 audit records. The workflow does not create Products or mappings, infer associations, update prices or availability, publish Products, expose private evidence publicly, or make supplier network requests.

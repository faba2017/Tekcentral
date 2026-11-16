# TVR supplier integration

## TVR-B implemented scope

TVR is registered through the central supplier registry and uses the shared Supplier Hub workspace. TVR does not add a supplier-specific global Admin navigation item.

Two independent sources are registered:

- `TVR_COMMERCIAL_WORKBOOK`: the public Google Sheets XLSX export, with commercial and stock evidence authority.
- `TVR_PUBLIC_CATALOGUE`: the public TVR shop, acquired through its bounded read-only WooCommerce Store API for future content and specification enrichment.

Both sources are seeded disabled. Staff activation remains an explicit protected source-management action; no seed or deployment silently activates either source.

## Acquisition and evidence

The workbook downloader accepts HTTPS `docs.google.com` as the initial host and an HTTPS `googleusercontent.com` subdomain only as a validated redirect target. Every redirect is bounded and revalidated, DNS results are checked for private/internal addresses, and response time, size, MIME type and XLSX structure are bounded. No Google account, cookies or OAuth credentials are used.

Accepted raw workbook bytes are stored as private supplier evidence. The raw SHA-256 is retained as integrity metadata, but it is not source-version identity because Google may regenerate non-semantic package bytes.

Version identity is the SHA-256 of a deterministic logical workbook representation containing exact sheet names and order (including trailing spaces), cell coordinates, logical types and values, formulas, spreadsheet errors, and normalized used-cell structure. ZIP metadata, package timestamps, relationship serialization and visual styles are excluded.

Each version records per-tab logical fingerprints and used-row, used-column, non-empty-cell, non-empty-row, formula and error counts. Logically unchanged exports produce `UNCHANGED` and do not create another immutable version.

## TVR-C semantic evidence

TVR-C interprets each accepted immutable workbook version after acquisition. It uses explicit heterogeneous profiles rather than one global header: common B-E commercial sheets, headerless CPU/MSI/Notebooks sheets with retained semantic uncertainty, TCL B-D rows, condition-aware Remanufactured B-D rows, and Kelon B-G rows with a composite indoor/outdoor model identity. Exact worksheet identity—including trailing spaces—is retained.

Rows are deterministically classified as Product, section, note, empty, invalid, or review-required before Product evidence is persisted. Repeated identities are then classified as duplicate-same-fact or conflicting-facts without discarding source rows. Cross-condition identity collisions are related but remain separate `NEW`, `CLEARANCE`, and `REMANUFACTURED` evidence. SKU/model comparison uses NFKC normalization, outer trimming, collapsed internal whitespace, case-insensitive comparison, and preserved punctuation.

Price evidence retains its raw value, numeric amount and source label. The approved TVR commercial contract establishes all workbook prices as ZAR dealer/reseller purchase cost: `Price Excl` is VAT-exclusive, while `Price` and `Refurb Price` are VAT-inclusive. Inclusive costs are converted with TekCentral's configured canonical VAT rate. Qualitative stock is normalized without inventing quantity: `In Stock` is available, `Low Stock` is low stock, `No stock` is out of stock, and absent or unsupported values remain unknown.

Commercial notes remain private evidence: the Menu daily/E&OE/account-manager warning, Adata price-volatility warning, clearance `NO_WARRANTY`, remanufactured `3_MONTH_WARRANTY` and `NO_ACCESSORIES`, and television-section customer TV-licence evidence. These notes are advisory and do not by themselves block pricing or availability. Parser reports and notes are attached to source-run metadata, while Product evidence rows retain immutable source version, exact tab/row/cell provenance and a semantic fingerprint. Reprocessing the same source version is a no-churn idempotent operation; a mismatch is rejected rather than rewriting historical evidence. Parser failures raise an H.1 supplier-source alert and retain the raw snapshot and previous evidence.

Status: `TVR-H1 ACCEPTED — BUSINESS COMMERCIAL SEMANTICS CONFIRMED`. The operational interpretations above were supplied by the TekCentral business owner; they are normalized business authority and are not represented as wording that appeared in the immutable workbook.

The accepted source version unexpectedly contains Product rows in `Genius ` and `Samsung ` despite the earlier audit describing them as empty. TVR-C follows the immutable workbook as source truth; truly empty valid sheets remain accepted with zero Product evidence.

## TVR-D condition-aware supplier offers

TVR-D promotes the current immutable semantic evidence into the shared `catalogue_supplier_offers` catalogue. Offer identity is condition-aware (`TVR:<condition>:<normalized identifier>`), while the staff UI continues to display the real workbook identifier. Kelon indoor/outdoor composite identity remains intact. `NEW`, `CLEARANCE`, and `REMANUFACTURED` observations with the same identifier are separate offers, not conflicting duplicates.

Exact duplicate facts collapse to one offer with all provenance. Conflicting descriptions or commercial facts produce one `CONFLICT` offer containing sorted alternatives; no winner is selected. Numeric price evidence remains private and retains unknown tax/currency authority unless the workbook explicitly supplies currency. Qualitative stock remains private supplier evidence without inferred quantities and never becomes canonical availability.

Promotion is deterministic and idempotent. Its fact fingerprint excludes evidence IDs, source versions, worksheet rows, timestamps, and provenance ordering. Existing Product links and mapping fields are preserved on upsert, disappeared identities are retained with a non-current lifecycle state, and failures retain the previous catalogue while raising the canonical supplier-source operational alert.

The shared Supplier Products workspace provides server-paginated search plus condition and review-state filters. Cost and private stock remain protected by `suppliers.view_cost` and `suppliers.view_private_stock`; promotion requires `suppliers.refresh`.

## TVR-E shared Product mapping

TVR uses the canonical supplier Product intelligence, mapping repository, explicit Product creation service and 12-step Product Configuration Workspace. Candidate lookup is read-only, mapping remains `SUGGESTED` until explicit staff verification, and only a `VERIFIED` mapping completes Product Configuration Step 2.

The condition-qualified offer identity (`NEW`, `CLEARANCE`, or `REMANUFACTURED`) keeps SupplierOffers, commercial evidence and warnings independent. Matching uses the preserved raw TVR model/SKU rather than treating the condition prefix as manufacturer identity. Multiple condition-specific offers may therefore map independently to the same canonical Product when staff can defend the underlying identity; condition never creates a duplicate Product by itself. Kelon matching and creation preserve both indoor and outdoor model identifiers.

When no defensible Product exists, staff with `products.create` may explicitly create one from source-backed identity and taxonomy selections. Creation also records the verified mapping and hands off to the same H.4 Product Configuration Workspace used by other suppliers. It does not infer missing identifiers, price, tax, stock, images, warranty, specifications or marketing content.

## TVR-F1 public catalogue acquisition

The canonical public catalogue acquisition endpoint is the unauthenticated read-only WooCommerce Store API at `/wp-json/wc/store/v1/products`. Numeric pagination is bounded to 100 pages and 10,000 Product records, with request timeout, response-size, repeated-page, no-progress and pagination-consistency guards. Only `www.tvr.co.za` and the exact Store API path are accepted; the noisier Product sitemap is not catalogue authority.

Each API Product becomes private website evidence with its exact website SKU and a conservative NFKC/trim/whitespace/case-folded comparison SKU. Punctuation and hyphens are preserved. The normalized index retains canonical URL, source-backed content, brand, categories, structured attributes, dimensions, weight, explicit document references and deferred image metadata. Price, currency, tax, stock and purchasability fields are discarded and cannot affect SupplierOffers, pricing or canonical availability.

The complete normalized index is sorted independently of API page order and receives a logical fingerprint derived from content/specification facts rather than raw response bytes or retrieval time. It is stored as one immutable private source version with Product-level fingerprints and source evidence rows. An unchanged second sync produces `UNCHANGED`; incomplete acquisition never replaces the last complete version.

Website-only Products remain private enrichment evidence and create no SupplierOffer, mapping or Product. F1 does not attach evidence to verified Products, generate Step 5 recommendations, create Step 6 media candidates, download images or documents, or change publication readiness. Those handoffs remain future phases.

## TVR-F2 exact-SKU enrichment

TVR website evidence reaches Product Configuration Step 5 only through the current immutable public-catalogue version, an exact normalized website SKU, the exact mapped TVR SupplierOffer, a `VERIFIED` mapping, and its canonical Product. Website matching uses the offer's preserved raw SKU; condition-qualified identities such as `NEW:910-001793` remain commercial keys rather than website identity.

Missing-SKU records, website-only records, sheet-only offers, non-verified mappings, and fuzzy/title similarity cannot create enrichment. Duplicate normalized website SKUs fail closed as ambiguous. Multiple condition-specific offers produce one logical recommendation set only when verified mappings bridge the same raw SKU to the same Product; all offer and mapping IDs remain in resolver provenance. Contradictory verified Product mappings are review-required and attach nothing.

The TVR adapter feeds `buildSupplierProductEnrichment()` and the shared content/specification intelligence already used by Product Configuration Step 5. Recommendations are read-time only: staff must explicitly Accept and Save through the canonical Product draft workflow. Website brand/category remain review or advisory evidence, while explicit attributes and source-backed dimensions/weight may be suggested as Product specifications without becoming taxonomy or logistics authority.

Freshness follows the current TVR public source version: current active evidence is `FRESH`, older or disabled evidence is `STALE`, and absent current context is `UNKNOWN`. Website prices, tax, stock, availability, and purchasability remain excluded. F2 exposes deferred website images as exact-SKU, verified-mapping-gated review candidates for the controlled TVR-G workflow; it does not download or attach them automatically.

The accepted real association is website SKU `910-001793` → offer `TVR:NEW:910-001793` → mapping `supplier-mapping-mw8edquf-1j169g` → Product `product-logitech-m90-wired-mouse`.

## TVR-G controlled website media

TVR website images become Step 6 review candidates only after the same current-source, exact-SKU and `VERIFIED` mapping checks used by F2. Candidate IDs are deterministic across the source version, exact website identity, image evidence and canonical Product. Missing or duplicate website identities fail closed and create no candidate.

Ingestion accepts an opaque candidate ID, then re-resolves current evidence and mapping server-side. The browser-provided image URL is never ingestion authority. Retrieval is restricted to HTTPS `www.tvr.co.za/wp-content/uploads/`, validates DNS and every bounded redirect against private-address and host rules, and enforces timeout, five-megabyte size, supported MIME and image magic-signature checks. Accepted bytes enter the existing TekCentral controlled Product media store and gallery; content hashes deduplicate repeated ingestion.

Staff require both Product media-management access and supplier read access. Ingestion records the authenticated staff actor through the canonical H.2 audit path. Candidate review does not change content, pricing, availability, publication or supplier-order state, and primary/gallery ordering remains an explicit shared Step 6 control.

## Explicit boundary

TVR-E permits controlled mappings and explicit canonical Product creation. TVR-F1 adds bounded private website-source acquisition and immutable index versioning. TVR-F2 adds exact-SKU, verified-mapping-gated read-time content/specification recommendations through shared Step 5. TVR-G adds staff-approved, server-revalidated controlled image ingestion through shared Step 6.

## TVR-H2 pricing and canonical availability

Only the active primary `TVR_COMMERCIAL_WORKBOOK` is commercial authority. The TVR website remains content/media evidence and cannot provide price, currency, tax, stock, orderability or canonical availability. A current exact TVR offer with a `VERIFIED` Product mapping may generate a normal approval-gated pricing proposal; this never silently changes a selling price. Conflicting or stale evidence fails closed.

Canonical availability uses the same verified exact offer and primary workbook evidence. `AVAILABLE`, `LOW_STOCK`, and `OUT_OF_STOCK` map to the shared supplier-neutral states; `UNKNOWN` remains unknown and no numeric quantity is inferred. Conflicting offers do not contribute. TV-licence wording is scoped to actual television sections as a customer requirement and does not block pricing or procurement. Clearance warranty and Remanufactured three-month/no-accessories terms remain advisory Product evidence. No automatic media ingestion, publication or supplier ordering is introduced.

## Procurement

TVR has an accepted manual procurement path and no procurement API. Valid verified offers use the same canonical staff-controlled SupplierOrder placement service as Scoop and Mustek. Staff approve the paid SupplierOrder, place it through the approved external channel and record a bounded external reference. Permission, authenticated H.2 attribution, exclusivity and duplicate protection remain shared; no TVR-specific ordering engine or customer-facing supplier detail is introduced.

## TVR-I final closure

Status: `TVR-I ACCEPTED — TVR SUPPLIER INTEGRATION COMPLETE`.

TVR-A through TVR-H2 and the final closure checks establish the complete supplier path from the two-source registry and immutable evidence through condition-aware SupplierOffers, verified canonical mappings, exact-SKU website enrichment, Product-bound controlled media, approval-gated pricing, and supplier-neutral availability. The commercial workbook remains the only pricing, stock, orderability, and availability authority; the public catalogue remains non-primary content, specification, document, and media evidence.

Publication readiness keeps source presence separate from purchase availability. A fresh canonical supplier contribution proves that a current source path exists whether its stock state is available, low stock, out of stock, or unknown. `SOURCE_NOT_AVAILABLE` is reserved for Products without a usable fresh canonical supplier contribution; stock and approval states retain their own canonical blockers. Product launch selection, media completion, pricing approval, preview, and publication remain explicit staff responsibilities and are not supplier-integration completion criteria.

Known source limitations remain fail-safe: three website records lack SKU, 22 normalized website-SKU groups are ambiguous, two commercial offer groups remain unresolved conflicts, and the workbook provides qualitative rather than numeric stock authority. These records do not gain fuzzy Product associations or unsafe pricing/availability authority.
## Shared Product logistics

Public catalogue weight and dimensions remain advisory Product specifications and are not automatically authoritative shipping evidence. Step 7 uses supplier-neutral staff evidence when no accepted logistics source exists.

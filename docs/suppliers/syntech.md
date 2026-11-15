# Syntech Distribution

## Syntech A scope

Syntech is registered as a first-class operational supplier through the central supplier registry. This phase ingests reseller JSON catalogue evidence only. It does not create TekCentral Products, pricing proposals, publications, supplier orders, tracking operations, or Buy Now integrations.

## Secure configuration

The backend reads `SYNTECH_ENABLED`, `SYNTECH_FULL_FEED_URL`, and `SYNTECH_UPDATE_FEED_URL`. Feed URLs are credentials: they are never returned by APIs, persisted in business settings, or exposed through `VITE_*` variables. Admin surfaces return configuration booleans only.

Optional settings are `SYNTECH_FEED_FORMAT`, `SYNTECH_FULL_SYNC_INTERVAL_HOURS`, and `SYNTECH_UPDATE_SYNC_INTERVAL_HOURS`. JSON is the supported format.

## Ingestion rules

- Supplier SKU is the stable identity.
- Full feeds validate the `syntechstock` envelope, declared count, parsed count, and unique SKUs before persistence or source-missing reconciliation.
- Update feeds change only fields present in each row and preserve full-feed content, images, categories, and dynamic attributes.
- Dealer and promotion prices remain excluding VAT; RRP remains an including-VAT reference only.
- Promotion price is effective only during the inclusive start/end date window.
- Cape Town, Johannesburg, and Durban stock remain separate and also contribute to a supplier-side total.
- A SKU absent from a valid complete full feed is retained and marked `SOURCE_MISSING`.
- Supplier HTML, image URLs, category paths, and arbitrary attributes remain private evidence and are not public storefront content.

## Operations

The scheduler checks the update feed hourly at minute 17 and the full feed daily at 01:37 UTC, subject to configured intervals. It starts only under `APP_ROLE=worker`. A process-local overlap guard is supplemented by the non-blocking PostgreSQL advisory lock `job:syntech-scheduler`, so concurrent worker replicas produce one logical provider action. Normal lock contention skips the tick without an incident. One worker replica remains the recommended initial deployment shape, but correctness does not depend on that recommendation. The request budget allows no more than five feed downloads per UTC hour, including tests and manual requests.

HTTP 429 blocks further attempts until the next UTC hour. HTTP 403 marks the account blocked and requires contact with the Syntech account manager; neither response is retried automatically.

Sync history and request-budget state are persisted in `.data/supplier-catalogue-syntech.json`. The Supplier Hub, Integrations settings, and System Health show sanitized configuration and health only.

## Syntech B product onboarding

Syntech catalogue rows remain private source evidence. Staff review source identity and category evidence, choose canonical TekCentral taxonomy, and either create a new internal Product or map the exact Syntech SKU to an existing Product. Mapping never overwrites an existing Product's content, taxonomy, controlled images, approved pricing, or publication.

Verified mappings preserve source identity, fingerprint, branch stock, dealer/RRP/promotion evidence, dynamic attributes, image candidates, and category paths. Merchandising labels are tags rather than taxonomy nodes. Pricing proposals use the shared engine and current ZAR effective dealer cost; RRP and recommended margin remain reference-only. Publication still requires verified mapping/taxonomy, controlled images, approved pricing, fresh availability, content review, and an explicit staff publish action.
## Syntech Reseller API procurement (Syntech C)

Syntech external procurement uses the canonical `SupplierOrder` workflow and is UAT-only. Server configuration is read from `SYNTECH_UAT_ORDER_WRITES_ENABLED`, `SYNTECH_UAT_BASE_URL`, `SYNTECH_UAT_USERNAME`, and `SYNTECH_UAT_CREDENTIAL`; the earlier `SYNTECH_RESELLER_API_ENABLED`, `SYNTECH_RESELLER_UAT_BASE_URL`, and `SYNTECH_RESELLER_UAT_TOKEN` names remain compatibility aliases. The documented `RESELLERTOKEN` credential remains server-only and neither credentials nor the private base URL are stored in order records or returned to the browser. The UAT URL must use HTTPS, the approved Syntech reseller host, and the exact UAT API base path. Production variables are reserved structurally, but production submission is rejected. Effective API procurement additionally requires the durable, revisioned `syntechApiProcurementEnabled` operational setting. The Admin switch cannot override deployment configuration or select production, and each change is authenticated, permission-protected and H.2 audited.

Controlled UAT acceptance uses `npm run backend:syntech-uat-fixture:test` with `SYNTECH_UAT_FIXTURE_DATABASE_URL` pointing at a migrated, isolated PostgreSQL database. The helper reads one current, in-stock, lowest-cost Syntech feed row from the configured development database and copies only that authoritative commercial snapshot into deterministic non-production Product, mapping, Order, and SupplierOrder records. It never uses real customer data. With `SYNTECH_UAT_ORDER_WRITES_ENABLED=false`, business preflight can report `READY_FOR_CONTROLLED_UAT` while `submissionBlockers` reports the disabled write gate; the create path rejects with `UAT_WRITES_DISABLED` before a durable claim, state transition, audit event, or network request. Recreate the isolated database before a controlled acceptance run rather than importing the fixture into `tekcentral_dev`.

Staff must run a fresh preflight after customer payment and supplier-order approval. Preflight requires a verified exact Syntech SKU mapping, fresh dealer-cost and branch-stock evidence, no operational hold, no conflicting active procurement quantity, a complete persisted delivery address or documented `cpt`/`jhb` collection selection, and no prior or unresolved external submission. References, SKUs, address fields and positive whole quantities are bounded server-side. `backorder` is always `no`. Approval finalizes the existing immutable ZAR cost basis; a changed source fingerprint requires refreshed evidence and re-approval. Customer selling prices and invoice snapshots are never rewritten by procurement revalidation.

The adapter posts `{ reference, backorder, shipping, lineitems }` to the UAT `/order/` endpoint. HTTP 200 is not sufficient: RC1-RC12 are normalized as confirmed business failures even when Syntech returns a non-2xx status, and a non-empty `salesorder` is required for success. A PostgreSQL row-locked claim persists `SUBMITTING` and the request fingerprint before the request, so double clicks, retries, restarts, and competing application instances cannot create a second submission. Timeout, connection loss, 5xx, malformed JSON, or an unknown success shape becomes `UNKNOWN_RESULT` and blocks retry. Confirmed RC failures remain retryable after correction. The daily 23:00-23:30 and 02:00-02:30 SAST maintenance windows block submission without discarding procurement.

Syntech C stores the returned `salesorder`, stable external reference, request fingerprint, UAT environment, adapter version, safe line identity, and response fingerprint. It does not pay Syntech, notify customers, publish products, create pricing proposals, or advance fulfilment. The supplied Syntech documentation does not establish a supported status, tracking, cancellation, or reference-lookup endpoint. TekCentral therefore does not fabricate polling or automatic reconciliation. For `UNKNOWN_RESULT`, staff must search the reseller portal using the stable TekCentral reference and must not submit again until the ambiguous attempt is resolved.

# Catalogue enrichment

Syntech featured and additional images remain private source candidates until controlled ingestion. Source categories use the shared canonical suggestion service; confidence and evidence assist staff review, while explicit verification remains required.

## Launch procurement state

Production ordering remains unavailable independently of UAT success. The launch fallback is manual reseller-portal procurement: an authorized staff member with `supplier_orders.update_status` approves the paid, unheld SupplierOrder, places it in the Syntech reseller portal, and records the bounded Syntech external reference. The canonical service marks only that SupplierOrder `ORDERED`, prevents repeating the transition, preserves customer commercial state, and records authenticated H.2 attribution. Manual procurement is operationally acceptable only while staffing, fresh feed evidence, duplicate checks, and reference reconciliation are maintained.

The controlled-UAT gate is: configure the canonical credential/base URL; explicitly enable only the UAT write flag; create an isolated paid test Order/SupplierOrder with current exact evidence; obtain authorization; create exactly one UAT order; persist the returned reference; and prove a repeat uses the existing local result. Production writes remain disabled and require separate provider proof and approval. Until the UAT flag and safe fixture are both present, no live UAT request is permitted.

Syntech Products are purchasable only while the controlled manual reseller-portal process remains operationally accepted, or after a future separately approved production API path. A deterministic `RC3` response is persisted as internal SupplierOrder evidence and shown as `Procurement action required`; it is not retried automatically and is not a systemic supplier outage by itself. Staff see the safe instruction to use the approved manual process and record its reference, or wait for Syntech account configuration to be corrected. Raw provider bodies and RC codes never enter customer Order APIs, email, invoices, tracking, or storefront UI.

Recording a manual reference is an exclusive, idempotent procurement transition. It requires an approved SupplierOrder, a bounded reference, `supplier_orders.update_status`, and authenticated `STAFF_USER` attribution. `UNKNOWN_RESULT`, an existing external reference, or an already-created/submitting external order blocks manual placement until reconciliation. Historical API failure evidence remains in the event/audit history after active attention resolves.

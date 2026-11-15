# Orders

Zeus Phase B may summarize authenticated customer-owned orders and tracking from the existing customer-safe serializers. Historical item names and prices remain immutable order snapshots. Foreign and unknown order numbers receive the same neutral result, and Zeus cannot cancel, modify, refund or otherwise mutate an order.

Contact categories for order assistance, delivery, returns, cancellation and billing can reference a recent account-owned order. This does not mutate the order. Signed-in references are verified against canonical ownership; guest-entered order numbers remain unverified and do not authorize order data access.

## Immutable cost basis

New order lines capture customer price, VAT rate, VAT amount and revenue excluding VAT when the order is created. The cost status starts as `UNAVAILABLE` because checkout must not guess a fulfilment supplier.

After backend-confirmed payment, SupplierOrder approval is the authoritative cost-capture event. A generated SupplierOrder remains editable/supersedable; staff approval fixes the selected allocation, verified mapping, exact supplier offer/variant and procurement evidence. Scoop captures its ZAR dealer cost. CJ captures exact-VID source cost plus the supplier-neutral USD/ZAR FX evidence used to normalize it. Future suppliers can provide the same normalized evidence contract without changing the order model.

A line becomes `COMPLETE` only when normalized ZAR procurement cost and all required FX evidence exist. Missing evidence produces `PARTIAL`; absent selection remains `UNAVAILABLE`. Once `COMPLETE`, later supplier refreshes, FX changes, remapping, pricing changes and publication changes cannot rewrite the snapshot. No automatic correction or historical backfill exists.

Customer order serialization removes the complete cost-basis object. Supplier identity, costs, FX, margin and evidence fingerprints remain internal.

## CONFIRMED DEMO ARCHITECTURE

- Phase 4 adds `/orders`, `/order/:orderNumber` and `/order/:orderNumber/confirmation`.
- Orders are stored in a versioned local browser repository through `OrderProvider`.
- Order numbers are readable customer-facing identifiers such as `TC-2026-000001`.
- Order items snapshot product details at purchase time and do not depend entirely on the live catalogue.
- The customer order status model is typed and centralized.
- Development-only lifecycle controls can advance local orders through test states.
- Phase 4.5 adds separate payment status to orders.

## Account ownership

- New authenticated orders receive a server-derived `customerAccountId`; guest orders retain no account owner. Frontend payloads cannot choose or spoof ownership.
- Guest checkout returns one random 256-bit URL-safe order credential. Only its SHA-256 hash is stored in `.data/guest-order-access.json`; the raw value is retained in the active browser tab's `sessionStorage`, never `localStorage` or the order record.
- Guest confirmation, detail, payment retry/status/cancel, cancellation, and return requests require the order number plus that exact credential. Authenticated owners use server session ownership without a guest credential.
- Public order enumeration is removed: `GET /api/orders` returns 404. Missing, wrong, revoked, cross-order, and legacy credentials receive the same neutral access response from `GET /api/orders/:orderNumber`.
- `GET /api/account/orders` is authenticated, server-paginated, and sorted newest first. `GET /api/account/orders/:orderNumber` checks exact account ownership before returning customer-safe detail.
- Order access never falls back to email, name, phone, or browser state. A historical guest order remains unclaimed even when its email matches an account.
- Saved-address changes do not alter the order-time customer or delivery-address snapshots.
- Customer account serialization excludes supplier identity and SKUs, procurement state, cost basis, wholesale pricing, margin, internal notes, and admin audit information. Existing customer-facing return and refund state remains available.
- `/account/orders` presents the authenticated account's server-paginated history; `/account/orders/:orderNumber` presents one owned order without exposing whether a foreign order number exists.
- The account overview shows only the three most recent owned orders and links to the complete history.
- Customer order detail renders immutable order-time item, address, customer, price, VAT, delivery, and payment snapshots. Later catalogue or saved-address changes do not rewrite the display.
- Tracking is projected from the canonical shipment into customer-safe carrier, tracking number, HTTPS tracking URL, and shipped-at fields. Internal shipment records and notes are not serialized.
- Buy Again remains deferred until the application can resolve every historical line to an exact, currently purchasable variant without weakening availability checks.
- Historical guest orders may be claimed only after an authenticated account completes the order-specific email challenge. Email equality, order number, phone, name, and browser state are never sufficient proof.
- Claiming changes only `customerAccountId`. Historical items, delivery, pricing, payment, tracking, return/refund, and fulfilment snapshots remain unchanged.
- Successful claiming also revokes the old guest bearer credential; subsequent access uses Account Orders. Legacy guest orders without a credential fail closed and require a future verified-email recovery/reissue mechanism.
- Ownership assignment uses a repository critical section and refuses any order that already has an owner, preventing double claim or ownership replacement.

## PLANNED FUTURE BACKEND

- Persistent customer order storage.
- Authentication-linked order history.
- Payment reconciliation.
- Fulfilment orchestration.
- Supplier status synchronization.
- Customer notifications.

## PENDING BUSINESS POLICY

- Final order acceptance terms.
- Cancellation windows.
- Status names and customer communication rules.

Customer-facing baseline policies are published at `/terms`, `/refund-policy`, `/cancellation-policy`, and `/shipping-delivery`. They describe the implemented request/review state transitions without promising automatic cancellation, return approval or refund completion.

## CONFIRMED PAYFAST SANDBOX

- Orders created for PayFast start pending payment.
- Paid state comes from backend PayFast ITN validation.
- Order detail displays order, payment, return and refund statuses separately.
- Payment retry can reuse the existing order where eligible.
## Syntech UAT procurement

Paid orders allocated to Syntech remain staff-controlled. Customer payment creates no external order. Staff review current evidence, approve procurement (which freezes the existing immutable cost basis), run Syntech preflight, and explicitly confirm UAT creation. A confirmed Syntech `salesorder` moves the SupplierOrder to `ORDERED`; it does not change customer payment, shipment, or fulfilment state. Ambiguous create outcomes are stored as `UNKNOWN_RESULT` and cannot be retried until reconciled.
## Internal Stock Fulfilment

A paid order may be manually allocated to TEKCENTRAL through the existing allocation and SupplierOrder workflow. Generation reserves exact mapped stock and moves a confirmed customer order into processing. Approval finalizes the shared immutable cost basis. Internal picking and packing remain private; customer status changes continue through the existing safe order/shipment model.

Cancelling an unfulfilled TEKCENTRAL SupplierOrder or customer order releases active reservations idempotently. Fulfilled stock is not automatically restored. Returns, returned-goods inspection, restocking, damaged returns, and refund-driven inventory changes begin in Manual Supplier Phase D.

The admin customer profile reads immutable order item, price and delivery-address snapshots. It links to the existing order detail for operations and does not duplicate status, shipment, refund or fulfilment mutations. Unclaimed guest orders do not appear in registered-customer history.

Phase D keeps customer return status, refund status and physical inventory reconciliation independent. Only an authorized return for an exact fulfilled TEKCENTRAL line can be received. Staff explicitly inspect and restock or write off each receipt; original COMPLETE cost basis is never rewritten.

Phase E replenishment records are TekCentral's own internal acquisition plans and are not customer SupplierOrders. `PLANNED` and `ORDERED_EXTERNALLY` states do not reserve or increase stock. A confirmed physical receipt is the only replenishment action that appends stock, using an idempotent ledger reference; customer order, payment and fulfilment states remain unchanged.
# Zeus order routing

General order, delivery, cancellation, return, and refund policy questions use canonical public policy knowledge. Personal status uses consent-protected account tools for signed-in customers or the existing secure guest-order links for guests. Zeus can link to order workflows but cannot cancel, return, refund, pay, dispatch, or otherwise mutate an order.
## Invoice and customer-delivery persistence foundation

Phase J.2A adds PostgreSQL persistence only. A canonical invoice is an immutable commercial snapshot linked one-to-one to an order, with a globally unique future `INV-YYYY-NNNNNN` number allocated from the existing concurrency-safe yearly business sequence. Generated invoice PDF metadata will reference the existing `PRIVATE_INVOICE` media-object scope; no PDF bytes are stored in invoice rows.

Order confirmation and invoice delivery are separate durable message types. Their logical delivery rows use unique idempotency keys, persisted order-email recipients, bounded `SYSTEM`/`STAFF_USER` origin metadata, leases, retry timestamps and append-only attempt history. No email body, SMTP transcript, payment secret, supplier cost or margin is stored.

J.2A performs no invoice issuance, historical paid-order backfill, PDF generation or customer email. Historical issuance requires separate explicit approval. Merchant VAT registration and final invoice wording remain unresolved, and checkout currently has no separate billing-address model.

## Durable order-received confirmation

Every newly persisted PostgreSQL Order prospectively receives one idempotent `ORDER_CONFIRMATION` delivery addressed from the persisted `order.customer.email`. The checkout response waits only for durable enqueue, never for SMTP. A lifecycle-managed worker uses PostgreSQL claims and leases, multipart HTML/text rendering, safe SMTP classification, bounded persisted backoff, and append-only attempts. Confirmation content uses snapshotted item descriptions, quantities, prices, totals, delivery details, current persisted payment/order state, and canonical TekCentral contact identity. It is explicitly not an invoice, tax invoice, payment receipt, or supplier communication.

Registered customers receive a canonical My Account order link. Guest mail contains no raw guest token or enumerable document URL. Repeated transient transport failures coalesce operational Email health alerts; permanent recipient rejection remains delivery-specific. The worker only processes existing delivery rows, so deployment does not backfill historical Orders. Invoice issuance, PDFs, payment receipts, invoice delivery and staff resend remain owned by later Phase J work.

## Paid-order invoice issuance

Canonical invoice issuance begins only after backend-verified PayFast processing has durably persisted `payment.status = PAID`. Browser return pages, staff acknowledgement, supplier allocation and fulfilment are not invoice authority. The PostgreSQL service locks the Order, returns any existing invoice, validates the persisted ZAR commercial totals and then atomically allocates an `INV-YYYY-NNNNNN` number, records database issuance time, writes a versioned immutable commercial snapshot and SHA-256 fingerprint, and creates one pending logical invoice-delivery record.

Invoice lines and totals come from the Order snapshot, never live Product or supplier data. The snapshot includes issuance-time TekCentral business identity, customer details, both delivery-address evidence and an explicitly delivery-sourced billing-address representation, safe payment reference/status, and the exact persisted subtotal, delivery, tax and total. It excludes supplier identity, supplier SKU/cost, margin, fulfilment diagnostics, raw gateway data, secrets and consignee ID. No distinct checkout billing address currently exists.

This behavior is prospective: historical paid Orders are not scanned or backfilled. Repeated PayFast notifications return the same invoice without consuming another sequence value or creating another audit/delivery record. Refunds after issuance leave the original invoice immutable; no credit note exists in J.3. Invoice status, payment status and delivery status remain separate.

J.3 does not generate a PDF, send an invoice email or expose an invoice route. The dormant `INVOICE_DELIVERY` remains outside the order-confirmation worker until a future document exists. J.4 renderer input is the persisted invoice snapshot only, not a live Order reconstruction. Merchant VAT registration, final legal document title and credit-note policy remain unresolved. The existing hard-coded checkout VAT calculation versus configurable VAT policy remains an architectural finding; issuance preserves actual Order evidence without recalculation.

## Private invoice PDF

After prospective invoice issuance commits, the backend best-effort ensures one canonical private PDF. PDFKit renderer `invoice-pdf-v1` consumes only persisted snapshot schema version 1 and the packaged TekCentral JPEG logo. It renders an A4 `INVOICE` with snapshotted seller/customer/address, Order and safe payment references, wrapped item rows, exact ZAR amounts and page traceability. It intentionally makes no merchant VAT-registration or `TAX INVOICE` claim. Because snapshot v1 does not contain delivery method or estimate, those fields are omitted rather than read from live shipping configuration.

The resulting deterministic bytes are SHA-256 hashed and written to private object storage as `invoices/<invoice-number>/<hash>.pdf`. PostgreSQL stores one `PRIVATE_INVOICE` media record and one immutable invoice-document association with renderer provenance. Existing documents are accepted only after private object presence, PDF signature, byte-size and hash verification. Missing/corrupt documents fail closed; storage failures do not create valid associations. A content-addressed object left by a post-storage database failure is recoverable by a later retry/J.6 reconciliation.

There is still no invoice download route, signed customer link, invoice email, receipt, historical backfill or credit-note workflow. `INVOICE_DELIVERY` remains dormant and J.2B continues to process only order confirmations.

## Authorized invoice access and delivery

An authenticated account owner now receives safe invoice number/date/status/readiness metadata on the owned Order detail and can download the verified PDF. Ownership is resolved through the canonical Order `customerAccountId`, never invoice number or storage identifiers. Spaces downloads are exact-object, short-lived signed URLs; local development streams the same private bytes through the authenticated route. Missing or corrupt documents fail closed and use the existing invoice-integrity H.1 path.

Guest delivery uses one bounded `application/pdf` attachment generated by J.4. The message contains no raw guest token or guest document URL. Registered delivery includes the same attachment and may link to the canonical Account Order page. Both are generated from immutable invoice metadata/snapshot data and the persisted original order recipient; supplier and internal commercial data are excluded.

The shared PostgreSQL delivery worker processes `INVOICE_DELIVERY` with its existing lease, retry and append-only attempt semantics. A document that is not ready is deferred without consuming an SMTP attempt. Manual Admin resend requires `orders.resend_documents`, confirmation and the original persisted recipient. It creates one idempotent new logical delivery referencing the existing invoice and PDF. Retry requeues the same transiently failed delivery; permanent recipient and SMTP 5xx failures are not blindly retried. Admin Order detail exposes bounded commercial-document and delivery history under `orders.read`, while resend/retry is separately authorized and audited as the authenticated staff user.

No receipt, credit note, historical invoice backfill, arbitrary-recipient resend or document regeneration is part of J.5. Migration `0015` remains the complete persistence foundation.

## Prospective commerce recovery scope

Migration `0016_commerce_recovery_scope.sql` introduces two internal nullable Order columns without defaults or backfill. `order_confirmation_required_at` is set once in the PostgreSQL transaction that persists a newly created checkout Order, before confirmation enqueue. `invoice_required_at` is set once in the authoritative verified PayFast transaction that commits `PAID`, before downstream invoice ensure. These timestamps record workflow scope and are never cleared by cancellation, refund states or generic Order persistence.

`NULL` means recovery eligibility must not be inferred. All Orders that existed when migration 0016 was applied therefore remain outside prospective recovery, including historical paid Orders without invoices or confirmation deliveries. Internal bounded queries select only explicitly marked Orders missing the corresponding canonical artifact. J.6A does not run those queries on startup, issue invoices, create documents, enqueue recovery deliveries or send email; they are the safety boundary required by J.6B.

## Prospective document reconciliation

J.6B consumes the migration-0016 boundary through an explicit opt-in worker. Every tick takes a non-blocking PostgreSQL advisory lock, waits a three-minute grace period, and scans at most 20 candidates per stage. It repairs, in order, a missing order-confirmation delivery, a missing paid-order invoice, a missing canonical invoice PDF association, and a missing invoice delivery. It delegates every write to the existing J.2B/J.3/J.4/J.5 ensure service and never allocates invoice numbers or rebuilds commercial snapshots itself.

The worker defaults off (`COMMERCE_RECONCILIATION_WORKER_ENABLED=false`). When enabled, development polling defaults to 60 seconds; production defaults to five minutes. A backend restart is required after changing the worker environment. Reconciliation logs only correlation IDs, safe Order/invoice references, stage outcomes and failure codes. Repeated worker/database failures coalesce under the commerce-reconciliation H.1 identity, while invoice, document integrity/storage and SMTP failures retain their existing canonical H.1 identities.

Reconciliation never sends email. Pending, retryable failed and stale `SENDING` deliveries remain under the customer-delivery worker's lease/retry policy, and permanent recipient failures remain blocked for staff review. A missing document association can be created from the immutable invoice snapshot. An existing association whose private object is missing, corrupt or hash-mismatched fails closed and is not replaced. No manual artifact-editing or recovery endpoint is introduced; existing Admin commercial-document status and authorized resend/retry controls remain authoritative.

## Phase J operations runbook

Phase J is implemented for prospective Orders. Historical Orders remain excluded unless a later, explicitly approved backfill is designed.

- **Confirmation missing or SMTP unavailable:** inspect the Order's Commercial Documents delivery state and H.1 Email alert. The customer-delivery worker retries transient failures with persisted backoff. A permanent recipient rejection requires staff/customer-data review and is not looped.
- **Invoice missing after verified payment:** confirm persisted payment is `PAID` and `invoice_required_at` exists. Reconciliation calls the canonical invoice ensure path after its grace period. Never issue from browser return state.
- **PDF or storage failure:** inspect document state and the renderer/storage H.1 alert. Restore the failed private dependency, then allow reconciliation to run. Corrupt or hash-mismatched associations fail closed and are not silently replaced.
- **Delivery failure:** retry only an eligible transient failed delivery. Resend creates a new logical delivery using the same invoice/PDF and original persisted recipient. Neither action accepts a browser-supplied recipient.
- **Reconciliation outage:** restore PostgreSQL/provider access and restart the worker. Successful later reconciliation resolves its coalesced H.1 incident. Advisory locking, bounded scans and ensure services make restart safe across instances.
- **Worker configuration:** production requires `CUSTOMER_DELIVERY_WORKER_ENABLED=true` and `COMMERCE_RECONCILIATION_WORKER_ENABLED=true`. Restart after environment changes. Do not enable workers against real recipients during acceptance.
- **Support trace:** Admin Order detail and Commercial Documents expose Order/payment state, invoice number, PDF readiness, delivery attempts, safe failure category, resend/retry history and authenticated manual actor without raw database or SMTP-log access.

Customer and Admin downloads remain Order-authorized and integrity-checked. Guest invoices are attachments only. Invoice numbers and private object identifiers are not access credentials.

Remaining exclusions are receipts, credit notes, historical invoice backfill, merchant VAT-registration claims and a distinct billing address. The document remains `INVOICE`, not `TAX INVOICE`. Checkout tax calculation and configurable VAT policy remain a documented future drift risk; issuance never recalculates persisted commercial evidence.

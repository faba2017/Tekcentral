# Supplier Orders

## CONFIRMED ARCHITECTURE

- Phase 6 adds internal supplier order records for mock supplier orchestration.
- Supplier orders are generated from paid backend customer orders and existing
  supplier allocation records.
- One customer order can generate one supplier order or split into multiple
  supplier orders when allocations point to different suppliers.
- Supplier orders are persisted in `.data/supplier-orders.json`.
- Supplier SKU mappings are persisted in `.data/supplier-product-mappings.json`
  and keyed by `productId + supplierCode`.
- Supplier orders are internal only and are not returned by customer order APIs.
- Backend order item snapshots remain authoritative for item identity, SKU,
  quantity and selling price snapshot.
- Phase 6.1 enforces one active supplier procurement path per customer order
  item quantity.
- Paid lines with one current verified, available Scoop source are allocated
  automatically and generate one idempotent `ACTION_REQUIRED` SupplierOrder.
  All ambiguous or blocked lines remain on the manual allocation path.

## SCOOP MANUAL PROCUREMENT

The Scoop lifecycle is `ACTION_REQUIRED`, `ACKNOWLEDGED`, `APPROVED`, `ORDERED`,
`CONFIRMED`, `SHIPPED`, `DELIVERED`. Acknowledgement means staff has seen the
task; approval authorizes procurement; ordered means staff placed the order in
Scoop and recorded its real supplier reference.

The supplier registry provides the manual procurement URL and operational
channel. Opening that external URL performs no state transition. Cost and offer
identity are snapshotted on SupplierOrder lines and remain immutable.

Creation of a new Scoop `ACTION_REQUIRED` order also persists an internal
operations notification with `PENDING`, `SENDING`, `SENT` or `FAILED` state.
The idempotency key is `SCOOP_ACTION_REQUIRED:<supplierOrderId>`. Provider
acceptance is required before `SENT`; failures never roll back payment,
allocation or procurement and can be retried explicitly. No historical
startup backfill or customer email is performed.

## MOCK SUPPLIER LIFECYCLE

Supported internal supplier order states include:

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

Staff can approve a generated supplier order, create a mock submission, apply a
mock supplier outcome and record mock dispatch metadata.

Mock outcomes support successful confirmation, delayed acknowledgement, partial
confirmation, backorder and rejection.

Superseded supplier orders remain visible for audit but cannot progress.

## ADMIN ROUTES

- `/admin/supplier-orders`
- `/admin/supplier-orders/:supplierOrderId`

The supplier order detail page shows internal status, payload preview, mock
scenario controls, item confirmation/backorder quantities, dispatch controls and
activity history.

Admin order detail includes a compact next-action workflow summary derived from
payment, allocation, supplier-order, external submission, operational hold and
shipment state. This is guidance only; backend transition rules remain
authoritative.

## BACKEND ENDPOINTS

- `GET /api/admin/supplier-orders`
- `GET /api/admin/supplier-orders/:id`
- `POST /api/admin/orders/:orderNumber/supplier-orders`
- `PATCH /api/admin/supplier-orders/:id/approve`
- `PATCH /api/admin/supplier-orders/:id/acknowledge`
- `POST /api/admin/supplier-orders/:id/manual-order`
- `POST /api/admin/supplier-orders/:id/notifications/scoop-action-required/retry`
- `POST /api/admin/supplier-orders/:id/cj/preflight`
- `POST /api/admin/supplier-orders/:id/cj/create`
- `POST /api/admin/supplier-orders/:id/cj/reconcile`
- `POST /api/admin/supplier-orders/:id/cj/refresh-status`
- `POST /api/admin/supplier-orders/:id/mock-submit`
- `PATCH /api/admin/supplier-orders/:id/mock-confirm`
- `PATCH /api/admin/supplier-orders/:id/mock-reject`
- `PATCH /api/admin/supplier-orders/:id/dispatch`
- `PATCH /api/admin/supplier-orders/:id/lines/:productId/supplier-sku`

## PHASE 6.1 SAFETY RULES

- Supplier order generation requires paid payment confirmation and no active
  operational hold.
- Approval, mock submission, mock outcome application and supplier dispatch are
  blocked while the linked customer order has an active operational hold.
- Non-manual supplier orders require supplier SKU mapping on every line before
  approval or mock submission.
- CJ supplier orders require `VERIFIED` CJ mappings before approval or mock
  submission. `SUGGESTED` CJ mappings do not resolve as usable supplier SKUs.
- Supplier payload previews show mapping-required state when not ready.
- Supplier dispatch requires courier, tracking number and dispatch date.
- Confirmed quantity cannot exceed supplier order quantity.
- Confirmed plus backordered quantity cannot exceed supplier order quantity.
- Active supplier-order quantity across all supplier orders cannot exceed the
  customer ordered quantity.
- Partially confirmed supplier orders reserve confirmed quantities only.
- Backordered, rejected, cancelled and superseded supplier orders do not reserve
  active procurement quantity.

## SUPERSESSION

If a newer allocation replaces an existing `DRAFT` or `READY_FOR_APPROVAL`
supplier order for the same item quantity, the older supplier order is marked
`SUPERSEDED` and linked to the replacement.

Approved, submitted, acknowledged, confirmed, dispatched and completed supplier
orders cannot be superseded silently. Staff must use an explicit cancellation or
reallocation workflow when those states need correction.

## PHASE 7B-CJ REAL ORDER CREATION

CJ is the first approved real supplier write boundary.

For CJ supplier orders only, staff can:

- approve the internal SupplierOrder
- prepare a CJ order preflight
- review normalized customer shipping, exact CJ product/variant identities,
  logistics and supplier cost snapshot
- explicitly create one unpaid CJ order when
  `CJ_REAL_ORDER_CREATION_ENABLED=true`
- reconcile an uncertain CJ result through read-only CJ order search
- refresh CJ status through read-only CJ order detail

The real CJ metadata is stored on `SupplierOrder.externalSubmission` and is
separate from `mockSubmissions`.

Real CJ supplier orders should display submission as `CJ API`. Fulfilment should
display as pending logistics selection until a selected CJ logistics path makes
direct-to-customer fulfilment explicit.

Real CJ creation does not:

- pay CJ
- mark the supplier order confirmed unless a future status rule permits it
- dispatch goods
- alter PayFast state
- fulfil, ship or complete the customer order

## SAFETY BOUNDARY

- No real supplier email is sent.
- No supplier API is called except the Phase 7B-CJ staff-approved CJ order
  creation and read-only reconciliation/status endpoints.
- No supplier portal automation is performed.
- No courier API is called.
- CJ credentials remain backend-only.
- Mock supplier references are local testing references only.

## ATTENTION REASONS

Supplier order attention is backend-derived and can surface:

- supplier order awaiting approval
- supplier SKU mapping required
- customer order on hold
- supplier rejection
- supplier backorder
- delayed supplier confirmation
- overdue supplier dispatch

These reasons are internal admin signals only.

## PENDING BUSINESS POLICY

- Supplier selection logic.
- Supplier cost and margin rules.
- Real order submission channels.
- Real supplier acknowledgement and reconciliation.
- Customer notification rules for split fulfilment.

# Mock Supplier Orchestration

## PURPOSE

Phase 6 validates TekCentral's internal order-to-supplier workflow before any
real supplier integration is connected.

The supported mock journey is:

```text
paid customer order
  -> supplier allocation
  -> generated supplier order
  -> staff approval
  -> mock supplier submission
  -> mock supplier outcome
  -> mock dispatch and tracking metadata
  -> customer order shipment progression
```

## SUPPLIER ADAPTERS

The Phase 6 adapter boundary lives in `backend/mockSupplierAdapters.ts`.

Known supplier codes are:

- `SCOOP`
- `PINNACLE`
- `MIRO`
- `RECTRON`
- `MUSTEK`
- `AXIZ`
- `CJ`
- `MANUAL`

Scoop currently has documented mock capability flags for email ordering, portal
ordering, direct shipping with caveats and CSV/XML feed availability. Other
suppliers remain conservative unknown/manual mock adapters until documented
capabilities are approved.

## MOCK SCENARIOS

Supported mock scenarios:

- `SUCCESS`
- `DELAYED_CONFIRMATION`
- `PARTIAL_CONFIRMATION`
- `BACKORDER`
- `REJECTED`

Mock submission is idempotent for the same supplier order. Repeated submission
does not create a second supplier submission record.

## PHASE 6.1 HARDENING

- Only one active supplier procurement path may cover a customer order item
  quantity at a time.
- `DRAFT` and `READY_FOR_APPROVAL` supplier orders can be marked `SUPERSEDED`
  when a newer generated supplier order replaces them.
- Superseded supplier orders are view-only.
- Operational holds block supplier order generation, approval, mock submission,
  mock outcome application and dispatch.
- Supplier SKU mappings are required for non-manual suppliers before approval or
  mock submission.
- Supplier dispatch requires courier, tracking number and dispatch date.

## QUANTITY RULES

- Confirmed quantity cannot exceed ordered quantity.
- Confirmed plus backordered quantity cannot exceed ordered quantity.
- Total active supplier-order quantity cannot exceed customer ordered quantity.
- Partial confirmation records confirmed and backordered quantities per line.
- Dispatch uses confirmed quantities where present, otherwise ordered
  quantities.

## CUSTOMER DATA BOUNDARY

Supplier orders, supplier allocations, internal notes, operational holds,
parcels and internal shipment records are staff-only operational data.

Public customer order endpoints must return customer-safe order objects and not
expose supplier identities or supplier order state.

## OUT OF SCOPE

- Real supplier emails.
- Real supplier APIs.
- Supplier portal automation.
- Scraping.
- Courier APIs.
- Live PayFast mode.
- Production authentication.

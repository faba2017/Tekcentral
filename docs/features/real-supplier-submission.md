# Real Supplier Submission

## Durable Rules

Real supplier write integrations require:

- staff approval before any external write
- backend-only supplier credentials
- verified supplier product/variant mappings
- operational hold gating at preflight and submit time
- supplier-returned logistics or fulfilment options where required
- deterministic external references
- local idempotency before the request leaves TekCentral
- `UNKNOWN_RESULT` reconciliation before retry
- customer and supplier lifecycle separation
- capability-driven operational guidance

External supplier order creation is not supplier payment. It also does not mark
customer orders shipped, fulfilled or complete.

## CJ Phase 7B

CJ is the first implementation of this boundary.

TekCentral uses CJ Create Order V2 with `payType=3` to create an unpaid CJ
order only. Staff review the preflight payload and select a CJ logistics option
before explicitly confirming the external create action.

No live create-order request should be run by automated tests or Codex. Tests
must mock CJ HTTP.

Freight/logistics diagnostics are allowed for admin development when sanitized.
Diagnostics may show destination country code, postal-code presence, item count,
safe supplier variant IDs, source countries and response summaries. They must
not expose supplier credentials, tokens or full customer delivery addresses.

When no logistics method is returned for a South African order, staff should see
whether the local request was incomplete or whether the selected CJ variant has
no available route to South Africa. Create must remain blocked.

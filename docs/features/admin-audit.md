# Admin Audit / Activity

`Admin → Audit / Activity` is a read-only, append-only operational projection of important business mutations and meaningful system activity. It answers what changed, when, whether Ops or the system caused it, which canonical record was affected, and where staff can inspect that record.

Audit history is distinct from Operational Alerts: alerts show current failures or attention; audit shows historical change. Audit never becomes the source of truth for Products, prices, orders, payments, inventory, suppliers, returns, Contact conversations, settings, or alerts.

## Records and actors

Records use `AUDIT` for high-value mutations and approvals and `ACTIVITY` for useful system operations. Authenticated human Admin mutations use `STAFF_USER` with the stable StaffAccount UUID, display label, and role derived from the server-side session through `staffAuditActor(context)`. Browser-supplied actor fields are compatibility input only and are never authoritative. `SYSTEM` remains reserved for source runs, scheduled work, callbacks, reconciliation, and other genuinely automated activity; `OPS` is retained only for truthful non-human legacy/platform operations and historical records.

Each record stores a bounded summary, safe before/after values, entity references, and an allowlisted Admin deep link. Full domain objects, raw Contact messages, Zeus prompts, addresses, provider payloads, passwords, hashes, sessions, tokens, credentials, signatures, API keys, and payment/supplier secrets are prohibited.

## Persistence and access

The current projection is stored atomically in `.data/admin-audit.json`, retains detailed entries for 365 days, and is capped at 10,000 records. Canonical financial, order, publication, and inventory histories retain their own domain-specific lifecycles independently of this projection. Stable idempotency hashes suppress duplicate records caused by safe retries.

The Admin API supports GET list/detail only, with server-side period, date-range, actor, category, subsystem, action, entity, reference-search, sorting, and pagination. No ordinary Admin API can edit or delete records.

RBAC resolves authenticated sessions into `STAFF_USER`, staff ID, display name, and role for business mutations and authentication lifecycle events. Mutation routes must propagate this canonical actor through services rather than rebuilding it or defaulting to a generic operator. Existing Ops history is not rewritten, automated actions remain `SYSTEM`, and Audit records are never permission evidence. See `docs/features/staff-rbac.md` and `docs/features/staff-auth.md`.

## Initial event coverage

Forward-going coverage includes Product draft/media/category and publication changes, pricing approvals/rejections, merchandising updates, supplier mappings and refresh completion, supplier references, order status/hold/tracking changes, return inventory actions, Contact delivery outcomes and retries, payment/shipping/settings changes, and alert acknowledgement/manual resolution. Existing canonical histories are reused as mutation sources; unsupported historical actions are not fabricated.

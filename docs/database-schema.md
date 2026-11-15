# TekCentral production database schema

Migration `0001_foundation.sql` establishes normalized tables for customers, staff/RBAC/2FA, Products and immutable versions, media metadata, SupplierOffers/mappings, pricing, promotions, merchandising, orders/lines/payments, SupplierOrders, inventory balances/reservations/ledger, returns/refunds/shipments, Contact conversations/messages, notifications, H.1 alerts/events, append-only H.2 audit, analytics aggregates, settings, feature flags, distributed rate-limit buckets, locks and migration imports.

Canonical IDs are text so existing IDs survive import. Money is stored as integer minor units with ISO currency. Flexible metadata is bounded JSONB only where source-specific evidence or immutable snapshots do not warrant unstable columns. Database constraints reinforce identity, idempotency and quantity invariants.

The initial migration is expand-only. Future migrations must remain backward compatible across rolling deployment. Destructive contract migrations require a later release after all application versions stop reading the old shape. Production schema changes are never edited manually.

Application roles should be split before launch: a migration role may create/alter schema; the runtime role receives only required DML plus sequence/function execution. Runtime must not update/delete `admin_audit`; database rules provide defense in depth while append-only permissions remain the primary control.

Migration `0006_commerce_cutover.sql` adds the Cutover D commerce schema: normalized order/payment/SupplierOrder lines and snapshots, callback idempotency, shipping quotes, guest access/claim records, server carts/actions, inventory balances/reservations/ledger, return reconciliation, replenishments and fingerprinted import runs. Unique request fingerprints and row-locked balance/order mutations provide database-backed duplicate and concurrency protection.

Migration `0007_operations_cutover.sql` completes runtime storage for Contact, H.1 alerts/events, H.2 audit payload/idempotency, internal notifications, operational state, Zeus usage and fingerprinted Cutover E imports. Audit remains append-only. Secrets stay environment-managed and are not copied into settings rows.

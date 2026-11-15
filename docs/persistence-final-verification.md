# Persistence final verification

## Final store matrix

| State | Stores |
| --- | --- |
| PostgreSQL authoritative | Customer/Auth, Staff/RBAC/2FA, Products and publication versions, supplier offers/mappings/catalogues, pricing, merchandising, media metadata, orders/payments, SupplierOrders, carts, guest access/claims, inventory/reservations/ledger, shipping/fulfilment, returns/refunds, Contact, H.1 alerts/events, H.2 audit, analytics, notifications, non-secret settings, FX evidence, Zeus usage and shared rate limits |
| Object-byte migration pending | `.data/public-assets/products/*` and `.data/public-assets/documents/*`; future confidential documents use the private bucket |
| Intentionally ephemeral | Provider token caches, process diagnostics, live health probes and integration-test results |
| Legacy migration/reference-only | Domain JSON snapshots listed by `backend/persistence/storeInventory.ts`; never a PostgreSQL-mode fallback |
| Test-only | Isolated `tekcentral_*_test` databases, explicit repository path overrides and temporary local object targets |
| Obsolete after retention | Expired cart/claim, analytics, Zeus usage and reconciliation JSON snapshots after the production rollback window |

There is no unexplained production-authoritative JSON or process-local repository in PostgreSQL mode. Product/document bytes are the only durable-data transfer still pending.

## Object inventory and migration

`npm run persistence:objects` performs a no-write inventory. It hashes every legacy Product image and document, assigns a stable content-addressed key, identifies duplicate content, reports unreferenced objects and reports references whose byte is missing.

For a local rehearsal only:

```sh
npm run persistence:objects -- --apply --target-root /absolute/isolated/object-target
```

Apply never deletes source objects. Existing destination bytes are accepted only when their SHA-256 matches; a conflicting key fails the run. Re-running resumes by reporting matching objects as `ALREADY_PRESENT`. A production runner must use the same manifest semantics with the configured public/private Spaces adapter and persist the manifest before metadata cutover.

Public objects are approved Product images and Product documents. They use content-addressed immutable keys and public cache headers. Private documents, including future invoices, use a separate private bucket, `private, no-store`, application authorization and short-lived signed downloads. Private data must never rely on an enumerable or predictable public URL.

## Recovery consistency

- Database survives, object storage is lost: restore bucket versions/backups, hash against `media_objects`, then report missing/conflicting keys before reopening affected media paths.
- Object storage survives, database metadata is lost: restore PostgreSQL first, inventory objects without deleting anything, reconcile by key/hash, and quarantine unreferenced objects until the retention window expires.
- Both are restored: choose the same recovery timestamp where possible, restore PostgreSQL and bucket versions, then reconcile every metadata key/hash before traffic resumes.

The application does not attempt a distributed database/object transaction. Upload completes and hashes first; metadata commits second. Reconciliation handles interrupted operations.

## Migration compatibility review

Migrations `0001`–`0004`, `0006` and `0007` are additive. Migration `0005` replaces one catalogue mapping unique index with a more precise unique index. Because dropping/replacing that index changes write semantics, an existing `0004` deployment must pause mapping writes while `0005` runs. It does not require a data rewrite, table/column drop or application rollback migration. All schema migrations run once under the migration advisory lock before rolling web replacement.

## Sequences, workers and limits

`allocate_business_sequence(name, year)` uses one PostgreSQL upsert and is concurrency-safe. Imported order numbers remain unchanged; the `order` sequence must be seeded above the largest historical number before enabling writes. A future invoice allocator uses an independent `invoice` name and can format `INV-YYYY-000001` without sharing order counters.

Production web instances use `APP_ROLE=web` and do not start scheduled supplier/FX work. Worker/job instances use `APP_ROLE=worker`; durable job state and the `distributed_locks` table provide the cross-instance boundary, while domain idempotency remains mandatory. Failure to acquire a lock means no work is performed.

All production-sensitive application limits use PostgreSQL buckets in PostgreSQL mode. Explicit injected/local limiters are restricted to tests and local development. Edge/provider throttles may add protection but are not the application authority.

## Legacy retirement criteria

Legacy JSON remains immutable migration/reference evidence until all of the following are true: production import and canonical verification pass; production remains stable through the approved rollback window; database and object restore rehearsals pass; no mismatch remains; backups are retained; and the owner explicitly approves retirement. The final archive is encrypted, access-controlled and retained according to the applicable financial/security retention policy. Runtime fallback is never re-enabled.

## MongoDB

Repository and dependency inspection found no `mongoose`, `mongodb`, `MongoClient`, `MONGODB_URI`, Mongo repository, package dependency or deployment configuration. MongoDB is retired and is not required by the current architecture.

# Production persistence architecture

TekCentral production uses DigitalOcean Managed PostgreSQL for authoritative structured state and DigitalOcean Spaces for object bytes. App containers are disposable. `PERSISTENCE_PROVIDER=LOCAL` and local object storage remain development/test compatibility adapters only; staging and production fail configuration validation unless PostgreSQL and Spaces are selected.

## Repository and cutover model

Business rules remain in domain services. PostgreSQL access is centralized under `backend/persistence`, with bounded pooling, parameterized queries and `withTransaction`. Schema migrations are ordered SQL files protected by a PostgreSQL advisory lock and recorded in `schema_migrations`. They run only through `npm run persistence:migrate`, never from every web process at startup.

The migration job authenticates with `DATABASE_MIGRATION_URL` and the configured `DATABASE_MIGRATION_ROLE`. Web and worker processes receive only `DATABASE_URL` for `DATABASE_RUNTIME_ROLE`. Run `npm run persistence:roles` from the controlled migration context after migrations to idempotently apply runtime grants/default privileges. Never place the migration URL in a web or worker component.

The current JSON repositories are not silently redirected to generic JSONB. Each domain requires expand/import/verify/switch/retire:

1. Apply additive schema migration.
2. Deploy code compatible with old and new schema.
3. Run `npm run persistence:inspect` against an explicitly selected source snapshot.
4. Run the domain importer in dry-run mode, resolve conflicts, then apply once approved.
5. Compare source/destination counts, immutable snapshots and financial/inventory totals with `npm run persistence:verify` plus domain checks.
6. Switch that repository through configuration.
7. Retain the source read-only for the rollback window; remove only in a later release.

The canonical inventory is executable in `backend/persistence/storeInventory.ts`. Existing business repositories use local adapters unless individually migrated. Customer/Auth, Staff/RBAC/2FA, catalogue and commerce Cutovers A–D are PostgreSQL-authoritative when `PERSISTENCE_PROVIDER=POSTGRES`; remaining operational domains still block full production cutover.

Every inventory entry records its owning repository/service, migration status, runtime status, validation status and legacy-file disposition. `customer-accounts.json` is the first runtime repository cutover: `customerAuth` uses normalized PostgreSQL customer, address, session, reset and security-event tables whenever `PERSISTENCE_PROVIDER=POSTGRES`. Explicit test path overrides retain the local adapter. Authentication services do not silently fall back to JSON when PostgreSQL is selected.

`staff-auth.json` is also runtime-cut over. In PostgreSQL mode, `staffAuth` uses normalized staff account, session, auth-token, pre-auth challenge and recovery-code tables. Canonical permission definitions and role bundles remain code-defined; PostgreSQL stores each account's role plus explicit grants and revocations. The legacy file remains migration/reference-only and is never a runtime fallback when PostgreSQL is selected.

Inspect the customer source without writes using `npm run persistence:import:customers`. After schema migrations and destination verification, an explicitly authorized import uses `npm run persistence:import:customers -- --apply`. The importer validates source identity and relationship invariants, refuses a non-empty conflicting destination, records a fingerprinted migration run and treats a previously successful identical fingerprint as idempotent. It performs no email, payment, supplier or fulfilment action. The original JSON remains migration-only until the rollback window closes.

## Transactions and concurrency

The schema provides unique constraints for normalized customer/staff email, Product slug/SKU, supplier offer identity, order number, payment/contact idempotency, supplier submission fingerprints and session/token hashes. Inventory reservation/balance/ledger, order/payment, staff token consumption and future invoice allocation must use one database transaction with row locking where applicable. `allocate_business_sequence` atomically allocates independent yearly order/invoice counters; existing order numbers are imported unchanged.

PostgreSQL `rate_limit_buckets` is the production shared limiter primitive. Customer/staff authentication, Contact and Zeus production callers use it in PostgreSQL mode while preserving existing thresholds; local mode retains process limiters for development and explicitly injected tests. `distributed_locks` is available for bounded job ownership; permanent business state never belongs in a cache.

## Local development

Default local mode remains filesystem-backed. To exercise PostgreSQL locally:

```bash
docker compose -f docker-compose.persistence.yml up -d
PERSISTENCE_PROVIDER=POSTGRES DATABASE_URL=postgres://tekcentral:local-development-only@127.0.0.1:5433/tekcentral_dev DATABASE_SSL_MODE=disable npm run persistence:migrate
```

The Compose project is explicitly named `tekcentral-persistence`, uses container port 5432, host port 5433 by default, and owns only the `tekcentral-persistence_tekcentral-postgres` volume. This avoids collision with unrelated local PostgreSQL projects. Override only the host binding with `TEKCENTRAL_POSTGRES_PORT` when required.

## Customer/Auth cutover validation

The local PostgreSQL acceptance run applied `0001_foundation.sql` and `0002_repository_cutover.sql`; rerunning migrations executed none. Customer migration dry-run left destination counts unchanged, apply imported 5 accounts, 1 address, 6 hashed sessions and 11 security events, and the second identical apply returned `idempotent: true`. Password-reset verification was `NOT APPLICABLE` because the source currently contains none.

`npm run persistence:verify:customers` compares stable IDs, profiles/password hashes, addresses, sessions/Zeus consent, reset records, security events and foreign-key ownership without printing sensitive values. The acceptance result was `MATCH` for every applicable check.

`npm run backend:customer-persistence:test` uses a separate `tekcentral_customer_test` database and multiple Node processes. It proves cross-process session reads, immediate logout visibility, persistence after pool/process restart, combined shared rate-limit enforcement, cleanup, and fail-closed behavior against an unreachable PostgreSQL port. The runtime never reads JSON when PostgreSQL mode is selected. The test found and corrected PostgreSQL parameter typing in the shared limiter and concurrent-query use on one transaction client.

Local object storage defaults to `.data/object-storage`. No cloud credentials are required. Development seed data, schema migration and production import are separate operations.

## Staff/RBAC/2FA cutover validation

After applying `0003_staff_cutover.sql`, inspect the staff source without writes using `npm run persistence:import:staff`, apply with `npm run persistence:import:staff -- --apply`, and compare source and destination with `npm run persistence:verify:staff`. The importer preserves staff IDs, password and token hashes, account lifecycle data, role/grant/revocation state, encrypted TOTP payloads, recovery hashes, sessions and bounded challenges. It never sends mail, regenerates credentials or factors, or runs the Super Admin bootstrap.

The isolated local acceptance source contained 1 existing staff account and 4 hashed sessions, with no current invitation, reset, pre-auth, enabled-2FA or recovery-code records. Apply imported those records; a second identical apply returned idempotent without duplicates or mutations. Verification returned `MATCH` for account/role/permission/hash/2FA state, sessions and foreign-key ownership, with the empty invitation/reset/challenge groups reported as `NOT APPLICABLE`.

`npm run backend:staff-persistence:test` uses a separate `tekcentral_staff_test` database and independent Node processes. It proves cross-process session reads, immediate permission grant/revocation resolution, disable-driven session revocation, invite acceptance and reset replay protection, cross-process TOTP pre-auth completion and replay rejection, shared rate limiting, persistence after pool/process recreation, and fail-closed behavior when PostgreSQL is unreachable. No staff-security read or mutation falls back to JSON in PostgreSQL mode. Existing RBAC and 2FA suites remain the policy-parity source for role-only access, grant/revoke collision, high-risk enforcement, reminder behavior and last-Super-Admin protection.

The existing Super Admin identity and password hash were preserved; bootstrap was not rerun. `STAFF_2FA_ENCRYPTION_KEY` remains external and encrypted factors were not decrypted or re-encrypted. Product, supplier, order/payment, Contact, alerts, audit, analytics, settings and other persistence domains remain outside this cutover and continue to block the overall persistence project.

## Catalogue cutover validation

Cutover C moves internal Products, immutable publication versions/drafts, supplier Product/category mappings, CJ/Scoop/Syntech/Manual TekCentral offers, pricing proposals, merchandising and controlled Product-image metadata to domain-specific PostgreSQL tables. Canonical taxonomy definitions remain code-defined. In PostgreSQL mode these repositories fail closed and never read legacy JSON as fallback; explicit test path overrides retain local adapters.

Use `npm run persistence:import:catalogue` for a side-effect-free dry run, `npm run persistence:import:catalogue -- --apply` for the fingerprinted import, and `npm run persistence:verify:catalogue` for canonical payload, identity, relationship and count parity. The importer preserves code-seeded Product identities needed by historical mappings, refuses conflicting destinations, and resumes an interrupted import only when every existing destination subset exactly matches its source. It does not call supplier APIs, publish Products, approve prices or create supplier operations.

The validated local source contained 16 internal Products, 35 code-seeded Product identities, 3 publication records with 8 immutable versions, 2 drafts, 25 Product mappings, 1 category mapping, 23 pricing proposals, 3 merchandising sections, 14 media records, 11 CJ offers, 933 Scoop offers and 2,898 Syntech offers. Manual TekCentral currently had zero offers. All canonical checks and foreign keys matched; the second apply was idempotent. The current Scoop/Syntech counts differ from earlier approximate 944/3,015 baselines because the actual local source changed before migration, not because rows were lost during import.

`npm run backend:catalogue-persistence:test` uses `tekcentral_catalogue_test` and separate Node processes to prove Product, supplier, pricing, publication and media visibility, publication-version uniqueness under concurrent insertion, supplier-confidential public serialization, restart-safe reads and fail-closed database errors. Manual TekCentral offer rows are PostgreSQL-authoritative while its excluded inventory/reservation/return operational arrays remain on their existing adapter pending the later inventory cutover.

Media metadata migration is complete. The dry run validates broken metadata, duplicate references and missing local/object-storage files. Product bytes remain in the existing object-storage abstraction/local compatibility locations; no production Spaces bucket was created and byte migration remains pending. `PUBLIC_IMAGE_MISSING` continues to derive from controlled metadata plus actual object availability.

## Commerce cutover validation

Cutover D moves customer orders and lines, payment snapshots and ITN evidence, SupplierOrders and lines, shipping quotes, server carts/actions, guest credentials and claims, returns, refunds, shipments, Manual TekCentral inventory balances/reservations/ledger/reconciliation, and replenishments to PostgreSQL. Domain snapshots remain in bounded JSONB while identity, status, money, quantities, timestamps, ownership and idempotency keys are normalized and constrained. PostgreSQL mode fails closed; explicit test-file overrides remain local-only.

Use `npm run persistence:import:commerce` for a no-write dry run, `npm run persistence:import:commerce -- --apply` for the fingerprinted import, and `npm run persistence:verify:commerce` for source/destination parity. The validated source imported 19 orders and payment snapshots, 21 lines, 11 PayFast events, 10 SupplierOrders with 13 lines, 14 shipping quotes, one cart and five pending cart actions. Empty guest-claim, return/refund, shipment, Manual inventory and replenishment groups were retained as supported but not applicable to this source. A second apply was idempotent.

`npm run backend:commerce-persistence:test` uses `tekcentral_commerce_test` and independent Node processes. It proves imported state visibility, one-winner final-unit reservation with idempotent replay, SupplierOrder create-fingerprint uniqueness, serialized payment updates, and fail-closed reads/writes against an unreachable database. Payment, order, inventory and SupplierOrder writes retain existing business-state validation; no import calls PayFast, suppliers, mail, publication or fulfilment providers.

## Operations cutover validation

Cutover E moves Contact enquiries/conversations/messages, H.1 operational alerts/events, append-only H.2 audit, privacy-minimized storefront analytics, internal notification delivery state, validated non-secret settings, FX evidence, and Zeus usage/quota events to PostgreSQL. Contact submission/reply, customer/staff authentication and Zeus production limits use shared PostgreSQL state. Explicit test overrides retain local behavior; PostgreSQL mode never falls back to JSON.

Use `npm run persistence:import:operations` for a dry run, `npm run persistence:import:operations -- --apply` to import, and `npm run persistence:verify:operations` for parity. The validated snapshot contained 15 audit records, 7 analytics days with 305 recent activities, 2 notifications, 8 settings groups, 3 Zeus events and 3 FX stores. Contact and H.1 were empty and verified `NOT APPLICABLE`; the second apply was idempotent.

H.1 retains 90-day/5,000-event and 365-day/1,000 resolved-alert limits. H.2 remains append-only through database no-update/no-delete rules. `npm run backend:operations-persistence:test` proves cross-process Contact history, alert coalescing, audit idempotency, settings/analytics visibility, shared limits, restart durability and fail-closed behavior.

Repository-wide inspection found no `mongoose`, `mongodb`, `MongoClient`, `MONGODB_URI`, package dependency or deployment configuration. MongoDB is not an active runtime dependency.

## Staging

Staging uses its own Managed PostgreSQL database, public/private Spaces buckets, staff identities, sandbox PayFast profile, non-production SMTP recipients and supplier test credentials. It must never share production databases, buckets, sessions or staff password/token state.

## Object storage

`backend/storage/objectStorage.ts` exposes store/read/delete/public URL/signed-download operations. Product images and public Product PDFs now write through this boundary while preserving existing public API URLs; legacy local reads remain during migration. Metadata belongs in `media_objects` and `product_media` after Product cutover.

Public Product objects live in the public bucket without directory listing. Private invoice/internal objects live in a separate private bucket and require short-lived signed URLs after application authorization. Future invoice keys are isolated under `invoices/<invoice-number>/<hash>.pdf`.

Public and private buckets use separate limited Spaces keys (`OBJECT_STORAGE_PUBLIC_*` and `OBJECT_STORAGE_PRIVATE_*`) and separate clients. Staging/production reject a shared credential pair, identical bucket names, non-TLS endpoints and endpoints outside the configured DigitalOcean region. Object keys are immutable: an identical hash is idempotent and different bytes at an existing key fail closed. The deployment policy and cloud-negative-test checklist are in `docs/security/k-sec-r3.md`.

Enable Spaces versioning and a deletion-recovery policy. Content-addressed Product objects may use long immutable cache headers; private objects use `private, no-store`.

## Sessions, 2FA and secrets

The schema includes shared customer/staff sessions, staff pre-auth challenges, encrypted TOTP records and one-time recovery hashes. `STAFF_2FA_ENCRYPTION_KEY` remains external to the database. Database restoration without the matching key requires controlled 2FA re-enrollment. Customer/Auth, Staff/RBAC/2FA, catalogue, commerce and operational repositories are imported and switched in PostgreSQL mode. Production byte transfer and deployment verification remain; no structured domain cutover remains.

The final store matrix, deterministic object-byte rehearsal, migration compatibility review and retirement criteria are in `docs/persistence-final-verification.md`. The controlled deployment sequence and rollback gates are in `docs/production-cutover-runbook.md`.

## Jobs and process roles

Production web instances do not start supplier/FX schedulers. Scheduled work runs only when `APP_ROLE=worker`, or through a controlled App Platform Job/external schedule. Jobs must acquire a distributed lock and retain domain idempotency. Email retry, supplier refresh, reconciliation, cleanup, analytics aggregation and future invoice generation belong in this model.

## Health and shutdown

`GET /live` proves the process is alive. `GET /ready` checks required persistence configuration, PostgreSQL connectivity and object-storage bucket access. Supplier/provider outages do not fail global readiness. SIGTERM/SIGINT stops new requests, allows bounded drain and closes PostgreSQL connections. Staging/production PostgreSQL uses `DATABASE_SSL_MODE=verify-full` with one deployment-owned CA source (`DATABASE_SSL_CA`, `DATABASE_SSL_CA_BASE64`, or `DATABASE_SSL_CA_FILE`); missing CA or non-verifying TLS fails closed. Local PostgreSQL may use `disable`.

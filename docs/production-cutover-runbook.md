# Controlled production persistence cutover

This runbook is prepared guidance, not authorization to deploy.

## Pre-cutover

1. Freeze the approved application commit and record image/build identifiers.
2. Confirm distinct migration and runtime roles; verify `DATABASE_MIGRATION_URL` is assigned only to the migration job and `DATABASE_URL` only to web/workers, without printing either.
3. Confirm Managed PostgreSQL readiness, automated backups/PITR, distinct public/private Spaces buckets and limited keys, private listing denial, versioning and deletion recovery.
4. Create and record a pre-migration database backup/export and object inventory.
5. Verify the current schema version and run all structured imports and object migration in dry-run mode.
6. Resolve every mismatch, missing object and destination hash conflict before proceeding.
7. Confirm `PERSISTENCE_PROVIDER=POSTGRES`, `OBJECT_STORAGE_PROVIDER=SPACES`, canonical origins and `APP_ROLE` configuration on the candidate release.
8. Disable scheduled workers and place state-changing traffic in the approved maintenance/read-only posture.

## Migration

1. Run `npm run persistence:migrate` once as the migration role, then `npm run persistence:roles`; do not expose the migration URL to runtime components.
2. Run customer, staff, catalogue, commerce and operations imports with `--apply` in that order.
3. Run each canonical verifier and retain sanitized output/fingerprints.
4. Execute the object manifest against Spaces, verify SHA-256, access class, key and metadata relationships, then rerun to prove idempotency.
5. Seed/verify the yearly order sequence above historical order numbers.
6. Deploy the approved application in PostgreSQL/Spaces authoritative mode; do not enable JSON fallback.
7. Verify `/live` and `/ready` before admitting traffic. Start one controlled worker only after web readiness passes.

## Post-cutover smoke tests

- Customer login/logout/session revocation and password reset safety.
- Staff login, mandatory 2FA, RBAC grant/revocation and last-Super-Admin protection.
- Published Product and media/document retrieval without supplier leakage.
- Existing order/payment read and payment configuration; do not initiate an unintended charge.
- Contact persistence/reply using a controlled non-customer recipient.
- H.1 alert lifecycle and H.2 redacted append-only audit.
- Inventory/reservation concurrency and SupplierOrder read.
- Shared rate-limit accumulation across two instances.
- Public object retrieval and authorized private signed retrieval.

## Rollback triggers

Rollback is required for canonical verification mismatch, missing/corrupt financial or inventory state, broken auth/session/2FA, unsafe authorization, repeated readiness failure, object hash/reference mismatch affecting published Products, duplicate business identifiers, or evidence of partial external side effects.

## Rollback

1. Stop traffic and workers; preserve logs, import manifests and database evidence.
2. Disable affected feature flags and prevent new external writes.
3. If schema remains backward-compatible, restore the prior application image against the same additive schema.
4. If imported data is invalid, restore the isolated pre-cutover database backup to a new database and point the prior approved release to it. Never destructively overwrite the failed database during investigation.
5. Restore matching object versions/manifest when object state changed.
6. Verify readiness, auth, orders/payments, inventory, Contact and media before reopening.
7. Keep legacy snapshots read-only through the rollback window; data repair uses a separately reviewed forward migration.

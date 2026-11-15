# Backup and disaster recovery

Use Managed PostgreSQL automated daily backups with point-in-time recovery where the selected plan supports it. Target RPO is at most 24 hours without PITR and 15 minutes with PITR; target RTO is four hours for database recovery and one hour for an application-only rollback. Retain daily backups for at least 14 days and monthly verified exports for 12 months according to legal/financial policy.

Quarterly, restore the latest backup into an isolated non-production database, run migrations/readiness/count reconciliation and verify representative orders, staff 2FA ciphertext, inventory ledger totals, Contact history, audit and alerts. Never test restore by overwriting production.

Enable Spaces versioning and deletion recovery. Public Product media may be reconstructed only when source rights/evidence remain available; private invoices and customer documents require independent retention and must not rely on regeneration alone.

Backups/restores run with a separately controlled operator identity, never the application runtime role. Restores into an isolated target reapply the migration/runtime role bootstrap and privilege-negative tests before traffic. Spaces recovery preserves access class and content hash; restored private objects remain private and are validated through exact-key signed access only.

Incident responses:

- Database failure: stop writes if failover is unavailable, restore/fail over, verify counts and financial/inventory invariants, then reopen traffic.
- Bad deployment: disable flags/workers, roll back the image against compatible schema, retain new columns, and use a forward repair migration if needed.
- Object deletion: restore the prior object version and verify its stored SHA-256 metadata.
- Compromised instance: rotate database/object/provider/session secrets, revoke sessions, replace instances from a clean image, and review H.1/H.2 evidence.
- Lost TOTP key: restore the correct key from secret backup. If unavailable, revoke staff sessions and perform controlled, audited 2FA re-enrollment; ciphertext cannot be recovered.
- Lost application secret: rotate through secret management and redeploy; never patch a running container.

Provider backup is not the procedure by itself. Every restore records operator, source backup, target environment, timestamps, checks performed and outcome without logging credentials or customer content.

Local and quarterly restore rehearsals use a separate database. Record table counts and canonical domain fingerprints, create a custom-format `pg_dump`, restore with `pg_restore --no-owner --no-privileges` into the isolated target, run migrations and all canonical verifiers, and compare IDs, foreign-key relationships, financial/inventory invariants and sequence state. Never overwrite the source database.

Object recovery follows metadata/hash reconciliation rather than destructive directory synchronization. See `docs/persistence-final-verification.md` for the database-only, object-only and consistent-point recovery cases.

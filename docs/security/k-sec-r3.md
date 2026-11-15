# K.SEC-R3 database and object-storage privilege model

## PostgreSQL identities

- `DATABASE_MIGRATION_ROLE` owns the application database/schema and is used only by the controlled migration/role-bootstrap job through `DATABASE_MIGRATION_URL`. Its role search path is `public, pg_catalog` so migration DDL targets the owned application schema.
- `DATABASE_RUNTIME_ROLE` is the non-owner login used by web and worker components through `DATABASE_URL`.
- Runtime is `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`, uses `pg_catalog, public`, has `USAGE` on `public`, application DML, sequence use, and explicitly approved functions only. It has no migration-ledger access or DDL.
- `admin_audit`, `commerce_invoices`, `commerce_invoice_documents`, and `commerce_customer_delivery_attempts` additionally deny runtime update/delete. Database triggers and constraints remain defense in depth.
- `PUBLIC` receives no application schema creation, table/sequence grants, or function execution. Application functions use a fixed `pg_catalog, public` search path and are not security definers.
- Migration-owned default privileges grant future application tables/sequences to runtime while future functions require explicit review.

Provision both login roles through the managed-database administrator/control plane with the safe attributes above. The application script intentionally cannot create roles or rotate passwords. Grant bootstrap is idempotent:

```bash
npm run persistence:migrate
npm run persistence:roles
```

Never run these from web startup. Rotate migration and runtime passwords independently and update only the component that owns each secret.

## DigitalOcean Spaces identities

Use two different limited access keys and two different buckets:

- public application key: scoped only to the public bucket with the provider's bucket Read/Write/Delete bundle;
- private application key: scoped only to the private bucket with the provider's bucket Read/Write/Delete bundle.

DigitalOcean limited keys bundle write and delete, so application immutability is enforced with content-addressed keys, pre-write `HEAD`, hash metadata, no overwrite, H.2 evidence and Spaces versioning/deletion recovery. No credential is shared across buckets. The application never performs bucket listing.

Public policy: anonymous exact-object `GET` only; no anonymous listing/write/delete. CORS permits only `GET`/`HEAD` from the exact canonical storefront origin. Public writes explicitly set public-read object ACL.

Private policy: no anonymous operation, no CORS, private object ACL, application-authorized exact-key signed `GET` only. Signed URLs default to 300 seconds and are constrained to 30–900 seconds. Do not log signed URLs.

The configured endpoint must be TLS and exactly `https://<region>.digitaloceanspaces.com`. Public/private bucket names must differ.

## App Platform secret allocation

| Component | Database secret | Object-storage secret |
| --- | --- | --- |
| web | runtime URL only | public + private limited application keys |
| worker | runtime URL only | only keys required by its assigned jobs |
| migration job | migration URL; runtime URL only while bootstrapping the runtime login | none |
| backup/restore job | separately controlled backup identity | separately controlled recovery credentials |

## Staging/production release proof

Before traffic, run `npm run backend:privilege:test` against an isolated restored/staging database and prove runtime can perform representative DML, sequences and advisory locks but cannot create/alter/drop tables, create roles/functions, own schema/database, or read `schema_migrations`. Prove migrations succeed only with the migration identity.

Using disposable non-business object keys, prove: public exact GET succeeds; anonymous/public listing fails; anonymous private GET/list/write/delete fail; the public credential cannot access the private bucket; the private credential cannot access the public bucket; changed bytes cannot overwrite an existing key; signed private exact GET succeeds only before expiry. Verify object versioning, access logs and deletion recovery in the provider control plane. These live cloud-negative tests are deferred to the K.2 deployment gate and are not run by local K.SEC-R3 validation.

Object migration must compare key, access class, byte size and SHA-256 before associating metadata. A conflicting destination fails closed; rerunning identical content is idempotent. Database and object restore rehearsals remain isolated and follow `docs/disaster-recovery.md`.

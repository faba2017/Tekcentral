# Deployment and rollback strategy

## Pipeline

Feature branch → review → locked dependency install → lint/typecheck/all backend security and commerce suites → production build → migration validation → staging migration/deploy/smoke test → approved production migration job → rolling App Platform deployment → readiness gate.

Builds derive only from a Git commit, lockfile and environment configuration. Production instances are never edited manually. Managed rolling replacement is standard; blue/green is reserved for high-risk releases.

## Rollout

Use expand/contract migrations. Run additive migrations once as a controlled job before the compatible application rollout. Old and new instances share PostgreSQL, Spaces, sessions and distributed controls. Readiness removes instances whose authoritative persistence is unavailable.

Feature flags are persisted by key and environment. Risky supplier, checkout or Zeus paths ship disabled and are enabled only after staging/controlled verification. Flags do not replace authorization or business safety checks.

## Rollback

Rollback the application to the prior known-good image only while its schema remains compatible. Never reverse a destructive data migration under live traffic. Disable the affected feature flag, stop workers, preserve evidence, restore the prior image and verify `/ready`. If data repair is required, use a separately reviewed forward repair migration. Blue/green may keep the prior environment warm for exceptional releases but should not become a permanent duplicate cost.

## Environment separation

Development, test, staging and production use distinct databases, buckets, origins, mail behavior, payment profiles and credentials. Staging never points to production state. Production secrets are managed in App Platform and rotate without code changes; rotation of the TOTP key requires a controlled decrypt/re-encrypt migration.

The App Platform migration job alone receives `DATABASE_MIGRATION_URL`; web and worker components receive only the restricted runtime URL. Migration identity validation uses the configured role names and no longer requires the runtime URL. Public and private object-storage credentials are separate and bucket-scoped. A release gate must reject a runtime database owner/DDL capability, missing CA-verified PostgreSQL TLS, shared Spaces credentials, identical bucket names, non-TLS or unexpected Spaces endpoints, public private-object access, and bucket listing. The unapplied K.2 staging component contract is documented in `docs/k2-staging-deployment.md`.

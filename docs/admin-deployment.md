# Admin deployment preparation

Canonical production origins:

- Storefront: `https://tekcentral.co.za`
- Admin: `https://admin.tekcentral.co.za`

Local development retains `/admin/...` on `127.0.0.1`. Production configuration requires non-secret `ADMIN_ORIGIN=https://admin.tekcentral.co.za`; `VITE_ADMIN_HOST=admin.tekcentral.co.za` prepares host-relative frontend links. Staff email links use `ADMIN_ORIGIN`. Staff cookies remain host-only because no `Domain` attribute is set.

The minimum-risk deployment target is a dedicated Admin frontend deployment/build output backed by the same source modules and API, rather than shipping Admin as the canonical `/admin` surface in the storefront deployment. The storefront deployment should return 404 for `/admin` after the dedicated Admin entry output is configured. DNS, TLS, CSP and deployment are outside RBAC Phase 3.

The Admin backend mutation boundary accepts only the configured Admin origin in production. Customer and staff cookies have distinct names and cannot authenticate the other security domain.
# Staff two-factor deployment

Set `STAFF_2FA_ENCRYPTION_KEY` through backend secret management to a random value that decodes to exactly 32 bytes (64 hexadecimal characters or base64). Never place it in Vite variables or source control. Backup and restore procedures must preserve this key with encrypted staff-auth records; losing it requires 2FA re-enrollment. Rotation is a future controlled migration, not an environment-only key replacement.

Production Admin uses the same shared PostgreSQL and object-storage infrastructure as the backend domain layer, with its own canonical origin and host-only cookie. Run schema migrations as a controlled deployment job before rolling web replacement. Web instances use `APP_ROLE=web`; scheduled reconciliation/supplier work uses a single controlled worker/job role with distributed locking.


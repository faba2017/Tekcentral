# Production readiness inventory

This document is the canonical application-level production dependency inventory. It does not authorize deployment, live payments, supplier writes, DNS changes, or public launch.

## Current controlled-validation status

- SMTP transport variables are present locally. A non-sending connection/authentication check passed on 2026-10-29. Department aliases (`info@`, `sales@`, `accounts@`, `support@`) are **not production-accepted** until each is sent once to an explicitly approved controlled recipient and receipt/From/Reply-To are verified. No silent sender fallback is permitted.
- Public Contact routing is deterministic: General → `info@`, Sales/Product/Business → `sales@`, Billing → `accounts@`, Support/Orders/Returns/Technical → `support@`. Persistence-before-send, truthful delivery state, idempotent Admin reply/retry, and no-duplicate behavior are covered by automated tests. Live messages were not sent in Phase I because no controlled recipient was supplied.
- Password reset is enumeration-safe, reCAPTCHA-gated, hash-only at rest, single-use, one-hour expiry, and revokes active sessions. Mail now explicitly uses the canonical Support sender and Reply-To. A live receipt/reset was not performed because no controlled account/recipient was supplied. Production must set `PUBLIC_STOREFRONT_ORIGIN=https://tekcentral.co.za`.
- Registration currently does not send verification or welcome email. Phase I does not invent an email-verification workflow.
- PayFast remains sandbox-isolated. Live credentials are absent and live mode was not enabled.
- Syntech feed reads are configured, while reseller order writes remain disabled. Manual procurement is the operational fallback.

## Production environment variables

Classification combines lifecycle and exposure. `SECRET` values belong only in backend secret storage; `PUBLIC` values may be compiled into the storefront.

| Variable | Requirement | Exposure | Production purpose |
| --- | --- | --- | --- |
| `NODE_ENV=production` | REQUIRED | PUBLIC runtime | Production security/cookie/error behavior |
| `APP_ENV`, `APP_ROLE` | REQUIRED | PUBLIC configuration | Environment separation and `web`/`worker` process role |
| `PERSISTENCE_PROVIDER=POSTGRES`, `DATABASE_URL`, `DATABASE_SSL_MODE`, `DATABASE_POOL_MAX` | REQUIRED | `DATABASE_URL` SECRET | Managed PostgreSQL connection and bounded pool |
| `OBJECT_STORAGE_PROVIDER=SPACES`, `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_REGION`, `OBJECT_STORAGE_PUBLIC_BUCKET`, `OBJECT_STORAGE_PRIVATE_BUCKET`, `OBJECT_STORAGE_PUBLIC_BASE_URL` | REQUIRED | PUBLIC configuration | Durable public/private object storage |
| `OBJECT_STORAGE_ACCESS_KEY`, `OBJECT_STORAGE_SECRET_KEY` | REQUIRED | SECRET | Spaces credentials, backend only |
| `STAFF_2FA_ENCRYPTION_KEY` | REQUIRED, PRODUCTION_ONLY | SECRET | Random 32-byte key for AES-256-GCM protection of staff TOTP secrets; backups/restores require the same key |
| `HOST` / `PORT` | REQUIRED by runtime | PUBLIC runtime | Platform bind address and assigned port; do not assume temporary QA ports |
| `PUBLIC_STOREFRONT_ORIGIN` | REQUIRED, PRODUCTION_ONLY | PUBLIC | `https://tekcentral.co.za`; password-reset links and trusted customer origin |
| `PUBLIC_APP_URL` | REQUIRED, PRODUCTION_ONLY | PUBLIC | Storefront callback origin for PayFast |
| `PUBLIC_API_URL` | REQUIRED, PRODUCTION_ONLY | PUBLIC | Public HTTPS API/ITN origin |
| `APP_PUBLIC_BASE_URL` | REQUIRED, PRODUCTION_ONLY | PUBLIC | Canonical sitemap/base URL |
| `VITE_API_BASE_URL` | REQUIRED, PRODUCTION_ONLY | PUBLIC | Browser API base; public HTTPS backend |
| `VITE_PUBLIC_API_URL` | OPTIONAL | PUBLIC | Public API override where used by frontend assets |
| `PAYFAST_MODE` | REQUIRED | PUBLIC configuration | Keep `sandbox` until separately approved live cutover |
| `PAYFAST_SANDBOX_MERCHANT_ID`, `PAYFAST_SANDBOX_MERCHANT_KEY`, `PAYFAST_SANDBOX_PASSPHRASE` | REQUIRED for staging | SECRET | Isolated sandbox profile |
| `PAYFAST_LIVE_MERCHANT_ID`, `PAYFAST_LIVE_MERCHANT_KEY`, `PAYFAST_LIVE_PASSPHRASE` | PRODUCTION_ONLY, launch blocker | SECRET | Live profile; never place in Vite variables |
| `PAYFAST_TRUST_PROXY` | REQUIRED deployment decision | PUBLIC configuration | Enable only for a trusted terminating proxy |
| `PAYFAST_DEBUG_SIGNATURE` | DEVELOPMENT_ONLY | PUBLIC configuration | Must be false/absent in production |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | REQUIRED | SECRET except port/secure | Authenticated production SMTP transport |
| `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME` | REQUIRED | PUBLIC identity | Default operational identity; aliases still require provider authorization |
| `OPERATIONS_NOTIFICATION_EMAIL`, `FX_PRICING_NOTIFICATION_EMAIL` | REQUIRED for those alerts | PRIVATE configuration | Controlled internal recipients |
| `VITE_RECAPTCHA_SITE_KEY` | REQUIRED | PUBLIC | Browser site key |
| `RECAPTCHA_SECRET_KEY` | REQUIRED | SECRET | Backend verification only |
| `RECAPTCHA_MIN_SCORE`, `RECAPTCHA_ALLOWED_HOSTNAMES` | REQUIRED, PRODUCTION_ONLY | PUBLIC configuration | Explicit threshold and `tekcentral.co.za,www.tekcentral.co.za` |
| `RECAPTCHA_TEST_BYPASS` | DEVELOPMENT_ONLY | PUBLIC configuration | Must be false/absent; production code fails closed regardless |

## HTTP boundary gate

Production startup fails unless `PUBLIC_STOREFRONT_ORIGIN` and `ADMIN_ORIGIN` are distinct public HTTPS origins. Localhost remains accepted only in development. Production also rejects enabled PayFast signature diagnostics and the reCAPTCHA test bypass. The application enforces separate storefront/Admin CSPs, HSTS in production, anti-framing, referrer and permissions policies, global MIME sniffing protection, trusted-origin credentialed CORS, safe unknown-error envelopes and shared no-store handling for authenticated/private APIs. Public immutable Product media remains cacheable. DigitalOcean forwarded-header behavior is still a staging acceptance dependency and is not treated as trusted merely because these application controls are present.

Vite development and preview apply the document security policy for local functional acceptance. If production serves `dist/` as a static component, App Platform must attach the same CSP/HSTS/frame/referrer/permissions/nosniff headers at the static edge; staging must verify the effective response headers before launch.
| `ZEUS_ENABLED`, `ZEUS_PROVIDER`, `ZEUS_DIGITALOCEAN_MODEL` | REQUIRED for Zeus | PUBLIC configuration | Provider selection/model identity remains server-internal to customers |
| `ZEUS_DIGITALOCEAN_API_KEY`, `ZEUS_QUOTA_HASH_KEY` | REQUIRED for production Zeus | SECRET | Inference authentication and pseudonymous quota hashing |
| `ZEUS_*_LIMIT`, `ZEUS_COOLDOWN_SECONDS`, `ZEUS_DUPLICATE_WINDOW_SECONDS`, `ZEUS_GUEST_ENABLED` | REQUIRED policy decision | PUBLIC configuration | Abuse/cost guardrails |
| `CJ_API_KEY` | REQUIRED when CJ enabled | SECRET | Read/write supplier adapter authentication |
| `CJ_REAL_ORDER_CREATION_ENABLED` | REQUIRED safety flag | PUBLIC configuration | Default false; enable only for explicitly controlled writes |
| `SYNTECH_ENABLED`, `SYNTECH_FEED_FORMAT`, `SYNTECH_*_SYNC_INTERVAL_HOURS` | REQUIRED when Syntech enabled | PUBLIC configuration | Read-side feed scheduling |
| `SYNTECH_FULL_FEED_URL`, `SYNTECH_UPDATE_FEED_URL` | REQUIRED when Syntech enabled | SECRET | Private feed URLs/account key material |
| `SYNTECH_UAT_ORDER_WRITES_ENABLED`, `SYNTECH_RESELLER_API_ENVIRONMENT` | OPTIONAL until controlled UAT | PUBLIC configuration | Canonical write flag remains false/UAT-gated; legacy enabled alias is compatibility-only |
| `SYNTECH_UAT_CREDENTIAL`, `SYNTECH_UAT_BASE_URL`, `SYNTECH_UAT_USERNAME` | OPTIONAL until controlled UAT | SECRET | Canonical controlled-UAT configuration; legacy token/base URL aliases remain compatible |
| `SYNTECH_RESELLER_PROD_TOKEN`, `SYNTECH_RESELLER_PROD_BASE_URL` | NOT CURRENTLY OPERATIONAL | SECRET | Future production adapter gate |
| `GOOGLE_ADDRESS_VALIDATION_API_KEY` | REQUIRED for production address validation | SECRET | Backend address validation |
| `VITE_GOOGLE_MAPS_API_KEY` | REQUIRED for Places UX | PUBLIC, restricted | Restrict by production web referrers and API |
| `FX_SCHEDULER_ENABLED` | OPTIONAL | PUBLIC configuration | Explicit scheduler override |

## Worker and procurement safety gate

Production web services must use `APP_ROLE=web`; scheduled-work services must use `APP_ROLE=worker`. Syntech and FX scheduled executions use stable, non-blocking PostgreSQL advisory locks and therefore remain correct if two workers overlap, although one worker replica is recommended initially. Scheduler flags and process roles are deployment-owned environment values with no customer/Admin mutation endpoint.

Production launch must preserve the server-owned procurement capability policy. Scoop, Mustek and TVR use operationally accepted manual procurement; Syntech retains the same manual fallback independently from its separately gated UAT API capability; CJ is controlled and unpaid with manual downstream handling; TekCentral internal fulfilment is supported. Order creation revalidates procurement and fails closed before payment when no accepted path remains.

Secondary multi-instance review: Contact and Admin AI production rate limits use PostgreSQL. Zeus/CJ/Syntech process-local maps provide short-lived coalescing, cache or same-process protection only and do not replace provider quotas, durable idempotency or scheduler locks. No additional distributed limiter is a K.SEC-R4 staging blocker under the current bounded endpoints and provider-side controls; replica count and provider quota telemetry remain deployment acceptance checks.

Current local replacement requirements: storefront reset origin is missing; app/browser API origins remain local; PayFast is sandbox; live PayFast profile is absent; reCAPTCHA hostname and threshold are relying on defaults/absence rather than explicit production values; the Syntech UAT credential/base URL are configured locally but the canonical UAT order-write flag remains disabled and production API ordering is unavailable. No secret values are documented here.

## Persistence inventory and deployment risk

Current repositories use atomic local JSON and local files under `.data`. DigitalOcean App Platform container filesystems must be treated as ephemeral unless a separately designed durable service is attached. The following must not silently disappear on redeploy:

| Domain | Current store | Production classification |
| --- | --- | --- |
| Orders, payment/ITN evidence, shipping quotes, carts | `orders.json`, `payfast-itn-events.json`, `shipping-quotes.json`, `carts.json` | MUST MIGRATE BEFORE PRODUCTION |
| Customer and staff accounts/sessions/resets, guest access/claims | `customer-accounts.json`, `staff-auth.json`, `guest-order-access.json`, `customer-order-claims.json` | MUST MIGRATE BEFORE PRODUCTION |
| SupplierOrders, mappings, catalogues, manual inventory/replenishment | supplier JSON stores | MUST MIGRATE BEFORE PRODUCTION; supplier feeds may be rebuilt, but mappings/history/reservations cannot |
| Product source, pricing, publications, merchandising, business settings | Product/pricing/publication/settings JSON stores | MUST MIGRATE BEFORE PRODUCTION |
| Contact conversations and internal notifications | Contact/notification JSON stores | MUST MIGRATE BEFORE PRODUCTION |
| Operational alerts, Admin audit, analytics, integration history, Zeus usage, FX evidence/runs | operational JSON stores | MUST USE DURABLE STORAGE; analytics/health snapshots may be intentionally retained for bounded periods |
| Controlled Product images and documents | `.data/public-assets/products`, `.data/public-assets/documents`, image records | MUST MOVE TO DURABLE OBJECT STORAGE before production |
| CJ authentication cache | `cj-auth.json` | May remain ephemeral if safely regenerated; credentials remain environment-managed |

The PostgreSQL schema, versioned migration runner, Spaces abstraction, dry-run inventory, readiness and verification commands are prepared. Existing repositories still require domain import/verification/provider cutover before production. Local `.data` remains prohibited as production authority.

## Privileged Admin surface inventory

Production staff authentication now protects every Admin page and `/api/admin` endpoint through a current staff session, granular route/action policy and mandatory TOTP for Super Admin/high-risk access. Remaining launch checkpoints are deployment of the dedicated Admin host, durable staff storage, distributed rate limiting and the final production security audit.

## Production checks after deployment

1. Restart/redeploy the backend after every backend build or environment change; the canonical local port is `8787`, but production must use the platform-assigned `PORT`. Port `8788` is QA-only and is not configured anywhere.
2. Verify CSP permits only required reCAPTCHA/Google Maps/PayFast/provider origins, and confirm reCAPTCHA hostname validation fails closed.
3. Verify `/robots.txt`, `/sitemap.xml`, canonical metadata, private-route `noindex`, Product structured data, and Organization JSON-LD on the public hostname.
4. Submit Search Console sitemap only after deployment and public smoke tests.
5. Perform controlled SMTP alias, password-reset receipt, PayFast live-profile configuration, shipping, account, Contact, and storefront smoke tests before launch.

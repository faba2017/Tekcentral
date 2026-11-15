# K.2 DigitalOcean staging deployment contract

K.2C prepares the application contract only. No DigitalOcean resource, DNS record or credential has been created. The approved project is `tekcentral-staging`; App Platform uses Frankfurt `fra`, while PostgreSQL and Spaces use `fra1`.

## Source and component contract

The canonical repository is `faba2017/Tekcentral` (`git@github.com:faba2017/Tekcentral.git`). The repository currently has only `main`, so staging uses `main` with `deploy_on_push: false` for controlled releases. A remote `staging` branch is not invented by K.2C. All components build from `/`.

| Component | Build | Run | Health |
| --- | --- | --- | --- |
| Storefront | `npm ci && npm run frontend:production:build` | `npm run frontend:serve:storefront` | `/ready` |
| Admin | `npm ci && npm run frontend:production:build` | `npm run frontend:serve:admin` | `/ready` |
| API | `npm ci && npm run backend:build` | `node backend-dist/backend/server.js` with `APP_ROLE=web` | `/live`, `/ready` |
| Worker | `npm ci && npm run backend:build` | `node backend-dist/backend/server.js` with `APP_ROLE=worker` | App Platform process state/logs |
| Migration | `npm ci && npm run backend:build` | `npm run persistence:migrate && npm run persistence:roles` | exit status |

The proposed, unapplied manifest is `.do/staging-app.yaml.example`. Its authority-based ingress keeps Storefront, Admin and API on their approved hostnames while retaining separate components. Secret values are deliberately omitted.

## Frontend serving and headers

`backend/staticFrontendServer.ts` serves only built `dist/` files. It provides Storefront and Admin profiles through the shared `backend/httpSecurity.ts` policy. It has no Vite/HMR runtime. HTML is non-cacheable, hashed Vite assets are immutable for one year, other assets revalidate after one hour, and missing file-like requests do not fall back to the SPA. API paths, dotfiles, malformed paths, traversal, source maps and files outside `dist/` return a safe 404. `/live` and `/ready` are dependency-free component checks.

The Admin profile excludes Storefront Maps, reCAPTCHA and PayFast form origins. Both strict profiles emit CSP, HSTS, nosniff, frame denial, referrer and permissions policies. Vite development continues to use the existing development CSP and React Refresh allowances; production builds explicitly disable source maps.

## PostgreSQL TLS and identity separation

Local development normally uses `DATABASE_SSL_MODE=disable`. Staging and production require `DATABASE_SSL_MODE=verify-full` and exactly one CA source:

- `DATABASE_SSL_CA`: PEM contents, including escaped newlines when necessary;
- `DATABASE_SSL_CA_BASE64`: base64-encoded PEM contents; or
- `DATABASE_SSL_CA_FILE`: an approved mounted/local CA path.

The CA is never committed. PostgreSQL receives `rejectUnauthorized: true`; `pg` supplies the database hostname as SNI/server identity. URL SSL query parameters are removed before the explicit verified TLS configuration is applied so `sslmode=require` cannot silently replace it with non-verifying behavior. Missing/invalid CA or an unsafe mode fails configuration before connection.

Web and worker receive `DATABASE_URL` only. The migration job receives `DATABASE_MIGRATION_URL`, `DATABASE_RUNTIME_ROLE` and `DATABASE_MIGRATION_ROLE`; it no longer needs the runtime URL merely to compare identities. Both login roles are provisioned through the managed control plane. The pre-deploy job applies migrations through `0016`, then idempotently applies least-privilege runtime grants. Runtime never provisions roles or receives migration credentials.

## Environment allocation

- **Storefront:** public API URL, Storefront/Admin host build values, public media origin, optional restricted public CAPTCHA/Maps keys. No server secret.
- **Admin:** public API URL, Admin host build value, public media origin, optional restricted public CAPTCHA key. No server secret.
- **API:** runtime DB URL/roles/CA, origins, public URLs, separately scoped public/private Spaces keys, PayFast sandbox secrets and required application secrets. Never the migration URL.
- **Worker:** runtime DB URL/roles/CA and only the storage/provider credentials required by enabled jobs. Customer delivery, commerce reconciliation, FX scheduling, Admin AI automation, Syntech scheduling and external supplier writes remain explicitly disabled for initial staging. Never the migration URL.
- **Migration:** migration URL, role names and DB CA only. No storage, supplier, payment, SMTP or AI credentials.

Staging remains synthetic/sanitized. PayFast stays sandbox-only, SMTP customer delivery stays disabled, Syntech writes stay disabled, and no external supplier order is authorized.

## Health, readiness and proxy acceptance

API `/ready` checks PostgreSQL and required object storage without returning credentials. Storefront/Admin `/ready` proves the immutable build can be served. Worker readiness is process/component state plus safe logs; migrations use exit status.

App Platform proxy trust remains a K.2 live acceptance item. A temporary server-controlled diagnostic may record only socket peer, sanitized forwarded-for/proto and host metadata. It must default off, contain no cookies, tokens, query strings or customer data, and be removed/disabled after proving the actual chain. No hop count or forwarded client address is trusted before this proof.

## Provisioning gate

Before traffic: inject component-specific secrets, verify the app spec proposal, provision the managed CA as an encrypted secret, run migration/privilege tests, confirm effective headers and hostname ingress, prove `/ready`, perform Spaces isolation negative tests, and validate trusted-proxy behavior. DNS remains external and unchanged until App Platform supplies canonical targets.

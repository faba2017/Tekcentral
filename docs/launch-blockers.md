# TekCentral launch blocker register

This is the canonical launch blocker register. Update status here rather than scattering launch decisions across feature documents.

| Blocker | Status | Owner / dependency | Required before launch? | Next action |
| --- | --- | --- | --- | --- |
| Durable database architecture | COMPLETE | Persistence foundation | YES | Maintain normalized PostgreSQL schema and versioned migration runner |
| Domain data cutover to PostgreSQL | COMPLETE | Domain migration | YES | Customer/Auth, Staff/RBAC/2FA, catalogue, commerce and operations Cutovers A–E are complete against isolated local PostgreSQL; retain legacy snapshots through rollback |
| Persistence architecture final verification | COMPLETE | Persistence verification | YES | Final store matrix, cross-instance/failure suites, deterministic object rehearsal, restore process and production cutover runbook are prepared; remaining work is deployment-specific |
| Durable Product media/document object storage architecture | COMPLETE | Persistence foundation | YES | Spaces adapter and stable public read paths are prepared |
| Existing media byte migration and metadata cutover | PARTIAL | Media migration | YES | Product media metadata is PostgreSQL-authoritative; copy/hash-verify remaining legacy bytes into production object storage before launch |
| RBAC authorization foundation | COMPLETE | RBAC Phase 1 | YES | Maintain the canonical permission registry and role bundles |
| Staff authentication and secure sessions | COMPLETE | RBAC Phase 2 | YES | Preserve the existing owner account; do not rerun bootstrap |
| Full Admin route/action permission enforcement | COMPLETE | RBAC Phase 3 | YES | Maintain the route/action matrix and regression suite |
| Staff Management | COMPLETE | RBAC Phase 3 | YES | Maintain delegation, self-escalation and last-Super-Admin protections |
| Admin production hostname architecture | PREPARED | RBAC Phase 3 | YES | Deploy the prepared Admin host/build topology and configure DNS/TLS |
| Durable staff authentication persistence | COMPLETE | Persistence Cutover B | YES | Preserve the validated Staff/RBAC/2FA PostgreSQL repository and migration verification |
| Distributed rate-limit caller cutover | COMPLETE | Domain migration | YES | Customer/staff auth, Contact submission/reply and Zeus usage guards use shared PostgreSQL state in PostgreSQL mode |
| Staff 2FA and security hardening | COMPLETE | RBAC Phase 4 | YES | Maintain TOTP/recovery enforcement and migrate its records with staff auth |
| Final production/security audit | BLOCKED ON AUTH/PERSISTENCE | Security review | YES | Run after staff auth and storage architecture are complete |
| DigitalOcean deployment and CSP | NOT STARTED | Infrastructure | YES | Configure environment/secrets, routing, persistence, CSP and health checks without local-file assumptions |
| Production PayFast profile and verification | OPEN | Business/PayFast | YES | Add live secrets, verify callbacks/ITN/trusted proxy, then perform separately authorized live smoke payment |
| Production SMTP alias acceptance | OPEN | Mail provider/business | YES | Send one controlled message from info/sales/accounts/support and verify receipt, From and Reply-To |
| Password-reset live receipt | OPEN | Controlled customer recipient | YES | Test production-origin link, one-time token and session revocation with a controlled account |
| Explicit production origins and reCAPTCHA policy | OPEN | Deployment environment | YES | Set HTTPS origins, allowed hostnames, score threshold and restricted public keys |
| Live storefront/account/checkout/shipping smoke tests | NOT STARTED | Post-deployment QA | YES | Run controlled critical flows before public launch |
| Search Console submission | NOT STARTED | Marketing/operations | AFTER DEPLOYMENT | Verify robots/sitemap/canonical URLs, then submit sitemap |
| Syntech reseller API UAT automation | WAITING FOR UAT ENABLEMENT | Syntech | DESIRABLE, NOT MANDATORY | Keep manual procurement; when UAT arrives follow the controlled gate below |

## Accepted Syntech fallback

Syntech API automation is desirable before launch but is not mandatory if manual procurement is accepted and tested. Current write enablement remains off. Paid Syntech allocations may create internal SupplierOrders; staff approve them, place the order in the Syntech reseller portal, record the supplier reference, and continue the existing fulfilment workflow.

When UAT access is available: configure the UAT token/base URL, enable only the UAT write flag, select one controlled PAID SupplierOrder, obtain explicit authorization, create exactly one UAT order, persist the returned reference, prove idempotency and status/tracking reconciliation, and only then consider API-assisted procurement. Production Syntech order submission remains unavailable.

# System settings foundation

System settings use the existing `.data/business-settings.json` repository. Framework-owned domains are revisioned and audited per key. General, Pricing, Shipping, Notifications, and FX Automation are editable Settings domains.

Product and Supplier policy settings use the same revisioned repository. Each setting is described by a server-owned capability: `EDITABLE`, `READ_ONLY`, `ENVIRONMENT_MANAGED`, `SYSTEM_PROTECTED`, or `NOT_SUPPORTED`. The admin UI renders that capability and the configured value, effective value, source, and latest updater instead of inferring editability.

## Safety boundaries

- Backend definitions own type, validation, editability, risk and required-role metadata.
- High-risk updates require explicit confirmation and the current domain revision.
- Environment-managed credentials are returned only as configured/not configured status. Secret values and environment key names are not returned or audited.
- Hard commerce invariants are not exposed as settings.
- `GET /api/admin/system-health` reports only observed backend state. Configuration alone is never reported as healthy.
- Pricing and Automation share the pricing-policy revision because they update different views of one runtime policy record.
- Notification recipients resolve in one backend chain: saved setting, environment fallback, existing safe default.

## Configuration inventory

- Environment/secrets: CJ, PayFast and SMTP credentials remain environment-managed.
- Business settings: Pricing and Shipping retain their typed repository models and are edited only through Settings.
- Supplier configuration: remains in Supplier Hub and supplier repositories.
- Operational runtime state: sync, FX, notification and connection state remains in its owning services.
- Protected invariants: publication, cost privacy, precision and procurement safeguards are not editable.
- Admin-editable framework settings: General identity/defaults, Pricing policy, Shipping policy, FX Automation, and FX notification routing.
- Product policy: minimum content state and future supplier/SEO suggestion generation are configurable. Controlled primary images, short descriptions, approved prices, explicit staff publication, immutable versions, cost privacy, and financial precision remain protected invariants.
- Supplier policy: source-price and stock freshness thresholds are configurable and consumed by readiness, pricing, and dynamic availability checks. Catalogue scheduling and shared logistics freshness are explicitly unavailable until a real runtime authority exists.

## Operational separation

- `/admin/pricing` owns proposals, approvals, overrides, FX impact review, and price history.
- `/admin/settings/pricing` owns tax, margins, bands, rounding, reference-price and FX pricing policy.
- `/admin/settings/shipping` owns checkout shipping policy and the saved local rate card. Its estimator is a read-only diagnostic against saved configuration.
- Supplier catalogues, mappings, orders, evidence, sync history, and publication records remain outside Settings.
- Supplier capability and procurement-mode summaries are read-only registry facts in Settings; operational controls remain in Supplier Hub.

## Integrations

Settings -> Integrations separates configuration from health for CJ, the Scoop XML feed, SMTP, and the Frankfurter/ECB FX provider. Configuration state describes whether required values exist and who owns them; health comes from the canonical System Health service and never treats configured as healthy.

Integration fields declare server-owned capabilities: editable, read-only, environment-managed, secret, system-managed, or unsupported. CJ and SMTP credentials remain environment-managed and are never returned as plaintext. Provider endpoints remain fixed. The Scoop XML URL is the only editable endpoint and requires confirmation, revision matching, HTTPS, no credentials, the exact `scoop.co.za` host, and an XML path.

Connection tests are explicit staff actions. CJ performs a read-only provider settings request, Scoop downloads and parses without syncing, SMTP sends one clearly labelled message to the configured notification recipient, and FX fetches a transient USD/ZAR quote without persisting or reconciling prices. Sanitized test summaries are retained separately from business records.
System Health remains the canonical current-state snapshot. The Operational alerts check summarizes active persisted incidents; detailed lifecycle, aggregation and acknowledgement live under Admin → System Alerts rather than creating a second health model.

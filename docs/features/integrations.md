# Integration administration

Syntech reseller feeds are configured only through backend `SYNTECH_*` environment variables. Admin views expose configured booleans, JSON format, health, counts, and sanitized test results; feed URLs are credentials and are never returned. Testing performs one non-mutating update-feed request without retries.

TekCentral administers non-payment integrations at `/admin/settings/integrations`. PayFast and future payment gateways remain under Payments.

## Ownership

- CJ: fixed provider endpoint and environment-managed credential; operational catalogue, mappings, evidence, stock, and logistics remain in Supplier Hub.
- Scoop: revisioned HTTPS feed URL restricted to `scoop.co.za`; feed tests are read-only and refresh uses the existing catalogue sync path.
- SMTP: host, port, security mode, username, sender identity, and password are environment-managed. Alert recipients remain Notification settings.
- FX: Frankfurter / ECB and its endpoint are system-managed. Provider testing fetches a transient USD/ZAR quote; persisted refresh and reconciliation remain FX Automation/Pricing operations.

## Security and health

Secret values are never returned, displayed, copied, or written to business settings. Environment fields show only safe non-secret effective values and credential status. Scoop URL validation rejects non-HTTPS URLs, credentials, ports, alternate hosts, loopback/private destinations, and non-XML paths through an exact provider allowlist.

System Health is the canonical health model. Integration cards reuse those checks and display configuration separately. Test failures are normalized to authentication, rate-limit, timeout, invalid-response, not-configured, or connection categories without provider payloads, headers, stack traces, or credentials.

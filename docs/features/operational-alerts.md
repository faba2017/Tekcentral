# Operational alerts and incident history

TekCentral separates bounded operational events from actionable Admin alerts. Events are safe diagnostic history; repeated business-significant failures aggregate into one alert fingerprinted by type, subsystem, entity reference and diagnostic code.

Severity is bounded to `CRITICAL`, `WARNING` and `INFO`. Alert lifecycle is `OPEN`, `ACKNOWLEDGED`, `RESOLVED`; acknowledgement records that staff saw an issue and never claims recovery. Canonical state or an explicit permitted resolution resolves an alert. Existing payment, order, pricing and supplier stores remain authoritative.

The JSON-backed repository uses atomic replacement, retains detailed events for 90 days (maximum 5,000), and resolved alerts for 365 days (maximum 1,000). The abstraction is intentionally service-based so production persistence can move without changing callers.

Admin APIs and pages expose only sanitized summaries, bounded diagnostic codes and allowlisted internal deep links. They never expose raw requests, addresses, messages, reset/session values, credentials, signatures or provider authentication material. Alerts are unavailable through public, customer and Zeus APIs.

Payment initialization/callback verification, checkout order creation, checkout-blocking shipping failures, paid-order procurement failures, supplier refresh failures, Contact SMTP failures and Zeus provider failures are observed best-effort. Alert persistence failure cannot replace the original business error. Successful Contact delivery resolves its matching delivery alert; financial reconciliation remains state-driven in canonical payment/order workflows.

Production staff authentication and role enforcement remain a launch blocker. Current routes reuse the provisional internal Ops boundary; acknowledgement and resolution are write operations with the existing origin protection.
## Relationship to Admin Audit

Operational Alerts answer what is broken or needs attention now. Admin Audit / Activity answers what changed historically. Alert occurrences are not copied into audit; only meaningful lifecycle actions such as Ops acknowledgement and manual resolution are recorded there.

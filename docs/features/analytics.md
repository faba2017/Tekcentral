# Storefront analytics

TekCentral uses first-party, server-owned analytics for storefront operations. The public tracker records a fixed set of page, Product, search, checkout and heartbeat events. Successful cart additions are recorded by the canonical cart service, while orders and paid revenue come from the order repository.

An opaque HttpOnly cookie identifies an anonymous browser session. “Online” means activity during the last five minutes; inactivity of 30 minutes starts a new session. Guest and authenticated totals are aggregate audience categories only. No customer identifier is returned in reports.

Detailed anonymous activity is retained for 30 days and daily aggregates for 400 days. The store does not retain raw Zeus prompts, form values, payment details, IP addresses or session replay data. Search terms are sanitized and bounded. Marked automated tests and identifiable bots/headless clients are excluded.

Ops routes are `/admin/reports/analytics` and `/admin/reports/zeus`, with Today, 7-day and 30-day storefront periods. These routes currently follow the same provisional development admin-access convention as the rest of the Ops workspace; production staff authentication must protect the full admin surface before launch.

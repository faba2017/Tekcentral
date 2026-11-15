# Admin customers

The Customers workspace is a read-only registered-account support tool. Directory search, filters, sorting and pagination are server-side. Search accepts name, normalized email, phone and owned order number. An unclaimed guest order match is identified as a guest order and links to the existing order page without creating an account relationship.

Customer profiles provide Overview, Orders, Addresses, Returns & Refunds, Support, and Account / Zeus sections. Paid spend uses canonical `PAID` historical order totals. Orders retain purchased names, prices, quantities and delivery-address snapshots. Saved addresses remain a separate current-account list. Returns and support records are account-owned and paginated.

Explicitly account-linked Support rows may open the canonical Contact Inbox conversation. Full conversation bodies and reply controls remain in Contact Inbox rather than being duplicated into the customer profile.

The serializer excludes password hashes, sessions, reset records, guest credentials, raw Contact messages, supplier costs and service credentials. Zeus visibility is limited to session-scoped consent state and whether account assistance has previously been enabled. Password help links to the existing reset flow; deletion and privacy requests remain an escalation.

All routes live under `/api/admin/customers`. They currently share the Ops workspace's provisional development authorization convention. Production staff authentication and role authorization must protect the full admin surface before launch.

# Customer Accounts

Zeus Phase B can read the signed-in customer's recent orders, owned order details, tracking, returns/refunds and saved addresses through the existing account services. Identity is resolved from the HttpOnly session for every request; Zeus accepts no account identifier, email, owner or guest credential. These tools are read-only and address/profile changes remain in the account workspace.

The Contact page may prefill safe profile fields for a signed-in customer and list recent customer-owned orders for relevant support categories. The backend independently derives the account from the HttpOnly session and verifies exact order ownership; submitted account identifiers are ignored.

## Account A

- Customers can register, sign in, sign out, view and update their basic profile, request a password reset, and complete a single-use reset.
- Email identity is normalized case-insensitively. Passwords use salted scrypt hashes and are never returned.
- Authentication uses an opaque server-managed session. Only its hash is persisted; the browser receives an HttpOnly, SameSite=Lax cookie that is Secure in production.
- Password-reset tokens are cryptographically random, stored only as hashes, expire after one hour, and are revoked after use. Completing a reset revokes active customer sessions.
- Customer authentication is separate from admin, supplier, and payment-provider authentication. It grants no admin access.
- Guest checkout remains available. New orders may record the authenticated account ID from the server session, but historical guest orders are not linked by matching email.
- Account B adds persisted, account-owned South African delivery addresses. The first address becomes default; choosing another default clears the previous one atomically; deleting a default promotes the oldest remaining address.
- Address routes derive ownership from the authenticated session. Updating or deleting a saved address affects future checkout use only and never changes an order's delivery snapshot.
- Authenticated account-order APIs are server-paginated, newest first, and authorize solely with `order.customerAccountId === authenticatedCustomer.id`. Foreign and unknown orders share the same not-found response.
- Account order responses use the canonical customer-safe serializer and exclude supplier identity, procurement, cost basis, margin, internal notes, and admin data while retaining customer return/refund state.
- Historical guest orders are never linked by matching email. A future claiming workflow must prove order-specific ownership; Account B does not implement claiming.
- Guest order bearer access is separate from account authentication. Successful claim verification revokes the guest credential, after which only the owning authenticated account can access the order.
- `/account` provides Overview, Profile, and Addresses, plus the three most recent account-owned orders.
- `/account/orders` is the authenticated, server-paginated order history. `/account/orders/:orderNumber` is the authenticated detail view; both preserve account ownership checks and redirect expired sessions back through sign-in.
- Order detail uses immutable order-time item, customer, delivery, price, VAT, and shipping snapshots. It never substitutes current catalogue data for historical order data.
- Customer tracking is shown only from the normalized customer-safe tracking projection. Internal shipment notes, supplier allocations, procurement references, and operational records remain private.
- Existing return eligibility and customer-visible return/refund states are surfaced from the canonical order record. Buy Again remains deferred until current exact-variant purchasability can be reconstructed safely.
- Authenticated customers can claim a historical guest order through `/api/account/order-claims/request` and `/api/account/order-claims/verify`. The proof is a cryptographically random, 20-minute, one-time code sent only to the historical order email; order number or email matching alone never establishes ownership.
- Claim codes are stored only as SHA-256 hashes in the backend-only claim store and are scoped to the exact account and order. Successful verification atomically assigns an unowned order and records claim-requested, claim-verified, and order-claimed audit events without recording the code.
- Unknown, already-owned, and ineligible order requests use the same neutral response. Claim lookup and verification routes use the customer-auth rate limiter.
- Account mutation requests with an `Origin` header must come from the configured storefront, the canonical TekCentral origin, or a local development origin. SameSite=Lax, HttpOnly session cookies remain the primary browser boundary.
- Logout revokes the current server session and clears the cookie. Password reset revokes every active session for that account; expired and revoked sessions are rejected by all authenticated APIs.
- Production must set `PUBLIC_STOREFRONT_ORIGIN=https://tekcentral.co.za` and configure backend-only SMTP variables. Reset links are derived from that value and never hardcode the production hostname.
- Buy Again remains deferred because historical lines do not yet guarantee an exact current variant that is published, purchasable, and availability-safe.

Password-reset links use `PUBLIC_STOREFRONT_ORIGIN`. Reset messages explicitly use the canonical TekCentral Support sender and reply address through the backend-only SMTP configuration. Production receipt remains a controlled post-deployment validation and must not be inferred from local transport tests.

Account and guest-order personal-information handling is summarized publicly at `/privacy`. The policy describes account data, saved addresses, order ownership, sessions and service-provider processing without exposing authentication internals or customer records.

## Admin customer support

`/admin/customers` provides server-paginated registered-customer search by name, email, phone and owned order number. The profile reuses canonical order, return, refund, shipment, saved-address and account-linked Contact records. Guest orders remain separate until the secure claim flow persists account ownership. Staff cannot inspect passwords, reset/session tokens, guest credentials, raw Zeus conversations or provider payloads, and cannot mutate customer addresses or account state from this workspace.

Production staff authentication remains a launch blocker for the complete Ops workspace; the current admin routes retain the project's provisional development-only access convention.
# Zeus account-data consent

Authenticated customers are asked before Zeus processes account-derived order, tracking, return or saved-address information through the configured external AI service. Consent is versioned, scoped to the current server-managed session and checked before private tool execution. It can be declined or revoked from Zeus at any time without affecting public Product assistance or normal account functionality.

Consent does not include passwords, session credentials, payment credentials, supplier-private information, unrelated customer records or admin data. Existing ownership checks and minimal customer-safe serializers remain mandatory.

# Zeus account routing

Signed-out personal-order requests receive fixed login, account creation, and secure guest-order actions. Signed-in personal requests continue through server-derived account ownership and the existing current-session Zeus account-data consent boundary. No credentials or guest-order access tokens enter Zeus prompts or structured actions.
# Public account abuse protection

Account registration uses the `account_register` action and password-reset requests use `password_reset_request`. Both are server-verified before account or reset-token side effects. Login, authenticated account operations, and reset completion do not receive unnecessary reCAPTCHA friction. Password-reset responses remain enumeration-safe.


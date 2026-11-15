# Staff authentication and secure sessions

## Phase 3 enforcement and origins

Staff invitation and reset links derive from the production-required, non-secret `ADMIN_ORIGIN`. Admin mutations validate that origin in production. Every protected Admin page resolves session state before rendering, and every Admin API independently resolves the current account and effective permissions. The host-only `tc_staff_session` cookie remains isolated from customer authentication.

RBAC Phase 2 adds staff identities and sessions without merging them with customer accounts. A matching email may exist in both stores, but identities, password hashes, reset tokens, session cookies and authorization remain independent.

## First Super Admin bootstrap

At startup the backend reads `BOOTSTRAP_SUPER_ADMIN_EMAIL`, `BOOTSTRAP_SUPER_ADMIN_PASSWORD` and optional `BOOTSTRAP_SUPER_ADMIN_NAME`. It creates one active `SUPER_ADMIN` only when no Super Admin exists. The validated password is immediately hashed and never logged or persisted as plaintext. Repeated startup is a no-op. The initial account has `mustChangePassword=true`.

Remove `BOOTSTRAP_SUPER_ADMIN_PASSWORD` from runtime configuration after successful creation and restart. In PostgreSQL mode, staff identity and security state are authoritative in the normalized staff tables; `.data/staff-auth.json` is migration/reference-only. The validated existing Super Admin was imported without rerunning bootstrap or changing its credentials.

## Invite-only lifecycle

There is no staff registration route. Authorized invitation services validate Phase 1 delegation rules. Invitations use 256-bit tokens, persist only SHA-256 hashes, expire after 24 hours and are one-time. Resending revokes prior invitations; revocation preserves audit history. Active, invited and disabled email collisions never create duplicate identities.

Invitation and reset mail uses TekCentral Support. Token-bearing pages are noindex/nofollow, use a no-referrer policy, remove captured tokens from browser history and never place tokens in browser storage.

## Passwords and recovery

Staff passwords use salted scrypt and accept passphrases from 12 to 1,024 characters. Staff reset tokens are separate from customer resets, hash-only, one-time and expire after 30 minutes. Forgot-password responses are neutral; disabled and unknown accounts receive no actionable reset.

Changing a password requires the current password, rotates the current session and revokes every old session. Reset completion revokes every session. Bootstrap users are backend-blocked from non-auth Admin API work until they change the temporary password.

## Sessions

`tc_staff_session` is separate from the customer cookie. The raw token exists only in an HttpOnly, SameSite=Lax cookie, with Secure enabled in production; persistence stores only its SHA-256 hash. Sessions have a 12-hour absolute lifetime and a two-hour inactivity timeout. Each lookup resolves the current active account and current RBAC profile, so disablement and future permission changes take effect promptly.

State-changing staff-auth endpoints require a trusted origin in addition to SameSite cookies. In PostgreSQL mode, login, recovery, invitation and 2FA-sensitive callers use shared PostgreSQL rate-limit buckets while preserving their established thresholds. Local mode retains the process limiter for development.

## Two-factor authentication

Staff may enroll any RFC 6238-compatible authenticator app from Admin Account → Security. The setup secret and `otpauth://` URI are visible only until a valid six-digit code confirms enrollment. The secret is persisted only as AES-256-GCM ciphertext using `STAFF_2FA_ENCRYPTION_KEY`. Ten recovery codes are shown once and stored only as SHA-256 hashes; each is consumed atomically and regeneration invalidates the previous set.

For enabled accounts, password success creates a five-minute server-side pre-auth challenge with bounded attempts. It does not issue a staff cookie. A current-step TOTP (with ±1 step tolerance) or unused recovery code creates the normal 12-hour/two-hour-inactivity session. Replayed TOTP steps and reused recovery codes fail. There is no trusted-device bypass.

Non-mandatory accounts may defer setup for 7 or 14 days. Production Super Admin and staff whose current effective permissions contain a configured high-risk permission cannot defer and are restricted to Security setup/logout until enabled. High-risk status is derived live from effective permissions. WebAuthn is deferred; SMS and email OTP are not enabled factors.

The local JSON store remains a migration boundary, not a PostgreSQL-mode fallback. Production backup/restore must preserve both the encrypted records and the matching encryption key. Losing the key requires controlled staff re-enrollment; future key rotation must decrypt with the prior key and atomically re-encrypt with the new key.

Lost-authenticator recovery requires the current password plus an unused recovery code. There is no claim-based bypass. If the last Super Admin loses both factors, normal enforcement remains fail-closed; the production emergency procedure must use a separately approved, audited identity-verification and durable-store recovery process that revokes sessions and forces re-enrollment. That assisted workflow is intentionally not simulated in the local JSON phase.

Phase 4 requires the second factor at each new login session. A separate recent-factor step-up challenge for individual high-risk mutations is deferred to the durable-auth/final-security phase; ordinary authorization still checks live effective permissions and mandatory-2FA status on every Admin request.

## Audit, alerts and current boundary

Lifecycle actions project to H.2 with `STAFF_USER`, staff ID, display name and role. Bootstrap remains `SYSTEM`; automated jobs remain `SYSTEM`; provisional development access remains `OPS`. Routine failed passwords are not written to H.2.

Persistence failures, authentication-email outages and 2FA encryption/service failures use H.1 without credentials, codes, tokens or raw IP addresses. H.2 records enrollment, enable/disable, recovery-code use/regeneration and reminder deferral without sensitive values. Comprehensive Admin permission guards and Staff Management are active. Staff/RBAC/2FA persistence and auth rate-limit sharing are complete in PostgreSQL mode; Super Admin-assisted lost-factor recovery and the remaining non-auth persistence domains remain pending production work.

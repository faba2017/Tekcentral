# Staff RBAC foundation

## Phase 3 enforcement

All non-authentication Admin APIs now require a current active staff session and the route/action permission defined in `admin-authorization-matrix.md`. The server no longer uses provisional Ops authorization. Staff Management supports invitations, explicit role/grant/revocation changes, lifecycle actions and grouped effective-access review. Frontend guards and navigation visibility are convenience controls; backend checks remain authoritative. RFC 6238 2FA is enforced for production Super Admin and high-risk effective permissions. Staff account/authorization state is authoritative in PostgreSQL when that provider is selected; the canonical permission catalogue and role bundles remain code-defined.

RBAC Phase 1 defines TekCentral's backend-authoritative staff permission model. It does not create staff accounts, login, sessions, password reset, 2FA, Staff Management UI, or full Admin route enforcement.

## Canonical roles

Roles are default permission bundles rather than authorization shortcuts or permanent limits:

| Role ID | Display label | Purpose |
| --- | --- | --- |
| `SUPER_ADMIN` | Super Admin | Complete registered permission set through the normal resolver |
| `OPERATIONS` | Operations | Orders, fulfilment, suppliers, inventory, returns and operational alerts |
| `SUPPORT` | Sales & Customer Support | Customer/order assistance, Contact, tracking, return and refund requests |
| `CATALOGUE` | Catalogue, Pricing & Merchandising | Products, pricing approval, merchandising and supplier mapping |
| `FINANCE` | Finance & Accounts | Payments, approved refunds, commercial reporting and pricing visibility |
| `AUDITOR` | Auditor / Read Only | Broad read-only operational and reporting visibility |

Authorization logic must check permission IDs, never infer authority from a role name. `SYSTEM` is an automated audit actor and is not a staff role.

## Permission registry

`backend/staffRbac.ts` is the sole canonical registry. Every permission has a group, display label, description, risk (`READ`, `STANDARD`, `SENSITIVE`, or `HIGH_RISK`) and operation classification (`READ` or `MUTATION`). The registry groups Dashboard, Orders, Customers, Contact, Products, Pricing, Merchandising, Suppliers, Supplier Orders, Inventory, Returns, Refunds, Payments, Shipping, Reports, Alerts, Audit, Admin AI, Settings, Staff and Roles.

`admin_ai.use` is the non-mutating permission for the internal Admin AI assistant. `SUPER_ADMIN` receives it through the complete canonical bundle. Operations, Support, Catalogue, Finance and Auditor do not receive it by default; authorized staff administrators may grant or revoke it through the normal permission-override workflow. The permission alone never bypasses the Admin AI environment or persisted global switches.

High-risk permissions are:

- `roles.manage`
- `staff.assign_role`
- `staff.assign_permission_override`
- `settings.security`
- `settings.payments`
- `settings.suppliers`
- `settings.zeus`
- `payments.manage_config`
- `pricing.override`
- `refunds.execute`

No permission exposes provider credentials, card data, password data or other secrets.

## Effective permissions

A staff authorization profile contains `baseRole`, `grantedPermissions`, and `revokedPermissions`. Resolution is deterministic:

1. Start with the role bundle.
2. Add explicit grants.
3. Remove explicit revocations.

Revocation always wins if the same permission appears in grants and revocations. Lists reject malformed, unknown, or duplicate permission IDs; unknown roles fail closed. Effective permissions are deduplicated in a `Set`.

Per-user overrides avoid unnecessary custom roles. A Support staff member may receive `shipping.manage_fulfilment`, while an Operations staff member may have `inventory.adjust` revoked.

## Delegation invariants

The model prepares these Phase 2/Staff Management rules:

- A staff user cannot delegate a permission they do not possess.
- Assigning any role requires `staff.assign_role`.
- Assigning `SUPER_ADMIN` additionally requires `roles.manage` and future Super Admin-level policy enforcement.
- There must always be at least one active `SUPER_ADMIN` once staff lifecycle management exists.
- High-risk overrides require explicit privileged controls in the future Staff UI.

Phase 1 provides capability helpers. Phase 2 lifecycle services validate these rules for invitation, profile updates, disablement and last-Super-Admin recovery safety; the full Staff Management UI remains deferred.

## Backend and frontend boundaries

`backend/staffAuthorization.ts` creates staff contexts and centralizes `hasPermission`, `hasAnyPermission`, `hasAllPermissions`, and `requirePermission`. Phase 2 resolves authenticated contexts from the current server-side staff session and live account profile. A temporary provisional Ops context still preserves current development behavior; Phase 3 will enforce permissions across Admin routes/actions and remove that production compatibility path.

The context maps directly to H.2 audit fields: `actorType`, `actorId`, `actorLabel`, and `actorRole`. Current actions remain truthfully `OPS`; authenticated actions can later become `STAFF_USER`.

Future frontend permission checks may consume only effective IDs and are UX hints. They never authorize backend access.

## Current limitations

- Staff identities and secure sessions now exist through Phase 2.
- WebAuthn/passkeys are deferred.
- Super Admin-assisted lost-factor reset is deferred to durable persistence and final security review.
- Staff-sensitive authentication rate limiting is shared through PostgreSQL in PostgreSQL mode; local mode remains process-local for development.
- Last-active-Super-Admin disablement, demotion and critical-revocation protection is implemented.

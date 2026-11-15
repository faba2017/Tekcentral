# Admin authorization matrix

`backend/adminAuthorizationPolicy.ts` is the executable route/action policy. Every non-authentication `/api/admin/*` request requires a current staff session and one canonical permission. A missing policy fails closed.

| Admin area/action | Permission family |
| --- | --- |
| Dashboard | `dashboard.read` |
| Orders | Granular `orders.*` permission for read, notes, tracking, fulfilment, holds, cancellation and status |
| Customers | Granular `customers.*`; contact details require `customers.read_contact_details` |
| Contact Inbox | Granular `contact.*` for read, reply, retry, status and new conversations |
| Products | Granular `products.*` for read, create, edit, media and publication |
| Pricing | Granular `pricing.*`; supplier cost and margin require their explicit view permissions |
| Merchandising | `merchandising.read` plus the matching manage permission |
| Suppliers | Granular `suppliers.*`; cost and private stock require explicit view permissions |
| Supplier Orders | Granular `supplier_orders.*` |
| Inventory, returns and refunds | Matching granular `inventory.*`, `returns.*`, or `refunds.*` permission |
| Payments and shipping | Matching granular `payments.*` or `shipping.*` permission |
| Reports | Matching `reports.*` permission; financial reports are not implied by Dashboard access |
| Alerts and audit | Matching `alerts.*` and `audit.*` permission |
| Settings | Matching `settings.*` domain permission |
| Staff and roles | Matching `staff.*` and `roles.*` permission |

The response boundary removes customer contact details, supplier cost/private-stock fields, and margin fields unless the current staff session has the corresponding confidential-data permission. Frontend navigation and direct-route guards are UX controls only; the server is authoritative.

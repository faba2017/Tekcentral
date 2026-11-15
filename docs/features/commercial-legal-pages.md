# Commercial and legal pages

TekCentral publishes customer-facing policy pages at:

- `/terms`
- `/privacy`
- `/refund-policy`
- `/cancellation-policy`
- `/shipping-delivery`
- `/contact`

The footer and checkout review link to the canonical policy routes. Checkout uses concise acknowledgement copy and does not add a blocking checkbox because the established checkout contract did not previously model explicit terms acceptance. Payment, pricing, shipping, cancellation, return and refund behavior is unchanged.

Policy identity and public contact channels are centralized in `src/lib/public-business.ts`. The verified public channels are:

- General enquiries: `info@tekcentral.co.za`
- Customer support: `support@tekcentral.co.za`
- Sales: `sales@tekcentral.co.za`
- Billing and accounts: `accounts@tekcentral.co.za`
- Telephone: `+27 87 351 1146`

The confirmed registered identity is:

- Legal entity: `TEKCENTRAL (Pty) Ltd`
- Company registration number: `2026/701802/07`
- Registered address: `6 Parklands Main Road, Table View, Blouberg, 7441, South Africa`

The Contact page presents all channels and the complete registered identity. The footer uses the legal name, registration number, support, sales and telephone only, while checkout uses support and telephone. Policy pages select the appropriate channel from the same configuration and show the registered identity in their contact section.

The Contact page also submits validated, categorized enquiries to the persisted backend contact workflow. Department routing is server-controlled, SMTP uses the existing shared transport, and a successful customer response means the enquiry was persisted even when internal email delivery needs staff attention.

## PayFast merchant-verification checklist

| Requirement | Current result |
| --- | --- |
| Active website URL | Canonical URL configured as `https://tekcentral.co.za`; production deployment remains separate |
| Legal business name | Available: `TEKCENTRAL (Pty) Ltd` |
| Company registration number | Available: `2026/701802/07` |
| Registered physical address | Available in canonical public business configuration and rendered on Contact and policy pages |
| General contact email | Available: `info@tekcentral.co.za` |
| Customer support email | Available: `support@tekcentral.co.za` |
| Sales email | Available: `sales@tekcentral.co.za` |
| Billing email | Available: `accounts@tekcentral.co.za` |
| Telephone | Available: `+27 87 351 1146` |
| VAT registration number | Not required and intentionally not supplied; no VAT-registration claim is made |
| Product catalogue visible | Implemented |
| Clear product/cart/checkout pricing | Implemented; checkout shows subtotal, separate delivery, total and included VAT |
| Contact Us available | Implemented at `/contact` with verified department email addresses and telephone number |
| Terms & Conditions | Implemented at `/terms` |
| Privacy Policy | Implemented at `/privacy` |
| Refund Policy | Implemented at `/refund-policy` |
| Cancellation Policy | Implemented at `/cancellation-policy` |
| Shipping & Delivery Policy | Implemented at `/shipping-delivery` |
| Footer policy navigation | Implemented |
| Checkout policy navigation | Implemented on final review |

This checklist records website readiness only and does not claim PayFast approval.

Application-level launch blockers and production environment/persistence requirements are maintained centrally in `docs/launch-blockers.md` and `docs/production-readiness.md`.

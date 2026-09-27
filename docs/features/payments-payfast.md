# PayFast Payments

## CONFIRMED SANDBOX ARCHITECTURE

- PayFast is TekCentral's first payment gateway path.
- Phase 4.5 is sandbox-only.
- Checkout uses hosted PayFast redirect, not onsite card collection.
- Server-side code generates PayFast signatures.
- Server-side code validates PayFast ITN.
- ITN is the authoritative payment confirmation.
- Browser return routes only display pending, paid or cancelled status.
- `PaymentStatus` is separate from order, return and refund status.
- PayFast credentials and passphrase must never be exposed in Vite/browser code.
- Customer order routes load backend-created PayFast orders from the backend
  order repository, with browser localStorage used only as a UI mirror/fallback.
- Backend checkout order creation projects from the same current demo catalogue
  source used by the storefront so all valid demo products resolve while the
  backend remains authoritative for product identity, SKU, unit price and stock
  status snapshots.

## SERVER ENDPOINTS

- `POST /api/orders`
- `POST /api/payments/payfast/create`
- `POST /api/payments/payfast/itn`
- `POST /api/payments/payfast/cancel`
- `GET /api/payments/:orderNumber/status`

## ENVIRONMENT

Server-only:

- `PAYFAST_MERCHANT_ID`
- `PAYFAST_MERCHANT_KEY`
- `PAYFAST_PASSPHRASE`
- `PAYFAST_MODE`
- `PUBLIC_APP_URL`
- `PUBLIC_API_URL`

Frontend-public:

- `VITE_API_BASE_URL`

`PAYFAST_MODE=sandbox` must be used until live launch is explicitly approved.

## ITN VALIDATION

The backend validates:

- PayFast signature.
- Merchant identity.
- Merchant payment reference.
- Gross amount against the server-stored order total.
- Complete payment status.
- PayFast origin according to sandbox/live constraints.
- Duplicate ITNs through stored processed notification identifiers.

## PUBLIC CALLBACK REQUIREMENT

PayFast ITN is server-to-server and requires a publicly reachable HTTPS backend
endpoint. Localhost cannot receive PayFast ITNs from PayFast. Local development
therefore needs a public tunnel or staging backend URL for `PUBLIC_API_URL`.

Cloudflare Quick Tunnel or ngrok may be used for development if installed.
`PUBLIC_API_URL` must be set from the environment for each temporary tunnel and
temporary tunnel hostnames must not be committed to source or documentation.

When a controlled local tunnel/proxy is used, `PAYFAST_TRUST_PROXY=true` may be
set so the backend reads the forwarded client IP from a loopback proxy. Leave it
`false` for direct deployments.

## PHASE 4.5B VALIDATION RESULT

- Local frontend port: `127.0.0.1:5173`.
- Local backend port: `127.0.0.1:8787`.
- Frontend API base: `VITE_API_BASE_URL`, defaulting to `http://127.0.0.1:8787` in development.
- PayFast request generation was verified locally with non-secret dummy values.
- Generated `return_url` used `PUBLIC_APP_URL`.
- Generated `cancel_url` used `PUBLIC_APP_URL`.
- Generated `notify_url` used `PUBLIC_API_URL`.
- Server-side order creation produced `OrderStatus = PENDING` and `PaymentStatus = PENDING`.
- PayFast cancellation sets `PaymentStatus = CANCELLED` while leaving the order
  in its retryable pre-payment state. Explicit order cancellation remains a
  separate customer action.
- Cart clearing remains tied to confirmed `PAID` status on the PayFast return status check.
- Pending, cancelled and failed PayFast returns restore the saved cart snapshot
  for the order instead of clearing the cart.
- ITN attempts are now recorded in `.data/payfast-itn-events.json` with
  non-secret source IP and validation-result details for sandbox troubleshooting.
- Malformed ITN data was rejected.
- Invalid ITN signature was rejected.
- Amount mismatch and source IP rejection are covered by backend tests.
- Duplicate ITN detection is covered by backend tests.

Genuine PayFast Sandbox hosted checkout was not completed in this environment
because no ignored local `.env` file with sandbox credentials was present and no
Cloudflare Quick Tunnel or ngrok binary was installed to expose the backend ITN
endpoint over public HTTPS.

## PLANNED FUTURE BACKEND

- Database-backed orders and payments.
- Production PayFast credentials.
- Operational reconciliation.
- Real refund API integration if selected.
- Admin payment review tools.

## PENDING BUSINESS POLICY

- Final VAT treatment.
- Delivery pricing.
- Payment operations process.
- Refund timing and approval policy.

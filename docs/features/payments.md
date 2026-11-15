# Payment Gateways

TekCentral payment settings live at `/admin/settings/payments`. Gateway policy is persisted through the revision-protected settings framework; credentials remain backend environment variables and are never returned to the browser or stored in business settings.

## Gateway boundary

The registry uses stable provider IDs: `PAYFAST`, `PEACH_PAYMENTS`, `OZOW`, `PAYSTACK`, `YOCO`, `DPO_PAYGATE`, and `STITCH`. Provider capability describes what a gateway can support; implementation status separately records whether TekCentral has a schema, adapter, and checkout path.

PayFast is the only operational adapter. It supports payment creation through hosted checkout and verified ITN webhooks. The other providers expose configuration schemas only and must not appear as operational checkout options.

## Provider schemas

- PayFast: Merchant ID, Merchant Key, Passphrase, and derived return/cancel/notify URLs.
- Peach Payments: Client ID/Secret, Merchant ID, Entity ID, optional Secret Token and webhook signing secret, plus integration version and callback metadata.
- Ozow: versioned integration type with Site Code, API Key, Private Key, and provider-specific callback URLs.
- Paystack: Public Key, Secret Key, webhook URL, and IP-whitelisting status.
- Yoco: Public Key, Secret Key, and provider-specific callback/webhook metadata.
- DPO PayGate: PayGate ID, Encryption Key, return/notify URLs, integration type, and future tokenization setting.
- Stitch: Client ID/Secret, scopes, webhook URL/signing secret, and enabled product capabilities.

All secret fields are environment-managed. The UI reports only configured/not configured state and offers no secret reveal or insecure replacement action.

## PayFast profiles

Sandbox and Live are separate profiles. Explicit variables use `PAYFAST_SANDBOX_*` and `PAYFAST_LIVE_*`. Legacy `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, and `PAYFAST_PASSPHRASE` remain assigned to the profile selected by `PAYFAST_MODE` for backward compatibility.

Switching new payment attempts to Live requires a complete Live profile and explicit confirmation. Existing payments retain gateway provider, instance/mode, references, amount, currency, and timestamps, so later settings changes do not reinterpret them.

The safe configuration test validates required credentials and derived callback URL shape. It does not charge, create an order, or claim provider connectivity; connection health therefore remains `UNKNOWN` until a provider-safe remote verification exists.

## Existing contracts

The original PayFast create, ITN, cancel, and status routes remain supported. Checkout now uses the gateway-neutral create endpoint, while PayFast signature generation and ITN verification stay within the PayFast provider boundary.

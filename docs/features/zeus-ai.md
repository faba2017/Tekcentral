# Zeus AI

Zeus Product tools consume the canonical public Product list after promotion resolution. Zeus therefore receives the same effective customer price as Shop, cart and checkout without separate sale rules. Internal promotion references, supplier identity, cost and margin remain excluded.

The chat response may include a typed, customer-safe `policy` object alongside the existing message and approved actions. The frontend renders this canonical payload directly and does not parse model prose to discover policy structure or destinations.

Phase G.4 adds a versioned server-owned Zeus identity and four bounded business-knowledge modules: About TekCentral, Shopping Guidance, Business Customers and Support Guidance. Deterministic routing answers identity, creator, provider/prompt confidentiality and straightforward business FAQs without paid inference. Other requests receive only the relevant module. Canonical policy is not duplicated, live commerce facts remain tool-owned, and provider/model/tool metadata is retained only in private operational telemetry rather than the customer response.

`searchProducts` accepts strict intent fields rather than raw query expressions. `catalogueSearch` validates taxonomy, canonicalizes high-confidence terms, filters the publication repository and returns typed match evidence. Search telemetry is aggregate within the tool result: correction/category/brand/budget flags and result-group counts; raw customer messages are not added to telemetry logs. Current search is lexical and structured, not vector-based, and never uses web search.

## CONFIRMED Current Zeus Implementation

- Zeus is implemented by the existing technical component `src/components/ui/robot-hero.tsx`.
- Zeus is rendered by `RobotHero` and exposed through the reusable `ZeusScene` wrapper for the homepage hero composition.
- Zeus uses procedural Three.js geometry rather than image assets.
- Zeus uses generated canvas textures for chassis material detail.
- Zeus is rendered inside `@react-three/fiber` `Canvas`.
- Zeus uses `@react-three/drei` `ContactShadows`.
- Zeus reacts to pointer movement through `useFrame` and `state.pointer`.
- Zeus has blinking eyes.
- Zeus changes to heart eyes for two seconds on pointer down/tap.
- Phase 3 adds a polished contextual `/zeus` assistant page with UI-only prompt entry points.
- `/robo` redirects to `/zeus` for compatibility.
- Product pages can link to `/zeus?product=:slug`.
- Category pages can link to `/zeus?context=:category`.

## CONFIRMED Phase A Foundation

- `POST /api/zeus/chat` is the public conversation boundary; browsers never contact an AI provider directly.
- Phase A accepts bounded client-supplied `user` and `assistant` history. System instructions, tools and tool results are server-owned.
- `ZeusService` orchestrates a provider-independent interface and a fixed tool registry.
- The deterministic local provider supports development without external credentials. `ZEUS_ENABLED=false` disables chat without affecting the storefront.
- Public tools are `searchProducts`, `getProduct`, `compareProducts`, and `getProductAvailability`. They serialize published customer-safe fields and reuse canonical publication pricing and supplier-neutral availability.
- Account identity derives only from the HttpOnly session. Phase A exposes no authenticated customer tools or mutations.
- Requests enforce trusted origin, body/history limits, tool schemas, fail-closed tool lookup, rate limiting, safe errors and metadata-only logs.
- The authenticated DigitalOcean MCP connector exposes account/compute operations but not App Platform, Functions, GenAI/model/inference, Knowledge Bases, projects, advanced networking, or secrets. No resources were provisioned.

## Deferred After Phase A

- Persistent memory, Knowledge Base ingestion and embeddings
- Customer or commerce mutations

## CONFIRMED Phase B Authenticated Intelligence

- Read-only authenticated tools are `getMyOrders`, `getMyOrder`, `getMyTracking`, `getMyReturns`, and `getMyAddresses`.
- The chat route resolves the customer from the HttpOnly session on every request. Tool schemas contain no customer, account, owner, email, session, or guest-credential fields.
- Registry metadata marks tools as public or authentication-required, and the executor fails closed when the current session is absent or expired.
- Order tools call existing account-order services, which enforce exact `customerAccountId` ownership and return neutral not-found results for foreign and unknown orders.
- Historical titles, quantities and prices come from immutable customer order snapshots. Current recommendations continue to use current published Product data.
- Tracking, return/refund and address outputs are minimal customer-safe projections. Internal procurement, supplier, reconciliation, payment-provider and staff fields never enter provider context.
- Account data is loaded only after the relevant tool call. It is not preloaded into prompts, persisted as long-term memory, or returned as hidden replay context.
- Guest bearer credentials remain outside Zeus. Signed-out customers receive guidance to sign in or use their existing secure guest order link.
- Phase B remains informational; cancellation, refund, return, address, payment and profile mutations are not registered tools.

## CONFIRMED Phase C DigitalOcean Provider

- `DigitalOceanZeusProvider` implements the existing provider contract through DigitalOcean Serverless Inference's OpenAI-compatible `POST /v1/chat/completions` endpoint. The default server-only base URL is `https://inference.do-ai.run`.
- `ZEUS_PROVIDER` selects `local` or `digitalocean`. The local deterministic provider remains the default and no paid-provider fallback occurs for unknown or incomplete configuration.
- DigitalOcean requires server-only `ZEUS_DIGITALOCEAN_API_KEY` and `ZEUS_DIGITALOCEAN_MODEL` values. The key should be a narrowly scoped model access key and must never enter Vite configuration, browser responses or logs.
- The model remains deployment configuration rather than a business rule. A selected model must support OpenAI-compatible chat completions and tool calling.
- The provider owns request conversion, tool-call decoding, timeout handling, safe provider error classification, request IDs and token-usage metadata. Customer authorization, ownership and all commerce rules remain in TekCentral services and tool handlers.
- Provider execution is bounded to three model iterations, six total tool calls and 700 requested output tokens. The timeout defaults to 15 seconds. Provider requests are not automatically retried, avoiding duplicate paid inference and tool-loop amplification.
- Only registered Phase A and B read-only tools are exposed. Unknown tool names fail closed, and customer identity continues to derive exclusively from the HttpOnly session.
- Automated provider coverage is fully mocked. No DigitalOcean credential or model is configured in the current local environment, so no paid live smoke request was made during Phase C.

## CONFIRMED Phase D.1 Provider Response Robustness

## CONFIRMED Phase E Conversational Cart

- `getCart`, `addToCart`, `updateCartQuantity` and `removeFromCart` are registered server tools. Mutation tools accept only an opaque pending-action reference.
- Guest ownership uses an HttpOnly cart-session cookie; authenticated ownership uses the server-resolved customer ID. Account-history AI consent is not required for session cart operations.
- When a guest signs in, the server merges the current guest cart into the account cart once. Duplicate Product lines are combined up to the quantity limit, current price and purchasability are revalidated, and the consumed guest cart is removed so repeated reads cannot merge it again. This policy is shared by storefront and Zeus actions.
- Pending actions expire after ten minutes. Confirmation revalidates canonical publication, current selling price and purchasability. Completed actions replay their stored result.
- Product-card clicks count as explicit customer intent and use the same server service. Zeus cannot clear the cart, submit checkout, place orders, initiate PayFast or perform supplier operations.
- Aggregate confirmation, success, cancellation, drift, failure and idempotent-replay counters are exposed through system health. They contain no prompts, Product details, owner identifiers or cart contents.


- DigitalOcean parsing remains isolated in `DigitalOceanZeusProvider`; Product search, tools, orchestration and the frontend do not contain model-specific response quirks.
- Accepted forms are assistant text, null or text content with valid registered tool calls, multiple valid calls, optional benign provider metadata, and the bounded inline argument tags observed from `glm-5.3-flash`.
- Tool names must exist in the request registry and arguments must parse once as a JSON object satisfying the canonical tool schema. Unknown tools, malformed arguments, unsupported structured content, refusals and inconsistent finish states fail closed.
- `finish_reason: length` maps to `OUTPUT_LIMIT` and retains provider usage telemetry when supplied. Customers receive a safe retry message rather than provider internals.
- There is no automatic provider retry. This avoids duplicate inference and establishes no unsafe retry precedent before mutation-capable tools exist.

## CONFIRMED Phase C.2 Provider Stabilization

- Zeus fingerprints tool calls after normalizing insignificant casing, whitespace, object-key order, comparison-identifier order and omitted default limits. A successful equivalent call is reused rather than executing the TekCentral lookup again.
- Duplicate detection is progress-aware: different tools and materially different inputs continue normally. A duplicate result triggers one bounded final-answer pass with provider tools disabled and an internal instruction to answer from existing evidence.
- Safety ceilings remain three provider iterations and six actual tool executions. Telemetry records iterations, executions and prevented duplicates without logging tool-result payloads.
- Private account tools require versioned, server-authoritative consent in the current HttpOnly customer session. Authentication by itself is insufficient. The consent request occurs before private tool execution and contains no account data.
- Consent covers only minimized order, tracking, return and saved-address outputs used for Zeus account assistance. It never covers credentials, payment data, supplier-private information, unrelated customers or admin data.
- Customers can decline consent or revoke it from Zeus. Revocation takes effect immediately for the current session; public Product assistance remains available.

## CONFIRMED Phase C.3 Usage, Abuse And Cost Guardrails

- All enforcement is server-authoritative. Guests are scoped by a privacy-aware hash of the trusted server-observed client IP; authenticated customers are scoped by the account ID resolved from their HttpOnly session, with a secondary IP burst ceiling.
- Ops reporting aggregates request outcome, guest/authenticated audience, server-classified intent, registered tool names, latency and provider token counts. Raw prompts, private tool payloads and customer identity are not included in Zeus analytics.
- Launch defaults are 5/10/30 guest requests per minute/hour/day and 10/40/150 authenticated requests. `ZEUS_GUEST_ENABLED` independently controls guest access. Platform-wide minute and optional daily ceilings protect paid inference without affecting normal storefront APIs.
- Customer quotas use request counts in this phase. Deterministic `LOW`, `MEDIUM`, and `HIGH` cost tiers are persisted with aggregate token and tool telemetry so weighted policy can be introduced later without changing the service boundary.
- Successful responses and tool-loop failures consume customer allowance. Provider failures, validation rejection, consent prompts and duplicate reuse do not. Tool-loop retries receive a short cooldown, while repeated provider 429/5xx/timeout observations open a temporary global circuit.
- Guest history is trimmed to the six most recent ordinary messages and authenticated history to sixteen. System prompts, tool declarations, tool results, identity and consent remain server-owned. Existing ceilings remain three provider iterations, six tool executions and 700 requested output tokens.
- Equivalent customer submissions are deduplicated only inside the same hashed identity and short time window. In-flight or recent successful responses may be reused; authenticated responses are never shared between accounts.
- Bounded usage records persist in `.data/zeus-usage.json` and are pruned after 48 hours. They contain pseudonymous hashes, timestamps, tier, outcome, aggregate token/tool counts and safe error categories, never raw prompts, IP addresses, sessions, credentials, account payloads or supplier data. Production should configure `ZEUS_QUOTA_HASH_KEY` as a server-only secret.
- The existing system-health response includes aggregate daily Zeus request, guest/auth split, quota rejection, provider failure, token, tool-loop and circuit state. No raw customer or provider payload is exposed.

## CONFIRMED Phase C.4 Policy And Human Routing

- `src/lib/store-policy-knowledge.ts` is the customer-safe structured projection of TekCentral's published Terms, Privacy, Refund, Cancellation, and Shipping & Delivery policies. It supports returns, refunds, cancellations, shipping, delivery, payments, warranty, accounts, and privacy without exposing internal rules or supplier operations.
- `getStorePolicy` is a public server-owned Zeus tool. It accepts only the fixed topic enum and returns a concise summary, customer-facing conditions, next step, canonical policy URL, and controlled escalation category. Unknown topics fail closed.
- Clear public-policy questions and signed-out personal-order questions use deterministic server routing before paid inference. Authenticated personal questions continue through existing consent-protected account tools.
- Zeus actions are server-approved enums with optional order number or Contact category context. The frontend maps them to known account, guest-order, return, policy, Contact Us, catalogue, or canonical telephone destinations. Models cannot provide action URLs, email recipients, telephone values, or guest credentials.
- Contact escalation reuses the existing Contact category model, so its canonical service continues to select General, Sales, Accounts, Support, or Technical recipients. Zeus never submits a contact form or initiates a phone call.
- The fallback hierarchy is answer, concise clarification where needed, canonical policy, authentication, existing secure workflow, then human support. Unverified status, eligibility, warranty, stock, compatibility, refund, or delivery facts must not be invented.

## PLANNED

Zeus is TekCentral's AI technology assistant and should eventually help customers understand what technology they need.

Future flow:

```text
Customer
  -> Zeus
  -> Requirement analysis
  -> Solution builder
  -> Product recommendation engine
  -> Compatibility validation
  -> Supplier availability
  -> Pricing
  -> Complete solution
  -> Cart or quotation
```

## PENDING CONFIRMATION

- AI provider
- Chat UI
- Conversation storage
- Recommendation model
- Compatibility rules
- Human review requirements
- Backend orchestration API

Do not implement Zeus AI during Phase 3.

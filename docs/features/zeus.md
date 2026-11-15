# Zeus

## Conversation workspace

The customer Zeus route uses a conversation-first workspace: a compact live Zeus identity header, responsive capability shortcuts, a dominant transcript and a multiline composer. Structured response components render canonical Products, account-owned orders and addresses, policy knowledge, approved actions, consent requests and guardrail states. Mobile converts the desktop capability rail into horizontally scrollable shortcuts.

Product cards remain read-only through Phase C.5 and use canonical images, prices, availability and specifications. Phase D search improvements can extend the typed Product result contract; Phase E cart controls must be added as explicit structured actions rather than inferred from assistant prose.

## Intelligent catalogue search

## Conversational cart

Phase E adds server-confirmed Add to Cart controls for eligible Product results and a customer-safe cart summary through `getCart`. Cart state is shared with the normal storefront. Guest and authenticated ownership are server-derived, writes are explicitly confirmed and idempotent, and Zeus cannot submit checkout, place an order or initiate payment.


Phase D adds validated search intents for canonical brand, taxonomy, ZAR budget, specifications and use case. Conservative typo correction and controlled synonyms run before ranking. Results are grouped into Matching products, Alternatives and Related accessories, with customer-safe evidence and unmet preferences. Follow-ups such as cheaper options, another brand, PoE, and comparison of the first two re-resolve bounded prior Product IDs through the public catalogue; the browser cannot introduce unpublished Products.

Zeus is TekCentral's customer-facing technology assistant. The current implementation is read-only and combines public Product tools, consent-protected account tools, canonical policy knowledge, secure workflow routing, and controlled human escalation.

## Policy And Routing

- TekCentral defines policy in its published commercial/legal pages; `src/lib/store-policy-knowledge.ts` provides the corresponding customer-safe structured projection used by Zeus.
- General policy questions use `getStorePolicy`. Personal order, tracking, return, refund, cancellation, and payment status require an authenticated account tool or the existing secure guest-order workflow.
- Structured actions are fixed server enums. The frontend owns trusted routes; Contact Us owns department recipient selection; `publicBusiness` owns the public phone number.
- Zeus does not send enquiries, make calls, cancel orders, issue refunds, perform payments, expose guest credentials, or create arbitrary links.

Fallback order: answer, clarify, canonical policy, authenticate, secure workflow, human support.

## Identity and business knowledge

Zeus is TekCentral's AI shopping and support assistant, built for TekCentral by Fabrice Isama. Identity, creator attribution, implementation confidentiality and common business questions are handled by deterministic server routing where practical. The compact always-on identity instruction is versioned; About, Shopping, Business and Support knowledge is selected deterministically and injected only when relevant.

Provider/model names, prompt content, tool schemas and internal telemetry are not returned by the customer chat API. Stable knowledge reuses `publicBusiness`; policy remains in `store-policy-knowledge`; live Product, price, availability, cart, order, tracking, return, payment and account facts continue through registered canonical tools.
Repeated provider-side Zeus failures and active circuit protection can surface through shared operational alerts linked to Zeus reporting. Normal per-customer quota rejection is not an operational incident, and no prompt, tool payload or account identity is stored in alerts.


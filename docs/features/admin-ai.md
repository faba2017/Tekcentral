# Admin AI foundation

Admin AI is a backend-only inference boundary for future staff-facing assistance. It is deliberately separate from the public Zeus assistant: it has independent configuration, credentials, instructions, model routing, request contracts, logging and failure handling.

## Runtime configuration

- `ADMIN_AI_ENABLED`
- `ADMIN_AI_PROVIDER=digitalocean`
- `ADMIN_AI_DIGITALOCEAN_API_KEY`
- `ADMIN_AI_DIGITALOCEAN_PRIMARY_MODEL`
- `ADMIN_AI_DIGITALOCEAN_ROUTINE_MODEL`
- `ADMIN_AI_DIGITALOCEAN_FALLBACK_MODEL` (optional)

The current development configuration uses `glm-5.3` for `PRIMARY`, `glm-5.3-flash` for `ROUTINE`, and `deepseek-v4.1-flash` for fallback. These are deployment configuration choices for the current DigitalOcean account tier, not permanent architecture. Commercial GPT or Claude models can be selected later by changing backend environment values when the account tier permits them; no application-code change is required.

`PRIMARY` and `ROUTINE` are the only caller-selectable roles. Fallback selection is controlled by the service and is never caller-selected. The inference endpoint is fixed server-side to DigitalOcean's HTTPS inference API.

## Safety boundary

This phase exposes no HTTP route or UI and performs no tools, database access, persistence, H.2 audit mutation or commerce operation. Callers must provide bounded messages and explicitly selected, safe context. Logs contain correlation, routing, outcome, latency and token metadata only; prompts, responses and credentials are excluded.

Retry is bounded to one retry for temporary provider failures. A configured fallback model receives at most one attempt after the primary role model is exhausted. Authentication, configuration and invalid-request failures are not retried or sent to fallback.

Reasoning-capable models may consume part of the bounded completion budget before emitting final answer content. Admin AI accepts only final response content as normalized text: private `reasoning_content` is never returned, logged or persisted. Safe reasoning-token counts may be retained when the provider supplies them. Callers may request smaller limits, but every request remains capped by the 1,200-token application maximum; diagnostics distinguish output-budget exhaustion from malformed responses.

Configuration health is local and inexpensive. Provider health is an explicit probe only; no recurring inference call is made.

## Access control and master switches

Admin AI access is server-derived for every request. Effective access requires all three conditions:

`ADMIN_AI_ENABLED=true AND global Admin AI switch enabled AND admin_ai.use granted`

The persisted global switch is authoritative at application level and global OFF denies every staff member, including Super Admin. The canonical `admin_ai.use` permission is inherited automatically only by `SUPER_ADMIN`; every other role requires an explicit staff grant. Revocations take effect through the existing live staff-session permission resolution.

Zeus has a separate persisted global switch and retains its existing `ZEUS_ENABLED` environment kill switch. Enabling or disabling either assistant does not change the other assistant. The AI & Assistant settings page requires the existing high-risk `settings.zeus` permission and never exposes provider credentials or model configuration.

Switch changes are written through canonical settings with optimistic revision control and H.2 `STAFF_USER` audit attribution. Permission grants and revocations continue through Staff Management and its existing H.2 authorization audit. Request bodies cannot nominate the audit actor.

H.6.2 adds access evaluation and enforcement only. Admin AI still has no staff chat endpoint, tools, commerce actions or automation surface.

## Role-aware Admin Tour

H.6.3 adds a static-first Admin Tour for staff whose effective Admin AI access passes the existing environment, global-switch and `admin_ai.use` gate. On the first eligible session, an unobtrusive invitation offers Start tour, Not now and Skip tour. Not now suppresses the invitation for the current mounted session only; Skip is persisted and prevents future automatic invitations. In-progress tours resume from the last permitted topic. Completed and skipped tours remain manually restartable from Help in the Admin header.

Tour topics are a trusted server-owned catalogue of real Admin routes. The backend derives the topic list from current effective permissions on every load; role is wording context and never authorization. Permission changes remove inaccessible topics and safely reconcile stored progress. Staff without `admin_ai.use` do not receive the interactive tutor entry or invitation.

Core tour content and navigation require no provider call. A staff member may explicitly request a concise explanation of the current permitted topic. That request uses the `ROUTINE` model role, re-evaluates the H.6.2 access gate server-side, resolves the topic server-side and sends only role label, relevant effective permission keys and trusted topic metadata. Browser-supplied roles, permission arrays, prompts and route metadata are not accepted. Provider text is rendered as plain text and is not persisted.

The tutor has no tools, actions, conversation history, Product/order/customer data, database access or business mutation. It remains separate from the H.6.4 contextual controls and the planned H.6.5 chat workspace.

## Contextual Admin intelligence

H.6.4 adds one reusable, read-only contextual panel to stable Product Configuration, Supplier workspace and Pricing proposal surfaces. The browser sends only a registered context type, canonical resource identifier and approved intent. The backend rechecks the H.6.2 environment/global/`admin_ai.use` gate, enforces the normal resource read permission, reloads current canonical state and constructs an explicit bounded allowlist projection before inference.

The registered contexts are `PRODUCT`, `SUPPLIER` and `PRICING_PROPOSAL`. Product context reuses the canonical 12-step onboarding readiness result; Supplier context reuses the Supplier Hub operations and consolidated source-health read model; Pricing context reuses persisted proposal calculations and backend-formatted monetary values. Supplier credentials, source URLs, customer data, secrets and arbitrary browser facts are excluded. Missing and unauthorized resources fail before provider invocation.

Contextual intents are server-approved and model routing is deterministic: routine summaries, explanations, blockers and next steps use `ROUTINE`; risk review and substantial pricing blocker review use `PRIMARY`. Responses are rendered as plain text, are not persisted and remain visibly subordinate to canonical system status. H.6.4 exposes no tools, business writes, conversation history, migration, H.2 business event or Admin AI business actor. Orders and other domains remain outside this phase until a similarly narrow safe read model is justified.

## Chat persistence foundation

H.6.5A adds the durable PostgreSQL foundation required by the future private Admin AI chat workspace. The workspace and its HTTP/UI surface are not implemented yet, and this persistence layer makes no provider calls.

`admin_ai_conversations` owns a bounded title, `ACTIVE`/`ARCHIVED` lifecycle and one canonical `staff_accounts.id` owner. `admin_ai_messages` stores ordered `USER` and `ASSISTANT` rows. A user turn is appended transactionally under a conversation row lock together with a paired pending assistant slot. The `(conversation_id, sequence)` constraint guarantees deterministic ordering, while a partial unique index on `(conversation_id, idempotency_key)` for user rows prevents duplicate logical sends across processes or browser tabs. Provider failure can mark the paired assistant slot `FAILED`; retry returns that same slot to `PENDING` without duplicating the durable user message.

Conversation and message reads are owner-scoped and page-bounded. Active conversations are listed by owner and most-recent update; archived conversations remain privately retrievable. Owner-scoped hard deletion is supported and cascades only to that conversation's private messages and context identifiers.

`admin_ai_context_attachments` stores only one of the H.6.4 registered context types (`PRODUCT`, `SUPPLIER`, `PRICING_PROPOSAL`) plus its canonical resource ID. It deliberately stores no Product, Supplier or Pricing snapshot. H.6.5B must re-authorize and rebuild current context for every inference request.

Assistant rows may retain typed, nullable operational metadata such as requested model role, resolved provider/model, token counts, reasoning-token count, latency, fallback use and safe request identifiers. There are no columns for system prompts, provider credentials, raw provider requests/responses or reasoning content. Only normalized final assistant content may become a completed assistant message.

Chat persistence is private staff data, separate from Zeus, Contact Inbox, settings and `operational_state`. It emits no H.2 business events and creates no Admin AI business actor. H.6.5B can add the owner-scoped service/API and workspace over this repository without another schema change for conversation creation/listing, bounded history, rename/archive/delete, retry, attachments, pagination or duplicate-send safety.

## H.6.5B private chat workspace

The dedicated workspace is available at `/admin/ai` when the live H.6.2 access calculation is effective. Navigation visibility requires the environment switch, persisted global switch and `admin_ai.use`; direct owner history remains readable after generation access is withdrawn, while the composer, retry and context mutation controls are disabled and no provider request is made.

Conversations are private to the authenticated staff UUID. The first send creates the conversation and a deterministic title, and atomically persists a user message plus a pending assistant placeholder before inference. A conversation permits one pending assistant turn at a time. Per-turn idempotency keys ensure browser retries reuse the same durable turn and never duplicate provider work. Provider failures retain the user message and move the assistant placeholder to `FAILED`, where an explicit retry rebuilds current context and history.

Generation uses no browser-supplied transcript. The server reloads a bounded recent message window and up to three durable context references, reauthorizes each reference and rebuilds current allowlisted Product, Supplier or Pricing Proposal facts for every request. Missing or newly forbidden context blocks inference. Routing is deterministic: routine chat uses `ROUTINE`, while multiple contexts and substantial pricing-risk review use `PRIMARY`. The provider receives no tools, mutation surface, credentials, raw supplier files or customer data.

H.6.4 contextual panels can open the chat workspace with only a context type and canonical resource identifier in the URL. No raw context is placed in browser state and opening the workspace does not auto-send a prompt. Conversation management supports owner-scoped rename, archive/unarchive and explicit permanent deletion. Assistant text is rendered as plain text; private reasoning and raw provider payloads are neither returned nor persisted.

## H.6.6A controlled-action persistence foundation

Migration `0012_admin_ai_actions.sql` adds the durable, current-state boundary needed for a future controlled Admin AI action. It does not expose tools to DigitalOcean, add an HTTP/UI confirmation surface or execute a Product or other business mutation. The H.6.6 action framework remains incomplete until H.6.6B.

Each `admin_ai_actions` row has a server-generated action ID and belongs to one durable Admin AI conversation and its exact turn. A composite conversation/owner foreign key prevents an action owner from differing from the conversation owner, while repository creation also verifies that the turn exists as the conversation's paired user/assistant messages. Conversation deletion cascades to its private actions. The unique `(conversation_id, turn_id)` constraint enforces one logical action per originating turn and makes preparation replay idempotent.

The lifecycle is deliberately small: `AWAITING_CONFIRMATION`, `EXECUTING`, `SUCCEEDED`, `FAILED`, `CANCELLED` and `EXPIRED`. Only an owner-scoped, non-expired awaiting action can be atomically claimed. Confirmation uses a PostgreSQL transaction and row lock to transition to `EXECUTING`; concurrent confirmation therefore yields exactly one execution claim. A cancelled, expired, succeeded or failed action cannot be claimed again. Repository methods explicitly complete a claimed action as succeeded or failed and never hold a database lock across provider or future business-service work.

Prepared actions expire at an application-selected short confirmation deadline stored in `expires_at`; H.6.6A evaluates expiry lazily and transactionally on reads, lists and claims rather than adding a scheduler. The future initial tool policy is expected to use a ten-minute confirmation window, but the repository requires the caller to supply and validate the deadline so tool policy remains outside persistence.

The row stores bounded target identity, safe validated input, a deterministic safe confirmation preview, the canonical baseline fingerprint, diagnostic required-permission and registry-defined risk metadata. Persisted permission and risk never become authorization authority: H.6.6B must reload the tool registry, current staff permission and canonical target state at confirmation. Confirmation identity is the owner staff UUID supplied by the authenticated server path. Completion stores only a bounded safe result, stable failure code and safe execution correlation ID.

`safe_input`, `safe_preview` and `safe_result` accept only bounded object structures. Application validation rejects secret, credential, token, prompt, transcript, reasoning and raw-payload fields, excessive depth/field counts and oversized JSON. The schema has no columns for provider requests/responses, system prompts, chat transcripts or reasoning content. Preview data is informative only and must never replace canonical target reload or stale-baseline checking.

Action creation, cancellation, expiry and execution claiming are private Admin AI workflow state, not Product/business mutations. They emit no Product H.2 event and introduce no `ADMIN_AI` business actor. H.6.6B is responsible for canonical service execution and authenticated H.2 business attribution only after fresh permission, target and baseline validation.

## H.6.6B controlled Product draft action

Admin AI's initial controlled mutation tool is `product_draft_update`. It is available only when an authenticated staff owner has effective Admin AI access, `products.edit`, and exactly one editable server-resolved Product attachment. Its allowlist is deliberately limited to `shortDescription` and `overview`; pricing, orders, refunds, inventory, supplier operations, settings, staff and customer mutations are not registered tools.

A provider tool call never performs the mutation. TekCentral strictly validates the structured arguments against canonical Product evidence, builds a safe before/after preview and baseline fingerprint, and persists one ten-minute `AWAITING_CONFIRMATION` action for the originating conversation turn. The chat reconstructs this card from PostgreSQL after refresh. Natural-language parsing is not an execution path.

Confirm and cancel are owner-scoped. Confirmation re-evaluates the Admin AI master switches, live staff permission, registry policy, Product editability, safe arguments and baseline before atomically claiming execution. A stale target fails without mutation. A valid claim reuses the canonical Product publication-draft save path and records an H.2 Product content event attributed to the authenticated `STAFF_USER`; metadata records `Origin=ADMIN_AI`, tool, conversation and action IDs. Browser actor fields are not accepted. Concurrent confirmation can claim only once, and terminal actions cannot execute again.

Provider continuation may narrate a prepared or completed result, but provider text never determines action state. Safe action state and result come from the canonical repository. Cancelling performs no Product mutation. Expired, revoked, unauthorized, unavailable and stale actions fail safely, and no provider credentials, raw payloads or reasoning content are persisted.

The chat remains non-streaming. While the blocking send request persists the turn, runs inference and optionally prepares an action, the browser immediately renders a client-only user bubble and generic accessible processing indicator. These temporary rows carry no server identity or action data and are removed when the canonical transcript reloads. Conversation/request identity guards prevent a late completion from rendering into another selected conversation. Durable pending and failed assistant rows remain authoritative after refresh, and only persisted action records render confirmation cards. Confirm and cancel requests use a separate disabled execution state from chat generation.

Controlled action cards are reconstructed inline from their persisted `turnId`: canonical message sequence remains unchanged, and the card follows the originating assistant response (or the user message when no assistant text exists). Terminal states remain in that historical position, while confirm/cancel refreshes the same card in place. The conversation endpoint remains bounded and actions are grouped client-side, so inline placement adds no per-turn requests.

## H.6.7 automation and autonomy policy

Admin AI policy is durable server configuration in the existing revisioned `operational_state` store under the `admin-ai-policy` namespace. One platform document and one document per staff UUID are combined with environment/global access, live RBAC and the curated tool registry. No policy can grant a permission, resurrect a removed tool, override the global kill switch or exceed a registry ceiling. New staff tool policy defaults to `OFF`.

The canonical autonomy order is `OFF < OBSERVE < SUGGEST < PREPARE < AUTO`. OFF removes a tool; OBSERVE permits explanation without mutation proposals; SUGGEST permits conversational recommendations but no durable action; PREPARE exposes an enabled provider tool and creates an H.6.6 action that still requires explicit confirmation. AUTO is represented for future governance, but no current registered tool permits it. Both `product_draft_update` and the HIGH-risk `product_publish` tool are capped at PREPARE, so unattended Product mutation remains impossible.

The evaluator combines the strictest platform, staff and registry autonomy and risk ceilings. It also enforces `admin_ai.use`, the tool's domain permission, optional Africa/Johannesburg operating windows, per-staff request limits, prepared-action/execution limits and a maximum token budget per request. Operating windows restrict mutation preparation and confirmation; read-only chat remains available outside the window. Confidence and value thresholds remain not applicable for the current tool, and cost ceilings remain disabled because no reliable normalized provider cost exists.

Tool exposure, preparation and confirmation all use current server policy. Turning a tool OFF, lowering risk to LOW, moving outside the mutation window, revoking `products.edit`, or disabling Admin AI after preparation prevents confirmation without changing Product state. Policy writes use optimistic revisions, require `settings.zeus`, reject client-supplied registry fields, and record authenticated STAFF_USER H.2 before/after evidence with a distinct target staff when applicable.

H.6.7 adds no schedules, triggers, background AI work, high-risk tools or unattended AUTO execution. H.6.8 may consume the same evaluator for observe/suggest/prepare/auto decisions without requiring browser-local state.

## H.6.8A automation persistence foundation

Migration `0013_admin_ai_automation_foundation.sql` adds durable relational state for future Admin AI automation without starting an automation runtime. `admin_ai_automations` stores validated owner-bound definitions with a separate authenticated creator, `SCHEDULE` or `EVENT` trigger configuration, explicit timezone, requested—not effective—autonomy, an explicit target and optimistic revision. Schedule persistence accepts daily, weekly and fixed-interval shapes; the application enforces a one-hour minimum interval. Definitions are retained and disabled rather than hard-deleted.

`admin_ai_automation_events` stores bounded, customer-PII-free internal event identity and metadata. A unique stable event key suppresses duplicate delivery, while optional automation/run origin identifies future self-trigger loops. `admin_ai_automation_runs` stores one logical row per `(automation_id, occurrence_key)`, bounded attempts, retry time, atomic lease ownership, policy/result summaries, provider telemetry and escalation state. PostgreSQL row locks and uniqueness constraints provide the coordination foundation for multiple backend instances. No prompt, reasoning, raw provider payload, credential or authentication token is stored.

Actions now have exactly one explicit origin. `CHAT` retains its conversation, paired turn and owner constraints. `AUTOMATION` requires one durable run and has no conversation or turn. One automation action may exist per run, and the automation owner is the initial human review owner; only a future authenticated, authorized staff request may confirm it. Existing chat actions are migrated as `CHAT` without semantic rewriting.

The code-defined `admin_ai.manage_automations` permission is separate from `admin_ai.use` and is granted automatically only through existing Super Admin universal-permission semantics. It will govern future definition management; runtime capability must still re-evaluate the owner's current `admin_ai.use`, domain permission, H.6.7 policy and registry ceiling.

H.6.8A creates no definitions or runs in development data, starts no timers or consumers, calls no DigitalOcean endpoint, creates no prepared Product action and emits no H.1/H.2 event. H.6.8B remains pending and will own APIs/UI, schedule interpretation, event consumption, policy evaluation, missed-run coalescing, stale-lease recovery, bounded retries, H.1/H.2 integration and review surfaces. The current `product_draft_update` ceiling remains `PREPARE`; AUTO Product execution remains unavailable.

## H.6.8B scheduled and event-driven runtime

The Admin AI automation workspace is available at `/admin/settings/ai-assistant/automations` and its definition API is protected by `admin_ai.manage_automations`. Definitions are created disabled, use optimistic revisions, retain a distinct authenticated creator and policy owner, and accept only registered tools with a real canonical target. Enabling and disabling are explicit audited staff actions.

Delete uses durable retirement rather than physical deletion. A retired definition is disabled permanently, excluded from normal management, schedule and event queries, and cannot be edited or re-enabled. Its direct historical identity, runs, events, actions and audit provenance remain readable. Retirement is idempotent and records one authenticated `ADMIN_AI_AUTOMATION_RETIRED` event. A prepared action that was already awaiting confirmation remains reviewable under the existing permission, policy, expiry and baseline checks; retirement creates no new work and does not cancel that action automatically.

The `product_draft_update` target is selected through a bounded canonical Product autocomplete, not from SupplierOffers or free text. The read-only target endpoint searches canonical Product name and SKU, returns at most 20 safe identity/readiness records, and requires both automation-management access and `products.edit`. Eligibility is determined by the existing controlled Product draft/publication-review boundary, so published, draft and not-ready Products remain selectable when their canonical draft is editable. Selection submits only the canonical Product ID; backend target validation is repeated when the definition is saved. Publication remains an independent human action.

The worker is opt-in through `ADMIN_AI_AUTOMATION_WORKER_ENABLED=true`. It interprets daily, weekly and minimum-60-minute interval schedules in the definition timezone, coalesces overdue schedules into one occurrence, consumes only durable allowlisted internal events, ignores self-origin events and relies on unique occurrence keys for idempotency. PostgreSQL claims, expiring leases and bounded exponential retry coordinate multiple instances. Provider work begins only after a successful claim, and stale leases are recovered into the same durable run row.

Every run reloads the active owner as the policy subject and rechecks the Admin AI master switch, `admin_ai.use`, domain permission, platform/staff policy, risk, operating hours and limits. The runtime itself is not a human actor. OBSERVE and SUGGEST persist bounded safe summaries only. A requested AUTO is clamped to the registered tool ceiling. For the current `product_draft_update` tool, PREPARE may create one automation-origin action and escalates the run to `REVIEW_REQUIRED`; it never mutates the Product.

Automation actions use a separate confirmation route from chat actions. Only the current owner or a Super Admin may review them, and confirmation rechecks live owner policy, reviewer Product permission and the canonical Product baseline before using the existing publication-draft save service. The resulting Product H.2 event is attributed to the authenticated reviewing `STAFF_USER` and includes automation/run provenance. Cancel, skip, failure and expired review states do not mutate Product, pricing, publication, supplier, order or availability state. Zeus and its provider configuration remain separate.

## H.6.9 high-risk action controls

H.6.9 registers one narrowly scoped HIGH-risk tool: `product_publish`. It accepts no model-supplied commercial or publication fields. The server resolves the attached canonical Product, requires `products.publish`, applies current Admin AI access and platform/staff policy, and reuses the H.4 publication review and `publishSavedDraft` service. A Product without a saved eligible draft, approved price, controlled media and complete readiness cannot produce an executable publication action. An already published Product with no unpublished change is also rejected.

HIGH risk is disabled by the existing MEDIUM defaults until both platform and staff policy explicitly allow HIGH and enable the tool. Its registry ceiling is permanently PREPARE: AUTO is clamped and neither chat nor automation may execute it unattended. Every prepared action has a deterministic safe preview, current publication/readiness/price/availability facts, a canonical baseline fingerprint and an expiry. Confirmation requires an authenticated human, fresh `admin_ai.use`, `products.publish`, current policy, operating-hour/rate limits and an unchanged canonical target. The PostgreSQL claim is atomic, so duplicate confirmation cannot publish twice; the canonical publication idempotency key adds a second guard.

Successful publication creates the ordinary immutable Product publication version and authenticated `PRODUCT_PUBLISHED` H.2 record with Admin AI chat or automation provenance. The provider is not the business actor and browser actor fields are not accepted. A post-publication audit-write failure cannot roll back the immutable version; it raises a critical H.1 operational alert for reconciliation. Pricing approval, refunds, procurement, supplier orders, order status, permissions, security/settings, deletion, taxonomy/mapping and inventory remain unregistered and non-executable. No dual-approval or monetary-threshold model exists yet, so those domains remain outside Admin AI rather than receiving invented controls.

The existing `admin_ai_actions` schema already stores HIGH risk, origin, safe preview/input/result, expiry, confirmation actor, baseline and atomic execution state. H.6.9 therefore requires no migration. Automated acceptance may prepare, expire or cancel a fixture action only; it must not publish a real Product or invoke a monetary/procurement action.

## H.6.10 operations and provider controls

`/admin/settings/ai-assistant/operations` is the final read-only operational surface for Admin AI. It requires `settings.zeus`; `admin_ai.use` alone does not reveal platform telemetry. The page derives request, token, latency, fallback, action and automation counts from existing PostgreSQL metadata and never reads prompt or response content for aggregation.

Provider roles and model identifiers are environment-managed and read-only. Credentials are never returned. Health is deterministic (`HEALTHY`, `DEGRADED`, `UNAVAILABLE`, `UNKNOWN`) from configuration, recent observations, terminal failure/fallback rates, latency and active critical provider alerts. A terminal provider failure raises a sanitized H.1 alert only after retry/fallback policy is exhausted; successful requests resolve provider incidents. Governance denial, cancellation and expiry remain separate from provider failure.

Automation worker health is an explicitly process-local heartbeat combined with durable run/lease state. It resets on process restart and is not represented as durable multi-instance liveness. Stale leases raise a sanitized H.1 warning and continue through bounded recovery. This phase introduces no migration, provider probe, scheduler, business mutation tool or Zeus change.

Provider cost is displayed as unavailable because the current inference contract does not provide reliable billing metadata. No cost is guessed. Existing retention remains unchanged; the operations view does not add a cleanup job.

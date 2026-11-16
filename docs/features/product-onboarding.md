# Canonical Product onboarding

## Architecture rule

Supplier adapters provide evidence. The shared onboarding service determines readiness. Publication remains canonical TekCentral behavior.

The flow is:

`supplier adapter or manual source -> normalized supplier evidence -> shared readiness service -> canonical Product -> publication review`

Readiness is derived at read time. It is not persisted as a second source of truth and a readiness read does not create an audit event. Existing supplier launch-selection, mappings, approved pricing, publication versions and other business decisions remain persisted because they represent staff or business decisions.

## Current-state audit

Before H.4.1, Scoop, Syntech, CJ and Manual TEKCENTRAL each returned their own readiness shape and raw blocker strings. Scoop also displayed a five-check count that did not include all publication requirements. Image, taxonomy, content, freshness and pricing terminology differed by supplier. Those legacy contracts remain available temporarily, but the admin Product endpoint now exposes one canonical result.

## Ordered journey

1. `SOURCE_EVIDENCE` — current source identity, stock and provenance
2. `PRODUCT_MAPPING` — verified source-to-Product relationship
3. `PRODUCT_IDENTITY` — stable canonical TekCentral Product
4. `TAXONOMY` — verified canonical category path
5. `CONTENT` — reviewed public Product information
6. `MEDIA` — controlled public media
7. `LOGISTICS` — fulfilment and delivery evidence
8. `COMMERCIAL` — current cost and currency evidence
9. `PRICING` — current approved selling price
10. `LAUNCH` — explicit launch selection
11. `PREVIEW` — reviewable customer-facing representation
12. `PUBLICATION` — explicit publish/version state

Step states are `INCOMPLETE`, `BLOCKED`, `NEEDS_REVIEW`, `COMPLETE` and `NOT_APPLICABLE`. Counts include every applicable canonical step. A mandatory blocker, including `PUBLIC_IMAGE_MISSING`, therefore cannot be hidden by a smaller supplier checklist.

## Evidence contract

`NormalizedSupplierEvidence` supports API, feed and manual sources; source identifiers; SKU/variant identity; title, description, URL and category; stock and freshness; logistics; cost and currency; commercial freshness; media candidates; provenance; timestamps and confidence. Fields are optional where a source cannot legitimately supply them. Manual TEKCENTRAL evidence uses `sourceKind: MANUAL` and does not invent a supplier URL or API freshness claim.

Adapters currently normalize:

- Scoop feed/source-page evidence
- Syntech feed and branch-stock evidence
- exact CJ product/variant evidence
- staff-maintained Manual TEKCENTRAL evidence

A future supplier such as Mustek or TVR should add an evidence adapter, not another readiness engine.

## Blockers and actions

Each blocker has a stable code, affected step, severity, explanation, business reason, recommended resolution and action/deep-link identifier. Legacy codes are mapped for compatibility. `CONTROLLED_IMAGE_REQUIRED` and the prior publication message both map to `PUBLIC_IMAGE_MISSING` on `MEDIA`.

The first unresolved step follows canonical journey order. Its structured blocker determines the next action. Published Products instead return `VIEW_STOREFRONT` or `CREATE_NEW_VERSION` as appropriate.

## API and permissions

`GET /api/admin/products/:productId/onboarding-readiness` returns the shared model. It is admin-only and governed by `products.read`. It is not a public storefront endpoint and does not emit supplier cost or identity through public APIs. Mutations continue through their existing RBAC-protected and audited services.

Legacy supplier readiness fields remain response-compatible for operational screens, but they are no longer authoritative for mapped Product configuration. Supplier discovery and evidence tools may consume them only for supplier-local operations.

## Shared Product configuration workspace

The Admin shell hosts one supplier-neutral right-side Product configuration workspace. It opens from URL state using `productSetup=<productId>` and accepts an optional canonical `step=<stepId>` focus. This makes blocker links refresh-safe and preserves browser back/forward behavior without adding supplier-specific routes.

The workspace renders the twelve canonical steps in their server-provided order. Completed and not-applicable steps remain compact, the requested or first unresolved step is expanded, and later steps remain inspectable but visually secondary. The header and progress count come directly from `GET /api/admin/products/:productId/onboarding-readiness`; the frontend does not recalculate readiness.

Successful content, media and launch mutations refresh publication data and canonical readiness, then focus the next unresolved step. `PUBLIC_IMAGE_MISSING` opens Media and presents `Add public image` through the existing controlled ingestion endpoint. Identity, canonical taxonomy and content are edited directly in the shared workspace: public title, slug, SKU, brand, model, category path, short and long descriptions, overview, delivery wording, SEO fields, canonical specifications and controlled Product documents all use the existing publication draft. Supplier-derived field, specification, image and document candidates remain reviewable source evidence; staff must Accept, Ignore or use controlled ingestion rather than making source evidence public automatically.

Product documents are PDF-only, limited to 10 MB and either uploaded or imported from an approved HTTPS host into TekCentral-controlled storage. The canonical types are Datasheet, Compliance Certificate, User Manual, Installation Guide, Warranty Document, Brochure, Specification Sheet, Safety Document and Other. Draft/version data preserves operational metadata and provenance; public serialization exposes only the safe type, title, TekCentral URL and verification state.

Publication remains explicit. Unsaved changes are tracked and protected on close/navigation, preview uses the real saved draft, Publish is shown only when canonical readiness permits it and the staff member has `products.publish`, and the existing publish service creates the immutable version. A successful publish consumes that editing draft and immediately returns the canonical published review/readiness state; idempotent retries still resolve to the same version. Published Products expose View storefront, Unpublish and Create new version. Version history is visible in the Publication step and a historical immutable snapshot can be restored only by creating a new version. Create new version is an explicit Product-editor action that clones the active immutable snapshot into the next editable draft; merely being published does not create a draft automatically.

Product readers can inspect readiness in a coherent read-only mode. Mutation controls follow existing Product, media and publication permissions. Supplier cost remains absent from both the UI and serialized readiness/publication responses unless the staff member has a cost-view permission.

Discovery may remain supplier-specific. Configuration and publication use one shared TekCentral workspace. Scoop launch readiness, the Syntech onboarding drawer, CJ imported Products, Manual TEKCENTRAL offers and the canonical Products table all hand mapped Products into this workspace; their discovery and mapping compatibility screens remain operational.

After a Product is created or an exact mapping is verified, the supplier workspace opens the shared configuration workspace immediately. Scoop exposes canonical onboarding progress and the canonical next action; Syntech, CJ and Manual TEKCENTRAL preserve their feed/API/inventory controls while handing Product content, media, logistics evidence review, pricing, launch, preview and publication to the shared journey. Existing deep links use URL-backed `productSetup` and `step` state, so browser refresh and back navigation remain safe.

Syntech's initial drawer is limited to source evidence and the create-or-map decision. A mapped catalogue row bypasses that drawer, while successful creation or mapping immediately opens the canonical Product at its first unresolved step.

The create-or-map decision uses the shared supplier-neutral identity intelligence service. It normalizes safe title/brand formatting, preserves model and manufacturer identifiers, and ranks canonical Product candidates as `EXACT`, `HIGH`, `MEDIUM` or `LOW` with visible evidence. Only an authoritative identifier or previously verified supplier identity can permit automatic mapping; title similarity never does. Exact/high candidates block accidental duplicate Product creation until staff explicitly confirms that the source item is distinct.

The same candidate service accepts normalized evidence from Scoop, Syntech, CJ and Manual TEKCENTRAL and can therefore identify an existing canonical Product discovered through another supplier. Supplier mappings remain separate evidence records and never merge supplier operational state.

Pricing Step 9 provides a compact view of the current Product proposal and uses the existing pricing services for routine generation, approval and rejection. Every mutation then reloads server-derived readiness before advancing. Supplier cost and margin remain independently permission-redacted. Complex adjustments stay in `/admin/pricing`; Product ID, proposal ID and a return URL are carried in the deep link so the specialist workspace focuses the exact Product and returns to the same Product configuration step.

The legacy publication page is not the authoritative setup journey. Existing canonical endpoints and mature controls are reused by the shared workspace. Supplier catalogue browsing, sync, exact-source capture, deep logistics diagnostics, inventory operations and supplier-order operations remain supplier-local specialist tools because they operate on supplier evidence rather than public Product configuration. See `product-workflow-capability-audit.md` for the H.4.2C disposition matrix.

## H.4 cross-supplier journey matrix

All configured Product sources cross the same canonical boundary after mapping. Supplier-specific exceptions are operational capabilities, not alternate Product-readiness systems.

| Journey capability | Scoop | Syntech | CJ | Manual TEKCENTRAL |
|---|---|---|---|---|
| Discovery/source entry | XML catalogue and approved evidence capture | Full/update feed catalogue | Search, Browse, Recent and Imported API catalogue | Staff-created manual offer |
| Unmapped decision | Match or create Product | Source-review drawer, then match/create | Exact PID/VID mapping flow | Match existing or create Product |
| Duplicate protection | Shared identity candidates | Shared identity candidates | Exact variant plus shared identity candidates | Shared identity candidates |
| Taxonomy | Canonical registry suggestion/verification | Source-path suggestion and verified exact-path reuse | Canonical registry suggestion/verification | Staff selection from canonical registry |
| Canonical handoff | Shared Product Configuration | Shared Product Configuration | Shared Product Configuration | Shared Product Configuration |
| Content/media/logistics/pricing | Canonical steps 5–9 | Canonical steps 5–9 | Canonical steps 5–9 with exact-variant and FX evidence | Canonical steps 5–9 using staff evidence |
| Launch/preview/publication | Canonical steps 10–12 | Canonical steps 10–12 | Canonical steps 10–12 | Canonical steps 10–12 |
| Published Product | Immutable version, storefront and new-version flow | Same | Same | Same |
| Intentional specialist tools | Feed sync, website/logistics evidence | Sync history, branch stock, guarded UAT procurement | Catalogue discovery, freight diagnostics and guarded order operations | Inventory, warehouse and internal fulfilment operations |

Canonical action labels are stable across supplier tables and the drawer: `Match or create Product`, `Complete taxonomy`, `Complete content`, `Add public image`, `Complete logistics`, `Review commercial evidence`, `Review pricing`, `Select for launch`, `Review preview`, `Review & publish`, `View storefront` and `Create new version`. Explanatory blocker copy remains separate from the concise action label.

### Supplier-neutral manual logistics evidence

Step 7 resolves logistics server-side from supplier-backed evidence plus the latest active staff revision. Supplier evidence is preferred for fields it supplies; staff may persist only missing or deliberately corrected fields. Staff values are never silently replaced by later source refreshes. Canonical units are grams and millimetres. Physical Product completion requires positive weight, length, width and height. Measurements are classified as `PRODUCT`, `PACKAGE` or `SHIPPING`.

Manual evidence is immutable by revision. A new save supersedes the previous active revision, identical normalized saves are no-ops, and optimistic revision checks prevent lost updates. The backend derives the `STAFF_USER` actor and records `PRODUCT_LOGISTICS_EVIDENCE_UPDATED`. No historical backfill is performed. Existing Scoop overrides remain compatible evidence and move to the shared model only when staff next saves through Step 7.

| Supplier | Preferred logistics source | Shared fallback |
| --- | --- | --- |
| Scoop | Feed/catalogue, guarded Product page, pasted official source | Staff manual evidence |
| CJ | Exact-variant API observations | Missing fields only |
| Syntech | Structured catalogue feed | Missing fields only |
| Mustek | Accepted structured evidence where present | Staff manual evidence |
| TVR | Advisory website dimensions are not promoted | Staff manual evidence |
| TEKCENTRAL | None | Full staff manual evidence |

The shared workspace remains URL-backed with `productSetup` and `step`. In-place step controls update history, preserve refresh/back/forward behavior, expose accordion state, move focus to the selected section and do not create supplier-specific routes.

## Legacy and specialist disposition

- Supplier-local discovery, source diagnostics, synchronization, inventory and procurement controls remain required specialist tools.
- Legacy readiness fields remain compatibility-only for older operational response consumers; mapped Product tables and Product configuration use canonical twelve-step readiness.
- The legacy standalone publication page remains a compatibility route. The shared Product Configuration workspace is authoritative.
- Historical persistence adapters and blocker aliases remain temporarily retained for migration compatibility.
- Supplier-specific five-step Product setup checklists and generic mapped-row `Review` actions are deprecated; they must not own readiness or navigation.

Public storefront serialization contains immutable canonical Product snapshots and dynamic supplier-neutral availability only. Supplier identity, source URLs, private stock, costs, margins, provenance and operational notes remain Admin-only and permission-redacted.

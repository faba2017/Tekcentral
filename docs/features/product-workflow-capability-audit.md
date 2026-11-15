# Legacy Product workflow capability audit

H.4.2C audited the legacy publication page, supplier Product workspaces, publication services and public Product detail against the canonical twelve-step Product Configuration Workspace. Standardisation removes duplicate journey ownership, not working capability.

| Legacy capability | Old location/component | Canonical step/location | Classification | Disposition and migration |
|---|---|---|---|---|
| Product identity, public title, slug, SKU, brand and model | `AdminProductPublicationPage` draft form | Product identity | REUSED IN SHARED WORKSPACE | Existing publication draft fields are edited and saved directly in the shared workspace. |
| Verified supplier mapping | Supplier mapping panels and services | Product mapping | REUSED IN SHARED WORKSPACE | Canonical readiness links to the existing mapping workflow; mapping state was not duplicated. |
| Category, category slug and subcategory | Legacy publication draft | Taxonomy | REUSED IN SHARED WORKSPACE | Existing draft fields are now directly editable in the canonical step. Supplier taxonomy suggestions remain evidence. |
| Short/long description, overview/fallback content | Legacy publication content editor | Content | REUSED IN SHARED WORKSPACE | Mature draft fields and default-content service are reused. |
| SEO title and description | Legacy publication content editor | Content | REUSED IN SHARED WORKSPACE | Existing draft fields are preserved. |
| Delivery wording | Legacy publication content editor | Content | REUSED IN SHARED WORKSPACE | Existing `deliveryDisplay` field was restored to the shared editor. |
| Specifications | Legacy publication content editor | Content | REUSED IN SHARED WORKSPACE | Add/edit/remove controls and provenance-bearing source suggestions are reused. |
| Source field/specification suggestions with Accept/Ignore | Legacy source-enrichment panel | Content | REUSED IN SHARED WORKSPACE | Supplier enrichment now has explicit Accept/Ignore review without automatic public adoption. |
| Source image candidates | Legacy enrichment/image controls | Content to Media handoff | REUSED IN SHARED WORKSPACE | Choosing a candidate prepares the existing controlled TekCentral image-ingestion flow. |
| Gallery, primary selection, reorder and removal | Legacy media workspace/services | Media | REUSED IN SHARED WORKSPACE | Existing controlled gallery endpoints and media controls remain canonical. |
| PDF upload and trusted URL import | Legacy documents panel | Content | REUSED IN SHARED WORKSPACE | Existing storage/import endpoints are reused; files remain TekCentral-controlled. |
| Document type, public title and metadata | Legacy documents panel | Content | REUSED IN SHARED WORKSPACE | Canonical document categories and stored metadata are retained. |
| Supplier document candidates | Legacy source suggestions | Content | REUSED IN SHARED WORKSPACE | Candidates prepare controlled import; they are never attached directly. |
| Arbitrary external Product document reference | Legacy draft form | None | DEPRECATED SAFELY | Public downloads require controlled TekCentral storage; arbitrary external references are not a legitimate public state. |
| Supplier source refresh and enrichment capture | Scoop/CJ/Syntech supplier workspaces | Supplier workspace | MOVED TO SUPPLIER OPERATIONAL WORKSPACE | Source acquisition stays supplier-local; reviewed evidence flows into canonical Product configuration. |
| Exact supplier page capture and deep source diagnostics | Scoop specialist tools | Supplier workspace | RETAINED AS SPECIALIST TOOL | Supplier-specific evidence investigation is not Product configuration. |
| Logistics metadata and staff override | Supplier logistics editors/services | Logistics readiness handoff | MOVED TO SUPPLIER OPERATIONAL WORKSPACE | The drawer shows canonical status/blockers; detailed source logistics editing remains with the supplier evidence owner. |
| Delivery/availability display | Legacy publication form and availability service | Content / Logistics / Preview | REUSED IN SHARED WORKSPACE | Public wording is editable; supplier-neutral availability remains derived by the canonical service. |
| Inventory operations and exact stock diagnostics | Supplier inventory workspaces | Supplier workspace | RETAINED AS SPECIALIST TOOL | Operational stock evidence is not duplicated in Product publication state. |
| Commercial evidence and supplier cost | Supplier evidence/pricing services | Commercial | REUSED IN SHARED WORKSPACE | Canonical readiness is reused and cost remains permission-gated. |
| Pricing proposal, FX evidence and approval | Pricing workspace/services | Pricing | MOVED TO SUPPLIER OPERATIONAL WORKSPACE | The canonical step links to the existing specialist pricing workflow; no second pricing engine was introduced. |
| Launch selection | Supplier launch-readiness controls | Launch | REUSED IN SHARED WORKSPACE | Existing launch-selection mutation is available in the canonical journey. |
| Customer-facing preview | Legacy publication preview route | Preview | REUSED IN SHARED WORKSPACE | Existing real-draft preview is reused and now returns to the shared workspace. |
| Publish and eligibility blockers/warnings | Legacy publication review | Publication | REUSED IN SHARED WORKSPACE | Stable backend eligibility, warnings and the canonical publish service are rendered in the shared step. |
| Unpublish | Legacy publication page | Publication | REUSED IN SHARED WORKSPACE | Existing unpublish service and confirmation are reused. |
| Publication version history | Legacy publication page | Publication | REUSED IN SHARED WORKSPACE | Immutable versions are visible in the canonical step. |
| Create new version | Legacy publication page | Publication | REUSED IN SHARED WORKSPACE | Existing service clones the active immutable snapshot into an explicit draft. |
| Restore/rollback | Legacy version history | Publication | REUSED IN SHARED WORKSPACE | Restore creates a new immutable version; history is never rewritten. |
| Storefront Downloads | Public Product detail | Public Product detail | REUSED IN SHARED WORKSPACE | Controlled documents configured in Content continue to drive the public Downloads section. |
| Draft dirty-state and navigation protection | Legacy publication page | Shared workspace shell | REUSED IN SHARED WORKSPACE | Unsaved edits now guard drawer close and browser unload; publishing requires a saved draft. |
| Safety validation, readiness and next action | Supplier checklists and legacy eligibility | All 12 steps | REDUNDANT WITH CANONICAL 12-STEP FLOW | Supplier-specific readiness state machines are no longer authoritative; server-derived canonical readiness owns status and blockers. |
| RBAC, audit events and idempotent publication | Existing backend services | Shared workspace/services | REUSED IN SHARED WORKSPACE | Existing permissions, audits and idempotency remain authoritative. |
| Supplier sync, catalogue browse and supplier-order operations | Supplier Hub/workspaces | Supplier workspace | RETAINED AS SPECIALIST TOOL | These are operational capabilities and intentionally remain outside Product configuration. |

## Capabilities discovered beyond the original H.4.2C surface

The audit found source suggestion Accept/Ignore controls, source image/document candidates, direct identity and taxonomy editing, delivery wording, dirty-state protection, unpublish, immutable version history and restore-as-new-version. These legitimate Product-management capabilities were migrated into the shared workspace. Exact supplier-page capture, deep logistics diagnostics, inventory and supplier-order operations were confirmed as supplier-operational capabilities and retained outside it.

No legitimate Product-management capability remains unexplained or classified as `MISSING FROM NEW WORKSPACE` after this migration.

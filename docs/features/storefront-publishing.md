# Storefront Publishing

Publication and merchandising are independent. Publishing enables ordinary discovery but never adds a Product to Featured or another homepage section and never creates a promotion. Unpublishing excludes a Product from public section/promotion resolution while preserving the internal placement so staff receive an eligibility warning.

Storefront publication is an explicit staff action. Supplier launch readiness and public publication are separate states; reaching `READY_FOR_PUBLISH_REVIEW` never publishes a product.

Publication review and draft preview use the current approved Product pricing
proposal as their sole price authority. Saved draft prices are not commercial
authority, supplier cost is never presented as public price, and a missing
approved price renders as unavailable while blocking publication.

Supplier adapters may provide normalized, fingerprinted Product enrichment
evidence. The supplier-neutral publication workflow turns that evidence into
reviewable title, description, SEO, specification and image suggestions bound
to the exact source offer or variant. Staff must explicitly accept, edit or
ignore suggestions; refreshes do not overwrite staff-owned draft content.
Supplier URLs remain ingestion candidates rather than public hotlinks, and
supplier identity/provenance is removed from public catalogue responses.

## Boundary

- Admin review uses the verified supplier mapping, current offer readiness, and current approved pricing proposal.
- A publish action atomically appends an immutable public version and points the product at that version.
- Public catalogue responses expose only the customer product snapshot and a safe availability state. Supplier identity, costs, mappings, proposal details, internal readiness, and audit data remain server-side.
- Public price always comes from the approved pricing proposal selected by the server. Presentation edits cannot submit a price.
- A later approved proposal does not change the active public version. Staff must publish a new version.
- Once a supplier offer is verified against an internal Product, launch selection is recorded on that Product. The source supplier workspace hands off to the same Product review, controlled-image, draft, and immutable publication workflow used by every supplier.
- Publishing is catalogue activity only. It does not reserve inventory, submit a supplier order, pay a supplier, or advance fulfilment.

## Lifecycle

`NOT_PUBLISHED -> READY_FOR_PUBLISH_REVIEW -> PUBLISHED -> UNPUBLISHED`

Republishing an unpublished product creates a new version. Rollback also creates a new version from an older presentation; it is blocked unless the current approved price matches the selected historical version.

Availability is resolved from current verified supplier evidence at public read time, independently of the immutable content version. The supplier-neutral states are `IN_STOCK`, `LOW_STOCK`, `AVAILABLE_FROM_SUPPLIER`, `OUT_OF_STOCK`, `BACKORDER`, `PREORDER`, `CHECK_REQUIRED`, `AVAILABILITY_UNKNOWN`, `DELIVERY_CHECK_REQUIRED`, and `DISCONTINUED`. Fresh evidence from multiple verified mappings is ranked by the best valid fulfilment option; stale-only evidence resolves to `CHECK_REQUIRED`, while missing trustworthy evidence resolves to `AVAILABILITY_UNKNOWN`. Public responses expose only the normalized state, customer label, freshness, observation timestamp, and purchase eligibility. Supplier identity, source fields, warehouse details, quantity, and costs remain private. Availability changes do not create a publication version or silently unpublish a product.

Publication content, media and price are immutable version data, while availability is deliberately live operational evidence. Publication review, canonical onboarding, storefront listing/detail, cart and checkout all resolve availability through `productAvailabilityService`; raw supplier labels stored alongside an offer or historical `availabilityDisplay` wording are not customer availability authority. A supplier refresh can therefore change availability on the next read without republishing the Product or changing its active version.

Cart and checkout read the same normalized availability model. `OUT_OF_STOCK`, `DISCONTINUED`, and `AVAILABILITY_UNKNOWN` block checkout; `DELIVERY_CHECK_REQUIRED` remains purchasable only through the existing fresh delivery-quote validation path.

Demo seed products remain a separate frontend fallback catalogue. They are not publication records and cannot be mistaken for supplier-backed versions.

## Product images and confirmations

New publication versions require a TekCentral-controlled primary image. Admin staff ingest an HTTPS source image through the backend, which accepts supported image MIME types up to 5 MB and stores a content-addressed asset under `.data/public-assets/products`. The immutable version retains private source provenance while the public snapshot references `/api/public/assets/products/...`. Failed or blocked retrieval is reported to staff and never triggers anti-bot bypass behavior.

Publish, unpublish and restore use the shared accessible system confirmation modal. Native browser confirmation dialogs are not used by the publication workflow.

## Public content presentation

- Short Description is the concise summary beside price and purchase actions.
- Long Description is the main `About this product` body.
- Overview remains available for source provenance and acts as the public fallback when Long Description is empty; it is not rendered as a competing section.
- Key specifications use explicitly marked key rows, while remaining structured specifications appear in the expandable technical section.
- Published documents use friendly type labels and TekCentral-controlled download URLs. In the editor, upload/import controls precede the draft document list.

The publication action bar follows the draft lifecycle: unsaved changes, saved changes pending publication, and compact live-version status. Save and publish confirmations are transient; the immutable version and explicit draft boundaries remain authoritative.
# Product policy

Publication review and the final publish write both enforce the effective Product policy from System Settings. The configured minimum content state may be `CONTENT_BASIC` or `CONTENT_ENRICHED`; protected requirements for an approved public price, a TekCentral-controlled primary image, a short description, and explicit staff publication cannot be disabled. Supplier enrichment and SEO suggestion settings affect future generated suggestions only and never rewrite saved drafts or immutable publication versions.

Admin Product rows link to publication review only when the backend supplies a canonical internal Product ID. Legacy catalogue/demo rows without a matching internal Product are labelled for repair and cannot navigate into a broken publication route.
# Multi-image publication

Product Images are part of the immutable publication snapshot. Every published image must be a TekCentral-controlled asset. Staff may add, remove, reorder and select a primary image in the draft; nothing becomes public until an explicit publish creates a new version. Rollback preserves the historical gallery and order.

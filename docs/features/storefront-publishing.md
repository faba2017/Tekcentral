# Storefront Publishing

Storefront publication is an explicit staff action. Supplier launch readiness and public publication are separate states; reaching `READY_FOR_PUBLISH_REVIEW` never publishes a product.

## Boundary

- Admin review uses the verified supplier mapping, current offer readiness, and current approved pricing proposal.
- A publish action atomically appends an immutable public version and points the product at that version.
- Public catalogue responses expose only the customer product snapshot and a safe availability state. Supplier identity, costs, mappings, proposal details, internal readiness, and audit data remain server-side.
- Public price always comes from the approved pricing proposal selected by the server. Presentation edits cannot submit a price.
- A later approved proposal does not change the active public version. Staff must publish a new version.

## Lifecycle

`NOT_PUBLISHED -> READY_FOR_PUBLISH_REVIEW -> PUBLISHED -> UNPUBLISHED`

Republishing an unpublished product creates a new version. Rollback also creates a new version from an older presentation; it is blocked unless the current approved price matches the selected historical version.

Availability is resolved from the current authoritative offer at public read time: positive stock is available, zero stock is unavailable, and unknown or stale stock is shown as unknown. Availability changes do not silently unpublish a product.

Demo seed products remain a separate frontend fallback catalogue. They are not publication records and cannot be mistaken for supplier-backed versions.

## Product images and confirmations

New publication versions require a TekCentral-controlled primary image. Admin staff ingest an HTTPS source image through the backend, which accepts supported image MIME types up to 5 MB and stores a content-addressed asset under `.data/public-assets/products`. The immutable version retains private source provenance while the public snapshot references `/api/public/assets/products/...`. Failed or blocked retrieval is reported to staff and never triggers anti-bot bypass behavior.

Publish, unpublish and restore use the shared accessible system confirmation modal. Native browser confirmation dialogs are not used by the publication workflow.

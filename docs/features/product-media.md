# Product media and supplier candidate audit

TekCentral public Product media is supplier-neutral. Supplier URLs remain private Admin evidence until an authorized staff member ingests them into controlled object storage. Publication snapshots contain only ordered `/api/public/assets/products/*` URLs and safe public media metadata. The first image is canonical primary; storefront thumbnail selection is temporary browser state and never writes Product data.

## Candidate contract

Supplier enrichment normalizes media candidates with supplier/source identity, Product or exact-variant association, discovery time, source type, candidate order, reuse eligibility, status and evidence. Current supplier candidates default to `REVIEW_REQUIRED`; technical accessibility is not treated as permission to republish. Controlled ingestion validates HTTPS retrieval, supported MIME type, non-empty bounded content and content-addressed duplicate identity. Staff uploads additionally validate file signatures.

## Supplier capability matrix

| Supplier | Current image evidence | Multi-image available | Automation possible | Staff review needed | Notes |
| --- | --- | --- | --- | --- | --- |
| Scoop | XML/website `imageUrl`; public-page/manufacturer evidence may provide supporting content but no proven gallery contract | Not currently proven by the normalized feed | Controlled ingestion is technically available for approved URLs | Yes | Anti-bot/session restrictions are not bypassed; manufacturer accessibility does not establish reuse rights. |
| Syntech | `featured_image` plus `additional_images[]` from the private JSON feed | Yes | Candidate discovery and controlled ingestion | Yes | Exact Syntech SKU is retained; feed images remain private until reviewed. |
| CJ | Product image, exact selected-variant image and Product-description image URLs | Yes | Exact selected-variant image can be confidently associated; other Product-level images remain review candidates | Yes | Description/Product images are marked `UNVERIFIED`; they must not be assumed to represent the selected colour/capacity/layout. |
| Manual TEKCENTRAL | Staff-owned upload or explicitly approved HTTPS URL | Yes | Manual controlled upload/ingestion | Staff is the approval authority | No external automation or fabricated source is used. |
| Mustek | No active adapter or approved media contract in the repository | Not yet proven | Framework supports HTML, download URL and future media-feed candidates | Yes | Images must remain internal candidates until identity and reuse permission are established. |
| TVR | Current workbook does not consistently provide image URLs | No reliable current source | Framework accepts future portal/manufacturer/media-feed evidence | Yes | No image source is fabricated. |

## Remote retrieval policy

Untrusted and semi-trusted Product media/document URLs accept HTTPS only, reject URL credentials/custom ports, and fail closed for loopback, private, link-local, metadata, multicast, unspecified, reserved and documentation address ranges. Every DNS answer must contain only public addresses. Redirects are followed manually, re-resolved and revalidated per hop; downgrade, repeated URL and over-limit chains fail closed. Bodies are streamed with declared and actual byte limits and a bounded timeout.

Remote images retain the existing JPEG, PNG, WebP and GIF policy and must match their declared MIME signature before storage. Remote Product PDFs retain the 10 MiB, `application/pdf` and `%PDF-` policy, reject obvious JavaScript/launch/embedded-file markers, and are served with `nosniff` as attachments. This marker check is not full malware scanning; deeper PDF parsing/scanning remains a later defence-in-depth item.

## Gallery and versioning

Canonical drafts support up to eight controlled images. Staff may choose primary, reorder or remove images; explicit draft save persists the order. Immutable publication versions retain their own gallery and primary image. Creating a later draft and changing media does not mutate historical versions.

The Product detail viewer shows the primary image initially. Two or more images add keyboard- and touch-operable thumbnails in a horizontally scrollable strip, so galleries larger than four remain accessible without discarding approved media. Broken secondary images are removed only from the viewer state and cannot change canonical Product media.

## Future source registry compatibility

The candidate contract supports `API`, `LIVE_FEED`, `DOWNLOAD_URL`, `HTML`, `MANUAL` and `MEDIA_FEED` evidence without embedding supplier URLs in public Product logic. Mustek and TVR can therefore contribute future evidence through the Supplier Source Registry without changing publication or storefront gallery semantics.
# Product-bound media safety

Supplier media candidates resolved through a verified mapping are bound to the canonical Product. TVR candidates carry a server-derived `targetProductId`; ingestion rejects any mismatch with the Product ID in the authenticated route before fetching or storing bytes.

The first item in a controlled Product gallery is the canonical primary image (`displayOrder === 0`). Adding the first image therefore establishes a primary through shared gallery ordering; it is not a separate staff primary-selection action. Adding later images does not displace the existing primary unless staff explicitly reorder the gallery.

Controlled media removal is Product-scoped and append-only audited. Removing an association does not aggressively delete globally content-addressed bytes.


# Product Supplier Evidence

TekCentral Products remain supplier-neutral. A Product may have verified Scoop, CJ, Syntech, and TekCentral Manual Supplier offers simultaneously; adding or editing one offer never replaces another source or mutates Product content.

The internal `TEKCENTRAL` supplier uses the normal `SupplierOffer -> SupplierProductMapping -> Product` relationship. Phase A maps staff-created manual offers only to existing Products. The Product admin surface can show TekCentral among internal supplier relationships, while public Product serialization exposes only the resolved semantic availability state and never supplier identity, supplier SKU, source cost, notes, fingerprints, or evidence timestamps.

Fresh active manual stock participates in canonical multi-supplier availability. Another fresh usable supplier can keep a Product available when TekCentral stock is zero, and fresh TekCentral stock can keep it available when another source is out of stock. Inactive evidence is ignored and stale evidence is conservative.

Phase B allows an unmapped manual offer to create a canonical Product through staff review. Manual supplier SKU and canonical Product SKU remain separate. Canonical taxonomy is required; merchandising concepts remain tags or collections.

Specifications, SEO, draft content, controlled assets, readiness review, and immutable publication versions remain owned by the normal Product publication workspace. Manual onboarding never publishes automatically.

Manual inventory operations may resolve an exact canonical Product SKU or an internal Product EAN/GTIN/UPC to its TekCentral offer. Lookup is staff-only and does not mutate Product content, publication, price or stock. Manual counts, locations, replenishment settings and forecasts are never included in public Product responses.
# Product media

Canonical Products support up to eight ordered images. Staff ingest legitimate supplier or manual HTTPS candidates into TekCentral-controlled storage, select the primary image, reorder, remove and save the publication draft. Public Product detail renders the complete accessible gallery; list cards and operational summaries use the primary image only. Broken secondary media degrades locally without breaking the Product page.

## Audit projection

Product publication, unpublication, draft, category, and primary-image changes project bounded summaries into Admin Audit / Activity while immutable publication versions remain canonical.

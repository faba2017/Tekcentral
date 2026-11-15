# Product Catalogue

## Durable catalogue persistence

When `PERSISTENCE_PROVIDER=POSTGRES`, canonical internal Product state, supplier mappings/offers, pricing proposals, immutable publication versions, merchandising and controlled Product media metadata use PostgreSQL. Legacy JSON files are migration/reference-only and are not runtime fallbacks. Code-defined taxonomy and code-seeded Product definitions remain canonical metadata while durable identities preserve their historical mapping relationships.

Catalogue migration never publishes, approves pricing or contacts a supplier. Public serialization continues to use publication snapshots and supplier-neutral availability only; supplier identity, costs, stock evidence and procurement internals remain private. Product media bytes continue through the object-storage abstraction, and valid metadata without a retrievable controlled object does not satisfy `PUBLIC_IMAGE_MISSING`.

Published Products participate in normal Shop, taxonomy, search and Zeus discovery. Homepage placement is separate and explicit. Shop category options derive from canonical taxonomy categories represented by public Products, brands derive from public Products, and price filtering uses effective public selling price. See `merchandising.md`.

## Canonical taxonomy

The catalogue uses taxonomy version `1` from the shared registry. Public routes support `/shop/:category`, `/shop/:category/:subcategory` and `/shop/:category/:subcategory/:productType`. Legacy `/category/:slug` links remain compatible through aliases.

Search indexes Product title, SKU, brand and resolved canonical labels. Related Products rank the same product type first, then subcategory, then category. Supplier source categories are not public search terms.

Admin Product Operations filters the full loaded Product dataset by category, subcategory, product type and taxonomy status. Ambiguous legacy records receive taxonomy attention without being unpublished. New supplier-backed Products preserve source-category provenance and persist stable canonical IDs.

Manual Supplier products can select the canonical path directly. Future Syntech integration must map its source tree through the supplier-category mapping model; its merchandising groups become tags or collections. Neither integration is enabled by this taxonomy phase.

## CONFIRMED

- Phase 3 implements a frontend-only mock catalogue with polished customer-facing browse, category and product detail pages.
- The platform owns an internal product catalogue representation.
- Product data lives in `src/data/catalogue.ts`.
- Product types live in `src/types/product.ts`.
- Demo prices are ZAR values and are not live supplier prices.
- Demo availability is not live supplier stock.

## PLANNED

Products may eventually include:

- Internal product ID
- Brand
- Model
- Manufacturer part number
- Category
- Description
- Specifications
- Retail price
- Product images
- Warranty information
- Supplier offers

Supplier offers may eventually include:

- Supplier
- Supplier SKU
- Cost
- Stock
- Lead time
- Fulfilment options

## PENDING CONFIRMATION

- Product data source
- Launch catalogue
- Pricing strategy
- Warranty data
- Product image sources

## Syntech onboarding

Syntech Supplier Hub records can be reviewed into canonical Products through exact-SKU mapping or explicit Product creation. Supplier HTML is normalized into reviewable text, dynamic attributes become content suggestions, and supplier image URLs remain private candidates until controlled ingestion. Existing Products are never overwritten when another supplier offer is attached.

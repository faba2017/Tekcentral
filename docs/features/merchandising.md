# Merchandising and storefront control

TekCentral keeps publication, discovery, homepage merchandising and promotional pricing separate. Publishing makes a canonical Product eligible for Shop, taxonomy pages, search and Zeus. It never adds a Product to Featured or another curated homepage section.

Homepage records reference canonical Product IDs and taxonomy category IDs only. They contain no supplier identity, supplier SKU, cost or margin data.

## Homepage resolution

`PRODUCT_LIST` sections support `MANUAL_ONLY` and `MANUAL_WITH_AUTOMATIC_FALLBACK`. Manual Products retain their configured order. Explicitly enabled fallback fills remaining slots with published, purchasable Products in the configured taxonomy scope, ordered deterministically by canonical Product ID. Duplicates are removed. Empty sections are omitted rather than filled with demo Products.

`CATEGORY_LIST` sections resolve only configured, valid top-level taxonomy categories that contain a public Product. Invalid or empty categories do not produce public links.

The initial migration preserves the category structure and networking essentials intent. Featured is manual-only, so publication cannot imply endorsement or popularity. “Popular technology picks” is merchandising copy for a manually curated section, not a sales-popularity claim.

## Promotions

Promotion timestamps are ISO instants evaluated using backend time. Status is derived as disabled, scheduled, active or ended. A promotional price must be positive and below the current public regular price. Enabled overlapping windows for one Product are rejected. If the regular price later falls to or below a stored promotional price, the promotion is ignored and regular price remains effective.

`listPublicProducts()` applies effective promotions before Products reach homepage, Shop/category pages, Product detail, Zeus, cart, checkout and order creation. Cart and checkout keep their authoritative revalidation, and historical orders retain accepted item snapshots after a promotion ends.

The public homepage API returns only resolved customer-safe sections, Products and canonical categories. Audit entries and internal promotion references are never public.

## Administration

Admin → Merchandising provides overview, homepage section, Featured, promotion and category-highlight workspaces. Ordering uses explicit keyboard-accessible controls. Production staff authentication and roles remain a shared Admin launch blocker; this phase reuses the current trusted-origin Ops boundary rather than inventing merchandising-only authentication.

Campaigns are intentionally deferred because sections and bounded promotions cover the current need without a broader marketing automation model.

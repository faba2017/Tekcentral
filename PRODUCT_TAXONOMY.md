# Product Taxonomy

Runtime taxonomy is managed through the canonical PostgreSQL registry documented in `docs/features/canonical-taxonomy.md`. The definitions in `src/lib/product-taxonomy.ts` are retained as deterministic bootstrap data and conservative recognition vocabulary; they are not the mutable production source of truth.

Taxonomy version `1` is the canonical, supplier-neutral TekCentral product taxonomy. The older Phase 2 list below is retained as migration history; its slugs are compatibility aliases, not the current category model.

## Canonical Registry (Version 1)

The PostgreSQL canonical taxonomy registry is the runtime authority. Stable IDs are separate from display labels and slugs. Products may use three levels: category, subcategory and optional product type. The code definitions in `src/lib/product-taxonomy.ts` seed an empty registry and provide compatibility recognition vocabulary only.

Top-level categories, in navigation order:

1. Computers
2. Networking
3. Security & Surveillance
4. Computer Components
5. Peripherals & Accessories
6. Storage
7. Power & Backup
8. Cables & Connectivity
9. Office & Business Technology
10. Smart Home & Lifestyle
11. TV & Audio
12. Mobile Accessories
13. Software

`Office & Business Technology > Business Communication` owns IP Phones, Conference Phones, DECT Phones, VoIP Gateways & ATAs, SIP / VoIP Accessories, Business Headsets, Paging Devices, Intercom Devices and Communication Accessories. Business telephony is not Networking.

Printers, scanners, POS devices, projectors and collaboration products are also under Office & Business Technology. Storage owns SSDs, HDDs, NAS and external drives; Computer Components does not. General network, fibre, display and USB cabling belongs under Cables & Connectivity. Mobile Accessories owns only clearly mobile-focused products.

Merchandising concepts such as New, Featured, On Promotion, Clearance and Coming Soon are tags or collections, never canonical categories.

## Assignment And Migration

Products store `categoryId`, optional `subcategoryId`, optional `productTypeId`, `taxonomyVersion: 1` and `taxonomyStatus`. Legacy `category`, `categorySlug` and `subcategory` fields remain readable during migration.

Resolution precedence is:

1. existing verified Product taxonomy;
2. verified supplier-category mapping;
3. deterministic exact mapping;
4. `REVIEW_REQUIRED` or `UNMAPPED`.

Published snapshots are resolved at read time and are not rewritten or republished. Product IDs, prices, availability, supplier-product mappings and publication versions remain unchanged. Future order lines snapshot canonical taxonomy IDs; historical order lines are not rewritten.

Legacy aliases include `printing-office`, `security`, `power`, `smart-tech`, `accessories` and `cables`. Legacy `/category/:slug` URLs remain valid while canonical navigation uses `/shop/:category`, with optional subcategory and product-type segments.

Supplier source category ID, path and label are provenance. They are never exposed as public category metadata and never overwrite a verified Product assignment.

## PLANNED Categories

### Computers

- Laptops
- Desktop PCs
- Mini PCs
- Workstations
- Monitors
- Docking stations
- Computer accessories

### Networking

- Routers
- Switches
- Access points
- Mesh Wi-Fi
- Firewalls
- Network adapters
- PoE equipment
- Fibre equipment
- Patch panels
- Racks
- Cat5e/Cat6/Cat6A cabling
- Networking tools
- Structured cabling accessories

### Printing And Office Technology

- Printers
- Multifunction printers
- Scanners
- Projectors
- POS equipment
- Conference equipment
- Smart-office equipment

### Security

- CCTV
- IP cameras
- NVRs
- Access control
- Smart security
- Sensors

### Power

- UPS systems
- Inverters
- Surge protection
- Backup power equipment
- Power accessories

### Smart Technology

- IoT products
- AI-enabled technology
- Smart displays
- Automation devices
- Sensors
- Smart-office equipment

### Accessories

- Keyboards
- Mice
- Headsets
- Webcams
- Storage
- USB hubs
- Chargers
- Adapters
- Cables
- Other technology accessories

## PLANNED Category Mapping

The platform should support mapping between:

```text
Supplier category
  -> Internal category
  -> Storefront category
```

This is needed because suppliers may structure product categories differently.

## CONFIRMED Phase 2 Storefront Categories

The mock catalogue currently includes products for:

- Computers
- Networking
- Printing & Office
- Security
- Power
- Smart Tech
- Accessories

The storefront uses category slugs:

- `computers`
- `networking`
- `printing-office`
- `security`
- `power`
- `smart-tech`
- `accessories`

## PENDING CONFIRMATION

- Launch categories
- Category hierarchy depth
- Product attributes per category
- Filter rules
- Supplier category mappings
- SEO/category URL structure

## UNDECIDED

- Whether B2B solution packages are categories, guided flows, or both
- Whether services appear as products, add-ons, or quotation items
# Supplier suggestion workflow

Supplier category paths may suggest only IDs that already exist in this taxonomy. Exact staff-verified supplier-category mappings have highest confidence. Otherwise deterministic Product title, type, brand and specification evidence may produce a review-required suggestion. Ambiguous evidence remains unresolved; it must not create a new taxonomy branch or alter a verified Product assignment.

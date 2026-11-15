# Supplier Category Mapping

Supplier categories are immutable source evidence. TekCentral Products use the PostgreSQL canonical taxonomy registry. `src/lib/product-taxonomy.ts` may recognize legacy terms, but the live registry validates every canonical target.

The mapping model records supplier ID, source category ID/path/label, canonical category/subcategory/product-type IDs, status, optional confidence, reviewer and review time. Supported states are `VERIFIED`, `REVIEW_REQUIRED` and `UNMAPPED`.

Resolution precedence protects staff decisions: existing verified Product taxonomy, verified supplier-category mapping, deterministic exact mapping, then review required. Feed refresh must never overwrite a verified assignment or create a public category from an unknown supplier label.

Current examples:

- Scoop network switch -> Networking > Switches
- Scoop Ethernet cable -> Cables & Connectivity > Network Cables
- Scoop fibre patch lead -> Cables & Connectivity > Fibre Cables
- Scoop IP phone -> Office & Business Technology > Business Communication > IP Phones
- Scoop ATA -> Office & Business Technology > Business Communication > VoIP Gateways & ATAs
- Scoop conference phone -> Office & Business Technology > Business Communication > Conference Phones
- CJ UGREEN Ethernet cable -> Cables & Connectivity > Network Cables

Future Manual Supplier entry selects canonical taxonomy directly. Future Syntech source categories require reviewed mappings; Just Arrived, Coming Soon, Last Chance, Unboxed and On Promotion map to collections/tags rather than categories.

## Reusable exact-path intelligence

H.4.3B makes a verified supplier source path reusable without turning supplier taxonomy into Product taxonomy. Paths are Unicode-normalized, case-insensitive and treat harmless separators such as `/`, `|`, `>` and `→` consistently. Reuse remains supplier-scoped and exact: a parent, child or merely similar category is never inferred from another mapping.

Broad source labels such as Products, Technology, Electronics, General and Accessories are unsafe without Product evidence. They remain review-required or unmapped. A staff change to a reusable mapping creates a new revision with actor and timestamp; editing one canonical Product's taxonomy remains a Product-level exception and does not rewrite the supplier-wide mapping.

Reusable mappings are protected by `suppliers.manage_mapping`, persisted through the authoritative catalogue repository, and recorded in the H.2 audit stream as verification or mapping-change events.

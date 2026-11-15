# Canonical taxonomy registry

TekCentral taxonomy is a PostgreSQL-authoritative hierarchy of category, subcategory, and Product-type nodes. Stable node IDs are the durable identity used by Products and verified supplier source-path mappings. Names, slugs, ordering, SEO metadata, lifecycle status, and storefront visibility are editable attributes.

The PostgreSQL canonical taxonomy registry is the runtime authority. `src/lib/product-taxonomy.ts` is not a runtime fallback. It remains only for deterministic bootstrap, migration/test fixtures, legacy aliases, and conservative recognition vocabulary. Recognition may propose a stable ID, but current identity, hierarchy, labels, slugs, visibility, and lifecycle must resolve through the canonical repository before affecting a Product.

Migration `0009_canonical_taxonomy_registry.sql` creates the registry. The first canonical read seeds it deterministically from the former code registry while preserving every unique existing ID and slug. Three legacy Product-type IDs were reused under more than one parent; the first occurrence retains its ID and later occurrences receive a deterministic parent-qualified ID so the canonical hierarchy has unambiguous stable identity. Code taxonomy remains only the bootstrap and deterministic suggestion vocabulary; runtime selection and validation read the canonical registry.

## Administration

`Catalogue → Taxonomy` supports hierarchy inspection and controlled creation, rename, slug change, move, visibility, deprecation, archival, and reactivation. Mutation requires `taxonomy.manage`. Catalogue staff without that permission can inspect and select active taxonomy but cannot change the registry.

Slug changes retain the previous slug as an alias. Moves and lifecycle changes show impact and require confirmation. Nodes are never hard-deleted. Published Product snapshots remain immutable and keep their historical labels; current Product configuration and navigation resolve current labels by stable ID.

New nodes start hidden from the storefront. Archived or deprecated nodes cannot be selected for new Product configuration. Existing references remain available for history and migration.

## Supplier mappings and onboarding

Verified source-path mappings store stable canonical IDs. An exact verified mapping is reused only while its complete destination path remains active. Otherwise onboarding presents a reviewed suggestion rather than silently applying an invalid destination.

The shared Product Configuration Workspace loads active choices from `/api/admin/product-taxonomy`; it does not own a supplier-specific taxonomy list. Authorized staff can open Taxonomy management from the Taxonomy step.

## Runtime and concurrency

The server uses a short-lived read cache, invalidated after every mutation. PostgreSQL writes use optimistic revisions plus advisory locking and sibling-slug uniqueness constraints. Conflicting edits or duplicate sibling slugs fail rather than silently overwriting another administrator's work.

When `PERSISTENCE_PROVIDER=POSTGRES`, registry failures propagate through the requesting API or operation. Runtime services do not silently substitute the code vocabulary. This fail-closed rule prevents Admin-managed taxonomy from diverging across Product, supplier, storefront, SEO, merchandising, or Zeus surfaces.

## Remaining code-vocabulary uses

- `canonicalTaxonomyRepository`: deterministic bootstrap only.
- `canonicalTaxonomyService` and `categorySuggestionService`: legacy-text recognition followed by mandatory active-registry validation.
- supplier category ingestion helpers: advisory normalization only; verified mappings store registry IDs.
- `src/data/catalogue.ts` and `backend/catalogue.ts`: legacy demo/test fixture compatibility.
- taxonomy tests: bootstrap and compatibility assertions.

Supplier taxonomy is supplier evidence, not TekCentral taxonomy. It must map to stable canonical registry IDs.

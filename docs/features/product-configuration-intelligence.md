# Product configuration intelligence

The canonical 12-step Product Configuration Workspace derives compact, supplier-neutral review recommendations from evidence already held by TekCentral. Recommendations are decision support, not canonical truth: they do not publish a Product, select a supplier, alter availability, approve pricing or overwrite staff-authored content.

Each recommendation carries its area and type, proposed value where relevant, confidence, human-readable reason, supporting evidence, provenance, source timestamp, freshness and review status. The first implementation is deterministic and rule-based; it does not use an LLM, embeddings or a vector database.

## Evidence boundaries

- Content suggestions use explicit supplier fields and structured attributes. Conflicts with canonical specifications are surfaced for review rather than silently resolved.
- Media candidates retain their source association. Exact-variant media ranks ahead of Product-level or unverified media, while duplicate, invalid and review-required candidates remain visibly labelled. Existing controlled-media ingestion and reuse policy remains authoritative.
- Logistics recommendations describe completeness, freshness, missing weight/dimensions and source conflicts. Logistics evidence never substitutes for the separate canonical availability state.
- Pricing recommendations reuse the canonical pricing engine, approved settings and existing CJ FX-impact policy. Cross-supplier proposal comparison is advisory and never changes procurement automatically.

## Persistence, permissions and audit

Recommendations are derived on read and are not a second workflow database. Accepted content and media continue through the publication draft and controlled-media services; pricing decisions continue through pricing proposals; logistics overrides continue through their existing canonical services. Those material actions retain their existing H.2 audit events.

Supplier cost, margin and private stock remain protected by server-side admin response redaction and the corresponding staff permissions. The workspace may show readiness without exposing restricted commercial evidence.

Supplier feeds differ in detail. Missing evidence is reported as missing or partial; it is never invented. Staff can therefore distinguish a useful recommendation from verified canonical data and from an unresolved conflict.

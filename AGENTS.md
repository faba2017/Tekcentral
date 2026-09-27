 # AGENTS.md

Primary persistent instruction map for Codex inside TekCentral.

## Before Working

For significant tasks, read `PROJECT_CONTEXT.md`.

For architecture, backend, integration, API, security, or environment work, also read `ARCHITECTURE.md`.

For commerce, pricing, orders, suppliers, quotations, or product logic, also read `BUSINESS_RULES.md`.

For visual or UI work, also read `DESIGN_SYSTEM.md`.

For catalogue or category work, also read `PRODUCT_TAXONOMY.md`.

Before reversing or modifying an established project decision, read `DECISIONS.md`.

For feature-specific work, inspect `docs/features/`.

For supplier work, inspect `docs/suppliers/`.

## Mandatory Rules

- Inspect existing code before replacing it.
- Preserve working behaviour unless an intentional change is requested.
- Preserve Zeus, the existing interactive 3D robot and AI technology assistant identity.
- Never remove Zeus, replace Zeus with an image, remove pointer tracking, or substantially redesign the robot without explicit approval.
- Never invent supplier capabilities.
- Never hard-code the application around one supplier.
- All new supplier integrations must register through the central supplier registry and use the Supplier Hub/workspace routing model. Do not add supplier-specific items to the global admin navigation.
- Avoid placing secrets in frontend code.
- Never commit API keys or secrets.
- Maintain TypeScript type safety.
- Maintain responsive behaviour.
- Avoid unnecessary dependencies.
- Run appropriate checks after meaningful code changes.
- Update documentation when significant durable project decisions change.

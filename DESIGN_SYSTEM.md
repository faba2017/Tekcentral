# Design System

## Zeus workspace

Zeus uses the standard TekCentral ink and teal palette. Keep the assistant identity compact, preserve the interactive Three.js character, make the transcript the dominant surface, and use bordered structured cards only for Products, orders, policies, consent and actionable states. On mobile, capability navigation becomes horizontal chips rather than a persistent rail.

## CONFIRMED Current Visual Design

The current application is a premium ecommerce technology storefront built around a full-width immersive Molten/Zeus homepage hero and product-led storefront pages.

Existing visual elements:

- Homepage navigation floats inside the hero as a compact glass capsule, with prominent ecommerce links, search, account/cart actions and a distinct Ask Zeus action.
- Dark full-width hero with edge-to-edge MoltenMetal coverage and base color `#07090C`.
- Visible MoltenMetal atmospheric layer in deep teal, Zeus teal, violet and white.
- Zeus remains the primary interactive brand asset and occupies the far-left visual space while keeping central copy readable.
- Subtle teal and restrained glow treatment behind Zeus.
- Large procedural 3D robot preserved in the hero.
- Mobile homepage navigation drawer inside the hero.
- Teal and black primary call-to-action system.
- Subtle shadows and glow effects.
- Promotional merchandising cards for featured collections.
- Visual category merchandising cards with local image slots.
- Editorial business technology section.
- Zeus assistant input experience section.
- Clean product cards based on the approved ProductCard foundation.
- Structured local product/category visual placeholders.
- Filter sidebar on desktop and filter drawer on mobile.
- Product detail pages with technical specification sections.
- Client-side cart page with quantity controls.
- Comparison table for up to three products.
- Phase 4 checkout, order history, order detail, cancellation, return and refund
  screens use the same restrained ecommerce surface system and TekCentral Accent
  Teal primary actions.

Zeus is currently the main source of brand personality.

## CONFIRMED Current Styling

- Tailwind utility classes are used directly in components.
- Global CSS variables in `src/index.css` define semantic colors and TekCentral brand tokens.
- Font stack uses Inter first, then system sans fonts.
- The homepage hero fills the first viewport on desktop and uses fixed-height mobile/tablet ranges for stable composition.
- Homepage store navigation switches at an explicit `900px` breakpoint rather than relying on Tailwind `lg`.
- The main homepage headline is `Everything tech. One smarter store.`
- `Technology, made easier.` remains the secondary brand tagline.
- Zeus scene scales according to Three.js viewport width.
- Reduced-motion CSS limits CSS transitions and animations while preserving Zeus behaviour.

## CONFIRMED Brand Colors

- Primary Black: `#0A0A0A`
- TekCentral Accent Teal: `#469D8B`
- TekCentral Accent Hover: `#3D8E7E`
- TekCentral Accent Ink: `#06110F`
- Zeus Teal: `#00E6C3` for Zeus, the homepage hero and MoltenMetal-specific highlights
- Electric Blue: `#2457FF` as a restrained supporting/informational accent
- Background: `#F6F7F9`
- White: `#FFFFFF`
- Dark Slate: `#3F4652`
- Muted Text: `#727986`
- Border: `#E4E7EC`
- Success: `#17B26A`
- Warning: `#F79009`

The main visual identity should now use TekCentral Accent Teal as the primary customer-action and brand accent. Black, white and neutral surfaces remain dominant; Electric Blue should be used sparingly where there is a deliberate informational reason. Do not use multiple pastel category colour systems.

Primary customer actions should use TekCentral Accent Teal with dark ink text for accessible contrast. Secondary, destructive, back, clear and comparison actions should keep their existing hierarchy instead of becoming teal.

## Admin Form Controls

Admin form controls are scoped beneath `.admin-workspace`; these rules must not be applied to storefront, checkout, account or other customer-facing forms.

- Editable inputs, textareas and selects use a soft gray `#F3F4F6` fill, `#E5E7EB` border and dark `#1F2937` text so they remain visible on white cards.
- Hover strengthens the border to `#D1D5DB` without changing layout.
- Focus uses a white surface, TekCentral Accent Teal border and a subtle teal outer ring. Keyboard focus must always remain visible.
- Read-only controls use a neutral gray surface and default cursor without an editable hover or focus affordance.
- Disabled controls use muted but readable text and a `not-allowed` cursor.
- Invalid controls use a red border and subtle red focus ring. Use `aria-invalid` and existing described error text where validation supports it.
- Textareas retain vertical resizing and a comfortable minimum height. Standard single-line controls are 44px high; `.admin-field--compact` provides a 40px variant for specification/document rows and other dense inline editing.
- Checkboxes, radios, ranges, buttons and visually wrapped file inputs retain their native or existing component treatment.
- Success and verified states remain badges or helper text; do not turn the field surface green.

## Admin Navigation

TekCentral Ops uses a persistent left sidebar on desktop and an off-canvas drawer below the desktop breakpoint. Global navigation is function-based and grouped as Overview, Commerce, Catalogue, Supply & Fulfilment, Insights, and Administration. Supplier-specific destinations remain inside the Supplier Hub rather than global navigation.

The expanded sidebar shows icons and labels; the collapsed desktop state shows icons with keyboard-accessible hover/focus tooltips and is persisted locally. Operational attention badges remain attached to their relevant navigation item. The compact top header identifies the current section and environment but does not duplicate sidebar links. Admin workspaces use the available content width so tables and operational tools are not constrained to storefront-style containers.

On desktop the admin shell is viewport-bound: the sidebar and main workspace scroll independently. On tablet and mobile the sidebar becomes an independently scrollable modal drawer and locks background scrolling while open.

## Admin Operational Tables

- Operational data uses the shared `AdminTable` primitives: compact semantic rows, subtle separators, sticky headers where stable, table-owned horizontal overflow, and consistent loading, empty and error states.
- Pagination defaults to 15 rows, supports 10, 15, 25 and 50 where exposed, and states `Showing X-Y of Z` with Previous, page position and Next controls.
- Identity cells use a concise primary/secondary hierarchy. Product rows use a 48px TekCentral-controlled image or a neutral placeholder.
- Status values use canonical shared badges. Financial and numeric columns are right-aligned with tabular numerals.
- A linked identity or one clear View/Review action is primary; secondary row actions belong in the shared overflow menu.
- Wide tables retain readable column widths and scroll inside their own container instead of widening the page. Secondary metadata is folded into identity cells at constrained widths.

## PLANNED Visual Character

The product should feel:

- Premium
- Modern
- Technological
- Clean
- Intelligent
- Approachable
- Interactive

Prefer:

- Strong typography
- Whitespace
- Clear hierarchy
- Subtle animation
- Polished product imagery
- Purposeful micro-interactions
- Strong mobile responsiveness
- Strong ecommerce navigation
- Prominent product search
- Merchandising-led product discovery
- Product collections appearing early on the homepage

Avoid:

- Cryptocurrency styling
- Gaming styling
- Cheap dropshipping styling
- Generic SaaS styling
- Cluttered electronics marketplace styling
- Excessive gradients
- Excessive glowing
- Excessive glassmorphism
- Too many cards
- Meaningless animation
- Tiny typography
- Visual clutter
- Corporate SaaS landing-page composition
- Public developer-facing implementation messages such as backend status, UI-only labels or demo interface copy

## Zeus Preservation

Do not remove, replace, flatten, or substantially redesign Zeus without explicit approval.

Preserve:

- Three.js geometry-based implementation
- `@react-three/fiber` Canvas
- `@react-three/drei` ContactShadows
- Pointer-following motion
- Head/body look behaviour
- Blinking eyes
- Pointer click/tap heart-eye reaction
- Responsive scaling
- Current proportions and material approach unless explicitly approved

## PENDING CONFIRMATION

- Final product image asset source
- Final production mobile navigation model after launch-content sizing
- Legal, returns, warranty and contact details

## TekCentral

## Admin Operational Tables

Operational workspaces use the shared `AdminTable` identity, toolbar, status, action-menu, empty-state and pagination primitives. Financial values are right aligned; the primary identity combines a controlled thumbnail, strong title and subdued metadata. Rows expose one primary action, with detailed decisions handled in a focused workspace instead of repeating full action sets. Summary cards must be keyboard-accessible filters backed by real operational counts, and status meaning must remain consistent across admin areas.

The overall brand should feel:

- Modern
- Premium
- Technically credible
- Clean
- Accessible
- Professional
- Intelligent

Primary tagline:

- Technology, made easier.

Current homepage headline:

- Everything tech.
- One smarter store.

## Zeus

Zeus provides personality and interaction as TekCentral's AI technology assistant.

Do not introduce visual clichés based on the name Zeus. Avoid lightning graphics, Greek columns, mythology iconography, excessive gold, or superhero styling. Keep the existing robot visual language unless explicitly instructed otherwise.

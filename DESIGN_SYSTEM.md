# Design System

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

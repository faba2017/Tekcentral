# Zeus AI

## CONFIRMED Current Zeus Implementation

- Zeus is implemented by the existing technical component `src/components/ui/robot-hero.tsx`.
- Zeus is rendered by `RobotHero` and exposed through the reusable `ZeusScene` wrapper for the homepage hero composition.
- Zeus uses procedural Three.js geometry rather than image assets.
- Zeus uses generated canvas textures for chassis material detail.
- Zeus is rendered inside `@react-three/fiber` `Canvas`.
- Zeus uses `@react-three/drei` `ContactShadows`.
- Zeus reacts to pointer movement through `useFrame` and `state.pointer`.
- Zeus has blinking eyes.
- Zeus changes to heart eyes for two seconds on pointer down/tap.
- Phase 3 adds a polished contextual `/zeus` assistant page with UI-only prompt entry points.
- `/robo` redirects to `/zeus` for compatibility.
- Product pages can link to `/zeus?product=:slug`.
- Category pages can link to `/zeus?context=:category`.

## PLANNED

Zeus is TekCentral's AI technology assistant and should eventually help customers understand what technology they need.

Future flow:

```text
Customer
  -> Zeus
  -> Requirement analysis
  -> Solution builder
  -> Product recommendation engine
  -> Compatibility validation
  -> Supplier availability
  -> Pricing
  -> Complete solution
  -> Cart or quotation
```

## PENDING CONFIRMATION

- AI provider
- Chat UI
- Conversation storage
- Recommendation model
- Compatibility rules
- Human review requirements
- Backend orchestration API

Do not implement Zeus AI during Phase 3.

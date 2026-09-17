---
name: design-system
description: Use when building or restyling any page, component, layout, badge, icon, empty/loading/error state, table, modal or theme behaviour in the Vision AI frontend, or when tempted to add a new UI primitive or import an icon directly.
---

# Design System

## Overview

Compose; don't invent. Two layers exist and between them cover what a page needs:

| Layer | File | Use for |
|---|---|---|
| Primitives (Phase 0) | `src/shared/ui/primitives.tsx` | `Button`, `IconButton`, `Input`, `Select`, `Badge`, `StateBadge`, `SeverityBadge`, `StatusBadge`, `Card`, `StatCard`, `DataTable`, `Tabs`, `Modal`, `Drawer`, `LoadingState`, `EmptyState`, `ErrorState`, `UnknownState`, `UnavailableState` |
| Composition (Stage 3–5) | `src/shared/ui/product.tsx` | `PageIntro`, `Eyebrow`, `Region`, `Plane`, `SectionRule`, `Figure`, `Meter`, `Attention`, `StateTally`, `Readiness`, `AbsentRegion`, `CoverageSeal`, `FindingReadout`, `SeverityMark`, `CameraSurface`, `CameraLine`, `LiveDot`, `EngineeringSurface`, `Disclosure`, `GoTo` |
| Icons | `src/shared/ui/icons.tsx` | every icon, including `NavIcons` |

Before writing a component, grep both files for the concept. Extending an existing component's props
beats a new one.

## Page skeleton

```tsx
<PageIntro eyebrow="Compliance" title="Shift Summary" standfirst="What happened on the last shift." />
<Region order={1}>
  <Figure label="Open incidents" value={count ?? null} unavailableReason="Incidents are not connected" />
</Region>
```

- Every page opens with **one** `PageIntro` and declares exactly one lead section
  (`tests/art-direction.test.tsx`). The spine belongs to the content column — no page can opt out.
- States for loading/error/empty come from the primitives; an empty state and an unavailable state
  are different components because they are different facts.

## Icons

- Only from `icons.tsx`. It is the single file allowed to import `lucide-react`.
- **Never** Unicode glyphs as icons (`⌾ ▣ ◬ ≡`) — they rendered differently on a Windows workstation
  and a Linux kiosk.
- Icon-only controls use `IconButton` with an accessible name (`tests/icons.test.tsx`).
- Each navigation destination has a unique icon; document the choice in its doc comment.

## Colour, type, theme

- Colour comes from CSS variables (`var(--ink-tertiary)`, `var(--state-absent)`, spacing
  `var(--space-10)`, type `var(--text-2xs)`). No hex literals in components.
- Observation state colours come only from `STATES` in `shared/semantics/observation.ts` — see
  `four-states`. Colour is never the only signal.
- Dark is the floor (kitchen-wall displays). Theme precedence lives in **two** places that must change
  together: the inline script in `index.html` (prevents first-paint flash) and
  `src/shared/theme/theme.ts`.

## Checks

`npx vitest run tests/art-direction.test.tsx tests/icons.test.tsx tests/composition.test.tsx tests/theme.test.ts`,
then `frontend-verify`.

## Red flags

- A new `Card`-like wrapper in a feature file
- `import { X } from 'lucide-react'` outside `icons.tsx`
- A page without `PageIntro`
- A hex colour, or a state colour not from `STATES`

# ux-architect — Vision AI frontend brief

Runs on kitchen-wall displays and operator workstations: "no violations" and "not watching" must never
look the same.

## Evidence to read
`src/shared/ui/primitives.tsx`, `src/shared/ui/product.tsx`, `src/shared/ui/icons.tsx`,
`src/shared/semantics/**`, `src/features/**`, `src/devtools/**` (engineering register),
`src/app/router/navigation.ts`, `index.html`, `src/shared/theme/theme.ts`; structural suites
`tests/art-direction.test.tsx`, `tests/composition.test.tsx`, `tests/icons.test.tsx`,
`tests/information-architecture.test.tsx`, `tests/shell.test.tsx`. Skills: `four-states`,
`design-system`, `new-route`.

## What breaks here
- A state not resolved through `resolveState`; `not_visible` / `unknown` styled like `absent` or
  `present`; only `ABSENT` may become a violation.
- `StatCard` / `Figure` given `0` for a value they do not have (must be `null` → `—` + reason); `Meter`
  drawn without a denominator.
- A nav item marked `live` whose page renders the awaiting shell; `awaiting` vs `blocked` conflated.
- A page without `PageIntro`, or with more than one lead section; ad-hoc components duplicating
  `primitives.tsx` / `product.tsx`.
- Icon-only controls without accessible names; focus traps in `Modal` / `Drawer`; `Meter` segments
  without an accessible description.
- Unicode glyphs as icons; `lucide-react` imported outside `icons.tsx`; a reused destination icon.
- Hex colours in components; theme precedence changed in only one of `index.html` and `theme.ts`.

## How to prove it
`grep -rnE "\?\? 0|\|\| 0" src/features`; run the structural suites; render through
`tests/support.tsx` in a scratch copy.

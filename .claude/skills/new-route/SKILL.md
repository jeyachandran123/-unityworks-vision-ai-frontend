---
name: new-route
description: Use when adding, moving, renaming, gating or removing a page, route, navigation entry or area in the Vision AI frontend, including connecting a module that was awaiting a data source or adding a platform control-plane page.
---

# New Route

## Overview

A destination exists in four places that must agree, and structural tests fail if they don't. Change
them together, in one commit:

| # | Where | What |
|---|---|---|
| 1 | `src/app/router/navigation.ts` (`PRODUCT_NAV`) or `platform-navigation.ts` | the nav item |
| 2 | `src/app/router/AppRouter.tsx` | the route, under a `RequirePermission` |
| 3 | `src/shared/ui/icons.tsx` (`NavIcons`) | a unique icon, with its reason as a doc comment |
| 4 | `src/features/**` | the page, opening with `PageIntro` |

A route absent from the navigation model appears nowhere. There is no second list.

## 1. Nav item

```ts
{
  id: 'shift-summary',
  label: 'Shift Summary',
  path: '/shift-summary',
  permissions: [PERMISSIONS.viewIncidents],   // a PERMISSION, never a role
  require: 'any',                             // or 'all' — must match the route guard's mode
  icon: NavIcons.shiftSummary,
  hint: 'What happened on the last shift',
  readiness: 'live',                          // 'awaiting' (engineering) | 'blocked' (a decision, e.g. DPIA)
}
```

- Put it in the area whose question it answers (Operations, Compliance, Intelligence, Estate,
  Engineering). `register: 'engineering'` areas are DevTools-shaped.
- A new permission must exist in the backend first, then in `src/app/permissions/permissions.ts`,
  then in the role fixtures in `tests/support.tsx` exactly as the backend grants it.

## 2. Route

```tsx
<Route element={<RequirePermission permissions={[PERMISSIONS.viewIncidents]} />}>
  <Route path="/shift-summary" element={<ShiftSummaryPage />} />
</Route>
```

- Same permissions and mode as the nav item (`mode="all"` ↔ `require: 'all'`).
- One guard per purpose — don't group unrelated pages under one `RequirePermission`.
- `React.lazy` is used **once** (DevTools). A new page is a static import; a test asserts that.
- Guards are UX. The backend must enforce the same permission on every API the page calls.

## 3. Icon

Add to `NavIcons` from lucide via `icons.tsx` only — never a Unicode glyph, never a direct
`lucide-react` import in a feature. `tests/icons.test.tsx` asserts the destination count (currently
`toHaveLength(20)`) and uniqueness: **update the count deliberately**, don't reuse an icon.

## 4. Page

- Opens with `PageIntro` (area named above the title) — `tests/art-direction.test.tsx`.
- Data through a `shared/api/*.ts` client module; never `fetch` in a feature.
- Values the page does not have render `—` with a reason — see `four-states`.
- Awaiting module: render the awaiting shell (`ModulePage` in `features/awaiting.tsx`) and mark
  `readiness: 'awaiting' | 'blocked'`. **Connecting** a module means removing the marker *and* its
  path from the list in `tests/information-architecture.test.tsx` "marks a destination as awaiting or
  blocked only where the page says so".

## 5. Tests to add or update

- `tests/information-architecture.test.tsx` — per-role visibility if the area's audience changed.
- An access test: a role without the permission is refused; a role with it reaches the page
  (`renderApp(<AppRouter />, '/shift-summary')` with the right identity in `installFetch`).
- A stub for every API the page calls, in the shape the generated types say.

Then **REQUIRED:** `frontend-verify`.

## Common mistakes

- Nav `require` and route `mode` disagree — the page is reachable by accounts that can't see the link, or vice versa.
- Gating on a role name.
- Marking a page `live` while it still renders the awaiting shell.
- A second `React.lazy`.

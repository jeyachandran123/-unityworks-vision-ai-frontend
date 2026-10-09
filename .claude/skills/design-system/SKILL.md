---
name: design-system
description: Use when building or restyling any page, component, layout, badge, icon, empty/loading/error state, table, modal or theme behaviour in the Vision AI frontend, or when tempted to add a new UI primitive or import an icon directly.
---

# Design System

## Overview

Compose; don't invent. These layers between them cover what a page needs:

| Layer | File | Use for |
|---|---|---|
| Primitives (Phase 0) | `src/shared/ui/primitives.tsx` | `Button` (incl. `destructive`), `IconButton`, `Input`, `Textarea`, `Select`, `Badge`, `StateBadge`, `SeverityBadge`, `StatusBadge`, `Card`, `StatCard`, `DataTable` (small fixed tables), `Tabs`, `SegmentedControl`, `Modal` (`size`, `description`), `Drawer`, `Skeleton`, `LoadingState`, `EmptyState`, `ErrorState`, `UnknownState`, `UnavailableState` |
| Composition (Stage 3–5) | `src/shared/ui/product.tsx` | `PageIntro` (`back`, `mark`, `actions`, `meta`), `Eyebrow`, `Region`, `Plane`, `SectionRule`, `Figure`, `Meter`, `Attention`, `StateTally`, `Readiness`, `AbsentRegion`, `CoverageSeal`, `FindingReadout`, `SeverityMark`, `CameraSurface`, `CameraLine`, `LiveDot`, `EngineeringSurface`, `Disclosure`, `GoTo` |
| Lists (2.0) | `src/shared/ui/data-table.tsx` | Any list somebody searches, filters, sorts, pages or acts on in bulk: `useTableState`, `useClientRows`, `TableCard`, `TableToolbar`, `ViewTabs`, `FilterButton`, `FilterChips`, `BulkActionBar`, `DataGrid` (`rowActions`, `rowInline`, selection, sort, density), `Pagination`, `downloadCsv` |
| Floating (2.0) | `src/shared/ui/overlays.tsx` | `Popover`, `DropdownMenu`, `ConfirmDialog` / `useConfirm`, `Tooltip`, `CopyButton` |
| Feedback (2.0) | `src/shared/ui/feedback.tsx` | `useToast()` (`toast.success/error/warning/info`), `Callout` (`banner`), `Progress` |
| Forms (2.0) | `src/shared/ui/forms.tsx` | `FormSection`, `FormActions`, `useUnsavedChanges`, `Checkbox`, `Switch`, `RadioCards`, `SearchInput`, `Combobox`, `PasswordInput` |
| Surfaces (2.0) | `src/shared/ui/surfaces.tsx` | `Panel`, `MetricTile` (renders `—`, never `0`), `FactList`, `Avatar`, `AvatarGroup`, `StatusPill`, `ObjectTabs` + `useTabParam`, `ButtonLink` |
| Command (2.0) | `src/shared/ui/command.tsx` | the Ctrl K palette (wired per shell in `shared/layout/shell-search.tsx`) |
| Icons | `src/shared/ui/icons.tsx` | every icon, including `NavIcons`, `DataIcons`, `ActionIcons`, `FeedbackIcons`, `EntityIcons` |

Before writing a component, grep these files for the concept. Extending an existing component's props
beats a new one. The look of every 2.0 component is a class in `src/styles/components.css`.

## Lists, acts and feedback

- **Sort only what the client holds whole.** The API has no sort parameter: a server-paged list
  (organizations, people, zones, recorders) pages by `offset` and shows the server's `total`, and never
  offers a sort that would order one page as if it were the whole list.
- **Every destructive act is a `ConfirmDialog`**: the object's name in the title, what happens and
  whether it can be undone in the body, the act named on the button, focus starting on Cancel, and
  `requireText` for what cannot be undone. Never `window.confirm`.
- **Every mutation says how it went**: `toast.success` on success, `toast.error` (or the dialog's
  `error`) on failure. A bulk act reports how many succeeded and names the failures.
- Each shell wraps its outlet in `PageErrorBoundary` (`shared/ui/boundary.tsx`): a page that fails to
  render fails alone.

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
- A hand-built search box, filter dropdown or pager beside a table instead of `TableToolbar` / `Pagination`
- A destructive button that acts on the first click, or a mutation that says nothing when it succeeds
- `import { X } from 'lucide-react'` outside `icons.tsx`
- A page without `PageIntro`
- A hex colour, or a state colour not from `STATES`

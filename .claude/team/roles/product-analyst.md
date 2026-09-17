# product-analyst — Vision AI frontend brief

## Evidence to read
`src/app/router/navigation.ts`, `src/shared/api/capabilities.ts`, `src/features/**`,
`src/app/permissions/permissions.ts`, `README.md`. The backend's brief covers module routes and roles.

## What breaks here
- A nav item `readiness: 'live'` whose page renders the awaiting shell or has no data source.
- A feature reachable in the UI by a role the backend refuses on the API it calls, or the reverse.
- A role whose navigation shows an area with nothing it may open.
- `available` inferred from `records.length`; `stored_records` rendered as a reading.
- `awaiting` (engineering) vs `blocked` (a decision, e.g. Patron ID) conflated in copy, data or UI.

## How to prove it
`npx vitest run tests/information-architecture.test.tsx`; grep `navigation.ts` and pages; compare with
the backend's permission table.

# security-engineer — Vision AI frontend brief

## Evidence to read
`src/shared/api/client.ts`, `src/app/auth/**`, `src/app/permissions/**`,
`src/shared/realtime/connection.ts`, `src/shared/api/platform.ts`, `vite.config.ts` (dev proxy).

## What breaks here
- The access token lives only in the module-scoped variable in `client.ts` — never web storage, a
  readable cookie, a URL, or a WebSocket query string (`connection.ts` authenticates by sending a frame).
- `fetch` for API traffic only in `client.ts`; `authorizedFetch` (evidence imagery) is the one other path.
- Ten concurrent 401s share **one** refresh promise.
- Guards in `app/permissions/` are UX; every route must be enforced by the backend too — report a UI
  gate with no matching backend permission as a finding.
- `shared/api/platform.ts` authorises on `PlatformOperator` via `isOperator()`; there is deliberately
  no permission for it.
- `VITE_*` values are bundled and public — any secret-shaped value there is a blocker.
- The single 401 on a cold load (session restore) is intentional.

## How to prove it
`tests/auth.test.tsx` (single-flight refresh), `tests/organization-access.test.tsx`; the harness in
`tests/support.tsx` renders the real app against a stubbed `fetch`.

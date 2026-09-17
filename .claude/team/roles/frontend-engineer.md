# frontend-engineer — Vision AI frontend brief

## Evidence to read
`src/**`, `tests/**`, `scripts/generate-types.mjs`, `vite.config.ts`, `tsconfig.app.json`,
`eslint.config.js`. Skills: `frontend-verify`, `new-route`, `four-states`, `design-system`.

## What breaks here
- `fetch` for API traffic outside `src/shared/api/client.ts` (`authorizedFetch` for evidence imagery is
  the one exception) — `grep -rn "fetch(" src`.
- Access token anywhere but the module variable in `client.ts`.
- More than one refresh in flight under concurrent 401s.
- A second `React.lazy` / dynamic import; `RequirePermission` not above the lazy DevTools element.
- Route guard `mode` ≠ nav item `require`; gating on a role name; a route absent from `navigation.ts`.
- Four-state and fabricated-number violations (`?? 0`, `.length` as availability) — `four-states`.
- `connected` treated as `streaming` in `shared/realtime/connection.ts`.
- Hand-edited `src/shared/types/openapi.ts`; path aliases out of step between `vite.config.ts` and
  `tsconfig.app.json`.
- **Tautological tests:** identities in `tests/support.tsx` granting more than the backend's
  `permissions_for(role)`; stubs returning shapes `openapi.ts` does not allow; mocked components or hooks.
- Lint suppressions (`no-explicit-any` is an error; `no-console` allows only warn/error).

## How to prove it
`npx vitest run tests/<file>` or `-t "<name>"`; full gate `npm run verify`.

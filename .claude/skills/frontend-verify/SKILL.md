---
name: frontend-verify
description: Use before claiming any frontend change is done, when npm run verify, types:check, typecheck, lint, a vitest test or the build fails, when tests are flaky or time out, or when choosing which test files to run for a change in this repository.
---

# Frontend Verify

## Overview

`npm run verify` is the whole gate, and it is exactly what CI runs:

```
types:check → typecheck → lint (--max-warnings 0) → test (vitest run) → build
```

It stops at the first failure, so a red `types:check` hides every later problem. Work is done when
the full chain exits 0 — not when the file you changed passes.

## Iterating

```bash
npx vitest run tests/hygiene.test.tsx        # one file
npx vitest run -t "single-flight"            # one case by name
npm run typecheck                            # tsc -b --noEmit
npm run lint
```

| Changed | Run first |
|---|---|
| `app/router/**`, a page, nav entry | `tests/shell.test.tsx tests/information-architecture.test.tsx tests/icons.test.tsx tests/art-direction.test.tsx tests/composition.test.tsx` |
| `shared/semantics/**`, badges, `Figure`/`StatCard`/`Meter` | `tests/semantics.test.ts tests/composition.test.tsx tests/art-direction.test.tsx` |
| `shared/api/client.ts`, `app/auth/**` | `tests/auth.test.tsx` |
| `devtools/**`, lazy loading | `tests/devtools.test.tsx` |
| `shared/api/platform.ts`, `features/platform/**` | `tests/organization-access.test.tsx` (platform surface) and `tests/shell.test.tsx` (role-aware shell) |
| `scripts/generate-types.mjs` | `tests/schema-path.test.ts` |

## Reading each failure

| Step | Failure means | Do |
|---|---|---|
| `types:check` | `openapi.ts` differs from the backend's committed export | `unityworks-team:contract-sync`. Never edit `openapi.ts` |
| `typecheck` | Often a regenerated type moved | Fix consumers. `noUncheckedIndexedAccess`: index reads are `T \| undefined`; `verbatimModuleSyntax`: `import type` |
| `lint` | Zero warnings allowed | `no-explicit-any` is an error; `no-console` allows only `warn`/`error`; `eqeqeq` always. Don't add disables |
| `test` | See below | |
| `build` | Usually a path alias out of step | Aliases live in **both** `vite.config.ts` and `tsconfig.app.json` |

## Test harness facts

- `tests/support.tsx` renders the **real** app (providers, router, guards, API client) against a
  stubbed `fetch` via `installFetch(options)` and `renderApp(ui, route)`. Nothing mocks a component or
  hook — don't start.
- Role fixtures (`identity`, `managerIdentity`, `supervisorIdentity`, `auditorIdentity`,
  `adminIdentity`) hold exactly the backend's `permissions_for(role)`. Granting more turns guard tests
  into tautologies.
- `fileParallelism: false`, `asyncUtilTimeout: 8000` and `testTimeout: 25_000` exist because the
  DevTools lazy chunk takes 4–6 s to transform on first navigation and parallel workers produced
  failures that moved between runs. It is deliberately not pre-warmed. Do not tune these without
  reproducing what they fix.
- A single 401 in the console on a cold load is intentional (session restore). Not a failure.

## Reporting

Report the real tail of `npm run verify` (the build summary, or the first failing step's output).
If the backend sibling checkout is missing, `types:check` cannot run locally — say so; don't skip it
silently.

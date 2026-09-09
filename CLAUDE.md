# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Scope

This is `unityworks-vision-ai-frontend`, one repo inside the `atlas/` multi-project workspace.
`../CLAUDE.md` covers the workspace as a whole (two backends, four frontends, the observation/judgment
boundary rule); this file covers only what is specific to this application. Its backend is
`../unityworks-vision-ai-backend`.

## Commands

```bash
npm run dev            # :5273, strictPort
npm run verify         # types:check → typecheck → lint → test → build. Run before calling work done.
npm run lint           # eslint --max-warnings 0
npm test               # vitest run
npx vitest run tests/hygiene.test.tsx            # one file
npx vitest run -t "single-flight"                # one case by name
npm run test:watch
```

There is no CI workflow in this repo — `npm run verify` is the gate, and it is the whole gate.

### API types are generated, never hand-written

`src/shared/types/openapi.ts` is emitted by `scripts/generate-types.mjs` from
`../unityworks-vision-ai-backend/docs/api/openapi.json`. After any backend route change:

```bash
cd ../unityworks-vision-ai-backend && python scripts/export_openapi.py
cd ../unityworks-vision-ai-frontend && npm run types:generate
```

`npm run types:check` regenerates and diffs; it fails the verify chain when the schema moved and the
types did not. The generator is deliberately local rather than `openapi-typescript` — no dependency,
no network.

## Architecture

**One application, two experiences.** Product (`src/features/`) and Vision OS DevTools
(`src/devtools/vision-os/`) share authentication, permissions, routing, the design system, the API
client, the realtime layer and the error system. They diverge in density and vocabulary only.

Path aliases `@/ @app/ @shared/ @features/ @devtools/` are declared twice — `vite.config.ts` and
`tsconfig.app.json` — and must stay in step.

### The pieces that only make sense together

- **`shared/api/client.ts` is the only place `fetch` is called** for API traffic. The access token is
  a module-scoped variable and lives nowhere else — not `localStorage`, not a readable cookie, not
  the URL. A reload drops it and `POST /auth/refresh` (httpOnly cookie) restores the session. Ten
  concurrent 401s share **one** refresh promise, then retry once; ten parallel refreshes would race
  over a rotating token and log the user out under load. `authorizedFetch` is the one non-JSON path,
  used only by evidence imagery.
- **`app/auth/AuthProvider.tsx`** owns the lifecycle `mount → refresh → /auth/me → ready`. The client
  cannot import the provider (cycle), so session loss arrives through the `onSessionEnd` callback.
  A failed restore on a first visit is *normal*, not an error — the single 401 in the console on a
  cold load is intentional and must not be "fixed" by caching session existence client-side.
- **`app/permissions/`** — guards are UX, not security; every route is separately enforced by the
  backend, and this code assumes anyone can bypass it. Routes and nav entries declare a
  **permission**, never a role.
- **`app/router/navigation.ts`** is the single navigation model (five areas; `register: 'product' |
  'engineering'`). A route absent from it appears nowhere. `readiness: live | awaiting | blocked` is
  a static declaration kept honest by a test that compares it against which pages actually render the
  awaiting shell.
- **`app/router/AppRouter.tsx`** holds every path. `React.lazy` around `@devtools/vision-os/DevToolsRoutes`
  is the application's **only** dynamic import — a test asserts that — and `RequirePermission` sits
  above it so the chunk is never even requested by an unauthorised account.
- **`shared/realtime/connection.ts`** authenticates by sending a frame, never `?token=` in the URL.
  `connected` and `streaming` are separate states: a socket being open does not mean observations are
  arriving, and a green "LIVE" badge over a camera that does not exist is the specific lie this
  product cannot ship.
- **`shared/ui/primitives.tsx`** is the Phase 0 design system; **`shared/ui/product.tsx`** is the
  Stage 3–5 composition layer (`PageIntro`, `Region`, `Figure`, `Meter`, `Attention`, `CoverageSeal`,
  `FindingReadout`). Compose from these rather than adding primitives. All iconography comes from
  `shared/ui/icons.tsx` (lucide components) — never Unicode glyphs, which rendered differently on a
  Windows workstation and a Linux kiosk.
- **`shared/api/platform.ts`** is a separate client on purpose: it authorises on a `PlatformOperator`,
  a principal no tenant role can produce. `isOperator()` is the only correct gate for that surface —
  there is deliberately no permission to check.

### The invariants — each has a test behind it

1. **Four states, never two.** `PRESENT / ABSENT / NOT_VISIBLE / UNKNOWN` are resolved in exactly one
   place, `shared/semantics/observation.ts`. Only `ABSENT` may become a violation; `NOT_VISIBLE` and
   `UNKNOWN` never may. Nothing else in the application maps an attribute value to a verdict —
   `semantics/finding.ts` reads what a frozen finding *recorded* as failed and still renders the
   observed value through `resolveState`.
2. **No fabricated data.** `StatCard`/`Figure` render `—` with a reason, never `0`, for a value they
   do not have. `Meter` refuses to draw a proportion with no denominator. `coverageOf` returns
   `ratio: null` for an empty set. "No violations" and "not watching" must never look the same.
3. **`available` is its own field**, never `records.length === 0` (`shared/api/capabilities.ts`).
   `not_configured` (waiting for engineering) and `blocked` (waiting for a decision — Patron ID) stay
   distinct. `stored_records` is a storage fact and must never be rendered as a reading.
4. **Colour is never the only signal** — every state carries a glyph/icon and a word.
5. **Every page opens the same way** (`PageIntro` with its area named above the title) and the spine
   belongs to the content column, so no page can opt out.

## Testing

`tests/support.tsx` renders the **real** application — real providers, router, guards and API client
— against a stubbed `fetch`. Nothing mocks a component or a hook, because the properties under test
(guards, single-flight refresh, lazy loading, four-state rendering) only exist when the real code
runs. `installFetch(options)` and `renderApp(ui, route)` are the entry points; role fixtures
(`identity`, `managerIdentity`, `supervisorIdentity`, `auditorIdentity`, `adminIdentity`) carry
exactly the backend's `permissions_for({role})` — granting more turns every guard test into a
tautology. The `adminUsers` stub is a mutable in-memory store, so a GET after a mutation reflects it.

Two settings in `vite.config.ts` / `tests/setup.ts` look excessive and are not: `fileParallelism:
false` (parallel workers each transform the DevTools lazy chunk and produced failures that moved
between runs) and `asyncUtilTimeout: 8000` with `testTimeout: 25_000` (that same chunk takes 4–6s to
transform on first navigation, and it is deliberately not pre-warmed because a test asserts it loads
lazily). Don't "optimise" either without reproducing what they fix.

Structural suites worth knowing before changing routes or pages: `information-architecture.test.tsx`
(nav model vs. router agreement, per-role visibility), `composition.test.tsx` (the link graph),
`art-direction.test.tsx` (one opening per page), `icons.test.tsx` (every destination has a unique
icon; icon-only controls have accessible names).

## Local gotchas

- **The dev proxy targets `127.0.0.1:8010`, not 8000** (`vite.config.ts`, override with `UWV_API_URL`).
  Port 8000 on this machine is the unrelated AI Coding Assistant stack, and proxying there
  authenticates the login form against a different product's user table — a 401 for an account that
  is correct. The README still says 8000; the vite config is the truth.
- `/api` and `/ws` are proxied so the browser sees one origin. That is required, not tidy: the
  refresh cookie is `SameSite=Strict` and a cross-origin frontend would never have it attached.
- `:5273` is `strictPort` and is also hard-bound by `vision_os_validation_console` — only one can run.
- Everything in `.env.example` is public; Vite inlines `VITE_*` into the bundle. `VITE_FEATURE_DEVTOOLS`
  only shows the nav entry — the real gate is backend `FEATURE_DEVTOOLS` plus `access_devtools`.
- Lint is strict by intent: `@typescript-eslint/no-explicit-any` is an **error** (the generated
  `openapi.ts` is the only exclusion), `no-console` allows only `warn`/`error`, `eqeqeq` always.
  TypeScript runs with `noUncheckedIndexedAccess` and `verbatimModuleSyntax`, so index reads are
  `T | undefined` and type imports must be written `import type`.
- The theme decision is duplicated in exactly two places — the inline script in `index.html` (runs
  before first paint, prevents a flash) and `shared/theme/theme.ts`. Changing precedence means
  changing both. Dark is the floor because these run on kitchen-wall displays.

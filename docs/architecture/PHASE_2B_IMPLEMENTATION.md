# Phase 2B — Production Frontend Implementation

**UnityWorks Vision AI · 2026-08-20**

## Result: **PASS**

All 33 acceptance gates met. Measured numbers throughout.

```
Frontend    79 tests · 0 failures        typecheck clean · lint clean · build passes
Backend  3,022 tests · 0 failures        unchanged by this phase
Bundle      DevTools split into its own 25.27 kB chunk
```

---

## 1. Frontend architecture

`atlas/unityworks-vision-ai-frontend` — Vite 6 · React 18 · TypeScript 5.7 ·
React Router 6. **25 source files**, no SSR, no Node render server.

```
src/
├── app/           auth · permissions · providers · router
├── features/      the nine product routes + login
├── devtools/      vision-os/ — one lazily-loaded chunk
├── shared/        api · layout · realtime · semantics · types · ui
└── styles/        tokens + global
```

**One application.** Product and DevTools share authentication, permissions,
routing, the design system, the API client, the live-connection layer and the
error system. They diverge in density and vocabulary, and nowhere else.

## 2. Repository migration

The validation console was read as source material, not copied. **Nothing in it
was modified** (`a284db3`, clean), and nothing in the new frontend references it:

```
grep -rn "vision_os_validation_console|vosvc|../../.." src tests scripts  →  no matches
```

| console asset | disposition |
|---|---|
| `contract/types.ts` (476 hand-written lines) | **replaced** by generated types from `openapi.json` |
| `transport/client.ts` · `errors.ts` | **rewritten** as `shared/api/client.ts` + `errors.ts`, with auth |
| `transport/stream.ts` | **rewritten** as `shared/realtime/connection.ts`, with the authenticate frame |
| semantic colour system | **preserved and extended** — the four states became first-class |
| `primitives.tsx` (731 LOC) | **rebuilt** as `shared/ui/primitives.tsx` with product + devtools density |
| 20 flat tab views | **regrouped** into 15 screens across 5 DevTools sections |
| `App.tsx` tab-index shell | **replaced** by a real router and a real shell |
| `FailureInjection` | **not migrated.** Absent from production, per Phase 0 |

## 3. Design system

Tokens in `src/styles/tokens.css` — colour, type, space, radius, elevation,
motion, z-index, layout, focus. Dark by default (an operations screen runs all
day), with a complete light theme over the same token names, so no component
reads a literal.

The palette is one accent (a deep instrument teal), five state colours, and
greys with a cool bias. No gradients, no glows, no decorative motion.

**24 primitives**: Button · IconButton · Spinner · Input · Select · Badge ·
**StateBadge** · SeverityBadge · StatusBadge · Card · StatCard · SectionHeader ·
PageHeader · DataTable · Tabs · Modal · Drawer · KeyValue · JsonViewer ·
Timeline · Tooltip · Toast · plus the five non-content states.

## 4. Application shell

Sidebar (collapsible, persisted) · topbar · breadcrumbs · user menu ·
connection indicator · skip link. Stable across navigation — only `<Outlet />`
changes, so no page can render a header that disagrees with another.

## 5. Authentication

```
mount → POST /auth/refresh → access token in memory → GET /auth/me → ready
```

| property | implementation |
|---|---|
| access token | **module-scoped variable.** Never localStorage, sessionStorage, cookie or URL |
| refresh token | never touched by JavaScript — httpOnly cookie, set by the backend |
| session restore | automatic on reload, no login prompt |
| first visit | resolves to `unauthenticated`, **not** "session expired" |
| logout | clears the cookie server-side, then resets local state even if the call fails |

A test asserts the token appears in neither storage after a full session.

### Single-flight refresh

The first 401 starts a refresh and stores the promise; every other awaits it,
then retries **once**. Three tests:

- 10 concurrent `refreshAccessToken()` → **1** network call
- 10 concurrent 401s across different paths → **1** refresh
- a permanently-401 endpoint → exactly **2** attempts, not a loop

Ten refreshes would race, and nine would present a token the first had already
rotated away — logging the user out mid-session, at random, under load.

## 6. Authorization

Permissions come from `/auth/me`. **No role name appears in any condition** — a
test proves it by giving an identity a fabricated role with real permissions and
asserting the navigation is still correct.

Guards: `RequireAuth` · `RequirePermission` · `RequireRole` · `PermissionGate`.

**They are UX, not security.** Every protected route is separately enforced by
the backend, and this application is written assuming they can all be bypassed.

Two assignments carried from the backend and tested here: a kitchen supervisor
holds no `view_evidence` (it is the role most likely to be a shared kitchen
screen), and only `access_devtools` reaches the engineering workspace.

## 7. Product routing

Nine routes, each with the real shell, real permissions and real design system:
`/dashboard` `/live` `/hygiene` `/alerts` `/cameras` `/incidents` `/evidence`
`/reports` `/admin`.

**No fabricated data.** `StatCard` renders `—`, never `0`, for a value it does
not have, and every page names the capability it waits for. `/dashboard` calls
the one product endpoint that exists (`/api/v1/status`) and surfaces the
backend's own `not_yet_reported` list rather than inventing zeros for it.

Four tests enforce this, including one asserting no page claims "all compliant"
or "100%".

## 8. DevTools architecture

`/devtools/vision/*` — **15 screens in 5 groups**, not 20 flat tabs:

| group | screens |
|---|---|
| Platform | Overview · Sessions · Sources · Diagnostics |
| Perception | Frame by Frame · Detection · Tracking |
| Understanding | Crops · Model calls · Attributes |
| State | Vision State · Observations · Compliance |
| Operations | Evidence · Economy |

**Lazily loaded**, verified by the build:

```
dist/assets/DevToolsRoutes-D-tSWjc8.js   25.27 kB │ gzip: 7.71 kB    ← separate chunk
dist/assets/index-DLXl0KZ4.js            45.82 kB │ gzip: 13.83 kB
dist/assets/react-Br_8DSrV.js           157.44 kB │ gzip: 51.63 kB
dist/assets/query-BI02T2kv.js            42.14 kB │ gzip: 13.17 kB
dist/assets/index-BGhDxlAV.css            4.99 kB │ gzip: 1.90 kB
```

A restaurant manager downloads ~80 kB gzipped and **none** of the 7.71 kB
DevTools chunk. One dynamic import, one permission gate above it — a second
entry point would be a second place the gate could be forgotten.

Five screens read live backend routes; ten name the route and phase that will
supply them. Every screen states what it is and why it matters (§14).

## 9. Frame-by-Frame

Migrated as an information architecture, not as code. The backend exposes no
frames route — Phase 1 binds no source — so the screen names
`GET /devtools/frames`, names Phase 3, and lists the eight capabilities it
preserves: frame image, capture timestamp, per-layer narrative, detections,
object identity, the canonical crop, attribute provenance, evidence refs, and
raw data beneath the structured view.

Drawing an empty timeline would have been worse than saying so.

## 10. Evidence viewer

Never an unexplained black rectangle. Five states: loading · available ·
no retained image · not authorised · deployment-disabled. The backend gates it
twice (`ALLOW_EVIDENCE`, then `view_evidence`) and the UI reports which gate
closed.

## 11. API architecture

One client. **No component calls `fetch`.** Five services, and only for
contracts that exist: `authApi` · `healthApi` · `devtoolsApi`. There is no
`incidentsApi` for an endpoint that does not exist.

Errors normalise to `{code, message, retryable, details, request_id}` with an
`ErrorKind` union. `friendlyMessage` overrides the backend only where it cannot
be actionable — a generic `INTERNAL`, or a request that never reached the
server. A test asserts no response ever shows a traceback, path, or SQL.

## 12. OpenAPI generation

`scripts/generate-types.mjs` reads
`../unityworks-vision-ai-backend/docs/api/openapi.json` and emits
`src/shared/types/openapi.ts`. `npm run types:check` fails on drift.

A local generator rather than `openapi-typescript`: the full tool brings a
dependency tree larger than this application's runtime, to type twelve stable
paths.

## 13. WebSocket

`connect → {"type":"authenticate","access_token":"…"} → ready → heartbeat`

**The token is never in the URL** — a URL is logged by the browser, every proxy
and every access log. A test asserts the URL contains neither the token nor the
word "token".

Bounded exponential backoff (500 ms → 30 s, 8 attempts). `4403` stops retrying
rather than looping against a permission that will not change. A socket only
opens for an account holding `view_live`.

**`connected` and `streaming` are separate.** The badge reads *"Connected · no
live camera source yet"*. A test asserts it never reads "LIVE" while
`streaming: false`.

## 14. State semantics — the file that matters most

`shared/semantics/observation.ts` resolves attribute values to states in
**exactly one place**:

| value | state | may be a violation |
|---|---|---|
| `hairnet`, `gloves`, `mask` | PRESENT | no |
| `none` | **ABSENT** | **yes** |
| `not_visible` | NOT_VISIBLE | **no** |
| `null` / missing | UNKNOWN | **no** |

Each has a unique colour, glyph and word — asserted by tests, including that
NOT_VISIBLE never shares a colour with ABSENT.

`coverageOf()` returns `ratio: null` for an empty set rather than `0`, because
zero coverage and no subjects are different facts.

**24 tests** cover this module alone.

## 15. Accessibility

Skip link · one `<h1>` per page · named landmarks · captioned tables · labelled
fields · `role="alert"` on form errors · `aria-live` on toasts · `aria-busy` on
buttons · roving tabindex on tabs · `aria-modal` dialogs · visible focus ·
`prefers-reduced-motion`.

**Colour is never the only signal** — every state carries a glyph and a word,
and icon-only controls carry `aria-label`.

Six accessibility tests, including keyboard-only login.

## 16. Responsive behaviour

Desktop-first, usable to tablet. Collapsible sidebar; tables and JSON panels
scroll inside their own containers so the page body never scrolls sideways;
`auto-fit` grids for stat cards. DevTools is desktop-only by design — a
responsive frame inspector is wasted effort.

## 17. Performance

| measure | value |
|---|---|
| modules transformed | 98 |
| build time | 761 ms |
| initial load (gzip) | ~80 kB |
| DevTools chunk (gzip) | 7.71 kB, **not** in the initial load |
| CSS (gzip) | 1.90 kB |

Vendor split (react, query) is cacheable across deploys. Query `staleTime` is
30 s — short enough that nothing on screen is meaningfully stale.

## 18–20. Test, typecheck and build results

```
Test Files   4 passed (4)
Tests       79 passed (79)
Duration    4.16 s

typecheck   tsc -b --noEmit          clean
lint        eslint --max-warnings 0  clean
build       tsc -b && vite build     98 modules, 761 ms
```

| file | tests | covers |
|---|---|---|
| `semantics.test.ts` | 24 | the four states, coverage arithmetic |
| `auth.test.tsx` | 14 | restore, login, logout, single-flight refresh |
| `devtools.test.tsx` | 16 | authorization, lazy loading, **fixture smoke test** |
| `shell.test.tsx` | 25 | navigation, states, connection honesty, accessibility |

### The fixture smoke test

Drives the real application — real guards, real router, real API client, real
screens — from an authenticated developer to rendered observations:

- **6 observations rendered**, matching the backend's `FIXTURE_OBSERVATION_COUNT`
- all 3 fixture subjects present
- **all four states rendered distinctly**
- `not_visible` **never** marked rule-actionable; `none` always is
- fixture data labelled, never "LIVE"
- drawer shows raw values and confidence **with its semantics**

This is the primary regression protection against the validation console's
capability being lost in migration.

## 21. Reference repository protection

| repository | HEAD | dirty |
|---|---|---|
| `atlas/frontend` | `a6bafbc` | 0 |
| `atlas/vision_os_demo` | `57b9c92` | 0 |
| `atlas/vision_os_validation_console` | `a284db3` | **0 — read only, never modified** |
| `atlas/backend` | `345292c` | **2 — pre-existing, not from any phase** |

The two `atlas/backend` edits were made from the IDE in an earlier session.
**`.env.example` is git-tracked and contains a live NVIDIA API key**
(`nvapi-B-v4ty…`). It remains staged to be committed, and a secret in git history
is not removed by deleting the line later. **Rotate the key at NVIDIA**, revert
the line, and keep the real value in `.env`. Not corrected here: read-only
repository, user's edit, and rotating a credential is their decision.

No secret exists in the frontend; a scan of `src`, `tests` and `.env.example`
finds none, and there is no place to put one.

## 22. Known limitations

1. **Ten DevTools screens have no backend yet** — frames, detection, tracking,
   crops, model calls, sources, economy. Each names its route and phase.
2. **The nine product routes are foundations**, not features. Deliberate (§27).
3. **DevTools serves a fixture**, labelled everywhere. Real platform, real API,
   constructed observations; Phase 3 replaces it with file replay.
4. **The WebSocket delivers no events.** Handshake and lifecycle only.
5. **Evidence returns `available: false`.** Both gates are real; nothing is
   stored behind them until Phase 5.
6. **No light-theme toggle in the UI.** The tokens exist; no control switches
   them.
7. **No virtualised tables.** Nothing yet returns enough rows to need it.
8. **No i18n.** English only.
9. **Accessibility is tested, not audited.** No axe run, no screen-reader pass,
   no measured contrast audit of the dark palette.
10. **`?raw` import in the lazy-loading test** falls back to a weaker assertion
    if unsupported; the build output is the stronger proof.

## 23. Phase 3 prerequisites

Phase 3 is live CCTV. **Still blocked on TCP 554** at the restaurant — verified
filtered on 2026-08-19, with 80/443/9001 open.

Backend, in order:

1. Streaming `SourcePort` / `DecoderPort` — bounded queue, backpressure, explicit
   drop policy, capture-time timestamps
2. A session model for unbounded input (`ReplaySession` vs `LiveSession`)
3. Bind the understanding layer, restoring the M9→M7 write-back end to end
4. `SecretProviderPort` for `CCTV_CREDENTIAL_REF`
5. The DevTools routes the ten pending screens name

Frontend, once those land: replace the fixture with real sessions, connect
Frame-by-Frame, render live camera tiles, and light `streaming: true` — **only**
when frames are genuinely arriving.

The one thing to carry forward: this application keeps four observation states
distinct in exactly one module. Every screen added from here must resolve
through it rather than testing an attribute value inline.

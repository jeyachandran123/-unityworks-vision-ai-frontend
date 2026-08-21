# UnityWorks Vision AI — Frontend

One application, two experiences.

```
UnityWorks Vision AI
├── Product        Dashboard · Live · Hygiene · Alerts · Incidents ·
│                  Evidence · Cameras · Reports · Administration
└── DevTools       Vision OS internals — permission-gated, lazily loaded
```

They share authentication, permissions, routing, the design system, the API
client, the live-connection layer and the error system. They diverge in density
and vocabulary, and in nothing else.

---

## Run

```bash
npm install
cp .env.example .env.local
npm run dev            # http://localhost:5273
```

The dev server proxies `/api` and `/ws` to `http://127.0.0.1:8000`, so the
browser sees **one origin**. That is required, not tidy: the refresh cookie is
`SameSite=Strict`, and a cross-origin frontend would never have it attached —
every session would silently fail to restore. Production sits behind one origin
for the same reason.

Point the proxy elsewhere with `UWV_API_URL`.

## Scripts

| command | does |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | typecheck, then production bundle |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run lint` | eslint, zero warnings tolerated |
| `npm test` | vitest |
| `npm run types:generate` | regenerate API types from the backend schema |
| `npm run types:check` | fail if they are out of date |
| `npm run verify` | all of the above, in order |

## API types are generated

The backend is the source of truth. After any backend route change:

```bash
cd ../unityworks-vision-ai-backend && python scripts/export_openapi.py
cd ../unityworks-vision-ai-frontend && npm run types:generate
```

`npm run types:check` belongs in CI. A route added without regenerating is a
frontend typed against an API that no longer exists.

This replaces the validation console's 476 hand-maintained contract lines.

## Structure

```
src/
├── app/
│   ├── auth/           session lifecycle
│   ├── permissions/    permission names + route guards
│   ├── providers/      provider composition
│   └── router/         route table + navigation model
├── features/           the nine product routes
├── devtools/vision-os/ the engineering workspace — ONE lazy chunk
├── shared/
│   ├── api/            client · errors · services
│   ├── layout/         AppShell
│   ├── realtime/       WebSocket client
│   ├── semantics/      the four observation states
│   ├── types/          generated from OpenAPI
│   └── ui/             primitives
└── styles/             tokens + global
```

## The rules this application keeps

**1 · Four states, never two.** `PRESENT`, `ABSENT`, `NOT_VISIBLE`, `UNKNOWN`
are resolved in exactly one place — `shared/semantics/observation.ts` — and
rendered with their own colour, glyph and word. Only `ABSENT` may become a
violation. Collapsing a refusal into a violation accuses somebody nobody could
see.

**2 · No fabricated data.** `StatCard` renders `—`, never `0`, for a value it
does not have. Every product route says which backend capability it is waiting
for. "No violations" and "not watching" must never look the same.

**3 · The access token lives in memory.** Never `localStorage`, never
`sessionStorage`, never a readable cookie, never the URL. A reload discards it
and the httpOnly refresh cookie restores the session.

**4 · One refresh at a time.** Ten concurrent 401s produce one refresh call.
Ten would race and nine would lose, logging the user out mid-session under load.

**5 · Guards are UX, not security.** Every protected route is separately
enforced by the backend. This application assumes anyone can bypass everything
in `app/permissions/`.

**6 · Connected is not streaming.** The badge reads *"Connected · no live camera
source yet"*, not "LIVE". A green light over a camera that does not exist is the
most misleading thing this UI could render.

**7 · Colour is never the only signal.** Every state carries a glyph and a word.

**8 · Fixtures are labelled.** Everything DevTools shows before Phase 3 comes
from a deterministic fixture, and every screen says so.

## Accessibility

Skip link, one `<h1>` per page, named landmarks, captioned tables, labelled
fields, `role="alert"` on form errors, `aria-live` on toasts, roving tabindex on
tabs, visible focus everywhere, `prefers-reduced-motion` honoured.

DevTools is desktop-only by design; the product surface works to tablet.

## Configuration

Everything in `.env.example` is **public** — Vite inlines `VITE_*` into the
bundle. There are no secrets here and there is no place to put one.

# devops-engineer — Vision AI frontend brief

## Evidence to read
`.github/workflows/*.yml`, `.github/backend-schema.sha`, `package.json`, `package-lock.json`,
`scripts/generate-types.mjs`, `vite.config.ts`, `.env.example`. Skills: `contract-sync`,
`prod-readiness`, `frontend-verify`.

## What breaks here
- **Stale or unpushed schema pin:** CI fetches `docs/api/openapi.json` from the backend at the SHA in
  `.github/backend-schema.sha` and points the generator at it via `UWV_SCHEMA_PATH`. `/check contract`
  reproduces this exactly; confirm the SHA is on a remote branch of the backend.
- **Node version:** `engines` requires `>=20.19.0`; CI uses Node 20.
- **Dev proxy:** `/api` and `/ws` proxy to `127.0.0.1:8010` (override `UWV_API_URL`); the refresh cookie
  is `SameSite=Strict`, so production must serve frontend and API from one origin.
- `VITE_*` variables are bundled and public; `VITE_FEATURE_DEVTOOLS` only shows a nav entry.
- `:5273` is `strictPort` and shared with another local console.

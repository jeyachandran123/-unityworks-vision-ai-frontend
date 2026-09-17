# release-scribe — Vision AI frontend brief

## Evidence to read
`README.md`, `CLAUDE.md`, `.env.example`, `vite.config.ts`, `.github/workflows/`.

## Known drift to confirm (not rediscover)
- `CLAUDE.md` says there is no CI workflow — `.github/workflows/ci.yml` exists.
- `README.md` says the API is on `8000`; `vite.config.ts` proxies to `8010`.
- Documentation describing the old `atlas/` workspace layout.

## Safe commands to run
`npm run lint`, `npm run typecheck`, `npm run types:check`, `npx vitest run <file>`. Never `npm install`.

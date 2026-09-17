# qa-engineer — Vision AI frontend brief

## Evidence to read
`tests/**`, `tests/support.tsx`, `tests/setup.ts`, test settings in `vite.config.ts`,
`.claude/team/invariants.md`. Skill: `frontend-verify`.

## What breaks here
- Coverage: `npx vitest run --coverage <files>` (`@vitest/coverage-v8` is installed), scoped.
- Over-granting identities in `tests/support.tsx` versus the backend's `permissions_for(role)`.
- Stubs returning shapes the generated `src/shared/types/openapi.ts` does not allow.
- Mocked components or hooks — the harness renders the real app against a stubbed `fetch` on purpose.
- Missing shapes: value, `null` (renders `—`), real `0`; each of the four observation states.
- `fileParallelism: false`, `asyncUtilTimeout: 8000`, `testTimeout: 25_000` are deliberate (the lazy
  DevTools chunk takes 4–6 s to transform) — not flake to "fix".

# architecture-auditor — Vision AI frontend brief

The map is `.claude/team/invariants.md` (four states once; `—` never `0`; `available` never
`records.length`; colour never the only signal; `PageIntro` on every page; one dynamic import; unique
icons; single-flight refresh; readiness matches pages).

- In a scratch copy `node_modules` is linked, so `npx vitest run tests/<file>` works directly.
- The DevTools chunk takes 4–6 s to transform on first navigation; timeouts of 25 s are expected.

# Invariants — Vision AI frontend

Read by the `invariant-audit` skill and the architecture-auditor / qa-engineer agents. Each row: the
invariant, the test that must hold it, and a realistic mutation that should turn that test red.
Run tests with `npx vitest run tests/<file>` (in a scratch copy, `node_modules` is linked).

| Invariant | Test | A realistic mutation |
|---|---|---|
| Four states resolved in one place; only `ABSENT` violates | `tests/semantics.test.ts` ("a refused observation cannot produce a violation") | Replace `'not_visible'` with `'absent'` in `src/shared/semantics/observation.ts` (verified: 3 tests red) |
| `—` never `0` | `tests/composition.test.tsx` "a figure refuses a value it does not have" | Default `Figure` value to `0` |
| Meter needs a denominator | `tests/composition.test.tsx`, `tests/art-direction.test.tsx` | Draw with `total = 0` |
| Readiness declaration matches pages | `tests/information-architecture.test.tsx` "marks a destination as awaiting or blocked only where the page says so" | Flip one nav item to `live` |
| One dynamic import | `tests/devtools.test.tsx` (reads `AppRouter?raw`) | Add a second `React.lazy` |
| Unique icon per destination | `tests/icons.test.tsx` | Reuse a `NavIcons` entry |
| Single-flight refresh | `tests/auth.test.tsx` "single-flight refresh" | Call refresh per 401 in `src/shared/api/client.ts` |

## Tautology check

Role fixtures (`identity`, `managerIdentity`, `supervisorIdentity`, `auditorIdentity`,
`adminIdentity`) in `tests/support.tsx` must carry exactly the backend's `permissions_for(role)`.

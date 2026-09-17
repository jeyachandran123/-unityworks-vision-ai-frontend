---
name: four-states
description: Use when rendering an observation, attribute, finding, compliance result, count, percentage, coverage, capability or any metric in the Vision AI frontend — especially when a value can be missing, zero, refused, not visible, not configured or unavailable.
---

# Four States, and Never a Fabricated Number

## Overview

The product's one unforgivable failure is making "not watching" look like "no problems". Two rules:

1. An observation has **four** states — `present`, `absent`, `not_visible`, `unknown` — and only
   `absent` may become a violation.
2. A value the page does not have renders as `—` **with a reason**, never `0`, never an empty list.

## Observation values

```ts
import { resolveState, describeState, coverageOf, hasDecidedEvidence } from '@shared/semantics/observation';

const d = describeState(attr.value);   // { state, label, glyph, colorVar, countsAsViolation, decided, ... }
<StateBadge value={attr.value} />      // renders colour + glyph + word
```

- `resolveState` in `src/shared/semantics/observation.ts` is the **only** mapping from a raw value to a
  state. `null`/`undefined`/`''` → `unknown`; refusal values → `not_visible`; `none`-style → `absent`;
  anything else → `present`.
- Violation logic reads `STATES[state].countsAsViolation`. Never `value !== 'present'`, never
  `!value`.
- A frozen finding (`semantics/finding.ts`) reads what was *recorded* as failed, and still renders the
  observed value through `resolveState`.
- Colour is never the only signal: glyph/icon **and** word, always.

## Numbers

| Situation | Render |
|---|---|
| value unknown, not computed, source not connected | `<Figure label="…" value={null} unavailableReason="Coverage is not reported yet" />` → `—` + reason |
| value is genuinely zero | `value={0}` — a real `0` |
| proportion with no denominator | `Meter` refuses and shows the reason; `coverageOf([])` returns `ratio: null` |
| a count derived from a list | only if the list is the complete, authoritative set — otherwise `null` |

`StatCard` (primitives) and `Figure` (product) both treat `null`/`undefined` as unavailable. Never
write `value={x ?? 0}` or `value={data?.count || 0}`.

## Capabilities

From `src/shared/api/capabilities.ts`:

- `available` is its own field. **Never** infer availability from `records.length === 0`.
- `not_configured` (waiting for engineering) and `blocked` (waiting for a decision, e.g. Patron ID)
  are different facts with different words.
- `stored_records` is a storage fact. Never render it as a reading.

## Live status

`connected` (socket open) and `streaming` (observations arriving) are separate states in
`shared/realtime/connection.ts`. A "LIVE" badge requires `streaming`.

## The tests that hold this

`tests/semantics.test.ts`, `tests/composition.test.tsx` ("a figure refuses a value it does not have",
"a proportion is not drawn without a denominator"), `tests/art-direction.test.tsx` ("the meter still
refuses what it cannot draw"). Add a case for any new rendering of a state or metric: one with the
value, one with `null`, and — if zero is possible — one with a real `0`.

## Red flags

- `?? 0`, `|| 0`, `.length` as a metric
- `value === 'present' ? 'ok' : 'violation'`
- A new colour for a state outside `STATES`
- An empty table where a "not connected" message belongs

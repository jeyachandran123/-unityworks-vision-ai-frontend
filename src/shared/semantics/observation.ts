/**
 * The four observation states, and the one rule this application must not break.
 *
 * Vision OS is three-valued, and compliance evaluation produces four outcomes.
 * Every layer upstream of this file — the attribute registry, the rule
 * documents' `unknown_values`, the compliance evaluator's Kleene semantics, the
 * DevTools wire format — has been built to keep them distinct. The frontend is
 * where they either survive or quietly become a boolean.
 *
 *   PRESENT       the thing was observed, and it is there
 *   ABSENT        the thing was observed, and it is not there   ← a violation candidate
 *   NOT_VISIBLE   the model looked and could not see            ← NEVER a violation
 *   UNKNOWN       nothing fresh was observed at all             ← NEVER a violation
 *
 * Collapsing NOT_VISIBLE or UNKNOWN into ABSENT accuses somebody nobody could
 * see. The programme has already paid for this twice: the rule documents carry
 * `unknown_values: ["not_visible"]` precisely because *"a person nobody could
 * actually see is reported as non-compliant"*, and the Camera C investigation
 * nearly recorded a dozen fabricated violations from clear gloves misread at low
 * resolution.
 *
 * So resolution happens here, once, and every surface renders the result.
 * Nothing else in this application is allowed to map an attribute value to a
 * verdict.
 */

export type ObservationState = 'present' | 'absent' | 'not_visible' | 'unknown';

export interface StateDescriptor {
  readonly state: ObservationState;
  /** The operator-facing word. Never an enum name. */
  readonly label: string;
  /** One sentence a restaurant manager can act on. */
  readonly description: string;
  /** CSS custom property holding the state colour. */
  readonly colorVar: string;
  readonly washVar: string;
  /**
   * A glyph, because colour is never the only signal — required for anyone with
   * a colour vision deficiency, and for a screen glanced at from an angle.
   */
  readonly glyph: string;
  /** Whether this state may contribute to a violation. Only `absent` may. */
  readonly countsAsViolation: boolean;
  /** Whether the platform actually looked and reached an answer. */
  readonly decided: boolean;
}

export const STATES: Readonly<Record<ObservationState, StateDescriptor>> = {
  present: {
    state: 'present',
    label: 'Present',
    description: 'Observed and confirmed.',
    colorVar: 'var(--state-present)',
    washVar: 'var(--state-present-wash)',
    glyph: '✓',
    countsAsViolation: false,
    decided: true,
  },
  absent: {
    state: 'absent',
    label: 'Absent',
    description: 'Observed, and not there.',
    colorVar: 'var(--state-absent)',
    washVar: 'var(--state-absent-wash)',
    glyph: '✕',
    countsAsViolation: true,
    decided: true,
  },
  not_visible: {
    state: 'not_visible',
    label: 'Not visible',
    description: 'The camera could not see this. It is not a finding either way.',
    colorVar: 'var(--state-not-visible)',
    washVar: 'var(--state-not-visible-wash)',
    glyph: '◍',
    countsAsViolation: false,
    decided: false,
  },
  unknown: {
    state: 'unknown',
    label: 'Unknown',
    description: 'No recent observation. Nothing is being claimed.',
    colorVar: 'var(--state-unknown)',
    washVar: 'var(--state-unknown-wash)',
    glyph: '?',
    countsAsViolation: false,
    decided: false,
  },
};

/**
 * Attribute values that mean "the model looked and could not see".
 *
 * These come from the platform's own attribute domains, where every declared
 * attribute carries `not_visible`. Listed rather than inferred, because only the
 * domain author knows which members of an enum are facts and which are refusals.
 */
const REFUSAL_VALUES = new Set(['not_visible', 'not visible', 'notvisible']);

/**
 * Attribute values that mean "observed, and the thing is not there".
 *
 * `none` is the only one. It is a *decided* answer — the model looked at a head
 * and reported no covering — which is why it is the one value that may become a
 * violation.
 */
const ABSENT_VALUES = new Set(['none', 'bare']);

/**
 * Resolve a raw attribute value to a state.
 *
 * `null` and `undefined` are UNKNOWN, not ABSENT. A missing attribute means
 * nobody looked, and "nobody looked" is not evidence of anything.
 */
export function resolveState(value: string | null | undefined): ObservationState {
  if (value === null || value === undefined) return 'unknown';

  const normalised = value.trim().toLowerCase();
  if (normalised === '') return 'unknown';
  if (REFUSAL_VALUES.has(normalised)) return 'not_visible';
  if (ABSENT_VALUES.has(normalised)) return 'absent';

  // Anything else is a real, decided value — `hairnet`, `gloves`, `mask`.
  return 'present';
}

export function describeState(value: string | null | undefined): StateDescriptor {
  return STATES[resolveState(value)];
}

/**
 * Whether a set of attribute values supports any statement at all.
 *
 * Used by every surface that would otherwise say "all compliant". If nothing was
 * decided, the honest answer is "not assessed" — a dashboard reading "0
 * violations" from a camera that has been offline since Tuesday is worse than no
 * dashboard.
 */
export function hasDecidedEvidence(values: ReadonlyArray<string | null | undefined>): boolean {
  return values.some((value) => STATES[resolveState(value)].decided);
}

/**
 * Coverage: how much of what was looked at actually produced an answer.
 *
 * Every compliance figure in this product ships with this beside it. The
 * platform computes the same thing through `ObservationApi.coverage()`; this is
 * the presentation-side arithmetic over what a screen currently holds.
 */
export interface Coverage {
  readonly total: number;
  readonly decided: number;
  readonly notVisible: number;
  readonly unknown: number;
  /** `null` when nothing was assessed — never 0, never 100. */
  readonly ratio: number | null;
}

export function coverageOf(values: ReadonlyArray<string | null | undefined>): Coverage {
  let decided = 0;
  let notVisible = 0;
  let unknown = 0;

  for (const value of values) {
    const state = resolveState(value);
    if (state === 'not_visible') notVisible += 1;
    else if (state === 'unknown') unknown += 1;
    else decided += 1;
  }

  return {
    total: values.length,
    decided,
    notVisible,
    unknown,
    // `null` rather than 0 for an empty set. Zero coverage and no subjects are
    // different facts, and rendering both as "0%" loses the one that matters.
    ratio: values.length === 0 ? null : decided / values.length,
  };
}

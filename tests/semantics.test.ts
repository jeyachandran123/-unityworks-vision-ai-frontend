/**
 * The four-state rule.
 *
 * This is the test file that matters most. Everything upstream — the attribute
 * registry, the rule documents' `unknown_values`, the Kleene evaluator, the
 * DevTools wire format — exists to keep PRESENT, ABSENT, NOT_VISIBLE and UNKNOWN
 * distinct. The frontend is the last place they can quietly become a boolean.
 */

import { describe, expect, it } from 'vitest';
import {
  coverageOf,
  describeState,
  hasDecidedEvidence,
  resolveState,
  STATES,
} from '@shared/semantics/observation';

describe('resolveState', () => {
  it('treats a real covering as present', () => {
    expect(resolveState('hairnet')).toBe('present');
    expect(resolveState('gloves')).toBe('present');
    expect(resolveState('mask')).toBe('present');
  });

  it('treats "none" as absent — the model looked and reported nothing there', () => {
    expect(resolveState('none')).toBe('absent');
  });

  it('treats "not_visible" as its own state, never as absent', () => {
    expect(resolveState('not_visible')).toBe('not_visible');
    expect(resolveState('NOT_VISIBLE')).toBe('not_visible');
    expect(resolveState(' not_visible ')).toBe('not_visible');
  });

  it('treats a missing value as unknown, never as absent', () => {
    // Nobody looked. "Nobody looked" is not evidence of anything.
    expect(resolveState(null)).toBe('unknown');
    expect(resolveState(undefined)).toBe('unknown');
    expect(resolveState('')).toBe('unknown');
  });
});

describe('only ABSENT may become a violation', () => {
  it('absent counts', () => {
    expect(STATES.absent.countsAsViolation).toBe(true);
  });

  it.each(['present', 'not_visible', 'unknown'] as const)('%s never counts', (state) => {
    expect(STATES[state].countsAsViolation).toBe(false);
  });

  it('a refused observation cannot produce a violation', () => {
    // The failure this guards: "a person nobody could actually see is reported
    // as non-compliant."
    expect(describeState('not_visible').countsAsViolation).toBe(false);
  });

  it('a missing observation cannot produce a violation', () => {
    expect(describeState(null).countsAsViolation).toBe(false);
  });
});

describe('every state is distinguishable without colour', () => {
  it('each has a unique glyph', () => {
    const glyphs = Object.values(STATES).map((state) => state.glyph);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });

  it('each has a unique label', () => {
    const labels = Object.values(STATES).map((state) => state.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('each has a unique colour token', () => {
    const colours = Object.values(STATES).map((state) => state.colorVar);
    expect(new Set(colours).size).toBe(colours.length);
  });

  it('not visible does not share a colour with absent', () => {
    // The whole point. "Could not see" must never look like "is not wearing one".
    expect(STATES.not_visible.colorVar).not.toBe(STATES.absent.colorVar);
  });

  it('unknown does not share a colour with present', () => {
    expect(STATES.unknown.colorVar).not.toBe(STATES.present.colorVar);
  });
});

describe('decided evidence', () => {
  it('present and absent are decided', () => {
    expect(STATES.present.decided).toBe(true);
    expect(STATES.absent.decided).toBe(true);
  });

  it('not visible and unknown are not', () => {
    expect(STATES.not_visible.decided).toBe(false);
    expect(STATES.unknown.decided).toBe(false);
  });

  it('a set of refusals supports no statement at all', () => {
    expect(hasDecidedEvidence(['not_visible', null, undefined])).toBe(false);
  });

  it('one decided value is enough to say something', () => {
    expect(hasDecidedEvidence(['not_visible', 'hairnet'])).toBe(true);
  });
});

describe('coverage', () => {
  it('separates decided, not-visible and unknown', () => {
    const coverage = coverageOf(['hairnet', 'none', 'not_visible', null]);
    expect(coverage.total).toBe(4);
    expect(coverage.decided).toBe(2);
    expect(coverage.notVisible).toBe(1);
    expect(coverage.unknown).toBe(1);
    expect(coverage.ratio).toBe(0.5);
  });

  it('reports null rather than zero when nothing was assessed', () => {
    // Zero coverage and no subjects are different facts. Rendering both as "0%"
    // loses the one that matters.
    expect(coverageOf([]).ratio).toBeNull();
  });

  it('reports zero coverage when everything was refused', () => {
    const coverage = coverageOf(['not_visible', 'not_visible']);
    expect(coverage.ratio).toBe(0);
    expect(coverage.decided).toBe(0);
  });
});

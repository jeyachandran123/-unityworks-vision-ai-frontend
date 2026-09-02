/**
 * Reading a **frozen** finding.
 *
 * This is the same discipline as the Phase 3 close-out that moved the four-state
 * PPE fold into `app/domain/observations.py` so the product API and the
 * reporting engine could not drift apart. The reason is identical: two copies of
 * a function that decides which conditions failed is exactly where one of them
 * eventually starts treating `not_visible` as a failure.
 *
 * Stage 3 gave the incident readout a second call site — the ledger and the
 * detail route now share one component, and Alerts shares it too — so the
 * function moved here and `features/alerts` re-exports it rather than owning it.
 *
 * Everything below reads defensively. A `finding` is a stored document written
 * by whichever ruleset was in force at the time; one written by an older version
 * must still render rather than crash the queue.
 */

import type { Incident } from '@shared/api/persistence';

export interface FailedCondition {
  attribute: string;
  /** The raw platform value. Resolved to a state by `semantics/observation`. */
  observed: string;
}

/**
 * The conditions that actually failed, from the frozen finding.
 *
 * Note what this does **not** do: it does not decide whether a value is a
 * violation. It reports what the stored document recorded as `failed`, and the
 * rendering resolves the observed value through `resolveState` like every other
 * surface. Nothing here maps a value to a verdict.
 */
export function failedConditions(incident: Incident): FailedCondition[] {
  const raw = incident.finding as { conditions?: unknown } | null;
  const conditions = Array.isArray(raw?.conditions) ? raw.conditions : [];
  return conditions
    .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
    .filter((c) => c['outcome'] === 'failed')
    .map((c) => ({
      attribute: String(c['attribute'] ?? ''),
      observed: String(c['observed'] ?? ''),
    }))
    .filter((c) => c.attribute);
}

/** `head_covering` → `Head covering`. The attribute key, made readable. */
export function attributeLabel(key: string): string {
  const words = key.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The camera key as an operator says it: `cam-12` → `Camera 12`. */
export function cameraLabel(key: string): string {
  const match = /^cam-0*(\d+)$/.exec(key);
  return match ? `Camera ${match[1]}` : key;
}

/** When it was observed, falling back to when it was raised. Never a guess. */
export function observedAt(incident: Incident): string {
  const value = incident.observed_at ?? incident.created_at;
  if (!value) return '—';
  const when = new Date(value);
  return Number.isNaN(when.getTime()) ? '—' : when.toLocaleString();
}

/**
 * The pieces every recorder screen shares.
 *
 * Kept together so the list, the add flow and the recorder's own page say the
 * same thing the same way: a password is "Saved securely" everywhere, a failed
 * test reads identically wherever it is run, and "Active" never means one thing
 * on one page and another on the next.
 */

import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { isApiError } from '@shared/api/errors';
import { type Recorder, type RecorderTestResult, recordersApi } from '@shared/api/recorders';
import { Input, Select, StatusBadge } from '@shared/ui/primitives';

/* ── words ────────────────────────────────────────────────────────────────── */

export const STREAM_LABEL: Record<'main' | 'sub', string> = {
  sub: 'Sub stream — lighter, recommended',
  main: 'Main stream — full quality',
};

export const STREAM_SHORT: Record<'main' | 'sub', string> = { sub: 'Sub', main: 'Main' };

/** A server error, in the words the server chose for a person. */
export function friendly(error: unknown, fallback: string): string {
  return isApiError(error) ? error.friendlyMessage : fallback;
}

/**
 * The shape an address must have, checked while typing.
 *
 * The same rule the server enforces: just the address, no `rtsp://`, port or
 * path. Checked here too so the person learns it on the field they are typing
 * in, not after pressing Save three steps later.
 */
export function addressProblem(value: string): string | undefined {
  const host = value.trim();
  if (!host) return undefined;
  if (/^[a-z]+:\/\//i.test(host)) return 'Enter just the address — leave out rtsp://';
  if (host.includes('/')) return 'Enter just the address — leave out any path';
  if (host.includes(':')) return 'Enter the port in the Port box, not here';
  if (host.includes('@')) return 'Enter just the address — the username goes on the next step';
  if (/\s/.test(host)) return 'An address has no spaces';
  if (!/^[A-Za-z0-9.-]+$/.test(host)) return 'Use letters, numbers, dots and hyphens only';
  return undefined;
}

export function portProblem(value: string): string | undefined {
  if (!value.trim()) return 'Enter the port — usually 554';
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return 'A port is a whole number between 1 and 65535 — usually 554';
  }
  return undefined;
}

/* ── state, shown the same way everywhere ─────────────────────────────────── */

export function RecorderStatus({ active }: { active: boolean }) {
  return active ? (
    <StatusBadge tone="online">Active</StatusBadge>
  ) : (
    <StatusBadge tone="idle">Inactive</StatusBadge>
  );
}

/**
 * Whether the recorder can sign in, without ever hinting at the password.
 *
 * A password typed in here is "Saved securely". One that the server's operator
 * keeps outside the application is said to be managed by the server, so nobody
 * goes looking for a field to change it that does not exist.
 */
export function CredentialState({ recorder }: { recorder: Pick<Recorder, 'credential_configured' | 'credential_scheme'> }) {
  if (!recorder.credential_configured) {
    return <StatusBadge tone="degraded">No password</StatusBadge>;
  }
  if (recorder.credential_scheme === 'recorder') {
    return <span>Saved securely</span>;
  }
  return <span>Managed by the server</span>;
}

/* ── the brand dropdown ───────────────────────────────────────────────────── */

export function useBrands() {
  return useQuery({
    queryKey: ['recorder-brands'],
    queryFn: recordersApi.brands,
    // A deployment's brands change with a release, not while a page is open.
    staleTime: 60 * 60 * 1000,
  });
}

export function BrandSelect({
  id,
  value,
  onChange,
  hint,
}: {
  id: string;
  value: string;
  onChange: (brand: string, defaultPort: number | null) => void;
  hint?: ReactNode;
}) {
  const brands = useBrands();
  const list = brands.data?.brands ?? [];
  const custom = brands.data?.custom ?? 'custom';

  return (
    <Select
      id={id}
      label="Brand"
      value={value}
      hint={hint ?? 'Printed on the front or the label of the recorder.'}
      disabled={brands.isLoading}
      onChange={(event) => {
        const chosen = list.find((brand) => brand.key === event.target.value);
        onChange(event.target.value, chosen ? chosen.default_port : null);
      }}
    >
      <option value="">{brands.isLoading ? 'Loading brands…' : 'Choose…'}</option>
      {list.map((brand) => (
        <option key={brand.key} value={brand.key}>
          {brand.label}
        </option>
      ))}
      <option value={custom}>Other — not in this list</option>
    </Select>
  );
}

/* ── the password field ───────────────────────────────────────────────────── */

/**
 * A password input with no way to reveal what was typed.
 *
 * `new-password` so a browser offers to generate or save rather than filling in
 * the person's own sign-in password for this application — which is the wrong
 * password, and would be saved against the recorder without anybody noticing.
 */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  hint,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
}) {
  return (
    <Input
      id={id}
      type="password"
      label={label}
      value={value}
      autoComplete="new-password"
      spellCheck={false}
      hint={hint}
      error={error}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/* ── a connection test's result ───────────────────────────────────────────── */

/**
 * What a connection test found, as a person needs to read it.
 *
 * The server writes `message` and `hint` for exactly this; they carry no URL
 * and no password, so they are shown as they come.
 */
/** What `TestResult` reads: the fields a recorder test and a camera test share. */
export type TestOutcome = Pick<
  RecorderTestResult,
  'ok' | 'message' | 'hint' | 'channel' | 'elapsed_ms' | 'resolution'
>;

export function TestResult({ result }: { result: TestOutcome }) {
  const tone = result.ok ? 'var(--health-online)' : 'var(--severity-critical)';
  return (
    <div
      role={result.ok ? 'status' : 'alert'}
      style={{
        display: 'grid',
        gap: 'var(--space-1)',
        padding: 'var(--space-3) var(--space-4)',
        borderLeft: `3px solid ${tone}`,
        background: 'var(--surface-sunken)',
        borderRadius: 'var(--radius-sm)',
      }}
    >
      <strong style={{ color: tone }}>
        {result.ok ? '✓ ' : '✕ '}
        {result.message}
      </strong>
      {result.ok ? (
        <span style={{ color: 'var(--ink-secondary)', fontSize: 'var(--text-sm)' }}>
          Channel {result.channel}
          {result.resolution ? ` sent a ${result.resolution} picture` : ' sent a picture'} in{' '}
          {(result.elapsed_ms / 1000).toFixed(1)}s.
        </span>
      ) : (
        <span style={{ color: 'var(--ink-secondary)', fontSize: 'var(--text-sm)' }}>
          {result.hint}
        </span>
      )}
    </div>
  );
}

/* ── a step indicator ─────────────────────────────────────────────────────── */

/**
 * Where somebody is in a multi-step flow, and how much is left.
 *
 * An ordered list, because the order is the information: each step depends on
 * the one before it. The current step is `aria-current="step"`, so a screen
 * reader announces position rather than only a heading.
 */
export function Steps({ steps, current }: { steps: ReadonlyArray<string>; current: number }) {
  return (
    <ol
      aria-label="Progress"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'var(--space-2) var(--space-5)',
        listStyle: 'none',
        margin: 0,
        padding: 0,
        fontSize: 'var(--text-sm)',
      }}
    >
      {steps.map((label, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'todo';
        return (
          <li
            key={label}
            aria-current={state === 'current' ? 'step' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              color: state === 'todo' ? 'var(--ink-tertiary)' : 'var(--ink-primary)',
              fontWeight: state === 'current' ? 'var(--weight-semibold)' : undefined,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: 'inline-grid',
                placeItems: 'center',
                width: '1.5rem',
                height: '1.5rem',
                borderRadius: '999px',
                fontSize: 'var(--text-xs)',
                border: '1px solid var(--line-strong)',
                background: state === 'current' ? 'var(--accent)' : 'transparent',
                color: state === 'current' ? 'var(--ink-inverse)' : 'inherit',
              }}
            >
              {state === 'done' ? '✓' : index + 1}
            </span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

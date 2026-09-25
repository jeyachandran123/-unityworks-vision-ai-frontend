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

import { useAuth } from '@app/auth/AuthProvider';
import { isApiError } from '@shared/api/errors';
import {
  type ConnectVia,
  type Recorder,
  type RecorderTestResult,
  recordersApi,
} from '@shared/api/recorders';
import { Input, Select, StatusBadge } from '@shared/ui/primitives';

/* ── words ────────────────────────────────────────────────────────────────── */

export const STREAM_LABEL: Record<'main' | 'sub', string> = {
  sub: 'Sub stream — lighter, recommended',
  main: 'Main stream — full quality',
};

export const STREAM_SHORT: Record<'main' | 'sub', string> = { sub: 'Sub', main: 'Main' };

/** The Live Wall rate a camera gets unless somebody chooses another. */
export const DEFAULT_WALL_FPS = 4;

/** The rates offered. Plain numbers somebody can compare, 1 to 25. */
const WALL_FPS_CHOICES = [1, 2, 4, 6, 8, 10, 12, 15, 20, 25] as const;

function fpsWord(fps: number): string {
  if (fps === DEFAULT_WALL_FPS) return ' — standard';
  if (fps <= 2) return ' — lightest';
  if (fps >= 15) return ' — smooth';
  return '';
}

/**
 * How smoothly a camera plays on the Live Wall.
 *
 * Each camera's own setting. A value set some other way that is not in the
 * list is still offered, so opening an edit never silently changes it.
 */
export function FrameRateSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: number;
  onChange: (fps: number) => void;
}) {
  const choices: number[] = [...WALL_FPS_CHOICES];
  if (!choices.includes(value)) choices.push(value);
  choices.sort((a, b) => a - b);
  return (
    <Select
      id={id}
      label="Live Wall frame rate"
      value={String(value)}
      hint="How smoothly it plays on the Live Wall. Higher uses more network and server power, and the camera’s own stream is the limit."
      onChange={(event) => onChange(Number(event.target.value))}
    >
      {choices.map((fps) => (
        <option key={fps} value={String(fps)}>
          {fps} fps{fpsWord(fps)}
        </option>
      ))}
    </Select>
  );
}

/** A server error, in the words the server chose for a person. */
export function friendly(error: unknown, fallback: string): string {
  return isApiError(error) ? error.friendlyMessage : fallback;
}

/** The organization being configured, by the name its people know it by. */
export function useOrganizationName(): string {
  const { activeOrganization, user } = useAuth();
  return activeOrganization?.name ?? user?.tenant_id ?? '';
}

/* ── addresses ────────────────────────────────────────────────────────────── */

export const VIA_LABEL: Record<ConnectVia, string> = {
  ip_address: 'IP address',
  hostname: 'Domain / hostname',
};

/** What a typed address must never contain, whichever field it is in. */
function urlProblem(value: string): string | undefined {
  if (/^[a-z]+:\/\//i.test(value)) return 'Enter just the address — leave out rtsp://';
  if (value.includes('/')) return 'Enter just the address — leave out any path';
  if (value.includes(':')) return 'Enter the port in the port box, not here';
  if (value.includes('@')) return 'Enter just the address — the username goes on the next step';
  if (/\s/.test(value)) return 'An address has no spaces';
  return undefined;
}

/**
 * The shape an IP address must have, checked while typing.
 *
 * The same rules the server enforces, so the person learns them on the field
 * they are typing in rather than after pressing Save three steps later.
 */
export function ipProblem(value: string): string | undefined {
  const ip = value.trim();
  if (!ip) return undefined;
  const url = urlProblem(ip);
  if (url) return url;
  if (/[a-z]/i.test(ip)) return 'That looks like a domain — enter it under Domain / hostname';
  const parts = ip.split('.');
  const valid =
    parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
  return valid ? undefined : 'An IP address is four numbers from 0 to 255, such as 192.168.1.20';
}

export function hostnameProblem(value: string): string | undefined {
  const name = value.trim();
  if (!name) return undefined;
  const url = urlProblem(name);
  if (url) return url;
  if (/^[\d.]+$/.test(name)) return 'That is an IP address — enter it under IP address';
  if (!/^[A-Za-z0-9.-]+$/.test(name)) return 'Use letters, numbers, dots and hyphens only';
  return undefined;
}

export function portProblem(value: string): string | undefined {
  if (!value.trim()) return 'Enter the video port — usually 554';
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return 'A port is a whole number between 1 and 65535 — usually 554';
  }
  return undefined;
}

/** A recorder's addresses as a form holds them. */
export interface AddressDraft {
  ipAddress: string;
  hostname: string;
  /** Only meaningful when both addresses are filled in. */
  connectVia: ConnectVia | '';
  port: string;
}

/** Which address will be dialled: the only one there is, or the one chosen. */
export function chosenVia(draft: AddressDraft): ConnectVia | undefined {
  const ip = draft.ipAddress.trim();
  const name = draft.hostname.trim();
  if (ip && name) return draft.connectVia || undefined;
  if (ip) return 'ip_address';
  if (name) return 'hostname';
  return undefined;
}

export function addressProblems(draft: AddressDraft): Record<string, string | undefined> {
  const ip = draft.ipAddress.trim();
  const name = draft.hostname.trim();
  return {
    ipAddress: ipProblem(ip),
    hostname: hostnameProblem(name),
    either: ip || name ? undefined : 'Enter the recorder’s IP address, its domain, or both',
    connectVia:
      ip && name && !draft.connectVia ? 'Choose which address this server should connect with' : undefined,
    port: portProblem(draft.port),
  };
}

/** The fields the API takes, from a form's draft. */
export function addressFields(draft: AddressDraft) {
  const via = chosenVia(draft);
  return {
    ip_address: draft.ipAddress.trim(),
    hostname: draft.hostname.trim(),
    rtsp_port: Number(draft.port),
    ...(via ? { connect_via: via } : {}),
  };
}

/**
 * IP address, domain, which of them to use, and the video port.
 *
 * Both addresses are optional on their own and at least one is needed. The
 * choice of which to dial appears only once there are two to choose between,
 * with each option showing the value it would use — nobody picks "Domain"
 * without seeing which domain.
 */
export function AddressFields({
  idPrefix,
  value,
  onChange,
  problems,
  showRequired,
}: {
  idPrefix: string;
  value: AddressDraft;
  onChange: (patch: Partial<AddressDraft>) => void;
  problems: Record<string, string | undefined>;
  /** Whether "missing" problems show yet — only after a first attempt to continue. */
  showRequired: boolean;
}) {
  const ip = value.ipAddress.trim();
  const name = value.hostname.trim();
  // A format problem shows while typing; a missing value only once the person
  // has tried to go on.
  const shown = (problem: string | undefined, typed: boolean) =>
    problem && (showRequired || typed) ? problem : undefined;

  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(13rem, 1fr))',
          gap: 'var(--space-3)',
        }}
      >
        <Input
          id={`${idPrefix}-ip`}
          label="IP address"
          value={value.ipAddress}
          placeholder="192.168.1.20"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          hint="On the site’s own network."
          error={shown(problems['ipAddress'], Boolean(ip))}
          onChange={(event) => onChange({ ipAddress: event.target.value })}
        />
        <Input
          id={`${idPrefix}-hostname`}
          label="Domain / hostname"
          value={value.hostname}
          placeholder="site.example.com"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          hint="Reaches it from anywhere — often a dynamic-DNS name."
          error={shown(problems['hostname'], Boolean(name))}
          onChange={(event) => onChange({ hostname: event.target.value })}
        />
      </div>
      {showRequired && problems['either'] ? <FieldError>{problems['either']}</FieldError> : null}

      {ip && name ? (
        <fieldset
          style={{
            border: '1px solid var(--line-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: 'var(--space-3) var(--space-4)',
            margin: 0,
            display: 'grid',
            gap: 'var(--space-2)',
          }}
        >
          <legend style={{ padding: '0 var(--space-2)', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)' }}>
            This server connects using
          </legend>
          {(['ip_address', 'hostname'] as const).map((via) => (
            <label
              key={via}
              style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'baseline', fontSize: 'var(--text-sm)' }}
            >
              <input
                type="radio"
                name={`${idPrefix}-connect-via`}
                value={via}
                checked={value.connectVia === via}
                onChange={() => onChange({ connectVia: via })}
              />
              <span>
                {VIA_LABEL[via]}{' '}
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-secondary)' }}>
                  {via === 'ip_address' ? ip : name}
                </span>
              </span>
            </label>
          ))}
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)' }}>
            Use the IP address when this server is on the same network as the recorder, and the
            domain when it is somewhere else. Both are kept; you can switch later.
          </span>
          {showRequired && problems['connectVia'] ? <FieldError>{problems['connectVia']}</FieldError> : null}
        </fieldset>
      ) : null}

      <div style={{ maxWidth: '16rem' }}>
        <Input
          id={`${idPrefix}-port`}
          label="Video (RTSP) port"
          value={value.port}
          inputMode="numeric"
          hint="Usually 554. Not always the port the recorder’s phone app or web page uses."
          error={shown(problems['port'], Boolean(value.port.trim()))}
          onChange={(event) => onChange({ port: event.target.value })}
        />
      </div>
    </div>
  );
}

/**
 * Where a recorder is, as one line and an aside: the address it is dialled
 * at, then the other one it also has.
 */
export function RecorderAddress({
  recorder,
}: {
  recorder: Pick<Recorder, 'ip_address' | 'hostname' | 'connect_via' | 'address' | 'rtsp_port'>;
}) {
  const other =
    recorder.connect_via === 'hostname'
      ? recorder.ip_address && `also IP ${recorder.ip_address}`
      : recorder.hostname && `also ${recorder.hostname}`;
  return (
    <span style={{ display: 'grid', gap: '0.1rem' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
        {recorder.address || '—'}:{recorder.rtsp_port}
      </span>
      {other ? (
        <span style={{ color: 'var(--ink-tertiary)', fontSize: 'var(--text-xs)' }}>{other}</span>
      ) : null}
    </span>
  );
}

export function FieldError({ children }: { children: string }) {
  return (
    <span role="alert" style={{ color: 'var(--severity-critical)', fontSize: 'var(--text-xs)' }}>
      {children}
    </span>
  );
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
  // Still read from the server's own configuration: a migrated recorder whose
  // password has not been moved into the application yet.
  return <StatusBadge tone="degraded">Needs to be set here</StatusBadge>;
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
> &
  Partial<Pick<RecorderTestResult, 'address' | 'port'>>;

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
      {result.address ? (
        <span style={{ color: 'var(--ink-tertiary)', fontSize: 'var(--text-xs)' }}>
          Tested{' '}
          <span style={{ fontFamily: 'var(--font-mono)' }}>
            {result.address}:{result.port}
          </span>
          , channel {result.channel}.
        </span>
      ) : null}
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

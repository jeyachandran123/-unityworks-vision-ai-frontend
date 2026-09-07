/**
 * The pieces every administration surface needs, in one place.
 *
 * Administration used to be a single stacked page, so there was nothing to
 * share. Now that Sites, Cameras, People, Access and Settings are separate
 * surfaces, the small things they all do — say a request failed, format a
 * date, offer a search box, page through a list — need one implementation, or
 * five pages start disagreeing about what an empty list looks like.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

import { isApiError } from '@shared/api/errors';
import { Button, ErrorState, Input } from '@shared/ui/primitives';

/** A failed request, rendered the same way everywhere. */
export function Failed({ error }: { error: unknown }) {
  return (
    <ErrorState
      body={isApiError(error) ? error.message : 'The request did not complete.'}
      requestId={isApiError(error) ? error.requestId : undefined}
    />
  );
}

/** A date, or an em dash. Never `Invalid Date`, and never today by accident. */
export function when(iso: string | null | undefined): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString();
}

export function whenExact(iso: string | null | undefined): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString();
}

/**
 * A value that has been typed but not yet acted on.
 *
 * Search boxes that fire a request per keystroke turn a list into a stutter
 * and put a query on the wire for every prefix of what the person meant.
 */
export function useDebounced<T>(value: T, delayMs = 250): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

export function SearchField({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
  placeholder?: string;
}) {
  return (
    <Input
      label={label}
      type="search"
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/**
 * Paging, stated rather than implied.
 *
 * Says which rows these are out of how many, because "Next" alone leaves
 * somebody clicking to find out whether there is anything left.
 */
export function Pager({
  offset,
  limit,
  total,
  count,
  onOffset,
  noun,
}: {
  offset: number;
  limit: number;
  total: number;
  count: number;
  onOffset: (next: number) => void;
  noun: string;
}) {
  if (total <= limit && offset === 0) return null;

  const first = total === 0 ? 0 : offset + 1;
  const last = offset + count;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 'var(--space-4)',
        flexWrap: 'wrap',
        paddingTop: 'var(--space-4)',
      }}
    >
      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
        {first}–{last} of {total} {noun}
      </p>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <Button
          variant="ghost"
          disabled={offset === 0}
          onClick={() => onOffset(Math.max(0, offset - limit))}
        >
          Previous
        </Button>
        <Button variant="ghost" disabled={last >= total} onClick={() => onOffset(offset + limit)}>
          Next
        </Button>
      </div>
    </div>
  );
}

/**
 * The tabs across an object page — a site, a camera, a person.
 *
 * Real links rather than local state, so a tab is a URL: it can be
 * bookmarked, opened in a new tab, and linked to from a bug report.
 */
export function ObjectTabs({
  tabs,
}: {
  tabs: ReadonlyArray<{ to: string; label: string; end?: boolean }>;
}) {
  return (
    <nav
      aria-label="Sections"
      style={{
        display: 'flex',
        gap: 'var(--space-5)',
        borderBottom: '1px solid var(--line-subtle)',
        marginBottom: 'var(--space-6)',
        overflowX: 'auto',
      }}
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          style={({ isActive }) => ({
            padding: 'var(--space-2) 0',
            marginBottom: '-1px',
            whiteSpace: 'nowrap',
            textDecoration: 'none',
            fontSize: 'var(--text-sm)',
            color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
            borderBottom: `2px solid ${isActive ? 'var(--text-primary)' : 'transparent'}`,
          })}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}

/**
 * A destructive action, behind a typed confirmation.
 *
 * The confirmation is typing the object's own name, not clicking a second
 * button. A second button is muscle memory; typing `cam-07` requires having
 * read which camera this is.
 */
export function DangerConfirm({
  expect,
  label,
  hint,
  actionLabel,
  onConfirm,
  pending,
}: {
  expect: string;
  label: string;
  hint: ReactNode;
  actionLabel: string;
  onConfirm: () => void;
  pending?: boolean;
}) {
  const [typed, setTyped] = useState('');
  const matches = typed.trim() === expect;

  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '34rem' }}>
      <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>{hint}</div>
      <Input
        label={label}
        value={typed}
        placeholder={expect}
        onChange={(event) => setTyped(event.target.value)}
        autoComplete="off"
      />
      <div>
        <Button variant="danger" disabled={!matches || pending} onClick={onConfirm}>
          {pending ? 'Working…' : actionLabel}
        </Button>
      </div>
    </div>
  );
}

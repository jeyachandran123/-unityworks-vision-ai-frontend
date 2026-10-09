/**
 * Surfaces with a reason to exist.
 *
 * A card is not a container. Each surface here has a job a page can name:
 *
 * - `Panel` — a titled group: what it is, one line on why, its own acts.
 * - `MetricTile` — one number, what it counts, the context it needs, and a
 *   road to the list behind it. Renders `—` with a reason, never `0`, for a
 *   number it does not have.
 * - `FactList` — the facts about one object, in a grid that reflows.
 * - `Avatar` / `AvatarGroup` — a person, by initials. Never a stock face.
 * - `StatusPill` — a lifecycle word with its dot.
 * - `ObjectTabs` — a page's own sections, kept in the address.
 */

import { useCallback, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { Icon, type LucideIcon } from './icons';
import type { HealthTone } from './primitives';

/* ────────────────────────────────────────────────────────────────────────────
   Panel
   ──────────────────────────────────────────────────────────────────────────── */

export function Panel({
  title,
  description,
  actions,
  children,
  footer,
  flush = false,
  id,
}: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** No padding: a table or a list that runs to the panel's edges. */
  flush?: boolean;
  id?: string;
}) {
  return (
    <section className="uwv-panel" id={id} aria-label={title}>
      {title ? (
        <header className="uwv-panel-head">
          <div className="uwv-panel-head-text">
            <h3 className="uwv-panel-title">{title}</h3>
            {description ? <p className="uwv-panel-description">{description}</p> : null}
          </div>
          {actions ? <div className="uwv-button-group">{actions}</div> : null}
        </header>
      ) : null}
      <div className="uwv-panel-body" data-flush={flush ? 'true' : undefined}>
        {children}
      </div>
      {footer ? <footer className="uwv-panel-foot">{footer}</footer> : null}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Metric tile
   ──────────────────────────────────────────────────────────────────────────── */

export function MetricTile({
  label,
  value,
  unit,
  detail,
  detailTone,
  unavailableReason,
  icon,
  to,
}: {
  label: string;
  /** `null` when the number is not known. Rendered as `—`, never `0`. */
  value: number | string | null;
  unit?: string;
  detail?: ReactNode;
  detailTone?: 'success' | 'warning' | 'danger';
  unavailableReason?: string;
  icon?: LucideIcon;
  /** The list this number counts. */
  to?: string;
}) {
  const unavailable = value === null || value === undefined;
  const body = (
    <>
      <div className="uwv-metric-head">
        <span className="uwv-metric-label">{label}</span>
        {icon ? (
          <span className="uwv-metric-icon">
            <Icon icon={icon} size="control" />
          </span>
        ) : null}
      </div>
      <div className="uwv-metric-value" data-unavailable={unavailable ? 'true' : undefined}>
        {unavailable ? '—' : value}
        {!unavailable && unit ? <span className="uwv-metric-unit">{unit}</span> : null}
      </div>
      <div className="uwv-metric-detail" data-tone={unavailable ? undefined : detailTone}>
        {unavailable ? (unavailableReason ?? 'Not available yet') : detail}
      </div>
    </>
  );
  // `data-figure` names the number for anything that reads the page by figure
  // rather than by layout — the same hook `Figure` and the dashboard's tiles carry.
  return to ? (
    <Link to={to} className="uwv-metric" data-figure={label}>
      {body}
    </Link>
  ) : (
    <div className="uwv-metric" data-figure={label}>
      {body}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Facts
   ──────────────────────────────────────────────────────────────────────────── */

export function FactList({ items }: { items: ReadonlyArray<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="uwv-facts-grid">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Avatar
   ──────────────────────────────────────────────────────────────────────────── */

export function initialsOf(name: string): string {
  const words = name
    .replace(/@.*$/, '')
    .split(/[\s._-]+/)
    .filter(Boolean);
  const letters = words.length >= 2 ? `${words[0]![0]}${words[words.length - 1]![0]}` : (words[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

/** A stable tone per name, so the same person is the same colour on every page. */
function toneOf(seed: string): number {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return (Math.abs(hash) % 6) + 1;
}

export function Avatar({
  name,
  seed,
  size = 'md',
  muted = false,
}: {
  name: string;
  /** What decides the colour — an id, so a rename does not recolour a person. */
  seed?: string;
  size?: 'sm' | 'md' | 'lg';
  /** An account that cannot sign in. */
  muted?: boolean;
}) {
  return (
    <span
      className="uwv-avatar"
      data-size={size === 'sm' ? undefined : size}
      data-tone={muted ? undefined : toneOf(seed ?? name)}
      data-muted={muted ? 'true' : undefined}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}

export function AvatarGroup({
  people,
  max = 4,
}: {
  people: ReadonlyArray<{ id: string; name: string }>;
  max?: number;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="uwv-avatar-group" aria-label={`${people.length} ${people.length === 1 ? 'person' : 'people'}`}>
      {shown.map((person) => (
        <Avatar key={person.id} name={person.name} seed={person.id} size="sm" />
      ))}
      {rest > 0 ? (
        <span className="uwv-avatar" data-muted="true" aria-hidden="true">
          +{rest}
        </span>
      ) : null}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Status
   ──────────────────────────────────────────────────────────────────────────── */

/** A lifecycle word with its dot. The word is always there; the dot only helps. */
export function StatusPill({ tone, children }: { tone: HealthTone; children: ReactNode }) {
  return (
    <span className="uwv-status-pill" data-tone={tone}>
      {children}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Object tabs
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The selected tab, kept in the address as `?tab=` so a section can be
 * bookmarked, shared and returned to — without a route per tab.
 */
export function useTabParam<T extends string>(ids: ReadonlyArray<T>, fallback: T): [T, (next: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const current = (ids as ReadonlyArray<string>).includes(raw ?? '') ? (raw as T) : fallback;
  const set = useCallback(
    (next: T) => {
      setParams(
        (previous) => {
          const copy = new URLSearchParams(previous);
          if (next === fallback) copy.delete('tab');
          else copy.set('tab', next);
          return copy;
        },
        { replace: true },
      );
    },
    [setParams, fallback],
  );
  return [current, set];
}

export function ObjectTabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: ReadonlyArray<{ id: T; label: string; count?: number | null; icon?: LucideIcon }>;
  active: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="uwv-object-tabs">
      {tabs.map((tab, index) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            type="button"
            className="uwv-object-tab"
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => {
              const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
              let target: number | null = null;
              if (step) target = (index + step + tabs.length) % tabs.length;
              if (event.key === 'Home') target = 0;
              if (event.key === 'End') target = tabs.length - 1;
              if (target === null) return;
              event.preventDefault();
              onChange(tabs[target]!.id);
              document.getElementById(`tab-${tabs[target]!.id}`)?.focus();
            }}
          >
            {tab.icon ? <Icon icon={tab.icon} size="inline" /> : null}
            {tab.label}
            {typeof tab.count === 'number' ? <span className="uwv-object-tab-count">{tab.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** The panel a tab controls. */
export function TabPanel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} className="uwv-arrive" data-order="2">
      {children}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   A link that looks like a button
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * A navigation drawn as a button. Still a link — it can be opened in a new tab
 * and a screen reader calls it one — because where it goes is a page.
 */
export function ButtonLink({
  to,
  children,
  variant = 'secondary',
  size = 'md',
  icon,
}: {
  to: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
  icon?: LucideIcon;
}) {
  return (
    <Link to={to} className="uwv-btn" data-variant={variant} data-size={size} style={{ textDecoration: 'none' }}>
      {icon ? <Icon icon={icon} /> : null}
      {children}
    </Link>
  );
}

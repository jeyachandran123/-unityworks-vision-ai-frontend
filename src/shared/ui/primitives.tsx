/**
 * The primitive layer.
 *
 * Every repeated visual pattern lives here exactly once. A feature that needs a
 * table, a badge or an empty state imports one; it does not build a variant.
 *
 * Two rules run through the whole file:
 *
 * **Colour is never the only signal.** Every status carries a glyph and a word
 * as well as a hue — for colour vision deficiency, for a screen glanced at from
 * an angle, and for a screen reader.
 *
 * **Absence is a designed state.** `EmptyState`, `ErrorState`, `LoadingState`
 * and `UnknownState` are separate components because "nothing happened",
 * "something broke", "still loading" and "we could not tell" are four different
 * facts, and a product that renders them identically is lying about three.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { describeState, type ObservationState, STATES } from '@shared/semantics/observation';

/* ────────────────────────────────────────────────────────────────────────────
   Button
   ──────────────────────────────────────────────────────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders a busy state and blocks the click. Never a bare spinner swap. */
  loading?: boolean;
  icon?: ReactNode;
}

const BUTTON_SURFACE: Record<ButtonVariant, CSSProperties> = {
  primary: { background: 'var(--accent)', color: 'var(--ink-on-accent)', borderColor: 'var(--accent)' },
  secondary: { background: 'var(--surface-raised)', color: 'var(--ink-primary)', borderColor: 'var(--line-default)' },
  ghost: { background: 'transparent', color: 'var(--ink-secondary)', borderColor: 'transparent' },
  danger: { background: 'var(--state-absent-wash)', color: 'var(--state-absent)', borderColor: 'var(--state-absent)' },
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  children,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      // `aria-busy` rather than swapping the label: a screen reader announces
      // the state change without the accessible name disappearing mid-action.
      aria-busy={loading || undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-2)',
        padding: size === 'sm' ? '0.3rem 0.7rem' : '0.45rem 0.95rem',
        fontSize: size === 'sm' ? 'var(--text-xs)' : 'var(--text-sm)',
        fontWeight: 'var(--weight-medium)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.55 : 1,
        transition: `background var(--motion-fast) var(--ease-out), border-color var(--motion-fast) var(--ease-out)`,
        whiteSpace: 'nowrap',
        ...BUTTON_SURFACE[variant],
        ...style,
      }}
      {...rest}
    >
      {loading ? <Spinner size={13} /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  ...rest
}: ButtonProps & { label: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      // An icon-only control with no accessible name is invisible to a screen
      // reader, which is the most common accessibility defect in dashboards.
      aria-label={label}
      title={label}
      style={{ padding: '0.3rem', minWidth: '1.9rem' }}
      {...rest}
    >
      {children}
    </Button>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Spinner
   ──────────────────────────────────────────────────────────────────────────── */

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: '2px solid var(--line-strong)',
        borderTopColor: 'var(--accent)',
        display: 'inline-block',
        animation: 'uwv-spin 720ms linear infinite',
      }}
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Form controls
   ──────────────────────────────────────────────────────────────────────────── */

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function Input({ label, hint, error, id, ...rest }: FieldProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <label htmlFor={inputId} style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)', color: 'var(--ink-secondary)' }}>
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined}
        style={{
          padding: '0.55rem 0.75rem',
          background: 'var(--surface-sunken)',
          border: `1px solid ${error ? 'var(--state-absent)' : 'var(--line-default)'}`,
          borderRadius: 'var(--radius-sm)',
          color: 'var(--ink-primary)',
          fontSize: 'var(--text-sm)',
        }}
        {...rest}
      />
      {hint ? <span id={hintId} style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)' }}>{hint}</span> : null}
      {error ? (
        <span id={errorId} style={{ fontSize: 'var(--text-xs)', color: 'var(--state-absent)' }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function Select({
  label,
  id,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const generated = useId();
  const selectId = id ?? generated;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <label htmlFor={selectId} style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)', color: 'var(--ink-secondary)' }}>
        {label}
      </label>
      {/* `appearance: none` and a drawn chevron.

          Left native, this control rendered with the operating system's own
          chevron, border radius and focus treatment — on the Reports page, the
          single most document-like screen in the product, two Windows dropdowns
          sat inside a compliance form and were the strongest remaining signal
          that this was a web form rather than an instrument. The behaviour is
          untouched: it is still a `<select>`, still labelled, still keyboard
          operable, and the option list is still the platform's own. */}
      <select
        id={selectId}
        style={{
          appearance: 'none',
          WebkitAppearance: 'none',
          padding: '0.45rem 2rem 0.45rem 0.6rem',
          background: 'var(--surface-sunken)',
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' fill='none' stroke='%237c8c96' stroke-width='1.4'/></svg>\")",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 0.7rem center',
          border: '1px solid var(--line-default)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--ink-primary)',
          fontSize: 'var(--text-sm)',
        }}
        {...rest}
      >
        {children}
      </select>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Badges
   ──────────────────────────────────────────────────────────────────────────── */

export function Badge({
  children,
  tone = 'neutral',
  mono = false,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent';
  mono?: boolean;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        padding: '0.1rem 0.4rem',
        borderRadius: 'var(--radius-xs)',
        fontSize: 'var(--text-2xs)',
        fontFamily: mono ? 'var(--font-mono)' : 'inherit',
        border: '1px solid',
        background: tone === 'accent' ? 'var(--accent-wash)' : 'var(--surface-overlay)',
        color: tone === 'accent' ? 'var(--accent)' : 'var(--ink-secondary)',
        borderColor: tone === 'accent' ? 'var(--accent-line)' : 'var(--line-default)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

/**
 * The four-state badge. **The most important component in this application.**
 *
 * It is the single place an attribute value becomes something a person reads,
 * and it renders each of the four states with its own colour, glyph and word.
 * There is no code path through it that turns NOT_VISIBLE or UNKNOWN red.
 */
export function StateBadge({
  value,
  state,
  showLabel = true,
}: {
  /** A raw attribute value — resolved through the semantics module. */
  value?: string | null;
  /** Or an already-resolved state, when the caller has one. */
  state?: ObservationState;
  showLabel?: boolean;
}) {
  const descriptor = state ? STATES[state] : describeState(value);

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: '0.15rem 0.5rem',
        borderRadius: 'var(--radius-xs)',
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--weight-medium)',
        background: descriptor.washVar,
        color: descriptor.colorVar,
        border: `1px solid ${descriptor.colorVar}`,
        whiteSpace: 'nowrap',
      }}
      title={descriptor.description}
    >
      <span aria-hidden="true">{descriptor.glyph}</span>
      {showLabel ? descriptor.label : null}
      {/* The word is always available to assistive technology even when the
          visual label is suppressed for density. */}
      {showLabel ? null : <span className="sr-only">{descriptor.label}</span>}
    </span>
  );
}

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

const SEVERITY_GLYPH: Record<Severity, string> = {
  critical: '▲',
  high: '▲',
  medium: '◆',
  low: '●',
  info: '·',
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        fontSize: 'var(--text-2xs)',
        textTransform: 'uppercase',
        letterSpacing: 'var(--tracking-wide)',
        fontWeight: 'var(--weight-semibold)',
        color: `var(--severity-${severity})`,
      }}
    >
      <span aria-hidden="true">{SEVERITY_GLYPH[severity]}</span>
      {severity}
    </span>
  );
}

export type HealthTone = 'online' | 'degraded' | 'offline' | 'idle';

export function StatusBadge({
  tone,
  children,
}: {
  tone: HealthTone;
  children: ReactNode;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        fontSize: 'var(--text-xs)',
        color: 'var(--ink-secondary)',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: `var(--health-${tone})`,
          // A ring rather than a fill for `idle`, so the four tones differ in
          // shape as well as colour.
          boxShadow: tone === 'idle' ? 'inset 0 0 0 1px var(--health-idle)' : 'none',
          flexShrink: 0,
        }}
      />
      {children}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Surfaces
   ──────────────────────────────────────────────────────────────────────────── */

export function Card({
  children,
  padded = true,
  style,
}: {
  children: ReactNode;
  padded?: boolean;
  style?: CSSProperties;
}) {
  return (
    <section
      style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--line-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: padded ? 'var(--space-5)' : 0,
        ...style,
      }}
    >
      {children}
    </section>
  );
}

export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-4)',
        marginBottom: 'var(--space-4)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 style={{ fontSize: 'var(--text-md)' }}>{title}</h2>
        {description ? (
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)', marginTop: 'var(--space-1)' }}>
            {description}
          </p>
        ) : null}
      </div>
      {actions}
    </header>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        gap: 'var(--space-4)',
        paddingBottom: 'var(--space-5)',
        marginBottom: 'var(--space-6)',
        borderBottom: '1px solid var(--line-subtle)',
      }}
    >
      <div style={{ flex: 1, minWidth: '16rem' }}>
        <h1 style={{ fontSize: 'var(--text-xl)', letterSpacing: '-0.015em' }}>{title}</h1>
        {description ? (
          <p style={{ color: 'var(--ink-secondary)', marginTop: 'var(--space-2)', maxWidth: '62ch' }}>
            {description}
          </p>
        ) : null}
        {meta ? <div style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>{meta}</div> : null}
      </div>
      {actions ? <div style={{ display: 'flex', gap: 'var(--space-2)' }}>{actions}</div> : null}
    </header>
  );
}

/**
 * A statistic. **Refuses to render a number it does not have.**
 *
 * `value === null` renders an em dash and the reason, never `0`. A dashboard
 * showing "0 violations" from a camera that has been offline since Tuesday is
 * worse than no dashboard, and that failure starts here.
 */
export function StatCard({
  label,
  value,
  unavailableReason,
  detail,
  tone,
}: {
  label: string;
  value: number | string | null;
  unavailableReason?: string;
  detail?: ReactNode;
  tone?: 'default' | 'accent';
}) {
  const unavailable = value === null || value === undefined;

  return (
    <Card>
      <div style={{ fontSize: 'var(--text-2xs)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)', color: 'var(--ink-tertiary)' }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 'var(--text-3xl)',
          fontFamily: 'var(--font-mono)',
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 'var(--weight-semibold)',
          lineHeight: 1.05,
          marginTop: 'var(--space-3)',
          color: unavailable ? 'var(--ink-tertiary)' : tone === 'accent' ? 'var(--accent)' : 'var(--ink-primary)',
        }}
      >
        {unavailable ? '—' : value}
      </div>
      <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)' }}>
        {unavailable ? (unavailableReason ?? 'Not available yet') : detail}
      </div>
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   The four non-content states
   ──────────────────────────────────────────────────────────────────────────── */

function StateFrame({
  glyph,
  title,
  body,
  action,
  tone,
}: {
  glyph: string;
  title: string;
  body: ReactNode;
  action?: ReactNode;
  tone: string;
}) {
  return (
    /* An absence is a caption, not a region.
     *
     * This frame used to centre its content in 96px of vertical padding, which
     * made every "nothing here yet" on every page about 200px tall. Stage 5
     * measured the consequence across the product: on Administration two of
     * them were the largest objects on the screen, on Staff Hygiene one of them
     * *was* the screen, and on the Command Center the two biggest things on a
     * dashboard were notices that nothing was happening. A page whose dominant
     * mass is its empty states is a page that reads as broken even when
     * everything about it is correct.
     *
     * Every string, every role and every tone is unchanged. What changed is
     * that it now occupies what an explanation occupies: aligned to the text
     * column, glyph on the same line as the title, and as tall as its own
     * sentences. */
    <div
      role="status"
      style={{
        display: 'grid',
        gap: 'var(--space-2)',
        padding: 'var(--space-5)',
        border: '1px dashed var(--line-default)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface-sunken)',
        alignSelf: 'start',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
        <span aria-hidden="true" style={{ color: tone, flexShrink: 0 }}>
          {glyph}
        </span>
        <span style={{ fontWeight: 'var(--weight-semibold)' }}>{title}</span>
      </div>
      <div
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--ink-tertiary)',
          maxWidth: 'var(--measure)',
          paddingLeft: 'calc(1ch + var(--space-3))',
        }}
      >
        {body}
      </div>
      {action ? <div style={{ paddingLeft: 'calc(1ch + var(--space-3))' }}>{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-3)', padding: 'var(--space-12)' }}
    >
      <Spinner />
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-tertiary)' }}>{label}…</span>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: ReactNode;
  action?: ReactNode;
}) {
  return <StateFrame glyph="◯" title={title} body={body} action={action} tone="var(--ink-tertiary)" />;
}

export function ErrorState({
  title = 'Something went wrong',
  body,
  requestId,
  onRetry,
}: {
  title?: string;
  body: ReactNode;
  requestId?: string;
  onRetry?: () => void;
}) {
  return (
    <StateFrame
      glyph="✕"
      title={title}
      tone="var(--state-absent)"
      body={
        <>
          {body}
          {requestId ? (
            <div style={{ marginTop: 'var(--space-3)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--ink-tertiary)' }}>
              {/* The id, not the exception. It is what lets an engineer find the
                  detail in the log without the response body carrying any. */}
              reference {requestId}
            </div>
          ) : null}
        </>
      }
      action={onRetry ? <Button onClick={onRetry}>Try again</Button> : undefined}
    />
  );
}

/**
 * "We could not determine this." Distinct from empty and from error.
 *
 * Purple, matching the NOT_VISIBLE/UNKNOWN family, so uncertainty reads the same
 * way everywhere in the product.
 */
export function UnknownState({
  title = 'Unable to determine',
  body,
}: {
  title?: string;
  body: ReactNode;
}) {
  return <StateFrame glyph="?" title={title} body={body} tone="var(--state-unknown)" />;
}

export function UnavailableState({
  title,
  body,
  action,
}: {
  title: string;
  body: ReactNode;
  action?: ReactNode;
}) {
  return <StateFrame glyph="⏻" title={title} body={body} action={action} tone="var(--health-degraded)" />;
}

/* ────────────────────────────────────────────────────────────────────────────
   Table
   ──────────────────────────────────────────────────────────────────────────── */

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Right-aligns and applies tabular figures. For counts and durations. */
  numeric?: boolean;
  width?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  empty,
}: {
  columns: ReadonlyArray<Column<T>>;
  rows: ReadonlyArray<T>;
  rowKey: (row: T, index: number) => string;
  /** Describes the table to a screen reader. Required, not optional. */
  caption: string;
  empty?: ReactNode;
}) {
  if (rows.length === 0) {
    return <>{empty ?? <EmptyState title="Nothing to show" body="This table has no rows yet." />}</>;
  }

  return (
    // The scroll container is the table's own, so a wide table never makes the
    // page scroll sideways.
    <div style={{ overflowX: 'auto', border: '1px solid var(--line-subtle)', borderRadius: 'var(--radius-md)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '32rem' }}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={{
                  textAlign: column.numeric ? 'right' : 'left',
                  padding: 'var(--space-3) var(--space-4)',
                  fontSize: 'var(--text-2xs)',
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--tracking-wide)',
                  color: 'var(--ink-tertiary)',
                  fontWeight: 'var(--weight-semibold)',
                  background: 'var(--surface-sunken)',
                  borderBottom: '1px solid var(--line-default)',
                  whiteSpace: 'nowrap',
                  width: column.width,
                }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)} style={{ borderBottom: '1px solid var(--line-subtle)' }}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  style={{
                    padding: 'var(--space-3) var(--space-4)',
                    fontSize: 'var(--text-sm)',
                    textAlign: column.numeric ? 'right' : 'left',
                    fontVariantNumeric: column.numeric ? 'tabular-nums' : 'normal',
                    fontFamily: column.numeric ? 'var(--font-mono)' : 'inherit',
                    verticalAlign: 'top',
                  }}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Tabs
   ──────────────────────────────────────────────────────────────────────────── */

export function Tabs({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: ReadonlyArray<{ id: string; label: string }>;
  active: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} style={{ display: 'flex', gap: 'var(--space-1)', borderBottom: '1px solid var(--line-subtle)' }}>
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={selected}
            // Roving tabindex: one stop for the whole tablist, arrow keys move
            // within it — the pattern assistive technology expects.
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => {
              const index = tabs.findIndex((t) => t.id === active);
              if (event.key === 'ArrowRight') onChange(tabs[(index + 1) % tabs.length]!.id);
              if (event.key === 'ArrowLeft') onChange(tabs[(index - 1 + tabs.length) % tabs.length]!.id);
            }}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${selected ? 'var(--accent)' : 'transparent'}`,
              color: selected ? 'var(--ink-primary)' : 'var(--ink-tertiary)',
              fontSize: 'var(--text-sm)',
              fontWeight: selected ? 'var(--weight-medium)' : 'var(--weight-regular)',
              cursor: 'pointer',
              marginBottom: '-1px',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Modal / Drawer
   ──────────────────────────────────────────────────────────────────────────── */

function useDismiss(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();
  const surface = useRef<HTMLDivElement>(null);
  useDismiss(open, onClose);

  useEffect(() => {
    if (open) surface.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)' as unknown as number,
        display: 'grid',
        placeItems: 'center',
        background: 'rgb(0 0 0 / 0.6)',
        padding: 'var(--space-4)',
      }}
      onClick={onClose}
    >
      <div
        ref={surface}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        style={{
          background: 'var(--surface-overlay)',
          border: '1px solid var(--line-default)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          width: 'min(34rem, 100%)',
          maxHeight: '85vh',
          overflow: 'auto',
        }}
      >
        <header style={{ padding: 'var(--space-5)', borderBottom: '1px solid var(--line-subtle)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <h2 id={titleId} style={{ fontSize: 'var(--text-md)', flex: 1 }}>
            {title}
          </h2>
          <IconButton label="Close" onClick={onClose}>
            ✕
          </IconButton>
        </header>
        <div style={{ padding: 'var(--space-5)' }}>{children}</div>
        {footer ? (
          <footer style={{ padding: 'var(--space-5)', borderTop: '1px solid var(--line-subtle)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const titleId = useId();
  useDismiss(open, onClose);
  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-drawer)' as unknown as number, display: 'flex', justifyContent: 'flex-end', background: 'rgb(0 0 0 / 0.45)' }} onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(30rem, 100%)',
          background: 'var(--surface-raised)',
          borderLeft: '1px solid var(--line-default)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
        }}
      >
        <header style={{ padding: 'var(--space-5)', borderBottom: '1px solid var(--line-subtle)', display: 'flex', gap: 'var(--space-4)', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--surface-raised)' }}>
          <h2 id={titleId} style={{ fontSize: 'var(--text-md)', flex: 1 }}>
            {title}
          </h2>
          <IconButton label="Close" onClick={onClose}>
            ✕
          </IconButton>
        </header>
        <div style={{ padding: 'var(--space-5)' }}>{children}</div>
      </aside>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Key/value, JSON, timeline
   ──────────────────────────────────────────────────────────────────────────── */

export function KeyValue({ items }: { items: ReadonlyArray<{ key: string; value: ReactNode }> }) {
  return (
    <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(7rem, auto) 1fr', gap: 'var(--space-2) var(--space-4)', margin: 0, fontSize: 'var(--text-sm)' }}>
      {items.map((item) => (
        <div key={item.key} style={{ display: 'contents' }}>
          <dt style={{ color: 'var(--ink-tertiary)', fontSize: 'var(--text-xs)' }}>{item.key}</dt>
          <dd style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', wordBreak: 'break-word' }}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A collapsed JSON inspector.
 *
 * Collapsed by default and explicitly secondary: §14 of the brief calls a wall
 * of raw JSON the thing DevTools should not be. It is the escape hatch beneath a
 * structured view, never the view itself.
 */
export function JsonViewer({ data, label = 'Raw response' }: { data: unknown; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details open={open} onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}>
      <summary style={{ cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)', padding: 'var(--space-2) 0' }}>
        {label}
      </summary>
      <pre
        style={{
          margin: 0,
          padding: 'var(--space-4)',
          background: 'var(--surface-sunken)',
          border: '1px solid var(--line-subtle)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 'var(--text-2xs)',
          fontFamily: 'var(--font-mono)',
          overflowX: 'auto',
          maxHeight: '24rem',
        }}
      >
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  );
}

export function Timeline({
  entries,
}: {
  entries: ReadonlyArray<{ id: string; time: string; title: string; detail?: ReactNode; tone?: string }>;
}) {
  return (
    <ol style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {entries.map((entry) => (
        <li key={entry.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 'var(--space-4)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: entry.tone ?? 'var(--accent)', marginTop: 5 }} />
            <span aria-hidden="true" style={{ flex: 1, width: 1, background: 'var(--line-default)', marginTop: 4 }} />
          </div>
          <div style={{ paddingBottom: 'var(--space-2)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--ink-tertiary)' }}>{entry.time}</div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', marginTop: 2 }}>{entry.title}</div>
            {entry.detail ? <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-secondary)', marginTop: 'var(--space-1)' }}>{entry.detail}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Tooltip
   ──────────────────────────────────────────────────────────────────────────── */

export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  const id = useId();
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <span aria-describedby={id}>{children}</span>
      <span role="tooltip" id={id} className="sr-only">
        {text}
      </span>
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Toast — used for session expiry and other out-of-band messages
   ──────────────────────────────────────────────────────────────────────────── */

interface ToastMessage {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

const ToastContext = createContext<(text: string, tone?: 'info' | 'error') => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const push = useCallback((text: string, tone: 'info' | 'error' = 'info') => {
    const id = Date.now() + Math.random();
    setMessages((current) => [...current, { id, text, tone }]);
    window.setTimeout(() => setMessages((current) => current.filter((m) => m.id !== id)), 6000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        // `aria-live` so a screen reader is told rather than shown. Session
        // expiry is the case that matters: it happens without a user action.
        aria-live="polite"
        style={{ position: 'fixed', bottom: 'var(--space-6)', right: 'var(--space-6)', zIndex: 'var(--z-toast)' as unknown as number, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
      >
        {messages.map((message) => (
          <div
            key={message.id}
            style={{
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--surface-overlay)',
              border: `1px solid ${message.tone === 'error' ? 'var(--state-absent)' : 'var(--line-default)'}`,
              borderRadius: 'var(--radius-sm)',
              boxShadow: 'var(--shadow-md)',
              fontSize: 'var(--text-sm)',
              maxWidth: '24rem',
            }}
          >
            {message.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

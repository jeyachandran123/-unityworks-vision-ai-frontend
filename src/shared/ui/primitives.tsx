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
 *
 * ### Where the look lives
 *
 * In `global.css`, under "THE BUILDING BLOCKS", as classes. Hover, press, focus
 * and disabled have no inline form, and a button that cannot show any of them
 * reads as a picture of a button. The components here own structure, roles and
 * behaviour; a caller's `style` still wins over the class, so a one-off layout
 * adjustment never needs a new variant.
 */

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type RefObject,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { describeState, type ObservationState, STATES } from '@shared/semantics/observation';
import {
  ControlIcons,
  Icon,
  SeverityIcons,
  StateIcons,
  StatusIcons,
  type LucideIcon,
} from './icons';

/* ────────────────────────────────────────────────────────────────────────────
   Button
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * `danger` is the quiet red — a destructive act offered among others, drawn
 * so it is never mistaken for the safe one. `destructive` is the solid red,
 * for the one button that commits it: the confirm in a confirmation dialog.
 */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'destructive' | 'success';
type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders a busy state and blocks the click. Never a bare spinner swap. */
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, icon, children, disabled, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      // `aria-busy` rather than swapping the label: a screen reader announces
      // the state change without the accessible name disappearing mid-action.
      aria-busy={loading || undefined}
      className={className ? `uwv-btn ${className}` : 'uwv-btn'}
      data-variant={variant}
      data-size={size}
      {...rest}
    >
      {loading ? <Spinner size={13} /> : icon}
      {children}
    </button>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(function IconButton(
  { label, children, ...rest },
  ref,
) {
  return (
    <Button
      ref={ref}
      variant="ghost"
      size="sm"
      // An icon-only control with no accessible name is invisible to a screen
      // reader, which is the most common accessibility defect in dashboards.
      aria-label={label}
      title={label}
      data-icon-only="true"
      {...rest}
    >
      {children}
    </Button>
  );
});

/* ────────────────────────────────────────────────────────────────────────────
   Spinner, skeleton
   ──────────────────────────────────────────────────────────────────────────── */

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: '2px solid color-mix(in srgb, currentColor 22%, transparent)',
        borderTopColor: 'currentColor',
        display: 'inline-block',
        flexShrink: 0,
        animation: 'uwv-spin 720ms linear infinite',
      }}
    />
  );
}

/**
 * The shape of what is coming. Never a number, never a word: a skeleton that
 * held a plausible value would be the fabricated reading this product forbids.
 */
export function Skeleton({
  width = '100%',
  height = '0.875rem',
  radius,
  style,
}: {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  radius?: CSSProperties['borderRadius'];
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      className="uwv-skeleton"
      style={{ width, height, borderRadius: radius, ...style }}
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

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <span id={id} className="uwv-field-error">
      <Icon icon={StatusIcons.error} size="inline" />
      {children}
    </span>
  );
}

export function Input({ label, hint, error, id, className, ...rest }: FieldProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  return (
    <div className="uwv-field">
      <label htmlFor={inputId} className="uwv-field-label">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined}
        className={className ? `uwv-control ${className}` : 'uwv-control'}
        {...rest}
      />
      {hint ? <span id={hintId} className="uwv-field-hint">{hint}</span> : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

export function Textarea({
  label,
  hint,
  error,
  id,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string; error?: string }) {
  const generated = useId();
  const fieldId = id ?? generated;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  return (
    <div className="uwv-field">
      <label htmlFor={fieldId} className="uwv-field-label">
        {label}
      </label>
      <textarea
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined}
        className={className ? `uwv-control ${className}` : 'uwv-control'}
        {...rest}
      />
      {hint ? <span id={hintId} className="uwv-field-hint">{hint}</span> : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

export function Select({
  label,
  hint,
  id,
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: ReactNode }) {
  const generated = useId();
  const selectId = id ?? generated;
  const hintId = `${selectId}-hint`;
  return (
    <div className="uwv-field">
      <label htmlFor={selectId} className="uwv-field-label">
        {label}
      </label>
      {/* A real `<select>` with a drawn chevron: still labelled, still keyboard
          operable, and the option list is still the platform's own. */}
      <select
        id={selectId}
        // Wired with `aria-describedby` rather than merely printed underneath,
        // so the explanation is read out with the control instead of being
        // discovered afterwards by somebody who has already chosen wrong.
        aria-describedby={hint ? hintId : undefined}
        className={className ? `uwv-control ${className}` : 'uwv-control'}
        {...rest}
      >
        {children}
      </select>
      {hint ? (
        <p id={hintId} className="uwv-field-hint">
          {hint}
        </p>
      ) : null}
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
    <span className="uwv-badge" data-tone={tone} data-mono={mono ? 'true' : undefined}>
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
        gap: 'var(--space-1)',
        height: '1.375rem',
        padding: '0 var(--space-2)',
        borderRadius: 'var(--radius-full)',
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--weight-semibold)',
        background: descriptor.washVar,
        color: descriptor.colorVar,
        border: `1px solid color-mix(in srgb, ${descriptor.colorVar} 40%, transparent)`,
        whiteSpace: 'nowrap',
      }}
      title={descriptor.description}
    >
      {/* The icon replaces the character the descriptor carries, but the
          descriptor keeps its `glyph` field: `shared/semantics/observation.ts`
          owns which states exist and what each one means, and a rendering
          choice does not belong in that module. */}
      <Icon icon={StateIcons[descriptor.state]} size="inline" />
      {showLabel ? descriptor.label : null}
      {/* The word is always available to assistive technology even when the
          visual label is suppressed for density. */}
      {showLabel ? null : <span className="sr-only">{descriptor.label}</span>}
    </span>
  );
}

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * Severity, as a descending run of shapes: an octagon, a triangle, a filled
 * circle, a ringed dot and an `i` fall in weight as the rank falls, and stay
 * legible in grayscale.
 */
const SEVERITY_ICON: Record<Severity, LucideIcon> = SeverityIcons;

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        fontSize: 'var(--text-xs)',
        textTransform: 'capitalize',
        fontWeight: 'var(--weight-semibold)',
        color: `var(--severity-${severity})`,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon icon={SEVERITY_ICON[severity]} size="inline" />
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
        fontWeight: 'var(--weight-medium)',
        color: 'var(--ink-secondary)',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: tone === 'idle' ? 'transparent' : `var(--health-${tone})`,
          // A ring rather than a fill for `idle`, so the four tones differ in
          // shape as well as colour; a soft halo on the others.
          boxShadow:
            tone === 'idle'
              ? 'inset 0 0 0 1.5px var(--health-idle)'
              : `0 0 0 3px color-mix(in srgb, var(--health-${tone}) 18%, transparent)`,
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
    <section className="uwv-card" style={{ padding: padded ? 'var(--space-5)' : 0, ...style }}>
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
        <h2 className="uwv-section-title">{title}</h2>
        {description ? (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-tertiary)', marginTop: 'var(--space-1)' }}>
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>{actions}</div> : null}
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
        alignItems: 'flex-end',
        gap: 'var(--space-4)',
        marginBottom: 'var(--space-8)',
      }}
    >
      <div style={{ flex: 1, minWidth: '16rem' }}>
        <h1 className="uwv-page-title">{title}</h1>
        {description ? (
          <p style={{ color: 'var(--ink-secondary)', marginTop: 'var(--space-2)', maxWidth: 'var(--measure)' }}>
            {description}
          </p>
        ) : null}
        {meta ? <div style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>{meta}</div> : null}
      </div>
      {actions ? <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>{actions}</div> : null}
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
      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)', color: 'var(--ink-tertiary)' }}>
        {label}
      </div>
      <div
        style={{
          fontSize: unavailable ? 'var(--text-2xl)' : 'var(--text-3xl)',
          fontFamily: 'var(--font-display)',
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 'var(--weight-semibold)',
          letterSpacing: 'var(--tracking-display)',
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
  icon,
  title,
  body,
  action,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  body: ReactNode;
  action?: ReactNode;
  tone: string;
}) {
  return (
    /* An absence is a caption, not a region: aligned to the text column, glyph
     * beside the title, and as tall as its own sentences. A page whose dominant
     * mass is its empty states reads as broken even when it is correct. */
    <div role="status" className="uwv-state">
      <span className="uwv-state-icon" style={{ color: tone }}>
        <Icon icon={icon} size="control" />
      </span>
      <span className="uwv-state-title">{title}</span>
      <div className="uwv-state-body">{body}</div>
      {action ? <div className="uwv-state-action">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-12)',
        color: 'var(--accent)',
      }}
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
  return <StateFrame icon={StatusIcons.empty} title={title} body={body} action={action} tone="var(--accent)" />;
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
      icon={StatusIcons.error}
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
      action={onRetry ? <Button size="sm" onClick={onRetry}>Try again</Button> : undefined}
    />
  );
}

/**
 * "We could not determine this." Distinct from empty and from error, and drawn
 * in the UNKNOWN token so uncertainty reads the same way everywhere.
 */
export function UnknownState({
  title = 'Unable to determine',
  body,
}: {
  title?: string;
  body: ReactNode;
}) {
  return <StateFrame icon={StatusIcons.unknown} title={title} body={body} tone="var(--state-unknown)" />;
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
  return <StateFrame icon={StatusIcons.unavailable} title={title} body={body} action={action} tone="var(--health-degraded)" />;
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
    <div className="uwv-table-wrap">
      <table className="uwv-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                data-numeric={column.numeric ? 'true' : undefined}
                style={column.width ? { width: column.width } : undefined}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)}>
              {columns.map((column) => (
                <td key={column.key} data-numeric={column.numeric ? 'true' : undefined}>
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
   Tabs, and the segmented control
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
    <div role="tablist" aria-label={label} className="uwv-tabs">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            className="uwv-tab"
            aria-selected={selected}
            // Roving tabindex: one stop for the whole tablist, arrow keys move
            // within it — the pattern assistive technology expects.
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => {
              const index = tabs.findIndex((t) => t.id === active);
              if (event.key === 'ArrowRight') onChange(tabs[(index + 1) % tabs.length]!.id);
              if (event.key === 'ArrowLeft') onChange(tabs[(index - 1 + tabs.length) % tabs.length]!.id);
              if (event.key === 'Home') onChange(tabs[0]!.id);
              if (event.key === 'End') onChange(tabs[tabs.length - 1]!.id);
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A choice among a few options that filters what is on screen — a period, a
 * window, a view. Not tabs: nothing is hidden behind it, so it is a group of
 * pressed/unpressed buttons rather than a tablist.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="uwv-tabs">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className="uwv-tab"
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Modal / Drawer
   ──────────────────────────────────────────────────────────────────────────── */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Escape closes, Tab stays inside, and focus goes back where it came from.
 *
 * A dialog that lets Tab walk out into the page behind it is a dialog a
 * keyboard user can lose, and one that drops focus on close leaves them at the
 * top of the document.
 */
export function useDialogBehaviour(open: boolean, onClose: () => void, surface: RefObject<HTMLElement | null>) {
  // Held in a ref so the effect below runs on open and close only. Callers pass
  // an inline arrow, which is a new function every render; depending on it
  // re-ran the effect on each keystroke inside the dialog, and every re-run
  // pulled focus back to the surface — so a field could not be typed into.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    surface.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close.current();
        return;
      }
      if (event.key !== 'Tab' || !surface.current) return;
      const items = [...surface.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === surface.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) previous.focus();
    };
  }, [open, surface]);
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** One line under the title: what this dialog is for. */
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** `sm` for a question, `md` for a short form, `lg` for a form with sections. */
  size?: 'sm' | 'md' | 'lg';
}) {
  const titleId = useId();
  const descriptionId = useId();
  const surface = useRef<HTMLDivElement>(null);
  useDialogBehaviour(open, onClose, surface);

  if (!open) return null;

  return (
    <div
      className="uwv-scrim"
      style={{
        zIndex: 'var(--z-modal)' as unknown as number,
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--space-4)',
      }}
      onClick={onClose}
    >
      <div
        ref={surface}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="uwv-dialog"
        data-size={size}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="uwv-dialog-head">
          <div className="uwv-dialog-heading">
            <h2 id={titleId} className="uwv-dialog-title">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="uwv-dialog-description">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <Icon icon={ControlIcons.close} />
          </IconButton>
        </header>
        <div className="uwv-dialog-body">{children}</div>
        {footer ? <footer className="uwv-dialog-foot">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();
  const surface = useRef<HTMLElement>(null);
  useDialogBehaviour(open, onClose, surface);
  if (!open) return null;

  return (
    <div
      className="uwv-scrim"
      style={{ zIndex: 'var(--z-drawer)' as unknown as number, display: 'flex', justifyContent: 'flex-end' }}
      onClick={onClose}
    >
      <aside
        ref={surface}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="uwv-drawer"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="uwv-dialog-head">
          <div className="uwv-dialog-heading">
            <h2 id={titleId} className="uwv-dialog-title">
              {title}
            </h2>
            {description ? <p className="uwv-dialog-description">{description}</p> : null}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <Icon icon={ControlIcons.close} />
          </IconButton>
        </header>
        <div className="uwv-dialog-body" style={{ flex: 1 }}>
          {children}
        </div>
        {footer ? <footer className="uwv-dialog-foot">{footer}</footer> : null}
      </aside>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Key/value, JSON, timeline
   ──────────────────────────────────────────────────────────────────────────── */

export function KeyValue({ items }: { items: ReadonlyArray<{ key: string; value: ReactNode }> }) {
  return (
    <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(7rem, auto) 1fr', gap: 'var(--space-3) var(--space-5)', margin: 0, fontSize: 'var(--text-sm)' }}>
      {items.map((item) => (
        <div key={item.key} style={{ display: 'contents' }}>
          <dt style={{ color: 'var(--ink-tertiary)', fontSize: 'var(--text-xs)', paddingTop: 1 }}>{item.key}</dt>
          <dd style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--ink-primary)', wordBreak: 'break-word' }}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A collapsed JSON inspector.
 *
 * Collapsed by default and explicitly secondary: a wall of raw JSON is the
 * thing DevTools should not be. It is the escape hatch beneath a structured
 * view, never the view itself.
 */
export function JsonViewer({ data, label = 'Raw response' }: { data: unknown; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details open={open} onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}>
      <summary style={{ cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)', color: 'var(--ink-tertiary)', padding: 'var(--space-2) 0' }}>
        {label}
      </summary>
      <pre
        style={{
          margin: 0,
          padding: 'var(--space-4)',
          background: 'var(--surface-sunken)',
          border: '1px solid var(--line-subtle)',
          borderRadius: 'var(--radius-md)',
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
            <span
              aria-hidden="true"
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: entry.tone ?? 'var(--accent)',
                boxShadow: `0 0 0 3px color-mix(in srgb, ${entry.tone ?? 'var(--accent)'} 18%, transparent)`,
                marginTop: 5,
              }}
            />
            <span aria-hidden="true" style={{ flex: 1, width: 1, background: 'var(--line-default)', marginTop: 6 }} />
          </div>
          <div style={{ paddingBottom: 'var(--space-2)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--ink-tertiary)' }}>{entry.time}</div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', marginTop: 2 }}>{entry.title}</div>
            {entry.detail ? <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-secondary)', marginTop: 'var(--space-1)' }}>{entry.detail}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Toast

   Lives in `./feedback` with the rest of what the product says back after an
   act; re-exported here so the provider composition and older imports keep
   one address. The tooltip moved to `./overlays`, beside everything else
   that floats.
   ──────────────────────────────────────────────────────────────────────────── */

export { ToastProvider, useToast } from './feedback';

/**
 * Forms as workflows, not as a label, a box and a button repeated.
 *
 * - `FormSection` is the settings layout: what a group of fields is *for* on
 *   the left, the fields on the right. Each section says why it exists.
 * - `FormActions` is the one place a form's Save and Cancel live, and it knows
 *   whether there is anything to save.
 * - `useUnsavedChanges` warns before a reload or a closed tab throws work away.
 *
 * The controls here are the ones a native element cannot draw well on its own:
 * a checkbox that can be half-ticked, a switch, a choice drawn as cards, a
 * search box with a shortcut, and a searchable list.
 */

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

import { ActionIcons, DataIcons, Icon, type LucideIcon } from './icons';
import { Popover } from './overlays';
import { Button, Spinner } from './primitives';

/* ────────────────────────────────────────────────────────────────────────────
   Checkbox, switch
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * A checkbox that can also say "some". `indeterminate` is a DOM property, not
 * an attribute, so it is set on the element after render.
 */
export function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  hideLabel = false,
  description,
  disabled,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type'> & {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  /** Keep the label for assistive technology only — a row-selection box. */
  hideLabel?: boolean;
  description?: ReactNode;
}) {
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (box.current) box.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);

  return (
    <label className="uwv-check" data-disabled={disabled ? 'true' : undefined}>
      <input
        ref={box}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-checked={indeterminate && !checked ? 'mixed' : checked}
        onChange={(event) => onChange(event.target.checked)}
        {...rest}
      />
      <span className={hideLabel ? 'sr-only' : 'uwv-check-text'}>
        <span className="uwv-check-label">{label}</span>
        {description && !hideLabel ? <span className="uwv-check-description">{description}</span> : null}
      </span>
    </label>
  );
}

/** An on/off setting that takes effect as a setting, not as an act. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="uwv-switch-row">
      <span className="uwv-check-text">
        <label htmlFor={id} className="uwv-check-label">
          {label}
        </label>
        {description ? <span className="uwv-check-description">{description}</span> : null}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className="uwv-switch"
        onClick={() => onChange(!checked)}
      >
        <span className="uwv-switch-thumb" />
      </button>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Radio cards
   ──────────────────────────────────────────────────────────────────────────── */

export interface RadioCardOption<T extends string> {
  value: T;
  label: string;
  description?: ReactNode;
  icon?: LucideIcon;
  /** A choice with consequences is drawn in the danger colour when chosen. */
  tone?: 'default' | 'warning' | 'danger';
  disabled?: boolean;
}

/**
 * A choice among a few options where each needs a sentence to be understood —
 * an organization's lifecycle. Real radio inputs, so arrows move between them
 * and the group is one tab stop.
 */
export function RadioCards<T extends string>({
  legend,
  name,
  value,
  onChange,
  options,
  columns = 3,
}: {
  legend: string;
  name: string;
  value: T | null;
  onChange: (next: T) => void;
  options: ReadonlyArray<RadioCardOption<T>>;
  columns?: number;
}) {
  return (
    <fieldset className="uwv-radio-cards" style={{ ['--columns' as string]: columns }}>
      <legend className="uwv-field-label">{legend}</legend>
      <div className="uwv-radio-cards-grid">
        {options.map((option) => (
          <label
            key={option.value}
            className="uwv-radio-card"
            data-tone={option.tone ?? 'default'}
            data-checked={value === option.value ? 'true' : undefined}
            data-disabled={option.disabled ? 'true' : undefined}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
            />
            <span className="uwv-radio-card-head">
              {option.icon ? <Icon icon={option.icon} size="control" /> : null}
              <span className="uwv-radio-card-label">{option.label}</span>
            </span>
            {option.description ? <span className="uwv-radio-card-description">{option.description}</span> : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Search
   ──────────────────────────────────────────────────────────────────────────── */

function typingInAField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * A search box that behaves like one: an icon, a clear button, `/` to reach
 * it from anywhere on the page, Escape to empty it, and a spinner while the
 * answer is on its way.
 */
export function SearchInput({
  value,
  onChange,
  label,
  placeholder,
  busy = false,
  shortcut = true,
  width,
}: {
  value: string;
  onChange: (next: string) => void;
  /** The accessible name: "Search organizations". */
  label: string;
  placeholder?: string;
  busy?: boolean;
  /** Listen for `/`. One per page: the list the page is about. */
  shortcut?: boolean;
  width?: string;
}) {
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!shortcut) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (typingInAField(event.target)) return;
      event.preventDefault();
      field.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [shortcut]);

  return (
    <div className="uwv-search" style={width ? { width } : undefined}>
      <span className="uwv-search-icon">
        {busy ? <Spinner size={13} /> : <Icon icon={DataIcons.search} size="control" />}
      </span>
      <input
        ref={field}
        type="search"
        aria-label={label}
        className="uwv-control uwv-search-input"
        value={value}
        placeholder={placeholder ?? label}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.stopPropagation();
            onChange('');
          }
        }}
      />
      {value ? (
        <button
          type="button"
          className="uwv-search-clear"
          aria-label="Clear search"
          onClick={() => {
            onChange('');
            field.current?.focus();
          }}
        >
          <Icon icon={DataIcons.clear} size="inline" />
        </button>
      ) : shortcut ? (
        <kbd className="uwv-kbd uwv-search-kbd" aria-hidden="true">
          /
        </kbd>
      ) : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Password
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * A password field that can be read back before it is sent, and that says so
 * when Caps Lock is on — the two reasons a correct password is typed wrong.
 * The toggle only changes how this field is drawn; nothing is stored.
 */
export function PasswordInput({
  label,
  hint,
  error,
  id,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string; hint?: string; error?: string }) {
  const generated = useId();
  const fieldId = id ?? generated;
  const hintId = `${fieldId}-hint`;
  const [shown, setShown] = useState(false);
  const [caps, setCaps] = useState(false);
  const readCaps = (event: ReactKeyboardEvent<HTMLInputElement>) => setCaps(event.getModifierState('CapsLock'));

  return (
    <div className="uwv-field">
      <label htmlFor={fieldId} className="uwv-field-label">
        {label}
      </label>
      <div className="uwv-search">
        <input
          id={fieldId}
          type={shown ? 'text' : 'password'}
          className="uwv-control"
          style={{ paddingRight: '2.5rem' }}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || caps ? hintId : undefined}
          onKeyUp={readCaps}
          onKeyDown={readCaps}
          {...rest}
        />
        <button
          type="button"
          className="uwv-search-clear"
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          onClick={() => setShown((value) => !value)}
        >
          <Icon icon={shown ? ActionIcons.hide : ActionIcons.view} size="control" />
        </button>
      </div>
      {caps ? (
        <span id={hintId} className="uwv-field-hint" style={{ color: 'var(--feedback-warning)' }}>
          Caps Lock is on.
        </span>
      ) : hint ? (
        <span id={hintId} className="uwv-field-hint">
          {hint}
        </span>
      ) : null}
      {error ? <span className="uwv-field-error">{error}</span> : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Combobox
   ──────────────────────────────────────────────────────────────────────────── */

export interface ComboboxOption {
  value: string;
  label: string;
  /** A second line: an email beside a name. */
  detail?: string;
}

/**
 * Choose one from a long list by typing. Replaces a `<select>` of two hundred
 * people, which nobody can find anybody in.
 *
 * The ARIA 1.2 combobox pattern: the input owns focus, ↑/↓ move the active
 * option (`aria-activedescendant`), Enter chooses, Escape closes.
 */
export function Combobox({
  label,
  options,
  value,
  onChange,
  placeholder = 'Search…',
  hint,
  disabled,
  emptyText = 'Nobody matches',
}: {
  label: string;
  options: ReadonlyArray<ComboboxOption>;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  hint?: ReactNode;
  disabled?: boolean;
  emptyText?: string;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const hintId = `${id}-hint`;
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const chosen = options.find((option) => option.value === value);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const found = needle
      ? options.filter((o) => `${o.label} ${o.detail ?? ''}`.toLowerCase().includes(needle))
      : options;
    return found.slice(0, 50);
  }, [options, query]);

  useEffect(() => setActive(0), [query]);

  const choose = (option: ComboboxOption) => {
    onChange(option.value);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="uwv-field">
      <label htmlFor={id} className="uwv-field-label">
        {label}
      </label>
      <div className="uwv-search">
        <span className="uwv-search-icon">
          <Icon icon={DataIcons.search} size="control" />
        </span>
        <input
          ref={input}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
          aria-describedby={hint ? hintId : undefined}
          className="uwv-control uwv-search-input"
          disabled={disabled}
          autoComplete="off"
          placeholder={chosen ? chosen.label : placeholder}
          value={open ? query : chosen ? chosen.label : query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            if (value) onChange('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(i + 1, matches.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (event.key === 'Enter' && open && matches[active]) {
              event.preventDefault();
              choose(matches[active]!);
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        {value ? (
          <button
            type="button"
            className="uwv-search-clear"
            aria-label={`Clear ${label}`}
            onClick={() => {
              onChange('');
              setQuery('');
              input.current?.focus();
            }}
          >
            <Icon icon={DataIcons.clear} size="inline" />
          </button>
        ) : null}
      </div>
      {hint ? (
        <span id={hintId} className="uwv-field-hint">
          {hint}
        </span>
      ) : null}
      <Popover
        open={open && !disabled}
        onClose={() => setOpen(false)}
        anchor={input}
        label={label}
        role="listbox"
        id={listId}
        initialFocus={false}
        width="min(26rem, calc(100vw - 2rem))"
      >
        {matches.length === 0 ? (
          <div className="uwv-menu-empty">{emptyText}</div>
        ) : (
          matches.map((option, index) => (
            <div
              key={option.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className="uwv-option"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
              onMouseEnter={() => setActive(index)}
            >
              <span className="uwv-option-label">{option.label}</span>
              {option.detail ? <span className="uwv-option-detail">{option.detail}</span> : null}
            </div>
          ))
        )}
      </Popover>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Form composition
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * A group of settings that belong together, with the reason they exist.
 *
 * Two columns where there is room — the explanation on the left is read once,
 * the fields on the right are used often — and one column on a phone.
 */
export function FormSection({
  title,
  description,
  children,
  tone,
  id,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** `danger` for the section that ends things. */
  tone?: 'danger';
  id?: string;
}) {
  const headingId = useId();
  return (
    <section className="uwv-form-section" data-tone={tone} aria-labelledby={headingId} id={id}>
      <div className="uwv-form-section-intro">
        <h3 id={headingId} className="uwv-form-section-title">
          {title}
        </h3>
        {description ? <div className="uwv-form-section-description">{description}</div> : null}
      </div>
      <div className="uwv-form-section-body">{children}</div>
    </section>
  );
}

/**
 * Save and Cancel, in the same place on every form.
 *
 * Says "Unsaved changes" while there are some, and holds Save until there are:
 * a Save that can be pressed on an untouched form is a button that lies about
 * what it will do.
 */
export function FormActions({
  dirty,
  saving = false,
  onCancel,
  saveLabel = 'Save changes',
  cancelLabel = 'Discard',
  submit = true,
  disabled = false,
  status,
}: {
  dirty: boolean;
  saving?: boolean;
  onCancel?: () => void;
  saveLabel?: string;
  cancelLabel?: string;
  /** Render Save as the form's submit button. */
  submit?: boolean;
  disabled?: boolean;
  /** Replaces the dirty note: a validation message, or "Saved". */
  status?: ReactNode;
}) {
  return (
    <div className="uwv-form-actions">
      <span className="uwv-form-actions-status" aria-live="polite">
        {status ?? (dirty ? <span className="uwv-dirty-dot">Unsaved changes</span> : null)}
      </span>
      {onCancel ? (
        <Button variant="ghost" onClick={onCancel} disabled={!dirty || saving}>
          {cancelLabel}
        </Button>
      ) : null}
      <Button variant="primary" type={submit ? 'submit' : 'button'} loading={saving} disabled={!dirty || disabled}>
        {saveLabel}
      </Button>
    </div>
  );
}

/**
 * Warns before a reload, a closed tab or a typed address throws away an edit.
 *
 * In-app links are not intercepted: this router is a `BrowserRouter`, which
 * has no navigation blocker, and patching link clicks would break more than it
 * saves. Forms keep their edits in the page, and Discard asks.
 */
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
}

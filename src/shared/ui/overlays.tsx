/**
 * Things that float: popovers, menus, confirmations, tooltips.
 *
 * ### Why everything here is portalled
 *
 * A row's menu lives inside a table, and a table lives inside a scroll box so a
 * wide one never pushes the page sideways. A menu positioned inside that box is
 * clipped by it — the bottom row's menu would open into nothing. So every
 * floating surface renders into `document.body` and is placed against its
 * trigger with fixed coordinates, flipping above when there is no room below.
 *
 * ### Why confirmations are a component and a hook
 *
 * `ConfirmDialog` is controlled, for acts that take a moment and can fail: it
 * stays open while the request runs and shows the failure inside itself, so
 * nobody is left wondering whether the archive happened. `useConfirm()` is for
 * the instant ones — "Sign out?" — where a promise reads better than state.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

import { ActionIcons, ControlIcons, DataIcons, FeedbackIcons, Icon, type LucideIcon } from './icons';
import { Button, IconButton, Input, useDialogBehaviour } from './primitives';

/* ────────────────────────────────────────────────────────────────────────────
   Placement
   ──────────────────────────────────────────────────────────────────────────── */

const EDGE = 8;
const GAP = 6;

/**
 * Fixed coordinates for a surface beside its anchor: below by default, above
 * when below would leave the viewport, and never past either side.
 */
function useAnchoredPosition(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
  floating: RefObject<HTMLElement | null>,
  align: 'start' | 'end',
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({ position: 'fixed', top: 0, left: 0, visibility: 'hidden' });

  const place = useCallback(() => {
    const a = anchor.current?.getBoundingClientRect();
    const f = floating.current;
    if (!a || !f) return;
    const width = f.offsetWidth;
    const height = f.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = a.bottom + GAP;
    if (top + height > vh - EDGE && a.top - GAP - height > EDGE) top = a.top - GAP - height;
    let left = align === 'end' ? a.right - width : a.left;
    left = Math.min(Math.max(left, EDGE), Math.max(vw - width - EDGE, EDGE));
    setStyle({ position: 'fixed', top, left, visibility: 'visible' });
  }, [anchor, floating, align]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    // Capture, so a scroll inside any container — the table's own box — moves it too.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  return style;
}

/* ────────────────────────────────────────────────────────────────────────────
   Popover
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * A surface anchored to a control: a filter, a column chooser. Closes on
 * Escape (focus returns to the trigger) and on a press anywhere outside it.
 */
export function Popover({
  open,
  onClose,
  anchor,
  children,
  label,
  align = 'start',
  width,
  role = 'dialog',
  id,
  onKeyDown,
  initialFocus = true,
}: {
  open: boolean;
  onClose: () => void;
  anchor: RefObject<HTMLElement | null>;
  children: ReactNode;
  label: string;
  align?: 'start' | 'end';
  width?: CSSProperties['width'];
  role?: 'dialog' | 'menu' | 'listbox';
  id?: string;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  /** Move focus into the surface on open. Menus manage their own. */
  initialFocus?: boolean;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const style = useAnchoredPosition(open, anchor, surface, align);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    if (initialFocus) {
      const first = surface.current?.querySelector<HTMLElement>(
        'input:not([disabled]), button:not([disabled]), [tabindex="0"]',
      );
      (first ?? surface.current)?.focus();
    }
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (surface.current?.contains(target) || anchor.current?.contains(target)) return;
      close.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close.current();
      anchor.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, anchor, initialFocus]);

  if (!open) return null;
  return createPortal(
    <div
      ref={surface}
      id={id}
      role={role}
      aria-label={label}
      tabIndex={-1}
      className="uwv-popover"
      style={{ ...style, width }}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>,
    document.body,
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Dropdown menu
   ──────────────────────────────────────────────────────────────────────────── */

export type MenuEntry =
  | {
      type?: 'item';
      id: string;
      label: string;
      onSelect: () => void;
      icon?: LucideIcon;
      /** A short note under the label: why it is disabled, or what it does. */
      hint?: string;
      disabled?: boolean;
      /** A destructive act. Drawn apart, in the danger colour. */
      tone?: 'danger';
    }
  | { type: 'separator'; id: string }
  | { type: 'label'; id: string; label: string };

type MenuItem = Extract<MenuEntry, { label: string; onSelect: () => void }>;

function isItem(entry: MenuEntry): entry is MenuItem {
  return entry.type === undefined || entry.type === 'item';
}

/**
 * A button that opens a list of acts. The pattern every "•••" in the product
 * uses.
 *
 * Keyboard, as assistive technology expects of `role="menu"`: Enter, Space or
 * ↓ opens on the first item and ↑ on the last; arrows, Home and End move; a
 * letter jumps to the next item starting with it; Escape closes and puts focus
 * back on the button; Tab closes and moves on.
 */
export function DropdownMenu({
  label,
  items,
  trigger,
  triggerLabel,
  variant = 'ghost',
  size = 'sm',
  align = 'end',
  icon = DataIcons.more,
}: {
  /** The accessible name of the trigger: "Actions for PCC2". */
  label: string;
  items: ReadonlyArray<MenuEntry>;
  /** Replaces the default trigger's contents entirely. */
  trigger?: ReactNode;
  /** A visible label; without one the trigger is icon-only. */
  triggerLabel?: ReactNode;
  variant?: 'ghost' | 'secondary' | 'primary';
  size?: 'sm' | 'md';
  align?: 'start' | 'end';
  icon?: LucideIcon;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const actionable = items.filter(isItem);

  const focusAt = (index: number) => {
    const enabled = actionable.map((item, i) => (item.disabled ? -1 : i)).filter((i) => i >= 0);
    if (enabled.length === 0) return;
    const wrapped = ((index % actionable.length) + actionable.length) % actionable.length;
    const target = enabled.includes(wrapped) ? wrapped : enabled[0]!;
    refs.current[target]?.focus();
  };

  const openAt = (where: 'first' | 'last') => {
    setOpen(true);
    window.requestAnimationFrame(() => focusAt(where === 'first' ? 0 : actionable.length - 1));
  };

  const close = (restore = true) => {
    setOpen(false);
    if (restore) button.current?.focus();
  };

  const onMenuKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const current = refs.current.findIndex((el) => el === document.activeElement);
    const step = (from: number, delta: number) => {
      for (let n = 1; n <= actionable.length; n += 1) {
        const i = (((from + delta * n) % actionable.length) + actionable.length) % actionable.length;
        if (!actionable[i]!.disabled) return i;
      }
      return from;
    };
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      refs.current[step(current, 1)]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      refs.current[step(current < 0 ? 0 : current, -1)]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      refs.current[step(-1, 1)]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      refs.current[step(0, -1)]?.focus();
    } else if (event.key === 'Tab') {
      close(false);
    } else if (event.key.length === 1 && /\S/.test(event.key)) {
      const letter = event.key.toLowerCase();
      for (let n = 1; n <= actionable.length; n += 1) {
        const i = (current + n) % actionable.length;
        const item = actionable[i]!;
        if (!item.disabled && item.label.toLowerCase().startsWith(letter)) {
          refs.current[i]?.focus();
          break;
        }
      }
    }
  };

  let itemIndex = -1;

  return (
    <>
      <Button
        ref={button}
        variant={variant}
        size={size}
        aria-label={triggerLabel ? undefined : label}
        title={triggerLabel ? undefined : label}
        data-icon-only={triggerLabel || trigger ? undefined : 'true'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : openAt('first'))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            openAt('first');
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            openAt('last');
          }
        }}
      >
        {trigger ?? (
          <>
            {triggerLabel ?? <Icon icon={icon} />}
            {triggerLabel ? <Icon icon={DataIcons.expand} size="inline" /> : null}
          </>
        )}
      </Button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchor={button}
        label={label}
        role="menu"
        id={menuId}
        align={align}
        initialFocus={false}
        onKeyDown={onMenuKey}
      >
        {items.map((entry) => {
          if (entry.type === 'separator') return <div key={entry.id} role="separator" className="uwv-menu-rule" />;
          if (entry.type === 'label')
            return (
              <div key={entry.id} className="uwv-menu-label" role="presentation">
                {entry.label}
              </div>
            );
          itemIndex += 1;
          const index = itemIndex;
          return (
            <button
              key={entry.id}
              ref={(el) => {
                refs.current[index] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="uwv-menu-item"
              data-tone={entry.tone}
              disabled={entry.disabled}
              aria-disabled={entry.disabled || undefined}
              onClick={() => {
                close();
                entry.onSelect();
              }}
            >
              {entry.icon ? <Icon icon={entry.icon} size="control" /> : null}
              <span className="uwv-menu-item-text">
                <span>{entry.label}</span>
                {entry.hint ? <span className="uwv-menu-item-hint">{entry.hint}</span> : null}
              </span>
            </button>
          );
        })}
      </Popover>
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Confirmation
   ──────────────────────────────────────────────────────────────────────────── */

export type ConfirmTone = 'default' | 'warning' | 'danger';

const CONFIRM_ICON: Record<ConfirmTone, LucideIcon> = {
  default: FeedbackIcons.info,
  warning: FeedbackIcons.warning,
  danger: FeedbackIcons.warning,
};

/**
 * "Are you sure?", designed.
 *
 * - An `alertdialog`, not a form in a frame: one mark, the question, what will
 *   happen, and the two answers — no header bar, no footer band.
 * - The title is the question with the object's name in it — "Archive PCC2?" —
 *   so the dialog cannot be confirmed without the object having been read.
 * - The body says what will happen and whether it can be undone; `detail` is
 *   the thing it happens to, shown as a card (who is signing out, and where).
 * - The confirming button names the act ("Archive organization"), never "OK".
 * - A dangerous one opens with focus on **Cancel**, so an Enter pressed out of
 *   habit does nothing; `requireText` adds a typed name for the irreversible.
 *   Any other opens on the dialog itself — Tab reaches either answer, and no
 *   button wears a focus ring nobody asked for.
 * - While the request runs the dialog stays, cannot be dismissed, and shows a
 *   failure inside itself.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  detail,
  icon,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onCancel,
  pending = false,
  error,
  requireText,
  confirmDisabled = false,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  /** The object the act is about, drawn as a card under the sentence. */
  detail?: ReactNode;
  /** Replaces the tone's own mark: sign-out shows a door, not a warning. */
  icon?: LucideIcon;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
  /** A failure from the last attempt, shown inside the dialog. */
  error?: ReactNode;
  /** The object's name, typed to arm the button. For what cannot be undone. */
  requireText?: string;
  /** Extra fields in the body (a reason) can hold the button too. */
  confirmDisabled?: boolean;
}) {
  const [typed, setTyped] = useState('');
  const surface = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useDialogBehaviour(
    open,
    () => {
      if (!pending) onCancel();
    },
    surface,
  );

  useEffect(() => {
    if (!open) {
      setTyped('');
      return;
    }
    // After the dialog has taken focus for itself.
    const frame = window.requestAnimationFrame(() => {
      if (requireText) return;
      if (tone === 'danger') cancel.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, tone, requireText]);

  if (!open) return null;

  const armed = !requireText || typed.trim() === requireText;

  return createPortal(
    <div
      className="uwv-scrim uwv-confirm-scrim"
      onClick={() => {
        if (!pending) onCancel();
      }}
    >
      <div
        ref={surface}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={children ? bodyId : undefined}
        tabIndex={-1}
        className="uwv-confirm-dialog"
        data-tone={tone}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="uwv-confirm-close" aria-label="Close" disabled={pending} onClick={onCancel}>
          <Icon icon={ControlIcons.close} size="control" />
        </button>

        <span className="uwv-confirm-badge" aria-hidden="true">
          <Icon icon={icon ?? CONFIRM_ICON[tone]} size="feature" />
        </span>

        <h2 id={titleId} className="uwv-confirm-title">
          {title}
        </h2>
        {children ? (
          <div id={bodyId} className="uwv-confirm-text">
            {children}
          </div>
        ) : null}
        {detail ? <div className="uwv-confirm-detail">{detail}</div> : null}

        {requireText ? (
          <div className="uwv-confirm-field">
            <Input
              label={`Type ${requireText} to confirm`}
              value={typed}
              placeholder={requireText}
              autoComplete="off"
              spellCheck={false}
              autoFocus
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && armed && !confirmDisabled && !pending) onConfirm();
              }}
            />
          </div>
        ) : null}

        {error ? (
          <div role="alert" className="uwv-confirm-error">
            <Icon icon={FeedbackIcons.error} size="inline" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="uwv-confirm-actions">
          <Button ref={cancel} variant="secondary" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'destructive' : 'primary'}
            loading={pending}
            disabled={!armed || confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  /** The object the act is about, as a card. */
  detail?: ReactNode;
  icon?: LucideIcon;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  requireText?: string;
}

const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(() =>
  Promise.resolve(false),
);

/** `const ok = await confirm({...})`. Resolves `false` on cancel or Escape. */
export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);

  const ask = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setRequest({ ...options, resolve });
      }),
    [],
  );

  const settle = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <ConfirmDialog
        open={request !== null}
        title={request?.title ?? ''}
        confirmLabel={request?.confirmLabel ?? 'Confirm'}
        cancelLabel={request?.cancelLabel}
        tone={request?.tone}
        icon={request?.icon}
        detail={request?.detail}
        requireText={request?.requireText}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      >
        {request?.body}
      </ConfirmDialog>
    </ConfirmContext.Provider>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Tooltip
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * A short label on hover or keyboard focus.
 *
 * The words are always in the document — hidden, and wired to the child with
 * `aria-describedby` — so a screen reader has them whether or not anybody
 * hovered. The bubble is the sighted copy, drawn after a short delay so a
 * pointer passing over a toolbar does not set off a flicker of them.
 */
export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const style = useAnchoredPosition(shown, anchor, bubble, 'start');

  const show = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShown(true), 350);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setShown(false);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <span
      ref={anchor}
      style={{ display: 'inline-flex' }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={(event) => {
        if (event.key === 'Escape') hide();
      }}
    >
      <span aria-describedby={id} style={{ display: 'inline-flex' }}>
        {children}
      </span>
      <span role="tooltip" id={id} className="sr-only">
        {text}
      </span>
      {shown
        ? createPortal(
            <span ref={bubble} aria-hidden="true" className="uwv-tooltip" style={style}>
              {text}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Copy to clipboard
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Copies an identifier. Says it did, in place, for two seconds — the toast
 * would be a bigger announcement than the act deserves.
 */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <IconButton
      label={copied ? 'Copied' : label}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(
          () => setCopied(true),
          () => setCopied(false),
        );
      }}
    >
      <Icon icon={copied ? ActionIcons.copied : ActionIcons.copy} />
    </IconButton>
  );
}

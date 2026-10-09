/**
 * Feedback: what the product says back after somebody acts.
 *
 * Two shapes, for two different moments:
 *
 * - **Toast** — the result of an act the person just took ("Organization
 *   renamed"), or something that happened without one (the session ended). It
 *   arrives at the edge, stays long enough to be read, and leaves. Never the
 *   only place a failure that blocks work is reported: a form that failed also
 *   says so beside the form.
 * - **Callout** — a standing condition of the thing on screen ("This
 *   organization is suspended"). It stays as long as the condition does, in the
 *   flow of the page, next to what it is about.
 *
 * ### Announced, not only shown
 *
 * The visible stack is not itself a live region. Two hidden regions beside it
 * carry the words — polite for success, information and warnings, assertive for
 * failures — because a stack that is a live region re-announces every toast
 * still in it each time another arrives.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { ControlIcons, FeedbackIcons, Icon, type LucideIcon } from './icons';

export type FeedbackTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  /** A second line: what happens next, or what was affected. */
  description?: ReactNode;
  /** One follow-up act — "View", "Undo" where the product genuinely supports it. */
  action?: { label: string; onClick: () => void };
  /** Milliseconds before it leaves on its own. `0` keeps it until dismissed. */
  duration?: number;
}

interface ToastRecord extends ToastOptions {
  id: number;
  title: string;
  tone: FeedbackTone;
  leaving?: boolean;
}

/**
 * Long enough to read the words twice. Failures stay longest: they are the
 * ones somebody may need to act on, and the one most likely to arrive while
 * their eyes are elsewhere.
 */
const DURATION: Record<FeedbackTone, number> = {
  success: 4500,
  info: 5500,
  warning: 7000,
  error: 9000,
};

/** More than this and the oldest goes: a stack taller than the screen is noise. */
const MAX_VISIBLE = 4;
const EXIT_MS = 160;

/**
 * The notifier. Callable the way it always was — `toast('Saved')`,
 * `toast('Failed', 'error')` — and with one method per tone for the rest.
 */
export interface Notify {
  (title: string, tone?: FeedbackTone, options?: ToastOptions): number;
  success: (title: string, options?: ToastOptions) => number;
  error: (title: string, options?: ToastOptions) => number;
  warning: (title: string, options?: ToastOptions) => number;
  info: (title: string, options?: ToastOptions) => number;
  dismiss: (id: number) => void;
}

function inert(): Notify {
  const fn = (() => 0) as unknown as Notify;
  fn.success = () => 0;
  fn.error = () => 0;
  fn.warning = () => 0;
  fn.info = () => 0;
  fn.dismiss = () => {};
  return fn;
}

const ToastContext = createContext<Notify>(inert());

export function useToast(): Notify {
  return useContext(ToastContext);
}

const TONE_ICON: Record<FeedbackTone, LucideIcon> = FeedbackIcons;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const [polite, setPolite] = useState('');
  const [assertive, setAssertive] = useState('');
  const timers = useRef(new Map<number, { timer: number; remaining: number; started: number }>());
  const nextId = useRef(1);

  const remove = useCallback((id: number) => {
    const entry = timers.current.get(id);
    if (entry) window.clearTimeout(entry.timer);
    timers.current.delete(id);
    // Marked first, removed a beat later, so it leaves rather than vanishes.
    setToasts((current) => current.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), EXIT_MS);
  }, []);

  const schedule = useCallback(
    (id: number, ms: number) => {
      if (ms <= 0) return;
      const timer = window.setTimeout(() => remove(id), ms);
      timers.current.set(id, { timer, remaining: ms, started: Date.now() });
    },
    [remove],
  );

  const push = useCallback(
    (title: string, tone: FeedbackTone = 'info', options: ToastOptions = {}) => {
      const id = nextId.current++;
      const record: ToastRecord = { id, title, tone, ...options };
      setToasts((current) => [...current, record]);
      // The words go to the announcer as well. A trailing space toggled per
      // message makes an identical second message still count as a change.
      const words = typeof options.description === 'string' ? `${title}. ${options.description}` : title;
      if (tone === 'error') setAssertive((previous) => (previous === words ? `${words} ` : words));
      else setPolite((previous) => (previous === words ? `${words} ` : words));
      schedule(id, options.duration ?? (options.action ? Math.max(DURATION[tone], 8000) : DURATION[tone]));
      return id;
    },
    [remove, schedule],
  );

  const pause = useCallback((id: number) => {
    const entry = timers.current.get(id);
    if (!entry) return;
    window.clearTimeout(entry.timer);
    entry.remaining = Math.max(entry.remaining - (Date.now() - entry.started), 1000);
  }, []);

  const resume = useCallback(
    (id: number) => {
      const entry = timers.current.get(id);
      if (!entry) return;
      timers.current.delete(id);
      schedule(id, entry.remaining);
    },
    [schedule],
  );

  // The oldest gives way once the stack is full.
  useEffect(() => {
    const live = toasts.filter((t) => !t.leaving);
    if (live.length > MAX_VISIBLE) remove(live[0]!.id);
  }, [toasts, remove]);

  useEffect(() => {
    const live = timers.current;
    return () => live.forEach((entry) => window.clearTimeout(entry.timer));
  }, []);

  const notify = useMemo(() => {
    const fn = ((title: string, tone?: FeedbackTone, options?: ToastOptions) =>
      push(title, tone, options)) as Notify;
    fn.success = (title, options) => push(title, 'success', options);
    fn.error = (title, options) => push(title, 'error', options);
    fn.warning = (title, options) => push(title, 'warning', options);
    fn.info = (title, options) => push(title, 'info', options);
    fn.dismiss = remove;
    return fn;
  }, [push, remove]);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {polite}
      </div>
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {assertive}
      </div>
      <section aria-label="Notifications" className="uwv-toasts">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="uwv-toast"
            data-tone={toast.tone}
            data-leaving={toast.leaving ? 'true' : undefined}
            onMouseEnter={() => pause(toast.id)}
            onMouseLeave={() => resume(toast.id)}
            onFocus={() => pause(toast.id)}
            onBlur={() => resume(toast.id)}
          >
            <span className="uwv-toast-icon">
              <Icon icon={TONE_ICON[toast.tone]} size="control" />
            </span>
            <div className="uwv-toast-text">
              <p className="uwv-toast-title">{toast.title}</p>
              {toast.description ? <div className="uwv-toast-description">{toast.description}</div> : null}
              {toast.action ? (
                <button
                  type="button"
                  className="uwv-toast-action"
                  onClick={() => {
                    toast.action!.onClick();
                    remove(toast.id);
                  }}
                >
                  {toast.action.label}
                </button>
              ) : null}
            </div>
            <button
              type="button"
              className="uwv-toast-close"
              aria-label="Dismiss notification"
              onClick={() => remove(toast.id)}
            >
              <Icon icon={ControlIcons.close} size="inline" />
            </button>
          </div>
        ))}
      </section>
    </ToastContext.Provider>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Callout
   ──────────────────────────────────────────────────────────────────────────── */

export type CalloutTone = FeedbackTone | 'neutral';

const CALLOUT_ICON: Record<CalloutTone, LucideIcon> = { ...FeedbackIcons, neutral: FeedbackIcons.info };

/**
 * A standing condition, said next to the thing it is about.
 *
 * `banner` spans the content column and sits under a page header — "this
 * organization is suspended" — while the default sits inside a section.
 * `role="alert"` only for an error that appeared because of what somebody just
 * did; a condition that was already true when the page opened is not news.
 */
export function Callout({
  tone = 'info',
  title,
  children,
  actions,
  icon,
  variant = 'inline',
  live = false,
}: {
  tone?: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  icon?: LucideIcon;
  variant?: 'inline' | 'banner';
  /** Announce it: set when the callout appeared as the result of an act. */
  live?: boolean;
}) {
  return (
    <div
      className="uwv-callout"
      data-tone={tone}
      data-variant={variant}
      role={live ? (tone === 'error' ? 'alert' : 'status') : undefined}
    >
      <span className="uwv-callout-icon">
        <Icon icon={icon ?? CALLOUT_ICON[tone]} size="control" />
      </span>
      <div className="uwv-callout-text">
        {title ? <p className="uwv-callout-title">{title}</p> : null}
        {children ? <div className="uwv-callout-body">{children}</div> : null}
      </div>
      {actions ? <div className="uwv-callout-actions">{actions}</div> : null}
    </div>
  );
}

/**
 * Progress through a known number of steps or units. Refuses to draw a bar it
 * has no denominator for — the same rule `Meter` keeps.
 */
export function Progress({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label: string;
}) {
  if (!(max > 0)) return null;
  const share = Math.min(Math.max(value / max, 0), 1);
  return (
    <div
      className="uwv-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <span className="uwv-progress-fill" style={{ width: `${share * 100}%` }} />
    </div>
  );
}

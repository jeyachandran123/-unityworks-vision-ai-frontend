/**
 * Theme resolution.
 *
 * The token system already carried two complete palettes over one contract.
 * Nothing ever set `data-theme`, so the light half was unreachable: fifty lines
 * of tuned tokens that never applied, while `color-scheme: dark light` told the
 * browser to render native controls and scrollbars light on a light-preferring
 * machine. The application was dark and its scrollbars were not.
 *
 * This module is the missing switch, and nothing more. It introduces no second
 * token system and no palette of its own — it decides which of the two existing
 * ones is active and writes that decision to the root element.
 *
 * ### Why there is no provider
 *
 * A context provider would have to be added to `Providers`, and the test
 * harness composes its providers by hand rather than using that component. Every
 * existing suite would then render an AppShell whose theme hook had no provider
 * above it. An external store read through `useSyncExternalStore` needs no
 * ancestor, so the shell can read the theme from anywhere without a single
 * existing test changing shape.
 *
 * ### Precedence
 *
 *   an explicit choice the operator saved   →  wins, always
 *   otherwise                               →  whatever the OS asks for
 *   otherwise (no `matchMedia` at all)      →  dark
 *
 * Dark is the floor rather than light because this runs on kitchen-wall
 * displays that are on all shift.
 */

import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';

/** `system` is the absence of a choice, not a third palette. */
export type ThemePreference = Theme | 'system';

export const THEME_STORAGE_KEY = 'uwv.theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

export interface ThemeState {
  /** What the operator asked for, including "I have not asked". */
  readonly preference: ThemePreference;
  /** What that resolves to right now. Always concrete. */
  readonly theme: Theme;
}

/* ── environment probes, each survivable ──────────────────────────────────── */

/**
 * The stored choice, or `system`.
 *
 * Wrapped because `localStorage` is not merely empty in a locked-down browser —
 * reading it throws. A theme preference is not worth a blank application.
 */
function readStoredPreference(): ThemePreference {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return raw === 'dark' || raw === 'light' ? raw : 'system';
  } catch {
    return 'system';
  }
}

function writeStoredPreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // A browser that refuses storage still gets the theme for this session; it
    // simply will not remember it. That is a better outcome than throwing.
  }
}

/** `matchMedia` is absent under jsdom, so every use of it is guarded. */
function mediaQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  try {
    return window.matchMedia(DARK_QUERY);
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  const query = mediaQuery();
  if (!query) return 'dark';
  return query.matches ? 'dark' : 'light';
}

export function resolveTheme(preference: ThemePreference): Theme {
  return preference === 'system' ? systemTheme() : preference;
}

/* ── the store ────────────────────────────────────────────────────────────── */

const listeners = new Set<() => void>();

/**
 * The live preference, with storage as its backing rather than its source.
 *
 * Held in memory because a browser that refuses `localStorage` throws on read
 * as well as on write. Recomputing from storage each time meant that under
 * those conditions an explicit choice was written nowhere, read back as
 * `system` on the very next line, and silently discarded — the toggle moved and
 * nothing happened. Storage now only has to survive a reload; it does not have
 * to work for the control to work.
 */
let preference: ThemePreference = readStoredPreference();

function compute(): ThemeState {
  return { preference, theme: resolveTheme(preference) };
}

let snapshot: ThemeState = compute();

/**
 * Write the decision to the root element.
 *
 * `data-theme` is the selector the existing token file already keys the light
 * palette on; this function is the only thing in the application that sets it.
 * `color-scheme` is set alongside it so native scrollbars, form controls and the
 * canvas ground follow the application rather than the OS — the mismatch that
 * made the unreachable light theme actively harmful rather than merely dead.
 */
function apply(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;
}

/** Recompute, and notify only if something actually moved. */
function refresh(): void {
  const next = compute();
  if (next.preference === snapshot.preference && next.theme === snapshot.theme) return;
  snapshot = next;
  apply(snapshot.theme);
  for (const listener of listeners) listener();
}

let mediaListenerAttached = false;

/**
 * Follow the OS while — and only while — no explicit choice is stored.
 *
 * The listener stays attached for the life of the page rather than being added
 * and removed as the preference changes: `refresh` already ignores a system
 * change that cannot affect the resolved theme, so an operator who has chosen
 * light does not flicker when their machine switches at sunset.
 */
function attachMediaListener(): void {
  if (mediaListenerAttached) return;
  const query = mediaQuery();
  if (!query) return;
  mediaListenerAttached = true;
  const onChange = () => refresh();
  if (typeof query.addEventListener === 'function') query.addEventListener('change', onChange);
  else if (typeof query.addListener === 'function') query.addListener(onChange);
}

function subscribe(listener: () => void): () => void {
  attachMediaListener();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ThemeState {
  return snapshot;
}

/* ── public surface ───────────────────────────────────────────────────────── */

export function getThemeState(): ThemeState {
  return snapshot;
}

/**
 * Record an explicit choice, or hand control back to the OS with `system`.
 *
 * Applied before the notification so the DOM and React never disagree about
 * which theme is live.
 */
export function setThemePreference(next: ThemePreference): void {
  preference = next;
  writeStoredPreference(next);
  refresh();
}

/** The two-state control the shell exposes. Always ends on an explicit choice. */
export function toggleTheme(): Theme {
  const next: Theme = snapshot.theme === 'dark' ? 'light' : 'dark';
  setThemePreference(next);
  return next;
}

/**
 * Apply the stored decision at startup.
 *
 * The inline script in `index.html` has normally done this already, before
 * first paint. This call is what keeps the two agreeing when the script is
 * absent — a test, or a host that strips inline script.
 */
export function initTheme(): void {
  preference = readStoredPreference();
  snapshot = compute();
  apply(snapshot.theme);
}

export function useTheme(): ThemeState & {
  setPreference: (preference: ThemePreference) => void;
  toggle: () => void;
} {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const setPreference = useCallback((preference: ThemePreference) => {
    setThemePreference(preference);
  }, []);
  const toggle = useCallback(() => {
    toggleTheme();
  }, []);
  return { ...state, setPreference, toggle };
}

/**
 * Drop every cached decision and re-read the environment.
 *
 * Test-only, and named to match `__resetClient` in the API client: module-scoped
 * state that outlives a single case would otherwise make the theme matrix lie
 * about which preference it was actually reading.
 */
export function __resetTheme(): void {
  preference = readStoredPreference();
  snapshot = compute();
  apply(snapshot.theme);
}

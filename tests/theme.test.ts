/**
 * Theme resolution, as a matrix.
 *
 * The light palette existed in `tokens.css` from the beginning and was
 * unreachable because nothing ever set `data-theme`. These cases pin the
 * precedence that now decides it, in both directions:
 *
 *   an explicit saved choice  →  wins over the OS, always
 *   no saved choice           →  follows the OS
 *   no `matchMedia` at all    →  dark, the floor for a wall display
 *
 * `matchMedia` is stubbed rather than assumed: jsdom does not implement it, and
 * a suite that let the absence stand would be testing the fallback in every
 * case and the OS preference in none of them.
 *
 * Deliberately free of React. The store needs no provider, so the matrix can be
 * driven directly — which keeps this file cheap enough to run beside the ten
 * existing suites without competing with them for a worker. The one test that
 * does need the rendered shell lives in `shell.test.tsx`, next to the other
 * shell accessibility cases.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  __resetTheme,
  getThemeState,
  setThemePreference,
  THEME_STORAGE_KEY,
  toggleTheme,
} from '@shared/theme/theme';

/** A `matchMedia` that answers the dark query with `prefersDark`. */
function stubMatchMedia(prefersDark: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('dark') ? prefersDark : !prefersDark,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

/** What the root element actually carries — the only thing the CSS keys on. */
function appliedTheme(): string | null {
  return document.documentElement.getAttribute('data-theme');
}

/** A fresh page load: the module re-reads storage and the OS from scratch. */
function reload(): void {
  __resetTheme();
}

describe('theme resolution', () => {
  it('Case A — no saved preference and an OS asking for dark resolves dark', () => {
    stubMatchMedia(true);
    reload();

    expect(getThemeState().preference).toBe('system');
    expect(getThemeState().theme).toBe('dark');
    expect(appliedTheme()).toBe('dark');
  });

  it('Case B — no saved preference and an OS asking for light resolves light', () => {
    stubMatchMedia(false);
    reload();

    expect(getThemeState().preference).toBe('system');
    expect(getThemeState().theme).toBe('light');
    expect(appliedTheme()).toBe('light');
  });

  it('Case C — a saved dark choice beats an OS asking for light', () => {
    stubMatchMedia(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    reload();

    expect(getThemeState().preference).toBe('dark');
    expect(appliedTheme()).toBe('dark');
  });

  it('Case D — a saved light choice beats an OS asking for dark', () => {
    stubMatchMedia(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    reload();

    expect(getThemeState().preference).toBe('light');
    expect(appliedTheme()).toBe('light');
  });

  it('Case E — toggling from dark reaches light', () => {
    stubMatchMedia(true);
    reload();
    expect(appliedTheme()).toBe('dark');

    toggleTheme();

    expect(getThemeState().theme).toBe('light');
    expect(appliedTheme()).toBe('light');
  });

  it('Case F — toggling from light reaches dark', () => {
    stubMatchMedia(false);
    reload();
    expect(appliedTheme()).toBe('light');

    toggleTheme();

    expect(getThemeState().theme).toBe('dark');
    expect(appliedTheme()).toBe('dark');
  });

  it('Case G — an explicit choice survives a reload and still beats the OS', () => {
    stubMatchMedia(true);
    reload();

    // The operator chooses light on a machine that asks for dark.
    toggleTheme();
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    // Same machine, same OS preference, new page load.
    reload();

    expect(getThemeState().preference).toBe('light');
    expect(getThemeState().theme).toBe('light');
    expect(appliedTheme()).toBe('light');
  });

  it('toggling turns an unstated preference into a stored one', () => {
    stubMatchMedia(true);
    reload();
    expect(getThemeState().preference).toBe('system');

    toggleTheme();

    expect(getThemeState().preference).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('handing control back to the OS clears the stored choice', () => {
    stubMatchMedia(false);
    setThemePreference('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    setThemePreference('system');

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(getThemeState().theme).toBe('light');
  });

  it('falls back to dark when the browser reports no preference at all', () => {
    // No `matchMedia` stub: this is jsdom's own environment, and the same shape
    // as a browser too old to answer the query.
    reload();

    expect(getThemeState().theme).toBe('dark');
    expect(appliedTheme()).toBe('dark');
  });

  it('survives a browser that refuses localStorage', () => {
    stubMatchMedia(false);
    const denied = () => {
      throw new Error('storage is blocked');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied);

    // Resolution still happens; it simply cannot be remembered. The preference
    // is held in memory precisely so the control still works here.
    expect(() => reload()).not.toThrow();
    expect(getThemeState().theme).toBe('light');
    expect(() => setThemePreference('dark')).not.toThrow();
    expect(appliedTheme()).toBe('dark');
  });
});

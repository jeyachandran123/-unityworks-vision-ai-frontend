import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { __resetClient } from '@shared/api/client';

afterEach(() => {
  cleanup();
  // Module-scoped client state — the access token and any in-flight refresh —
  // would otherwise leak between cases and make the single-flight tests lie.
  __resetClient();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

// jsdom ships no WebSocket. Tests that exercise the live connection inject a
// fake through `socketFactory`; this stub only stops the connection provider
// from throwing in the many tests that do not care about it.
if (!('WebSocket' in globalThis)) {
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = class {
    close(): void {}
    send(): void {}
  };
}

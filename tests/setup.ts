import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup, configure } from '@testing-library/react';
import { __resetClient } from '@shared/api/client';

/**
 * How long `findBy*` and `waitFor` may wait.
 *
 * Testing Library's default is **one second**, which is a statement about
 * machine speed rather than about the product. Stage 3's screens compose more
 * per route — the Command Center issues three independent queries and renders a
 * tile field; the wall renders a meter over six stream states — and under
 * vitest's parallel pool that pushed a number of one-second waits over the edge
 * while every one of them passed when its file was run alone.
 *
 * Raising this weakens nothing. Every assertion still has to become true; it is
 * only given a realistic amount of wall-clock to do it in on a loaded machine.
 * A genuine regression still fails, eight seconds later.
 *
 * Eight rather than one because of one case in particular: the DevTools route
 * is a `React.lazy` chunk, and vitest transforms it on demand the first time a
 * test navigates there. That single import takes 4-6s on this machine with the file
 * run alone, and considerably longer when eight worker threads are competing
 * for the same cores — so any bound below it is a bound on the toolchain
 * rather than on the application. It is deliberately not pre-warmed here,
 * because one of the tests asserts that the chunk is loaded lazily.
 */
configure({ asyncUtilTimeout: 8000 });

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

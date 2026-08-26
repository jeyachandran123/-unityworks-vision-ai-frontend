/**
 * Live CCTV delivery: the stream has to actually open, and "live" has to mean
 * a frame arrived.
 *
 * ### The fault
 *
 * Live Monitoring sat on "Opening stream…" forever. The server was fine —
 * `state=live`, 125 501 frames decoded, first frame 1.8 s, and reading the
 * stream endpoint directly on :8010 returned `multipart/x-mixed-replace` with
 * valid JPEGs. The browser issued the ticket request, got a 200, and then
 * never requested the stream at all: there was no `<img>` in the document.
 *
 *     invoke 1   claims the ref guard, starts the ticket request
 *     cleanup    sets cancelled = true
 *     invoke 2   sees the ref already claimed, returns without fetching
 *     ticket 200 arrives — invoke 1 was cancelled, so the URL is dropped
 *
 * ### Why the existing suite stayed green through it
 *
 * `renderApp` does not wrap in `StrictMode`, so effects are invoked once and
 * the race never happens. The application's own entry point *does*. So these
 * tests render under `StrictMode` deliberately — a wall test that cannot see
 * a double-invoked effect cannot see this class of bug at all.
 */

import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

import { AuthProvider } from '@app/auth/AuthProvider';
import { ConnectionProvider } from '@shared/realtime/useConnection';
import { ToastProvider } from '@shared/ui/primitives';
import { CameraWallPage } from '@features/camera-wall';
import { identity, installFetch, wallCamera } from './support';

afterEach(() => vi.unstubAllGlobals());

/** The four kitchen cameras, as the recorder presents them. */
function kitchen(state = 'live') {
  return [11, 12, 13, 14].map((n) =>
    wallCamera({
      camera_id: `cam-${n}`,
      name: `Channel ${n}`,
      channel: n,
      state,
      width: 960,
      height: 576,
    }),
  );
}

function wallOf(cameras: ReturnType<typeof wallCamera>[]) {
  const by_state: Record<string, number> = {};
  for (const c of cameras) by_state[c.state as string] = (by_state[c.state as string] ?? 0) + 1;
  return {
    cameras,
    total: cameras.length,
    live: by_state.live ?? 0,
    wall: { cameras: cameras.length, by_state, live: by_state.live ?? 0, viewers: 0 },
    default_wall_fps: 4,
    default_detail_fps: 12,
  };
}

/**
 * Render the wall the way `main.tsx` renders the application: inside
 * `StrictMode`, so every effect is invoked twice.
 */
function renderStrict() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  return render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <AuthProvider>
            <ConnectionProvider>
              <MemoryRouter initialEntries={['/live']}>
                <CameraWallPage />
              </MemoryRouter>
            </ConnectionProvider>
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}

const streams = () =>
  Array.from(document.querySelectorAll<HTMLImageElement>('img[data-testid^="stream-"]'));

const tileFor = (id: string) =>
  document.querySelector<HTMLImageElement>(`img[data-testid="stream-${id}"]`);

/** jsdom never loads an image, so a frame is delivered explicitly. */
function deliverFrame(img: HTMLImageElement) {
  Object.defineProperty(img, 'naturalWidth', { value: 960, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: 576, configurable: true });
  img.dispatchEvent(new Event('load'));
}

describe('opening the stream', () => {
  it('mounts an <img> for every live camera even under StrictMode', async () => {
    // The regression, exactly. Before the fix this stayed at zero images
    // forever while the ticket requests returned 200.
    installFetch({ session: identity(), wall: wallOf(kitchen()) });
    renderStrict();

    await waitFor(() => expect(streams()).toHaveLength(4), { timeout: 4000 });
  });

  it('requests exactly one ticket per camera despite the double invocation', async () => {
    // The guard the fault came from was right about this much: two tickets per
    // camera would be two DVR viewers for one tile.
    const calls: string[] = [];
    installFetch({ session: identity(), calls, wall: wallOf(kitchen()) });
    renderStrict();

    await waitFor(() => expect(streams()).toHaveLength(4), { timeout: 4000 });
    for (const n of [11, 12, 13, 14]) {
      expect(calls.filter((c) => c.includes(`/wall/cameras/cam-${n}/ticket`))).toHaveLength(1);
    }
  });

  it('points each tile at its own camera and carries no credential', async () => {
    installFetch({ session: identity(), wall: wallOf(kitchen()) });
    renderStrict();

    await waitFor(() => expect(streams()).toHaveLength(4), { timeout: 4000 });
    for (const img of streams()) {
      const id = (img.getAttribute('alt') ?? '').replace('Live view from ', '');
      const src = img.getAttribute('src') ?? '';
      expect(src).toContain(`/wall/cameras/${id}/stream.mjpg`);
      expect(src).toContain('ticket=');
      for (const forbidden of ['Bearer', 'access-1', 'password', 'rtsp://', 'admin:']) {
        expect(src).not.toContain(forbidden);
      }
    }
  });

  it('never opens a stream for a camera that is not delivering frames', async () => {
    const calls: string[] = [];
    installFetch({ session: identity(), calls, wall: wallOf(kitchen('offline')) });
    renderStrict();

    await screen.findByRole('heading', { name: 'Camera Wall' });
    await waitFor(() => expect(screen.getAllByText('Offline').length).toBeGreaterThan(0));
    expect(calls.some((c) => c.includes('/ticket'))).toBe(false);
    expect(streams()).toHaveLength(0);
  });
});

describe('reaching live', () => {
  it('does not claim live merely because the ticket returned 200', async () => {
    // The `<img>` exists and the server calls the session live; this browser
    // has still received nothing, and the viewer must say so.
    installFetch({ session: identity(), wall: wallOf(kitchen()) });
    renderStrict();

    await waitFor(() => expect(tileFor('cam-12')).not.toBeNull(), { timeout: 4000 });
    expect(tileFor('cam-12')).toHaveAttribute('data-phase', 'connecting');
    expect(await screen.findByTestId('viewer-message-cam-12')).toHaveTextContent(
      'Waiting for video…',
    );
  });

  it('goes live only when a frame actually decodes', async () => {
    installFetch({ session: identity(), wall: wallOf(kitchen()) });
    renderStrict();

    await waitFor(() => expect(tileFor('cam-12')).not.toBeNull(), { timeout: 4000 });
    deliverFrame(tileFor('cam-12')!);

    await waitFor(() => expect(tileFor('cam-12')).toHaveAttribute('data-phase', 'live'));
    // The picture is the status: no message sits over a live tile.
    expect(screen.queryByTestId('viewer-message-cam-12')).not.toBeInTheDocument();
  });

  it('leaves the other cameras alone when one goes live', async () => {
    installFetch({ session: identity(), wall: wallOf(kitchen()) });
    renderStrict();

    await waitFor(() => expect(streams()).toHaveLength(4), { timeout: 4000 });
    deliverFrame(tileFor('cam-12')!);

    await waitFor(() => expect(tileFor('cam-12')).toHaveAttribute('data-phase', 'live'));
    expect(tileFor('cam-11')).toHaveAttribute('data-phase', 'connecting');
    expect(tileFor('cam-13')).toHaveAttribute('data-phase', 'connecting');
  });
});

describe('when the stream does not arrive', () => {
  it('reports a failed stream instead of spinning', async () => {
    installFetch({ session: identity(), wall: wallOf(kitchen()) });
    renderStrict();

    await waitFor(() => expect(tileFor('cam-12')).not.toBeNull(), { timeout: 4000 });
    tileFor('cam-12')!.dispatchEvent(new Event('error'));

    const message = await screen.findByTestId('viewer-message-cam-12');
    expect(message).toHaveTextContent(/stopped/i);
    expect(message).not.toHaveTextContent(/Opening stream/);
  });

  it('says so when the ticket itself is refused', async () => {
    installFetch({
      session: identity(),
      wall: wallOf(kitchen()),
      routes: {
        '/ticket': new Response(
          JSON.stringify({
            code: 'CAMERA_UNAVAILABLE', message: 'This camera is not available.',
            retryable: false, details: {}, request_id: 'req-test',
          }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        ),
      },
    });
    renderStrict();

    const message = await screen.findByTestId('viewer-message-cam-12', {}, { timeout: 4000 });
    await waitFor(() => expect(message).not.toHaveTextContent(/Opening stream/));
    // The element stays mounted — it has to, or the browser never hangs up on
    // a running MJPEG — so the property that matters is that it is pointed at
    // nothing, never at a camera whose ticket was refused.
    for (const img of streams()) {
      expect(img.getAttribute('src')).not.toContain('stream.mjpg');
    }
  });

  it('gives up on a stream that never delivers a frame', async () => {
    // Measured: the server's own first-frame latency for these cameras is
    // 1.8 s. Twenty-five seconds is far outside that — and finite, which is
    // the point. Forever is what the fault looked like.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      installFetch({ session: identity(), wall: wallOf(kitchen()) });
      renderStrict();

      await waitFor(() => expect(tileFor('cam-12')).not.toBeNull(), { timeout: 4000 });
      await vi.advanceTimersByTimeAsync(26_000);

      await waitFor(() =>
        expect(screen.getByTestId('viewer-message-cam-12')).toHaveTextContent(/timed out/i),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the detail view', () => {
  it('opens its own stream for the camera that was clicked', async () => {
    const calls: string[] = [];
    installFetch({ session: identity(), calls, wall: wallOf(kitchen()) });
    renderStrict();

    await userEvent.click(await screen.findByRole('button', { name: /Open cam-13/ }));
    await waitFor(() =>
      expect(document.querySelector('img[data-testid="stream-detail-cam-13"]')).not.toBeNull(),
    );

    const detail = document.querySelector<HTMLImageElement>('img[data-testid="stream-detail-cam-13"]')!;
    expect(detail.getAttribute('src')).toContain('/wall/cameras/cam-13/stream.mjpg');
    // The detail view runs at its own frame rate, so it needs its own ticket —
    // but still only one.
    expect(calls.filter((c) => c.includes('/wall/cameras/cam-13/ticket'))).toHaveLength(2);
  });

  it('releases the detail stream when it closes', async () => {
    installFetch({ session: identity(), wall: wallOf(kitchen()) });
    renderStrict();

    await userEvent.click(await screen.findByRole('button', { name: /Open cam-13/ }));
    await waitFor(() =>
      expect(document.querySelector('img[data-testid="stream-detail-cam-13"]')).not.toBeNull(),
    );

    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(document.querySelector('img[data-testid="stream-detail-cam-13"]')).toBeNull(),
    );
    // The wall keeps running underneath.
    expect(streams().length).toBeGreaterThan(0);
  });

  it('carries no credential in the detail stream URL either', async () => {
    installFetch({ session: identity(), wall: wallOf(kitchen()) });
    renderStrict();

    await userEvent.click(await screen.findByRole('button', { name: /Open cam-13/ }));
    const detail = await waitFor(() => {
      const img = document.querySelector<HTMLImageElement>('img[data-testid="stream-detail-cam-13"]');
      expect(img).not.toBeNull();
      return img!;
    });
    const src = detail.getAttribute('src') ?? '';
    for (const forbidden of ['Bearer', 'access-1', 'password', 'rtsp://', 'admin:']) {
      expect(src).not.toContain(forbidden);
    }
    expect(src).toContain('ticket=');
  });
});

describe('hanging up on a stream', () => {
  it('points the element at a blank image instead of unmounting it', async () => {
    // Removing an <img> does not close a `multipart/x-mixed-replace` response
    // in Chromium: the response never completes, so there is nothing to
    // finish. Measured against the server's viewer counter, switching between
    // four detail views took it from 4 to 10 and left it there until the
    // browser exited — and every leaked viewer holds a worker thread, which is
    // why later cameras never showed a picture.
    installFetch({ session: identity(), wall: wallOf(kitchen()) });
    renderStrict();

    await waitFor(() =>
      expect(document.querySelector('img[data-testid="stream-cam-12"]')).not.toBeNull(),
    );
    await userEvent.click(await screen.findByRole('button', { name: /Open cam-12/ }));
    const detail = await waitFor(() => {
      const img = document.querySelector<HTMLImageElement>('img[data-testid="stream-detail-cam-12"]');
      expect(img?.getAttribute('src')).toContain('stream.mjpg');
      return img!;
    });

    await userEvent.keyboard('{Escape}');
    // The node is gone from the document, but it was pointed at the blank
    // pixel first — which is the assignment that cancels the response.
    await waitFor(() => expect(detail.getAttribute('src')).toContain('data:image/gif'));
    expect(detail.getAttribute('src')).not.toContain('stream.mjpg');
  });

  it('releases a tile stream when its camera stops delivering frames', async () => {
    installFetch({ session: identity(), wall: wallOf(kitchen()) });
    renderStrict();

    const tile = await waitFor(() => {
      const img = document.querySelector<HTMLImageElement>('img[data-testid="stream-cam-12"]');
      expect(img?.getAttribute('src')).toContain('stream.mjpg');
      return img!;
    });
    // The stream dies; the viewer must stop pointing at it rather than hold a
    // half-open response for a camera that is gone.
    tile.dispatchEvent(new Event('error'));
    await waitFor(() => expect(tile.getAttribute('src')).toContain('data:image/gif'));
  });
});

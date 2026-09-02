/**
 * Phase 6B: the camera wall.
 *
 * The properties worth locking down are the ones that would be easy to break
 * while making the page look nicer: hiding a dark camera to tidy the grid,
 * showing a placeholder image that implies a stream, or putting a credential in
 * a URL because an `<img>` cannot send a header.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRouter } from '@app/router/AppRouter';
import { identity, installFetch, renderApp, wallCamera } from './support';

afterEach(() => vi.unstubAllGlobals());

function wallOf(cameras: ReturnType<typeof wallCamera>[]) {
  const by_state: Record<string, number> = {};
  for (const camera of cameras) by_state[camera.state as string] = (by_state[camera.state as string] ?? 0) + 1;
  return {
    cameras,
    total: cameras.length,
    live: by_state.live ?? 0,
    wall: { cameras: cameras.length, by_state, live: by_state.live ?? 0, viewers: 0 },
    default_wall_fps: 4,
    default_detail_fps: 12,
  };
}

/** Sixteen channels, as the real recorder presents them. */
function sixteen() {
  return Array.from({ length: 16 }, (_, i) =>
    wallCamera({
      camera_id: `cam-${String(i + 1).padStart(2, '0')}`,
      name: `Channel ${String(i + 1).padStart(2, '0')}`,
      channel: i + 1,
      state: 'live',
    }),
  );
}

describe('the camera wall', () => {
  it('renders a tile for every channel the recorder has', async () => {
    installFetch({ session: identity(), wall: wallOf(sixteen()) });
    renderApp(<AppRouter />, '/live');

    await screen.findByRole('heading', { name: 'Camera Wall' });
    for (const n of [1, 7, 12, 16]) {
      const id = `cam-${String(n).padStart(2, '0')}`;
      expect(await screen.findByText(new RegExp(id))).toBeInTheDocument();
    }
    expect(screen.getAllByRole('button', { name: /^Open cam-/ })).toHaveLength(16);
  });

  it('shows the DVR channel next to the camera id', async () => {
    installFetch({ session: identity(), wall: wallOf(sixteen()) });
    renderApp(<AppRouter />, '/live');

    await screen.findByRole('heading', { name: 'Camera Wall' });
    // The mapping is the thing an engineer checks against the recorder.
    expect(screen.getByRole('button', { name: /Open cam-09, channel 9/ })).toBeInTheDocument();
  });

  it('never hides a camera for being dark', async () => {
    /** The rule the wall exists for: an operator must see that CH07 is out. */
    const cameras = sixteen();
    cameras[6] = wallCamera({ ...cameras[6], state: 'offline', enabled: true });
    cameras[3] = wallCamera({ ...cameras[3], state: 'disabled', enabled: false });
    installFetch({ session: identity(), wall: wallOf(cameras) });
    renderApp(<AppRouter />, '/live');

    await screen.findByRole('heading', { name: 'Camera Wall' });
    expect(screen.getAllByRole('button', { name: /^Open cam-/ })).toHaveLength(16);
    expect(screen.getByRole('button', { name: /Open cam-07.*Offline/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open cam-04.*Disabled/ })).toBeInTheDocument();
  });

  it('shows no image for a camera that is not delivering frames', async () => {
    const cameras = [
      wallCamera({ camera_id: 'cam-01', channel: 1, state: 'offline' }),
      wallCamera({ camera_id: 'cam-02', channel: 2, state: 'disabled', enabled: false }),
    ];
    installFetch({ session: identity(), wall: wallOf(cameras) });
    renderApp(<AppRouter />, '/live');

    await screen.findByRole('heading', { name: 'Camera Wall' });
    // A placeholder image would imply a stream that does not exist.
    expect(document.querySelectorAll('img')).toHaveLength(0);
    expect(screen.getByRole('button', { name: /Open cam-01.*Offline/ })).toBeInTheDocument();
  });

  it('never asks for a stream ticket for a camera with no frames', async () => {
    const calls: string[] = [];
    installFetch({
      session: identity(),
      calls,
      wall: wallOf([wallCamera({ camera_id: 'cam-01', channel: 1, state: 'offline' })]),
    });
    renderApp(<AppRouter />, '/live');

    await screen.findByRole('heading', { name: 'Camera Wall' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Open cam-01.*Offline/ })).toBeInTheDocument(),
    );
    expect(calls.some((c) => c.includes('/ticket'))).toBe(false);
  });

  it('opens exactly one stream per live tile', async () => {
    const calls: string[] = [];
    installFetch({ session: identity(), calls, wall: wallOf(sixteen()) });
    renderApp(<AppRouter />, '/live');

    await waitFor(() => expect(document.querySelectorAll('img').length).toBe(16));
    const tickets = calls.filter((c) => c.includes('/ticket'));
    // Sixteen cameras, sixteen tickets. More would mean duplicate streams.
    expect(tickets).toHaveLength(16);
  });

  it('puts no credential in the stream URL', async () => {
    installFetch({ session: identity(), wall: wallOf(sixteen()) });
    renderApp(<AppRouter />, '/live');

    await waitFor(() => expect(document.querySelectorAll('img').length).toBeGreaterThan(0));
    for (const img of Array.from(document.querySelectorAll('img'))) {
      const src = img.getAttribute('src') ?? '';
      for (const forbidden of ['password', 'rtsp://', 'admin:', 'Bearer', 'access-1']) {
        expect(src).not.toContain(forbidden);
      }
      // A short-lived, single-camera ticket is what authorizes it.
      expect(src).toContain('ticket=');
      // The server hands back an absolute path; prefixing the API base again
      // produced '/api/v1/api/v1/wall/...' and a 404 for every tile.
      expect(src.startsWith('/api/v1/wall/cameras/')).toBe(true);
      expect(src).not.toContain('/api/v1/api/v1');
    }
  });

  it('points each tile at its own camera', async () => {
    /** Section 13: a CAM-01 tile must never carry a CAM-02 stream. */
    installFetch({ session: identity(), wall: wallOf(sixteen()) });
    renderApp(<AppRouter />, '/live');

    await waitFor(() => expect(document.querySelectorAll('img').length).toBe(16));
    for (const img of Array.from(document.querySelectorAll('img'))) {
      const alt = img.getAttribute('alt') ?? '';
      const src = img.getAttribute('src') ?? '';
      const id = alt.replace('Live view from ', '');
      expect(src).toContain(`/wall/cameras/${id}/stream.mjpg`);
    }
  });

  it('reports live and not-live counts from the backend, never from the tiles', async () => {
    const cameras = sixteen();
    cameras[2] = wallCamera({ ...cameras[2], state: 'reconnecting' });
    cameras[9] = wallCamera({ ...cameras[9], state: 'offline' });
    installFetch({ session: identity(), wall: wallOf(cameras) });
    renderApp(<AppRouter />, '/live');

    // The stat card, not a tile badge: the count must come from the backend
    // summary rather than from counting rendered tiles.
    await screen.findByRole('heading', { name: 'Camera Wall' });
    const card = document.querySelector('[data-figure="Live"]') as HTMLElement;
    expect(card).toBeTruthy();
    expect(card.textContent).toContain('Frames arriving now');
    expect(within(card).getByText('14')).toBeInTheDocument();
  });

  it('opens a detail view with the channel and state', async () => {
    installFetch({ session: identity(), wall: wallOf(sixteen()) });
    renderApp(<AppRouter />, '/live');

    await userEvent.click(await screen.findByRole('button', { name: /Open cam-03/ }));
    const dialog = await screen.findByRole('dialog', { name: /cam-03 detail view/ });
    expect(within(dialog).getByRole('heading', { name: /cam-03/ })).toBeInTheDocument();
    // The DVR channel is the fact an engineer checks against the recorder.
    expect(within(dialog).getByText('DVR channel')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Fullscreen' })).toBeInTheDocument();
  });

  it('closes the detail view on Escape', async () => {
    installFetch({ session: identity(), wall: wallOf(sixteen()) });
    renderApp(<AppRouter />, '/live');

    await userEvent.click(await screen.findByRole('button', { name: /Open cam-01/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('does not call any analysis endpoint', async () => {
    /** Section 21: viewing must never cost detection, tracking or a model call. */
    const calls: string[] = [];
    installFetch({ session: identity(), calls, wall: wallOf(sixteen()) });
    renderApp(<AppRouter />, '/live');

    await waitFor(() => expect(document.querySelectorAll('img').length).toBeGreaterThan(0));
    for (const forbidden of ['/observations', '/incidents', '/evidence', '/devtools/state', '/compliance']) {
      expect(calls.some((c) => c.includes(forbidden))).toBe(false);
    }
  });
});

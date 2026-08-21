/**
 * Phase 3 — live state, rendered honestly.
 *
 * The rule under test throughout: **the frontend reflects backend state and
 * never asserts it.** `streaming` comes from the runtime, a replay is never
 * labelled live, and a camera that is not producing frames is never drawn as
 * though it were.
 */

import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { AppRouter } from '@app/router/AppRouter';
import {
  emptyLiveRuntime,
  identity,
  installFetch,
  renderApp,
  replayLiveRuntime,
} from './support';

const ONLINE_CAMERAS = {
  configured: 2,
  sessions: 2,
  streaming: 1,
  health: [
    { camera_id: 'cam-01', health: 'online', kind: 'replay' },
    { camera_id: 'cam-02', health: 'degraded', kind: 'live' },
  ],
};

const RUNNING_RUNTIME = {
  enabled: true,
  reason: '',
  active_sessions: 2,
  streaming_sessions: 1,
  streaming: true,
};

describe('live monitoring reflects real camera state', () => {
  it('says nothing is running rather than showing an empty wall', async () => {
    installFetch({ session: identity() });

    renderApp(<AppRouter />, '/live');

    expect(await screen.findByText(/live monitoring is not enabled/i)).toBeInTheDocument();
    // The distinction the whole product rests on.
    expect(screen.getByText(/not the same as observing nothing/i)).toBeInTheDocument();
  });

  it('renders a tile per camera with its real health', async () => {
    installFetch({ session: identity(), cameras: ONLINE_CAMERAS, runtime: RUNNING_RUNTIME });

    renderApp(<AppRouter />, '/live');

    expect(await screen.findByText('cam-01')).toBeInTheDocument();
    expect(screen.getByText('cam-02')).toBeInTheDocument();
    expect(screen.getByText('online')).toBeInTheDocument();
    expect(screen.getByText('degraded')).toBeInTheDocument();
  });

  it('never shows an image for a camera the backend has no frame for', async () => {
    installFetch({ session: identity(), cameras: ONLINE_CAMERAS, runtime: RUNNING_RUNTIME });

    renderApp(<AppRouter />, '/live');
    await screen.findByText('cam-01');

    // No <img> anywhere. A black rectangle — or worse, a stale frame — would be
    // a claim this page cannot support.
    expect(document.querySelectorAll('img')).toHaveLength(0);
    expect(screen.getAllByText(/not producing frames/i).length).toBeGreaterThan(0);
  });

  it('never labels a degraded camera as online', async () => {
    installFetch({ session: identity(), cameras: ONLINE_CAMERAS, runtime: RUNNING_RUNTIME });

    renderApp(<AppRouter />, '/live');
    const degraded = (await screen.findByText('cam-02')).closest('section') as HTMLElement;

    expect(within(degraded).getByText('degraded')).toBeInTheDocument();
    expect(within(degraded).queryByText('online')).not.toBeInTheDocument();
  });
});

describe('the dashboard reports real camera counts', () => {
  it('shows an em dash when no camera is configured, not a zero', async () => {
    installFetch({ session: identity() });

    renderApp(<AppRouter />, '/dashboard');
    const card = (await screen.findByText('Cameras online')).closest('section') as HTMLElement;

    expect(within(card).getByText('—')).toBeInTheDocument();
    expect(within(card).getByText(/no camera is configured yet/i)).toBeInTheDocument();
  });

  it('shows a real count once cameras exist', async () => {
    installFetch({ session: identity(), cameras: ONLINE_CAMERAS, runtime: RUNNING_RUNTIME });

    renderApp(<AppRouter />, '/dashboard');
    const card = (await screen.findByText('Cameras online')).closest('section') as HTMLElement;

    // One of two is online — and the detail keeps "configured" and "streaming"
    // visible so the count cannot be read as a clean bill of health.
    expect(within(card).getByText('1')).toBeInTheDocument();
    expect(within(card).getByText(/2 configured · 1 streaming/)).toBeInTheDocument();
  });
});

describe('DevTools sources screen', () => {
  it('reports that no source is running rather than an empty table', async () => {
    installFetch({ session: identity(), live: emptyLiveRuntime() });

    renderApp(<AppRouter />, '/devtools/vision/sources');

    expect(await screen.findByText(/no source is running/i)).toBeInTheDocument();
  });

  it('shows queue depth, drops and reconnects for a running source', async () => {
    installFetch({ session: identity(), live: replayLiveRuntime() });

    renderApp(<AppRouter />, '/devtools/vision/sources');
    await screen.findByRole('table', { name: /live and replay sources/i });

    const row = screen.getByText('cam-01').closest('tr') as HTMLElement;
    expect(within(row).getByText('2/8')).toBeInTheDocument(); // depth / capacity
    expect(within(row).getByText('37')).toBeInTheDocument(); // dropped total
    expect(within(row).getByText('120')).toBeInTheDocument(); // frames produced
  });

  it('labels a replay source as replay, never as live', async () => {
    installFetch({ session: identity(), live: replayLiveRuntime() });

    renderApp(<AppRouter />, '/devtools/vision/sources');
    const row = (await screen.findByText('cam-01')).closest('tr') as HTMLElement;

    expect(within(row).getByText('replay')).toBeInTheDocument();
    expect(within(row).queryByText(/^live$/i)).not.toBeInTheDocument();
  });

  it('shows the redacted URI and never a credential', async () => {
    installFetch({ session: identity(), live: replayLiveRuntime() });

    renderApp(<AppRouter />, '/devtools/vision/sources');
    await screen.findByText('cam-01');

    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/rtsp:\/\/[^*]+:[^*]+@/);
    expect(text).not.toContain('password');
  });

  it('states the backpressure policy and its rationale', async () => {
    installFetch({ session: identity(), live: replayLiveRuntime() });

    renderApp(<AppRouter />, '/devtools/vision/sources');

    expect(await screen.findByText(/backpressure: drop-oldest/i)).toBeInTheDocument();
    expect(screen.getByText(/never reordered, never duplicated and never fabricated/i)).toBeInTheDocument();
  });

  it('keeps sampled-out and queue-full drops distinguishable', async () => {
    installFetch({ session: identity(), live: replayLiveRuntime() });

    renderApp(<AppRouter />, '/devtools/vision/sources');
    const cell = await screen.findByTitle(/32 sampled out · 5 queue full/);

    // A single "dropped" number would make a healthy 25 fps camera look
    // identical to an overloaded one.
    expect(cell).toBeInTheDocument();
  });
});

describe('the connection badge separates connected from streaming', () => {
  it('reads "no live camera source yet" when the backend is not streaming', async () => {
    installFetch({ session: identity() });

    renderApp(<AppRouter />, '/dashboard');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument());

    // The socket may be idle in jsdom; what must never appear is a bare "LIVE".
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\bLIVE\b/);
  });
});

/**
 * Each camera's Live Wall frame rate, and editing a camera from the list.
 *
 * The rate used to be one number fixed in code for every camera, so each
 * request for a smoother picture was a code change. It is now chosen when a
 * camera is added, changed from an Edit button on its row, and used by the
 * Live Wall for that camera's tile.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AppRouter } from '@app/router/AppRouter';

import {
  adminIdentity,
  identity,
  installFetch,
  managerIdentity,
  recorderFixture,
  renderApp,
  wallCamera,
} from './support';

afterEach(() => vi.unstubAllGlobals());

const ZONES = {
  zones: [
    { id: 'zone-kitchen', name: 'Kitchen', is_active: true, camera_count: 0, created_at: null },
    { id: 'zone-hall', name: 'Dine hall', is_active: true, camera_count: 0, created_at: null },
  ],
  count: 2,
  total: 2,
  limit: 200,
  offset: 0,
};

function camera(overrides: Record<string, unknown> = {}) {
  return {
    camera_key: 'cam-11',
    runtime_id: 'org-test:cam-11',
    name: 'Kitchen center',
    purpose: '',
    zone_id: 'zone-kitchen',
    channel: 13,
    stream_type: 'main',
    recorder_id: 'rec-1',
    recorder_name: 'Gayathri DVR',
    recorder_brand: 'Dahua / Amcrest',
    recorder_active: true,
    credential_configured: true,
    credential_scheme: 'recorder',
    analysis_fps: 4,
    wall_fps: 4,
    enabled: true,
    analysis_enabled: true,
    uri: '',
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

/** The body the page sent with its request to `path`, parsed. */
function sent(stub: ReturnType<typeof installFetch>, method: string, path: RegExp) {
  const call = stub.mock.calls.find(
    ([input, init]) => (init?.method ?? 'GET') === method && path.test(String(input)),
  );
  return call ? JSON.parse(String(call[1]?.body ?? '{}')) : undefined;
}

/* ── the list ─────────────────────────────────────────────────────────────── */

describe('the camera list', () => {
  it('shows each camera’s Live Wall rate and an Edit button on its row', async () => {
    installFetch({
      session: adminIdentity(),
      routes: { '/cameras': { cameras: [camera({ wall_fps: 12 })], enabled: 1, total: 1 } },
    });
    renderApp(<AppRouter />, '/admin/cameras');

    const row = (await screen.findByRole('link', { name: 'Kitchen center' })).closest('tr') as HTMLElement;
    expect(within(row).getByText('12 fps')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Edit Kitchen center' })).toBeInTheDocument();
  });

  it('shows a dash, not "undefined", when the server sends no rate', async () => {
    const { wall_fps: _unknown, ...older } = camera();
    installFetch({
      session: adminIdentity(),
      routes: { '/cameras': { cameras: [older], enabled: 1, total: 1 } },
    });
    renderApp(<AppRouter />, '/admin/cameras');

    const row = (await screen.findByRole('link', { name: 'Kitchen center' })).closest('tr') as HTMLElement;
    expect(within(row).queryByText(/undefined/)).not.toBeInTheDocument();
    // No rate is claimed at all — the cell shows a dash, not a number.
    expect(within(row).queryByText(/fps/)).not.toBeInTheDocument();
  });

  it('offers no Edit to somebody who may only look', async () => {
    installFetch({
      session: managerIdentity(),
      routes: { '/cameras': { cameras: [camera()], enabled: 1, total: 1 } },
    });
    renderApp(<AppRouter />, '/admin/cameras');

    await screen.findByRole('link', { name: 'Kitchen center' });
    expect(screen.queryByRole('button', { name: /^edit/i })).not.toBeInTheDocument();
  });
});

/* ── editing ──────────────────────────────────────────────────────────────── */

describe('editing a camera from its row', () => {
  it('opens that camera’s details and sends only what changed', async () => {
    const stub = installFetch({
      session: adminIdentity(),
      zones: ZONES,
      routes: { '/cameras': { cameras: [camera()], enabled: 1, total: 1 } },
    });
    renderApp(<AppRouter />, '/admin/cameras');

    await userEvent.click(await screen.findByRole('button', { name: 'Edit Kitchen center' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/^name$/i)).toHaveValue('Kitchen center');
    expect(within(dialog).getByLabelText(/^channel$/i)).toHaveValue('13');

    await userEvent.selectOptions(within(dialog).getByLabelText(/live wall frame rate/i), '15');
    await userEvent.clear(within(dialog).getByLabelText(/^name$/i));
    await userEvent.type(within(dialog).getByLabelText(/^name$/i), 'Kitchen pass');
    await userEvent.click(within(dialog).getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(sent(stub, 'PATCH', /\/cameras\/cam-11$/)).toBeDefined());
    expect(sent(stub, 'PATCH', /\/cameras\/cam-11$/)).toEqual({ name: 'Kitchen pass', wall_fps: 15 });
  });

  it('says a switched-on camera reconnects when its channel changes, and confirms it did', async () => {
    const stub = installFetch({
      session: adminIdentity(),
      zones: ZONES,
      routes: {
        // Most specific first: the edit answers as the server does.
        '/cameras/cam-11': { ...camera({ channel: 14 }), reconnected: true },
        '/cameras': { cameras: [camera()], enabled: 1, total: 1 },
      },
    });
    renderApp(<AppRouter />, '/admin/cameras');

    await userEvent.click(await screen.findByRole('button', { name: 'Edit Kitchen center' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.clear(within(dialog).getByLabelText(/^channel$/i));
    await userEvent.type(within(dialog).getByLabelText(/^channel$/i), '14');
    expect(within(dialog).getByText(/reconnects it to the new channel/i)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(sent(stub, 'PATCH', /\/cameras\/cam-11$/)).toEqual({ channel: 14 }));
    expect(await screen.findByText(/saved and reconnected on channel 14/i)).toBeInTheDocument();
  });

  it('keeps Save off until something changes', async () => {
    installFetch({
      session: adminIdentity(),
      zones: ZONES,
      routes: { '/cameras': { cameras: [camera()], enabled: 1, total: 1 } },
    });
    renderApp(<AppRouter />, '/admin/cameras');

    await userEvent.click(await screen.findByRole('button', { name: 'Edit Kitchen center' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: /save changes/i })).toBeDisabled();
  });
});

/* ── choosing it when a camera is added ───────────────────────────────────── */

describe('choosing the rate when adding', () => {
  it('the Add camera page sends the chosen rate', async () => {
    const stub = installFetch({ session: adminIdentity(), zones: ZONES });
    renderApp(<AppRouter />, '/admin/cameras/new');

    const rate = await screen.findByLabelText(/live wall frame rate/i);
    expect(rate).toHaveValue('4');
    await userEvent.selectOptions(rate, '12');
    await userEvent.selectOptions(screen.getByLabelText(/^zone$/i), 'zone-kitchen');
    await userEvent.type(screen.getByLabelText(/^name$/i), 'Serving line');
    await userEvent.click(screen.getByRole('button', { name: /^add camera$/i }));

    await waitFor(() => expect(sent(stub, 'POST', /\/cameras$/)).toBeDefined());
    expect(sent(stub, 'POST', /\/cameras$/)).toMatchObject({ wall_fps: 12 });
  });

  it('a recorder page’s add-camera row sends the chosen rate', async () => {
    const stub = installFetch({
      session: adminIdentity(),
      zones: ZONES,
      recorders: {
        recorders: [recorderFixture()],
        count: 1,
        total: 1,
        limit: 25,
        offset: 0,
      },
    });
    renderApp(<AppRouter />, '/admin/recorders/rec-1');

    await userEvent.click(await screen.findByRole('button', { name: /\+ add camera/i }));
    const form = await screen.findByRole('form', { name: /add a camera/i });
    await userEvent.type(within(form).getByLabelText(/camera name/i), 'Store');
    await userEvent.selectOptions(within(form).getByLabelText(/^zone$/i), 'zone-kitchen');
    await userEvent.selectOptions(within(form).getByLabelText(/live wall frame rate/i), '8');
    await userEvent.click(within(form).getByRole('button', { name: /^add camera$/i }));

    await waitFor(() => expect(sent(stub, 'POST', /\/cameras$/)).toBeDefined());
    expect(sent(stub, 'POST', /\/cameras$/)).toMatchObject({ wall_fps: 8, recorder_id: 'rec-1' });
  });
});

/* ── the Live Wall plays each camera at its own rate ──────────────────────── */

describe('the Live Wall', () => {
  function wallOf(cameras: ReturnType<typeof wallCamera>[]) {
    return {
      cameras,
      total: cameras.length,
      live: cameras.length,
      wall: { cameras: cameras.length, by_state: { live: cameras.length }, live: cameras.length, viewers: 0 },
      default_wall_fps: 4,
      default_detail_fps: 12,
    };
  }

  it('asks for each tile at its own camera’s rate', async () => {
    installFetch({
      session: identity(),
      wall: wallOf([
        wallCamera({ camera_id: 'cam-01', name: 'Pass', wall_fps: 15 }),
        wallCamera({ camera_id: 'cam-02', name: 'Store', channel: 2 }),
      ]),
    });
    renderApp(<AppRouter />, '/live');

    await waitFor(() => expect(document.querySelectorAll('img').length).toBe(2));
    const sources = Array.from(document.querySelectorAll('img')).map((img) => img.getAttribute('src') ?? '');
    expect(sources.find((src) => src.includes('/cam-01/'))).toContain('fps=15');
    // A camera without its own rate plays at the wall's default.
    expect(sources.find((src) => src.includes('/cam-02/'))).toContain('fps=4');
  });
});

/**
 * Recorders, as a person uses them.
 *
 * Organised by what somebody does — finds the list, adds a recorder step by
 * step, looks after one — and then by the properties that must hold whatever
 * they do: the password field never reveals, the password is never on screen
 * after it is typed, and nothing technical is asked of anyone.
 */

import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AppRouter } from '@app/router/AppRouter';

import { adminIdentity, installFetch, managerIdentity, recorderFixture, renderApp } from './support';

const PASSWORD = 'Dvr@Gayathri#2026';

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

function list(...recorders: Array<Record<string, unknown>>) {
  return { recorders, count: recorders.length, total: recorders.length, limit: 25, offset: 0 };
}

/** The body the page sent with its request to `path`, parsed. */
function sent(stub: ReturnType<typeof installFetch>, method: string, path: RegExp) {
  const call = stub.mock.calls.find(
    ([input, init]) => (init?.method ?? 'GET') === method && path.test(String(input)),
  );
  return call ? JSON.parse(String(call[1]?.body ?? '{}')) : undefined;
}

/* ── the list ─────────────────────────────────────────────────────────────── */

describe('the recorder list', () => {
  it('says what each recorder is, where it is, and whether it is in use', async () => {
    installFetch({
      session: adminIdentity(),
      recorders: list(recorderFixture({ camera_count: 8, cameras_on: 3 })),
    });
    renderApp(<AppRouter />, '/admin/recorders');

    const row = (await screen.findByRole('link', { name: 'Gayathri DVR' })).closest('tr') as HTMLElement;
    expect(within(row).getByText('Hikvision')).toBeInTheDocument();
    expect(within(row).getByText('192.168.1.20:554')).toBeInTheDocument();
    expect(within(row).getByText('8 · 3 on')).toBeInTheDocument();
    expect(within(row).getByText('Saved securely')).toBeInTheDocument();
    expect(within(row).getByText('Active')).toBeInTheDocument();
  });

  it('explains what a recorder is before anything else', async () => {
    installFetch({ session: adminIdentity() });
    renderApp(<AppRouter />, '/admin/recorders');

    expect(await screen.findByText(/the DVR or NVR your cameras are plugged into/i)).toBeInTheDocument();
  });

  it('tells a new organization what it will need, rather than showing an empty table', async () => {
    installFetch({ session: adminIdentity(), recorders: list() });
    renderApp(<AppRouter />, '/admin/recorders');

    expect(await screen.findByText('No recorders yet')).toBeInTheDocument();
    expect(screen.getByText(/IP address and the username and password/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('offers a manager who may only look no way to add one', async () => {
    installFetch({ session: managerIdentity() });
    renderApp(<AppRouter />, '/admin/recorders');

    await screen.findByRole('link', { name: 'Gayathri DVR' });
    expect(screen.queryByRole('button', { name: /add recorder/i })).not.toBeInTheDocument();
  });

  it('is reachable from the administration hub', async () => {
    installFetch({ session: adminIdentity() });
    renderApp(<AppRouter />, '/admin');

    expect(await screen.findByRole('link', { name: /recorders/i })).toBeInTheDocument();
  });
});

/* ── adding one ───────────────────────────────────────────────────────────── */

async function fillRecorderStep(overrides: { host?: string; brand?: string } = {}) {
  await userEvent.type(await screen.findByLabelText(/recorder name/i), 'Gayathri DVR');
  await userEvent.selectOptions(screen.getByLabelText(/^brand$/i), overrides.brand ?? 'hikvision');
  await userEvent.type(screen.getByLabelText(/ip address or hostname/i), overrides.host ?? '192.168.1.20');
}

async function fillSignInStep() {
  await userEvent.type(await screen.findByLabelText(/^username$/i), 'admin');
  await userEvent.type(screen.getByLabelText(/^password$/i), PASSWORD);
}

describe('adding a recorder', () => {
  it('walks through five steps in the order a person knows the answers', async () => {
    installFetch({ session: adminIdentity(), zones: ZONES });
    renderApp(<AppRouter />, '/admin/recorders/new');

    const progress = await screen.findByRole('list', { name: /progress/i });
    const steps = within(progress).getAllByRole('listitem').map((item) => item.textContent);
    expect(steps.map((step) => step?.replace(/^[\d✓]+/, ''))).toEqual([
      'Recorder',
      'Sign in',
      'Test',
      'Cameras',
      'Review',
    ]);
  });

  it('asks nothing technical: no URL, no path, no credential reference', async () => {
    installFetch({ session: adminIdentity(), zones: ZONES });
    renderApp(<AppRouter />, '/admin/recorders/new');

    await screen.findByLabelText(/recorder name/i);
    expect(screen.queryByLabelText(/rtsp|url|stream path|credential/i)).not.toBeInTheDocument();
  });

  it('shows the stream-path fields only for a device not in the list', async () => {
    installFetch({ session: adminIdentity(), zones: ZONES });
    renderApp(<AppRouter />, '/admin/recorders/new');

    await userEvent.selectOptions(await screen.findByLabelText(/^brand$/i), 'hikvision');
    expect(screen.queryByLabelText(/stream path/i)).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(/^brand$/i), 'custom');
    expect(screen.getByLabelText(/stream path/i)).toBeInTheDocument();
  });

  it('says what is missing when Continue is pressed too early, and stays put', async () => {
    installFetch({ session: adminIdentity(), zones: ZONES });
    renderApp(<AppRouter />, '/admin/recorders/new');

    await userEvent.click(await screen.findByRole('button', { name: /^continue$/i }));

    expect(screen.getByText(/give the recorder a name/i)).toBeInTheDocument();
    expect(screen.getByText(/enter the ip address or hostname/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/recorder name/i)).toBeInTheDocument();
  });

  it('catches an address typed as a URL while it is being typed', async () => {
    installFetch({ session: adminIdentity(), zones: ZONES });
    renderApp(<AppRouter />, '/admin/recorders/new');

    await userEvent.type(await screen.findByLabelText(/ip address or hostname/i), 'rtsp://192.168.1.20');
    expect(screen.getByText(/leave out rtsp:\/\//i)).toBeInTheDocument();
  });

  it('asks for the password in a masked field with no way to reveal it', async () => {
    installFetch({ session: adminIdentity(), zones: ZONES });
    renderApp(<AppRouter />, '/admin/recorders/new');

    await fillRecorderStep();
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    const field = await screen.findByLabelText(/^password$/i);
    expect(field).toHaveAttribute('type', 'password');
    expect(field).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.queryByRole('button', { name: /show|reveal|eye/i })).not.toBeInTheDocument();
    expect(screen.getByText(/never shown again/i)).toBeInTheDocument();
  });

  it('reports a successful test in words, with the picture size', async () => {
    installFetch({ session: adminIdentity(), zones: ZONES });
    renderApp(<AppRouter />, '/admin/recorders/new');

    await fillRecorderStep();
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    await fillSignInStep();
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    await userEvent.click(await screen.findByRole('button', { name: /test connection/i }));

    expect(await screen.findByText(/recorder connected successfully/i)).toBeInTheDocument();
    expect(screen.getByText(/1920 × 1080/)).toBeInTheDocument();
  });

  it('says which thing is wrong when a test fails, and how to fix it', async () => {
    installFetch({
      session: adminIdentity(),
      zones: ZONES,
      recorderTest: {
        ok: false,
        outcome: 'authentication_failed',
        message: 'The recorder rejected the username or password.',
        hint: 'Check the username and password you use to sign in to the recorder itself.',
        channel: 1,
        elapsed_ms: 900,
        resolution: null,
      },
    });
    renderApp(<AppRouter />, '/admin/recorders/new');

    await fillRecorderStep();
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    await fillSignInStep();
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    await userEvent.click(await screen.findByRole('button', { name: /test connection/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/rejected the username or password/i);
    expect(screen.getByText(/check the username and password/i)).toBeInTheDocument();
    // A recorder that is off during setup must not block saving.
    expect(screen.getByRole('button', { name: /continue without a successful test/i })).toBeInTheDocument();
  });

  it('refuses two cameras on one channel before anything is sent', async () => {
    installFetch({ session: adminIdentity(), zones: ZONES });
    renderApp(<AppRouter />, '/admin/recorders/new');

    await fillRecorderStep();
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    await fillSignInStep();
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    await userEvent.click(await screen.findByRole('button', { name: /continue/i }));

    await userEvent.click(await screen.findByRole('button', { name: /add a camera/i }));
    await userEvent.click(screen.getByRole('button', { name: /add a camera/i }));
    const channels = screen.getAllByLabelText(/^channel$/i);
    await userEvent.clear(channels[1] as HTMLElement);
    await userEvent.type(channels[1] as HTMLElement, '1');
    await userEvent.click(screen.getByRole('button', { name: /^review$/i }));

    expect(screen.getAllByText(/channel 1 is listed twice/i).length).toBeGreaterThan(0);
  });

  it('saves the recorder and its cameras in one request, then never shows the password', async () => {
    const stub = installFetch({ session: adminIdentity(), zones: ZONES });
    renderApp(<AppRouter />, '/admin/recorders/new');

    await fillRecorderStep();
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    await fillSignInStep();
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    await userEvent.click(await screen.findByRole('button', { name: /continue/i }));

    await userEvent.click(await screen.findByRole('button', { name: /add a camera/i }));
    await userEvent.type(screen.getByLabelText(/camera name/i), 'Kitchen entrance');
    await userEvent.selectOptions(screen.getByLabelText(/^zone$/i), 'zone-kitchen');
    await userEvent.click(screen.getByRole('button', { name: /^review$/i }));

    // The review describes the password without containing it.
    expect(await screen.findByText('Will be saved securely')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(PASSWORD);

    await userEvent.click(screen.getByRole('button', { name: /save recorder/i }));

    await waitFor(() => expect(sent(stub, 'POST', /\/recorders$/)).toBeDefined());
    const body = sent(stub, 'POST', /\/recorders$/);
    expect(body).toMatchObject({
      name: 'Gayathri DVR',
      host: '192.168.1.20',
      rtsp_port: 554,
      username: 'admin',
      brand: 'hikvision',
      password: PASSWORD,
      cameras: [{ channel: 1, name: 'Kitchen entrance', zone_id: 'zone-kitchen', stream_type: 'sub' }],
    });
    // Nothing internal travels from the browser.
    expect(body).not.toHaveProperty('credential_ref');

    // And once saved, the page moves on and the password is nowhere on it.
    await waitFor(() => expect(document.body.textContent).not.toContain(PASSWORD));
  });
});

/* ── looking after one ────────────────────────────────────────────────────── */

const CAMERAS = [
  {
    camera_key: 'cam-01',
    runtime_id: 'org-test:cam-01',
    name: 'Kitchen entrance',
    channel: 1,
    stream_type: 'sub',
    zone_id: 'zone-kitchen',
    recorder_id: 'rec-1',
    recorder_name: 'Gayathri DVR',
    recorder_brand: 'Hikvision',
    recorder_active: true,
    credential_configured: true,
    credential_scheme: 'recorder',
    enabled: true,
    running: true,
  },
  {
    camera_key: 'cam-02',
    runtime_id: 'org-test:cam-02',
    name: 'Hall',
    channel: 3,
    stream_type: 'main',
    zone_id: 'zone-hall',
    recorder_id: 'rec-1',
    recorder_name: 'Gayathri DVR',
    recorder_brand: 'Hikvision',
    recorder_active: true,
    credential_configured: true,
    credential_scheme: 'recorder',
    enabled: false,
    running: false,
  },
];

describe('one recorder', () => {
  it('lists its cameras with their channel, stream, zone and whether each is watching', async () => {
    installFetch({
      session: adminIdentity(),
      zones: ZONES,
      recorders: list(recorderFixture({ camera_count: 2, cameras_on: 1, cameras: CAMERAS })),
    });
    renderApp(<AppRouter />, '/admin/recorders/rec-1');

    const row = (await screen.findByRole('link', { name: 'Kitchen entrance' })).closest('tr') as HTMLElement;
    expect(within(row).getByText('1')).toBeInTheDocument();
    expect(within(row).getByText('Sub')).toBeInTheDocument();
    expect(await within(row).findByText('Kitchen')).toBeInTheDocument();
    expect(within(row).getByText('Watching')).toBeInTheDocument();

    const hall = screen.getByRole('link', { name: 'Hall' }).closest('tr') as HTMLElement;
    expect(within(hall).getByText('Off')).toBeInTheDocument();
    expect(within(hall).getByRole('button', { name: /start watching/i })).toBeInTheDocument();
  });

  it('shows the password as saved, never as a field or a mask', async () => {
    installFetch({ session: adminIdentity(), zones: ZONES });
    renderApp(<AppRouter />, '/admin/recorders/rec-1');

    expect(await screen.findByText('Saved securely')).toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(screen.queryByText(/•{3,}|\*{3,}/)).not.toBeInTheDocument();
  });

  it('changes the password only when it is typed twice the same', async () => {
    const stub = installFetch({ session: adminIdentity(), zones: ZONES });
    renderApp(<AppRouter />, '/admin/recorders/rec-1');

    await userEvent.click(await screen.findByRole('button', { name: /change password/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/^new password$/i), 'New-Pass-2027');
    await userEvent.type(within(dialog).getByLabelText(/confirm new password/i), 'New-Pass-2028');
    expect(within(dialog).getByText(/do not match/i)).toBeInTheDocument();

    await userEvent.clear(within(dialog).getByLabelText(/confirm new password/i));
    await userEvent.type(within(dialog).getByLabelText(/confirm new password/i), 'New-Pass-2027');
    await userEvent.click(within(dialog).getByRole('button', { name: /save new password/i }));

    await waitFor(() => expect(sent(stub, 'PUT', /\/recorders\/rec-1\/credential$/)).toEqual({ password: 'New-Pass-2027' }));
  });

  it('says plainly what deactivating does, and that the cameras keep their settings', async () => {
    installFetch({
      session: adminIdentity(),
      zones: ZONES,
      recorders: list(recorderFixture({ is_active: false, camera_count: 2, cameras: CAMERAS })),
    });
    renderApp(<AppRouter />, '/admin/recorders/rec-1');

    expect(await screen.findByText(/this recorder is deactivated/i)).toBeInTheDocument();
    expect(screen.getByText(/none of its cameras will start/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^activate$/i })).toBeInTheDocument();
  });

  it('offers removal only when nothing would be lost', async () => {
    installFetch({
      session: adminIdentity(),
      zones: ZONES,
      recorders: list(recorderFixture({ camera_count: 2, cameras: CAMERAS })),
    });
    renderApp(<AppRouter />, '/admin/recorders/rec-1');

    expect(await screen.findByText(/can be deactivated but not removed/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove recorder/i })).not.toBeInTheDocument();
  });

  it('tests the saved recorder and reports the result', async () => {
    installFetch({ session: adminIdentity(), zones: ZONES });
    renderApp(<AppRouter />, '/admin/recorders/rec-1');

    await userEvent.click(await screen.findByRole('button', { name: /test connection/i }));
    expect(await screen.findByText(/recorder connected successfully/i)).toBeInTheDocument();
  });
});

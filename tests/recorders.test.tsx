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
    expect(screen.getByText(/IP address or domain, and the username and password/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('offers a manager who may only look no way to add one', async () => {
    installFetch({ session: managerIdentity() });
    renderApp(<AppRouter />, '/admin/recorders');

    await screen.findByRole('link', { name: 'Gayathri DVR' });
    expect(screen.queryByRole('button', { name: /add recorder/i })).not.toBeInTheDocument();
  });

  it('names the organization whose recorders these are', async () => {
    installFetch({ session: adminIdentity() });
    renderApp(<AppRouter />, '/admin/recorders');

    expect(await screen.findByText('CCTV · Test organization')).toBeInTheDocument();
    expect(screen.getByText(/no other organization can see or use them/i)).toBeInTheDocument();
  });

  it('shows the address in use first and the other one beneath it', async () => {
    installFetch({
      session: adminIdentity(),
      recorders: list(
        recorderFixture({
          ip_address: '192.168.54.243',
          hostname: 'canteen.example.net',
          connect_via: 'hostname',
          address: 'canteen.example.net',
          rtsp_port: 554,
        }),
      ),
    });
    renderApp(<AppRouter />, '/admin/recorders');

    const row = (await screen.findByRole('link', { name: 'Gayathri DVR' })).closest('tr') as HTMLElement;
    expect(within(row).getByText('canteen.example.net:554')).toBeInTheDocument();
    expect(within(row).getByText('also IP 192.168.54.243')).toBeInTheDocument();
  });

  it('is reachable from the administration hub', async () => {
    installFetch({ session: adminIdentity() });
    renderApp(<AppRouter />, '/admin');

    expect(await screen.findByRole('link', { name: /recorders/i })).toBeInTheDocument();
  });
});

/* ── adding one ───────────────────────────────────────────────────────────── */

async function fillRecorderStep(
  overrides: { ip?: string; hostname?: string; brand?: string } = {},
) {
  await userEvent.type(await screen.findByLabelText(/recorder name/i), 'Gayathri DVR');
  await userEvent.selectOptions(screen.getByLabelText(/^brand$/i), overrides.brand ?? 'hikvision');
  const ip = overrides.ip ?? '192.168.1.20';
  if (ip) await userEvent.type(screen.getByLabelText(/^ip address$/i), ip);
  if (overrides.hostname) await userEvent.type(screen.getByLabelText(/^domain \/ hostname$/i), overrides.hostname);
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
    expect(screen.queryByLabelText(/url|stream path|credential/i)).not.toBeInTheDocument();
    // "RTSP" appears once, on the port, because it is the word printed in the
    // recorder's own network settings — and the one that tells the video port
    // apart from the phone-app port somebody may have been given instead.
    expect(screen.getByLabelText(/^video \(rtsp\) port$/i)).toBeInTheDocument();
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
    expect(screen.getByText(/ip address, its domain, or both/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/recorder name/i)).toBeInTheDocument();
  });

  it('catches an address typed as a URL while it is being typed', async () => {
    installFetch({ session: adminIdentity(), zones: ZONES });
    renderApp(<AppRouter />, '/admin/recorders/new');

    await userEvent.type(await screen.findByLabelText(/^ip address$/i), 'rtsp://192.168.1.20');
    expect(screen.getByText(/leave out rtsp:\/\//i)).toBeInTheDocument();
  });

  it('keeps the IP address and the domain apart, and says which box each belongs in', async () => {
    installFetch({ session: adminIdentity(), zones: ZONES });
    renderApp(<AppRouter />, '/admin/recorders/new');

    await userEvent.type(await screen.findByLabelText(/^domain \/ hostname$/i), '192.168.54.243');
    expect(screen.getByText(/that is an ip address — enter it under ip address/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/^ip address$/i), 'canteen.example.net');
    expect(screen.getByText(/that looks like a domain/i)).toBeInTheDocument();
  });

  it('asks which address to connect with only when there are two', async () => {
    installFetch({ session: adminIdentity(), zones: ZONES });
    renderApp(<AppRouter />, '/admin/recorders/new');

    await fillRecorderStep();
    expect(screen.queryByText(/this server connects using/i)).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/^domain \/ hostname$/i), 'canteen.example.net');
    expect(screen.getByText(/this server connects using/i)).toBeInTheDocument();
    // Each choice shows the value it would dial.
    expect(screen.getByRole('radio', { name: /ip address 192\.168\.1\.20/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /domain \/ hostname canteen\.example\.net/i })).toBeInTheDocument();

    // Two addresses and no choice is a question, not a guess.
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    expect(screen.getByText(/choose which address this server should connect with/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/recorder name/i)).toBeInTheDocument();
  });

  it('explains that the test channel is only for testing and adds no camera', async () => {
    installFetch({ session: adminIdentity(), zones: ZONES });
    renderApp(<AppRouter />, '/admin/recorders/new');

    await fillRecorderStep();
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    await fillSignInStep();
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    expect(await screen.findByLabelText(/channel to test with/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/channel to try/i)).not.toBeInTheDocument();
    expect(screen.getByText(/it does not add a camera/i)).toBeInTheDocument();
  });

  it('can test either address before choosing, and says which one it tested', async () => {
    const stub = installFetch({ session: adminIdentity(), zones: ZONES });
    renderApp(<AppRouter />, '/admin/recorders/new');

    await fillRecorderStep({ hostname: 'canteen.example.net' });
    await userEvent.click(screen.getByRole('radio', { name: /ip address/i }));
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    await fillSignInStep();
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    await userEvent.selectOptions(await screen.findByLabelText(/^test using$/i), 'hostname');
    await userEvent.click(screen.getByRole('button', { name: /test connection/i }));

    expect(await screen.findByText(/recorder connected successfully/i)).toBeInTheDocument();
    expect(screen.getByText('canteen.example.net:554')).toBeInTheDocument();
    expect(sent(stub, 'POST', /\/recorders\/test$/)).toMatchObject({
      via: 'hostname',
      ip_address: '192.168.1.20',
      hostname: 'canteen.example.net',
      connect_via: 'ip_address',
    });
  });

  it('says so plainly when the port is not the recorder’s video port', async () => {
    installFetch({
      session: adminIdentity(),
      zones: ZONES,
      recorderTest: {
        ok: false,
        outcome: 'not_rtsp',
        message: "Something answered on port 5501, but it is not the recorder's video (RTSP) port.",
        hint: 'The port shown in the phone app is often not the video one. The video port is usually 554.',
        address: 'canteen.example.net',
        port: 5501,
        channel: 1,
        elapsed_ms: 6100,
        resolution: null,
      },
    });
    renderApp(<AppRouter />, '/admin/recorders/new');

    await fillRecorderStep();
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    await fillSignInStep();
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    await userEvent.click(await screen.findByRole('button', { name: /test connection/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/not the recorder's video \(RTSP\) port/i);
    expect(screen.getByText(/the video port is usually 554/i)).toBeInTheDocument();
  });

  it('names the organization the recorder will be saved to', async () => {
    installFetch({ session: adminIdentity(), zones: ZONES });
    renderApp(<AppRouter />, '/admin/recorders/new');

    expect(await screen.findByText('CCTV · Test organization')).toBeInTheDocument();
    expect(screen.getByText(/saved for Test organization only/i)).toBeInTheDocument();
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
      ip_address: '192.168.1.20',
      hostname: '',
      connect_via: 'ip_address',
      rtsp_port: 554,
      username: 'admin',
      brand: 'hikvision',
      password: PASSWORD,
      cameras: [{ channel: 1, name: 'Kitchen entrance', zone_id: 'zone-kitchen', stream_type: 'sub' }],
    });
    // Nothing internal travels from the browser.
    expect(body).not.toHaveProperty('credential_ref');
    expect(body).not.toHaveProperty('host');

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

  it('shows both addresses and which one it connects with', async () => {
    installFetch({
      session: adminIdentity(),
      zones: ZONES,
      recorders: list(
        recorderFixture({
          ip_address: '192.168.54.243',
          hostname: 'canteen.example.net',
          connect_via: 'hostname',
          address: 'canteen.example.net',
        }),
      ),
    });
    renderApp(<AppRouter />, '/admin/recorders/rec-1');

    expect(await screen.findByText('192.168.54.243')).toBeInTheDocument();
    expect(screen.getByText('Domain / hostname — canteen.example.net')).toBeInTheDocument();
  });

  it('tests the other address when asked, before anyone switches to it', async () => {
    const stub = installFetch({
      session: adminIdentity(),
      zones: ZONES,
      recorders: list(
        recorderFixture({
          ip_address: '192.168.54.243',
          hostname: 'canteen.example.net',
          connect_via: 'hostname',
          address: 'canteen.example.net',
        }),
      ),
    });
    renderApp(<AppRouter />, '/admin/recorders/rec-1');

    await userEvent.selectOptions(await screen.findByLabelText(/^test using$/i), 'ip_address');
    await userEvent.click(screen.getByRole('button', { name: /test connection/i }));

    await waitFor(() =>
      expect(sent(stub, 'POST', /\/recorders\/rec-1\/test$/)).toEqual({ channel: 1, via: 'ip_address' }),
    );
    expect(await screen.findByText('192.168.54.243:554')).toBeInTheDocument();
  });

  it('asks for the password to be set here when it still comes from the server’s settings', async () => {
    installFetch({
      session: adminIdentity(),
      zones: ZONES,
      recorders: list(recorderFixture({ credential_scheme: 'env' })),
    });
    renderApp(<AppRouter />, '/admin/recorders/rec-1');

    expect(await screen.findByText('Needs to be set here')).toBeInTheDocument();
    expect(screen.getByText(/still comes from the server’s own settings/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /change password/i })).toBeInTheDocument();
  });

  it('edits the addresses and which one is used, never the password', async () => {
    const stub = installFetch({
      session: adminIdentity(),
      zones: ZONES,
      recorders: list(recorderFixture()),
    });
    renderApp(<AppRouter />, '/admin/recorders/rec-1');

    await userEvent.click(await screen.findByRole('button', { name: /^edit$/i }));
    await userEvent.type(screen.getByLabelText(/^domain \/ hostname$/i), 'canteen.example.net');
    await userEvent.click(screen.getByRole('radio', { name: /domain \/ hostname/i }));
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(sent(stub, 'PATCH', /\/recorders\/rec-1$/)).toBeDefined());
    const body = sent(stub, 'PATCH', /\/recorders\/rec-1$/);
    expect(body).toMatchObject({
      ip_address: '192.168.1.20',
      hostname: 'canteen.example.net',
      connect_via: 'hostname',
    });
    expect(body).not.toHaveProperty('password');
  });
});

/* ── adding a camera: an existing recorder, or a new one ──────────────────── */

describe('adding a camera', () => {
  const canteen = recorderFixture({
    name: 'Canteen DVR',
    ip_address: '192.168.54.243',
    hostname: 'canteen.example.net',
    connect_via: 'hostname',
    address: 'canteen.example.net',
    camera_count: 1,
    cameras: [{ ...CAMERAS[0], channel: 1, name: 'Kitchen entrance' }],
  });
  const main = recorderFixture({
    id: 'rec-2',
    name: 'Main Building DVR',
    ip_address: '',
    hostname: 'main.example.net',
    connect_via: 'hostname',
    address: 'main.example.net',
    brand: 'dahua',
    brand_label: 'Dahua / Amcrest',
    camera_count: 8,
  });

  it('lists the organization’s recorders to choose from, with a way to add a new one', async () => {
    installFetch({ session: adminIdentity(), zones: ZONES, recorders: list(canteen, main) });
    renderApp(<AppRouter />, '/admin/cameras/new');

    const group = await screen.findByRole('radiogroup', { name: /recorder/i });
    const choice = within(group).getByRole('radio', { name: 'Canteen DVR' });
    expect(choice).toHaveAccessibleDescription(/192\.168\.54\.243/);
    expect(choice).toHaveAccessibleDescription(/canteen\.example\.net/);
    expect(choice).toHaveAccessibleDescription(/1 camera/);
    expect(within(group).getByRole('radio', { name: 'Main Building DVR' })).toHaveAccessibleDescription(
      /8 cameras/,
    );
    expect(within(group).getByRole('link', { name: /add a new recorder/i })).toHaveAttribute(
      'href',
      '/admin/recorders/new',
    );
  });

  it('reuses the chosen recorder: no address, port, username or password is asked for', async () => {
    const stub = installFetch({ session: adminIdentity(), zones: ZONES, recorders: list(canteen, main) });
    renderApp(<AppRouter />, '/admin/cameras/new');

    await userEvent.click(await screen.findByRole('radio', { name: 'Main Building DVR' }));
    expect(screen.getByRole('radio', { name: 'Main Building DVR' })).toHaveAttribute('aria-checked', 'true');

    expect(screen.queryByLabelText(/ip address|domain|hostname|port|username|password/i)).not.toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).toBeNull();

    await userEvent.selectOptions(screen.getByLabelText(/^zone$/i), 'zone-kitchen');
    await userEvent.type(screen.getByLabelText(/^name$/i), 'Lobby');
    await userEvent.click(screen.getByRole('button', { name: /^add camera$/i }));

    await waitFor(() => expect(sent(stub, 'POST', /\/cameras$/)).toBeDefined());
    const body = sent(stub, 'POST', /\/cameras$/);
    expect(body).toMatchObject({ recorder_id: 'rec-2', channel: 1, zone_id: 'zone-kitchen', name: 'Lobby' });
    for (const field of ['host', 'ip_address', 'hostname', 'rtsp_port', 'username', 'password']) {
      expect(body).not.toHaveProperty(field);
    }
  });

  it('proposes a free channel and catches one already used on that recorder', async () => {
    installFetch({ session: adminIdentity(), zones: ZONES, recorders: list(canteen, main) });
    renderApp(<AppRouter />, '/admin/cameras/new');

    await userEvent.click(await screen.findByRole('radio', { name: 'Canteen DVR' }));
    // Channel 1 has a camera, so 2 is offered.
    expect(await screen.findByDisplayValue('2')).toBeInTheDocument();

    const channel = screen.getByLabelText(/^channel$/i);
    await userEvent.clear(channel);
    await userEvent.type(channel, '1');
    expect(screen.getByText(/channel 1 on this recorder is already used by “kitchen entrance”/i)).toBeInTheDocument();
  });

  it('names the organization the camera is being added to', async () => {
    installFetch({ session: adminIdentity(), zones: ZONES, recorders: list(canteen) });
    renderApp(<AppRouter />, '/admin/cameras/new');

    expect(await screen.findByText('Cameras · Test organization')).toBeInTheDocument();
  });
});

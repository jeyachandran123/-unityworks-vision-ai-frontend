/**
 * The durable product surfaces.
 *
 * Every case here asserts a property that would be *easy to lose* by accident:
 * a thumbnail that loads on render, a zero where the answer is unknown, an
 * action button visible to someone who cannot perform it, a credential rendered
 * because the field happened to be in the payload.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRouter } from '@app/router/AppRouter';
import {
  adminIdentity,
  auditorIdentity,
  installFetch,
  managerIdentity,
  renderApp,
  supervisorIdentity,
} from './support';

function camera(overrides: Record<string, unknown> = {}) {
  return {
    camera_key: 'cam-01',
    name: 'Prep bench',
    purpose: 'PPE compliance',
    restaurant_id: 'rest-01',
    zone_id: null,
    channel: 1,
    stream_type: 'sub',
    host: '10.0.0.5',
    rtsp_port: 554,
    username: 'admin',
    credential_ref: 'env:CCTV_PASSWORD',
    credential_configured: true,
    analysis_fps: 4,
    enabled: false,
    uri: 'rtsp://***:***@10.0.0.5:554/cam/realmonitor?channel=1&subtype=1',
    created_at: '2026-08-20T09:00:00+00:00',
    updated_at: null,
    ...overrides,
  };
}

function incident(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inc-1',
    status: 'active',
    severity: 'high',
    summary: 'No head covering at the prep bench',
    rule_id: 'rule.head_covering',
    ruleset_version: '2026.08.1',
    restaurant_id: 'rest-01',
    zone_id: null,
    camera_key: 'cam-01',
    observed_at: '2026-08-21T09:00:00+00:00',
    created_at: '2026-08-21T09:00:01+00:00',
    object_id: 'person-7',
    track_id: 'track-7',
    finding: { attribute: 'head_covering', state: 'ABSENT', confidence: 0.82 },
    evidence_refs: ['ev-1'],
    acknowledged_at: null,
    acknowledged_by: null,
    resolved_at: null,
    resolved_by: null,
    resolution_kind: null,
    resolution_note: null,
    ...overrides,
  };
}

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    evidence_ref: 'ev-1',
    camera_key: 'cam-01',
    frame_ref: 'cam-01:0:41',
    object_id: 'person-7',
    observation_id: 'obs-1',
    captured_at: '2026-08-21T09:00:00+00:00',
    created_at: '2026-08-21T09:00:01+00:00',
    purpose: 'head covering finding',
    state: 'retained',
    servable: true,
    expires_at: '2026-09-20T09:00:00+00:00',
    content_hash: 'blake2b:abc123',
    size_bytes: 20480,
    media_type: 'image/jpeg',
    deleted_at: null,
    deleted_by: null,
    deletion_reason: null,
    ...overrides,
  };
}

afterEach(() => vi.unstubAllGlobals());

/* ── cameras ──────────────────────────────────────────────────────────────── */

describe('the camera page', () => {
  it('separates registered from enabled, so a disabled camera is visibly not watching', async () => {
    installFetch({
      session: adminIdentity(),
      routes: {
        '/cameras': {
          cameras: [camera(), camera({ camera_key: 'cam-02', name: 'Wash', channel: 2, enabled: true })],
          enabled: 1,
          total: 2,
        },
      },
    });
    renderApp(<AppRouter />, '/cameras');

    await screen.findByRole('heading', { name: 'Cameras' });

    const registered = (await screen.findByText('Registered')).closest('[data-figure]') as HTMLElement;
    expect(within(registered).getByText('2')).toBeInTheDocument();

    const notProcessed = screen.getByText('Not processed').closest('[data-figure]') as HTMLElement;
    // One camera exists and is deliberately not being processed. That must be
    // legible as a fact, not inferable only by subtraction.
    expect(within(notProcessed).getByText('1')).toBeInTheDocument();
  });

  it('shows how the credential is stored and never which one, nor its value', async () => {
    // The reference itself is no longer shown, and no longer sent: `literal:`
    // made `credential_ref` a field that could carry the secret, and
    // `env:CCTV_PASSWORD` names a variable anyone reaching the process can go
    // and read. The scheme is the diagnosable part — "this camera reads an
    // environment variable" — and it is all that is offered.
    installFetch({
      session: adminIdentity(),
      routes: { '/cameras': { cameras: [camera()], enabled: 0, total: 1 } },
    });
    renderApp(<AppRouter />, '/cameras');

    await screen.findByRole('heading', { name: 'Cameras' });
    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/hunter2|password=|:\w+@10\.0\.0\.5/);
    expect(body).not.toContain('CCTV_PASSWORD');
  });

  it('offers the enable control only to an account that may configure cameras', async () => {
    installFetch({
      session: supervisorIdentity(), // view_cameras, not manage_cameras
      routes: { '/cameras': { cameras: [camera()], enabled: 0, total: 1 } },
    });
    renderApp(<AppRouter />, '/cameras');

    await screen.findByRole('heading', { name: 'Cameras' });
    expect(screen.queryByRole('button', { name: /enable/i })).not.toBeInTheDocument();
  });

  it('enabling a camera is a deliberate second act, sent as its own request', async () => {
    const calls: string[] = [];
    installFetch({
      session: adminIdentity(),
      calls,
      routes: { '/cameras': { cameras: [camera()], enabled: 0, total: 1 } },
    });
    renderApp(<AppRouter />, '/cameras');

    await userEvent.click(await screen.findByRole('button', { name: 'Enable' }));

    await waitFor(() =>
      expect(calls.some((c) => c.startsWith('PATCH') && c.includes('/cameras/cam-01'))).toBe(true),
    );
  });
});

/* ── incidents ────────────────────────────────────────────────────────────── */

describe('the incident queue', () => {
  it('does not let an empty queue read as a clean kitchen', async () => {
    installFetch({
      session: managerIdentity(),
      routes: { '/incidents': { incidents: [], count: 0 } },
    });
    renderApp(<AppRouter />, '/incidents');

    await screen.findByRole('heading', { name: 'Incidents' });
    // The empty state must say why an empty queue might not mean what it looks
    // like. "No violations" and "not watching" must never look the same.
    expect(screen.getByText(/nothing was observed rather than nothing happened/i)).toBeInTheDocument();
  });

  it('shows evidence as a count, never as a thumbnail that loads itself', async () => {
    const calls: string[] = [];
    installFetch({
      session: managerIdentity(),
      calls,
      routes: { '/incidents': { incidents: [incident()], count: 1 } },
    });
    renderApp(<AppRouter />, '/incidents');

    await screen.findByText('No head covering at the prep bench');
    expect(document.querySelectorAll('img')).toHaveLength(0);
    // Nothing fetched an image because a list rendered.
    expect(calls.some((c) => c.includes('/image'))).toBe(false);
  });

  it('shows the frozen finding rather than recomputing one', async () => {
    installFetch({
      session: managerIdentity(),
      routes: { '/incidents': { incidents: [incident()], count: 1 } },
    });
    renderApp(<AppRouter />, '/incidents');

    await userEvent.click(await screen.findByRole('button', { name: 'Inspect' }));

    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('2026.08.1')).toBeInTheDocument();
    expect(within(drawer).getByText(/frozen when the incident was raised/i)).toBeInTheDocument();
  });

  it('will not resolve an incident without a reason', async () => {
    installFetch({
      session: managerIdentity(),
      routes: { '/incidents': { incidents: [incident()], count: 1 } },
    });
    renderApp(<AppRouter />, '/incidents');

    await userEvent.click(await screen.findByRole('button', { name: 'Inspect' }));
    const drawer = await screen.findByRole('dialog');

    expect(within(drawer).getByRole('button', { name: 'Resolve' })).toBeDisabled();
    await userEvent.type(within(drawer).getByLabelText(/reason for resolving/i), 'Hairnet issued');
    expect(within(drawer).getByRole('button', { name: 'Resolve' })).toBeEnabled();
  });

  it('offers acknowledge but not resolve to a supervisor', async () => {
    installFetch({
      session: supervisorIdentity(),
      routes: { '/incidents': { incidents: [incident()], count: 1 } },
    });
    renderApp(<AppRouter />, '/incidents');

    await userEvent.click(await screen.findByRole('button', { name: 'Inspect' }));
    const drawer = await screen.findByRole('dialog');

    expect(within(drawer).getByRole('button', { name: 'Acknowledge' })).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'Resolve' })).not.toBeInTheDocument();
  });

  it('says which of the two ways a resolved incident was closed', async () => {
    installFetch({
      session: managerIdentity(),
      routes: {
        '/incidents': {
          incidents: [
            incident({
              status: 'resolved',
              resolved_by: 'vision-os',
              resolved_at: '2026-08-21T09:10:00+00:00',
              resolution_kind: 'observation',
              resolution_note: 'a later observation showed the rule satisfied',
            }),
          ],
          count: 1,
        },
      },
    });
    renderApp(<AppRouter />, '/incidents');

    await userEvent.click(await screen.findByRole('button', { name: 'Inspect' }));
    const drawer = await screen.findByRole('dialog');
    // "The system saw it fixed" must never read the same as "a manager said so".
    expect(within(drawer).getByText('vision-os (observation)')).toBeInTheDocument();
  });
});

/* ── evidence ─────────────────────────────────────────────────────────────── */

describe('the evidence page', () => {
  it('is a lookup, not a gallery', async () => {
    const calls: string[] = [];
    installFetch({ session: managerIdentity(), calls });
    renderApp(<AppRouter />, '/evidence');

    await screen.findByRole('heading', { name: 'Evidence' });
    expect(screen.getByText(/deliberately no gallery to browse/i)).toBeInTheDocument();
    // Nothing was fetched merely by arriving on the page.
    expect(calls.some((c) => c.includes('/evidence/'))).toBe(false);
  });

  it('does not fetch the image until somebody asks for it', async () => {
    const calls: string[] = [];
    installFetch({
      session: managerIdentity(),
      calls,
      routes: { '/evidence/ev-1': evidence() },
    });
    renderApp(<AppRouter />, '/evidence');

    await userEvent.type(await screen.findByLabelText(/evidence reference/i), 'ev-1');
    await userEvent.click(screen.getByRole('button', { name: 'Look up' }));

    await screen.findByText('blake2b:abc123');
    expect(document.querySelectorAll('img')).toHaveLength(0);
    expect(calls.some((c) => c.includes('/image'))).toBe(false);

    // And the button that would fetch it says the retrieval is recorded.
    expect(screen.getByRole('button', { name: /view image \(recorded\)/i })).toBeInTheDocument();
  });

  it('refuses expired evidence and explains that retention governs what is shown', async () => {
    installFetch({
      session: managerIdentity(),
      routes: { '/evidence/ev-1': evidence({ state: 'expired', servable: false }) },
    });
    renderApp(<AppRouter />, '/evidence');

    await userEvent.type(await screen.findByLabelText(/evidence reference/i), 'ev-1');
    await userEvent.click(screen.getByRole('button', { name: 'Look up' }));

    await screen.findByText('Expired');
    expect(screen.getByText(/no longer served/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /view image/i })).not.toBeInTheDocument();
  });

  it('keeps the tombstone visible after erasure', async () => {
    installFetch({
      session: managerIdentity(),
      routes: {
        '/evidence/ev-1': evidence({
          state: 'deleted',
          servable: false,
          size_bytes: 0,
          deleted_at: '2026-08-21T10:00:00+00:00',
          deleted_by: 'officer@example.com',
          deletion_reason: 'subject access request',
        }),
      },
    });
    renderApp(<AppRouter />, '/evidence');

    await userEvent.type(await screen.findByLabelText(/evidence reference/i), 'ev-1');
    await userEvent.click(screen.getByRole('button', { name: 'Look up' }));

    await screen.findByText('Erased');
    expect(screen.getByText('officer@example.com')).toBeInTheDocument();
    expect(screen.getByText('subject access request')).toBeInTheDocument();
    expect(screen.getByText(/a row that simply vanished would prove nothing/i)).toBeInTheDocument();
  });

  it('offers erasure only to an account that holds the delete privilege', async () => {
    installFetch({
      session: managerIdentity(), // view_evidence, not delete_evidence
      routes: { '/evidence/ev-1': evidence() },
    });
    renderApp(<AppRouter />, '/evidence');

    await userEvent.type(await screen.findByLabelText(/evidence reference/i), 'ev-1');
    await userEvent.click(screen.getByRole('button', { name: 'Look up' }));

    await screen.findByText('Retained');
    expect(screen.queryByRole('button', { name: /erase permanently/i })).not.toBeInTheDocument();
  });

  it('requires a reason before it will erase', async () => {
    installFetch({
      session: adminIdentity(),
      routes: { '/evidence/ev-1': evidence() },
    });
    renderApp(<AppRouter />, '/evidence');

    await userEvent.type(await screen.findByLabelText(/evidence reference/i), 'ev-1');
    await userEvent.click(screen.getByRole('button', { name: 'Look up' }));

    const erase = await screen.findByRole('button', { name: /erase permanently/i });
    expect(erase).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Reason'), 'retention decision');
    expect(screen.getByRole('button', { name: /erase permanently/i })).toBeEnabled();
  });
});

/* ── audit ────────────────────────────────────────────────────────────────── */

describe('the audit trail', () => {
  const events = {
    events: [
      {
        id: 'aud-1',
        actor: 'officer@example.com',
        actor_roles: ['hygiene_officer'],
        action: 'evidence.read',
        resource_type: 'evidence',
        resource_id: 'ev-1',
        outcome: 'success',
        occurred_at: '2026-08-21T09:05:00+00:00',
        request_id: 'req-1',
        detail: { camera_key: 'cam-01', size_bytes: 20480 },
      },
      {
        id: 'aud-2',
        actor: 'admin@example.com',
        actor_roles: ['org_admin'],
        action: 'camera.enabled',
        resource_type: 'camera',
        resource_id: 'cam-01',
        outcome: 'success',
        occurred_at: '2026-08-21T09:00:00+00:00',
        request_id: 'req-2',
        detail: {},
      },
    ],
    count: 2,
  };

  it('marks the rows that record access to somebody’s likeness', async () => {
    installFetch({ session: auditorIdentity(), routes: { '/audit': events } });
    renderApp(<AppRouter />, '/audit');

    await screen.findByRole('heading', { name: 'Audit Trail' });

    const imagery = screen.getByText('Imagery accesses').closest('section') as HTMLElement;
    expect(within(imagery).getByText('1')).toBeInTheDocument();
    // And the row itself is marked, so it need not be found by eye.
    expect(screen.getByText('Evidence viewed')).toBeInTheDocument();
    expect(screen.getByText('imagery')).toBeInTheDocument();
  });

  it('is unreachable without its own permission', async () => {
    installFetch({ session: managerIdentity(), routes: { '/audit': events } });
    renderApp(<AppRouter />, '/audit');

    // Redirected away rather than shown. A manager administers restaurants;
    // that is not authority to see who viewed whom.
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Audit Trail' })).not.toBeInTheDocument(),
    );
  });

  it('does not appear in navigation for an account that may not read it', async () => {
    installFetch({ session: managerIdentity() });
    renderApp(<AppRouter />, '/dashboard');

    await screen.findByRole('heading', { name: 'Command Center' });
    expect(screen.queryByRole('link', { name: /audit trail/i })).not.toBeInTheDocument();
  });
});

/* ── the dashboard, now that incidents are durable ────────────────────────── */

describe('the dashboard incident count', () => {
  beforeEach(() => vi.unstubAllGlobals());

  // The open-incident count is no longer a stat card among four equal ones. It
  // is the Command Center's primary attention region: one statement, at display
  // scale, about whether anything is wrong. The property being protected is the
  // same and slightly stronger — an unreachable store must produce a statement
  // of *unknown* at the same weight as a statement of violations, because
  // anything quieter teaches an operator that silence means safety.
  it('reports the real unresolved count once the store answers', async () => {
    installFetch({
      session: managerIdentity(),
      routes: {
        // Routed per status, because the Command Center now asks for both.
        // Reading only `active` was the previous bug: an acknowledged incident
        // is also unresolved, and it fell silently out of the figure while the
        // label claimed to count everything "raised and not yet resolved".
        '/incidents?status=active': { incidents: [incident()], count: 1 },
        '/incidents?status=acknowledged': {
          incidents: [incident({ id: 'inc-2', status: 'acknowledged' })],
          count: 1,
        },
      },
    });
    renderApp(<AppRouter />, '/dashboard');

    const attention = await screen.findByRole('region', { name: 'Primary attention' });
    await waitFor(() =>
      expect(within(attention).getByText(/2 violations are open/i)).toBeInTheDocument(),
    );
    expect(within(attention).getByText(/1 not yet acknowledged/i)).toBeInTheDocument();
    expect(within(attention).getByText(/1 acknowledged and still open/i)).toBeInTheDocument();
  });

  it('says the queue is unknown — never zero, never clear — when the store cannot be reached', async () => {
    installFetch({
      session: managerIdentity(),
      routes: { '/incidents': new Response('', { status: 503 }) },
    });
    renderApp(<AppRouter />, '/dashboard');

    const attention = await screen.findByRole('region', { name: 'Primary attention' });
    await waitFor(() =>
      expect(within(attention).getByText(/could not be read/i)).toBeInTheDocument(),
    );
    expect(within(attention).getByText(/not a report of zero/i)).toBeInTheDocument();
    // The one reading this must never produce.
    expect(within(attention).queryByText(/no compliance violation is currently open/i)).toBeNull();
  });

  it('claims the kitchen is clear only from a successful read', async () => {
    installFetch({
      session: managerIdentity(),
      routes: { '/incidents': { incidents: [], count: 0 } },
    });
    renderApp(<AppRouter />, '/dashboard');

    const attention = await screen.findByRole('region', { name: 'Primary attention' });
    await waitFor(() =>
      expect(
        within(attention).getByText(/no compliance violation is currently open/i),
      ).toBeInTheDocument(),
    );
  });
});

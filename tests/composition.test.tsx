/**
 * The composition layer: the link graph, and the primitives that refuse.
 *
 * Stage 1's headline finding was that nineteen pages shared exactly one link
 * between them. These cases assert the edges that turn them into a product —
 * and, just as importantly, that the new visual primitives kept the discipline
 * the old ones had: a proportion with no denominator is not drawn, and a value
 * that is not known is an em dash with a reason rather than a zero.
 */

import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRouter } from '@app/router/AppRouter';
import { Figure, Meter } from '@shared/ui/product';
import { adminIdentity, identity, installFetch, managerIdentity, renderApp } from './support';

function incidentRow(overrides: Record<string, unknown> = {}) {
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
    finding: {
      conditions: [{ attribute: 'head_covering', observed: 'none', outcome: 'failed' }],
    },
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

const EVIDENCE = {
  evidence_ref: 'ev-1',
  geometry: null,
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
};

/* ── the link graph ───────────────────────────────────────────────────────── */

describe('an incident is connected to the rest of the product', () => {
  it('links to the camera that raised it, and to each piece of evidence it cites', async () => {
    installFetch({
      session: managerIdentity(),
      routes: { '/incidents/inc-1': incidentRow() },
    });
    renderApp(<AppRouter />, '/incidents/inc-1');

    await screen.findByRole('heading', { name: 'No head covering at the prep bench' });

    // WHERE is a link, not a string. Before Stage 3 an incident named its
    // camera and offered no way to reach it.
    const cameraLinks = screen.getAllByRole('link', { name: 'cam-01' });
    expect(cameraLinks.length).toBeGreaterThan(0);
    expect(cameraLinks[0]).toHaveAttribute('href', '/cameras/cam-01');

    // Evidence handles are links for an account that may view evidence.
    expect(screen.getByRole('link', { name: 'ev-1' })).toHaveAttribute('href', '/evidence/ev-1');
  });

  it('renders an evidence handle as plain text for an account that may not view it', async () => {
    // A link that leads to a refusal is worse than no link: it advertises a
    // capability the account does not have.
    installFetch({
      session: identity({
        roles: ['restaurant_manager'],
        permissions: ['view_incidents', 'view_cameras'],
      }),
      routes: { '/incidents/inc-1': incidentRow() },
    });
    renderApp(<AppRouter />, '/incidents/inc-1');

    await screen.findByRole('heading', { name: 'No head covering at the prep bench' });
    expect(screen.queryByRole('link', { name: 'ev-1' })).not.toBeInTheDocument();
    expect(screen.getByText('ev-1')).toBeInTheDocument();
  });

  it('renders the frozen finding through the four-state badge, never as a verdict', async () => {
    installFetch({
      session: managerIdentity(),
      routes: { '/incidents/inc-1': incidentRow() },
    });
    renderApp(<AppRouter />, '/incidents/inc-1');

    await screen.findByRole('heading', { name: 'No head covering at the prep bench' });
    // `none` is a decided absence and the only state that may become a
    // violation. It is resolved by the shared semantics module, not by this
    // page.
    expect(screen.getByText('Head covering')).toBeInTheDocument();
    expect(screen.getByText('Absent')).toBeInTheDocument();
  });
});

describe('an evidence record can answer who else has seen it', () => {
  it('offers the audit trail for that record, scoped to it', async () => {
    installFetch({
      session: adminIdentity(),
      routes: { '/evidence/ev-1': EVIDENCE },
    });
    renderApp(<AppRouter />, '/evidence/ev-1');

    // `auditApi.forResource` has existed since Phase 1 with zero call sites, so
    // the product could not ask its own governance question. This is the edge
    // that makes it askable — no new endpoint.
    //
    // `findBy`, not `getBy` after the page title: the title renders before the
    // record query resolves, so awaiting it would prove nothing about the body.
    expect(await screen.findByRole('link', { name: /who else has viewed this/i })).toHaveAttribute(
      'href',
      '/audit?resource_type=evidence&resource_id=ev-1',
    );
  });

  it('hides that link from an account that may not read the trail', async () => {
    installFetch({
      session: managerIdentity(),
      routes: { '/evidence/ev-1': EVIDENCE },
    });
    renderApp(<AppRouter />, '/evidence/ev-1');

    // Wait for the record itself rather than the page title, so this cannot
    // pass merely because the body had not arrived yet.
    await screen.findByRole('link', { name: /the camera that captured it/i });
    expect(screen.queryByRole('link', { name: /who else has viewed this/i })).not.toBeInTheDocument();
  });
});

describe('the audit trail can be narrowed to one resource', () => {
  it('requests that resource rather than the whole trail', async () => {
    const calls: string[] = [];
    installFetch({
      session: adminIdentity(),
      calls,
      routes: { '/audit': { events: [], count: 0 } },
    });
    renderApp(<AppRouter />, '/audit?resource_type=evidence&resource_id=ev-1');

    await screen.findByRole('heading', { name: 'Audit Trail' });
    expect(
      calls.some((c) => c.includes('resource_type=evidence') && c.includes('resource_id=ev-1')),
    ).toBe(true);
    // And it says what an empty result means, which is not "access refused".
    expect(screen.getByText(/no event was recorded against it/i)).toBeInTheDocument();
  });
});

/* ── camera registration: recovery of a promise already in the copy ───────── */

describe('registering a camera', () => {
  it('is offered to an account that may configure cameras', async () => {
    installFetch({
      session: adminIdentity(),
      routes: { '/cameras': { cameras: [], enabled: 0, total: 0 } },
    });
    renderApp(<AppRouter />, '/cameras');

    // The page's empty state has told operators to "add a camera to begin"
    // since Phase 2 while offering no way to do it.
    expect(await screen.findByRole('button', { name: /register a camera/i })).toBeInTheDocument();
  });

  it('is not offered to an account that may only read the estate', async () => {
    installFetch({
      session: managerIdentity(),
      routes: { '/cameras': { cameras: [], enabled: 0, total: 0 } },
    });
    renderApp(<AppRouter />, '/cameras');

    await screen.findByRole('heading', { name: 'Cameras' });
    expect(screen.queryByRole('button', { name: /register a camera/i })).not.toBeInTheDocument();
  });

  it('creates the camera disabled, and has no field that could carry a password', async () => {
    const calls: string[] = [];
    installFetch({
      session: adminIdentity(),
      calls,
      routes: { '/cameras': { cameras: [], enabled: 0, total: 0 } },
    });
    renderApp(<AppRouter />, '/cameras');

    await userEvent.click(await screen.findByRole('button', { name: /register a camera/i }));
    const dialog = await screen.findByRole('dialog');

    // A credential *reference*, never a credential. The dialling URL is
    // assembled on the server from a secret it resolves itself.
    expect(within(dialog).getByLabelText(/credential reference/i)).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/^password$/i)).not.toBeInTheDocument();
    expect(dialog.querySelector('input[type="password"]')).toBeNull();
    expect(within(dialog).getByText(/will open no connection/i)).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText(/camera key/i), 'cam-09');
    await userEvent.type(within(dialog).getByLabelText(/restaurant/i), 'rest-01');
    await userEvent.click(within(dialog).getByRole('button', { name: /register, disabled/i }));

    expect(calls.some((c) => c.startsWith('POST') && c.includes('/cameras'))).toBe(true);
  });
});

/* ── the primitives keep the discipline ───────────────────────────────────── */

describe('a proportion is not drawn without a denominator', () => {
  it('renders the reason instead of an empty track', () => {
    // A stacked bar of zeros renders as an empty track, which reads exactly
    // like "all clear" — the single easiest way for a redesign to invent data.
    render(
      <Meter
        caption="Observation states"
        total={0}
        emptyNote="No attribute was observed in this window."
        segments={[
          { key: 'present', label: 'Present', value: 0, color: 'var(--state-present)' },
          { key: 'absent', label: 'Absent', value: 0, color: 'var(--state-absent)' },
        ]}
      />,
    );

    expect(screen.getByText(/no attribute was observed in this window/i)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('draws it, and names every segment in the accessible description, when there is one', () => {
    render(
      <Meter
        caption="Observation states"
        total={3}
        emptyNote="unused"
        segments={[
          { key: 'present', label: 'Present', value: 2, color: 'var(--state-present)' },
          { key: 'not_visible', label: 'Not visible', value: 1, color: 'var(--state-not-visible)' },
        ]}
      />,
    );

    // Colour is never the only signal: the same facts are in the accessible
    // name and in the legend beneath.
    expect(
      screen.getByRole('img', { name: /Observation states: 2 Present, 1 Not visible/ }),
    ).toBeInTheDocument();
  });
});

describe('a figure refuses a value it does not have', () => {
  it('renders an em dash and the reason, never a zero', () => {
    render(
      <Figure
        label="Producing frames"
        value={null}
        unavailableReason="No camera is configured yet"
        detail="should not be shown"
      />,
    );

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('No camera is configured yet')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.queryByText('should not be shown')).not.toBeInTheDocument();
  });

  it('renders a real zero when zero is the answer', () => {
    // The other half of the rule, and the half that is easy to lose: a measured
    // zero is a fact and must not be hidden behind an em dash.
    render(<Figure label="Open incidents" value={0} detail="Raised and not yet resolved" />);

    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });
});

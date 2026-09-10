/**
 * The information architecture, asserted structurally.
 *
 * Stage 1 found nineteen pages reachable only from a flat sidebar, one orphan
 * route no navigation pointed at, and a permission gate that disagreed with the
 * entry above it. Those are all *structural* faults: no screenshot shows them
 * and no single-page test catches them. So they are checked here, against the
 * navigation model and the router together, rather than one page at a time.
 */

import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { AppRouter } from '@app/router/AppRouter';
import {
  DEVTOOLS_ENTRY,
  PRODUCT_NAV,
  admits,
  allNavPaths,
  itemFor,
  visibleItems,
} from '@app/router/navigation';
import { PERMISSIONS, hasAll, hasAny, type Permission } from '@app/permissions/permissions';
import {
  adminIdentity,
  auditorIdentity,
  identity,
  installFetch,
  managerIdentity,
  renderApp,
  supervisorIdentity,
} from './support';

/* ── the model ────────────────────────────────────────────────────────────── */

describe('the navigation model', () => {
  it('groups every destination into exactly one area', () => {
    const seen = new Map<string, string>();
    for (const section of PRODUCT_NAV) {
      for (const item of section.items) {
        expect(seen.has(item.path), `${item.path} appears in two areas`).toBe(false);
        seen.set(item.path, section.id);
      }
    }
    expect(seen.size).toBe(allNavPaths().length);
  });

  it('has exactly one engineering area, and Vision OS is inside it', () => {
    const engineering = PRODUCT_NAV.filter((s) => s.register === 'engineering');
    expect(engineering).toHaveLength(1);
    expect(engineering[0]!.items.map((i) => i.id)).toContain('devtools');
    // The named export is a lookup into the model, not a parallel declaration —
    // so the two cannot disagree about which permission opens the door.
    expect(DEVTOOLS_ENTRY.permissions).toEqual([PERMISSIONS.accessDevtools]);
  });

  it('every area names the question it answers', () => {
    for (const section of PRODUCT_NAV) {
      expect(section.blurb.length, `${section.id} has no blurb`).toBeGreaterThan(0);
      expect(section.items.length, `${section.id} is empty`).toBeGreaterThan(0);
    }
  });

  it('marks a destination as awaiting or blocked only where the page says so', () => {
    // The marker is a static declaration, because a sidebar renders before any
    // query resolves. This is what stops it drifting: the set of entries
    // claiming to be unconnected must be exactly the set of routes whose page
    // is the awaiting shell.
    const marked = PRODUCT_NAV.flatMap((s) => s.items)
      .filter((i) => i.readiness && i.readiness !== 'live')
      .map((i) => i.path)
      .sort();

    const awaitingRoutes = [
      '/cutting-boards',
      '/demography',
      '/integrations/pos',
      '/meals',
      '/patron-id',
      '/people-counting',
      '/tables',
    ];

    expect(marked).toEqual(awaitingRoutes);
  });

  it('keeps awaiting and blocked distinct', () => {
    const patron = PRODUCT_NAV.flatMap((s) => s.items).find((i) => i.id === 'patron-id');
    const counting = PRODUCT_NAV.flatMap((s) => s.items).find((i) => i.id === 'people-counting');
    // Waiting for engineering work and waiting for a DPIA are different facts.
    // Flattening them would let the most sensitive module in the product read
    // like the least.
    expect(patron?.readiness).toBe('blocked');
    expect(counting?.readiness).toBe('awaiting');
  });
});

/* ── the gate and the entry agree ─────────────────────────────────────────── */

describe('navigation visibility and route access say the same thing', () => {
  it('runtime diagnostics demands both permissions, in the model and at the route', () => {
    const runtime = PRODUCT_NAV.flatMap((s) => s.items).find((i) => i.id === 'runtime');
    expect(runtime?.require).toBe('all');
    expect(runtime?.permissions).toEqual([PERMISSIONS.viewLive, PERMISSIONS.accessDevtools]);
  });

  it('a supervisor holding only view_live is refused the runtime page', async () => {
    // Before Stage 3 this account could reach it by typing the URL while the
    // navigation offered it to nobody at all. Hiding an entry is not closing a
    // door; this asserts the door.
    installFetch({ session: supervisorIdentity() });
    renderApp(<AppRouter />, '/live/runtime');

    await screen.findByRole('heading', { name: 'Command Center' });
    expect(screen.queryByRole('heading', { name: 'Runtime Diagnostics' })).not.toBeInTheDocument();
  });

  it('a developer holding both reaches it', async () => {
    installFetch({ session: identity() });
    renderApp(<AppRouter />, '/live/runtime');

    expect(await screen.findByRole('heading', { name: 'Runtime Diagnostics' })).toBeInTheDocument();
  });

  it('`admits` honours the require mode rather than defaulting to any', () => {
    const liveOnly = supervisorIdentity();
    const can = (permissions: Permission[], mode: 'any' | 'all') =>
      mode === 'all' ? hasAll(liveOnly, permissions) : hasAny(liveOnly, permissions);

    const runtime = PRODUCT_NAV.flatMap((s) => s.items).find((i) => i.id === 'runtime')!;
    expect(admits(runtime, can)).toBe(false);
  });
});

/* ── what each role actually sees ─────────────────────────────────────────── */

function areasFor(holder: ReturnType<typeof identity>) {
  const can = (permissions: Permission[], mode: 'any' | 'all' = 'any') =>
    permissions.length === 0 ||
    (mode === 'all' ? hasAll(holder, permissions) : hasAny(holder, permissions));
  return visibleItems(PRODUCT_NAV, can);
}

describe('role-shaped navigation', () => {
  it('an organization admin sees no engineering area at all', () => {
    // The Phase 4 correction, at the level of the whole sidebar rather than one
    // link: an org admin is an administrative role, not an engineering one.
    const areas = areasFor(adminIdentity());
    expect(areas.map((a) => a.id)).toEqual(['operations', 'compliance', 'intelligence', 'platform']);
    expect(areas.flatMap((a) => a.items).map((i) => i.id)).not.toContain('model-evaluation');
  });

  it('a developer gets a whole engineering area rather than one stray item', () => {
    const areas = areasFor(identity());
    const engineering = areas.find((a) => a.id === 'engineering');
    expect(engineering?.items.map((i) => i.id).sort()).toEqual([
      'devtools',
      'model-evaluation',
      'runtime',
    ]);
  });

  it('an auditor gets two whole areas rather than four fragments', () => {
    const areas = areasFor(auditorIdentity());
    expect(areas.map((a) => a.id)).toEqual(['operations', 'compliance']);
    // No Live Wall: an auditor reviews the record, and live monitoring is an
    // operational act with a different lawful basis.
    expect(areas.flatMap((a) => a.items).map((i) => i.id)).not.toContain('live');
  });

  it('a kitchen supervisor sees no intelligence area rather than an empty one', () => {
    const areas = areasFor(supervisorIdentity());
    expect(areas.map((a) => a.id)).not.toContain('intelligence');
  });
});

/* ── the register is visible ──────────────────────────────────────────────── */

describe('the engineering register', () => {
  it('marks an engineering route in the chrome, persistently', async () => {
    installFetch({ session: identity() });
    renderApp(<AppRouter />, '/model-evaluation');

    await screen.findByRole('heading', { name: 'Model Evaluation' });
    // Phase 0 asked for this and it was never built: a developer holding both
    // roles must always know which surface they are on, and a screenshot in a
    // bug report must be unambiguous.
    const chrome = screen.getByRole('banner', { name: 'Application' });
    expect(within(chrome).getByText('Engineering surface')).toBeInTheDocument();
  });

  it('does not mark an operations route', async () => {
    installFetch({ session: identity() });
    renderApp(<AppRouter />, '/dashboard');

    await screen.findByRole('heading', { name: 'Command Center' });
    const chrome = screen.getByRole('banner', { name: 'Application' });
    expect(within(chrome).queryByText('Engineering surface')).not.toBeInTheDocument();
  });

  it('resolves a route to its owning area', () => {
    expect(itemFor('/model-evaluation')?.section.register).toBe('engineering');
    expect(itemFor('/incidents')?.section.register).toBe('product');
    // An object route belongs to the list it came from, which is what lets the
    // breadcrumb offer a way back up.
    expect(itemFor('/incidents/inc-1')?.item.path).toBe('/incidents');
  });
});

/* ── the object routes ────────────────────────────────────────────────────── */

describe('object routes', () => {
  it('an incident has its own address, gated exactly like the list', async () => {
    installFetch({
      session: managerIdentity(),
      routes: {
        '/incidents/inc-1': {
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
          finding: { conditions: [{ attribute: 'head_covering', observed: 'none', outcome: 'failed' }] },
          evidence_refs: ['ev-1'],
          acknowledged_at: null,
          acknowledged_by: null,
          resolved_at: null,
          resolved_by: null,
          resolution_kind: null,
          resolution_note: null,
        },
      },
    });
    renderApp(<AppRouter />, '/incidents/inc-1');

    expect(
      await screen.findByRole('heading', { name: 'No head covering at the prep bench' }),
    ).toBeInTheDocument();
  });

  it('is refused to an account that cannot read incidents', async () => {
    installFetch({ session: identity({ permissions: ['view_observations'] }) });
    renderApp(<AppRouter />, '/incidents/inc-1');

    await screen.findByRole('heading', { name: 'Command Center' });
  });

  it('an evidence address resolves the record and fetches no image', async () => {
    const calls: string[] = [];
    installFetch({
      session: managerIdentity(),
      calls,
      routes: {
        '/evidence/ev-1': {
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
        },
      },
    });
    renderApp(<AppRouter />, '/evidence/ev-1');

    await screen.findByRole('heading', { name: 'Evidence record' });
    // The reason this route was allowed to exist. An address that retrieved the
    // picture on navigation would turn a link in an email into an audit row
    // against a named person's likeness, fired by a mail client's link preview.
    expect(calls.some((c) => c.includes('/image'))).toBe(false);
    expect(document.querySelectorAll('img')).toHaveLength(0);
  });
});

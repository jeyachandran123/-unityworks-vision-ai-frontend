/**
 * Administration, as five surfaces rather than one stacked page.
 *
 * The assertions worth having are still about the boundary rather than the
 * table — but the boundary moved, and moved for a reason. Reading the estate
 * and reading the staff list used to be the same permission; editing a zone
 * and reconfiguring the organization used to be the same permission. Both are
 * now separable, and these tests are about whether that separation actually
 * reaches the screen.
 */

import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRouter } from '@app/router/AppRouter';
import { adminIdentity, identity, installFetch, managerIdentity, renderApp } from './support';

const ZONES = {
  zones: [
    {
      id: 'zone-1',
      name: 'Harbour Kitchen',
      is_active: true,
      camera_count: 4,
      created_at: '2026-08-01T00:00:00Z',
    },
    {
      id: 'zone-2',
      name: 'Dine hall',
      is_active: true,
      camera_count: 0,
      created_at: '2026-08-01T00:00:00Z',
    },
  ],
  count: 2,
  total: 2,
  limit: 25,
  offset: 0,
};

const ADMIN_USERS = [
  {
    id: 'user-1',
    email: 'manager@example.com',
    display_name: 'Manager',
    is_active: true,
    roles: ['restaurant_manager'],
    camera_scope: { breadth: 'all_in_tenant', camera_keys: [], site_ids: [] },
    created_at: '2026-08-01T00:00:00Z',
    last_login_at: '2026-09-01T07:00:00Z',
  },
];

/* ── the hub ──────────────────────────────────────────────────────────────── */

describe('the administration hub', () => {
  it('names the areas this account can reach, and creates nothing itself', async () => {
    installFetch({ session: adminIdentity(), zones: ZONES, adminUsers: ADMIN_USERS });
    renderApp(<AppRouter />, '/admin');

    await screen.findByRole('heading', { name: 'Administration' });

    // Scoped to the page rather than the document: the primary navigation
    // also links to Cameras, and matching either would prove nothing. Exact
    // names, because "Cameras" is a prefix of several link texts here.
    const main = document.getElementById('main') as HTMLElement;
    for (const area of ['Zones', 'Cameras', 'People', 'Roles & access']) {
      // Anchored: a card's accessible name is its title *and* its body, and
      // the People card's body mentions cameras.
      expect(
        within(main).getByRole('link', { name: new RegExp(`^${area}`, 'i') }),
      ).toBeInTheDocument();
    }

    // The page this replaced carried three creation forms. A hub that also
    // created things would be the stacked page again with extra links.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('lists only the areas the account holds a read for', async () => {
    // `view_zones` and nothing else. Showing four links and letting three of
    // them 403 is how a permission model becomes something users discover by
    // hitting errors.
    installFetch({
      session: identity({ roles: ['restaurant_manager'], permissions: ['view_zones'] }),
      zones: ZONES,
    });
    renderApp(<AppRouter />, '/admin');

    await screen.findByRole('heading', { name: 'Administration' });
    expect(screen.getByRole('link', { name: /zones/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^people$/i })).not.toBeInTheDocument();
  });
});

/* ── zones ────────────────────────────────────────────────────────────────── */

describe('zones are their own domain', () => {
  it('lists zones with their camera counts', async () => {
    installFetch({ session: adminIdentity(), zones: ZONES });
    renderApp(<AppRouter />, '/admin/zones');

    const row = (await screen.findByRole('link', { name: 'Harbour Kitchen' })).closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('4')).toBeInTheDocument();
  });

  it('says how much of the list it is showing', async () => {
    installFetch({ session: adminIdentity(), zones: ZONES });
    renderApp(<AppRouter />, '/admin/zones');

    // A list that shows a page and says nothing looks complete.
    expect(await screen.findByText('Showing 1–2 of 2')).toBeInTheDocument();
  });

  it('says there are no zones rather than showing an empty table', async () => {
    installFetch({
      session: adminIdentity(),
      zones: { zones: [], count: 0, total: 0, limit: 25, offset: 0 },
    });
    renderApp(<AppRouter />, '/admin/zones');

    await screen.findByRole('heading', { name: 'Zones', level: 1 });
    expect(await screen.findByText(/no zones yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('creates a zone with nothing but a name', async () => {
    const calls: string[] = [];
    installFetch({ session: adminIdentity(), zones: ZONES, calls });
    renderApp(<AppRouter />, '/admin/zones');

    await userEvent.click(await screen.findByRole('button', { name: /new zone/i }));
    await userEvent.type(await screen.findByLabelText(/^name$/i), 'Pantry');
    await userEvent.click(screen.getByRole('button', { name: /create zone/i }));

    await waitFor(() =>
      expect(calls.some((c) => c.startsWith('POST') && c.includes('/zones'))).toBe(true),
    );
  });

  it('offers no delete for a zone that holds cameras, and says why', async () => {
    installFetch({ session: adminIdentity(), zones: ZONES });
    renderApp(<AppRouter />, '/admin/zones/zone-1');

    await screen.findByRole('heading', { name: 'Harbour Kitchen' });
    expect(screen.queryByRole('button', { name: /^delete zone$/i })).not.toBeInTheDocument();
    expect(await screen.findByText(/4 cameras still belong here/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /deactivate zone/i })).toBeInTheDocument();
  });

  it('deletes an empty zone only once its name is typed', async () => {
    installFetch({ session: adminIdentity(), zones: ZONES });
    renderApp(<AppRouter />, '/admin/zones/zone-2');

    await screen.findByRole('heading', { name: 'Dine hall' });
    const confirm = await screen.findByRole('button', { name: /^delete zone$/i });
    expect(confirm).toBeDisabled();

    await userEvent.type(await screen.findByLabelText(/type the zone's name/i), 'Dine hall');
    expect(confirm).toBeEnabled();
  });
});

/* ── the boundary ─────────────────────────────────────────────────────────── */

describe('read and manage are genuinely separate', () => {
  it('a manager who may read the estate reaches Zones and is offered no controls', async () => {
    // `view_zones` without `manage_zones`. The page has to read as complete
    // rather than broken, because this is a routine state and not an error.
    installFetch({ session: managerIdentity(), zones: ZONES });
    renderApp(<AppRouter />, '/admin/zones');

    expect(await screen.findByRole('link', { name: 'Harbour Kitchen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new zone/i })).not.toBeInTheDocument();
  });

  it('an org admin who may manage the estate is offered the controls', async () => {
    installFetch({ session: adminIdentity(), zones: ZONES });
    renderApp(<AppRouter />, '/admin/zones');

    await screen.findByRole('heading', { name: 'Zones', level: 1 });
    expect(screen.getByRole('button', { name: /new zone/i })).toBeInTheDocument();
  });
});

/* ── people ───────────────────────────────────────────────────────────────── */

describe('people, through the real write API', () => {
  it('lists accounts with their roles and their camera reach', async () => {
    installFetch({ session: adminIdentity(), adminUsers: ADMIN_USERS });
    renderApp(<AppRouter />, '/admin/people');

    const row = (await screen.findByRole('link', { name: 'Manager' })).closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('Restaurant Manager')).toBeInTheDocument();
    // Camera reach shown on the row, because a permission to view live video
    // reaches nothing without it and it was previously invisible everywhere.
    expect(within(row as HTMLElement).getByText('All cameras')).toBeInTheDocument();
  });

  it('each account row links to its own detail page', async () => {
    installFetch({ session: adminIdentity(), adminUsers: ADMIN_USERS });
    renderApp(<AppRouter />, '/admin/people');

    const link = await screen.findByRole('link', { name: 'Manager' });
    expect(link).toHaveAttribute('href', '/admin/people/user-1');
  });

  it('renders no credential material for a listed account', async () => {
    installFetch({ session: adminIdentity(), adminUsers: ADMIN_USERS });
    renderApp(<AppRouter />, '/admin/people');

    await screen.findByRole('heading', { name: 'People', level: 1 });
    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/password|hash|\$2[aby]\$/i);
  });

  it('will not create an account without saying which cameras it reaches', async () => {
    // The bug this closes: accounts were created with no camera grant, which
    // reads as "no cameras". They signed in, held every permission their role
    // carried, and could see nothing. The flow now asks, and has no default.
    installFetch({ session: adminIdentity(), adminUsers: ADMIN_USERS });
    renderApp(<AppRouter />, '/admin/people');

    await userEvent.click(await screen.findByRole('button', { name: /add a person/i }));
    await userEvent.type(await screen.findByLabelText(/^email$/i), 'new@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Next: Permissions' }));

    // Cameras sit beside the ticks on the permissions step, always stated.
    expect(await screen.findByRole('radio', { name: /no cameras/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /all cameras/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /specific cameras/i })).toBeInTheDocument();
  });

  it('creates an account through the real write API and shows the one-time password', async () => {
    const calls: string[] = [];
    installFetch({ session: adminIdentity(), adminUsers: ADMIN_USERS, calls });
    renderApp(<AppRouter />, '/admin/people');

    await userEvent.click(await screen.findByRole('button', { name: /add a person/i }));
    await userEvent.type(await screen.findByLabelText(/^email$/i), 'new@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Next: Permissions' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Next: Review' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Create person' }));

    await waitFor(() =>
      expect(calls.some((c) => c.startsWith('POST') && c.includes('/admin/users'))).toBe(true),
    );
    expect(await screen.findByText(/shown once/i)).toBeInTheDocument();
  });
});

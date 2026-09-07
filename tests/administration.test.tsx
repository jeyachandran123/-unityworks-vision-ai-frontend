/**
 * Administration, as five surfaces rather than one stacked page.
 *
 * The assertions worth having are still about the boundary rather than the
 * table — but the boundary moved, and moved for a reason. Reading the estate
 * and reading the staff list used to be the same permission; editing a zone
 * and reconfiguring the organisation used to be the same permission. Both are
 * now separable, and these tests are about whether that separation actually
 * reaches the screen.
 */

import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRouter } from '@app/router/AppRouter';
import { adminIdentity, identity, installFetch, managerIdentity, renderApp } from './support';

const SITES = {
  restaurants: [
    {
      id: 'rest-1',
      name: 'Harbour Kitchen',
      slug: 'harbour-kitchen',
      timezone: 'Asia/Singapore',
      is_active: true,
      created_at: '2026-08-01T00:00:00Z',
      zone_count: 2,
      camera_count: 4,
    },
  ],
  count: 1,
  total: 1,
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
    installFetch({ session: adminIdentity(), restaurants: SITES, adminUsers: ADMIN_USERS });
    renderApp(<AppRouter />, '/admin');

    await screen.findByRole('heading', { name: 'Administration' });

    // Scoped to the page rather than the document: the primary navigation
    // also links to Cameras, and matching either would prove nothing. Exact
    // names, because "Cameras" is a prefix of several link texts here.
    const main = document.getElementById('main') as HTMLElement;
    for (const area of ['Sites', 'Cameras', 'People', 'Roles & access']) {
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
    // `view_sites` and nothing else. Showing four links and letting three of
    // them 403 is how a permission model becomes something users discover by
    // hitting errors.
    installFetch({
      session: identity({ roles: ['restaurant_manager'], permissions: ['view_sites'] }),
      restaurants: SITES,
    });
    renderApp(<AppRouter />, '/admin');

    await screen.findByRole('heading', { name: 'Administration' });
    expect(screen.getByRole('link', { name: /sites/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^people$/i })).not.toBeInTheDocument();
  });
});

/* ── sites ────────────────────────────────────────────────────────────────── */

describe('sites are their own domain', () => {
  it('lists sites with their zone and camera counts', async () => {
    installFetch({ session: adminIdentity(), restaurants: SITES });
    renderApp(<AppRouter />, '/admin/sites');

    const row = (await screen.findByRole('link', { name: 'Harbour Kitchen' })).closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('2')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText('4')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText('Asia/Singapore')).toBeInTheDocument();
  });

  it('says there are no sites rather than showing an empty table', async () => {
    installFetch({
      session: adminIdentity(),
      restaurants: { restaurants: [], count: 0, total: 0, limit: 25, offset: 0 },
    });
    renderApp(<AppRouter />, '/admin/sites');

    await screen.findByRole('heading', { name: 'Sites' });
    expect(await screen.findByText(/no sites yet/i)).toBeInTheDocument();
  });

  it('collects the timezone at creation rather than defaulting it silently', async () => {
    // The site's timezone decides what a day means. Defaulted to UTC and never
    // shown, a restaurant in Chennai files reports five and a half hours wrong
    // and they look right.
    installFetch({ session: adminIdentity(), restaurants: SITES });
    renderApp(<AppRouter />, '/admin/sites');

    await userEvent.click(await screen.findByRole('button', { name: /add a site/i }));
    const timezone = await screen.findByLabelText(/timezone/i);
    expect(timezone.tagName).toBe('SELECT');
  });

  it('creates a site through the organisation API', async () => {
    const calls: string[] = [];
    installFetch({ session: adminIdentity(), restaurants: SITES, calls });
    renderApp(<AppRouter />, '/admin/sites');

    await userEvent.click(await screen.findByRole('button', { name: /add a site/i }));
    await userEvent.type(await screen.findByLabelText(/^name$/i), 'Adyar');
    await userEvent.click(screen.getByRole('button', { name: /^add site$/i }));

    await waitFor(() =>
      expect(calls.some((c) => c.startsWith('POST') && c.includes('/restaurants'))).toBe(true),
    );
  });
});

/* ── the boundary ─────────────────────────────────────────────────────────── */

describe('read and manage are genuinely separate', () => {
  it('a manager who may read the estate reaches Sites and is offered no controls', async () => {
    // The case that could not be expressed at all before: `view_sites` without
    // `manage_sites`. The page has to read as complete rather than broken,
    // because this is a routine state and not an error.
    installFetch({ session: managerIdentity(), restaurants: SITES });
    renderApp(<AppRouter />, '/admin/sites');

    expect(await screen.findByRole('link', { name: 'Harbour Kitchen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add a site/i })).not.toBeInTheDocument();
  });

  it('an org admin who may manage the estate is offered the controls', async () => {
    installFetch({ session: adminIdentity(), restaurants: SITES });
    renderApp(<AppRouter />, '/admin/sites');

    await screen.findByRole('heading', { name: 'Sites' });
    expect(screen.getByRole('button', { name: /add a site/i })).toBeInTheDocument();
  });

  it("says why a site's settings are read-only rather than showing a dead form", async () => {
    installFetch({ session: managerIdentity(), restaurants: SITES });
    renderApp(<AppRouter />, '/admin/sites/rest-1/settings');

    expect(await screen.findByText(/manage_sites/)).toBeInTheDocument();
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

    await screen.findByRole('heading', { name: 'People' });
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
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    await userEvent.click(await screen.findByRole('button', { name: /continue/i }));

    // Step three is cameras, and it is not skippable.
    expect(await screen.findByRole('radio', { name: /no cameras/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /all cameras/i })).toBeInTheDocument();
  });

  it('creates an account through the real write API and shows the one-time password', async () => {
    const calls: string[] = [];
    installFetch({ session: adminIdentity(), adminUsers: ADMIN_USERS, calls });
    renderApp(<AppRouter />, '/admin/people');

    await userEvent.click(await screen.findByRole('button', { name: /add a person/i }));
    await userEvent.type(await screen.findByLabelText(/^email$/i), 'new@example.com');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    await userEvent.click(await screen.findByRole('button', { name: /continue/i }));
    await userEvent.click(await screen.findByRole('button', { name: /continue/i }));
    await userEvent.click(await screen.findByRole('button', { name: /create account/i }));

    await waitFor(() =>
      expect(calls.some((c) => c.startsWith('POST') && c.includes('/admin/users'))).toBe(true),
    );
    expect(await screen.findByText(/shown once/i)).toBeInTheDocument();
  });
});

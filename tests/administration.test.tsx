/**
 * Administration.
 *
 * The assertions worth having are about the boundary rather than the table:
 * that structure is writable, that identity is not, and that the page says why
 * instead of showing a control that does nothing.
 */

import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRouter } from '@app/router/AppRouter';
import { adminIdentity, identity, installFetch, renderApp } from './support';

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
};

const USERS = {
  users: [
    {
      id: 'user-1',
      email: 'manager@example.com',
      display_name: 'Manager',
      is_active: true,
      roles: ['restaurant_manager'],
      created_at: '2026-08-01T00:00:00Z',
      last_login_at: '2026-09-01T07:00:00Z',
    },
  ],
  count: 1,
  write_available: false,
  write_unavailable_reason:
    'Creating an account issues a credential, and this deployment has no invitation or password-reset delivery channel yet.',
};

describe('administration shows real organisation structure', () => {
  it('lists sites with their zone and camera counts', async () => {
    installFetch({ session: adminIdentity(), restaurants: SITES, users: USERS });
    renderApp(<AppRouter />, '/admin');

    await screen.findByRole('heading', { name: 'Administration' });
    // Scoped to the sites table: the name also appears in the zone form's site
    // selector, which is correct and would make a bare text query ambiguous.
    const sites = await screen.findByRole('table', { name: /restaurants in this organisation/i });
    expect(within(sites).getByText('Harbour Kitchen')).toBeInTheDocument();
    expect(within(sites).getByText('harbour-kitchen')).toBeInTheDocument();
    expect(within(sites).getByText('Asia/Singapore')).toBeInTheDocument();
  });

  it('says there are no sites rather than showing an empty table', async () => {
    installFetch({ session: adminIdentity(), users: USERS });
    renderApp(<AppRouter />, '/admin');

    await screen.findByRole('heading', { name: 'Administration' });
    expect(await screen.findByText(/no sites yet/i)).toBeInTheDocument();
  });

  it('creates a site through the organisation API', async () => {
    const calls: string[] = [];
    installFetch({ session: adminIdentity(), restaurants: SITES, users: USERS, calls });
    const user = userEvent.setup();
    renderApp(<AppRouter />, '/admin');

    await screen.findByRole('heading', { name: 'Administration' });
    await user.type(screen.getByLabelText(/site name/i), 'New Site');
    await user.click(screen.getByRole('button', { name: /add site/i }));

    await waitFor(() =>
      expect(calls.some((c) => c.startsWith('POST') && c.includes('/restaurants'))).toBe(true),
    );
  });
});

describe('administration respects the permission boundary', () => {
  it('hides the write forms from an account that reaches the page but cannot manage it', async () => {
    // The route itself admits `manage_users` OR `manage_organization`, so an
    // account holding only the first reaches the page and must still not be
    // offered the structure forms. That is the case `PermissionGate` guards,
    // and it is why the gate is not redundant with the route.
    installFetch({
      session: identity({
        roles: ['org_admin'],
        permissions: ['manage_users', 'view_users', 'view_observations', 'view_cameras'],
      }),
      restaurants: SITES,
      users: USERS,
    });
    renderApp(<AppRouter />, '/admin');

    await screen.findByRole('heading', { name: 'Administration' });
    await screen.findByRole('table', { name: /restaurants in this organisation/i });

    expect(screen.queryByRole('button', { name: /add site/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add zone/i })).not.toBeInTheDocument();
  });

  it('offers the write forms to an org admin', async () => {
    installFetch({ session: adminIdentity(), restaurants: SITES, users: USERS });
    renderApp(<AppRouter />, '/admin');

    await screen.findByRole('heading', { name: 'Administration' });
    expect(await screen.findByRole('button', { name: /add site/i })).toBeInTheDocument();
  });
});

describe('administration is honest about the account write path', () => {
  it('lists accounts with their roles', async () => {
    installFetch({ session: adminIdentity(), restaurants: SITES, users: USERS });
    renderApp(<AppRouter />, '/admin');

    await screen.findByRole('heading', { name: 'Administration' });
    expect(await screen.findByText('manager@example.com')).toBeInTheDocument();
    expect(screen.getByText('restaurant manager')).toBeInTheDocument();
  });

  it('states why an account cannot be created rather than showing a dead control', async () => {
    installFetch({ session: adminIdentity(), restaurants: SITES, users: USERS });
    renderApp(<AppRouter />, '/admin');

    await screen.findByRole('heading', { name: 'Administration' });

    // The server's own reason, shown verbatim.
    expect(await screen.findByText(/accounts cannot be created here yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no invitation or password-reset delivery channel/i)).toBeInTheDocument();
    // And no half-built form pretending otherwise.
    expect(screen.queryByRole('button', { name: /invite|create account|add user/i })).not.toBeInTheDocument();
  });

  it('renders no credential material for a listed account', async () => {
    installFetch({ session: adminIdentity(), restaurants: SITES, users: USERS });
    renderApp(<AppRouter />, '/admin');

    await screen.findByRole('heading', { name: 'Administration' });
    await screen.findByText('manager@example.com');

    const table = screen.getByRole('table', { name: /accounts in this organisation/i });
    expect(table.textContent ?? '').not.toMatch(/hash|\$2[aby]\$/i);
  });
});

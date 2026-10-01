/**
 * The user detail route, `/admin/users/:userId`.
 *
 * Covers navigation from the Accounts table, the ranked identity/account then
 * access hierarchy, the activate/deactivate confirmation policy, that a failed
 * access read never shows a guessed grid, the 403/unauthorized redirect, and
 * one structural assertion consistent with `command-center.test.tsx`'s own
 * approach: jsdom has no real layout, so what is asserted is the composition
 * that makes the ranked hierarchy possible, not pixel geometry.
 *
 * The access grid itself — ticking, review and save, what an administrator may
 * give, specific cameras — is `tenant-access.test.tsx`.
 */

import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRouter } from '@app/router/AppRouter';
import { adminIdentity, identity, installFetch, renderApp, ALL_PERMISSIONS } from './support';

const MANAGER = {
  id: 'user-1',
  email: 'manager@example.com',
  display_name: 'Manager',
  is_active: true,
  roles: ['restaurant_manager'],
  created_at: '2026-08-01T00:00:00Z',
  last_login_at: '2026-09-01T07:00:00Z',
};

const INACTIVE = {
  id: 'user-2',
  email: 'inactive@example.com',
  display_name: '',
  is_active: false,
  roles: ['kitchen_supervisor'],
  created_at: '2026-08-01T00:00:00Z',
  last_login_at: null,
};

const ADMIN_SELF = {
  id: 'user-admin',
  email: 'admin@example.com',
  display_name: 'Org Admin',
  is_active: true,
  roles: ['org_admin'],
  created_at: '2026-08-01T00:00:00Z',
  last_login_at: '2026-09-02T00:00:00Z',
};

function permRows(overrides: Record<string, Partial<{ state: 'inherit' | 'grant' | 'revoke'; role_grants: boolean; effective: boolean }>> = {}) {
  return ALL_PERMISSIONS.map((permission) => ({
    permission,
    state: 'inherit' as const,
    role_grants: false,
    effective: false,
    ...overrides[permission],
  }));
}

describe('navigating to a user from the Accounts table', () => {
  it('reaches the detail page and shows identity, account state and roles', async () => {
    // From People, which is where the roster lives now. `/admin` is a hub
    // that links to it rather than a page that contains it.
    installFetch({ session: adminIdentity(), adminUsers: [MANAGER, ADMIN_SELF] });
    const user = userEvent.setup();
    renderApp(<AppRouter />, '/admin/people');

    await screen.findByRole('heading', { name: 'People', level: 1 });
    await user.click(await screen.findByRole('link', { name: /manager/i }));

    await screen.findByRole('heading', { name: /manager/i });
    expect(screen.getAllByText('manager@example.com').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Restaurant Manager').length).toBeGreaterThan(0);
  });
});

describe('user detail: identity and account', () => {
  it('shows a disabled account and offers Activate, not Deactivate', async () => {
    installFetch({
      session: adminIdentity(),
      adminUsers: [INACTIVE],
      adminUserPermissions: { 'user-2': permRows() },
    });
    renderApp(<AppRouter />, '/admin/users/user-2');

    await screen.findByRole('heading', { name: 'inactive@example.com' });
    expect(screen.getAllByText('Disabled').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Activate' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument();
  });

  it('activates directly, with no confirmation', async () => {
    const calls: string[] = [];
    installFetch({
      session: adminIdentity(),
      adminUsers: [INACTIVE],
      adminUserPermissions: { 'user-2': permRows() },
      calls,
    });
    const user = userEvent.setup();
    renderApp(<AppRouter />, '/admin/users/user-2');

    await screen.findByRole('heading', { name: 'inactive@example.com' });
    await user.click(screen.getByRole('button', { name: 'Activate' }));

    await waitFor(() =>
      expect(calls.some((c) => c.startsWith('POST') && c.includes('/admin/users/user-2/activate'))).toBe(
        true,
      ),
    );
  });

  it('deactivate requires confirmation before the request is sent', async () => {
    const calls: string[] = [];
    installFetch({
      session: adminIdentity(),
      adminUsers: [MANAGER],
      adminUserPermissions: { 'user-1': permRows() },
      calls,
    });
    const user = userEvent.setup();
    renderApp(<AppRouter />, '/admin/users/user-1');

    await screen.findByRole('heading', { name: /manager/i });
    await user.click(screen.getByRole('button', { name: 'Deactivate' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/signed out and refused login immediately/i)).toBeInTheDocument();
    expect(calls.some((c) => c.includes('/deactivate'))).toBe(false);

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(calls.some((c) => c.includes('/deactivate'))).toBe(false);
  });

  it('confirming deactivation sends the request', async () => {
    const calls: string[] = [];
    installFetch({
      session: adminIdentity(),
      adminUsers: [MANAGER],
      adminUserPermissions: { 'user-1': permRows() },
      calls,
    });
    const user = userEvent.setup();
    renderApp(<AppRouter />, '/admin/users/user-1');

    await screen.findByRole('heading', { name: /manager/i });
    await user.click(screen.getByRole('button', { name: 'Deactivate' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }));

    await waitFor(() =>
      expect(calls.some((c) => c.startsWith('POST') && c.includes('/admin/users/user-1/deactivate'))).toBe(
        true,
      ),
    );
  });

  it('disables self-deactivation and explains why', async () => {
    installFetch({
      session: adminIdentity(),
      adminUsers: [ADMIN_SELF],
      adminUserPermissions: { 'user-admin': permRows() },
    });
    renderApp(<AppRouter />, '/admin/users/user-admin');

    await screen.findByRole('heading', { name: /org admin/i });
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeDisabled();
    expect(screen.getByText(/access and activation state cannot be changed/i)).toBeInTheDocument();
  });
});

describe('user detail: access', () => {
  it('never shows a guessed grid when the access read fails', async () => {
    installFetch({
      session: adminIdentity(),
      adminUsers: [MANAGER],
      routes: { '/admin/users/user-1/access': new Response(null, { status: 500 }) },
    });
    renderApp(<AppRouter />, '/admin/users/user-1');

    await screen.findByRole('heading', { name: /manager/i });
    await screen.findByText(/did not complete|went wrong/i);
    expect(screen.queryByRole('checkbox', { name: 'View — Live Wall' })).not.toBeInTheDocument();
  });
});

describe('user detail: authorization boundary', () => {
  it('redirects an account without manage_users away from the page', async () => {
    installFetch({
      session: identity({
        roles: ['restaurant_manager'],
        permissions: ['view_users', 'view_observations'],
      }),
      adminUsers: [MANAGER],
    });
    renderApp(<AppRouter />, '/admin/users/user-1');

    await waitFor(() => expect(screen.queryByText(/manager@example\.com/)).not.toBeInTheDocument());
  });

  it('shows a not-found state for a user id that does not resolve', async () => {
    installFetch({ session: adminIdentity(), adminUsers: [] });
    renderApp(<AppRouter />, '/admin/users/does-not-exist');

    expect(await screen.findByText(/no account with that id/i)).toBeInTheDocument();
  });
});

describe('user detail: structural composition', () => {
  it('renders two ranked sections, with identity/account as the lead', async () => {
    installFetch({
      session: adminIdentity(),
      adminUsers: [MANAGER],
      adminUserPermissions: { 'user-1': permRows() },
    });
    renderApp(<AppRouter />, '/admin/users/user-1');

    await screen.findByRole('heading', { name: /manager/i });

    // PageIntro plus two SectionRules: Identity & account, then Access —
    // structural evidence of the ranked (not equal-weight) composition. jsdom
    // has no layout engine, so this is what can be pinned here; true visual
    // verification is deferred (see report §19/§24).
    const marks = document.querySelectorAll('.uwv-section-head');
    expect(marks.length).toBeGreaterThanOrEqual(3);

    const lead = document.querySelector('[data-lead="true"][data-order="2"]');
    expect(lead).not.toBeNull();
    expect(lead?.textContent ?? '').toMatch(/identity & account/i);

    const orders = [...document.querySelectorAll('[data-order]')].map((el) =>
      el.getAttribute('data-order'),
    );
    expect(orders).toEqual(expect.arrayContaining(['1', '2', '3']));
  });
});

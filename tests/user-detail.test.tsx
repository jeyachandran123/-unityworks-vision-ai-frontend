/**
 * The user detail route, `/admin/users/:userId`.
 *
 * Covers navigation from the Accounts table, the ranked identity/account/
 * roles/access hierarchy, the activate/deactivate confirmation policy, role
 * assign/remove (including the admin-carrying-role confirmation), the
 * INHERIT/GRANT/REVOKE override controls and their labels, the anti-
 * escalation GRANT gate, the 403/unauthorized redirect, and one structural
 * assertion consistent with `command-center.test.tsx`'s own approach: jsdom
 * has no real layout, so what is asserted is the composition that makes the
 * ranked hierarchy possible (four sections, one of them `data-lead`), not
 * pixel geometry.
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

    await screen.findByRole('heading', { name: 'People' });
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
    expect(screen.getByText(/your own account/i)).toBeInTheDocument();
  });
});

describe('user detail: roles', () => {
  it('assigns a role through the real role API', async () => {
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
    await user.selectOptions(screen.getByLabelText(/assign a role/i), 'kitchen_supervisor');
    await user.click(screen.getByRole('button', { name: 'Assign' }));

    await waitFor(() =>
      expect(
        calls.some((c) => c.startsWith('POST') && c.includes('/admin/users/user-1/roles')),
      ).toBe(true),
    );
  });

  it('removes a non-admin-carrying role without confirmation', async () => {
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
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.startsWith('DELETE') && c.includes('/admin/users/user-1/roles/restaurant_manager'),
        ),
      ).toBe(true),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('removing an admin-carrying role requires confirmation', async () => {
    const calls: string[] = [];
    const target = {
      ...ADMIN_SELF,
      id: 'user-3',
      email: 'other-admin@example.com',
      display_name: 'Other Admin',
    };
    installFetch({
      session: adminIdentity(),
      adminUsers: [target],
      adminUserPermissions: { 'user-3': permRows() },
      calls,
    });
    const user = userEvent.setup();
    renderApp(<AppRouter />, '/admin/users/user-3');

    await screen.findByRole('heading', { name: /other admin/i });
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/administration-level access/i),
    ).toBeInTheDocument();
    expect(calls.some((c) => c.includes('/roles/org_admin') && c.startsWith('DELETE'))).toBe(false);

    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() =>
      expect(calls.some((c) => c.includes('/roles/org_admin') && c.startsWith('DELETE'))).toBe(true),
    );
  });
});

describe('user detail: permission overrides', () => {
  it('shows Inherited by default, with the role-derived state alongside it', async () => {
    installFetch({
      session: adminIdentity(),
      adminUsers: [MANAGER],
      adminUserPermissions: {
        'user-1': permRows({ view_live: { role_grants: true, effective: true } }),
      },
    });
    renderApp(<AppRouter />, '/admin/users/user-1');

    await screen.findByRole('heading', { name: /manager/i });
    expect(await screen.findByText('Role grants')).toBeInTheDocument();
    expect(screen.getAllByText('Inherited').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Effective').length).toBeGreaterThan(0);
  });

  it('GRANT is offered only for a permission the acting admin holds themselves', async () => {
    // adminIdentity() holds `register_demand` but not `access_devtools` — the
    // two rows in the Engineering group split exactly the case this test
    // needs: one row must offer "+ Add", the other must not.
    installFetch({
      session: adminIdentity(),
      adminUsers: [MANAGER],
      adminUserPermissions: { 'user-1': permRows() },
    });
    renderApp(<AppRouter />, '/admin/users/user-1');

    await screen.findByRole('heading', { name: /manager/i });
    const table = await screen.findByRole('table', { name: /engineering permissions/i });
    const devtoolsRow = within(table).getByText('Access devtools').closest('tr') as HTMLElement;
    const demandRow = within(table).getByText('Register demand').closest('tr') as HTMLElement;

    expect(within(devtoolsRow).queryByRole('button', { name: '+ Add' })).not.toBeInTheDocument();
    expect(within(devtoolsRow).getByRole('button', { name: '− Restrict' })).toBeInTheDocument();
    expect(within(demandRow).getByRole('button', { name: '+ Add' })).toBeInTheDocument();
  });

  it('setting GRANT calls the real override API and reflects the new state after refetch', async () => {
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
    const table = await screen.findByRole('table', { name: /evidence & audit permissions/i });
    const row = within(table).getByText('View audit').closest('tr') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: '+ Add' }));

    await waitFor(() =>
      expect(
        calls.some(
          (c) => c.includes('/admin/users/user-1/permissions/view_audit') && c.startsWith('PUT'),
        ),
      ).toBe(true),
    );
    expect(await within(table).findByText('+ Added')).toBeInTheDocument();
  });

  it('resetting an override calls DELETE and returns to Inherited', async () => {
    const calls: string[] = [];
    installFetch({
      session: adminIdentity(),
      adminUsers: [MANAGER],
      adminUserPermissions: {
        'user-1': permRows({ view_evidence: { state: 'revoke', effective: false } }),
      },
      calls,
    });
    const user = userEvent.setup();
    renderApp(<AppRouter />, '/admin/users/user-1');

    await screen.findByRole('heading', { name: /manager/i });
    expect(await screen.findByText('− Restricted')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reset to inherited' }));

    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.includes('/admin/users/user-1/permissions/view_evidence') && c.startsWith('DELETE'),
        ),
      ).toBe(true),
    );
  });

  it('never shows guessed access when the permission read fails', async () => {
    installFetch({
      session: adminIdentity(),
      adminUsers: [MANAGER],
      routes: { '/admin/users/user-1/permissions': new Response(null, { status: 500 }) },
    });
    renderApp(<AppRouter />, '/admin/users/user-1');

    await screen.findByRole('heading', { name: /manager/i });
    expect(screen.queryByText('Effective')).not.toBeInTheDocument();
    expect(screen.queryByText('Not effective')).not.toBeInTheDocument();
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
  it('renders four ranked sections, with identity/account as the lead', async () => {
    installFetch({
      session: adminIdentity(),
      adminUsers: [MANAGER],
      adminUserPermissions: { 'user-1': permRows() },
    });
    renderApp(<AppRouter />, '/admin/users/user-1');

    await screen.findByRole('heading', { name: /manager/i });

    // PageIntro plus three SectionRules: Identity & account, Roles, Access —
    // structural evidence of the ranked (not equal-weight) composition. jsdom
    // has no layout engine, so this is what can be pinned here; true visual
    // verification is deferred (see report §19/§24).
    const marks = document.querySelectorAll('.uwv-spine-mark');
    expect(marks.length).toBeGreaterThanOrEqual(4);

    const lead = document.querySelector('[data-lead="true"][data-order="2"]');
    expect(lead).not.toBeNull();
    expect(lead?.textContent ?? '').toMatch(/identity & account/i);

    const orders = [...document.querySelectorAll('[data-order]')].map((el) =>
      el.getAttribute('data-order'),
    );
    expect(orders).toEqual(expect.arrayContaining(['1', '2', '3', '4']));
  });
});

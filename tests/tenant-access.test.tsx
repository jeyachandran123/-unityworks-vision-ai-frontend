/**
 * The access matrix inside one organization — User & Access, from the inside.
 *
 * The same grid as the platform console, with no organization to choose, and
 * with the one rule the platform never needed: somebody administering people
 * here may only give what they hold themselves. Rendered as the real app
 * against the stubbed backend.
 */

import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRouter } from '@app/router/AppRouter';
import { PERMISSIONS } from '@app/permissions/permissions';
import { adminIdentity, installFetch, renderApp } from './support';

const MANAGER_PERMISSIONS = [
  'acknowledge_incidents',
  'export_reports',
  'resolve_incidents',
  'view_camera_health',
  'view_cameras',
  'view_cutting_board',
  'view_evidence',
  'view_incidents',
  'view_live',
  'view_meal_detection',
  'view_observations',
  'view_people_count',
  'view_reports',
  'view_table_occupancy',
  'view_users',
  'view_zones',
];

const ROLES = {
  roles: [
    { role: 'org_admin', permissions: Object.values(PERMISSIONS), grantable: true },
    { role: 'restaurant_manager', permissions: MANAGER_PERMISSIONS, grantable: true },
    { role: 'auditor', permissions: ['view_audit', 'view_incidents'], grantable: true },
  ],
};

const MANAGER = {
  id: 'user-1',
  email: 'manager@example.com',
  display_name: 'Manager',
  is_active: true,
  roles: ['restaurant_manager'],
  camera_scope: { breadth: 'all_in_tenant', camera_keys: [], site_ids: [] },
  created_at: '2026-08-01T00:00:00Z',
  last_login_at: null,
};

const ADMIN_SELF = {
  ...MANAGER,
  id: 'user-admin',
  email: 'admin@example.com',
  display_name: 'Org Admin',
  roles: ['org_admin'],
};

const CAMERAS = {
  cameras: [
    { camera_key: 'cam-01', name: 'Pass' },
    { camera_key: 'cam-02', name: 'Cold room' },
  ],
  enabled: 2,
  total: 2,
};

type Write = { method: string; url: string; body: unknown };

function stub(extra: Record<string, unknown> = {}) {
  return {
    session: adminIdentity(),
    adminUsers: [MANAGER, ADMIN_SELF],
    adminUserAccess: { 'user-1': MANAGER_PERMISSIONS },
    adminRoles: ROLES,
    routes: { '/api/v1/cameras': CAMERAS },
    ...extra,
  };
}

async function openPerson(id = 'user-1') {
  renderApp(<AppRouter />, `/admin/people/${id}`);
  const user = userEvent.setup();
  await screen.findByRole('checkbox', { name: 'View — Live Wall' });
  return user;
}

describe('a person’s access, inside the organization', () => {
  it('shows the grid for this organization only, ticked from what they hold', async () => {
    installFetch(stub());
    await openPerson();

    // No organization to choose: the tenant is the only one there is.
    expect(screen.queryByText(/permissions for/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'What the dots mean' })).not.toBeInTheDocument();

    expect(screen.getByRole('checkbox', { name: 'View — Live Wall' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Acknowledge — Incidents' })).toBeChecked();
    expect(screen.getByLabelText('Start from role')).toHaveValue('restaurant_manager');
    expect(screen.getByRole('radio', { name: 'All cameras' })).toBeChecked();

    // The per-permission override table and the role list it replaced are gone.
    expect(screen.queryByRole('button', { name: '+ Add' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/assign a role/i)).not.toBeInTheDocument();
  });

  it('reviews and saves exactly the change', async () => {
    const accessWrites: Write[] = [];
    installFetch(stub({ accessWrites }));
    const user = await openPerson();

    await user.click(screen.getByRole('checkbox', { name: 'View — Live Wall' }));
    await user.click(screen.getByRole('button', { name: /^Compliance/ }));
    await user.click(screen.getByRole('checkbox', { name: 'View — Audit Trail' }));
    await user.click(screen.getByRole('button', { name: 'Next: Review' }));
    await user.click(screen.getByRole('button', { name: 'Save access' }));

    await screen.findByText(/access saved/i);
    expect(accessWrites).toHaveLength(1);
    expect(accessWrites[0]?.method).toBe('PUT');
    expect(accessWrites[0]?.url).toContain('/admin/users/user-1/access');
    expect(accessWrites[0]?.body).toEqual({
      role: 'restaurant_manager',
      permissions: [...MANAGER_PERMISSIONS.filter((p) => p !== 'view_live'), 'view_audit'].sort(),
    });
  });

  it('greys a box the administrator does not hold, but lets them take it away', async () => {
    // An administrator without `view_audit` or `view_evidence`.
    const admin = adminIdentity();
    installFetch(
      stub({
        session: {
          ...admin,
          permissions: admin.permissions.filter(
            (p) => p !== 'view_audit' && p !== 'view_evidence',
          ),
        },
      }),
    );
    const user = await openPerson();
    await user.click(screen.getByRole('button', { name: /^Compliance/ }));

    // Not held, not ticked: cannot be given.
    expect(screen.getByRole('checkbox', { name: 'View — Audit Trail' })).toBeDisabled();
    // Not held, but the person has it: can still be taken away.
    const evidence = screen.getByRole('checkbox', { name: 'View — Evidence' });
    expect(evidence).toBeEnabled();
    await user.click(evidence);
    expect(evidence).not.toBeChecked();
    expect(evidence).toBeDisabled();
  });

  it('shows a role it may not give, without offering it', async () => {
    installFetch(
      stub({
        adminRoles: {
          roles: [
            ...ROLES.roles.filter((r) => r.role !== 'org_admin'),
            { role: 'org_admin', permissions: Object.values(PERMISSIONS), grantable: false },
          ],
        },
      }),
    );
    await openPerson();
    const option = within(screen.getByLabelText('Start from role')).getByRole('option', {
      name: /organization admin \(not yours to give\)/i,
    });
    expect(option).toBeDisabled();
  });

  it('gives specific cameras, which only the organization can choose', async () => {
    const accessWrites: Write[] = [];
    installFetch(stub({ accessWrites }));
    const user = await openPerson();

    await user.click(screen.getByRole('radio', { name: 'Specific cameras' }));
    await user.click(await screen.findByRole('checkbox', { name: /cold room/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Review' }));
    expect(screen.getByText(/specific cameras \(1\)/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save access' }));

    await waitFor(() => expect(accessWrites).toHaveLength(1));
    expect(accessWrites[0]?.body).toEqual({
      role: 'restaurant_manager',
      permissions: [...MANAGER_PERMISSIONS].sort(),
      camera_breadth: 'listed',
      camera_keys: ['cam-02'],
    });
  });

  it('does not offer a person their own access to change', async () => {
    installFetch(stub());
    renderApp(<AppRouter />, '/admin/people/user-admin');
    await screen.findByRole('heading', { name: /org admin/i });
    expect(await screen.findByText(/cannot change your own access/i)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'View — Live Wall' })).not.toBeInTheDocument();
  });
});

describe('adding a person, inside the organization', () => {
  it('walks account → permissions → review, and shows a generated password once', async () => {
    const accessWrites: Write[] = [];
    installFetch(stub({ accessWrites }));
    renderApp(<AppRouter />, '/admin/people');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /add a person/i }));
    const next = await screen.findByRole('button', { name: 'Next: Permissions' });
    expect(next).toBeDisabled();
    await user.type(screen.getByLabelText(/^email$/i), 'new@example.com');
    await user.type(screen.getByLabelText(/^name$/i), 'New Person');
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute('autocomplete', 'new-password');
    await user.click(next);

    await user.selectOptions(await screen.findByLabelText('Start from role'), 'auditor');
    await user.click(screen.getByRole('checkbox', { name: 'View — Live Wall' }));
    await user.click(screen.getByRole('radio', { name: 'All cameras' }));
    await user.click(screen.getByRole('button', { name: 'Next: Review' }));

    expect(screen.getByText('new@example.com')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create person' }));

    expect(await screen.findByText(/shown once/i)).toBeInTheDocument();
    expect(accessWrites[0]?.body).toEqual({
      email: 'new@example.com',
      display_name: 'New Person',
      role: 'auditor',
      permissions: ['view_audit', 'view_incidents', 'view_live'],
      camera_scope: { breadth: 'all_in_tenant' },
    });
  });

  it('will not continue past specific cameras with none chosen', async () => {
    installFetch(stub());
    renderApp(<AppRouter />, '/admin/people');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /add a person/i }));
    await user.type(await screen.findByLabelText(/^email$/i), 'new@example.com');
    await user.click(screen.getByRole('button', { name: 'Next: Permissions' }));
    await user.click(await screen.findByRole('radio', { name: 'Specific cameras' }));

    // An empty list is ambiguous — the platform reads it as every camera.
    expect(screen.getByRole('button', { name: 'Next: Review' })).toBeDisabled();
    await user.click(await screen.findByRole('checkbox', { name: /pass/i }));
    expect(screen.getByRole('button', { name: 'Next: Review' })).toBeEnabled();
  });
});

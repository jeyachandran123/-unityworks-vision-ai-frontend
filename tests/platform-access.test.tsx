/**
 * The platform access matrix, rendered as the real application against the
 * stubbed backend: the operator edits a person's access, and creates one.
 */

import { describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { focusManager } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { AppRouter } from '@app/router/AppRouter';
import { PERMISSIONS } from '@app/permissions/permissions';
import {
  identity,
  installFetch,
  organization,
  renderApp,
  type StubOrganizationAccess,
  type StubPersonAccess,
} from './support';

const ACME = organization({ id: 'org-acme', name: 'Acme Catering' });
const BORDEN = organization({ id: 'org-borden', name: 'Borden Foods' });
const CLOSED = organization({ id: 'org-closed', name: 'Closed Co', status: 'archived' });
const HOME = organization({ id: 'org-home', name: 'UnityWorks' });

const AUDITOR = [
  'export_reports',
  'view_audit',
  'view_cutting_board',
  'view_evidence',
  'view_incidents',
  'view_observations',
  'view_reports',
];

const ROLE_POLICY = {
  roles: [
    {
      role: 'org_admin',
      permissions: Object.values(PERMISSIONS),
      permission_count: Object.values(PERMISSIONS).length,
      is_platform_role: true,
    },
    { role: 'auditor', permissions: AUDITOR, permission_count: AUDITOR.length, is_platform_role: false },
  ],
  permissions: Object.values(PERMISSIONS),
  editable: false,
  customization: { mechanism: 'permission_overrides', scope: 'per user, per organization', where: 'here', note: '' },
};

function row(overrides: Partial<StubOrganizationAccess>): StubOrganizationAccess {
  return {
    organization_id: 'org-x',
    organization_name: 'X',
    status: 'active',
    is_member: false,
    is_home: false,
    role: null,
    roles: [],
    permissions: [],
    effective: [],
    camera_scope: { breadth: 'none', camera_keys: [], site_ids: [] },
    ...overrides,
  };
}

const danaAccess = (): StubPersonAccess => ({
  user_id: 'user-1',
  email: 'dana@example.com',
  display_name: 'Dana Reed',
  is_platform_operator: false,
  home_organization_id: 'org-acme',
  organizations: [
    row({
      organization_id: 'org-acme',
      organization_name: 'Acme Catering',
      is_member: true,
      is_home: true,
      role: 'auditor',
      roles: ['auditor'],
      permissions: AUDITOR,
      effective: AUDITOR,
      camera_scope: { breadth: 'all_in_tenant', camera_keys: [], site_ids: [] },
    }),
    row({ organization_id: 'org-borden', organization_name: 'Borden Foods' }),
    row({ organization_id: 'org-closed', organization_name: 'Closed Co', status: 'archived' }),
  ],
});

const PERSON = {
  id: 'user-1',
  email: 'dana@example.com',
  display_name: 'Dana Reed',
  is_active: true,
  home_organization_id: 'org-acme',
  home_organization_name: 'Acme Catering',
  memberships: [
    {
      organization_id: 'org-acme',
      organization_name: 'Acme Catering',
      roles: ['auditor'],
      is_home: true,
      granted_at: null,
      granted_by: '',
    },
  ],
  organization_count: 1,
  last_login_at: null,
  is_platform_operator: false,
  home_membership_missing: false,
};

function operatorStub(extra: Record<string, unknown> = {}) {
  return {
    session: identity({
      subject: 'operator@example.com',
      display_name: 'Operator',
      tenant_id: 'org-home',
      roles: ['developer'],
    }),
    organizations: [HOME],
    isPlatformOperator: true,
    platformOrganizations: [ACME, BORDEN, CLOSED],
    platformPeople: [PERSON],
    platformRoles: ROLE_POLICY,
    platformAccess: { 'user-1': danaAccess() },
    ...extra,
  };
}

async function openEditor() {
  renderApp(<AppRouter />, '/platform/people/user-1/access');
  await screen.findByRole('checkbox', { name: 'View — Live Wall' });
  return userEvent.setup();
}

describe('editing a person’s access', () => {
  it('lists every organization, with what the person has in each', async () => {
    installFetch(operatorStub());
    await openEditor();

    expect(screen.getByRole('button', { name: 'Acme Catering, has access' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Borden Foods, not a member' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Closed Co, not a member, archived/ })).toBeDisabled();

    // Acme opens on Operations, pre-ticked from the auditor's access.
    expect(screen.getByRole('checkbox', { name: 'View — Incidents' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Acknowledge — Incidents' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'View — Live Wall' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'All cameras' })).toBeChecked();
  });

  it('ticks, toggles a column, reviews and saves exactly the change', async () => {
    const accessWrites: Array<{ method: string; url: string; body: unknown }> = [];
    installFetch(operatorStub({ accessWrites }));
    const user = await openEditor();

    await user.click(screen.getByRole('button', { name: 'Borden Foods, not a member' }));
    await user.click(screen.getByRole('checkbox', { name: 'View — Live Wall' }));
    expect(screen.getByRole('button', { name: 'Borden Foods, has access' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Compliance/ }));
    const column = screen.getByRole('checkbox', { name: 'All View in Compliance' });
    await user.click(column);
    expect(column).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'View — Audit Trail' })).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Next: Review' }));
    expect(screen.getByText('Will be admitted')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save access' }));

    await screen.findByText(/access saved/i);
    expect(accessWrites).toHaveLength(1);
    expect(accessWrites[0]?.method).toBe('PUT');
    expect(accessWrites[0]?.body).toEqual({
      organizations: [
        {
          organization_id: 'org-borden',
          role: null,
          permissions: [
            'view_audit',
            'view_cutting_board',
            'view_evidence',
            'view_live',
            'view_observations',
            'view_reports',
          ],
        },
      ],
    });
  });

  it('links the two cells that are one permission', async () => {
    installFetch(operatorStub());
    const user = await openEditor();
    await user.click(screen.getByRole('button', { name: 'Borden Foods, not a member' }));
    await user.click(screen.getByRole('checkbox', { name: 'View — Alerts' }));
    await user.click(screen.getByRole('button', { name: /^Compliance/ }));
    expect(screen.getByRole('checkbox', { name: 'View — Staff Hygiene' })).toBeChecked();
    expect(screen.getByText('View is shared with Alerts')).toBeInTheDocument();
  });

  it('starts from a role, and resets to it', async () => {
    installFetch(operatorStub());
    const user = await openEditor();
    await user.click(screen.getByRole('button', { name: 'Borden Foods, not a member' }));
    await user.selectOptions(screen.getByLabelText('Start from role'), 'auditor');
    expect(screen.getByRole('checkbox', { name: 'View — Incidents' })).toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: 'View — Incidents' }));
    expect(screen.getByRole('checkbox', { name: 'View — Incidents' })).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Reset to role' }));
    expect(screen.getByRole('checkbox', { name: 'View — Incidents' })).toBeChecked();
  });

  it('says there is nothing to save when nothing changed', async () => {
    installFetch(operatorStub());
    const user = await openEditor();
    await user.click(screen.getByRole('button', { name: 'Next: Review' }));
    expect(screen.getByText('Nothing to change')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save access' })).toBeDisabled();
  });

  it('keeps unsaved ticks when the window regains focus', async () => {
    // Final review I1: a background refetch must not remount the editor and
    // silently throw away what the operator has ticked.
    installFetch(operatorStub());
    const user = await openEditor();
    await user.click(screen.getByRole('button', { name: 'Borden Foods, not a member' }));
    await user.click(screen.getByRole('checkbox', { name: 'View — Live Wall' }));

    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    focusManager.setFocused(undefined);

    expect(screen.getByRole('button', { name: 'Borden Foods, has access' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'View — Live Wall' })).toBeChecked();
  });

  it('says in words, not only colour, what each organization dot means', async () => {
    // Final review M4: colour is never the only signal.
    installFetch(operatorStub());
    await openEditor();
    const legend = screen.getByRole('list', { name: 'What the dots mean' });
    expect(legend).toHaveTextContent('has access');
    expect(legend).toHaveTextContent('member, nothing ticked');
    expect(legend).toHaveTextContent('not a member');
  });

  it('is reached from the person page', async () => {
    installFetch(operatorStub());
    renderApp(<AppRouter />, '/platform/people/user-1');
    const link = await screen.findByRole('link', { name: /edit access/i });
    expect(link).toHaveAttribute('href', '/platform/people/user-1/access');
  });
});

describe('creating a person', () => {
  it('walks account → permissions → review, and creates them', async () => {
    const accessWrites: Array<{ method: string; url: string; body: unknown }> = [];
    installFetch(operatorStub({ accessWrites }));
    renderApp(<AppRouter />, '/platform/people/new');
    const user = userEvent.setup();

    await screen.findByRole('heading', { name: 'New person' });
    const next = screen.getByRole('button', { name: 'Next: Permissions' });
    // Final review M5: a browser must not autofill the operator's own login here.
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'off');
    expect(next).toBeDisabled();

    await user.type(screen.getByLabelText('Name'), 'Priya Raman');
    await user.type(screen.getByLabelText('Email'), 'priya@example.com');
    await user.type(screen.getByLabelText('Password'), 'long-enough-password');
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Acme Catering' })).toBeInTheDocument(),
    );
    // Archived organizations cannot be a home.
    expect(screen.queryByRole('option', { name: 'Closed Co' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Home organization'), 'org-acme');
    await user.click(next);

    expect(
      await screen.findByRole('button', { name: 'Acme Catering, member, nothing ticked' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('checkbox', { name: 'View — Live Wall' }));
    await user.click(screen.getByRole('radio', { name: 'All cameras' }));
    await user.click(screen.getByRole('button', { name: 'Next: Review' }));

    expect(screen.getByText('priya@example.com')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create person' }));

    await screen.findByRole('heading', { name: 'Priya Raman' });
    expect(accessWrites[0]?.body).toEqual({
      email: 'priya@example.com',
      display_name: 'Priya Raman',
      password: 'long-enough-password',
      home_organization_id: 'org-acme',
      organizations: [
        {
          organization_id: 'org-acme',
          role: null,
          permissions: ['view_live'],
          camera_breadth: 'all_in_tenant',
        },
      ],
    });
  });

  it('is reached from the People directory', async () => {
    installFetch(operatorStub());
    renderApp(<AppRouter />, '/platform/people');
    const link = await screen.findByRole('link', { name: /new person/i });
    expect(link).toHaveAttribute('href', '/platform/people/new');
  });
});

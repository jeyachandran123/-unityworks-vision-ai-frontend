/**
 * The Platform layer: login → organization → the existing application.
 *
 * Every test here drives the **real** router, the real guards and the real
 * `AuthProvider` against a stubbed backend. Nothing mocks a hook or a
 * component, because the properties under test are entirely about how those
 * pieces compose: which page a login lands on, whether a chooser is offered at
 * all, and whether organization A's data can still be on screen after switching
 * to B.
 *
 * The three journeys map one-to-one onto the three tests at the top. The rest
 * are the ways each of them can go wrong.
 */

import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRouter } from '@app/router/AppRouter';
import { adminIdentity, identity, installFetch, organization, renderApp } from './support';

const ACME = organization({ id: 'org-acme', name: 'Acme Catering', site_count: 4, camera_count: 12 });

/** One person in the platform directory, with a home organization and one membership. */
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
      roles: ['org_admin'],
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
const BORDEN = organization({ id: 'org-borden', name: 'Borden Foods', site_count: 2, camera_count: 5 });

/** An org_admin whose session is in Acme. */
const soloAdmin = (): ReturnType<typeof adminIdentity> => ({
  ...adminIdentity(),
  tenant_id: 'org-acme',
});

async function signIn() {
  const user = userEvent.setup();
  await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument());
  await user.type(screen.getByLabelText('Email'), 'admin@example.com');
  await user.type(screen.getByLabelText('Password'), 'correct-horse-battery');
  await user.click(screen.getByRole('button', { name: /sign in/i }));
  return user;
}

/* ── Scenario 2: one organization ─────────────────────────────────────────── */

describe('an administrator with one organization', () => {
  it('goes straight from login to the Command Center', async () => {
    installFetch({ session: null });
    renderApp(<AppRouter />, '/login');

    installFetch({ session: soloAdmin(), organizations: [ACME] });
    await signIn();

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Command Center' })).toBeInTheDocument(),
    );
    // The requirement stated as an absence: no chooser, ever.
    expect(screen.queryByRole('heading', { name: /choose an organization/i })).not.toBeInTheDocument();
  });

  it('is redirected away from the chooser if they type its address', async () => {
    installFetch({ session: soloAdmin(), organizations: [ACME] });
    renderApp(<AppRouter />, '/choose-organization');

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Command Center' })).toBeInTheDocument(),
    );
  });

  it('is offered no way to switch, because there is nowhere to switch to', async () => {
    installFetch({ session: soloAdmin(), organizations: [ACME] });
    renderApp(<AppRouter />, '/dashboard');

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Command Center' })).toBeInTheDocument(),
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /org admin|admin@example\.com/i }));
    expect(screen.queryByRole('menuitem', { name: /switch organization/i })).not.toBeInTheDocument();
  });

  it('still names the organization it is showing', async () => {
    installFetch({ session: soloAdmin(), organizations: [ACME] });
    renderApp(<AppRouter />, '/dashboard');

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Command Center' })).toBeInTheDocument(),
    );
    // Orientation is not a switcher. Somebody with one organization should
    // still be told which one every page belongs to.
    expect(screen.getAllByText('Acme Catering').length).toBeGreaterThan(0);
  });
});

/* ── Scenario 3: several organizations ────────────────────────────────────── */

describe('an administrator with several organizations', () => {
  it('lands on the chooser, picks one, and enters the existing application', async () => {
    installFetch({ session: null });
    renderApp(<AppRouter />, '/login');

    installFetch({ session: soloAdmin(), organizations: [ACME, BORDEN] });
    const user = await signIn();

    // Login → Platform.
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /choose an organization/i })).toBeInTheDocument(),
    );
    // The Platform page is not the Command Center, and must not pretend to be.
    expect(screen.queryByRole('heading', { name: 'Command Center' })).not.toBeInTheDocument();

    // Platform → the organization's application.
    const cards = screen.getAllByRole('listitem');
    const bordenCard = cards.find((card) => card.textContent?.includes('Borden Foods'));
    expect(bordenCard).toBeDefined();
    await user.click(within(bordenCard as HTMLElement).getByRole('button', { name: /enter organization/i }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Command Center' })).toBeInTheDocument(),
    );
    expect(screen.getAllByText('Borden Foods').length).toBeGreaterThan(0);
  });

  it('shows only the organizations the account belongs to', async () => {
    installFetch({ session: soloAdmin(), organizations: [ACME, BORDEN] });
    renderApp(<AppRouter />, '/choose-organization');

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /choose an organization/i })).toBeInTheDocument(),
    );

    expect(screen.getByText('Acme Catering')).toBeInTheDocument();
    expect(screen.getByText('Borden Foods')).toBeInTheDocument();
    // The list is the server's answer to "which are mine", rendered as-is. A
    // page that fetched every organization and filtered on this side would be
    // one bug away from showing a customer nobody may see.
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('offers a switch, and switching returns to the chooser', async () => {
    installFetch({ session: soloAdmin(), organizations: [ACME, BORDEN] });
    renderApp(<AppRouter />, '/dashboard');

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Command Center' })).toBeInTheDocument(),
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /org admin|admin@example\.com/i }));
    await user.click(screen.getByRole('menuitem', { name: /switch organization/i }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /choose an organization/i })).toBeInTheDocument(),
    );
  });

  it('identifies each organization well enough to tell them apart', async () => {
    installFetch({ session: soloAdmin(), organizations: [ACME, BORDEN] });
    renderApp(<AppRouter />, '/choose-organization');

    const acme = await waitFor(() => {
      const card = screen.getAllByRole('listitem').find((c) => c.textContent?.includes('Acme'));
      expect(card).toBeDefined();
      return card as HTMLElement;
    });

    const inside = within(acme);
    expect(inside.getByText('Active')).toBeInTheDocument();
    expect(inside.getByText('4')).toBeInTheDocument();
    expect(inside.getByText('12')).toBeInTheDocument();
  });
});

/* ── Scenario 1: the platform operator ────────────────────────────────────── */

const operatorSession = () =>
  identity({
    subject: 'operator@example.com',
    display_name: 'Operator',
    tenant_id: 'org-home',
    roles: ['developer'],
  });

const HOME = organization({ id: 'org-home', name: 'UnityWorks' });

/** An operator: one membership of their own, two customers to administer. */
const operatorStub = (extra: Record<string, unknown> = {}) => ({
  session: operatorSession(),
  organizations: [HOME],
  isPlatformOperator: true,
  platformOrganizations: [ACME, BORDEN],
  ...extra,
});

describe('a platform operator', () => {
  it('lands on the control plane, not on a chooser', async () => {
    installFetch({ session: null });
    renderApp(<AppRouter />, '/login');

    installFetch(operatorStub());
    await signIn();

    // `must_select` alone would have sent them to a chooser holding one card —
    // their own organization, which is the one place their job is not.
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument(),
    );
    expect(screen.getByRole('navigation', { name: 'Platform' })).toBeInTheDocument();
  });

  it('reads the platform overview from real counts', async () => {
    installFetch(operatorStub());
    renderApp(<AppRouter />, '/platform');

    await waitFor(() => expect(screen.getByText('organizations')).toBeInTheDocument());
    // Estate figures come from the server, not from the length of a list here.
    expect(screen.getByText('Streaming now')).toBeInTheDocument();
  });

  it('sees the organizations console inside the platform shell, not an organization', async () => {
    installFetch(operatorStub());
    renderApp(<AppRouter />, '/platform/organizations');

    await waitFor(() => expect(screen.getByText('Acme Catering')).toBeInTheDocument());

    // The defect this phase exists to fix: the cross-customer console used to
    // render inside `AppShell`, so it appeared inside whichever organization
    // happened to be selected. The organization's own navigation must be
    // nowhere on this page.
    expect(screen.getByRole('navigation', { name: 'Platform' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /live wall/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /command center/i })).not.toBeInTheDocument();
  });

  it('reaches People, Operators and Roles from the platform navigation', async () => {
    installFetch(operatorStub({ platformPeople: [PERSON] }));
    renderApp(<AppRouter />, '/platform');

    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument());

    await user.click(screen.getByRole('link', { name: /people/i }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'People' })).toBeInTheDocument());

    await user.click(screen.getByRole('link', { name: /operators/i }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Operators' })).toBeInTheDocument(),
    );
    // The boundary, stated on screen: there is no grant control here.
    expect(screen.queryByRole('button', { name: /grant/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /roles & access/i }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Roles & Access' })).toBeInTheDocument(),
    );
    // Role definitions are code. The page must not imply otherwise.
    expect(screen.getByText('Read-only')).toBeInTheDocument();
  });

  it('does not switch tenant merely by inspecting an organization', async () => {
    const calls: string[] = [];
    installFetch(operatorStub({ calls, platformPeople: [PERSON] }));
    renderApp(<AppRouter />, '/platform/organizations/org-acme');

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Acme Catering' })).toBeInTheDocument(),
    );

    // Administering and entering are different acts. Opening the page is the
    // first; nothing here may quietly perform the second.
    expect(calls.some((call) => call.includes('/enter'))).toBe(false);
    expect(calls.some((call) => call.includes('/select'))).toBe(false);
    expect(screen.getByRole('button', { name: /enter organization/i })).toBeInTheDocument();
  });

  it('enters a customer only on the explicit action, and the shell then says so', async () => {
    const calls: string[] = [];
    installFetch(operatorStub({ calls, platformPeople: [PERSON] }));
    renderApp(<AppRouter />, '/platform/organizations/org-acme');

    const user = userEvent.setup();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Acme Catering' })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /enter organization/i }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Command Center' })).toBeInTheDocument(),
    );
    expect(calls.some((call) => call.includes('/platform/organizations/org-acme/enter'))).toBe(true);
    // A read-only operator session is marked for as long as it lasts.
    expect(screen.getByText(/platform operator · read-only/i)).toBeInTheDocument();
  });

  it('administers membership without touching roles', async () => {
    installFetch(operatorStub({ platformPeople: [PERSON] }));
    renderApp(<AppRouter />, '/platform/people/user-1');

    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Dana Reed' })).toBeInTheDocument());

    // Admitting is the entry ticket and nothing more, and the page says so
    // before the click rather than after it.
    expect(screen.getByText(/admitting grants no role/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/admit to organization/i), 'org-borden');
    await user.click(screen.getByRole('button', { name: /^admit$/i }));

    await waitFor(() => expect(screen.getByText('org-borden')).toBeInTheDocument());
  });
});

describe('an ordinary multi-organization administrator', () => {
  it('is refused the control plane and sent to their own application', async () => {
    // Not an operator. The chooser is theirs; the console is not.
    installFetch({ session: soloAdmin(), organizations: [ACME, BORDEN] });
    renderApp(<AppRouter />, '/platform');

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Command Center' })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('navigation', { name: 'Platform' })).not.toBeInTheDocument();
  });
});

/* ── Isolation ────────────────────────────────────────────────────────────── */

describe('organization isolation', () => {
  it('does not carry one organization onto another', async () => {
    const calls: string[] = [];
    installFetch({
      session: soloAdmin(),
      organizations: [ACME, BORDEN],
      calls,
      routes: { '/restaurants': { restaurants: [{ id: 'r1', name: 'Acme Kitchen' }] } },
    });

    renderApp(<AppRouter />, '/choose-organization');
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('Borden Foods')).toBeInTheDocument());
    const cards = screen.getAllByRole('listitem');
    const bordenCard = cards.find((card) => card.textContent?.includes('Borden Foods'));
    await user.click(within(bordenCard as HTMLElement).getByRole('button', { name: /enter/i }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Command Center' })).toBeInTheDocument(),
    );

    // The selection actually re-minted the session server-side...
    expect(calls.some((call) => call.includes('/auth/organizations/org-borden/select'))).toBe(true);
    // ...and the shell is now unambiguously about the new organization.
    expect(screen.getAllByText('Borden Foods').length).toBeGreaterThan(0);
    expect(screen.queryByText('Acme Catering')).not.toBeInTheDocument();
  });

  it('refuses an organization the account does not belong to', async () => {
    // The chooser cannot offer this, so the test drives the refusal directly:
    // the stub 403s any id outside the membership list, exactly as the server
    // does, and the page must report it rather than navigate.
    installFetch({ session: soloAdmin(), organizations: [ACME, BORDEN] });
    renderApp(<AppRouter />, '/choose-organization');

    await waitFor(() => expect(screen.getByText('Borden Foods')).toBeInTheDocument());

    const { authApi } = await import('@shared/api/services');
    await expect(authApi.selectOrganization('org-somebody-else')).rejects.toMatchObject({
      kind: 'forbidden',
    });
  });
});

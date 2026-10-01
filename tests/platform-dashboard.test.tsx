/**
 * The Platform Dashboard, rendered for real against a stubbed overview.
 *
 * What a Platform Admin must be able to rely on: the page opens on what needs
 * them, ranked, with a road to each thing; "live" is the runtime's word, not
 * configuration's; every customer is on one line; the feed names people and
 * places and never shows an action code; and the shell around it draws its
 * spine and says "Organization application" the way a sentence would.
 */

import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AppRouter } from '@app/router/AppRouter';
import { identity, installFetch, organization, platformOverviewFixture, renderApp } from './support';

const HOME = organization({ id: 'org-home', name: 'UnityWorks' });
const ACME = organization({ id: 'org-acme', name: 'Acme Catering' });

function stub(overview: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    session: identity({
      subject: 'operator@example.com',
      display_name: 'Operator',
      tenant_id: 'org-home',
      roles: ['developer'],
    }),
    organizations: [HOME],
    isPlatformOperator: true,
    platformOrganizations: [ACME],
    platformOverview: platformOverviewFixture(overview),
    ...extra,
  };
}

function fleetRow(patch: Record<string, unknown>) {
  return {
    id: 'org-acme',
    name: 'Acme Catering',
    slug: 'acme',
    status: 'active',
    created_at: null,
    zones: 2,
    cameras: 6,
    cameras_enabled: 6,
    cameras_live: 6,
    stream_states: { live: 6 },
    members: 4,
    admins: 1,
    last_sign_in_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    ...patch,
  };
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

async function open(overview: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  installFetch(stub(overview, extra));
  renderApp(<AppRouter />, '/platform');
  await screen.findByRole('heading', { name: 'Overview' });
}

describe('the attention panel', () => {
  it('opens on the customers that need somebody, most urgent first, each a road to it', async () => {
    await open({
      attention: {
        organizations_needing_setup: [{ id: 'org-new', name: 'Atmiralty', zone_count: 0, camera_count: 0 }],
        organizations_without_admin: [{ id: 'org-borden', name: 'Borden Foods' }],
        organizations_not_live: [{ id: 'org-acme', name: 'Acme Catering', cameras_enabled: 6 }],
        refused_changes_7d: 0,
      },
    });

    const panel = screen.getByRole('region', { name: 'Primary attention' });
    expect(within(panel).getByText('2 customers need you now.')).toBeInTheDocument();

    const links = within(panel).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringContaining('Acme Catering'),
      expect.stringContaining('Borden Foods'),
      expect.stringContaining('Atmiralty'),
    ]);
    expect(links[0]).toHaveAttribute('href', '/platform/organizations/org-acme');
    expect(within(panel).getByText('6 cameras switched on, none live')).toBeInTheDocument();
    expect(within(panel).getByText('Nobody can administer it')).toBeInTheDocument();
  });

  it('says nothing needs you when the three checks came back clear, and claims no more', async () => {
    await open();

    const panel = screen.getByRole('region', { name: 'Primary attention' });
    expect(within(panel).getByText('Nothing needs you right now.')).toBeInTheDocument();
    expect(within(panel).queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText(/\b(healthy|compliant|health score|compliance rate)\b/i)).not.toBeInTheDocument();
  });
});

describe('the instruments', () => {
  it('reads live cameras from the runtime, against what is switched on', async () => {
    await open();

    const tile = document.querySelector('[data-figure="Cameras live"]') as HTMLElement;
    expect(within(tile).getByText('9')).toBeInTheDocument();
    expect(within(tile).getByText('of 12 switched on')).toBeInTheDocument();
    expect(within(tile).getByRole('img', { name: 'Cameras live: 9 of 12' })).toBeInTheDocument();
    // What is not live is said by state, not lumped together.
    expect(within(tile).getByText('Reconnecting')).toBeInTheDocument();
    expect(within(tile).getByText('Offline')).toBeInTheDocument();
  });

  it('draws no ring when nothing is switched on, and says why', async () => {
    await open({
      estate: {
        zones: 1,
        cameras: 3,
        cameras_enabled: 0,
        cameras_running: 0,
        cameras_live: 0,
        stream_states: {},
      },
    });

    const tile = document.querySelector('[data-figure="Cameras live"]') as HTMLElement;
    expect(within(tile).queryByRole('img')).not.toBeInTheDocument();
    expect(within(tile).getByText(/none switched on — so there is no share to draw/)).toBeInTheDocument();
  });

  it('counts customers and people from the server, not from a list on the page', async () => {
    await open({
      organizations: { total: 7, active: 5, suspended: 1, archived: 1, new_30d: 2 },
    });

    const customers = document.querySelector('[data-figure="Customers"]') as HTMLElement;
    expect(within(customers).getByText('7')).toBeInTheDocument();
    expect(within(customers).getByText('2 this month')).toBeInTheDocument();
    expect(within(customers).getByRole('img', { name: /Active 5\b.*Suspended 1\b.*Archived 1\b|5 Active, 1 Suspended, 1 Archived/ })).toBeInTheDocument();
  });

  it('compares this week with the week before in words, not in colours', async () => {
    await open({
      activity: {
        ...platformOverviewFixture().activity,
        last_7d: 9,
        previous_7d: 4,
      },
    });

    const tile = document.querySelector('[data-figure="Activity"]') as HTMLElement;
    expect(within(tile).getByText('5 more than the week before.')).toBeInTheDocument();
  });

  it('lays out everybody by when they last signed in, one band per line', async () => {
    await open();

    const bands = screen.getByRole('list', { name: 'People by when they last signed in' });
    const lines = within(bands).getAllByRole('listitem').map((item) => item.textContent);
    // The fixture: 2 today, 1 more this week, 2 more this month, none older.
    expect(lines).toEqual(['Today2', 'This week1', 'This month2', 'Longer ago0', 'Never0']);
  });
});

describe('every customer on one line', () => {
  it('lists customers that need somebody first, with what is wrong said in words', async () => {
    await open({
      fleet: [
        fleetRow({ id: 'org-a', name: 'Alpha', slug: 'alpha' }),
        fleetRow({ id: 'org-z', name: 'Zed', slug: 'zed', admins: 0 }),
      ],
    });

    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Zed');
    expect(within(rows[0] as HTMLElement).getByText('No admin')).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText('None')).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent('Alpha');
    expect(within(rows[1] as HTMLElement).getByText('6')).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'Zed' })).toHaveAttribute(
      'href',
      '/platform/organizations/org-z',
    );
  });

  it('shows a live share per customer and says when a customer has none to show', async () => {
    await open({
      fleet: [
        fleetRow({ id: 'org-a', name: 'Alpha', cameras_live: 2, cameras_enabled: 6 }),
        fleetRow({ id: 'org-b', name: 'Bravo', cameras: 0, cameras_enabled: 0, cameras_live: 0 }),
      ],
    });

    const table = screen.getByRole('table');
    expect(within(table).getByText('/ 6 live')).toBeInTheDocument();
    expect(within(table).getByText('No cameras')).toBeInTheDocument();
  });
});

describe('the activity feed', () => {
  const FEED = [
    {
      id: 'a1',
      action: 'user.access_set',
      organization_id: 'org-acme',
      organization_name: 'Acme Catering',
      actor: 'ops@example.com',
      resource_id: 'user-1',
      subject: 'cook@example.com',
      outcome: 'success',
      change: { role: 'auditor', added: 2, removed: 1 },
      occurred_at: minutesAgo(5),
    },
    {
      id: 'a2',
      action: 'organization.operator_entered',
      organization_id: 'org-acme',
      organization_name: 'Acme Catering',
      actor: 'ops@example.com',
      resource_id: 'org-acme',
      subject: null,
      outcome: 'success',
      change: null,
      occurred_at: minutesAgo(30),
    },
    {
      id: 'a3',
      action: 'organization.admin_created',
      organization_id: 'org-borden',
      organization_name: 'Borden Foods',
      actor: 'ops@example.com',
      resource_id: 'user-9',
      subject: 'boss@example.com',
      outcome: 'success',
      change: null,
      occurred_at: minutesAgo(60),
    },
  ];

  it('reads each act as a sentence and never shows an action code', async () => {
    await open({ recent_activity: FEED });

    const feed = document.getElementById('platform-activity')?.parentElement as HTMLElement;
    expect(feed).toHaveTextContent('ops@example.com changed what cook@example.com may do in Acme Catering');
    expect(feed).toHaveTextContent('Auditor · +2 −1 permissions');
    expect(feed).toHaveTextContent('ops@example.com made boss@example.com an Organization Admin of Borden Foods');
    expect(screen.queryByText(/user\.access_set|organization\.admin_created|org-borden/)).not.toBeInTheDocument();
    expect(within(feed).getAllByRole('link', { name: 'Acme Catering' })[0]).toHaveAttribute(
      'href',
      '/platform/organizations/org-acme',
    );
  });

  it('files the day under Today and filters by kind', async () => {
    await open({ recent_activity: FEED });
    const user = userEvent.setup();

    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Entries/ }));
    const feed = document.getElementById('platform-activity')?.parentElement as HTMLElement;
    await waitFor(() => expect(feed).not.toHaveTextContent('cook@example.com'));
    expect(feed).toHaveTextContent('ops@example.com entered Acme Catering');
    expect(screen.getByRole('button', { name: /^Entries/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('marks a refused change as refused, with the reason in words', async () => {
    await open({
      recent_activity: [
        {
          ...FEED[0],
          id: 'r1',
          outcome: 'denied',
          change: { reason: 'escalation' },
        },
      ],
    });

    const item = screen.getByText(/was refused giving/).closest('li') as HTMLElement;
    expect(item).toHaveAttribute('data-refused', 'true');
    expect(within(item).getByText('Refused')).toBeInTheDocument();
    expect(item).toHaveTextContent(
      'ops@example.com was refused giving cook@example.com more than they hold in Acme Catering',
    );
  });
});

describe('the console around it', () => {
  it('asks for the overview in the reader’s own days', async () => {
    const calls: string[] = [];
    installFetch({ ...stub({}), calls });
    renderApp(<AppRouter />, '/platform');
    await screen.findByRole('heading', { name: 'Overview' });

    const offset = -new Date().getTimezoneOffset();
    expect(calls.some((call) => call.includes(`/platform/overview?utc_offset=${offset}`))).toBe(true);
  });

  it('draws the spine its section labels hang from, and names the way out properly', async () => {
    await open();

    expect(document.getElementById('main')).toHaveClass('uwv-spine');
    expect(screen.getByRole('button', { name: /Organization application/ })).toBeInTheDocument();
    expect(screen.queryByText('organization application')).not.toBeInTheDocument();
  });

  it('marks the current page in the navigation', async () => {
    await open();

    const nav = screen.getByRole('navigation', { name: 'Platform' });
    expect(within(nav).getByRole('link', { name: /Dashboard/ })).toHaveAttribute('aria-current', 'page');
  });

  it('says so instead of drawing zeros when the server predates this page', async () => {
    installFetch({
      ...stub({}),
      platformOverview: {
        organizations: { total: 1, active: 1, suspended: 0, archived: 0 },
        estate: { zones: 1, cameras: 1, cameras_running: 1 },
        people: { users: 1, active_users: 1, multi_organization_users: 0, never_signed_in: 0, platform_operators: 1 },
        attention: { organizations_needing_setup: [] },
        recent_activity: [],
      },
    });
    renderApp(<AppRouter />, '/platform');

    expect(await screen.findByText('This server predates the new overview')).toBeInTheDocument();
  });
});

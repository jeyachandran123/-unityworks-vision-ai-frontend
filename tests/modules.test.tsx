/**
 * The seven scaffolded module pages.
 *
 * A page with no data can still be wrong in two ways, and both are what these
 * tests are for:
 *
 *   it can invent a number   → then an operator trusts a reading nothing produced
 *   it can say "coming soon" → then nobody knows what would actually unblock it
 *
 * So the assertions are: no digit appears where a metric would go, the specific
 * real-world input is named in the server's own words, and Patron ID reads as
 * blocked rather than as merely unconnected.
 */

import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { AppRouter } from '@app/router/AppRouter';
import { PRODUCT_NAV, visibleItems } from '@app/router/navigation';
import { hasAny, PERMISSIONS } from '@app/permissions/permissions';
import {
  adminIdentity,
  auditorIdentity,
  identity,
  installFetch,
  managerIdentity,
  moduleCapability,
  renderApp,
  supervisorIdentity,
} from './support';

/** Every module page, with the route and the heading it must render. */
const PAGES: ReadonlyArray<{ path: string; heading: RegExp; module: string }> = [
  { path: '/people-counting', heading: /people counting/i, module: 'people_counting' },
  { path: '/demography', heading: /demography/i, module: 'demography' },
  { path: '/tables', heading: /table occupancy/i, module: 'table_occupancy' },
  { path: '/cutting-boards', heading: /cutting board/i, module: 'cutting_board' },
  { path: '/meals', heading: /meal detection/i, module: 'meal_detection' },
  { path: '/integrations/pos', heading: /pos.*integration/i, module: 'pos_integration' },
  { path: '/patron-id', heading: /patron id/i, module: 'patron_id' },
];

describe('a module page never invents a reading', () => {
  it.each(PAGES)('$path states the reason instead of a figure', async ({ path, module }) => {
    installFetch({
      session: adminIdentity(),
      modules: {
        [module]: moduleCapability(module, {
          reason: 'A very specific reason this module is not connected.',
          awaiting: [
            { id: 'a_named_input', detail: 'The precise real-world thing that is missing.' },
          ],
        }),
      },
    });
    renderApp(<AppRouter />, path);

    expect(
      await screen.findByText(/a very specific reason this module is not connected/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/the precise real-world thing that is missing/i)).toBeInTheDocument();
  });

  it.each(PAGES.filter((p) => p.module !== 'patron_id'))(
    '$path shows an em dash rather than a zero for its record count',
    async ({ path, module }) => {
      // `StatCard` renders `—` for a null value. The whole point of passing
      // `null` rather than `0` is that a zero here would be a footfall, an
      // occupancy or a violation count that nothing produced.
      installFetch({ session: adminIdentity(), modules: { [module]: moduleCapability(module) } });
      renderApp(<AppRouter />, path);

      await screen.findByRole('heading', { level: 1 });
      expect(await screen.findAllByText('—')).not.toHaveLength(0);
      expect(
        screen.getByText(/the schema exists and is empty/i),
      ).toBeInTheDocument();
    },
  );

  it('claims no compliance or completeness anywhere on a module page', async () => {
    installFetch({
      session: adminIdentity(),
      modules: { cutting_board: moduleCapability('cutting_board') },
    });
    renderApp(<AppRouter />, '/cutting-boards');

    await screen.findByRole('heading', { level: 1 });
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/compliant/i);
    expect(text).not.toMatch(/\d+%/);
    expect(text).not.toMatch(/coming soon/i);
  });
});

describe('cutting board keeps the four states four', () => {
  it('renders every reading state through the badge that owns them', async () => {
    installFetch({
      session: adminIdentity(),
      modules: {
        cutting_board: moduleCapability('cutting_board', {
          reading_states: ['present', 'absent', 'not_visible', 'unknown'],
        }),
      },
    });
    renderApp(<AppRouter />, '/cutting-boards');

    await screen.findByRole('heading', { name: /cutting board/i });

    // Each state as a *word*, not only as a colour — and `Not visible` present
    // means the module cannot silently treat an unreadable board as a violation.
    expect(await screen.findByText('Present')).toBeInTheDocument();
    expect(screen.getByText('Absent')).toBeInTheDocument();
    expect(screen.getByText('Not visible')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('says no colour scheme is configured rather than assuming one', async () => {
    installFetch({
      session: adminIdentity(),
      modules: { cutting_board: moduleCapability('cutting_board') },
    });
    renderApp(<AppRouter />, '/cutting-boards');

    expect(await screen.findByText(/no colour scheme configured/i)).toBeInTheDocument();
  });
});

describe('patron id reads as blocked, not as unbuilt', () => {
  it('is marked blocked pending legal review', async () => {
    installFetch({
      session: adminIdentity(),
      modules: { patron_id: moduleCapability('patron_id') },
    });
    renderApp(<AppRouter />, '/patron-id');

    // `findByText`, not `getByText` after awaiting a heading: the heading is
    // rendered by the loading state too, so awaiting it proves nothing about
    // the body that follows.
    expect(await screen.findByText(/blocked pending legal review/i)).toBeInTheDocument();
    expect(screen.getByText(/this module is blocked/i)).toBeInTheDocument();
  });

  it('offers no control that could begin a consent flow', async () => {
    // A disabled form would be the start of a mechanism, and somebody would
    // eventually wire it up. There is nothing here to wire.
    installFetch({
      session: adminIdentity(),
      modules: { patron_id: moduleCapability('patron_id') },
    });
    renderApp(<AppRouter />, '/patron-id');

    await screen.findByRole('heading', { name: /patron id/i });

    const main = screen.getByRole('main');
    expect(within(main).queryAllByRole('button')).toHaveLength(0);
    expect(within(main).queryAllByRole('textbox')).toHaveLength(0);
    expect(within(main).queryAllByRole('checkbox')).toHaveLength(0);
    expect(within(main).queryByRole('form')).not.toBeInTheDocument();
  });

  it('renders the schema guarantees from the server rather than asserting them', async () => {
    installFetch({
      session: adminIdentity(),
      modules: {
        patron_id: moduleCapability('patron_id', {
          schema_guarantees: ['A guarantee the backend stated about its own table.'],
        }),
      },
    });
    renderApp(<AppRouter />, '/patron-id');

    expect(
      await screen.findByText(/a guarantee the backend stated about its own table/i),
    ).toBeInTheDocument();
  });

  it('is not reachable by an account without the permission', async () => {
    // `managerIdentity` holds no `view_patron_id`, so the guard redirects.
    installFetch({ session: managerIdentity() });
    renderApp(<AppRouter />, '/patron-id');

    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(screen.queryByText(/blocked pending legal review/i)).not.toBeInTheDocument();
  });
});

describe('meal detection is honest about reconciliation', () => {
  it('shows unreconciled as the default state, not matched', async () => {
    installFetch({
      session: adminIdentity(),
      modules: { meal_detection: moduleCapability('meal_detection') },
    });
    renderApp(<AppRouter />, '/meals');

    // Twice on purpose: named in the prose and shown in the state list. The
    // assertion is that it is there at all, not how many times.
    expect(await screen.findAllByText('unreconciled')).not.toHaveLength(0);
    expect(screen.getByText(/never starts/i)).toBeInTheDocument();
  });
});

describe('pos integration', () => {
  it('names the bound adapter rather than showing a blank', async () => {
    installFetch({
      session: adminIdentity(),
      modules: { pos_integration: moduleCapability('pos_integration') },
    });
    renderApp(<AppRouter />, '/integrations/pos');

    expect(await screen.findByText('pos.not_configured')).toBeInTheDocument();
  });

  it('says no connector is configured rather than showing an empty table', async () => {
    installFetch({
      session: adminIdentity(),
      modules: { pos_integration: moduleCapability('pos_integration') },
    });
    renderApp(<AppRouter />, '/integrations/pos');

    expect(await screen.findByText(/no connector is configured/i)).toBeInTheDocument();
  });
});

describe('module navigation is permission-gated', () => {
  it('an org admin sees the analyse section', async () => {
    installFetch({ session: adminIdentity() });
    renderApp(<AppRouter />, '/dashboard');

    await screen.findByRole('heading', { name: 'Dashboard' });
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    for (const label of ['People Counting', 'Demography', 'Patron ID', 'POS Integration']) {
      expect(within(nav).getByRole('link', { name: new RegExp(label, 'i') })).toBeInTheDocument();
    }
  });

  it('a kitchen supervisor sees cutting boards and nothing else new', async () => {
    // The one new module that belongs on a screen anyone in the kitchen can see.
    installFetch({ session: supervisorIdentity() });
    renderApp(<AppRouter />, '/dashboard');

    await screen.findByRole('heading', { name: 'Dashboard' });
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: /cutting boards/i })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /demography/i })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /patron id/i })).not.toBeInTheDocument();
  });

  it('an auditor reaches the food-safety module but not the commercial ones', async () => {
    installFetch({ session: auditorIdentity() });
    renderApp(<AppRouter />, '/dashboard');

    await screen.findByRole('heading', { name: 'Dashboard' });
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: /cutting boards/i })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /meal detection/i })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /pos integration/i })).not.toBeInTheDocument();
  });

  it('demography is not implied by people counting', () => {
    // The property, checked on the nav model directly rather than through a
    // render: an identity holding footfall must not reach demography.
    const footfallOnly = identity({
      permissions: [PERMISSIONS.viewPeopleCount],
    });
    const sections = visibleItems(PRODUCT_NAV, (permissions) =>
      hasAny(footfallOnly, permissions),
    );
    const ids = sections.flatMap((section) => section.items.map((item) => item.id));

    expect(ids).toContain('people-counting');
    expect(ids).not.toContain('demography');
  });
});

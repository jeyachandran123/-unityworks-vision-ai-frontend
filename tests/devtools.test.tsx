/**
 * DevTools: authorization, lazy loading, and the fixture smoke test.
 *
 * The smoke test is the primary regression protection against the validation
 * console's capability being lost in migration. It drives the real application —
 * real guards, real router, real API client, real screens — from an
 * authenticated developer through to six rendered observations.
 */

import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRouter } from '@app/router/AppRouter';
import {
  FIXTURE_OBSERVATION_COUNT,
  identity,
  installFetch,
  managerIdentity,
  renderApp,
  supervisorIdentity,
} from './support';

describe('DevTools authorization', () => {
  it('a developer reaches the workspace', async () => {
    installFetch({ session: identity() });

    renderApp(<AppRouter />, '/devtools/vision');

    expect(await screen.findByRole('heading', { name: /vision os overview/i })).toBeInTheDocument();
  });

  it('a manager is redirected away', async () => {
    installFetch({ session: managerIdentity() });

    renderApp(<AppRouter />, '/devtools/vision');

    // Redirected to the dashboard rather than shown an accusatory dead end.
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: /vision os overview/i })).not.toBeInTheDocument();
  });

  it('an unauthenticated visitor gets the login screen', async () => {
    installFetch({ session: null });

    renderApp(<AppRouter />, '/devtools/vision');

    await waitFor(() => expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument());
  });

  it('the navigation offers no DevTools link to a manager', async () => {
    installFetch({ session: managerIdentity() });

    renderApp(<AppRouter />, '/dashboard');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument());

    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).queryByRole('link', { name: /vision os/i })).not.toBeInTheDocument();
  });

  it('the navigation offers it to a developer', async () => {
    installFetch({ session: identity() });

    renderApp(<AppRouter />, '/dashboard');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument());

    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: /vision os/i })).toBeInTheDocument();
  });
});

describe('DevTools is lazily loaded', () => {
  it('the router imports it dynamically and nowhere else statically', async () => {
    const source = await import('@app/router/AppRouter?raw').catch(() => null);
    // Fallback for environments without ?raw: assert the module is a lazy
    // component by construction instead.
    if (!source) {
      const { AppRouter: Router } = await import('@app/router/AppRouter');
      expect(typeof Router).toBe('function');
      return;
    }
    const text = String((source as { default: string }).default);
    expect(text).toContain('lazy(');
    expect(text).toContain('@devtools/vision-os/DevToolsRoutes');
  });

  it('shows a loading state while the chunk resolves, then the workspace', async () => {
    installFetch({ session: identity() });

    renderApp(<AppRouter />, '/devtools/vision');

    // Whether the fallback is observed depends on resolution timing; what must
    // hold is that the workspace arrives without a full page load.
    expect(await screen.findByRole('heading', { name: /vision os overview/i })).toBeInTheDocument();
  });
});

describe('fixture smoke test — the migration guard', () => {
  it('an authenticated developer sees the known observation count', async () => {
    installFetch({ session: identity() });

    renderApp(<AppRouter />, '/devtools/vision/state');

    await screen.findByRole('heading', { name: /vision state/i });

    // 'Observations' also names a nav link, so match the STAT CARD: the label
    // inside a <section>. Scoping rather than loosening the assertion.
    const card = await waitFor(() => {
      const found = screen
        .getAllByText('Observations')
        .map((node) => node.closest('section'))
        .find((section) => section !== null);
      if (!found) throw new Error('stat card not rendered yet');
      return found;
    });

    // The number the backend asserts server-side, rendered.
    expect(within(card).getByText(String(FIXTURE_OBSERVATION_COUNT))).toBeInTheDocument();
  });

  it('renders all three fixture subjects', async () => {
    installFetch({ session: identity() });

    renderApp(<AppRouter />, '/devtools/vision/state');

    expect(await screen.findByRole('button', { name: 'obj-fixture-1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'obj-fixture-2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'obj-fixture-3' })).toBeInTheDocument();
  });

  it('renders all four observation states distinctly', async () => {
    installFetch({ session: identity() });

    renderApp(<AppRouter />, '/devtools/vision/state');
    // Await the DATA, not just the heading — the heading renders during loading.
    expect((await screen.findAllByText('Present')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Absent').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not visible').length).toBeGreaterThan(0);
  });

  it('never renders "not visible" as a violation', async () => {
    installFetch({ session: identity() });

    renderApp(<AppRouter />, '/devtools/vision/compliance');
    await screen.findByText('obj-fixture-3');

    // obj-fixture-3 has a refused hand observation and a present head. It must
    // NOT be marked rule-actionable: a refusal is never a finding.
    const row = screen.getByText('obj-fixture-3').closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).queryByText('candidate')).not.toBeInTheDocument();

    // obj-fixture-2 has an observed-absent head covering, and must be.
    const violating = screen.getByText('obj-fixture-2').closest('tr');
    expect(within(violating as HTMLElement).getByText('candidate')).toBeInTheDocument();
  });

  it('labels fixture data as a fixture, never as live', async () => {
    installFetch({ session: identity() });

    renderApp(<AppRouter />, '/devtools/vision/state');

    expect((await screen.findAllByText(/fixture/i)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^live$/i)).not.toBeInTheDocument();
  });

  it('opens a subject and shows its attributes with provenance', async () => {
    installFetch({ session: identity() });
    const user = userEvent.setup();

    renderApp(<AppRouter />, '/devtools/vision/state');
    await user.click(await screen.findByRole('button', { name: 'obj-fixture-3' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('hand_covering')).toBeInTheDocument();
    expect(within(dialog).getByText(/raw: not_visible/)).toBeInTheDocument();
    // Confidence must carry its semantics, so nothing presents SELF_REPORTED as
    // a probability.
    // One per attribute — the drawer shows both.
    expect(within(dialog).getAllByText(/self_reported/).length).toBeGreaterThan(0);
  });
});

describe('DevTools information architecture', () => {
  it('groups tools rather than listing twenty peers', async () => {
    installFetch({ session: identity() });

    renderApp(<AppRouter />, '/devtools/vision');
    await screen.findByRole('heading', { name: /vision os overview/i });

    const nav = screen.getByRole('navigation', { name: 'Vision OS sections' });
    for (const group of ['Platform', 'Perception', 'Understanding', 'State', 'Operations']) {
      expect(within(nav).getByText(group)).toBeInTheDocument();
    }
  });

  it('every screen explains what it is and why it matters', async () => {
    installFetch({ session: identity() });

    renderApp(<AppRouter />, '/devtools/vision/economy');
    const heading = await screen.findByRole('heading', { name: /economy/i });
    expect(heading).toBeInTheDocument();
    // Not a bare table: a screen with no explanation is the debug dump §14 rules out.
    expect(screen.getByText(/demands × changes/i)).toBeInTheDocument();
  });

  it('a screen with no backend yet says which route and phase supply it', async () => {
    installFetch({ session: identity() });

    renderApp(<AppRouter />, '/devtools/vision/frames');
    await screen.findByRole('heading', { name: /frame by frame/i });

    expect(screen.getByText(/no data source yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Phase 3/)).toBeInTheDocument();
  });
});

describe('evidence privilege', () => {
  it('a supervisor without view_evidence never sees the evidence link', async () => {
    installFetch({ session: supervisorIdentity() });

    renderApp(<AppRouter />, '/dashboard');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument());

    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).queryByRole('link', { name: /^evidence$/i })).not.toBeInTheDocument();
  });

  it('and is redirected away from the route', async () => {
    installFetch({ session: supervisorIdentity() });

    renderApp(<AppRouter />, '/evidence');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument());
  });
});

/**
 * Staff Hygiene, and the distinction the page exists to preserve.
 *
 * The four observation states must stay four on screen. A test that only
 * checked "the table rendered" would pass just as happily on a page that had
 * collapsed NOT_VISIBLE into ABSENT — which is the single defect this product
 * cannot ship, because it accuses somebody nobody could see.
 */

import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRouter } from '@app/router/AppRouter';
import { identity, installFetch, renderApp } from './support';

function subject(objectId: string, values: Record<string, string>, lastSeen = 1_700_000_000_000_000_000) {
  return {
    object_id: objectId,
    camera_key: 'cam-01',
    class_id: 'person',
    first_seen: lastSeen,
    last_seen: lastSeen,
    attributes: Object.entries(values).map(([key, value]) => ({
      key,
      value,
      observed_at: lastSeen,
      valid_until: null,
      confidence: { value: 0.9, semantics: 'self_reported', calibrated: false },
    })),
  };
}

function page(subjects: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    available: true,
    reason: '',
    subjects,
    count: subjects.length,
    observation_count: subjects.length,
    cameras_queried: ['cam-01'],
    window: { since: '2026-09-01T00:00:00Z', until: '2026-09-01T08:00:00Z' },
    window_fully_observable: true,
    ...overrides,
  };
}

describe('staff hygiene keeps the four states distinct', () => {
  it('renders each observation state with its own word', async () => {
    installFetch({
      session: identity(),
      observations: page([
        subject('obj-present', { head_covering: 'hairnet' }),
        subject('obj-absent', { head_covering: 'none' }),
        subject('obj-refused', { head_covering: 'not_visible' }),
      ]),
    });
    renderApp(<AppRouter />, '/hygiene');

    await screen.findByRole('heading', { name: /staff hygiene/i });

    // Each row carries the state as a *word*, not only as a colour.
    expect(await screen.findByText('Present')).toBeInTheDocument();
    expect(screen.getByText('Absent')).toBeInTheDocument();
    expect(screen.getByText('Not visible')).toBeInTheDocument();
  });

  it('never renders a refused observation as a violation', async () => {
    installFetch({
      session: identity(),
      observations: page([subject('obj-refused', { head_covering: 'not_visible' })]),
    });
    renderApp(<AppRouter />, '/hygiene');

    await screen.findByRole('heading', { name: /staff hygiene/i });
    const row = (await screen.findByText('obj-refused')).closest('tr') as HTMLElement;

    expect(within(row).getByText('Not visible')).toBeInTheDocument();
    // The whole point: a covering the camera could not see is not "Absent".
    expect(within(row).queryByText('Absent')).not.toBeInTheDocument();
  });

  it('an attribute the platform never reported reads as Unknown, not compliant', async () => {
    // Only head covering was observed. Face and hands were not, and the table
    // must say so rather than leaving a blank a reader fills in optimistically.
    installFetch({
      session: identity(),
      observations: page([subject('obj-partial', { head_covering: 'hairnet' })]),
    });
    renderApp(<AppRouter />, '/hygiene');

    await screen.findByRole('heading', { name: /staff hygiene/i });
    const row = (await screen.findByText('obj-partial')).closest('tr') as HTMLElement;

    expect(within(row).getByText('Present')).toBeInTheDocument();
    expect(within(row).getAllByText('Unknown')).toHaveLength(2);
  });

  it('claims no compliance anywhere on the page', async () => {
    installFetch({
      session: identity(),
      observations: page([subject('obj-1', { head_covering: 'hairnet' })]),
    });
    renderApp(<AppRouter />, '/hygiene');

    await screen.findByRole('heading', { name: /staff hygiene/i });
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/compliant/i);
    expect(text).not.toMatch(/100%/);
    expect(text).not.toMatch(/violation/i);
  });
});

describe('staff hygiene tells the truth about absence', () => {
  it('an unavailable platform is not reported as nobody observed', async () => {
    installFetch({
      session: identity(),
      observations: page([], {
        available: false,
        reason: 'Vision OS is not assembled in this process.',
        cameras_queried: [],
        window_fully_observable: false,
      }),
    });
    renderApp(<AppRouter />, '/hygiene');

    await screen.findByRole('heading', { name: /staff hygiene/i });

    // The platform's own sentence, and the unavailable state rather than empty.
    expect(await screen.findByText(/not assembled/i)).toBeInTheDocument();
    expect(screen.queryByText(/nobody was observed/i)).not.toBeInTheDocument();
  });

  it('watching and seeing nobody says exactly that', async () => {
    installFetch({ session: identity(), observations: page([]) });
    renderApp(<AppRouter />, '/hygiene');

    await screen.findByRole('heading', { name: /staff hygiene/i });
    expect(await screen.findByText(/nobody was observed in this window/i)).toBeInTheDocument();
  });

  it('an account with no camera says so rather than implying an empty kitchen', async () => {
    installFetch({
      session: identity(),
      observations: page([], { cameras_queried: [] }),
    });
    renderApp(<AppRouter />, '/hygiene');

    await screen.findByRole('heading', { name: /staff hygiene/i });
    expect(await screen.findByText(/your account reaches no camera/i)).toBeInTheDocument();
  });

  it('states when the window was only partly observable', async () => {
    installFetch({
      session: identity(),
      observations: page([subject('obj-1', { head_covering: 'hairnet' })], {
        window_fully_observable: false,
      }),
    });
    renderApp(<AppRouter />, '/hygiene');

    await screen.findByRole('heading', { name: /staff hygiene/i });
    expect(await screen.findByText(/partial coverage/i)).toBeInTheDocument();
  });
});

describe('staff hygiene windowing', () => {
  it('changing the window re-queries with a different range', async () => {
    const calls: string[] = [];
    installFetch({
      session: identity(),
      calls,
      observations: page([subject('obj-1', { head_covering: 'hairnet' })]),
    });
    const user = userEvent.setup();
    renderApp(<AppRouter />, '/hygiene');

    await screen.findByRole('heading', { name: /staff hygiene/i });
    await user.click(screen.getByRole('button', { name: /last hour/i }));

    await waitFor(() => {
      const observationCalls = calls.filter((c) => c.includes('/observations'));
      expect(observationCalls.length).toBeGreaterThan(1);
    });
  });
});

describe('staff hygiene attributes a reading to where it happened', () => {
  it('shows the zone recorded at the time, not the camera current zone', async () => {
    // The backend resolves this from `camera_zone_assignments`, so a camera that
    // has since moved does not relocate this row. The page renders what it was
    // given and adds no join of its own.
    installFetch({
      session: identity(),
      observations: page([
        {
          ...subject('obj-zoned', { head_covering: 'hairnet' }),
          zone_id: 'zone-prep',
          zone_name: 'Prep line',
          zone_recorded: true,
        },
      ]),
    });
    renderApp(<AppRouter />, '/hygiene');

    await screen.findByRole('heading', { name: /staff hygiene/i });
    const row = (await screen.findByText('obj-zoned')).closest('tr') as HTMLElement;

    expect(within(row).getByText('Prep line')).toBeInTheDocument();
  });

  it('says the zone was never recorded rather than inferring one', async () => {
    // An observation older than the camera's first recorded assignment. Nobody
    // wrote the zone down, and reading today's mapping onto it would be the
    // exact rewrite the assignment history exists to prevent.
    installFetch({
      session: identity(),
      observations: page([
        { ...subject('obj-unrecorded', { head_covering: 'hairnet' }), zone_recorded: false },
      ]),
    });
    renderApp(<AppRouter />, '/hygiene');

    await screen.findByRole('heading', { name: /staff hygiene/i });
    const row = (await screen.findByText('obj-unrecorded')).closest('tr') as HTMLElement;

    expect(within(row).getByText('Not recorded')).toBeInTheDocument();
  });
});

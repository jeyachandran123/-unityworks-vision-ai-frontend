/**
 * The model evaluation dashboard.
 *
 * An evaluation page can be wrong in ways an operational page cannot, because a
 * number here becomes a claim about whether the product works. The assertions
 * are about the four ways that goes wrong:
 *
 *   an undefined metric rendered as zero        → a model that looks bad, wrongly
 *   an undated artifact rendered as fresh       → a stale result trusted as current
 *   incomparable runs charted together          → a trend that never happened
 *   a metric shown without what it measures     → "23%" read as model accuracy
 */

import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRouter } from '@app/router/AppRouter';
import {
  adminIdentity,
  evaluationSummary,
  identity,
  installFetch,
  managerIdentity,
  metric,
  renderApp,
} from './support';

async function openDashboard() {
  renderApp(<AppRouter />, '/model-evaluation');
  return screen.findByRole('heading', { name: 'Model Evaluation' });
}

describe('the dashboard refuses to invent a headline', () => {
  it('shows an em dash where an overall model score would be, and says why', async () => {
    installFetch({ session: identity() });
    await openDashboard();

    expect(await screen.findByText(/overall model score/i)).toBeInTheDocument();
    expect(
      screen.getByText(/any combined score would be a number with no definition/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('counts dated and undated artifacts separately', async () => {
    // "Undated" is not "old". A page that folded them together would let an
    // artifact nobody dated look as current as one measured yesterday.
    installFetch({ session: identity() });
    await openDashboard();

    expect(await screen.findByText(/with no date recorded/i)).toBeInTheDocument();
    expect(screen.getByText(/undated is not old/i)).toBeInTheDocument();
  });
});

describe('a metric carries what it means', () => {
  it('renders the definition and full provenance without a tooltip', async () => {
    // Reachable by keyboard, selectable, copyable. A provenance nobody can copy
    // into a message is a provenance nobody checks.
    installFetch({ session: identity() });
    const user = userEvent.setup();
    await openDashboard();

    // Two families each expose one group, so there are two identical buttons.
    // The first is the PPE run, which is the one these assertions are about.
    const buttons = await screen.findAllByRole('button', { name: /show 1 metric group/i });
    await user.click(buttons[0]!);

    expect(
      await screen.findByText(/not overall model accuracy and not a compliance pass rate/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText('datasets/kitchen-01/results/baseline.json').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/kitchen-01/).length).toBeGreaterThan(0);
  });

  it('shows an undefined metric as a dash with its reason, never as zero', async () => {
    installFetch({ session: identity() });
    const user = userEvent.setup();
    await openDashboard();

    // Two families each expose one group, so there are two identical buttons.
    // The first is the PPE run, which is the one these assertions are about.
    const buttons = await screen.findAllByRole('button', { name: /show 1 metric group/i });
    await user.click(buttons[0]!);

    expect(await screen.findByText('absent recall')).toBeInTheDocument();
    // Twice over: the heading the page adds, and the sentence the backend wrote.
    expect(screen.getAllByText(/undefined, not zero/i).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/no annotated example of this state exists/i),
    ).toBeInTheDocument();
    // And nothing rendered it as a percentage.
    expect(screen.queryByText('0.0%')).not.toBeInTheDocument();
  });

  it('states when an artifact records no evaluation date', async () => {
    installFetch({ session: identity() });
    const user = userEvent.setup();
    await openDashboard();

    // Two families each expose one group, so there are two identical buttons.
    // The first is the PPE run, which is the one these assertions are about.
    const buttons = await screen.findAllByRole('button', { name: /show 1 metric group/i });
    await user.click(buttons[0]!);

    expect(
      await screen.findAllByText(/no evaluation date recorded in the artifact/i),
    ).not.toHaveLength(0);
  });

  it('labels an undated run as undated rather than stale', async () => {
    installFetch({ session: identity() });
    await openDashboard();

    expect(await screen.findByText(/no evaluation date recorded/i)).toBeInTheDocument();
  });
});

describe('comparability is respected', () => {
  it('never draws a chart across two comparison sets', async () => {
    // Two sets, each with one run. Neither is chartable, and both say so
    // instead of being merged into a two-point "trend".
    installFetch({ session: identity() });
    await openDashboard();

    const snapshots = await screen.findAllByText(/a single run\. shown on its own/i);
    expect(snapshots.length).toBe(2);
    expect(screen.getAllByText(/standalone snapshot/i).length).toBe(2);
  });

  it('says a comparable, undated group compares configurations rather than time', async () => {
    installFetch({
      session: identity(),
      evaluation: evaluationSummary({
        comparison_sets: [
          {
            key: 'ppe',
            metric_kind: 'attribute_agreement',
            model: 'nvidia (understander.nvidia_vl)',
            dataset: 'kitchen-01',
            split: 'test',
            configuration: 'kitchen-safety.example.json',
            run_ids: ['baseline', 'crop448'],
            comparable: true,
            dated: false,
            why: '2 runs share a metric, model, dataset and configuration. They record no evaluation dates.',
          },
        ],
      }),
    });
    await openDashboard();

    expect(await screen.findByText(/directly comparable/i)).toBeInTheDocument();
    expect(screen.getByText(/they record no evaluation dates/i)).toBeInTheDocument();
  });

  it('explains that discrete runs are not continuous monitoring', async () => {
    installFetch({ session: identity() });
    await openDashboard();

    expect(
      await screen.findByText(/a line would imply evaluations between the points that nobody ran/i),
    ).toBeInTheDocument();
  });
});

describe('dataset coverage keeps the manifests own words', () => {
  it('surfaces what a dataset cannot measure, beside its counts', async () => {
    installFetch({ session: identity() });
    await openDashboard();

    // Both fixture datasets carry limitations, which is the honest case.
    expect((await screen.findAllByText(/what this dataset cannot measure/i)).length).toBe(2);
    expect(screen.getByText(/CANNOT measure detection recall/)).toBeInTheDocument();
  });

  it('shows a dataset awaiting footage as awaiting, not as zero', async () => {
    installFetch({ session: identity() });
    await openDashboard();

    expect(await screen.findByText('AWAITING FOOTAGE')).toBeInTheDocument();
    // Its counts render as dashes rather than zeros.
    const heading = screen.getByRole('heading', { name: 'vision-phase5' });
    const card = heading.closest('section') ?? heading.parentElement!;
    expect(within(card as HTMLElement).queryByText('0')).not.toBeInTheDocument();
  });
});

describe('configured thresholds come from the policy', () => {
  it('shows the real minimum confidence and marks it as configuration', async () => {
    installFetch({ session: identity() });
    const user = userEvent.setup();
    await openDashboard();

    expect(await screen.findByText(/minimum detection confidence/i)).toBeInTheDocument();
    // Rendered as the policy writes it, not converted to a percentage: the
    // point of this panel is that it matches the source configuration exactly.
    // Twice: the rendered value and the raw value in the provenance panel.
    expect(screen.getAllByText('0.4').length).toBeGreaterThan(0);

    await user.click(screen.getByText(/minimum detection confidence/i));
    expect(
      await screen.findByText(/not applicable — this is configuration, not an evaluation/i),
    ).toBeInTheDocument();
  });
});

describe('sensitive material and triggers', () => {
  it('states that dataset imagery is deliberately unreachable', async () => {
    installFetch({ session: identity() });
    await openDashboard();

    expect(
      await screen.findByText(/deliberately not reachable through this API/i),
    ).toBeInTheDocument();
  });

  it('renders no image element anywhere on the page', async () => {
    installFetch({ session: identity() });
    await openDashboard();
    await screen.findByText(/overall model score/i);

    expect(screen.queryAllByRole('img').filter((el) => el.tagName === 'IMG')).toHaveLength(0);
    const html = document.body.innerHTML;
    expect(html).not.toMatch(/\.jpg|\.jpeg|\.png/i);
  });

  it('says why no evaluation can be triggered', async () => {
    installFetch({ session: identity() });
    await openDashboard();

    expect(
      await screen.findByText(/without either a paid network dependency or overwriting a historical artifact/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /run evaluation|retrain|trigger/i }),
    ).not.toBeInTheDocument();
  });
});

describe('the route is gated on its own permission', () => {
  it('admits a developer', async () => {
    installFetch({ session: identity() });
    expect(await openDashboard()).toBeInTheDocument();
  });

  it('redirects an org admin', async () => {
    // Stage 3 removed `view_model_evaluation` from ORG_ADMIN. Evaluation
    // artifacts answer "should we ship this model" — attribute agreement on a
    // 43-subject split, per-state confusion matrices — which is an engineering
    // question. The accountability an organization administrator has for what
    // the system claims is served by reports, which carry coverage and the
    // ruleset version behind every figure, and which this role still holds.
    installFetch({ session: adminIdentity() });
    renderApp(<AppRouter />, '/model-evaluation');

    await screen.findByRole('heading', { name: 'Command Center' });
    expect(
      screen.queryByRole('heading', { name: 'Model Evaluation' }),
    ).not.toBeInTheDocument();
  });

  it('redirects a restaurant manager', async () => {
    // Holds view_reports and view_observations, but not view_model_evaluation.
    installFetch({ session: managerIdentity() });
    renderApp(<AppRouter />, '/model-evaluation');

    await screen.findByRole('heading', { name: 'Command Center' });
    expect(
      screen.queryByRole('heading', { name: 'Model Evaluation' }),
    ).not.toBeInTheDocument();
  });

  it('appears in navigation only for accounts that hold the permission', async () => {
    installFetch({ session: identity() });
    renderApp(<AppRouter />, '/dashboard');
    await screen.findByRole('heading', { name: 'Command Center' });

    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: /model evaluation/i })).toBeInTheDocument();
  });

  it('is absent from an org admin’s navigation, and the route agrees', async () => {
    // Navigation visibility and route access must say the same thing. Hiding
    // the entry is not closing the door; the route redirect above is the door,
    // and the backend refuses the request underneath both.
    installFetch({ session: adminIdentity() });
    renderApp(<AppRouter />, '/dashboard');
    await screen.findByRole('heading', { name: 'Command Center' });

    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).queryByRole('link', { name: /model evaluation/i })).not.toBeInTheDocument();
    // And no engineering area at all for this role.
    expect(within(nav).queryByText('Engineering')).not.toBeInTheDocument();
  });
});

describe('an unreadable artifact family', () => {
  it('reports the reason rather than an empty section', async () => {
    installFetch({
      session: identity(),
      evaluation: evaluationSummary({
        families: [
          {
            key: 'ppe_evaluation',
            title: 'PPE attribute evaluation',
            description: 'Offline evaluation against the annotated split.',
            available: false,
            reason:
              'datasets/kitchen-01/results/baseline.json is missing or could not be read as an evaluation report.',
            expected_artifacts: ['datasets/kitchen-01/results/baseline.json'],
            runs: [],
          },
        ],
      }),
    });
    await openDashboard();

    expect(
      await screen.findByText(/could not be read as an evaluation report/i),
    ).toBeInTheDocument();
    // And no metric was invented to fill the space. Scoped to the family's own
    // region: "attribute agreement" is also a comparison-set label further down,
    // which is a different thing and legitimately still present.
    expect(screen.queryByRole('button', { name: /metric group/i })).not.toBeInTheDocument();
  });

  it('shows a partial run with its reason', async () => {
    const base = evaluationSummary();
    const [first] = base.families;
    const family = { ...first! };
    family.runs = [
      {
        ...family.runs[0]!,
        completeness: 'partial',
        reason: 'The provider rate-limited every request.',
        groups: [
          {
            key: 'probe',
            title: 'Probe outcome',
            description: 'What the provider did.',
            metrics: [metric({ key: 'answer_rate', label: 'Answer rate', kind: 'ratio', value: 0 })],
            confusion: null,
          },
        ],
      },
    ];
    installFetch({
      session: identity(),
      evaluation: evaluationSummary({ families: [family] }),
    });
    await openDashboard();

    expect(await screen.findByText('partial')).toBeInTheDocument();
    expect(screen.getByText(/rate-limited every request/i)).toBeInTheDocument();
  });
});

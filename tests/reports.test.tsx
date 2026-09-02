/**
 * The Reports page.
 *
 * A reporting screen can be wrong in ways an ordinary page cannot, because its
 * output gets circulated and signed. The assertions here are about the two that
 * matter:
 *
 *   an incomplete period must not read as a finished one
 *   an empty section must say which kind of nothing it is
 *
 * Plus the boundaries: export is a separate permission, a report the account
 * cannot run says so rather than vanishing, and the seven unconnected modules
 * appear in the catalogue with their own honest state.
 */

import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRouter } from '@app/router/AppRouter';
import {
  adminIdentity,
  identity,
  installFetch,
  managerIdentity,
  reportCatalogue,
  reportPayload,
  renderApp,
  supervisorIdentity,
} from './support';

async function openReport(name: RegExp) {
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: 'Reports' });
  await user.click(await screen.findByRole('button', { name }));
  return user;
}

describe('reports state their coverage before their figures', () => {
  it('marks a complete period as complete', async () => {
    installFetch({ session: adminIdentity() });
    renderApp(<AppRouter />, '/reports');
    await openReport(/incident summary/i);

    expect(await screen.findByText(/coverage complete/i)).toBeInTheDocument();
  });

  it('never presents an unfinished period as a finished one', async () => {
    // The property the whole engine exists for. The window produced rows, and
    // the page must still say the figures are not comparable with a completed
    // period — loudly, above the numbers.
    installFetch({
      session: adminIdentity(),
      reports: {
        incident_summary: reportPayload('incident_summary', {
          coverage: {
            ...reportPayload('incident_summary').coverage,
            complete: false,
            gaps: [
              {
                kind: 'future',
                detail: 'This period has not finished. Figures cover it up to now.',
                since: null,
                until: null,
              },
            ],
          },
        }),
      },
    });
    renderApp(<AppRouter />, '/reports');
    await openReport(/incident summary/i);

    expect(await screen.findByText(/coverage incomplete/i)).toBeInTheDocument();
    expect(
      screen.getByText(/read this before comparing these figures/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/this period has not finished/i)).toBeInTheDocument();
  });

  it('shows an unavailable source as unavailable rather than as zero rows', async () => {
    installFetch({
      session: adminIdentity(),
      reports: {
        hygiene_observations: reportPayload('hygiene_observations', {
          sections: [],
          coverage: {
            ...reportPayload('hygiene_observations').coverage,
            complete: false,
            sources: [
              {
                source: 'observations',
                available: false,
                reason: 'Vision OS is not assembled in this process.',
                rows: 0,
                truncated: false,
                earliest: null,
              },
            ],
            gaps: [
              {
                kind: 'source_unavailable',
                detail: 'observations: Vision OS is not assembled in this process.',
                since: null,
                until: null,
              },
            ],
          },
        }),
      },
    });
    renderApp(<AppRouter />, '/reports');
    await openReport(/hygiene observations/i);

    expect(await screen.findByText(/observations: not available/i)).toBeInTheDocument();
    // And never the sentence that would imply a clean kitchen.
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/no observations recorded/i);
    expect(text).not.toMatch(/0 violations/i);
  });

  it('says when the timezone could not be resolved', async () => {
    installFetch({
      session: adminIdentity(),
      reports: {
        incident_summary: reportPayload('incident_summary', {
          coverage: {
            ...reportPayload('incident_summary').coverage,
            timezone: 'Mars/Olympus_Mons',
            timezone_resolved: false,
          },
        }),
      },
    });
    renderApp(<AppRouter />, '/reports');
    await openReport(/incident summary/i);

    expect(
      await screen.findByText(/boundaries computed in UTC/i),
    ).toBeInTheDocument();
  });
});

describe('an empty section says which kind of nothing it is', () => {
  it('renders the backend empty note instead of a bare table', async () => {
    installFetch({ session: adminIdentity() });
    renderApp(<AppRouter />, '/reports');
    await openReport(/incident summary/i);

    // The default fixture carries one populated and one empty section.
    expect(
      await screen.findByText(
        /no incident was raised in this period, so there is nothing to break down/i,
      ),
    ).toBeInTheDocument();
  });

  it('still renders the populated section beside it', async () => {
    installFetch({ session: adminIdentity() });
    renderApp(<AppRouter />, '/reports');
    await openReport(/incident summary/i);

    const table = await screen.findByRole('table', { name: /incidents by period/i });
    expect(within(table).getByText('2026-08')).toBeInTheDocument();
  });
});

describe('the catalogue is honest about what it contains', () => {
  it('lists the seven modules that have no data source', async () => {
    installFetch({ session: adminIdentity() });
    renderApp(<AppRouter />, '/reports');
    // `findByText`, not `getByText` after the heading: `PageHeader` renders
    // during the loading state too, so the heading resolving says nothing about
    // the catalogue beneath it.
    expect((await screen.findAllByText(/not connected yet/i)).length).toBeGreaterThan(0);
    for (const label of [/people counting/i, /demography/i, /unique patron id/i]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('reports a module state rather than an empty report', async () => {
    installFetch({ session: adminIdentity() });
    renderApp(<AppRouter />, '/reports');
    await openReport(/unique patron id/i);

    expect(await screen.findByText(/this module is blocked/i)).toBeInTheDocument();
    // Three times over: the unavailable panel, the source badge and the gap
    // list. All three are deliberate, so the assertion is that it appears.
    expect(screen.getAllByText(/blocked pending legal review/i).length).toBeGreaterThan(0);
  });

  it('lists a report the account cannot run, and says so', async () => {
    // Listed rather than hidden: a menu that silently varied by account would
    // leave an operator unable to tell "does not exist" from "not permitted".
    installFetch({
      session: managerIdentity(),
      reportTypes: reportCatalogue({
        reports: reportCatalogue().reports.map((report) =>
          report.id === 'audit_activity' ? { ...report, permitted: false } : report,
        ),
      }),
    });
    renderApp(<AppRouter />, '/reports');

    const entry = await screen.findByRole('button', { name: /audit activity/i });
    expect(within(entry).getByText(/not available to your account/i)).toBeInTheDocument();
  });

  it('explains that a report needs its sources own permissions', async () => {
    installFetch({
      session: managerIdentity(),
      reportTypes: reportCatalogue({
        reports: reportCatalogue().reports.map((report) =>
          report.id === 'audit_activity' ? { ...report, permitted: false } : report,
        ),
      }),
    });
    renderApp(<AppRouter />, '/reports');
    await openReport(/audit activity/i);

    expect(
      await screen.findByText(/cannot run this report/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/view_reports, view_audit/i)).toBeInTheDocument();
  });
});

describe('export is a separate act', () => {
  it('offers the formats to an account that may export', async () => {
    installFetch({ session: adminIdentity() });
    renderApp(<AppRouter />, '/reports');
    await openReport(/incident summary/i);

    for (const label of ['PDF', 'Excel', 'CSV', 'JSON']) {
      expect(await screen.findByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('withholds export from an account that may only read', async () => {
    // A kitchen supervisor holds view_reports and not export_reports: the
    // screen is shared, and a downloaded file is not.
    installFetch({ session: supervisorIdentity() });
    renderApp(<AppRouter />, '/reports');
    await openReport(/incident summary/i);

    expect(
      await screen.findByText(/not take a copy away/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'PDF' })).not.toBeInTheDocument();
  });

  it('downloads through the authorized path and records the filename', async () => {
    const calls: string[] = [];
    installFetch({ session: adminIdentity(), calls });
    renderApp(<AppRouter />, '/reports');
    const user = await openReport(/incident summary/i);

    await user.click(await screen.findByRole('button', { name: 'PDF' }));

    await waitFor(() =>
      expect(calls.some((c) => c.includes('/reports/incident_summary/export'))).toBe(true),
    );
    expect(calls.find((c) => c.includes('/export'))).toMatch(/format=pdf/);
    expect(await screen.findByText(/recorded in the audit trail/i)).toBeInTheDocument();
  });

  it('disables a format this deployment cannot produce, and says why', async () => {
    installFetch({
      session: adminIdentity(),
      reportTypes: reportCatalogue({
        formats: {
          json: { available: true, reason: '' },
          csv: { available: true, reason: '' },
          xlsx: { available: true, reason: '' },
          pdf: {
            available: false,
            reason: "PDF export needs the 'reportlab' package, which is not installed.",
          },
        },
      }),
    });
    renderApp(<AppRouter />, '/reports');
    await openReport(/incident summary/i);

    expect(await screen.findByRole('button', { name: 'PDF' })).toBeDisabled();
    expect(screen.getByText(/needs the 'reportlab' package/i)).toBeInTheDocument();
  });
});

describe('the reports route is gated on its own permission', () => {
  it('admits an account holding view_reports', async () => {
    installFetch({ session: adminIdentity() });
    renderApp(<AppRouter />, '/reports');
    expect(await screen.findByRole('heading', { name: 'Reports' })).toBeInTheDocument();
  });

  it('redirects an account without it', async () => {
    // A developer holds view_observations but not view_reports. Under the old
    // gating that would have admitted them; it must not now.
    installFetch({ session: identity() });
    renderApp(<AppRouter />, '/reports');

    await screen.findByRole('heading', { name: 'Command Center' });
    expect(screen.queryByRole('heading', { name: 'Reports' })).not.toBeInTheDocument();
  });
});

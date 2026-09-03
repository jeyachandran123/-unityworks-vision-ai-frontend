/**
 * The Stage 5 art direction, as behaviour rather than as appearance.
 *
 * Most of this stage is verified in a real browser, because computed colour,
 * measured boxes and media queries are not things jsdom has. What *can* be
 * pinned here is the part that is structural — and it is the part most likely
 * to rot, because it is the part a later page can quietly opt out of:
 *
 *   · every page opens the same way, with an area named above its title
 *   · the spine is the content column's, so a page cannot fail to have it
 *   · a proportion is still refused when nothing accounts for the total
 *   · the attention panel's aside is real rows into real incidents
 *
 * The first two are what stopped the product having two visual languages. If
 * they break, it will be because somebody added a nineteenth page the old way,
 * which is exactly what these cases exist to catch.
 */

import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { AppRouter } from '@app/router/AppRouter';
import { Attention, Meter } from '@shared/ui/product';
import { adminIdentity, installFetch, renderApp } from './support';

describe('one opening, on every page', () => {
  /**
   * Six feature files never received Stage 3's opening and kept a 22px heading
   * where the rebuilt screens had a display title with the area named above it.
   * Each of these routes came from one of those files.
   */
  const migrated = [
    ['/admin', 'Administration', 'Platform'],
    ['/hygiene', 'Staff Hygiene', 'Compliance'],
    ['/people-counting', 'People Counting', 'Intelligence'],
    ['/patron-id', 'Unique Patron ID', 'Platform'],
  ] as const;

  for (const [path, title, area] of migrated) {
    it(`${path} names its area above its title`, async () => {
      installFetch({ session: adminIdentity() });
      renderApp(<AppRouter />, path);

      const heading = await screen.findByRole('heading', { name: title, level: 1 });
      const opening = heading.closest('header');
      expect(opening, `${path} has no page opening`).not.toBeNull();
      // The eyebrow is inside the same opening as the title — not somewhere
      // else on the page that happens to contain the word.
      expect(within(opening as HTMLElement).getByText(area)).toBeInTheDocument();
    });
  }

  it('the spine belongs to the content column, so no page can omit it', async () => {
    installFetch({ session: adminIdentity() });
    renderApp(<AppRouter />, '/admin');
    await screen.findByRole('heading', { name: 'Administration', level: 1 });

    const main = document.getElementById('main');
    expect(main?.classList.contains('uwv-spine')).toBe(true);

    // And the sections tie themselves to it.
    expect(document.querySelectorAll('.uwv-spine-mark').length).toBeGreaterThan(2);
  });

  it('a page declares exactly one lead section', async () => {
    installFetch({ session: adminIdentity() });
    renderApp(<AppRouter />, '/admin');
    await screen.findByRole('heading', { name: 'Administration', level: 1 });

    // The opening is always a lead; beyond it there is one, and only one.
    const leads = [...document.querySelectorAll('.uwv-spine-mark[data-lead="true"]')];
    expect(leads.length).toBe(2);
    expect(leads[0]?.tagName).toBe('HEADER');
  });
});

describe('the meter still refuses what it cannot draw', () => {
  it('draws nothing when no segment accounts for the total', () => {
    // The camera wall's real shape when the server reports channels but no
    // per-state breakdown: three channels, six states, every one of them zero.
    render(
      <Meter
        caption="Channels by stream state"
        total={3}
        emptyNote="The recorder reports no channel at all."
        segments={[
          { key: 'live', label: 'Live', value: 0, color: 'var(--health-online)' },
          { key: 'offline', label: 'Offline', value: 0, color: 'var(--health-offline)' },
        ]}
      />,
    );

    expect(screen.getByText(/no breakdown was reported/i)).toBeInTheDocument();
    // Specifically *not* the empty-denominator note: three channels do exist.
    expect(screen.queryByText(/reports no channel at all/i)).not.toBeInTheDocument();
    // And no track is painted, because an empty track reads as all-clear.
    expect(document.querySelector('[role="img"]')).toBeNull();
  });

  it('still draws a real proportion', () => {
    render(
      <Meter
        caption="Channels by stream state"
        total={3}
        emptyNote="none"
        segments={[
          { key: 'live', label: 'Live', value: 1, color: 'var(--health-online)' },
          { key: 'offline', label: 'Offline', value: 2, color: 'var(--health-offline)' },
        ]}
      />,
    );
    expect(screen.queryByText(/no breakdown was reported/i)).not.toBeInTheDocument();
  });
});

describe('the attention panel', () => {
  it('composes as one column when there is nothing beside it', () => {
    render(
      <Attention
        tone="clear"
        headline="Nothing open"
        statement="No compliance violation is currently open."
      />,
    );
    expect(document.querySelector('.uwv-attention')).toBeNull();
  });

  it('takes the split only when it has an aside to put there', () => {
    render(
      <Attention
        tone="critical"
        headline="2 unresolved"
        statement="Two violations are open."
        aside={<a href="/incidents/inc-1">No head covering at the prep bench</a>}
      />,
    );
    expect(document.querySelector('.uwv-attention')).not.toBeNull();
    expect(screen.getByRole('link', { name: /no head covering/i })).toHaveAttribute(
      'href',
      '/incidents/inc-1',
    );
  });
});

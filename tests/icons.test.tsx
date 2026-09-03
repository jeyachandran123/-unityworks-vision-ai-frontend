/**
 * The icon system.
 *
 * The product drew its iconography with Unicode until this phase: `◐` for the
 * theme switch, `«`/`»` for the sidebar, `☰` for the drawer, and twenty
 * geometric characters for the twenty navigation destinations. Those rendered
 * in whatever font the operating system supplied, so the same build looked
 * different on a Windows workstation and a Linux kiosk, and several had no
 * relationship to what they marked.
 *
 * These cases pin the three things that would let that come back: a destination
 * added without an icon, an icon-only control shipped without an accessible
 * name, and a decorative icon that starts announcing itself.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PRODUCT_NAV } from '@app/router/navigation';
import { NavIcons, StateIcons, SeverityIcons, StatusIcons, ControlIcons } from '@shared/ui/icons';
import { EmptyState, IconButton, SeverityBadge, StateBadge } from '@shared/ui/primitives';
import { STATES } from '@shared/semantics/observation';
import { adminIdentity, installFetch, renderApp } from './support';
import { AppRouter } from '@app/router/AppRouter';

describe('every destination carries a real icon', () => {
  const items = PRODUCT_NAV.flatMap((section) => section.items);

  it('covers all twenty destinations', () => {
    expect(items).toHaveLength(20);
  });

  it('gives each one a component, never a character', () => {
    for (const item of items) {
      expect(typeof item.icon, `${item.id} has no icon component`).toBe('object');
      expect(item.icon, `${item.id} has no icon`).toBeTruthy();
    }
  });

  it('does not reuse one icon for two destinations', () => {
    // Two destinations sharing an icon is the failure the old glyphs had for
    // severity, where `critical` and `high` were the same triangle and colour
    // was the only thing telling them apart.
    const icons = items.map((item) => item.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('draws each one from the shared set rather than importing ad hoc', () => {
    const known = new Set<unknown>(Object.values(NavIcons));
    for (const item of items) {
      expect(known.has(item.icon), `${item.id} uses an icon outside NavIcons`).toBe(true);
    }
  });
});

describe('the four observation states keep their own icons', () => {
  it('maps every state the semantics module declares', () => {
    for (const key of Object.keys(STATES)) {
      expect(StateIcons[key as keyof typeof StateIcons], `${key} has no icon`).toBeTruthy();
    }
  });

  it('never draws two states the same way', () => {
    const icons = Object.values(StateIcons);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('leaves the semantics module itself untouched', () => {
    // `glyph` is the semantics layer's own non-colour signal and its uniqueness
    // is asserted in `semantics.test.ts`. The icon mapping lives in the UI layer
    // precisely so that rendering choices cannot reach into this contract.
    for (const state of Object.values(STATES)) {
      expect(typeof state.glyph).toBe('string');
    }
  });

  it('renders a state badge with its word, and the icon silently', () => {
    render(<StateBadge state="not_visible" />);
    // The word carries the meaning for everyone.
    expect(screen.getByText('Not visible')).toBeInTheDocument();
    // The icon does not repeat it.
    expect(screen.queryByRole('img')).toBeNull();
  });
});

describe('severity ranks by shape, not only by colour', () => {
  it('gives each of the five ranks a distinct icon', () => {
    const icons = Object.values(SeverityIcons);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('renders the rank as a word beside a silent icon', () => {
    render(<SeverityBadge severity="critical" />);
    expect(screen.getByText('critical')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });
});

describe('icon-only controls keep their accessible names', () => {
  it('names a control whose only content is an icon', () => {
    render(
      <IconButton label="Collapse navigation" onClick={() => {}}>
        <span>icon</span>
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: 'Collapse navigation' })).toBeInTheDocument();
  });

  it('gives the shell one accessible name per icon control, and no duplicates', async () => {
    installFetch({ session: adminIdentity() });
    renderApp(<AppRouter />, '/dashboard');
    await screen.findByRole('heading', { name: 'Command Center', level: 1 });

    for (const name of [
      'Collapse navigation',
      /theme .* switch to/i,
    ]) {
      const found = screen.getAllByRole('button', { name });
      expect(found.length, `expected exactly one control named ${String(name)}`).toBe(1);
    }
  });

  it('does not let a decorative icon add a second name to a labelled control', async () => {
    installFetch({ session: adminIdentity() });
    renderApp(<AppRouter />, '/dashboard');
    await screen.findByRole('heading', { name: 'Command Center', level: 1 });

    const toggle = screen.getByRole('button', { name: /theme .* switch to/i });
    // An `img` inside would be read after the button's own label, which is the
    // duplicate-name defect this phase had to avoid: every icon inside a
    // labelled control is `aria-hidden`.
    expect(toggle.querySelector('[role="img"]')).toBeNull();
    expect(toggle.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('the shared sets are complete', () => {
  it('has an icon for every state a region can be in', () => {
    for (const key of ['empty', 'error', 'unavailable', 'unknown', 'awaiting', 'blocked'] as const) {
      expect(StatusIcons[key], `${key} has no icon`).toBeTruthy();
    }
  });

  it('has an icon for every shared control', () => {
    for (const key of ['close', 'menu', 'collapseNav', 'expandNav', 'theme', 'disclosure', 'goTo'] as const) {
      expect(ControlIcons[key], `${key} has no icon`).toBeTruthy();
    }
  });

  it('draws an empty state with a silent icon and a spoken title', () => {
    render(<EmptyState title="No incidents recorded" body="Nothing is being suppressed." />);
    expect(screen.getByText('No incidents recorded')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });
});

/**
 * The Command Center's alignment contract, and its Current Environment region.
 *
 * ### Why these are one file
 *
 * They are one repair. The page had four sections whose ticks floated above the
 * words they named and four content columns where it had one label column, and
 * the largest of those sections was a field of empty 16:9 rectangles standing in
 * for imagery the endpoint behind them cannot serve. Both are the same mistake
 * at different scales: a shape inherited from somewhere it was right, kept
 * somewhere it is not.
 *
 * ### What jsdom can and cannot hold
 *
 * The alignment itself is geometry, and geometry was verified in a real browser
 * — the tick and its label were measured at the same y on all five sections, at
 * 1440px and 430px, having been 22.5px apart before. jsdom has no layout, so
 * what is pinned here is the **structure that makes the geometry possible**, and
 * it is the part that rots: the tick hangs off the label, so a section that
 * renders its label some other way loses its tick visibly rather than acquiring
 * a wrong one silently.
 *
 * Everything about the environment region *is* testable here, because all of it
 * is a claim about data: which cameras are listed, which states are told apart,
 * what is said when a count is unknown, and what is never rendered at all.
 */

import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { AppRouter } from '@app/router/AppRouter';
import { identity, installFetch, renderApp } from './support';

/** Sixteen channels on one recorder — the estate this product actually runs on. */
const SIXTEEN = {
  configured: 16,
  sessions: 16,
  streaming: 12,
  health: [
    ...Array.from({ length: 12 }, (_, i) => ({
      camera_id: `cam-${String(i + 1).padStart(2, '0')}`,
      health: 'online',
      kind: 'live',
    })),
    { camera_id: 'cam-13', health: 'degraded', kind: 'live' },
    { camera_id: 'cam-14', health: 'connecting', kind: 'live' },
    { camera_id: 'cam-15', health: 'offline', kind: 'replay' },
    { camera_id: 'cam-16', health: 'error', kind: 'live' },
  ],
};

const RUNNING = {
  enabled: true,
  reason: '',
  active_sessions: 16,
  streaming_sessions: 12,
  streaming: true,
};

const dashboard = async (options: Parameters<typeof installFetch>[0] = {}) => {
  installFetch({ session: identity(), ...options });
  renderApp(<AppRouter />, '/dashboard');
  return screen.findByRole('heading', { name: 'Command Center', level: 1 });
};

const roster = () => document.querySelector('.uwv-roster') as HTMLElement;
const rows = () => [...document.querySelectorAll('.uwv-camera-line')];

/* ── the alignment contract ───────────────────────────────────────────────── */

describe('every section is marked once, by a real heading', () => {
  it('gives each marked section exactly one heading', async () => {
    await dashboard({ cameras: SIXTEEN, runtime: RUNNING });

    const marks = [...document.querySelectorAll('.uwv-section-head')];
    expect(marks.length).toBeGreaterThan(3);

    // A section is a heading a screen reader can jump to, not a styled label:
    // exactly one h1 (the opening) or h2 (every section below it) per mark.
    for (const mark of marks) {
      expect(
        mark.querySelectorAll('h1, h2').length,
        `${mark.textContent?.slice(0, 24)} has the wrong number of headings`,
      ).toBe(1);
    }
  });

  it('does not promote a label inside a region to a section', async () => {
    await dashboard({ cameras: SIXTEEN, runtime: RUNNING });

    // "Not yet reported" names a list *inside* the estate region. It is a
    // label, and must not become a heading or a section boundary.
    const inner = await screen.findByText('Not yet reported');
    expect(inner.closest('.uwv-section-head')).toBeNull();
    expect(['H1', 'H2', 'H3'].includes(inner.tagName)).toBe(false);
  });

  it('names the attention section as a heading', async () => {
    await dashboard({ cameras: SIXTEEN, runtime: RUNNING });

    expect(await screen.findByRole('heading', { name: 'Attention', level: 2 })).toBeInTheDocument();
  });
});

describe('one step between a ground and the axis', () => {
  it('insets every padded region by the same token', async () => {
    await dashboard({ cameras: SIXTEEN, runtime: RUNNING });

    // The attention panel used 32px, the estate's ground 24px and a camera
    // tile's chrome 12px, so the page had four text columns against one label
    // column. A literal here is how that comes back.
    const panel = document.querySelector('[aria-label="Primary attention"]') as HTMLElement;
    expect(panel.style.padding).toContain('var(--region-inset)');

    const estate = document.querySelector('.uwv-terminal') as HTMLElement;
    expect(estate.style.padding).toBe('var(--region-inset)');
  });
});

/* ── what Current Environment reports ─────────────────────────────────────── */

describe('the environment region reports sessions, not pictures', () => {
  it('never renders imagery, or a surface shaped like imagery', async () => {
    await dashboard({ cameras: SIXTEEN, runtime: RUNNING });
    await screen.findByText('cam-01');

    // `/status` serves no frame: imagery needs a per-camera ticket and a
    // long-lived MJPEG response, which only the wall asks for. A viewfinder here
    // is a promise the endpoint behind it cannot keep, and the previous
    // implementation kept sixteen-by-nine of empty for six cameras.
    expect(document.querySelectorAll('img')).toHaveLength(0);
    expect(document.querySelectorAll('.uwv-viewfinder')).toHaveLength(0);
    expect(screen.queryByText(/imagery is served on the wall/i)).not.toBeInTheDocument();
  });

  it('lists every session rather than the first six of them', async () => {
    await dashboard({ cameras: SIXTEEN, runtime: RUNNING });
    await screen.findByText('cam-01');

    expect(rows()).toHaveLength(16);
    for (const camera of SIXTEEN.health) {
      expect(
        roster().querySelector(`[data-camera-id="${camera.camera_id}"]`),
        `${camera.camera_id} is missing from the roster`,
      ).not.toBeNull();
    }
  });

  it('orders the roster worst first, so what needs a person is read first', async () => {
    await dashboard({ cameras: SIXTEEN, runtime: RUNNING });
    await screen.findByText('cam-01');

    const order = rows().map((row) => (row as HTMLElement).dataset.cameraId);
    expect(order.slice(0, 4)).toEqual(['cam-16', 'cam-13', 'cam-14', 'cam-15']);
  });
});

describe('four kinds of not-producing stay four kinds', () => {
  /**
   * The honesty rule at its sharpest. `error`, `degraded`, `connecting` and
   * `offline` all mean "no frame is arriving", and they need different people:
   * one needs an engineer, one needs waiting, one needs a session started. A
   * roster that printed "offline" for all four would be telling a manager that a
   * camera nobody switched on and a camera that fell over are the same event.
   */
  const distinct = [
    ['cam-16', 'error', /needs a person/i],
    ['cam-13', 'degraded', /reconnecting, or silent/i],
    ['cam-14', 'connecting', /no frame yet/i],
    ['cam-15', 'offline', /stopped, or never started/i],
    ['cam-01', 'online', /producing frames now/i],
  ] as const;

  for (const [id, state, meaning] of distinct) {
    it(`tells ${state} apart by its own words`, async () => {
      await dashboard({ cameras: SIXTEEN, runtime: RUNNING });
      await screen.findByText('cam-01');

      const row = roster().querySelector(`[data-camera-id="${id}"]`) as HTMLElement;
      // The backend's own word, unrounded and unsynonymed, and the plain reading
      // of it beside — two renderings of one truth, which is the distinction the
      // source's own enum draws between its two audiences.
      expect(within(row).getByText(state)).toBeInTheDocument();
      expect(within(row).getByText(meaning)).toBeInTheDocument();
    });
  }

  it('counts every state, including the ones with nobody in them', async () => {
    await dashboard({
      cameras: { ...SIXTEEN, health: SIXTEEN.health.filter((c) => c.health === 'online') },
      runtime: RUNNING,
    });
    await screen.findByText('cam-01');

    // Every session is in exactly one of these states, so a zero here is a real
    // reading of a real denominator — not the absent-data zero the product
    // forbids. A state that vanished when it emptied would leave "none faulted"
    // and "faults not reported" looking identical.
    const faulted = document.querySelector('[data-state="error"]') as HTMLElement;
    expect(faulted).not.toBeNull();
    expect(within(faulted).getByText('0')).toBeInTheDocument();
  });

  it('says so rather than guessing when it meets a state it does not know', async () => {
    await dashboard({
      cameras: {
        configured: 1,
        sessions: 1,
        streaming: 0,
        health: [{ camera_id: 'cam-99', health: 'quarantined', kind: 'live' }],
      },
      runtime: RUNNING,
    });
    const row = (await screen.findByText('cam-99')).closest('.uwv-camera-line') as HTMLElement;

    expect(within(row).getByText(/not recognised by this build/i)).toBeInTheDocument();
  });
});

describe('the gap between the store and the runtime', () => {
  /**
   * `cameras_enabled` is a durable count and the harness holds it at zero with
   * no override, so this case supplies the whole status payload rather than a
   * slice of it. Written any other way the gap is always negative and the
   * assertion passes against a page that never renders it.
   */
  const withEnabled = (enabled: number, sessions: number) => ({
    routes: {
      '/status': {
        service: { ok: true },
        vision_os: { assembled: true, reason: '', attributes: [], policies: [] },
        tenant_id: 'org-test',
        cameras: {
          configured: 16,
          sessions,
          streaming: sessions,
          health: SIXTEEN.health.slice(0, sessions),
        },
        live_runtime: RUNNING,
        cameras_registered: 18,
        cameras_enabled: enabled,
        not_yet_reported: ['coverage'],
      },
    },
  });

  it('names enabled cameras the runtime holds no session for', async () => {
    await dashboard(withEnabled(16, 12));
    await screen.findByText('cam-01');

    // 16 enabled in the store, 12 sessions in the runtime. The four are a real
    // question and the page deliberately does not answer it: `/status` does not
    // report *why* a session is missing, and inventing a cause would be worse
    // than naming the gap.
    const note = screen.getByText(/enabled cameras report/i);
    expect(note.textContent).toMatch(/4 enabled cameras report no runtime session at all/i);
    expect(note.textContent).toMatch(/does not carry the reason/i);
  });

  it('claims nothing when the runtime holds more sessions than the store enables', async () => {
    // A session for a row disabled a moment ago makes the gap negative, and a
    // negative gap is not a fact about anything.
    await dashboard(withEnabled(2, 12));
    await screen.findByText('cam-01');

    expect(screen.queryByText(/enabled cameras? report/i)).not.toBeInTheDocument();
  });

  it('claims no gap when there is none', async () => {
    await dashboard({ cameras: SIXTEEN, runtime: RUNNING });
    await screen.findByText('cam-01');

    expect(screen.queryByText(/report(s)? no runtime session/i)).not.toBeInTheDocument();
  });
});

describe('a session that is not watching a camera says so', () => {
  it('marks a replay fixture and leaves a live camera unmarked', async () => {
    await dashboard({ cameras: SIXTEEN, runtime: RUNNING });
    await screen.findByText('cam-01');

    const replay = roster().querySelector('[data-camera-id="cam-15"]') as HTMLElement;
    expect(within(replay).getByText(/replay/)).toBeInTheDocument();

    // The convention is stated in the region's own copy, so the blank on every
    // other row is a declared default rather than a reader's assumption.
    const live = roster().querySelector('[data-camera-id="cam-01"]') as HTMLElement;
    expect(within(live).queryByText(/live/)).not.toBeInTheDocument();
    expect(screen.getByText(/is marked; the rest are live/i)).toBeInTheDocument();
  });
});

describe('the figures survive the redesign', () => {
  it('still reads an em dash and a reason when nothing is configured', async () => {
    await dashboard();

    const figure = (await screen.findByText('Producing frames')).closest(
      '[data-figure]',
    ) as HTMLElement;
    expect(within(figure).getByText('—')).toBeInTheDocument();
    expect(within(figure).getByText(/no camera is configured yet/i)).toBeInTheDocument();
    expect(within(figure).queryByText('0')).not.toBeInTheDocument();
  });

  it('keeps the counts beside the absent-region panel, not instead of it', async () => {
    await dashboard();

    // The empty case replaces the roster and *keeps* the rail. Replacing the
    // whole region would remove the em dash that says the count is unknown,
    // which is the fact an operator needs most in exactly that case.
    expect(await screen.findByText(/live monitoring is not enabled/i)).toBeInTheDocument();
    expect(screen.getByText('Producing frames')).toBeInTheDocument();
    expect(screen.getByText('Sessions')).toBeInTheDocument();
  });
});

/* ── the roads out ────────────────────────────────────────────────────────── */

describe('one road to the wall, and a different one per camera', () => {
  it('offers the wall once rather than once per camera', async () => {
    await dashboard({ cameras: SIXTEEN, runtime: RUNNING });
    await screen.findByText('cam-01');

    // Seven links to `/live` — the region's own action plus a `Watch` on each of
    // six tiles — was six links pretending to be different destinations. The
    // wall cannot be addressed per camera, so the page offers it once.
    //
    // Scoped to the content column: the shell's navigation holds the standing
    // link to the wall and always will, and it is not what was redundant.
    const main = document.getElementById('main') as HTMLElement;
    expect(main.querySelectorAll('a[href="/live"]')).toHaveLength(1);
  });

  it('points each camera at the surface that explains it', async () => {
    await dashboard({ cameras: SIXTEEN, runtime: RUNNING });
    await screen.findByText('cam-01');

    // The register is a genuinely different destination: it is where a camera's
    // configuration lives, which is what you want when a camera is not
    // producing and the wall has nothing to show you.
    const row = roster().querySelector('[data-camera-id="cam-16"]') as HTMLElement;
    expect(within(row).getByRole('link', { name: 'cam-16' })).toHaveAttribute(
      'href',
      '/cameras/cam-16',
    );
  });

  it('does not offer the register to an account the guard would turn away', async () => {
    installFetch({
      session: identity({
        permissions: ['view_incidents', 'view_live', 'view_observations'],
      }),
      cameras: SIXTEEN,
      runtime: RUNNING,
    });
    renderApp(<AppRouter />, '/dashboard');
    await screen.findByText('cam-01');

    // `/cameras/:key` admits `view_cameras` or `view_camera_health`. Offering a
    // road that redirects straight back here is worse than not offering it, so
    // the identifier renders as text.
    const row = roster().querySelector('[data-camera-id="cam-16"]') as HTMLElement;
    expect(within(row).queryByRole('link')).toBeNull();
    expect(within(row).getByText('cam-16')).toBeInTheDocument();
    expect(document.querySelectorAll('a[href="/cameras"]')).toHaveLength(0);
  });
});

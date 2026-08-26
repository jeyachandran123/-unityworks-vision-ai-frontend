/**
 * Phase 11: which person the alert is actually about.
 *
 * The evidence path already showed the right *frame* — that was Phase 10C's
 * fix. It could not say who in it. On a real cam-13 incident the frame held
 * two bare-headed chefs and two independent verdicts, and a manager was shown
 * one undifferentiated photograph of both: one guess away from correcting the
 * wrong person.
 *
 * Every box and every crop here comes from geometry the backend recorded at
 * decision time and froze beside the pixels. Nothing on this page detects
 * anything, finds a nearest person, or reads the live stream, and these tests
 * exist to keep it that way.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AlertsPage } from '@features/alerts';
import { installFetch, renderApp } from './support';

const SUBJECT = '01M0STCC65RN35SJQB65NY37R6';
const BYSTANDER = '01M0STCC65RN35SJQB65NY99ZZ';
const FRAME_REF = '01M0T07JZ9XJEHR1EEZZWMV3D0';

function incident(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inc-0000000000000001',
    status: 'active',
    severity: 'high',
    summary: 'person 01M0 is not wearing a head covering',
    rule_id: 'kitchen.person.ppe.v1',
    ruleset_version: '2026.1',
    restaurant_id: 'gayatri-main',
    zone_id: null,
    camera_key: 'cam-12',
    observed_at: '2026-08-24T12:01:09.170337+00:00',
    created_at: '2026-08-24T12:02:27.090892+00:00',
    object_id: SUBJECT,
    track_id: SUBJECT,
    finding: {
      rule_id: 'kitchen.person.ppe.v1',
      state: 'violation',
      conditions: [
        {
          attribute: 'head_covering',
          observed: 'none',
          outcome: 'failed',
          message: 'is not wearing a head covering',
        },
      ],
    },
    evidence_refs: [FRAME_REF],
    acknowledged_at: null,
    acknowledged_by: null,
    resolved_at: null,
    resolved_by: null,
    resolution_kind: null,
    resolution_note: null,
    ...overrides,
  };
}

function evidenceObject(overrides: Record<string, unknown> = {}) {
  return {
    object_id: SUBJECT,
    class: 'person',
    label: 'Person #2',
    box: [0.55, 0.32, 0.72, 0.88],
    is_subject: true,
    sent_to_model: true,
    crop_ref: FRAME_REF + '.crop.' + SUBJECT,
    ...overrides,
  };
}

const DECISION_GEOMETRY = {
  kind: 'decision-frame',
  frame: { frame_ref: 'cam-12/e0/f9052', width: 960, height: 576 },
  subject: evidenceObject(),
  context: [
    evidenceObject({
      object_id: BYSTANDER,
      label: 'Person #1',
      box: [0.1, 0.3, 0.25, 0.85],
      is_subject: false,
      crop_ref: FRAME_REF + '.crop.' + BYSTANDER,
    }),
  ],
};

function imageResponse(): Response {
  return new Response(new Blob([new Uint8Array([0xff, 0xd8, 0xff])]), {
    status: 200,
    headers: { 'Content-Type': 'image/jpeg' },
  });
}

function routesFor(
  geometry: unknown,
  purpose = 'compliance:kitchen.person.ppe.v1:decision-frame',
) {
  return {
    // Ahead of the metadata route: `stubFetch` matches by `includes`, and the
    // image path contains the metadata path.
    '/image': imageResponse(),
    '/incidents?status=active': { incidents: [incident()], count: 1 },
    '/incidents?status=acknowledged': { incidents: [], count: 0 },
    '/evidence/': {
      evidence_ref: FRAME_REF,
      geometry,
      purpose,
      camera_key: 'cam-12',
      frame_ref: 'cam-12/e0/f9052',
      object_id: SUBJECT,
      captured_at: '2026-08-24T12:01:09.170337+00:00',
      state: 'retained',
      servable: true,
    },
  };
}

async function openEvidence(geometry: unknown, purpose?: string) {
  installFetch({ routes: routesFor(geometry, purpose) });
  renderApp(<AlertsPage />, '/alerts');
  await userEvent.click(await screen.findByRole('button', { name: /view evidence/i }));
}

beforeAll(() => {
  // jsdom ships no blob URL support, and every evidence image goes through one.
  if (!URL.createObjectURL) {
    URL.createObjectURL = vi.fn(() => 'blob:evidence') as never;
    URL.revokeObjectURL = vi.fn() as never;
  }
});

describe('the alert subject highlight', () => {
  it('boxes the subject the finding is about, and marks it as the alert', async () => {
    await openEvidence(DECISION_GEOMETRY);

    const box = await screen.findByTestId('subject-box');
    expect(box).toHaveAttribute('data-object-id', SUBJECT);
    expect(box).toHaveTextContent(/Person #2/);
    expect(box).toHaveTextContent(/ALERT/);
  });

  it('positions the box from the stored geometry, not from anything it computed', async () => {
    await openEvidence(DECISION_GEOMETRY);

    // Compared numerically: these are percentages of a normalized box, and
    // binary floating point renders 0.55 * 100 as `55.00000000000001%`. CSS
    // does not care and neither does this assertion — what matters is that the
    // rectangle is the one the backend recorded.
    const box = await screen.findByTestId('subject-box');
    expect(parseFloat(box.style.left)).toBeCloseTo(55, 6);
    expect(parseFloat(box.style.top)).toBeCloseTo(32, 6);
    expect(parseFloat(box.style.width)).toBeCloseTo(17, 6);
    expect(parseFloat(box.style.height)).toBeCloseTo(56, 6);
  });

  it('never marks a bystander as the alert subject', async () => {
    await openEvidence(DECISION_GEOMETRY);

    await screen.findByTestId('subject-box');
    const context = screen.getAllByTestId('context-box');
    expect(context).toHaveLength(1);
    expect(context[0]).toHaveAttribute('data-object-id', BYSTANDER);
    expect(context[0]).not.toHaveTextContent(/ALERT/);
  });

  it('highlights nobody when the backend recorded no geometry', async () => {
    // The important half of the safety property. An unmarked frame is honest;
    // a confidently boxed wrong person is not.
    await openEvidence(null);

    expect(await screen.findByText(/no subject geometry was recorded/i)).toBeInTheDocument();
    expect(screen.queryByTestId('subject-box')).not.toBeInTheDocument();
  });

  it('says the picture is a later view when it is a context frame', async () => {
    await openEvidence(null, 'compliance:kitchen.person.ppe.v1:context-frame');

    expect(await screen.findByText(/later view of the same camera/i)).toBeInTheDocument();
    expect(screen.getByText('Context frame')).toBeInTheDocument();
    expect(screen.queryByTestId('subject-box')).not.toBeInTheDocument();
  });

  it('calls the frame what it is when it is the decision frame', async () => {
    await openEvidence(DECISION_GEOMETRY);
    expect(await screen.findByText('Decision frame')).toBeInTheDocument();
  });
});

describe('the decision crop gallery', () => {
  it('shows one crop per identified person, keeping them separate', async () => {
    await openEvidence(DECISION_GEOMETRY);

    const gallery = await screen.findByTestId('crop-gallery');
    expect(gallery.children).toHaveLength(2);
    expect(screen.getByTestId('crop-subject')).toHaveAttribute('data-object-id', SUBJECT);
    expect(screen.getByTestId('crop-context')).toHaveAttribute('data-object-id', BYSTANDER);
  });

  it('marks the alert subject crop and only that one', async () => {
    await openEvidence(DECISION_GEOMETRY);

    // Scoped to the gallery: `Person #2` legitimately appears twice, once on
    // the box over the frame and once under its crop.
    const subject = await screen.findByTestId('crop-subject');
    expect(subject).toHaveTextContent('★ Person #2');
    expect(screen.getByTestId('crop-context')).toHaveTextContent('Person #1');
    expect(screen.getByTestId('crop-context')).not.toHaveTextContent('★');
  });

  it('puts the alert subject first, ahead of the bystanders', async () => {
    await openEvidence(DECISION_GEOMETRY);

    const gallery = await screen.findByTestId('crop-gallery');
    expect(gallery.children[0]).toHaveAttribute('data-object-id', SUBJECT);
  });

  it('shows a single crop for a single-person finding', async () => {
    await openEvidence({ ...DECISION_GEOMETRY, context: [] });

    const gallery = await screen.findByTestId('crop-gallery');
    expect(gallery.children).toHaveLength(1);
    expect(screen.queryByTestId('crop-context')).not.toBeInTheDocument();
  });

  it('shows no gallery when no crop was retained', async () => {
    // `NEVER_PERSIST`, or a frame past the crop ceiling. The highlight survives
    // on its own, and a row of empty tiles would help nobody.
    await openEvidence({
      ...DECISION_GEOMETRY,
      subject: evidenceObject({ crop_ref: '' }),
      context: [],
    });

    await screen.findByTestId('subject-box');
    expect(screen.queryByTestId('crop-gallery')).not.toBeInTheDocument();
  });

  it('retrieves each crop explicitly, and only after the manager asks', async () => {
    // Every image is an audited disclosure on the server. A gallery that loaded
    // itself would write an audit row per person per poll, for alerts nobody
    // opened.
    const calls: string[] = [];
    installFetch({ calls, routes: routesFor(DECISION_GEOMETRY) });

    renderApp(<AlertsPage />, '/alerts');
    await screen.findByRole('button', { name: /view evidence/i });
    expect(calls.filter((c) => c.includes('/image'))).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: /view evidence/i }));
    await screen.findByTestId('crop-gallery');

    const images = calls.filter((c) => c.includes('/image'));
    expect(images).toHaveLength(3); // the frame, and one crop each
    expect(images.some((c) => c.includes('crop.' + SUBJECT))).toBe(true);
    expect(images.some((c) => c.includes('crop.' + BYSTANDER))).toBe(true);
  });

  it('retrieves imagery through the authorized client, never a bare fetch', async () => {
    // This path used to call `fetch` with a hand-attached header, which made it
    // the one authorized request in the application with no refresh retry: a
    // token that expired while the queue was open turned "show me the picture"
    // into a 401 until the operator reloaded.
    const calls: string[] = [];
    installFetch({ calls, routes: routesFor(DECISION_GEOMETRY) });

    renderApp(<AlertsPage />, '/alerts');
    await userEvent.click(await screen.findByRole('button', { name: /view evidence/i }));
    await screen.findByTestId('crop-gallery');

    expect(calls.some((c) => c.includes('/auth/refresh'))).toBe(true);
    expect(calls.filter((c) => c.includes('/image')).length).toBeGreaterThan(0);
  });
});

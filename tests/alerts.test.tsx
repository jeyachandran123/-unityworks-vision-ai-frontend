/**
 * Phase 10: the Alerts page, and the live session that used to die silently.
 *
 * Two defects are pinned here, both of which a passing backend smoke test could
 * not have caught, because both are entirely in the browser:
 *
 * 1. The live WebSocket gave up permanently the first time an access token
 *    expired, leaving "Session is no longer valid for live monitoring" on
 *    screen while every REST call kept refreshing happily.
 * 2. The Alerts page rendered a hardcoded "No alerts" regardless of the
 *    database — the most dangerous shape a safety screen can take, because it
 *    reads as "nothing is wrong" when it means "nobody asked".
 */

import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AlertsPage, attributeLabel, cameraLabel, failedConditions } from '@features/alerts';
import { LiveConnection } from '@shared/realtime/connection';
import { installFetch, renderApp } from './support';

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
    object_id: '01M0STCC65RN35SJQB65NY37R6',
    track_id: '01M0STCC65RN35SJQB65NY37R6',
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
        {
          attribute: 'hand_covering',
          observed: 'not_visible',
          outcome: 'unresolved',
          unknown_reason: 'not_observable',
        },
      ],
    },
    evidence_refs: ['01M0T07JZ9XJEHR1EEZZWMV3D0'],
    acknowledged_at: null,
    acknowledged_by: null,
    resolved_at: null,
    resolved_by: null,
    resolution_kind: null,
    resolution_note: null,
    ...overrides,
  };
}

function withIncidents(rows: Record<string, unknown>[]) {
  return installFetch({
    routes: {
      '/incidents?status=active': {
        incidents: rows.filter((r) => r['status'] === 'active'),
        count: rows.filter((r) => r['status'] === 'active').length,
      },
      '/incidents?status=acknowledged': {
        incidents: rows.filter((r) => r['status'] === 'acknowledged'),
        count: rows.filter((r) => r['status'] === 'acknowledged').length,
      },
    },
  });
}

describe('reading a frozen finding', () => {
  it('reports only the conditions that actually failed', () => {
    const failed = failedConditions(incident() as never);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toEqual({ attribute: 'head_covering', observed: 'none' });
  });

  it('never treats an unresolved condition as a failure', () => {
    // The safety invariant, at the last place it could be undone: a hand the
    // model could not see must not be presented to a manager as a violation.
    const failed = failedConditions(incident() as never);
    expect(failed.map((c) => c.attribute)).not.toContain('hand_covering');
  });

  it('survives a finding written by an older ruleset', () => {
    expect(failedConditions({ finding: {} } as never)).toEqual([]);
    expect(failedConditions({ finding: null } as never)).toEqual([]);
    expect(failedConditions({ finding: { conditions: 'nonsense' } } as never)).toEqual([]);
  });

  it('renders attribute and camera names the way an operator says them', () => {
    expect(attributeLabel('head_covering')).toBe('Head covering');
    expect(cameraLabel('cam-12')).toBe('Camera 12');
    expect(cameraLabel('cam-07')).toBe('Camera 7');
  });
});

describe('the alerts page', () => {
  it('shows a real violation with its camera, attribute and severity', async () => {
    installFetch();
    withIncidents([incident()]);
    renderApp(<AlertsPage />, '/alerts');

    expect(await screen.findByText(/missing head covering/i)).toBeInTheDocument();
    expect(screen.getByText(/Camera 12/)).toBeInTheDocument();
    expect(screen.getByText(/head_covering = none/)).toBeInTheDocument();
    expect(screen.getByText(/kitchen\.person\.ppe\.v1/)).toBeInTheDocument();
  });

  it('says "no open alerts" only when the queue is genuinely empty', async () => {
    withIncidents([]);
    renderApp(<AlertsPage />, '/alerts');

    expect(await screen.findByText(/no open alerts/i)).toBeInTheDocument();
    // The wording must not read as a compliance statement.
    expect(screen.getByText(/not a placeholder/i)).toBeInTheDocument();
  });

  it('does not render the evidence image until the manager asks', async () => {
    // Every retrieval writes an audit row on the server; a list that loaded
    // thumbnails would write one per incident per poll.
    withIncidents([incident()]);
    renderApp(<AlertsPage />, '/alerts');

    await screen.findByText(/missing head covering/i);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view evidence/i })).toBeInTheDocument();
  });

  it('says so plainly when a violation has no evidence image', async () => {
    withIncidents([incident({ evidence_refs: [] })]);
    renderApp(<AlertsPage />, '/alerts');

    expect(await screen.findByText(/no evidence image was captured/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /view evidence/i })).not.toBeInTheDocument();
  });

  it('puts unacknowledged violations above acknowledged ones', async () => {
    withIncidents([
      incident({ id: 'inc-ack', status: 'acknowledged', camera_key: 'cam-11' }),
      incident({ id: 'inc-new', status: 'active', camera_key: 'cam-13' }),
    ]);
    renderApp(<AlertsPage />, '/alerts');

    await screen.findByText(/Camera 13/);
    const rendered = screen.getAllByText(/Camera 1[13]/).map((n) => n.textContent ?? '');
    expect(rendered[0]).toContain('Camera 13');
  });

  it('acknowledges against the server rather than local state alone', async () => {
    const calls: string[] = [];
    installFetch({
      calls,
      routes: {
        '/incidents?status=active': { incidents: [incident()], count: 1 },
        '/incidents?status=acknowledged': { incidents: [], count: 0 },
        '/incidents/inc-0000000000000001/acknowledge': incident({ status: 'acknowledged' }),
      },
    });
    renderApp(<AlertsPage />, '/alerts');

    await userEvent.click(await screen.findByRole('button', { name: /acknowledge/i }));

    await waitFor(() => {
      expect(
        calls.some((c) => c.startsWith('POST') && c.includes('/acknowledge')),
      ).toBe(true);
    });
  });
});

describe('the live connection when a token expires', () => {
  const CLOSE_UNAUTHENTICATED = 4401;

  function fakeSocket() {
    const socket = {
      onopen: null as null | (() => void),
      onclose: null as null | ((e: { code: number }) => void),
      onmessage: null as null | ((e: MessageEvent) => void),
      onerror: null as null | (() => void),
      send: vi.fn(),
      close: vi.fn(),
    };
    return socket;
  }

  it('renews the token and reconnects instead of ending the session', async () => {
    const sockets: ReturnType<typeof fakeSocket>[] = [];
    const renew = vi.fn(async () => 'a-fresh-token');
    const statuses: string[] = [];

    const live = new LiveConnection({
      url: 'ws://test/ws',
      token: () => 'an-expired-token',
      renew,
      onStatus: (s) => statuses.push(s.state),
      socketFactory: () => {
        const s = fakeSocket();
        sockets.push(s);
        return s as unknown as WebSocket;
      },
    });

    live.connect();
    const first = sockets[0];
    if (!first) throw new Error("no socket was opened");
    first.onopen?.();
    // The server rejects the expired token, exactly as it does after 15 minutes.
    first.onclose?.({ code: CLOSE_UNAUTHENTICATED });

    await waitFor(() => expect(renew).toHaveBeenCalledTimes(1));
    // A second socket is opened with the renewed token — the old behaviour
    // stopped here and left the screen reading "session no longer valid".
    await waitFor(() => expect(sockets).toHaveLength(2));
    expect(statuses).not.toContain('unauthorised');

    live.disconnect();
  });

  it('ends the session only when renewal genuinely fails', async () => {
    const statuses: string[] = [];
    const live = new LiveConnection({
      url: 'ws://test/ws',
      token: () => 'an-expired-token',
      renew: async () => null,
      onStatus: (s) => statuses.push(s.state),
      socketFactory: () =>
        ({
          onopen: null, onclose: null, onmessage: null, onerror: null,
          send: vi.fn(), close: vi.fn(),
        }) as unknown as WebSocket,
    });

    live.connect();
    const socket = (live as unknown as { socket: ReturnType<typeof fakeSocket> }).socket;
    socket.onclose?.({ code: CLOSE_UNAUTHENTICATED });

    await waitFor(() => expect(statuses).toContain('unauthorised'));
    live.disconnect();
  });
});

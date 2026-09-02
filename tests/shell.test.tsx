/**
 * Shell, states, connection honesty and the accessibility baseline.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRouter } from '@app/router/AppRouter';
import { LiveConnection, CLOSE } from '@shared/realtime/connection';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  StatCard,
  UnavailableState,
  UnknownState,
} from '@shared/ui/primitives';
import { identity, installFetch, managerIdentity, renderApp } from './support';

describe('role-aware navigation', () => {
  it('a manager sees the product sections', async () => {
    installFetch({ session: managerIdentity() });
    renderApp(<AppRouter />, '/dashboard');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument());
    const nav = screen.getByRole('navigation', { name: 'Primary' });

    for (const label of ['Dashboard', 'Live Monitoring', 'Staff Hygiene', 'Incidents']) {
      expect(within(nav).getByRole('link', { name: new RegExp(label, 'i') })).toBeInTheDocument();
    }
  });

  it('a manager without admin permissions sees no Administration link', async () => {
    installFetch({ session: managerIdentity() });
    renderApp(<AppRouter />, '/dashboard');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument());
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).queryByRole('link', { name: /administration/i })).not.toBeInTheDocument();
  });

  it('navigation is generated from permissions, not from role names', async () => {
    // An identity with a made-up role but real permissions still gets the right
    // navigation — proving no role name is hardcoded into a condition.
    installFetch({
      session: identity({ roles: ['some_future_role'], permissions: ['view_observations'] }),
    });
    renderApp(<AppRouter />, '/dashboard');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument());
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: /staff hygiene/i })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /vision os/i })).not.toBeInTheDocument();
  });
});

describe('the shell', () => {
  it('shows breadcrumbs for the current route', async () => {
    installFetch({ session: identity() });
    renderApp(<AppRouter />, '/incidents');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Incidents' })).toBeInTheDocument());
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByText('Investigate')).toBeInTheDocument();
    expect(within(crumbs).getByText('Incidents')).toBeInTheDocument();
  });

  it('collapses and restores the sidebar', async () => {
    installFetch({ session: identity() });
    const user = userEvent.setup();
    renderApp(<AppRouter />, '/dashboard');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /collapse navigation/i }));
    expect(await screen.findByRole('button', { name: /expand navigation/i })).toBeInTheDocument();
  });

  it('offers a skip link as the first focusable element', async () => {
    installFetch({ session: identity() });
    renderApp(<AppRouter />, '/dashboard');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /skip to content/i })).toHaveAttribute('href', '#main');
  });
});

describe('product routes do not fabricate data', () => {
  it('renders an em dash rather than a zero for a value it does not have', async () => {
    installFetch({ session: identity() });
    renderApp(<AppRouter />, '/dashboard');

    // 'Cameras online' has no value while no camera is configured, and unknown
    // renders as an em dash, never as a zero.
    //
    // This assertion used to point at 'Subjects assessed', which was a
    // permanent placeholder. That tile now reads real observation counts, so a
    // zero there would be a *correct* answer — the cameras were read and nobody
    // was seen. The property under test is unchanged; only the tile that still
    // genuinely lacks a value has moved.
    const label = await screen.findByText('Cameras online');
    const card = label.closest('section') as HTMLElement;
    expect(within(card).getByText('—')).toBeInTheDocument();
    expect(within(card).queryByText('0')).not.toBeInTheDocument();
  });

  it('states which capability each unavailable figure is waiting for', async () => {
    installFetch({ session: identity() });
    renderApp(<AppRouter />, '/dashboard');

    // Was /requires a live source/, the reason on the old placeholder tile.
    // Same property — an unavailable figure says why — against the reason that
    // still applies now that observations are real.
    expect(await screen.findByText(/no camera is configured yet/i)).toBeInTheDocument();
  });

  it('surfaces the backend’s own not-yet-reported list', async () => {
    installFetch({ session: identity() });
    renderApp(<AppRouter />, '/dashboard');

    await screen.findByText('Not yet reported');
    // 'cameras' left this list in Phase 3 and 'incidents' in Phase 5, each when
    // its store arrived. Nothing computes coverage, so it is still named.
    expect(screen.getByText('coverage')).toBeInTheDocument();
    expect(screen.queryByText('incidents')).not.toBeInTheDocument();
  });

  it('never claims compliance on a page with no data', async () => {
    installFetch({ session: identity() });
    renderApp(<AppRouter />, '/hygiene');

    await screen.findByRole('heading', { name: /staff hygiene/i });
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/all (staff|subjects) (are )?compliant/i);
    expect(text).not.toMatch(/100%/);
  });
});

describe('the four non-content states are distinct components', () => {
  it('loading announces politely', () => {
    render(<LoadingState label="Loading things" />);
    expect(screen.getByRole('status')).toHaveTextContent(/loading things/i);
  });

  it('empty says nothing is there', () => {
    render(<EmptyState title="No incidents" body="Nothing is open." />);
    expect(screen.getByText('No incidents')).toBeInTheDocument();
  });

  it('error offers a retry and a reference, not a stack trace', async () => {
    const onRetry = vi.fn();
    render(<ErrorState body="Could not load." requestId="req-42" onRetry={onRetry} />);

    expect(screen.getByText(/req-42/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('unknown is not the same component as empty', () => {
    const { unmount } = render(<UnknownState body="Evidence was insufficient." />);
    expect(screen.getByText(/unable to determine/i)).toBeInTheDocument();
    unmount();

    render(<UnavailableState title="Camera offline" body="No frames for 12 minutes." />);
    expect(screen.getByText('Camera offline')).toBeInTheDocument();
  });

  it('a stat card with a null value shows its reason', () => {
    render(<StatCard label="Cameras" value={null} unavailableReason="Phase 3" />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Phase 3')).toBeInTheDocument();
  });
});

describe('connection honesty', () => {
  function fakeSocket() {
    const socket = {
      onopen: null as null | (() => void),
      onmessage: null as null | ((event: MessageEvent) => void),
      onclose: null as null | ((event: CloseEvent) => void),
      onerror: null as null | (() => void),
      sent: [] as string[],
      send(data: string) {
        this.sent.push(data);
      },
      close() {},
    };
    return socket;
  }

  it('sends the token in a frame, never in the URL', () => {
    const socket = fakeSocket();
    let url = '';
    const connection = new LiveConnection({
      url: 'ws://test/ws/v1/live',
      token: () => 'access-1',
      onStatus: () => {},
      socketFactory: (requested) => {
        url = requested;
        return socket as unknown as WebSocket;
      },
    });

    connection.connect();
    socket.onopen?.();

    expect(url).not.toContain('access-1');
    expect(url).not.toContain('token');
    expect(JSON.parse(socket.sent[0] as string)).toEqual({
      type: 'authenticate',
      access_token: 'access-1',
    });
  });

  it('reports connected but NOT streaming when the server says so', () => {
    const socket = fakeSocket();
    const states: Array<{ state: string; streaming: boolean; detail: string }> = [];

    const connection = new LiveConnection({
      url: 'ws://test/ws/v1/live',
      token: () => 'access-1',
      onStatus: (status) => states.push({ state: status.state, streaming: status.streaming, detail: status.detail }),
      socketFactory: () => socket as unknown as WebSocket,
    });

    connection.connect();
    socket.onopen?.();
    socket.onmessage?.({ data: JSON.stringify({ type: 'ready', streaming: false }) } as MessageEvent);

    const last = states.at(-1);
    expect(last?.state).toBe('connected');
    expect(last?.streaming).toBe(false);
    // The badge must not read "LIVE" over a camera that does not exist.
    expect(last?.detail).toMatch(/no live camera source/i);
    expect(last?.detail).not.toMatch(/^live$/i);
  });

  it('stops retrying when the account may not view live', () => {
    const socket = fakeSocket();
    const states: string[] = [];

    const connection = new LiveConnection({
      url: 'ws://test/ws/v1/live',
      token: () => 'access-1',
      onStatus: (status) => states.push(status.state),
      socketFactory: () => socket as unknown as WebSocket,
    });

    connection.connect();
    socket.onclose?.({ code: CLOSE.forbidden } as CloseEvent);

    expect(states.at(-1)).toBe('unauthorised');
  });

  it('does not connect at all without a token', () => {
    let opened = false;
    const connection = new LiveConnection({
      url: 'ws://test/ws/v1/live',
      token: () => null,
      onStatus: () => {},
      socketFactory: () => {
        opened = true;
        return fakeSocket() as unknown as WebSocket;
      },
    });

    connection.connect();
    expect(opened).toBe(false);
  });
});

describe('accessibility baseline', () => {
  it('the login form labels every field', async () => {
    installFetch({ session: null });
    renderApp(<AppRouter />, '/login');

    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument());
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('login is operable by keyboard alone', async () => {
    installFetch({ session: null });
    const user = userEvent.setup();
    renderApp(<AppRouter />, '/login');

    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument());

    // Email is autofocused, so the first Tab moves to Password.
    expect(screen.getByLabelText('Email')).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('Password')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /sign in/i })).toHaveFocus();
  });

  it('every navigation landmark has an accessible name', async () => {
    installFetch({ session: identity() });
    renderApp(<AppRouter />, '/dashboard');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument());
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
  });

  it('tables carry a caption for screen readers', async () => {
    installFetch({ session: identity() });
    renderApp(<AppRouter />, '/devtools/vision/state');

    expect(await screen.findByRole('table', { name: /objects in vision state/i })).toBeInTheDocument();
  });

  it('every page has exactly one level-one heading', async () => {
    installFetch({ session: identity() });
    renderApp(<AppRouter />, '/incidents');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Incidents' })).toBeInTheDocument());
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('icon-only controls have accessible names', async () => {
    installFetch({ session: identity() });
    renderApp(<AppRouter />, '/dashboard');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /collapse navigation/i })).toBeInTheDocument();
  });

  /**
   * The theme control, in the rendered shell.
   *
   * The resolution matrix itself lives in `theme.test.ts`, which needs no React
   * at all. This is the half that only exists once the shell is on screen: that
   * the control is reachable from the keyboard, and that its name states both
   * the theme that is on and what pressing it will do.
   */
  it('offers a keyboard-reachable theme toggle that names the theme and the action', async () => {
    installFetch({ session: identity() });
    const user = userEvent.setup();
    renderApp(<AppRouter />, '/dashboard');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument());

    const toggle = screen.getByRole('button', { name: /theme .* switch to/i });
    toggle.focus();
    expect(toggle).toHaveFocus();

    const before = document.documentElement.getAttribute('data-theme');
    await user.keyboard('{Enter}');

    await waitFor(() =>
      expect(document.documentElement.getAttribute('data-theme')).not.toBe(before),
    );
    // The name follows the new state rather than going stale.
    expect(screen.getByRole('button', { name: /theme .* switch to/i })).toBeInTheDocument();
  });
});

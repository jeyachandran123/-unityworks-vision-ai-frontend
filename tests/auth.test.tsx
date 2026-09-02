/**
 * Authentication: session restore, login, logout, and single-flight refresh.
 *
 * The refresh test is the one with teeth. Ten concurrent 401s must produce
 * **one** refresh call; ten would race, and nine would present a token the first
 * had already rotated away — logging the user out mid-session, at random, under
 * load.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRouter } from '@app/router/AppRouter';
import { api, getAccessToken, refreshAccessToken, __resetClient } from '@shared/api/client';
import { installFetch, renderApp, identity } from './support';

describe('session restore', () => {
  it('restores a session from the refresh cookie without a login prompt', async () => {
    const calls: string[] = [];
    installFetch({ calls });

    renderApp(<AppRouter />, '/dashboard');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Command Center' })).toBeInTheDocument());

    // The reload path: refresh first, then identity.
    expect(calls.some((call) => call.includes('/auth/refresh'))).toBe(true);
  });

  it('shows the login screen when there is no session', async () => {
    installFetch({ session: null });

    renderApp(<AppRouter />, '/dashboard');

    await waitFor(() => expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument());
  });

  it('does not claim a session expired when there never was one', async () => {
    installFetch({ session: null });

    renderApp(<AppRouter />, '/dashboard');

    await waitFor(() => expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument());
    // A first-time visitor must not be told their session ended.
    expect(screen.queryByText(/session ended/i)).not.toBeInTheDocument();
  });

  it('never writes the access token to storage', async () => {
    installFetch();
    renderApp(<AppRouter />, '/dashboard');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Command Center' })).toBeInTheDocument());

    const stored = JSON.stringify({
      local: { ...window.localStorage },
      session: { ...window.sessionStorage },
    });
    expect(stored).not.toContain('access-1');
  });
});

describe('login', () => {
  it('signs in and lands on the dashboard', async () => {
    installFetch({ session: null, routes: {} });
    const user = userEvent.setup();

    // Session absent for the restore, present after login: re-stub between.
    renderApp(<AppRouter />, '/login');
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument());

    installFetch({ session: identity() });

    await user.type(screen.getByLabelText('Email'), 'developer@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct-horse-battery');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Command Center' })).toBeInTheDocument());
  });

  it('reports invalid credentials without distinguishing the cause', async () => {
    installFetch({ session: null, loginFailure: 'INVALID_CREDENTIALS' });
    const user = userEvent.setup();

    renderApp(<AppRouter />, '/login');
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument());

    await user.type(screen.getByLabelText('Email'), 'nobody@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/email or password is incorrect/i);
    // Not "no such user" — that is an account-enumeration oracle.
    expect(alert).not.toHaveTextContent(/no such user|unknown email/i);
  });

  it('distinguishes an unreachable service from a bad password', async () => {
    installFetch({ session: null, loginFailure: 'DEPENDENCY_UNAVAILABLE' });
    const user = userEvent.setup();

    renderApp(<AppRouter />, '/login');
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument());

    await user.type(screen.getByLabelText('Email'), 'developer@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct-horse-battery');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/not reachable/i);
  });

  it('shows no stack trace, path or SQL in any failure', async () => {
    installFetch({ session: null, loginFailure: 'INVALID_CREDENTIALS' });
    const user = userEvent.setup();

    renderApp(<AppRouter />, '/login');
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Email'), 'a@b.c');
    await user.type(screen.getByLabelText('Password'), 'x');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await screen.findByRole('alert');
    const text = document.body.textContent ?? '';
    for (const leak of ['Traceback', 'site-packages', '.py', 'SELECT ']) {
      expect(text).not.toContain(leak);
    }
  });
});

describe('logout', () => {
  it('clears the session and returns to the login screen', async () => {
    installFetch();
    const user = userEvent.setup();

    renderApp(<AppRouter />, '/dashboard');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Command Center' })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /dev user/i }));
    await user.click(screen.getByRole('menuitem', { name: /sign out/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument());
    expect(getAccessToken()).toBeNull();
  });
});

describe('single-flight refresh', () => {
  it('ten concurrent refreshes produce exactly one network call', async () => {
    __resetClient();
    const calls: string[] = [];
    installFetch({ calls });

    await Promise.all(Array.from({ length: 10 }, () => refreshAccessToken()));

    const refreshes = calls.filter((call) => call.includes('/auth/refresh'));
    expect(refreshes).toHaveLength(1);
  });

  it('ten concurrent 401s produce exactly one refresh', async () => {
    __resetClient();
    const calls: string[] = [];

    // Every protected call 401s once; the retry after refresh succeeds.
    const seen = new Set<string>();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push(`${init?.method ?? 'GET'} ${url}`);

        if (url.includes('/auth/refresh')) {
          return new Response(JSON.stringify({ access_token: 'fresh' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (!seen.has(url)) {
          seen.add(url);
          return new Response(
            JSON.stringify({ code: 'UNAUTHENTICATED', message: '', retryable: false, details: {}, request_id: '' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );

    await Promise.all(
      Array.from({ length: 10 }, (_, index) => api.get(`/devtools/probe-${index}`)),
    );

    expect(calls.filter((call) => call.includes('/auth/refresh'))).toHaveLength(1);
  });

  it('retries a failed request once, not in a loop', async () => {
    __resetClient();
    const calls: string[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes('/auth/refresh')) {
          return new Response(JSON.stringify({ access_token: 'fresh' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        // Always 401 — a loop would be unbounded.
        return new Response(
          JSON.stringify({ code: 'UNAUTHENTICATED', message: '', retryable: false, details: {}, request_id: '' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    await expect(api.get('/devtools/state')).rejects.toThrow();

    const attempts = calls.filter((call) => call.includes('/devtools/state'));
    expect(attempts).toHaveLength(2);
  });

  it('drops the token when refreshing fails', async () => {
    __resetClient();
    installFetch({ session: null });

    const token = await refreshAccessToken();

    expect(token).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it('treats a network failure as a lost session, not a revoked account', async () => {
    __resetClient();
    installFetch({ refreshNetworkFailures: 1 });

    expect(await refreshAccessToken()).toBeNull();
  });
});

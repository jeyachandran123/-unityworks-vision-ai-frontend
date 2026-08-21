/**
 * The sign-in screen.
 *
 * Four failure states, each with its own message and its own remedy:
 *
 *   invalid credentials  → check them and try again
 *   account disabled     → contact an administrator
 *   service unavailable  → try again shortly
 *   unknown              → the backend's own message, which is already safe
 *
 * None of them exposes an internal detail. The backend deliberately does not
 * distinguish "no such user" from "wrong password" — that distinction turns a
 * login form into an account-enumeration oracle — and neither does this screen.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, type LoginFailure } from '@app/auth/AuthProvider';
import { Button, Input, LoadingState } from '@shared/ui/primitives';

export function LoginPage() {
  const { status, login, endedReason, dismissEnded } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<LoginFailure | null>(null);

  // Where the user was heading before the guard redirected them here.
  const destination = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  useEffect(() => {
    document.title = 'Sign in · UnityWorks Vision AI';
  }, []);

  if (status === 'restoring') return <LoadingState label="Checking your session" />;
  if (status === 'authenticated') return <Navigate to={destination} replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailure(null);
    dismissEnded();

    const result = await login(email.trim(), password);
    setBusy(false);

    if (result) setFailure(result);
    else navigate(destination, { replace: true });
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--space-6)',
        background: 'var(--surface-base)',
      }}
    >
      <main style={{ width: 'min(23rem, 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-8)' }}>
          <span
            aria-hidden="true"
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--accent)',
              color: 'var(--ink-on-accent)',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 'var(--weight-bold)',
              fontSize: 'var(--text-sm)',
            }}
          >
            UW
          </span>
          <div>
            <h1 style={{ fontSize: 'var(--text-lg)' }}>UnityWorks Vision AI</h1>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)' }}>Kitchen safety monitoring</p>
          </div>
        </div>

        {endedReason ? (
          <div
            role="status"
            style={{
              marginBottom: 'var(--space-5)',
              padding: 'var(--space-3) var(--space-4)',
              border: '1px solid var(--health-degraded)',
              background: 'var(--health-degraded-wash)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--text-sm)',
            }}
          >
            {endedReason === 'expired'
              ? 'Your session ended. Sign in to continue.'
              : 'Your access changed. Sign in again to continue.'}
          </div>
        ) : null}

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Input
            label="Email"
            type="email"
            name="email"
            autoComplete="username"
            required
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Input
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {failure ? (
            <div
              // `role="alert"` so a screen reader is told immediately. A visual
              // message a blind user never hears is not an error message.
              role="alert"
              style={{
                padding: 'var(--space-3) var(--space-4)',
                border: '1px solid var(--state-absent)',
                background: 'var(--state-absent-wash)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--text-sm)',
                color: 'var(--state-absent)',
              }}
            >
              {failure.message}
            </div>
          ) : null}

          {/* type=submit so Enter works from either field, without a keydown handler. */}
          <Button type="submit" variant="primary" loading={busy} style={{ width: '100%', marginTop: 'var(--space-2)' }}>
            {busy ? 'Signing in' : 'Sign in'}
          </Button>
        </form>

        <p style={{ marginTop: 'var(--space-8)', fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)', textAlign: 'center' }}>
          Access is granted by your organisation administrator.
        </p>
      </main>
    </div>
  );
}

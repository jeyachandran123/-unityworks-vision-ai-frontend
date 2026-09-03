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
 *
 * ── What Stage 5 changed, and why it changed the most here ──────────────────
 *
 * This is the only screen every user sees, and it is the only screen they see
 * before they see anything else. The critique found it was a 23rem form
 * centred in 1440×900 of empty near-black: no composition, no identity, and no
 * statement of what the product is. Whatever impression the application makes,
 * it made it here first, and it was making none.
 *
 * It is now a two-panel composition. The right panel is the form, unchanged in
 * behaviour and unchanged in what it discloses. The left panel is the product
 * saying what it is — and it says it with the one thing that genuinely
 * distinguishes this platform from a monitoring dashboard: that it reports four
 * observation states rather than two, and that "the camera could not see this"
 * is never allowed to become "this was not there".
 *
 * That legend is not decoration and it is not invented. It is `STATES`, the
 * same vocabulary every badge, finding and report in the product resolves
 * against, rendered at the one moment when a reader has nothing else to read.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, type LoginFailure } from '@app/auth/AuthProvider';
import { STATES, type ObservationState } from '@shared/semantics/observation';
import { Button, Input, LoadingState } from '@shared/ui/primitives';
import { Icon, StateIcons } from '@shared/ui/icons';

/** The order the platform itself lists them in: decided first, then not. */
const LEGEND: ObservationState[] = ['present', 'absent', 'not_visible', 'unknown'];

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
    <div className="uwv-auth">
      {/* ── The statement ─────────────────────────────────────────────────── */}
      <section className="uwv-auth-statement uwv-arrive" data-order="1">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <Aperture size={40} />
          <div>
            <div
              style={{
                fontSize: 'var(--text-lg)',
                fontWeight: 'var(--weight-semibold)',
                letterSpacing: 'var(--tracking-tight)',
              }}
            >
              UnityWorks Vision AI
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-2xs)',
                letterSpacing: 'var(--tracking-wider)',
                textTransform: 'uppercase',
                color: 'var(--ink-tertiary)',
                marginTop: 2,
              }}
            >
              Kitchen safety monitoring
            </div>
          </div>
        </div>

        <p
          style={{
            marginTop: 'var(--space-12)',
            fontSize: 'clamp(1.5rem, 0.9rem + 2vw, var(--text-3xl))',
            lineHeight: 1.25,
            letterSpacing: 'var(--tracking-display)',
            fontWeight: 'var(--weight-semibold)',
            maxWidth: '18ch',
            textWrap: 'balance',
          }}
        >
          A camera that could not see is not a camera that saw nothing.
        </p>

        <p
          style={{
            marginTop: 'var(--space-5)',
            maxWidth: 'var(--measure-tight)',
            color: 'var(--ink-secondary)',
            lineHeight: 'var(--leading-relaxed)',
          }}
        >
          This platform reports four observation states, not two, and never
          collapses them. Every figure it shows carries the coverage behind it.
        </p>

        <ul
          aria-label="Observation states"
          style={{
            marginTop: 'var(--space-10)',
            display: 'grid',
            gap: 'var(--space-3)',
            maxWidth: '30rem',
          }}
        >
          {LEGEND.map((key) => {
            const descriptor = STATES[key];
            return (
              <li
                key={key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.25rem 7.5rem 1fr',
                  alignItems: 'baseline',
                  gap: 'var(--space-3)',
                  paddingTop: 'var(--space-3)',
                  borderTop: '1px solid var(--line-subtle)',
                  fontSize: 'var(--text-xs)',
                }}
              >
                <span
                  style={{ color: descriptor.colorVar, display: 'flex', flexShrink: 0, alignSelf: 'center' }}
                >
                  <Icon icon={StateIcons[key]} size="inline" />
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-2xs)',
                    letterSpacing: 'var(--tracking-wide)',
                    textTransform: 'uppercase',
                    color: descriptor.colorVar,
                  }}
                >
                  {descriptor.label}
                </span>
                <span style={{ color: 'var(--ink-tertiary)' }}>{descriptor.description}</span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── The form ──────────────────────────────────────────────────────── */}
      <main className="uwv-auth-form uwv-arrive" data-order="2">
        <div style={{ width: 'min(23rem, 100%)' }}>
          {/* At narrow widths the statement panel is gone, so the mark has to
              be here instead — a sign-in screen with nothing on it that names
              the product is a sign-in screen a user cannot trust. */}
          <div className="uwv-auth-compact-mark">
            <Aperture size={32} />
            <h1
              style={{
                fontSize: 'var(--text-md)',
                fontWeight: 'var(--weight-semibold)',
                letterSpacing: 'var(--tracking-tight)',
              }}
            >
              UnityWorks Vision AI
            </h1>
          </div>

          <div className="uwv-auth-wide-title">
            <h1
              style={{
                fontSize: 'var(--text-xl)',
                letterSpacing: 'var(--tracking-tight)',
                marginBottom: 'var(--space-1)',
              }}
            >
              Sign in
            </h1>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-tertiary)' }}>
              Use the account your organisation issued you.
            </p>
          </div>

          {endedReason ? (
            <div
              role="status"
              style={{
                marginTop: 'var(--space-6)',
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

          <form
            onSubmit={onSubmit}
            style={{
              marginTop: 'var(--space-6)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
            }}
          >
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
            <Button
              type="submit"
              variant="primary"
              loading={busy}
              style={{ width: '100%', marginTop: 'var(--space-2)' }}
            >
              {busy ? 'Signing in' : 'Sign in'}
            </Button>
          </form>

          <p
            style={{
              marginTop: 'var(--space-8)',
              fontSize: 'var(--text-xs)',
              color: 'var(--ink-tertiary)',
            }}
          >
            Access is granted by your organisation administrator.
          </p>
        </div>
      </main>
    </div>
  );
}

/**
 * The mark, at sign-in scale.
 *
 * Four viewfinder ticks around a lit centre — the same device the camera tiles
 * carry, and the same one in the corner of the shell. One idea, three sizes.
 */
function Aperture({ size }: { size: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      style={{ flexShrink: 0, display: 'block' }}
    >
      <path
        d="M1 6V1h5M14 1h5v5M19 14v5h-5M6 19H1v-5"
        stroke="var(--accent)"
        strokeWidth="1.6"
        strokeLinecap="square"
      />
      <circle cx="10" cy="10" r="2.6" fill="var(--accent)" />
    </svg>
  );
}

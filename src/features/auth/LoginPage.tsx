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
 * It is a two-panel composition. The right panel is the form, unchanged in
 * behaviour and unchanged in what it discloses — now a card with a theme
 * switch, a password that can be read back, and a Caps Lock warning. The left
 * panel sits on the navigation's deep purple in both themes, and is the product
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
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, type LoginFailure } from '@app/auth/AuthProvider';
import { STATES, type ObservationState } from '@shared/semantics/observation';
import { ThemeToggle } from '@shared/layout/shell-parts';
import { Callout } from '@shared/ui/feedback';
import { PasswordInput } from '@shared/ui/forms';
import { Icon, StateIcons, StatusIcons } from '@shared/ui/icons';
import { Button, Input, LoadingState } from '@shared/ui/primitives';

/** The order the platform itself lists them in: decided first, then not. */
const LEGEND: ObservationState[] = ['present', 'absent', 'not_visible', 'unknown'];

export function LoginPage() {
  const { status, login, endedReason, dismissEnded, mustSelect, isPlatformOperator } =
    useAuth();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<LoginFailure | null>(null);

  // Where the user was heading before the guard redirected them here.
  const destination = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  /**
   * The one place the post-login route is decided. Three audiences, three
   * destinations.
   *
   *     platform operator          → /platform, the control plane
   *     several organizations      → /choose-organization, the chooser
   *     one organization           → straight in
   *
   * The operator case is checked first and separately, because it is not
   * derivable from the membership count: an operator's own account usually
   * belongs to exactly one organization, and the customers they administer are
   * not among their memberships. Sending them "straight in" would land them in
   * the one place their job is not.
   *
   * `mustSelect` is the server's answer, computed at login from both facts. A
   * single-organization administrator has it false and is never shown a
   * chooser, which is the whole point of asking the server rather than counting
   * a list here.
   *
   * A deep link is deliberately dropped when a choice is owed: `/incidents/42`
   * means nothing until it is known *whose* incident 42, and sending somebody
   * to the wrong organization's copy of that route would be worse than sending
   * them to the chooser.
   */
  const target = isPlatformOperator
    ? '/platform'
    : mustSelect
      ? '/choose-organization'
      : destination;

  useEffect(() => {
    document.title = 'Sign in · UnityWorks Vision AI';
  }, []);

  if (status === 'restoring') return <LoadingState label="Checking your session" />;
  if (status === 'authenticated') return <Navigate to={target} replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailure(null);
    dismissEnded();

    const result = await login(email.trim(), password);
    setBusy(false);

    // On success the redirect is the declarative one above, not a call here.
    // It has to be: `mustSelect` is set by `login` on the provider, and the
    // value this closure captured predates it — navigating from here would send
    // every multi-organization user to the dashboard the chooser exists to come
    // before.
    if (result) setFailure(result);
  }

  return (
    <div className="uwv-signin">
      {/* ── The statement ─────────────────────────────────────────────────── */}
      <aside className="uwv-signin-brand" aria-label="About UnityWorks Vision AI">
        <div className="uwv-signin-brand-top">
          <span className="uwv-signin-mark">
            <Aperture size={22} />
          </span>
          <span className="uwv-signin-brand-name">
            <span>UnityWorks Vision AI</span>
            <span className="uwv-signin-brand-sub">Kitchen safety monitoring</span>
          </span>
        </div>

        <div className="uwv-signin-brand-body uwv-arrive" data-order="1">
          <p className="uwv-signin-headline">
            A camera that could not see is not a camera that saw <em>nothing</em>.
          </p>
          <p className="uwv-signin-lede">
            Vision AI reports four observation states, not two, and never collapses them — so “the camera could not
            see this” can never read as “this was not there”.
          </p>

          <ul className="uwv-signin-states" aria-label="Observation states">
            {LEGEND.map((key) => {
              const descriptor = STATES[key];
              return (
                <li key={key} className="uwv-signin-state" style={{ ['--state-tone' as string]: descriptor.colorVar }}>
                  <span className="uwv-signin-state-icon" aria-hidden="true">
                    <Icon icon={StateIcons[key]} size="control" />
                  </span>
                  <span className="uwv-signin-state-text">
                    <span className="uwv-signin-state-label">{descriptor.label}</span>
                    <span className="uwv-signin-state-description">{descriptor.description}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="uwv-signin-brand-foot">Every figure it shows carries the coverage behind it.</p>
      </aside>

      {/* ── The form ──────────────────────────────────────────────────────── */}
      <main className="uwv-signin-main">
        <div className="uwv-signin-toolbar">
          {/* At narrow widths the statement panel is gone, so the mark has to
              be here instead — a sign-in screen with nothing on it that names
              the product is a sign-in screen a user cannot trust. */}
          <span className="uwv-signin-compact">
            <span className="uwv-signin-mark" data-size="sm">
              <Aperture size={16} />
            </span>
            <span>UnityWorks Vision AI</span>
          </span>
          <ThemeToggle />
        </div>

        <div className="uwv-signin-card uwv-arrive" data-order="2">
          <h1 className="uwv-signin-title">Sign in</h1>
          <p className="uwv-signin-subtitle">Use the account your organization issued you.</p>

          {endedReason ? (
            <div className="uwv-signin-notice">
              <Callout tone="warning" live>
                {endedReason === 'expired'
                  ? 'Your session ended. Sign in to continue.'
                  : 'Your access changed. Sign in again to continue.'}
              </Callout>
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="uwv-signin-form">
            <Input
              label="Email"
              type="email"
              name="email"
              autoComplete="username"
              placeholder="name@company.com"
              required
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <PasswordInput
              label="Password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />

            {/* \`role="alert"\` so a screen reader is told immediately. A visual
                message a blind user never hears is not an error message. */}
            {failure ? (
              <Callout tone="error" live>
                {failure.message}
              </Callout>
            ) : null}

            {/* type=submit so Enter works from either field, without a keydown handler. */}
            <Button type="submit" variant="primary" loading={busy} className="uwv-signin-submit">
              {busy ? 'Signing in' : 'Sign in'}
            </Button>
          </form>

          <p className="uwv-signin-help">
            <Icon icon={StatusIcons.guarantee} size="inline" />
            Access is granted by your organization administrator — ask them if you cannot sign in.
          </p>
        </div>

        <p className="uwv-signin-legal">UnityWorks Vision AI</p>
      </main>
    </div>
  );
}

/**
 * The mark, at sign-in scale.
 *
 * Four viewfinder ticks around a lit centre — the same device the camera tiles
 * carry, and the same one in the corner of the shell and in the browser tab.
 * One idea, every size.
 */
function Aperture({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, display: 'block' }}>
      <path d="M1 6V1h5M14 1h5v5M19 14v5h-5M6 19H1v-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
      <circle cx="10" cy="10" r="2.6" fill="currentColor" />
    </svg>
  );
}

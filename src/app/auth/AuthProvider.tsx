/**
 * Authentication state and session lifecycle.
 *
 * ### Restoring a session on reload
 *
 *     mount → POST /auth/refresh → access token in memory → GET /auth/me → ready
 *
 * The access token is deliberately lost on reload. The httpOnly refresh cookie
 * survives, so the round trip above restores the session without a login prompt
 * — and without the token ever being written anywhere a script could read it.
 *
 * A failed restore is the **normal** state for a first visit, not an error. It
 * resolves to `unauthenticated` and shows the login screen; it does not show a
 * "session expired" message to somebody who never had one.
 *
 * ### The 401 on a cold load is this, and it is correct
 *
 * A browser console shows exactly one 401 when the app is opened without a
 * session: `POST /api/v1/auth/refresh`, unauthenticated, at boot. It is an
 * intentional authorization rejection. The refresh cookie is httpOnly and this
 * page cannot read it, so *"do I have a session?"* is a question only the
 * server can answer — and asking is the only way to restore one without a
 * login prompt.
 *
 * Skipping the call by remembering in `localStorage` that a session once
 * existed was tried and reverted. It makes the client a second source of truth
 * about sessions, and it breaks the contract this module's own suite states —
 * *"restores a session from the refresh cookie without a login prompt"* — for
 * anyone whose local storage was cleared while their cookie survived. A
 * quieter console is not worth an unnecessary sign-in, and relaxing the
 * endpoint was never on the table.
 *
 * What has to stay quiet is the **product**, and it does: the rejection
 * resolves to the login screen with nothing surfaced to the operator.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  onSessionEnd,
  refreshAccessToken,
  setAccessToken,
  __resetClient,
} from '@shared/api/client';
import { authApi, type Identity } from '@shared/api/services';
import { isApiError } from '@shared/api/errors';

export type AuthStatus = 'restoring' | 'authenticated' | 'unauthenticated';

export interface LoginFailure {
  kind: 'invalid_credentials' | 'account_disabled' | 'unavailable' | 'unknown';
  message: string;
}

interface AuthContextValue {
  status: AuthStatus;
  user: Identity | null;
  /** Set when a live session ended by itself — distinct from never having one. */
  endedReason: 'expired' | 'revoked' | null;
  login: (email: string, password: string) => Promise<LoginFailure | null>;
  logout: () => Promise<void>;
  dismissEnded: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const [user, setUser] = useState<Identity | null>(null);
  const [endedReason, setEndedReason] = useState<'expired' | 'revoked' | null>(null);

  // Guards against a state update after unmount during the restore round trip,
  // which React would otherwise warn about on a fast navigation away.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /* The client cannot import this provider — that would be a cycle — so it
     reports session loss through a callback registered here. */
  useEffect(() => {
    onSessionEnd((reason) => {
      if (!alive.current) return;
      setUser(null);
      setStatus('unauthenticated');
      // Only surfaced when a session actually existed. A first-time visitor
      // must not be told their session expired.
      setEndedReason(reason);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const token = await refreshAccessToken();
      if (cancelled || !alive.current) return;

      if (!token) {
        // Expected on a first visit, and the origin of the one 401 a browser
        // console shows on a cold load: the refresh cookie is httpOnly, so this
        // page cannot know whether a session exists and must ask. The server
        // refusing is the correct answer, not a fault — see the note at the top
        // of this file.
        //
        // `onSessionEnd` fired and set a reason; clear it, because nothing was
        // lost. That is what keeps the rejection quiet *in the product*: a
        // first-time visitor is never told their session expired.
        setEndedReason(null);
        setStatus('unauthenticated');
        return;
      }

      try {
        const identity = await authApi.me();
        if (cancelled || !alive.current) return;
        setUser(identity);
        setStatus('authenticated');
      } catch {
        setAccessToken(null);
        if (!cancelled && alive.current) setStatus('unauthenticated');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginFailure | null> => {
    setEndedReason(null);
    try {
      const session = await authApi.login(email, password);
      setAccessToken(session.access_token);

      // Prefer the identity the login returned; fall back to /auth/me so the
      // provider works even if the login payload ever slims down.
      const identity = session.user ?? (await authApi.me());
      setUser(identity);
      setStatus('authenticated');
      return null;
    } catch (error) {
      setAccessToken(null);
      setStatus('unauthenticated');

      if (isApiError(error)) {
        if (error.code === 'INVALID_CREDENTIALS') {
          // The backend deliberately does not distinguish "no such user" from
          // "wrong password" — that distinction is an enumeration oracle — and
          // neither does this message.
          return { kind: 'invalid_credentials', message: 'Email or password is incorrect.' };
        }
        if (error.kind === 'network' || error.kind === 'dependency_unavailable') {
          return {
            kind: 'unavailable',
            message: 'UnityWorks Vision AI is not reachable right now. Try again shortly.',
          };
        }
        if (error.kind === 'forbidden') {
          return {
            kind: 'account_disabled',
            message: 'This account cannot sign in. Contact your administrator.',
          };
        }
        return { kind: 'unknown', message: error.friendlyMessage };
      }

      return { kind: 'unknown', message: 'Sign-in could not be completed.' };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      // Clears the refresh cookie server-side. Unauthenticated on the backend,
      // so it works even when the access token has already expired.
      await authApi.logout();
    } catch {
      // A failed logout call must still end the local session. Leaving the user
      // apparently signed in because the network blipped is the worse outcome.
    }
    __resetClient();
    setUser(null);
    setEndedReason(null);
    setStatus('unauthenticated');
  }, []);

  const dismissEnded = useCallback(() => setEndedReason(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, endedReason, login, logout, dismissEnded }),
    [status, user, endedReason, login, logout, dismissEnded],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

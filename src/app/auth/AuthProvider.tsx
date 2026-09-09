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
 *
 * ### The organisation is part of the session, not part of this app's state
 *
 * There is no "current organisation" variable here that requests read. The
 * active organisation is the tenant claim inside the access token, so switching
 * organisations means **getting a new token** — `POST /auth/organizations/{id}/select`
 * for one of the caller's own memberships, or `POST /platform/organizations/{id}/enter`
 * for an audited platform-operator entry.
 *
 * That is why this provider holds `organizations` but not `activeOrganizationId`:
 * the active one is `user.tenant_id`, which came from the server, and a second
 * copy on this side would be a thing that could disagree with the token every
 * request is actually made under.
 *
 * ### Switching clears the cache, and it has to happen here
 *
 * `queryClient.clear()` on every organisation change. TanStack Query keys in
 * this application do not carry an organisation id — `['cameras']` is
 * `['cameras']` in both — so without this, organisation A's cameras, incidents
 * and counts stay on screen after the switch and are indistinguishable from
 * organisation B's. It is in this module rather than in a component because it
 * must happen on *every* path that changes the token's tenant, and a component
 * can be unmounted.
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
import { useQueryClient } from '@tanstack/react-query';
import {
  onSessionEnd,
  refreshAccessToken,
  setAccessToken,
  __resetClient,
} from '@shared/api/client';
import { authApi, type Identity, type OrganizationSummary } from '@shared/api/services';
import { platformApi } from '@shared/api/platform';
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

  /**
   * Every organisation this account may enter, from the server.
   *
   * Empty while the session is still restoring, and empty for a platform
   * operator who is a member of nothing — which is why `mustSelect` is a
   * separate field and not `organizations.length > 1`.
   */
  organizations: OrganizationSummary[];
  /** Whether the server says an organisation choice is owed before the app. */
  mustSelect: boolean;
  /**
   * Whether `organizations` and `mustSelect` are the server's answers yet.
   *
   * They are unknown for one round trip after a page reload — the login
   * response that carries them is long gone, so they are re-fetched. A guard
   * that read `mustSelect` during that window would read `false`, and would
   * redirect somebody off the chooser they had just reloaded. Anything routing
   * on those two fields must wait for this.
   */
  organizationsResolved: boolean;
  isPlatformOperator: boolean;
  /** The active organisation's summary, when it is one of the caller's own. */
  activeOrganization: OrganizationSummary | null;

  login: (email: string, password: string) => Promise<LoginFailure | null>;
  logout: () => Promise<void>;
  dismissEnded: () => void;
  /** Enter one of the caller's own organisations. Throws on refusal. */
  selectOrganization: (organizationId: string) => Promise<void>;
  /** Enter an organisation as a platform operator. Audited. Throws on refusal. */
  enterOrganization: (organizationId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const [user, setUser] = useState<Identity | null>(null);
  const [endedReason, setEndedReason] = useState<'expired' | 'revoked' | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [mustSelect, setMustSelect] = useState(false);
  const [isPlatformOperator, setIsPlatformOperator] = useState(false);
  const [organizationsResolved, setOrganizationsResolved] = useState(false);

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
      setOrganizations([]);
      setMustSelect(false);
      setIsPlatformOperator(false);
      setOrganizationsResolved(false);
      setStatus('unauthenticated');
      // Only surfaced when a session actually existed. A first-time visitor
      // must not be told their session expired.
      setEndedReason(reason);
    });
  }, []);

  /**
   * Load the organisation list for the session that already exists.
   *
   * Used on restore, where the login response — which carries the list — is
   * long gone. `must_select` is recomputed the same way the server computes it
   * at login, from the same two facts, so a reloaded page routes exactly as the
   * page that was reloaded did.
   */
  const loadOrganizations = useCallback(async (): Promise<void> => {
    try {
      const accessible = await authApi.organizations();
      if (!alive.current) return;
      setOrganizations(accessible.organizations);
      setIsPlatformOperator(accessible.is_platform_operator);
      setMustSelect(accessible.organizations.length > 1 || accessible.is_platform_operator);
      setOrganizationsResolved(true);
    } catch {
      // A session that cannot list its own organisations is one organisation
      // wide as far as this app is concerned. Failing closed here means the
      // chooser is not offered rather than being offered and then empty.
      if (!alive.current) return;
      setOrganizations([]);
      setIsPlatformOperator(false);
      setMustSelect(false);
      // Resolved, in the sense that asking again will not help. Routing must
      // proceed rather than hang on a spinner forever.
      setOrganizationsResolved(true);
    }
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
        await loadOrganizations();
      } catch {
        setAccessToken(null);
        if (!cancelled && alive.current) {
          setOrganizationsResolved(true);
          setStatus('unauthenticated');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadOrganizations]);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginFailure | null> => {
      setEndedReason(null);
      try {
        const session = await authApi.login(email, password);
        setAccessToken(session.access_token);

        // Prefer the identity the login returned; fall back to /auth/me so the
        // provider works even if the login payload ever slims down.
        const identity = session.user ?? (await authApi.me());
        setUser(identity);

        // The routing facts come from the login response rather than from a
        // second round trip, so the answer cannot change between the two calls
        // — and so a single-organisation user never touches the organisations
        // endpoint at all.
        setOrganizations(session.organizations ?? []);
        setIsPlatformOperator(session.is_platform_operator === true);
        setMustSelect(session.must_select === true);
        setOrganizationsResolved(true);

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
    },
    [],
  );

  /**
   * Adopt a freshly minted session for a different organisation.
   *
   * The order is deliberate and is the whole of the data-isolation guarantee:
   * the token is replaced *first*, the cache is emptied *second*, and the new
   * identity is published *last*. Any refetch a component triggers on the
   * re-render therefore carries the new tenant and finds nothing cached from
   * the old one. Publishing the identity first would give every mounted
   * component one render against the previous organisation's cached data.
   */
  const adopt = useCallback(
    async (accessToken: string, identity?: Identity): Promise<void> => {
      setAccessToken(accessToken);
      queryClient.clear();
      const resolved = identity ?? (await authApi.me());
      if (!alive.current) return;
      setUser(resolved);
    },
    [queryClient],
  );

  const selectOrganization = useCallback(
    async (organizationId: string): Promise<void> => {
      const session = await authApi.selectOrganization(organizationId);
      await adopt(session.access_token, session.user);
      // The list itself does not change when a member switches between their
      // own organisations, but the counts on it might have, and this is the
      // moment the user is looking at them.
      await loadOrganizations();
    },
    [adopt, loadOrganizations],
  );

  const enterOrganization = useCallback(
    async (organizationId: string): Promise<void> => {
      const entry = await platformApi.enter(organizationId);
      // No identity in the entry response: it deliberately reports the
      // organisation and the reach it granted rather than an `Identity`, so the
      // shape of a tenant session has exactly one producer. `/auth/me` under
      // the new token is that producer.
      await adopt(entry.access_token);
    },
    [adopt],
  );

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
    // Same reason as an organisation switch, only more so: whatever is cached
    // belongs to somebody who has just signed out, and the next person at this
    // browser must not be shown it while their own data loads.
    queryClient.clear();
    setUser(null);
    setOrganizations([]);
    setMustSelect(false);
    setIsPlatformOperator(false);
    setOrganizationsResolved(false);
    setEndedReason(null);
    setStatus('unauthenticated');
  }, [queryClient]);

  const dismissEnded = useCallback(() => setEndedReason(null), []);

  const activeOrganization = useMemo(
    () => organizations.find((organization) => organization.id === user?.tenant_id) ?? null,
    [organizations, user?.tenant_id],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      endedReason,
      organizations,
      mustSelect,
      organizationsResolved,
      isPlatformOperator,
      activeOrganization,
      login,
      logout,
      dismissEnded,
      selectOrganization,
      enterOrganization,
    }),
    [
      status,
      user,
      endedReason,
      organizations,
      mustSelect,
      organizationsResolved,
      isPlatformOperator,
      activeOrganization,
      login,
      logout,
      dismissEnded,
      selectOrganization,
      enterOrganization,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

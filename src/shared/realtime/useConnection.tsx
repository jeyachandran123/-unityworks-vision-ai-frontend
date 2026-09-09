/**
 * The live connection, as React state.
 *
 * One connection per application, held by a provider, so ten components asking
 * about connectivity do not open ten sockets.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getAccessToken, refreshAccessToken } from '@shared/api/client';
import { useAuth } from '@app/auth/AuthProvider';
import { hasAny, PERMISSIONS } from '@app/permissions/permissions';
import { LiveConnection, resolveWebSocketUrl, type ConnectionStatus } from './connection';

const WS_PATH = (import.meta.env['VITE_WS_URL'] as string | undefined) ?? '/ws/v1/live';

const IDLE: ConnectionStatus = {
  state: 'idle',
  streaming: false,
  detail: 'Not connected',
  attempts: 0,
  lastMessageAt: null,
};

const ConnectionContext = createContext<ConnectionStatus>(IDLE);

export function useConnectionStatus(): ConnectionStatus {
  return useContext(ConnectionContext);
}

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, user } = useAuth();
  const [status, setStatus] = useState<ConnectionStatus>(IDLE);
  const connection = useRef<LiveConnection | null>(null);

  // Only accounts that may view live monitoring open a socket. Connecting and
  // being closed with 4403 on every reconnect would be noise for every other
  // role, and a permanent red badge they can do nothing about.
  const mayView = hasAny(user, [PERMISSIONS.viewLive]);

  /**
   * The organisation this socket belongs to.
   *
   * In the effect's dependencies because a live socket is scoped to a tenant
   * exactly as every REST call is: it was opened with a token naming
   * organisation A, and after a switch that token is gone. Without this the
   * socket would keep streaming A's cameras into B's wall until it happened to
   * reconnect — the one place stale organisation data could survive
   * `queryClient.clear()`, because it is pushed rather than fetched.
   */
  const tenant = user?.tenant_id ?? '';

  useEffect(() => {
    if (authStatus !== 'authenticated' || !mayView) {
      connection.current?.disconnect();
      connection.current = null;
      setStatus(IDLE);
      return;
    }

    const live = new LiveConnection({
      url: resolveWebSocketUrl(WS_PATH),
      token: getAccessToken,
      // The live socket must survive an access-token expiry the same way every
      // REST call already does. Without this the socket died after fifteen
      // minutes and never came back.
      renew: refreshAccessToken,
      onStatus: setStatus,
    });
    connection.current = live;
    live.connect();

    return () => {
      live.disconnect();
      connection.current = null;
    };
  }, [authStatus, mayView, tenant]);

  const value = useMemo(() => status, [status]);
  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

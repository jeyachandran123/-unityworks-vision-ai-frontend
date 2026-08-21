/**
 * Provider composition, ordered by dependency.
 *
 *   Query → Toast → Auth → Connection → Router
 *
 * Auth needs the query client for nothing, but Connection needs Auth (it only
 * opens a socket for an authenticated user who may view live), and the router's
 * guards need Auth. Ordering them here rather than nesting ad hoc in `main.tsx`
 * keeps that dependency visible.
 */

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@app/auth/AuthProvider';
import { ConnectionProvider } from '@shared/realtime/useConnection';
import { ToastProvider } from '@shared/ui/primitives';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // A monitoring product must never present a cached answer as current.
        // Thirty seconds is short enough that nothing on screen is meaningfully
        // stale, and long enough that navigation does not refetch constantly.
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        // One retry. The API client already handles 401 and refresh; retrying a
        // 403 or a 404 achieves nothing except delaying the error the user needs
        // to see.
        retry: (failureCount, error) => {
          const retryable = (error as { retryable?: boolean }).retryable === true;
          return retryable && failureCount < 1;
        },
      },
    },
  });
}

export function Providers({
  children,
  client,
}: {
  children: ReactNode;
  client?: QueryClient;
}) {
  return (
    <QueryClientProvider client={client ?? createQueryClient()}>
      <ToastProvider>
        <AuthProvider>
          <ConnectionProvider>
            <BrowserRouter>{children}</BrowserRouter>
          </ConnectionProvider>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

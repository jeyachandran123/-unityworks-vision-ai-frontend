/**
 * The one API client. Every request in this application goes through it.
 *
 * No component calls `fetch`. That is not a style preference — it is what makes
 * the token handling, the error envelope and the refresh flow provably uniform,
 * because there is exactly one place they can be implemented.
 *
 * ### Where the access token lives
 *
 * **In memory, and nowhere else.** Not `localStorage`, not `sessionStorage`, not
 * a cookie the page can read, not the URL. A page reload discards it, and the
 * session is restored by calling `/auth/refresh` — the httpOnly refresh cookie
 * makes that work without a login prompt.
 *
 * ### Single-flight refresh
 *
 * Ten concurrent requests that all receive 401 must produce **one** refresh
 * call, not ten. Ten would race, and nine would present a refresh token that the
 * first call had already rotated away — logging the user out in the middle of a
 * working session, at random, under load.
 *
 * So the first 401 starts a refresh and stores the promise; every other 401
 * awaits that same promise, then retries once.
 */

import { ApiError, normaliseError, type ErrorEnvelope } from './errors';

export const API_BASE = (import.meta.env['VITE_API_BASE_URL'] as string | undefined) ?? '/api/v1';

/** The in-memory access token. Module-scoped so nothing can serialise it. */
let accessToken: string | null = null;

/** One in-flight refresh, shared by every caller that needs one. */
let refreshInFlight: Promise<string | null> | null = null;

/** Called when refreshing fails: the session is over and the UI must react. */
type SessionEndedHandler = (reason: 'expired' | 'revoked') => void;
let onSessionEnded: SessionEndedHandler = () => {};

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function onSessionEnd(handler: SessionEndedHandler): void {
  onSessionEnded = handler;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Skips both the Authorization header and the refresh-retry path. */
  anonymous?: boolean;
  signal?: AbortSignal;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!options.anonymous && accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  return fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    // Always. The refresh cookie is how a session survives a reload, and it is
    // only attached when credentials are included.
    credentials: 'include',
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

/**
 * Refresh the access token, at most once concurrently.
 *
 * Returns the new token, or `null` when the session is genuinely over.
 */
export async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        setAccessToken(null);
        onSessionEnded(response.status === 401 ? 'expired' : 'revoked');
        return null;
      }

      const body = (await response.json()) as { access_token?: string };
      const token = body.access_token ?? null;
      setAccessToken(token);
      return token;
    } catch {
      // A network failure is not a revoked session. The token is dropped
      // because it cannot be verified, but the reason given is "expired" so the
      // UI offers a sign-in rather than accusing the account of being disabled.
      setAccessToken(null);
      onSessionEnded('expired');
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function parse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  if (!text) return undefined as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError({
      code: 'MALFORMED_RESPONSE',
      message: 'The server returned a response this application could not read.',
      retryable: true,
      details: {},
      request_id: response.headers.get('X-Request-Id') ?? '',
    });
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response = await send(path, options);

  if (response.status === 401 && !options.anonymous) {
    const token = await refreshAccessToken();
    if (token) {
      // Retry exactly once. A loop here would hammer the API with a credential
      // that is not going to start working.
      response = await send(path, options);
    }
  }

  if (!response.ok) {
    const envelope = await parse<ErrorEnvelope>(response).catch(() => undefined);
    throw normaliseError(response.status, envelope, response.headers.get('X-Request-Id'));
  }

  return parse<T>(response);
}

/**
 * A raw authorized request, for responses that are not JSON.
 *
 * Evidence imagery is the only caller. It exists because `apiRequest` parses
 * every body as JSON, and an image is not one — not because imagery deserves a
 * looser path. The Authorization header, the credentialed cookie and the
 * single-flight refresh retry all behave exactly as they do for JSON.
 */
export async function authorizedFetch(path: string): Promise<Response> {
  let response = await send(path, {});
  if (response.status === 401) {
    const token = await refreshAccessToken();
    if (token) response = await send(path, {});
  }
  return response;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body }),
  // `del`, not `delete` — a reserved word cannot be a shorthand property, and
  // spelling it `delete:` here would force every call site to quote it.
  del: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'DELETE', body }),
};

/** Test seam. Clears module state between cases. */
export function __resetClient(): void {
  accessToken = null;
  refreshInFlight = null;
  onSessionEnded = () => {};
}

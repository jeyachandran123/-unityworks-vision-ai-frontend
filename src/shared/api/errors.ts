/**
 * The error envelope, normalised once.
 *
 * The backend answers every failure with the same shape:
 *
 *     { code, message, retryable, details, request_id }
 *
 * This module turns that — and the failures that never reach the backend at all,
 * like a dropped connection — into one `ApiError` the UI can branch on.
 *
 * **`message` is for a person.** The backend already withholds stack traces,
 * paths, SQL and credentials, so its messages are safe to show. Where a message
 * would be unhelpful anyway (`INTERNAL`), `friendlyMessage` supplies one that
 * tells the user what to do instead of what broke.
 */

export interface ErrorEnvelope {
  code: string;
  message: string;
  retryable: boolean;
  details: Record<string, unknown>;
  request_id: string;
}

export type ErrorKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'rate_limited'
  | 'vision_unavailable'
  | 'dependency_unavailable'
  | 'network'
  | 'server';

export class ApiError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly details: Record<string, unknown>;
  readonly requestId: string;
  readonly status: number;

  constructor(envelope: ErrorEnvelope, status = 0) {
    super(envelope.message);
    this.name = 'ApiError';
    this.code = envelope.code;
    this.retryable = envelope.retryable;
    this.details = envelope.details;
    this.requestId = envelope.request_id;
    this.status = status;
  }

  get kind(): ErrorKind {
    switch (this.code) {
      // `NO_SESSION` is grouped here but is not a fault: nobody was signed in
      // yet. Every page load produces one while the app tries to restore a
      // session from the refresh cookie, which is why it is treated as routine
      // rather than logged as an error.
      case 'UNAUTHENTICATED':
      case 'TOKEN_EXPIRED':
      case 'INVALID_CREDENTIALS':
      case 'NO_SESSION':
        return 'unauthenticated';
      case 'FORBIDDEN':
      case 'OUT_OF_SCOPE':
      case 'EVIDENCE_FORBIDDEN':
        return 'forbidden';
      case 'NOT_FOUND':
        return 'not_found';
      case 'INVALID_REQUEST':
        return 'validation';
      case 'RATE_LIMITED':
        return 'rate_limited';
      case 'VISION_UNAVAILABLE':
        return 'vision_unavailable';
      case 'DEPENDENCY_UNAVAILABLE':
        return 'dependency_unavailable';
      case 'NETWORK':
        return 'network';
      default:
        return this.status === 0 ? 'network' : 'server';
    }
  }

  /**
   * What to put on screen.
   *
   * The backend's own message wins wherever it is actionable. The exceptions are
   * the two cases where it cannot be: a generic internal error, and a failure
   * that never reached the server.
   */
  get friendlyMessage(): string {
    switch (this.kind) {
      case 'network':
        return 'Could not reach UnityWorks Vision AI. Check the connection and try again.';
      case 'server':
        return 'The service could not complete that request. The reference below identifies it in the logs.';
      case 'vision_unavailable':
        // Deliberately not "no data". The platform being down and the platform
        // observing nothing are different facts (invariant V8), and conflating
        // them is how a monitoring product reports safety it never measured.
        return 'Vision OS is not currently running, so no observations can be shown. This is not the same as observing nothing.';
      default:
        return this.message;
    }
  }
}

const STATUS_CODE: Record<number, string> = {
  400: 'INVALID_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'INVALID_REQUEST',
  429: 'RATE_LIMITED',
  503: 'DEPENDENCY_UNAVAILABLE',
};

export function normaliseError(
  status: number,
  envelope: ErrorEnvelope | undefined,
  requestId: string | null,
): ApiError {
  if (envelope && typeof envelope.code === 'string') {
    return new ApiError(envelope, status);
  }

  // A response the backend did not shape — a proxy error page, a gateway
  // timeout. Given the same envelope so nothing downstream has two shapes.
  return new ApiError(
    {
      code: STATUS_CODE[status] ?? 'INTERNAL',
      message: 'The request could not be completed.',
      retryable: status >= 500 || status === 429,
      details: {},
      request_id: requestId ?? '',
    },
    status,
  );
}

export function networkError(): ApiError {
  return new ApiError({
    code: 'NETWORK',
    message: 'The request did not reach the server.',
    retryable: true,
    details: {},
    request_id: '',
  });
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

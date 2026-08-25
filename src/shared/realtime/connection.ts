/**
 * The live WebSocket client.
 *
 * ### The handshake
 *
 *     connect → send {"type":"authenticate","access_token":"…"} → receive "ready"
 *
 * **The token is never in the URL.** A URL is logged by the browser, by every
 * reverse proxy and by the access log; `?token=…` puts a bearer credential in
 * all of them permanently. The backend requires the frame for the same reason.
 *
 * ### Two states, not one
 *
 * `connected` means the socket is open and authenticated.
 * `streaming` means observations are actually arriving.
 *
 * They are separate because before Phase 3 the first is true and the second is
 * false, and a green "LIVE" badge lit by a connected socket over a camera that
 * does not exist is exactly the lie this product cannot afford. The server says
 * `"streaming": false` and this client carries that through untouched.
 */

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'authenticating'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'unauthorised';

export interface ConnectionStatus {
  state: ConnectionState;
  /** Whether observation frames are arriving. False until Phase 3. */
  streaming: boolean;
  /** Operator-facing, never an exception message. */
  detail: string;
  attempts: number;
  lastMessageAt: number | null;
}

export interface LiveEvent {
  type: string;
  [key: string]: unknown;
}

/** Application-range close codes, mirroring the server's. */
export const CLOSE = {
  unauthenticated: 4401,
  forbidden: 4403,
  timeout: 4408,
} as const;

const INITIAL_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 30_000;
/** Beyond this the socket is treated as dead; the badge says so and stops. */
const MAX_ATTEMPTS = 8;

export interface ConnectionOptions {
  url: string;
  /** Read lazily, so a rotated token is used on reconnect rather than a stale one. */
  token: () => string | null;
  onStatus: (status: ConnectionStatus) => void;
  onEvent?: (event: LiveEvent) => void;
  /**
   * Obtain a fresh access token after the server rejected the current one.
   *
   * Injected rather than imported so this module keeps knowing nothing about
   * the REST client, and so a test can reject a renewal without a network.
   * Resolving `null` means the session really is over.
   */
  renew?: () => Promise<string | null>;
  /** Injected in tests. */
  socketFactory?: (url: string) => WebSocket;
}

export class LiveConnection {
  private socket: WebSocket | null = null;
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closedByUs = false;
  private status: ConnectionStatus = {
    state: 'idle',
    streaming: false,
    detail: 'Not connected',
    attempts: 0,
    lastMessageAt: null,
  };

  constructor(private readonly options: ConnectionOptions) {}

  get current(): ConnectionStatus {
    return this.status;
  }

  connect(): void {
    this.closedByUs = false;
    this.open();
  }

  disconnect(): void {
    this.closedByUs = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.socket?.close();
    this.socket = null;
    this.emit({ state: 'disconnected', streaming: false, detail: 'Disconnected', attempts: 0 });
  }

  private open(): void {
    const token = this.options.token();
    if (!token) {
      // Not an error state: an unauthenticated app has nothing to subscribe to.
      this.emit({ state: 'idle', streaming: false, detail: 'Not signed in' });
      return;
    }

    this.emit({
      state: this.attempts === 0 ? 'connecting' : 'reconnecting',
      streaming: false,
      detail: this.attempts === 0 ? 'Connecting' : `Reconnecting (attempt ${this.attempts + 1})`,
    });

    const factory = this.options.socketFactory ?? ((url: string) => new WebSocket(url));
    let socket: WebSocket;
    try {
      socket = factory(this.options.url);
    } catch {
      this.scheduleReconnect('Could not open a connection');
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.emit({ state: 'authenticating', streaming: false, detail: 'Authenticating' });
      socket.send(JSON.stringify({ type: 'authenticate', access_token: token }));
    };

    socket.onmessage = (event) => this.receive(event);

    socket.onerror = () => {
      // Browsers give no detail here by design. Reporting "an error occurred"
      // adds nothing, so the close handler decides what the user is told.
    };

    socket.onclose = (event) => {
      this.socket = null;
      if (this.closedByUs) return;

      if (event.code === CLOSE.unauthenticated) {
        // The access token expired while the socket was open — the ordinary
        // case after fifteen minutes on the live screen, not a real end of
        // session.
        //
        // This used to stop here, on the reasoning that retrying with the same
        // rejected token would loop and that "a later reconnect will pick up a
        // valid one". Nothing scheduled that later reconnect, so the socket
        // never came back and the user was left reading "Session is no longer
        // valid for live monitoring" until they reloaded the page — while the
        // REST side of the app carried on refreshing happily.
        //
        // Retrying with the *same* token would indeed loop, so the token is
        // refreshed first and only a genuine refresh failure is reported as a
        // dead session.
        this.emit({
          state: 'reconnecting',
          streaming: false,
          detail: 'Renewing session',
        });
        void this.renewAndReconnect();
        return;
      }

      if (event.code === CLOSE.forbidden) {
        this.emit({
          state: 'unauthorised',
          streaming: false,
          detail: 'This account may not view live monitoring',
        });
        return;
      }

      this.scheduleReconnect(
        event.code === CLOSE.timeout ? 'Authentication timed out' : 'Connection lost',
      );
    };
  }

  /**
   * Renew the access token, then reconnect with it.
   *
   * Only a refresh that actually fails ends the session. Anything else — a
   * slow network, a server hiccup — goes back through the ordinary reconnect
   * backoff rather than stranding the live screen.
   */
  private async renewAndReconnect(): Promise<void> {
    if (!this.options.renew) {
      // No renewal available: report honestly rather than retry forever.
      this.emit({
        state: 'unauthorised',
        streaming: false,
        detail: 'Session is no longer valid for live monitoring',
      });
      return;
    }

    let token: string | null = null;
    try {
      token = await this.options.renew();
    } catch {
      token = null;
    }
    if (this.closedByUs) return;

    if (!token) {
      this.emit({
        state: 'unauthorised',
        streaming: false,
        detail: 'Session is no longer valid for live monitoring',
      });
      return;
    }

    // A renewed token is a fresh start, not attempt N+1 — the backoff exists
    // for an unreachable server, and the server was reachable enough to say no.
    this.attempts = 0;
    this.open();
  }

  private receive(event: MessageEvent): void {
    let message: LiveEvent;
    try {
      message = JSON.parse(String(event.data)) as LiveEvent;
    } catch {
      return;
    }

    if (message.type === 'ready') {
      this.attempts = 0;
      const streaming = message['streaming'] === true;
      this.emit({
        state: 'connected',
        streaming,
        // Two facts, stated separately. "Backend connected · live source not
        // active" is honest; "LIVE" would not be.
        detail: streaming ? 'Live stream active' : 'Connected · no live camera source yet',
        attempts: 0,
        lastMessageAt: Date.now(),
      });
      return;
    }

    if (message.type === 'heartbeat') {
      this.emit({ lastMessageAt: Date.now() });
      return;
    }

    this.emit({ lastMessageAt: Date.now() });
    this.options.onEvent?.(message);
  }

  private scheduleReconnect(detail: string): void {
    this.attempts += 1;

    if (this.attempts > MAX_ATTEMPTS) {
      // A bounded retry loop. An unbounded one against your own backend is a
      // denial of service you wrote yourself.
      this.emit({
        state: 'disconnected',
        streaming: false,
        detail: `${detail} — giving up after ${MAX_ATTEMPTS} attempts`,
        attempts: this.attempts,
      });
      return;
    }

    const delay = Math.min(INITIAL_BACKOFF_MS * 2 ** (this.attempts - 1), MAX_BACKOFF_MS);
    this.emit({ state: 'reconnecting', streaming: false, detail, attempts: this.attempts });
    this.timer = setTimeout(() => this.open(), delay);
  }

  private emit(patch: Partial<ConnectionStatus>): void {
    this.status = { ...this.status, ...patch };
    this.options.onStatus(this.status);
  }
}

/** Absolute WebSocket URL from the configured path, honouring https → wss. */
export function resolveWebSocketUrl(path: string): string {
  if (path.startsWith('ws://') || path.startsWith('wss://')) return path;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * The camera wall API.
 *
 * ### The browser never learns how to reach the DVR
 *
 * Nothing in these types carries a host, a username, a password, a credential
 * reference or an RTSP URL. A camera is an id, a channel number, a state and a
 * size. Everything needed to *reach* the camera stays on the server, so a
 * compromised browser session gains a view and not a camera.
 *
 * ### Why streams are opened with a ticket
 *
 * A tile is an `<img>`, and the browser issues that request itself — there is no
 * way to attach an Authorization header. Putting the bearer token in the URL
 * would write a live credential into browser history, proxy logs and the
 * `Referer` header. Instead an authenticated call exchanges the session for a
 * short, single-camera ticket that can do exactly one thing.
 *
 * The ticket is never stored. It lives in the component that opened the stream
 * and dies with it.
 */

import { api } from './client';

export type StreamState =
  | 'disabled'
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'offline'
  | 'error';

export interface WallCamera {
  camera_id: string;
  name: string;
  /** The DVR channel this camera is wired to. Verified, not assumed. */
  channel: number;
  stream_type: 'main' | 'sub';
  enabled: boolean;
  /** Derived from genuine frame arrival on the server. Never set by this app. */
  state: StreamState;
  width: number;
  height: number;
  viewers: number;
  reconnects: number;
  frames_decoded: number;
  /** `null` before the first frame — unknown, not zero. */
  seconds_since_frame: number | null;
  first_frame_latency_s: number | null;
  last_error: string;
  purpose: string;
}

export interface WallSummary {
  cameras: number;
  by_state: Record<string, number>;
  live: number;
  viewers: number;
}

export interface WallList {
  cameras: WallCamera[];
  total: number;
  live: number;
  wall: WallSummary;
  default_wall_fps: number;
  default_detail_fps: number;
}

export interface StreamTicket {
  camera_id: string;
  ticket: string;
  expires_in: number;
  /** Built by the server so the client never assembles a media URL by hand. */
  stream_path: string;
}

export const wallApi = {
  cameras: () => api.get<WallList>('/wall/cameras'),
  detail: (cameraId: string) =>
    api.get<WallCamera>(`/wall/cameras/${encodeURIComponent(cameraId)}`),
  ticket: (cameraId: string) =>
    api.post<StreamTicket>(`/wall/cameras/${encodeURIComponent(cameraId)}/ticket`, {}),
};

/** How a state should read to an operator. The only place these become words. */
export const STREAM_STATE_LABEL: Record<StreamState, string> = {
  disabled: 'Disabled',
  connecting: 'Connecting',
  live: 'Live',
  reconnecting: 'Reconnecting',
  offline: 'Offline',
  error: 'Error',
};

/**
 * Tone for a state.
 *
 * `live` is the only state that reads as healthy, and it is the only one the
 * server will report once real frames have arrived — so a green tile always
 * means pictures are moving.
 */
export function streamTone(state: StreamState): 'online' | 'degraded' | 'offline' | 'idle' {
  switch (state) {
    case 'live':
      return 'online';
    case 'connecting':
    case 'reconnecting':
      return 'degraded';
    case 'offline':
    case 'error':
      return 'offline';
    case 'disabled':
      return 'idle';
  }
}

/**
 * The `<img src>` for a camera, from a ticket the server just issued.
 *
 * `tenant` and `subject` travel alongside because the ticket is signed over all
 * three; the server checks the signature rather than trusting any of them.
 */
export function streamUrl(
  ticket: StreamTicket,
  identity: { tenant_id: string; subject: string },
  fps: number,
): string {
  // `stream_path` is already absolute from the server ('/api/v1/wall/...').
  // Prefixing VITE_API_BASE_URL — which is itself '/api/v1' — produced
  // '/api/v1/api/v1/wall/...' and a 404 for every tile. The server builds this
  // path precisely so the client does not have to assemble one; using it
  // verbatim is the point.
  const query = new URLSearchParams({
    ticket: ticket.ticket,
    tenant: identity.tenant_id,
    subject: identity.subject,
    fps: String(fps),
  });
  return `${ticket.stream_path}?${query.toString()}`;
}

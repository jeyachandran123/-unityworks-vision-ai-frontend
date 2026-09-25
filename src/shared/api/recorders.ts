/**
 * Recorders — the DVRs and NVRs cameras plug into.
 *
 * A recorder owns how to reach its cameras: its addresses, the port, the account
 * and its password, and which brand it is (which decides the stream URL). A
 * camera is one channel on a recorder.
 *
 * ### Two addresses, one dialled
 *
 * A recorder may have an IP address (on the site's own network), a domain
 * (from anywhere), or both. `connect_via` says which one the server dials, and
 * `address` is that one, worked out by the server.
 *
 * ### The password only travels one way
 *
 * `RecorderDraft.password` and `setPassword` send it. Nothing that comes back
 * has a field that could hold it: `Recorder` says whether a password is
 * configured and nothing else. That is deliberate at the type level, so no
 * component can render one by accident — the server never sends it either, but
 * a type with a `password?: string` field is an invitation.
 */

import { api } from './client';
import type { Camera } from './persistence';

/** A brand the dropdown offers. Labels and default ports; no URLs. */
export interface RecorderBrand {
  key: string;
  label: string;
  default_port: number;
}

export interface RecorderBrandList {
  brands: RecorderBrand[];
  /** The key that means "a device not in the list" — its path is typed in. */
  custom: string;
}

/** Which of a recorder's two addresses the server dials. */
export type ConnectVia = 'ip_address' | 'hostname';

export interface Recorder {
  id: string;
  name: string;
  /** IPv4, usually on the site's own network. Empty when there is none. */
  ip_address: string;
  /** A domain name such as `site.freemyip.com`. Empty when there is none. */
  hostname: string;
  connect_via: ConnectVia;
  /** The address the server dials: whichever `connect_via` names. */
  address: string;
  /** The recorder's video (RTSP) port. */
  rtsp_port: number;
  username: string;
  /** A brand key, or the custom key. */
  brand: string;
  /** What a person reads: "Hikvision", "Other (custom)". */
  brand_label: string;
  /** Only for a custom brand, where the person typed it themselves. */
  path_template: string | null;
  stream_main: number | null;
  stream_sub: number | null;
  is_active: boolean;
  /** Whether a password is set. Never the password. */
  credential_configured: boolean;
  /** `recorder` (typed in here), `env` or `file` (kept by the server's operator). */
  credential_scheme: string;
  camera_count: number;
  /** How many of its cameras are switched on. */
  cameras_on: number;
  created_at: string | null;
  updated_at: string | null;
}

/** A camera row on a recorder's page, with whether it is streaming right now. */
export interface RecorderCamera extends Camera {
  running: boolean;
}

export interface RecorderDetail extends Recorder {
  cameras: RecorderCamera[];
}

export interface RecorderList {
  recorders: Recorder[];
  count: number;
  total: number;
  limit: number;
  offset: number;
}

/** A camera to create together with its recorder, in the same save. */
export interface RecorderCameraDraft {
  channel: number;
  name: string;
  zone_id: string;
  stream_type: 'main' | 'sub';
  purpose?: string;
}

export interface RecorderConnection {
  name: string;
  ip_address: string;
  hostname: string;
  /** Required when both addresses are given; otherwise the one there is. */
  connect_via?: ConnectVia;
  rtsp_port: number;
  username: string;
  brand: string;
  /** Custom brand only. */
  path_template?: string;
  stream_main?: number;
  stream_sub?: number;
}

export interface RecorderDraft extends RecorderConnection {
  /** Sent once, sealed by the server, never returned. */
  password: string;
  cameras?: RecorderCameraDraft[];
}

/**
 * What a connection test found.
 *
 * `outcome` is stable for code to branch on. `message` and `hint` are written
 * for the person looking at the screen, and are safe to show verbatim.
 */
export interface RecorderTestResult {
  ok: boolean;
  outcome:
    | 'connected'
    | 'authentication_failed'
    | 'channel_not_found'
    | 'stream_unavailable'
    | 'timeout'
    | 'unreachable'
    | 'refused'
    | 'address_not_found'
    | 'not_rtsp'
    | 'decoder_unavailable'
    | 'credential_unavailable';
  message: string;
  hint: string;
  /** What was tested, so the page can say "192.168.1.20 : 554". */
  address: string;
  port: number;
  channel: number;
  elapsed_ms: number;
  resolution: string | null;
}

export interface RecorderActivation extends Recorder {
  sessions_started?: number;
  sessions_stopped?: number;
}

const path = (id: string) => `/recorders/${encodeURIComponent(id)}`;

export const recordersApi = {
  brands: () => api.get<RecorderBrandList>('/recorder-brands'),
  list: (query: { limit?: number; offset?: number } = {}) => {
    const search = new URLSearchParams({
      limit: String(query.limit ?? 25),
      offset: String(query.offset ?? 0),
    });
    return api.get<RecorderList>(`/recorders?${search.toString()}`);
  },
  get: (id: string) => api.get<RecorderDetail>(path(id)),
  /** A recorder and, optionally, its cameras — one save, all or nothing. */
  create: (draft: RecorderDraft) => api.post<RecorderDetail>('/recorders', draft),
  /** How it is reached. Never the password; that is `setPassword`. */
  update: (id: string, changes: Partial<RecorderConnection>) =>
    api.patch<Recorder>(path(id), changes),
  /** Replaces the password. The old one is overwritten, never read. */
  setPassword: (id: string, password: string) =>
    api.put<Recorder>(`${path(id)}/credential`, { password }),
  activate: (id: string) => api.post<RecorderActivation>(`${path(id)}/activate`),
  deactivate: (id: string) => api.post<RecorderActivation>(`${path(id)}/deactivate`),
  /** Refused by the server while it holds cameras. */
  remove: (id: string) => api.del<{ recorder_id: string; deleted: boolean }>(path(id)),
  /**
   * Test a recorder that has not been saved yet, with the password just typed.
   * `via` tests one address of two; without it, the one it would connect with.
   */
  testNew: (
    connection: Omit<RecorderConnection, 'name'> & {
      password: string;
      channel: number;
      stream_type?: 'main' | 'sub';
      via?: ConnectVia;
    },
  ) => api.post<RecorderTestResult>('/recorders/test', connection),
  /** Test a saved recorder with its stored password, optionally on its other address. */
  test: (id: string, channel: number, via?: ConnectVia) =>
    api.post<RecorderTestResult>(`${path(id)}/test`, via ? { channel, via } : { channel }),
};

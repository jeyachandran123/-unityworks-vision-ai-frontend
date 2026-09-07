/**
 * The durable product API — cameras, incidents, evidence, frames, audit.
 *
 * Separate from `services.ts` on purpose. Those are the platform's own
 * contracts; these are the application's record of what it decided and kept. A
 * reader tracing "where does an incident come from" should land in one file.
 *
 * ### What is deliberately absent
 *
 * There is no `getEvidenceImage(): Promise<Blob>` helper. Imagery is fetched by
 * the component that displays it, through a URL that carries the access token,
 * so that every retrieval is one request the backend audits — and never a blob
 * cached in a module where a second component could reuse it without a second
 * audit row.
 */

import { api, authorizedFetch } from './client';

/* ── cameras ──────────────────────────────────────────────────────────────── */

export interface Camera {
  camera_key: string;
  /**
   * Globally unique: `organization_id:camera_key`. A camera key alone is
   * unique only within its organisation, so anything process-wide — a stream
   * registry, an observation partition — is keyed on this instead.
   */
  runtime_id: string;
  name: string;
  purpose: string;
  restaurant_id: string;
  zone_id: string | null;
  channel: number;
  stream_type: 'main' | 'sub';
  host: string;
  rtsp_port: number;
  username: string;
  /**
   * Whether this camera can authenticate. The reference itself is no longer
   * returned by the server at all: `literal:` made that field a channel that
   * could carry the secret, and a field whose safety depends on every writer
   * having picked the right scheme is not a safe field to send.
   */
  credential_configured: boolean;
  /** `env` or `file` — how the secret is stored, never where or what. */
  credential_scheme: string;
  analysis_fps: number;
  enabled: boolean;
  /** Whether the video is processed by AI, as distinct from whether it streams. */
  analysis_enabled: boolean;
  /** Redacted: `rtsp://***:***@host:554/...`. Never the dialling URL. */
  uri: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface CameraList {
  cameras: Camera[];
  enabled: number;
  total: number;
}

export interface CameraDraft {
  camera_key: string;
  name: string;
  channel: number;
  restaurant_id: string;
  /**
   * Required by the server. A camera with no address is skipped by the
   * runtime, so one created without a host would be listed and permanently
   * inert with nothing ever saying why.
   */
  host: string;
  zone_id?: string | null;
  rtsp_port?: number;
  stream_type?: 'main' | 'sub';
  username?: string;
  /** `env:NAME` or `file:/path`. `literal:` is refused by the server. */
  credential_ref?: string;
  analysis_fps?: number;
  analysis_enabled?: boolean;
  purpose?: string;
}

export interface ConnectionTest {
  reachable: boolean;
  outcome: string;
  detail: string;
  elapsed_ms: number;
  /** What the test does and does not prove. Shown verbatim; see below. */
  proves: string;
  host: string;
  rtsp_port: number;
}

export const camerasApi = {
  list: () => api.get<CameraList>('/cameras'),
  /** Creates it **disabled**. Enabling is a separate call, deliberately. */
  create: (draft: CameraDraft) => api.post<Camera>('/cameras', draft),
  update: (key: string, changes: Partial<CameraDraft>) =>
    api.patch<Camera>(`/cameras/${encodeURIComponent(key)}`, changes),
  setEnabled: (key: string, enabled: boolean) =>
    api.patch<Camera>(`/cameras/${encodeURIComponent(key)}`, { enabled }),
  setAnalysis: (key: string, analysisEnabled: boolean) =>
    api.patch<Camera>(`/cameras/${encodeURIComponent(key)}`, {
      analysis_enabled: analysisEnabled,
    }),
  /** Retire. Destroys the observation partition — `retire_cameras`, not
      `manage_cameras`, and never without an explicit confirmation. */
  retire: (key: string) =>
    api.del<{ camera_key: string; observations_removed: number }>(
      `/cameras/${encodeURIComponent(key)}`,
    ),
  /**
   * Is anything listening at this address?
   *
   * Pass `camera_key` for a saved camera (the address comes from the database
   * and the caller cannot choose it), or `host`/`rtsp_port` for the onboarding
   * wizard, which needs to check before the row exists.
   */
  testConnection: (probe: { camera_key?: string; host?: string; rtsp_port?: number }) =>
    api.post<ConnectionTest>('/cameras/test-connection', probe),
};

/* ── incidents ────────────────────────────────────────────────────────────── */

export type IncidentStatus = 'active' | 'acknowledged' | 'resolved';

export interface Incident {
  id: string;
  status: IncidentStatus;
  severity: string;
  summary: string;
  rule_id: string;
  ruleset_version: string;
  restaurant_id: string | null;
  zone_id: string | null;
  camera_key: string;
  observed_at: string | null;
  created_at: string | null;
  object_id: string;
  track_id: string;
  /** The **frozen** finding, as it stood. Never recomputed against today's rules. */
  finding: Record<string, unknown>;
  /** Handles, never images. Fetching one is a separate, audited act. */
  evidence_refs: string[];
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  /** `observation` — the system saw it fixed. `operator` — a person said so. */
  resolution_kind: 'observation' | 'operator' | null;
  resolution_note: string | null;
}

export const incidentsApi = {
  list: (status?: IncidentStatus) =>
    api.get<{ incidents: Incident[]; count: number }>(
      status ? `/incidents?status=${status}` : '/incidents',
    ),
  get: (id: string) => api.get<Incident>(`/incidents/${encodeURIComponent(id)}`),
  acknowledge: (id: string) =>
    api.post<Incident>(`/incidents/${encodeURIComponent(id)}/acknowledge`, undefined),
  /** The reason is required by the backend and is what makes the call reviewable. */
  resolve: (id: string, note: string) =>
    api.post<Incident>(`/incidents/${encodeURIComponent(id)}/resolve`, { note }),
};

/* ── evidence ─────────────────────────────────────────────────────────────── */

export type EvidenceState = 'retained' | 'expired' | 'deleted';

/**
 * One object inside a stored frame, as the backend recorded it at capture.
 *
 * `box` is normalized `[x1, y1, x2, y2]` in the **source frame**, before the
 * crop strategy's padding — so it is the right rectangle to draw over the full
 * image, and the crop it names shows slightly more than it.
 */
export interface EvidenceObject {
  object_id: string;
  class: string;
  /** `Person #2`. Presentation only; `object_id` is the identity. */
  label: string;
  box: [number, number, number, number];
  /** True for the one object whose verdict raised this alert. */
  is_subject: boolean;
  sent_to_model: boolean;
  /** Handle for this object's decision crop, or `''` if none was retained. */
  crop_ref?: string;
}

/**
 * Where the subject is in a stored frame.
 *
 * Absent (`null`) whenever the frame is a fallback context frame rather than
 * the decision frame — there is then no subject geometry to be had, and the UI
 * must draw nothing rather than guess.
 */
export interface EvidenceGeometry {
  kind: 'decision-frame' | 'decision-crop';
  frame?: { frame_ref: string; width: number; height: number };
  subject?: EvidenceObject;
  context?: EvidenceObject[];
}

export interface Evidence {
  evidence_ref: string;
  geometry: EvidenceGeometry | null;
  camera_key: string;
  frame_ref: string;
  object_id: string;
  observation_id: string;
  captured_at: string | null;
  created_at: string | null;
  purpose: string;
  state: EvidenceState;
  /** False for expired or deleted. The image endpoint refuses both. */
  servable: boolean;
  expires_at: string | null;
  content_hash: string;
  size_bytes: number;
  media_type: string;
  deleted_at: string | null;
  deleted_by: string | null;
  deletion_reason: string | null;
}

export const evidenceApi = {
  metadata: (ref: string) => api.get<Evidence>(`/evidence/${encodeURIComponent(ref)}`),
  /**
   * The imagery itself, as an object URL the caller must revoke.
   *
   * Fetched rather than put in `<img src>` because retrieval requires an
   * Authorization header, and because every call leaves an audit row on the
   * server — so an image must never load as a side effect of rendering a list.
   * A screen shows this only when the manager asks for it.
   */
  image: async (ref: string): Promise<string> => {
    // `authorizedFetch`, not a bare `fetch`. This used to call `fetch` with a
    // hand-attached header, which meant it was the one authorized path in the
    // application with **no refresh retry**: an access token that expired while
    // an operator had the alert queue open turned "show me the picture" into
    // `evidence image unavailable (401)` until they reloaded. A gallery makes
    // several of these calls per alert, so the odds of catching the expiry were
    // about to get worse, not better.
    const response = await authorizedFetch(
      `/evidence/${encodeURIComponent(ref)}/image`,
    );
    if (!response.ok) {
      throw new Error(`evidence image unavailable (${response.status})`);
    }
    return URL.createObjectURL(await response.blob());
  },
  /** Erases the bytes and leaves a tombstone. The reason is mandatory. */
  remove: (ref: string, reason: string) =>
    api.del<Evidence>(`/evidence/${encodeURIComponent(ref)}`, { reason }),
};

/* ── frames ───────────────────────────────────────────────────────────────── */

export interface FrameRecord {
  frame_ref: string;
  camera_key: string;
  sequence: number;
  epoch: number;
  /** When the camera saw it. The clock that matters for a finding. */
  captured_at: string | null;
  /** When this process received it. Lag between the two is queue delay. */
  received_at: string | null;
  width: number;
  height: number;
  observation_count: number;
  source_kind: 'live' | 'replay';
}

export const framesApi = {
  forCamera: (key: string, limit = 100) =>
    api.get<{ camera_key: string; frames: FrameRecord[]; count: number }>(
      `/cameras/${encodeURIComponent(key)}/frames?limit=${limit}`,
    ),
};

/* ── audit ────────────────────────────────────────────────────────────────── */

export interface AuditEvent {
  id: string;
  actor: string;
  actor_roles: string[];
  action: string;
  resource_type: string;
  resource_id: string;
  outcome: 'success' | 'denied' | 'failed';
  occurred_at: string | null;
  request_id: string;
  detail: Record<string, unknown>;
}

export const auditApi = {
  list: (limit = 100) =>
    api.get<{ events: AuditEvent[]; count: number }>(`/audit?limit=${limit}`),
  forResource: (type: string, id: string) =>
    api.get<{ events: AuditEvent[]; count: number }>(
      `/audit?resource_type=${encodeURIComponent(type)}&resource_id=${encodeURIComponent(id)}`,
    ),
};

/** Human labels for audit actions. The only place an action becomes display text. */
export const AUDIT_LABELS: Record<string, string> = {
  'auth.login': 'Signed in',
  'auth.logout': 'Signed out',
  'auth.login_failed': 'Sign-in failed',
  'camera.created': 'Camera added',
  'camera.updated': 'Camera updated',
  'camera.enabled': 'Camera enabled',
  'camera.disabled': 'Camera disabled',
  'incident.created': 'Incident raised',
  'incident.acknowledged': 'Incident acknowledged',
  'incident.resolved': 'Incident resolved',
  'evidence.read': 'Evidence viewed',
  'evidence.created': 'Evidence retained',
  'evidence.expired': 'Evidence expired',
  'evidence.deleted': 'Evidence erased',
  'evidence.denied': 'Evidence refused',
  'policy.changed': 'Policy changed',
  'admin.changed': 'Administration changed',
};

export function auditLabel(action: string): string {
  return AUDIT_LABELS[action] ?? action;
}

/**
 * Whether an audit row records access to imagery of an identifiable person.
 *
 * Used to mark those rows visually. They are the ones a privacy review asks
 * for, and they should not have to be picked out of a list by eye.
 */
export function isImageryAccess(event: AuditEvent): boolean {
  return event.action === 'evidence.read' || event.action === 'evidence.denied';
}

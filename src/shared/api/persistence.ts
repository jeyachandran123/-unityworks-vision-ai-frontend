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

import { api } from './client';

/* ── cameras ──────────────────────────────────────────────────────────────── */

export interface Camera {
  camera_key: string;
  name: string;
  purpose: string;
  restaurant_id: string;
  zone_id: string | null;
  channel: number;
  stream_type: 'main' | 'sub';
  host: string;
  rtsp_port: number;
  username: string;
  /** A pointer such as `env:CCTV_PASSWORD`. Never a password. */
  credential_ref: string;
  credential_configured: boolean;
  analysis_fps: number;
  enabled: boolean;
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
  host?: string;
  rtsp_port?: number;
  stream_type?: 'main' | 'sub';
  username?: string;
  credential_ref?: string;
  analysis_fps?: number;
  purpose?: string;
}

export const camerasApi = {
  list: () => api.get<CameraList>('/cameras'),
  /** Creates it **disabled**. Enabling is a separate call, deliberately. */
  create: (draft: CameraDraft) => api.post<Camera>('/cameras', draft),
  update: (key: string, changes: Partial<CameraDraft>) =>
    api.patch<Camera>(`/cameras/${encodeURIComponent(key)}`, changes),
  setEnabled: (key: string, enabled: boolean) =>
    api.patch<Camera>(`/cameras/${encodeURIComponent(key)}`, { enabled }),
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

export interface Evidence {
  evidence_ref: string;
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

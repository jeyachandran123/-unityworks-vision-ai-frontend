/**
 * Domain services — the only functions that name a URL.
 *
 * One service per backend contract that actually exists. There is no
 * `incidentsApi` or `camerasApi` here, because those endpoints do not exist yet
 * and a service for an imaginary route is a type nobody can verify.
 *
 * Response shapes are the generated OpenAPI types wherever the generator
 * produced something useful. Where the backend returns a free-form dict, the
 * shape is declared here **once** and imported everywhere — never duplicated
 * per component.
 */

import { api } from './client';

/* ── auth ─────────────────────────────────────────────────────────────────── */

export interface CameraScope {
  breadth: 'none' | 'listed' | 'all_in_tenant';
  camera_ids: string[];
}

export interface Identity {
  subject: string;
  display_name: string;
  tenant_id: string;
  roles: string[];
  permissions: string[];
  camera_scope: CameraScope;
  site_ids: string[];
}

export interface Session {
  access_token: string;
  token_type: string;
  expires_at: string;
  user?: Identity;
}

export const authApi = {
  /** The refresh token is set as an httpOnly cookie; it is never in this body. */
  login: (email: string, password: string) =>
    api.post<Session>('/auth/login', { email, password }, { anonymous: true }),

  /** Reads the refresh cookie. Sends no body, receives no refresh token. */
  refresh: () => api.post<Session>('/auth/refresh', undefined, { anonymous: true }),

  logout: () => api.post<{ ok: boolean }>('/auth/logout', undefined, { anonymous: true }),

  me: () => api.get<Identity>('/auth/me'),
};

/* ── health & status ──────────────────────────────────────────────────────── */

export type CameraHealth = 'connecting' | 'online' | 'degraded' | 'offline' | 'error';
export type SourceKind = 'live' | 'replay';

export interface CameraSignal {
  camera_id: string;
  health: CameraHealth;
  kind: SourceKind;
}

export interface RuntimeSummary {
  enabled: boolean;
  reason: string;
  active_sessions: number;
  streaming_sessions: number;
  /** Derived from sessions that received a genuine frame. Never asserted. */
  streaming: boolean;
}

export interface OperatorStatus {
  service: { ok: boolean };
  vision_os: VisionStatus;
  tenant_id: string;
  cameras: {
    configured: number;
    sessions: number;
    streaming: number;
    health: CameraSignal[];
  };
  live_runtime: RuntimeSummary;
  /** Signals the backend deliberately does not report yet. Rendered, not hidden. */
  not_yet_reported: string[];
}

export const healthApi = {
  status: () => api.get<OperatorStatus>('/status'),
};

/* ── devtools ─────────────────────────────────────────────────────────────── */

export interface VisionStatus {
  assembled: boolean;
  reason: string;
  attributes: string[];
  policies: string[];
}

export interface VisionDiagnostics extends VisionStatus {
  imagery: { serve_frames: boolean; allow_evidence: boolean };
}

export interface FixtureSession {
  session_id: string;
  kind: string;
  camera_id: string;
  tenant_id: string;
  observation_count: number;
  note: string;
}

export interface Capabilities {
  kind: string;
  taxonomy_version: string;
  producible_classes: string[];
  producible_attributes: string[];
}

export interface AttributeView {
  key: string;
  value: string;
  observed_at: number | null;
  valid_until: number | null;
  confidence: { value: number; semantics: string; calibrated: boolean } | null;
}

export interface ObjectView {
  object_id: string;
  camera_id: string;
  class_id: string;
  lifecycle: string;
  first_seen: number | null;
  last_seen: number | null;
  observation_count: number;
  attributes: AttributeView[];
}

export interface VisionStateView {
  kind: string;
  session_id: string;
  observation_count: number;
  complete: boolean;
  partitions: Array<{ camera_id: string; object_count: number }>;
  objects: ObjectView[];
}

export interface EvidenceView {
  kind: string;
  blob_ref: string;
  available: boolean;
  reason: string;
}

export interface QueueStats {
  capacity: number;
  depth: number;
  high_water: number;
  accepted: number;
  dropped_total: number;
  dropped_queue_full: number;
  dropped_sampled: number;
  dropped_shutdown: number;
}

export interface SourceStatusView {
  camera_id: string;
  kind: SourceKind;
  state: string;
  health: CameraHealth;
  /** Redacted: rtsp://***:***@host:554/... A credential never reaches here. */
  uri: string;
  epoch: number;
  frames_produced: number;
  reconnects: number;
  errors: number;
  last_error: string;
  producing: boolean;
  stale: boolean;
  transitions: Array<{ at_ns: number; from: string; to: string; reason: string }>;
}

export interface LiveSessionView {
  session_id: string;
  kind: SourceKind;
  camera_id: string;
  tenant_id: string;
  state: string;
  streaming: boolean;
  seekable: boolean;
  bounded: boolean;
  analysis_fps: number;
  error: string;
  source: SourceStatusView;
  queue: QueueStats;
  stats: {
    frames_received: number;
    frames_processed: number;
    frames_dropped: number;
    processing_errors: number;
    mean_processing_ms: number;
  };
}

export interface LiveRuntimeView {
  runtime: RuntimeSummary;
  sessions: LiveSessionView[];
  cameras_configured: Array<{
    camera_id: string;
    uri: string;
    channel: number;
    stream_type: string;
    analysis_fps: number;
    credential_configured: boolean;
  }>;
  backpressure: { policy: string; rationale: string };
}

export const devtoolsApi = {
  live: () => api.get<LiveRuntimeView>('/devtools/live'),
  vision: () => api.get<VisionDiagnostics>('/devtools/vision'),
  sessions: () => api.get<{ sessions: FixtureSession[] }>('/devtools/sessions'),
  capabilities: () => api.get<Capabilities>('/devtools/capabilities'),
  state: () => api.get<VisionStateView>('/devtools/state'),
  evidence: (blobRef: string) =>
    api.get<EvidenceView>(`/devtools/evidence/${encodeURIComponent(blobRef)}`),
};

/**
 * Whether a payload came from the fixture rather than a live source.
 *
 * Checked wherever DevTools renders platform data, so nothing can mistake a
 * fixture for live observation. §16: never call a fixture source "LIVE".
 */
export function isFixture(payload: { kind?: string } | undefined | null): boolean {
  return payload?.kind === 'fixture';
}

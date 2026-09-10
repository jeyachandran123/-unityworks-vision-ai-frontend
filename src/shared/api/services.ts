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
  /** The **active** organization. Comes from the token, never from this app. */
  tenant_id: string;
  /**
   * `''` for an ordinary session; `'platform_operator'` for one reached by an
   * audited entry from the platform console.
   *
   * It grants nothing — the backend re-reads the operator grant on every
   * request — but the shell has to be able to *say* which kind of session this
   * is. Somebody looking at a customer's kitchen must be able to tell whose
   * authority they are doing it under without having to work it out.
   */
  acting_as: '' | 'platform_operator';
  roles: string[];
  permissions: string[];
  camera_scope: CameraScope;
  site_ids: string[];
}

/**
 * One organization, as the chooser needs it.
 *
 * Enough to recognise a customer and go in, and no more. This is deliberately
 * not `platform.Organization`: that type serves the operator's *lifecycle*
 * console and carries `running_cameras`, `status_reason` and `user_count`,
 * none of which a member choosing between their own two organizations has any
 * business reading.
 */
export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'archived';
  site_count: number;
  camera_count: number;
}

export interface Session {
  access_token: string;
  token_type: string;
  expires_at: string;
  user?: Identity;
  /** Login only: every organization this account may enter. */
  organizations?: OrganizationSummary[];
  /**
   * Login only, and the whole of the routing decision — **answered by the
   * server**.
   *
   * Not derivable from `organizations.length` on this side: a platform
   * operator is owed the chooser even when their own account belongs to one
   * organization, because the organizations they administer are not the ones
   * they are a member of.
   */
  must_select?: boolean;
  is_platform_operator?: boolean;
}

export interface AccessibleOrganizations {
  organizations: OrganizationSummary[];
  /** The organization this session is currently in. */
  active: string;
  acting_as: '' | 'platform_operator';
  /**
   * Reported here rather than probed with `GET /platform/me`, whose answer for
   * an ordinary account is a 403 — a console error on every page load is a poor
   * way to ask a yes/no question, and the session restore needs this answer at
   * the same moment it needs the list.
   */
  is_platform_operator: boolean;
}

export const authApi = {
  /** The refresh token is set as an httpOnly cookie; it is never in this body. */
  login: (email: string, password: string) =>
    api.post<Session>('/auth/login', { email, password }, { anonymous: true }),

  /** Reads the refresh cookie. Sends no body, receives no refresh token. */
  refresh: () => api.post<Session>('/auth/refresh', undefined, { anonymous: true }),

  logout: () => api.post<{ ok: boolean }>('/auth/logout', undefined, { anonymous: true }),

  me: () => api.get<Identity>('/auth/me'),

  /** The organizations this account may enter. Membership only. */
  organizations: () => api.get<AccessibleOrganizations>('/auth/organizations'),

  /**
   * Move this session into another of the caller's organizations.
   *
   * Returns a **new access token** whose tenant is the selected organization,
   * and rotates the refresh cookie to match. The organization is never sent on
   * subsequent requests — it is carried by the token, which is why switching is
   * an endpoint rather than a piece of client state.
   *
   * A 403 means no membership, and is the correct answer rather than an error
   * to report: the id was not one of theirs.
   */
  selectOrganization: (id: string) =>
    api.post<Session>(`/auth/organizations/${encodeURIComponent(id)}/select`),
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
  /** Camera rows in the durable store — what a restart would restore. */
  cameras_registered: number;
  cameras_enabled: number;
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

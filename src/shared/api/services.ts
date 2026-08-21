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

export interface OperatorStatus {
  service: { ok: boolean };
  vision_os: VisionStatus;
  tenant_id: string;
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

export const devtoolsApi = {
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

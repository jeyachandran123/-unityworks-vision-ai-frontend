/**
 * The platform-operator surface: organizations, and their lifecycle.
 *
 * A separate client from every other one here because it answers to a
 * separate principal. Tenant routes authorise on a `Permission` carried by an
 * `AccessDecision`; these authorise on a `PlatformOperator`, which no role can
 * produce and which has no tenant at all. That is not a naming convention —
 * it is the boundary that stops an organisation administrator becoming a
 * cross-customer superuser by acquiring a role.
 *
 * Which means `isOperator()` is the only correct way to decide whether to show
 * the platform surface. There is no permission to check for, deliberately.
 */

import { api } from './client';

export type OrganizationStatus = 'active' | 'suspended' | 'archived';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  /** When the status last changed. Null when it never has. */
  status_changed_at: string | null;
  /** Why. Required by the server for suspension and archival. */
  status_reason: string;
  created_at: string | null;
  site_count: number;
  camera_count: number;
  user_count: number;
  /**
   * How many of this organisation's cameras the runtime is *actually*
   * streaming, read from the live registry rather than from configuration. An
   * operator looking at a suspended customer needs to see that the cameras
   * have in fact stopped, not that the status field says they ought to have.
   */
  running_cameras: number;
  /** Present only in a status-change response. */
  cameras_stopped?: number;
  /** Present when restoring to active: sessions are not restarted here. */
  note?: string;
}

export interface OrganizationList {
  organizations: Organization[];
  count: number;
  total: number;
  limit: number;
  offset: number;
}

export interface OperatorIdentity {
  subject: string;
  display_name: string;
  is_platform_operator: true;
}

export interface OrganizationQuery {
  q?: string;
  status?: OrganizationStatus;
  limit?: number;
  offset?: number;
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

export const platformApi = {
  /**
   * Am I a platform operator?
   *
   * Rejects with a 403 when not, which is the answer rather than an error —
   * callers should treat a failure as "no" and hide the surface. It exists so
   * the frontend can decide without probing a real route and reading its
   * refusal.
   */
  me: () => api.get<OperatorIdentity>('/platform/me'),

  organizations: (params: OrganizationQuery = {}) =>
    api.get<OrganizationList>(`/platform/organizations${query({ ...params })}`),

  organization: (id: string) =>
    api.get<Organization>(`/platform/organizations/${encodeURIComponent(id)}`),

  create: (draft: { name: string; slug?: string }) =>
    api.post<Organization>('/platform/organizations', draft),

  rename: (id: string, name: string) =>
    api.patch<Organization>(`/platform/organizations/${encodeURIComponent(id)}`, { name }),

  /**
   * Move an organisation through its lifecycle.
   *
   * `reason` is required by the server for `suspended` and `archived`. It is
   * not paperwork: the change stops a paying customer's product working, and
   * the explanation is only reliably known at the moment of the act.
   */
  setStatus: (id: string, status: OrganizationStatus, reason: string) =>
    api.put<Organization>(`/platform/organizations/${encodeURIComponent(id)}/status`, {
      status,
      reason,
    }),
};

/** What each status means, in the words the console should use. */
export const STATUS_MEANING: Record<OrganizationStatus, string> = {
  active: 'Everything works. Cameras run, users sign in, writes are accepted.',
  suspended:
    'People can still sign in and read. Changes are refused and cameras are stopped. Reversible.',
  archived: 'Nobody can sign in. Cameras are stopped. Data is retained, nothing is deleted.',
};

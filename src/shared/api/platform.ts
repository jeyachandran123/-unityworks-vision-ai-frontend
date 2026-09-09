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

export interface OperatorEntry {
  access_token: string;
  token_type: string;
  expires_at: string;
  organization: Organization;
  acting_as: 'platform_operator';
  read_only: true;
  /** The reach granted, as the server enumerated it. Reads only. */
  permissions: string[];
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
   * Enter an organisation as a platform operator.
   *
   * Not a navigation — an act. It writes an audit row against the customer and
   * returns a **new access token** whose tenant is that organisation, carrying
   * `act: platform_operator`. Everything reachable with it is read-only, and
   * evidence, patron identity and the audit trail are excluded outright.
   *
   * Refused for an archived organisation: nobody may sign in to one, and
   * platform authority does not exempt this session from that.
   */
  enter: (id: string) =>
    api.post<OperatorEntry>(`/platform/organizations/${encodeURIComponent(id)}/enter`),

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

/* ── the control plane ────────────────────────────────────────────────────── */

/**
 * One organisation a person may enter, from the platform's point of view.
 *
 * `is_home` is not the same question as membership and must never be rendered
 * as if it were: the home organisation is where the account *lives* — it owns
 * email uniqueness and is where a failed login is filed — while membership is
 * what they may actually enter. For most accounts the two agree; the moment
 * they stop agreeing is exactly when somebody needs to see both.
 */
export interface PersonMembership {
  organization_id: string;
  organization_name: string;
  /** Roles held *in that organisation*. Never merged across organisations. */
  roles: string[];
  is_home: boolean;
  granted_at: string | null;
  granted_by: string;
}

export interface Person {
  id: string;
  email: string;
  display_name: string;
  is_active: boolean;
  home_organization_id: string;
  home_organization_name: string;
  memberships: PersonMembership[];
  organization_count: number;
  last_login_at: string | null;
  is_platform_operator: boolean;
  /** The account is filed in an organisation it can no longer enter. */
  home_membership_missing: boolean;
}

export interface PeopleList {
  people: Person[];
  count: number;
  total: number;
  limit: number;
  offset: number;
}

export interface PlatformOverview {
  organizations: { total: number; active: number; suspended: number; archived: number };
  estate: { sites: number; cameras: number; cameras_running: number };
  people: {
    users: number;
    active_users: number;
    multi_organization_users: number;
    never_signed_in: number;
    platform_operators: number;
  };
  attention: {
    organizations_needing_setup: Array<{
      id: string;
      name: string;
      site_count: number;
      camera_count: number;
    }>;
  };
  recent_activity: Array<{
    id: string;
    action: string;
    organization_id: string;
    actor: string;
    resource_id: string;
    outcome: string;
    occurred_at: string | null;
  }>;
}

export interface OperatorRow {
  user_id: string;
  email: string;
  display_name: string;
  is_active: boolean;
  home_organization_id: string;
  home_organization_name: string;
  granted_at: string | null;
  granted_by: string;
  reason: string;
  last_login_at: string | null;
}

export interface OperatorList {
  operators: OperatorRow[];
  count: number;
  /** The server's own statement that granting is not done here. */
  grant_is_manageable_here: false;
  how_to_grant: string;
}

export interface RolePolicy {
  roles: Array<{
    role: string;
    permissions: string[];
    permission_count: number;
    is_platform_role: boolean;
  }>;
  permissions: string[];
  /**
   * Always `false` today. `ROLE_PERMISSIONS` is a Python constant with no table
   * behind it, so the console must not offer an edit the server would refuse.
   */
  editable: boolean;
  customization: { mechanism: string; scope: string; where: string; note: string };
}

export interface MembershipRemoval {
  organization_id: string;
  user_id: string;
  email: string;
  removed: boolean;
  was_home_organization: boolean;
  organizations_remaining: number;
  /** The account can no longer sign in anywhere. Offboarding looks like this. */
  left_without_access: boolean;
}

export const platformAdminApi = {
  overview: () => api.get<PlatformOverview>('/platform/overview'),

  people: (params: { q?: string; organization_id?: string; limit?: number; offset?: number } = {}) =>
    api.get<PeopleList>(`/platform/people${query({ ...params })}`),

  person: (userId: string) => api.get<Person>(`/platform/people/${encodeURIComponent(userId)}`),

  members: (organizationId: string) =>
    api.get<{ organization_id: string; members: Person[]; count: number }>(
      `/platform/organizations/${encodeURIComponent(organizationId)}/members`,
    ),

  /**
   * Admit an existing account to an organisation.
   *
   * Writes one membership row and grants no role — the person may then sign in
   * and, until somebody grants them a role *there*, see nothing. Admitting and
   * authorising are two decisions and this is only the first.
   */
  addMember: (organizationId: string, userId: string) =>
    api.post<Person>(`/platform/organizations/${encodeURIComponent(organizationId)}/members`, {
      user_id: userId,
    }),

  /** Takes effect on the person's next request, not their next login. */
  removeMember: (organizationId: string, userId: string) =>
    api.del<MembershipRemoval>(
      `/platform/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}`,
    ),

  operators: () => api.get<OperatorList>('/platform/operators'),

  roles: () => api.get<RolePolicy>('/platform/roles'),
};

/** What each status means, in the words the console should use. */
export const STATUS_MEANING: Record<OrganizationStatus, string> = {
  active: 'Everything works. Cameras run, users sign in, writes are accepted.',
  suspended:
    'People can still sign in and read. Changes are refused and cameras are stopped. Reversible.',
  archived: 'Nobody can sign in. Cameras are stopped. Data is retained, nothing is deleted.',
};

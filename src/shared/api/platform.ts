/**
 * The platform-operator surface: organizations, and their lifecycle.
 *
 * A separate client from every other one here because it answers to a
 * separate principal. Tenant routes authorise on a `Permission` carried by an
 * `AccessDecision`; these authorise on a `PlatformOperator`, which no role can
 * produce and which has no tenant at all. That is not a naming convention —
 * it is the boundary that stops an organization administrator becoming a
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
  zone_count: number;
  camera_count: number;
  user_count: number;
  /**
   * How many of this organization's cameras the runtime is *actually*
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
  /** `false`: the Platform Admin has full access inside any organization he
      enters. Kept on the wire because older entries were read-only. */
  read_only: boolean;
  /** The reach granted, as the server enumerated it. Every permission, less
      the writes a suspended organization refuses to anyone. */
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
   * Enter an organization as a platform operator.
   *
   * Not a navigation — an act. It writes an audit row against the customer and
   * returns a **new access token** whose tenant is that organization, carrying
   * `act: platform_operator`. It carries full access: the Platform Admin can do
   * anything inside any organization, and every entry is recorded.
   *
   * Refused for an archived organization: nobody may sign in to one, and
   * platform authority does not exempt this session from that.
   */
  enter: (id: string) =>
    api.post<OperatorEntry>(`/platform/organizations/${encodeURIComponent(id)}/enter`),

  /**
   * Move an organization through its lifecycle.
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
 * One organization a person may enter, from the platform's point of view.
 *
 * `is_home` is not the same question as membership and must never be rendered
 * as if it were: the home organization is where the account *lives* — it owns
 * email uniqueness and is where a failed login is filed — while membership is
 * what they may actually enter. For most accounts the two agree; the moment
 * they stop agreeing is exactly when somebody needs to see both.
 */
export interface PersonMembership {
  organization_id: string;
  organization_name: string;
  /** Roles held *in that organization*. Never merged across organizations. */
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
  /** `null` for the Platform Admin, who belongs to no organization. */
  home_organization_id: string | null;
  home_organization_name: string;
  memberships: PersonMembership[];
  organization_count: number;
  last_login_at: string | null;
  is_platform_operator: boolean;
  /** The account is filed in an organization it can no longer enter. */
  home_membership_missing: boolean;
}

export interface PeopleList {
  people: Person[];
  count: number;
  total: number;
  limit: number;
  offset: number;
}

/** Every stream the wall holds, by state: `live`, `connecting`, `reconnecting`, `offline`, `error`, `disabled`. */
export type StreamStates = Record<string, number>;

/** One customer on one line: what it has, who can run it, and whether it is live. */
export interface FleetRow {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  created_at: string | null;
  zones: number;
  cameras: number;
  /** Cameras switched on. The denominator `cameras_live` is a share of. */
  cameras_enabled: number;
  /** Read from the runtime: a frame arrived in the last few seconds. */
  cameras_live: number;
  stream_states: StreamStates;
  members: number;
  /** Active members holding Organization Admin there. Zero means nobody can administer it. */
  admins: number;
  last_sign_in_at: string | null;
}

/** What an act changed, summarised by the server from a whitelist. Never the raw detail. */
export interface ActivityChange {
  from?: string;
  to?: string;
  reason?: string;
  role?: string | null;
  added?: number;
  removed?: number;
  fields?: string[];
}

export interface ActivityRow {
  id: string;
  action: string;
  organization_id: string;
  organization_name: string;
  actor: string;
  resource_id: string;
  /** The person the act was about, when it was about a person. */
  subject: string | null;
  outcome: string;
  change: ActivityChange | null;
  occurred_at: string | null;
}

export interface ActivityDay {
  /** `YYYY-MM-DD`, in the reader's own day. */
  date: string;
  total: number;
  refused: number;
}

export interface PlatformOverview {
  generated_at: string;
  organizations: {
    total: number;
    active: number;
    suspended: number;
    archived: number;
    new_30d: number;
  };
  estate: {
    zones: number;
    cameras: number;
    cameras_enabled: number;
    /** Every stream the wall holds, whatever its state. */
    cameras_running: number;
    cameras_live: number;
    stream_states: StreamStates;
  };
  people: {
    users: number;
    active_users: number;
    disabled_users: number;
    multi_organization_users: number;
    never_signed_in: number;
    signed_in_24h: number;
    signed_in_7d: number;
    signed_in_30d: number;
    /** Accounts with a password and no organization to enter. */
    without_membership: number;
    platform_operators: number;
  };
  fleet: FleetRow[];
  attention: {
    organizations_needing_setup: Array<{
      id: string;
      name: string;
      zone_count: number;
      camera_count: number;
    }>;
    organizations_without_admin: Array<{ id: string; name: string }>;
    organizations_not_live: Array<{ id: string; name: string; cameras_enabled: number }>;
    refused_changes_7d: number;
  };
  activity: {
    utc_offset: number;
    /** Oldest first, fourteen of them. */
    days: ActivityDay[];
    last_7d: number;
    previous_7d: number;
  };
  recent_activity: ActivityRow[];
}

export interface OperatorRow {
  user_id: string;
  email: string;
  display_name: string;
  is_active: boolean;
  /** `null`: a Platform Admin belongs to no organization. */
  home_organization_id: string | null;
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

export interface NewOrganizationAdmin {
  email: string;
  display_name: string;
  password: string;
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

/* ── the access matrix ────────────────────────────────────────────────────── */

export type CameraBreadth = 'none' | 'listed' | 'all_in_tenant';

/**
 * What one person may do in one organization, as the access matrix reads it.
 *
 * `permissions` is what the grid shows — `(role ∪ grants) − revokes`.
 * `effective` is what the person actually has on their next request; the two
 * differ only in a suspended organization, whose writes wait for it to be
 * restored. For an organization the person is not in, both are empty.
 */
export interface OrganizationAccess {
  organization_id: string;
  organization_name: string;
  status: OrganizationStatus;
  is_member: boolean;
  is_home: boolean;
  /** The template role the grid starts from. `null` when none is held. */
  role: string | null;
  /** Every role held there — more than one only for older accounts. */
  roles: string[];
  permissions: string[];
  effective: string[];
  camera_scope: { breadth: CameraBreadth; camera_keys: string[]; site_ids: string[] };
}

export interface PersonAccess {
  user_id: string;
  email: string;
  display_name: string;
  is_platform_operator: boolean;
  home_organization_id: string | null;
  /** Every organization on the platform, sorted by name. */
  organizations: OrganizationAccess[];
}

/**
 * One organization's worth of a change. The server makes the person's access
 * there exactly `permissions`, recorded against `role` as the template.
 * `camera_breadth` is omitted to leave camera access as it is — which is how a
 * list of specific cameras, chosen inside the organization, survives.
 *
 * `listed` with `camera_keys` is only ever sent from inside the organization,
 * which is the one place that can see its cameras to pick; the platform
 * console never produces it, and the platform route refuses it.
 */
export interface OrganizationAccessChange {
  organization_id: string;
  role: string | null;
  permissions: string[];
  camera_breadth?: CameraBreadth;
  camera_keys?: string[];
}

export interface NewPerson {
  email: string;
  display_name: string;
  password: string;
  home_organization_id: string;
  organizations: OrganizationAccessChange[];
}

export const platformAdminApi = {
  /**
   * The dashboard's counts. The reader's UTC offset decides where one day of the
   * activity chart ends, so a fortnight is cut at their midnight, not UTC's.
   */
  overview: (utcOffset: number = -new Date().getTimezoneOffset()) =>
    api.get<PlatformOverview>(`/platform/overview${query({ utc_offset: utcOffset })}`),

  people: (params: { q?: string; organization_id?: string; limit?: number; offset?: number } = {}) =>
    api.get<PeopleList>(`/platform/people${query({ ...params })}`),

  person: (userId: string) => api.get<Person>(`/platform/people/${encodeURIComponent(userId)}`),

  members: (organizationId: string) =>
    api.get<{ organization_id: string; members: Person[]; count: number }>(
      `/platform/organizations/${encodeURIComponent(organizationId)}/members`,
    ),

  /**
   * Admit an existing account to an organization.
   *
   * With `role: 'org_admin'` the person also becomes that organization's
   * Organization Admin, with every camera, in the same step — which is how one
   * Organization Admin comes to hold several organizations. Without it, one
   * membership row and no role: they may sign in and see nothing.
   */
  addMember: (organizationId: string, userId: string, role?: 'org_admin') =>
    api.post<Person>(
      `/platform/organizations/${encodeURIComponent(organizationId)}/members`,
      role ? { user_id: userId, role } : { user_id: userId },
    ),

  /**
   * Create a new Organization Admin: account, membership, role and every camera,
   * in one step. The password must be at least 12 characters; a refusal
   * creates nothing.
   */
  createOrganizationAdmin: (organizationId: string, draft: NewOrganizationAdmin) =>
    api.post<Person>(
      `/platform/organizations/${encodeURIComponent(organizationId)}/people`,
      draft,
    ),

  /** Takes effect on the person's next request, not their next login. */
  removeMember: (organizationId: string, userId: string) =>
    api.del<MembershipRemoval>(
      `/platform/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}`,
    ),

  operators: () => api.get<OperatorList>('/platform/operators'),

  roles: () => api.get<RolePolicy>('/platform/roles'),

  /** A person's access in every organization — the access matrix's read. */
  personAccess: (userId: string) =>
    api.get<PersonAccess>(`/platform/people/${encodeURIComponent(userId)}/access`),

  /**
   * Set a person's access in the organizations named. One transaction: one
   * refused organization refuses them all. Joins an organization the person is
   * not in when its change asks for anything.
   */
  setPersonAccess: (userId: string, organizations: OrganizationAccessChange[]) =>
    api.put<PersonAccess>(`/platform/people/${encodeURIComponent(userId)}/access`, {
      organizations,
    }),

  /** Create a person and their access in one step. A refusal creates nothing. */
  createPerson: (draft: NewPerson) => api.post<PersonAccess>('/platform/people', draft),
};

/** What each status means, in the words the console should use. */
export const STATUS_MEANING: Record<OrganizationStatus, string> = {
  active: 'Everything works. Cameras run, users sign in, writes are accepted.',
  suspended:
    'People can still sign in and read. Changes are refused and cameras are stopped. Reversible.',
  archived: 'Nobody can sign in. Cameras are stopped. Data is retained, nothing is deleted.',
};

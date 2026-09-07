/**
 * Permissions and roles, as the backend defines them.
 *
 * **Nothing here decides access.** These constants exist so that route
 * definitions and navigation can be written against typed names instead of
 * scattered string literals — a typo in `'acess_devtools'` would otherwise fail
 * open, silently showing a link nobody should see.
 *
 * The facts come from `GET /auth/me`. The **enforcement** is on the backend,
 * on every route. A frontend guard is UX: it stops a user reaching a page that
 * would refuse them anyway. It is not a security boundary, and this application
 * is written on the assumption that anyone can bypass it.
 */

export const PERMISSIONS = {
  /** Organisation settings and lifecycle only. It is deliberately no longer
      the blanket write permission for sites and zones — those have their own
      keys below, which is what makes "may edit the estate" and "may
      reconfigure the organisation" separable. */
  manageOrganization: 'manage_organization',
  manageUsers: 'manage_users',
  /** The user roster, and nothing else. It historically also gated reading
      sites and zones, so holding it meant "may read every site" as a side
      effect of "may see who works here". */
  viewUsers: 'view_users',

  /* ── the physical estate ───────────────────────────────────────────
     Read and manage are separate per domain, which is what lets two people on
     the same role differ: one may edit the estate, the other may only look at
     it. */

  viewSites: 'view_sites',
  manageSites: 'manage_sites',
  viewZones: 'view_zones',
  manageZones: 'manage_zones',
  viewLive: 'view_live',
  viewObservations: 'view_observations',
  /** Never implied by `viewObservations`. A separate act, deliberately. */
  viewEvidence: 'view_evidence',
  viewCameraHealth: 'view_camera_health',

  /** Reading the camera list. Not the authority to change it. */
  viewCameras: 'view_cameras',
  /** Adding a camera, and — the consequential one — enabling it. */
  manageCameras: 'manage_cameras',
  /** Retiring one. Not a heavier edit: it closes an observation partition,
      which is the record a finding may later need to be defended with, and
      renaming the camera back does not undo it. */
  retireCameras: 'retire_cameras',

  viewIncidents: 'view_incidents',
  /** "Somebody has seen this." Does not close it. */
  acknowledgeIncidents: 'acknowledge_incidents',
  /** Closes a violation. Separate from acknowledging, deliberately. */
  resolveIncidents: 'resolve_incidents',

  /** Destroys a record that may be needed to defend a finding. Never implied. */
  deleteEvidence: 'delete_evidence',
  /** Who looked at imagery of whom. Its own privilege, not an admin side effect. */
  viewAudit: 'view_audit',

  /* ── modules with a schema and no data source yet ────────────────────────
     Declared here for the same reason as every other key: navigation and route
     guards must be written against typed names, and a typo in a permission
     string fails open. */

  viewPeopleCount: 'view_people_count',
  /** Never implied by `viewPeopleCount`. Counting people and inferring their
      age or gender are different purposes with different lawful bases. */
  viewDemography: 'view_demography',

  viewTableOccupancy: 'view_table_occupancy',
  /** The floor plan: which tables exist and which camera watches them. */
  manageTableOccupancy: 'manage_table_occupancy',

  viewCuttingBoard: 'view_cutting_board',
  /** The colour-to-ingredient policy. Changing it changes what is a violation. */
  manageCuttingBoard: 'manage_cutting_board',

  viewMealDetection: 'view_meal_detection',

  /** The most sensitive read in the product. Never implied by anything. */
  viewPatronId: 'view_patron_id',
  /** Held by super_admin alone, and even then the write path still refuses. */
  managePatronId: 'manage_patron_id',

  viewPosIntegration: 'view_pos_integration',
  /** Points a connector at a credential that reaches sales and payment data. */
  managePosIntegration: 'manage_pos_integration',

  /** Run a report on screen. Never grants the underlying data on its own —
      a report also requires the permission for every source it reads. */
  viewReports: 'view_reports',
  /** Take a copy away. Separate from viewing: an exported file leaves the
      system and outlives every retention policy this application enforces. */
  exportReports: 'export_reports',

  /** Model evaluation artifacts. Its own permission, not implied by
      `viewReports`: this answers "should we ship this model", and it is candid
      about the product's weaknesses in a way an operational report is not. */
  viewModelEvaluation: 'view_model_evaluation',

  accessDevtools: 'access_devtools',
  /** Spends money and causes computation. Not a read. */
  registerDemand: 'register_demand',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLES = {
  superAdmin: 'super_admin',
  orgAdmin: 'org_admin',
  restaurantManager: 'restaurant_manager',
  kitchenSupervisor: 'kitchen_supervisor',
  hygieneOfficer: 'hygiene_officer',
  auditor: 'auditor',
  developer: 'developer',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/** Human labels. The only place a role name becomes display text. */
export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  org_admin: 'Organisation Admin',
  restaurant_manager: 'Restaurant Manager',
  kitchen_supervisor: 'Kitchen Supervisor',
  hygiene_officer: 'Hygiene Officer',
  auditor: 'Auditor',
  developer: 'Developer',
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

export interface PermissionHolder {
  permissions: string[];
  roles: string[];
}

export function has(holder: PermissionHolder | null, permission: Permission): boolean {
  return holder?.permissions.includes(permission) ?? false;
}

export function hasAny(holder: PermissionHolder | null, permissions: Permission[]): boolean {
  if (permissions.length === 0) return true;
  return permissions.some((permission) => has(holder, permission));
}

export function hasAll(holder: PermissionHolder | null, permissions: Permission[]): boolean {
  return permissions.every((permission) => has(holder, permission));
}

export function hasRole(holder: PermissionHolder | null, role: Role): boolean {
  return holder?.roles.includes(role) ?? false;
}

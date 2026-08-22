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
  manageOrganization: 'manage_organization',
  manageUsers: 'manage_users',
  viewUsers: 'view_users',
  viewLive: 'view_live',
  viewObservations: 'view_observations',
  /** Never implied by `viewObservations`. A separate act, deliberately. */
  viewEvidence: 'view_evidence',
  viewCameraHealth: 'view_camera_health',

  /** Reading the camera list. Not the authority to change it. */
  viewCameras: 'view_cameras',
  /** Adding a camera, and — the consequential one — enabling it. */
  manageCameras: 'manage_cameras',

  viewIncidents: 'view_incidents',
  /** "Somebody has seen this." Does not close it. */
  acknowledgeIncidents: 'acknowledge_incidents',
  /** Closes a violation. Separate from acknowledging, deliberately. */
  resolveIncidents: 'resolve_incidents',

  /** Destroys a record that may be needed to defend a finding. Never implied. */
  deleteEvidence: 'delete_evidence',
  /** Who looked at imagery of whom. Its own privilege, not an admin side effect. */
  viewAudit: 'view_audit',

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

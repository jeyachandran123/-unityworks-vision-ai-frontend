/**
 * The access matrix's state — pure functions over one organization's draft.
 *
 * A draft is what the grid shows for one organization: the template role, the
 * ticked permissions, and the camera choice. Nothing here fetches or renders;
 * the matrix component calls these and the pages send `changesFrom(...)`.
 *
 * Shared cells need no code: Alerts and Staff Hygiene both read
 * `view_observations`, so toggling either changes the one key both display.
 */

import {
  columnPermissions,
  sectionPermissions,
  type AccessAction,
  type AccessSection,
} from '@app/permissions/access-catalog';
import type {
  CameraBreadth,
  Organization,
  OrganizationAccessChange,
  OrganizationStatus,
  PersonAccess,
  RolePolicy,
} from '@shared/api/platform';

export type CameraChoice = CameraBreadth;

export interface OrganizationDraft {
  organizationId: string;
  name: string;
  status: OrganizationStatus;
  isMember: boolean;
  role: string | null;
  /** Sorted and unique — the ticks. */
  permissions: string[];
  cameras: CameraChoice;
  /** How many specific cameras a `listed` grant names, for saying so. */
  listedCameras: number;
}

/** Role → its permissions, from `GET /platform/roles`. */
export type RolePermissions = Record<string, string[]>;

function normalise(list: Iterable<string>): string[] {
  return [...new Set(list)].sort();
}

export function draftsFrom(access: PersonAccess): OrganizationDraft[] {
  return access.organizations.map((o) => ({
    organizationId: o.organization_id,
    name: o.organization_name,
    status: o.status,
    isMember: o.is_member,
    role: o.role,
    permissions: normalise(o.permissions),
    cameras: o.camera_scope.breadth,
    listedCameras: o.camera_scope.camera_keys.length,
  }));
}

/** A new person: nothing anywhere, a member of the home organization only. */
export function blankDrafts(organizations: Organization[], homeId: string): OrganizationDraft[] {
  return [...organizations]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((o) => ({
      organizationId: o.id,
      name: o.name,
      status: o.status,
      isMember: o.id === homeId,
      role: null,
      permissions: [],
      cameras: 'none' as const,
      listedCameras: 0,
    }));
}

export function rolePermissionsFrom(roles: RolePolicy['roles']): RolePermissions {
  return Object.fromEntries(roles.map((r) => [r.role, r.permissions]));
}

export function has(draft: OrganizationDraft, permission: string): boolean {
  return draft.permissions.includes(permission);
}

export function togglePermission(draft: OrganizationDraft, permission: string): OrganizationDraft {
  return {
    ...draft,
    permissions: has(draft, permission)
      ? draft.permissions.filter((p) => p !== permission)
      : normalise([...draft.permissions, permission]),
  };
}

export type ColumnState = 'all' | 'some' | 'none' | 'empty';

export function columnState(
  draft: OrganizationDraft,
  section: AccessSection,
  action: AccessAction,
): ColumnState {
  const cells = columnPermissions(section, action);
  if (cells.length === 0) return 'empty';
  const on = cells.filter((p) => has(draft, p)).length;
  if (on === cells.length) return 'all';
  return on === 0 ? 'none' : 'some';
}

export function setColumn(
  draft: OrganizationDraft,
  section: AccessSection,
  action: AccessAction,
  on: boolean,
): OrganizationDraft {
  const cells: string[] = columnPermissions(section, action);
  return {
    ...draft,
    permissions: on
      ? normalise([...draft.permissions, ...cells])
      : draft.permissions.filter((p) => !cells.includes(p)),
  };
}

export function selectSection(draft: OrganizationDraft, section: AccessSection): OrganizationDraft {
  return { ...draft, permissions: normalise([...draft.permissions, ...sectionPermissions(section)]) };
}

/** Choosing a role replaces the ticks with that role's permissions. */
export function chooseRole(
  draft: OrganizationDraft,
  role: string | null,
  roles: RolePermissions,
): OrganizationDraft {
  return { ...draft, role, permissions: normalise(role ? (roles[role] ?? []) : []) };
}

export function resetToRole(draft: OrganizationDraft, roles: RolePermissions): OrganizationDraft {
  return chooseRole(draft, draft.role, roles);
}

export function setCameras(
  draft: OrganizationDraft,
  cameras: 'none' | 'all_in_tenant',
): OrganizationDraft {
  return { ...draft, cameras };
}

export function sectionHasAny(draft: OrganizationDraft, section: AccessSection): boolean {
  return sectionPermissions(section).some((p) => has(draft, p));
}

/** Whether this organization asks for anything — the server's own rule. */
export function touches(draft: OrganizationDraft): boolean {
  return draft.role !== null || draft.permissions.length > 0 || draft.cameras === 'all_in_tenant';
}

export type ChipTone = 'granted' | 'empty' | 'outside';

export function chipTone(draft: OrganizationDraft): ChipTone {
  if (draft.permissions.length > 0) return 'granted';
  if (draft.isMember || touches(draft)) return 'empty';
  return 'outside';
}

/**
 * The organizations whose role, ticks or cameras differ from what was loaded.
 *
 * A non-member organization that ends up asking for nothing is left out, so
 * ticking and clearing never joins somebody to it. `camera_breadth` is sent
 * only when the choice changed — which is what keeps a `listed` grant, set
 * inside the organization, from being overwritten.
 */
export function changesFrom(
  loaded: OrganizationDraft[],
  edited: OrganizationDraft[],
): OrganizationAccessChange[] {
  const before = new Map(loaded.map((d) => [d.organizationId, d]));
  const changes: OrganizationAccessChange[] = [];
  for (const draft of edited) {
    const was = before.get(draft.organizationId);
    const roleChanged = (was?.role ?? null) !== draft.role;
    const ticksChanged = (was?.permissions ?? []).join(',') !== draft.permissions.join(',');
    const camerasChanged = (was?.cameras ?? 'none') !== draft.cameras;
    if (!roleChanged && !ticksChanged && !camerasChanged) continue;
    if (!draft.isMember && !touches(draft)) continue;
    const change: OrganizationAccessChange = {
      organization_id: draft.organizationId,
      role: draft.role,
      permissions: draft.permissions,
    };
    if (camerasChanged && draft.cameras !== 'listed') change.camera_breadth = draft.cameras;
    changes.push(change);
  }
  return changes;
}

/** The number of ticks per section, for the review step. */
export function ticksBySection(
  draft: OrganizationDraft,
  sections: AccessSection[],
): Array<{ label: string; count: number }> {
  return sections.map((section) => ({
    label: section.label,
    count: sectionPermissions(section).filter((p) => has(draft, p)).length,
  }));
}

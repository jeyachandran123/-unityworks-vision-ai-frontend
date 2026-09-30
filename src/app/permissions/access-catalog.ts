/**
 * The access catalog — every permission, as a cell in a feature × action grid.
 *
 * The platform console's access matrix shows a person's permissions the way the
 * product is navigated: the five areas of `PRODUCT_NAV`, the features inside
 * each, and what may be done with each — View, Manage, Delete, Acknowledge,
 * Resolve, Export. This file is that mapping, and nothing else.
 *
 * **Every cell is exactly one `Permission`.** Ticking it grants that key and no
 * other; the backend's `decide()` is still what enforces it, on every route.
 * Alerts and Staff Hygiene are both gated on `view_observations`, so they show
 * two cells for one permission — the matrix links them and says so, rather
 * than pretending they can differ.
 *
 * **Kept honest by tests, not by care:** every value in `PERMISSIONS` must
 * appear here, the sections must be `PRODUCT_NAV`'s sections in its order, and
 * a destination gated on one permission must find it in its own section. Add a
 * permission and forget this file, and the suite fails.
 */

import { PERMISSIONS, type Permission } from '@app/permissions/permissions';
import { PRODUCT_NAV } from '@app/router/navigation';

export type AccessAction = 'view' | 'manage' | 'delete' | 'acknowledge' | 'resolve' | 'export';

export interface AccessActionInfo {
  id: AccessAction;
  letter: string;
  label: string;
  meaning: string;
}

export const ACCESS_ACTIONS: ReadonlyArray<AccessActionInfo> = [
  { id: 'view', letter: 'V', label: 'View', meaning: 'Read the surface' },
  { id: 'manage', letter: 'M', label: 'Manage', meaning: 'Create and edit' },
  { id: 'delete', letter: 'D', label: 'Delete', meaning: 'Retire or erase' },
  { id: 'acknowledge', letter: 'A', label: 'Acknowledge', meaning: 'Somebody has seen this' },
  { id: 'resolve', letter: 'R', label: 'Resolve', meaning: 'Close it' },
  { id: 'export', letter: 'X', label: 'Export', meaning: 'Take a copy out of the system' },
];

export interface AccessFeature {
  id: string;
  label: string;
  cells: Partial<Record<AccessAction, Permission>>;
  /** For a row with no cells: what decides it instead. */
  note?: string;
}

export interface AccessSection {
  id: string;
  label: string;
  features: AccessFeature[];
}

/** Keyed by `PRODUCT_NAV` section id. `platform` is the section labelled Estate. */
const FEATURES: Record<string, AccessFeature[]> = {
  operations: [
    { id: 'dashboard', label: 'Command Center', cells: {}, note: 'Every member of the organization' },
    { id: 'live', label: 'Live Wall', cells: { view: PERMISSIONS.viewLive } },
    { id: 'alerts', label: 'Alerts', cells: { view: PERMISSIONS.viewObservations } },
    {
      id: 'incidents',
      label: 'Incidents',
      cells: {
        view: PERMISSIONS.viewIncidents,
        acknowledge: PERMISSIONS.acknowledgeIncidents,
        resolve: PERMISSIONS.resolveIncidents,
      },
    },
  ],
  compliance: [
    { id: 'hygiene', label: 'Staff Hygiene', cells: { view: PERMISSIONS.viewObservations } },
    {
      id: 'cutting-boards',
      label: 'Cutting Boards',
      cells: { view: PERMISSIONS.viewCuttingBoard, manage: PERMISSIONS.manageCuttingBoard },
    },
    {
      id: 'evidence',
      label: 'Evidence',
      cells: { view: PERMISSIONS.viewEvidence, delete: PERMISSIONS.deleteEvidence },
    },
    {
      id: 'reports',
      label: 'Reports',
      cells: { view: PERMISSIONS.viewReports, export: PERMISSIONS.exportReports },
    },
    { id: 'audit', label: 'Audit Trail', cells: { view: PERMISSIONS.viewAudit } },
  ],
  intelligence: [
    { id: 'people-counting', label: 'People Counting', cells: { view: PERMISSIONS.viewPeopleCount } },
    { id: 'demography', label: 'Demography', cells: { view: PERMISSIONS.viewDemography } },
    {
      id: 'tables',
      label: 'Table Occupancy',
      cells: { view: PERMISSIONS.viewTableOccupancy, manage: PERMISSIONS.manageTableOccupancy },
    },
    { id: 'meals', label: 'Meal Detection', cells: { view: PERMISSIONS.viewMealDetection } },
  ],
  platform: [
    {
      id: 'cameras',
      label: 'Cameras',
      cells: {
        view: PERMISSIONS.viewCameras,
        manage: PERMISSIONS.manageCameras,
        delete: PERMISSIONS.retireCameras,
      },
    },
    { id: 'camera-health', label: 'Camera Health', cells: { view: PERMISSIONS.viewCameraHealth } },
    { id: 'zones', label: 'Zones', cells: { view: PERMISSIONS.viewZones, manage: PERMISSIONS.manageZones } },
    {
      id: 'users',
      label: 'Users & Access',
      cells: { view: PERMISSIONS.viewUsers, manage: PERMISSIONS.manageUsers },
    },
    { id: 'organization', label: 'Organization Settings', cells: { manage: PERMISSIONS.manageOrganization } },
    {
      id: 'pos',
      label: 'Integrations',
      cells: { view: PERMISSIONS.viewPosIntegration, manage: PERMISSIONS.managePosIntegration },
    },
    {
      id: 'patron-id',
      label: 'Patron ID',
      cells: { view: PERMISSIONS.viewPatronId, manage: PERMISSIONS.managePatronId },
    },
  ],
  engineering: [
    {
      id: 'devtools',
      label: 'Vision OS',
      // Manage here is registering a demand: it spends the model budget.
      cells: { view: PERMISSIONS.accessDevtools, manage: PERMISSIONS.registerDemand },
    },
    { id: 'model-evaluation', label: 'Model Evaluation', cells: { view: PERMISSIONS.viewModelEvaluation } },
    {
      id: 'runtime',
      label: 'Runtime Diagnostics',
      cells: {},
      note: 'Follows Live Wall View and Vision OS View together',
    },
  ],
};

export const ACCESS_CATALOG: AccessSection[] = PRODUCT_NAV.map((section) => ({
  id: section.id,
  label: section.label,
  features: FEATURES[section.id] ?? [],
}));

function unique(list: Permission[]): Permission[] {
  return [...new Set(list)];
}

/** The permissions one column of one section names, deduplicated. */
export function columnPermissions(section: AccessSection, action: AccessAction): Permission[] {
  const found: Permission[] = [];
  for (const feature of section.features) {
    const permission = feature.cells[action];
    if (permission) found.push(permission);
  }
  return unique(found);
}

/** Every permission a section's cells name. */
export function sectionPermissions(section: AccessSection): Permission[] {
  return unique(ACCESS_ACTIONS.flatMap((action) => columnPermissions(section, action.id)));
}

/** Every permission the catalog names. */
export function catalogPermissions(): Permission[] {
  return unique(ACCESS_CATALOG.flatMap(sectionPermissions));
}

/** The labels of *other* features whose cells name the same permission. */
export function sharedWith(permission: Permission, featureId: string): string[] {
  return ACCESS_CATALOG.flatMap((section) => section.features)
    .filter((feature) => feature.id !== featureId && Object.values(feature.cells).includes(permission))
    .map((feature) => feature.label);
}

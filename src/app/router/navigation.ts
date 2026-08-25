/**
 * The navigation model.
 *
 * One definition, consumed by the sidebar, the breadcrumbs and the tests. A
 * route that is not here does not appear anywhere, and there is no second list
 * to fall out of step with this one.
 *
 * Each entry names the **permission** it needs — never a role. Roles change;
 * "who may see evidence" does not, and the backend already owns the mapping.
 */

import { PERMISSIONS, type Permission } from '@app/permissions/permissions';

export interface NavItem {
  id: string;
  label: string;
  path: string;
  /** Any one of these admits. Empty means every signed-in user. */
  permissions: Permission[];
  glyph: string;
  /** A one-line explanation, used as the link's title and in the command list. */
  hint: string;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

export const PRODUCT_NAV: NavSection[] = [
  {
    id: 'monitor',
    label: 'Monitor',
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        path: '/dashboard',
        permissions: [],
        glyph: '◱',
        hint: 'Today at a glance',
      },
      {
        id: 'live',
        label: 'Live Monitoring',
        path: '/live',
        permissions: [PERMISSIONS.viewLive],
        glyph: '▢',
        hint: 'Every camera on the recorder, live',
      },
      {
        id: 'hygiene',
        label: 'Staff Hygiene',
        path: '/hygiene',
        permissions: [PERMISSIONS.viewObservations],
        glyph: '⬡',
        hint: 'PPE observations by person and zone',
      },
      {
        id: 'alerts',
        label: 'Alerts',
        path: '/alerts',
        permissions: [PERMISSIONS.viewObservations],
        glyph: '◬',
        hint: 'Things that need attention now',
      },
    ],
  },
  {
    id: 'investigate',
    label: 'Investigate',
    items: [
      {
        id: 'incidents',
        label: 'Incidents',
        path: '/incidents',
        permissions: [PERMISSIONS.viewIncidents],
        glyph: '▤',
        hint: 'The work queue — open, acknowledged, resolved',
      },
      {
        id: 'evidence',
        label: 'Evidence',
        path: '/evidence',
        // A separate act from reading observations. Deliberately.
        permissions: [PERMISSIONS.viewEvidence],
        glyph: '◫',
        hint: 'Imagery that supports a finding',
      },
      {
        id: 'cameras',
        label: 'Cameras',
        path: '/cameras',
        permissions: [PERMISSIONS.viewCameras, PERMISSIONS.viewCameraHealth],
        glyph: '◎',
        hint: 'Coverage, health and blind spots',
      },
      {
        id: 'reports',
        label: 'Reports',
        path: '/reports',
        permissions: [PERMISSIONS.viewObservations],
        glyph: '▦',
        hint: 'Periods, trends and export',
      },
    ],
  },
  {
    id: 'manage',
    label: 'Manage',
    items: [
      {
        id: 'audit',
        label: 'Audit Trail',
        path: '/audit',
        // Its own permission. Knowing who looked at imagery of a named employee
        // is its own kind of access, not a by-product of administering things.
        permissions: [PERMISSIONS.viewAudit],
        glyph: '❑',
        hint: 'Who did what, and who looked at whom',
      },
      {
        id: 'admin',
        label: 'Administration',
        path: '/admin',
        permissions: [PERMISSIONS.manageUsers, PERMISSIONS.manageOrganization],
        glyph: '⚙',
        hint: 'Restaurants, users and roles',
      },
    ],
  },
];

/**
 * DevTools — one entry in product navigation, a full tree of its own inside.
 *
 * Kept out of `PRODUCT_NAV` so that a manager's sidebar cannot grow an
 * engineering section by accident, and so the lazy chunk has exactly one door.
 */
export const DEVTOOLS_ENTRY: NavItem = {
  id: 'devtools',
  label: 'Vision OS',
  path: '/devtools/vision',
  permissions: [PERMISSIONS.accessDevtools],
  glyph: '◈',
  hint: 'Engineering view of the perception platform',
};

export interface DevToolsSection {
  id: string;
  label: string;
  items: Array<{ id: string; label: string; path: string; hint: string }>;
}

/**
 * Grouped by developer mental model, not by source directory.
 *
 * The validation console presented twenty peer tabs. Twenty peers is a list to
 * hunt through; six groups is a structure to navigate.
 */
export const DEVTOOLS_NAV: DevToolsSection[] = [
  {
    id: 'platform',
    label: 'Platform',
    items: [
      { id: 'overview', label: 'Overview', path: '/devtools/vision', hint: 'Status, providers, capabilities' },
      { id: 'sessions', label: 'Sessions', path: '/devtools/vision/sessions', hint: 'What is being replayed or observed' },
      { id: 'sources', label: 'Sources', path: '/devtools/vision/sources', hint: 'Acquisition and camera state' },
      { id: 'diagnostics', label: 'Diagnostics', path: '/devtools/vision/diagnostics', hint: 'Health, config and environment' },
    ],
  },
  {
    id: 'perception',
    label: 'Perception',
    items: [
      { id: 'frames', label: 'Frame by Frame', path: '/devtools/vision/frames', hint: 'One frame, every layer' },
      { id: 'detection', label: 'Detection', path: '/devtools/vision/perception/detection', hint: 'Boxes, classes, confidence' },
      { id: 'tracking', label: 'Tracking', path: '/devtools/vision/perception/tracking', hint: 'Tracks, epochs, association' },
    ],
  },
  {
    id: 'understanding',
    label: 'Understanding',
    items: [
      { id: 'crops', label: 'Crops', path: '/devtools/vision/understanding/crops', hint: 'What the model was actually shown' },
      { id: 'vlm', label: 'Model calls', path: '/devtools/vision/understanding/vlm', hint: 'Prompt, raw output, coercion' },
      { id: 'attributes', label: 'Attributes', path: '/devtools/vision/understanding/attributes', hint: 'The declared vocabulary' },
    ],
  },
  {
    id: 'state',
    label: 'State',
    items: [
      { id: 'vision-state', label: 'Vision State', path: '/devtools/vision/state', hint: 'The current visual world' },
      { id: 'observations', label: 'Observations', path: '/devtools/vision/state/observations', hint: 'Published facts' },
      { id: 'compliance', label: 'Compliance', path: '/devtools/vision/compliance', hint: 'Rule verdicts and why' },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      { id: 'evidence', label: 'Evidence', path: '/devtools/vision/evidence', hint: 'Retained imagery, doubly gated' },
      { id: 'economy', label: 'Economy', path: '/devtools/vision/economy', hint: 'What the platform is spending, and why' },
    ],
  },
];

export function visibleItems(
  sections: NavSection[],
  can: (permissions: Permission[]) => boolean,
): NavSection[] {
  return sections
    .map((section) => ({ ...section, items: section.items.filter((item) => can(item.permissions)) }))
    .filter((section) => section.items.length > 0);
}

/** Breadcrumb trail for a path. Falls back to the path itself rather than nothing. */
export function trailFor(pathname: string): string[] {
  for (const section of PRODUCT_NAV) {
    for (const item of section.items) {
      if (pathname === item.path || pathname.startsWith(`${item.path}/`)) {
        return [section.label, item.label];
      }
    }
  }

  if (pathname.startsWith(DEVTOOLS_ENTRY.path)) {
    for (const section of DEVTOOLS_NAV) {
      for (const item of section.items) {
        if (pathname === item.path) return ['Vision OS', section.label, item.label];
      }
    }
    return ['Vision OS'];
  }

  return [pathname];
}

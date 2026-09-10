/**
 * The navigation model.
 *
 * One definition, consumed by the sidebar, the breadcrumbs and the tests. A
 * route that is not here does not appear anywhere, and there is no second list
 * to fall out of step with this one.
 *
 * Each entry names the **permission** it needs — never a role. Roles change;
 * "who may see evidence" does not, and the backend already owns the mapping.
 *
 * ── Stage 2's three structural changes ──────────────────────────────────────
 *
 * **Five areas, grouped by what a thing is rather than by how ready it is.**
 * The previous four sections — Monitor, Analyse, Investigate, Manage — were
 * built for the union of all roles, which is why a developer's "Analyse"
 * section contained exactly one item and an auditor's "Investigate" section had
 * a hole where Cameras should be. Grouping by domain means nothing has to be
 * re-filed on the day a module connects, and every role gets whole areas rather
 * than fragments.
 *
 * **`register` replaces a hand-written branch in the shell.** DevTools used to
 * be a separate export rendered by its own conditional, which meant the
 * permission filter had to be remembered twice. Engineering is now an ordinary
 * area that declares itself, so there is one code path and one filter.
 *
 * **`readiness` says so before the click.** Seven of an org admin's eighteen
 * entries opened a page reporting it had no data source. Each page was honest;
 * collectively they taught the operator that clicking things leads nowhere.
 * `awaiting` and `blocked` stay distinct because waiting for engineering work
 * and waiting for a DPIA are different facts — the backend's own capability
 * envelope draws that line and the navigation used to discard it.
 */

import { PERMISSIONS, type Permission } from '@app/permissions/permissions';
import { NavIcons, type LucideIcon } from '@shared/ui/icons';

/**
 * How ready a destination is, declared statically.
 *
 * A sidebar must render before any query resolves, and fetching seven
 * capability endpoints to draw one would be absurd — so this is a declaration
 * rather than a reading. It is kept honest by a test that asserts the set of
 * entries marked `awaiting` or `blocked` is exactly the set of routes whose
 * page renders the awaiting shell. Connect a module and the test fails until
 * the marker comes off.
 */
export type Readiness = 'live' | 'awaiting' | 'blocked';

/** Which half of the product a destination belongs to. Drives the register. */
export type Register = 'product' | 'engineering';

export interface NavItem {
  id: string;
  label: string;
  path: string;
  /** By default any one of these admits; `require: 'all'` demands every one. */
  permissions: Permission[];
  /**
   * `all` for a destination that genuinely needs several permissions.
   *
   * `RequirePermission` has supported `mode="all"` since Phase 1 and this model
   * did not, so a route could be gated more tightly than its own navigation
   * entry — which is exactly the disagreement Stage 1 found at
   * `/live/runtime`. The two now express the same thing.
   */
  require?: 'any' | 'all';
  /**
   * The destination's icon.
   *
   * A component, not a character. This field used to hold one of twenty
   * geometric Unicode glyphs — `⌾`, `▣`, `◬`, `≡` and so on — which rendered in
   * whatever the operating system happened to supply, differed between a
   * Windows workstation and a Linux kiosk running the same build, and in
   * several cases had no relationship at all to the destination they marked.
   *
   * Every value comes from `NavIcons` in `shared/ui/icons.tsx`, which is where
   * the reasoning for each choice is recorded.
   */
  icon: LucideIcon;
  /** A one-line explanation, used as the link's title and in the command list. */
  hint: string;
  readiness?: Readiness;
}

export interface NavSection {
  id: string;
  label: string;
  /** One line naming the question this area answers. Shown under the label. */
  blurb: string;
  register: Register;
  items: NavItem[];
}

/**
 * The five areas.
 *
 * Operations is "what is happening now". Compliance is "the record, and its
 * defence". Intelligence is "the business question". Estate is "the cameras and
 * sites themselves". Engineering is "the system itself". A person works inside
 * one of these at a time, which is the test a section has to pass to exist.
 *
 * None of them is the *Platform Control Plane*. That is a separate shell, a
 * separate navigation model (`platform-navigation.ts`) and a separate
 * principal, and it sits above every organization rather than inside one.
 */
export const PRODUCT_NAV: NavSection[] = [
  {
    id: 'operations',
    label: 'Operations',
    blurb: 'What is happening now',
    register: 'product',
    items: [
      {
        id: 'dashboard',
        label: 'Command Center',
        path: '/dashboard',
        permissions: [],
        icon: NavIcons.dashboard,
        hint: 'What needs attention, and what the system is seeing',
      },
      {
        id: 'live',
        label: 'Live Wall',
        path: '/live',
        permissions: [PERMISSIONS.viewLive],
        icon: NavIcons.live,
        hint: 'Every camera on the recorder, live',
      },
      {
        id: 'alerts',
        label: 'Alerts',
        path: '/alerts',
        permissions: [PERMISSIONS.viewObservations],
        icon: NavIcons.alerts,
        hint: 'Open violations, most urgent first',
      },
      {
        id: 'incidents',
        label: 'Incidents',
        path: '/incidents',
        permissions: [PERMISSIONS.viewIncidents],
        icon: NavIcons.incidents,
        hint: 'The ledger — open, acknowledged, resolved',
      },
    ],
  },
  {
    id: 'compliance',
    label: 'Compliance',
    blurb: 'The record, and its defence',
    register: 'product',
    items: [
      {
        id: 'hygiene',
        label: 'Staff Hygiene',
        path: '/hygiene',
        permissions: [PERMISSIONS.viewObservations],
        icon: NavIcons.hygiene,
        hint: 'PPE observations by subject and zone',
      },
      {
        id: 'cutting-boards',
        label: 'Cutting Boards',
        // Food safety, whether or not it has data yet. Filed by what it is, so
        // it does not move on the day a source is connected.
        path: '/cutting-boards',
        permissions: [PERMISSIONS.viewCuttingBoard],
        icon: NavIcons.cuttingBoards,
        hint: 'Board colour against the ingredient being prepared',
        readiness: 'awaiting',
      },
      {
        id: 'evidence',
        label: 'Evidence',
        path: '/evidence',
        // A separate act from reading observations. Deliberately.
        permissions: [PERMISSIONS.viewEvidence],
        icon: NavIcons.evidence,
        hint: 'Imagery that supports a finding',
      },
      {
        id: 'reports',
        label: 'Reports',
        path: '/reports',
        // Its own permission. The catalogue reaches incidents, cameras and the
        // audit trail, so gating it on observations would be both too narrow
        // and, for an account with observations alone, misleading.
        permissions: [PERMISSIONS.viewReports],
        icon: NavIcons.reports,
        hint: 'Periods, coverage, trends and export',
      },
      {
        id: 'audit',
        label: 'Audit Trail',
        path: '/audit',
        // Its own permission. Knowing who looked at imagery of a named employee
        // is its own kind of access, not a by-product of administering things.
        permissions: [PERMISSIONS.viewAudit],
        icon: NavIcons.audit,
        hint: 'Who did what, and who looked at whom',
      },
    ],
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    blurb: 'The business question',
    register: 'product',
    items: [
      {
        id: 'people-counting',
        label: 'People Counting',
        path: '/people-counting',
        permissions: [PERMISSIONS.viewPeopleCount],
        icon: NavIcons.peopleCounting,
        hint: 'Entries, exits and peak hours, with the coverage behind them',
        readiness: 'awaiting',
      },
      {
        id: 'demography',
        label: 'Demography',
        path: '/demography',
        // Its own permission, deliberately. A role that may read footfall has
        // no automatic claim on inferred age or gender.
        permissions: [PERMISSIONS.viewDemography],
        icon: NavIcons.demography,
        hint: 'Aggregate category breakdown — never per person',
        readiness: 'awaiting',
      },
      {
        id: 'tables',
        label: 'Table Occupancy',
        path: '/tables',
        permissions: [PERMISSIONS.viewTableOccupancy],
        icon: NavIcons.tables,
        hint: 'Which tables are occupied, free or waiting to be cleared',
        readiness: 'awaiting',
      },
      {
        id: 'meals',
        label: 'Meal Detection',
        path: '/meals',
        permissions: [PERMISSIONS.viewMealDetection],
        icon: NavIcons.meals,
        hint: 'Dishes recognised, against what the till says was sold',
        readiness: 'awaiting',
      },
    ],
  },
  {
    // Renamed from "Platform" to "Estate". The word had come to mean three
    // different things in one product — Vision OS (called "the platform"
    // throughout its own source), the cross-organization control plane at
    // `/platform`, and this section — so an organization administrator saw a
    // sidebar area called "Platform" that had nothing to do with the Platform
    // layer. The section's own blurb already said "the estate", so the word was
    // sitting right here.
    //
    // The `id` is deliberately left as `platform`: it is not display text, it
    // is what `itemFor` and the navigation tests address, and renaming it would
    // be churn in files this correction has no reason to touch.
    id: 'platform',
    label: 'Estate',
    blurb: 'The estate and its configuration',
    register: 'product',
    items: [
      {
        id: 'cameras',
        label: 'Cameras',
        path: '/cameras',
        permissions: [PERMISSIONS.viewCameras, PERMISSIONS.viewCameraHealth],
        icon: NavIcons.cameras,
        hint: 'The estate — configuration, health and blind spots',
      },
      {
        id: 'pos',
        label: 'Integrations',
        path: '/integrations/pos',
        permissions: [PERMISSIONS.viewPosIntegration],
        icon: NavIcons.integrations,
        hint: 'The seam between this system and the till',
        readiness: 'awaiting',
      },
      {
        id: 'admin',
        label: 'Administration',
        path: '/admin',
        // Any administration *read* gets in, not only the write permissions.
        // Gating this on `manage_*` hid the whole area from a manager who can
        // legitimately read the estate — which is exactly the account the
        // read/manage split exists to serve.
        permissions: [
          PERMISSIONS.viewSites,
          PERMISSIONS.viewZones,
          PERMISSIONS.viewUsers,
          PERMISSIONS.manageOrganization,
        ],
        icon: NavIcons.administration,
        hint: 'Sites, zones, cameras, people and access',
      },
      {
        id: 'patron-id',
        label: 'Patron ID',
        path: '/patron-id',
        // Its own permission, held by org_admin and super_admin only. The page
        // reports that the module is blocked; it offers nothing to operate.
        permissions: [PERMISSIONS.viewPatronId],
        icon: NavIcons.patronId,
        hint: 'Returning-visitor identification — blocked pending legal review',
        readiness: 'blocked',
      },
    ],
  },
  {
    /**
     * Engineering.
     *
     * An area with its own register rather than a link hanging below the
     * product. `UI_UX_ARCHITECTURE.md` §3 asked for this in Phase 0 —
     * *"DevTools must not look like a hidden corner of the product… so a
     * developer with both roles always knows which surface they are looking
     * at, and so a screenshot in a bug report is unambiguous"* — and it was
     * never built.
     */
    id: 'engineering',
    label: 'Engineering',
    blurb: 'The system itself',
    register: 'engineering',
    items: [
      {
        id: 'devtools',
        label: 'Vision OS',
        path: '/devtools/vision',
        permissions: [PERMISSIONS.accessDevtools],
        icon: NavIcons.visionOs,
        hint: 'Engineering view of the perception platform',
      },
      {
        id: 'model-evaluation',
        label: 'Model Evaluation',
        // Moved out of Analyse. The gate was always correct; the placement was
        // not. Confusion matrices and a dataset's written admission that it
        // cannot measure detection recall do not belong in the list an
        // organization admin scans for footfall.
        path: '/model-evaluation',
        permissions: [PERMISSIONS.viewModelEvaluation],
        icon: NavIcons.modelEvaluation,
        hint: 'How the perception stack scores against annotated data',
      },
      {
        id: 'runtime',
        label: 'Runtime Diagnostics',
        // Orphaned until now: implemented, permission-gated, and reachable only
        // by typing the URL. It reports camera *session* state and shows no
        // imagery, which is a diagnostic rather than an operator view — so it
        // arrives here with a tightened gate rather than in Operations.
        path: '/live/runtime',
        permissions: [PERMISSIONS.viewLive, PERMISSIONS.accessDevtools],
        require: 'all',
        icon: NavIcons.runtime,
        hint: 'Camera sessions, runtime state and why a stream is not running',
      },
    ],
  },
];

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

/**
 * The Vision OS entry, kept as a named export because the DevTools layout and
 * several tests address it directly. It is now a *lookup into* `PRODUCT_NAV`
 * rather than a parallel declaration, so the two cannot disagree.
 */
export const DEVTOOLS_ENTRY: NavItem = (() => {
  const engineering = PRODUCT_NAV.find((section) => section.id === 'engineering');
  const entry = engineering?.items.find((item) => item.id === 'devtools');
  if (!entry) {
    // Unreachable in practice; a throw rather than a fallback so that deleting
    // the entry fails loudly at import instead of silently ungating DevTools.
    throw new Error('the Vision OS navigation entry is missing from PRODUCT_NAV');
  }
  return entry;
})();

/** Whether a holder admits an item, honouring its `require` mode. */
export function admits(
  item: NavItem,
  can: (permissions: Permission[], mode: 'any' | 'all') => boolean,
): boolean {
  if (item.permissions.length === 0) return true;
  return can(item.permissions, item.require ?? 'any');
}

export function visibleItems(
  sections: NavSection[],
  can: (permissions: Permission[], mode?: 'any' | 'all') => boolean,
): NavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => admits(item, (permissions, mode) => can(permissions, mode))),
    }))
    .filter((section) => section.items.length > 0);
}

/** Every navigable path, for the tests that assert the router and this agree. */
export function allNavPaths(): string[] {
  return PRODUCT_NAV.flatMap((section) => section.items.map((item) => item.path));
}

/** The item that owns a pathname, if any. Longest match wins. */
export function itemFor(pathname: string): { section: NavSection; item: NavItem } | null {
  let best: { section: NavSection; item: NavItem } | null = null;
  for (const section of PRODUCT_NAV) {
    for (const item of section.items) {
      if (pathname === item.path || pathname.startsWith(`${item.path}/`)) {
        if (!best || item.path.length > best.item.path.length) best = { section, item };
      }
    }
  }
  return best;
}

/** Breadcrumb trail for a path. Falls back to the path itself rather than nothing. */
export function trailFor(pathname: string): string[] {
  const owner = itemFor(pathname);

  if (owner && owner.item.path === DEVTOOLS_ENTRY.path) {
    for (const section of DEVTOOLS_NAV) {
      for (const item of section.items) {
        if (pathname === item.path) return ['Vision OS', section.label, item.label];
      }
    }
    return ['Vision OS'];
  }

  if (owner) return [owner.section.label, owner.item.label];
  return [pathname];
}

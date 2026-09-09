/**
 * The Platform Control Plane's navigation model.
 *
 * A separate model from `PRODUCT_NAV`, not an extra section inside it, and the
 * separation is the point. `PRODUCT_NAV` describes one organisation's
 * application and every entry in it is filtered by a `Permission` — a tenant
 * concept, held inside one organisation. Nothing here is: the whole console
 * answers to a `PlatformOperator`, which carries no permissions at all and no
 * tenant, so there is no per-item permission to declare and inventing one would
 * be the redefinition of platform authority into a tenant role that
 * `app/authorization/platform.py` exists to prevent.
 *
 * The gate is therefore on the *route group*, once — `RequirePlatformOperator`
 * — rather than per item. One door, one check.
 *
 * ### Readiness is declared, and it is honest
 *
 * Two destinations are structural: Audit and Fleet Health have a place in the
 * information architecture and no backend behind them yet. They are marked
 * `awaiting` and their pages say so plainly rather than rendering an empty
 * table that looks like a customer with no activity. This mirrors the
 * convention `PRODUCT_NAV` already uses, for the same reason: a page that
 * silently shows nothing teaches the operator that clicking things leads
 * nowhere.
 */

import { NavIcons, type LucideIcon } from '@shared/ui/icons';

/** Same vocabulary as the product navigation, so the two read alike. */
export type PlatformReadiness = 'live' | 'awaiting';

export interface PlatformNavItem {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  /** One line naming what this destination answers. */
  hint: string;
  readiness?: PlatformReadiness;
  /** `true` when a child route should still light the parent. */
  matchNested?: boolean;
}

export interface PlatformNavSection {
  id: string;
  label: string;
  items: PlatformNavItem[];
}

/**
 * Four areas.
 *
 * Overview is "is anything wrong, anywhere". Customers is "the organisations
 * themselves". Access is "who can reach what". Assurance is "prove it". A
 * platform administrator works inside one of those at a time, which is the test
 * a section has to pass to exist.
 */
export const PLATFORM_NAV: PlatformNavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      {
        id: 'platform-dashboard',
        label: 'Dashboard',
        path: '/platform',
        icon: NavIcons.dashboard,
        hint: 'The platform at a glance — counted, never scored',
      },
    ],
  },
  {
    id: 'customers',
    label: 'Customers',
    items: [
      {
        id: 'platform-organizations',
        label: 'Organizations',
        path: '/platform/organizations',
        icon: NavIcons.administration,
        hint: 'Create, rename, suspend, archive — and enter',
        matchNested: true,
      },
    ],
  },
  {
    id: 'access',
    label: 'Access',
    items: [
      {
        id: 'platform-people',
        label: 'People',
        path: '/platform/people',
        icon: NavIcons.peopleCounting,
        hint: 'Everyone on the platform, and what they may enter',
        matchNested: true,
      },
      {
        id: 'platform-operators',
        label: 'Operators',
        path: '/platform/operators',
        icon: NavIcons.cameras,
        hint: 'Who holds platform authority, since when, and why',
      },
      {
        id: 'platform-roles',
        label: 'Roles & Access',
        path: '/platform/roles',
        icon: NavIcons.hygiene,
        hint: 'What each role means, as the server enforces it',
      },
    ],
  },
  {
    id: 'assurance',
    label: 'Assurance',
    items: [
      {
        id: 'platform-audit',
        label: 'Audit',
        path: '/platform/audit',
        icon: NavIcons.audit,
        hint: 'Platform activity across every organisation',
        readiness: 'awaiting',
      },
      {
        id: 'platform-fleet',
        label: 'Fleet Health',
        path: '/platform/fleet',
        icon: NavIcons.live,
        hint: 'Cameras streaming against cameras configured',
        readiness: 'awaiting',
      },
    ],
  },
];

/** Every platform path, for the tests that assert the router and this agree. */
export function allPlatformPaths(): string[] {
  return PLATFORM_NAV.flatMap((section) => section.items.map((item) => item.path));
}

/**
 * The item that owns a pathname, if any. Longest match wins.
 *
 * The longest-match rule is load-bearing rather than tidy: `/platform` is a
 * prefix of every other path here, so a first-match walk would light Dashboard
 * on every page in the console.
 */
export function platformItemFor(
  pathname: string,
): { section: PlatformNavSection; item: PlatformNavItem } | null {
  let best: { section: PlatformNavSection; item: PlatformNavItem } | null = null;
  for (const section of PLATFORM_NAV) {
    for (const item of section.items) {
      const matches =
        pathname === item.path || (item.matchNested && pathname.startsWith(`${item.path}/`));
      if (matches && (!best || item.path.length > best.item.path.length)) {
        best = { section, item };
      }
    }
  }
  return best;
}

/** Breadcrumb trail for a platform path. */
export function platformTrailFor(pathname: string): string[] {
  const owner = platformItemFor(pathname);
  return owner ? ['Platform', owner.item.label] : ['Platform'];
}

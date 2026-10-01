/**
 * The application shell.
 *
 * One shell for both experiences. Product routes and DevTools routes render
 * inside it, so navigation, identity, connection state and breadcrumbs are
 * implemented once and cannot drift between the two.
 *
 * The shell is stable across navigation: only `<Outlet />` changes. A page that
 * re-created its own header would be a page whose header could be wrong.
 *
 * **Areas, not a list.** Five sections, each naming the question it answers,
 * with the engineering area set into a ground of its own. Engineering is an
 * ordinary area that declares `register: 'engineering'`, so there is one
 * rendering path and one permission filter rather than two.
 *
 * **The sidebar becomes a drawer below `--shell-breakpoint`.** A drawer is not
 * a narrow sidebar: it takes focus, closes on Escape, and does not exist in the
 * tab order when shut.
 *
 * **The topbar carries the register.** A page in the engineering area says so,
 * persistently, so a screenshot in a bug report is unambiguous.
 *
 * The look — deep-purple navigation in both themes, a raised topbar, the reading
 * plane between — lives in `global.css` under "THE SHELL", shared with
 * `PlatformShell`. The parts both shells need are in `shell-parts.tsx`.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@app/auth/AuthProvider';
import { hasAll, hasAny, roleLabel, type Permission } from '@app/permissions/permissions';
import {
  itemFor,
  PRODUCT_NAV,
  visibleItems,
  type NavItem,
  type NavSection,
} from '@app/router/navigation';
import { useConnectionStatus } from '@shared/realtime/useConnection';
import { ControlIcons, Icon, StatusIcons } from '@shared/ui/icons';
import { IconButton, StatusBadge, type HealthTone } from '@shared/ui/primitives';
import { Readiness, useMediaQuery } from '@shared/ui/product';
import {
  AccountMenu,
  BrandMark,
  CrumbSeparator,
  RegisterMark,
  ThemeToggle,
  type MenuAction,
} from './shell-parts';

const COLLAPSE_KEY = 'uwv.sidebar.collapsed';

/**
 * The width at which the sidebar stops being furniture.
 *
 * `--shell-breakpoint` in `tokens.css` carries the same value; a media query
 * cannot read a custom property, so this is the JavaScript half of one
 * decision. A test asserts the two agree.
 */
export const SHELL_BREAKPOINT = '62rem';

export function AppShell() {
  const { user, logout, organizations, activeOrganization, isPlatformOperator } =
    useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  /**
   * Is this a platform-operator entry session?
   *
   * Read from the identity the server issued, not from whether the account
   * *could* be an operator. An operator working inside their own organization
   * as a member is having an ordinary session and must not be marked as if
   * they were visiting.
   */
  const acting = user?.acting_as === 'platform_operator';

  /**
   * Whether there is anywhere to switch *to*. A single-organization user is
   * shown no switcher at all.
   */
  const canSwitch = organizations.length > 1 || isPlatformOperator;

  /** The organization's name when the session can see it, its id when it
      cannot — an operator entering a customer they are not a member of has no
      membership row to read a name from. */
  const organizationLabel = activeOrganization?.name ?? user?.tenant_id ?? '';
  const narrow = useMediaQuery(`(max-width: ${SHELL_BREAKPOINT})`);

  const [collapsed, setCollapsed] = useState(
    () => window.localStorage.getItem(COLLAPSE_KEY) === '1',
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  // Close both overlays on navigation, so neither survives into a page where it
  // makes no sense.
  useEffect(() => {
    setMenuOpen(false);
    setDrawerOpen(false);
  }, [location.pathname]);

  // A drawer that is open when the viewport widens would leave a backdrop over
  // a perfectly usable sidebar.
  useEffect(() => {
    if (!narrow) setDrawerOpen(false);
  }, [narrow]);

  const can = (permissions: Permission[], mode: 'any' | 'all' = 'any') =>
    permissions.length === 0 || (mode === 'all' ? hasAll(user, permissions) : hasAny(user, permissions));

  const sections = visibleItems(PRODUCT_NAV, can);
  const owner = itemFor(location.pathname);
  const engineering = owner?.section.register === 'engineering';

  // An operator's way out is the control plane, which lists every customer; a
  // member's is the chooser, which lists only theirs. Switching is a navigation
  // rather than a menu of organizations: picking one re-mints the session and
  // clears every cache, which is too consequential to happen from a hover menu.
  const menuActions: MenuAction[] = [
    ...(canSwitch
      ? [
          {
            label: isPlatformOperator ? 'Platform control plane' : 'Switch organization',
            onSelect: () => navigate(isPlatformOperator ? '/platform' : '/choose-organization'),
          },
        ]
      : []),
    { label: 'Sign out', onSelect: () => void logout(), tone: 'danger' as const },
  ];

  return (
    <div className="uwv-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      {narrow ? (
        <NavDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          sections={sections}
          organization={organizationLabel}
        />
      ) : (
        // Two elements, because the sidebar has two jobs. The outer column is
        // furniture and runs the full height of the document; the inner nav is
        // one viewport tall and sticky, so the collapse control at its foot is
        // always reachable.
        <div
          className="uwv-nav"
          data-collapsed={collapsed ? 'true' : undefined}
          style={{ width: collapsed ? 'var(--sidebar-width-collapsed)' : 'var(--sidebar-width)' }}
        >
          <nav aria-label="Primary" className="uwv-nav-inner">
            <Wordmark collapsed={collapsed} organization={organizationLabel} />
            <SectionList sections={sections} collapsed={collapsed} />
            <div className="uwv-nav-foot">
              <button
                type="button"
                className="uwv-nav-foot-button"
                aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
                title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
                aria-expanded={!collapsed}
                onClick={() => setCollapsed((value) => !value)}
              >
                <Icon icon={collapsed ? ControlIcons.expandNav : ControlIcons.collapseNav} size="nav" />
                {collapsed ? null : <span aria-hidden="true">Collapse</span>}
              </button>
            </div>
          </nav>
        </div>
      )}

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          // An engineering page declines the atmosphere: that register is a
          // flat, cold ground on purpose.
          background: engineering ? 'var(--surface-engineering)' : 'var(--atmosphere)',
        }}
      >
        <header
          aria-label="Application"
          className="uwv-topbar"
          data-register={engineering ? 'engineering' : undefined}
        >
          {narrow ? (
            <IconButton
              label="Open navigation"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
            >
              <Icon icon={ControlIcons.menu} />
            </IconButton>
          ) : null}

          {/* The breadcrumb is the first thing to go at narrow widths: the
              drawer and the page's own title already answer it, and keeping it
              was what overflowed the topbar on a phone. */}
          {narrow ? <span style={{ flex: 1 }} /> : <Breadcrumb />}

          {acting ? <OperatorMark organization={organizationLabel} compact={narrow} /> : null}
          {engineering && !narrow ? (
            <RegisterMark tone="engineering">
              <Icon icon={StatusIcons.engineering} size="inline" />
              Engineering surface
            </RegisterMark>
          ) : null}

          <ConnectionIndicator compact={narrow} />
          <ThemeToggle />

          <AccountMenu
            name={user?.display_name ?? ''}
            subject={user?.subject ?? ''}
            compact={narrow}
            open={menuOpen}
            onOpenChange={setMenuOpen}
            actions={menuActions}
            details={
              // The organization, named in the menu as well as in the sidebar:
              // the menu is where somebody goes when they are unsure who they
              // are signed in as, and "which customer am I looking at" is the
              // same question.
              <>
                <div className="uwv-menu-caption" style={{ marginTop: 'var(--space-3)' }}>
                  Organization
                </div>
                <div className="uwv-menu-value">{organizationLabel}</div>
                {user?.roles.length ? (
                  <div style={{ marginTop: 'var(--space-2)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
                    {user.roles.map((role) => (
                      <span key={role} className="uwv-badge" data-tone="accent">
                        {roleLabel(role)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </>
            }
          />
        </header>

        <main
          id="main"
          className="uwv-content"
          style={{
            flex: 1,
            width: '100%',
            maxWidth: 'var(--content-max)',
            marginInline: 'auto',
            minWidth: 0,
            // A page never scrolls sideways; wide content scrolls inside its
            // own container instead.
            overflowX: 'hidden',
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/**
 * The persistent marker on a platform-operator entry session.
 *
 * On screen for as long as the session lasts, because the fact it states is
 * true for as long as the session lasts: somebody three pages into a customer's
 * incidents must be able to tell they are inside an organization under platform
 * authority, and that their being here is recorded.
 */
function OperatorMark({ organization, compact }: { organization: string; compact: boolean }) {
  return (
    <RegisterMark
      tone="attention"
      title="You entered this organization from the platform console as Platform Admin. You have full access here, and the entry was recorded in this organization's audit trail."
    >
      <Icon icon={StatusIcons.coverageIncomplete} size="inline" />
      {compact ? 'Admin' : 'Platform Admin · recorded'}
      <span className="sr-only">{` — viewing ${organization} from the platform console`}</span>
    </RegisterMark>
  );
}

/* ── the sidebar's parts ──────────────────────────────────────────────────── */

/**
 * The mark, the product, and the organization being worked in.
 *
 * The organization belongs at the head of the navigation because it qualifies
 * everything below it. It is shown to a single-organization user too: naming
 * where you are is orientation, not a switcher.
 */
function Wordmark({ collapsed, organization }: { collapsed: boolean; organization: string }) {
  return (
    <div className="uwv-nav-brand" style={collapsed ? { justifyContent: 'center', padding: 0 } : undefined}>
      <BrandMark />
      {collapsed ? null : (
        <span style={{ minWidth: 0 }}>
          <span className="uwv-nav-brand-name">Vision AI</span>
          {organization ? (
            <span className="uwv-nav-brand-sub" title={organization}>
              {organization}
            </span>
          ) : null}
        </span>
      )}
    </div>
  );
}

function SectionList({ sections, collapsed }: { sections: NavSection[]; collapsed: boolean }) {
  // Only the area the current route belongs to explains itself: five blurbs
  // pushed two whole areas below the fold on a 900px screen.
  const here = itemFor(useLocation().pathname)?.section.id;
  return (
    <div className="uwv-nav-scroll">
      {sections.map((section) => (
        <div
          key={section.id}
          className="uwv-nav-group"
          data-register={section.register === 'engineering' ? 'engineering' : undefined}
        >
          {collapsed ? null : (
            <>
              <div className="uwv-nav-group-label">{section.label}</div>
              {section.id === here ? <div className="uwv-nav-group-blurb">{section.blurb}</div> : null}
            </>
          )}
          <ul>
            {section.items.map((item) => (
              <li key={item.id}>
                <SidebarLink item={item} collapsed={collapsed} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const readiness = item.readiness && item.readiness !== 'live' ? item.readiness : null;

  return (
    <NavLink
      to={item.path}
      end={item.path === '/devtools/vision'}
      title={collapsed ? `${item.label} — ${item.hint}` : item.hint}
      className="uwv-nav-link"
    >
      {/* A fixed column, so labels align down the rail whatever the icon's
          own width. */}
      <span className="uwv-nav-link-icon" aria-hidden="true">
        <Icon icon={item.icon} size="nav" />
      </span>
      {collapsed ? (
        <span className="sr-only">{item.label}</span>
      ) : (
        <>
          <span className="uwv-nav-link-label">{item.label}</span>
          {readiness ? (
            <span
              className="uwv-nav-link-meta"
              title={readiness === 'awaiting' ? 'Awaiting a data source' : 'Blocked pending legal review'}
            >
              <Icon
                icon={readiness === 'awaiting' ? StatusIcons.awaiting : StatusIcons.blocked}
                size="inline"
              />
            </span>
          ) : null}
          {/* The text half of the marker, for anyone who cannot see the glyph.
              Short: the page itself states the full reason. */}
          {readiness ? (
            <span className="sr-only">
              {readiness === 'awaiting' ? 'awaiting a data source' : 'blocked'}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}

/**
 * The sidebar as a drawer, for viewports where it cannot be furniture.
 *
 * Focus moves in on open and `Escape` closes it. It is not rendered at all when
 * closed — an `aria-hidden` panel still in the tab order is the most common
 * accessibility defect in responsive dashboards.
 */
function NavDrawer({
  open,
  onClose,
  sections,
  organization,
}: {
  open: boolean;
  onClose: () => void;
  sections: NavSection[];
  organization: string;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="uwv-nav-scrim" onClick={onClose}>
      <div
        ref={panel}
        tabIndex={-1}
        className="uwv-nav-drawer"
        onClick={(event) => event.stopPropagation()}
      >
        <nav aria-label="Primary" style={{ display: 'contents' }}>
          <div className="uwv-nav-brand" style={{ justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
              <BrandMark />
              <span style={{ minWidth: 0 }}>
                <span className="uwv-nav-brand-name">Vision AI</span>
                {organization ? <span className="uwv-nav-brand-sub">{organization}</span> : null}
              </span>
            </span>
            <button
              type="button"
              className="uwv-nav-foot-button"
              style={{ width: 'auto', padding: '0 var(--space-2)' }}
              aria-label="Close navigation"
              title="Close navigation"
              onClick={onClose}
            >
              <Icon icon={ControlIcons.close} />
            </button>
          </div>
          <SectionList sections={sections} collapsed={false} />
        </nav>
      </div>
    </div>
  );
}

/* ── topbar parts ─────────────────────────────────────────────────────────── */

/**
 * Breadcrumbs that can actually be clicked.
 *
 * On a list route the trail is area › page and the page is the current
 * location, so nothing is a link. On an object route the middle crumb is the
 * list the object came from, which is the only genuinely useful navigation a
 * breadcrumb ever offers.
 */
function Breadcrumb() {
  const location = useLocation();
  const owner = itemFor(location.pathname);

  if (!owner) {
    return (
      <nav aria-label="Breadcrumb" style={{ flex: 1, minWidth: 0 }}>
        <ol className="uwv-crumbs">
          <li aria-current="page">{location.pathname}</li>
        </ol>
      </nav>
    );
  }

  const deeper = location.pathname !== owner.item.path;

  return (
    <nav aria-label="Breadcrumb" style={{ flex: 1, minWidth: 0 }}>
      <ol className="uwv-crumbs">
        <li>{owner.section.label}</li>
        <li style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', minWidth: 0 }}>
          <CrumbSeparator />
          {deeper ? (
            <Link to={owner.item.path}>{owner.item.label}</Link>
          ) : (
            <span aria-current="page">{owner.item.label}</span>
          )}
        </li>
      </ol>
    </nav>
  );
}

/**
 * Connection state, stated as two facts.
 *
 * "Connected · no live camera source yet" rather than "LIVE". A green badge lit
 * by an open socket over a camera that does not exist is the single most
 * misleading thing this shell could render.
 */
function ConnectionIndicator({ compact = false }: { compact?: boolean }) {
  const status = useConnectionStatus();

  const tone: HealthTone =
    status.state === 'connected'
      ? status.streaming
        ? 'online'
        : 'degraded'
      : status.state === 'reconnecting' || status.state === 'connecting' || status.state === 'authenticating'
        ? 'degraded'
        : status.state === 'idle'
          ? 'idle'
          : 'offline';

  return (
    <Link
      to="/live"
      title={status.detail}
      className="uwv-register-mark"
      style={{
        textDecoration: 'none',
        textTransform: 'none',
        letterSpacing: 0,
        fontWeight: 'var(--weight-medium)',
        paddingInline: compact ? 'var(--space-2)' : undefined,
      }}
    >
      {/* Compact is the dot alone, with the same sentence in the accessible
          name and the tooltip. The state is never dropped, only the room it
          takes. */}
      <StatusBadge tone={tone}>
        {compact ? <span className="sr-only">{status.detail}</span> : status.detail}
      </StatusBadge>
    </Link>
  );
}

/** Re-exported so a feature can mark its own awaiting state consistently. */
export { Readiness };

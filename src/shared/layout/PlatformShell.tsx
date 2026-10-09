/**
 * The Platform Control Plane's shell.
 *
 * ### Why this is a second shell and not a third register inside `AppShell`
 *
 * `AppShell` is an *organization's* application shell. Everything in it is
 * about one tenant: it names the active organization at the head of the
 * sidebar, it filters navigation by the permissions held inside that tenant, it
 * carries a live-connection indicator for that tenant's cameras, and its
 * breadcrumb is rooted in that tenant's information architecture.
 *
 * The control plane has no tenant. Rendering it inside `AppShell` put a
 * cross-customer console inside one customer's navigation, visually asserting
 * that the console belonged to whichever organization happened to be selected.
 * That is not a styling problem; it is the route table contradicting the domain
 * model.
 *
 *     /platform/*   → PlatformShell   no tenant, cross-organization
 *     everything else → AppShell      one tenant, from the token
 *
 * ### What it deliberately does not carry
 *
 * No connection indicator: there is no tenant whose cameras it could describe.
 * No permission filtering: a `PlatformOperator` holds no `Permission`, and the
 * gate is on the route group instead. No organization name: naming one would
 * re-introduce exactly the confusion this shell exists to remove.
 *
 * ### One product, two shells
 *
 * It is drawn from the same classes and the same parts as `AppShell` — the
 * purple navigation, the topbar, the account menu — so the two can differ in
 * what they say and never in how they look. What marks this one as the console
 * is the "Control plane" line under the mark and the "Platform" marker in the
 * topbar, so a screenshot is unambiguous about which half of the product it
 * came from.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@app/auth/AuthProvider';
import {
  PLATFORM_NAV,
  platformItemFor,
  type PlatformNavItem,
} from '@app/router/platform-navigation';
import { ActionIcons, ControlIcons, Icon } from '@shared/ui/icons';
import { IconButton } from '@shared/ui/primitives';
import { PageErrorBoundary } from '@shared/ui/boundary';
import { useMediaQuery } from '@shared/ui/product';
import { SHELL_BREAKPOINT } from './AppShell';
import { AccountMenu, BrandMark, CrumbSeparator, RegisterMark, ThemeToggle } from './shell-parts';
import { ShellSearch, useSignOut } from './shell-search';

export function PlatformShell() {
  const { user, organizations } = useAuth();
  const signOut = useSignOut('the control plane');
  const location = useLocation();
  const navigate = useNavigate();
  const narrow = useMediaQuery(`(max-width: ${SHELL_BREAKPOINT})`);

  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!narrow) setDrawerOpen(false);
  }, [narrow]);

  const owner = platformItemFor(location.pathname);

  /**
   * Where "Organization application" goes.
   *
   * An operator always has a session in *some* organization — their own, or one
   * they entered — so there is always somewhere to return to. The chooser is
   * the right destination only when they genuinely have a choice to make.
   */
  const exitTo = organizations.length > 1 ? '/choose-organization' : '/dashboard';

  return (
    <div className="uwv-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      {narrow ? (
        <PlatformDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} exitTo={exitTo} />
      ) : (
        <div className="uwv-nav" style={{ width: 'var(--sidebar-width)' }}>
          <nav aria-label="Platform" className="uwv-nav-inner">
            <PlatformWordmark />
            <PlatformSections />
            {/* The way back into an organization's application. Explicit, and
                at the foot of the console rather than in it — leaving the
                control plane is not one of its destinations. */}
            <div className="uwv-nav-foot">
              <button type="button" className="uwv-nav-foot-button" onClick={() => navigate(exitTo)}>
                <Icon icon={ControlIcons.goTo} size="nav" />
                Organization application
              </button>
            </div>
          </nav>
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--atmosphere)' }}>
        <header aria-label="Platform" className="uwv-topbar">
          {narrow ? (
            <IconButton
              label="Open platform navigation"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
            >
              <Icon icon={ControlIcons.menu} />
            </IconButton>
          ) : null}

          {narrow ? (
            <span style={{ flex: 1 }} />
          ) : (
            <nav aria-label="Breadcrumb" style={{ flex: 1, minWidth: 0 }}>
              <ol className="uwv-crumbs">
                <li>Platform</li>
                {owner ? (
                  <li style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                    <CrumbSeparator />
                    <span aria-current="page">{owner.item.label}</span>
                  </li>
                ) : null}
              </ol>
            </nav>
          )}
          <ShellSearch kind="platform" compact={narrow} />

          {/* The persistent register mark. A screenshot from here must be
              unambiguous. */}
          <RegisterMark
            tone="accent"
            title="You are in the platform control plane, above every organization."
          >
            Platform
          </RegisterMark>
          <ThemeToggle />

          <AccountMenu
            name={user?.display_name ?? ''}
            subject={user?.subject ?? ''}
            compact={narrow}
            open={menuOpen}
            onOpenChange={setMenuOpen}
            actions={[
              { label: 'Organization application', icon: ActionIcons.enter, onSelect: () => navigate(exitTo) },
              {
                label: 'Sign out',
                icon: ActionIcons.signOut,
                tone: 'danger',
                onSelect: () => {
                  setMenuOpen(false);
                  void signOut();
                },
              },
            ]}
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
            overflowX: 'hidden',
          }}
        >
          <PageErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </PageErrorBoundary>
        </main>
      </div>
    </div>
  );
}

function PlatformSections() {
  return (
    <div className="uwv-nav-scroll">
      {PLATFORM_NAV.map((section) => (
        <div key={section.id} className="uwv-nav-group">
          <div className="uwv-nav-group-label">{section.label}</div>
          <ul>
            {section.items.map((item) => (
              <li key={item.id}>
                <PlatformLink item={item} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function PlatformLink({ item }: { item: PlatformNavItem }) {
  return (
    <NavLink to={item.path} end={!item.matchNested} title={item.hint} className="uwv-nav-link">
      <span className="uwv-nav-link-icon" aria-hidden="true">
        <Icon icon={item.icon} size="nav" />
      </span>
      <span className="uwv-nav-link-label">{item.label}</span>
      {/* Said before the click. A destination that is structural-only announces
          itself in the navigation rather than after the navigation. */}
      {item.readiness === 'awaiting' ? (
        <span className="uwv-nav-link-meta" aria-label="Not connected yet">
          soon
        </span>
      ) : null}
    </NavLink>
  );
}

function PlatformWordmark() {
  return (
    <div className="uwv-nav-brand">
      <Link to="/platform" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0, color: 'inherit', textDecoration: 'none' }}>
        <BrandMark />
        <span style={{ minWidth: 0 }}>
          <span className="uwv-nav-brand-name">UnityWorks</span>
          <span className="uwv-nav-brand-sub">Control plane</span>
        </span>
      </Link>
    </div>
  );
}

function PlatformDrawer({ open, onClose, exitTo }: { open: boolean; onClose: () => void; exitTo: string }) {
  const navigate = useNavigate();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="uwv-nav-scrim" onClick={onClose}>
      <div ref={panel} tabIndex={-1} className="uwv-nav-drawer" onClick={(event) => event.stopPropagation()}>
        <nav aria-label="Platform" style={{ display: 'contents' }}>
          <div className="uwv-nav-brand" style={{ justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
              <BrandMark />
              <span style={{ minWidth: 0 }}>
                <span className="uwv-nav-brand-name">UnityWorks</span>
                <span className="uwv-nav-brand-sub">Control plane</span>
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
          <PlatformSections />
          <div className="uwv-nav-foot">
            <button type="button" className="uwv-nav-foot-button" onClick={() => navigate(exitTo)}>
              <Icon icon={ControlIcons.goTo} size="nav" />
              Organization application
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
}

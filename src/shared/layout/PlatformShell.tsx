/**
 * The Platform Control Plane's shell.
 *
 * ### Why this is a second shell and not a third register inside `AppShell`
 *
 * `AppShell` is an *organisation's* application shell. Everything in it is
 * about one tenant: it names the active organisation at the head of the
 * sidebar, it filters navigation by the permissions held inside that tenant, it
 * carries a live-connection indicator for that tenant's cameras, and its
 * breadcrumb is rooted in that tenant's information architecture.
 *
 * The control plane has no tenant. Rendering it inside `AppShell` — which is
 * what `/platform/organizations` did before this — put a cross-customer console
 * inside one customer's navigation, visually asserting that the console
 * belonged to whichever organisation happened to be selected. That is not a
 * styling problem; it is the route table contradicting the domain model.
 *
 * So: two shells, and the boundary between them is the thing the product is
 * actually made of.
 *
 *     /platform/*   → PlatformShell   no tenant, cross-organisation
 *     everything else → AppShell      one tenant, from the token
 *
 * ### What it deliberately does not carry
 *
 * No connection indicator: there is no tenant whose cameras it could describe.
 * No permission filtering: a `PlatformOperator` holds no `Permission`, and the
 * gate is on the route group instead. No organisation name: naming one would
 * re-introduce exactly the confusion this shell exists to remove — even when
 * the session happens to be inside an organisation, the console above it is
 * not about that organisation.
 *
 * ### The register is cold on purpose
 *
 * It borrows the device the engineering register already established: a
 * distinct ground and a persistent mark, so that a screenshot of this console
 * is unambiguous about which half of the product it came from. Three registers
 * now exist — product, engineering, platform — and each one means "you are not
 * where you usually are."
 */

import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@app/auth/AuthProvider';
import {
  PLATFORM_NAV,
  platformItemFor,
  type PlatformNavItem,
} from '@app/router/platform-navigation';
import { useTheme } from '@shared/theme/theme';
import { ControlIcons, Icon } from '@shared/ui/icons';
import { Button, IconButton } from '@shared/ui/primitives';
import { useMediaQuery } from '@shared/ui/product';
import { SHELL_BREAKPOINT } from './AppShell';

export function PlatformShell() {
  const { user, logout, organizations } = useAuth();
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
   * Where "Leave the console" goes.
   *
   * An operator always has a session in *some* organisation — their own, or one
   * they entered — so there is always somewhere to return to. The chooser is
   * the right destination only when they genuinely have a choice to make.
   */
  const exitTo = organizations.length > 1 ? '/choose-organization' : '/dashboard';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--ground)' }}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      {narrow ? (
        <PlatformDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      ) : (
        <div
          style={{
            flexShrink: 0,
            width: 'var(--sidebar-width)',
            background: 'var(--surface-engineering, var(--surface-raised))',
            borderRight: '1px solid var(--line-default)',
          }}
        >
          <nav
            aria-label="Platform"
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              position: 'sticky',
              top: 0,
              height: '100vh',
            }}
          >
            <PlatformWordmark />
            <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4) var(--space-2)' }}>
              {PLATFORM_NAV.map((section) => (
                <div key={section.id} style={{ marginBottom: 'var(--space-5)' }}>
                  <div
                    style={{
                      padding: '0 var(--space-3)',
                      marginBottom: 'var(--space-2)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-2xs)',
                      letterSpacing: 'var(--tracking-wider)',
                      textTransform: 'uppercase',
                      color: 'var(--ink-tertiary)',
                    }}
                  >
                    {section.label}
                  </div>
                  {section.items.map((item) => (
                    <PlatformLink key={item.id} item={item} />
                  ))}
                </div>
              ))}
            </div>

            {/* The way back into an organisation's application. Explicit, and
                at the foot of the console rather than in it — leaving the
                control plane is not one of its destinations. */}
            <div style={{ padding: 'var(--space-3)', borderTop: '1px solid var(--line-subtle)' }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(exitTo)}
                style={{ width: '100%', justifyContent: 'flex-start' }}
              >
                <Icon icon={ControlIcons.goTo} size="inline" />
                Organisation application
              </Button>
            </div>
          </nav>
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header
          aria-label="Platform"
          style={{
            height: 'var(--topbar-height)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            padding: '0 var(--space-5)',
            borderBottom: '1px solid var(--line-default)',
            background: 'var(--surface-engineering, var(--surface-raised))',
            position: 'sticky',
            top: 0,
            zIndex: 'var(--z-sticky)' as unknown as number,
          }}
        >
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
              <ol
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  fontSize: 'var(--text-sm)',
                  color: 'var(--ink-secondary)',
                }}
              >
                <li>Platform</li>
                {owner ? (
                  <>
                    <li aria-hidden="true" style={{ color: 'var(--ink-tertiary)' }}>
                      /
                    </li>
                    <li style={{ color: 'var(--ink-primary)' }}>{owner.item.label}</li>
                  </>
                ) : null}
              </ol>
            </nav>
          )}

          <PlatformMark />
          <ThemeControl />

          <div style={{ position: 'relative' }}>
            <Button size="sm" variant="ghost" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-haspopup="menu">
              <span
                aria-hidden="true"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: 'var(--accent-wash)',
                  color: 'var(--accent)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 'var(--text-2xs)',
                  fontWeight: 'var(--weight-semibold)',
                }}
              >
                {(user?.display_name || user?.subject || '?').slice(0, 1).toUpperCase()}
              </span>
              <span
                style={{
                  maxWidth: narrow ? '4.5rem' : '12rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {user?.display_name || user?.subject}
              </span>
            </Button>

            {menuOpen ? (
              <div
                role="menu"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 6px)',
                  minWidth: '15rem',
                  background: 'var(--surface-overlay)',
                  border: '1px solid var(--line-default)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-md)',
                  padding: 'var(--space-3)',
                  zIndex: 'var(--z-drawer)' as unknown as number,
                }}
              >
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)' }}>
                  Signed in as
                </div>
                <div style={{ fontSize: 'var(--text-sm)', wordBreak: 'break-all' }}>
                  {user?.subject}
                </div>
                <div style={{ borderTop: '1px solid var(--line-subtle)', margin: 'var(--space-3) 0' }} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(exitTo)}
                  role="menuitem"
                  style={{ width: '100%' }}
                >
                  Organisation application
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void logout()}
                  role="menuitem"
                  style={{ width: '100%' }}
                >
                  Sign out
                </Button>
              </div>
            ) : null}
          </div>
        </header>

        <main
          id="main"
          style={{
            flex: 1,
            paddingTop: 'var(--space-8)',
            paddingRight: 'var(--space-6)',
            paddingLeft: 'var(--space-6)',
            paddingBottom: 'var(--space-12)',
            maxWidth: 'var(--content-max)',
            width: '100%',
            minWidth: 0,
            overflowX: 'hidden',
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function PlatformLink({ item }: { item: PlatformNavItem }) {
  return (
    <NavLink
      to={item.path}
      end={!item.matchNested}
      title={item.hint}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-2) var(--space-3)',
        borderRadius: 'var(--radius-sm)',
        color: isActive ? 'var(--ink-primary)' : 'var(--ink-secondary)',
        background: isActive ? 'var(--surface-hover)' : 'transparent',
        textDecoration: 'none',
        fontSize: 'var(--text-sm)',
      })}
    >
      <Icon icon={item.icon} size="inline" />
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {item.label}
      </span>
      {/* Said before the click. A destination that is structural-only announces
          itself in the navigation rather than after the navigation. */}
      {item.readiness === 'awaiting' ? (
        <span
          aria-label="Not connected yet"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-2xs)',
            color: 'var(--ink-tertiary)',
          }}
        >
          soon
        </span>
      ) : null}
    </NavLink>
  );
}

function PlatformWordmark() {
  return (
    <div
      style={{
        height: 'var(--topbar-height)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: '0 var(--space-4)',
        borderBottom: '1px solid var(--line-subtle)',
        flexShrink: 0,
      }}
    >
      <Link
        to="/platform"
        style={{ textDecoration: 'none', color: 'inherit', minWidth: 0 }}
      >
        <span
          style={{
            display: 'block',
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--weight-semibold)',
            letterSpacing: 'var(--tracking-tight)',
            whiteSpace: 'nowrap',
          }}
        >
          UnityWorks
        </span>
        <span
          style={{
            display: 'block',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-2xs)',
            letterSpacing: 'var(--tracking-wide)',
            textTransform: 'uppercase',
            color: 'var(--ink-tertiary)',
          }}
        >
          Control plane
        </span>
      </Link>
    </div>
  );
}

/** The persistent register mark. A screenshot from here must be unambiguous. */
function PlatformMark() {
  return (
    <span
      title="You are in the platform control plane, above every organisation."
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.15rem 0.5rem',
        borderRadius: 'var(--radius-xs)',
        border: '1px solid var(--line-default)',
        color: 'var(--ink-secondary)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-2xs)',
        letterSpacing: 'var(--tracking-wide)',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      Platform
    </span>
  );
}

function ThemeControl() {
  const { theme, toggle } = useTheme();
  const label = theme === 'dark' ? 'Dark theme — switch to light' : 'Light theme — switch to dark';
  return (
    <IconButton label={label} onClick={toggle}>
      <Icon icon={ControlIcons.theme} />
    </IconButton>
  );
}

function PlatformDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--scrim, rgba(0,0,0,0.5))',
          zIndex: 'var(--z-drawer)' as unknown as number,
        }}
      />
      <nav
        aria-label="Platform"
        style={{
          position: 'fixed',
          insetBlock: 0,
          left: 0,
          width: 'var(--sidebar-width)',
          background: 'var(--surface-raised)',
          borderRight: '1px solid var(--line-default)',
          zIndex: 'var(--z-drawer)' as unknown as number,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3)' }}>
          <PlatformWordmark />
          <IconButton label="Close navigation" onClick={onClose}>
            <Icon icon={ControlIcons.close} />
          </IconButton>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2)' }}>
          {PLATFORM_NAV.map((section) => (
            <div key={section.id} style={{ marginBottom: 'var(--space-5)' }}>
              <div
                style={{
                  padding: '0 var(--space-3)',
                  marginBottom: 'var(--space-2)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-2xs)',
                  letterSpacing: 'var(--tracking-wider)',
                  textTransform: 'uppercase',
                  color: 'var(--ink-tertiary)',
                }}
              >
                {section.label}
              </div>
              {section.items.map((item) => (
                <PlatformLink key={item.id} item={item} />
              ))}
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}

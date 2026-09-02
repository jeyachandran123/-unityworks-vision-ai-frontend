/**
 * The application shell.
 *
 * One shell for both experiences. Product routes and DevTools routes render
 * inside it, so navigation, identity, connection state and breadcrumbs are
 * implemented once and cannot drift between the two.
 *
 * The shell is stable across navigation: only `<Outlet />` changes. A page that
 * re-created its own header would be a page whose header could be wrong.
 */

import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@app/auth/AuthProvider';
import { hasAny, roleLabel, type Permission } from '@app/permissions/permissions';
import {
  DEVTOOLS_ENTRY,
  PRODUCT_NAV,
  trailFor,
  visibleItems,
} from '@app/router/navigation';
import { useConnectionStatus } from '@shared/realtime/useConnection';
import { useTheme } from '@shared/theme/theme';
import { Button, IconButton, StatusBadge, type HealthTone } from '@shared/ui/primitives';

const COLLAPSE_KEY = 'uwv.sidebar.collapsed';

export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(
    () => window.localStorage.getItem(COLLAPSE_KEY) === '1',
  );
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  // Close the user menu on navigation, so it never survives into a page where
  // it makes no sense.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const can = (permissions: Permission[]) => permissions.length === 0 || hasAny(user, permissions);
  const sections = visibleItems(PRODUCT_NAV, can);
  const showDevtools = can(DEVTOOLS_ENTRY.permissions);
  const trail = trailFor(location.pathname);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--surface-base)' }}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <nav
        aria-label="Primary"
        style={{
          width: collapsed ? 'var(--sidebar-width-collapsed)' : 'var(--sidebar-width)',
          flexShrink: 0,
          background: 'var(--surface-raised)',
          borderRight: '1px solid var(--line-subtle)',
          display: 'flex',
          flexDirection: 'column',
          position: 'sticky',
          top: 0,
          height: '100vh',
          transition: 'width var(--motion-base) var(--ease-out)',
        }}
      >
        <div
          style={{
            height: 'var(--topbar-height)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            padding: `0 var(--space-3)`,
            borderBottom: '1px solid var(--line-subtle)',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 22,
              height: 22,
              borderRadius: 'var(--radius-xs)',
              background: 'var(--accent)',
              color: 'var(--ink-on-accent)',
              display: 'grid',
              placeItems: 'center',
              fontSize: 'var(--text-2xs)',
              fontWeight: 'var(--weight-bold)',
              flexShrink: 0,
            }}
          >
            UW
          </span>
          {collapsed ? null : (
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', whiteSpace: 'nowrap' }}>
              Vision AI
            </span>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-3) var(--space-2)' }}>
          {sections.map((section) => (
            <div key={section.id} style={{ marginBottom: 'var(--space-5)' }}>
              {collapsed ? null : (
                <div
                  style={{
                    fontSize: 'var(--text-2xs)',
                    textTransform: 'uppercase',
                    letterSpacing: 'var(--tracking-wider)',
                    color: 'var(--ink-tertiary)',
                    padding: `0 var(--space-3) var(--space-2)`,
                  }}
                >
                  {section.label}
                </div>
              )}
              <ul>
                {section.items.map((item) => (
                  <li key={item.id}>
                    <SidebarLink
                      to={item.path}
                      glyph={item.glyph}
                      label={item.label}
                      hint={item.hint}
                      collapsed={collapsed}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {showDevtools ? (
            <div style={{ marginTop: 'auto', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--line-subtle)' }}>
              {collapsed ? null : (
                <div
                  style={{
                    fontSize: 'var(--text-2xs)',
                    textTransform: 'uppercase',
                    letterSpacing: 'var(--tracking-wider)',
                    color: 'var(--ink-tertiary)',
                    padding: `0 var(--space-3) var(--space-2)`,
                  }}
                >
                  Engineering
                </div>
              )}
              <SidebarLink
                to={DEVTOOLS_ENTRY.path}
                glyph={DEVTOOLS_ENTRY.glyph}
                label={DEVTOOLS_ENTRY.label}
                hint={DEVTOOLS_ENTRY.hint}
                collapsed={collapsed}
              />
            </div>
          ) : null}
        </div>

        <div style={{ padding: 'var(--space-2)', borderTop: '1px solid var(--line-subtle)' }}>
          <IconButton
            label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? '»' : '«'}
          </IconButton>
        </div>
      </nav>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header
          style={{
            height: 'var(--topbar-height)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-4)',
            padding: `0 var(--space-6)`,
            borderBottom: '1px solid var(--line-subtle)',
            background: 'var(--surface-raised)',
            position: 'sticky',
            top: 0,
            zIndex: 'var(--z-sticky)' as unknown as number,
          }}
        >
          <nav aria-label="Breadcrumb" style={{ flex: 1, minWidth: 0 }}>
            <ol style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)' }}>
              {trail.map((crumb, index) => (
                <li key={crumb} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                  {index > 0 ? <span aria-hidden="true">/</span> : null}
                  <span
                    style={index === trail.length - 1 ? { color: 'var(--ink-primary)', fontWeight: 'var(--weight-medium)' } : undefined}
                    aria-current={index === trail.length - 1 ? 'page' : undefined}
                  >
                    {crumb}
                  </span>
                </li>
              ))}
            </ol>
          </nav>

          <ThemeToggle />

          <ConnectionIndicator />

          <div style={{ position: 'relative' }}>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setMenuOpen((value) => !value)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
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
              <span style={{ maxWidth: '12rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)' }}>Signed in as</div>
                <div style={{ fontSize: 'var(--text-sm)', wordBreak: 'break-all' }}>{user?.subject}</div>
                <div style={{ marginTop: 'var(--space-2)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
                  {user?.roles.map((role) => (
                    <span
                      key={role}
                      style={{
                        fontSize: 'var(--text-2xs)',
                        padding: '0.1rem 0.35rem',
                        borderRadius: 'var(--radius-xs)',
                        background: 'var(--surface-hover)',
                        color: 'var(--ink-secondary)',
                      }}
                    >
                      {roleLabel(role)}
                    </span>
                  ))}
                </div>
                <div style={{ borderTop: '1px solid var(--line-subtle)', margin: 'var(--space-3) 0' }} />
                <Button variant="ghost" size="sm" onClick={() => void logout()} role="menuitem" style={{ width: '100%' }}>
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
            padding: 'var(--space-6)',
            maxWidth: 'var(--content-max)',
            width: '100%',
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

function SidebarLink({
  to,
  glyph,
  label,
  hint,
  collapsed,
}: {
  to: string;
  glyph: string;
  label: string;
  hint: string;
  collapsed: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={to === '/devtools/vision'}
      title={collapsed ? `${label} — ${hint}` : hint}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: `var(--space-2) var(--space-3)`,
        borderRadius: 'var(--radius-sm)',
        fontSize: 'var(--text-sm)',
        color: isActive ? 'var(--ink-primary)' : 'var(--ink-secondary)',
        background: isActive ? 'var(--surface-selected)' : 'transparent',
        textDecoration: 'none',
        marginBottom: 2,
        whiteSpace: 'nowrap',
      })}
    >
      <span aria-hidden="true" style={{ width: '1rem', textAlign: 'center', flexShrink: 0 }}>
        {glyph}
      </span>
      {collapsed ? <span className="sr-only">{label}</span> : label}
    </NavLink>
  );
}

/**
 * The theme switch.
 *
 * Glyph and position are deliberately fixed. A control whose icon changes shape
 * every time it is used is a control the operator has to find again on each
 * shift, and this one sits in a topbar people scan rather than read. The state
 * and the action live in the accessible name instead — announced by a screen
 * reader, and shown as the native tooltip on hover.
 *
 * `IconButton` rather than a bespoke control, so it inherits the ghost button
 * surface, the focus ring and the required accessible name that every other
 * icon-only control in this shell already has.
 */
function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const label = theme === 'dark' ? 'Dark theme — switch to light' : 'Light theme — switch to dark';

  return (
    <IconButton label={label} onClick={toggle}>
      <span aria-hidden="true">◐</span>
    </IconButton>
  );
}

/**
 * Connection state, stated as two facts.
 *
 * "Connected · no live camera source yet" rather than "LIVE". A green badge lit
 * by an open socket over a camera that does not exist is the single most
 * misleading thing this shell could render.
 */
function ConnectionIndicator() {
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
    <Link to="/live" style={{ textDecoration: 'none' }} title={status.detail}>
      <StatusBadge tone={tone}>{status.detail}</StatusBadge>
    </Link>
  );
}

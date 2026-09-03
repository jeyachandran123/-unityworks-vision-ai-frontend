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
 * ── What Stage 3 changed here ───────────────────────────────────────────────
 *
 * **Areas, not a list.** Five sections, each naming the question it answers,
 * with the engineering area carrying its own ground. The DevTools branch that
 * used to be written by hand at the bottom of the sidebar is gone: engineering
 * is an ordinary area that declares `register: 'engineering'`, so there is one
 * rendering path and one permission filter rather than two.
 *
 * **The sidebar becomes a drawer below `--shell-breakpoint`.** This is the
 * fix for the horizontal overflow that has existed on *every* page in the
 * product since Phase 0 — 633px of content in a 420px viewport, measured
 * identically on Dashboard, Live, Hygiene and Model Evaluation. It was never a
 * page's bug and was never fixable inside one. A drawer is not a narrow
 * sidebar: it traps focus, closes on Escape, and does not exist in the tab
 * order when shut.
 *
 * **The topbar carries the register.** A page in the engineering area says so,
 * persistently, so a screenshot in a bug report is unambiguous — the stated
 * purpose in `UI_UX_ARCHITECTURE.md` §3, asked for in Phase 0 and never built.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
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
import { useTheme } from '@shared/theme/theme';
import { Button, IconButton, StatusBadge, type HealthTone } from '@shared/ui/primitives';
import { Readiness, useMediaQuery } from '@shared/ui/product';

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
  const { user, logout } = useAuth();
  const location = useLocation();
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

  return (
    // The shell is furniture and stands on the canvas; the page is the reading
    // plane and stands on the shell. Before Stage 5 both were --surface-base,
    // which is why the sidebar, the topbar and the content all read as one
    // undifferentiated field with hairlines drawn on it.
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--ground)' }}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      {narrow ? (
        <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} sections={sections} />
      ) : (
        // Two elements, because the sidebar has two jobs and they need
        // different heights. The outer column is *furniture*: it stretches to
        // the full height of the document so the shell's material runs the
        // length of the page — without it the surface stopped at 100vh and
        // every page taller than the viewport showed a hard edge with the
        // canvas below it, which in the light theme read as a rendering fault.
        // The inner nav is the *content*: one viewport tall, sticky, with its
        // own scroll region, so the collapse control at its foot stays reachable
        // rather than sitting at the bottom of whatever page is open.
        <div
          style={{
            flexShrink: 0,
            background: 'var(--surface-raised)',
            borderRight: '1px solid var(--line-default)',
            width: collapsed ? 'var(--sidebar-width-collapsed)' : 'var(--sidebar-width)',
            transition: 'width var(--motion-base) var(--ease-out)',
          }}
        >
        <nav
          aria-label="Primary"
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            position: 'sticky',
            top: 0,
            height: '100vh',
          }}
        >
          <Wordmark collapsed={collapsed} />
          <SectionList sections={sections} collapsed={collapsed} />
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
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header
          aria-label="Application"
          style={{
            height: 'var(--topbar-height)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            padding: `0 var(--space-5)`,
            borderBottom: `1px solid ${engineering ? 'var(--engineering-line)' : 'var(--line-subtle)'}`,
            background: engineering ? 'var(--surface-engineering)' : 'var(--surface-raised)',
            position: 'sticky',
            top: 0,
            zIndex: 'var(--z-sticky)' as unknown as number,
            transition: 'background var(--motion-base) var(--ease-out)',
          }}
        >
          {narrow ? (
            <IconButton
              label="Open navigation"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
            >
              ☰
            </IconButton>
          ) : null}

          {/* The breadcrumb is the first thing to go at narrow widths. It names
              the area and the page, and at this size both are already answered
              — by the drawer the operator just came from, and by the page's own
              title immediately below. Keeping it was what actually overflowed
              the topbar: five controls that each refused to shrink came to
              519px inside a 430px viewport, on every page in the product. */}
          {narrow ? <span style={{ flex: 1 }} /> : <Breadcrumb />}

          {engineering ? <RegisterMark /> : null}

          <ThemeToggle />
          <ConnectionIndicator compact={narrow} />

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
          // The spine: a hairline down the left of the content that every
          // section boundary ties itself to, with the section label set in the
          // margin beside it. It lives here rather than in a per-page wrapper
          // because it is a property of the content column, and because a
          // wrapper is something a new page can forget — which is exactly how
          // fourteen of nineteen pages came to be on the previous opening.
          className="uwv-spine"
          style={{
            flex: 1,
            // Asymmetric: more room above a page's opening than below its end,
            // because a composition needs air at the top to read as composed.
            //
            // Deliberately *not* the `padding` shorthand. The spine's gutter is
            // a left padding set by `.uwv-spine`, and an inline shorthand wins
            // over a stylesheet unconditionally — with `padding` here the rule
            // was drawn but the labels had nowhere to sit, so the gutter
            // measured 24px instead of 40 and every section label overlapped its
            // own content column.
            paddingTop: 'var(--space-8)',
            paddingRight: 'var(--space-6)',
            paddingBottom: 'var(--space-12)',
            maxWidth: 'var(--content-max)',
            width: '100%',
            minWidth: 0,
            // A page never scrolls sideways; wide content scrolls inside its
            // own container instead.
            overflowX: 'hidden',
            // The one gradient in the product. It gives the interface a light
            // source: the page is fractionally brighter where reading begins
            // and settles into the ground below. An engineering page declines
            // it — that register is a flat, cold ground on purpose, and a
            // gradient there would soften exactly the thing it exists to say.
            background: engineering ? 'var(--surface-engineering)' : 'var(--atmosphere)',
            backgroundAttachment: 'fixed',
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/* ── the sidebar's parts ──────────────────────────────────────────────────── */

/**
 * The mark: an aperture.
 *
 * The previous mark was the letters `UW` in a rounded teal square, which is the
 * mark every B2B dashboard has. This one is the same device the camera tiles
 * use — four viewfinder ticks around a picture — reduced to 20px, with the
 * centre lit. It means the product identifies itself with the thing it actually
 * does, and it means the identity appears at two scales: once in the corner of
 * the application, and once around every frame of footage in it.
 *
 * Drawn rather than fetched. There is no webfont in this product for reasons
 * `tokens.css` sets out, and there is no logo file for the same ones.
 */
function Mark() {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      style={{ flexShrink: 0, display: 'block' }}
    >
      <path
        d="M1 6V1h5M14 1h5v5M19 14v5h-5M6 19H1v-5"
        stroke="var(--accent)"
        strokeWidth="1.6"
        strokeLinecap="square"
      />
      <circle cx="10" cy="10" r="2.6" fill="var(--accent)" />
    </svg>
  );
}

function Wordmark({ collapsed }: { collapsed: boolean }) {
  return (
    <div
      style={{
        height: 'var(--topbar-height)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: `0 var(--space-4)`,
        borderBottom: '1px solid var(--line-subtle)',
        flexShrink: 0,
      }}
    >
      <Mark />
      {collapsed ? null : (
        <span style={{ minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--weight-semibold)',
              letterSpacing: 'var(--tracking-tight)',
              whiteSpace: 'nowrap',
            }}
          >
            Vision AI
          </span>
        </span>
      )}
    </div>
  );
}

function SectionList({ sections, collapsed }: { sections: NavSection[]; collapsed: boolean }) {
  // Which area the current route belongs to. Only that area explains itself.
  //
  // Stage 2 gave every area a one-line blurb and it was right to: an operator
  // who cannot tell Compliance from Intelligence cannot navigate. But five
  // blurbs cost ~130px of a sidebar that already holds twenty destinations, and
  // Stage 5 measured the consequence — on a 900px screen the Platform and
  // Engineering areas were below the fold, so two of the five areas were
  // invisible on arrival. Showing the blurb for the area you are actually in
  // keeps the orientation exactly where it is useful and returns the fold.
  const here = itemFor(useLocation().pathname)?.section.id;
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4) var(--space-2)' }}>
      {sections.map((section) => {
        const isEngineering = section.register === 'engineering';
        return (
          <div
            key={section.id}
            style={{
              marginBottom: 'var(--space-4)',
              // The engineering area is set into its own ground with a hard rule
              // above it. Separation by material, not by position — position was
              // what made it read as a footnote.
              ...(isEngineering
                ? {
                    background: 'var(--surface-engineering)',
                    border: '1px solid var(--engineering-line)',
                    borderRadius: 'var(--radius-sm)',
                    padding: 'var(--space-3) var(--space-2)',
                    marginTop: 'var(--space-6)',
                  }
                : {}),
            }}
          >
            {collapsed ? null : (
              <div style={{ padding: `0 var(--space-3) var(--space-3)` }}>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-2xs)',
                    textTransform: 'uppercase',
                    letterSpacing: 'var(--tracking-wider)',
                    color: isEngineering ? 'var(--engineering-ink)' : 'var(--ink-tertiary)',
                    fontWeight: 'var(--weight-medium)',
                  }}
                >
                  {section.label}
                </div>
                {section.id === here ? (
                  <div
                    style={{
                      fontSize: 'var(--text-2xs)',
                      color: 'var(--ink-tertiary)',
                      marginTop: 2,
                      opacity: 0.75,
                    }}
                  >
                    {section.blurb}
                  </div>
                ) : null}
              </div>
            )}
            <ul>
              {section.items.map((item) => (
                <li key={item.id}>
                  <SidebarLink item={item} collapsed={collapsed} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
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
      style={({ isActive }) => ({
        position: 'relative',
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
        fontWeight: isActive ? 'var(--weight-medium)' : 'var(--weight-regular)',
        transition: 'background var(--motion-fast) var(--ease-out), color var(--motion-fast) var(--ease-out)',
      })}
    >
      {({ isActive }) => (
        <>
          {/* The active marker is a bar at the edge rather than only a fill, so
              the current destination is findable without relying on a subtle
              background difference. */}
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              insetInlineStart: 0,
              insetBlock: '18%',
              width: 2,
              borderRadius: 2,
              background: isActive ? 'var(--accent)' : 'transparent',
            }}
          />
          <span aria-hidden="true" style={{ width: '1rem', textAlign: 'center', flexShrink: 0, opacity: isActive ? 1 : 0.7 }}>
            {item.glyph}
          </span>
          {collapsed ? (
            <span className="sr-only">{item.label}</span>
          ) : (
            <>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.label}
              </span>
              {readiness ? (
                <span
                  aria-hidden="true"
                  title={readiness === 'awaiting' ? 'Awaiting a data source' : 'Blocked pending legal review'}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-2xs)',
                    color: 'var(--ink-tertiary)',
                    flexShrink: 0,
                  }}
                >
                  {readiness === 'awaiting' ? '◌' : '⊘'}
                </span>
              ) : null}
              {/* The text half of the marker, for anyone who cannot see the
                  glyph. Deliberately short: this is a navigation label, and the
                  page itself states the full reason. The wording is also kept
                  distinct from the page's own sentence so that "the sidebar
                  says a module is blocked" and "the page says why" remain two
                  separately findable facts. */}
              {readiness ? (
                <span className="sr-only">
                  {readiness === 'awaiting' ? 'awaiting a data source' : 'blocked'}
                </span>
              ) : null}
            </>
          )}
        </>
      )}
    </NavLink>
  );
}

/**
 * The sidebar as a drawer, for viewports where it cannot be furniture.
 *
 * Focus moves in on open and `Escape` closes it, because a panel that covers
 * the page and cannot be dismissed from the keyboard is a trap. It is not
 * rendered at all when closed — an `aria-hidden` panel still in the tab order
 * is the most common accessibility defect in responsive dashboards.
 */
function NavDrawer({
  open,
  onClose,
  sections,
}: {
  open: boolean;
  onClose: () => void;
  sections: NavSection[];
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
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-drawer)' as unknown as number,
        background: 'rgb(0 0 0 / 0.5)',
        animation: 'uwv-fade-in var(--motion-fast) var(--ease-out)',
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(var(--sidebar-width), 84vw)',
          height: '100%',
          background: 'var(--surface-raised)',
          borderRight: '1px solid var(--line-default)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'uwv-slide-in-left var(--motion-base) var(--ease-entrance)',
          outline: 'none',
        }}
      >
        <nav aria-label="Primary" style={{ display: 'contents' }}>
          <div
            style={{
              height: 'var(--topbar-height)',
              display: 'flex',
              alignItems: 'center',
              padding: `0 var(--space-3)`,
              borderBottom: '1px solid var(--line-subtle)',
              flexShrink: 0,
              gap: 'var(--space-3)',
            }}
          >
            <span style={{ flex: 1, fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)' }}>
              Vision AI
            </span>
            <IconButton label="Close navigation" onClick={onClose}>
              ✕
            </IconButton>
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
 * On a list route the trail is area / page and the page is the current
 * location, so nothing is a link. On an object route — the three added in
 * Stage 2 — the middle crumb is the list the object came from, which is the
 * only genuinely useful navigation a breadcrumb ever offers.
 */
function Breadcrumb() {
  const location = useLocation();
  const owner = itemFor(location.pathname);

  if (!owner) {
    return (
      <nav aria-label="Breadcrumb" style={{ flex: 1, minWidth: 0 }}>
        <ol style={crumbListStyle}>
          <li style={{ color: 'var(--ink-primary)' }} aria-current="page">
            {location.pathname}
          </li>
        </ol>
      </nav>
    );
  }

  const deeper = location.pathname !== owner.item.path;

  return (
    <nav aria-label="Breadcrumb" style={{ flex: 1, minWidth: 0 }}>
      <ol style={crumbListStyle}>
        <li>{owner.section.label}</li>
        <li style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <span aria-hidden="true">/</span>
          {deeper ? (
            <Link to={owner.item.path} style={{ color: 'var(--ink-secondary)' }}>
              {owner.item.label}
            </Link>
          ) : (
            <span style={{ color: 'var(--ink-primary)', fontWeight: 'var(--weight-medium)' }} aria-current="page">
              {owner.item.label}
            </span>
          )}
        </li>
      </ol>
    </nav>
  );
}

const crumbListStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  fontSize: 'var(--text-xs)',
  color: 'var(--ink-tertiary)',
  minWidth: 0,
  overflow: 'hidden',
  whiteSpace: 'nowrap' as const,
};

/**
 * The persistent engineering marker.
 *
 * Present whenever the current route is in the engineering area, so a developer
 * holding both roles always knows which surface they are on and a screenshot in
 * a bug report is unambiguous. Phase 0 asked for exactly this and it was never
 * built.
 */
function RegisterMark() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: '0.1rem 0.5rem',
        borderRadius: 'var(--radius-xs)',
        border: '1px solid var(--engineering-line)',
        color: 'var(--engineering-ink)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-2xs)',
        letterSpacing: 'var(--tracking-wide)',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      <span aria-hidden="true" style={{ width: 5, height: 5, background: 'var(--engineering-ink)', transform: 'rotate(45deg)' }} />
      Engineering surface
    </span>
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
    <Link to="/live" style={{ textDecoration: 'none', flexShrink: 0 }} title={status.detail}>
      {/* Compact is the dot alone, with the same sentence in the accessible
          name and the tooltip. The state is never dropped, only the room it
          takes — a badge reading "Connected · no live camera source yet" is
          four words too many for a 430px topbar and none too many for a
          screen reader. */}
      <StatusBadge tone={tone}>
        {compact ? <span className="sr-only">{status.detail}</span> : status.detail}
      </StatusBadge>
    </Link>
  );
}

/** Re-exported so a feature can mark its own awaiting state consistently. */
export { Readiness };

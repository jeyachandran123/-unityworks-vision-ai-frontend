/**
 * The Vision OS DevTools workspace.
 *
 * One application, two experiences. This is the engineering half: it shares the
 * shell, the auth, the permissions, the API client and the design system with
 * the product, and diverges only in density and vocabulary.
 *
 * **It is deliberately visually distinct.** A developer who holds both roles
 * must always know which surface they are looking at, and a screenshot in a bug
 * report must be unambiguous. The banner and the secondary rail do that without
 * a second theme.
 *
 * Engineering names stay engineering names. "Crops" and "Attributes" are not
 * renamed for consistency with the product — an engineer debugging the crop gate
 * needs it to be called the crop gate.
 */

import { NavLink, Outlet } from 'react-router-dom';
import { DEVTOOLS_NAV } from '@app/router/navigation';

export default function DevToolsLayout() {
  return (
    <div style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'flex-start' }}>
      <nav
        aria-label="Vision OS sections"
        style={{
          width: '13rem',
          flexShrink: 0,
          position: 'sticky',
          top: 'calc(var(--topbar-height) + var(--space-6))',
        }}
      >
        <div
          style={{
            padding: 'var(--space-3)',
            marginBottom: 'var(--space-4)',
            border: '1px solid var(--accent-line)',
            background: 'var(--accent-wash)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <div
            style={{
              fontSize: 'var(--text-2xs)',
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-wider)',
              color: 'var(--accent)',
              fontWeight: 'var(--weight-semibold)',
            }}
          >
            Engineering
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-secondary)', marginTop: 'var(--space-1)' }}>
            Vision OS internals. Not part of the operator product.
          </div>
        </div>

        {DEVTOOLS_NAV.map((section) => (
          <div key={section.id} style={{ marginBottom: 'var(--space-4)' }}>
            <div
              style={{
                fontSize: 'var(--text-2xs)',
                textTransform: 'uppercase',
                letterSpacing: 'var(--tracking-wider)',
                color: 'var(--ink-tertiary)',
                padding: `0 var(--space-2) var(--space-2)`,
              }}
            >
              {section.label}
            </div>
            <ul>
              {section.items.map((item) => (
                <li key={item.id}>
                  <NavLink
                    to={item.path}
                    end={item.path === '/devtools/vision'}
                    title={item.hint}
                    style={({ isActive }) => ({
                      display: 'block',
                      padding: `var(--space-2) var(--space-3)`,
                      borderRadius: 'var(--radius-xs)',
                      fontSize: 'var(--text-xs)',
                      color: isActive ? 'var(--ink-primary)' : 'var(--ink-secondary)',
                      background: isActive ? 'var(--surface-selected)' : 'transparent',
                      textDecoration: 'none',
                      marginBottom: 1,
                    })}
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div style={{ flex: 1, minWidth: 0 }}>
        <Outlet />
      </div>
    </div>
  );
}

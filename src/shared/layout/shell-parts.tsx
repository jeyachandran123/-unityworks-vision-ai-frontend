/**
 * The pieces both shells are built from.
 *
 * An organization's application (`AppShell`) and the platform console
 * (`PlatformShell`) are deliberately two shells — one has a tenant and one has
 * none — but they are one product, and before this module they had drifted:
 * two account menus, two theme switches and two marks, each styled on its own.
 * What does not depend on having a tenant lives here once, and both shells
 * compose it.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { useTheme } from '@shared/theme/theme';
import { ControlIcons, Icon, type LucideIcon } from '@shared/ui/icons';
import { IconButton } from '@shared/ui/primitives';
import { initialsOf } from '@shared/ui/surfaces';

/**
 * The mark: an aperture.
 *
 * The same device the camera tiles use — four viewfinder ticks around a
 * picture — reduced to 18px, with the centre lit. Drawn rather than fetched:
 * there is no logo file and no webfont in this product, for the reasons
 * `tokens.css` sets out.
 */
export function BrandMark() {
  return (
    <span className="uwv-nav-brand-mark" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ display: 'block' }}>
        <path
          d="M1 6V1h5M14 1h5v5M19 14v5h-5M6 19H1v-5"
          stroke="var(--nav-accent)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="10" cy="10" r="2.8" fill="var(--nav-accent)" />
      </svg>
    </span>
  );
}

/**
 * The theme switch.
 *
 * Glyph and position are fixed: a control whose icon changes shape every time
 * it is used is a control the operator has to find again on each shift. The
 * state and the action live in the accessible name instead.
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const label = theme === 'dark' ? 'Dark theme — switch to light' : 'Light theme — switch to dark';
  return (
    <IconButton label={label} onClick={toggle}>
      <Icon icon={ControlIcons.theme} />
    </IconButton>
  );
}

/** A framed marker in the topbar: which register, or whose authority, this is. */
export function RegisterMark({
  tone,
  title,
  children,
}: {
  tone: 'accent' | 'attention' | 'engineering' | 'neutral';
  title?: string;
  children: ReactNode;
}) {
  return (
    <span className="uwv-register-mark" data-tone={tone === 'neutral' ? undefined : tone} title={title}>
      {children}
    </span>
  );
}

export interface MenuAction {
  label: string;
  onSelect: () => void;
  tone?: 'danger';
  icon?: LucideIcon;
}

/**
 * The account control at the right of the topbar, and its menu.
 *
 * The trigger is the person's initial and name; the menu says who is signed in
 * and offers the few ways out of the current place. It closes on Escape, on a
 * click outside it, and on navigation (the shells reset `open` themselves).
 */
export function AccountMenu({
  name,
  subject,
  compact,
  details,
  actions,
  open,
  onOpenChange,
}: {
  name: string;
  subject: string;
  compact: boolean;
  /** Extra facts under "Signed in as" — the organization, the roles. */
  details?: ReactNode;
  actions: MenuAction[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const items = () => [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false);
        trigger.current?.focus();
        return;
      }
      // Arrows walk the menu, the way `role="menu"` promises they will.
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const list = items();
      if (list.length === 0) return;
      event.preventDefault();
      const at = list.indexOf(document.activeElement as HTMLElement);
      const next = event.key === 'ArrowDown' ? (at + 1) % list.length : (at - 1 + list.length) % list.length;
      list[next]?.focus();
    };
    const onPointer = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) onOpenChange(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={root} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        ref={trigger}
        type="button"
        className="uwv-btn"
        data-variant="ghost"
        data-size="sm"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        style={{ paddingLeft: 'var(--space-1)', gap: 'var(--space-2)' }}
      >
        <span className="uwv-avatar" aria-hidden="true">
          {initialsOf(name || subject || '?')}
        </span>
        <span
          style={{
            maxWidth: compact ? '4.5rem' : '12rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: 'var(--ink-primary)',
          }}
        >
          {name || subject}
        </span>
        <span aria-hidden="true" style={{ display: 'flex', transform: 'rotate(90deg)', color: 'var(--ink-tertiary)' }}>
          <Icon icon={ControlIcons.disclosure} size="inline" />
        </span>
      </button>

      {open ? (
        <div role="menu" className="uwv-menu">
          <div className="uwv-menu-head">
            <div className="uwv-menu-caption">Signed in as</div>
            <div className="uwv-menu-value">{subject}</div>
            {details}
          </div>
          <div className="uwv-menu-rule" />
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              className="uwv-menu-item"
              data-tone={action.tone}
              onClick={action.onSelect}
            >
              {action.icon ? <Icon icon={action.icon} size="control" /> : null}
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The separator between two breadcrumbs: a chevron, silent to a screen reader. */
export function CrumbSeparator() {
  return (
    <span className="uwv-crumbs-sep" aria-hidden="true">
      <Icon icon={ControlIcons.disclosure} size="inline" />
    </span>
  );
}

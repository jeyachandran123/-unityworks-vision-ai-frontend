/**
 * The topbar's search, and the shells' way out — both shared by the two shells.
 *
 * ### What the palette can find
 *
 * - **Pages**: every destination this account can reach, read from the same
 *   navigation model that draws the sidebar — so it never offers a page that
 *   would only redirect.
 * - **Organizations and people**: from the backend's own search, and only where
 *   the backend has one this account may call. In an organization that means
 *   people, and only for an account that may open a person; on the platform it
 *   means organizations and people across every customer.
 * - **Acts**: the theme, the way to the other shell, signing out.
 *
 * Nothing is indexed here and nothing is invented: an empty answer from the
 * server is shown as one.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@app/auth/AuthProvider';
import { hasAll, hasAny, PERMISSIONS, type Permission } from '@app/permissions/permissions';
import { PRODUCT_NAV, visibleItems } from '@app/router/navigation';
import { PLATFORM_NAV } from '@app/router/platform-navigation';
import { platformAdminApi, platformApi } from '@shared/api/platform';
import { adminUsersApi } from '@shared/api/user-administration';
import { useTheme } from '@shared/theme/theme';
import {
  CommandPalette,
  CommandTrigger,
  useCommandShortcut,
  type CommandGroup,
  type CommandItem,
} from '@shared/ui/command';
import { useSettled } from '@shared/ui/data-table';
import { ActionIcons, ControlIcons, DataIcons, EntityIcons, Icon } from '@shared/ui/icons';
import { useConfirm } from '@shared/ui/overlays';
import { IconButton } from '@shared/ui/primitives';
import { Avatar } from '@shared/ui/surfaces';

/**
 * Sign out, after asking.
 *
 * Asked because the account menu sits one slip away from the switcher, and on
 * a shared kitchen screen an accidental sign-out costs the next person a
 * password they may not have. The question shows *which* account is about to
 * leave and *where* from — on a shared screen that is the part people get
 * wrong — and names what will be needed to come back.
 */
export function useSignOut(place: string) {
  const { logout, user } = useAuth();
  const confirm = useConfirm();
  return async () => {
    const name = user?.display_name || user?.subject || 'This account';
    const ok = await confirm({
      title: 'Sign out?',
      body: `You will need to sign in again to return to ${place}.`,
      icon: ActionIcons.signOut,
      detail: user ? (
        <div className="uwv-identity-card">
          <Avatar name={name} seed={user.subject} size="md" />
          <span className="uwv-cell-stack">
            <span className="uwv-cell-title">{name}</span>
            <span className="uwv-cell-sub">{user.subject}</span>
          </span>
          <span className="uwv-identity-card-place">
            <Icon icon={EntityIcons.organization} size="inline" />
            Signed in to <strong>{place}</strong>
          </span>
        </div>
      ) : undefined,
      confirmLabel: 'Sign out',
      cancelLabel: 'Cancel',
      tone: 'default',
    });
    if (ok) await logout();
  };
}

export function ShellSearch({ kind, compact }: { kind: 'app' | 'platform'; compact: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const settled = useSettled(query.trim(), 200);
  const navigate = useNavigate();
  const { user, isPlatformOperator, organizations } = useAuth();
  const theme = useTheme();
  const signOut = useSignOut(kind === 'platform' ? 'the control plane' : 'this organization');

  useCommandShortcut(() => setOpen(true));

  const can = (permissions: Permission[], mode: 'any' | 'all' = 'any') =>
    permissions.length === 0 || (mode === 'all' ? hasAll(user, permissions) : hasAny(user, permissions));
  const mayOpenPeople = kind === 'platform' || hasAny(user, [PERMISSIONS.manageUsers]);

  const organizationsFound = useQuery({
    queryKey: ['command', 'organizations', settled],
    queryFn: () => platformApi.organizations({ q: settled, limit: 6 }),
    enabled: open && kind === 'platform' && settled.length > 0,
    staleTime: 15_000,
  });

  const peopleFound = useQuery({
    queryKey: ['command', kind, 'people', settled],
    queryFn: async () =>
      kind === 'platform'
        ? (await platformAdminApi.people({ q: settled, limit: 6 })).people.map((person) => ({
            id: person.id,
            name: person.display_name || person.email,
            detail: person.email,
          }))
        : (await adminUsersApi.list({ q: settled, limit: 6 })).users.map((person) => ({
            id: person.id,
            name: person.display_name || person.email,
            detail: person.email,
          })),
    enabled: open && mayOpenPeople && settled.length > 0,
    staleTime: 15_000,
  });

  const groups = useMemo<CommandGroup[]>(() => {
    const go = (path: string) => () => navigate(path);
    const pages: CommandItem[] =
      kind === 'platform'
        ? PLATFORM_NAV.flatMap((section) =>
            section.items.map((item) => ({
              id: item.id,
              label: item.label,
              hint: `${section.label} · ${item.hint}`,
              icon: item.icon,
              onSelect: go(item.path),
            })),
          )
        : visibleItems(PRODUCT_NAV, can).flatMap((section) =>
            section.items.map((item) => ({
              id: item.id,
              label: item.label,
              hint: `${section.label} · ${item.hint}`,
              icon: item.icon,
              onSelect: go(item.path),
            })),
          );

    const found: CommandGroup[] = [];
    if (kind === 'platform' && organizationsFound.data) {
      found.push({
        id: 'organizations',
        label: 'Organizations',
        preMatched: true,
        items: organizationsFound.data.organizations.map((organization) => ({
          id: organization.id,
          label: organization.name,
          hint: `${organization.status[0]!.toUpperCase()}${organization.status.slice(1)} · ${organization.user_count} people · ${organization.camera_count} cameras`,
          icon: EntityIcons.organization,
          onSelect: go(`/platform/organizations/${encodeURIComponent(organization.id)}`),
        })),
      });
    }
    if (peopleFound.data) {
      found.push({
        id: 'people',
        label: 'People',
        preMatched: true,
        items: peopleFound.data.map((person) => ({
          id: person.id,
          label: person.name,
          hint: person.detail,
          icon: EntityIcons.person,
          onSelect: go(
            kind === 'platform'
              ? `/platform/people/${encodeURIComponent(person.id)}`
              : `/admin/people/${encodeURIComponent(person.id)}`,
          ),
        })),
      });
    }

    const acts: CommandItem[] = [
      {
        id: 'theme',
        label: theme.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        icon: ControlIcons.theme,
        keywords: 'theme dark light appearance',
        onSelect: theme.toggle,
      },
      ...(kind === 'platform'
        ? organizations.length > 0
          ? [
              {
                id: 'application',
                label: 'Open the organization application',
                icon: ActionIcons.enter,
                keywords: 'switch organization',
                onSelect: go('/choose-organization'),
              },
            ]
          : []
        : isPlatformOperator
          ? [{ id: 'platform', label: 'Platform control plane', icon: EntityIcons.organization, onSelect: go('/platform') }]
          : organizations.length > 1
            ? [{ id: 'switch', label: 'Switch organization', icon: ActionIcons.enter, onSelect: go('/choose-organization') }]
            : []),
      { id: 'sign-out', label: 'Sign out', icon: ActionIcons.signOut, keywords: 'log out logout', onSelect: () => void signOut() },
    ];

    return [{ id: 'pages', label: 'Go to', items: pages }, ...found, { id: 'acts', label: 'Actions', items: acts }];
    // `can` and `signOut` are rebuilt per render from the same inputs listed here.
  }, [kind, navigate, organizationsFound.data, peopleFound.data, theme, organizations.length, isPlatformOperator, user]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      {compact ? (
        <IconButton label="Search" onClick={() => setOpen(true)} aria-keyshortcuts="Control+K Meta+K">
          <Icon icon={DataIcons.search} />
        </IconButton>
      ) : (
        <CommandTrigger
          onOpen={() => setOpen(true)}
          label={kind === 'platform' ? 'Search organizations, people, pages…' : 'Search pages and people…'}
        />
      )}
      <CommandPalette
        open={open}
        onClose={close}
        query={query}
        onQuery={setQuery}
        groups={groups}
        searching={organizationsFound.isFetching || peopleFound.isFetching}
        placeholder={kind === 'platform' ? 'Search organizations, people and pages…' : 'Search pages and people…'}
      />
    </>
  );
}

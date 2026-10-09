/**
 * People — who works here, and what they can reach.
 *
 * ### Adding somebody is the access matrix
 *
 * Account Details → Permissions → Review & Submit (`person-access.tsx`): the
 * same grid the platform console uses, pinned to this organization, offering
 * only what the administrator may give.
 *
 * An account's reach is *permissions* and *camera scope*, and the second was
 * once invisible in every screen. That was not cosmetic: accounts were being
 * created with no camera grant at all, which reads as "no cameras" — so they
 * signed in, held every permission their role carried, and could see nothing.
 * So camera access sits beside the ticks, is always sent, and the review step
 * names it before anything is created.
 *
 * ### The generated password is shown once
 *
 * When no password is supplied the server generates one and returns it in the
 * creation response only. It is never stored by this client and never fetched
 * again, so the screen that shows it says plainly that this is the only time.
 *
 * ### The roster is the server's
 *
 * Searched, filtered by role and account state, and paged by the server. Not
 * sortable — the API has no sort.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '@app/auth/AuthProvider';
import {
  adminUsersApi,
  type AdminUser,
  type ScopeBreadth,
} from '@shared/api/user-administration';
import { PERMISSIONS, ROLES, roleLabel } from '@app/permissions/permissions';
import { PermissionGate, usePermissions } from '@app/permissions/guards';
import { isApiError } from '@shared/api/errors';
import {
  BulkActionBar,
  DataGrid,
  downloadCsv,
  FilterChips,
  filterValue,
  Pagination,
  TableCard,
  TableToolbar,
  ViewTabs,
  useTableState,
  type FilterDefinition,
  type GridColumn,
} from '@shared/ui/data-table';
import { useToast } from '@shared/ui/feedback';
import { ActionIcons, Icon, PlatformIcons } from '@shared/ui/icons';
import { ConfirmDialog } from '@shared/ui/overlays';
import { Badge, Button, EmptyState } from '@shared/ui/primitives';
import { PageIntro, Region } from '@shared/ui/product';
import { Avatar, StatusPill } from '@shared/ui/surfaces';

import { AddPersonFlow } from './person-access';

type View = 'all' | 'active' | 'inactive';

const ROLE_FILTER: FilterDefinition = {
  id: 'role',
  label: 'Role',
  single: true,
  options: Object.values(ROLES).map((value) => ({ value, label: roleLabel(value) })),
};

function relative(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(iso).toLocaleDateString();
}

export function PeoplePage() {
  const { has } = usePermissions();
  const { user: me } = useAuth();
  const client = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const table = useTableState('admin-people', { pageSize: 25 });
  const [view, setView] = useState<View>('all');
  const [adding, setAdding] = useState(false);
  const [bulk, setBulk] = useState<'activate' | 'deactivate' | null>(null);
  const [single, setSingle] = useState<{ user: AdminUser; act: 'activate' | 'deactivate' } | null>(null);
  const canManage = has(PERMISSIONS.manageUsers);

  const role = filterValue(table.filters, 'role');
  const params = useMemo(
    () => ({
      q: table.query || undefined,
      role,
      is_active: view === 'all' ? undefined : view === 'active',
      limit: table.pageSize,
      offset: table.offset,
    }),
    [table.query, role, view, table.pageSize, table.offset],
  );

  const people = useQuery({
    queryKey: ['admin-users', params],
    queryFn: () => adminUsersApi.list(params),
    placeholderData: (previous) => previous,
  });

  // The counts beside each view are the server's totals for that view, asked
  // for with the same search and role — one row each, only the total is read.
  const countFor = (state: boolean | undefined) => ({
    queryKey: ['admin-users', 'count', { q: params.q, role, state }],
    queryFn: () => adminUsersApi.list({ q: params.q, role, is_active: state, limit: 1, offset: 0 }),
    select: (list: { total: number }) => list.total,
  });
  const allCount = useQuery(countFor(undefined));
  const activeCount = useQuery(countFor(true));
  const inactiveCount = useQuery(countFor(false));

  const rows = people.data?.users ?? [];
  const isMe = (user: AdminUser) => Boolean(me && me.subject === user.email);
  const selectedRows = rows.filter((user) => table.selected.has(user.id));

  const refresh = () => void client.invalidateQueries({ queryKey: ['admin-users'] });

  const change = useMutation({
    mutationFn: async ({ users, act }: { users: ReadonlyArray<AdminUser>; act: 'activate' | 'deactivate' }) =>
      Promise.allSettled(users.map((user) => (act === 'activate' ? adminUsersApi.activate(user.id) : adminUsersApi.deactivate(user.id)))),
    onSuccess: (results, { users, act }) => {
      refresh();
      const done = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - done;
      const verb = act === 'activate' ? 'activated' : 'deactivated';
      if (done > 0) {
        toast.success(
          users.length === 1 ? `${users[0]!.display_name || users[0]!.email} ${verb}` : `${done} ${done === 1 ? 'account' : 'accounts'} ${verb}`,
          act === 'deactivate' ? { description: 'Signed out and refused login immediately.' } : undefined,
        );
      }
      if (failed > 0) {
        const first = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
        toast.error(`${failed} ${failed === 1 ? 'account' : 'accounts'} could not be changed`, {
          description: isApiError(first?.reason) ? first.reason.friendlyMessage : undefined,
        });
      }
      setBulk(null);
      setSingle(null);
      table.setSelected(new Set());
    },
  });

  const columns: ReadonlyArray<GridColumn<AdminUser>> = [
    {
      key: 'name',
      header: 'Person',
      render: (user) => (
        <span className="uwv-cell-primary">
          <Avatar name={user.display_name || user.email} seed={user.id} muted={!user.is_active} />
          <span className="uwv-cell-stack">
            {canManage ? (
              <Link className="uwv-cell-title" to={`/admin/people/${encodeURIComponent(user.id)}`}>
                {user.display_name || user.email}
              </Link>
            ) : (
              <span className="uwv-cell-title">{user.display_name || user.email}</span>
            )}
            <span className="uwv-cell-sub">{user.email}</span>
          </span>
        </span>
      ),
      exportValue: (user) => user.display_name || user.email,
    },
    {
      key: 'roles',
      header: 'Roles',
      render: (user) =>
        user.roles.length === 0 ? (
          <span className="uwv-cell-muted">None</span>
        ) : (
          <span style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
            {user.roles.map((held) => (
              <Badge key={held} tone={held === ROLES.orgAdmin ? 'accent' : 'neutral'}>
                {roleLabel(held)}
              </Badge>
            ))}
          </span>
        ),
      exportValue: (user) => user.roles.map(roleLabel).join('; '),
    },
    {
      key: 'cameras',
      header: 'Cameras',
      render: (user) => <ScopeSummary scope={user.camera_scope} />,
      exportValue: (user) =>
        user.camera_scope?.breadth === 'all_in_tenant'
          ? 'All cameras'
          : `${user.camera_scope?.camera_keys?.length ?? 0} cameras`,
    },
    {
      key: 'status',
      header: 'Account',
      render: (user) => (
        <StatusPill tone={user.is_active ? 'online' : 'idle'}>{user.is_active ? 'Active' : 'Deactivated'}</StatusPill>
      ),
      exportValue: (user) => (user.is_active ? 'Active' : 'Deactivated'),
    },
    {
      key: 'seen',
      header: 'Last signed in',
      render: (user) => <span className="uwv-cell-muted">{relative(user.last_login_at)}</span>,
      exportValue: (user) => user.last_login_at,
    },
  ];

  const bulkTargets =
    bulk === 'activate' ? selectedRows.filter((u) => !u.is_active) : selectedRows.filter((u) => u.is_active && !isMe(u));

  return (
    <>
      <PageIntro
        eyebrow="Organization"
        title="People"
        standfirst="Everyone with an account here, the roles they hold, and the cameras they can reach."
        actions={
          <PermissionGate permission={PERMISSIONS.manageUsers}>
            <Button
              variant={adding ? 'secondary' : 'primary'}
              icon={adding ? undefined : <Icon icon={ActionIcons.add} />}
              onClick={() => setAdding((open) => !open)}
            >
              {adding ? 'Cancel' : 'Add a person'}
            </Button>
          </PermissionGate>
        }
      />

      {adding ? (
        <Region order={2} style={{ marginBottom: 'var(--space-8)' }}>
          {/* Deliberately not closed on success. The generated password is
              shown exactly once and is never fetched again, so unmounting the
              flow the moment the account exists would destroy the only copy
              anyone will ever see. The person closes it when they have it. */}
          <AddPersonFlow onCreated={refresh} onClose={() => setAdding(false)} />
        </Region>
      ) : null}

      <section className="uwv-arrive" data-order={adding ? 3 : 2} aria-label="People in this organization">
        <TableCard label="People">
          <TableToolbar
            state={table}
            leading={
              <ViewTabs<View>
                label="Account state"
                value={view}
                onChange={(next) => {
                  setView(next);
                  table.setOffset(0);
                  table.setSelected(new Set());
                }}
                views={[
                  { id: 'all', label: 'All', count: allCount.data ?? null },
                  { id: 'active', label: 'Active', count: activeCount.data ?? null },
                  { id: 'inactive', label: 'Deactivated', count: inactiveCount.data ?? null },
                ]}
              />
            }
            searchLabel="Search people"
            searchPlaceholder="Search by name or email…"
            searching={people.isFetching && table.query !== ''}
            filters={[ROLE_FILTER]}
            columns={columns}
            actions={
              <Button
                variant="ghost"
                icon={<Icon icon={ActionIcons.export} />}
                disabled={rows.length === 0}
                onClick={() => downloadCsv('people.csv', columns, rows)}
              >
                Export page
              </Button>
            }
          />
          <FilterChips filters={[ROLE_FILTER]} state={table} />
          {canManage ? (
            <BulkActionBar count={table.selected.size} noun="people" onClear={() => table.setSelected(new Set())}>
              {selectedRows.some((u) => u.is_active && !isMe(u)) ? (
                <Button size="sm" variant="secondary" onClick={() => setBulk('deactivate')}>
                  Deactivate
                </Button>
              ) : null}
              {selectedRows.some((u) => !u.is_active) ? (
                <Button size="sm" variant="secondary" onClick={() => setBulk('activate')}>
                  Activate
                </Button>
              ) : null}
              <Button size="sm" variant="secondary" onClick={() => downloadCsv('people-selected.csv', columns, selectedRows)}>
                Export CSV
              </Button>
            </BulkActionBar>
          ) : null}
          <DataGrid<AdminUser>
            caption="People in this organization"
            columns={columns}
            rows={rows}
            rowKey={(user) => user.id}
            hidden={table.hidden}
            density={table.density}
            loading={people.isLoading}
            error={people.error}
            onRetry={() => void people.refetch()}
            narrowed={table.narrowed || view !== 'all'}
            selection={
              canManage
                ? {
                    selected: table.selected,
                    onChange: table.setSelected,
                    label: (user) => `Select ${user.display_name || user.email}`,
                    // Your own account is not something you can switch off from here.
                    canSelect: (user) => !isMe(user),
                  }
                : undefined
            }
            rowActions={
              canManage
                ? (user) => [
                    {
                      id: 'view',
                      label: 'View profile',
                      icon: ActionIcons.view,
                      onSelect: () => navigate(`/admin/people/${encodeURIComponent(user.id)}`),
                    },
                    {
                      id: 'access',
                      label: 'Edit access',
                      icon: PlatformIcons.access,
                      onSelect: () => navigate(`/admin/people/${encodeURIComponent(user.id)}#access`),
                    },
                    { id: 'sep', type: 'separator' },
                    user.is_active
                      ? {
                          id: 'deactivate',
                          label: 'Deactivate…',
                          icon: ActionIcons.suspend,
                          tone: 'danger',
                          disabled: isMe(user),
                          hint: isMe(user) ? 'Not your own account' : undefined,
                          onSelect: () => setSingle({ user, act: 'deactivate' }),
                        }
                      : {
                          id: 'activate',
                          label: 'Activate',
                          icon: ActionIcons.activate,
                          onSelect: () => change.mutate({ users: [user], act: 'activate' }),
                        },
                  ]
                : undefined
            }
            rowActionsLabel={(user) => `Actions for ${user.display_name || user.email}`}
            onRowOpen={canManage ? (user) => navigate(`/admin/people/${encodeURIComponent(user.id)}`) : undefined}
            empty={
              <EmptyState
                title="Nobody here yet"
                body={canManage ? 'Add the first person — the review step names exactly what they will reach.' : 'Nobody has an account here yet.'}
              />
            }
            noResults={
              <EmptyState
                title="Nobody matches"
                body={canManage ? 'Try clearing the filters, or add someone.' : 'Try clearing the filters.'}
                action={
                  <Button
                    size="sm"
                    onClick={() => {
                      table.clearFilters();
                      setView('all');
                    }}
                  >
                    Clear search and filters
                  </Button>
                }
              />
            }
          />
          {people.data && people.data.total > 0 ? (
            <Pagination
              total={people.data.total}
              offset={table.offset}
              limit={table.pageSize}
              onOffset={table.setOffset}
              onLimit={table.setPageSize}
              noun="people"
              busy={people.isFetching}
            />
          ) : null}
        </TableCard>
      </section>

      <ConfirmDialog
        open={bulk !== null}
        title={
          bulk === 'activate'
            ? `Activate ${bulkTargets.length} ${bulkTargets.length === 1 ? 'account' : 'accounts'}?`
            : `Deactivate ${bulkTargets.length} ${bulkTargets.length === 1 ? 'account' : 'accounts'}?`
        }
        confirmLabel={bulk === 'activate' ? 'Activate' : 'Deactivate'}
        tone={bulk === 'deactivate' ? 'danger' : 'default'}
        pending={change.isPending}
        onConfirm={() => bulk && change.mutate({ users: bulkTargets, act: bulk })}
        onCancel={() => setBulk(null)}
      >
        <p>
          {bulk === 'deactivate'
            ? 'Each is signed out and refused login immediately. It can be undone by activating them again.'
            : 'Each can sign in again, with the roles and cameras they held before.'}
        </p>
        <p className="uwv-type-caption">{bulkTargets.map((u) => u.display_name || u.email).join(', ')}</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={single !== null}
        title={`Deactivate ${single?.user.email ?? ''}?`}
        confirmLabel="Deactivate"
        tone="danger"
        pending={change.isPending}
        onConfirm={() => single && change.mutate({ users: [single.user], act: single.act })}
        onCancel={() => setSingle(null)}
      >
        <p>
          This account will be signed out and refused login immediately. It can be undone by activating the account again,
          but if this is your organization's only administrator it may leave nobody able to reverse it — check before
          continuing.
        </p>
      </ConfirmDialog>
    </>
  );
}

/** A camera scope, in one short phrase. Never a bare number. */
export function ScopeSummary({
  scope,
}: {
  scope: { breadth: ScopeBreadth; camera_keys: string[] } | undefined;
}) {
  // A missing scope reads as none — the same reading the server gives a
  // missing grant row, and the only one that cannot accidentally widen access.
  if (!scope) return <span style={{ color: 'var(--ink-tertiary)' }}>None</span>;
  if (scope.breadth === 'all_in_tenant') return <>All cameras</>;
  if (scope.breadth === 'listed') {
    const count = scope.camera_keys?.length ?? 0;
    return (
      <>
        {count} camera{count === 1 ? '' : 's'}
      </>
    );
  }
  return <span style={{ color: 'var(--ink-tertiary)' }}>None</span>;
}

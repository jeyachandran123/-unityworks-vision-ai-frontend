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
 */

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import {
  adminUsersApi,
  type AdminUser,
  type ScopeBreadth,
} from '@shared/api/user-administration';
import { PERMISSIONS, ROLES, roleLabel } from '@app/permissions/permissions';
import { PermissionGate, usePermissions } from '@app/permissions/guards';
import {
  Badge,
  Button,
  type Column,
  DataTable,
  EmptyState,
  LoadingState,
  Select,
  StatusBadge,
} from '@shared/ui/primitives';
import { PageIntro, Plane, Region, SectionRule } from '@shared/ui/product';

import { AddPersonFlow } from './person-access';
import { Failed, Pager, SearchField, useDebounced, when } from './shared';

const PAGE = 25;

export function PeoplePage() {
  const { has } = usePermissions();
  const client = useQueryClient();

  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [showing, setShowing] = useState<'all' | 'active' | 'inactive'>('all');
  const [offset, setOffset] = useState(0);
  const [adding, setAdding] = useState(false);
  const q = useDebounced(search);

  const params = useMemo(
    () => ({
      q: q.trim() || undefined,
      role: role || undefined,
      is_active: showing === 'all' ? undefined : showing === 'active',
      limit: PAGE,
      offset,
    }),
    [q, role, showing, offset],
  );

  const people = useQuery({
    queryKey: ['admin-users', params],
    queryFn: () => adminUsersApi.list(params),
  });

  const columns: ReadonlyArray<Column<AdminUser>> = [
    {
      key: 'name',
      header: 'Person',
      render: (user) => (
        <Link to={`/admin/people/${encodeURIComponent(user.id)}`}>
          {user.display_name || user.email}
        </Link>
      ),
    },
    { key: 'email', header: 'Email', render: (user) => user.email },
    {
      key: 'roles',
      header: 'Roles',
      render: (user) =>
        user.roles.length === 0 ? (
          <span style={{ color: 'var(--text-muted)' }}>None</span>
        ) : (
          <span style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {user.roles.map((held) => (
              <Badge key={held}>{roleLabel(held)}</Badge>
            ))}
          </span>
        ),
    },
    {
      key: 'cameras',
      header: 'Cameras',
      render: (user) => <ScopeSummary scope={user.camera_scope} />,
    },
    {
      key: 'status',
      header: 'Account',
      render: (user) => (
        <StatusBadge tone={user.is_active ? 'online' : 'offline'}>
          {user.is_active ? 'Active' : 'Deactivated'}
        </StatusBadge>
      ),
    },
    { key: 'seen', header: 'Last signed in', render: (user) => when(user.last_login_at) },
  ];

  return (
    <>
      <PageIntro
        eyebrow="organization"
        title="People"
        standfirst="Everyone with an account here, the roles they hold, and the cameras they can reach."
        actions={
          <PermissionGate permission={PERMISSIONS.manageUsers}>
            <Button onClick={() => setAdding((open) => !open)}>
              {adding ? 'Cancel' : 'Add a person'}
            </Button>
          </PermissionGate>
        }
      />

      {adding ? (
        <Region order={2}>
          {/* Deliberately not closed on success. The generated password is
              shown exactly once and is never fetched again, so unmounting the
              flow the moment the account exists would destroy the only copy
              anyone will ever see. The person closes it when they have it. */}
          <AddPersonFlow
            onCreated={() => void client.invalidateQueries({ queryKey: ['admin-users'] })}
            onClose={() => setAdding(false)}
          />
        </Region>
      ) : null}

      <Region order={adding ? 3 : 2}>
        <SectionRule
          lead
          label="People"
          detail={people.data ? `${people.data.total} in this organization` : 'Reading the roster'}
          actions={
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-3)',
                alignItems: 'flex-end',
                flexWrap: 'wrap',
              }}
            >
              <SearchField
                label="Search"
                value={search}
                placeholder="Name or email"
                onChange={(next) => {
                  setSearch(next);
                  setOffset(0);
                }}
              />
              <Select
                label="Role"
                value={role}
                onChange={(event) => {
                  setRole(event.target.value);
                  setOffset(0);
                }}
              >
                <option value="">Any role</option>
                {Object.values(ROLES).map((value) => (
                  <option key={value} value={value}>
                    {roleLabel(value)}
                  </option>
                ))}
              </Select>
              <Select
                label="Account"
                value={showing}
                onChange={(event) => {
                  setShowing(event.target.value as typeof showing);
                  setOffset(0);
                }}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Deactivated</option>
              </Select>
            </div>
          }
        />
        <Plane>
          {people.isLoading ? <LoadingState label="Reading people" /> : null}
          {people.isError ? <Failed error={people.error} /> : null}
          {people.data ? (
            <>
              <DataTable
                caption="People in this organization"
                columns={columns}
                rows={people.data.users}
                rowKey={(user) => user.id}
                empty={
                  <EmptyState
                    title="Nobody matches"
                    body={
                      has(PERMISSIONS.manageUsers)
                        ? 'Try clearing the filters, or add someone.'
                        : 'Try clearing the filters.'
                    }
                  />
                }
              />
              <Pager
                noun="people"
                offset={people.data.offset}
                limit={people.data.limit}
                total={people.data.total}
                count={people.data.count}
                onOffset={setOffset}
              />
            </>
          ) : null}
        </Plane>
      </Region>
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
  if (!scope) return <span style={{ color: 'var(--text-muted)' }}>None</span>;
  if (scope.breadth === 'all_in_tenant') return <>All cameras</>;
  if (scope.breadth === 'listed') {
    return (
      <>
        {scope.camera_keys.length} camera{scope.camera_keys.length === 1 ? '' : 's'}
      </>
    );
  }
  return <span style={{ color: 'var(--text-muted)' }}>None</span>;
}

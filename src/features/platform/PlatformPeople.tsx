/**
 * People — everyone on the platform, and what they may enter.
 *
 * ### Membership here; access in the matrix
 *
 * This page answers "who exists across the platform, and which customers can
 * they reach", and it administers **membership** — the entry ticket. What a
 * person may do inside each organization is set on the access matrix
 * (`/platform/people/:id/access`, `PersonAccess.tsx`), which writes the same
 * role and override rows an Organization Admin writes from `/admin/users/:id`
 * and audits every change into the organization it changes. That is not a back
 * door: the Platform Admin can already enter any organization with every
 * permission and do the same from inside it.
 *
 * ### Home organization and memberships are always shown separately
 *
 * `home_organization_id` is where the account *lives*: it owns email
 * uniqueness and it is where a failed login is filed. It is not, by itself,
 * permission to enter anywhere. `memberships` is what the person may actually
 * enter. For nearly every account the two agree — and the moment they stop
 * agreeing is exactly when somebody needs to see both, so the page never
 * collapses them into one "organization" column.
 *
 * ### The directory is the server's
 *
 * Searched, filtered by organization and paged by the server, so the count is
 * the server's total. It is not sortable: the API has no sort.
 */

import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  platformAdminApi,
  platformApi,
  type Person,
  type PersonMembership,
} from '@shared/api/platform';
import { roleLabel } from '@app/permissions/permissions';
import { isApiError } from '@shared/api/errors';
import {
  DataGrid,
  downloadCsv,
  FilterChips,
  filterValue,
  Pagination,
  TableCard,
  TableToolbar,
  useTableState,
  type FilterDefinition,
  type GridColumn,
} from '@shared/ui/data-table';
import { Callout, useToast } from '@shared/ui/feedback';
import { ActionIcons, EntityIcons, Icon, PlatformIcons } from '@shared/ui/icons';
import { ConfirmDialog } from '@shared/ui/overlays';
import { Badge, Button, EmptyState, ErrorState, LoadingState, Select } from '@shared/ui/primitives';
import { PageIntro } from '@shared/ui/product';
import { Avatar, ButtonLink, FactList, MetricTile, Panel, StatusPill, initialsOf } from '@shared/ui/surfaces';

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

function failure(error: unknown, fallback: string): string {
  return isApiError(error) ? error.friendlyMessage : fallback;
}

/* ── the directory ────────────────────────────────────────────────────────── */

export function PlatformPeoplePage() {
  const navigate = useNavigate();
  const table = useTableState('platform-people', { pageSize: 25 });

  const organizations = useQuery({
    queryKey: ['platform', 'organizations', 'for-filter'],
    queryFn: () => platformApi.organizations({ limit: 200 }),
  });
  const overview = useQuery({
    queryKey: ['platform', 'overview'],
    queryFn: () => platformAdminApi.overview(),
    staleTime: 30_000,
  });

  const organizationId = filterValue(table.filters, 'organization');
  const params = useMemo(
    () => ({ q: table.query || undefined, organization_id: organizationId, limit: table.pageSize, offset: table.offset }),
    [table.query, organizationId, table.pageSize, table.offset],
  );
  const people = useQuery({
    queryKey: ['platform', 'people', params],
    queryFn: () => platformAdminApi.people(params),
    placeholderData: (previous) => previous,
  });

  const filters: FilterDefinition[] = [
    {
      id: 'organization',
      label: 'May enter',
      single: true,
      options: (organizations.data?.organizations ?? []).map((o) => ({ value: o.id, label: o.name })),
    },
  ];

  const columns: ReadonlyArray<GridColumn<Person>> = [
    {
      key: 'person',
      header: 'Person',
      render: (person) => (
        <span className="uwv-cell-primary">
          <Avatar name={person.display_name || person.email} seed={person.id} muted={!person.is_active} />
          <span className="uwv-cell-stack">
            <Link className="uwv-cell-title" to={`/platform/people/${encodeURIComponent(person.id)}`}>
              {person.display_name || person.email}
            </Link>
            <span className="uwv-cell-sub">{person.email}</span>
          </span>
        </span>
      ),
      exportValue: (person) => person.display_name || person.email,
    },
    {
      key: 'home',
      header: 'Home organization',
      render: (person) => (
        <span title="Where the account lives. Not, by itself, permission to enter." style={{ display: 'inline-flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          {person.home_organization_id === null ? (
            <span className="uwv-cell-muted">None — Platform Admin</span>
          ) : (
            person.home_organization_name
          )}
          {person.home_membership_missing ? <Badge tone="accent">Cannot enter</Badge> : null}
        </span>
      ),
      exportValue: (person) => person.home_organization_name,
    },
    {
      key: 'memberships',
      header: 'May enter',
      render: (person) =>
        person.memberships.length === 0 ? (
          <span className="uwv-cell-muted">Nothing</span>
        ) : (
          <span className="uwv-cell-stack">
            <span>
              {person.organization_count} {person.organization_count === 1 ? 'organization' : 'organizations'}
            </span>
            <span className="uwv-cell-sub">
              {person.memberships
                .slice(0, 2)
                .map((m) => m.organization_name)
                .join(', ')}
              {person.memberships.length > 2 ? ` +${person.memberships.length - 2}` : ''}
            </span>
          </span>
        ),
      exportValue: (person) => person.memberships.map((m) => m.organization_name).join('; '),
    },
    {
      key: 'signin',
      header: 'Last sign-in',
      render: (person) => <span className="uwv-cell-muted">{relative(person.last_login_at)}</span>,
      exportValue: (person) => person.last_login_at,
    },
    {
      key: 'status',
      header: 'Status',
      render: (person) => (
        <span style={{ display: 'inline-flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <StatusPill tone={person.is_active ? 'online' : 'idle'}>{person.is_active ? 'Active' : 'Disabled'}</StatusPill>
          {person.is_platform_operator ? <Badge tone="accent">Operator</Badge> : null}
        </span>
      ),
      exportValue: (person) => (person.is_active ? 'Active' : 'Disabled'),
    },
  ];

  const rows = people.data?.people ?? [];
  const counts = overview.data?.people;

  return (
    <>
      <PageIntro
        eyebrow="Platform"
        title="People"
        standfirst="Everyone on the platform. Membership is what lets somebody enter an organization; roles decide what they can do once inside."
        actions={
          <ButtonLink to="/platform/people/new" variant="primary" icon={ActionIcons.add}>
            New person
          </ButtonLink>
        }
      />

      <section className="uwv-metrics uwv-arrive" data-order="2" aria-label="People across the platform" style={{ marginBottom: 'var(--space-8)' }}>
        <MetricTile
          label="Accounts"
          icon={EntityIcons.person}
          value={counts ? counts.users : null}
          unavailableReason="The overview has not answered"
          detail={counts ? `${counts.active_users} active · ${counts.disabled_users} disabled` : undefined}
        />
        <MetricTile
          label="Signed in this week"
          icon={ActionIcons.enter}
          value={counts ? counts.signed_in_7d : null}
          unavailableReason="The overview has not answered"
          detail={counts ? `${counts.signed_in_24h} in the last 24 hours` : undefined}
        />
        <MetricTile
          label="In several organizations"
          icon={EntityIcons.organization}
          value={counts ? counts.multi_organization_users : null}
          unavailableReason="The overview has not answered"
          detail="Choose which to open when they sign in"
        />
        <MetricTile
          label="Cannot enter anywhere"
          icon={PlatformIcons.stranded}
          value={counts ? counts.without_membership : null}
          unavailableReason="The overview has not answered"
          detail={counts && counts.without_membership > 0 ? 'Offboarded — or a mistaken removal' : 'Every account has somewhere to go'}
          detailTone={counts && counts.without_membership > 0 ? 'warning' : 'success'}
        />
      </section>

      <section className="uwv-arrive" data-order="3" aria-label="Directory">
        <TableCard label="People">
          <TableToolbar
            state={table}
            searchLabel="Search people"
            searchPlaceholder="Search by name or email…"
            searching={people.isFetching && table.query !== ''}
            filters={filters}
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
          <FilterChips filters={filters} state={table} />
          <DataGrid<Person>
            caption="Everyone on the platform, with their home organization and what they may enter"
            columns={columns}
            rows={rows}
            rowKey={(person) => person.id}
            hidden={table.hidden}
            density={table.density}
            loading={people.isLoading}
            error={people.error}
            onRetry={() => void people.refetch()}
            narrowed={table.narrowed}
            onRowOpen={(person) => navigate(`/platform/people/${encodeURIComponent(person.id)}`)}
            rowActions={(person) => [
              {
                id: 'view',
                label: 'View person',
                icon: ActionIcons.view,
                onSelect: () => navigate(`/platform/people/${encodeURIComponent(person.id)}`),
              },
              ...(person.is_platform_operator
                ? []
                : [
                    {
                      id: 'access',
                      label: 'Edit access',
                      icon: PlatformIcons.access,
                      onSelect: () => navigate(`/platform/people/${encodeURIComponent(person.id)}/access`),
                    },
                  ]),
            ]}
            rowActionsLabel={(person) => `Actions for ${person.display_name || person.email}`}
            empty={
              <EmptyState
                title="Nobody on the platform yet"
                body="Create the first person, or the first Organization Admin from an organization's page."
              />
            }
            noResults={
              <EmptyState
                title="No account matches"
                body={table.query ? `Nobody is named or addressed like “${table.query}” with these filters.` : 'Nobody may enter that organization.'}
                action={
                  <Button size="sm" onClick={table.clearFilters}>
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
    </>
  );
}

/* ── one person ───────────────────────────────────────────────────────────── */

export function PlatformPersonPage() {
  const { userId = '' } = useParams();
  const client = useQueryClient();
  const toast = useToast();
  const [addTo, setAddTo] = useState('');
  const [removing, setRemoving] = useState<PersonMembership | null>(null);

  const person = useQuery({
    queryKey: ['platform', 'person', userId],
    queryFn: () => platformAdminApi.person(userId),
    enabled: Boolean(userId),
  });

  const organizations = useQuery({
    queryKey: ['platform', 'organizations', 'for-filter'],
    queryFn: () => platformApi.organizations({ limit: 200 }),
  });

  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ['platform', 'person', userId] });
    void client.invalidateQueries({ queryKey: ['platform', 'people'] });
    void client.invalidateQueries({ queryKey: ['platform', 'overview'] });
    void client.invalidateQueries({ queryKey: ['platform', 'members'] });
  };

  const add = useMutation({
    mutationFn: (organizationId: string) => platformAdminApi.addMember(organizationId, userId, 'org_admin'),
    onSuccess: (_, organizationId) => {
      const name = organizations.data?.organizations.find((o) => o.id === organizationId)?.name ?? organizationId;
      setAddTo('');
      invalidate();
      toast.success(`Now Organization Admin of ${name}`);
    },
  });

  const remove = useMutation({
    mutationFn: (organizationId: string) => platformAdminApi.removeMember(organizationId, userId),
    onSuccess: (result, organizationId) => {
      const name = person.data?.memberships.find((m) => m.organization_id === organizationId)?.organization_name ?? organizationId;
      setRemoving(null);
      invalidate();
      if (result.left_without_access) {
        toast.warning(`Removed from ${name}`, { description: 'They now have no organization and cannot sign in anywhere.' });
      } else {
        toast.success(`Removed from ${name}`);
      }
    },
  });

  if (person.isLoading) return <LoadingState label="Reading person" />;
  if (person.isError) return <ErrorState title="Person could not be read" body="No such account, or the directory is unavailable." />;
  if (!person.data) return null;

  const it = person.data;
  const name = it.display_name || it.email;
  const held = new Set(it.memberships.map((m) => m.organization_id));
  const addable = (organizations.data?.organizations ?? []).filter(
    (organization) => !held.has(organization.id) && organization.status !== 'archived',
  );

  return (
    <>
      <PageIntro
        eyebrow="People"
        back="/platform/people"
        title={name}
        mark={initialsOf(name)}
        meta={
          <>
            <StatusPill tone={it.is_active ? 'online' : 'idle'}>{it.is_active ? 'Active' : 'Disabled'}</StatusPill>
            {it.is_platform_operator ? <Badge tone="accent">Platform operator</Badge> : null}
            <span className="uwv-page-meta-item">{it.email}</span>
            <span className="uwv-page-meta-item">
              {it.home_organization_id === null ? 'Platform Admin — belongs to no organization' : `Lives in ${it.home_organization_name}`}
            </span>
          </>
        }
        actions={
          it.is_platform_operator ? null : (
            <ButtonLink to={`/platform/people/${encodeURIComponent(it.id)}/access`} variant="primary" icon={PlatformIcons.access}>
              Edit access
            </ButtonLink>
          )
        }
      />

      {it.home_membership_missing ? (
        <Callout variant="banner" tone="warning" title="Cannot enter their own home organization">
          This account is filed in <strong>{it.home_organization_name}</strong> but has no membership there. That is a
          legitimate state — it is also what a mistaken revocation looks like.
        </Callout>
      ) : null}
      {!it.is_active ? (
        <Callout variant="banner" tone="neutral" title="This account is disabled">
          It cannot sign in anywhere, whatever it is a member of.
        </Callout>
      ) : null}

      <div className="uwv-detail-grid uwv-arrive" data-order="2">
        <div className="uwv-stack">
          <Panel
            title="Organizations they may enter"
            description="Membership is the entry ticket. What they may do inside each one is set under Edit access."
            flush
          >
            {it.is_platform_operator && it.memberships.length === 0 ? (
              <div className="uwv-datatable-state">
                <Callout tone="info">
                  Platform Admin. Belongs to no organization, and can enter any of them from the organizations list.
                </Callout>
              </div>
            ) : it.memberships.length === 0 ? (
              <div className="uwv-datatable-state">
                <EmptyState title="No memberships" body="This account cannot sign in to any organization. Give it one below." />
              </div>
            ) : (
              <ul className="uwv-person-list">
                {it.memberships.map((membership) => (
                  <li key={membership.organization_id}>
                    <Avatar name={membership.organization_name} seed={membership.organization_id} />
                    <span className="uwv-cell-stack">
                      <span style={{ display: 'inline-flex', gap: 'var(--space-2)', alignItems: 'center', minWidth: 0 }}>
                        <Link className="uwv-cell-title" to={`/platform/organizations/${encodeURIComponent(membership.organization_id)}`}>
                          {membership.organization_name}
                        </Link>
                        {membership.is_home ? <Badge>Home</Badge> : null}
                      </span>
                      <span className="uwv-cell-sub">
                        {membership.roles.length === 0
                          ? 'No role here — can enter, sees nothing'
                          : membership.roles.map(roleLabel).join(', ')}
                        {membership.granted_at ? ` · since ${new Date(membership.granted_at).toLocaleDateString()}` : ''}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Icon icon={ActionIcons.remove} />}
                      aria-label={`Remove from ${membership.organization_name}`}
                      onClick={() => {
                        remove.reset();
                        setRemoving(membership);
                      }}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {it.is_platform_operator ? null : (
            <Panel
              title="Give them an organization"
              description="They become Organization Admin of that organization, with every camera, alongside any organizations they already run. With more than one, they choose which to open when they sign in."
            >
              <form
                className="uwv-inline-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (addTo) add.mutate(addTo);
                }}
              >
                <Select label="Make Organization Admin of" value={addTo} onChange={(event) => setAddTo(event.target.value)}>
                  <option value="">Choose…</option>
                  {addable.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </Select>
                <Button type="submit" variant="primary" loading={add.isPending} disabled={!addTo}>
                  Add as Organization Admin
                </Button>
              </form>
              {add.isError ? (
                <div style={{ marginTop: 'var(--space-4)' }}>
                  <Callout tone="error" live>
                    {failure(add.error, 'The membership could not be added.')}
                  </Callout>
                </div>
              ) : null}
            </Panel>
          )}
        </div>

        <div className="uwv-stack">
          <Panel title="Account">
            <FactList
              items={[
                { label: 'Email', value: it.email },
                {
                  label: 'Home organization',
                  value: it.home_organization_id === null ? 'None' : it.home_organization_name,
                },
                { label: 'May enter', value: `${it.organization_count} ${it.organization_count === 1 ? 'organization' : 'organizations'}` },
                { label: 'Last sign-in', value: relative(it.last_login_at) },
              ]}
            />
          </Panel>
        </div>
      </div>

      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${name} from ${removing?.organization_name ?? ''}?`}
        confirmLabel="Remove membership"
        tone="danger"
        pending={remove.isPending}
        error={remove.isError ? failure(remove.error, 'The membership could not be removed.') : undefined}
        onConfirm={() => removing && remove.mutate(removing.organization_id)}
        onCancel={() => setRemoving(null)}
      >
        <p>They lose every role they hold there and can no longer enter it.</p>
        {it.memberships.length === 1 ? (
          <p>
            <strong>This is their only organization.</strong> Afterwards they cannot sign in anywhere.
          </p>
        ) : null}
      </ConfirmDialog>
    </>
  );
}

/**
 * The platform-operator console — organizations, and their lifecycle.
 *
 * ### Why this is not "the admin page for organization admins"
 *
 * Every other surface in this application belongs to *one organization*. This
 * one is above them, and the account that reaches it — the Platform Admin — is
 * a different kind of principal, not a more powerful role. An Organization
 * Admin holds every permission there is and cannot open this page — the server
 * does not check a permission here, it checks whether the account is a
 * platform operator, which no role can confer.
 *
 * ### The list is the server's
 *
 * The server pages, searches and filters organizations by status, so this
 * table asks it to and shows its `total`. It does not sort: the API has no
 * sort, and sorting one page would present it as the whole list in order.
 * The figures beside each row that the list does not carry — admins, last
 * sign-in — come from the platform overview's fleet, joined by id, and read
 * "—" when the overview has not answered.
 *
 * ### Suspension and archival are not settings
 *
 * They stop a paying customer's product working, so both demand a written
 * reason, and archival the organization's typed name. See
 * `features/platform/organization-actions.tsx`.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { isApiError } from '@shared/api/errors';
import {
  platformAdminApi,
  platformApi,
  STATUS_MEANING,
  type FleetRow,
  type Organization,
  type OrganizationStatus,
  type Person,
} from '@shared/api/platform';
import { roleLabel } from '@app/permissions/permissions';
import {
  BulkActionBar,
  DataGrid,
  downloadCsv,
  FilterChips,
  filterValue,
  Pagination,
  TableCard,
  TableToolbar,
  useClientRows,
  useTableState,
  type FilterDefinition,
  type GridColumn,
} from '@shared/ui/data-table';
import { Callout, useToast } from '@shared/ui/feedback';
import { Combobox, FormActions, FormSection, useUnsavedChanges } from '@shared/ui/forms';
import { ActionIcons, EntityIcons, Icon, NavIcons, PlatformIcons } from '@shared/ui/icons';
import { ConfirmDialog, CopyButton, DropdownMenu, type MenuEntry } from '@shared/ui/overlays';
import { Badge, Button, EmptyState, Input, LoadingState, Modal } from '@shared/ui/primitives';
import { PageIntro } from '@shared/ui/product';
import {
  Avatar,
  FactList,
  MetricTile,
  ObjectTabs,
  Panel,
  TabPanel,
  initialsOf,
  useTabParam,
} from '@shared/ui/surfaces';
import { CreateOrganizationAdmin } from '@features/platform/OrganizationAdmins';
import {
  OrganizationStatusPill,
  STATUS_LABEL,
  StatusDialog,
  useEnterOrganization,
  useInvalidateOrganizations,
  useOrganizationMenu,
} from '@features/platform/organization-actions';

import { Failed, when, whenExact } from './shared';

/**
 * Is this account a platform operator?
 *
 * A 403 is the answer "no", not a failure — so this never retries and never
 * surfaces an error. There is no permission to check instead: operator status
 * is deliberately not expressible as one.
 */
export function useIsOperator() {
  const query = useQuery({
    queryKey: ['platform-me'],
    queryFn: platformApi.me,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  return { isOperator: query.isSuccess, settled: !query.isLoading };
}

/** The platform overview, shared with the dashboard's cache. */
function useOverview() {
  return useQuery({
    queryKey: ['platform', 'overview'],
    queryFn: () => platformAdminApi.overview(),
    staleTime: 30_000,
  });
}

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
  return when(iso);
}

const STATUS_FILTER: FilterDefinition = {
  id: 'status',
  label: 'Status',
  single: true,
  options: [
    { value: 'active', label: 'Active' },
    { value: 'suspended', label: 'Suspended' },
    { value: 'archived', label: 'Archived' },
  ],
};

/* ────────────────────────────────────────────────────────────────────────────
   The list
   ──────────────────────────────────────────────────────────────────────────── */

export function OrganizationsPage() {
  const navigate = useNavigate();
  const table = useTableState('platform-organizations', { pageSize: 25 });
  // `?new=1` opens the create dialog, so "Create an organization" can be a
  // link from anywhere — the dashboard's shortcuts, a bookmark.
  const [params, setParams] = useSearchParams();
  const [creating, setCreatingState] = useState(() => params.get('new') === '1');
  const setCreating = (open: boolean) => {
    setCreatingState(open);
    if (!open && params.has('new')) {
      const next = new URLSearchParams(params);
      next.delete('new');
      setParams(next, { replace: true });
    }
  };
  const [bulk, setBulk] = useState<OrganizationStatus | null>(null);
  const actions = useOrganizationMenu();
  const overview = useOverview();

  const status = filterValue(table.filters, 'status') as OrganizationStatus | undefined;
  const query = useMemo(
    () => ({ q: table.query || undefined, status, limit: table.pageSize, offset: table.offset }),
    [table.query, status, table.pageSize, table.offset],
  );

  const organizations = useQuery({
    queryKey: ['organizations', query],
    queryFn: () => platformApi.organizations(query),
    placeholderData: (previous) => previous,
  });

  const rows = organizations.data?.organizations ?? [];
  const total = organizations.data?.total ?? 0;
  const fleet = useMemo(
    () => new Map<string, FleetRow>((overview.data?.fleet ?? []).map((row) => [row.id, row])),
    [overview.data],
  );
  const selectedRows = rows.filter((row) => table.selected.has(row.id));

  const columns: ReadonlyArray<GridColumn<Organization>> = [
    {
      key: 'name',
      header: 'Organization',
      render: (o) => (
        <span className="uwv-cell-primary">
          <Avatar name={o.name} seed={o.id} />
          <span className="uwv-cell-stack">
            <Link className="uwv-cell-title" to={`/platform/organizations/${encodeURIComponent(o.id)}`}>
              {o.name}
            </Link>
            <span className="uwv-cell-sub">{o.slug}</span>
          </span>
        </span>
      ),
      exportValue: (o) => o.name,
    },
    {
      key: 'status',
      header: 'Status',
      render: (o) => <OrganizationStatusPill status={o.status} />,
      exportValue: (o) => STATUS_LABEL[o.status],
    },
    { key: 'zones', header: 'Zones', numeric: true, render: (o) => o.zone_count, exportValue: (o) => o.zone_count },
    {
      key: 'cameras',
      header: 'Cameras running',
      numeric: true,
      render: (o) =>
        o.camera_count === 0 ? (
          <span className="uwv-cell-muted">None</span>
        ) : (
          <span>
            {o.running_cameras}
            <span className="uwv-cell-muted"> / {o.camera_count}</span>
          </span>
        ),
      exportValue: (o) => `${o.running_cameras}/${o.camera_count}`,
    },
    { key: 'people', header: 'People', numeric: true, render: (o) => o.user_count, exportValue: (o) => o.user_count },
    {
      key: 'admins',
      header: 'Admins',
      numeric: true,
      render: (o) => {
        const row = fleet.get(o.id);
        if (!row) return <span className="uwv-cell-muted">—</span>;
        return row.admins === 0 && o.status !== 'archived' ? (
          <span style={{ color: 'var(--feedback-warning)', fontWeight: 'var(--weight-medium)' }}>None</span>
        ) : (
          row.admins
        );
      },
      exportValue: (o) => fleet.get(o.id)?.admins ?? null,
    },
    {
      key: 'signin',
      header: 'Last sign-in',
      render: (o) => {
        const row = fleet.get(o.id);
        return <span className="uwv-cell-muted">{row ? relative(row.last_sign_in_at) : '—'}</span>;
      },
      exportValue: (o) => fleet.get(o.id)?.last_sign_in_at ?? null,
    },
    {
      key: 'created',
      header: 'Created',
      render: (o) => <span className="uwv-cell-muted">{when(o.created_at)}</span>,
      exportValue: (o) => o.created_at,
    },
  ];

  const counts = overview.data?.organizations;
  const estate = overview.data?.estate;

  return (
    <>
      <PageIntro
        eyebrow="Platform"
        title="Organizations"
        standfirst="Every customer on this deployment. Organizations are created, suspended and archived here and nowhere else."
        actions={
          <Button variant="primary" icon={<Icon icon={ActionIcons.add} />} onClick={() => setCreating(true)}>
            New organization
          </Button>
        }
      />

      <section className="uwv-metrics uwv-arrive" data-order="2" aria-label="Across the platform" style={{ marginBottom: 'var(--space-8)' }}>
        <MetricTile
          label="Organizations"
          icon={EntityIcons.organization}
          value={counts ? counts.total : null}
          unavailableReason="The overview has not answered"
          detail={counts ? `${counts.new_30d} new in the last 30 days` : undefined}
        />
        <MetricTile
          label="Active"
          icon={ActionIcons.activate}
          value={counts ? counts.active : null}
          unavailableReason="The overview has not answered"
          detail="Cameras run, people sign in"
          detailTone="success"
        />
        <MetricTile
          label="Suspended or archived"
          icon={ActionIcons.suspend}
          value={counts ? counts.suspended + counts.archived : null}
          unavailableReason="The overview has not answered"
          detail={counts ? `${counts.suspended} suspended · ${counts.archived} archived` : undefined}
          detailTone={counts && counts.suspended > 0 ? 'warning' : undefined}
        />
        <MetricTile
          label="Cameras live"
          icon={NavIcons.live}
          value={estate ? estate.cameras_live : null}
          unavailableReason="The runtime has not reported"
          detail={estate ? `of ${estate.cameras_enabled} switched on — read from the runtime` : undefined}
        />
      </section>

      <section className="uwv-arrive" data-order="3" aria-label="Organizations list">
        <TableCard label="Organizations">
          <TableToolbar
            state={table}
            searchLabel="Search organizations"
            searchPlaceholder="Search by name or slug…"
            searching={organizations.isFetching && table.query !== ''}
            filters={[STATUS_FILTER]}
            columns={columns}
            actions={
              <Button
                variant="ghost"
                icon={<Icon icon={ActionIcons.export} />}
                disabled={rows.length === 0}
                onClick={() => downloadCsv('organizations.csv', columns, rows)}
              >
                Export page
              </Button>
            }
          />
          <FilterChips filters={[STATUS_FILTER]} state={table} />
          <BulkActionBar count={table.selected.size} noun="organizations" onClear={() => table.setSelected(new Set())}>
            {selectedRows.some((o) => o.status === 'active') ? (
              <Button size="sm" variant="secondary" icon={<Icon icon={ActionIcons.suspend} />} onClick={() => setBulk('suspended')}>
                Suspend
              </Button>
            ) : null}
            {selectedRows.some((o) => o.status !== 'active') ? (
              <Button size="sm" variant="secondary" icon={<Icon icon={ActionIcons.activate} />} onClick={() => setBulk('active')}>
                Reactivate
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => downloadCsv('organizations-selected.csv', columns, selectedRows)}
            >
              Export CSV
            </Button>
          </BulkActionBar>
          <DataGrid<Organization>
            caption="Organizations on this platform"
            columns={columns}
            rows={rows}
            rowKey={(o) => o.id}
            hidden={table.hidden}
            density={table.density}
            loading={organizations.isLoading}
            error={organizations.error}
            onRetry={() => void organizations.refetch()}
            narrowed={table.narrowed}
            selection={{
              selected: table.selected,
              onChange: table.setSelected,
              label: (o) => `Select ${o.name}`,
            }}
            rowActions={(o) => actions.menuFor(o)}
            rowActionsLabel={(o) => `Actions for ${o.name}`}
            onRowOpen={(o) => navigate(`/platform/organizations/${encodeURIComponent(o.id)}`)}
            empty={
              <EmptyState
                title="No organizations yet"
                body="Create the first customer. It starts active, with no zones, cameras or people."
                action={
                  <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
                    New organization
                  </Button>
                }
              />
            }
            noResults={
              <EmptyState
                title="No organizations match"
                body={table.query ? `Nothing is named or slugged like “${table.query}” with these filters.` : 'No organization has this status.'}
                action={
                  <Button size="sm" onClick={table.clearFilters}>
                    Clear search and filters
                  </Button>
                }
              />
            }
          />
          {total > 0 ? (
            <Pagination
              total={total}
              offset={table.offset}
              limit={table.pageSize}
              onOffset={table.setOffset}
              onLimit={table.setPageSize}
              noun="organizations"
              busy={organizations.isFetching}
            />
          ) : null}
        </TableCard>
      </section>

      {actions.dialogs}
      <CreateOrganizationDialog open={creating} onClose={() => setCreating(false)} />
      {bulk ? (
        <StatusDialog
          organizations={selectedRows.filter((o) => (bulk === 'active' ? o.status !== 'active' : o.status === 'active'))}
          target={bulk}
          open
          onClose={() => setBulk(null)}
          onDone={() => table.setSelected(new Set())}
        />
      ) : null}
    </>
  );
}

function CreateOrganizationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const invalidate = useInvalidateOrganizations();
  const toast = useToast();
  const navigate = useNavigate();

  const create = useMutation({
    mutationFn: () => platformApi.create({ name: name.trim() }),
    onSuccess: (organization) => {
      invalidate();
      setName('');
      onClose();
      toast.success(`${organization.name} created`, {
        description: 'It is active, with no zones, cameras or people yet.',
        action: {
          label: 'Open organization',
          onClick: () => navigate(`/platform/organizations/${encodeURIComponent(organization.id)}`),
        },
      });
    },
  });

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!create.isPending) onClose();
      }}
      title="New organization"
      description="A customer of this deployment. It starts active, with no zones, cameras or people."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="create-organization" loading={create.isPending} disabled={!name.trim()}>
            Create organization
          </Button>
        </>
      }
    >
      <form
        id="create-organization"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) create.mutate();
        }}
        style={{ display: 'grid', gap: 'var(--space-4)' }}
      >
        <Input
          label="Name"
          hint="Its identifier (slug) is derived from this and can never change — it becomes part of every camera's runtime identity and names files on disk."
          value={name}
          placeholder="Customer B"
          autoFocus
          onChange={(event) => setName(event.target.value)}
          error={create.isError ? (isApiError(create.error) ? create.error.friendlyMessage : 'The organization could not be created.') : undefined}
        />
      </form>
    </Modal>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   One organization
   ──────────────────────────────────────────────────────────────────────────── */

type Tab = 'overview' | 'members' | 'settings';
const TABS: ReadonlyArray<Tab> = ['overview', 'members', 'settings'];

export function OrganizationDetailPage() {
  const { organizationId = '' } = useParams();
  const [tab, setTab] = useTabParam<Tab>(TABS, 'overview');
  const { enter, entering } = useEnterOrganization();
  const menu = useOrganizationMenu();
  const overview = useOverview();

  const organization = useQuery({
    queryKey: ['organization', organizationId],
    queryFn: () => platformApi.organization(organizationId),
    enabled: Boolean(organizationId),
  });
  const members = useQuery({
    queryKey: ['platform', 'members', organizationId],
    queryFn: () => platformAdminApi.members(organizationId),
    enabled: Boolean(organizationId),
  });

  if (organization.isLoading) return <LoadingState label="Reading organization" />;
  if (organization.isError) return <Failed error={organization.error} />;
  if (!organization.data) return null;

  const it = organization.data;
  const archived = it.status === 'archived';
  const fleet = overview.data?.fleet.find((row) => row.id === it.id);
  const lifecycle: MenuEntry[] = menu.menuFor(it, { includeView: false }).filter((entry) => entry.id !== 'enter' && entry.id !== 'rename');

  return (
    <>
      <PageIntro
        eyebrow="Organizations"
        back="/platform/organizations"
        title={it.name}
        mark={initialsOf(it.name)}
        meta={
          <>
            <OrganizationStatusPill status={it.status} />
            <span className="uwv-page-meta-item">
              <span className="uwv-id" title="Organization id">
                {it.id}
              </span>
              <CopyButton value={it.id} label="Copy organization id" />
            </span>
            <span className="uwv-page-meta-item">Slug {it.slug}</span>
            <span className="uwv-page-meta-item">Created {when(it.created_at)}</span>
          </>
        }
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Icon icon={ActionIcons.edit} />}
              onClick={() => menu.ask(it, { kind: 'rename' })}
            >
              Rename
            </Button>
            <Button
              variant="primary"
              icon={<Icon icon={ActionIcons.enter} />}
              loading={entering === it.id}
              disabled={archived}
              title={archived ? 'Nobody may sign in to an archived organization' : undefined}
              onClick={() => void enter(it)}
            >
              Enter organization
            </Button>
            <DropdownMenu label={`More actions for ${it.name}`} variant="secondary" size="md" items={lifecycle} />
          </>
        }
      />

      {it.status !== 'active' ? (
        <Callout
          variant="banner"
          tone={it.status === 'suspended' ? 'warning' : 'neutral'}
          title={`${STATUS_LABEL[it.status]}${it.status_changed_at ? ` since ${whenExact(it.status_changed_at)}` : ''}`}
          actions={
            <Button size="sm" variant="secondary" onClick={() => menu.ask(it, { kind: 'status', target: 'active' })}>
              Reactivate
            </Button>
          }
        >
          {STATUS_MEANING[it.status]}
          {it.status_reason ? (
            <>
              {' '}
              Reason given: <strong>{it.status_reason}</strong>
            </>
          ) : null}
        </Callout>
      ) : null}

      <ObjectTabs<Tab>
        label="Organization sections"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'members', label: 'Members', count: members.data?.count ?? null },
          { id: 'settings', label: 'Settings' },
        ]}
      />

      {tab === 'overview' ? (
        <TabPanel id="overview">
          <OrganizationOverview
            organization={it}
            fleet={fleet}
            members={members.data?.members}
            membersLoading={members.isLoading}
            onMembers={() => setTab('members')}
          />
        </TabPanel>
      ) : null}
      {tab === 'members' ? (
        <TabPanel id="members">
          <Members organization={it} />
        </TabPanel>
      ) : null}
      {tab === 'settings' ? (
        <TabPanel id="settings">
          <OrganizationSettings organization={it} onLifecycle={(target) => menu.ask(it, { kind: 'status', target })} />
        </TabPanel>
      ) : null}

      {menu.dialogs}
    </>
  );
}

function OrganizationOverview({
  organization: it,
  fleet,
  members,
  membersLoading,
  onMembers,
}: {
  organization: Organization;
  fleet: FleetRow | undefined;
  members: ReadonlyArray<Person> | undefined;
  membersLoading: boolean;
  onMembers: () => void;
}) {
  const archived = it.status === 'archived';
  const stillRunning = it.status !== 'active' && it.running_cameras > 0;
  const admins = (members ?? []).filter((person) =>
    person.memberships.some((m) => m.organization_id === it.id && m.roles.includes('org_admin')),
  );

  return (
    <div className="uwv-detail-grid">
      <div className="uwv-stack">
        <div className="uwv-metrics" data-dense="true">
          <MetricTile label="Zones" icon={NavIcons.administration} value={it.zone_count} detail="Places cameras are grouped by" />
          <MetricTile
            label="Cameras running"
            icon={NavIcons.live}
            value={it.running_cameras}
            unit={`/ ${it.camera_count}`}
            detail={stillRunning ? 'Still running after a stop — check the runtime' : 'From the live runtime, not configuration'}
            detailTone={stillRunning ? 'danger' : undefined}
          />
          <MetricTile label="People" icon={EntityIcons.person} value={it.user_count} detail="Accounts that may enter" />
          <MetricTile
            label="Organization Admins"
            icon={PlatformIcons.adminCreated}
            value={fleet ? fleet.admins : null}
            unavailableReason="The overview has not answered"
            detail={fleet && fleet.admins === 0 ? 'Nobody can administer it' : 'Active members holding the role'}
            detailTone={fleet && fleet.admins === 0 && !archived ? 'warning' : undefined}
          />
        </div>

        <Panel
          title="Who runs it"
          description="Its Organization Admins: the people who grant every other role inside it."
          actions={
            <Button size="sm" variant="ghost" onClick={onMembers}>
              All members
            </Button>
          }
          flush
        >
          {membersLoading ? (
            <LoadingState label="Reading members" />
          ) : admins.length === 0 ? (
            <div className="uwv-datatable-state">
              <EmptyState
                title="Nobody can administer it"
                body={archived ? 'An archived organization needs none.' : 'Make somebody its Organization Admin from Members.'}
                action={
                  archived ? undefined : (
                    <Button size="sm" onClick={onMembers}>
                      Go to members
                    </Button>
                  )
                }
              />
            </div>
          ) : (
            <ul className="uwv-person-list">
              {admins.map((person) => (
                <li key={person.id}>
                  <Avatar name={person.display_name || person.email} seed={person.id} muted={!person.is_active} />
                  <span className="uwv-cell-stack">
                    <Link className="uwv-cell-title" to={`/platform/people/${encodeURIComponent(person.id)}`}>
                      {person.display_name || person.email}
                    </Link>
                    <span className="uwv-cell-sub">{person.email}</span>
                  </span>
                  <span className="uwv-type-caption">Signed in {relative(person.last_login_at).toLowerCase()}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Callout tone="neutral" title="Entering is an act, and it is recorded">
          {archived
            ? 'An archived organization cannot be entered: nobody may sign in to one.'
            : 'Enter organization opens it as Platform Admin, with full access to its cameras, people and records. The entry is written to its audit trail before it opens; looking at this page changes nothing.'}
        </Callout>
      </div>

      <div className="uwv-stack">
        <Panel title="Details">
          <FactList
            items={[
              { label: 'Status', value: <OrganizationStatusPill status={it.status} /> },
              { label: 'Created', value: when(it.created_at) },
              { label: 'Status changed', value: it.status_changed_at ? whenExact(it.status_changed_at) : 'Never' },
              { label: 'Last sign-in', value: fleet ? relative(fleet.last_sign_in_at) : '—' },
              { label: 'Cameras switched on', value: fleet ? `${fleet.cameras_enabled} of ${fleet.cameras}` : '—' },
              { label: 'Slug', value: <span className="uwv-id">{it.slug}</span> },
            ]}
          />
          {it.status_reason ? (
            <p className="uwv-type-caption" style={{ marginTop: 'var(--space-5)' }}>
              Last reason given: <span style={{ color: 'var(--ink-secondary)' }}>{it.status_reason}</span>
            </p>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}

/* ── members ──────────────────────────────────────────────────────────────── */

const MEMBER_ROLE_FILTER: FilterDefinition = {
  id: 'role',
  label: 'Role here',
  options: [
    { value: 'org_admin', label: 'Organization Admin' },
    { value: 'other', label: 'Other roles' },
    { value: 'none', label: 'No role' },
  ],
};

/**
 * Membership administration for one organization.
 *
 * Admits Organization Admins and removes members. The platform gives exactly
 * one role — Organization Admin — and every other role is granted inside the
 * organization by that admin, who knows who works there.
 */
function Members({ organization }: { organization: Organization }) {
  const client = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const table = useTableState(`platform-members`, { pageSize: 10 });
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Person | null>(null);
  const archived = organization.status === 'archived';

  const members = useQuery({
    queryKey: ['platform', 'members', organization.id],
    queryFn: () => platformAdminApi.members(organization.id),
  });

  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ['platform'] });
    void client.invalidateQueries({ queryKey: ['organization', organization.id] });
    void client.invalidateQueries({ queryKey: ['organizations'] });
  };

  const remove = useMutation({
    mutationFn: (person: Person) => platformAdminApi.removeMember(organization.id, person.id),
    onSuccess: (result, person) => {
      invalidate();
      setRemoving(null);
      // Said, not hidden: removing somebody's last membership means the account
      // can no longer sign in anywhere — offboarding, or a mistake.
      if (result.left_without_access) {
        toast.warning(`${person.display_name || person.email} removed`, {
          description: `${result.email} now has no organization and cannot sign in anywhere.`,
        });
      } else {
        toast.success(`${person.display_name || person.email} removed from ${organization.name}`);
      }
    },
  });

  const rolesHere = (person: Person) =>
    person.memberships.find((m) => m.organization_id === organization.id)?.roles ?? [];

  const view = useClientRows(members.data?.members ?? [], table, {
    text: (p) => `${p.display_name} ${p.email}`,
    filterBy: {
      role: (p) => {
        const roles = rolesHere(p);
        if (roles.length === 0) return 'none';
        return roles.map((role) => (role === 'org_admin' ? 'org_admin' : 'other'));
      },
    },
    sortBy: {
      person: (p) => (p.display_name || p.email).toLowerCase(),
      signin: (p) => (p.last_login_at ? new Date(p.last_login_at).getTime() : null),
    },
  });

  const columns: ReadonlyArray<GridColumn<Person>> = [
    {
      key: 'person',
      header: 'Person',
      sortable: true,
      render: (p) => (
        <span className="uwv-cell-primary">
          <Avatar name={p.display_name || p.email} seed={p.id} muted={!p.is_active} />
          <span className="uwv-cell-stack">
            <Link className="uwv-cell-title" to={`/platform/people/${encodeURIComponent(p.id)}`}>
              {p.display_name || p.email}
            </Link>
            <span className="uwv-cell-sub">{p.email}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'roles',
      header: 'Roles here',
      render: (p) => {
        const roles = rolesHere(p);
        return roles.length === 0 ? (
          <span className="uwv-cell-muted">No role — can enter, sees nothing</span>
        ) : (
          <span style={{ display: 'inline-flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
            {roles.map((role) => (
              <Badge key={role} tone={role === 'org_admin' ? 'accent' : 'neutral'}>
                {roleLabel(role)}
              </Badge>
            ))}
          </span>
        );
      },
    },
    {
      key: 'home',
      header: 'Home',
      render: (p) =>
        p.home_organization_id === organization.id ? <Badge>Home</Badge> : <span className="uwv-cell-muted">—</span>,
    },
    {
      key: 'signin',
      header: 'Last sign-in',
      sortable: true,
      render: (p) => <span className="uwv-cell-muted">{relative(p.last_login_at)}</span>,
    },
    {
      key: 'state',
      header: 'Account',
      render: (p) =>
        p.is_active ? <span className="uwv-status-pill" data-tone="online">Active</span> : <span className="uwv-status-pill" data-tone="idle">Disabled</span>,
    },
  ];

  if (members.isError) return <Failed error={members.error} />;

  return (
    <>
      <TableCard label="Members">
        <TableToolbar
          state={table}
          searchLabel="Search members"
          searchPlaceholder="Search by name or email…"
          filters={[MEMBER_ROLE_FILTER]}
          columns={columns}
          actions={
            archived ? (
              <span className="uwv-type-caption">An archived organization takes no new members.</span>
            ) : (
              <>
                <Button variant="secondary" icon={<Icon icon={EntityIcons.person} />} onClick={() => setAdding(true)}>
                  Add existing person
                </Button>
                <Button variant="primary" icon={<Icon icon={ActionIcons.add} />} onClick={() => setCreating(true)}>
                  New Organization Admin
                </Button>
              </>
            )
          }
        />
        <FilterChips filters={[MEMBER_ROLE_FILTER]} state={table} />
        <DataGrid<Person>
          caption={`Members of ${organization.name}`}
          columns={columns}
          rows={view.page}
          rowKey={(p) => p.id}
          hidden={table.hidden}
          density={table.density}
          sort={table.sort}
          onSort={table.setSort}
          loading={members.isLoading}
          narrowed={table.narrowed}
          rowActions={(p) => [
            {
              id: 'view',
              label: 'View person',
              icon: ActionIcons.view,
              onSelect: () => navigate(`/platform/people/${encodeURIComponent(p.id)}`),
            },
            {
              id: 'access',
              label: 'Edit access',
              icon: PlatformIcons.access,
              onSelect: () => navigate(`/platform/people/${encodeURIComponent(p.id)}/access`),
            },
            { id: 'sep', type: 'separator' },
            {
              id: 'remove',
              label: 'Remove from organization…',
              icon: ActionIcons.remove,
              tone: 'danger',
              onSelect: () => {
                remove.reset();
                setRemoving(p);
              },
            },
          ]}
          rowActionsLabel={(p) => `Actions for ${p.display_name || p.email}`}
          empty={
            <EmptyState
              title="No members"
              body="Nobody can sign in to this organization yet. Create its Organization Admin, or admit someone who already has an account."
            />
          }
        />
        {view.total > 0 ? (
          <Pagination
            total={view.total}
            offset={table.offset}
            limit={table.pageSize}
            onOffset={table.setOffset}
            onLimit={table.setPageSize}
            noun="members"
          />
        ) : null}
      </TableCard>

      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.display_name || removing?.email || ''} from ${organization.name}?`}
        confirmLabel="Remove member"
        tone="danger"
        pending={remove.isPending}
        error={remove.isError ? (isApiError(remove.error) ? remove.error.friendlyMessage : 'The member could not be removed.') : undefined}
        onConfirm={() => removing && remove.mutate(removing)}
        onCancel={() => setRemoving(null)}
      >
        <p>They lose every role they hold here and can no longer enter {organization.name}.</p>
        {removing && removing.organization_count <= 1 ? (
          <p>
            <strong>This is their only organization.</strong> Afterwards they cannot sign in anywhere.
          </p>
        ) : null}
      </ConfirmDialog>

      <AdmitDialog organization={organization} open={adding} onClose={() => setAdding(false)} memberIds={new Set((members.data?.members ?? []).map((p) => p.id))} />

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New Organization Admin"
        description={`Creates the person who runs ${organization.name}: an account, the Organization Admin role and every camera, in one step.`}
      >
        <CreateOrganizationAdmin
          organizationId={organization.id}
          bare
          onCreated={(person) =>
            toast.success(`${person.display_name || person.email} is now Organization Admin of ${organization.name}`)
          }
        />
      </Modal>
    </>
  );
}

function AdmitDialog({
  organization,
  open,
  onClose,
  memberIds,
}: {
  organization: Organization;
  open: boolean;
  onClose: () => void;
  memberIds: ReadonlySet<string>;
}) {
  const client = useQueryClient();
  const toast = useToast();
  const [chosen, setChosen] = useState('');

  const everyone = useQuery({
    queryKey: ['platform', 'people', 'all-for-admit'],
    queryFn: () => platformAdminApi.people({ limit: 200 }),
    enabled: open,
  });

  // The Platform Admin is never admitted: they belong to no organization and
  // enter any of them from the console.
  const admittable = (everyone.data?.people ?? []).filter(
    (person) => !memberIds.has(person.id) && !person.is_platform_operator,
  );

  const add = useMutation({
    mutationFn: (userId: string) => platformAdminApi.addMember(organization.id, userId, 'org_admin'),
    onSuccess: (person) => {
      void client.invalidateQueries({ queryKey: ['platform'] });
      void client.invalidateQueries({ queryKey: ['organization', organization.id] });
      toast.success(`${person.display_name || person.email} is now Organization Admin of ${organization.name}`);
      setChosen('');
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!add.isPending) onClose();
      }}
      title="Add an existing person"
      description={`They become Organization Admin of ${organization.name}, with every camera, alongside any organizations they already run.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={add.isPending}>
            Cancel
          </Button>
          <Button variant="primary" loading={add.isPending} disabled={!chosen} onClick={() => add.mutate(chosen)}>
            Add as Organization Admin
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        {everyone.isLoading ? <LoadingState label="Reading people" /> : null}
        <Combobox
          label="Person"
          value={chosen}
          onChange={setChosen}
          placeholder="Search by name or email…"
          emptyText="Nobody matches who is not already a member"
          options={admittable.map((person) => ({
            value: person.id,
            label: person.display_name || person.email,
            detail: person.email,
          }))}
        />
        {add.isError ? (
          <Callout tone="error" live>
            {isApiError(add.error) ? add.error.friendlyMessage : 'The member could not be added.'}
          </Callout>
        ) : null}
      </div>
    </Modal>
  );
}

/* ── settings ─────────────────────────────────────────────────────────────── */

function OrganizationSettings({
  organization: it,
  onLifecycle,
}: {
  organization: Organization;
  onLifecycle: (target: OrganizationStatus) => void;
}) {
  const [name, setName] = useState(it.name);
  const invalidate = useInvalidateOrganizations();
  const toast = useToast();
  const trimmed = name.trim();
  const dirty = trimmed !== it.name;
  useUnsavedChanges(dirty);

  const rename = useMutation({
    mutationFn: () => platformApi.rename(it.id, trimmed),
    onSuccess: (updated) => {
      invalidate(it.id);
      toast.success('Organization renamed', { description: `${it.name} is now ${updated?.name || trimmed}.` });
    },
  });

  return (
    <div>
      <FormSection
        title="General"
        description="What this customer is called across the console. Only the display name can change; the slug and id are permanent."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (dirty && trimmed) rename.mutate();
          }}
          style={{ display: 'grid', gap: 'var(--space-5)' }}
        >
          <Input
            label="Organization name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={
              !trimmed
                ? 'A name is required.'
                : rename.isError
                  ? isApiError(rename.error)
                    ? rename.error.friendlyMessage
                    : 'The name could not be changed.'
                  : undefined
            }
          />
          <div className="uwv-form-grid">
            <Input label="Slug" value={it.slug} readOnly disabled hint="Part of every camera's runtime identity. Never changes." />
            <div className="uwv-field">
              <span className="uwv-field-label">Organization id</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minHeight: 'var(--control-md)' }}>
                <span className="uwv-id">{it.id}</span>
                <CopyButton value={it.id} label="Copy organization id" />
              </span>
              <span className="uwv-field-hint">Quote this when you contact support.</span>
            </div>
          </div>
          <FormActions dirty={dirty} saving={rename.isPending} disabled={!trimmed} onCancel={() => setName(it.name)} />
        </form>
      </FormSection>

      <FormSection
        title="Lifecycle"
        description="This reaches sign-in, permissions and the camera runtime. It is not a label: each change is recorded with its reason."
      >
        <div className="uwv-radio-cards-grid" role="list" aria-label="Lifecycle states">
          {(['active', 'suspended', 'archived'] as const).map((state) => (
            <div
              key={state}
              role="listitem"
              className="uwv-radio-card"
              data-checked={state === it.status ? 'true' : undefined}
              data-tone={state === 'active' ? 'default' : state === 'suspended' ? 'warning' : 'danger'}
              style={{ paddingLeft: 'var(--space-4)', cursor: 'default' }}
              aria-current={state === it.status ? 'true' : undefined}
            >
              <span className="uwv-radio-card-head">
                <OrganizationStatusPill status={state} />
                {state === it.status ? <span className="uwv-type-caption">Current</span> : null}
              </span>
              <span className="uwv-radio-card-description">{STATUS_MEANING[state]}</span>
            </div>
          ))}
        </div>
        <div className="uwv-danger-row">
          <div className="uwv-danger-row-text">
            <p className="uwv-danger-row-title">
              {it.status === 'active' ? 'Suspend organization' : 'Reactivate organization'}
            </p>
            <p className="uwv-danger-row-description">
              {it.status === 'active'
                ? 'Reversible. People can still sign in and read; changes are refused and cameras stop.'
                : 'Sign-in and changes are allowed again. Cameras are started again from the camera list.'}
            </p>
          </div>
          {it.status === 'active' ? (
            <Button variant="secondary" icon={<Icon icon={ActionIcons.suspend} />} onClick={() => onLifecycle('suspended')}>
              Suspend…
            </Button>
          ) : (
            <Button variant="secondary" icon={<Icon icon={ActionIcons.activate} />} onClick={() => onLifecycle('active')}>
              Reactivate…
            </Button>
          )}
        </div>
      </FormSection>

      <FormSection
        tone="danger"
        title="Danger zone"
        description="Acts that stop the product for everyone at this customer. Each asks for a reason, and archiving for the organization's name."
      >
        <div className="uwv-danger-row">
          <div className="uwv-danger-row-text">
            <p className="uwv-danger-row-title">Archive organization</p>
            <p className="uwv-danger-row-description">
              Nobody can sign in and every camera stops. Data is retained and nothing is deleted — there is no deleting an
              organization.
            </p>
          </div>
          <Button
            variant="danger"
            icon={<Icon icon={ActionIcons.archive} />}
            disabled={it.status === 'archived'}
            onClick={() => onLifecycle('archived')}
          >
            {it.status === 'archived' ? 'Archived' : 'Archive…'}
          </Button>
        </div>
      </FormSection>
    </div>
  );
}

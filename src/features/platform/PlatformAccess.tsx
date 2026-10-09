/**
 * Operators, role policy, and the two control-plane destinations still waiting
 * for a backend.
 *
 * ### Operators are read-only here
 *
 * Granting platform authority is a command-line act on purpose, so the
 * privilege can never grant itself from the console it unlocks. The page lists
 * who holds it, when and why — and prints the command, rather than a button.
 *
 * ### Roles are code
 *
 * `ROLE_PERMISSIONS` is a Python constant with no table behind it, so the
 * policy is shown, never edited, and the page says which: "Role definitions
 * fixed". People differ by per-person grants inside an organization, not by
 * redefining a role for everybody.
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { platformAdminApi } from '@shared/api/platform';
import { roleLabel } from '@app/permissions/permissions';
import {
  DataGrid,
  FilterChips,
  Pagination,
  TableCard,
  TableToolbar,
  useClientRows,
  useTableState,
  type FilterDefinition,
  type GridColumn,
} from '@shared/ui/data-table';
import { Callout } from '@shared/ui/feedback';
import { Icon, PlatformIcons, StatusIcons } from '@shared/ui/icons';
import { CopyButton } from '@shared/ui/overlays';
import { Badge, EmptyState, ErrorState, LoadingState } from '@shared/ui/primitives';
import { PageIntro } from '@shared/ui/product';
import { Avatar, Panel, StatusPill } from '@shared/ui/surfaces';
import {
  CreateOrganizationAdmin,
  GiveOrganization,
  PlatformAdminNote,
} from '@features/platform/OrganizationAdmins';
import type { OperatorRow } from '@shared/api/platform';

/* ── operators ────────────────────────────────────────────────────────────── */

const OPERATOR_STATUS: FilterDefinition = {
  id: 'status',
  label: 'Account',
  options: [
    { value: 'active', label: 'Active' },
    { value: 'disabled', label: 'Disabled' },
  ],
};

export function PlatformOperatorsPage() {
  const table = useTableState('platform-operators', { pageSize: 25 });
  const operators = useQuery({
    queryKey: ['platform', 'operators'],
    queryFn: platformAdminApi.operators,
  });

  const view = useClientRows(operators.data?.operators ?? [], table, {
    text: (row) => `${row.display_name} ${row.email} ${row.reason ?? ''}`,
    filterBy: { status: (row) => (row.is_active ? 'active' : 'disabled') },
    sortBy: {
      email: (row) => (row.display_name || row.email).toLowerCase(),
      granted: (row) => (row.granted_at ? new Date(row.granted_at).getTime() : null),
    },
  });

  const columns: ReadonlyArray<GridColumn<OperatorRow>> = [
    {
      key: 'email',
      header: 'Operator',
      sortable: true,
      render: (row) => (
        <span className="uwv-cell-primary">
          <Avatar name={row.display_name || row.email} seed={row.user_id} muted={!row.is_active} />
          <span className="uwv-cell-stack">
            <Link className="uwv-cell-title" to={`/platform/people/${encodeURIComponent(row.user_id)}`}>
              {row.display_name || row.email}
            </Link>
            <span className="uwv-cell-sub">{row.email}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'home',
      header: 'Organization',
      render: (row) =>
        row.home_organization_id === null ? (
          <span className="uwv-cell-muted">None — belongs to all</span>
        ) : (
          row.home_organization_name
        ),
    },
    {
      key: 'reason',
      header: 'Why',
      render: (row) => (row.reason ? row.reason : <span className="uwv-cell-muted">Not recorded</span>),
    },
    {
      key: 'granted',
      header: 'Granted',
      sortable: true,
      render: (row) => (
        <span className="uwv-cell-stack">
          <span>{row.granted_at ? new Date(row.granted_at).toLocaleDateString() : '—'}</span>
          {row.granted_by ? <span className="uwv-cell-sub">by {row.granted_by}</span> : null}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusPill tone={row.is_active ? 'online' : 'idle'}>{row.is_active ? 'Active' : 'Disabled'}</StatusPill>,
    },
  ];

  if (operators.isError) return <ErrorState title="Operators could not be read" body="The list is unavailable." />;

  return (
    <>
      <PageIntro
        eyebrow="Platform"
        title="Operators"
        standfirst="Accounts that can reach every organization on this deployment. Read-only here: granting is deliberately a command-line act, so the privilege cannot grant itself."
      />

      {operators.data ? (
        <div className="uwv-arrive" data-order="2" style={{ marginBottom: 'var(--space-6)' }}>
          <Callout
            tone="neutral"
            icon={StatusIcons.engineering}
            title="To grant or revoke platform authority"
            actions={<CopyButton value={operators.data.how_to_grant} label="Copy command" />}
          >
            <code className="uwv-id" style={{ whiteSpace: 'normal' }}>
              {operators.data.how_to_grant}
            </code>
          </Callout>
        </div>
      ) : null}

      <section className="uwv-arrive" data-order="3" aria-label="Who holds platform authority">
        <TableCard label="Operators">
          <TableToolbar
            state={table}
            searchLabel="Search operators"
            searchPlaceholder="Search by name, email or reason…"
            filters={[OPERATOR_STATUS]}
            columns={columns}
          />
          <FilterChips filters={[OPERATOR_STATUS]} state={table} />
          <DataGrid<OperatorRow>
            caption="Accounts holding platform authority, when it was granted and why"
            columns={columns}
            rows={view.page}
            rowKey={(row) => row.user_id}
            hidden={table.hidden}
            density={table.density}
            sort={table.sort}
            onSort={table.setSort}
            loading={operators.isLoading}
            narrowed={table.narrowed}
            empty={<EmptyState title="Nobody holds platform authority" body="Grant it from the command line." />}
          />
          {view.total > table.pageSize ? (
            <Pagination
              total={view.total}
              offset={table.offset}
              limit={table.pageSize}
              onOffset={table.setOffset}
              onLimit={table.setPageSize}
              noun="operators"
            />
          ) : null}
        </TableCard>
      </section>
    </>
  );
}

/* ── role policy ──────────────────────────────────────────────────────────── */

export function PlatformRolesPage() {
  const policy = useQuery({ queryKey: ['platform', 'roles'], queryFn: platformAdminApi.roles });

  if (policy.isLoading) return <LoadingState label="Reading role policy" />;
  if (policy.isError) return <ErrorState title="Role policy could not be read" body="The policy is unavailable." />;
  if (!policy.data) return null;

  const it = policy.data;

  return (
    <>
      <PageIntro
        eyebrow="Platform"
        title="Roles & Access"
        standfirst="Create Organization Admins and give them organizations. Below that, what each role grants, product-wide."
        meta={<Badge>{it.editable ? 'Role definitions editable' : 'Role definitions fixed'}</Badge>}
      />

      <div className="uwv-split-even uwv-arrive" data-order="2">
        <Panel
          title="New Organization Admin"
          description="Creates the account, gives it the organization, the Organization Admin role and every camera — in one step."
        >
          <CreateOrganizationAdmin bare />
        </Panel>
        <Panel
          title="Give an Organization Admin another organization"
          description="One Organization Admin can run several organizations. With more than one, they choose which to open when they sign in."
        >
          <GiveOrganization bare />
          <div style={{ marginTop: 'var(--space-5)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--line-subtle)' }}>
            <PlatformAdminNote />
          </div>
        </Panel>
      </div>

      <section className="uwv-arrive" data-order="3" style={{ marginTop: 'var(--space-10)' }} aria-labelledby="role-catalogue">
        <div className="uwv-section-head" style={{ marginBottom: 'var(--space-4)' }}>
          <h2 id="role-catalogue" className="uwv-section-title">
            Roles
          </h2>
          <p className="uwv-type-body-sm" style={{ color: 'var(--ink-tertiary)', marginTop: 'var(--space-1)' }}>
            {it.roles.length} {it.roles.length === 1 ? 'role' : 'roles'} · {it.permissions.length}{' '}
            {it.permissions.length === 1 ? 'permission' : 'permissions'} — the same definitions in every organization.
          </p>
        </div>

        <Callout tone="info" title="How access is customised">
          Two people holding the same role are made to differ by granting or revoking individual permissions{' '}
          <strong>on the person</strong>, inside the organization it applies to — {it.customization.where}. That keeps one
          definition of “Kitchen Supervisor” across the platform while still letting one of them be read-only.{' '}
          <span style={{ color: 'var(--ink-tertiary)' }}>{it.customization.note}</span>
        </Callout>

        <ul className="uwv-role-grid" aria-label="Roles and what each grants">
          {it.roles.map((role) => (
            <li key={role.role} className="uwv-panel uwv-role-card">
              <div className="uwv-role-card-head">
                <span className="uwv-panel-title">{roleLabel(role.role)}</span>
                {role.is_platform_role ? <Badge tone="accent">Platform</Badge> : null}
              </div>
              <p className="uwv-type-caption">
                <span className="uwv-type-mono">{role.role}</span> · {role.permission_count}{' '}
                {role.permission_count === 1 ? 'permission' : 'permissions'}
              </p>
              <ul className="uwv-chip-list" aria-label={`${roleLabel(role.role)} permissions`}>
                {role.permissions.map((permission) => (
                  <li key={permission} className="uwv-permission-chip">
                    {permission}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/* ── structural destinations ──────────────────────────────────────────────── */

function Structural({
  title,
  standfirst,
  waitingFor,
  today,
}: {
  title: string;
  standfirst: string;
  waitingFor: string;
  today: ReadonlyArray<{ label: string; to: string; detail: string }>;
}) {
  return (
    <>
      <PageIntro eyebrow="Platform" title={title} standfirst={standfirst} meta={<Badge>Not connected</Badge>} />
      <div className="uwv-detail-grid uwv-arrive" data-order="2">
        <Panel title="What this is waiting for">
          <p className="uwv-type-body" style={{ color: 'var(--ink-secondary)' }}>
            {waitingFor}
          </p>
          <p className="uwv-type-caption" style={{ marginTop: 'var(--space-4)' }}>
            Nothing is shown here rather than an empty table, so that “no activity” and “not built yet” can never look the
            same.
          </p>
        </Panel>
        <Panel title="Where to look today" flush>
          <ul className="uwv-person-list">
            {today.map((entry) => (
              <li key={entry.to}>
                <span className="uwv-metric-icon">
                  <Icon icon={PlatformIcons.activity} size="control" />
                </span>
                <span className="uwv-cell-stack">
                  <Link className="uwv-cell-title" to={entry.to}>
                    {entry.label}
                  </Link>
                  <span className="uwv-cell-sub" style={{ whiteSpace: 'normal' }}>
                    {entry.detail}
                  </span>
                </span>
                <span />
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}

export function PlatformAuditPage() {
  return (
    <Structural
      title="Audit"
      standfirst="Platform activity across every organization, filterable by organization, actor and action."
      waitingFor={
        'A cross-organization read of the audit trail. The events are already written — organization ' +
        'lifecycle, membership changes and operator entry all record rows today, and the Dashboard ' +
        'shows the most recent of them. What is missing is the filtered, paginated read behind this ' +
        'page. A customer’s own operational audit stays inside that customer, where VIEW_AUDIT gates it.'
      }
      today={[
        { label: 'Dashboard — recent activity', to: '/platform', detail: 'The latest platform acts, as they are recorded.' },
        { label: 'Organizations', to: '/platform/organizations', detail: 'Each organization’s last status change and its reason.' },
      ]}
    />
  );
}

export function PlatformFleetPage() {
  return (
    <Structural
      title="Fleet Health"
      standfirst="Cameras streaming against cameras configured, across every organization."
      waitingFor={
        'A per-organization breakdown of the live camera registry. The platform-wide totals are ' +
        'already on the Dashboard, and each organization’s own figure is on its detail page. What is ' +
        'missing is the per-camera view that turns “eleven of sixteen” into “which five, and since ' +
        'when” — which needs a health read this console does not have yet.'
      }
      today={[
        { label: 'Dashboard — cameras live', to: '/platform', detail: 'Platform-wide streaming against switched-on.' },
        { label: 'Organizations — cameras running', to: '/platform/organizations', detail: 'Running against configured, per customer.' },
      ]}
    />
  );
}

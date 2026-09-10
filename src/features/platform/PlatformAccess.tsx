/**
 * Operators, role policy, and the two destinations that are structure only.
 *
 * Three small pages in one module because each is a single read and they share
 * one idea: **saying plainly what the server can and cannot do.** Two of them
 * exist mainly to stop somebody building the wrong thing later — a grant button
 * that must not exist, and an edit form the backend would refuse.
 */

import { useQuery } from '@tanstack/react-query';

import { platformAdminApi } from '@shared/api/platform';
import { roleLabel } from '@app/permissions/permissions';
import {
  Badge,
  type Column,
  DataTable,
  ErrorState,
  LoadingState,
  StatusBadge,
} from '@shared/ui/primitives';
import { PageIntro, Plane, Region, SectionRule } from '@shared/ui/product';
import type { OperatorRow } from '@shared/api/platform';

/* ── operators ────────────────────────────────────────────────────────────── */

/**
 * Who holds platform authority.
 *
 * ### There is no grant button here, and that is the feature
 *
 * Granting platform authority stays a command-line act. An operator who could
 * mint another operator would make the privilege self-propagating, and the one
 * real control on a grant that reaches every customer's data is that making one
 * is awkward and leaves a human trail outside this application.
 *
 * Visibility is the half that genuinely belongs in a console: "who can reach
 * all of our customers" is a question somebody should be able to answer without
 * database access — even when the answer is not editable here. The page says
 * how to grant one rather than pretending the question never comes up.
 */
export function PlatformOperatorsPage() {
  const operators = useQuery({
    queryKey: ['platform', 'operators'],
    queryFn: platformAdminApi.operators,
  });

  const columns: ReadonlyArray<Column<OperatorRow>> = [
    {
      key: 'email',
      header: 'Operator',
      render: (row) => (
        <div style={{ minWidth: 0 }}>
          <div>{row.display_name || row.email}</div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-2xs)',
              color: 'var(--ink-tertiary)',
            }}
          >
            {row.email}
          </div>
        </div>
      ),
    },
    { key: 'home', header: 'Account lives in', render: (row) => row.home_organization_name },
    {
      key: 'reason',
      header: 'Why',
      render: (row) =>
        row.reason ? (
          row.reason
        ) : (
          <span style={{ color: 'var(--ink-tertiary)' }}>not recorded</span>
        ),
    },
    {
      key: 'granted',
      header: 'Granted',
      render: (row) => (
        <span style={{ whiteSpace: 'nowrap' }}>
          {row.granted_at ? new Date(row.granted_at).toLocaleDateString() : '—'}
          {row.granted_by ? (
            <span style={{ color: 'var(--ink-tertiary)' }}> by {row.granted_by}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusBadge tone={row.is_active ? 'online' : 'offline'}>
          {row.is_active ? 'Active' : 'Disabled'}
        </StatusBadge>
      ),
    },
  ];

  if (operators.isLoading) return <LoadingState label="Reading operators" />;
  if (operators.isError) return <ErrorState title="Operators could not be read" body="The list is unavailable." />;
  if (!operators.data) return null;

  return (
    <>
      <PageIntro
        eyebrow="Platform"
        title="Operators"
        standfirst="Accounts that can reach every organization on this deployment."
      />

      <Region order={2}>
        <SectionRule
          lead
          label="Who holds platform authority"
          detail="Read-only here. Granting is deliberately a command-line act, so the privilege cannot grant itself."
        />
        <Plane>
          <DataTable
            caption="Accounts holding platform authority, when it was granted and why"
            rows={operators.data.operators}
            columns={columns}
            rowKey={(row) => row.user_id}
            empty="Nobody holds platform authority."
          />
          <p style={{ marginBottom: 0, color: 'var(--ink-tertiary)', fontSize: 'var(--text-xs)' }}>
            To grant or revoke: <code>{operators.data.how_to_grant}</code>
          </p>
        </Plane>
      </Region>
    </>
  );
}

/* ── role policy ──────────────────────────────────────────────────────────── */

/**
 * What each role means, as the server actually enforces it.
 *
 * ### This page is deliberately read-only, and says so out loud
 *
 * `ROLE_PERMISSIONS` is a Python constant and `Role` is a closed enum. There is
 * no table behind either and no write path — so a console offering to edit a
 * role definition would be offering an edit the server would refuse. That is a
 * worse failure than the absence of the feature, because the operator would
 * believe the change took effect.
 *
 * What *does* exist for making two holders of the same role differ is a
 * per-user, per-organization permission override, applied inside the
 * organization it affects. The page names that mechanism rather than leaving
 * somebody to conclude the product cannot do it at all.
 */
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
        standfirst="What each role grants, product-wide. These definitions are part of the application, not settings."
        meta={<Badge>{it.editable ? 'Editable' : 'Read-only'}</Badge>}
      />

      <Region order={2}>
        <SectionRule
          lead
          label="How access is customised"
          detail="Role definitions are the same everywhere. Individuals differ by exception, not by redefining the role."
        />
        <Plane>
          <p style={{ marginTop: 0 }}>
            Two people holding the same role are made to differ by granting or revoking individual
            permissions <strong>on the person</strong>, inside the organization it applies to —{' '}
            {it.customization.where}. That keeps one definition of “Kitchen Supervisor” across the
            platform while still letting one of them be read-only.
          </p>
          <p style={{ marginBottom: 0, color: 'var(--ink-tertiary)', fontSize: 'var(--text-sm)' }}>
            {it.customization.note}
          </p>
        </Plane>
      </Region>

      <Region order={3}>
        <SectionRule label="Roles" detail={`${it.roles.length} roles · ${it.permissions.length} permissions`} />
        <Plane>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-5)' }}>
            {it.roles.map((role) => (
              <li key={role.role} style={{ paddingBottom: 'var(--space-4)', borderBottom: '1px solid var(--line-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 'var(--weight-semibold)' }}>{roleLabel(role.role)}</span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-2xs)',
                      color: 'var(--ink-tertiary)',
                    }}
                  >
                    {role.role} · {role.permission_count} permissions
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 'var(--space-2)',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 'var(--space-1)',
                  }}
                >
                  {role.permissions.map((permission) => (
                    <span
                      key={permission}
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-2xs)',
                        padding: '0.1rem 0.35rem',
                        borderRadius: 'var(--radius-xs)',
                        background: 'var(--surface-hover)',
                        color: 'var(--ink-secondary)',
                      }}
                    >
                      {permission}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Plane>
      </Region>
    </>
  );
}

/* ── structural destinations ──────────────────────────────────────────────── */

/**
 * A destination that exists in the information architecture and has no backend
 * behind it yet.
 *
 * It names the specific thing it is waiting for and renders no figures at all.
 * The alternative — an empty table — is indistinguishable from a platform where
 * nothing has happened, and that is the reading that makes a console
 * untrustworthy: an operator cannot tell "no data" from "not built".
 */
function Structural({
  title,
  standfirst,
  waitingFor,
}: {
  title: string;
  standfirst: string;
  waitingFor: string;
}) {
  return (
    <>
      <PageIntro eyebrow="Platform" title={title} standfirst={standfirst} meta={<Badge>Not connected</Badge>} />
      <Region order={2}>
        <SectionRule lead label="What this is waiting for" />
        <Plane>
          <p style={{ margin: 0 }}>{waitingFor}</p>
          <p style={{ marginBottom: 0, color: 'var(--ink-tertiary)', fontSize: 'var(--text-sm)' }}>
            Nothing is shown here rather than an empty table, so that “no activity” and “not built
            yet” can never look the same.
          </p>
        </Plane>
      </Region>
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
    />
  );
}

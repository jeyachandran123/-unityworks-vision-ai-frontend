/**
 * The organization hub — what `/admin` is now instead of a stacked page.
 *
 * The page this replaces put Zones and Accounts one under another in a
 * single vertical scroll, with a creation form for each. It worked, in the
 * sense that every control was on the screen somewhere. What it could not do
 * was let anyone *look at* a site, or a person, or answer "is this
 * organization set up correctly" without reading three tables.
 *
 * So this page answers that one question and hands off. It creates nothing:
 * every domain has its own surface now, and a hub that also had forms would
 * be the stacked page again with extra links.
 *
 * ### Roles & Access is a reading of the same data, not a second system
 *
 * The access matrix shows what each role carries, straight from the permission
 * vocabulary. It is deliberately read-only: a role's contents are defined in
 * code and are the same for every customer, and the per-person differences —
 * which are the ones administrators actually need — live on a person's own
 * profile as overrides. A screen that let you edit a role would either be
 * lying or would fork the vocabulary per tenant.
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { organizationApi } from '@shared/api/observations';
import { camerasApi } from '@shared/api/persistence';
import { recordersApi } from '@shared/api/recorders';
import { adminUsersApi } from '@shared/api/user-administration';
import { PERMISSIONS, ROLES, roleLabel, type Permission } from '@app/permissions/permissions';
import { usePermissions } from '@app/permissions/guards';
import { useAuth } from '@app/auth/AuthProvider';
import { Callout } from '@shared/ui/feedback';
import { EntityIcons, Icon, NavIcons, PermissionIcons, PlatformIcons } from '@shared/ui/icons';
import { LoadingState } from '@shared/ui/primitives';
import { PageIntro, SectionRule } from '@shared/ui/product';
import { AvatarGroup, ButtonLink, MetricTile, Panel, StatusPill } from '@shared/ui/surfaces';

import { Failed } from './shared';

export function AdminOverviewPage() {
  const { has } = usePermissions();
  const { user } = useAuth();

  const zones = useQuery({
    queryKey: ['zones', 'overview'],
    queryFn: () => organizationApi.zones({ limit: 1 }),
    enabled: has(PERMISSIONS.viewZones),
  });
  const cameras = useQuery({
    queryKey: ['cameras'],
    queryFn: camerasApi.list,
    enabled: has(PERMISSIONS.viewCameras),
  });
  const recorders = useQuery({
    queryKey: ['recorders', 'overview'],
    queryFn: () => recordersApi.list({ limit: 1 }),
    enabled: has(PERMISSIONS.viewCameras),
  });
  const people = useQuery({
    queryKey: ['admin-users', 'overview'],
    queryFn: () => adminUsersApi.list({ limit: 1 }),
    enabled: has(PERMISSIONS.viewUsers),
  });

  const surfaces = [
    {
      to: '/admin/zones',
      label: 'Zones',
      body: 'The areas cameras are placed in — the kitchen, the dine hall, billing.',
      permission: PERMISSIONS.viewZones,
      count: zones.data?.total,
      icon: NavIcons.administration,
    },
    {
      to: '/admin/recorders',
      label: 'Recorders',
      body: 'The DVRs and NVRs your cameras plug into, and how to sign in to them.',
      permission: PERMISSIONS.viewCameras,
      count: recorders.data?.total,
      icon: NavIcons.integrations,
    },
    {
      to: '/admin/cameras',
      label: 'Cameras',
      body: 'What is watching, where it is, and whether it is switched on.',
      permission: PERMISSIONS.viewCameras,
      count: cameras.data?.total,
      icon: NavIcons.cameras,
    },
    {
      to: '/admin/people',
      label: 'People',
      body: 'Who has an account, what they hold, and which cameras they reach.',
      permission: PERMISSIONS.viewUsers,
      count: people.data?.total,
      icon: EntityIcons.person,
    },
    {
      to: '/admin/access',
      label: 'Roles & access',
      body: 'What each role carries, and how an individual can differ from it.',
      permission: PERMISSIONS.viewUsers,
      count: undefined,
      icon: PlatformIcons.access,
    },
  ].filter((surface) => has(surface.permission));

  // What is missing, said as the next step. Each is a reading of a real count,
  // and only offered to somebody who could act on it.
  const nextSteps: ReadonlyArray<{ title: string; body: string; to: string; label: string }> = [
    ...(zones.data && zones.data.total === 0 && has(PERMISSIONS.manageZones)
      ? [{ title: 'No zones yet', body: 'A camera is placed in a zone, so add one first.', to: '/admin/zones', label: 'Add a zone' }]
      : []),
    ...(recorders.data && recorders.data.total === 0 && has(PERMISSIONS.manageCameras)
      ? [{ title: 'No recorder yet', body: 'Cameras are reached through the DVR or NVR they plug into.', to: '/admin/recorders/new', label: 'Add a recorder' }]
      : []),
    ...(cameras.data && cameras.data.total > 0 && cameras.data.enabled === 0 && has(PERMISSIONS.manageCameras)
      ? [{ title: 'Every camera is switched off', body: 'Nothing is being watched until one is started.', to: '/admin/cameras', label: 'Open cameras' }]
      : []),
  ];

  return (
    <>
      <PageIntro
        eyebrow="Organization"
        title="Administration"
        standfirst="How this organization is set up: where it operates, what is watching, and who can see it."
      />

      <SectionRule lead order={2} label="This organization" detail="The numbers that say whether it is configured at all." />
      <section className="uwv-metrics uwv-arrive" data-order="2" aria-label="This organization">
        {zones.isError ? <Failed error={zones.error} /> : null}
        {has(PERMISSIONS.viewZones) ? (
          <MetricTile
            label="Zones"
            icon={NavIcons.administration}
            value={zones.data ? zones.data.total : null}
            unavailableReason={zones.isLoading ? 'Reading' : 'Could not be read'}
            detail="Areas cameras are placed in"
          />
        ) : null}
        {has(PERMISSIONS.viewCameras) ? (
          <>
            <MetricTile
              label="Cameras"
              icon={NavIcons.cameras}
              value={cameras.data ? cameras.data.total : null}
              unavailableReason={cameras.isLoading ? 'Reading' : 'Could not be read'}
              detail={recorders.data ? `On ${recorders.data.total} recorder${recorders.data.total === 1 ? '' : 's'}` : 'Configured, on or off'}
            />
            <MetricTile
              label="Switched on"
              icon={NavIcons.live}
              value={cameras.data ? cameras.data.enabled : null}
              unit={cameras.data ? `/ ${cameras.data.total}` : undefined}
              unavailableReason={cameras.isLoading ? 'Reading' : 'Could not be read'}
              detail="A camera that is off opens no connection."
            />
          </>
        ) : null}
        {has(PERMISSIONS.viewUsers) ? (
          <MetricTile
            label="People"
            icon={EntityIcons.person}
            value={people.data ? people.data.total : null}
            unavailableReason={people.isLoading ? 'Reading' : 'Could not be read'}
            detail="Accounts in this organization"
          />
        ) : null}
      </section>

      {nextSteps.length > 0 ? (
        <div className="uwv-stack" data-gap="sm" style={{ marginTop: 'var(--space-6)' }}>
          {nextSteps.map((step) => (
            <Callout
              key={step.title}
              tone="warning"
              title={step.title}
              actions={
                <ButtonLink to={step.to} size="sm" variant="secondary">
                  {step.label}
                </ButtonLink>
              }
            >
              {step.body}
            </Callout>
          ))}
        </div>
      ) : null}

      <SectionRule order={3} label="Areas" detail="Only what this account can reach is listed." />
      <section className="uwv-area-grid uwv-arrive" data-order="3" aria-label="Areas">
        {surfaces.map((surface) => (
          <Link key={surface.to} to={surface.to} className="uwv-area-card">
            <span className="uwv-area-card-head">
              <span className="uwv-area-card-title">{surface.label}</span>
              {typeof surface.count === 'number' ? <span className="uwv-view-count">{surface.count}</span> : null}
            </span>
            <span className="uwv-area-card-body">{surface.body}</span>
            <span className="uwv-area-card-icon" aria-hidden="true">
              <Icon icon={surface.icon} size="control" />
            </span>
          </Link>
        ))}
        {surfaces.length === 0 ? (
          <Callout tone="neutral">
            This account holds no administration permissions. Nothing here is hidden as a courtesy — the server refuses these
            routes too.
          </Callout>
        ) : null}
      </section>

      <SectionRule order={4} label="What you can do here" detail="Your own effective access, as the server computed it for this request." />
      <div className="uwv-arrive" data-order="4">
        <Panel
          title={user?.display_name || user?.subject || 'You'}
          description={user?.roles.length ? user.roles.map(roleLabel).join(' · ') : 'No role — access comes from individual grants'}
        >
          <AccessSummary />
        </Panel>
      </div>
    </>
  );
}

/* ── the access matrix ────────────────────────────────────────────────────── */

/**
 * The product's features, as read/manage pairs where that is what they are.
 *
 * Deliberately not every permission mechanically split in two. Incidents are
 * view/acknowledge/resolve, evidence is view/delete, reports are view/export —
 * shoehorning those into "read and manage" would misdescribe them. Only the
 * domains that genuinely have a read half and a write half appear that way.
 */
const FEATURES: ReadonlyArray<{
  label: string;
  rows: ReadonlyArray<{ label: string; permission: Permission }>;
}> = [
  {
    label: 'Zones',
    rows: [
      { label: 'View zones', permission: PERMISSIONS.viewZones },
      { label: 'Manage zones', permission: PERMISSIONS.manageZones },
    ],
  },
  {
    label: 'Cameras',
    rows: [
      { label: 'View cameras', permission: PERMISSIONS.viewCameras },
      { label: 'Manage cameras', permission: PERMISSIONS.manageCameras },
      { label: 'Retire cameras', permission: PERMISSIONS.retireCameras },
    ],
  },
  {
    label: 'People',
    rows: [
      { label: 'View people', permission: PERMISSIONS.viewUsers },
      { label: 'Manage people', permission: PERMISSIONS.manageUsers },
    ],
  },
  {
    label: 'Incidents',
    rows: [
      { label: 'View incidents', permission: PERMISSIONS.viewIncidents },
      { label: 'Acknowledge', permission: PERMISSIONS.acknowledgeIncidents },
      { label: 'Resolve', permission: PERMISSIONS.resolveIncidents },
    ],
  },
  {
    label: 'Evidence',
    rows: [
      { label: 'View evidence', permission: PERMISSIONS.viewEvidence },
      { label: 'Delete evidence', permission: PERMISSIONS.deleteEvidence },
    ],
  },
  {
    label: 'Reports',
    rows: [
      { label: 'View reports', permission: PERMISSIONS.viewReports },
      { label: 'Export reports', permission: PERMISSIONS.exportReports },
    ],
  },
];

function AccessSummary() {
  const { has } = usePermissions();

  return (
    <div
      style={{
        display: 'grid',
        gap: 'var(--space-6) var(--space-8)',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 11rem), 1fr))',
      }}
    >
      {FEATURES.map((feature) => (
        <div key={feature.label}>
          <h3
            style={{
              margin: '0 0 var(--space-3)',
              fontSize: 'var(--text-2xs)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--ink-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-wider)',
            }}
          >
            {feature.label}
          </h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-2)' }}>
            {feature.rows.map((row) => (
              <li
                key={row.permission}
                style={{
                  display: 'flex',
                  gap: 'var(--space-2)',
                  alignItems: 'center',
                  fontSize: 'var(--text-sm)',
                  color: has(row.permission) ? 'var(--ink-primary)' : 'var(--ink-tertiary)',
                }}
              >
                {/* The word, not only the mark. A tick and a dash differ by
                    shape here, and the state is also spelled out for anyone
                    who cannot rely on either. */}
                <span
                  aria-hidden
                  style={{
                    display: 'grid',
                    placeItems: 'center',
                    width: '1.25rem',
                    height: '1.25rem',
                    borderRadius: 'var(--radius-sm)',
                    flexShrink: 0,
                    background: has(row.permission) ? 'var(--accent-wash)' : 'var(--surface-sunken)',
                    color: has(row.permission) ? 'var(--accent)' : 'var(--ink-tertiary)',
                  }}
                >
                  <Icon icon={has(row.permission) ? PermissionIcons.held : PermissionIcons.notHeld} size="inline" />
                </span>
                <span>{row.label}</span>
                <span className="sr-only">{has(row.permission) ? 'yes' : 'no'}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* ── roles & access ───────────────────────────────────────────────────────── */

export function RolesAndAccessPage() {
  const people = useQuery({
    queryKey: ['admin-users', 'by-role'],
    queryFn: () => adminUsersApi.list({ limit: 200 }),
  });

  return (
    <>
      <PageIntro
        eyebrow="Organization"
        title="Roles & access"
        standfirst="What each role carries, and who holds it. Individual exceptions live on a person's own profile."
      />

      <SectionRule lead order={2} label="How access is decided" detail="Two things compose, and one of them always wins." />
      <div className="uwv-split-even uwv-arrive" data-order="2">
        <Panel>
          <div className="uwv-stack" data-gap="md">
            <p className="uwv-type-body-lg">
              A person&apos;s access is what their <strong>roles</strong> carry, plus anything individually{' '}
              <strong>added</strong>, minus anything individually <strong>restricted</strong>.
            </p>
            <p className="uwv-type-body" style={{ color: 'var(--ink-secondary)' }}>
              A restriction always wins — including over a role that grants the same thing — because it is the more specific
              statement about that one person.
            </p>
          </div>
        </Panel>
        <Callout tone="info" title="Why two people on one role can differ">
          A manager who may edit zones and one who may only read them are both Restaurant Managers; the difference is one
          added permission on the first, not a second role.
        </Callout>
      </div>

      <SectionRule order={3} label="Who holds what" detail="Every role, and the people holding it here." />
      <section className="uwv-arrive" data-order="3">
        {people.isLoading ? <LoadingState label="Reading roles" /> : null}
        {people.isError ? <Failed error={people.error} /> : null}
        {people.data ? (
          <ul className="uwv-role-grid" style={{ marginTop: 0 }} aria-label="Roles and who holds them">
            {Object.values(ROLES).map((role) => {
              const holders = people.data.users.filter((user) => user.roles.includes(role));
              return (
                <li key={role} className="uwv-panel uwv-role-card">
                  <div className="uwv-role-card-head">
                    <span className="uwv-panel-title">{roleLabel(role)}</span>
                    <StatusPill tone={holders.length > 0 ? 'online' : 'idle'}>
                      {holders.length === 0 ? 'Nobody' : `${holders.length} ${holders.length === 1 ? 'person' : 'people'}`}
                    </StatusPill>
                  </div>
                  {holders.length > 0 ? (
                    <>
                      <AvatarGroup
                        people={holders.map((holder) => ({ id: holder.id, name: holder.display_name || holder.email }))}
                        max={6}
                      />
                      <ul className="uwv-chip-list" aria-label={`Holding ${roleLabel(role)}`}>
                        {holders.map((holder) => (
                          <li key={holder.id}>
                            <Link to={`/admin/people/${encodeURIComponent(holder.id)}`}>{holder.display_name || holder.email}</Link>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="uwv-type-caption">Nobody here holds this role.</p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
    </>
  );
}

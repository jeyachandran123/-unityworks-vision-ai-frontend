/**
 * The organization hub — what `/admin` is now instead of a stacked page.
 *
 * The page this replaces put Sites, Zones and Accounts one under another in a
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
import { adminUsersApi } from '@shared/api/user-administration';
import { PERMISSIONS, ROLES, roleLabel, type Permission } from '@app/permissions/permissions';
import { usePermissions } from '@app/permissions/guards';
import { useAuth } from '@app/auth/AuthProvider';
import { Badge, LoadingState, StatusBadge } from '@shared/ui/primitives';
import { Figure, PageIntro, Plane, Region, SectionRule } from '@shared/ui/product';

import { Failed } from './shared';

export function AdminOverviewPage() {
  const { has } = usePermissions();
  const { user } = useAuth();

  const sites = useQuery({
    queryKey: ['sites', 'overview'],
    queryFn: () => organizationApi.restaurants({ limit: 1 }),
    enabled: has(PERMISSIONS.viewSites),
  });
  const cameras = useQuery({
    queryKey: ['cameras'],
    queryFn: camerasApi.list,
    enabled: has(PERMISSIONS.viewCameras),
  });
  const people = useQuery({
    queryKey: ['admin-users', 'overview'],
    queryFn: () => adminUsersApi.list({ limit: 1 }),
    enabled: has(PERMISSIONS.viewUsers),
  });

  const surfaces = [
    {
      to: '/admin/sites',
      label: 'Sites',
      body: 'The places this organization operates, and the zones inside them.',
      permission: PERMISSIONS.viewSites,
      count: sites.data?.total,
    },
    {
      to: '/admin/cameras',
      label: 'Cameras',
      body: 'What is watching, where it is, and whether it is switched on.',
      permission: PERMISSIONS.viewCameras,
      count: cameras.data?.total,
    },
    {
      to: '/admin/people',
      label: 'People',
      body: 'Who has an account, what they hold, and which cameras they reach.',
      permission: PERMISSIONS.viewUsers,
      count: people.data?.total,
    },
    {
      to: '/admin/access',
      label: 'Roles & access',
      body: 'What each role carries, and how an individual can differ from it.',
      permission: PERMISSIONS.viewUsers,
      count: undefined,
    },
  ].filter((surface) => has(surface.permission));

  return (
    <>
      <PageIntro
        eyebrow="organization"
        title="Administration"
        standfirst="How this organization is set up: where it operates, what is watching, and who can see it."
      />

      <Region order={2}>
        <SectionRule
          lead
          label="This organization"
          detail="The three numbers that say whether it is configured at all."
        />
        <Plane>
          {sites.isError ? <Failed error={sites.error} /> : null}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(11rem, 100%), 1fr))',
              gap: 'var(--space-6)',
            }}
          >
            {has(PERMISSIONS.viewSites) ? (
              <Figure
                scale="lead"
                label="Sites"
                value={sites.data ? String(sites.data.total) : null}
                unavailableReason={sites.isLoading ? 'Reading' : undefined}
              />
            ) : null}
            {has(PERMISSIONS.viewCameras) ? (
              <>
                <Figure
                  scale="lead"
                  label="Cameras"
                  value={cameras.data ? String(cameras.data.total) : null}
                  unavailableReason={cameras.isLoading ? 'Reading' : undefined}
                />
                <Figure
                  scale="lead"
                  label="Switched on"
                  value={
                    cameras.data ? `${cameras.data.enabled} of ${cameras.data.total}` : null
                  }
                  detail="A camera that is off opens no connection."
                  unavailableReason={cameras.isLoading ? 'Reading' : undefined}
                />
              </>
            ) : null}
            {has(PERMISSIONS.viewUsers) ? (
              <Figure
                scale="lead"
                label="People"
                value={people.data ? String(people.data.total) : null}
                unavailableReason={people.isLoading ? 'Reading' : undefined}
              />
            ) : null}
          </div>
        </Plane>
      </Region>

      <Region order={3}>
        <SectionRule label="Areas" detail="Only what this account can reach is listed." />
        <Plane>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(16rem, 100%), 1fr))',
              gap: 'var(--space-5)',
            }}
          >
            {surfaces.map((surface) => (
              <Link
                key={surface.to}
                to={surface.to}
                style={{
                  display: 'grid',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-5)',
                  border: '1px solid var(--line-subtle)',
                  borderRadius: 'var(--radius-md)',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <span
                  style={{
                    display: 'flex',
                    gap: 'var(--space-3)',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                  }}
                >
                  <strong>{surface.label}</strong>
                  {typeof surface.count === 'number' ? <Badge>{surface.count}</Badge> : null}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                  {surface.body}
                </span>
              </Link>
            ))}
          </div>
          {surfaces.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
              This account holds no administration permissions. Nothing here is hidden as a
              courtesy — the server refuses these routes too.
            </p>
          ) : null}
        </Plane>
      </Region>

      <Region order={4}>
        <SectionRule
          label="What you can do here"
          detail="Your own effective access, as the server computed it for this request."
        />
        <Plane>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {(user?.roles ?? []).map((role) => (
              <Badge key={role}>{roleLabel(role)}</Badge>
            ))}
          </div>
          <div style={{ marginTop: 'var(--space-5)' }}>
            <AccessSummary />
          </div>
        </Plane>
      </Region>
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
    label: 'Sites',
    rows: [
      { label: 'View sites', permission: PERMISSIONS.viewSites },
      { label: 'Manage sites', permission: PERMISSIONS.manageSites },
    ],
  },
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
    <div style={{ display: 'grid', gap: 'var(--space-5)' }}>
      {FEATURES.map((feature) => (
        <div key={feature.label}>
          <h3
            style={{
              margin: '0 0 var(--space-2)',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {feature.label}
          </h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.2rem' }}>
            {feature.rows.map((row) => (
              <li
                key={row.permission}
                style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'baseline' }}
              >
                {/* The word, not only the mark. A tick and a cross differ by
                    shape here, and the state is also spelled out for anyone
                    who cannot rely on either. */}
                <span aria-hidden style={{ fontFamily: 'var(--font-mono)' }}>
                  {has(row.permission) ? '✓' : '✕'}
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
        eyebrow="organization"
        title="Roles & access"
        standfirst="What each role carries, and who holds it. Individual exceptions live on a person's own profile."
      />

      <Region order={2}>
        <SectionRule
          lead
          label="How access is decided"
          detail="Two things compose, and one of them always wins."
        />
        <Plane>
          <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '44rem' }}>
            <p style={{ margin: 0 }}>
              A person's access is what their <strong>roles</strong> carry, plus anything
              individually <strong>added</strong>, minus anything individually{' '}
              <strong>restricted</strong>. A restriction always wins — including over a role that
              grants the same thing — because it is the more specific statement about that one
              person.
            </p>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
              This is what lets two people on the same role differ. A manager who may edit sites
              and one who may only read them are both Restaurant Managers; the difference is one
              added permission on the first, not a second role.
            </p>
          </div>
        </Plane>
      </Region>

      <Region order={3}>
        <SectionRule label="Who holds what" />
        <Plane>
          {people.isLoading ? <LoadingState label="Reading roles" /> : null}
          {people.isError ? <Failed error={people.error} /> : null}
          {people.data ? (
            <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
              {Object.values(ROLES).map((role) => {
                const holders = people.data.users.filter((user) => user.roles.includes(role));
                return (
                  <div key={role}>
                    <div
                      style={{
                        display: 'flex',
                        gap: 'var(--space-3)',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                      }}
                    >
                      <strong>{roleLabel(role)}</strong>
                      <StatusBadge tone={holders.length > 0 ? 'online' : 'idle'}>
                        {holders.length === 0
                          ? 'Nobody'
                          : `${holders.length} ${holders.length === 1 ? 'person' : 'people'}`}
                      </StatusBadge>
                    </div>
                    {holders.length > 0 ? (
                      <ul
                        style={{
                          listStyle: 'none',
                          margin: 'var(--space-2) 0 0',
                          padding: 0,
                          display: 'flex',
                          gap: 'var(--space-3)',
                          flexWrap: 'wrap',
                        }}
                      >
                        {holders.map((holder) => (
                          <li key={holder.id}>
                            <Link to={`/admin/people/${encodeURIComponent(holder.id)}`}>
                              {holder.display_name || holder.email}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </Plane>
      </Region>
    </>
  );
}

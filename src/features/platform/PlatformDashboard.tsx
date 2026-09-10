/**
 * The Platform Dashboard — the platform at a glance.
 *
 * ### Every figure here is counted. None is scored.
 *
 * There is no health percentage, no compliance rate and no trend line, and
 * their absence is the design rather than an omission. Each number below is a
 * `COUNT(*)` the server actually ran, and each answers a question that
 * genuinely spans customers. A figure that could only be produced by inventing
 * a weighting would be a figure nobody could act on — and the first person to
 * act on it would be acting on our arithmetic rather than on their estate.
 *
 * ### What deliberately is not here
 *
 * Incident counts, violation rates, compliance scores. Those are *organization
 * judgements* — "that is a hygiene violation" is an opinion a consumer forms
 * about its own kitchen — and aggregating opinions across unrelated customers
 * produces a number with no referent. They belong on a Command Center, which is
 * one organization's reading of its own estate.
 *
 * ### The tile that earns its place
 *
 * "Cameras streaming" against "cameras configured". A customer whose cameras
 * have silently stopped is the failure that generates the angriest call, and
 * before this page nothing in the product compared those two numbers across
 * organizations. The runtime figure is read from the live wall registry, so it
 * reports what is happening rather than what configuration says ought to be.
 */

import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { platformAdminApi } from '@shared/api/platform';
import { EmptyState, ErrorState, LoadingState } from '@shared/ui/primitives';
import { Figure, PageIntro, Plane, Region, SectionRule } from '@shared/ui/product';

/** Audit action strings, in the words a person would use. */
const ACTION_LABEL: Record<string, string> = {
  'organization.created': 'organization created',
  'organization.updated': 'organization renamed',
  'organization.status_changed': 'Status changed',
  'organization.operator_entered': 'Operator entered',
  'organization.member_added': 'Member added',
  'organization.member_removed': 'Member removed',
};

export function PlatformDashboard() {
  const overview = useQuery({
    // Namespaced under `platform` so control-plane data and organization data
    // never share a cache key. They are answers to different questions asked of
    // different principals, and a collision would be a tenant leak.
    queryKey: ['platform', 'overview'],
    queryFn: platformAdminApi.overview,
  });

  if (overview.isLoading) return <LoadingState label="Reading the platform" />;
  if (overview.isError) {
    return (
      <ErrorState
        title="The platform overview could not be read"
        body="The control plane is unavailable. organizations and People may still work."
      />
    );
  }
  if (!overview.data) return null;

  const it = overview.data;
  const stalled = it.attention.organizations_needing_setup;

  return (
    <>
      <PageIntro
        eyebrow="Platform"
        title="Overview"
        standfirst="Every organization on this deployment, counted. Nothing here is scored or inferred."
      />

      <Region order={2}>
        <SectionRule lead label="Customers" detail="organizations by lifecycle state." />
        <Plane>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(10rem, 100%), 1fr))',
              gap: 'var(--space-6)',
            }}
          >
            <Figure scale="hero" label="organizations" value={it.organizations.total} />
            <Figure scale="lead" label="Active" value={it.organizations.active} />
            <Figure scale="lead" label="Suspended" value={it.organizations.suspended} />
            <Figure scale="lead" label="Archived" value={it.organizations.archived} />
          </div>
        </Plane>
      </Region>

      <Region order={3}>
        <SectionRule
          label="Estate"
          detail="Configured across every organization, and what the runtime is actually streaming."
        />
        <Plane>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(10rem, 100%), 1fr))',
              gap: 'var(--space-6)',
            }}
          >
            <Figure scale="lead" label="Sites" value={it.estate.sites} />
            <Figure scale="lead" label="Cameras" value={it.estate.cameras} />
            <Figure
              scale="lead"
              label="Streaming now"
              value={it.estate.cameras_running}
              tone={
                it.estate.cameras > 0 && it.estate.cameras_running === 0 ? 'critical' : 'default'
              }
              detail="From the live runtime, not from configuration. This process only — a multi-process deployment reports its own share."
            />
          </div>
        </Plane>
      </Region>

      <Region order={4}>
        <SectionRule
          label="People"
          detail="Accounts across the platform. Membership is what lets somebody enter an organization."
        />
        <Plane>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(10rem, 100%), 1fr))',
              gap: 'var(--space-6)',
            }}
          >
            <Figure scale="lead" label="Users" value={it.people.users} />
            <Figure scale="lead" label="Active" value={it.people.active_users} />
            <Figure
              scale="lead"
              label="Multi-organization"
              value={it.people.multi_organization_users}
              detail="People who may enter more than one customer."
            />
            <Figure
              scale="lead"
              label="Never signed in"
              value={it.people.never_signed_in}
              detail="Provisioned and not yet used."
            />
            <Figure
              scale="lead"
              label="Platform operators"
              value={it.people.platform_operators}
              detail="Accounts that can reach every customer."
            />
          </div>
        </Plane>
      </Region>

      <Region order={5}>
        <SectionRule
          label="Needs attention"
          detail="Active organizations with no sites or no cameras — onboarding that has not finished."
        />
        <Plane>
          {stalled.length === 0 ? (
            <EmptyState
              title="Nothing outstanding"
              body="Every active organization has at least one site and one camera."
            />
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-3)' }}>
              {stalled.map((organization) => (
                <li
                  key={organization.id}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 'var(--space-3)',
                    paddingBottom: 'var(--space-3)',
                    borderBottom: '1px solid var(--line-subtle)',
                  }}
                >
                  <Link
                    to={`/platform/organizations/${encodeURIComponent(organization.id)}`}
                    style={{ fontWeight: 'var(--weight-semibold)' }}
                  >
                    {organization.name}
                  </Link>
                  <span style={{ color: 'var(--ink-tertiary)', fontSize: 'var(--text-sm)' }}>
                    {organization.site_count === 0 ? 'no sites' : null}
                    {organization.site_count === 0 && organization.camera_count === 0 ? ' · ' : null}
                    {organization.camera_count === 0 ? 'no cameras' : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Plane>
      </Region>

      <Region order={6}>
        <SectionRule
          label="Recent platform activity"
          detail="organization lifecycle, membership and operator entry. Not a customer's own audit trail."
        />
        <Plane>
          {it.recent_activity.length === 0 ? (
            <EmptyState title="No activity yet" body="Platform acts will appear here as they happen." />
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-2)' }}>
              {it.recent_activity.map((row) => (
                <li
                  key={row.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(9rem, auto) 1fr auto',
                    gap: 'var(--space-3)',
                    alignItems: 'baseline',
                    paddingBottom: 'var(--space-2)',
                    borderBottom: '1px solid var(--line-subtle)',
                    fontSize: 'var(--text-sm)',
                  }}
                >
                  <span>{ACTION_LABEL[row.action] ?? row.action}</span>
                  <span style={{ color: 'var(--ink-secondary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.organization_id} · {row.actor}
                  </span>
                  <span
                    style={{
                      color: 'var(--ink-tertiary)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-2xs)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.occurred_at ? new Date(row.occurred_at).toLocaleString() : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Plane>
      </Region>
    </>
  );
}

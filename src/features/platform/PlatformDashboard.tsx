/**
 * The Platform Dashboard — what a Platform Admin opens first.
 *
 * It answers one question before any other: *which customer needs me?* So the
 * page opens on the attention panel, ranked, with every row a road to the
 * customer it names. Below it come the four instruments (customers, live
 * cameras, people, activity), every customer on one line, who has been signing
 * in, and a fortnight of what the platform did.
 *
 * ### Every figure here is counted. None is scored.
 *
 * There is no health percentage and no compliance rate, and their absence is
 * the design rather than an omission. Each number is a `COUNT(*)` the server
 * actually ran, or a state the runtime actually reported. A figure that could
 * only be produced by inventing a weighting would be one nobody could act on.
 * The activity chart is a count per day, and the week-on-week line says "more"
 * or "fewer", never "better" or "worse": activity going up is a fact about the
 * platform, not a verdict on it.
 *
 * ### What deliberately is not here
 *
 * Incident counts, violation rates, compliance scores. Those are *organization
 * judgements* — "that is a hygiene violation" is an opinion a consumer forms
 * about its own kitchen — and aggregating opinions across unrelated customers
 * produces a number with no referent. They belong on a Command Center, which is
 * one organization's reading of its own estate.
 *
 * ### Live means a frame arrived
 *
 * "Cameras live" is read from the wall's own per-stream state, which is `live`
 * only when a frame arrived in the last few seconds. The old tile counted every
 * stream the wall *held* — a switched-off camera and one that would not
 * authenticate included — which is the configured-passes-for-live mistake this
 * product exists not to make.
 */

import { useQuery } from '@tanstack/react-query';

import { platformAdminApi, type PlatformOverview } from '@shared/api/platform';
import { Icon, NavIcons, PlatformIcons, StatusIcons } from '@shared/ui/icons';
import { Button, ErrorState, LoadingState } from '@shared/ui/primitives';
import { Attention, Meter, PageIntro, Plane, Region, SectionRule } from '@shared/ui/product';

import {
  ActivityBars,
  ActivityFeed,
  AttentionList,
  QuickActions,
  BandBars,
  DeltaBadge,
  FactRow,
  FleetTable,
  KpiTile,
  RingGauge,
} from './dashboard-parts';
import {
  attentionQueue,
  attentionSummary,
  clockTime,
  orderFleet,
  plural,
  signInBands,
  streamBands,
  weekOnWeek,
} from './dashboard-model';

/** Re-read every minute: a stopped camera should not wait for a reload. */
const REFRESH_MS = 60_000;

const TREND_ICON = {
  up: PlatformIcons.up,
  down: PlatformIcons.down,
  level: PlatformIcons.level,
} as const;

/** True when the server answered with the shape this page reads. */
function isCurrent(data: PlatformOverview): boolean {
  return Array.isArray(data.fleet) && Boolean(data.activity) && Boolean(data.attention?.organizations_without_admin);
}

export function PlatformDashboard() {
  const overview = useQuery({
    // Namespaced under `platform` so control-plane data and organization data
    // never share a cache key. They are answers to different questions asked of
    // different principals, and a collision would be a tenant leak.
    queryKey: ['platform', 'overview'],
    queryFn: () => platformAdminApi.overview(),
    refetchInterval: REFRESH_MS,
  });

  if (overview.isLoading) return <LoadingState label="Reading the platform" />;
  if (overview.isError) {
    return (
      <ErrorState
        title="The platform overview could not be read"
        body="The control plane is unavailable. Organizations and People may still work."
      />
    );
  }
  if (!overview.data) return null;
  if (!isCurrent(overview.data)) {
    // An older server answers without the counts this page draws. Saying so is
    // better than drawing zeros it never sent.
    return (
      <ErrorState
        title="This server predates the new overview"
        body="Restart the backend so it serves the counts this page reads."
      />
    );
  }

  const it = overview.data;
  const now = new Date();
  const queue = attentionQueue(it);
  const summary = attentionSummary(it, queue);
  const streams = streamBands(it.estate.stream_states);
  const notLive = streams.filter((band) => band.key !== 'live' && band.value > 0);
  const trend = weekOnWeek(it.activity.last_7d, it.activity.previous_7d);
  const refusedFortnight = it.activity.days.reduce((sum, day) => sum + day.refused, 0);
  const actsFortnight = it.activity.days.reduce((sum, day) => sum + day.total, 0);

  return (
    <>
      <PageIntro
        eyebrow="Platform"
        title="Overview"
        standfirst="Every customer on this deployment, and the few things that need you. Everything here is counted — nothing is scored or inferred."
        meta={
          <span className="uwv-counted">
            Counted at {clockTime(it.generated_at)} · refreshes every minute
          </span>
        }
        actions={
          <Button
            size="sm"
            variant="secondary"
            loading={overview.isFetching}
            icon={<Icon icon={PlatformIcons.refresh} size="inline" />}
            onClick={() => void overview.refetch()}
          >
            Refresh
          </Button>
        }
      />

      <Region order={2} style={{ marginBottom: 'var(--space-10)' }}>
        <div className={queue.length > 0 ? undefined : 'uwv-attention-split'}>
        <Attention
          tone={summary.tone}
          headline={summary.headline}
          statement={summary.statement}
          detail={
            queue.length > 0
              ? 'Customers that cannot fix themselves come first; housekeeping after. Each row opens the thing it names.'
              : it.organizations.total > 0
                ? 'Every active customer has finished setup, has somebody who can administer it, and has its switched-on cameras live.'
                : 'Create the first organization to start onboarding a customer.'
          }
          aside={queue.length > 0 ? <AttentionList items={queue} /> : undefined}
        />
        {/* Beside a clear panel, not inside it: an all-clear says nothing
            needs you and claims no more, so it carries no links of its own. */}
        {queue.length > 0 ? null : (
          <div className="uwv-panel" style={{ padding: 'var(--space-6)' }}>
            <QuickActions
              onSearch={() =>
                // The palette listens for its own shortcut; this is that shortcut.
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
              }
            />
          </div>
        )}
        </div>
      </Region>

      <Region order={3} style={{ marginBottom: 'var(--space-10)' }}>
        <SectionRule label="At a glance" detail="The platform's four instruments. Each one opens the place it describes." />
        <div className="uwv-kpis">
          <KpiTile
            icon={PlatformIcons.organization}
            label="Customers"
            value={it.organizations.total}
            unit={`${it.organizations.active} active`}
            badge={
              it.organizations.new_30d > 0 ? (
                <DeltaBadge icon={PlatformIcons.up}>{it.organizations.new_30d} this month</DeltaBadge>
              ) : undefined
            }
            road={{ to: '/platform/organizations', label: 'Organizations' }}
          >
            <Meter
              caption="Customers by status"
              total={it.organizations.total}
              emptyNote="No customers yet."
              segments={[
                { key: 'active', label: 'Active', value: it.organizations.active, color: 'var(--health-online)' },
                { key: 'suspended', label: 'Suspended', value: it.organizations.suspended, color: 'var(--health-degraded)' },
                { key: 'archived', label: 'Archived', value: it.organizations.archived, color: 'var(--health-idle)' },
              ]}
            />
          </KpiTile>

          <KpiTile
            icon={NavIcons.live}
            label="Cameras live"
            value={it.estate.cameras_live}
            unit={
              it.estate.cameras_enabled > 0
                ? `of ${it.estate.cameras_enabled} switched on`
                : undefined
            }
            visual={
              <RingGauge value={it.estate.cameras_live} total={it.estate.cameras_enabled} label="Cameras live" />
            }
          >
            <p className="uwv-kpi-note">
              {it.estate.cameras_enabled === 0
                ? it.estate.cameras === 0
                  ? 'No cameras configured on any customer yet.'
                  : `${plural(it.estate.cameras, 'camera')} configured, none switched on — so there is no share to draw.`
                : `${plural(it.estate.cameras, 'camera')} configured across ${plural(it.estate.zones, 'zone')}.`}
            </p>
            {notLive.length > 0 ? (
              <ul className="uwv-legend">
                {notLive.map((band) => (
                  <li key={band.key}>
                    <span aria-hidden="true" style={{ background: band.color }} />
                    {band.label}
                    <strong>{band.value}</strong>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="uwv-kpi-fine">From this server's live runtime, not from configuration.</p>
          </KpiTile>

          <KpiTile
            icon={NavIcons.peopleCounting}
            label="People"
            value={it.people.users}
            unit={`${it.people.signed_in_7d} signed in this week`}
            road={{ to: '/platform/people', label: 'People' }}
          >
            <Meter
              caption="Accounts by state"
              total={it.people.users}
              emptyNote="No accounts yet."
              segments={[
                { key: 'active', label: 'Active', value: it.people.active_users, color: 'var(--accent)' },
                { key: 'disabled', label: 'Disabled', value: it.people.disabled_users, color: 'var(--health-idle)' },
              ]}
            />
          </KpiTile>

          <KpiTile
            icon={PlatformIcons.activity}
            label="Activity"
            value={it.activity.last_7d}
            unit="platform acts this week"
            badge={
              <DeltaBadge icon={TREND_ICON[trend.direction]}>
                <span className="sr-only">{trend.words}</span>
                <span aria-hidden="true">
                  {trend.direction === 'level' ? 'Level' : `${Math.abs(it.activity.last_7d - it.activity.previous_7d)}`}
                </span>
              </DeltaBadge>
            }
            road={{ to: '#platform-activity', label: 'What happened' }}
          >
            <ActivityBars days={it.activity.days.slice(-7)} compact />
            <p className="uwv-kpi-note">{trend.words}.</p>
          </KpiTile>
        </div>
      </Region>

      <Region order={4} style={{ marginBottom: 'var(--space-10)' }}>
        <SectionRule
          lead
          label="Customers"
          detail="Every organization on one line, the ones that need somebody first."
        />
        <Plane padded={false} style={{ overflow: 'hidden' }}>
          <FleetTable rows={orderFleet(it.fleet)} now={now} />
        </Plane>
      </Region>

      <Region order={5} style={{ marginBottom: 'var(--space-10)' }}>
        <SectionRule
          label="People"
          detail="Who has been signing in, and the accounts worth a second look."
        />
        <div className="uwv-split">
          <Plane>
            <div className="uwv-mini-label">When people last signed in</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', margin: 'var(--space-4) 0 var(--space-5)' }}>
              <span className="uwv-kpi-value">{it.people.signed_in_7d.toLocaleString()}</span>
              <span className="uwv-kpi-unit" style={{ marginLeft: 0 }}>
                of {plural(it.people.users, 'person', 'people')} signed in during the last seven days
              </span>
            </div>
            <BandBars
              caption="People by when they last signed in"
              total={it.people.users}
              emptyNote="No accounts yet, so nobody has signed in."
              bands={signInBands(it.people)}
            />
          </Plane>
          <Plane>
            <ul className="uwv-facts">
              <FactRow
                icon={PlatformIcons.stranded}
                label="Can enter nowhere"
                detail="A password, and no organization to use it in."
                value={it.people.without_membership}
                tone="attention"
              />
              <FactRow
                icon={StatusIcons.awaiting}
                label="Never signed in"
                detail="Provisioned and not yet used."
                value={it.people.never_signed_in}
              />
              <FactRow
                icon={StatusIcons.blocked}
                label="Disabled"
                detail="Refused sign-in until somebody activates them."
                value={it.people.disabled_users}
              />
              <FactRow
                icon={PlatformIcons.organization}
                label="Multi-organization"
                detail="People who may enter more than one customer."
                value={it.people.multi_organization_users}
              />
              <FactRow
                icon={PlatformIcons.adminCreated}
                label="Platform operators"
                detail="Accounts that can reach every customer."
                value={it.people.platform_operators}
              />
            </ul>
          </Plane>
        </div>
      </Region>

      <Region order={6}>
        <div id="platform-activity" style={{ scrollMarginTop: 'calc(var(--topbar-height) + var(--space-4))' }}>
          <SectionRule
            label="Platform activity"
            detail="Organization lifecycle, membership, access and operator entry — not a customer's own audit trail."
          />
        </div>
        <Plane style={{ padding: 'var(--space-6)' }}>
          <div className="uwv-activity-head">
            <div>
              <div className="uwv-mini-label">The last fourteen days</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                <span className="uwv-kpi-value" style={{ fontSize: 'var(--text-xl)' }}>
                  {actsFortnight.toLocaleString()}
                </span>
                <span className="uwv-kpi-unit" style={{ marginLeft: 0 }}>
                  {actsFortnight === 1 ? 'act' : 'acts'}
                  {refusedFortnight > 0 ? `, ${refusedFortnight} refused` : ''}
                </span>
              </div>
            </div>
            <ul className="uwv-legend" aria-label="Chart key">
              <li>
                <span aria-hidden="true" style={{ background: 'var(--accent-line)' }} />
                Acts
              </li>
              <li>
                <span aria-hidden="true" style={{ background: 'var(--severity-critical)' }} />
                Refused
              </li>
            </ul>
          </div>
          <ActivityBars days={it.activity.days} />
          <div style={{ marginTop: 'var(--space-8)' }}>
            <ActivityFeed rows={it.recent_activity} now={now} />
          </div>
        </Plane>
      </Region>
    </>
  );
}

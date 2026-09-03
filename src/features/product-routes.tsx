/**
 * The Command Center, and the runtime diagnostic that sits beside it.
 *
 * ### The rule that governs both
 *
 * No fabricated metric. Not one invented incident count, camera status,
 * compliance percentage or trend line. A value that is not known renders as an
 * em dash and a reason, never `0`, and every region states which capability it
 * is waiting for.
 *
 * The reason is the product's whole thesis: "no violations" and "not watching"
 * must never look the same. A placeholder that shows a plausible-looking `0`
 * teaches an operator to trust a number the system cannot produce, and the day
 * it becomes real nobody will know which readings were which.
 *
 * ### What Stage 3 changed
 *
 * The previous Command Center was four equal `StatCard`s and a list of the
 * signals the backend cannot yet produce. Everything on it was true and nothing
 * on it was ranked, so the first screen of a safety product opened with four
 * numbers of identical size and no answer to the only question an operator
 * actually arrives with.
 *
 * It is now a composition in four movements, in the order the brief sets out:
 *
 *   ATTENTION    one statement, at display scale, about whether anything is
 *                wrong right now — including the case where the product cannot
 *                tell, which gets the same size as the case where it can
 *   ENVIRONMENT  what is being watched, and what the perception stack is
 *                actually seeing through it
 *   INTELLIGENCE the four observation states across the last hour, as a real
 *                proportion over a real denominator or not at all
 *   CONTEXT      the estate, and the signals still named rather than zeroed
 *
 * Every figure is a link to the surface that owns it. Stage 1 found nineteen
 * pages sharing one link between them; this page is where the link graph
 * starts.
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { healthApi, type OperatorStatus } from '@shared/api/services';
import { incidentsApi, type Incident } from '@shared/api/persistence';
import { observationsApi, type ObservationPage } from '@shared/api/observations';
import { useAuth } from '@app/auth/AuthProvider';
import { has, PERMISSIONS } from '@app/permissions/permissions';
import { resolveState, STATES } from '@shared/semantics/observation';
import {
  Badge,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  SeverityBadge,
  StatusBadge,
  UnavailableState,
} from '@shared/ui/primitives';
import {
  AbsentRegion,
  Attention,
  CameraSurface,
  Eyebrow,
  Figure,
  GoTo,
  LiveDot,
  Meter,
  PageIntro,
  Plane,
  Region,
  SectionRule,
  SeverityMark,
  type AttentionTone,
} from '@shared/ui/product';
import { isApiError } from '@shared/api/errors';

/* ── Command Center ───────────────────────────────────────────────────────── */

export function DashboardPage() {
  const user = useAuth().user;
  const canSeeIncidents = has(user, PERMISSIONS.viewIncidents);
  const canSeeObservations = has(user, PERMISSIONS.viewObservations);
  const canSeeLive = has(user, PERMISSIONS.viewLive);

  const status = useQuery({
    queryKey: ['status'],
    queryFn: () => healthApi.status(),
    staleTime: 15_000,
  });

  // Fetched separately from status on purpose: if the incident store is
  // unreachable the attention region says so, rather than the whole page
  // reporting nothing — and, crucially, rather than reporting calm.
  /**
   * Everything that is not resolved — **both** statuses, not just `active`.
   *
   * The previous dashboard read `status=active` and labelled it "raised and not
   * yet resolved", which was not what it counted: an acknowledged incident is
   * also unresolved, and it silently fell out of the figure. Alerts has always
   * read both. The two surfaces now agree, and the attention region
   * distinguishes *nobody has looked yet* from *somebody has, and it is still
   * open* — which is the difference an operator arriving on shift needs.
   */
  const openIncidents = useQuery({
    queryKey: ['incidents', 'unresolved'],
    queryFn: async () => {
      const [active, acknowledged] = await Promise.all([
        incidentsApi.list('active'),
        incidentsApi.list('acknowledged'),
      ]);
      return {
        active: active.incidents,
        acknowledged: acknowledged.incidents,
        incidents: [...active.incidents, ...acknowledged.incidents],
      };
    },
    enabled: canSeeIncidents,
    staleTime: 15_000,
  });

  const observed = useQuery({
    queryKey: ['observations', 'dashboard-1h'],
    queryFn: () =>
      observationsApi.list({
        since: new Date(Date.now() - 3_600_000).toISOString(),
        limit: 500,
      }),
    enabled: canSeeObservations,
    staleTime: 15_000,
  });

  if (status.isPending) return <LoadingState label="Reading operational status" />;

  if (status.isError) {
    return (
      <>
        <PageIntro eyebrow="Operations" title="Command Center" />
        <ErrorState
          body={isApiError(status.error) ? status.error.friendlyMessage : 'Status could not be loaded.'}
          requestId={isApiError(status.error) ? status.error.requestId : undefined}
          onRetry={() => void status.refetch()}
        />
      </>
    );
  }

  const data = status.data;
  const incidents = openIncidents.isSuccess ? openIncidents.data.incidents : null;

  return (
    <>
      <PageIntro
        eyebrow="Operations"
        title="Command Center"
        standfirst="What needs attention, what is being watched, and what the perception stack is actually seeing. Every figure carries the coverage behind it."
        meta={
          <>
            <Badge mono>{data.tenant_id}</Badge>
            <StatusBadge tone={data.service.ok ? 'online' : 'degraded'}>
              {data.service.ok ? 'Service healthy' : 'Service degraded'}
            </StatusBadge>
          </>
        }
      />

      {/* Movement 1 — the lead. The only region on this page that carries
          display type, and the only one whose section marker is drawn in the
          accent. A dashboard where four regions are equally weighted has not
          decided what matters; this page has. */}
      <SectionRule
        lead
        order={2}
        label="Attention"
        detail="What is open now, ranked by severity, with the most severe named."
        actions={
          canSeeIncidents ? (
            <Link to="/incidents" style={{ textDecoration: 'none' }}>
              <GoTo>The ledger</GoTo>
            </Link>
          ) : null
        }
      />
      <Region order={2} style={{ marginBottom: 'var(--space-12)' }}>
        <AttentionRegion
          canSee={canSeeIncidents}
          failed={openIncidents.isError}
          incidents={incidents}
        />
      </Region>

      <SectionRule
        order={3}
        label="Current environment"
        detail="Cameras the runtime holds a session for. A camera that is not producing frames says so — never a frozen last frame."
        actions={
          canSeeLive ? (
            <Link to="/live" style={{ textDecoration: 'none' }}>
              <GoTo>Open the wall</GoTo>
            </Link>
          ) : null
        }
      />
      <Region order={3} style={{ marginBottom: 'var(--space-12)' }}>
        <Environment status={data} canSeeLive={canSeeLive} />
      </Region>

      <SectionRule
        order={4}
        label="What the system is seeing"
        detail="Every PPE attribute observed in the last hour, resolved to the four states the platform actually reports."
        actions={
          canSeeObservations ? (
            <Link to="/hygiene" style={{ textDecoration: 'none' }}>
              <GoTo>Staff hygiene</GoTo>
            </Link>
          ) : null
        }
      />
      <Region order={4} style={{ marginBottom: 'var(--space-12)' }}>
        <Perception
          canSee={canSeeObservations}
          failed={observed.isError}
          page={observed.isSuccess ? observed.data : null}
        />
      </Region>

      {/* The closing movement. Recessed rather than raised: the estate is the
          page's footing, not its subject, and the last region on a page should
          settle rather than compete with the first. */}
      <SectionRule
        order={5}
        label="The estate"
        detail="What a restart would restore, and what this build declines to report."
        actions={
          <Link to="/cameras" style={{ textDecoration: 'none' }}>
            <GoTo>Camera register</GoTo>
          </Link>
        }
      />
      <Region order={5}>
        <div
          className="uwv-terminal"
          style={{ padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)' }}
        >
          <Estate status={data} />
        </div>
      </Region>
    </>
  );
}

/* ── 1 · attention ────────────────────────────────────────────────────────── */

const RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

/**
 * The one statement at the top of the product.
 *
 * Four outcomes, and the two that are easy to get wrong are the two this
 * component exists for. **`unknown` is rendered at the same size as a
 * violation**: a command center that cannot reach the incident store, or whose
 * account may not read one, must say so as loudly as it would have said "three
 * open violations". Anything quieter teaches an operator that silence means
 * safety, which is the exact failure the whole product is built to avoid.
 *
 * `clear` is only ever reached from a successful read of the store. It is a
 * positive claim and it is made only when there is something to base it on.
 */
function AttentionRegion({
  canSee,
  failed,
  incidents,
}: {
  canSee: boolean;
  failed: boolean;
  incidents: Incident[] | null;
}) {
  if (!canSee) {
    return (
      <Attention
        tone="unknown"
        headline="Not readable by this account"
        statement="This account does not read incidents, so this screen cannot tell you whether anything is open."
        detail="That is a statement about your permissions, not about the kitchen. Somebody with incident access may be seeing something you cannot."
      />
    );
  }

  if (failed) {
    return (
      <Attention
        tone="unknown"
        headline="Incident store unreachable"
        statement="The incident store could not be read, so nothing can be claimed about open violations."
        detail="This is not a report of zero. Until this clears, treat the queue as unknown rather than empty."
      />
    );
  }

  if (incidents === null) {
    return (
      <Attention
        tone="unknown"
        headline="Reading"
        statement="Still reading the incident queue."
        detail="No claim is made about the kitchen until this resolves."
      />
    );
  }

  if (incidents.length === 0) {
    return (
      <Attention
        tone="clear"
        headline="Nothing open"
        statement="No compliance violation is currently open."
        detail="A real reading of the incident queue. A violation is raised only when a covering was positively observed to be missing — never when a camera could not see, which is why this figure is narrower than it looks."
        actions={
          <Link to="/incidents" style={{ textDecoration: 'none' }}>
            <GoTo>Open the ledger</GoTo>
          </Link>
        }
      />
    );
  }

  const ordered = [...incidents].sort(
    (a, b) => (RANK[a.severity] ?? 9) - (RANK[b.severity] ?? 9),
  );
  const worst = ordered[0];
  const critical = ordered.filter((i) => i.severity === 'critical' || i.severity === 'high').length;
  const tone: AttentionTone = critical > 0 ? 'critical' : 'attention';
  const unseen = ordered.filter((i) => i.status === 'active').length;
  const seen = ordered.length - unseen;

  return (
    <Attention
      tone={tone}
      headline={`${incidents.length} unresolved`}
      statement={
        incidents.length === 1
          ? (worst?.summary ?? worst?.rule_id ?? 'One violation is open.')
          : `${incidents.length} violations are open. The most severe is ${worst?.summary ?? worst?.rule_id ?? 'unnamed'}.`
      }
      detail={
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 'var(--space-2) var(--space-5)', alignItems: 'center' }}>
          {worst ? (
            <>
              <SeverityBadge severity={(worst.severity as never) ?? 'info'} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                {worst.camera_key}
              </span>
            </>
          ) : null}
          <span>
            {/* "Nobody has looked yet" and "somebody has, and it is still open"
                are different states of the same queue, and an operator arriving
                on shift needs to be told which is which. */}
            {unseen} not yet acknowledged
            {seen > 0 ? `, ${seen} acknowledged and still open` : ''}.{' '}
            {critical > 0 ? `${critical} at high severity or above.` : 'None at high severity.'}
          </span>
        </span>
      }
      actions={
        <>
          {worst ? (
            <Link to={`/incidents/${encodeURIComponent(worst.id)}`} style={{ textDecoration: 'none' }}>
              <GoTo>Inspect the most severe</GoTo>
            </Link>
          ) : null}
          <Link to="/alerts" style={{ textDecoration: 'none' }}>
            <GoTo>Triage all {incidents.length}</GoTo>
          </Link>
        </>
      }
      aside={<Queue incidents={ordered} />}
    />
  );
}

/**
 * The queue behind the headline.
 *
 * Every row is a road. Before Stage 5 the Command Center's one exit was
 * "inspect the most severe" — an operator who wanted the second-most severe
 * had to leave for the ledger and find it again. These are the same incidents
 * the headline is counting, in the same rank order, each one addressing its own
 * page directly.
 *
 * Capped at four, because this is a summary of a queue and not the queue. When
 * there are more, the last line says how many are not shown rather than
 * quietly truncating — a list that hides its own remainder is a list that
 * misreports its length.
 */
function Queue({ incidents }: { incidents: Incident[] }) {
  const shown = incidents.slice(0, 4);
  const remainder = incidents.length - shown.length;

  return (
    <div>
      <Eyebrow>In rank order</Eyebrow>
      <ul style={{ marginTop: 'var(--space-3)' }}>
        {shown.map((incident) => (
          <li key={incident.id}>
            <Link
              to={`/incidents/${encodeURIComponent(incident.id)}`}
              className="uwv-row"
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto minmax(0, 1fr)',
                alignItems: 'baseline',
                gap: 'var(--space-3)',
                padding: 'var(--space-2) var(--space-3)',
                marginInline: 'calc(-1 * var(--space-3))',
                borderRadius: 'var(--radius-xs)',
                borderTop: '1px solid var(--line-subtle)',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <SeverityMark severity={(incident.severity as never) ?? 'info'} />
              <span style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: 'var(--text-sm)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {incident.summary || incident.rule_id}
                </span>
                <span
                  style={{
                    display: 'block',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-2xs)',
                    color: 'var(--ink-tertiary)',
                    marginTop: 1,
                  }}
                >
                  {incident.camera_key} · {incident.status}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {remainder > 0 ? (
        <p
          style={{
            marginTop: 'var(--space-3)',
            fontSize: 'var(--text-xs)',
            color: 'var(--ink-tertiary)',
          }}
        >
          {remainder} more open, in the ledger.
        </p>
      ) : null}
    </div>
  );
}

/* ── 2 · environment ──────────────────────────────────────────────────────── */

function Environment({ status, canSeeLive }: { status: OperatorStatus; canSeeLive: boolean }) {
  const { cameras, live_runtime: runtime } = status;
  const online = cameras.health.filter((c) => c.health === 'online').length;
  const nothingRunning = cameras.health.length === 0;

  return (
    <div className="uwv-lead">
      {/* Dominant: the cameras themselves, as pictures-in-waiting rather than
          rows in a table. Deliberately no imagery — the status endpoint serves
          no frame, and a black rectangle would be a claim this page cannot
          support. The wall is one click away and it does serve frames.

          When nothing is running the *figures beside this column still render*,
          reading `—` with their reason. Replacing the whole region with a
          single panel would remove the em dash that says the count is unknown,
          and "unknown" is the fact the operator needs. */}
      {nothingRunning ? (
        <AbsentRegion
          title={runtime.enabled ? 'No camera session is running' : 'Live monitoring is not enabled'}
          body={
            <>
              {runtime.reason ||
                `${cameras.configured} camera(s) are configured and none has an active session.`}{' '}
              Nothing is being observed — which is not the same as observing
              nothing, and this page will never imply otherwise.
            </>
          }
        />
      ) : (
      <div className="uwv-tiles">
        {cameras.health.slice(0, 6).map((camera) => (
          <CameraSurface
            key={camera.camera_id}
            name={camera.camera_id}
            identifier={camera.camera_id}
            context={camera.kind}
            tone={cameraTone(camera.health)}
            stateLabel={camera.health}
            media={
              <span
                style={{
                  color: 'var(--video-ink)',
                  fontSize: 'var(--text-xs)',
                  textAlign: 'center',
                  padding: 'var(--space-4)',
                  maxWidth: '26ch',
                }}
              >
                {camera.health === 'online'
                  ? 'Producing frames. Imagery is served on the wall, not here.'
                  : 'Not producing frames.'}
              </span>
            }
            meta={
              canSeeLive ? (
                <Link to="/live" style={{ textDecoration: 'none' }}>
                  <GoTo>Watch</GoTo>
                </Link>
              ) : (
                <span>Live viewing needs its own permission</span>
              )
            }
          />
        ))}
      </div>
      )}

      {/* Supporting: the counts, ranked and smaller, and on a ground.

          Before Stage 5 this rail was figures floating on the page beside a
          bordered region, which read as leftover rather than as an inspector.
          A plane is the correct surface for it: it is a ground the numbers sit
          on, not a card competing with the region beside it — which is exactly
          why it takes no shadow. */}
      <Plane style={{ display: 'grid', gap: 'var(--space-6)', alignContent: 'start', alignSelf: 'start' }}>
        <Figure
          label="Producing frames"
          scale="hero"
          value={cameras.configured === 0 ? null : online}
          unavailableReason="No camera is configured yet"
          detail={`of ${cameras.configured} configured · ${cameras.streaming} streaming`}
          tone={online > 0 ? 'accent' : 'default'}
        />
        <Figure
          label="Sessions"
          scale="quiet"
          value={cameras.sessions}
          detail={runtime.enabled ? 'Runtime enabled' : runtime.reason || 'Runtime not enabled'}
        />
      </Plane>
    </div>
  );
}

/* ── 3 · perception ───────────────────────────────────────────────────────── */

/**
 * The four observation states, as a real proportion or not at all.
 *
 * This is the region where a redesign is most likely to invent data, so it is
 * the region with the most rules. `available: false` is not zero subjects. Zero
 * subjects is not zero attributes. And an attribute count of zero draws no bar,
 * because a stacked bar of zeros renders as an empty track that reads exactly
 * like "all clear".
 *
 * Resolution goes through `shared/semantics/observation.ts` — the single place
 * in the frontend allowed to turn an attribute value into a state. Nothing here
 * maps a value itself.
 */
function Perception({
  canSee,
  failed,
  page,
}: {
  canSee: boolean;
  failed: boolean;
  page: ObservationPage | null;
}) {
  const mix = useMemo(() => {
    if (!page?.available) return null;
    const counts = { present: 0, absent: 0, not_visible: 0, unknown: 0 };
    for (const subject of page.subjects) {
      for (const attribute of subject.attributes) {
        counts[resolveState(attribute.value)] += 1;
      }
    }
    return counts;
  }, [page]);

  if (!canSee) {
    return (
      <EmptyState
        title="Observations are not readable by this account"
        body="Reading what the perception stack saw is its own permission, and this account does not hold it."
      />
    );
  }

  if (failed) {
    return (
      <ErrorState
        title="Observations could not be read"
        body="The platform's observation log did not answer. Nothing is being claimed about what was or was not seen in the last hour."
      />
    );
  }

  if (!page) return <LoadingState label="Reading observations" />;

  if (!page.available) {
    return (
      <div style={{ maxWidth: '46rem' }}>
      <AbsentRegion
        title="The perception platform is not reporting"
        body={
          <>
            {page.reason} This is why the figure is absent rather than zero:
            nobody watched, which is a different fact from watching and seeing
            nothing.
          </>
        }
      />
      </div>
    );
  }

  const total = mix ? mix.present + mix.absent + mix.not_visible + mix.unknown : 0;

  return (
    <div className="uwv-rail">
      <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
        <Meter
          caption="Observation states in the last hour"
          total={total}
          emptyNote="No attribute was observed in the last hour. Nothing is being claimed about compliance in that window."
          segments={[
            { key: 'present', label: STATES.present.label, value: mix?.present ?? 0, color: 'var(--state-present)' },
            { key: 'absent', label: STATES.absent.label, value: mix?.absent ?? 0, color: 'var(--state-absent)' },
            { key: 'not_visible', label: STATES.not_visible.label, value: mix?.not_visible ?? 0, color: 'var(--state-not-visible)' },
            { key: 'unknown', label: STATES.unknown.label, value: mix?.unknown ?? 0, color: 'var(--state-unknown)' },
          ]}
        />
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-secondary)', maxWidth: 'var(--measure)' }}>
          Only <strong style={{ color: 'var(--state-absent)' }}>{STATES.absent.label}</strong> can
          become a violation. {STATES.not_visible.label} means the model looked and could not see —
          a chef whose hands are inside a stockpot — and {STATES.unknown.label} means nothing fresh
          was observed at all. Neither accuses anybody, and neither is a clean result.
        </p>
      </div>

      <Plane style={{ display: 'grid', gap: 'var(--space-6)', alignContent: 'start', alignSelf: 'start' }}>
        <Figure
          label="Subjects observed"
          scale="lead"
          value={page.count}
          detail="Tracked objects seen by any camera in the last hour"
        />
        <Figure
          label="Cameras queried"
          scale="quiet"
          value={page.cameras_queried.length}
          detail={
            page.window_fully_observable
              ? 'The whole window was observable'
              : 'Part of the window was not observable'
          }
        />
      </Plane>
    </div>
  );
}

/* ── 4 · estate ───────────────────────────────────────────────────────────── */

function Estate({ status }: { status: OperatorStatus }) {
  return (
    <div className="uwv-rail">
      <div className="uwv-figure-row">
        <Figure
          label="Registered"
          scale="quiet"
          value={status.cameras_registered}
          detail="Camera rows this tenant holds"
        />
        <Figure
          label="Enabled"
          scale="quiet"
          value={status.cameras_enabled}
          detail="Sessions the runtime starts after a restart"
        />
        <Figure
          label="Not processed"
          scale="quiet"
          value={status.cameras_registered - status.cameras_enabled}
          detail="Registered and deliberately switched off"
        />
      </div>

      <div>
        <Eyebrow>Not yet reported</Eyebrow>
        <p
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--ink-secondary)',
            marginTop: 'var(--space-3)',
            maxWidth: 'var(--measure)',
          }}
        >
          The backend names the signals it cannot produce rather than returning zero for them.
        </p>
        <ul style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-3)' }}>
          {status.not_yet_reported.map((item) => (
            <li key={item}>
              <Badge>{item}</Badge>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ── Runtime diagnostics ──────────────────────────────────────────────────── */

/**
 * Camera session state, for whoever is asked why a wall is black.
 *
 * Orphaned since Phase 3 — implemented, permission-gated and reachable only by
 * typing the URL. Stage 2 moved it into the engineering area and tightened the
 * gate to `view_live` **and** `access_devtools`, because it reports the
 * runtime's own state rather than the kitchen's, and it deliberately serves no
 * imagery.
 */
export function LiveMonitoringPage() {
  const status = useQuery({
    queryKey: ['status'],
    queryFn: () => healthApi.status(),
    // Camera health changes on the scale of seconds, so this refetches faster
    // than the rest of the product. Still not a substitute for the WebSocket,
    // which reports a stream starting or stopping between polls.
    refetchInterval: 5_000,
  });

  return (
    <>
      <PageIntro
        eyebrow="Engineering"
        title="Runtime Diagnostics"
        standfirst="What each camera session is doing, from the runtime's own view — or a plain statement that it is not doing anything. No imagery is served here; this page answers why a wall is black, not what is on it."
      />

      {status.isPending ? <LoadingState label="Reading runtime state" /> : null}

      {status.isError ? (
        <ErrorState
          body={isApiError(status.error) ? status.error.friendlyMessage : 'Camera state could not be loaded.'}
          requestId={isApiError(status.error) ? status.error.requestId : undefined}
          onRetry={() => void status.refetch()}
        />
      ) : null}

      {status.isSuccess ? <RuntimeSessions status={status.data} /> : null}
    </>
  );
}

function RuntimeSessions({ status }: { status: OperatorStatus }) {
  const { cameras, live_runtime: runtime } = status;

  if (cameras.health.length === 0) {
    return (
      <UnavailableState
        title={runtime.enabled ? 'No camera session is running' : 'Live monitoring is not enabled'}
        body={
          <>
            {runtime.reason ||
              `${cameras.configured} camera(s) are configured and none has an active session.`}{' '}
            Nothing is being observed — which is not the same as observing
            nothing, and this page will never imply otherwise.
          </>
        }
      />
    );
  }

  return (
    <>
      <div className="uwv-figures" style={{ marginBottom: 'var(--space-8)' }}>
        <Figure label="Configured" scale="lead" value={cameras.configured} detail="Known to the runtime" />
        <Figure label="Sessions" scale="lead" value={cameras.sessions} detail="Visible in this scope" />
        <Figure label="Streaming" scale="lead" value={cameras.streaming} detail="Delivering frames now" />
      </div>

      <SectionRule label="Sessions" detail="One row per session the runtime holds, with the health it reports for it." />

      <div className="uwv-tiles">
        {cameras.health.map((camera) => (
          <div
            key={camera.camera_id}
            data-camera-id={camera.camera_id}
            style={{
              border: '1px solid var(--engineering-line)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-4)',
              background: 'var(--surface-raised)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
              <LiveDot tone={cameraTone(camera.health)} label={camera.health} />
              <Badge mono>{camera.kind}</Badge>
            </div>
            <div
              style={{
                marginTop: 'var(--space-3)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
                wordBreak: 'break-all',
              }}
            >
              {camera.camera_id}
            </div>
            {/* Deliberately no image. The status endpoint serves no frame, and a
                black rectangle — or worse, a stale one — would be a claim this
                page cannot support. */}
            <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)' }}>
              {camera.health === 'online'
                ? 'Producing frames. No image is shown until imagery egress is enabled.'
                : 'Not producing frames.'}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function cameraTone(health: string): 'online' | 'degraded' | 'offline' | 'idle' {
  if (health === 'online') return 'online';
  if (health === 'degraded' || health === 'connecting') return 'degraded';
  if (health === 'error') return 'offline';
  return 'idle';
}

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" description="That address does not match anything in this application." />
      <EmptyState title="Nothing here" body="Check the address, or pick a destination from the navigation." />
    </>
  );
}

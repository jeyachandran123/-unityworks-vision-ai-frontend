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
import { healthApi, type CameraHealth, type OperatorStatus } from '@shared/api/services';
import { incidentsApi, type Incident } from '@shared/api/persistence';
import { observationsApi, type ObservationPage } from '@shared/api/observations';
import { useAuth } from '@app/auth/AuthProvider';
import { has, hasAny, PERMISSIONS } from '@app/permissions/permissions';
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
  CameraLine,
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
  StateTally,
  type AttentionTone,
} from '@shared/ui/product';
import { isApiError } from '@shared/api/errors';

/* ── Command Center ───────────────────────────────────────────────────────── */

export function DashboardPage() {
  const user = useAuth().user;
  const canSeeIncidents = has(user, PERMISSIONS.viewIncidents);
  const canSeeObservations = has(user, PERMISSIONS.viewObservations);
  const canSeeLive = has(user, PERMISSIONS.viewLive);
  // The register route admits either permission, so the link this page offers
  // must ask the same question the guard does. Offering a road that redirects
  // straight back here is worse than not offering it.
  const canSeeRegister = hasAny(user, [PERMISSIONS.viewCameras, PERMISSIONS.viewCameraHealth]);

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
        detail="Every camera session the runtime holds, and what each one is actually doing. A camera that is not producing frames says which kind of not-producing it is — never a frozen last frame, and never one word for four different faults. A session replaying a fixture rather than watching a camera is marked; the rest are live."
        actions={
          canSeeLive ? (
            <Link to="/live" style={{ textDecoration: 'none' }}>
              <GoTo>Open the wall</GoTo>
            </Link>
          ) : null
        }
      />
      <Region order={3} style={{ marginBottom: 'var(--space-12)' }}>
        <Environment status={data} canSeeRegister={canSeeRegister} />
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
          canSeeRegister ? (
            <Link to="/cameras" style={{ textDecoration: 'none' }}>
              <GoTo>Camera register</GoTo>
            </Link>
          ) : null
        }
      />
      <Region order={5}>
        <div
          className="uwv-terminal"
          style={{ padding: 'var(--region-inset)', borderRadius: 'var(--radius-lg)' }}
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

/**
 * What the runtime is doing right now, per camera.
 *
 * ### What this region actually reports
 *
 * `cameras.health` on `/api/v1/status` is one entry per **live-runtime session
 * visible in this operator's camera scope**, each carrying the health the source
 * derives from its own state machine. It is not a list of cameras in the
 * database — that is `cameras_registered`, and it belongs to The Estate below.
 * The two are different facts, and the gap between them is itself worth naming,
 * which is what `missing` does at the foot of this region.
 *
 * ### Why there are no pictures here, and why there used to be room for them
 *
 * `/status` serves no imagery and cannot: a frame requires a per-camera ticket
 * from `/wall/tickets` and a long-lived MJPEG response held open by an `<img>`,
 * which is what the Live Wall does and the only thing that does it. The previous
 * implementation rendered each camera as a `CameraSurface` — the wall's
 * primitive, a 16:9 picture area with chrome over it — and, having no picture to
 * put in it, filled the picture area with the sentence *"Producing frames.
 * Imagery is served on the wall, not here."*
 *
 * That sentence was true. The rectangle around it was the mistake: an inherited
 * shape rather than a product decision. Measured in a browser it cost 754px of a
 * 2430px page at 1440px, and 1875px of a 4153px page at 430px — 45% of the whole
 * Command Center — to say twelve words about **six** cameras out of sixteen,
 * because the tile field was also silently sliced to six with nothing saying so.
 *
 * Two further faults went with it: every tile passed no `signal`, so it defaulted
 * to `none` — the no-signal hatch — underneath copy that said frames were
 * arriving; and each tile carried a `Watch` link to `/live`, the same destination
 * the region's own action already offered, seven links to one page.
 *
 * ### What replaced it
 *
 * A roster. The same information as a directory entry — which camera, what
 * state, and what that state means — for **every** session rather than six of
 * them, ordered worst first so what needs a person is read first. The wall keeps
 * one entry point, at the region's head where it was always going to be looked
 * for; a camera's own identifier links to its register entry, which is the only
 * place that explains a camera rather than showing it.
 */
function Environment({
  status,
  canSeeRegister,
}: {
  status: OperatorStatus;
  canSeeRegister: boolean;
}) {
  const { cameras, live_runtime: runtime } = status;
  const sessions = cameras.health;
  const online = sessions.filter((c) => c.health === 'online').length;

  /**
   * Enabled in the store, but the runtime reports no session for it.
   *
   * A real gap and a real question, and this page deliberately does not answer
   * it: `/status` does not report *why* a session is missing, and the reasons
   * are genuinely different — analysis switched off for that camera, a host that
   * has never been reachable, a runtime that has not started. Naming a cause
   * here would be inventing one. It states the count and where to go.
   *
   * Only rendered when positive. The two figures are counted over the same
   * camera scope, but a session for a row disabled a moment ago would make this
   * negative, and a negative gap is not a fact about anything.
   */
  const missing = status.cameras_enabled - cameras.sessions;

  if (sessions.length === 0) {
    return (
      <div className="uwv-rail">
        <AbsentRegion
          title={runtime.enabled ? 'No camera session is running' : 'Live monitoring is not enabled'}
          body={
            <>
              {/* The runtime's reason is a backend string and does not promise to
                  end in a full stop — `FEATURE_LIVE_CCTV is off; no camera session
                  will start` does not — so it ran straight into the sentence after
                  it. Terminated here rather than edited: the message is the
                  backend's and this only closes it. */}
              {sentence(
                runtime.reason ||
                  `${cameras.configured} camera(s) are configured and none has an active session.`,
              )}{' '}
              Nothing is being observed — which is not the same as observing
              nothing, and this page will never imply otherwise.
            </>
          }
        />
        <EnvironmentFigures cameras={cameras} runtime={runtime} online={online} />
      </div>
    );
  }

  const ordered = [...sessions].sort(
    (a, b) =>
      (HEALTH_RANK[a.health] ?? 9) - (HEALTH_RANK[b.health] ?? 9) ||
      a.camera_id.localeCompare(b.camera_id),
  );
  const shown = ordered.slice(0, ROSTER_LIMIT);
  const remainder = ordered.length - shown.length;

  return (
    /* The rail, not the lead.
     *
     * `uwv-lead` gives its supporting column two fifths of the region, which was
     * right when the dominant side was a field of 16:9 tiles. Beside a roster it
     * left a 400px hole under two figures, and it squeezed the roster below the
     * width where a second column of rows can form — the measured result was 16
     * rows in one column and a region no shorter than the tiles it replaced.
     *
     * The rail is the composition this actually is: a wide primary column and a
     * fixed narrower one of context. It is also what the perception region below
     * uses, so the page's two data regions now compose the same way. */
    <div className="uwv-rail">
      <div style={{ display: 'grid', gap: 'var(--space-5)', alignContent: 'start' }}>
        <StateTally
          states={HEALTH_ORDER.map((key) => ({
            key,
            label: HEALTH[key].tally,
            tone: cameraTone(key),
            count: sessions.filter((c) => c.health === key).length,
          }))}
        />

        <ul className="uwv-roster" role="list">
          {shown.map((camera) => (
              <CameraLine
                key={camera.camera_id}
                name={
                  canSeeRegister ? (
                    <Link
                      to={`/cameras/${encodeURIComponent(camera.camera_id)}`}
                      className="uwv-quiet"
                      style={{ color: 'inherit' }}
                    >
                      {camera.camera_id}
                    </Link>
                  ) : (
                    camera.camera_id
                  )
                }
                identifier={camera.camera_id}
                tone={cameraTone(camera.health)}
                state={camera.health}
                meaning={meaningOf(camera.health)}
                kind={camera.kind === 'live' ? undefined : camera.kind}
              />
          ))}
        </ul>

        {remainder > 0 ? (
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)' }}>
            {remainder} more session{remainder === 1 ? '' : 's'} not listed. The order is worst
            first, so nothing needing attention is among them.
          </p>
        ) : null}

        {missing > 0 ? (
          <p
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--ink-tertiary)',
              maxWidth: 'var(--measure)',
            }}
          >
            {missing} enabled camera{missing === 1 ? '' : 's'} report{missing === 1 ? 's' : ''} no
            runtime session at all, so {missing === 1 ? 'it is' : 'they are'} not in this list. This
            page does not carry the reason; the{' '}
            {canSeeRegister ? <Link to="/cameras">camera register</Link> : 'camera register'} does.
          </p>
        ) : null}
      </div>

      <EnvironmentFigures cameras={cameras} runtime={runtime} online={online} />
    </div>
  );
}

/**
 * The counts beside the roster, on a ground rather than floating.
 *
 * Extracted so the empty case renders them too. When no session is running the
 * roster is replaced by a single panel, and these figures still have to render:
 * "Producing frames" reads `—` with its reason, and the em dash that says the
 * count is unknown is precisely the fact an operator needs. Replacing the whole
 * region would remove it.
 */
function EnvironmentFigures({
  cameras,
  runtime,
  online,
}: {
  cameras: OperatorStatus['cameras'];
  runtime: OperatorStatus['live_runtime'];
  online: number;
}) {
  return (
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
  );
}

/**
 * The five states `CameraHealth` can report, and what each one means to a person.
 *
 * The words are the backend enum's own docstrings rather than a paraphrase:
 * `DEGRADED` is documented as "reconnecting, or connected and producing
 * nothing", and the meaning below is that union rather than either half of it,
 * because the wire does not say which. `OFFLINE` is "deliberately stopped, or
 * not started" and `ERROR` is "failed and not retrying — needs a human".
 *
 * Four of these five are "not producing frames" and they are kept apart on
 * purpose. Collapsing them into one word would be the failure this product is
 * built to avoid, in miniature: a camera nobody started and a camera that fell
 * over are the same picture only to software.
 */
const HEALTH: Record<CameraHealth, { meaning: string; tally: string }> = {
  error: { meaning: 'Failed — needs a person', tally: 'faulted' },
  degraded: { meaning: 'Reconnecting, or silent', tally: 'reconnecting or silent' },
  connecting: { meaning: 'Opening; no frame yet', tally: 'connecting' },
  offline: { meaning: 'Stopped, or never started', tally: 'stopped' },
  online: { meaning: 'Producing frames now', tally: 'producing frames' },
};

/**
 * What a state means to a person, for a state this build may not know.
 *
 * `CameraHealth` is the wire's union today and the map above is total over it,
 * so this could be a plain lookup. It is written to admit an unknown string
 * because the backend owns that vocabulary and can extend it, and a build that
 * met a word it had never seen would otherwise render `undefined` — or worse,
 * fall through to a confident sentence about the wrong state. It says it does
 * not know, which is the only honest reading of a state nobody has taught it.
 */
function meaningOf(health: string): string {
  const spec = (HEALTH as Record<string, { meaning: string } | undefined>)[health];
  return spec?.meaning ?? 'State not recognised by this build';
}

/** A backend string, closed so it does not run into the sentence after it. */
function sentence(text: string): string {
  return /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
}

/** Worst first. What needs a person is read before what is working. */
const HEALTH_ORDER: readonly CameraHealth[] = [
  'error',
  'degraded',
  'connecting',
  'offline',
  'online',
];
const HEALTH_RANK: Record<string, number> = Object.fromEntries(
  HEALTH_ORDER.map((key, index) => [key, index]),
);

/**
 * Enough rows that a full DVR lists in one reading, and a bound so that a large
 * estate cannot turn this region back into the thing it replaced. The order is
 * worst first, so a truncated tail is always the healthy end of it — and the
 * remainder is stated rather than dropped, because a list that hides its own
 * length misreports it.
 */
const ROSTER_LIMIT = 24;

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

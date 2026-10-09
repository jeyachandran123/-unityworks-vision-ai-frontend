/**
 * Alerts — what needs attention right now.
 *
 * ### This page is the product
 *
 * A manager opens the app to answer one question: *is anything wrong in my
 * kitchen right now, and can I see it?* Everything here serves that. An alert
 * is an **active incident**, which is a real compliance violation the backend
 * raised from a real observation — never a count, never a placeholder.
 *
 * Until this phase the page rendered a hardcoded "No alerts" regardless of the
 * database, which is the most dangerous shape a safety screen can take: it
 * reads as "nothing is wrong" when it means "nobody asked".
 *
 * ### Uncertainty never becomes an alert
 *
 * Nothing filters `UNKNOWN` out here, because nothing has to. The rule engine
 * only opens an incident for a positively observed absence, so a `not_visible`
 * hand — a chef whose hands are inside a stockpot — produces UNKNOWN, no
 * incident, and therefore no alert. The safety property is enforced where the
 * verdict is made, and this page inherits it rather than re-implementing it.
 *
 * ### Evidence is fetched, never rendered by default
 *
 * Retrieving an image is an authorized, audited act on the server. A list that
 * loaded thumbnails automatically would write an audit row for every incident
 * every time the page polled. So a card shows *whether* evidence exists, and
 * the manager asks for the picture.
 *
 * ### How it stays current
 *
 * By polling the incidents API, which is the mechanism this application
 * already uses for live camera state. The backend's WebSocket carries `ready`
 * and `heartbeat` only — it publishes no incident event — so a push-based
 * badge here would be describing plumbing that does not exist.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  evidenceApi,
  incidentsApi,
  type EvidenceObject,
  type Incident,
} from '@shared/api/persistence';
import { isApiError } from '@shared/api/errors';
import {
  attributeLabel,
  cameraLabel,
  failedConditions,
  observedAt,
} from '@shared/semantics/finding';
import { BulkActionBar } from '@shared/ui/data-table';
import { useToast } from '@shared/ui/feedback';
import { Checkbox, SearchInput } from '@shared/ui/forms';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  SeverityBadge,
  Spinner,
  Tabs,
  type Severity,
} from '@shared/ui/primitives';
import { ActionIcons, AttentionIcons, Icon, SeverityIcons, StatusIcons } from '@shared/ui/icons';
import { ButtonLink, MetricTile, StatusPill } from '@shared/ui/surfaces';
import {
  PageIntro,
} from '@shared/ui/product';

/** How often the queue is re-read. Matches the camera wall's cadence. */
const ALERT_POLL_MS = 5000;

/* ── reading a finding ────────────────────────────────────────────────────── */

/**
 * Moved to `@shared/semantics/finding` in Stage 3 and re-exported here.
 *
 * The incident readout now has three call sites — this queue, the ledger's
 * drawer and the incident detail route — and three copies of "which conditions
 * failed" is exactly where one of them eventually starts treating
 * `not_visible` as a failure. Same reasoning as the Phase 3 close-out that put
 * the four-state fold in one module.
 *
 * Re-exported rather than moved outright because these names are part of this
 * module's public surface and are imported by tests.
 */
export {
  attributeLabel,
  cameraLabel,
  failedConditions,
  observedAt,
  type FailedCondition,
} from '@shared/semantics/finding';

/* ── evidence ─────────────────────────────────────────────────────────────── */

/** The colour of the subject's box. One value, used by the frame and the crop. */
const SUBJECT_INK = '#ff3b30';
/** Everyone else in the same frame. Present, obviously secondary, never red. */
const CONTEXT_INK = 'rgb(255 255 255 / 0.55)';

/**
 * Retrieve one evidence image as an object URL, revoking it on unmount.
 *
 * A blob URL pins the image in memory until it is revoked, and this queue can
 * open many over a shift — including a crop each for several people.
 */
function useEvidenceImage(evidenceRef: string | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const objectUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!evidenceRef) return;
    let cancelled = false;
    evidenceApi
      .image(evidenceRef)
      .then((next) => {
        if (cancelled) {
          URL.revokeObjectURL(next);
          return;
        }
        objectUrl.current = next;
        setUrl(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            isApiError(err) ? err.message : 'This evidence image could not be loaded.',
          );
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl.current) {
        URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = null;
      }
    };
  }, [evidenceRef]);

  return { url, error };
}

/**
 * One box drawn over the decision frame.
 *
 * Positioned from the **stored** normalized box, so it marks where the subject
 * was when the verdict was made. Nothing here detects anything: if the backend
 * retained no geometry, no box is drawn at all rather than a plausible one.
 */
function SubjectBox({ object: subject }: { object: EvidenceObject }) {
  const [x1, y1, x2, y2] = subject.box;
  const ink = subject.is_subject ? SUBJECT_INK : CONTEXT_INK;
  return (
    <div
      data-testid={subject.is_subject ? 'subject-box' : 'context-box'}
      data-object-id={subject.object_id}
      style={{
        position: 'absolute',
        left: `${x1 * 100}%`,
        top: `${y1 * 100}%`,
        width: `${Math.max(0, x2 - x1) * 100}%`,
        height: `${Math.max(0, y2 - y1) * 100}%`,
        border: `${subject.is_subject ? 3 : 1.5}px solid ${ink}`,
        borderRadius: '3px',
        boxShadow: subject.is_subject ? '0 0 0 1px rgb(0 0 0 / 0.55)' : 'none',
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transform: 'translateY(-100%)',
          background: subject.is_subject ? SUBJECT_INK : 'rgb(0 0 0 / 0.6)',
          color: '#fff',
          fontSize: 'var(--text-2xs)',
          fontWeight: subject.is_subject ? 700 : 500,
          letterSpacing: '0.02em',
          padding: '1px 6px',
          borderRadius: '3px 3px 0 0',
          whiteSpace: 'nowrap',
        }}
      >
        {subject.label}
        {subject.is_subject ? ' · ALERT' : ''}
      </span>
    </div>
  );
}

/** One crop in the gallery. The alert subject is marked; the rest are not. */
function CropExhibit({ object: subject }: { object: EvidenceObject }) {
  const { url, error } = useEvidenceImage(subject.crop_ref);

  return (
    <figure
      data-testid={subject.is_subject ? 'crop-subject' : 'crop-context'}
      data-object-id={subject.object_id}
      style={{
        margin: 0,
        width: 128,
        border: `2px solid ${subject.is_subject ? SUBJECT_INK : 'var(--line-subtle, rgb(0 0 0 / 0.12))'}`,
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        background: '#000',
      }}
    >
      <div
        style={{
          height: 128, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: 'var(--ink-tertiary)',
          fontSize: 'var(--text-2xs)',
        }}
      >
        {url ? (
          <img
            src={url}
            alt={`Decision crop for ${subject.label}${subject.is_subject ? ', the subject of this alert' : ''}`}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
        ) : error ? (
          'Unavailable'
        ) : (
          <Spinner />
        )}
      </div>
      <figcaption
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-1)',
          padding: '4px 6px',
          fontSize: 'var(--text-2xs)',
          fontWeight: subject.is_subject ? 700 : 500,
          background: subject.is_subject ? SUBJECT_INK : 'rgb(0 0 0 / 0.75)',
          color: '#fff',
        }}
      >
        {/* The subject marker.

            This was the character U+2605 prepended to the label, which meant a
            screen reader read "black star Person #2" and a sighted reader got a
            symbol with no stated meaning anywhere on the page. The icon carries
            the same visual distinction, and the `sr-only` text finally says
            what it is: the marker is announced as "Alert subject" rather than
            as punctuation. */}
        {subject.is_subject ? (
          <>
            <Icon icon={StatusIcons.subject} size="inline" />
            <span className="sr-only">Alert subject</span>
          </>
        ) : null}
        {subject.label}
      </figcaption>
    </figure>
  );
}

/**
 * Everything the operator is shown about one alert's imagery.
 *
 * The full decision frame with the subject boxed, then the crops that were
 * actually sent to the model. Both come from the same stored frame and the
 * same recorded geometry — nothing on this page recomputes a box, finds a
 * nearest person, or reads the live stream. If the backend stored a fallback
 * context frame instead of the decision frame, it says so rather than
 * decorating it.
 */
export function EvidenceExhibit({ evidenceRef }: { evidenceRef: string }) {
  const { url, error } = useEvidenceImage(evidenceRef);
  const metadata = useQuery({
    queryKey: ['evidence', evidenceRef],
    queryFn: () => evidenceApi.metadata(evidenceRef),
    staleTime: Infinity,
  });

  const geometry = metadata.data?.geometry ?? null;
  const subject = geometry?.kind === 'decision-frame' ? geometry.subject : undefined;
  const context = geometry?.kind === 'decision-frame' ? (geometry.context ?? []) : [];
  const isDecisionFrame = (metadata.data?.purpose ?? '').endsWith(':decision-frame');

  const gallery = useMemo(
    () => [...(subject ? [subject] : []), ...context].filter((o) => o.crop_ref),
    [subject, context],
  );

  if (error) {
    return (
      <div style={{ padding: 'var(--space-4)', color: 'var(--ink-tertiary)' }}>{error}</div>
    );
  }
  if (!url) {
    return (
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
          padding: 'var(--space-4)', color: 'var(--ink-tertiary)',
          fontSize: 'var(--text-sm)',
        }}
      >
        <Spinner /> Retrieving evidence…
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <div>
        <div
          style={{
            fontSize: 'var(--text-2xs)', textTransform: 'uppercase',
            letterSpacing: '0.06em', color: 'var(--ink-tertiary)',
            marginBottom: 'var(--space-1)',
          }}
        >
          {isDecisionFrame ? 'Decision frame' : 'Context frame'}
        </div>
        <div style={{ position: 'relative', lineHeight: 0 }}>
          <img
            src={url}
            alt="Evidence frame from the camera at the moment this verdict was made"
            style={{
              width: '100%', display: 'block', borderRadius: 'var(--radius-md)',
              background: '#000',
            }}
          />
          {/* Context first, so the subject's box is never drawn under one. */}
          {context.map((o) => (
            <SubjectBox key={o.object_id} object={o} />
          ))}
          {subject ? <SubjectBox object={subject} /> : null}
        </div>
        {!subject && (
          // Said out loud. An unmarked frame with several people in it invites
          // the operator to pick one, and picking the wrong one is the whole
          // failure this evidence path exists to prevent.
          <div
            style={{
              marginTop: 'var(--space-1)', fontSize: 'var(--text-xs)',
              color: 'var(--ink-tertiary)',
            }}
          >
            {isDecisionFrame
              ? 'No subject geometry was recorded for this frame, so nobody is highlighted.'
              : 'The decision frame was no longer held, so this is a later view of the same camera. Nobody is highlighted, because nobody in it is the subject.'}
          </div>
        )}
      </div>

      {gallery.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 'var(--text-2xs)', textTransform: 'uppercase',
              letterSpacing: '0.06em', color: 'var(--ink-tertiary)',
              marginBottom: 'var(--space-2)',
            }}
          >
            Decision evidence — the {gallery.length === 1 ? 'image' : 'images'} the model
            was asked about
          </div>
          <div
            data-testid="crop-gallery"
            style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}
          >
            {gallery.map((o) => (
              <CropExhibit key={o.object_id} object={o} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── one alert ────────────────────────────────────────────────────────────── */

function sinceLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (Number.isNaN(minutes)) return null;
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function AlertCard({
  incident,
  selected,
  onSelect,
}: {
  incident: Incident;
  selected: boolean;
  onSelect: (next: boolean) => void;
}) {
  const client = useQueryClient();
  const toast = useToast();
  const [showEvidence, setShowEvidence] = useState(false);
  const titleId = useId();

  const acknowledge = useMutation({
    mutationFn: () => incidentsApi.acknowledge(incident.id),
    // Refetched rather than patched locally: the durable status lives on the
    // server, and a card that only looks acknowledged would lie after a reload.
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['alerts'] });
      toast.success('Alert acknowledged', { description: `${cameraLabel(incident.camera_key)} — it stays in the queue until resolved.` });
    },
    onError: (error) =>
      toast.error('The alert could not be acknowledged', {
        description: isApiError(error) ? error.friendlyMessage : undefined,
      }),
  });

  const failed = failedConditions(incident);
  const evidenceRef = incident.evidence_refs[0];
  const severity = (['critical', 'high', 'medium', 'low', 'info'].includes(incident.severity) ? incident.severity : 'info') as Severity;
  const title = failed.length
    ? failed.map((c) => `Missing ${attributeLabel(c.attribute).toLowerCase()}`).join(' · ')
    : incident.summary || 'PPE violation';
  const since = sinceLabel(incident.observed_at);

  return (
    <li className="uwv-alert" data-severity={severity} data-status={incident.status} data-selected={selected ? 'true' : undefined}>
      <div className="uwv-alert-select">
        <Checkbox label="Select alert" hideLabel checked={selected} onChange={onSelect} aria-describedby={titleId} />
      </div>
      <span className="uwv-alert-icon" aria-hidden="true">
        <Icon icon={SeverityIcons[severity]} size="control" />
      </span>
      <div className="uwv-alert-main">
        <div className="uwv-alert-head">
          <p className="uwv-alert-title" id={titleId}>
            {title}
          </p>
          <span className="uwv-alert-badges">
            <SeverityBadge severity={severity} />
            <StatusPill tone={incident.status === 'active' ? 'offline' : 'degraded'}>
              {incident.status === 'active' ? 'Active' : 'Acknowledged'}
            </StatusPill>
          </span>
        </div>
        <p className="uwv-alert-meta">
          {cameraLabel(incident.camera_key)} · {observedAt(incident)}
          {since ? <span className="uwv-alert-since"> · open {since}</span> : null}
        </p>

        {failed.length > 0 && (
          <div className="uwv-alert-conditions">
            {failed.map((c) => (
              <span key={c.attribute} className="uwv-permission-chip">
                {c.attribute} = {c.observed}
              </span>
            ))}
          </div>
        )}

        {showEvidence && evidenceRef ? (
          <div style={{ marginTop: 'var(--space-3)' }}>
            <EvidenceExhibit evidenceRef={evidenceRef} />
          </div>
        ) : null}

        <div className="uwv-alert-actions">
          {incident.status === 'active' && (
            <Button
              size="sm"
              variant="primary"
              icon={<Icon icon={StatusIcons.guarantee} />}
              loading={acknowledge.isPending}
              onClick={() => acknowledge.mutate()}
            >
              Acknowledge
            </Button>
          )}
          {evidenceRef ? (
            <Button
              size="sm"
              variant="secondary"
              icon={<Icon icon={ActionIcons.view} />}
              aria-expanded={showEvidence}
              onClick={() => setShowEvidence((v) => !v)}
            >
              {showEvidence ? 'Hide evidence' : 'View evidence'}
            </Button>
          ) : (
            // Said plainly rather than shown as a broken image. A violation
            // without a frame is still a violation to act on.
            <span className="uwv-type-caption">No evidence image was captured</span>
          )}

          <ButtonLink to={`/incidents/${encodeURIComponent(incident.id)}`} size="sm" variant="ghost">
            Open incident
          </ButtonLink>

          <span className="uwv-alert-ref">
            {incident.rule_id} · {incident.id.slice(0, 8)}
          </span>
        </div>
      </div>
    </li>
  );
}

/* ── the page ─────────────────────────────────────────────────────────────── */

type View = 'all' | 'active' | 'acknowledged';

export function AlertsPage() {
  const client = useQueryClient();
  const toast = useToast();
  const [view, setView] = useState<View>('all');
  const [severities, setSeverities] = useState<ReadonlySet<string>>(new Set());
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const alerts = useQuery({
    queryKey: ['alerts'],
    // Active and acknowledged both need attention; only a resolved incident
    // leaves the queue.
    queryFn: async () => {
      const [active, acknowledged] = await Promise.all([
        incidentsApi.list('active'),
        incidentsApi.list('acknowledged'),
      ]);
      return [...active.incidents, ...acknowledged.incidents];
    },
    refetchInterval: ALERT_POLL_MS,
  });

  const ordered = useMemo(() => {
    const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return [...(alerts.data ?? [])].sort((a, b) => {
      // Unacknowledged first, then severity, then most recent.
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
      const severity = (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9);
      if (severity !== 0) return severity;
      return (b.observed_at ?? '').localeCompare(a.observed_at ?? '');
    });
  }, [alerts.data]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return ordered.filter((incident) => {
      if (view !== 'all' && incident.status !== view) return false;
      if (severities.size > 0 && !severities.has(incident.severity)) return false;
      if (!needle) return true;
      const words = `${cameraLabel(incident.camera_key)} ${incident.camera_key} ${incident.summary} ${failedConditions(incident)
        .map((c) => `${c.attribute} ${attributeLabel(c.attribute)}`)
        .join(' ')}`.toLowerCase();
      return words.includes(needle);
    });
  }, [ordered, view, severities, search]);

  const acknowledgeMany = useMutation({
    mutationFn: async (ids: ReadonlyArray<string>) => Promise.allSettled(ids.map((id) => incidentsApi.acknowledge(id))),
    onSuccess: (results) => {
      void client.invalidateQueries({ queryKey: ['alerts'] });
      const done = results.filter((r) => r.status === 'fulfilled').length;
      const failedCount = results.length - done;
      if (done > 0) toast.success(`${done} ${done === 1 ? 'alert' : 'alerts'} acknowledged`);
      if (failedCount > 0) toast.error(`${failedCount} could not be acknowledged`);
      setSelected(new Set());
    },
  });

  const retry = useCallback(() => void alerts.refetch(), [alerts]);

  if (alerts.isPending) return <LoadingState label="Loading alerts" />;
  if (alerts.isError) {
    return (
      <ErrorState
        body={isApiError(alerts.error) ? alerts.error.message : 'Alerts could not be loaded.'}
        requestId={isApiError(alerts.error) ? alerts.error.requestId : undefined}
        onRetry={retry}
      />
    );
  }

  const active = ordered.filter((i) => i.status === 'active').length;
  const acknowledged = ordered.length - active;
  const urgent = ordered.filter((i) => i.severity === 'critical' || i.severity === 'high').length;
  const oldest = ordered.reduce<string | null>(
    (min, incident) => (incident.observed_at && (!min || incident.observed_at < min) ? incident.observed_at : min),
    null,
  );
  const selectedActive = shown.filter((i) => selected.has(i.id) && i.status === 'active');
  const severityOptions = ['critical', 'high', 'medium', 'low'].filter((s) => ordered.some((i) => i.severity === s));

  return (
    <>
      <PageIntro
        eyebrow="Operations"
        title="Alerts"
        standfirst="Open compliance violations, most urgent first. An alert is raised only when a covering was positively observed to be missing — never when a camera could not see."
        meta={
          <>
            <StatusPill tone={active > 0 ? 'offline' : 'online'}>{active} active</StatusPill>
            {acknowledged > 0 ? <StatusPill tone="degraded">{acknowledged} acknowledged</StatusPill> : null}
            <span className="uwv-page-meta-item">Refreshes every {ALERT_POLL_MS / 1000} seconds</span>
          </>
        }
      />

      {ordered.length === 0 ? (
        <EmptyState
          title="No open alerts"
          body="No compliance violation is currently open. This is a real reading of the incident queue, refreshed every few seconds — not a placeholder."
        />
      ) : (
        <>
          <section className="uwv-metrics uwv-arrive" data-order="2" aria-label="The queue" style={{ marginBottom: 'var(--space-6)' }}>
            <MetricTile label="Waiting for acknowledgement" icon={AttentionIcons.critical} value={active} detail="Nobody has said they have seen these" detailTone={active > 0 ? 'danger' : 'success'} />
            <MetricTile label="Acknowledged, open" icon={StatusIcons.guarantee} value={acknowledged} detail="Seen, not yet resolved" />
            <MetricTile label="Critical or high" icon={SeverityIcons.high} value={urgent} detail="Across both" detailTone={urgent > 0 ? 'warning' : undefined} />
            <MetricTile label="Oldest open" icon={StatusIcons.awaiting} value={sinceLabel(oldest) ?? null} unavailableReason="No observation time recorded" detail="Since it was observed" />
          </section>

          <section className="uwv-datatable uwv-arrive" data-order="3" aria-label="Open alerts">
            <div className="uwv-datatable-toolbar">
              <Tabs
                label="Which alerts"
                active={view}
                onChange={(next) => {
                  setView(next as View);
                  setSelected(new Set());
                }}
                tabs={[
                  { id: 'all', label: `All · ${ordered.length}` },
                  { id: 'active', label: `Unacknowledged · ${active}` },
                  { id: 'acknowledged', label: `Seen · ${acknowledged}` },
                ]}
              />
              <div className="uwv-datatable-search">
                <SearchInput label="Search alerts" placeholder="Camera or attribute…" value={search} onChange={setSearch} />
              </div>
              {severityOptions.length > 1 ? (
                <div role="group" aria-label="Severity" className="uwv-severity-chips">
                  {severityOptions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="uwv-chip"
                      aria-pressed={severities.has(s)}
                      onClick={() => {
                        const next = new Set(severities);
                        if (next.has(s)) next.delete(s);
                        else next.add(s);
                        setSeverities(next);
                      }}
                    >
                      {s[0]!.toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {selected.size > 0 ? (
              <BulkActionBar count={selected.size} noun="alerts" onClear={() => setSelected(new Set())}>
                {selectedActive.length > 0 ? (
                  <Button size="sm" variant="primary" loading={acknowledgeMany.isPending} onClick={() => acknowledgeMany.mutate(selectedActive.map((i) => i.id))}>
                    Mark {selectedActive.length} as seen
                  </Button>
                ) : (
                  <span className="uwv-type-caption">Every selected alert is already acknowledged.</span>
                )}
              </BulkActionBar>
            ) : null}
            {shown.length === 0 ? (
              <div className="uwv-datatable-state">
                <EmptyState
                  title="Nothing in this view"
                  body="Every open alert is filtered out. Clear the search or the severity to see them."
                  action={
                    <Button
                      size="sm"
                      onClick={() => {
                        setSearch('');
                        setSeverities(new Set());
                        setView('all');
                      }}
                    >
                      Show every open alert
                    </Button>
                  }
                />
              </div>
            ) : (
              <ol className="uwv-alert-list" aria-label="Open alerts, most urgent first">
                {shown.map((incident) => (
                  <AlertCard
                    key={incident.id}
                    incident={incident}
                    selected={selected.has(incident.id)}
                    onSelect={(on) => {
                      const next = new Set(selected);
                      if (on) next.add(incident.id);
                      else next.delete(incident.id);
                      setSelected(next);
                    }}
                  />
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </>
  );
}

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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

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
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  SeverityBadge,
  Spinner,
  StatusBadge,
} from '@shared/ui/primitives';
import { Icon, StatusIcons } from '@shared/ui/icons';
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
        border: `2px solid ${subject.is_subject ? SUBJECT_INK : 'var(--border-subtle, rgb(0 0 0 / 0.12))'}`,
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

function AlertCard({ incident }: { incident: Incident }) {
  const client = useQueryClient();
  const [showEvidence, setShowEvidence] = useState(false);

  const acknowledge = useMutation({
    mutationFn: () => incidentsApi.acknowledge(incident.id),
    // Refetched rather than patched locally: the durable status lives on the
    // server, and a card that only looks acknowledged would lie after a reload.
    onSuccess: () => client.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const failed = failedConditions(incident);
  const evidenceRef = incident.evidence_refs[0];

  return (
    <Card>
      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <div
          style={{
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            gap: 'var(--space-3)', flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              style={{
                fontSize: 'var(--text-base)', fontWeight: 600,
                color: 'var(--ink-primary)',
              }}
            >
              {failed.length
                ? failed.map((c) => `Missing ${attributeLabel(c.attribute).toLowerCase()}`).join(' · ')
                : incident.summary || 'PPE violation'}
            </div>
            <div
              style={{
                marginTop: 'var(--space-1)', fontSize: 'var(--text-sm)',
                color: 'var(--ink-secondary)',
              }}
            >
              {cameraLabel(incident.camera_key)} · {observedAt(incident)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <SeverityBadge severity={incident.severity as never} />
            <StatusBadge tone={incident.status === 'active' ? 'offline' : 'degraded'}>
              {incident.status === 'active' ? 'Active' : 'Acknowledged'}
            </StatusBadge>
          </div>
        </div>

        {failed.length > 0 && (
          <div
            style={{
              display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)',
              fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {failed.map((c) => (
              <span
                key={c.attribute}
                style={{
                  padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface-sunken, rgb(0 0 0 / 0.06))',
                }}
              >
                {c.attribute} = {c.observed}
              </span>
            ))}
          </div>
        )}

        {showEvidence && evidenceRef ? <EvidenceExhibit evidenceRef={evidenceRef} /> : null}

        <div
          style={{
            display: 'flex', gap: 'var(--space-2)', alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {evidenceRef ? (
            <Button size="sm" variant="secondary" onClick={() => setShowEvidence((v) => !v)}>
              {showEvidence ? 'Hide evidence' : 'View evidence'}
            </Button>
          ) : (
            // Said plainly rather than shown as a broken image. A violation
            // without a frame is still a violation to act on.
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)' }}>
              No evidence image was captured
            </span>
          )}

          <Link to="/incidents" style={{ textDecoration: 'none' }}>
            <Button size="sm" variant="secondary">View incident</Button>
          </Link>

          {incident.status === 'active' && (
            <Button
              size="sm"
              loading={acknowledge.isPending}
              onClick={() => acknowledge.mutate()}
            >
              Acknowledge
            </Button>
          )}

          <span
            style={{
              marginLeft: 'auto', fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-2xs)', color: 'var(--ink-tertiary)',
            }}
          >
            {incident.rule_id} · {incident.id.slice(0, 8)}
          </span>
        </div>
      </div>
    </Card>
  );
}

/* ── the page ─────────────────────────────────────────────────────────────── */

export function AlertsPage() {
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

  return (
    <>
      <PageIntro
        eyebrow="Operations"
        title="Alerts"
        standfirst="Open compliance violations, most urgent first. An alert is raised only when a covering was positively observed to be missing — never when a camera could not see."
        meta={
          <StatusBadge tone={active > 0 ? 'offline' : 'online'}>
            {active} active
          </StatusBadge>
        }
      />

      {ordered.length === 0 ? (
        <EmptyState
          title="No open alerts"
          body="No compliance violation is currently open. This is a real reading of the incident queue, refreshed every few seconds — not a placeholder."
        />
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
          {ordered.map((incident) => (
            <AlertCard key={incident.id} incident={incident} />
          ))}
        </div>
      )}
    </>
  );
}

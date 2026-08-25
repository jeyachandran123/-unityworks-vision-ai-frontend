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
  type Incident,
} from '@shared/api/persistence';
import { isApiError } from '@shared/api/errors';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  SeverityBadge,
  Spinner,
  StatusBadge,
} from '@shared/ui/primitives';

/** How often the queue is re-read. Matches the camera wall's cadence. */
const ALERT_POLL_MS = 5000;

/* ── reading a finding ────────────────────────────────────────────────────── */

interface FailedCondition {
  attribute: string;
  observed: string;
}

/**
 * The conditions that actually failed, from the **frozen** finding.
 *
 * Read defensively: this is a stored snapshot, and a finding written by an
 * older ruleset must still render rather than crash the queue.
 */
export function failedConditions(incident: Incident): FailedCondition[] {
  const raw = incident.finding as { conditions?: unknown } | null;
  const conditions = Array.isArray(raw?.conditions) ? raw.conditions : [];
  return conditions
    .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
    .filter((c) => c['outcome'] === 'failed')
    .map((c) => ({
      attribute: String(c['attribute'] ?? ''),
      observed: String(c['observed'] ?? ''),
    }))
    .filter((c) => c.attribute);
}

/** `head_covering` → `Head covering`. The attribute key, made readable. */
export function attributeLabel(key: string): string {
  const words = key.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The camera key as an operator says it: `cam-12` → `Camera 12`. */
export function cameraLabel(key: string): string {
  const match = /^cam-0*(\d+)$/.exec(key);
  return match ? `Camera ${match[1]}` : key;
}

export function observedAt(incident: Incident): string {
  const value = incident.observed_at ?? incident.created_at;
  if (!value) return '—';
  const when = new Date(value);
  return Number.isNaN(when.getTime()) ? '—' : when.toLocaleString();
}

/* ── evidence ─────────────────────────────────────────────────────────────── */

function EvidenceImage({ evidenceRef }: { evidenceRef: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const objectUrl = useRef<string | null>(null);

  useEffect(() => {
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
      // A blob URL pins the image in memory until it is revoked, and this queue
      // can open many over a shift.
      if (objectUrl.current) {
        URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = null;
      }
    };
  }, [evidenceRef]);

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
    <img
      src={url}
      alt="Evidence frame from the camera at the time this was raised"
      style={{
        width: '100%', display: 'block', borderRadius: 'var(--radius-md)',
        background: '#000',
      }}
    />
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

        {showEvidence && evidenceRef ? <EvidenceImage evidenceRef={evidenceRef} /> : null}

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
      <PageHeader
        title="Alerts"
        description="Open compliance violations, most urgent first. An alert is raised only when a covering was positively observed to be missing — never when a camera could not see."
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

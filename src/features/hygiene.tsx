/**
 * Staff Hygiene — what the cameras actually observed, in four states.
 *
 * ### This is the page `StateBadge` was built for
 *
 * The badge has existed since the design system was written and, until now, was
 * rendered only in DevTools. That meant the product's central claim — that
 * PRESENT, ABSENT, NOT_VISIBLE and UNKNOWN are four different facts — was
 * visible to engineers and to nobody else. Every PPE value on this page goes
 * through it, and through `observation.ts` to get there, so the resolution rule
 * lives in exactly one place.
 *
 * ### Three empty screens that must never look alike
 *
 *   the platform is not assembled   → UnavailableState, with its reason
 *   it is watching and saw nobody   → EmptyState
 *   this account reaches no camera  → EmptyState, saying so
 *
 * A page that rendered all three as "no observations" would tell a manager that
 * their kitchen is clean when the truth is that nothing was looking at it. That
 * is the failure this product exists to prevent, and it is a rendering decision
 * as much as a backend one.
 *
 * ### Nothing here is computed into a verdict
 *
 * No compliance percentage, no pass/fail column, no "3 violations". Those are
 * the rule engine's judgements and they arrive as incidents, on their own page,
 * with a frozen finding behind them. This page reports observations, and an
 * observation is not a verdict.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  attributeLabel,
  observationsApi,
  observedAtLabel,
  type ObservedSubject,
} from '@shared/api/observations';
import { isApiError } from '@shared/api/errors';
import { resolveState } from '@shared/semantics/observation';
import {
  Badge,
  Card,
  type Column,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  StateBadge,
  StatCard,
  UnavailableState,
} from '@shared/ui/primitives';
import {
  PageIntro,
} from '@shared/ui/product';

/** How often the page re-reads. Matches the alert queue's cadence. */
const HYGIENE_POLL_MS = 10_000;

/** How far back the page looks by default. */
const WINDOWS: ReadonlyArray<{ id: string; label: string; hours: number }> = [
  { id: '1h', label: 'Last hour', hours: 1 },
  { id: '8h', label: 'Last shift', hours: 8 },
  { id: '24h', label: 'Last 24 hours', hours: 24 },
];

/**
 * The PPE attributes a row shows, in a fixed order.
 *
 * Fixed so the columns do not reorder as different subjects arrive, and so an
 * attribute the platform did not report still gets a cell — rendered UNKNOWN
 * rather than omitted. A missing column and an unknown value are different
 * facts, and only one of them is about the person.
 */
const PPE_KEYS = ['head_covering', 'face_covering', 'hand_covering'] as const;

function attributeFor(subject: ObservedSubject, key: string) {
  return subject.attributes.find((a) => a.key === key) ?? null;
}

/** Attribute keys the platform reported that are not in the fixed set. */
function extraKeys(subjects: ReadonlyArray<ObservedSubject>): string[] {
  const seen = new Set<string>();
  for (const subject of subjects) {
    for (const attribute of subject.attributes) {
      if (!PPE_KEYS.includes(attribute.key as (typeof PPE_KEYS)[number])) seen.add(attribute.key);
    }
  }
  return [...seen].sort();
}

export function StaffHygienePage() {
  const [windowId, setWindowId] = useState('8h');
  const hours = WINDOWS.find((w) => w.id === windowId)?.hours ?? 8;

  const observations = useQuery({
    // The window is part of the key, so switching it is a new query rather than
    // a refetch that briefly shows the previous window's rows.
    queryKey: ['observations', windowId],
    queryFn: () =>
      observationsApi.list({
        since: new Date(Date.now() - hours * 3_600_000).toISOString(),
        limit: 500,
      }),
    refetchInterval: HYGIENE_POLL_MS,
  });

  const subjects = useMemo(() => observations.data?.subjects ?? [], [observations.data]);
  const extras = useMemo(() => extraKeys(subjects), [subjects]);

  const columns = useMemo<ReadonlyArray<Column<ObservedSubject>>>(() => {
    const ppe = [...PPE_KEYS, ...extras].map((key) => ({
      key,
      header: attributeLabel(key),
      render: (subject: ObservedSubject) => {
        const attribute = attributeFor(subject, key);
        return (
          <StateBadge
            // No value resolves to UNKNOWN through the same rule everything
            // else uses — never to "compliant", and never to a blank cell.
            value={attribute?.value ?? null}
          />
        );
      },
      width: '11rem',
    }));

    return [
      {
        key: 'subject',
        header: 'Subject',
        render: (subject) => (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
            {subject.object_id}
          </span>
        ),
        width: '12rem',
      },
      {
        key: 'camera',
        header: 'Camera',
        render: (subject) => subject.camera_key || '—',
        width: '8rem',
      },
      {
        key: 'zone',
        header: 'Zone',
        // The zone the camera belonged to **when this was observed**, resolved
        // from assignment history rather than from the camera's current zone.
        // "Not recorded" is its own answer: for observations older than the
        // first recorded assignment nobody wrote the zone down, and inferring
        // one from today's mapping would rewrite where a past reading happened.
        render: (subject) =>
          subject.zone_name ? (
            subject.zone_name
          ) : (
            <span style={{ color: 'var(--ink-tertiary)' }}>
              {subject.zone_recorded ? 'No zone' : 'Not recorded'}
            </span>
          ),
        width: '10rem',
      },
      ...ppe,
      {
        key: 'last_seen',
        header: 'Last observed',
        render: (subject) => observedAtLabel(subject.last_seen),
        width: '13rem',
      },
    ];
  }, [extras]);

  if (observations.isPending) return <LoadingState label="Loading observations" />;

  if (observations.isError) {
    return (
      <ErrorState
        body={
          isApiError(observations.error)
            ? observations.error.friendlyMessage
            : 'Observations could not be loaded.'
        }
        requestId={isApiError(observations.error) ? observations.error.requestId : undefined}
        onRetry={() => void observations.refetch()}
      />
    );
  }

  const page = observations.data;

  return (
    <>
      <PageIntro
        eyebrow="Compliance"
        title="Staff Hygiene"
        standfirst="What each camera observed, per subject. A covering that could not be seen is reported as not visible — never as missing, because nobody may be accused of something nobody could see."
        meta={
          page.available ? (
            <>
              <Badge mono>{page.cameras_queried.length} cameras</Badge>
              {!page.window_fully_observable ? (
                // Partial coverage is stated rather than smoothed over: some of
                // the window could not be read, and a count from an incomplete
                // window is not the same figure as a complete one.
                <Badge>partial coverage — some of this window could not be read</Badge>
              ) : null}
            </>
          ) : undefined
        }
        actions={
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {WINDOWS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setWindowId(option.id)}
                aria-pressed={windowId === option.id}
                style={{
                  padding: '0.3rem 0.7rem',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 'var(--weight-medium)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  background:
                    windowId === option.id ? 'var(--accent)' : 'var(--surface-raised)',
                  color:
                    windowId === option.id ? 'var(--ink-on-accent)' : 'var(--ink-primary)',
                  borderColor:
                    windowId === option.id ? 'var(--accent)' : 'var(--line-default)',
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      />

      {/* The platform could not be read. Distinct from having read it and found
          nobody, and the reason is the platform's own words. */}
      {!page.available ? (
        <UnavailableState title="Observations are not available" body={page.reason} />
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(13rem, 1fr))',
              gap: 'var(--space-4)',
              marginBottom: 'var(--space-6)',
            }}
          >
            <StatCard
              label="Subjects observed"
              value={page.count}
              tone={page.count > 0 ? 'accent' : 'default'}
              detail={`In the ${WINDOWS.find((w) => w.id === windowId)?.label.toLowerCase()}`}
            />
            <StatCard
              label="Observations read"
              value={page.observation_count ?? null}
              unavailableReason="Not reported for this window"
              detail="Individual readings behind the rows"
            />
            <StatCard
              label="Cameras in scope"
              value={page.cameras_queried.length}
              detail="Every camera your account reaches"
            />
          </div>

          <Card padded={false}>
            <DataTable
              columns={columns}
              rows={subjects}
              rowKey={(subject) => subject.object_id}
              caption="Subjects observed in this window, with each PPE item's observed state, the camera, the zone it was in at the time, and when it was last seen"
              empty={
                page.cameras_queried.length === 0 ? (
                  <EmptyState
                    title="Your account reaches no camera"
                    body="Observations are shown for the cameras your account is granted. Ask an administrator to widen your access."
                  />
                ) : (
                  <EmptyState
                    title="Nobody was observed in this window"
                    body="The cameras were read and no subject was seen. This is a real reading, not a placeholder — widen the window, or check the Cameras page if you expected activity."
                  />
                )
              }
            />
          </Card>
        </>
      )}
    </>
  );
}

/** Exported for the tests: the state a raw value resolves to. */
export { resolveState };

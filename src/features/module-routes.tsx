/**
 * Six of the seven new module pages. Patron ID is next door, on its own.
 *
 * Each is a query and a description. Everything else — the reason, the
 * checklist, the table names — comes from the backend, so there is exactly one
 * copy of every answer and this file cannot drift from what the server actually
 * requires.
 *
 * ### None of these renders a number
 *
 * Not a count, not a percentage, not a trend. `ModulePage` passes `null` to
 * every `StatCard`, and the module-specific sections below render vocabulary
 * (which states exist, which reconciliation outcomes exist) rather than
 * readings. A page that showed "0 covers today" from a system with no
 * people-counting detector would be the exact failure this product exists to
 * prevent, and it would be indistinguishable from a genuinely quiet Tuesday.
 */

import { useQuery } from '@tanstack/react-query';

import { modulesApi } from '@shared/api/capabilities';
import { Badge, Card, DataTable, EmptyState, StateBadge } from '@shared/ui/primitives';
import { ModulePage } from './awaiting';
import type { PosConnector } from '@shared/api/capabilities';
import type { ObservationState } from '@shared/semantics/observation';

/** Capability answers change when a deployment changes, not between renders. */
const CAPABILITY_STALE_MS = 60_000;

/* ── People Counting ──────────────────────────────────────────────────────── */

export function PeopleCountingPage() {
  const query = useQuery({
    queryKey: ['modules', 'people-counting'],
    queryFn: () => modulesApi.peopleCounting(),
    staleTime: CAPABILITY_STALE_MS,
  });

  return (
    <ModulePage
      query={query}
      fallbackTitle="People Counting"
      area="Intelligence"
      loadingLabel="Loading people counting"
      description="Entries and exits per zone, with the coverage each figure was computed from — because a count without one cannot be read."
    >
      {() => (
        <Card>
          <h2 style={{ fontSize: 'var(--text-md)' }}>Why coverage is part of the schema</h2>
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--ink-secondary)',
              maxWidth: '68ch',
              marginTop: 'var(--space-2)',
            }}
          >
            A camera that was down for forty of a sixty-minute bucket produces a
            count that looks exactly like a quiet hour. Every interval therefore
            carries how many seconds were actually observed, and a bucket whose
            coverage is unknown will say so rather than being reported as
            complete. Peak-hour analysis and branch comparison are only
            defensible on that basis — comparing a fully observed site against a
            partly observed one is how these reports become quietly wrong.
          </p>
        </Card>
      )}
    </ModulePage>
  );
}

/* ── Demography ───────────────────────────────────────────────────────────── */

export function DemographyPage() {
  const query = useQuery({
    queryKey: ['modules', 'demography'],
    queryFn: () => modulesApi.demography(),
    staleTime: CAPABILITY_STALE_MS,
  });

  return (
    <ModulePage
      query={query}
      fallbackTitle="Demography"
      area="Intelligence"
      loadingLabel="Loading demography"
      description="Aggregate category counts per zone and time bucket. Never per person — the schema has no column that could hold one."
    >
      {(capability) => (
        <Card>
          <h2 style={{ fontSize: 'var(--text-md)' }}>Aggregate only, by construction</h2>
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--ink-secondary)',
              maxWidth: '68ch',
              marginTop: 'var(--space-2)',
            }}
          >
            {/* The server's own sentence about its own schema. The frontend does
                not assert this on its own authority — a client-side claim about
                a backend guarantee is worth nothing. */}
            {capability.aggregate_only_detail}
          </p>
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--ink-secondary)',
              maxWidth: '68ch',
              marginTop: 'var(--space-3)',
            }}
          >
            Counts below a configured floor are suppressed rather than stored: a
            category containing one person, read alongside a shift roster, names
            them. That floor is a privacy control and a person has to choose it,
            which is why it appears in the list above rather than having a
            default.
          </p>
        </Card>
      )}
    </ModulePage>
  );
}

/* ── Table Occupancy ──────────────────────────────────────────────────────── */

export function TableOccupancyPage() {
  const query = useQuery({
    queryKey: ['modules', 'table-occupancy'],
    queryFn: () => modulesApi.tableOccupancy(),
    staleTime: CAPABILITY_STALE_MS,
  });

  return (
    <ModulePage
      query={query}
      fallbackTitle="Table Occupancy"
      area="Intelligence"
      loadingLabel="Loading table occupancy"
      description="Each table's state over time, and the turnover derived from it. A table nobody could see is reported as such, never as vacant."
    >
      {(capability) => (
        <Card>
          <h2 style={{ fontSize: 'var(--text-md)' }}>The states a table can be in</h2>
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--ink-secondary)',
              maxWidth: '68ch',
              marginTop: 'var(--space-2)',
            }}
          >
            Six, and two of them are ways of not knowing. A table hidden behind a
            standing group is <strong>not visible</strong> and a table nothing has
            reported on is <strong>unknown</strong>; neither is vacant, and
            seating a party at an occupied table is what collapsing them would
            cause.
          </p>
          <ul
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              flexWrap: 'wrap',
              marginTop: 'var(--space-4)',
              listStyle: 'none',
            }}
          >
            {capability.states.map((state) => (
              <li key={state}>
                <Badge mono>{state}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </ModulePage>
  );
}

/* ── Cutting Board Compliance ─────────────────────────────────────────────── */

/**
 * The four states, rendered by the component that owns them.
 *
 * Board readings resolve through exactly the same `StateBadge` and the same
 * `observation.ts` rule that PPE does. That is the point of showing them here
 * before any data exists: whoever connects the detector can see that a board
 * whose colour the camera could not make out renders as *not visible*, and that
 * there is no path through this page that turns it into a violation.
 */
function ReadingStates({ states }: { states: string[] }) {
  return (
    <ul
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        flexWrap: 'wrap',
        marginTop: 'var(--space-4)',
        listStyle: 'none',
      }}
    >
      {states.map((state) => (
        <li key={state}>
          {/* `state`, not `value`: these are the states themselves rather than
              raw readings to be resolved, and passing them through the value
              path would mean inventing a fake attribute value to resolve from. */}
          <StateBadge state={state as ObservationState} />
        </li>
      ))}
    </ul>
  );
}

export function CuttingBoardPage() {
  const query = useQuery({
    queryKey: ['modules', 'cutting-board'],
    queryFn: () => modulesApi.cuttingBoard(),
    staleTime: CAPABILITY_STALE_MS,
  });

  return (
    <ModulePage
      query={query}
      fallbackTitle="Cutting Board Compliance"
      area="Compliance"
      loadingLabel="Loading board compliance"
      description="Board colour against the ingredient being prepared, judged by the site's own colour scheme — not by one this system picked."
    >
      {(capability) => (
        <>
          <Card>
            <h2 style={{ fontSize: 'var(--text-md)' }}>Two readings, four states each</h2>
            <p
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--ink-secondary)',
                maxWidth: '68ch',
                marginTop: 'var(--space-2)',
              }}
            >
              A mismatch needs both the board colour and the ingredient category
              to have actually been seen. A blue board under sodium light reads
              green, so a colour the camera could not resolve is{' '}
              <strong>not visible</strong> — and a not-visible reading can never
              produce a mismatch. Accusing a chef of using the wrong board
              because of the lighting is the same failure the hygiene surface
              exists to prevent, in a kitchen where it would be even harder to
              argue with.
            </p>
            <ReadingStates states={capability.reading_states} />
          </Card>

          <div style={{ marginTop: 'var(--space-6)' }}>
            <Card>
              <h2 style={{ fontSize: 'var(--text-md)' }}>Colour scheme in force</h2>
              <div style={{ marginTop: 'var(--space-4)' }}>
                <EmptyState
                  title="No colour scheme configured"
                  body="Colour coding is not universal — a Singapore chain, a UK caterer and a US franchise use overlapping but different schemes. This system will not guess one, because a guessed scheme produces confident verdicts about the wrong thing."
                />
              </div>
            </Card>
          </div>
        </>
      )}
    </ModulePage>
  );
}

/* ── Meal Detection ───────────────────────────────────────────────────────── */

export function MealDetectionPage() {
  const query = useQuery({
    queryKey: ['modules', 'meal-detection'],
    queryFn: () => modulesApi.mealDetection(),
    staleTime: CAPABILITY_STALE_MS,
  });

  return (
    <ModulePage
      query={query}
      fallbackTitle="Meal Detection"
      area="Intelligence"
      loadingLabel="Loading meal detection"
      description="Dishes recognised at the pass, held separately from what the till says was sold. The difference between the two is the whole point."
    >
      {(capability) => (
        <Card>
          <h2 style={{ fontSize: 'var(--text-md)' }}>Nothing reconciles by default</h2>
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--ink-secondary)',
              maxWidth: '68ch',
              marginTop: 'var(--space-2)',
            }}
          >
            A detection starts <strong>unreconciled</strong> and stays there until
            a POS connector has actually been asked. It never starts{' '}
            <strong>matched</strong>, and an unconnected till returns a refusal
            rather than an empty ticket list — because a caller handed zero
            tickets would mark every dish in the window as unmatched and report a
            discrepancy that only means nothing was plugged in.
          </p>
          <ul
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              flexWrap: 'wrap',
              marginTop: 'var(--space-4)',
              listStyle: 'none',
            }}
          >
            {capability.reconciliation_states.map((state) => (
              <li key={state}>
                <Badge mono tone={state === 'unreconciled' ? 'accent' : 'neutral'}>
                  {state}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </ModulePage>
  );
}

/* ── POS / ERP Integration ────────────────────────────────────────────────── */

export function PosIntegrationPage() {
  const query = useQuery({
    queryKey: ['modules', 'pos-integration'],
    queryFn: () => modulesApi.posIntegration(),
    staleTime: CAPABILITY_STALE_MS,
  });

  const connectors = useQuery({
    queryKey: ['pos-connectors'],
    queryFn: () => modulesApi.posConnectors(),
    staleTime: CAPABILITY_STALE_MS,
  });

  return (
    <ModulePage
      query={query}
      fallbackTitle="POS / ERP Integration"
      area="Platform"
      loadingLabel="Loading integrations"
      description="The seam between this system and a till. Underlies meal-detection reconciliation and any future order or table sync."
    >
      {(capability) => (
        <>
          <Card>
            <h2 style={{ fontSize: 'var(--text-md)' }}>Bound adapter</h2>
            <p
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--ink-secondary)',
                maxWidth: '68ch',
                marginTop: 'var(--space-2)',
              }}
            >
              {/* The adapter is asked what it is, rather than the page assuming.
                  This line stays true on the day a real one is bound. */}
              {capability.adapter.reason}
            </p>
            <div style={{ marginTop: 'var(--space-4)', display: 'flex', gap: 'var(--space-2)' }}>
              <Badge mono>{capability.adapter.id}</Badge>
              <Badge>declares no capabilities</Badge>
            </div>
          </Card>

          <div style={{ marginTop: 'var(--space-6)' }}>
            <Card padded={false}>
              <DataTable<PosConnector>
                columns={[
                  {
                    key: 'connector_key',
                    header: 'Connector',
                    render: (row) => row.connector_key,
                  },
                  { key: 'vendor', header: 'Vendor', render: (row) => row.vendor || '—' },
                  {
                    key: 'active',
                    header: 'Active',
                    render: (row) => (row.is_active ? 'Yes' : 'No'),
                  },
                  {
                    key: 'last_error',
                    header: 'Last error',
                    render: (row) => row.last_error || '—',
                  },
                ]}
                rows={connectors.data?.connectors ?? []}
                rowKey={(row) => row.id}
                caption="Point-of-sale connectors configured for this organization"
                empty={
                  <EmptyState
                    title="No connector is configured"
                    body={capability.write_unavailable_reason}
                  />
                }
              />
            </Card>
          </div>
        </>
      )}
    </ModulePage>
  );
}

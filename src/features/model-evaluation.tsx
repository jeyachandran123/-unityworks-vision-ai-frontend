/**
 * Model evaluation — how well the perception stack scores against annotation.
 *
 * ### There is no headline number, on purpose
 *
 * The server returns `headline_metric: null` with a reason, and this page shows
 * that reason where a big number would go. Four families measure different
 * things over different denominators; a single "model health score" combining
 * them would be a figure with no definition, which is the one thing this page
 * must not produce.
 *
 * ### Every metric carries its provenance one click away, not in a tooltip
 *
 * A tooltip is unreachable on touch, invisible to keyboard users and impossible
 * to copy. Each metric row expands in place — via `<details>`, so it works with
 * no JavaScript state and is announced correctly — into the artifact, model,
 * dataset, split, sample size, evaluation date and the metric's own definition.
 *
 * ### Comparison is drawn within a server-decided set, never across sets
 *
 * The backend partitions runs by what may share an axis. Bars are drawn inside
 * one set; two sets are never joined, and a set the server marks `dated: false`
 * is labelled a configuration comparison rather than a series. Nothing here
 * interpolates, and nothing draws a line: these are four discrete runs, and a
 * line between them would imply measurements in between that nobody made.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  evaluationApi,
  formatMetric,
  isProportion,
  METRIC_KIND_LABELS,
  FRESHNESS_LABELS,
  type ComparisonSet,
  type DatasetCoverage,
  type EvaluationRun,
  type MetricEntry,
  type MetricGroup,
} from '@shared/api/evaluation';
import { isApiError } from '@shared/api/errors';
import {
  EngineeringSurface,
  Eyebrow,
  Figure,
  PageIntro,
  SectionRule,
} from '@shared/ui/product';
import {
  Badge,
  Card,
  ErrorState,
  LoadingState,
  StatusBadge,
  UnavailableState,
} from '@shared/ui/primitives';

export function ModelEvaluationPage() {
  const summary = useQuery({
    queryKey: ['evaluation', 'summary'],
    queryFn: () => evaluationApi.summary(),
    staleTime: 60_000,
  });

  const artifacts = useQuery({
    queryKey: ['evaluation', 'artifacts'],
    queryFn: () => evaluationApi.artifacts(),
    staleTime: 60_000,
  });

  const [openRun, setOpenRun] = useState<string>('');

  const runsById = useMemo(() => {
    const map = new Map<string, EvaluationRun>();
    for (const family of summary.data?.families ?? []) {
      for (const run of family.runs) map.set(run.run_id, run);
    }
    return map;
  }, [summary.data]);

  if (summary.isPending) {
    return (
      <>
        <EvaluationIntro />
        <LoadingState label="Reading evaluation artifacts" />
      </>
    );
  }

  if (summary.isError) {
    return (
      <>
        <EvaluationIntro />
        <ErrorState
          body={
            isApiError(summary.error)
              ? summary.error.friendlyMessage
              : 'Evaluation artifacts could not be read.'
          }
          requestId={isApiError(summary.error) ? summary.error.requestId : undefined}
          onRetry={() => void summary.refetch()}
        />
      </>
    );
  }

  const data = summary.data;

  return (
    <>
      <EvaluationIntro
        meta={
          <>
            <Badge mono>{data.totals.runs_available} runs</Badge>
            <Badge mono>{data.totals.runs_dated} dated</Badge>
            {data.totals.runs_undated > 0 ? (
              <Badge>{data.totals.runs_undated} with no evaluation date</Badge>
            ) : null}
          </>
        }
      />

      <EngineeringSurface>
      <div style={{ display: 'grid', gap: 'var(--space-10)', gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <NoHeadline reason={data.headline_reason} totals={data.totals} latest={data.latest_evaluation_at} />

        {data.families.map((family) => (
          <section key={family.key}>
            <SectionRule label={family.title} detail={family.description} />

            {!family.available ? (
              <div style={{ marginTop: 'var(--space-4)' }}>
                <UnavailableState title={`${family.title} could not be read`} body={family.reason} />
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 'var(--space-4)', marginTop: 'var(--space-4)', gridTemplateColumns: 'minmax(0, 1fr)' }}>
                {family.runs.map((run) => (
                  <RunCard
                    key={run.run_id}
                    run={run}
                    expanded={openRun === run.run_id}
                    onToggle={() => setOpenRun(openRun === run.run_id ? '' : run.run_id)}
                  />
                ))}
              </div>
            )}
          </section>
        ))}

        <ComparisonSection sets={data.comparison_sets} runs={runsById} />

        <DatasetSection coverages={data.datasets} />

        <ConfigurationSection configuration={data.configuration} />

        <ArtifactSection
          listing={artifacts.data ?? null}
          loading={artifacts.isPending}
          failed={artifacts.isError}
        />
      </div>
      </EngineeringSurface>
    </>
  );
}

/**
 * The page opening, in the engineering register.
 *
 * Stage 2 moved this page out of "Analyse", where it sat between Meal Detection
 * and Demography, and into Engineering — and Stage 3 removed
 * `view_model_evaluation` from ORG_ADMIN, so its readers are now super_admin
 * and developer. The eyebrow says so on the page itself, because a screenshot
 * of confusion matrices should never be mistakable for an operational reading
 * of a kitchen.
 */
function EvaluationIntro({ meta }: { meta?: React.ReactNode }) {
  return (
    <PageIntro
      eyebrow="Engineering"
      title="Model Evaluation"
      standfirst='What the perception stack scores against human-annotated data. Every figure states its dataset, its split, the model it measured and what it means — because none of them is "model accuracy".'
      meta={meta}
    />
  );
}

/* ── the absent headline ──────────────────────────────────────────────────── */

function NoHeadline({
  reason,
  totals,
  latest,
}: {
  reason: string;
  totals: { runs: number; runs_dated: number; runs_undated: number; families_available: number };
  latest: string | null;
}) {
  return (
    <section aria-label="Overall score">
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <div>
          <Eyebrow>Overall model score</Eyebrow>
          {/* Where a KPI would be. The em dash is the answer, and the sentence
              beneath it is why — the same discipline `StatCard` applies, at the
              scale of a whole page. */}
          <div
            style={{
              fontSize: 'var(--text-4xl)',
              fontFamily: 'var(--font-mono)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--ink-tertiary)',
              lineHeight: 1.05,
              marginTop: 'var(--space-2)',
            }}
          >
            —
          </div>
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--ink-secondary)',
              maxWidth: '76ch',
              marginTop: 'var(--space-3)',
            }}
          >
            {reason}
          </p>
        </div>

        <div
          className="uwv-figures"
          style={{ paddingTop: 'var(--space-5)', borderTop: '1px solid var(--engineering-line)' }}
        >
          {/* Ranked rather than tabulated. The undated count is the one that
              matters and it is the one nobody looks for, so it gets the same
              weight as the total and a sentence saying what it is not. */}
          <Figure label="Evaluation runs" scale="lead" value={totals.runs} detail="Readable artifacts on disk" />
          <Figure
            label="With a recorded date"
            scale="lead"
            value={totals.runs_dated}
            detail="A real timestamp inside the artifact"
          />
          <Figure
            label="With no date recorded"
            scale="lead"
            value={totals.runs_undated}
            detail="Undated is not old — nobody wrote a date down, and no file's modification time is used as a substitute"
          />
          <Figure
            label="Most recent evaluation"
            scale="lead"
            value={latest ? new Date(latest).toLocaleDateString() : null}
            unavailableReason="No artifact carries an evaluation date"
            detail="From inside an artifact, never from the filesystem"
          />
        </div>
      </div>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt
        style={{
          fontSize: 'var(--text-2xs)',
          textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-wider)',
          color: 'var(--ink-tertiary)',
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          margin: 'var(--space-1) 0 0',
          fontSize: 'var(--text-lg)',
          fontFamily: 'var(--font-mono)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {children}
      </dd>
    </div>
  );
}

/* ── one evaluation run ───────────────────────────────────────────────────── */

function freshnessTone(freshness: string): 'online' | 'degraded' | 'offline' | 'idle' {
  if (freshness === 'recent') return 'online';
  if (freshness === 'ageing') return 'degraded';
  if (freshness === 'stale') return 'offline';
  // `undated` is idle: a ring rather than a fill, visually distinct from every
  // dated state because it is a different kind of fact.
  return 'idle';
}

function RunCard({
  run,
  expanded,
  onToggle,
}: {
  run: EvaluationRun;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (!run.available) {
    return <UnavailableState title={run.title} body={run.reason} />;
  }

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ minWidth: '18rem', flex: 1 }}>
          <h3 style={{ fontSize: 'var(--text-md)' }}>{run.title}</h3>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-secondary)', maxWidth: '72ch', marginTop: 'var(--space-1)' }}>
            {run.summary}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
          <StatusBadge tone={freshnessTone(run.freshness)}>
            {FRESHNESS_LABELS[run.freshness] ?? run.freshness}
          </StatusBadge>
          {run.completeness !== 'complete' ? <Badge>partial</Badge> : null}
        </div>
      </div>

      {run.reason ? (
        <p
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--health-degraded)',
            maxWidth: '72ch',
            marginTop: 'var(--space-3)',
          }}
        >
          {run.reason}
        </p>
      ) : null}

      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-3)' }}>
        <Badge mono>{run.provenance.dataset || 'dataset not recorded'}</Badge>
        <Badge mono>{run.provenance.split || 'split not recorded'} split</Badge>
        <Badge mono>{run.provenance.model || 'model not recorded'}</Badge>
        {run.provenance.sample_size !== null ? (
          <Badge mono>n={run.provenance.sample_size}</Badge>
        ) : null}
      </div>

      <div style={{ marginTop: 'var(--space-4)' }}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          style={{
            padding: '0.3rem 0.7rem',
            fontSize: 'var(--text-xs)',
            fontWeight: 'var(--weight-medium)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--line-default)',
            background: expanded ? 'var(--accent-wash)' : 'var(--surface-raised)',
            color: expanded ? 'var(--accent)' : 'var(--ink-primary)',
            cursor: 'pointer',
          }}
        >
          {expanded ? 'Hide metrics' : `Show ${run.groups.length} metric groups`}
        </button>
      </div>

      {expanded ? (
        <div style={{ display: 'grid', gap: 'var(--space-5)', marginTop: 'var(--space-5)' }}>
          {run.groups.map((group) => (
            <GroupBlock key={group.key} group={group} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function GroupBlock({ group }: { group: MetricGroup }) {
  return (
    <div>
      <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)' }}>
        {group.title}
      </h4>
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)', maxWidth: '76ch', marginTop: 'var(--space-1)' }}>
        {group.description}
      </p>

      <ul style={{ listStyle: 'none', display: 'grid', gap: '1px', marginTop: 'var(--space-3)', background: 'var(--line-subtle)', border: '1px solid var(--line-subtle)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
        {group.metrics.map((metric) => (
          <li key={metric.key} style={{ background: 'var(--surface-raised)' }}>
            <MetricRow metric={metric} />
          </li>
        ))}
      </ul>

      {group.confusion ? <ConfusionTable confusion={group.confusion} /> : null}
    </div>
  );
}

/**
 * One metric, with its provenance reachable rather than hidden.
 *
 * `<details>` rather than a tooltip: reachable by keyboard, usable on touch,
 * selectable, and announced by a screen reader as an expandable region. A
 * provenance a user cannot copy into a message is a provenance nobody checks.
 */
function MetricRow({ metric }: { metric: MetricEntry }) {
  const undefinedValue = metric.value === null || metric.value === undefined;

  return (
    <details>
      <summary
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          padding: 'var(--space-2) var(--space-3)',
          cursor: 'pointer',
          listStyle: 'none',
        }}
      >
        <span style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'baseline', minWidth: 0 }}>
          <span aria-hidden="true" style={{ color: 'var(--ink-tertiary)', fontSize: 'var(--text-2xs)' }}>
            ▸
          </span>
          <span style={{ fontSize: 'var(--text-sm)' }}>{metric.label}</span>
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-tertiary)', fontFamily: 'var(--font-mono)' }}>
            {METRIC_KIND_LABELS[metric.kind] ?? metric.kind}
          </span>
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontVariantNumeric: 'tabular-nums',
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--weight-medium)',
            // Undefined reads as absent rather than as a low score.
            color: undefinedValue ? 'var(--ink-tertiary)' : 'var(--ink-primary)',
            whiteSpace: 'nowrap',
          }}
        >
          {formatMetric(metric)}
          {metric.support !== null ? (
            <span style={{ color: 'var(--ink-tertiary)', fontSize: 'var(--text-2xs)' }}>
              {' '}
              / {metric.support}
            </span>
          ) : null}
        </span>
      </summary>

      <div
        style={{
          padding: '0 var(--space-3) var(--space-3) calc(var(--space-3) + 1rem)',
          display: 'grid',
          gap: 'var(--space-3)',
        }}
      >
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-secondary)', maxWidth: '76ch', margin: 0 }}>
          <strong>What this measures. </strong>
          {metric.definition}
        </p>

        {undefinedValue && metric.undefined_reason ? (
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--state-not-visible)', maxWidth: '76ch', margin: 0 }}>
            <strong>Undefined, not zero. </strong>
            {metric.undefined_reason}
          </p>
        ) : null}

        <ProvenanceGrid metric={metric} />
      </div>
    </details>
  );
}

function ProvenanceGrid({ metric }: { metric: MetricEntry }) {
  const p = metric.provenance;
  const rows: Array<[string, React.ReactNode]> = [
    ['Artifact', <span style={{ fontFamily: 'var(--font-mono)' }}>{p.artifact}</span>],
    ['Run', p.run_id || 'not recorded'],
    ['Model / binding', p.model || 'not recorded'],
    ['Configuration', p.configuration || 'not recorded'],
    ['Dataset', p.dataset || 'not recorded'],
    ['Split', p.split || 'not recorded'],
    [
      'Evaluated',
      p.evaluated_at ? (
        new Date(p.evaluated_at).toLocaleString()
      ) : (
        // Never a file modification date. The absence is the fact.
        <span style={{ color: 'var(--health-degraded)' }}>
          {p.timestamp_source === 'not_applicable'
            ? 'Not applicable — this is configuration, not an evaluation'
            : 'No evaluation date recorded in the artifact'}
        </span>
      ),
    ],
    ['Sample size', p.sample_size === null ? 'not recorded' : String(p.sample_size)],
    ['Raw value', metric.value === null ? 'undefined' : String(metric.value)],
  ];

  return (
    <div>
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'max-content 1fr',
          gap: '0.15rem var(--space-4)',
          fontSize: 'var(--text-2xs)',
          margin: 0,
        }}
      >
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'contents' }}>
            <dt style={{ color: 'var(--ink-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>
              {label}
            </dt>
            <dd style={{ margin: 0, color: 'var(--ink-secondary)', overflowWrap: 'anywhere' }}>{value}</dd>
          </div>
        ))}
      </dl>

      {p.limitations.length > 0 ? (
        <ul style={{ listStyle: 'none', display: 'grid', gap: 'var(--space-1)', marginTop: 'var(--space-3)' }}>
          {p.limitations.map((limitation) => (
            <li
              key={limitation}
              style={{
                fontSize: 'var(--text-2xs)',
                color: 'var(--ink-tertiary)',
                display: 'grid',
                gridTemplateColumns: '1rem 1fr',
                gap: 'var(--space-2)',
                maxWidth: '76ch',
              }}
            >
              <span aria-hidden="true">!</span>
              {limitation}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ConfusionTable({ confusion }: { confusion: Record<string, Record<string, number>> }) {
  const predicted = [...new Set(Object.values(confusion).flatMap((row) => Object.keys(row)))].sort();
  const truths = Object.keys(confusion).sort();

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)', marginBottom: 'var(--space-2)' }}>
        Confusion — rows are what the annotator recorded, columns are what the
        system answered. A number off the diagonal in the <code>not_visible</code>{' '}
        row is the system asserting something about a region a person could not read.
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
          <caption className="sr-only">
            Confusion matrix: annotated state by system answer
          </caption>
          <thead>
            <tr>
              <th style={cellStyle(true)} scope="col">
                truth \ answer
              </th>
              {predicted.map((column) => (
                <th key={column} style={cellStyle(true)} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {truths.map((truth) => (
              <tr key={truth}>
                <th style={cellStyle(true)} scope="row">
                  {truth}
                </th>
                {predicted.map((column) => {
                  const count = confusion[truth]?.[column] ?? 0;
                  const diagonal = truth === column;
                  const unsupported =
                    truth === 'not_visible' && (column === 'present' || column === 'absent');
                  return (
                    <td
                      key={column}
                      style={{
                        ...cellStyle(false),
                        fontFamily: 'var(--font-mono)',
                        fontVariantNumeric: 'tabular-nums',
                        textAlign: 'right',
                        // Colour is never the only signal: the diagonal is also
                        // bold and the unsupported cells carry a title.
                        color: count === 0
                          ? 'var(--ink-tertiary)'
                          : unsupported
                            ? 'var(--state-absent)'
                            : diagonal
                              ? 'var(--state-present)'
                              : 'var(--ink-primary)',
                        fontWeight: diagonal ? 'var(--weight-semibold)' : 'var(--weight-regular)',
                      }}
                      title={
                        unsupported
                          ? 'Unsupported claim: the annotator could not see this region and the system answered anyway.'
                          : undefined
                      }
                    >
                      {count}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function cellStyle(header: boolean): React.CSSProperties {
  return {
    border: '1px solid var(--line-subtle)',
    padding: '0.25rem 0.6rem',
    background: header ? 'var(--surface-sunken)' : 'transparent',
    color: header ? 'var(--ink-secondary)' : undefined,
    fontWeight: header ? 'var(--weight-medium)' : undefined,
    whiteSpace: 'nowrap',
  };
}

/* ── comparison ───────────────────────────────────────────────────────────── */

/**
 * Bars within one server-decided comparison set. Never a line, never across sets.
 *
 * A line implies measurements between the points. These are four discrete runs
 * with no cadence, and three of the four sets have no dates at all — so the
 * shape is a bar per run, labelled with the run's identity rather than a date
 * axis that would suggest a series.
 */
function ComparisonSection({
  sets,
  runs,
}: {
  sets: ComparisonSet[];
  runs: Map<string, EvaluationRun>;
}) {
  return (
    <section>
      <Card>
        <h2 style={{ fontSize: 'var(--text-lg)' }}>What may be compared</h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-secondary)', maxWidth: '76ch', marginTop: 'var(--space-2)' }}>
          Two evaluations belong on one axis only if their metric, model, dataset,
          split and configuration all agree. The server decides that; these groups
          are the answer. Runs in different groups are never charted together, and
          nothing here is drawn as a continuous line — a line would imply
          evaluations between the points that nobody ran.
        </p>
      </Card>

      <div style={{ display: 'grid', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
        {sets.map((set) => (
          <ComparisonCard key={set.key} set={set} runs={runs} />
        ))}
      </div>
    </section>
  );
}

function ComparisonCard({ set, runs }: { set: ComparisonSet; runs: Map<string, EvaluationRun> }) {
  // The headline metric of each run in this set, if every member has one of the
  // same kind. Chosen by kind rather than by position, so a set whose members
  // expose different metrics simply renders no bars.
  const points = set.run_ids
    .map((id) => {
      const run = runs.get(id);
      if (!run) return null;
      const metric = run.groups
        .flatMap((g) => g.metrics)
        .find((m) => m.kind === set.metric_kind && m.value !== null);
      return metric ? { run, metric } : null;
    })
    .filter((p): p is { run: EvaluationRun; metric: MetricEntry } => p !== null);

  // `points[0]` only after the length check, so the kind is read from a point
  // that exists rather than from an index TypeScript cannot prove is populated.
  const first = points[0];
  const chartable =
    set.comparable && points.length > 1 && first !== undefined && isProportion(first.metric.kind);
  const max = points.length ? Math.max(...points.map((p) => p.metric.value ?? 0)) : 0;

  return (
    <Card>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <h3 style={{ fontSize: 'var(--text-md)' }}>
            {METRIC_KIND_LABELS[set.metric_kind] ?? set.metric_kind}
          </h3>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-2)' }}>
            <Badge mono>{set.model || 'model not recorded'}</Badge>
            <Badge mono>{set.dataset || 'dataset not recorded'}</Badge>
            {set.configuration ? <Badge mono>{set.configuration}</Badge> : null}
          </div>
        </div>
        <StatusBadge tone={set.comparable ? 'online' : 'idle'}>
          {set.comparable ? 'Directly comparable' : 'Standalone snapshot'}
        </StatusBadge>
      </div>

      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)', maxWidth: '76ch', marginTop: 'var(--space-3)' }}>
        {set.why}
      </p>

      {chartable ? (
        <>
          <div
            style={{ marginTop: 'var(--space-4)', display: 'grid', gap: 'var(--space-2)' }}
            role="img"
            aria-label={`${METRIC_KIND_LABELS[set.metric_kind] ?? set.metric_kind} for ${points
              .map((p) => `${p.run.title}: ${formatMetric(p.metric)}`)
              .join('; ')}. Discrete runs, not a time series.`}
          >
            {points.map(({ run, metric }) => (
              <div
                key={run.run_id}
                style={{ display: 'grid', gridTemplateColumns: 'minmax(7rem, 12rem) 1fr auto', gap: 'var(--space-3)', alignItems: 'center' }}
              >
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {run.title}
                </span>
                <span style={{ height: '0.65rem', background: 'var(--surface-sunken)', borderRadius: '2px', overflow: 'hidden' }}>
                  <span
                    style={{
                      display: 'block',
                      height: '100%',
                      width: `${max > 0 ? ((metric.value ?? 0) / max) * 100 : 0}%`,
                      background: 'var(--accent)',
                    }}
                  />
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-xs)' }}>
                  {formatMetric(metric)}
                </span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-tertiary)', marginTop: 'var(--space-3)' }}>
            {set.dated
              ? 'Discrete evaluation runs, ordered as listed. Not continuous monitoring — bars, because there is no cadence to draw a line along.'
              : 'These runs record no evaluation dates. They compare configurations, not time, and are deliberately not plotted against a date axis.'}
          </p>
        </>
      ) : (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)', marginTop: 'var(--space-4)' }}>
          {set.run_ids.length === 1
            ? 'A single run. Shown on its own, because one point is a snapshot rather than a trend.'
            : 'No chart is drawn for this group: its runs do not share a single proportional metric.'}
        </p>
      )}
    </Card>
  );
}

/* ── datasets ─────────────────────────────────────────────────────────────── */

function DatasetSection({ coverages }: { coverages: DatasetCoverage[] }) {
  return (
    <section>
      <Card>
        <h2 style={{ fontSize: 'var(--text-lg)' }}>Dataset coverage</h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-secondary)', maxWidth: '76ch', marginTop: 'var(--space-2)' }}>
          What was labelled, how it splits, and — most importantly — what each
          manifest says it cannot measure. Those sentences are the dataset
          authors' own words and are shown beside the counts, not behind them.
        </p>
      </Card>

      <div style={{ display: 'grid', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
        {coverages.map((coverage) => (
          <Card key={coverage.artifact}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h3 style={{ fontSize: 'var(--text-md)' }}>{coverage.name}</h3>
              {coverage.status ? <Badge>{coverage.status}</Badge> : null}
            </div>

            {!coverage.available ? (
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--health-degraded)', marginTop: 'var(--space-3)', maxWidth: '76ch' }}>
                {coverage.reason}
              </p>
            ) : (
              <>
                <dl
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))',
                    gap: 'var(--space-4)',
                    marginTop: 'var(--space-4)',
                  }}
                >
                  {/* `null` renders as `—`: a dataset awaiting footage has no
                      frames, which is not the same as zero frames. */}
                  <Fact label="Frames">{coverage.frames ?? '—'}</Fact>
                  <Fact label="Annotated subjects">{coverage.subjects ?? '—'}</Fact>
                  <Fact label="Split by">{coverage.split_by || '—'}</Fact>
                  <Fact label="Annotation">{coverage.annotation_source || '—'}</Fact>
                </dl>

                {Object.keys(coverage.splits).length > 0 ? (
                  <div style={{ marginTop: 'var(--space-4)' }}>
                    <div style={{ fontSize: 'var(--text-2xs)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)', color: 'var(--ink-tertiary)' }}>
                      Splits
                    </div>
                    <ul style={{ listStyle: 'none', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-2)' }}>
                      {Object.entries(coverage.splits)
                        .filter(([key]) => key !== 'split_by')
                        .map(([name, members]) => (
                          <li key={name}>
                            <Badge mono>
                              {name}: {members.length === 0 ? 'empty' : members.join(', ')}
                            </Badge>
                          </li>
                        ))}
                    </ul>
                  </div>
                ) : null}

                {Object.keys(coverage.attribute_counts).length > 0 ? (
                  <div style={{ marginTop: 'var(--space-4)' }}>
                    <div style={{ fontSize: 'var(--text-2xs)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)', color: 'var(--ink-tertiary)' }}>
                      Label distribution
                    </div>
                    <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-tertiary)', maxWidth: '76ch', marginTop: 'var(--space-1)' }}>
                      A state with no examples here is why several precision and
                      recall figures above are undefined rather than zero.
                    </p>
                    <div style={{ display: 'grid', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                      {Object.entries(coverage.attribute_counts).map(([attribute, counts]) => (
                        <div key={attribute} style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'baseline' }}>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-secondary)', minWidth: '9rem' }}>
                            {attribute.replace('_', ' ')}
                          </span>
                          {Object.entries(counts).map(([state, count]) => (
                            <Badge key={state} mono>
                              {state}: {count}
                            </Badge>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}

            {coverage.limitations.length > 0 ? (
              <div
                style={{
                  marginTop: 'var(--space-4)',
                  padding: 'var(--space-4)',
                  border: '1px solid var(--health-degraded)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface-sunken)',
                }}
              >
                <div style={{ fontSize: 'var(--text-2xs)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)', color: 'var(--health-degraded)', fontWeight: 'var(--weight-semibold)' }}>
                  What this dataset cannot measure
                </div>
                <ul style={{ listStyle: 'none', display: 'grid', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                  {coverage.limitations.map((limitation) => (
                    <li key={limitation} style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-secondary)', maxWidth: '76ch' }}>
                      {limitation}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </section>
  );
}

/* ── configuration ────────────────────────────────────────────────────────── */

function ConfigurationSection({
  configuration,
}: {
  configuration: { available: boolean; reason: string; groups: MetricGroup[] };
}) {
  return (
    <section>
      <Card>
        <h2 style={{ fontSize: 'var(--text-lg)' }}>Configured thresholds</h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-secondary)', maxWidth: '76ch', marginTop: 'var(--space-2)' }}>
          Read from the policy documents the deployment actually uses. These are
          not measurements — they are the settings every figure above was produced
          under, and a metric computed at one confidence threshold does not
          describe behaviour at another.
        </p>
      </Card>

      {!configuration.available ? (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <UnavailableState title="No policy document could be read" body={configuration.reason} />
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
          {configuration.groups.map((group) => (
            <Card key={group.key}>
              <h3 style={{ fontSize: 'var(--text-md)' }}>{group.title}</h3>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)', marginTop: 'var(--space-1)', fontFamily: 'var(--font-mono)' }}>
                {group.key}
              </p>
              <ul style={{ listStyle: 'none', display: 'grid', gap: '1px', marginTop: 'var(--space-3)', background: 'var(--line-subtle)', border: '1px solid var(--line-subtle)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                {group.metrics.map((metric) => (
                  <li key={metric.key} style={{ background: 'var(--surface-raised)' }}>
                    <MetricRow metric={metric} />
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

/* ── artifacts and what is deliberately absent ────────────────────────────── */

function ArtifactSection({
  listing,
  loading,
  failed,
}: {
  listing: import('@shared/api/evaluation').ArtifactListing | null;
  loading: boolean;
  failed: boolean;
}) {
  return (
    <section>
      <Card>
        <h2 style={{ fontSize: 'var(--text-lg)' }}>Artifacts and access</h2>
        {loading ? <LoadingState label="Reading artifact list" /> : null}
        {failed ? (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--health-degraded)', marginTop: 'var(--space-3)' }}>
            The artifact listing could not be read. The evaluation figures above
            came from a separate request and are unaffected.
          </p>
        ) : null}

        {listing ? (
          <>
            <div style={{ display: 'grid', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
              {listing.families.map((family) => (
                <div key={family.key}>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)' }}>
                    {family.title}
                  </div>
                  <ul style={{ listStyle: 'none', display: 'grid', gap: 'var(--space-1)', marginTop: 'var(--space-2)' }}>
                    {family.runs.map((run) => (
                      <li
                        key={run.run_id}
                        style={{
                          display: 'flex',
                          gap: 'var(--space-3)',
                          flexWrap: 'wrap',
                          alignItems: 'baseline',
                          fontSize: 'var(--text-2xs)',
                          fontFamily: 'var(--font-mono)',
                          color: run.available ? 'var(--ink-secondary)' : 'var(--health-degraded)',
                        }}
                      >
                        <span>{run.available ? 'read' : 'unread'}</span>
                        <span style={{ overflowWrap: 'anywhere' }}>{run.artifact}</span>
                        <span style={{ color: 'var(--ink-tertiary)' }}>
                          {run.timestamp_source === 'artifact' ? 'dated' : 'undated'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Stated where somebody would look for it, rather than left as an
                unexplained absence. */}
            <div
              style={{
                marginTop: 'var(--space-5)',
                paddingTop: 'var(--space-4)',
                borderTop: '1px solid var(--line-subtle)',
                display: 'grid',
                gap: 'var(--space-4)',
              }}
            >
              <div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)' }}>
                  Dataset imagery
                </div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-secondary)', maxWidth: '76ch', marginTop: 'var(--space-1)' }}>
                  {listing.imagery_reason}
                </p>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)' }}>
                  Running an evaluation
                </div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-secondary)', maxWidth: '76ch', marginTop: 'var(--space-1)' }}>
                  {listing.run_evaluation_reason}
                </p>
              </div>
            </div>
          </>
        ) : null}
      </Card>
    </section>
  );
}

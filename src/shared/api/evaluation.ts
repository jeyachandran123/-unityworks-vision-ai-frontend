/**
 * Model evaluation artifacts.
 *
 * ### `value: null` means undefined, not zero
 *
 * The backend preserves a distinction the source artifacts make deliberately:
 * `experiments/vlm_prompt/score.py` reports `null` for a metric with no ground
 * truth to support it, "never `0.0` — a metric with no support is undefined, not
 * bad, and printing a number there would be inventing one". Every consumer must
 * render `null` as `—` with its `undefined_reason`, never as `0`.
 *
 * ### `provenance` is required on every metric
 *
 * Not optional and not a tooltip afterthought. A number without its dataset,
 * split, model and definition is a number nobody can act on, and the type makes
 * it impossible to receive one.
 *
 * ### Comparison sets, not a free-for-all
 *
 * The server decides which runs may share an axis and returns the partition.
 * A chart is drawn *within* a `ComparisonSet` and never across two, because two
 * runs on different models or corpora are two snapshots however similar their
 * numbers look.
 */

import { api } from './client';

/** What a number means. Never a label chosen for how it reads. */
export type MetricKind =
  | 'attribute_agreement'
  | 'precision'
  | 'recall'
  | 'f1'
  | 'accuracy_over_parsed'
  | 'unsupported_claims'
  | 'detection_count'
  | 'latency_ms'
  | 'throughput_fps'
  | 'count'
  | 'ratio'
  | 'pinned_count'
  | 'configured_threshold';

/** `undated` is its own state — an artifact with no date is not an old one. */
export type Freshness = 'undated' | 'recent' | 'ageing' | 'stale';

export interface Provenance {
  /** Repository-relative. Never an absolute path. */
  artifact: string;
  source: string;
  run_id: string;
  model: string;
  configuration: string;
  dataset: string;
  split: string;
  /** Read from inside the artifact. `null` when the artifact records none. */
  evaluated_at: string | null;
  /** `artifact`, `absent`, or `not_applicable`. Rendered, never hidden. */
  timestamp_source: string;
  sample_size: number | null;
  /** What the artifact itself says limits its interpretation, verbatim. */
  limitations: string[];
}

export interface MetricEntry {
  key: string;
  label: string;
  kind: MetricKind;
  /** `null` is undefined. Render `—` and the reason, never `0`. */
  value: number | null;
  /** One sentence stating exactly what this measures. Always present. */
  definition: string;
  undefined_reason: string;
  unit: string;
  support: number | null;
  provenance: Provenance;
}

export interface MetricGroup {
  key: string;
  title: string;
  description: string;
  metrics: MetricEntry[];
  /** `{truth: {predicted: count}}`, when the artifact has one. */
  confusion: Record<string, Record<string, number>> | null;
}

export interface ComparabilityKey {
  metric_kind: string;
  model: string;
  dataset: string;
  split: string;
  configuration: string;
}

export interface EvaluationRun {
  run_id: string;
  title: string;
  summary: string;
  source: string;
  /** Branch on this before anything else, as everywhere else in this product. */
  available: boolean;
  reason: string;
  completeness: 'complete' | 'partial' | string;
  freshness: Freshness;
  provenance: Provenance;
  comparability: ComparabilityKey;
  groups: MetricGroup[];
}

export interface ArtifactFamily {
  key: string;
  title: string;
  description: string;
  available: boolean;
  reason: string;
  runs: EvaluationRun[];
  expected_artifacts: string[];
}

export interface DatasetCoverage {
  name: string;
  artifact: string;
  /** `null` when the manifest records none — not zero. */
  frames: number | null;
  subjects: number | null;
  splits: Record<string, string[]>;
  split_by: string;
  attribute_counts: Record<string, Record<string, number>>;
  status: string;
  /** The manifest's own words about what it cannot measure. */
  limitations: string[];
  annotation_source: string;
  available: boolean;
  reason: string;
}

export interface ComparisonSet {
  key: string;
  metric_kind: string;
  model: string;
  dataset: string;
  split: string;
  configuration: string;
  run_ids: string[];
  /** False for a single run, or one whose configuration was never recorded. */
  comparable: boolean;
  /** Whether every member carries a real evaluation date. */
  dated: boolean;
  /** Why these are grouped, in the server's words. */
  why: string;
}

export interface EvaluationSummary {
  families: ArtifactFamily[];
  datasets: DatasetCoverage[];
  configuration: { available: boolean; reason: string; groups: MetricGroup[] };
  comparison_sets: ComparisonSet[];
  totals: {
    families: number;
    families_available: number;
    runs: number;
    runs_available: number;
    runs_dated: number;
    runs_undated: number;
  };
  latest_evaluation_at: string | null;
  /** Always `null`. The reason travels with it. */
  headline_metric: number | null;
  headline_reason: string;
  tenant_id: string;
}

export interface ArtifactListing {
  families: Array<{
    key: string;
    title: string;
    available: boolean;
    reason: string;
    expected_artifacts: string[];
    runs: Array<{
      run_id: string;
      available: boolean;
      reason: string;
      artifact: string;
      timestamp_source: string;
      freshness: Freshness;
    }>;
  }>;
  imagery_available: boolean;
  imagery_reason: string;
  run_evaluation_available: boolean;
  run_evaluation_reason: string;
}

export const evaluationApi = {
  summary: () => api.get<EvaluationSummary>('/evaluation'),
  run: (id: string) => api.get<EvaluationRun>(`/evaluation/runs/${encodeURIComponent(id)}`),
  artifacts: () => api.get<ArtifactListing>('/evaluation/artifacts'),
};

/** Human labels for metric kinds. The only place a kind becomes display text. */
export const METRIC_KIND_LABELS: Record<string, string> = {
  attribute_agreement: 'Attribute agreement',
  precision: 'Precision',
  recall: 'Recall',
  f1: 'F1',
  accuracy_over_parsed: 'Accuracy over parsed',
  unsupported_claims: 'Unsupported claims',
  detection_count: 'Detection count',
  latency_ms: 'Latency',
  throughput_fps: 'Throughput',
  count: 'Count',
  ratio: 'Ratio',
  pinned_count: 'Pinned count',
  configured_threshold: 'Configured threshold',
};

/** Kinds whose value is a 0–1 proportion and reads best as a percentage. */
const PROPORTIONS = new Set<MetricKind>([
  'attribute_agreement',
  'precision',
  'recall',
  'f1',
  'accuracy_over_parsed',
  'ratio',
]);

export function isProportion(kind: MetricKind): boolean {
  return PROPORTIONS.has(kind);
}

/**
 * A metric's value as text. `null` becomes `—`, never `0`.
 *
 * Proportions are shown to one decimal place with the raw value available in
 * the provenance panel: 23.3% is what a reader compares, and 0.23255813953488372
 * is what they check.
 */
export function formatMetric(metric: MetricEntry): string {
  if (metric.value === null || metric.value === undefined) return '—';
  if (isProportion(metric.kind)) return `${(metric.value * 100).toFixed(1)}%`;
  if (metric.unit === 'ms') return `${Math.round(metric.value).toLocaleString()} ms`;
  if (metric.unit) return `${metric.value.toLocaleString()} ${metric.unit}`;
  return metric.value.toLocaleString();
}

/** How a freshness state should read. `undated` is not "old". */
export const FRESHNESS_LABELS: Record<Freshness, string> = {
  undated: 'No evaluation date recorded',
  recent: 'Evaluated recently',
  ageing: 'Evaluated a while ago',
  stale: 'Evaluated long ago',
};

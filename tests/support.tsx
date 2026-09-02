/**
 * Test harness.
 *
 * Renders the real application — real providers, real router, real guards, real
 * API client — against a stubbed `fetch`. Nothing here mocks a component or a
 * hook, because the properties under test (guards, single-flight refresh, lazy
 * loading, four-state rendering) only exist when the real ones run.
 */

import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { render, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@app/auth/AuthProvider';
import { ConnectionProvider } from '@shared/realtime/useConnection';
import { ToastProvider } from '@shared/ui/primitives';
import type { Identity } from '@shared/api/services';
// The evaluation fixtures are annotated with the real API types rather than
// left to inference. A fixture that drifts from the contract would let a test
// pass against a payload the backend cannot produce.
import type {
  ArtifactListing,
  EvaluationSummary,
  MetricEntry,
} from '@shared/api/evaluation';

/** Must equal the backend's `FIXTURE_OBSERVATION_COUNT`. */
export const FIXTURE_OBSERVATION_COUNT = 6;

export function identity(overrides: Partial<Identity> = {}): Identity {
  return {
    subject: 'developer@example.com',
    display_name: 'Dev User',
    tenant_id: 'org-test',
    roles: ['developer'],
    // Exactly `permissions_for({developer})` on the backend. A fixture that
    // grants more than the role does turns every guard test into a tautology.
    permissions: [
      'access_devtools',
      'register_demand',
      'view_camera_health',
      'view_cameras',
      'view_evidence',
      'view_incidents',
      'view_live',
      // The role the evaluation dashboard is actually for.
      'view_model_evaluation',
      'view_observations',
    ],
    camera_scope: { breadth: 'listed', camera_ids: ['cam-fixture-01'] },
    site_ids: ['site-fixture'],
    ...overrides,
  };
}

export const managerIdentity = (): Identity =>
  identity({
    subject: 'manager@example.com',
    display_name: 'Manager',
    roles: ['restaurant_manager'],
    // `permissions_for({restaurant_manager})`. May resolve an incident; may not
    // configure a camera, delete evidence or read the audit trail.
    permissions: [
      'acknowledge_incidents',
      'resolve_incidents',
      'view_camera_health',
      'view_cameras',
      // Operational reads for the site they run. No view_demography: inferring
      // age or gender is a separate purpose and is not inherited by running a
      // restaurant.
      'view_cutting_board',
      'view_evidence',
      'view_incidents',
      'view_live',
      'view_meal_detection',
      'view_observations',
      'view_people_count',
      'view_reports',
      'view_table_occupancy',
      'view_users',
      'export_reports',
    ],
  });

export const supervisorIdentity = (): Identity =>
  identity({
    subject: 'supervisor@example.com',
    display_name: 'Supervisor',
    roles: ['kitchen_supervisor'],
    // No view_evidence: the role most likely to be a shared kitchen screen.
    // May acknowledge an incident but not resolve one.
    permissions: [
      'acknowledge_incidents',
      'view_camera_health',
      'view_cameras',
      // Board compliance is this role's actual job. It is the only new module
      // that belongs on a screen anyone in the kitchen can see.
      'view_cutting_board',
      'view_incidents',
      'view_live',
      'view_observations',
      // Reads a report on screen; deliberately no export. The kitchen screen is
      // shared, and a downloaded file is not.
      'view_reports',
    ],
  });

export const auditorIdentity = (): Identity =>
  identity({
    subject: 'auditor@example.com',
    display_name: 'Auditor',
    roles: ['auditor'],
    // The narrowest interesting role: reads the trail, reads evidence, and can
    // change nothing at all.
    // Reads the food-safety record, which now includes board usage. Not the
    // commercial modules: footfall, demography, dish detection and POS are
    // business analytics, and this role's basis does not reach a company's sales.
    permissions: [
      'export_reports',
      'view_audit',
      'view_cutting_board',
      'view_evidence',
      'view_incidents',
      'view_observations',
      'view_reports',
    ],
  });

export const adminIdentity = (): Identity =>
  identity({
    subject: 'admin@example.com',
    display_name: 'Org Admin',
    roles: ['org_admin'],
    permissions: [
      'acknowledge_incidents',
      'delete_evidence',
      'manage_cameras',
      'manage_cutting_board',
      'manage_organization',
      'manage_pos_integration',
      'manage_table_occupancy',
      'manage_users',
      'register_demand',
      'resolve_incidents',
      'view_audit',
      'view_camera_health',
      'view_cameras',
      'view_cutting_board',
      'view_demography',
      'view_evidence',
      'view_incidents',
      'view_live',
      'view_meal_detection',
      // No `view_model_evaluation`. Removed from ORG_ADMIN on the backend in
      // Stage 3: evaluation artifacts answer a shipping question, and the
      // accountability this role has for what the system claims is served by
      // reports, which carry coverage and the ruleset version behind every
      // figure. Holders are now super_admin and developer.
      'view_observations',
      // Reads that patron identification exists and is blocked. Deliberately
      // NOT manage_patron_id, which super_admin alone holds.
      'view_patron_id',
      'view_people_count',
      'view_pos_integration',
      'view_reports',
      'view_table_occupancy',
      'view_users',
      'export_reports',
    ],
    camera_scope: { breadth: 'all_in_tenant', camera_ids: [] },
  });

function attribute(key: string, value: string) {
  return {
    key,
    value,
    observed_at: 1_000_000_000,
    valid_until: 121_000_000_000,
    confidence: { value: 0.9, semantics: 'self_reported', calibrated: false },
  };
}

function fixtureObject(id: string, head: string, hand: string) {
  return {
    object_id: id,
    camera_id: 'cam-fixture-01',
    class_id: 'person',
    lifecycle: 'active',
    first_seen: 1_000_000_000,
    last_seen: 2_000_000_000,
    observation_count: 2,
    attributes: [attribute('head_covering', head), attribute('hand_covering', hand)],
  };
}

/**
 * The DevTools state payload, matching the backend fixture exactly.
 *
 * Three subjects: compliant, observed-absent, and refused. A fixture where
 * everything is compliant would let a UI that cannot draw NOT_VISIBLE pass its
 * own smoke test.
 */
export function fixtureState() {
  return {
    kind: 'fixture',
    session_id: 'fixture-kitchen-01',
    observation_count: FIXTURE_OBSERVATION_COUNT,
    complete: true,
    partitions: [{ camera_id: 'cam-fixture-01', object_count: 3 }],
    objects: [
      fixtureObject('obj-fixture-1', 'hairnet', 'gloves'),
      fixtureObject('obj-fixture-2', 'none', 'gloves'),
      fixtureObject('obj-fixture-3', 'hairnet', 'not_visible'),
    ],
  };
}

/** A wall with no cameras. The honest default for a stubbed backend. */
export function emptyWall() {
  return {
    cameras: [],
    total: 0,
    live: 0,
    wall: { cameras: 0, by_state: {}, live: 0, viewers: 0 },
    default_wall_fps: 4,
    default_detail_fps: 12,
  };
}

/** One camera on the wall, in whatever state a test needs. */
export function wallCamera(overrides: Record<string, unknown> = {}) {
  return {
    camera_id: 'cam-01',
    name: 'Channel 01',
    channel: 1,
    stream_type: 'main',
    enabled: true,
    state: 'live',
    width: 1920,
    height: 1080,
    viewers: 0,
    reconnects: 0,
    frames_decoded: 120,
    seconds_since_frame: 0.2,
    first_frame_latency_s: 2.4,
    last_error: '',
    purpose: 'live monitoring',
    ...overrides,
  };
}

export function emptyLiveRuntime() {
  return {
    runtime: {
      enabled: false,
      reason: 'FEATURE_LIVE_CCTV is off; no camera session will start',
      active_sessions: 0,
      streaming_sessions: 0,
      streaming: false,
    },
    sessions: [],
    cameras_configured: [],
    backpressure: { policy: 'drop-oldest', rationale: 'newest frame is the valuable one' },
  };
}

/** A running REPLAY source. Never labelled live. */
export function replayLiveRuntime() {
  return {
    runtime: {
      enabled: true,
      reason: '',
      active_sessions: 1,
      streaming_sessions: 1,
      streaming: true,
    },
    sessions: [
      {
        session_id: 'sess-replay-1',
        kind: 'replay',
        camera_id: 'cam-01',
        tenant_id: 'org-test',
        state: 'running',
        streaming: true,
        seekable: false,
        bounded: true,
        analysis_fps: 4,
        error: '',
        source: {
          camera_id: 'cam-01',
          kind: 'replay',
          state: 'running',
          health: 'online',
          uri: 'file://kitchen.mp4',
          epoch: 0,
          frames_produced: 120,
          reconnects: 0,
          errors: 0,
          last_error: '',
          producing: true,
          stale: false,
          transitions: [],
        },
        queue: {
          capacity: 8,
          depth: 2,
          high_water: 8,
          accepted: 120,
          dropped_total: 37,
          dropped_queue_full: 5,
          dropped_sampled: 32,
          dropped_shutdown: 0,
        },
        stats: {
          frames_received: 157,
          frames_processed: 118,
          frames_dropped: 37,
          processing_errors: 0,
          mean_processing_ms: 4.2,
        },
      },
    ],
    cameras_configured: [],
    backpressure: { policy: 'drop-oldest', rationale: 'newest frame is the valuable one' },
  };
}

/**
 * The report catalogue, matching `GET /api/v1/reports/types`.
 *
 * Five reports backed by real stores and seven for modules with no data source.
 * The unconnected ones are present on purpose: a catalogue that omitted them
 * would let their absence read as "nothing to report", which is the confusion
 * this whole product is built to prevent.
 */
export function reportCatalogue(overrides: Record<string, unknown> = {}) {
  const data = [
    ['incident_summary', 'Incident summary', ['view_reports', 'view_incidents']],
    ['hygiene_observations', 'Hygiene observations', ['view_reports', 'view_observations']],
    ['camera_estate', 'Camera estate and zone history', ['view_reports', 'view_cameras']],
    ['audit_activity', 'Audit activity', ['view_reports', 'view_audit']],
    ['operations_overview', 'Operations overview', ['view_reports', 'view_incidents']],
  ] as const;
  const modules = [
    ['module_people_counting', 'People counting', 'people_counting'],
    ['module_demography', 'Demography', 'demography'],
    ['module_table_occupancy', 'Table occupancy', 'table_occupancy'],
    ['module_cutting_board', 'Cutting board compliance', 'cutting_board'],
    ['module_meal_detection', 'Meal detection', 'meal_detection'],
    ['module_pos_integration', 'POS / ERP integration', 'pos_integration'],
    ['module_patron_id', 'Unique patron ID', 'patron_id'],
  ] as const;

  return {
    reports: [
      ...data.map(([id, title, requires]) => ({
        id,
        title,
        summary: `${title} over the selected period.`,
        granularities: id === 'incident_summary' ? ['total', 'day', 'week', 'month'] : ['total'],
        requires: [...requires],
        permitted: true,
        kind: 'data',
        capability_module: '',
      })),
      ...modules.map(([id, title, module]) => ({
        id,
        title,
        summary: `${title} has no data source yet.`,
        granularities: ['total'],
        requires: ['view_reports'],
        permitted: true,
        kind: 'capability',
        capability_module: module,
      })),
    ],
    count: data.length + modules.length,
    can_export: true,
    formats: {
      json: { available: true, reason: '' },
      csv: { available: true, reason: '' },
      xlsx: { available: true, reason: '' },
      pdf: { available: true, reason: '' },
    },
    max_window_days: 366,
    ...overrides,
  };
}

/**
 * A generated report, matching `GET /api/v1/reports/{id}`.
 *
 * Complete by default with one populated and one empty section, because the
 * empty section is what proves a page renders `empty_note` rather than a bare
 * header row. A capability report carries the module's blocked state instead.
 */
export function reportPayload(id: string, overrides: Record<string, unknown> = {}) {
  const capability = id.startsWith('module_');
  return {
    report_id: id,
    title: capability ? 'Unique patron ID' : 'Incident summary',
    subtitle: 'What this report covers.',
    coverage: {
      since: '2026-08-01T00:00:00+00:00',
      until: '2026-09-01T00:00:00+00:00',
      timezone: 'Asia/Singapore',
      timezone_resolved: true,
      granularity: 'total',
      complete: !capability,
      basis: 'Rows in the durable incident store.',
      sources: capability
        ? [
            {
              source: 'patron_id',
              available: false,
              reason: 'Blocked pending legal review.',
              rows: 0,
              truncated: false,
              earliest: null,
            },
          ]
        : [
            {
              source: 'incidents',
              available: true,
              reason: '',
              rows: 2,
              truncated: false,
              earliest: null,
            },
          ],
      gaps: capability
        ? [{ kind: 'source_unavailable', detail: 'Blocked pending legal review.', since: null, until: null }]
        : [],
    },
    sections: [
      {
        key: 'populated',
        title: 'Incidents by period',
        columns: [
          { key: 'period', header: 'Period', numeric: false },
          { key: 'raised', header: 'Raised', numeric: true },
        ],
        rows: [{ period: '2026-08', raised: 2 }],
        empty_note: 'No incident was raised in this period.',
        note: 'Bucketed on when the incident was raised.',
      },
      {
        key: 'empty',
        title: 'By zone',
        columns: [
          { key: 'zone', header: 'Zone', numeric: false },
          { key: 'count', header: 'Incidents', numeric: true },
        ],
        rows: [],
        empty_note: 'No incident was raised in this period, so there is nothing to break down.',
        note: 'The zone recorded on the incident when it was raised.',
      },
    ],
    capability_state: capability ? 'blocked' : '',
    capability_reason: capability ? 'Blocked pending legal review.' : '',
    awaiting: capability ? [{ id: 'legal_review', detail: 'A completed DPIA.' }] : [],
    generated_at: '2026-09-02T00:00:00+00:00',
    ...overrides,
  };
}

/**
 * One metric with full provenance, matching `app/evaluation/model.py`.
 *
 * Provenance is mandatory in the backend type, so it is mandatory here: a
 * fixture that omitted it would let a test pass against a payload the real API
 * cannot produce.
 */
export function metric(overrides: Partial<MetricEntry> = {}): MetricEntry {
  return {
    key: 'head_covering.agreement',
    label: 'Attribute agreement',
    kind: 'attribute_agreement',
    value: 0.23255813953488372,
    definition:
      'Correct answers divided by matched subjects, for this one attribute, against human annotation on this split. Not overall model accuracy and not a compliance pass rate.',
    undefined_reason: '',
    unit: '',
    support: 43,
    provenance: {
      artifact: 'datasets/kitchen-01/results/baseline.json',
      source: 'ppe_evaluation',
      run_id: 'baseline',
      model: 'nvidia (understander.nvidia_vl)',
      configuration: 'kitchen-safety.example.json / nvidia (understander.nvidia_vl)',
      dataset: 'kitchen-01',
      split: 'test',
      // Undated on purpose: the real PPE reports carry no timestamp, and that
      // is the interesting case.
      evaluated_at: null,
      timestamp_source: 'absent',
      sample_size: 43,
      limitations: [
        'This report records no evaluation date.',
        'kitchen-01 annotates only detector proposals, so it cannot measure detection recall.',
      ],
    },
    ...overrides,
  };
}

/**
 * The evaluation summary, matching `GET /api/v1/evaluation`.
 *
 * Deliberately mixed: one undated family, one dated family, one undefined
 * metric and two comparison sets that must never merge. A uniform fixture would
 * let a page that flattened all of those pass.
 */
export function evaluationSummary(overrides: Partial<EvaluationSummary> = {}): EvaluationSummary {
  return {
    families: [
      {
        key: 'ppe_evaluation',
        title: 'PPE attribute evaluation',
        description: 'Offline evaluation against the human-annotated kitchen-01 split.',
        available: true,
        reason: '',
        expected_artifacts: ['datasets/kitchen-01/results/baseline.json'],
        runs: [
          {
            run_id: 'baseline',
            title: 'Baseline',
            summary: 'The shipped configuration at the time.',
            source: 'ppe_evaluation',
            available: true,
            reason: '',
            completeness: 'complete',
            freshness: 'undated',
            provenance: metric().provenance,
            comparability: {
              metric_kind: 'attribute_agreement',
              model: 'nvidia (understander.nvidia_vl)',
              dataset: 'kitchen-01',
              split: 'test',
              configuration: 'kitchen-safety.example.json',
            },
            groups: [
              {
                key: 'head_covering',
                title: 'Head covering',
                description: 'Agreement against human annotation.',
                metrics: [
                  metric(),
                  metric({
                    key: 'head_covering.absent.recall',
                    label: 'absent recall',
                    kind: 'recall',
                    value: null,
                    support: 0,
                    definition:
                      "Of the subjects that truly were 'absent', the share the system found.",
                    undefined_reason:
                      'No annotated example of this state exists in the split, so the metric has no denominator. Undefined, not zero.',
                  }),
                ],
                confusion: {
                  present: { present: 8, absent: 20 },
                  not_visible: { absent: 11, not_visible: 2 },
                },
              },
            ],
          },
        ],
      },
      {
        key: 'vlm_prompt',
        title: 'VLM prompt experiments',
        description: 'Recorded prompt variants scored against one corpus.',
        available: true,
        reason: '',
        expected_artifacts: ['experiments/vlm_prompt/runs/scores.json'],
        runs: [
          {
            run_id: 'variant_A',
            title: 'Variant A',
            summary: 'Production baseline.',
            source: 'vlm_prompt',
            available: true,
            reason: '',
            completeness: 'complete',
            freshness: 'recent',
            provenance: {
              ...metric().provenance,
              artifact: 'experiments/vlm_prompt/runs/scores.json',
              source: 'vlm_prompt',
              run_id: 'variant_A',
              model: 'meta/llama-3.2-11b-vision-instruct',
              evaluated_at: '2026-08-27T07:49:39+00:00',
              timestamp_source: 'artifact',
            },
            comparability: {
              metric_kind: 'accuracy_over_parsed',
              model: 'meta/llama-3.2-11b-vision-instruct',
              dataset: 'kitchen-01',
              split: 'test',
              configuration: 'corpus:bbe9e0559523b9b0',
            },
            groups: [
              {
                key: 'ungated',
                title: 'Ungated',
                description: 'Every subject reaches the model.',
                metrics: [
                  metric({
                    key: 'ungated.accuracy_over_parsed',
                    label: 'Accuracy over parsed',
                    kind: 'accuracy_over_parsed',
                    value: 0.6341463414634146,
                    definition:
                      'Agreement with human annotation over the responses that parsed. The experiment own name for this figure.',
                  }),
                ],
                confusion: null,
              },
            ],
          },
        ],
      },
    ],
    datasets: [
      {
        name: 'kitchen-01',
        artifact: 'datasets/kitchen-01/dataset.json',
        frames: 15,
        subjects: 43,
        splits: { train: [], validation: [], test: ['kitchen-01'] },
        split_by: 'video_id',
        attribute_counts: { head_covering: { present: 30, not_visible: 13 } },
        status: '',
        limitations: [
          'Boxes are detector proposals visually confirmed to be real people. This dataset CANNOT measure detection recall.',
        ],
        annotation_source: 'human_visual_inspection',
        available: true,
        reason: '',
      },
      {
        name: 'vision-phase5',
        artifact: 'datasets/vision-phase5/manifest.json',
        // No counts, not zero counts: this set is awaiting footage.
        frames: null,
        subjects: null,
        splits: {},
        split_by: '',
        attribute_counts: {},
        status: 'AWAITING FOOTAGE',
        limitations: ['Measure whether a reported PPE violation is real.'],
        annotation_source: 'human_visual_inspection',
        available: true,
        reason: 'AWAITING FOOTAGE',
      },
    ],
    configuration: {
      available: true,
      reason: '',
      groups: [
        {
          key: 'config/policies/kitchen-safety.example.json',
          title: 'kitchen-safety v2.1.0',
          description: 'Thresholds the deployment is configured with.',
          metrics: [
            metric({
              key: 'scope.min_confidence',
              label: 'Minimum detection confidence',
              kind: 'configured_threshold',
              value: 0.4,
              support: null,
              definition:
                'Detections below this score are not considered for attribute evaluation at all.',
              provenance: {
                ...metric().provenance,
                artifact: 'config/policies/kitchen-safety.example.json',
                source: 'policy_configuration',
                timestamp_source: 'not_applicable',
              },
            }),
          ],
          confusion: null,
        },
      ],
    },
    comparison_sets: [
      {
        key: 'ppe',
        metric_kind: 'attribute_agreement',
        model: 'nvidia (understander.nvidia_vl)',
        dataset: 'kitchen-01',
        split: 'test',
        configuration: 'kitchen-safety.example.json',
        run_ids: ['baseline'],
        comparable: false,
        dated: false,
        why: 'The only run with this combination. A single point is a snapshot, not a trend.',
      },
      {
        key: 'vlm',
        metric_kind: 'accuracy_over_parsed',
        model: 'meta/llama-3.2-11b-vision-instruct',
        dataset: 'kitchen-01',
        split: 'test',
        configuration: 'corpus:bbe9e0559523b9b0',
        run_ids: ['variant_A'],
        comparable: false,
        dated: true,
        why: 'The only run with this combination. A single point is a snapshot, not a trend.',
      },
    ],
    totals: {
      families: 2,
      families_available: 2,
      runs: 2,
      runs_available: 2,
      runs_dated: 1,
      runs_undated: 1,
    },
    latest_evaluation_at: '2026-08-27T07:49:39+00:00',
    headline_metric: null,
    headline_reason:
      'No single figure summarises these artifacts. Any combined score would be a number with no definition.',
    tenant_id: 'org-test',
    ...overrides,
  };
}

export function evaluationArtifacts(overrides: Partial<ArtifactListing> = {}): ArtifactListing {
  return {
    families: [
      {
        key: 'ppe_evaluation',
        title: 'PPE attribute evaluation',
        available: true,
        reason: '',
        expected_artifacts: ['datasets/kitchen-01/results/baseline.json'],
        runs: [
          {
            run_id: 'baseline',
            available: true,
            reason: '',
            artifact: 'datasets/kitchen-01/results/baseline.json',
            timestamp_source: 'absent',
            freshness: 'undated',
          },
        ],
      },
    ],
    imagery_available: false,
    imagery_reason:
      'Dataset frames and evaluation crops exist on disk and are deliberately not reachable through this API.',
    run_evaluation_available: false,
    run_evaluation_reason:
      'No evaluation harness in this repository can be invoked with bounded parameters without either a paid network dependency or overwriting a historical artifact.',
    ...overrides,
  };
}

/** Path fragment → module id, longest first so `/patron-id/gate` never wins. */
const MODULE_BY_PATH: ReadonlyArray<readonly [string, string]> = [
  ['/modules/people-counting', 'people_counting'],
  ['/modules/demography', 'demography'],
  ['/modules/table-occupancy', 'table_occupancy'],
  ['/modules/cutting-board', 'cutting_board'],
  ['/modules/meal-detection', 'meal_detection'],
  ['/modules/pos-integration', 'pos_integration'],
  ['/modules/patron-id', 'patron_id'],
];

/**
 * The honest not-connected shape, matching `app/api/capability.py`.
 *
 * `available` is false and `stored_records` is zero for every module, which is
 * exactly what the real backend returns today. The per-module extras below are
 * the fields each route genuinely adds — the four reading states, the six table
 * states, the schema guarantees — so a test asserting on them is asserting on a
 * real contract rather than on a fixture somebody invented.
 */
export function moduleCapability(module: string, overrides: Record<string, unknown> = {}) {
  const extra: Record<string, Record<string, unknown>> = {
    demography: {
      aggregate_only: true,
      aggregate_only_detail:
        'demography_snapshots has no object_id, track_id or evidence reference.',
    },
    table_occupancy: {
      states: ['vacant', 'occupied', 'needs_cleaning', 'out_of_service', 'not_visible', 'unknown'],
    },
    cutting_board: { reading_states: ['present', 'absent', 'not_visible', 'unknown'] },
    meal_detection: {
      reconciliation_states: ['unreconciled', 'matched', 'unmatched', 'not_applicable'],
    },
    pos_integration: {
      adapter: {
        bound: true,
        id: 'pos.not_configured',
        vendor: '',
        display_name: 'No POS adapter bound',
        available: false,
        reason: 'No point-of-sale adapter is bound.',
        capabilities: [],
      },
      write_available: false,
      write_unavailable_reason: 'No vendor has been chosen.',
    },
    patron_id: {
      gate: { available: false, reason: 'blocked', missing: ['legal_review'] },
      schema_guarantees: [
        'patron_tokens.token_hash is String(64) — a hex SHA-256 digest fits, a biometric template does not.',
        'patron_tokens has no binary column.',
      ],
      write_available: false,
      write_unavailable_reason: 'No route accepts a patron token.',
    },
  };

  return {
    module,
    title: module === 'patron_id' ? 'Unique Patron ID' : 'Module',
    purpose: `What ${module} would report if it were connected.`,
    available: false,
    state: module === 'patron_id' ? 'blocked' : 'not_configured',
    reason: `No source is bound for ${module}.`,
    awaiting: [{ id: 'a_real_input', detail: 'A specific real-world input, named.' }],
    storage_ready: true,
    tables: [`${module}_rows`],
    stored_records: 0,
    records_by_table: {},
    documentation: 'docs/architecture/NOT_YET_CONNECTED.md',
    ...(extra[module] ?? {}),
    ...overrides,
  };
}

export interface StubOptions {
  /** Overrides the camera block on /status. */
  cameras?: unknown;
  /** Overrides the live_runtime block on /status. */
  runtime?: unknown;
  /** Overrides /devtools/live. */
  live?: unknown;
  /** Overrides /wall/cameras. */
  wall?: unknown;
  /** Overrides /observations. */
  observations?: unknown;
  /** Overrides /restaurants. */
  restaurants?: unknown;
  /** Overrides /users. */
  users?: unknown;
  /**
   * Overrides a module capability route, keyed by module id — e.g.
   * `{ patron_id: { ...} }`. The default is the real not-connected shape, so a
   * page that fabricated a reading from it would fail rather than look plausible.
   */
  modules?: Record<string, unknown>;
  /** Overrides /pos-connectors. */
  posConnectors?: unknown;
  /** Overrides /reports/types. */
  reportTypes?: unknown;
  /** Overrides /evaluation. */
  evaluation?: unknown;
  /** Overrides /evaluation/artifacts. */
  evaluationArtifacts?: unknown;
  /**
   * Overrides a generated report, keyed by report id. The default is a real
   * report shape with a complete window — a test that wants an incomplete one
   * says so, because that is the interesting case.
   */
  reports?: Record<string, unknown>;
  /** `null` makes /auth/refresh 401 — i.e. no existing session. */
  session?: Identity | null;
  /** Envelope code returned by /auth/login. */
  loginFailure?: string;
  /** Extra `pathSuffix → payload` overrides, checked before the defaults. */
  routes?: Record<string, unknown>;
  /** Every call is appended here, for assertions. */
  calls?: string[];
  /** Fails the first N /auth/refresh calls with a network error. */
  refreshNetworkFailures?: number;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'req-test' },
  });
}

function envelope(code: string, status: number): Response {
  return jsonResponse(
    { code, message: `error: ${code}`, retryable: false, details: {}, request_id: 'req-test' },
    status,
  );
}

export function stubFetch(options: StubOptions = {}) {
  const { session = identity(), routes = {}, calls = [] } = options;
  let networkFailures = options.refreshNetworkFailures ?? 0;

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url}`);

    if (url.includes('/auth/refresh')) {
      if (networkFailures > 0) {
        networkFailures -= 1;
        throw new TypeError('network failure');
      }
      return session
        ? jsonResponse({ access_token: 'access-1', token_type: 'bearer', expires_at: '', user: session })
        : envelope('UNAUTHENTICATED', 401);
    }

    if (url.includes('/auth/login')) {
      if (options.loginFailure) return envelope(options.loginFailure, 401);
      return jsonResponse({
        access_token: 'access-1',
        token_type: 'bearer',
        expires_at: '',
        user: session ?? identity(),
      });
    }

    if (url.includes('/auth/logout')) return jsonResponse({ ok: true });

    if (url.includes('/auth/me')) {
      return session ? jsonResponse(session) : envelope('UNAUTHENTICATED', 401);
    }

    for (const [path, payload] of Object.entries(routes)) {
      if (url.includes(path)) {
        return payload instanceof Response ? payload : jsonResponse(payload);
      }
    }

    if (url.includes('/status')) {
      return jsonResponse({
        service: { ok: true },
        vision_os: { assembled: false, reason: 'VISION_AUTOSTART is false', attributes: [], policies: [] },
        tenant_id: 'org-test',
        cameras: options.cameras ?? {
          configured: 0,
          sessions: 0,
          streaming: 0,
          health: [],
        },
        live_runtime: options.runtime ?? {
          enabled: false,
          reason: 'FEATURE_LIVE_CCTV is off; no camera session will start',
          active_sessions: 0,
          streaming_sessions: 0,
          streaming: false,
        },
        cameras_registered: 0,
        cameras_enabled: 0,
        // 'cameras' left this list in Phase 3 and 'incidents' in Phase 5, as
        // each store arrived. 'coverage' remains because nothing computes it.
        not_yet_reported: ['coverage'],
      });
    }

    // The durable product routes. Empty by default: a test that wants rows
    // supplies them through `routes`, and a page that fabricates a count when
    // given none should fail rather than look plausible.
    // Must precede the '/cameras' matcher below: '/wall/cameras' contains it,
    // and the Phase 5 camera shape has no wall summary.
    if (url.includes('/wall/cameras')) {
      if (url.includes('/ticket')) {
        // Echo the camera that was actually asked for. A stub that always
        // answered 'cam-01' would let every tile carry the same stream and the
        // identity test would pass on a broken app.
        const asked = /\/wall\/cameras\/([^/]+)\/ticket/.exec(url)?.[1] ?? 'cam-01';
        return jsonResponse({
          camera_id: asked,
          ticket: `9999999999.ticket-${asked}`,
          expires_in: 60,
          stream_path: `/api/v1/wall/cameras/${asked}/stream.mjpg`,
        });
      }
      return jsonResponse(options.wall ?? emptyWall());
    }

    if (url.includes('/incidents')) {
      return jsonResponse({ incidents: [], count: 0 });
    }

    // Observations: available and empty by default, which is the honest shape
    // of a working backend that has seen nobody. `available: false` is a
    // different answer and a test that wants it says so through `routes`.
    if (url.includes('/observations')) {
      return jsonResponse(
        options.observations ?? {
          available: true,
          reason: '',
          subjects: [],
          count: 0,
          observation_count: 0,
          cameras_queried: [],
          window: { since: '2026-09-01T00:00:00Z', until: '2026-09-01T08:00:00Z' },
          window_fully_observable: true,
        },
      );
    }

    // Evaluation. `/artifacts` first, since it is the longer path.
    if (url.includes('/evaluation/artifacts')) {
      return jsonResponse(options.evaluationArtifacts ?? evaluationArtifacts());
    }
    if (url.includes('/evaluation')) {
      return jsonResponse(options.evaluation ?? evaluationSummary());
    }

    // Reports. `/reports/types` first: it is a longer path than `/reports/`
    // and a bare `includes('/reports')` would swallow it.
    if (url.includes('/reports/types')) {
      return jsonResponse(options.reportTypes ?? reportCatalogue());
    }

    if (url.includes('/reports/')) {
      const id = /\/reports\/([^/?]+)/.exec(url)?.[1] ?? '';
      if (url.includes('/export')) {
        // A real Blob, so the download path in the page is exercised rather
        // than stubbed around.
        return new Response('report-bytes', {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${id}.pdf"`,
            'Cache-Control': 'no-store, private',
          },
        });
      }
      return jsonResponse(options.reports?.[id] ?? reportPayload(id));
    }

    // The seven modules. Every default here is `available: false` with a real
    // reason and a real checklist, because that is what the backend actually
    // returns — a stub that answered `available: true` with empty rows would
    // let a page pass its own test while rendering a fabricated clean result.
    if (url.includes('/modules/')) {
      const id = MODULE_BY_PATH.find(([fragment]) => url.includes(fragment))?.[1] ?? '';
      const override = options.modules?.[id];
      return jsonResponse(override ?? moduleCapability(id));
    }

    if (url.includes('/pos-connectors')) {
      return jsonResponse(
        options.posConnectors ?? { connectors: [], count: 0, write_available: false },
      );
    }

    if (url.includes('/restaurants')) {
      return jsonResponse(options.restaurants ?? { restaurants: [], count: 0 });
    }

    if (url.includes('/zones')) {
      return jsonResponse({ zones: [], count: 0 });
    }

    if (url.includes('/users')) {
      return jsonResponse(
        options.users ?? {
          users: [],
          count: 0,
          write_available: false,
          write_unavailable_reason:
            'Creating an account issues a credential, and this deployment has no invitation channel yet.',
        },
      );
    }

    if (url.includes('/cameras')) {
      return jsonResponse({ cameras: [], enabled: 0, total: 0 });
    }

    if (url.includes('/audit')) {
      return jsonResponse({ events: [], count: 0 });
    }

    if (url.includes('/devtools/live')) {
      return jsonResponse(options.live ?? emptyLiveRuntime());
    }

    if (url.includes('/devtools/vision')) {
      return jsonResponse({
        assembled: true,
        reason: '',
        attributes: ['face_covering', 'hand_covering', 'head_covering'],
        policies: ['kitchen-safety@2.1.0'],
        imagery: { serve_frames: false, allow_evidence: false },
      });
    }

    if (url.includes('/devtools/state')) return jsonResponse(fixtureState());

    if (url.includes('/devtools/sessions')) {
      return jsonResponse({
        sessions: [
          {
            session_id: 'fixture-kitchen-01',
            kind: 'fixture',
            camera_id: 'cam-fixture-01',
            tenant_id: 'org-test',
            observation_count: FIXTURE_OBSERVATION_COUNT,
            note: 'deterministic fixture',
          },
        ],
      });
    }

    if (url.includes('/devtools/capabilities')) {
      return jsonResponse({
        kind: 'fixture',
        taxonomy_version: 'fixture-taxonomy-1',
        producible_classes: ['person'],
        producible_attributes: ['head_covering', 'hand_covering'],
      });
    }

    return envelope('NOT_FOUND', 404);
  });
}

export function installFetch(options: StubOptions = {}) {
  const stub = stubFetch(options);
  vi.stubGlobal('fetch', stub);
  return stub;
}

export function renderApp(ui: ReactElement, route = '/'): RenderResult {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });

  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AuthProvider>
          <ConnectionProvider>
            <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
          </ConnectionProvider>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

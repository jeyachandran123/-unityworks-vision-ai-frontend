/**
 * The DevTools screens.
 *
 * Every one reads a **real backend route**. There is no mock client here: §17
 * requires real responses, and a technical surface that lies about its own data
 * is worse than no technical surface.
 *
 * Where a capability genuinely does not exist yet — frames, detection, tracking,
 * crops, model calls, economy — the screen says exactly which route would supply
 * it and which phase delivers it. It does not draw an empty chart.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { devtoolsApi, isFixture, type ObjectView } from '@shared/api/services';
import {
  Badge,
  Card,
  DataTable,
  Drawer,
  EmptyState,
  JsonViewer,
  KeyValue,
  SectionHeader,
  StateBadge,
  StatCard,
  StatusBadge,
  Timeline,
  UnavailableState,
  type Column,
} from '@shared/ui/primitives';
import { coverageOf, describeState } from '@shared/semantics/observation';
import { FixtureBadge, QueryBoundary, ToolHeader, formatInstant } from './shared';

/* ── Overview ─────────────────────────────────────────────────────────────── */

export function OverviewScreen() {
  const vision = useQuery({ queryKey: ['devtools', 'vision'], queryFn: devtoolsApi.vision });
  const capabilities = useQuery({ queryKey: ['devtools', 'capabilities'], queryFn: devtoolsApi.capabilities });

  return (
    <>
      <ToolHeader
        title="Vision OS Overview"
        what="Platform status, declared vocabulary and live capability."
        why="Capability is live state, not documentation — what a bound model can actually produce is the difference between a rule that reaches a verdict and one that sits at UNKNOWN forever."
        source="GET /devtools/vision"
      />

      <QueryBoundary query={vision} label="Loading platform status">
        {(status) => (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(13rem, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
              <StatCard
                label="Platform"
                value={status.assembled ? 'Assembled' : 'Not assembled'}
                detail={status.assembled ? 'L0–L7 built' : 'deliberate before Phase 3'}
                tone={status.assembled ? 'accent' : 'default'}
              />
              <StatCard label="Declared attributes" value={status.attributes.length} detail="granted by the registry" />
              <StatCard label="Active policies" value={status.policies.length} detail="loaded documents" />
              <StatCard
                label="Imagery egress"
                value={status.imagery.serve_frames || status.imagery.allow_evidence ? 'Enabled' : 'Disabled'}
                detail="a deployment decision, not a user setting"
              />
            </div>

            {!status.assembled ? (
              <div style={{ marginBottom: 'var(--space-6)' }}>
                <UnavailableState
                  title="Vision OS is not assembled"
                  body={
                    <>
                      {status.reason} This is the expected state before Phase 3 —
                      and it is reported rather than shown as empty results,
                      because &ldquo;not running&rdquo; and &ldquo;observed
                      nothing&rdquo; are different facts.
                    </>
                  }
                />
              </div>
            ) : null}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(19rem, 1fr))', gap: 'var(--space-4)' }}>
              <Card>
                <SectionHeader title="Declared vocabulary" description="What policy asked the platform to observe." />
                {status.attributes.length === 0 ? (
                  <EmptyState
                    title="No attributes declared"
                    body="A valid configuration: with no policy the platform demands nothing and spends no model calls."
                  />
                ) : (
                  <ul style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                    {status.attributes.map((attribute) => (
                      <li key={attribute}>
                        <Badge mono tone="accent">{attribute}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
                <div style={{ marginTop: 'var(--space-4)', fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)' }}>
                  Policies: {status.policies.length > 0 ? status.policies.join(', ') : 'none'}
                </div>
              </Card>

              <Card>
                <SectionHeader title="Capability" description="What the bound models can produce right now." />
                <QueryBoundary query={capabilities} label="Loading capability">
                  {(capability) => (
                    <>
                      {isFixture(capability) ? <div style={{ marginBottom: 'var(--space-3)' }}><FixtureBadge /></div> : null}
                      <KeyValue
                        items={[
                          { key: 'taxonomy', value: capability.taxonomy_version || '—' },
                          { key: 'classes', value: capability.producible_classes.join(', ') || '—' },
                          { key: 'attributes', value: capability.producible_attributes.join(', ') || '—' },
                        ]}
                      />
                    </>
                  )}
                </QueryBoundary>
              </Card>
            </div>

            <div style={{ marginTop: 'var(--space-6)' }}>
              <JsonViewer data={status} label="Raw platform status" />
            </div>
          </>
        )}
      </QueryBoundary>
    </>
  );
}

/* ── Sessions ─────────────────────────────────────────────────────────────── */

export function SessionsScreen() {
  const sessions = useQuery({ queryKey: ['devtools', 'sessions'], queryFn: devtoolsApi.sessions });

  return (
    <>
      <ToolHeader
        title="Sessions"
        what="What the platform is currently observing or replaying."
        why="A session is the unit an engineer investigates against. Before Phase 3 there is one deterministic fixture; after it, replay and live sessions sit side by side."
        source="GET /devtools/sessions"
      />

      <QueryBoundary query={sessions} label="Loading sessions">
        {(payload) => (
          <DataTable
            caption="Vision OS sessions"
            rows={payload.sessions}
            rowKey={(row) => row.session_id}
            columns={[
              {
                key: 'id',
                header: 'Session',
                render: (row) => (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{row.session_id}</span>
                    {isFixture(row) ? <FixtureBadge /> : null}
                  </span>
                ),
              },
              { key: 'camera', header: 'Camera', render: (row) => row.camera_id },
              { key: 'tenant', header: 'Tenant', render: (row) => row.tenant_id },
              { key: 'obs', header: 'Observations', numeric: true, render: (row) => row.observation_count },
              {
                key: 'note',
                header: 'Note',
                render: (row) => (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)' }}>{row.note}</span>
                ),
              },
            ]}
          />
        )}
      </QueryBoundary>
    </>
  );
}

/* ── Vision State — the fixture smoke-test surface ────────────────────────── */

export function VisionStateScreen() {
  const state = useQuery({ queryKey: ['devtools', 'state'], queryFn: devtoolsApi.state });
  const [selected, setSelected] = useState<ObjectView | null>(null);

  return (
    <>
      <ToolHeader
        title="Vision State"
        what="The platform's current view of the world: objects, their lifecycle and their attributes."
        why="This is what every product surface is ultimately reading. The four observation states are preserved exactly as the platform reported them."
        source="GET /devtools/state"
      />

      <QueryBoundary query={state} label="Loading Vision State">
        {(view) => {
          const values = view.objects.flatMap((object) => object.attributes.map((a) => a.value));
          const coverage = coverageOf(values);

          const columns: ReadonlyArray<Column<ObjectView>> = [
            {
              key: 'object',
              header: 'Object',
              render: (row) => (
                <button
                  type="button"
                  onClick={() => setSelected(row)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'var(--accent)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-xs)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {row.object_id}
                </button>
              ),
            },
            { key: 'class', header: 'Class', render: (row) => row.class_id },
            {
              key: 'lifecycle',
              header: 'Lifecycle',
              render: (row) => <StatusBadge tone={row.lifecycle === 'active' ? 'online' : 'idle'}>{row.lifecycle || '—'}</StatusBadge>,
            },
            {
              key: 'attributes',
              header: 'Attributes',
              render: (row) => (
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  {row.attributes.map((attribute) => (
                    <span key={attribute.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                      <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-tertiary)', fontFamily: 'var(--font-mono)' }}>
                        {attribute.key}
                      </span>
                      <StateBadge value={attribute.value} />
                    </span>
                  ))}
                </span>
              ),
            },
            { key: 'seen', header: 'Last seen', numeric: true, render: (row) => formatInstant(row.last_seen) },
          ];

          return (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
                {/* The number the smoke test asserts. Labelled `observations`,
                    matching the backend constant exactly. */}
                <StatCard label="Observations" value={view.observation_count} detail="published into state" tone="accent" />
                <StatCard label="Objects" value={view.objects.length} detail="tracked subjects" />
                <StatCard
                  label="Assessed"
                  value={`${coverage.decided}/${coverage.total}`}
                  detail={`${coverage.notVisible} not visible · ${coverage.unknown} unknown`}
                />
                <StatCard label="Partitions" value={view.partitions.length} detail="cameras in scope" />
              </div>

              {isFixture(view) ? (
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <FixtureBadge />
                </div>
              ) : null}

              <DataTable
                caption="Objects in Vision State with their observed attributes"
                rows={view.objects}
                rowKey={(row) => row.object_id}
                columns={columns}
                empty={
                  <EmptyState
                    title="No objects in state"
                    body="The platform is running and has published nothing. This is different from the platform not running — see the Overview."
                  />
                }
              />

              <div style={{ marginTop: 'var(--space-6)' }}>
                <JsonViewer data={view} label="Raw Vision State response" />
              </div>

              <Drawer open={selected !== null} onClose={() => setSelected(null)} title={selected?.object_id ?? ''}>
                {selected ? <ObjectDetail object={selected} /> : null}
              </Drawer>
            </>
          );
        }}
      </QueryBoundary>
    </>
  );
}

function ObjectDetail({ object }: { object: ObjectView }) {
  const entries = useMemo(
    () =>
      object.attributes.map((attribute) => {
        const descriptor = describeState(attribute.value);
        return {
          id: attribute.key,
          time: formatInstant(attribute.observed_at),
          title: attribute.key,
          tone: descriptor.colorVar,
          detail: (
            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <StateBadge value={attribute.value} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)' }}>
                raw: {attribute.value}
              </span>
              {attribute.confidence ? (
                <Badge mono>
                  {/* Reported with its semantics attached. SELF_REPORTED is a
                      model's opinion about itself and 02_VOM §7.2 says it is not
                      a probability, so it must not be presented as one. */}
                  {attribute.confidence.value.toFixed(2)} {attribute.confidence.semantics}
                </Badge>
              ) : null}
            </span>
          ),
        };
      }),
    [object],
  );

  return (
    <>
      <KeyValue
        items={[
          { key: 'object', value: object.object_id },
          { key: 'camera', value: object.camera_id },
          { key: 'class', value: object.class_id },
          { key: 'lifecycle', value: object.lifecycle || '—' },
          { key: 'first seen', value: formatInstant(object.first_seen) },
          { key: 'last seen', value: formatInstant(object.last_seen) },
          { key: 'observations', value: String(object.observation_count) },
        ]}
      />
      <div style={{ marginTop: 'var(--space-6)' }}>
        <SectionHeader title="Attributes" description="What the platform observed, exactly as reported." />
        <Timeline entries={entries} />
      </div>
      <div style={{ marginTop: 'var(--space-4)' }}>
        <JsonViewer data={object} label="Raw object" />
      </div>
    </>
  );
}

/* ── Observations ─────────────────────────────────────────────────────────── */

export function ObservationsScreen() {
  const state = useQuery({ queryKey: ['devtools', 'state'], queryFn: devtoolsApi.state });

  return (
    <>
      <ToolHeader
        title="Observations"
        what="Every attribute observation the platform has published, flattened."
        why="An observation is the platform's primary record. Compliance is computed from these on read and never stored, so this is the ground truth behind every verdict."
        source="GET /devtools/state"
      />

      <QueryBoundary query={state} label="Loading observations">
        {(view) => {
          const rows = view.objects.flatMap((object) =>
            object.attributes.map((attribute) => ({ object, attribute })),
          );

          return (
            <>
              {isFixture(view) ? <div style={{ marginBottom: 'var(--space-4)' }}><FixtureBadge /></div> : null}
              <DataTable
                caption="Published attribute observations"
                rows={rows}
                rowKey={(row) => `${row.object.object_id}:${row.attribute.key}`}
                columns={[
                  { key: 'subject', header: 'Subject', render: (row) => row.object.object_id },
                  { key: 'attribute', header: 'Attribute', render: (row) => row.attribute.key },
                  {
                    key: 'state',
                    header: 'State',
                    render: (row) => <StateBadge value={row.attribute.value} />,
                  },
                  {
                    key: 'raw',
                    header: 'Reported value',
                    render: (row) => (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{row.attribute.value}</span>
                    ),
                  },
                  { key: 'observed', header: 'Observed', numeric: true, render: (row) => formatInstant(row.attribute.observed_at) },
                  { key: 'valid', header: 'Valid until', numeric: true, render: (row) => formatInstant(row.attribute.valid_until) },
                ]}
              />
            </>
          );
        }}
      </QueryBoundary>
    </>
  );
}

/* ── Compliance ───────────────────────────────────────────────────────────── */

export function ComplianceScreen() {
  const state = useQuery({ queryKey: ['devtools', 'state'], queryFn: devtoolsApi.state });

  return (
    <>
      <ToolHeader
        title="Compliance"
        what="How each subject's observations map to the four states a rule can act on."
        why="Only ABSENT may become a violation. NOT_VISIBLE and UNKNOWN never can — a rule that treated them as failures would accuse someone nobody could see."
        source="GET /devtools/state"
      />

      <QueryBoundary query={state} label="Loading compliance view">
        {(view) => (
          <>
            {isFixture(view) ? <div style={{ marginBottom: 'var(--space-4)' }}><FixtureBadge /></div> : null}

            <Card style={{ marginBottom: 'var(--space-6)' }}>
              <SectionHeader
                title="Why this is not a violation count"
                description="Rule evaluation lives outside the platform, in the compliance engine, and findings are computed on read rather than stored."
              />
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-secondary)', maxWidth: '68ch' }}>
                This screen shows the <em>evidence</em> a rule would evaluate, not
                its verdict. Verdicts require a loaded rule set and a scope-narrowed
                read, and the endpoint that serves them arrives with incidents.
              </p>
            </Card>

            <DataTable
              caption="Subjects and the evidence available about them"
              rows={view.objects}
              rowKey={(row) => row.object_id}
              columns={[
                { key: 'subject', header: 'Subject', render: (row) => row.object_id },
                ...['head_covering', 'face_covering', 'hand_covering'].map((key) => ({
                  key,
                  header: key.replace('_', ' '),
                  render: (row: ObjectView) => {
                    const attribute = row.attributes.find((a) => a.key === key);
                    // A missing attribute is UNKNOWN, never ABSENT. Nobody
                    // looked, and "nobody looked" is not evidence of anything.
                    return <StateBadge value={attribute?.value ?? null} />;
                  },
                })),
                {
                  key: 'actionable',
                  header: 'Rule-actionable',
                  render: (row) => {
                    const actionable = row.attributes.some((a) => describeState(a.value).countsAsViolation);
                    return actionable ? (
                      <Badge tone="accent">candidate</Badge>
                    ) : (
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)' }}>no</span>
                    );
                  },
                },
              ]}
            />
          </>
        )}
      </QueryBoundary>
    </>
  );
}

/* ── Evidence ─────────────────────────────────────────────────────────────── */

export function EvidenceScreen() {
  const [ref, setRef] = useState('');
  const [requested, setRequested] = useState<string | null>(null);
  const evidence = useQuery({
    queryKey: ['devtools', 'evidence', requested],
    queryFn: () => devtoolsApi.evidence(requested as string),
    enabled: requested !== null,
    retry: false,
  });

  return (
    <>
      <ToolHeader
        title="Evidence"
        what="Retrieve retained crop imagery by reference."
        why="Reading 'a person was here' and viewing their image are categorically different acts. This route is gated twice: by the deployment's ALLOW_EVIDENCE setting and by the caller's own view_evidence permission."
        source="GET /devtools/evidence/{ref}"
      />

      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setRequested(ref.trim() || null);
          }}
          style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end', flexWrap: 'wrap' }}
        >
          <div style={{ flex: 1, minWidth: '16rem' }}>
            <label htmlFor="evidence-ref" style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--ink-secondary)', marginBottom: 'var(--space-2)' }}>
              Blob reference
            </label>
            <input
              id="evidence-ref"
              value={ref}
              onChange={(event) => setRef(event.target.value)}
              placeholder="blob-…"
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                background: 'var(--surface-sunken)',
                border: '1px solid var(--line-default)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--ink-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              padding: '0.55rem 1rem',
              background: 'var(--accent)',
              color: 'var(--ink-on-accent)',
              border: '1px solid var(--accent)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--weight-medium)',
              cursor: 'pointer',
            }}
          >
            Retrieve
          </button>
        </form>
        <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)' }}>
          Every retrieval is an access to imagery of an identifiable person, and
          is recorded as one.
        </p>
      </Card>

      {requested === null ? (
        <EmptyState title="No reference requested" body="Enter a blob reference to retrieve the crop behind an observation." />
      ) : (
        <EvidenceResult query={evidence} />
      )}
    </>
  );
}

function EvidenceResult({ query }: { query: ReturnType<typeof useQuery<import('@shared/api/services').EvidenceView>> }) {
  return (
    <QueryBoundary query={query} label="Retrieving evidence">
      {(result) =>
        result.available ? (
          <Card>
            <SectionHeader title="Evidence" description={result.blob_ref} />
            <p>Imagery would render here.</p>
          </Card>
        ) : (
          // Never an unexplained black rectangle. The reason is the answer.
          <UnavailableState
            title="No retained image"
            body={
              <>
                {result.reason} Evidence storage is in-memory before Phase 5, so
                nothing survives a restart and no crop is retained.
              </>
            }
          />
        )
      }
    </QueryBoundary>
  );
}

/* ── Screens whose backend capability does not exist yet ──────────────────── */

function PendingCapability({
  title,
  what,
  why,
  route,
  phase,
  preserved,
}: {
  title: string;
  what: string;
  why: string;
  route: string;
  phase: string;
  preserved: string[];
}) {
  return (
    <>
      <ToolHeader title={title} what={what} why={why} />
      <UnavailableState
        title="No data source yet"
        body={
          <>
            This view needs <code style={{ fontFamily: 'var(--font-mono)' }}>{route}</code>, which arrives in {phase}.
            The screen exists now so the information architecture is settled
            before the data lands.
          </>
        }
      />
      <Card style={{ marginTop: 'var(--space-6)' }}>
        <SectionHeader
          title="What this screen will show"
          description="Migrated from the validation console's equivalent panel."
        />
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {preserved.map((item) => (
            <li key={item} style={{ display: 'flex', gap: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--ink-secondary)' }}>
              <span aria-hidden="true" style={{ color: 'var(--ink-tertiary)' }}>—</span>
              {item}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

export function SourcesScreen() {
  const live = useQuery({ queryKey: ['devtools', 'live'], queryFn: devtoolsApi.live });

  return (
    <>
      <ToolHeader
        title="Sources"
        what="Acquisition state per camera: connection, frames, drops, reconnects."
        why="A camera that has produced no frames for an hour is the most important fact in this application, and the one most easily hidden by a frozen last frame. Nothing here is ever shown as online while it is silent."
        source="GET /devtools/live"
      />

      <QueryBoundary query={live} label="Loading sources">
        {(view) => (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
              <StatCard
                label="Runtime"
                value={view.runtime.enabled ? 'Enabled' : 'Disabled'}
                detail={view.runtime.reason || 'FEATURE_LIVE_CCTV is on'}
              />
              <StatCard label="Active sessions" value={view.runtime.active_sessions} detail="replay and live" />
              <StatCard
                label="Streaming"
                value={view.runtime.streaming_sessions}
                detail="received a genuine frame"
                tone={view.runtime.streaming ? 'accent' : 'default'}
              />
              <StatCard label="Cameras configured" value={view.cameras_configured.length} detail="named in CCTV_CHANNELS" />
            </div>

            {view.sessions.length === 0 ? (
              <UnavailableState
                title="No source is running"
                body={
                  <>
                    {view.runtime.reason || 'No camera session has been started.'} Nothing
                    is being observed — which is different from observing nothing.
                  </>
                }
              />
            ) : (
              <DataTable
                caption="Live and replay sources with their acquisition state"
                rows={view.sessions}
                rowKey={(row) => row.session_id}
                columns={[
                  {
                    key: 'camera',
                    header: 'Camera',
                    render: (row) => (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>{row.camera_id}</span>
                        <Badge>{row.kind}</Badge>
                      </span>
                    ),
                  },
                  {
                    key: 'health',
                    header: 'Health',
                    render: (row) => (
                      <StatusBadge tone={healthTone(row.source.health)}>{row.source.health}</StatusBadge>
                    ),
                  },
                  {
                    key: 'streaming',
                    header: 'Streaming',
                    render: (row) =>
                      row.streaming ? (
                        <Badge tone="accent">yes</Badge>
                      ) : (
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)' }}>no</span>
                      ),
                  },
                  { key: 'produced', header: 'Frames', numeric: true, render: (row) => row.source.frames_produced },
                  { key: 'processed', header: 'Processed', numeric: true, render: (row) => row.stats.frames_processed },
                  {
                    key: 'dropped',
                    header: 'Dropped',
                    numeric: true,
                    render: (row) => (
                      <span
                        title={
                          // Two different facts, and the tooltip keeps them apart:
                          // sampled-out is the system working as configured,
                          // queue-full is the system falling behind.
                          `${row.queue.dropped_sampled} sampled out · ` +
                          `${row.queue.dropped_queue_full} queue full`
                        }
                      >
                        {row.queue.dropped_total}
                      </span>
                    ),
                  },
                  {
                    key: 'queue',
                    header: 'Queue',
                    numeric: true,
                    render: (row) => `${row.queue.depth}/${row.queue.capacity}`,
                  },
                  { key: 'reconnects', header: 'Reconnects', numeric: true, render: (row) => row.source.reconnects },
                  {
                    key: 'uri',
                    header: 'Source',
                    render: (row) => (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)' }}>{row.source.uri}</span>
                    ),
                  },
                ]}
              />
            )}

            <Card style={{ marginTop: 'var(--space-6)' }}>
              <SectionHeader
                title={`Backpressure: ${view.backpressure.policy}`}
                description={view.backpressure.rationale}
              />
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-secondary)', maxWidth: '68ch' }}>
                Frames are never reordered, never duplicated and never fabricated.
                A dropped frame is gone and counted — <code style={{ fontFamily: 'var(--font-mono)' }}>sampled_out</code> is
                the system working as configured;{' '}
                <code style={{ fontFamily: 'var(--font-mono)' }}>queue_full</code> is the system falling behind.
              </p>
            </Card>

            <div style={{ marginTop: 'var(--space-6)' }}>
              <JsonViewer data={view} label="Raw live runtime" />
            </div>
          </>
        )}
      </QueryBoundary>
    </>
  );
}

function healthTone(health: string): 'online' | 'degraded' | 'offline' | 'idle' {
  if (health === 'online') return 'online';
  if (health === 'degraded' || health === 'connecting') return 'degraded';
  if (health === 'error') return 'offline';
  return 'idle';
}

export function FramesScreen() {
  return (
    <PendingCapability
      title="Frame by Frame"
      what="One frame, every layer: the engineering investigation tool."
      why="When a verdict looks wrong, this is where an engineer finds out which layer was wrong — detection, tracking, the crop, the model, or the rule."
      route="GET /devtools/frames"
      phase="Phase 3"
      preserved={[
        'Frame image and its capture timestamp',
        'Frame narrative — what happened at each layer for this frame',
        'Detections with class and confidence',
        'Object identity and lifecycle at that instant',
        'The canonical crop the model was actually shown',
        'Attribute values produced, with provenance',
        'Evidence references behind each observation',
        'Raw structured data beneath the structured view',
      ]}
    />
  );
}

export function DetectionScreen() {
  return (
    <PendingCapability
      title="Detection"
      what="Bounding boxes, classes and confidence from the bound detector."
      why="Detection failures cascade: a missed person is a subject nobody assessed, and it looks identical to a compliant kitchen."
      route="GET /devtools/detection"
      phase="Phase 3"
      preserved={[
        'Boxes per frame with class and confidence',
        'Detector provider, weights and thresholds in force',
        'NMS and letterbox parameters',
        'Capability: which classes the bound model can produce at all',
      ]}
    />
  );
}

export function TrackingScreen() {
  return (
    <PendingCapability
      title="Tracking"
      what="Tracks, epochs and association decisions."
      why="Identity continuity is what makes 'the same person, still without a hairnet' different from 'two people, once each'."
      route="GET /devtools/tracking"
      phase="Phase 3"
      preserved={[
        'Active tracks per camera with age and hit count',
        'Association cost and the margin behind each assignment',
        'Tracker epochs and the reason for each reset',
        'Lifecycle transitions: provisional, active, occluded, dormant',
      ]}
    />
  );
}

export function CropsScreen() {
  return (
    <PendingCapability
      title="Crops"
      what="The canonical crop for each attribute request — what the model was actually shown."
      why="Half of all wrong answers are answers to the wrong picture. The Camera C investigation nearly recorded a dozen fabricated violations because clear gloves looked like bare skin at reduced resolution."
      route="GET /devtools/crops"
      phase="Phase 3"
      preserved={[
        'Crop imagery, gated on the evidence privilege',
        'Per-attribute output size — head 448, hands 224',
        'Evidence region geometry that produced it',
        'Quality grades and the gate verdict',
      ]}
    />
  );
}

export function ModelCallsScreen() {
  return (
    <PendingCapability
      title="Model calls"
      what="Prompt, raw model output and the coercion that turned it into an attribute."
      why="A model that answers confidently about something it cannot see is the failure mode this platform is built around. The raw output is where that becomes visible."
      route="GET /devtools/understanding"
      phase="Phase 3"
      preserved={[
        'Rendered prompt with its pinned version',
        'Raw model response, before coercion',
        'Coercion result and any values rejected',
        'Provider, model id and latency',
        'Cost estimate per call',
      ]}
    />
  );
}

export function AttributesScreen() {
  const vision = useQuery({ queryKey: ['devtools', 'vision'], queryFn: devtoolsApi.vision });

  return (
    <>
      <ToolHeader
        title="Attributes"
        what="The vocabulary the registry has granted."
        why="A policy may ask for a concept; only the registry can grant it. An attribute whose name encodes a verdict is refused here, which is what keeps the Semantic Ceiling intact."
        source="GET /devtools/vision"
      />

      <QueryBoundary query={vision} label="Loading attribute registry">
        {(status) =>
          status.attributes.length === 0 ? (
            <EmptyState
              title="No attributes declared"
              body="A working configuration: with no policy loaded the platform declares nothing, demands nothing and spends no model calls."
            />
          ) : (
            <DataTable
              caption="Attributes declared by the active policies"
              rows={status.attributes.map((key) => ({ key }))}
              rowKey={(row) => row.key}
              columns={[
                {
                  key: 'attribute',
                  header: 'Attribute',
                  render: (row) => <span style={{ fontFamily: 'var(--font-mono)' }}>{row.key}</span>,
                },
                {
                  key: 'refusal',
                  header: 'Carries a refusal value',
                  render: () => (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <StateBadge state="not_visible" showLabel={false} />
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-secondary)' }}>
                        not_visible is in every declared domain
                      </span>
                    </span>
                  ),
                },
              ]}
            />
          )
        }
      </QueryBoundary>
    </>
  );
}

export function EconomyScreen() {
  return (
    <PendingCapability
      title="Economy"
      what="What the platform is spending on model calls, and why each was spent."
      why="Cost scales with demands × changes, not cameras × fps. The trigger and skip distribution is the highest-value diagnostic in the system — Phase 6 spent nine sub-phases discovering FRESH_ENOUGH had never once fired, because nothing displayed it."
      route="GET /devtools/economy"
      phase="Phase 3"
      preserved={[
        'Ten trigger reasons over time',
        'Eight skip reasons — FRESH_ENOUGH is the one that saves money',
        'Model calls per camera-hour',
        'Budget headroom and sustainable freshness',
      ]}
    />
  );
}

export function DiagnosticsScreen() {
  const vision = useQuery({ queryKey: ['devtools', 'vision'], queryFn: devtoolsApi.vision });

  return (
    <>
      <ToolHeader
        title="Diagnostics"
        what="Deployment configuration and the switches that change what leaves this process."
        why="Two settings decide whether CCTV imagery of identifiable people can leave the backend. Both are deployment decisions, and neither is something a console user can turn on."
        source="GET /devtools/vision"
      />

      <QueryBoundary query={vision} label="Loading diagnostics">
        {(status) => (
          <>
            <Card style={{ marginBottom: 'var(--space-6)' }}>
              <SectionHeader title="Imagery egress" description="Both default to off." />
              <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
                <StatusBadge tone={status.imagery.serve_frames ? 'degraded' : 'idle'}>
                  serve_frames: {String(status.imagery.serve_frames)}
                </StatusBadge>
                <StatusBadge tone={status.imagery.allow_evidence ? 'degraded' : 'idle'}>
                  allow_evidence: {String(status.imagery.allow_evidence)}
                </StatusBadge>
              </div>
            </Card>

            <Card>
              <SectionHeader title="Platform" />
              <KeyValue
                items={[
                  { key: 'assembled', value: String(status.assembled) },
                  { key: 'reason', value: status.reason || '—' },
                  { key: 'attributes', value: String(status.attributes.length) },
                  { key: 'policies', value: status.policies.join(', ') || 'none' },
                ]}
              />
            </Card>

            <div style={{ marginTop: 'var(--space-6)' }}>
              <JsonViewer data={status} />
            </div>
          </>
        )}
      </QueryBoundary>
    </>
  );
}

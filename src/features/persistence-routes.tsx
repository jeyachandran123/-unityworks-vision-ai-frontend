/**
 * The four pages backed by durable state: Cameras, Incidents, Evidence, Audit.
 *
 * These are the first product surfaces in this application whose data survives
 * a restart. Everything they show comes from a database row somebody wrote, and
 * nothing on them is computed to fill a gap.
 *
 * ### The rule that still governs every page here
 *
 * **No fabricated value.** An empty list renders "no rows", never a plausible
 * number. `StatCard` renders `—` for `null`. "No violations" and "not watching"
 * must never look the same, and that discipline does not relax because the data
 * is now durable — it matters more.
 *
 * ### What is not on these pages
 *
 * No evidence image is rendered inline anywhere. Retrieving one is an audited
 * act against a named person's likeness, so it happens on an explicit click, in
 * a drawer that says so, and never as a thumbnail that loads because a list
 * scrolled into view.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  auditLabel,
  auditApi,
  camerasApi,
  evidenceApi,
  incidentsApi,
  isImageryAccess,
  type AuditEvent,
  type Camera,
  type Evidence,
  type Incident,
  type IncidentStatus,
} from '@shared/api/persistence';
import { PERMISSIONS } from '@app/permissions/permissions';
import { PermissionGate } from '@app/permissions/guards';
import {
  Badge,
  Button,
  Card,
  type Column,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  Input,
  JsonViewer,
  KeyValue,
  LoadingState,
  PageHeader,
  SectionHeader,
  StatCard,
  StatusBadge,
} from '@shared/ui/primitives';
import { isApiError } from '@shared/api/errors';
import { authorizedFetch } from '@shared/api/client';

/* ── shared helpers ───────────────────────────────────────────────────────── */

function when(iso: string | null | undefined): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString();
}

function Failed({ error }: { error: unknown }) {
  return (
    <ErrorState
      body={isApiError(error) ? error.message : 'The request did not complete.'}
      requestId={isApiError(error) ? error.requestId : undefined}
    />
  );
}

/* ── Cameras ──────────────────────────────────────────────────────────────── */

const CAMERA_COLUMNS: ReadonlyArray<Column<Camera>> = [
  { key: 'key', header: 'Camera', render: (c) => c.camera_key, width: '9rem' },
  { key: 'name', header: 'Name', render: (c) => c.name || '—' },
  { key: 'channel', header: 'Channel', render: (c) => c.channel, numeric: true, width: '6rem' },
  { key: 'stream', header: 'Stream', render: (c) => c.stream_type, width: '6rem' },
  {
    key: 'fps',
    header: 'Analysis fps',
    // The cost lever, shown next to the switch that spends it.
    render: (c) => c.analysis_fps,
    numeric: true,
    width: '8rem',
  },
  {
    key: 'credential',
    header: 'Credential',
    render: (c) =>
      c.credential_configured ? (
        // The reference, never the secret. Showing which variable a camera
        // reads is what makes a misconfiguration diagnosable.
        <Badge>{c.credential_ref || 'configured'}</Badge>
      ) : (
        <span style={{ color: 'var(--ink-tertiary)' }}>none</span>
      ),
  },
  {
    key: 'state',
    header: 'State',
    render: (c) =>
      c.enabled ? (
        <StatusBadge tone="online">Enabled</StatusBadge>
      ) : (
        <StatusBadge tone="idle">Disabled</StatusBadge>
      ),
    width: '8rem',
  },
];

export function CamerasPage() {
  const client = useQueryClient();
  const cameras = useQuery({ queryKey: ['cameras'], queryFn: camerasApi.list });

  const toggle = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      camerasApi.setEnabled(key, enabled),
    onSuccess: () => client.invalidateQueries({ queryKey: ['cameras'] }),
  });

  const columns = useMemo<ReadonlyArray<Column<Camera>>>(
    () => [
      ...CAMERA_COLUMNS,
      {
        key: 'action',
        header: '',
        render: (camera) => (
          <PermissionGate permission={PERMISSIONS.manageCameras}>
            <Button
              size="sm"
              variant={camera.enabled ? 'secondary' : 'primary'}
              loading={toggle.isPending && toggle.variables?.key === camera.camera_key}
              onClick={() => toggle.mutate({ key: camera.camera_key, enabled: !camera.enabled })}
            >
              {camera.enabled ? 'Disable' : 'Enable'}
            </Button>
          </PermissionGate>
        ),
        width: '7rem',
      },
    ],
    [toggle],
  );

  if (cameras.isPending) return <LoadingState label="Loading cameras" />;
  if (cameras.isError) return <Failed error={cameras.error} />;

  const list = cameras.data;

  return (
    <>
      <PageHeader
        title="Cameras"
        description="Camera configuration is durable: this list is what the runtime starts after a restart. A disabled camera opens no connection, decodes nothing and reaches no model."
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <StatCard label="Registered" value={list.total} detail="Camera rows in this tenant" />
        <StatCard
          label="Enabled"
          value={list.enabled}
          tone={list.enabled > 0 ? 'accent' : 'default'}
          detail="Sessions the runtime starts"
        />
        <StatCard
          label="Not processed"
          value={list.total - list.enabled}
          detail="Registered and deliberately switched off"
        />
      </div>

      <Card>
        <SectionHeader
          title="Configured cameras"
          description="Each row carries a credential reference, never a credential. The URI shown is redacted at the server."
        />
        <DataTable
          columns={columns}
          rows={list.cameras}
          rowKey={(camera) => camera.camera_key}
          caption="Cameras registered in this organisation, with their channel, stream and enabled state"
          empty={
            <EmptyState
              title="No cameras registered"
              body="Add a camera to begin. A new camera is created disabled — enabling it is a separate, audited decision."
            />
          }
        />
      </Card>

      {toggle.isError ? (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <Failed error={toggle.error} />
        </div>
      ) : null}
    </>
  );
}

/* ── Incidents ────────────────────────────────────────────────────────────── */

const STATUS_FILTERS: Array<{ id: IncidentStatus | 'all'; label: string }> = [
  { id: 'active', label: 'Active' },
  { id: 'acknowledged', label: 'Acknowledged' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'all', label: 'All' },
];

function statusTone(status: IncidentStatus): 'online' | 'degraded' | 'offline' | 'idle' {
  if (status === 'resolved') return 'online';
  if (status === 'acknowledged') return 'degraded';
  return 'offline';
}

export function IncidentsPage() {
  const client = useQueryClient();
  const [filter, setFilter] = useState<IncidentStatus | 'all'>('active');
  const [open, setOpen] = useState<Incident | null>(null);
  const [note, setNote] = useState('');

  const incidents = useQuery({
    queryKey: ['incidents', filter],
    queryFn: () => incidentsApi.list(filter === 'all' ? undefined : filter),
  });

  const refresh = () => {
    client.invalidateQueries({ queryKey: ['incidents'] });
    setOpen(null);
    setNote('');
  };

  const acknowledge = useMutation({
    mutationFn: (id: string) => incidentsApi.acknowledge(id),
    onSuccess: refresh,
  });
  const resolve = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      incidentsApi.resolve(id, reason),
    onSuccess: refresh,
  });

  const columns: ReadonlyArray<Column<Incident>> = [
    {
      key: 'status',
      header: 'Status',
      render: (i) => <StatusBadge tone={statusTone(i.status)}>{i.status}</StatusBadge>,
      width: '9rem',
    },
    { key: 'summary', header: 'What', render: (i) => i.summary || i.rule_id },
    { key: 'camera', header: 'Where', render: (i) => i.camera_key, width: '8rem' },
    { key: 'observed', header: 'When', render: (i) => when(i.observed_at), width: '12rem' },
    {
      key: 'evidence',
      header: 'Evidence',
      // A count, not a thumbnail. Loading imagery because a list rendered would
      // be an unaudited access to somebody's likeness.
      render: (i) => (i.evidence_refs.length > 0 ? i.evidence_refs.length : '—'),
      numeric: true,
      width: '7rem',
    },
    {
      key: 'inspect',
      header: '',
      render: (incident) => (
        <Button size="sm" onClick={() => setOpen(incident)}>
          Inspect
        </Button>
      ),
      width: '6rem',
    },
  ];

  if (incidents.isPending) return <LoadingState label="Loading incidents" />;
  if (incidents.isError) return <Failed error={incidents.error} />;

  return (
    <>
      <PageHeader
        title="Incidents"
        description="The work queue. Each incident freezes the finding that raised it, so it stays explicable after the rules change — and it closes only when a later observation clears it or an authorised person says why."
        actions={
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {STATUS_FILTERS.map((option) => (
              <Button
                key={option.id}
                size="sm"
                variant={filter === option.id ? 'primary' : 'secondary'}
                onClick={() => setFilter(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        }
      />

      <Card>
        <DataTable
          columns={columns}
          rows={incidents.data.incidents}
          rowKey={(incident) => incident.id}
          caption="Incidents in this organisation, with status, camera, time observed and evidence count"
          empty={
            <EmptyState
              title={filter === 'all' ? 'No incidents recorded' : `No ${filter} incidents`}
              body={
                // The distinction the product exists to preserve. An empty queue
                // is only good news if something was actually watching.
                'Nothing is being suppressed. If no camera is enabled, an empty queue means nothing was observed rather than nothing happened — check the Cameras page.'
              }
            />
          }
        />
      </Card>

      <Drawer
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open ? open.summary || open.rule_id : ''}
      >
        {open ? (
          <div style={{ display: 'grid', gap: 'var(--space-5)' }}>
            <KeyValue
              items={[
                { key: 'Status', value: open.status },
                { key: 'Severity', value: open.severity },
                { key: 'Camera', value: open.camera_key },
                { key: 'Subject', value: open.object_id || '—' },
                { key: 'Rule', value: open.rule_id },
                { key: 'Rule set', value: open.ruleset_version || '—' },
                { key: 'Observed', value: when(open.observed_at) },
                { key: 'Raised', value: when(open.created_at) },
                { key: 'Acknowledged', value: open.acknowledged_by ?? '—' },
                {
                  key: 'Resolved',
                  value:
                    open.resolved_by === null
                      ? '—'
                      : // Which of the two ways it closed. "The system saw it
                        // fixed" and "a manager said so" are different facts.
                        `${open.resolved_by} (${open.resolution_kind})`,
                },
                { key: 'Reason', value: open.resolution_note ?? '—' },
              ]}
            />

            <div>
              <SectionHeader
                title="The finding, as it stood"
                description="Frozen when the incident was raised. Never recomputed against today's rules."
              />
              <JsonViewer data={open.finding} label="Finding snapshot" />
            </div>

            <div>
              <SectionHeader
                title="Evidence"
                description="Handles only. Retrieving an image is a separate, audited act."
              />
              {open.evidence_refs.length === 0 ? (
                <p style={{ color: 'var(--ink-tertiary)', fontSize: 'var(--text-sm)' }}>
                  No evidence was retained for this incident.
                </p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 'var(--space-2)' }}>
                  {open.evidence_refs.map((ref) => (
                    <li key={ref} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                      {ref}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {open.status !== 'resolved' ? (
              <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                <PermissionGate permission={PERMISSIONS.acknowledgeIncidents}>
                  <Button
                    variant="secondary"
                    loading={acknowledge.isPending}
                    disabled={open.status === 'acknowledged'}
                    onClick={() => acknowledge.mutate(open.id)}
                  >
                    {open.status === 'acknowledged' ? 'Already acknowledged' : 'Acknowledge'}
                  </Button>
                </PermissionGate>

                <PermissionGate permission={PERMISSIONS.resolveIncidents}>
                  <Input
                    label="Reason for resolving"
                    hint="Required. This is what makes the decision reviewable later."
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                  <Button
                    variant="primary"
                    loading={resolve.isPending}
                    disabled={note.trim().length === 0}
                    onClick={() => resolve.mutate({ id: open.id, reason: note.trim() })}
                  >
                    Resolve
                  </Button>
                </PermissionGate>
              </div>
            ) : null}

            {resolve.isError ? <Failed error={resolve.error} /> : null}
            {acknowledge.isError ? <Failed error={acknowledge.error} /> : null}
          </div>
        ) : null}
      </Drawer>
    </>
  );
}

/* ── Evidence ─────────────────────────────────────────────────────────────── */

/**
 * Evidence is looked up by handle, not browsed.
 *
 * There is no "recent evidence" gallery, and that is a design decision rather
 * than a missing feature: a scrollable wall of faces is a surveillance product,
 * and this is a compliance one. An operator arrives here from an incident that
 * cites a handle, and retrieves that one image, and the retrieval is recorded.
 */
export function EvidencePage() {
  const [query, setQuery] = useState('');
  const [ref, setRef] = useState('');

  const evidence = useQuery({
    queryKey: ['evidence', ref],
    queryFn: () => evidenceApi.metadata(ref),
    enabled: ref.length > 0,
    retry: false,
  });

  return (
    <>
      <PageHeader
        title="Evidence"
        description="Imagery that supports a finding. Viewing one is an access event against an identifiable person's likeness — a separate privilege from reading the observation, and always recorded."
      />

      <Card>
        <SectionHeader
          title="Look up evidence"
          description="Evidence is retrieved by the handle an incident cites. There is deliberately no gallery to browse."
        />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setRef(query.trim());
          }}
          style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end' }}
        >
          <div style={{ flex: 1 }}>
            <Input
              label="Evidence reference"
              hint="From an incident's evidence list"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Button type="submit" variant="primary" disabled={query.trim().length === 0}>
            Look up
          </Button>
        </form>
      </Card>

      {ref.length === 0 ? null : evidence.isPending ? (
        <div style={{ marginTop: 'var(--space-5)' }}>
          <LoadingState label="Loading evidence record" />
        </div>
      ) : evidence.isError ? (
        <div style={{ marginTop: 'var(--space-5)' }}>
          <Failed error={evidence.error} />
        </div>
      ) : (
        <div style={{ marginTop: 'var(--space-5)' }}>
          <EvidenceRecord record={evidence.data} />
        </div>
      )}
    </>
  );
}

function EvidenceRecord({ record }: { record: Evidence }) {
  const [reason, setReason] = useState('');
  const [erased, setErased] = useState<Evidence | null>(null);

  const remove = useMutation({
    mutationFn: (why: string) => evidenceApi.remove(record.evidence_ref, why),
    onSuccess: (result) => setErased(result),
  });

  const current = erased ?? record;

  return (
    <Card>
      <SectionHeader
        title={current.evidence_ref}
        description={current.purpose || 'No stated purpose'}
        actions={
          current.state === 'retained' ? (
            <StatusBadge tone="online">Retained</StatusBadge>
          ) : current.state === 'expired' ? (
            <StatusBadge tone="degraded">Expired</StatusBadge>
          ) : (
            <StatusBadge tone="offline">Erased</StatusBadge>
          )
        }
      />

      <KeyValue
        items={[
          { key: 'Camera', value: current.camera_key },
          { key: 'Captured', value: when(current.captured_at) },
          { key: 'Retained until', value: when(current.expires_at) },
          { key: 'Subject', value: current.object_id || '—' },
          { key: 'Integrity', value: current.content_hash || '—' },
          { key: 'Size', value: current.size_bytes ? `${current.size_bytes} bytes` : '—' },
          { key: 'Erased at', value: current.deleted_at ? when(current.deleted_at) : '—' },
          { key: 'Erased by', value: current.deleted_by ?? '—' },
          { key: 'Erasure reason', value: current.deletion_reason ?? '—' },
        ]}
      />

      {current.state === 'deleted' ? (
        <p style={{ marginTop: 'var(--space-4)', color: 'var(--ink-secondary)', fontSize: 'var(--text-sm)' }}>
          The imagery was erased. This record survives so that the erasure can be
          evidenced — a row that simply vanished would prove nothing.
        </p>
      ) : !current.servable ? (
        <p style={{ marginTop: 'var(--space-4)', color: 'var(--ink-secondary)', fontSize: 'var(--text-sm)' }}>
          Past its retention period, so it is no longer served — whether or not
          the bytes have yet been erased. Retention is a promise about what is
          shown, not only about what is eventually deleted.
        </p>
      ) : (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <p style={{ color: 'var(--ink-secondary)', fontSize: 'var(--text-sm)', maxWidth: '62ch' }}>
            Opening the image records who viewed it, when, and under which
            request. The image is never cached by the browser.
          </p>
          <div style={{ marginTop: 'var(--space-3)' }}>
            <PermissionGate
              permission={PERMISSIONS.viewEvidence}
              fallback={
                <Badge>Your account does not hold the evidence-viewing privilege</Badge>
              }
            >
              <EvidenceImage evidenceRef={current.evidence_ref} />
            </PermissionGate>
          </div>
        </div>
      )}

      {current.state !== 'deleted' ? (
        <PermissionGate permission={PERMISSIONS.deleteEvidence}>
          <div style={{ marginTop: 'var(--space-6)', display: 'grid', gap: 'var(--space-3)' }}>
            <SectionHeader
              title="Erase this evidence"
              description="Destroys the imagery and keeps a tombstone naming who erased it and why. A reason is required."
            />
            <Input
              label="Reason"
              hint="For example: subject access request, or retention decision"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <div>
              <Button
                variant="danger"
                loading={remove.isPending}
                disabled={reason.trim().length === 0}
                onClick={() => remove.mutate(reason.trim())}
              >
                Erase permanently
              </Button>
            </div>
            {remove.isError ? <Failed error={remove.error} /> : null}
          </div>
        </PermissionGate>
      ) : null}
    </Card>
  );
}

/**
 * Fetches the image on an explicit click.
 *
 * Never an `<img src>` that loads on render: the URL needs an Authorization
 * header, and — more to the point — a retrieval that happens because a page
 * rendered is a retrieval nobody chose to make.
 */
function EvidenceImage({ evidenceRef }: { evidenceRef: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  const load = useMutation({
    mutationFn: async () => {
      const response = await authorizedFetch(
        `/evidence/${encodeURIComponent(evidenceRef)}/image`,
      );
      if (!response.ok) throw new Error('The image could not be retrieved.');
      return URL.createObjectURL(await response.blob());
    },
    onSuccess: (url) => {
      // Revoke the previous one. An object URL that is never revoked keeps the
      // decoded image alive in the tab for as long as it is open.
      setObjectUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return url;
      });
    },
  });

  if (objectUrl) {
    return (
      <figure style={{ margin: 0 }}>
        <img
          src={objectUrl}
          alt={`Retained evidence ${evidenceRef}`}
          style={{ maxWidth: '100%', borderRadius: 'var(--radius-md)', border: '1px solid var(--line-subtle)' }}
        />
        <figcaption style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)' }}>
          This retrieval has been recorded in the audit trail.
        </figcaption>
      </figure>
    );
  }

  return (
    <>
      <Button variant="secondary" loading={load.isPending} onClick={() => load.mutate()}>
        View image (recorded)
      </Button>
      {load.isError ? (
        <p style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--health-offline)' }}>
          {load.error instanceof Error ? load.error.message : 'The image could not be retrieved.'}
        </p>
      ) : null}
    </>
  );
}

/* ── Audit ────────────────────────────────────────────────────────────────── */

export function AuditPage() {
  const events = useQuery({ queryKey: ['audit'], queryFn: () => auditApi.list(200) });

  const columns: ReadonlyArray<Column<AuditEvent>> = [
    { key: 'when', header: 'When', render: (e) => when(e.occurred_at), width: '12rem' },
    { key: 'actor', header: 'Who', render: (e) => e.actor || '—' },
    {
      key: 'action',
      header: 'What',
      render: (event) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {auditLabel(event.action)}
          {/* Marked, so the rows a privacy review asks for do not have to be
              picked out of a list by eye. */}
          {isImageryAccess(event) ? <Badge>imagery</Badge> : null}
        </span>
      ),
    },
    {
      key: 'resource',
      header: 'On',
      render: (e) => (e.resource_id ? `${e.resource_type}: ${e.resource_id}` : e.resource_type || '—'),
    },
    {
      key: 'outcome',
      header: 'Outcome',
      render: (e) =>
        e.outcome === 'success' ? (
          <StatusBadge tone="online">success</StatusBadge>
        ) : e.outcome === 'denied' ? (
          <StatusBadge tone="degraded">denied</StatusBadge>
        ) : (
          <StatusBadge tone="offline">failed</StatusBadge>
        ),
      width: '8rem',
    },
  ];

  if (events.isPending) return <LoadingState label="Loading the audit trail" />;
  if (events.isError) return <Failed error={events.error} />;

  const imagery = events.data.events.filter(isImageryAccess).length;

  return (
    <>
      <PageHeader
        title="Audit Trail"
        description="Append-only. Every row here was written once and never edited — a correction is another row. Retention prunes whole aged rows and never rewrites a surviving one."
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <StatCard label="Events shown" value={events.data.count} detail="Most recent first" />
        <StatCard
          label="Imagery accesses"
          value={imagery}
          tone={imagery > 0 ? 'accent' : 'default'}
          detail="Views of, or refused views of, identifiable people"
        />
      </div>

      <Card>
        <DataTable
          columns={columns}
          rows={events.data.events}
          rowKey={(event) => event.id}
          caption="Audit events for this organisation, most recent first"
          empty={
            <EmptyState
              title="No audit events"
              body="Nothing has been recorded for this organisation yet."
            />
          }
        />
      </Card>
    </>
  );
}

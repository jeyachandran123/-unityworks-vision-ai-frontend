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
import { Link, useParams, useSearchParams } from 'react-router-dom';
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
  Modal,
  PageHeader,
  SectionHeader,
  SeverityBadge,
  StateBadge,
  StatCard,
  StatusBadge,
  type Severity,
} from '@shared/ui/primitives';
import {
  CameraSurface,
  Eyebrow,
  Figure,
  FindingReadout,
  GoTo,
  Meter,
  PageIntro,
  Plane,
  Region,
  SectionRule,
} from '@shared/ui/product';
import { attributeLabel, failedConditions } from '@shared/semantics/finding';
import { framesApi } from '@shared/api/persistence';
import { wallApi, STREAM_STATE_LABEL, streamTone } from '@shared/api/wall';
import { isApiError } from '@shared/api/errors';
import { authorizedFetch } from '@shared/api/client';
import { Icon, StatusIcons } from '@shared/ui/icons';

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

/**
 * The camera estate.
 *
 * ### Registration is product recovery, not a new subsystem
 *
 * `camerasApi.create` has existed since Phase 2 with zero call sites, the
 * `manage_cameras` gate was already wired around the enable control, and this
 * page's own empty state has been telling operators to *"add a camera to
 * begin"* while offering no way to do it. That is a false promise in shipped
 * copy, and repairing it is recovery.
 *
 * Editing and retirement are deliberately **not** here. `camerasApi.update` is
 * uncalled but nothing in the interface promises it, and `DELETE /cameras/{key}`
 * has no client method at all — it purges an observation partition and is
 * irreversible, which is a functional phase with a named-consequence dialog
 * rather than something to slip into a redesign.
 *
 * A camera is created **disabled**. Enabling it is a second, separate, audited
 * decision, because that is the act that opens a connection to a recorder and
 * starts spending model calls.
 */
export function CamerasPage() {
  const client = useQueryClient();
  const [registering, setRegistering] = useState(false);
  const cameras = useQuery({ queryKey: ['cameras'], queryFn: camerasApi.list });

  const toggle = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      camerasApi.setEnabled(key, enabled),
    onSuccess: () => client.invalidateQueries({ queryKey: ['cameras'] }),
  });

  const columns = useMemo<ReadonlyArray<Column<Camera>>>(
    () => [
      {
        key: 'key',
        header: 'Camera',
        render: (c) => (
          <Link
            to={`/cameras/${encodeURIComponent(c.camera_key)}`}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
          >
            {c.camera_key}
          </Link>
        ),
        width: '10rem',
      },
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
  const dark = list.total - list.enabled;

  return (
    <>
      <PageIntro
        eyebrow="Platform"
        title="Cameras"
        standfirst="The estate, as the runtime will restore it after a restart. A disabled camera opens no connection, decodes nothing and reaches no model — so an empty finding from one means nothing was observed, not that nothing happened."
        actions={
          <PermissionGate permission={PERMISSIONS.manageCameras}>
            <Button variant="primary" onClick={() => setRegistering(true)}>
              Register a camera
            </Button>
          </PermissionGate>
        }
      />

      {/* This page and the incident ledger were structurally identical before
          Stage 5, and they ask opposite questions. An operator opens the ledger
          to read a record, so there the record leads. An administrator opens
          this page to find out how much of the estate is *actually processing*
          — the count is the question, and the rows are how you act on the
          answer. So the order here is genuinely reversed rather than
          decoratively varied, and the meter carries the same proportion the
          figures state, over the only denominator that means anything: the
          number of cameras that exist. */}
      <SectionRule
        lead
        order={2}
        label="What a restart would restore"
        detail="A disabled camera opens no connection and reaches no model. This is the difference between the estate on paper and the estate in service."
      />
      <Region order={2} style={{ marginBottom: 'var(--space-12)' }}>
        <div className="uwv-lead">
          <Plane
            className="uwv-figure-row"
            style={{ alignSelf: 'start' }}
          >
            <Figure label="Registered" scale="hero" value={list.total} detail="Camera rows this tenant holds" />
            <Figure
              label="Enabled"
              scale="lead"
              value={list.enabled}
              tone={list.enabled > 0 ? 'accent' : 'default'}
              detail="Sessions the runtime starts"
            />
            <Figure
              label="Not processed"
              scale="lead"
              value={dark}
              detail="Registered and deliberately switched off"
            />
          </Plane>
          {/* No meter here, deliberately.

              A two-segment bar over the same three numbers stated beside it
              would be a chart drawn because the column was empty, and the brief
              for this stage is explicit that a visualisation has to answer a
              question the figures do not. This one does not: "how much of the
              estate is switched off" is already legible as `1 of 3`. What the
              column is for is the consequence, which no figure states. */}
          <p
            style={{
              alignSelf: 'start',
              fontSize: 'var(--text-sm)',
              color: 'var(--ink-secondary)',
              lineHeight: 'var(--leading-relaxed)',
              maxWidth: 'var(--measure)',
            }}
          >
            A disabled camera opens no connection, decodes nothing and reaches no
            model. An empty finding from one means <strong>nothing was observed</strong>,
            not that nothing happened — which is why the two counts are kept apart
            here rather than summarised into one.
          </p>
        </div>
      </Region>

      <SectionRule
        order={3}
        label="The register"
        detail="Each row carries a credential reference, never a credential. The URI shown is redacted at the server. A camera key opens that camera's own page."
      />

      <Region order={3}>
        <Plane padded={false} style={{ overflow: 'hidden' }}>
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
        </Plane>

        {toggle.isError ? (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Failed error={toggle.error} />
          </div>
        ) : null}
      </Region>

      <RegisterCamera
        open={registering}
        onClose={() => setRegistering(false)}
        onCreated={() => {
          client.invalidateQueries({ queryKey: ['cameras'] });
          setRegistering(false);
        }}
      />
    </>
  );
}

/**
 * Registering a camera.
 *
 * The credential is a **reference** — `env:CCTV_PASSWORD` — and never a
 * password. There is no password field on this form and there is no code path
 * through the client that would carry one: the dialling URL is assembled on the
 * server from a secret it resolves itself, which is why the list can show a
 * redacted URI at all.
 */
function RegisterCamera({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [draft, setDraft] = useState({
    camera_key: '',
    name: '',
    channel: '1',
    restaurant_id: '',
    credential_ref: '',
    purpose: '',
  });

  const create = useMutation({
    mutationFn: () =>
      camerasApi.create({
        camera_key: draft.camera_key.trim(),
        name: draft.name.trim(),
        channel: Number(draft.channel),
        restaurant_id: draft.restaurant_id.trim(),
        credential_ref: draft.credential_ref.trim() || undefined,
        purpose: draft.purpose.trim() || undefined,
      }),
    onSuccess: onCreated,
  });

  const ready =
    draft.camera_key.trim().length > 0 &&
    draft.restaurant_id.trim().length > 0 &&
    Number.isFinite(Number(draft.channel));

  const set = (key: keyof typeof draft) => (event: { target: { value: string } }) =>
    setDraft((current) => ({ ...current, [key]: event.target.value }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Register a camera"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={create.isPending} disabled={!ready} onClick={() => create.mutate()}>
            Register, disabled
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-secondary)' }}>
          The camera is created <strong>disabled</strong>. It will open no connection and decode
          nothing until somebody enables it, which is a separate audited act.
        </p>
        <Input label="Camera key" hint="Stable identifier, e.g. cam-07" value={draft.camera_key} onChange={set('camera_key')} />
        <Input label="Name" hint="What an operator calls it" value={draft.name} onChange={set('name')} />
        <Input label="Channel" hint="The DVR channel this camera is wired to" value={draft.channel} onChange={set('channel')} />
        <Input label="Restaurant" hint="The site this camera belongs to" value={draft.restaurant_id} onChange={set('restaurant_id')} />
        <Input
          label="Credential reference"
          hint="A pointer such as env:CCTV_PASSWORD. Never a password — this form has no field for one."
          value={draft.credential_ref}
          onChange={set('credential_ref')}
        />
        <Input label="Purpose" hint="Why this camera is watched. Shown wherever its findings appear." value={draft.purpose} onChange={set('purpose')} />
        {create.isError ? <Failed error={create.error} /> : null}
      </div>
    </Modal>
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

/**
 * The incident ledger.
 *
 * ### Alerts and Incidents are both kept, and they are not the same surface
 *
 * Alerts answers *is anything wrong right now, and can I see it* — active and
 * acknowledged, severity-ordered, evidence exhibit in place. This is the
 * ledger: every status, the resolution and its stated reason, and an address
 * per incident. Stage 1 found the overlap; the fix was never de-duplication,
 * it was the edge between them and a clear division of labour.
 *
 * ### The eight questions now live in one component
 *
 * `IncidentReadout` answers WHAT / WHERE / WHEN / WHO / WHY / EVIDENCE /
 * ACTION / STATUS, in the order `UI_UX_ARCHITECTURE.md` §6 sets out, and both
 * this page and `/incidents/:id` render it. Before Stage 3 the plan's
 * designated *primary* working surface answered three of the eight while
 * Alerts answered all of them.
 */
export function IncidentsPage() {
  const client = useQueryClient();
  const [filter, setFilter] = useState<IncidentStatus | 'all'>('active');
  const [open, setOpen] = useState<Incident | null>(null);

  const incidents = useQuery({
    queryKey: ['incidents', filter],
    queryFn: () => incidentsApi.list(filter === 'all' ? undefined : filter),
  });

  const refresh = () => {
    client.invalidateQueries({ queryKey: ['incidents'] });
    setOpen(null);
  };

  const columns: ReadonlyArray<Column<Incident>> = [
    {
      key: 'severity',
      header: '',
      render: (i) => <SeverityBadge severity={(i.severity as Severity) ?? 'info'} />,
      width: '7rem',
    },
    {
      key: 'summary',
      header: 'What',
      render: (i) => (
        // The row's own address. This is what makes an incident linkable from
        // an alert, a report figure or — when it exists — a notification.
        <Link
          to={`/incidents/${encodeURIComponent(i.id)}`}
          style={{ color: 'var(--ink-primary)', textDecoration: 'none', fontWeight: 'var(--weight-medium)' }}
        >
          {i.summary || i.rule_id}
        </Link>
      ),
    },
    {
      key: 'camera',
      header: 'Where',
      render: (i) => (
        <Link to={`/cameras/${encodeURIComponent(i.camera_key)}`} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
          {i.camera_key}
        </Link>
      ),
      width: '10rem',
    },
    { key: 'observed', header: 'When', render: (i) => when(i.observed_at), width: '12rem' },
    {
      key: 'status',
      header: 'Status',
      render: (i) => <StatusBadge tone={statusTone(i.status)}>{i.status}</StatusBadge>,
      width: '9rem',
    },
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

  const rows = incidents.data.incidents;
  const bySeverity = (level: string) => rows.filter((i) => i.severity === level).length;

  return (
    <>
      <PageIntro
        eyebrow="Operations"
        title="Incidents"
        standfirst="The ledger. Each incident freezes the finding that raised it, so it stays explicable after the rules change."
        actions={
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
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

      {/* The ledger leads, and it leads on a plane.

          Stage 5's critique put this page and the Cameras page side by side and
          found them structurally identical: eyebrow, display title, standfirst,
          a row of four equally-weighted figures, a rule, a table. Two pages
          about entirely different things, composed the same way, because the
          composition had not been decided — it had been inherited.

          An incident ledger is a record being examined. So the record is the
          first thing, it sits on its own ground, and the arithmetic about it
          comes afterwards, where arithmetic belongs. */}
      <SectionRule
        lead
        order={2}
        label="The ledger"
        detail="Newest first, as the store returns them. A row opens at its own address; Inspect reads it here."
      />
      <Region order={2} style={{ marginBottom: 'var(--space-12)' }}>
        <Plane padded={false} style={{ overflow: 'hidden' }}>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(incident) => incident.id}
            caption="Incidents in this organisation, with severity, what happened, camera, time observed, status and evidence count"
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
        </Plane>
      </Region>

      {rows.length > 0 ? (
        <>
          <SectionRule
            order={3}
            label="What is in this view"
            detail="The severity spread of the rows above, over their own count — never over a total this filter is not showing."
          />
          <Region order={3}>
            <div className="uwv-lead">
              <Meter
                caption={`Severity of the ${rows.length} incident(s) in this view`}
                total={rows.length}
                emptyNote="This filter selects no incident, so there is no spread to draw."
                segments={SEVERITY_ORDER.map((level) => ({
                  key: level,
                  label: level,
                  value: bySeverity(level),
                  color: `var(--severity-${level})`,
                }))}
              />
              <Plane
                style={{
                  display: 'grid',
                  gap: 'var(--space-6)',
                  alignContent: 'start',
                  alignSelf: 'start',
                }}
              >
                <Figure
                  label="In this view"
                  scale="hero"
                  value={rows.length}
                  detail={filter === 'all' ? 'Every status' : `Status: ${filter}`}
                />
                <Figure
                  label="With evidence"
                  scale="quiet"
                  value={rows.filter((i) => i.evidence_refs.length > 0).length}
                  detail="Imagery was retained and can be produced"
                />
              </Plane>
            </div>
          </Region>
        </>
      ) : null}

      <Drawer
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open ? open.summary || open.rule_id : ''}
      >
        {open ? <IncidentReadout incident={open} onChanged={refresh} compact /> : null}
      </Drawer>
    </>
  );
}

/**
 * Severity, most serious first.
 *
 * The same order `SeverityBadge` and the Command Center's rank use. Declared
 * once here so the meter's segments cannot drift out of step with the badges in
 * the rows immediately above it.
 */
const SEVERITY_ORDER: ReadonlyArray<Severity> = ['critical', 'high', 'medium', 'low', 'info'];

/* ── one incident, at its own address ─────────────────────────────────────── */

/**
 * The incident detail route.
 *
 * Additive, and gated by exactly the permission the list is gated by: an object
 * route must never become a way in to something the list would refuse.
 *
 * It re-reads the incident by id rather than accepting one through router
 * state, so a pasted link, a bookmark and a browser refresh all behave the
 * same — which is the entire point of the address existing.
 */
export function IncidentDetailPage() {
  const { incidentId = '' } = useParams();
  const client = useQueryClient();

  const incident = useQuery({
    queryKey: ['incident', incidentId],
    queryFn: () => incidentsApi.get(incidentId),
    enabled: incidentId.length > 0,
    retry: false,
  });

  if (incident.isPending) return <LoadingState label="Loading incident" />;
  if (incident.isError) {
    return (
      <>
        <PageIntro eyebrow="Operations · Incident" title="Not available" />
        <Failed error={incident.error} />
      </>
    );
  }

  const data = incident.data;

  return (
    <>
      <PageIntro
        eyebrow="Operations · Incident"
        title={data.summary || data.rule_id}
        meta={
          <>
            <SeverityBadge severity={(data.severity as Severity) ?? 'info'} />
            <StatusBadge tone={statusTone(data.status)}>{data.status}</StatusBadge>
            <Badge mono>{data.id}</Badge>
          </>
        }
        actions={
          <Link to="/incidents" style={{ textDecoration: 'none' }}>
            <GoTo>Back to the ledger</GoTo>
          </Link>
        }
      />

      <div className="uwv-rail">
        <IncidentReadout
          incident={data}
          onChanged={() => client.invalidateQueries({ queryKey: ['incident', incidentId] })}
        />
        <IncidentContext incident={data} />
      </div>
    </>
  );
}

/**
 * Where an incident sits in the rest of the product.
 *
 * Stage 1's finding was that nineteen pages shared one link. These are four of
 * the twenty-two edges: the camera that raised it, that camera live, each piece
 * of evidence it cites, and the audit trail for the incident itself. Every one
 * uses an API that already existed.
 */
function IncidentContext({ incident }: { incident: Incident }) {
  return (
    <aside style={{ display: 'grid', gap: 'var(--space-5)', alignContent: 'start' }}>
      <div>
        <Eyebrow>Investigate next</Eyebrow>
        <ul style={{ display: 'grid', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
          <li>
            <Link to={`/cameras/${encodeURIComponent(incident.camera_key)}`} style={{ textDecoration: 'none' }}>
              <GoTo>The camera that raised it</GoTo>
            </Link>
          </li>
          <li>
            <Link to="/live" style={{ textDecoration: 'none' }}>
              <GoTo>Watch that camera now</GoTo>
            </Link>
          </li>
          <PermissionGate permission={PERMISSIONS.viewAudit}>
            <li>
              <Link
                to={`/audit?resource_type=incident&resource_id=${encodeURIComponent(incident.id)}`}
                style={{ textDecoration: 'none' }}
              >
                <GoTo>Who has touched this incident</GoTo>
              </Link>
            </li>
          </PermissionGate>
        </ul>
      </div>

      <div>
        <Eyebrow>Provenance</Eyebrow>
        <div style={{ marginTop: 'var(--space-3)' }}>
          <KeyValue
            items={[
              { key: 'Rule', value: incident.rule_id },
              { key: 'Rule set', value: incident.ruleset_version || '—' },
              { key: 'Subject', value: incident.object_id || '—' },
              { key: 'Track', value: incident.track_id || '—' },
              { key: 'Raised', value: when(incident.created_at) },
            ]}
          />
        </div>
      </div>
    </aside>
  );
}

/**
 * The eight operator questions, once, shared by the drawer and the route.
 *
 * WHY is assembled from the **frozen** finding rather than recomputed, so an
 * incident raised six months ago still explains itself in the words of the
 * ruleset that raised it. The raw snapshot stays available underneath, because
 * a structured reading of a stored document should never be the only way to
 * see the document.
 */
function IncidentReadout({
  incident,
  onChanged,
  compact = false,
}: {
  incident: Incident;
  onChanged: () => void;
  compact?: boolean;
}) {
  const [note, setNote] = useState('');

  const acknowledge = useMutation({
    mutationFn: (id: string) => incidentsApi.acknowledge(id),
    onSuccess: () => {
      setNote('');
      onChanged();
    },
  });
  const resolve = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => incidentsApi.resolve(id, reason),
    onSuccess: () => {
      setNote('');
      onChanged();
    },
  });

  const conditions = failedConditions(incident);

  return (
    <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
      <FindingReadout
        severity={(incident.severity as Severity) ?? 'info'}
        status={<StatusBadge tone={statusTone(incident.status)}>{incident.status}</StatusBadge>}
        rows={[
          {
            key: 'where',
            label: 'Where',
            value: (
              <Link to={`/cameras/${encodeURIComponent(incident.camera_key)}`} style={{ fontFamily: 'var(--font-mono)' }}>
                {incident.camera_key}
              </Link>
            ),
          },
          { key: 'when', label: 'When', value: when(incident.observed_at) },
          { key: 'who', label: 'Who', value: incident.object_id || '—' },
          {
            key: 'closed',
            label: 'Closed',
            value:
              incident.resolved_by === null
                ? '—'
                : // Which of the two ways it closed. "The system saw it fixed"
                  // and "a manager said so" are different facts.
                  `${incident.resolved_by} (${incident.resolution_kind})`,
          },
        ]}
        why={
          <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
            {conditions.length === 0 ? (
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-secondary)' }}>
                The stored finding names no failed condition in a shape this build recognises. The
                snapshot below is what was actually written.
              </p>
            ) : (
              <ul style={{ display: 'grid', gap: 'var(--space-2)' }}>
                {conditions.map((condition) => (
                  <li
                    key={condition.attribute}
                    style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}
                  >
                    <span style={{ fontSize: 'var(--text-sm)' }}>{attributeLabel(condition.attribute)}</span>
                    <StateBadge value={condition.observed} />
                  </li>
                ))}
              </ul>
            )}
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)', maxWidth: 'var(--measure)' }}>
              Rule <span style={{ fontFamily: 'var(--font-mono)' }}>{incident.rule_id}</span>
              {incident.ruleset_version ? (
                <>
                  {' '}
                  at <span style={{ fontFamily: 'var(--font-mono)' }}>{incident.ruleset_version}</span>
                </>
              ) : null}
              . Frozen when the incident was raised. Never recomputed against today&rsquo;s rules.
            </p>
            <JsonViewer data={incident.finding} label="Finding snapshot" />
          </div>
        }
        evidence={
          <div>
            <Eyebrow>Evidence</Eyebrow>
            {incident.evidence_refs.length === 0 ? (
              <p style={{ color: 'var(--ink-tertiary)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-3)' }}>
                No evidence was retained for this incident.
              </p>
            ) : (
              <>
                <p
                  style={{
                    color: 'var(--ink-tertiary)',
                    fontSize: 'var(--text-xs)',
                    marginTop: 'var(--space-2)',
                    maxWidth: 'var(--measure)',
                  }}
                >
                  Handles only. Opening one is a separate, audited act against an identifiable
                  person&rsquo;s likeness — so nothing here loads a picture by itself.
                </p>
                <ul style={{ display: 'grid', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                  {incident.evidence_refs.map((ref) => (
                    <li key={ref}>
                      <PermissionGate
                        permission={PERMISSIONS.viewEvidence}
                        fallback={
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)' }}>
                            {ref}
                          </span>
                        }
                      >
                        <Link
                          to={`/evidence/${encodeURIComponent(ref)}`}
                          style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
                        >
                          {ref}
                        </Link>
                      </PermissionGate>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        }
        actions={
          incident.status !== 'resolved' ? (
            <div style={{ display: 'grid', gap: 'var(--space-3)', width: compact ? '100%' : 'auto', maxWidth: '28rem' }}>
              <PermissionGate permission={PERMISSIONS.acknowledgeIncidents}>
                <Button
                  variant="secondary"
                  loading={acknowledge.isPending}
                  disabled={incident.status === 'acknowledged'}
                  onClick={() => acknowledge.mutate(incident.id)}
                >
                  {incident.status === 'acknowledged' ? 'Already acknowledged' : 'Acknowledge'}
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
                  onClick={() => resolve.mutate({ id: incident.id, reason: note.trim() })}
                >
                  Resolve
                </Button>
              </PermissionGate>
            </div>
          ) : (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-secondary)', maxWidth: 'var(--measure)' }}>
              Closed. {incident.resolution_note || 'No reason was recorded.'}
            </p>
          )
        }
      />

      {resolve.isError ? <Failed error={resolve.error} /> : null}
      {acknowledge.isError ? <Failed error={acknowledge.error} /> : null}
    </div>
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

      {/* The two edges out of an evidence record. "Who else has looked at
          this" is the product's own governance question and was unaskable
          until Stage 3 gave `auditApi.forResource` a consumer — the backend
          could always answer it. */}
      <div style={{ display: 'flex', gap: 'var(--space-5)', flexWrap: 'wrap', marginBottom: 'var(--space-5)' }}>
        <Link to={`/cameras/${encodeURIComponent(current.camera_key)}`} style={{ textDecoration: 'none' }}>
          <GoTo>The camera that captured it</GoTo>
        </Link>
        <PermissionGate permission={PERMISSIONS.viewAudit}>
          <Link
            to={`/audit?resource_type=evidence&resource_id=${encodeURIComponent(current.evidence_ref)}`}
            style={{ textDecoration: 'none' }}
          >
            <GoTo>Who else has viewed this</GoTo>
          </Link>
        </PermissionGate>
      </div>

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
  /**
   * The trail, optionally narrowed to one resource.
   *
   * `auditApi.forResource` has existed since Phase 1 with zero call sites,
   * which meant the product could not answer its own governance question —
   * *who else has looked at this evidence* — even though the backend could.
   * The filter arrives by query string so the answer is a link an incident, a
   * camera or an evidence record can hand you.
   */
  const [params, setParams] = useSearchParams();
  const resourceType = params.get('resource_type') ?? '';
  const resourceId = params.get('resource_id') ?? '';
  const scoped = resourceType.length > 0 && resourceId.length > 0;

  const events = useQuery({
    queryKey: scoped ? ['audit', resourceType, resourceId] : ['audit'],
    queryFn: () =>
      scoped ? auditApi.forResource(resourceType, resourceId) : auditApi.list(200),
  });

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
      <PageIntro
        eyebrow="Compliance"
        title="Audit Trail"
        standfirst="Append-only. Every row here was written once and never edited — a correction is another row. Retention prunes whole aged rows and never rewrites a surviving one."
        meta={
          scoped ? (
            <>
              <Badge mono>
                {resourceType} · {resourceId}
              </Badge>
              <Button size="sm" variant="ghost" onClick={() => setParams({})}>
                Show the whole trail
              </Button>
            </>
          ) : null
        }
      />

      {scoped ? (
        <p
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--ink-secondary)',
            maxWidth: 'var(--measure)',
            marginBottom: 'var(--space-6)',
          }}
        >
          Narrowed to one resource. An empty result here means no event was recorded against it —
          not that access was refused and not that the resource is unknown.
        </p>
      ) : null}

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

/* ── one evidence record, at its own address ──────────────────────────────── */

/**
 * The evidence detail route.
 *
 * **Arriving here does not retrieve an image.** The route resolves the
 * *record* — retention state, expiry, hash, size, the incident it belongs to —
 * and the imagery still requires the explicit request it always did. That
 * distinction is the whole reason this route was allowed to exist: an address
 * that fetched a picture on navigation would turn a link in an email into an
 * audit row against a named person's likeness, fired by a mail client's link
 * preview.
 *
 * The lookup form on `/evidence` is unchanged and still works. This is the same
 * record reached by link instead of by pasting a handle.
 */
export function EvidenceDetailPage() {
  const { evidenceRef = '' } = useParams();

  const evidence = useQuery({
    queryKey: ['evidence', evidenceRef],
    queryFn: () => evidenceApi.metadata(evidenceRef),
    enabled: evidenceRef.length > 0,
    retry: false,
  });

  return (
    <>
      <PageIntro
        eyebrow="Compliance · Evidence"
        title="Evidence record"
        standfirst="The record, not the picture. Retrieving the imagery is a separate act against an identifiable person's likeness, and it is recorded when you ask for it — never because this page loaded."
        meta={<Badge mono>{evidenceRef}</Badge>}
        actions={
          <Link to="/evidence" style={{ textDecoration: 'none' }}>
            <GoTo>Look up another</GoTo>
          </Link>
        }
      />

      {evidence.isPending ? <LoadingState label="Loading evidence record" /> : null}
      {evidence.isError ? <Failed error={evidence.error} /> : null}
      {evidence.isSuccess ? <EvidenceRecord record={evidence.data} /> : null}
    </>
  );
}

/* ── one camera, at its own address ───────────────────────────────────────── */

/**
 * The camera detail route.
 *
 * The junction the product did not have. A camera is where an incident
 * happened, what a wall tile shows, and the thing whose frames were retained —
 * and until Stage 3 none of those could be reached from any of the others.
 *
 * Two dead client methods find a consumer here. `framesApi.forCamera` has
 * existed since Phase 2 with zero call sites; `wallApi.detail` gives the live
 * state without opening a stream. Neither is a new endpoint.
 */
export function CameraDetailPage() {
  const { cameraKey = '' } = useParams();

  const cameras = useQuery({ queryKey: ['cameras'], queryFn: camerasApi.list });
  const frames = useQuery({
    queryKey: ['frames', cameraKey],
    queryFn: () => framesApi.forCamera(cameraKey, 25),
    enabled: cameraKey.length > 0,
    retry: false,
  });
  // The wall's view of the same camera. Metadata only — no ticket is requested
  // and no stream is opened, so visiting this page starts no video.
  const live = useQuery({
    queryKey: ['wall', 'camera', cameraKey],
    queryFn: () => wallApi.detail(cameraKey),
    enabled: cameraKey.length > 0,
    retry: false,
  });
  const incidents = useQuery({
    queryKey: ['incidents', 'all'],
    queryFn: () => incidentsApi.list(),
    retry: false,
  });

  if (cameras.isPending) return <LoadingState label="Loading camera" />;
  if (cameras.isError) return <Failed error={cameras.error} />;

  const camera = cameras.data.cameras.find((c) => c.camera_key === cameraKey);

  if (!camera) {
    return (
      <>
        <PageIntro eyebrow="Platform · Camera" title="Not in this estate" meta={<Badge mono>{cameraKey}</Badge>} />
        <EmptyState
          title="No camera with that key"
          body="It may have been retired, or it may belong to an organisation this account does not reach. Nothing is being hidden — the estate simply has no row with this key."
        />
      </>
    );
  }

  const here = incidents.isSuccess
    ? incidents.data.incidents.filter((i) => i.camera_key === cameraKey)
    : null;

  return (
    <>
      <PageIntro
        eyebrow="Platform · Camera"
        title={camera.name || camera.camera_key}
        standfirst={camera.purpose || 'No stated purpose is recorded for this camera.'}
        meta={
          <>
            <Badge mono>{camera.camera_key}</Badge>
            {camera.enabled ? (
              <StatusBadge tone="online">Enabled</StatusBadge>
            ) : (
              <StatusBadge tone="idle">Disabled — opens no connection</StatusBadge>
            )}
            <Badge>channel {camera.channel}</Badge>
            <Badge>{camera.stream_type}</Badge>
          </>
        }
        actions={
          <Link to="/cameras" style={{ textDecoration: 'none' }}>
            <GoTo>Back to the estate</GoTo>
          </Link>
        }
      />

      <div className="uwv-rail">
        <div style={{ display: 'grid', gap: 'var(--space-8)' }}>
          <div>
            <SectionRule
              label="Live state"
              detail="What the server's own session reports. No stream is opened by this page."
              actions={
                <Link to="/live" style={{ textDecoration: 'none' }}>
                  <GoTo>Watch on the wall</GoTo>
                </Link>
              }
            />
            {live.isSuccess ? (
              <CameraSurface
                name={live.data.name || camera.camera_key}
                identifier={camera.camera_key}
                context={`channel ${live.data.channel} · ${live.data.stream_type}`}
                tone={streamTone(live.data.state)}
                stateLabel={STREAM_STATE_LABEL[live.data.state]}
                media={
                  <span
                    style={{
                      color: 'var(--video-ink)',
                      fontSize: 'var(--text-xs)',
                      textAlign: 'center',
                      padding: 'var(--space-5)',
                      maxWidth: '32ch',
                    }}
                  >
                    No picture is opened here. Streaming is an act with a cost on the recorder, so
                    it happens on the wall where somebody chose to watch.
                  </span>
                }
                meta={
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    {live.data.frames_decoded} frames · {live.data.reconnects} reconnects ·{' '}
                    {live.data.seconds_since_frame === null
                      ? 'no frame yet'
                      : `${live.data.seconds_since_frame}s since last frame`}
                  </span>
                }
              />
            ) : (
              <UnavailableSlot
                title="Live state is not readable"
                body="The wall API did not answer for this camera. That is a statement about this request, not about the camera."
              />
            )}
          </div>

          <div>
            <SectionRule
              label="Incidents raised here"
              detail="Every status. Each opens at its own address."
            />
            {here === null ? (
              <UnavailableSlot
                title="Incidents could not be read"
                body="Nothing is being claimed about whether this camera has raised any."
              />
            ) : here.length === 0 ? (
              <EmptyState
                title="No incident from this camera"
                body={
                  camera.enabled
                    ? 'This camera is enabled and has raised nothing. That is a real reading of the ledger.'
                    : 'This camera is disabled, so it opens no connection and reaches no model. An empty result here means nothing was observed, not that nothing happened.'
                }
              />
            ) : (
              <ul style={{ display: 'grid', gap: 'var(--space-3)' }}>
                {here.slice(0, 8).map((incident) => (
                  <li key={incident.id}>
                    <Link
                      to={`/incidents/${encodeURIComponent(incident.id)}`}
                      className="uwv-row"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-4)',
                        padding: 'var(--space-3) var(--space-4)',
                        border: '1px solid var(--line-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        textDecoration: 'none',
                        color: 'var(--ink-primary)',
                        flexWrap: 'wrap',
                      }}
                    >
                      <SeverityBadge severity={(incident.severity as Severity) ?? 'info'} />
                      <span style={{ flex: 1, minWidth: '10rem', fontSize: 'var(--text-sm)' }}>
                        {incident.summary || incident.rule_id}
                      </span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)' }}>
                        {when(incident.observed_at)}
                      </span>
                      <StatusBadge tone={statusTone(incident.status)}>{incident.status}</StatusBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <SectionRule
              label="Retained frames"
              detail="What the store kept, newest first. A frame record is metadata — no imagery is served from this list."
            />
            {frames.isError ? (
              <UnavailableSlot
                title="Frame history is not readable"
                body="The frame store did not answer. This is not a report that no frames were retained."
              />
            ) : frames.isPending ? (
              <LoadingState label="Loading frame history" />
            ) : frames.data.frames.length === 0 ? (
              <EmptyState
                title="No frame retained"
                body="Retention keeps frames for a bounded window, and nothing from this camera is currently inside it."
              />
            ) : (
              <DataTable
                columns={FRAME_COLUMNS}
                rows={frames.data.frames}
                rowKey={(frame) => frame.frame_ref}
                caption="Retained frames for this camera, newest first"
              />
            )}
          </div>
        </div>

        <aside style={{ display: 'grid', gap: 'var(--space-5)', alignContent: 'start' }}>
          <div>
            <Eyebrow>Configuration</Eyebrow>
            <div style={{ marginTop: 'var(--space-3)' }}>
              <KeyValue
                items={[
                  { key: 'Restaurant', value: camera.restaurant_id },
                  { key: 'Zone', value: camera.zone_id ?? 'none recorded' },
                  { key: 'Analysis', value: `${camera.analysis_fps} fps` },
                  // A pointer, never a credential. The dialling URL never leaves
                  // the server; what is shown is redacted there.
                  { key: 'Credential', value: camera.credential_ref || 'none' },
                  { key: 'URI', value: camera.uri },
                  { key: 'Registered', value: when(camera.created_at) },
                ]}
              />
            </div>
          </div>

          <PermissionGate permission={PERMISSIONS.viewAudit}>
            <div>
              <Eyebrow>Governance</Eyebrow>
              <ul style={{ display: 'grid', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
                <li>
                  <Link
                    to={`/audit?resource_type=camera&resource_id=${encodeURIComponent(camera.camera_key)}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <GoTo>Who has changed this camera</GoTo>
                  </Link>
                </li>
              </ul>
            </div>
          </PermissionGate>
        </aside>
      </div>
    </>
  );
}

const FRAME_COLUMNS: ReadonlyArray<Column<import('@shared/api/persistence').FrameRecord>> = [
  { key: 'captured', header: 'Captured', render: (f) => when(f.captured_at), width: '13rem' },
  {
    key: 'lag',
    header: 'Queue lag',
    // Two clocks, and the gap between them is the honest measure of delay.
    // Rendered as an em dash when either is missing rather than as zero.
    render: (f) => {
      if (!f.captured_at || !f.received_at) return '—';
      const lag = new Date(f.received_at).getTime() - new Date(f.captured_at).getTime();
      return Number.isNaN(lag) ? '—' : `${(lag / 1000).toFixed(2)}s`;
    },
    numeric: true,
    width: '8rem',
  },
  { key: 'size', header: 'Size', render: (f) => `${f.width}×${f.height}`, width: '8rem' },
  { key: 'observations', header: 'Observations', render: (f) => f.observation_count, numeric: true, width: '9rem' },
  { key: 'source', header: 'Source', render: (f) => <Badge>{f.source_kind}</Badge>, width: '7rem' },
];

/**
 * A region that could not be read, sized for a section rather than a page.
 *
 * `UnavailableState` fills a page. Inside a composition it would dominate the
 * regions that *did* load, which inverts the hierarchy — so this says the same
 * thing at the weight of the region it replaces.
 */
function UnavailableSlot({ title, body }: { title: string; body: string }) {
  return (
    <div
      role="status"
      style={{
        border: '1px dashed var(--line-default)',
        borderRadius: 'var(--radius-sm)',
        padding: 'var(--space-5)',
        background: 'var(--surface-sunken)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <span style={{ color: 'var(--health-degraded)', display: 'flex', flexShrink: 0 }}>
          <Icon icon={StatusIcons.unavailable} size="control" />
        </span>
        <span style={{ fontWeight: 'var(--weight-medium)', fontSize: 'var(--text-sm)' }}>{title}</span>
      </div>
      <p style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)', maxWidth: 'var(--measure)' }}>
        {body}
      </p>
    </div>
  );
}

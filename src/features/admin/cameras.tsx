/**
 * Cameras — the list, and one camera's own management surface.
 *
 * A camera page has to hold three different kinds of fact at once, and the
 * previous single flat panel could not: what this camera *is* (identity and
 * placement), how it is *reached* (an address and a credential pointer), and
 * what is *happening to the video* (streaming, analysis). Plus one act that is
 * different in kind from all of them — retirement, which destroys the
 * observation record and cannot be undone.
 *
 * So: tabs for the three, and a danger zone for the fourth, behind a typed
 * confirmation and its own permission.
 *
 * ### Editing from the list
 *
 * Each row has an Edit button that opens that camera's details — name, zone,
 * recorder, channel, stream, Live Wall frame rate and purpose — in a dialog, so
 * a camera can be corrected without leaving the list. Only what changed is
 * sent, and a change to what a switched-on camera dials reconnects it at once.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { organizationApi } from '@shared/api/observations';
import { camerasApi, type Camera, type CameraLifecycleResult, type ConnectionTest } from '@shared/api/persistence';
import { recordersApi } from '@shared/api/recorders';
import { PERMISSIONS } from '@app/permissions/permissions';
import { PermissionGate, usePermissions } from '@app/permissions/guards';
import {
  Badge,
  Button,
  type Column,
  DataTable,
  EmptyState,
  Input,
  LoadingState,
  Modal,
  Select,
  StatusBadge,
  useToast,
} from '@shared/ui/primitives';
import { Figure, PageIntro, Plane, Region, SectionRule } from '@shared/ui/product';

import {
  CredentialState,
  DEFAULT_WALL_FPS,
  FrameRateSelect,
  friendly,
  RecorderStatus,
  STREAM_LABEL,
  TestResult,
} from './recorder-parts';
import { DangerConfirm, Failed, ObjectTabs, SearchField, useDebounced, when } from './shared';

/* ── the list ─────────────────────────────────────────────────────────────── */

export function AdminCamerasPage() {
  const { has } = usePermissions();
  const canManage = has(PERMISSIONS.manageCameras);
  const [editing, setEditing] = useState<Camera | null>(null);
  const [search, setSearch] = useState('');
  const [showing, setShowing] = useState<'all' | 'on' | 'off'>('all');
  const q = useDebounced(search).trim().toLowerCase();

  const cameras = useQuery({ queryKey: ['cameras'], queryFn: camerasApi.list });
  const zones = useQuery({
    queryKey: ['zones', 'all'],
    queryFn: () => organizationApi.zones({ limit: 200 }),
  });
  const zoneName = useMemo(() => {
    const byId = new Map((zones.data?.zones ?? []).map((zone) => [zone.id, zone.name]));
    // A camera always has a zone, but the list can render before the zones
    // arrive: an em dash is honest for one render, a wrong name is not.
    return (id: string) => byId.get(id) ?? '—';
  }, [zones.data]);

  const rows = useMemo(() => {
    let found = cameras.data?.cameras ?? [];
    if (q) {
      found = found.filter(
        (camera) =>
          camera.name.toLowerCase().includes(q) || camera.camera_key.toLowerCase().includes(q),
      );
    }
    if (showing !== 'all') {
      found = found.filter((camera) => (showing === 'on' ? camera.enabled : !camera.enabled));
    }
    return found;
  }, [cameras.data, q, showing]);

  const columns: ReadonlyArray<Column<Camera>> = [
    {
      key: 'name',
      header: 'Camera',
      render: (camera) => (
        <Link to={`/admin/cameras/${encodeURIComponent(camera.camera_key)}`}>{camera.name}</Link>
      ),
    },
    { key: 'key', header: 'Key', render: (camera) => <Badge>{camera.camera_key}</Badge> },
    { key: 'zone', header: 'Zone', render: (camera) => zoneName(camera.zone_id) },
    // A channel number means nothing without the box it is a channel of.
    {
      key: 'recorder',
      header: 'Recorder',
      render: (camera) => (
        <Link to={`/admin/recorders/${encodeURIComponent(camera.recorder_id)}`}>
          {camera.recorder_name || '—'}
        </Link>
      ),
    },
    { key: 'channel', header: 'Channel', render: (camera) => camera.channel },
    {
      key: 'state',
      header: 'Streaming',
      render: (camera) => (
        <StatusBadge tone={camera.enabled ? 'online' : 'idle'}>
          {camera.enabled ? 'On' : 'Off'}
        </StatusBadge>
      ),
    },
    {
      key: 'analysis',
      header: 'Analysed',
      render: (camera) => (camera.analysis_enabled ? 'Yes' : 'No'),
    },
    {
      key: 'wall_fps',
      header: 'Live Wall',
      numeric: true,
      // A server that does not send the rate is a rate nobody knows: a dash,
      // never "undefined fps" and never a guessed default.
      render: (camera) => (typeof camera.wall_fps === 'number' ? `${camera.wall_fps} fps` : '—'),
    },
    ...(canManage
      ? [
          {
            key: 'edit',
            header: 'Edit',
            render: (camera: Camera) => (
              <Button size="sm" aria-label={`Edit ${camera.name}`} onClick={() => setEditing(camera)}>
                Edit
              </Button>
            ),
          },
        ]
      : []),
  ];

  const total = cameras.data?.cameras.length ?? 0;
  const on = cameras.data?.enabled ?? 0;

  return (
    <>
      <PageIntro
        eyebrow="Estate"
        title="Cameras"
        standfirst="Every configured camera in this organization, whether or not it is currently switched on."
        actions={
          <PermissionGate permission={PERMISSIONS.manageCameras}>
            <Link to="/admin/cameras/new">
              <Button>Add a camera</Button>
            </Link>
          </PermissionGate>
        }
      />

      <Region order={2}>
        <SectionRule label="The estate" />
        <Plane>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(11rem, 100%), 1fr))',
              gap: 'var(--space-6)',
            }}
          >
            <Figure scale="lead" label="Configured" value={String(total)} />
            <Figure
              scale="lead"
              label="Switched on"
              value={`${on} of ${total}`}
              detail="A camera that is off opens no connection and costs nothing."
            />
            <Figure
              scale="lead"
              label="Analysed"
              value={String(
                (cameras.data?.cameras ?? []).filter((c) => c.enabled && c.analysis_enabled).length,
              )}
              detail="Streaming and being processed by AI are two separate decisions."
            />
          </div>
        </Plane>
      </Region>

      <Region order={3}>
        <SectionRule
          lead
          label="Cameras"
          actions={
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-3)',
                alignItems: 'flex-end',
                flexWrap: 'wrap',
              }}
            >
              <SearchField
                label="Search"
                value={search}
                placeholder="Name or key"
                onChange={setSearch}
              />
              <Select
                label="Showing"
                value={showing}
                onChange={(event) => setShowing(event.target.value as typeof showing)}
              >
                <option value="all">All</option>
                <option value="on">Switched on</option>
                <option value="off">Switched off</option>
              </Select>
            </div>
          }
        />
        <Plane>
          {cameras.isLoading ? <LoadingState label="Reading cameras" /> : null}
          {cameras.isError ? <Failed error={cameras.error} /> : null}
          {cameras.data ? (
            <DataTable
              caption="Configured cameras"
              columns={columns}
              rows={rows}
              rowKey={(camera) => camera.camera_key}
              empty={
                <EmptyState
                  title={q || showing !== 'all' ? 'Nothing matches' : 'No cameras yet'}
                  body={
                    q || showing !== 'all'
                      ? 'Try clearing the search or the filter.'
                      : has(PERMISSIONS.manageCameras)
                        ? 'Add one to start watching a kitchen.'
                        : 'Nobody has added a camera to this organization yet.'
                  }
                />
              }
            />
          ) : null}
        </Plane>
      </Region>

      {editing ? <EditCamera camera={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

/* ── editing one camera from the list ─────────────────────────────────────── */

interface EditDraft {
  name: string;
  zoneId: string;
  recorderId: string;
  channel: string;
  streamType: 'main' | 'sub';
  wallFps: number;
  purpose: string;
}

/**
 * One camera's details, editable in place.
 *
 * Opened fresh for each camera, so the fields always start from what is
 * saved. Only changed fields are sent: an edit to the name must not also
 * re-send a channel and look, in the audit trail, like a move.
 */
function EditCamera({ camera, onClose }: { camera: Camera; onClose: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const zones = useQuery({
    queryKey: ['zones', 'all'],
    queryFn: () => organizationApi.zones({ limit: 200 }),
  });
  const recorders = useQuery({
    queryKey: ['recorders', 'for-camera'],
    queryFn: () => recordersApi.list({ limit: 200 }),
  });
  const [draft, setDraft] = useState<EditDraft>({
    name: camera.name,
    zoneId: camera.zone_id,
    recorderId: camera.recorder_id,
    channel: String(camera.channel),
    streamType: camera.stream_type,
    wallFps: typeof camera.wall_fps === 'number' ? camera.wall_fps : DEFAULT_WALL_FPS,
    purpose: camera.purpose,
  });
  const set = (patch: Partial<EditDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const channel = Number(draft.channel);
  const problems = {
    name: draft.name.trim() ? undefined : 'Give this camera a name',
    channel: Number.isInteger(channel) && channel >= 1 ? undefined : 'Channel numbers start at 1',
    zone: draft.zoneId ? undefined : 'Choose where this camera is',
  };
  const valid = Object.values(problems).every((problem) => !problem);

  const changes = {
    ...(draft.name.trim() !== camera.name ? { name: draft.name.trim() } : {}),
    ...(draft.zoneId !== camera.zone_id ? { zone_id: draft.zoneId } : {}),
    ...(draft.recorderId !== camera.recorder_id ? { recorder_id: draft.recorderId } : {}),
    ...(channel !== camera.channel ? { channel } : {}),
    ...(draft.streamType !== camera.stream_type ? { stream_type: draft.streamType } : {}),
    ...(draft.wallFps !== (camera.wall_fps ?? DEFAULT_WALL_FPS) ? { wall_fps: draft.wallFps } : {}),
    ...(draft.purpose.trim() !== camera.purpose ? { purpose: draft.purpose.trim() } : {}),
  };
  const changed = Object.keys(changes).length > 0;
  const redials = 'channel' in changes || 'stream_type' in changes || 'recorder_id' in changes;

  const save = useMutation({
    mutationFn: () => camerasApi.update(camera.camera_key, changes),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: ['cameras'] });
      void client.invalidateQueries({ queryKey: ['recorders'] });
      void client.invalidateQueries({ queryKey: ['wall'] });
      const name = result.name || draft.name.trim();
      toast(
        result.reconnected
          ? `${name} saved and reconnected on channel ${result.channel}.`
          : `${name} saved.`,
      );
      onClose();
    },
  });

  const activeZones = (zones.data?.zones ?? []).filter(
    (zone) => zone.is_active || zone.id === camera.zone_id,
  );
  const recorderList = recorders.data?.recorders ?? [];

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${camera.name}`}
      footer={
        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!changed || !valid}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            Save changes
          </Button>
        </div>
      }
    >
      <form
        noValidate
        aria-label={`Edit ${camera.name}`}
        onSubmit={(event) => {
          event.preventDefault();
          if (changed && valid) save.mutate();
        }}
        style={{ display: 'grid', gap: 'var(--space-4)' }}
      >
        <Input
          id="edit-camera-name"
          label="Name"
          value={draft.name}
          error={problems.name}
          onChange={(event) => set({ name: event.target.value })}
        />
        <Select
          id="edit-camera-zone"
          label="Zone"
          value={draft.zoneId}
          onChange={(event) => set({ zoneId: event.target.value })}
        >
          {activeZones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name}
            </option>
          ))}
        </Select>
        <Select
          id="edit-camera-recorder"
          label="Recorder"
          value={draft.recorderId}
          onChange={(event) => set({ recorderId: event.target.value })}
        >
          {recorderList.length === 0 ? (
            <option value={camera.recorder_id}>{camera.recorder_name}</option>
          ) : null}
          {recorderList.map((recorder) => (
            <option key={recorder.id} value={recorder.id}>
              {recorder.name}
              {recorder.is_active ? '' : ' (inactive)'}
            </option>
          ))}
        </Select>
        <div style={{ display: 'grid', gridTemplateColumns: '9rem minmax(0, 1fr)', gap: 'var(--space-3)' }}>
          <Input
            id="edit-camera-channel"
            label="Channel"
            value={draft.channel}
            inputMode="numeric"
            error={problems.channel}
            onChange={(event) => set({ channel: event.target.value })}
          />
          <Select
            id="edit-camera-stream"
            label="Stream"
            value={draft.streamType}
            onChange={(event) => set({ streamType: event.target.value === 'main' ? 'main' : 'sub' })}
          >
            <option value="sub">{STREAM_LABEL.sub}</option>
            <option value="main">{STREAM_LABEL.main}</option>
          </Select>
        </div>
        <FrameRateSelect
          id="edit-camera-fps"
          value={draft.wallFps}
          onChange={(wallFps) => set({ wallFps })}
        />
        <Input
          id="edit-camera-purpose"
          label="Why it is watched (optional)"
          value={draft.purpose}
          onChange={(event) => set({ purpose: event.target.value })}
        />
        {redials && camera.enabled ? (
          <p role="status" style={{ margin: 0, color: 'var(--ink-secondary)', fontSize: 'var(--text-sm)' }}>
            This camera is on, so saving reconnects it to the new channel or stream straight away.
          </p>
        ) : null}
        {save.isError ? (
          <p role="alert" style={{ margin: 0, color: 'var(--severity-critical)', fontSize: 'var(--text-sm)' }}>
            {friendly(save.error, 'The camera could not be saved. Nothing was changed.')}
          </p>
        ) : null}
        {/* Enter submits without the footer's button having focus. */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}

/* ── one camera ───────────────────────────────────────────────────────────── */

export function AdminCameraDetailPage() {
  const { cameraKey = '' } = useParams();

  const cameras = useQuery({ queryKey: ['cameras'], queryFn: camerasApi.list });
  const camera = cameras.data?.cameras.find((c) => c.camera_key === cameraKey);

  if (cameras.isLoading) return <LoadingState label="Reading camera" />;
  if (cameras.isError) return <Failed error={cameras.error} />;
  if (!camera) {
    return (
      <EmptyState
        title="No such camera"
        body={`Nothing in this organization is called ${cameraKey}.`}
      />
    );
  }

  const base = `/admin/cameras/${encodeURIComponent(cameraKey)}`;

  return (
    <>
      <PageIntro
        eyebrow="Camera"
        title={camera.name}
        standfirst={
          <>
            <Badge>{camera.camera_key}</Badge> · channel {camera.channel} ·{' '}
            {camera.stream_type === 'main' ? 'main stream' : 'sub-stream'}
          </>
        }
        meta={
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <StatusBadge tone={camera.enabled ? 'online' : 'idle'}>
              {camera.enabled ? 'Streaming' : 'Off'}
            </StatusBadge>
            <StatusBadge tone={camera.analysis_enabled ? 'online' : 'idle'}>
              {camera.analysis_enabled ? 'Analysed' : 'Not analysed'}
            </StatusBadge>
          </div>
        }
        actions={<Link to="/admin/cameras">All cameras</Link>}
      />

      <Region order={2}>
        <ObjectTabs
          tabs={[
            { to: base, label: 'Overview', end: true },
            { to: `${base}/connection`, label: 'Connection' },
            { to: `${base}/placement`, label: 'Placement' },
            { to: `${base}/lifecycle`, label: 'Lifecycle' },
          ]}
        />
        <CameraSection camera={camera} />
      </Region>
    </>
  );
}

function CameraSection({ camera }: { camera: Camera }) {
  const { '*': tab = '' } = useParams();

  if (tab.startsWith('connection')) return <CameraConnection camera={camera} />;
  if (tab.startsWith('placement')) return <CameraPlacement camera={camera} />;
  if (tab.startsWith('lifecycle')) return <CameraLifecycle camera={camera} />;
  return <CameraOverview camera={camera} />;
}

function CameraOverview({ camera }: { camera: Camera }) {
  const client = useQueryClient();

  // Starting is an act, not a setting: it opens a connection to a recorder and
  // begins processing pictures of people. The result says what happened —
  // including "this deployment has live CCTV switched off", which used to be a
  // switch that flipped and changed nothing.
  const [lifecycle, setLifecycle] = useState<CameraLifecycleResult | null>(null);
  const start = useMutation({
    mutationFn: () => camerasApi.start(camera.camera_key),
    onSuccess: (result) => {
      setLifecycle(result);
      void client.invalidateQueries({ queryKey: ['cameras'] });
    },
  });
  const stop = useMutation({
    mutationFn: () => camerasApi.stop(camera.camera_key),
    onSuccess: (result) => {
      setLifecycle(result);
      void client.invalidateQueries({ queryKey: ['cameras'] });
    },
  });
  const setAnalysis = useMutation({
    mutationFn: (on: boolean) => camerasApi.setAnalysis(camera.camera_key, on),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['cameras'] }),
  });

  return (
    <>
      <SectionRule
        lead
        label="What this camera is doing"
        detail="Two switches, and they are genuinely independent."
      />
      <Plane>
        <div style={{ display: 'grid', gap: 'var(--space-6)', maxWidth: '38rem' }}>
          <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
            <div>
              <strong>{camera.enabled ? 'Watching' : 'Not watching'}</strong>
              <p style={{ margin: 'var(--space-1) 0 0', color: 'var(--text-secondary)' }}>
                {camera.enabled
                  ? 'This camera is dialled and appears on the wall.'
                  : 'Nothing is connected to this camera. Start it to open the stream.'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              {camera.enabled ? (
                <Button variant="secondary" disabled={stop.isPending} onClick={() => stop.mutate()}>
                  {stop.isPending ? 'Stopping…' : 'Stop'}
                </Button>
              ) : (
                <Button disabled={start.isPending} onClick={() => start.mutate()}>
                  {start.isPending ? 'Starting…' : 'Start watching'}
                </Button>
              )}
            </div>
            {lifecycle && !lifecycle.available ? (
              <p role="status" style={{ margin: 0, color: 'var(--state-attention, inherit)' }}>
                {lifecycle.reason}
              </p>
            ) : null}
            {lifecycle && lifecycle.available && lifecycle.reason ? (
              <p role="status" style={{ margin: 0, color: 'var(--text-secondary)' }}>
                {lifecycle.reason}
              </p>
            ) : null}
          </div>
          <Toggle
            title="Analyse the video with AI"
            body="When on, frames are processed and findings are produced. A camera can stream without this — a corridor is worth watching and not worth paying detection for."
            checked={camera.analysis_enabled}
            pending={setAnalysis.isPending}
            onChange={(next) => setAnalysis.mutate(next)}
          />
          {camera.enabled && !camera.analysis_enabled ? (
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
              This camera streams to the wall and raises nothing. That is a deliberate state, not
              a fault.
            </p>
          ) : null}
          {start.isError ? <Failed error={start.error} /> : null}
          {stop.isError ? <Failed error={stop.error} /> : null}
          {setAnalysis.isError ? <Failed error={setAnalysis.error} /> : null}
        </div>
      </Plane>

      <div style={{ marginTop: 'var(--space-8)' }}>
        <SectionRule label="Identity" />
        <Plane>
          <Facts
            rows={[
              ['Name', camera.name],
              ['Camera key', camera.camera_key],
              [
                'Runtime id',
                <>
                  <code>{camera.runtime_id}</code>
                  <span
                    style={{
                      display: 'block',
                      color: 'var(--text-muted)',
                      fontSize: 'var(--text-sm)',
                    }}
                  >
                    Globally unique. Two organizations may each have a <code>cam-01</code>; this
                    is what keeps them apart everywhere it matters.
                  </span>
                </>,
              ],
              ['Purpose', camera.purpose || 'Not stated'],
              ['Analysis rate', `${camera.analysis_fps} frames per second`],
              ['Added', when(camera.created_at)],
              ['Last changed', when(camera.updated_at)],
            ]}
          />
        </Plane>
      </div>
    </>
  );
}

/**
 * How this camera is reached — which is its recorder's business.
 *
 * The address, the account and the password belong to the recorder (the DVR
 * or NVR) this camera is plugged into, and are edited there, once, for every
 * camera on it. This section says which recorder that is and lets a camera be
 * moved to another, or to another channel or stream. It never asks where a
 * password is kept: the old version of this page did, and it put the server's
 * own configuration in front of somebody who only wanted a camera to work.
 */
function CameraConnection({ camera }: { camera: Camera }) {
  const client = useQueryClient();
  const { has } = usePermissions();
  const canManage = has(PERMISSIONS.manageCameras);
  const recorders = useQuery({
    queryKey: ['recorders', 'for-camera'],
    queryFn: () => recordersApi.list({ limit: 200 }),
    enabled: canManage,
  });
  const [recorderId, setRecorderId] = useState(camera.recorder_id);
  const [channel, setChannel] = useState(String(camera.channel));
  const [stream, setStream] = useState<'main' | 'sub'>(camera.stream_type);
  const [test, setTest] = useState<ConnectionTest | null>(null);

  const channelNumber = Number(channel);
  const channelProblem =
    !Number.isInteger(channelNumber) || channelNumber < 1 ? 'Channel numbers start at 1' : undefined;
  const changed =
    recorderId !== camera.recorder_id || channelNumber !== camera.channel || stream !== camera.stream_type;

  const probe = useMutation({
    mutationFn: () => camerasApi.testConnection({ camera_key: camera.camera_key }),
    onSuccess: setTest,
  });

  const save = useMutation({
    mutationFn: () =>
      camerasApi.update(camera.camera_key, {
        recorder_id: recorderId,
        channel: channelNumber,
        stream_type: stream,
      }),
    onSuccess: () => {
      setTest(null);
      void client.invalidateQueries({ queryKey: ['cameras'] });
      void client.invalidateQueries({ queryKey: ['recorders'] });
    },
  });

  return (
    <>
      <SectionRule
        lead
        label="Connection"
        detail="This camera is one channel on a recorder. The recorder holds the address and the password."
      />
      <Plane>
        <div style={{ display: 'grid', gap: 'var(--space-5)', maxWidth: '36rem' }}>
          <Facts
            rows={[
              [
                'Recorder',
                <span key="recorder" style={{ display: 'inline-flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <Link to={`/admin/recorders/${encodeURIComponent(camera.recorder_id)}`}>
                    {camera.recorder_name || 'Open recorder'}
                  </Link>
                  {camera.recorder_brand ? (
                    <span style={{ color: 'var(--ink-tertiary)' }}>{camera.recorder_brand}</span>
                  ) : null}
                </span>,
              ],
              ['Recorder status', <RecorderStatus key="status" active={camera.recorder_active} />],
              ['Password', <CredentialState key="password" recorder={camera} />],
            ]}
          />

          {!camera.recorder_active ? (
            <p style={{ margin: 0 }} role="status">
              Its recorder is deactivated, so this camera will not start until the recorder is
              activated.
            </p>
          ) : null}

          <PermissionGate
            permission={PERMISSIONS.manageCameras}
            fallback={
              <Facts
                rows={[
                  ['Channel', String(camera.channel)],
                  ['Stream', STREAM_LABEL[camera.stream_type]],
                ]}
              />
            }
          >
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                if (!channelProblem && changed) save.mutate();
              }}
              style={{ display: 'grid', gap: 'var(--space-4)' }}
            >
              <Select
                id="camera-recorder"
                label="Recorder"
                value={recorderId}
                hint="Move this camera only if it has been plugged into a different recorder."
                onChange={(event) => setRecorderId(event.target.value)}
              >
                {(recorders.data?.recorders ?? []).map((recorder) => (
                  <option key={recorder.id} value={recorder.id}>
                    {recorder.name} — {recorder.brand_label}
                    {recorder.is_active ? '' : ' (inactive)'}
                  </option>
                ))}
                {!recorders.data ? (
                  <option value={camera.recorder_id}>{camera.recorder_name}</option>
                ) : null}
              </Select>
              <div style={{ display: 'grid', gridTemplateColumns: '9rem minmax(0, 1fr)', gap: 'var(--space-3)' }}>
                <Input
                  id="camera-channel"
                  label="Channel"
                  value={channel}
                  inputMode="numeric"
                  error={channelProblem}
                  onChange={(event) => setChannel(event.target.value)}
                />
                <Select
                  id="camera-stream"
                  label="Stream"
                  value={stream}
                  onChange={(event) => setStream(event.target.value === 'main' ? 'main' : 'sub')}
                >
                  <option value="sub">{STREAM_LABEL.sub}</option>
                  <option value="main">{STREAM_LABEL.main}</option>
                </Select>
              </div>
              <p style={{ margin: 0, color: 'var(--ink-secondary)', fontSize: 'var(--text-sm)' }}>
                A change takes effect the next time the camera connects. To change the recorder’s
                address or password, open the recorder.
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!changed || Boolean(channelProblem)}
                  loading={save.isPending}
                >
                  Save
                </Button>
                <Button type="button" loading={probe.isPending} onClick={() => probe.mutate()}>
                  {probe.isPending ? 'Testing…' : 'Test stream'}
                </Button>
              </div>
              {save.isError ? <Failed error={save.error} /> : null}
              {probe.isError ? <Failed error={probe.error} /> : null}
              {probe.isPending ? (
                <p style={{ margin: 0, color: 'var(--ink-secondary)', fontSize: 'var(--text-sm)' }} role="status">
                  Signing in to the recorder and waiting for a picture from channel {camera.channel}.
                </p>
              ) : null}
              {test && !probe.isPending ? <TestResult result={test} /> : null}
            </form>
          </PermissionGate>
        </div>
      </Plane>
    </>
  );
}

function CameraPlacement({ camera }: { camera: Camera }) {
  const client = useQueryClient();
  const [zoneId, setZoneId] = useState(camera.zone_id);

  const zones = useQuery({
    queryKey: ['zones', 'all'],
    queryFn: () => organizationApi.zones({ limit: 200 }),
  });

  const move = useMutation({
    mutationFn: () =>
      camerasApi.update(camera.camera_key, {
        zone_id: zoneId,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['cameras'] });
      void client.invalidateQueries({ queryKey: ['zones'] });
    },
  });

  const moved = zoneId !== camera.zone_id;

  return (
    <>
      <SectionRule
        lead
        label="Placement"
        detail="Where this camera is. Moving it does not rewrite history."
      />
      <Plane>
        <PermissionGate
          permission={PERMISSIONS.manageCameras}
          fallback={
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
              You can see where this camera is but not move it. Moving one needs{' '}
              <code>manage_cameras</code>.
            </p>
          }
        >
          <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '32rem' }}>
            {zones.isLoading ? <LoadingState label="Reading zones" /> : null}
            {zones.data ? (
              <>
                {/* One choice, not two. A camera is in a zone; there is no
                    level above it to pick first. */}
                <Select
                  id="camera-placement-zone"
                  label="Zone"
                  value={zoneId}
                  onChange={(event) => setZoneId(event.target.value)}
                >
                  {zones.data.zones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name}
                    </option>
                  ))}
                </Select>
                <p
                  style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}
                >
                  Everything this camera observed before the move stays attributed to where it
                  actually was. The move opens a new period rather than rewriting the old one.
                </p>
                <div>
                  <Button disabled={!moved || move.isPending} onClick={() => move.mutate()}>
                    {move.isPending ? 'Moving…' : 'Move camera'}
                  </Button>
                </div>
                {move.isError ? <Failed error={move.error} /> : null}
              </>
            ) : null}
          </div>
        </PermissionGate>
      </Plane>
    </>
  );
}

function CameraLifecycle({ camera }: { camera: Camera }) {
  const client = useQueryClient();
  const navigate = useNavigate();

  const retire = useMutation({
    mutationFn: () => camerasApi.retire(camera.camera_key),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['cameras'] });
      navigate('/admin/cameras');
    },
  });

  return (
    <>
      <SectionRule
        lead
        label="Retire this camera"
        detail="Irreversible, and it destroys more than the camera."
      />
      <Plane>
        <PermissionGate
          permission={PERMISSIONS.retireCameras}
          fallback={
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
              Retiring a camera needs <code>retire_cameras</code>, which is deliberately not
              implied by being able to add or rename one. Being trusted to correct a camera's
              name is not being trusted to destroy its record.
            </p>
          }
        >
          <DangerConfirm
            expect={camera.camera_key}
            label={`Type ${camera.camera_key} to confirm`}
            actionLabel="Retire this camera"
            pending={retire.isPending}
            hint={
              <>
                <p style={{ marginTop: 0 }}>
                  Retiring <strong>{camera.name}</strong> removes it and permanently destroys its
                  observation record — everything this camera ever saw. If a finding attributed to
                  it is ever questioned, the evidence for it will be gone.
                </p>
                <p style={{ marginBottom: 0 }}>
                  Where the camera was is kept. Incidents and evidence that name it can still say
                  which zone they happened in.
                </p>
              </>
            }
            onConfirm={() => retire.mutate()}
          />
          {retire.isError ? (
            <div style={{ marginTop: 'var(--space-4)' }}>
              <Failed error={retire.error} />
            </div>
          ) : null}
        </PermissionGate>
      </Plane>
    </>
  );
}

/* ── shared bits ──────────────────────────────────────────────────────────── */

function Toggle({
  title,
  body,
  checked,
  pending,
  onChange,
}: {
  title: string;
  body: string;
  checked: boolean;
  pending: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <PermissionGate
      permission={PERMISSIONS.manageCameras}
      fallback={
        <div>
          <strong style={{ display: 'block' }}>{title}</strong>
          <StatusBadge tone={checked ? 'online' : 'idle'}>{checked ? 'On' : 'Off'}</StatusBadge>
        </div>
      }
    >
      <label style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
        <input
          type="checkbox"
          checked={checked}
          disabled={pending}
          onChange={(event) => onChange(event.target.checked)}
          style={{ marginTop: '0.3rem' }}
        />
        <span>
          <strong style={{ display: 'block' }}>{title}</strong>
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>{body}</span>
        </span>
      </label>
    </PermissionGate>
  );
}

function Facts({ rows }: { rows: ReadonlyArray<[string, React.ReactNode]> }) {
  return (
    <dl
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, auto) minmax(0, 1fr)',
        gap: 'var(--space-3) var(--space-6)',
        margin: 0,
      }}
    >
      {rows.map(([term, value]) => (
        <div key={term} style={{ display: 'contents' }}>
          <dt style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>{term}</dt>
          <dd style={{ margin: 0, minWidth: 0 }}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

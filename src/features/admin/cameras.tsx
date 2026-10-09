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
  BulkActionBar,
  DataGrid,
  downloadCsv,
  FilterChips,
  Pagination,
  TableCard,
  TableToolbar,
  useClientRows,
  useTableState,
  type FilterDefinition,
  type GridColumn,
} from '@shared/ui/data-table';
import { Callout } from '@shared/ui/feedback';
import { FormSection, Switch } from '@shared/ui/forms';
import { ActionIcons, Icon, NavIcons } from '@shared/ui/icons';
import { CopyButton } from '@shared/ui/overlays';
import {
  Button,
  EmptyState,
  Input,
  LoadingState,
  Modal,
  Select,
  useToast,
} from '@shared/ui/primitives';
import { PageIntro, Plane, Region, SectionRule } from '@shared/ui/product';
import { ButtonLink, MetricTile, Panel, StatusPill } from '@shared/ui/surfaces';

import {
  CredentialState,
  DEFAULT_WALL_FPS,
  FrameRateSelect,
  friendly,
  RecorderStatus,
  STREAM_LABEL,
  TestResult,
} from './recorder-parts';
import { DangerConfirm, Failed, ObjectTabs, when } from './shared';

/* ── the list ─────────────────────────────────────────────────────────────── */

export function AdminCamerasPage() {
  const { has } = usePermissions();
  const canManage = has(PERMISSIONS.manageCameras);
  const navigate = useNavigate();
  const client = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Camera | null>(null);
  const table = useTableState('admin-cameras', { pageSize: 25 });

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

  const all = cameras.data?.cameras ?? [];
  // The whole estate is on the client — the API returns it in one list — so
  // searching, filtering, sorting and paging here are over every camera.
  const view = useClientRows(all, table, {
    text: (camera) => `${camera.name} ${camera.camera_key} ${camera.recorder_name ?? ''} ${zoneName(camera.zone_id)}`,
    filterBy: {
      streaming: (camera) => (camera.enabled ? 'on' : 'off'),
      analysis: (camera) => (camera.analysis_enabled ? 'on' : 'off'),
      zone: (camera) => camera.zone_id,
      recorder: (camera) => camera.recorder_id,
    },
    sortBy: {
      name: (camera) => camera.name.toLowerCase(),
      zone: (camera) => zoneName(camera.zone_id).toLowerCase(),
      recorder: (camera) => (camera.recorder_name ?? '').toLowerCase(),
      channel: (camera) => camera.channel,
      wall_fps: (camera) => (typeof camera.wall_fps === 'number' ? camera.wall_fps : null),
    },
  });

  const filters: FilterDefinition[] = [
    { id: 'streaming', label: 'Streaming', options: [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }] },
    { id: 'analysis', label: 'AI analysis', options: [{ value: 'on', label: 'Analysed' }, { value: 'off', label: 'Not analysed' }] },
    {
      id: 'zone',
      label: 'Zone',
      options: [...new Set(all.map((camera) => camera.zone_id))].map((id) => ({ value: id, label: zoneName(id) })),
    },
    {
      id: 'recorder',
      label: 'Recorder',
      options: [...new Map(all.map((camera) => [camera.recorder_id, camera.recorder_name || camera.recorder_id])).entries()].map(
        ([value, label]) => ({ value, label }),
      ),
    },
  ];

  // Starting and stopping are acts with a reported outcome, one request per
  // camera — the API has no batch form. The result names what did not happen.
  const lifecycle = useMutation({
    mutationFn: async ({ keys, act }: { keys: ReadonlyArray<string>; act: 'start' | 'stop' }) =>
      Promise.allSettled(keys.map((key) => (act === 'start' ? camerasApi.start(key) : camerasApi.stop(key)))),
    onSuccess: (results, { keys, act }) => {
      void client.invalidateQueries({ queryKey: ['cameras'] });
      const refused = results.filter(
        (r) => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.available === false),
      );
      const done = keys.length - refused.length;
      if (done > 0) toast.success(`${done} ${done === 1 ? 'camera' : 'cameras'} ${act === 'start' ? 'starting' : 'stopped'}`);
      if (refused.length > 0) {
        const first = refused[0]!;
        toast.warning(`${refused.length} ${refused.length === 1 ? 'camera' : 'cameras'} did not ${act}`, {
          description:
            first.status === 'fulfilled' ? first.value.reason || undefined : friendly(first.reason, 'The request was refused.'),
        });
      }
      table.setSelected(new Set());
    },
  });

  const analysis = useMutation({
    mutationFn: ({ camera, on }: { camera: Camera; on: boolean }) => camerasApi.setAnalysis(camera.camera_key, on),
    onSuccess: (_, { camera, on }) => {
      void client.invalidateQueries({ queryKey: ['cameras'] });
      toast.success(on ? `${camera.name} is being analysed` : `${camera.name} streams without analysis`);
    },
    onError: (error) => toast.error('Analysis could not be changed', { description: friendly(error, '') || undefined }),
  });

  const columns: ReadonlyArray<GridColumn<Camera>> = [
    {
      key: 'name',
      header: 'Camera',
      sortable: true,
      render: (camera) => (
        <span className="uwv-cell-primary">
          <span className="uwv-metric-icon">
            <Icon icon={NavIcons.cameras} size="control" />
          </span>
          <span className="uwv-cell-stack">
            <Link className="uwv-cell-title" to={`/admin/cameras/${encodeURIComponent(camera.camera_key)}`}>
              {camera.name}
            </Link>
            <span className="uwv-cell-sub">{camera.camera_key}</span>
          </span>
        </span>
      ),
      exportValue: (camera) => camera.name,
    },
    { key: 'zone', header: 'Zone', sortable: true, render: (camera) => zoneName(camera.zone_id), exportValue: (camera) => zoneName(camera.zone_id) },
    // A channel number means nothing without the box it is a channel of.
    {
      key: 'recorder',
      header: 'Recorder',
      sortable: true,
      render: (camera) => (
        <Link to={`/admin/recorders/${encodeURIComponent(camera.recorder_id)}`}>{camera.recorder_name || '—'}</Link>
      ),
      exportValue: (camera) => camera.recorder_name,
    },
    { key: 'channel', header: 'Channel', numeric: true, sortable: true, render: (camera) => camera.channel, exportValue: (camera) => camera.channel },
    {
      key: 'state',
      header: 'Streaming',
      render: (camera) => <StatusPill tone={camera.enabled ? 'online' : 'idle'}>{camera.enabled ? 'On' : 'Off'}</StatusPill>,
      exportValue: (camera) => (camera.enabled ? 'On' : 'Off'),
    },
    {
      key: 'analysis',
      header: 'Analysed',
      render: (camera) => (camera.analysis_enabled ? 'Yes' : <span className="uwv-cell-muted">No</span>),
      exportValue: (camera) => (camera.analysis_enabled ? 'Yes' : 'No'),
    },
    {
      key: 'wall_fps',
      header: 'Live Wall',
      numeric: true,
      sortable: true,
      // A server that does not send the rate is a rate nobody knows: a dash,
      // never "undefined fps" and never a guessed default.
      render: (camera) => (typeof camera.wall_fps === 'number' ? `${camera.wall_fps} fps` : '—'),
      exportValue: (camera) => (typeof camera.wall_fps === 'number' ? camera.wall_fps : null),
    },
  ];

  const total = all.length;
  const on = cameras.data?.enabled ?? 0;
  const analysed = all.filter((c) => c.enabled && c.analysis_enabled).length;
  const selected = view.matched.filter((camera) => table.selected.has(camera.camera_key));

  return (
    <>
      <PageIntro
        eyebrow="Estate"
        title="Cameras"
        standfirst="Every configured camera in this organization, whether or not it is currently switched on."
        actions={
          <PermissionGate permission={PERMISSIONS.manageCameras}>
            <ButtonLink to="/admin/cameras/new" variant="primary" icon={ActionIcons.add}>
              Add a camera
            </ButtonLink>
          </PermissionGate>
        }
      />

      {cameras.data && total > 0 ? (
        <section className="uwv-metrics uwv-arrive" data-order="2" aria-label="The estate" style={{ marginBottom: 'var(--space-8)' }}>
          <MetricTile label="Configured" icon={NavIcons.cameras} value={total} detail="Whether or not they are switched on" />
          <MetricTile
            label="Switched on"
            icon={NavIcons.live}
            value={on}
            unit={`/ ${total}`}
            detail="A camera that is off opens no connection and costs nothing."
          />
          <MetricTile
            label="Analysed"
            icon={NavIcons.modelEvaluation}
            value={analysed}
            detail="Streaming and being processed by AI are two separate decisions."
          />
        </section>
      ) : null}

      <section className="uwv-arrive" data-order="3" aria-label="Configured cameras">
        <TableCard label="Cameras">
          {total > 0 ? (
          <TableToolbar
            state={table}
            searchLabel="Search cameras"
            searchPlaceholder="Search by name, key, zone or recorder…"
            filters={filters}
            columns={columns}
            actions={
              <Button
                variant="ghost"
                icon={<Icon icon={ActionIcons.export} />}
                disabled={view.matched.length === 0}
                onClick={() => downloadCsv('cameras.csv', columns, view.matched)}
              >
                Export
              </Button>
            }
          />
          ) : null}
          <FilterChips filters={filters} state={table} />
          {canManage ? (
            <BulkActionBar count={table.selected.size} noun="cameras" onClear={() => table.setSelected(new Set())}>
              {selected.some((c) => !c.enabled) ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Icon icon={ActionIcons.activate} />}
                  loading={lifecycle.isPending}
                  onClick={() => lifecycle.mutate({ keys: selected.filter((c) => !c.enabled).map((c) => c.camera_key), act: 'start' })}
                >
                  Start
                </Button>
              ) : null}
              {selected.some((c) => c.enabled) ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Icon icon={ActionIcons.suspend} />}
                  loading={lifecycle.isPending}
                  onClick={() => lifecycle.mutate({ keys: selected.filter((c) => c.enabled).map((c) => c.camera_key), act: 'stop' })}
                >
                  Stop
                </Button>
              ) : null}
              <Button size="sm" variant="secondary" onClick={() => downloadCsv('cameras-selected.csv', columns, selected)}>
                Export CSV
              </Button>
            </BulkActionBar>
          ) : null}
          <DataGrid<Camera>
            caption="Configured cameras"
            columns={columns}
            rows={view.page}
            rowKey={(camera) => camera.camera_key}
            hidden={table.hidden}
            density={table.density}
            sort={table.sort}
            onSort={table.setSort}
            loading={cameras.isLoading}
            error={cameras.error}
            onRetry={() => void cameras.refetch()}
            narrowed={table.narrowed}
            selection={
              canManage
                ? { selected: table.selected, onChange: table.setSelected, label: (camera) => `Select ${camera.name}` }
                : undefined
            }
            rowActions={(camera) => [
              {
                id: 'view',
                label: 'View camera',
                icon: ActionIcons.view,
                onSelect: () => navigate(`/admin/cameras/${encodeURIComponent(camera.camera_key)}`),
              },
              ...(canManage
                ? [
                    camera.enabled
                      ? {
                          id: 'stop',
                          label: 'Stop streaming',
                          icon: ActionIcons.suspend,
                          onSelect: () => lifecycle.mutate({ keys: [camera.camera_key], act: 'stop' }),
                        }
                      : {
                          id: 'start',
                          label: 'Start streaming',
                          icon: ActionIcons.activate,
                          onSelect: () => lifecycle.mutate({ keys: [camera.camera_key], act: 'start' }),
                        },
                    {
                      id: 'analysis',
                      label: camera.analysis_enabled ? 'Stop AI analysis' : 'Analyse with AI',
                      icon: NavIcons.modelEvaluation,
                      onSelect: () => analysis.mutate({ camera, on: !camera.analysis_enabled }),
                    },
                    { id: 'sep', type: 'separator' as const },
                    {
                      id: 'retire',
                      label: 'Retire…',
                      icon: ActionIcons.remove,
                      tone: 'danger' as const,
                      disabled: !has(PERMISSIONS.retireCameras),
                      hint: has(PERMISSIONS.retireCameras) ? 'Destroys its observation record' : 'Needs retire_cameras',
                      onSelect: () => navigate(`/admin/cameras/${encodeURIComponent(camera.camera_key)}/lifecycle`),
                    },
                  ]
                : []),
            ]}
            rowActionsLabel={(camera) => `Actions for ${camera.name}`}
            rowInline={
              canManage
                ? (camera) => (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Icon icon={ActionIcons.edit} />}
                      aria-label={`Edit ${camera.name}`}
                      onClick={() => setEditing(camera)}
                    >
                      Edit
                    </Button>
                  )
                : undefined
            }
            empty={
              <EmptyState
                title="No cameras yet"
                body={
                  canManage
                    ? 'Add one to start watching a kitchen. You will need the recorder it is plugged into, and its channel.'
                    : 'Nobody has added a camera to this organization yet.'
                }
                action={
                  canManage ? (
                    <ButtonLink to="/admin/cameras/new" variant="primary" size="sm" icon={ActionIcons.add}>
                      Add a camera
                    </ButtonLink>
                  ) : undefined
                }
              />
            }
            noResults={
              <EmptyState
                title="Nothing matches"
                body="Try clearing the search or the filters."
                action={
                  <Button size="sm" onClick={table.clearFilters}>
                    Clear search and filters
                  </Button>
                }
              />
            }
          />
          {view.total > 0 ? (
            <Pagination
              total={view.total}
              offset={table.offset}
              limit={table.pageSize}
              onOffset={table.setOffset}
              onLimit={table.setPageSize}
              noun="cameras"
            />
          ) : null}
        </TableCard>
      </section>

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
  const { has } = usePermissions();
  const [editing, setEditing] = useState(false);

  const cameras = useQuery({ queryKey: ['cameras'], queryFn: camerasApi.list });
  const camera = cameras.data?.cameras.find((c) => c.camera_key === cameraKey);

  if (cameras.isLoading) return <LoadingState label="Reading camera" />;
  if (cameras.isError) return <Failed error={cameras.error} />;
  if (!camera) {
    return (
      <>
        <PageIntro eyebrow="Cameras" back="/admin/cameras" title="Camera" />
        <EmptyState title="No such camera" body={`Nothing in this organization is called ${cameraKey}.`} />
      </>
    );
  }

  const base = `/admin/cameras/${encodeURIComponent(cameraKey)}`;

  return (
    <>
      <PageIntro
        eyebrow="Cameras"
        back="/admin/cameras"
        title={camera.name}
        mark={<Icon icon={NavIcons.cameras} size="feature" />}
        meta={
          <>
            <StatusPill tone={camera.enabled ? 'online' : 'idle'}>{camera.enabled ? 'Streaming' : 'Off'}</StatusPill>
            <StatusPill tone={camera.analysis_enabled ? 'online' : 'idle'}>
              {camera.analysis_enabled ? 'Analysed' : 'Not analysed'}
            </StatusPill>
            <span className="uwv-page-meta-item">
              <span className="uwv-id">{camera.camera_key}</span>
              <CopyButton value={camera.camera_key} label="Copy camera key" />
            </span>
            <span className="uwv-page-meta-item">
              Channel {camera.channel} · {camera.stream_type === 'main' ? 'main stream' : 'sub-stream'}
            </span>
          </>
        }
        actions={
          has(PERMISSIONS.manageCameras) ? (
            <Button variant="secondary" icon={<Icon icon={ActionIcons.edit} />} onClick={() => setEditing(true)}>
              Edit details
            </Button>
          ) : null
        }
      />

      <ObjectTabs
        tabs={[
          { to: base, label: 'Overview', end: true },
          { to: `${base}/connection`, label: 'Connection' },
          { to: `${base}/placement`, label: 'Placement' },
          { to: `${base}/lifecycle`, label: 'Lifecycle' },
        ]}
      />
      <Region order={2}>
        <CameraSection camera={camera} />
      </Region>

      {editing ? <EditCamera camera={camera} onClose={() => setEditing(false)} /> : null}
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
  const toast = useToast();

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
      if (result.available) toast.success(`${camera.name} is starting`);
    },
  });
  const stop = useMutation({
    mutationFn: () => camerasApi.stop(camera.camera_key),
    onSuccess: (result) => {
      setLifecycle(result);
      void client.invalidateQueries({ queryKey: ['cameras'] });
      if (result.available) toast.success(`${camera.name} stopped`);
    },
  });
  const setAnalysis = useMutation({
    mutationFn: (on: boolean) => camerasApi.setAnalysis(camera.camera_key, on),
    onSuccess: (_, on) => {
      void client.invalidateQueries({ queryKey: ['cameras'] });
      toast.success(on ? 'AI analysis switched on' : 'AI analysis switched off');
    },
  });

  return (
    <div className="uwv-detail-grid">
      <div className="uwv-stack">
        <Panel title="What this camera is doing" description="Two switches, and they are genuinely independent.">
          <div className="uwv-stack" data-gap="md">
            <div className="uwv-danger-row">
              <div className="uwv-danger-row-text">
                <p className="uwv-danger-row-title">{camera.enabled ? 'Watching' : 'Not watching'}</p>
                <p className="uwv-danger-row-description">
                  {camera.enabled
                    ? 'This camera is dialled and appears on the wall.'
                    : 'Nothing is connected to this camera. Start it to open the stream.'}
                </p>
              </div>
              <PermissionGate permission={PERMISSIONS.manageCameras}>
                {camera.enabled ? (
                  <Button variant="secondary" icon={<Icon icon={ActionIcons.suspend} />} loading={stop.isPending} onClick={() => stop.mutate()}>
                    Stop
                  </Button>
                ) : (
                  <Button variant="primary" icon={<Icon icon={ActionIcons.activate} />} loading={start.isPending} onClick={() => start.mutate()}>
                    Start watching
                  </Button>
                )}
              </PermissionGate>
            </div>
            {lifecycle && lifecycle.reason ? (
              <Callout tone={lifecycle.available ? 'info' : 'warning'} live>
                {lifecycle.reason}
              </Callout>
            ) : null}
            <div className="uwv-danger-row">
              <Toggle
                title="Analyse the video with AI"
                body="When on, frames are processed and findings are produced. A camera can stream without this — a corridor is worth watching and not worth paying detection for."
                checked={camera.analysis_enabled}
                pending={setAnalysis.isPending}
                onChange={(next) => setAnalysis.mutate(next)}
              />
            </div>
            {camera.enabled && !camera.analysis_enabled ? (
              <Callout tone="neutral">
                This camera streams to the wall and raises nothing. That is a deliberate state, not a fault.
              </Callout>
            ) : null}
            {start.isError ? <Failed error={start.error} /> : null}
            {stop.isError ? <Failed error={stop.error} /> : null}
            {setAnalysis.isError ? <Failed error={setAnalysis.error} /> : null}
          </div>
        </Panel>
      </div>

      <div className="uwv-stack">
        <Panel title="Identity" description="What it is called, and how the platform tells it apart.">
          <Facts
            rows={[
              ['Name', camera.name],
              ['Camera key', camera.camera_key],
              [
                'Runtime id',
                <>
                  <span className="uwv-id">{camera.runtime_id}</span>
                  <span className="uwv-type-caption" style={{ display: 'block', marginTop: 'var(--space-1)' }}>
                    Globally unique. Two organizations may each have a <code>cam-01</code>; this is what keeps them apart
                    everywhere it matters.
                  </span>
                </>,
              ],
              ['Purpose', camera.purpose || 'Not stated'],
              ['Analysis rate', `${camera.analysis_fps} frames per second`],
              ['Added', when(camera.created_at)],
              ['Last changed', when(camera.updated_at)],
            ]}
          />
        </Panel>
      </div>
    </div>
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
            <p style={{ margin: 0, color: 'var(--ink-secondary)' }}>
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
                  style={{ margin: 0, color: 'var(--ink-secondary)', fontSize: 'var(--text-sm)' }}
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
      <SectionRule lead label="Lifecycle" detail="What ends a camera, and what that costs." />
      <FormSection
        tone="danger"
        title="Retire this camera"
        description="Irreversible, and it destroys more than the camera."
      >
        <PermissionGate
          permission={PERMISSIONS.retireCameras}
          fallback={
            <p style={{ margin: 0, color: 'var(--ink-secondary)' }}>
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
      </FormSection>
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
        <div className="uwv-switch-row" style={{ width: '100%' }}>
          <span className="uwv-check-text">
            <span className="uwv-check-label">{title}</span>
            <span className="uwv-check-description">{body}</span>
          </span>
          <StatusPill tone={checked ? 'online' : 'idle'}>{checked ? 'On' : 'Off'}</StatusPill>
        </div>
      }
    >
      <div style={{ width: '100%' }}>
        <Switch label={title} description={body} checked={checked} disabled={pending} onChange={onChange} />
      </div>
    </PermissionGate>
  );
}

function Facts({ rows }: { rows: ReadonlyArray<[string, React.ReactNode]> }) {
  return (
    <dl className="uwv-fact-rows">
      {rows.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

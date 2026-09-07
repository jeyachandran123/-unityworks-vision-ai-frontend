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
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { organizationApi } from '@shared/api/observations';
import { camerasApi, type Camera, type ConnectionTest } from '@shared/api/persistence';
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
  Select,
  StatusBadge,
} from '@shared/ui/primitives';
import { Figure, PageIntro, Plane, Region, SectionRule } from '@shared/ui/product';

import { DangerConfirm, Failed, ObjectTabs, SearchField, useDebounced, when } from './shared';

/* ── the list ─────────────────────────────────────────────────────────────── */

export function AdminCamerasPage() {
  const { has } = usePermissions();
  const [search, setSearch] = useState('');
  const [showing, setShowing] = useState<'all' | 'on' | 'off'>('all');
  const q = useDebounced(search).trim().toLowerCase();

  const cameras = useQuery({ queryKey: ['cameras'], queryFn: camerasApi.list });
  const sites = useQuery({
    queryKey: ['sites', 'all'],
    queryFn: () => organizationApi.restaurants({ limit: 200 }),
  });

  const siteName = useMemo(() => {
    const byId = new Map((sites.data?.restaurants ?? []).map((s) => [s.id, s.name]));
    return (id: string) => byId.get(id) ?? '—';
  }, [sites.data]);

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
    { key: 'site', header: 'Site', render: (camera) => siteName(camera.restaurant_id) },
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
  ];

  const total = cameras.data?.cameras.length ?? 0;
  const on = cameras.data?.enabled ?? 0;

  return (
    <>
      <PageIntro
        eyebrow="Estate"
        title="Cameras"
        standfirst="Every configured camera in this organisation, whether or not it is currently switched on."
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
                        : 'Nobody has added a camera to this organisation yet.'
                  }
                />
              }
            />
          ) : null}
        </Plane>
      </Region>
    </>
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
        body={`Nothing in this organisation is called ${cameraKey}.`}
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

  const setEnabled = useMutation({
    mutationFn: (enabled: boolean) => camerasApi.setEnabled(camera.camera_key, enabled),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['cameras'] }),
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
          <Toggle
            title="Connect to this camera"
            body="When on, Vision OS opens an RTSP session and the camera appears on the wall. When off it opens no socket and costs nothing."
            checked={camera.enabled}
            pending={setEnabled.isPending}
            onChange={(next) => setEnabled.mutate(next)}
          />
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
          {setEnabled.isError ? <Failed error={setEnabled.error} /> : null}
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
                    Globally unique. Two organisations may each have a <code>cam-01</code>; this
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

function CameraConnection({ camera }: { camera: Camera }) {
  const client = useQueryClient();
  const [host, setHost] = useState(camera.host);
  const [port, setPort] = useState(String(camera.rtsp_port));
  const [username, setUsername] = useState(camera.username);
  const [scheme, setScheme] = useState<'env' | 'file' | 'none'>(
    camera.credential_scheme === 'file' ? 'file' : camera.credential_configured ? 'env' : 'none',
  );
  const [credentialName, setCredentialName] = useState('');
  const [test, setTest] = useState<ConnectionTest | null>(null);

  const probe = useMutation({
    mutationFn: () => camerasApi.testConnection({ camera_key: camera.camera_key }),
    onSuccess: setTest,
  });

  const save = useMutation({
    mutationFn: () =>
      camerasApi.update(camera.camera_key, {
        host: host.trim(),
        rtsp_port: Number(port) || 554,
        username: username.trim(),
        // Only sent when a new one was actually typed. Sending an unchanged
        // pointer back would be harmless, but sending an *empty* one would
        // silently clear the camera's credential.
        ...(credentialName.trim() && scheme !== 'none'
          ? { credential_ref: `${scheme}:${credentialName.trim()}` }
          : {}),
      }),
    onSuccess: () => {
      setCredentialName('');
      void client.invalidateQueries({ queryKey: ['cameras'] });
    },
  });

  return (
    <>
      <SectionRule
        lead
        label="Connection"
        detail="Where this camera is and how to authenticate to it."
      />
      <Plane>
        <PermissionGate
          permission={PERMISSIONS.manageCameras}
          fallback={
            <Facts
              rows={[
                ['Address', `${camera.host}:${camera.rtsp_port}`],
                ['Username', camera.username || 'None'],
                [
                  'Password',
                  camera.credential_configured
                    ? `Configured (${camera.credential_scheme})`
                    : 'None',
                ],
              ]}
            />
          }
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
            style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '32rem' }}
          >
            <Input label="Host" value={host} onChange={(e) => setHost(e.target.value)} />
            <Input
              label="RTSP port"
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
            />
            <Input
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />

            <fieldset
              style={{
                border: '1px solid var(--line-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-4)',
                display: 'grid',
                gap: 'var(--space-4)',
                margin: 0,
              }}
            >
              <legend style={{ padding: '0 var(--space-2)', fontSize: 'var(--text-sm)' }}>
                Password
              </legend>
              <p
                style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}
              >
                {camera.credential_configured
                  ? `A password is configured, kept in ${
                      camera.credential_scheme === 'file' ? 'a file' : 'an environment variable'
                    } on the server. Vision OS never shows which one, and never shows the value.`
                  : 'No password is configured for this camera.'}
              </p>
              <Select
                label="Where the password is kept"
                value={scheme}
                onChange={(e) => setScheme(e.target.value as typeof scheme)}
              >
                <option value="env">An environment variable on the server</option>
                <option value="file">A file on the server</option>
                <option value="none">No password</option>
              </Select>
              {scheme !== 'none' ? (
                <Input
                  label={scheme === 'env' ? 'New variable name' : 'New file path'}
                  hint="Leave empty to keep the current one. The name or path, never the password itself."
                  value={credentialName}
                  placeholder={scheme === 'env' ? 'CCTV_PASSWORD' : '/run/secrets/dvr'}
                  onChange={(e) => setCredentialName(e.target.value)}
                />
              ) : null}
            </fieldset>

            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Saving…' : 'Save connection'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={probe.isPending}
                onClick={() => probe.mutate()}
              >
                {probe.isPending ? 'Testing…' : 'Test connection'}
              </Button>
            </div>

            {save.isError ? <Failed error={save.error} /> : null}
            {probe.isError ? <Failed error={probe.error} /> : null}
            {test ? (
              <div
                style={{
                  display: 'grid',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-4)',
                  border: '1px solid var(--line-subtle)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <StatusBadge tone={test.reachable ? 'online' : 'offline'}>
                  {test.reachable ? 'Reachable' : 'Not reachable'}
                </StatusBadge>
                <p style={{ margin: 0 }}>{test.detail}</p>
                <p
                  style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}
                >
                  {test.proves}
                </p>
              </div>
            ) : null}
          </form>
        </PermissionGate>
      </Plane>
    </>
  );
}

function CameraPlacement({ camera }: { camera: Camera }) {
  const client = useQueryClient();
  const [siteId, setSiteId] = useState(camera.restaurant_id);
  const [zoneId, setZoneId] = useState(camera.zone_id ?? '');

  const sites = useQuery({
    queryKey: ['sites', 'all'],
    queryFn: () => organizationApi.restaurants({ limit: 200 }),
  });
  const zones = useQuery({
    queryKey: ['zones', siteId],
    queryFn: () => organizationApi.zones(siteId),
    enabled: Boolean(siteId),
  });

  const move = useMutation({
    mutationFn: () =>
      camerasApi.update(camera.camera_key, {
        restaurant_id: siteId,
        zone_id: zoneId || null,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['cameras'] });
      void client.invalidateQueries({ queryKey: ['zones'] });
    },
  });

  const moved = siteId !== camera.restaurant_id || zoneId !== (camera.zone_id ?? '');

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
            {sites.isLoading ? <LoadingState label="Reading sites" /> : null}
            {sites.data ? (
              <>
                <Select
                  label="Site"
                  value={siteId}
                  onChange={(event) => {
                    setSiteId(event.target.value);
                    setZoneId('');
                  }}
                >
                  {sites.data.restaurants.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Zone"
                  value={zoneId}
                  onChange={(event) => setZoneId(event.target.value)}
                >
                  <option value="">No zone</option>
                  {(zones.data?.zones ?? []).map((zone) => (
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

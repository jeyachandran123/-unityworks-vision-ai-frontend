/**
 * Recorders — the DVRs and NVRs a site's cameras are plugged into.
 *
 * Two pages: the list, and one recorder with its cameras. Adding a recorder is
 * its own flow, in `recorder-wizard.tsx`.
 *
 * ### What a person should be able to tell at a glance
 *
 * Which boxes there are, what make each is, where it is, whether it is in use,
 * whether it can sign in, and how many of its cameras are switched on. The list
 * answers all of that without opening anything.
 *
 * ### The password
 *
 * Never shown, anywhere, in any form. A recorder says "Saved securely", and
 * changing the password means typing a new one twice in a dialog. There is no
 * control that could reveal the old one because the browser never has it.
 *
 * ### Deactivate, not delete
 *
 * A recorder with cameras is part of the record of how they were watched.
 * Deactivating stops every one of them and keeps their settings; delete is
 * offered only for a recorder that never held a camera, where nothing is lost.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { PERMISSIONS } from '@app/permissions/permissions';
import { PermissionGate, usePermissions } from '@app/permissions/guards';
import { organizationApi } from '@shared/api/observations';
import { camerasApi } from '@shared/api/persistence';
import {
  type Recorder,
  type RecorderCamera,
  type RecorderDetail,
  type RecorderTestResult,
  recordersApi,
} from '@shared/api/recorders';
import {
  Button,
  type Column,
  EmptyState,
  Input,
  KeyValue,
  LoadingState,
  Modal,
  Select,
  StatusBadge,
  useToast,
} from '@shared/ui/primitives';
import { PageIntro, Plane, Region, SectionRule } from '@shared/ui/product';
import { PAGE_SIZE, PagedTable } from '@shared/ui/table';

import {
  addressProblem,
  BrandSelect,
  CredentialState,
  friendly,
  PasswordField,
  portProblem,
  RecorderStatus,
  STREAM_LABEL,
  STREAM_SHORT,
  TestResult,
  type TestOutcome,
  useBrands,
} from './recorder-parts';
import { DangerConfirm, Failed, when } from './shared';

const NOTE = { margin: 0, color: 'var(--ink-secondary)', fontSize: 'var(--text-sm)', maxWidth: '40rem' } as const;
const ACTIONS = { display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' } as const;

/* ── the list ─────────────────────────────────────────────────────────────── */

export function RecordersPage() {
  const navigate = useNavigate();
  const [offset, setOffset] = useState(0);
  const recorders = useQuery({
    queryKey: ['recorders', offset],
    queryFn: () => recordersApi.list({ limit: PAGE_SIZE, offset }),
  });

  const columns: ReadonlyArray<Column<Recorder>> = [
    {
      key: 'name',
      header: 'Recorder',
      render: (recorder) => (
        <div style={{ display: 'grid', gap: '0.1rem' }}>
          <Link to={`/admin/recorders/${encodeURIComponent(recorder.id)}`}>{recorder.name}</Link>
          <span style={{ color: 'var(--ink-tertiary)', fontSize: 'var(--text-xs)' }}>
            {recorder.brand_label}
          </span>
        </div>
      ),
    },
    {
      key: 'address',
      header: 'Address',
      render: (recorder) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
          {recorder.host || '—'}:{recorder.rtsp_port}
        </span>
      ),
    },
    {
      key: 'cameras',
      header: 'Cameras',
      render: (recorder) =>
        recorder.camera_count === 0
          ? 'None yet'
          : `${recorder.camera_count} · ${recorder.cameras_on} on`,
    },
    { key: 'password', header: 'Password', render: (recorder) => <CredentialState recorder={recorder} /> },
    { key: 'status', header: 'Status', render: (recorder) => <RecorderStatus active={recorder.is_active} /> },
  ];

  if (recorders.isLoading) return <LoadingState label="Reading recorders" />;
  if (recorders.isError) return <Failed error={recorders.error} />;

  const page = recorders.data;
  const add = (
    <PermissionGate permission={PERMISSIONS.manageCameras}>
      <Button variant="primary" onClick={() => navigate('/admin/recorders/new')}>
        Add recorder
      </Button>
    </PermissionGate>
  );

  return (
    <>
      <PageIntro
        eyebrow="CCTV"
        title="Recorders"
        standfirst="A recorder is the DVR or NVR your cameras are plugged into. Add it once with the details you use to sign in to it, then choose which of its cameras to watch."
        actions={add}
      />
      <Region order={2}>
        <PagedTable<Recorder>
          columns={columns}
          rows={page?.recorders ?? []}
          rowKey={(recorder) => recorder.id}
          caption="Recorders in this organization"
          paging={{ limit: PAGE_SIZE, offset, total: page?.total ?? 0 }}
          onPage={setOffset}
          busy={recorders.isFetching}
          empty={
            <EmptyState
              title="No recorders yet"
              body="Add the DVR or NVR your cameras plug into. You will need its IP address and the username and password you use to sign in to it."
              action={add}
            />
          }
        />
      </Region>
    </>
  );
}

/* ── one recorder ─────────────────────────────────────────────────────────── */

export function RecorderDetailPage() {
  const { recorderId = '' } = useParams();
  const recorder = useQuery({
    queryKey: ['recorders', 'one', recorderId],
    queryFn: () => recordersApi.get(recorderId),
  });

  if (recorder.isLoading) return <LoadingState label="Reading the recorder" />;
  if (recorder.isError || !recorder.data) return <Failed error={recorder.error} />;
  return <RecorderView recorder={recorder.data} />;
}

function RecorderView({ recorder }: { recorder: RecorderDetail }) {
  const client = useQueryClient();
  const toast = useToast();
  const { has } = usePermissions();
  const canManage = has(PERMISSIONS.manageCameras);
  const [editing, setEditing] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['recorders'] });
    void client.invalidateQueries({ queryKey: ['cameras'] });
  };

  const toggle = useMutation({
    mutationFn: () =>
      recorder.is_active ? recordersApi.deactivate(recorder.id) : recordersApi.activate(recorder.id),
    onSuccess: (result) => {
      refresh();
      toast(
        result.is_active
          ? `${result.name} is active. Its switched-on cameras are starting.`
          : `${result.name} is deactivated. Its cameras have stopped and keep their settings.`,
      );
    },
    onError: (error) => toast(friendly(error, 'That did not work. Try again.'), 'error'),
  });

  return (
    <>
      <PageIntro
        eyebrow="CCTV · Recorder"
        title={recorder.name}
        standfirst={`${recorder.brand_label} · ${recorder.host || 'no address'} : ${recorder.rtsp_port}`}
        meta={<RecorderStatus active={recorder.is_active} />}
        actions={
          canManage ? (
            <div style={ACTIONS}>
              <Button onClick={() => setEditing((open) => !open)}>{editing ? 'Close' : 'Edit'}</Button>
              <Button
                variant={recorder.is_active ? 'secondary' : 'primary'}
                loading={toggle.isPending}
                onClick={() => toggle.mutate()}
              >
                {recorder.is_active ? 'Deactivate' : 'Activate'}
              </Button>
            </div>
          ) : null
        }
      />

      {!recorder.is_active ? (
        <Region order={2}>
          <Plane>
            <p style={{ margin: 0 }} role="status">
              <strong>This recorder is deactivated.</strong> None of its cameras will start until you
              activate it. Their settings are kept exactly as they are.
            </p>
          </Plane>
        </Region>
      ) : null}

      <Region order={2}>
        <SectionRule
          lead
          label="Connection"
          detail="How this server reaches the recorder. Every camera on it uses these details."
        />
        <Plane>
          {editing ? (
            <EditConnection recorder={recorder} onDone={() => setEditing(false)} onSaved={refresh} />
          ) : (
            <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
              <KeyValue
                items={[
                  { key: 'Brand', value: recorder.brand_label },
                  { key: 'Address', value: recorder.host || '—' },
                  { key: 'Port', value: String(recorder.rtsp_port) },
                  { key: 'Username', value: recorder.username || '—' },
                  {
                    key: 'Password',
                    value: (
                      <span style={ACTIONS}>
                        <CredentialState recorder={recorder} />
                        {canManage ? (
                          <Button size="sm" onClick={() => setChangingPassword(true)}>
                            Change password
                          </Button>
                        ) : null}
                      </span>
                    ),
                  },
                  { key: 'Added', value: when(recorder.created_at) },
                ]}
              />
              {recorder.credential_scheme !== 'recorder' && recorder.credential_configured ? (
                <p style={NOTE}>
                  This recorder’s password is kept by the server’s own configuration. Setting one here
                  moves it into this application, encrypted.
                </p>
              ) : null}
            </div>
          )}
        </Plane>
      </Region>

      {canManage ? <TestPanel recorder={recorder} /> : null}

      <RecorderCameras recorder={recorder} canManage={canManage} onChanged={refresh} />

      {canManage ? <RemoveRecorder recorder={recorder} /> : null}

      <ChangePassword
        recorder={recorder}
        open={changingPassword}
        onClose={() => setChangingPassword(false)}
        onSaved={() => {
          setChangingPassword(false);
          refresh();
          toast('Password changed. Cameras use it the next time they connect.');
        }}
      />
    </>
  );
}

/* ── editing the connection ───────────────────────────────────────────────── */

function EditConnection({
  recorder,
  onDone,
  onSaved,
}: {
  recorder: RecorderDetail;
  onDone: () => void;
  onSaved: () => void;
}) {
  const brands = useBrands();
  const toast = useToast();
  const [name, setName] = useState(recorder.name);
  const [brand, setBrand] = useState(recorder.brand);
  const [host, setHost] = useState(recorder.host);
  const [port, setPort] = useState(String(recorder.rtsp_port));
  const [username, setUsername] = useState(recorder.username);
  const [pathTemplate, setPathTemplate] = useState(recorder.path_template ?? '');
  const [streamMain, setStreamMain] = useState(String(recorder.stream_main ?? 0));
  const [streamSub, setStreamSub] = useState(String(recorder.stream_sub ?? 1));
  const custom = brand === (brands.data?.custom ?? 'custom');

  const hostProblem = host.trim() ? addressProblem(host) : 'Enter the IP address or hostname';
  const port_problem = portProblem(port);
  const invalid = !name.trim() || !brand || Boolean(hostProblem) || Boolean(port_problem);

  const save = useMutation({
    mutationFn: () =>
      recordersApi.update(recorder.id, {
        name: name.trim(),
        brand,
        host: host.trim(),
        rtsp_port: Number(port),
        username: username.trim(),
        ...(custom
          ? {
              path_template: pathTemplate.trim(),
              stream_main: Number(streamMain),
              stream_sub: Number(streamSub),
            }
          : {}),
      }),
    onSuccess: () => {
      onSaved();
      onDone();
      toast('Recorder updated. Cameras already streaming use the new details next time they connect.');
    },
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!invalid) save.mutate();
      }}
      style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '34rem' }}
    >
      <Input id="edit-recorder-name" label="Recorder name" value={name} onChange={(e) => setName(e.target.value)} />
      <BrandSelect id="edit-recorder-brand" value={brand} onChange={(next) => setBrand(next)} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 8rem', gap: 'var(--space-3)' }}>
        <Input
          id="edit-recorder-host"
          label="IP address or hostname"
          value={host}
          spellCheck={false}
          error={hostProblem}
          onChange={(e) => setHost(e.target.value)}
        />
        <Input
          id="edit-recorder-port"
          label="Port"
          value={port}
          inputMode="numeric"
          error={port_problem}
          onChange={(e) => setPort(e.target.value)}
        />
      </div>
      <Input
        id="edit-recorder-username"
        label="Username"
        value={username}
        autoComplete="off"
        onChange={(e) => setUsername(e.target.value)}
      />
      {custom ? (
        <>
          <Input
            id="edit-recorder-path"
            label="Stream path"
            value={pathTemplate}
            spellCheck={false}
            hint="From the device’s manual. Use {channel} and {subtype}."
            onChange={(e) => setPathTemplate(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <Input id="edit-recorder-main" label="Main stream number" value={streamMain} onChange={(e) => setStreamMain(e.target.value)} />
            <Input id="edit-recorder-sub" label="Sub stream number" value={streamSub} onChange={(e) => setStreamSub(e.target.value)} />
          </div>
        </>
      ) : null}
      <p style={NOTE}>The password is changed separately, with Change password.</p>
      {save.isError ? (
        <p role="alert" style={{ ...NOTE, color: 'var(--severity-critical)' }}>
          {friendly(save.error, 'The recorder could not be updated.')}
        </p>
      ) : null}
      <div style={ACTIONS}>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" disabled={invalid} loading={save.isPending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

/* ── changing the password ────────────────────────────────────────────────── */

function ChangePassword({
  recorder,
  open,
  onClose,
  onSaved,
}: {
  recorder: Recorder;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [attempted, setAttempted] = useState(false);

  const close = () => {
    // Never kept once the dialog is gone.
    setPassword('');
    setConfirm('');
    setAttempted(false);
    onClose();
  };

  const mismatch = confirm.length > 0 && password !== confirm;
  const save = useMutation({
    mutationFn: () => recordersApi.setPassword(recorder.id, password),
    onSuccess: () => {
      setPassword('');
      setConfirm('');
      setAttempted(false);
      onSaved();
    },
  });

  const submit = () => {
    setAttempted(true);
    if (password && password === confirm) save.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={`Change the password for ${recorder.name}`}
      footer={
        <div style={ACTIONS}>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            Save new password
          </Button>
        </div>
      }
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        style={{ display: 'grid', gap: 'var(--space-4)' }}
      >
        <p style={NOTE}>
          Type the password the recorder now uses. The old one is replaced and cannot be viewed —
          not here, and not by anyone.
        </p>
        <PasswordField
          id="new-recorder-password"
          label="New password"
          value={password}
          error={attempted && !password ? 'Enter the new password' : undefined}
          onChange={setPassword}
        />
        <PasswordField
          id="confirm-recorder-password"
          label="Confirm new password"
          value={confirm}
          error={mismatch || (attempted && password !== confirm) ? 'The two passwords do not match' : undefined}
          onChange={setConfirm}
        />
        {save.isError ? (
          <p role="alert" style={{ ...NOTE, color: 'var(--severity-critical)' }}>
            {friendly(save.error, 'The password could not be saved.')}
          </p>
        ) : null}
        {/* Enter submits without the footer's button having focus. */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}

/* ── testing ──────────────────────────────────────────────────────────────── */

function TestPanel({ recorder }: { recorder: RecorderDetail }) {
  const channels = [...new Set(recorder.cameras.map((camera) => camera.channel))].sort((a, b) => a - b);
  const [channel, setChannel] = useState(String(channels[0] ?? 1));
  const [result, setResult] = useState<RecorderTestResult | null>(null);

  const test = useMutation({
    mutationFn: () => recordersApi.test(recorder.id, Number(channel) || 1),
    onSuccess: setResult,
  });

  return (
    <Region order={3}>
      <SectionRule
        label="Test connection"
        detail="Signs in with the saved password and asks one channel for a picture."
      />
      <Plane>
        <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '40rem' }}>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ width: '9rem' }}>
              <Input
                id="recorder-test-channel"
                label="Channel"
                value={channel}
                inputMode="numeric"
                onChange={(event) => {
                  setChannel(event.target.value);
                  setResult(null);
                }}
              />
            </div>
            <Button variant="primary" loading={test.isPending} onClick={() => test.mutate()}>
              {test.isPending ? 'Testing…' : 'Test connection'}
            </Button>
          </div>
          {test.isPending ? (
            <p style={NOTE} role="status">
              Waiting for a picture. This can take up to twenty seconds.
            </p>
          ) : null}
          {result && !test.isPending ? <TestResult result={result} /> : null}
          {test.isError && !test.isPending ? (
            <p role="alert" style={{ ...NOTE, color: 'var(--severity-critical)' }}>
              {friendly(test.error, 'The test could not be run. Try again in a moment.')}
            </p>
          ) : null}
        </div>
      </Plane>
    </Region>
  );
}

/* ── its cameras ──────────────────────────────────────────────────────────── */

function RecorderCameras({
  recorder,
  canManage,
  onChanged,
}: {
  recorder: RecorderDetail;
  canManage: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [tests, setTests] = useState<Record<string, TestOutcome>>({});
  const zones = useQuery({
    queryKey: ['zones', 'for-recorder'],
    queryFn: () => organizationApi.zones({ limit: 200 }),
  });
  const zoneName = (id: string) => zones.data?.zones.find((zone) => zone.id === id)?.name ?? '—';

  const lifecycle = useMutation({
    mutationFn: (camera: RecorderCamera) =>
      camera.enabled ? camerasApi.stop(camera.camera_key) : camerasApi.start(camera.camera_key),
    onSuccess: (result, camera) => {
      onChanged();
      if (camera.enabled) {
        toast(`${camera.name} stopped.`);
      } else if (result.streaming) {
        toast(`${camera.name} is starting.`);
      } else {
        // Not an error in the request: a reason the camera cannot start, such
        // as live CCTV being switched off for this server. Said, not hidden.
        toast(result.reason || `${camera.name} could not be started.`, 'error');
      }
    },
    onError: (error) => toast(friendly(error, 'That did not work. Try again.'), 'error'),
  });

  const testOne = useMutation({
    mutationFn: (camera: RecorderCamera) => camerasApi.testConnection({ camera_key: camera.camera_key }),
    onSuccess: (result, camera) => setTests((current) => ({ ...current, [camera.camera_key]: result })),
  });

  const status = (camera: RecorderCamera) => {
    if (!recorder.is_active) return <StatusBadge tone="idle">Recorder inactive</StatusBadge>;
    if (camera.running) return <StatusBadge tone="online">Watching</StatusBadge>;
    if (camera.enabled) return <StatusBadge tone="degraded">On — not streaming</StatusBadge>;
    return <StatusBadge tone="idle">Off</StatusBadge>;
  };

  return (
    <Region order={4}>
      <SectionRule
        label={`Cameras on this recorder (${recorder.cameras.length})`}
        detail="Each camera is one channel. They share the recorder’s address and password."
        actions={
          canManage && !adding ? (
            <Button onClick={() => setAdding(true)} disabled={(zones.data?.zones ?? []).length === 0}>
              + Add camera
            </Button>
          ) : null
        }
      />
      <Plane>
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
          {adding ? (
            <AddCameraRow
              recorder={recorder}
              zones={(zones.data?.zones ?? []).filter((zone) => zone.is_active)}
              onDone={() => setAdding(false)}
              onSaved={onChanged}
            />
          ) : null}

          {recorder.cameras.length === 0 && !adding ? (
            <p style={NOTE}>
              No cameras yet. {canManage ? 'Add one for each channel you want to watch.' : ''}
            </p>
          ) : null}

          {recorder.cameras.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                <caption style={{ position: 'absolute', left: '-9999px' }}>Cameras on {recorder.name}</caption>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--ink-secondary)' }}>
                    <th scope="col" style={{ padding: 'var(--space-2) var(--space-3) var(--space-2) 0' }}>Camera</th>
                    <th scope="col">Channel</th>
                    <th scope="col">Stream</th>
                    <th scope="col">Zone</th>
                    <th scope="col">Status</th>
                    {canManage ? <th scope="col"><span style={{ position: 'absolute', left: '-9999px' }}>Actions</span></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {recorder.cameras.map((camera) => {
                    const outcome = tests[camera.camera_key];
                    return (
                    <tr key={camera.camera_key} style={{ borderTop: '1px solid var(--line-subtle)', verticalAlign: 'top' }}>
                      <td style={{ padding: 'var(--space-3) var(--space-3) var(--space-3) 0' }}>
                        <Link to={`/admin/cameras/${encodeURIComponent(camera.camera_key)}`}>{camera.name}</Link>
                        {outcome ? (
                          <div style={{ marginTop: 'var(--space-2)' }}>
                            <TestResult result={outcome} />
                          </div>
                        ) : null}
                      </td>
                      <td style={{ padding: 'var(--space-3) 0', fontVariantNumeric: 'tabular-nums' }}>{camera.channel}</td>
                      <td style={{ padding: 'var(--space-3) 0' }}>{STREAM_SHORT[camera.stream_type]}</td>
                      <td style={{ padding: 'var(--space-3) 0' }}>{zoneName(camera.zone_id)}</td>
                      <td style={{ padding: 'var(--space-3) 0' }}>{status(camera)}</td>
                      {canManage ? (
                        <td style={{ padding: 'var(--space-3) 0' }}>
                          <div style={{ ...ACTIONS, justifyContent: 'flex-end' }}>
                            <Button
                              size="sm"
                              loading={testOne.isPending && testOne.variables?.camera_key === camera.camera_key}
                              onClick={() => testOne.mutate(camera)}
                            >
                              Test
                            </Button>
                            <Button
                              size="sm"
                              variant={camera.enabled ? 'secondary' : 'primary'}
                              disabled={!recorder.is_active && !camera.enabled}
                              loading={lifecycle.isPending && lifecycle.variables?.camera_key === camera.camera_key}
                              onClick={() => lifecycle.mutate(camera)}
                            >
                              {camera.enabled ? 'Stop' : 'Start watching'}
                            </Button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </Plane>
    </Region>
  );
}

function AddCameraRow({
  recorder,
  zones,
  onDone,
  onSaved,
}: {
  recorder: RecorderDetail;
  zones: ReadonlyArray<{ id: string; name: string }>;
  onDone: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const used = new Set(recorder.cameras.map((camera) => camera.channel));
  let firstFree = 1;
  while (used.has(firstFree)) firstFree += 1;

  const [channel, setChannel] = useState(String(firstFree));
  const [name, setName] = useState('');
  const [zoneId, setZoneId] = useState(zones.length === 1 ? (zones[0]?.id ?? '') : '');
  const [stream, setStream] = useState<'main' | 'sub'>('sub');
  const [attempted, setAttempted] = useState(false);

  const channelNumber = Number(channel);
  const channelProblem =
    !Number.isInteger(channelNumber) || channelNumber < 1
      ? 'Channel numbers start at 1'
      : used.has(channelNumber)
        ? `Channel ${channelNumber} already has a camera`
        : undefined;
  const invalid = Boolean(channelProblem) || !name.trim() || !zoneId;

  const next = useQuery({ queryKey: ['cameras', 'next-key'], queryFn: camerasApi.nextKey });
  const save = useMutation({
    mutationFn: () =>
      camerasApi.create({
        camera_key: next.data?.camera_key ?? '',
        recorder_id: recorder.id,
        channel: channelNumber,
        name: name.trim(),
        zone_id: zoneId,
        stream_type: stream,
      }),
    onSuccess: (camera) => {
      onSaved();
      onDone();
      toast(`${camera.name} added on channel ${camera.channel}. It is switched off until you start it.`);
    },
  });

  return (
    <form
      noValidate
      aria-label="Add a camera"
      onSubmit={(event) => {
        event.preventDefault();
        setAttempted(true);
        if (!invalid) save.mutate();
      }}
      style={{
        display: 'grid',
        gap: 'var(--space-3)',
        padding: 'var(--space-4)',
        border: '1px solid var(--line-subtle)',
        borderRadius: 'var(--radius-sm)',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(8.5rem, 1fr))', gap: 'var(--space-3)' }}>
        <Input
          id="new-camera-channel"
          label="Channel"
          value={channel}
          inputMode="numeric"
          error={channelProblem && (attempted || channel) ? channelProblem : undefined}
          onChange={(event) => setChannel(event.target.value)}
        />
        <Input
          id="new-camera-name"
          label="Camera name"
          value={name}
          placeholder="Kitchen entrance"
          error={attempted && !name.trim() ? 'Give this camera a name' : undefined}
          onChange={(event) => setName(event.target.value)}
        />
        <Select id="new-camera-zone" label="Zone" value={zoneId} onChange={(event) => setZoneId(event.target.value)}>
          <option value="">Choose…</option>
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name}
            </option>
          ))}
        </Select>
        <Select
          id="new-camera-stream"
          label="Stream"
          value={stream}
          onChange={(event) => setStream(event.target.value === 'main' ? 'main' : 'sub')}
        >
          <option value="sub">{STREAM_LABEL.sub}</option>
          <option value="main">{STREAM_LABEL.main}</option>
        </Select>
      </div>
      {attempted && !zoneId ? (
        <span role="alert" style={{ color: 'var(--severity-critical)', fontSize: 'var(--text-xs)' }}>
          Choose where this camera is
        </span>
      ) : null}
      {save.isError ? (
        <p role="alert" style={{ ...NOTE, color: 'var(--severity-critical)' }}>
          {friendly(save.error, 'The camera could not be added.')}
        </p>
      ) : null}
      <div style={ACTIONS}>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" loading={save.isPending} disabled={!next.data}>
          Add camera
        </Button>
      </div>
    </form>
  );
}

/* ── removing it ──────────────────────────────────────────────────────────── */

function RemoveRecorder({ recorder }: { recorder: RecorderDetail }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const toast = useToast();
  const remove = useMutation({
    mutationFn: () => recordersApi.remove(recorder.id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['recorders'] });
      toast(`${recorder.name} removed.`);
      navigate('/admin/recorders');
    },
    onError: (error) => toast(friendly(error, 'The recorder could not be removed.'), 'error'),
  });

  return (
    <Region order={5}>
      <SectionRule label="Remove" />
      <Plane>
        {recorder.cameras.length > 0 ? (
          <p style={NOTE}>
            This recorder has {recorder.cameras.length} camera{recorder.cameras.length === 1 ? '' : 's'},
            so it can be deactivated but not removed. Deactivating stops them all and keeps their
            settings.
          </p>
        ) : (
          <DangerConfirm
            expect={recorder.name}
            label="Type the recorder’s name to remove it"
            hint="It has no cameras, so nothing else is lost."
            actionLabel="Remove recorder"
            pending={remove.isPending}
            onConfirm={() => remove.mutate()}
          />
        )}
      </Plane>
    </Region>
  );
}

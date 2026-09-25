/**
 * Adding one camera to this organization.
 *
 * A camera is a channel on a recorder, so the first question is which
 * recorder — and there are exactly two answers:
 *
 *   1. **One this organization already has.** Every recorder it has added is
 *      listed with its name, brand, addresses and how many cameras it already
 *      carries. Choosing one reuses everything saved about it — address, port,
 *      account, password — and none of it is asked for again.
 *   2. **A new one.** That is the recorder flow at `/admin/recorders/new`,
 *      which asks for the address and password once and can add this camera
 *      in the same step.
 *
 * Then the channel on that recorder (checked against the channels its other
 * cameras already use), and where the camera is.
 *
 * ### The password is never asked for
 *
 * It belongs to the recorder, and it was typed once when the recorder was
 * added. The test on this page signs in with that stored password.
 *
 * ### The identifier is proposed, not invented
 *
 * `camera_key` is what the pipeline partitions on, so the server proposes the
 * next free one rather than asking somebody to guess one that does not collide.
 *
 * ### It is created switched off
 *
 * Adding a camera and beginning to process video of people are two decisions.
 * The camera's own page has one primary action — Start watching.
 */

import { useEffect, useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { organizationApi } from '@shared/api/observations';
import { camerasApi } from '@shared/api/persistence';
import { type Recorder, type RecorderTestResult, recordersApi } from '@shared/api/recorders';
import { Button, Input, LoadingState, Select } from '@shared/ui/primitives';
import { PageIntro, Plane, Region, SectionRule } from '@shared/ui/product';

import {
  CredentialState,
  friendly,
  RecorderStatus,
  STREAM_LABEL,
  TestResult,
  useOrganizationName,
} from './recorder-parts';
import { Failed } from './shared';

interface Draft {
  recorderId: string;
  channel: string;
  /** Whether the person typed a channel, so a recorder change stops proposing one. */
  channelTouched: boolean;
  streamType: 'main' | 'sub';
  zoneId: string;
  name: string;
  cameraKey: string;
  purpose: string;
}

const NOTE = { margin: 0, color: 'var(--ink-secondary)', fontSize: 'var(--text-sm)' } as const;

export function CameraOnboardingPage() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const organization = useOrganizationName();
  const [params] = useSearchParams();
  const [draft, setDraft] = useState<Draft>({
    recorderId: params.get('recorder') ?? '',
    channel: '1',
    channelTouched: false,
    streamType: 'sub',
    zoneId: params.get('zone') ?? '',
    name: '',
    cameraKey: '',
    purpose: '',
  });
  const [attempted, setAttempted] = useState(false);
  const [tested, setTested] = useState<RecorderTestResult | null>(null);

  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  const zones = useQuery({
    queryKey: ['zones', 'for-camera'],
    queryFn: () => organizationApi.zones({ limit: 200 }),
  });
  const recorders = useQuery({
    queryKey: ['recorders', 'for-camera'],
    queryFn: () => recordersApi.list({ limit: 200 }),
  });
  // The chosen recorder's cameras, so a channel already in use is caught here
  // rather than by the server after Add is pressed.
  const chosen = useQuery({
    queryKey: ['recorders', 'one', draft.recorderId],
    queryFn: () => recordersApi.get(draft.recorderId),
    enabled: Boolean(draft.recorderId),
  });

  // Proposed by the server, and only used while the person has not typed their
  // own: a key they chose is theirs to keep.
  const proposed = useQuery({ queryKey: ['cameras', 'next-key'], queryFn: camerasApi.nextKey });
  useEffect(() => {
    const suggestion = proposed.data?.camera_key;
    if (!suggestion) return;
    setDraft((current) => (current.cameraKey ? current : { ...current, cameraKey: suggestion }));
  }, [proposed.data]);

  // With exactly one recorder there is nothing to choose.
  useEffect(() => {
    const list = recorders.data?.recorders ?? [];
    const only = list.length === 1 ? list[0] : undefined;
    if (!only) return;
    setDraft((current) => (current.recorderId ? current : { ...current, recorderId: only.id }));
  }, [recorders.data]);

  const usedChannels = new Map((chosen.data?.cameras ?? []).map((camera) => [camera.channel, camera.name]));

  // Propose the first free channel on the chosen recorder, until one is typed.
  useEffect(() => {
    const cameras = chosen.data?.cameras;
    if (!cameras) return;
    const used = new Set(cameras.map((camera) => camera.channel));
    let free = 1;
    while (used.has(free)) free += 1;
    setDraft((current) => (current.channelTouched ? current : { ...current, channel: String(free) }));
  }, [chosen.data]);

  const available = recorders.data?.recorders ?? [];
  const recorder = available.find((candidate) => candidate.id === draft.recorderId);
  const activeZones = (zones.data?.zones ?? []).filter((zone) => zone.is_active);
  const channel = Number(draft.channel);
  const takenBy = usedChannels.get(channel);

  const problems = {
    recorder: draft.recorderId ? undefined : 'Choose the recorder this camera is plugged into',
    channel:
      !Number.isInteger(channel) || channel < 1
        ? 'Channel numbers start at 1'
        : takenBy
          ? `Channel ${channel} on this recorder is already used by “${takenBy}”`
          : undefined,
    zone: draft.zoneId ? undefined : 'Choose where this camera is',
    name: draft.name.trim() ? undefined : 'Give this camera a name',
    cameraKey: draft.cameraKey.trim() ? undefined : 'An identifier is needed',
  };
  const valid = Object.values(problems).every((problem) => !problem);

  const test = useMutation({
    mutationFn: () => recordersApi.test(draft.recorderId, channel),
    onSuccess: setTested,
  });

  const create = useMutation({
    mutationFn: () =>
      camerasApi.create({
        recorder_id: draft.recorderId,
        channel,
        stream_type: draft.streamType,
        zone_id: draft.zoneId,
        camera_key: draft.cameraKey.trim(),
        name: draft.name.trim(),
        purpose: draft.purpose.trim() || undefined,
      }),
    onSuccess: (camera) => {
      void client.invalidateQueries({ queryKey: ['cameras'] });
      void client.invalidateQueries({ queryKey: ['recorders'] });
      void client.invalidateQueries({ queryKey: ['zones'] });
      navigate(`/admin/cameras/${encodeURIComponent(camera.camera_key)}?added=1`);
    },
  });

  if (zones.isLoading || recorders.isLoading) return <LoadingState label="Getting ready" />;
  if (zones.isError) return <Failed error={zones.error} />;
  if (recorders.isError) return <Failed error={recorders.error} />;

  const shown = (problem: string | undefined) => (attempted ? problem : undefined);

  return (
    <>
      <PageIntro
        eyebrow={organization ? `Cameras · ${organization}` : 'Cameras'}
        title="Add a camera"
        standfirst="A camera is one channel on a recorder. Choose the recorder, then the channel and where the camera is. It is created switched off — you start it from its own page."
        actions={
          <Button variant="ghost" onClick={() => navigate('/admin/cameras')}>
            Cancel
          </Button>
        }
      />

      {available.length === 0 ? (
        <Region order={2}>
          <Plane>
            <p style={{ marginTop: 0 }}>
              {organization ? `${organization} has` : 'This organization has'} no recorders yet. A
              camera is a channel on a recorder — the DVR or NVR it is plugged into.
            </p>
            <p style={{ marginBottom: 0 }}>
              <Link to="/admin/recorders/new">Add a recorder</Link> — you enter its address and
              password once, and can add its cameras in the same step.
            </p>
          </Plane>
        </Region>
      ) : activeZones.length === 0 ? (
        <Region order={2}>
          <Plane>
            <p style={{ marginTop: 0 }}>
              There are no zones yet, and a camera is placed in one — the kitchen, the dine hall.
            </p>
            <p style={{ marginBottom: 0 }}>
              <Link to="/admin/zones">Add a zone first</Link>, then come back.
            </p>
          </Plane>
        </Region>
      ) : (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            setAttempted(true);
            if (valid) create.mutate();
          }}
        >
          <Region order={2}>
            <SectionRule
              lead
              label="1 · Which recorder"
              detail="Choosing one reuses its saved connection and password — you will not be asked for them again."
            />
            <Plane>
              <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
                <RecorderChoice
                  recorders={available}
                  selected={draft.recorderId}
                  onSelect={(id) => {
                    set({ recorderId: id, channelTouched: false });
                    setTested(null);
                  }}
                />
                {shown(problems.recorder) ? <FieldError>{problems.recorder ?? ''}</FieldError> : null}

                {recorder && !recorder.is_active ? (
                  <p style={NOTE} role="status">
                    {recorder.name} is deactivated. The camera can be added now, and starts only once
                    the recorder is activated again.
                  </p>
                ) : null}
                {recorder && recorder.credential_scheme !== 'recorder' ? (
                  <p style={NOTE} role="status">
                    {recorder.name}’s password is not saved here yet.{' '}
                    <Link to={`/admin/recorders/${encodeURIComponent(recorder.id)}`}>Set it on the recorder’s page</Link>{' '}
                    so its cameras can sign in.
                  </p>
                ) : null}

                {recorder ? (
                  <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '34rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '11rem minmax(0, 1fr)', gap: 'var(--space-3)' }}>
                      <Input
                        id="camera-channel"
                        label="Channel"
                        value={draft.channel}
                        inputMode="numeric"
                        hint="Which input on the recorder."
                        error={problems.channel && (attempted || takenBy) ? problems.channel : undefined}
                        onChange={(event) => {
                          set({ channel: event.target.value, channelTouched: true });
                          setTested(null);
                        }}
                      />
                      <Select
                        id="camera-stream"
                        label="Stream"
                        value={draft.streamType}
                        onChange={(event) => set({ streamType: event.target.value === 'main' ? 'main' : 'sub' })}
                      >
                        <option value="sub">{STREAM_LABEL.sub}</option>
                        <option value="main">{STREAM_LABEL.main}</option>
                      </Select>
                    </div>

                    <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
                      <Button
                        disabled={!draft.recorderId || Boolean(problems.channel && !takenBy)}
                        loading={test.isPending}
                        onClick={() => test.mutate()}
                      >
                        {test.isPending ? 'Testing…' : 'Test this channel'}
                      </Button>
                      <span style={NOTE}>Signs in with the recorder’s saved password.</span>
                    </div>
                    {tested && !test.isPending ? <TestResult result={tested} /> : null}
                    {test.isError && !test.isPending ? (
                      <p role="alert" style={{ ...NOTE, color: 'var(--severity-critical)' }}>
                        {friendly(test.error, 'The test could not be run. Try again in a moment.')}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Plane>
          </Region>

          <Region order={3}>
            <SectionRule label="2 · Where it is" detail="The zone it watches, and what people will call it." />
            <Plane>
              <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '34rem' }}>
                <Select
                  id="camera-zone"
                  label="Zone"
                  value={draft.zoneId}
                  onChange={(event) => set({ zoneId: event.target.value })}
                >
                  <option value="">Choose…</option>
                  {activeZones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name}
                    </option>
                  ))}
                </Select>
                {shown(problems.zone) ? <FieldError>{problems.zone ?? ''}</FieldError> : null}

                <Input
                  id="camera-name"
                  label="Name"
                  value={draft.name}
                  placeholder="Prep line"
                  hint="What the people who work there would call this view."
                  error={shown(problems.name)}
                  onChange={(event) => set({ name: event.target.value })}
                />

                <Input
                  id="camera-key"
                  label="Identifier"
                  value={draft.cameraKey}
                  hint="Proposed for you. It names this camera's records and cannot be changed later."
                  error={shown(problems.cameraKey)}
                  onChange={(event) => set({ cameraKey: event.target.value })}
                />

                <Input
                  id="camera-purpose"
                  label="Why it is watched (optional)"
                  value={draft.purpose}
                  placeholder="Hand-washing compliance at the prep line"
                  hint="Recorded because retention and lawful basis depend on purpose."
                  onChange={(event) => set({ purpose: event.target.value })}
                />

                {create.isError ? (
                  <p role="alert" style={{ ...NOTE, color: 'var(--severity-critical)' }}>
                    {friendly(create.error, 'The camera could not be added.')}
                  </p>
                ) : null}

                <div>
                  <Button variant="primary" type="submit" loading={create.isPending}>
                    {create.isPending ? 'Adding…' : 'Add camera'}
                  </Button>
                </div>
              </div>
            </Plane>
          </Region>
        </form>
      )}
    </>
  );
}

/**
 * The organization's recorders, one card each, plus "add a new one".
 *
 * A single-choice group: each card is a radio in a group labelled "Recorder".
 * Its accessible name is the recorder's name; what it shows besides — brand,
 * addresses, cameras, whether it is active — describes it.
 */
function RecorderChoice({
  recorders,
  selected,
  onSelect,
}: {
  recorders: ReadonlyArray<Recorder>;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const base = useId();
  return (
    <div
      role="radiogroup"
      aria-label="Recorder"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(15rem, 1fr))',
        gap: 'var(--space-3)',
      }}
    >
      {recorders.map((recorder) => {
        const checked = recorder.id === selected;
        const nameId = `${base}-${recorder.id}-name`;
        const detailId = `${base}-${recorder.id}-detail`;
        return (
          <button
            key={recorder.id}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-labelledby={nameId}
            aria-describedby={detailId}
            onClick={() => onSelect(recorder.id)}
            style={{
              textAlign: 'left',
              display: 'grid',
              gap: 'var(--space-2)',
              padding: 'var(--space-3) var(--space-4)',
              borderRadius: 'var(--radius-sm)',
              border: `${checked ? 2 : 1}px solid ${checked ? 'var(--accent)' : 'var(--line-default)'}`,
              background: checked ? 'var(--surface-sunken)' : 'transparent',
              color: 'var(--ink-primary)',
              cursor: 'pointer',
              font: 'inherit',
            }}
          >
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)', alignItems: 'baseline' }}>
              <strong id={nameId}>{recorder.name}</strong>
              <RecorderStatus active={recorder.is_active} />
            </span>
            <span id={detailId} style={{ display: 'grid', gap: '0.15rem', fontSize: 'var(--text-xs)', color: 'var(--ink-secondary)' }}>
              <span>{recorder.brand_label}</span>
              {recorder.ip_address ? (
                <span>
                  IP <span style={{ fontFamily: 'var(--font-mono)' }}>{recorder.ip_address}</span>
                  {recorder.connect_via === 'ip_address' && recorder.hostname ? ' · in use' : ''}
                </span>
              ) : null}
              {recorder.hostname ? (
                <span>
                  Domain <span style={{ fontFamily: 'var(--font-mono)' }}>{recorder.hostname}</span>
                  {recorder.connect_via === 'hostname' && recorder.ip_address ? ' · in use' : ''}
                </span>
              ) : null}
              <span>
                {recorder.camera_count === 0
                  ? 'No cameras yet'
                  : `${recorder.camera_count} camera${recorder.camera_count === 1 ? '' : 's'}`}{' '}
                · Password: <CredentialState recorder={recorder} />
              </span>
            </span>
          </button>
        );
      })}
      <Link
        to="/admin/recorders/new"
        style={{
          display: 'grid',
          alignContent: 'center',
          gap: 'var(--space-1)',
          padding: 'var(--space-3) var(--space-4)',
          borderRadius: 'var(--radius-sm)',
          border: '1px dashed var(--line-strong)',
          textDecoration: 'none',
          color: 'var(--ink-primary)',
        }}
      >
        <strong>+ Add a new recorder</strong>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-secondary)' }}>
          A DVR or NVR not listed here. You enter its address and password once, and can add its
          cameras in the same step.
        </span>
      </Link>
    </div>
  );
}

function FieldError({ children }: { children: string }) {
  return (
    <span role="alert" style={{ color: 'var(--severity-critical)', fontSize: 'var(--text-xs)' }}>
      {children}
    </span>
  );
}

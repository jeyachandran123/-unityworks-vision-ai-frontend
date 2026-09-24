/**
 * Adding one camera to a recorder that already exists.
 *
 * Adding a whole site — a new DVR and its cameras — is the recorder flow, at
 * `/admin/recorders/new`. This page is for the later, smaller job: one more
 * channel on a box that is already set up.
 *
 * Two questions, because only two things are unknown:
 *
 *   1. **Where it comes from** — which recorder, which channel, which stream.
 *      The recorder's address, account and password are already known, so they
 *      are shown for context and never asked for.
 *   2. **Where it is** — the zone, a name, and why it is watched.
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

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { organizationApi } from '@shared/api/observations';
import { camerasApi } from '@shared/api/persistence';
import { type RecorderTestResult, recordersApi } from '@shared/api/recorders';
import { Button, Input, LoadingState, Select } from '@shared/ui/primitives';
import { PageIntro, Plane, Region, SectionRule } from '@shared/ui/product';

import { CredentialState, friendly, RecorderStatus, STREAM_LABEL, TestResult } from './recorder-parts';
import { Failed } from './shared';

interface Draft {
  recorderId: string;
  channel: string;
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
  const [params] = useSearchParams();
  const [draft, setDraft] = useState<Draft>({
    recorderId: params.get('recorder') ?? '',
    channel: '1',
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

  const available = recorders.data?.recorders ?? [];

  const recorder = available.find((candidate) => candidate.id === draft.recorderId);
  const activeZones = (zones.data?.zones ?? []).filter((zone) => zone.is_active);
  const channel = Number(draft.channel);

  const problems = {
    recorder: draft.recorderId ? undefined : 'Choose the recorder this camera is plugged into',
    channel: Number.isInteger(channel) && channel >= 1 ? undefined : 'Channel numbers start at 1',
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
        eyebrow="Cameras"
        title="Add a camera"
        standfirst="One more channel on a recorder you have already added. It is created switched off — you start it from its own page."
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
              There are no recorders yet. A camera is a channel on a recorder — the DVR or NVR it is
              plugged into.
            </p>
            <p style={{ marginBottom: 0 }}>
              <Link to="/admin/recorders/new">Add a recorder</Link> — you can add its cameras in the
              same step.
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
              label="1 · Where it comes from"
              detail="The recorder it is plugged into, and which of its channels."
            />
            <Plane>
              <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '34rem' }}>
                <Select
                  id="camera-recorder"
                  label="Recorder"
                  value={draft.recorderId}
                  onChange={(event) => {
                    set({ recorderId: event.target.value });
                    setTested(null);
                  }}
                >
                  <option value="">Choose…</option>
                  {available.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name} — {candidate.brand_label}
                      {candidate.is_active ? '' : ' (inactive)'}
                    </option>
                  ))}
                </Select>
                {shown(problems.recorder) ? <FieldError>{problems.recorder ?? ''}</FieldError> : null}

                {recorder ? (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 'var(--space-2) var(--space-4)',
                      fontSize: 'var(--text-sm)',
                      color: 'var(--ink-secondary)',
                    }}
                  >
                    <span>
                      {recorder.host}:{recorder.rtsp_port}
                    </span>
                    <span>
                      Password: <CredentialState recorder={recorder} />
                    </span>
                    <RecorderStatus active={recorder.is_active} />
                  </div>
                ) : null}

                <div style={{ display: 'grid', gridTemplateColumns: '9rem minmax(0, 1fr)', gap: 'var(--space-3)' }}>
                  <Input
                    id="camera-channel"
                    label="Channel"
                    value={draft.channel}
                    inputMode="numeric"
                    hint="Which input on the recorder."
                    error={shown(problems.channel)}
                    onChange={(event) => {
                      set({ channel: event.target.value });
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
                    disabled={!draft.recorderId || Boolean(problems.channel)}
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

function FieldError({ children }: { children: string }) {
  return (
    <span role="alert" style={{ color: 'var(--severity-critical)', fontSize: 'var(--text-xs)' }}>
      {children}
    </span>
  );
}

/**
 * Adding a camera — two steps, because only two things are genuinely unknown.
 *
 * The form this replaces had five steps, and three of them asked the server
 * things it already knew: the DVR's address, its port, its username, and
 * "where the password is kept". A person adding the ninth camera on the same
 * recorder answered the same four questions nine times, and any one of them
 * typed wrong produced a camera that saved, listed, and never connected.
 *
 * What is actually unknown when somebody adds a camera:
 *
 *   1. **Where it is and what to call it.** The zone, and a name.
 *   2. **How to reach it** — and only where it differs from the deployment's
 *      own DVR, which is prefilled. The channel is the usual difference.
 *
 * ### The password is never asked for
 *
 * It is the deployment's, resolved from the server's environment at connect
 * time. The old form offered a choice of "where the password is kept", which
 * is a question about the server's configuration wearing the clothes of a
 * question about this camera.
 *
 * ### The identifier is proposed, not invented
 *
 * `camera_key` is what the pipeline partitions on — it names observation files
 * on disk and appears in every runtime identity. Asking somebody to invent one
 * invites a collision with a camera they cannot see, so the server proposes
 * the next free one.
 *
 * ### It is created switched off, and the next step is on the camera's page
 *
 * Adding a camera and beginning to process video of people are two decisions.
 * The camera page has one primary action — Start watching — and it reports
 * what happened rather than leaving somebody to wonder.
 */

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { isApiError } from '@shared/api/errors';
import { organizationApi } from '@shared/api/observations';
import { camerasApi, type ConnectionTest } from '@shared/api/persistence';
import { Button, Input, LoadingState, Select, StatusBadge } from '@shared/ui/primitives';
import { PageIntro, Plane, Region, SectionRule } from '@shared/ui/product';

import { Failed } from './shared';

interface Draft {
  zoneId: string;
  name: string;
  cameraKey: string;
  channel: string;
  host: string;
  rtspPort: string;
  streamType: 'main' | 'sub';
  username: string;
  purpose: string;
}

const EMPTY: Draft = {
  zoneId: '',
  name: '',
  cameraKey: '',
  channel: '1',
  host: '',
  rtspPort: '',
  streamType: 'main',
  username: '',
  purpose: '',
};

export function CameraOnboardingPage() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [draft, setDraft] = useState<Draft>({ ...EMPTY, zoneId: params.get('zone') ?? '' });
  const [step, setStep] = useState<1 | 2>(1);
  const [probe, setProbe] = useState<ConnectionTest | null>(null);

  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  const zones = useQuery({
    queryKey: ['zones', 'for-camera'],
    queryFn: () => organizationApi.zones({ limit: 200 }),
  });

  // Proposed by the server, and only used while the person has not typed their
  // own: a key they chose is theirs to keep.
  const proposed = useQuery({ queryKey: ['cameras', 'next-key'], queryFn: camerasApi.nextKey });
  useEffect(() => {
    const suggestion = proposed.data?.camera_key;
    if (!suggestion) return;
    // Only fills the gap: a key somebody typed is theirs to keep.
    setDraft((current) => (current.cameraKey ? current : { ...current, cameraKey: suggestion }));
  }, [proposed.data]);

  const test = useMutation({
    mutationFn: () =>
      camerasApi.testConnection({
        host: draft.host.trim() || undefined,
        rtsp_port: Number(draft.rtspPort) || undefined,
      }),
    onSuccess: setProbe,
  });

  const create = useMutation({
    mutationFn: () =>
      camerasApi.create({
        zone_id: draft.zoneId,
        camera_key: draft.cameraKey.trim(),
        name: draft.name.trim(),
        channel: Number(draft.channel) || 1,
        // Sent only when it differs from the deployment's own configuration;
        // the server fills the rest.
        host: draft.host.trim() || undefined,
        rtsp_port: Number(draft.rtspPort) || undefined,
        stream_type: draft.streamType,
        username: draft.username.trim() || undefined,
        purpose: draft.purpose.trim() || undefined,
      }),
    onSuccess: (camera) => {
      void client.invalidateQueries({ queryKey: ['cameras'] });
      void client.invalidateQueries({ queryKey: ['zones'] });
      navigate(`/admin/cameras/${encodeURIComponent(camera.camera_key)}?added=1`);
    },
  });

  if (zones.isLoading) return <LoadingState label="Reading zones" />;
  if (zones.isError) return <Failed error={zones.error} />;

  const available = zones.data?.zones ?? [];
  const placed = Boolean(draft.zoneId) && Boolean(draft.name.trim()) && Boolean(draft.cameraKey.trim());

  return (
    <>
      <PageIntro
        eyebrow="Cameras"
        title="Add a camera"
        standfirst="Two steps. It is created switched off — you start it from its own page once it is in."
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
              There are no zones yet, and a camera is placed in one — the kitchen, the dine hall.
            </p>
            <p style={{ marginBottom: 0 }}>
              <Link to="/admin/zones">Add a zone first</Link>, then come back.
            </p>
          </Plane>
        </Region>
      ) : (
        <>
          <Region order={2}>
            <SectionRule
              lead
              label="1 · Where it is"
              detail="The zone it watches, and what people will call it."
            />
            <Plane>
              <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '32rem' }}>
                <Select
                  id="camera-zone"
                  label="Zone"
                  value={draft.zoneId}
                  onChange={(event) => set({ zoneId: event.target.value })}
                >
                  <option value="">Choose…</option>
                  {available.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name}
                    </option>
                  ))}
                </Select>

                <Input
                  id="camera-name"
                  label="Name"
                  value={draft.name}
                  placeholder="Prep line"
                  hint="What the people who work there would call this view."
                  onChange={(event) => set({ name: event.target.value })}
                />

                <Input
                  id="camera-key"
                  label="Identifier"
                  value={draft.cameraKey}
                  hint="Proposed for you. It names this camera's records on disk and cannot be changed later."
                  onChange={(event) => set({ cameraKey: event.target.value })}
                />

                {step === 1 ? (
                  <div>
                    <Button disabled={!placed} onClick={() => setStep(2)}>
                      Next
                    </Button>
                  </div>
                ) : null}
              </div>
            </Plane>
          </Region>

          {step === 2 ? (
            <Region order={3}>
              <SectionRule
                label="2 · How to reach it"
                detail="Already filled in from this deployment's recorder. Usually only the channel differs."
              />
              <Plane>
                <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '32rem' }}>
                  <Input
                    id="camera-channel"
                    label="Channel"
                    value={draft.channel}
                    hint="Which input on the recorder this camera is plugged into."
                    onChange={(event) => set({ channel: event.target.value })}
                  />

                  <Input
                    id="camera-host"
                    label="Address"
                    value={draft.host}
                    placeholder="This deployment's recorder"
                    hint="Leave blank unless this camera is on a different recorder."
                    onChange={(event) => set({ host: event.target.value })}
                  />

                  <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                    <Input
                      id="camera-port"
                      label="Port"
                      value={draft.rtspPort}
                      placeholder="554"
                      onChange={(event) => set({ rtspPort: event.target.value })}
                    />
                    <Select
                      id="camera-stream"
                      label="Stream"
                      value={draft.streamType}
                      onChange={(event) =>
                        set({ streamType: event.target.value === 'sub' ? 'sub' : 'main' })
                      }
                    >
                      <option value="main">Main — full quality</option>
                      <option value="sub">Sub — lighter, lower quality</option>
                    </Select>
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
                    <Button
                      variant="secondary"
                      disabled={test.isPending}
                      onClick={() => test.mutate()}
                    >
                      {test.isPending ? 'Testing…' : 'Test connection'}
                    </Button>
                    {probe ? (
                      <StatusBadge tone={probe.reachable ? 'online' : 'offline'}>
                        {probe.reachable ? 'Answered' : 'No answer'}
                      </StatusBadge>
                    ) : null}
                  </div>
                  {probe ? (
                    <p style={{ margin: 0, color: 'var(--ink-secondary)' }}>{probe.detail}</p>
                  ) : null}

                  {/* Said plainly, because the old form asked about it as though
                      it were a property of this camera. */}
                  <p style={{ margin: 0, color: 'var(--ink-tertiary)', fontSize: 'var(--text-sm)' }}>
                    The password comes from this server's own configuration. It is never typed
                    here and never sent to your browser.
                  </p>

                  <Input
                    id="camera-purpose"
                    label="Why it is watched (optional)"
                    value={draft.purpose}
                    placeholder="Hand-washing compliance at the prep line"
                    hint="Recorded because retention and lawful basis depend on purpose."
                    onChange={(event) => set({ purpose: event.target.value })}
                  />

                  <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                    <Button variant="ghost" onClick={() => setStep(1)}>
                      Back
                    </Button>
                    <Button disabled={!placed || create.isPending} onClick={() => create.mutate()}>
                      {create.isPending ? 'Adding…' : 'Add camera'}
                    </Button>
                  </div>

                  {create.isError ? (
                    <p role="alert" style={{ margin: 0, color: 'var(--severity-critical, inherit)' }}>
                      {isApiError(create.error)
                        ? create.error.friendlyMessage
                        : 'The camera could not be added.'}
                    </p>
                  ) : null}
                </div>
              </Plane>
            </Region>
          ) : null}
        </>
      )}
    </>
  );
}

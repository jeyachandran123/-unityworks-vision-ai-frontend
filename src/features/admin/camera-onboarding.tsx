/**
 * Adding a camera — a guided workflow, not a form with six boxes.
 *
 * The form this replaces asked for `restaurant_id` and `zone_id` as raw text.
 * Nobody knows a zone's UUID. It also omitted `host` entirely, which is the
 * field the runtime filters on — so a camera added through the product was
 * accepted, listed, and never connected, with nothing anywhere saying why.
 *
 * ### Why five steps and not one long page
 *
 * The five things being decided are genuinely different kinds of decision,
 * and mixing them is what made the original unusable:
 *
 *   1. **Placement** — where it is. Chosen from what exists, never typed.
 *   2. **Connection** — how to reach it. Wrong here and nothing works.
 *   3. **Processing** — what to do with the video. This is the one that
 *      spends money and processes images of people, so it is its own step
 *      with its consequences written out rather than a checkbox in a corner.
 *   4. **Test** — before committing, find out whether the address was right,
 *      while the person who typed it is still looking at it.
 *   5. **Review** — read it back before it becomes real.
 *
 * ### The camera is created switched off
 *
 * Always, and the review step says so. Adding a camera and starting to
 * process video of people are two decisions, and the server enforces that
 * separation regardless of what this page sends.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { organizationApi } from '@shared/api/observations';
import { camerasApi, type ConnectionTest } from '@shared/api/persistence';
import { isApiError } from '@shared/api/errors';
import {
  Badge,
  Button,
  Input,
  LoadingState,
  Select,
  StatusBadge,
} from '@shared/ui/primitives';
import { PageIntro, Plane, Region, SectionRule } from '@shared/ui/product';

import { Failed } from './shared';

const STEPS = ['Placement', 'Connection', 'Processing', 'Test', 'Review'] as const;
type Step = (typeof STEPS)[number];

interface Draft {
  siteId: string;
  zoneId: string;
  cameraKey: string;
  name: string;
  channel: string;
  host: string;
  rtspPort: string;
  streamType: 'main' | 'sub';
  username: string;
  credentialScheme: 'env' | 'file' | 'none';
  credentialName: string;
  analysisEnabled: boolean;
  analysisFps: string;
  purpose: string;
}

const EMPTY: Draft = {
  siteId: '',
  zoneId: '',
  cameraKey: '',
  name: '',
  channel: '1',
  host: '',
  rtspPort: '554',
  streamType: 'sub',
  username: '',
  credentialScheme: 'env',
  credentialName: 'CCTV_PASSWORD',
  analysisEnabled: true,
  analysisFps: '4',
  purpose: '',
}

function credentialRef(draft: Draft): string {
  if (draft.credentialScheme === 'none') return '';
  return `${draft.credentialScheme}:${draft.credentialName.trim()}`;
}

/** A step's own answer to "can I move on yet". */
function complete(step: Step, draft: Draft): boolean {
  switch (step) {
    case 'Placement':
      return Boolean(draft.siteId && draft.cameraKey.trim() && draft.name.trim());
    case 'Connection':
      return Boolean(draft.host.trim() && Number(draft.rtspPort) > 0);
    case 'Processing':
      return Number(draft.analysisFps) > 0;
    default:
      return true;
  }
}

export function CameraOnboardingPage() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [params] = useSearchParams();

  const [step, setStep] = useState<Step>('Placement');
  const [draft, setDraft] = useState<Draft>({ ...EMPTY, siteId: params.get('site') ?? '' });
  const [test, setTest] = useState<ConnectionTest | null>(null);

  const set = <K extends keyof Draft>(key: K) => (value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const sites = useQuery({
    queryKey: ['sites', 'all'],
    queryFn: () => organizationApi.restaurants({ limit: 200, is_active: true }),
  });
  const zones = useQuery({
    queryKey: ['zones', draft.siteId],
    queryFn: () => organizationApi.zones(draft.siteId),
    enabled: Boolean(draft.siteId),
  });

  const probe = useMutation({
    mutationFn: () =>
      camerasApi.testConnection({
        host: draft.host.trim(),
        rtsp_port: Number(draft.rtspPort),
      }),
    onSuccess: setTest,
  });

  const create = useMutation({
    mutationFn: () =>
      camerasApi.create({
        restaurant_id: draft.siteId,
        zone_id: draft.zoneId || undefined,
        camera_key: draft.cameraKey.trim(),
        name: draft.name.trim(),
        channel: Number(draft.channel) || 1,
        host: draft.host.trim(),
        rtsp_port: Number(draft.rtspPort) || 554,
        stream_type: draft.streamType,
        username: draft.username.trim() || undefined,
        credential_ref: credentialRef(draft) || undefined,
        analysis_fps: Number(draft.analysisFps) || 4,
        analysis_enabled: draft.analysisEnabled,
        purpose: draft.purpose.trim() || undefined,
      }),
    onSuccess: (camera) => {
      void client.invalidateQueries({ queryKey: ['cameras'] });
      void client.invalidateQueries({ queryKey: ['sites'] });
      navigate(`/admin/cameras/${encodeURIComponent(camera.camera_key)}`);
    },
  });

  const index = STEPS.indexOf(step);
  const canAdvance = complete(step, draft);
  const site = sites.data?.restaurants.find((r) => r.id === draft.siteId);
  const zone = zones.data?.zones.find((z) => z.id === draft.zoneId);

  return (
    <>
      <PageIntro
        eyebrow="Cameras"
        title="Add a camera"
        standfirst="Five steps. It is created switched off, so nothing starts processing video until you say so separately."
        actions={<Link to="/admin/cameras">Cancel</Link>}
      />

      <Region order={2}>
        <ol
          aria-label="Progress"
          style={{
            display: 'flex',
            gap: 'var(--space-5)',
            listStyle: 'none',
            margin: '0 0 var(--space-8)',
            padding: 0,
            flexWrap: 'wrap',
          }}
        >
          {STEPS.map((name, position) => {
            const state =
              position < index ? 'done' : position === index ? 'current' : 'ahead';
            return (
              <li
                key={name}
                aria-current={state === 'current' ? 'step' : undefined}
                style={{
                  display: 'flex',
                  gap: 'var(--space-2)',
                  alignItems: 'baseline',
                  color:
                    state === 'ahead' ? 'var(--text-muted)' : 'var(--text-primary)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: state === 'current' ? 'var(--accent)' : 'var(--text-muted)',
                  }}
                >
                  {position + 1}
                </span>
                {/* The step name carries the state in words too, never colour
                    alone: "done" and "ahead" are the same shape otherwise. */}
                <span>{name}</span>
                {state === 'done' ? <span className="sr-only">(done)</span> : null}
              </li>
            );
          })}
        </ol>

        {step === 'Placement' ? (
          <Placement
            draft={draft}
            set={set}
            sites={sites}
            zones={zones}
          />
        ) : null}
        {step === 'Connection' ? <Connection draft={draft} set={set} /> : null}
        {step === 'Processing' ? <Processing draft={draft} set={set} /> : null}
        {step === 'Test' ? (
          <TestStep draft={draft} probe={probe} test={test} />
        ) : null}
        {step === 'Review' ? (
          <Review
            draft={draft}
            siteName={site?.name ?? draft.siteId}
            zoneName={zone?.name ?? null}
            test={test}
          />
        ) : null}

        <div
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            marginTop: 'var(--space-8)',
            flexWrap: 'wrap',
          }}
        >
          <Button
            variant="ghost"
            disabled={index === 0}
            onClick={() => setStep(STEPS[index - 1] ?? 'Placement')}
          >
            Back
          </Button>
          {step === 'Review' ? (
            <Button disabled={create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? 'Adding…' : 'Add camera'}
            </Button>
          ) : (
            <Button
              disabled={!canAdvance}
              onClick={() => setStep(STEPS[index + 1] ?? 'Review')}
            >
              Continue
            </Button>
          )}
        </div>

        {create.isError ? (
          <div style={{ marginTop: 'var(--space-6)' }}>
            <Failed error={create.error} />
            {isApiError(create.error) ? null : null}
          </div>
        ) : null}
      </Region>
    </>
  );
}

/* ── step 1 ───────────────────────────────────────────────────────────────── */

function Placement({
  draft,
  set,
  sites,
  zones,
}: {
  draft: Draft;
  set: <K extends keyof Draft>(key: K) => (value: Draft[K]) => void;
  sites: ReturnType<typeof useQuery<Awaited<ReturnType<typeof organizationApi.restaurants>>>>;
  zones: ReturnType<typeof useQuery<Awaited<ReturnType<typeof organizationApi.zones>>>>;
}) {
  return (
    <>
      <SectionRule
        lead
        label="Placement"
        detail="Where this camera is. Findings are attributed here, so it is worth getting right."
      />
      <Plane>
        {sites.isLoading ? <LoadingState label="Reading sites" /> : null}
        {sites.isError ? <Failed error={sites.error} /> : null}
        {sites.data ? (
          <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '32rem' }}>
            <Select
              label="Site"
              value={draft.siteId}
              onChange={(event) => {
                set('siteId')(event.target.value);
                // A zone belongs to a site. Keeping the old one selected would
                // send the server a zone from somewhere else, which it refuses
                // — correctly, and confusingly if the form let it happen.
                set('zoneId')('');
              }}
            >
              <option value="">Choose a site</option>
              {sites.data.restaurants.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </Select>

            <Select
              label="Zone"
              hint={
                draft.siteId
                  ? 'Optional. A camera with no zone is placed at the site but not in a room, and its findings can only be attributed that far.'
                  : 'Choose a site first — zones belong to one.'
              }
              value={draft.zoneId}
              disabled={!draft.siteId}
              onChange={(event) => set('zoneId')(event.target.value)}
            >
              <option value="">No zone yet</option>
              {(zones.data?.zones ?? []).map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </Select>

            <Input
              label="Name"
              hint="What people call it. Shown on the wall and in every finding."
              value={draft.name}
              placeholder="Kitchen line"
              onChange={(event) => set('name')(event.target.value)}
            />

            <Input
              label="Camera key"
              hint="A short stable identifier: letters, digits, hyphens and underscores. It cannot be changed later — observations are filed under it."
              value={draft.cameraKey}
              placeholder="cam-01"
              onChange={(event) => set('cameraKey')(event.target.value)}
            />
          </div>
        ) : null}
      </Plane>
    </>
  );
}

/* ── step 2 ───────────────────────────────────────────────────────────────── */

function Connection({
  draft,
  set,
}: {
  draft: Draft;
  set: <K extends keyof Draft>(key: K) => (value: Draft[K]) => void;
}) {
  return (
    <>
      <SectionRule
        lead
        label="Connection"
        detail="How Vision OS reaches the camera. Every field here is required for it to connect at all."
      />
      <Plane>
        <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '32rem' }}>
          <Input
            label="Host or IP address"
            hint="The recorder or the camera itself. Required: a camera without one is never dialled."
            value={draft.host}
            placeholder="10.0.0.5"
            onChange={(event) => set('host')(event.target.value)}
          />
          <Input
            label="RTSP port"
            type="number"
            value={draft.rtspPort}
            onChange={(event) => set('rtspPort')(event.target.value)}
          />
          <Input
            label="Channel"
            type="number"
            hint="Which input on the recorder. Channel 1 is the first."
            value={draft.channel}
            onChange={(event) => set('channel')(event.target.value)}
          />
          <Select
            label="Stream"
            hint="Sub is lower resolution and much cheaper to decode. Main is full resolution — use it only where detail genuinely matters."
            value={draft.streamType}
            onChange={(event) => set('streamType')(event.target.value as 'main' | 'sub')}
          >
            <option value="sub">Sub-stream</option>
            <option value="main">Main stream</option>
          </Select>
          <Input
            label="Username"
            value={draft.username}
            placeholder="admin"
            onChange={(event) => set('username')(event.target.value)}
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
            {/* The password itself is never typed here, and this says why in
                one sentence rather than leaving it as a surprising absence. */}
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
              Vision OS stores a <em>pointer</em> to the password, never the password. It is read
              at the moment of connecting and never written to the database, a log, or this
              screen.
            </p>
            <Select
              label="Where the password is kept"
              value={draft.credentialScheme}
              onChange={(event) =>
                set('credentialScheme')(event.target.value as Draft['credentialScheme'])
              }
            >
              <option value="env">An environment variable on the server</option>
              <option value="file">A file on the server</option>
              <option value="none">No password (open stream)</option>
            </Select>
            {draft.credentialScheme !== 'none' ? (
              <Input
                label={
                  draft.credentialScheme === 'env' ? 'Variable name' : 'File path'
                }
                hint={
                  draft.credentialScheme === 'env'
                    ? 'For example CCTV_PASSWORD. The name, not the value.'
                    : 'For example /run/secrets/dvr. The path, not the contents.'
                }
                value={draft.credentialName}
                onChange={(event) => set('credentialName')(event.target.value)}
              />
            ) : null}
          </fieldset>
        </div>
      </Plane>
    </>
  );
}

/* ── step 3 ───────────────────────────────────────────────────────────────── */

function Processing({
  draft,
  set,
}: {
  draft: Draft;
  set: <K extends keyof Draft>(key: K) => (value: Draft[K]) => void;
}) {
  return (
    <>
      <SectionRule
        lead
        label="Video processing"
        detail="What happens to the video once it arrives. These two settings are the ones that spend money and process images of people."
      />
      <Plane>
        <div style={{ display: 'grid', gap: 'var(--space-6)', maxWidth: '34rem' }}>
          <div
            style={{
              display: 'grid',
              gap: 'var(--space-2)',
              padding: 'var(--space-4)',
              border: '1px solid var(--line-subtle)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <strong>Connecting to the camera</strong>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
              Every camera is added switched off. Nothing connects, nothing decodes, and nothing
              is recorded until somebody turns it on from the camera's own page — which is a
              separate, audited act.
            </p>
          </div>

          <label style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
            <input
              type="checkbox"
              checked={draft.analysisEnabled}
              onChange={(event) => set('analysisEnabled')(event.target.checked)}
              style={{ marginTop: '0.3rem' }}
            />
            <span>
              <strong style={{ display: 'block' }}>Analyse this camera with AI</strong>
              <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                Separate from streaming. A camera can be watched on the wall without being
                analysed — useful for a corridor, where paying for detection, tracking and model
                calls buys nothing. Analysis is what produces findings.
              </span>
            </span>
          </label>

          <Input
            label="Frames analysed per second"
            type="number"
            step="0.5"
            hint="Not the camera's frame rate. Four a second is plenty for hygiene compliance; higher costs proportionally more for very little."
            value={draft.analysisFps}
            onChange={(event) => set('analysisFps')(event.target.value)}
          />

          <Input
            label="Purpose"
            hint="Why this camera is watched. Recorded because retention and lawful basis both depend on purpose, not on the fact that a lens exists."
            value={draft.purpose}
            placeholder="Kitchen hygiene compliance"
            onChange={(event) => set('purpose')(event.target.value)}
          />
        </div>
      </Plane>
    </>
  );
}

/* ── step 4 ───────────────────────────────────────────────────────────────── */

function TestStep({
  draft,
  probe,
  test,
}: {
  draft: Draft;
  probe: { mutate: () => void; isPending: boolean; isError: boolean; error: unknown };
  test: ConnectionTest | null;
}) {
  return (
    <>
      <SectionRule
        lead
        label="Test the connection"
        detail="Optional, and worth doing: a typo found now is a typo found while you are still looking at it."
      />
      <Plane>
        <div style={{ display: 'grid', gap: 'var(--space-5)', maxWidth: '34rem' }}>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            Vision OS will try to open a connection to{' '}
            <code>
              {draft.host || '—'}:{draft.rtspPort}
            </code>
            .
          </p>

          <div>
            <Button
              variant="secondary"
              disabled={!draft.host.trim() || probe.isPending}
              onClick={() => probe.mutate()}
            >
              {probe.isPending ? 'Testing…' : test ? 'Test again' : 'Test connection'}
            </Button>
          </div>

          {probe.isError ? <Failed error={probe.error} /> : null}

          {test ? (
            <div
              style={{
                display: 'grid',
                gap: 'var(--space-3)',
                padding: 'var(--space-4)',
                border: '1px solid var(--line-subtle)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <StatusBadge tone={test.reachable ? 'online' : 'offline'}>
                {test.reachable ? 'Reachable' : 'Not reachable'}
              </StatusBadge>
              <p style={{ margin: 0 }}>{test.detail}</p>
              {/* Said on every result, including a pass. "Connection test
                  passed" is otherwise read as "the camera works", and this
                  test cannot know that. */}
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                {test.proves}
              </p>
            </div>
          ) : null}

          {!test ? (
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
              You can skip this and add the camera anyway. It is created switched off either way.
            </p>
          ) : null}
        </div>
      </Plane>
    </>
  );
}

/* ── step 5 ───────────────────────────────────────────────────────────────── */

function Review({
  draft,
  siteName,
  zoneName,
  test,
}: {
  draft: Draft;
  siteName: string;
  zoneName: string | null;
  test: ConnectionTest | null;
}) {
  const rows: ReadonlyArray<[string, string]> = useMemo(
    () => [
      ['Site', siteName],
      ['Zone', zoneName ?? 'Not placed in a zone'],
      ['Name', draft.name.trim()],
      ['Camera key', draft.cameraKey.trim()],
      ['Address', `${draft.host.trim()}:${draft.rtspPort}`],
      ['Channel', draft.channel],
      ['Stream', draft.streamType === 'main' ? 'Main stream' : 'Sub-stream'],
      ['Username', draft.username.trim() || 'None'],
      [
        'Password',
        draft.credentialScheme === 'none'
          ? 'None'
          : draft.credentialScheme === 'env'
            ? `Environment variable ${draft.credentialName.trim()}`
            : `File ${draft.credentialName.trim()}`,
      ],
      ['Analysis', draft.analysisEnabled ? `On, ${draft.analysisFps} fps` : 'Off'],
      ['Purpose', draft.purpose.trim() || 'Not stated'],
      [
        'Connection test',
        test ? (test.reachable ? 'Reachable' : `Not reachable — ${test.outcome}`) : 'Not tested',
      ],
    ],
    [draft, siteName, zoneName, test],
  );

  return (
    <>
      <SectionRule lead label="Review" detail="Read it back before it becomes real." />
      <Plane>
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
              <dd style={{ margin: 0 }}>{value}</dd>
            </div>
          ))}
        </dl>

        <p
          style={{
            marginTop: 'var(--space-6)',
            marginBottom: 0,
            color: 'var(--text-secondary)',
          }}
        >
          This camera will be created <Badge>switched off</Badge>. It opens no connection and
          processes nothing until it is enabled from its own page.
        </p>
      </Plane>
    </>
  );
}

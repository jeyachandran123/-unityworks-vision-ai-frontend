/**
 * Adding a recorder — the DVR or NVR a site's cameras plug into.
 *
 * Five steps, each asking one kind of question, in the order a person setting
 * up a site actually knows the answers:
 *
 *   1. **Recorder** — what it is called, what brand it is, where it is: its IP
 *      address, its domain, or both, and which of them this server uses.
 *   2. **Sign in** — the username and password used on the recorder itself.
 *   3. **Test** — does it answer, with a picture, on one channel. The channel
 *      is only something to test with; it does not become a camera.
 *   4. **Cameras** — which of its channels to watch, and where each one is.
 *   5. **Review** — everything at once, then one Save.
 *
 * ### Nothing technical is asked for
 *
 * No RTSP URL, no path, no credential reference. The brand decides the URL,
 * and "what brand is it" is answered by reading the box. Only a device matching
 * no brand in the list shows the stream-path fields, and only then.
 *
 * ### One save, all or nothing
 *
 * The recorder and every camera on it are sent together and created in one
 * transaction. Half a site — the recorder saved, the fourth camera refused —
 * would leave somebody working out which half.
 *
 * ### Whose recorder it is
 *
 * The organization being configured is named at the top, and the recorder is
 * saved to it alone. The same screen serves every organization; only the
 * values differ.
 *
 * ### The password is never shown
 *
 * It is typed into a masked field with no reveal control, sent once, sealed by
 * the server, and never returned. The review says "will be saved securely"
 * rather than showing even its length.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';

import { organizationApi } from '@shared/api/observations';
import { camerasApi } from '@shared/api/persistence';
import {
  type ConnectVia,
  type RecorderCameraDraft,
  type RecorderTestResult,
  recordersApi,
} from '@shared/api/recorders';
import { Button, Input, KeyValue, LoadingState, Select, useToast } from '@shared/ui/primitives';
import { PageIntro, Plane, Region, SectionRule } from '@shared/ui/product';

import {
  AddressFields,
  addressFields,
  addressProblems,
  BrandSelect,
  chosenVia,
  DEFAULT_WALL_FPS,
  FrameRateSelect,
  friendly,
  PasswordField,
  STREAM_LABEL,
  STREAM_SHORT,
  Steps,
  TestResult,
  useBrands,
  useOrganizationName,
  VIA_LABEL,
} from './recorder-parts';

const STEPS = ['Recorder', 'Sign in', 'Test', 'Cameras', 'Review'] as const;

interface CameraRow extends RecorderCameraDraft {
  /** Local only, so a row keeps its identity while its channel is edited. */
  key: number;
}

interface Draft {
  name: string;
  brand: string;
  ipAddress: string;
  hostname: string;
  /** Which address this server dials, when there are two. */
  connectVia: ConnectVia | '';
  port: string;
  /** Whether the person has typed a port, so a brand change stops overwriting it. */
  portTouched: boolean;
  pathTemplate: string;
  streamMain: string;
  streamSub: string;
  username: string;
  password: string;
  testChannel: string;
  /** Which address the test uses, when there are two. Defaults to `connectVia`. */
  testVia: ConnectVia | '';
  cameras: CameraRow[];
  startNow: boolean;
}

const EMPTY: Draft = {
  name: '',
  brand: '',
  ipAddress: '',
  hostname: '',
  connectVia: '',
  port: '554',
  portTouched: false,
  pathTemplate: '',
  streamMain: '0',
  streamSub: '1',
  username: '',
  password: '',
  testChannel: '1',
  testVia: '',
  cameras: [],
  startNow: false,
};

/** A camera row with nothing wrong with it. */
const NO_PROBLEMS: Record<'channel' | 'name' | 'zone_id', string | undefined> = {
  channel: undefined,
  name: undefined,
  zone_id: undefined,
};

const FIELD_COLUMN = { display: 'grid', gap: 'var(--space-4)', maxWidth: '34rem' } as const;
const ACTIONS = { display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' } as const;
const NOTE = { margin: 0, color: 'var(--ink-secondary)', fontSize: 'var(--text-sm)', maxWidth: '38rem' } as const;

export function AddRecorderPage() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const toast = useToast();
  const brands = useBrands();
  const organization = useOrganizationName();
  const zones = useQuery({
    queryKey: ['zones', 'for-recorder'],
    queryFn: () => organizationApi.zones({ limit: 200 }),
  });

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [attempted, setAttempted] = useState<Set<number>>(new Set());
  const [tested, setTested] = useState<RecorderTestResult | null>(null);
  const [nextKey, setNextKey] = useState(1);

  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const custom = draft.brand === (brands.data?.custom ?? 'custom');
  const activeZones = (zones.data?.zones ?? []).filter((zone) => zone.is_active);
  const brandLabel =
    brands.data?.brands.find((brand) => brand.key === draft.brand)?.label ??
    (custom ? 'Other (custom)' : '');

  /* ── what is wrong on each step, computed rather than stored ─────────────── */

  const problems = useMemo(() => {
    const recorder: Record<string, string | undefined> = {
      name: draft.name.trim() ? undefined : 'Give the recorder a name, such as “Kitchen DVR”',
      brand: draft.brand ? undefined : 'Choose the brand, or “Other” if it is not listed',
      ...addressProblems(draft),
    };
    if (custom) {
      recorder.pathTemplate = !draft.pathTemplate.trim()
        ? 'Enter the stream path from the device’s manual'
        : !draft.pathTemplate.trim().startsWith('/')
          ? 'A stream path starts with /'
          : !draft.pathTemplate.includes('{channel}')
            ? 'Include {channel}, or every camera would show the same picture'
            : undefined;
      recorder.streams =
        draft.streamMain.trim() === draft.streamSub.trim()
          ? 'The main and sub stream numbers must be different'
          : undefined;
    }
    const signIn: Record<string, string | undefined> = {
      username: draft.username.trim() ? undefined : 'Enter the username you sign in to the recorder with',
      password: draft.password ? undefined : 'Enter the recorder’s password',
    };

    const channels = draft.cameras.map((camera) => camera.channel);
    const cameras = draft.cameras.map((camera) => ({
      channel:
        !Number.isInteger(camera.channel) || camera.channel < 1
          ? 'Channel numbers start at 1'
          : channels.filter((channel) => channel === camera.channel).length > 1
            ? `Channel ${camera.channel} is listed twice`
            : undefined,
      name: camera.name.trim() ? undefined : 'Give this camera a name',
      zone_id: camera.zone_id ? undefined : 'Choose where this camera is',
    }));

    return { recorder, signIn, cameras };
  }, [draft, custom]);

  const clean = (fields: Record<string, string | undefined>) =>
    Object.values(fields).every((value) => !value);
  const stepValid = [
    clean(problems.recorder),
    clean(problems.signIn),
    true,
    problems.cameras.every(clean),
    true,
  ];
  const shown = (index: number) => attempted.has(index);

  const advance = () => {
    setAttempted((current) => new Set(current).add(step));
    if (stepValid[step]) setStep((current) => Math.min(current + 1, STEPS.length - 1));
  };

  /* ── talking to the server ──────────────────────────────────────────────── */

  const connection = () => ({
    ...addressFields(draft),
    username: draft.username.trim(),
    brand: draft.brand,
    ...(custom
      ? {
          path_template: draft.pathTemplate.trim(),
          stream_main: Number(draft.streamMain),
          stream_sub: Number(draft.streamSub),
        }
      : {}),
  });

  // With two addresses, either can be tested before settling on one.
  const bothAddresses = Boolean(draft.ipAddress.trim() && draft.hostname.trim());
  const testVia: ConnectVia | undefined = bothAddresses
    ? draft.testVia || chosenVia(draft)
    : chosenVia(draft);
  const testAddress =
    testVia === 'hostname' ? draft.hostname.trim() : testVia === 'ip_address' ? draft.ipAddress.trim() : '';

  const test = useMutation({
    mutationFn: () =>
      recordersApi.testNew({
        ...connection(),
        password: draft.password,
        channel: Number(draft.testChannel) || 1,
        ...(bothAddresses && testVia ? { via: testVia } : {}),
      }),
    onSuccess: setTested,
  });

  const save = useMutation({
    mutationFn: async () => {
      const saved = await recordersApi.create({
        name: draft.name.trim(),
        ...connection(),
        password: draft.password,
        cameras: draft.cameras.map(({ key: _key, ...camera }) => ({
          ...camera,
          name: camera.name.trim(),
        })),
      });
      let started = 0;
      if (draft.startNow) {
        for (const camera of saved.cameras) {
          const result = await camerasApi.start(camera.camera_key).catch(() => null);
          if (result?.streaming) started += 1;
        }
      }
      return { saved, started };
    },
    onSuccess: ({ saved, started }) => {
      // The password leaves memory with the page's state.
      setDraft(EMPTY);
      void client.invalidateQueries({ queryKey: ['recorders'] });
      void client.invalidateQueries({ queryKey: ['cameras'] });
      const cameras = saved.cameras.length;
      toast(
        cameras === 0
          ? `${saved.name} saved.`
          : `${saved.name} saved with ${cameras} camera${cameras === 1 ? '' : 's'}` +
              (draft.startNow ? `; ${started} watching now.` : '.'),
      );
      navigate(`/admin/recorders/${encodeURIComponent(saved.id)}`);
    },
  });

  /* ── cameras ────────────────────────────────────────────────────────────── */

  const addCamera = () => {
    const used = new Set(draft.cameras.map((camera) => camera.channel));
    let channel = 1;
    while (used.has(channel)) channel += 1;
    set({
      cameras: [
        ...draft.cameras,
        {
          key: nextKey,
          channel,
          name: '',
          // One zone means nothing to choose.
          zone_id: activeZones.length === 1 ? (activeZones[0]?.id ?? '') : '',
          stream_type: 'sub',
          wall_fps: DEFAULT_WALL_FPS,
        },
      ],
    });
    setNextKey((key) => key + 1);
  };
  const editCamera = (key: number, patch: Partial<RecorderCameraDraft>) =>
    set({
      cameras: draft.cameras.map((camera) => (camera.key === key ? { ...camera, ...patch } : camera)),
    });
  const removeCamera = (key: number) =>
    set({ cameras: draft.cameras.filter((camera) => camera.key !== key) });

  if (brands.isLoading || zones.isLoading) return <LoadingState label="Getting ready" />;

  /* ── the page ───────────────────────────────────────────────────────────── */

  return (
    <>
      <PageIntro
        eyebrow={organization ? `CCTV · ${organization}` : 'CCTV · Recorders'}
        title="Add a recorder"
        standfirst={`A recorder is the DVR or NVR your cameras are plugged into. Tell us how to reach it, check it answers, then choose which of its cameras to watch.${organization ? ` It is saved for ${organization} only.` : ''}`}
        actions={
          <Button variant="ghost" onClick={() => navigate('/admin/recorders')}>
            Cancel
          </Button>
        }
      />

      <Region order={2}>
        <Steps steps={STEPS} current={step} />
      </Region>

      <Region order={3}>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (step < STEPS.length - 1) advance();
          }}
        >
          {step === 0 ? (
            <>
              <SectionRule
                lead
                label="The recorder"
                detail="What it is called, what make it is, and where it is on the network."
              />
              <Plane>
                <div style={FIELD_COLUMN}>
                  <Input
                    id="recorder-name"
                    label="Recorder name"
                    value={draft.name}
                    placeholder="Kitchen DVR"
                    hint="What the people at the site call it. Shown wherever its cameras are listed."
                    error={shown(0) ? problems.recorder.name : undefined}
                    onChange={(event) => set({ name: event.target.value })}
                  />
                  <BrandSelect
                    id="recorder-brand"
                    value={draft.brand}
                    onChange={(brand, defaultPort) =>
                      set({
                        brand,
                        ...(defaultPort && !draft.portTouched ? { port: String(defaultPort) } : {}),
                      })
                    }
                  />
                  {shown(0) && problems.recorder.brand ? (
                    <FieldError>{problems.recorder.brand}</FieldError>
                  ) : null}
                  <AddressFields
                    idPrefix="recorder"
                    value={draft}
                    problems={problems.recorder}
                    showRequired={shown(0)}
                    onChange={(patch) => {
                      set({ ...patch, ...(patch.port !== undefined ? { portTouched: true } : {}) });
                      // A result for another address says nothing about this one.
                      setTested(null);
                    }}
                  />

                  {custom ? (
                    <fieldset
                      style={{
                        border: '1px solid var(--line-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        padding: 'var(--space-4)',
                        display: 'grid',
                        gap: 'var(--space-4)',
                        margin: 0,
                      }}
                    >
                      <legend style={{ padding: '0 var(--space-2)', fontSize: 'var(--text-sm)' }}>
                        Stream settings for this device
                      </legend>
                      <p style={NOTE}>
                        Only needed because this recorder is not in the list. The device’s manual gives
                        its RTSP stream path. Write <code>{'{channel}'}</code> where the channel number
                        goes and <code>{'{subtype}'}</code> where the stream number goes.
                      </p>
                      <Input
                        id="recorder-path"
                        label="Stream path"
                        value={draft.pathTemplate}
                        placeholder="/live/ch{channel}/{subtype}"
                        spellCheck={false}
                        error={shown(0) ? problems.recorder.pathTemplate : undefined}
                        onChange={(event) => set({ pathTemplate: event.target.value })}
                      />
                      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                        <Input
                          id="recorder-main"
                          label="Main stream number"
                          value={draft.streamMain}
                          inputMode="numeric"
                          onChange={(event) => set({ streamMain: event.target.value })}
                        />
                        <Input
                          id="recorder-sub"
                          label="Sub stream number"
                          value={draft.streamSub}
                          inputMode="numeric"
                          error={shown(0) ? problems.recorder.streams : undefined}
                          onChange={(event) => set({ streamSub: event.target.value })}
                        />
                      </div>
                    </fieldset>
                  ) : null}

                  <div style={ACTIONS}>
                    <Button variant="primary" type="submit">
                      Continue
                    </Button>
                  </div>
                </div>
              </Plane>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <SectionRule
                lead
                label="Sign in"
                detail="The username and password you use on the recorder itself — on its own screen or its web page."
              />
              <Plane>
                <div style={FIELD_COLUMN}>
                  <Input
                    id="recorder-username"
                    label="Username"
                    value={draft.username}
                    placeholder="admin"
                    autoComplete="off"
                    spellCheck={false}
                    error={shown(1) ? problems.signIn.username : undefined}
                    onChange={(event) => set({ username: event.target.value })}
                  />
                  <PasswordField
                    id="recorder-password"
                    label="Password"
                    value={draft.password}
                    error={shown(1) ? problems.signIn.password : undefined}
                    onChange={(password) => {
                      set({ password });
                      // A result tested with a different password no longer says anything.
                      setTested(null);
                    }}
                  />
                  <p style={NOTE}>
                    The password is encrypted before it is saved and is never shown again — not on
                    any page, and not to you. To change it later you type a new one.
                  </p>
                  <div style={ACTIONS}>
                    <Button variant="ghost" onClick={() => setStep(0)}>
                      Back
                    </Button>
                    <Button variant="primary" type="submit">
                      Continue
                    </Button>
                  </div>
                </div>
              </Plane>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <SectionRule
                lead
                label="Test the connection"
                detail="Signs in to the recorder and asks one channel for a picture. Nothing is saved yet."
              />
              <Plane>
                <div style={FIELD_COLUMN}>
                  <p style={NOTE}>
                    The test uses one channel only to check that the recorder answers and accepts the
                    username and password. <strong>It does not add a camera</strong> — you choose which
                    cameras to watch in the next step.
                  </p>
                  {bothAddresses ? (
                    <Select
                      id="recorder-test-via"
                      label="Test using"
                      value={testVia ?? ''}
                      onChange={(event) => {
                        set({ testVia: event.target.value === 'hostname' ? 'hostname' : 'ip_address' });
                        setTested(null);
                      }}
                    >
                      <option value="ip_address">
                        {VIA_LABEL.ip_address} — {draft.ipAddress.trim()}
                      </option>
                      <option value="hostname">
                        {VIA_LABEL.hostname} — {draft.hostname.trim()}
                      </option>
                    </Select>
                  ) : null}
                  <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div style={{ width: '11rem' }}>
                      <Input
                        id="recorder-test-channel"
                        label="Channel to test with"
                        value={draft.testChannel}
                        inputMode="numeric"
                        hint="Any channel with a camera plugged in."
                        onChange={(event) => {
                          set({ testChannel: event.target.value });
                          setTested(null);
                        }}
                      />
                    </div>
                    <Button
                      variant="primary"
                      loading={test.isPending}
                      disabled={!testAddress}
                      onClick={() => test.mutate()}
                    >
                      {test.isPending ? 'Testing…' : 'Test connection'}
                    </Button>
                  </div>
                  {test.isPending ? (
                    <p style={NOTE} role="status">
                      Signing in to {testAddress} and waiting for a picture. This can take up to
                      twenty seconds.
                    </p>
                  ) : null}
                  {tested && !test.isPending ? <TestResult result={tested} /> : null}
                  {test.isError && !test.isPending ? (
                    <p role="alert" style={{ ...NOTE, color: 'var(--severity-critical)' }}>
                      {friendly(test.error, 'The test could not be run. Try again in a moment.')}
                    </p>
                  ) : null}
                  {!tested || !tested.ok ? (
                    <p style={NOTE}>
                      You can continue without a successful test — for example if the recorder is not
                      switched on yet — and test again later from its page.
                    </p>
                  ) : null}
                  <div style={ACTIONS}>
                    <Button variant="ghost" onClick={() => setStep(1)}>
                      Back
                    </Button>
                    <Button variant={tested?.ok ? 'primary' : 'secondary'} type="submit">
                      {tested?.ok ? 'Continue' : 'Continue without a successful test'}
                    </Button>
                  </div>
                </div>
              </Plane>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <SectionRule
                lead
                label="Cameras"
                detail="Which of this recorder’s channels to watch, and where each camera is. You can add more later."
              />
              <Plane>
                <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
                  {activeZones.length === 0 ? (
                    <p style={NOTE}>
                      There are no zones yet, and each camera is placed in one — the kitchen, the dine
                      hall. You can save the recorder now and add its cameras after{' '}
                      <Link to="/admin/zones">adding zones</Link>.
                    </p>
                  ) : null}

                  {draft.cameras.length === 0 ? (
                    <p style={NOTE}>No cameras added yet. A recorder can be saved with none.</p>
                  ) : (
                    <div role="list" aria-label="Cameras to add" style={{ display: 'grid', gap: 'var(--space-3)' }}>
                      {draft.cameras.map((camera, index) => {
                        const issue = problems.cameras[index] ?? NO_PROBLEMS;
                        const flag = shown(3);
                        return (
                          <div
                            role="listitem"
                            key={camera.key}
                            style={{
                              display: 'grid',
                              // Wraps to fewer columns on a narrow screen rather than
                              // pushing the page sideways.
                              gridTemplateColumns: 'repeat(auto-fit, minmax(8.5rem, 1fr))',
                              gap: 'var(--space-3)',
                              alignItems: 'start',
                              paddingBottom: 'var(--space-3)',
                              borderBottom: '1px solid var(--line-subtle)',
                            }}
                          >
                            <Input
                              id={`camera-${camera.key}-channel`}
                              label="Channel"
                              value={String(camera.channel || '')}
                              inputMode="numeric"
                              error={flag ? issue.channel : undefined}
                              onChange={(event) =>
                                editCamera(camera.key, { channel: Number(event.target.value) })
                              }
                            />
                            <Input
                              id={`camera-${camera.key}-name`}
                              label="Camera name"
                              value={camera.name}
                              placeholder="Kitchen entrance"
                              error={flag ? issue.name : undefined}
                              onChange={(event) => editCamera(camera.key, { name: event.target.value })}
                            />
                            <div>
                              <Select
                                id={`camera-${camera.key}-zone`}
                                label="Zone"
                                value={camera.zone_id}
                                onChange={(event) => editCamera(camera.key, { zone_id: event.target.value })}
                              >
                                <option value="">Choose…</option>
                                {activeZones.map((zone) => (
                                  <option key={zone.id} value={zone.id}>
                                    {zone.name}
                                  </option>
                                ))}
                              </Select>
                              {flag && issue.zone_id ? <FieldError>{issue.zone_id}</FieldError> : null}
                            </div>
                            <Select
                              id={`camera-${camera.key}-stream`}
                              label="Stream"
                              value={camera.stream_type}
                              onChange={(event) =>
                                editCamera(camera.key, {
                                  stream_type: event.target.value === 'main' ? 'main' : 'sub',
                                })
                              }
                            >
                              <option value="sub">{STREAM_LABEL.sub}</option>
                              <option value="main">{STREAM_LABEL.main}</option>
                            </Select>
                            <FrameRateSelect
                              id={`camera-${camera.key}-fps`}
                              value={camera.wall_fps ?? DEFAULT_WALL_FPS}
                              onChange={(wall_fps) => editCamera(camera.key, { wall_fps })}
                            />
                            <div style={{ paddingTop: '1.6rem' }}>
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`Remove camera on channel ${camera.channel}`}
                                onClick={() => removeCamera(camera.key)}
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div style={ACTIONS}>
                    <Button onClick={addCamera} disabled={activeZones.length === 0}>
                      + Add a camera
                    </Button>
                  </div>
                  <p style={NOTE}>
                    The sub stream is lighter on the network and enough for most monitoring. Use the
                    main stream only where fine detail matters.
                  </p>
                  <div style={ACTIONS}>
                    <Button variant="ghost" onClick={() => setStep(2)}>
                      Back
                    </Button>
                    <Button variant="primary" type="submit">
                      Review
                    </Button>
                  </div>
                </div>
              </Plane>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <SectionRule lead label="Review and save" detail="Nothing is saved until you press Save." />
              <Plane>
                <div style={{ display: 'grid', gap: 'var(--space-5)', maxWidth: '44rem' }}>
                  <KeyValue
                    items={[
                      ...(organization ? [{ key: 'Organization', value: organization }] : []),
                      { key: 'Recorder', value: draft.name.trim() },
                      { key: 'Brand', value: brandLabel },
                      { key: 'IP address', value: draft.ipAddress.trim() || 'Not set' },
                      { key: 'Domain / hostname', value: draft.hostname.trim() || 'Not set' },
                      {
                        key: 'Connects using',
                        value: (() => {
                          const via = chosenVia(draft);
                          if (!via) return '—';
                          const value = via === 'hostname' ? draft.hostname.trim() : draft.ipAddress.trim();
                          return `${VIA_LABEL[via]} — ${value}`;
                        })(),
                      },
                      { key: 'Video (RTSP) port', value: draft.port },
                      { key: 'Username', value: draft.username.trim() },
                      { key: 'Password', value: 'Will be saved securely' },
                      {
                        key: 'Connection',
                        value: tested?.ok
                          ? `Tested — channel ${tested.channel} answered at ${tested.address}`
                          : tested
                            ? `Last test failed: ${tested.message}`
                            : 'Not tested',
                      },
                      {
                        key: 'Cameras',
                        value:
                          draft.cameras.length === 0
                            ? 'None yet — add them from the recorder’s page'
                            : `${draft.cameras.length}`,
                      },
                    ]}
                  />

                  {draft.cameras.length > 0 ? (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                      <caption style={{ textAlign: 'left', paddingBottom: 'var(--space-2)', color: 'var(--ink-secondary)' }}>
                        Cameras to add, switched off until you start them
                      </caption>
                      <thead>
                        <tr style={{ textAlign: 'left', color: 'var(--ink-secondary)' }}>
                          <th scope="col">Channel</th>
                          <th scope="col">Camera</th>
                          <th scope="col">Zone</th>
                          <th scope="col">Stream</th>
                          <th scope="col">Live Wall</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...draft.cameras]
                          .sort((a, b) => a.channel - b.channel)
                          .map((camera) => (
                            <tr key={camera.key} style={{ borderTop: '1px solid var(--line-subtle)' }}>
                              <td style={{ padding: 'var(--space-2) 0', fontVariantNumeric: 'tabular-nums' }}>
                                {camera.channel}
                              </td>
                              <td>{camera.name.trim()}</td>
                              <td>{activeZones.find((zone) => zone.id === camera.zone_id)?.name ?? '—'}</td>
                              <td>{STREAM_SHORT[camera.stream_type]}</td>
                              <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {camera.wall_fps ?? DEFAULT_WALL_FPS} fps
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  ) : null}

                  {draft.cameras.length > 0 ? (
                    <label style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
                      <input
                        id="recorder-start-now"
                        type="checkbox"
                        checked={draft.startNow}
                        onChange={(event) => set({ startNow: event.target.checked })}
                      />
                      <span>
                        Start watching these cameras as soon as they are saved
                        <span style={{ display: 'block', ...NOTE }}>
                          Leave this off to check each camera from its page first. Watching begins
                          processing video of the people in view.
                        </span>
                      </span>
                    </label>
                  ) : null}

                  {save.isError ? (
                    <p role="alert" style={{ ...NOTE, color: 'var(--severity-critical)' }}>
                      {friendly(save.error, 'The recorder could not be saved. Nothing was changed.')}
                    </p>
                  ) : null}

                  <div style={ACTIONS}>
                    <Button variant="ghost" onClick={() => setStep(3)} disabled={save.isPending}>
                      Back
                    </Button>
                    <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
                      {save.isPending ? 'Saving…' : 'Save recorder'}
                    </Button>
                  </div>
                </div>
              </Plane>
            </>
          ) : null}
        </form>
      </Region>
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

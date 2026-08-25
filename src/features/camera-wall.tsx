/**
 * The camera wall — every DVR channel, live, and nothing else.
 *
 * ### No analysis happens because a tile is open
 *
 * Opening this page starts no detection, no tracking, no model call and no
 * compliance evaluation. It is a CCTV monitoring client that happens to live in
 * the same application as an analysis platform. Nothing here imports the
 * observation, incident or evidence services, and that is deliberate rather
 * than incidental.
 *
 * ### Every camera appears
 *
 * A camera is never hidden for being uninteresting, unanalysed, offline or
 * pointed at a store cupboard. An operator who cannot see that channel 7 is
 * dark is worse served than one with no wall at all, so the only thing that
 * removes a tile is authorization — enforced on the server, not here.
 *
 * ### One stream per tile, opened once
 *
 * Each tile fetches its own short-lived ticket once and holds a single `<img>`.
 * React StrictMode double-invokes effects in development, so ticket fetching is
 * guarded — without it every camera would open two streams and the DVR would
 * see thirty-two clients for sixteen channels.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  STREAM_STATE_LABEL,
  streamTone,
  streamUrl,
  wallApi,
  type StreamState,
  type WallCamera,
} from '@shared/api/wall';
import { useAuth } from '@app/auth/AuthProvider';
import { isApiError } from '@shared/api/errors';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  KeyValue,
  LoadingState,
  PageHeader,
  StatCard,
  StatusBadge,
} from '@shared/ui/primitives';

/** How often the wall re-reads camera state. Metadata only — not video. */
const STATE_POLL_MS = 4000;

/* ── one tile's video ─────────────────────────────────────────────────────── */

function useStream(cameraId: string, fps: number, active: boolean) {
  const { user } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Guards against StrictMode's double effect invocation opening two streams.
  const opened = useRef<string | null>(null);

  useEffect(() => {
    if (!active || !user) return;
    const key = `${cameraId}:${fps}`;
    if (opened.current === key) return;
    opened.current = key;

    let cancelled = false;
    wallApi
      .ticket(cameraId)
      .then((ticket) => {
        if (cancelled) return;
        setUrl(streamUrl(ticket, user, fps));
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(isApiError(err) ? err.message : 'This stream could not be opened.');
      });

    return () => {
      cancelled = true;
    };
  }, [cameraId, fps, active, user]);

  useEffect(() => {
    if (active) return;
    // Dropping the src is what actually closes the HTTP response and releases
    // the server-side viewer slot. Leaving it set would keep encoding frames
    // for a tile nobody is looking at.
    setUrl(null);
    opened.current = null;
  }, [active]);

  return { url, error };
}

function CameraTile({
  camera,
  fps,
  onOpen,
}: {
  camera: WallCamera;
  fps: number;
  onOpen: (camera: WallCamera) => void;
}) {
  const streamable = camera.state === 'live' || camera.state === 'reconnecting';
  const { url, error } = useStream(camera.camera_id, fps, streamable);
  const tone = streamTone(camera.state);

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => onOpen(camera)}
        aria-label={`Open ${camera.camera_id}, channel ${camera.channel}, ${STREAM_STATE_LABEL[camera.state]}`}
        style={{
          display: 'block', width: '100%', padding: 0, border: 'none',
          background: 'var(--surface-sunken, #101014)', cursor: 'pointer',
        }}
      >
        <div style={{ position: 'relative', aspectRatio: '16 / 9', overflow: 'hidden' }}>
          {url ? (
            <img
              src={url}
              alt={`Live view from ${camera.camera_id}`}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div
              style={{
                position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                color: 'var(--ink-tertiary)', fontSize: 'var(--text-xs)',
                textAlign: 'center', padding: 'var(--space-3)',
              }}
            >
              {/* An honest reason, never a spinner that implies a stream is coming. */}
              {error ?? (streamable ? 'Opening stream…' : STREAM_STATE_LABEL[camera.state])}
            </div>
          )}

          <div
            style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)',
              background: 'linear-gradient(rgb(0 0 0 / 0.65), transparent)',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
                color: '#fff', letterSpacing: 'var(--tracking-wide)',
              }}
            >
              {camera.camera_id}
              <span style={{ opacity: 0.7 }}> · CH{String(camera.channel).padStart(2, '0')}</span>
            </span>
            <StatusBadge tone={tone}>{STREAM_STATE_LABEL[camera.state]}</StatusBadge>
          </div>
        </div>
      </button>

      <div
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)',
          fontSize: 'var(--text-2xs)', color: 'var(--ink-tertiary)',
        }}
      >
        <span>{camera.name || '—'}</span>
        <span style={{ fontFamily: 'var(--font-mono)' }}>
          {camera.width ? `${camera.width}×${camera.height}` : '—'}
        </span>
      </div>
    </Card>
  );
}

/* ── detail ───────────────────────────────────────────────────────────────── */

function CameraDetail({
  camera,
  fps,
  onClose,
}: {
  camera: WallCamera;
  fps: number;
  onClose: () => void;
}) {
  const { url, error } = useStream(camera.camera_id, fps, true);
  const figure = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fullscreen = useCallback(() => {
    void figure.current?.requestFullscreen?.();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${camera.camera_id} detail view`}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, background: 'rgb(0 0 0 / 0.82)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'var(--space-6)',
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(1200px, 100%)', display: 'grid', gap: 'var(--space-4)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', color: '#fff', margin: 0 }}>
            {camera.camera_id}
            <span style={{ opacity: 0.6, fontWeight: 400 }}>
              {' '}· CH{String(camera.channel).padStart(2, '0')}
            </span>
          </h2>
          <StatusBadge tone={streamTone(camera.state)}>
            {STREAM_STATE_LABEL[camera.state]}
          </StatusBadge>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-2)' }}>
            <Button size="sm" onClick={fullscreen}>Fullscreen</Button>
            <Button size="sm" variant="secondary" onClick={onClose}>Close</Button>
          </div>
        </div>

        <div
          ref={figure}
          style={{
            background: '#000', aspectRatio: '16 / 9', display: 'flex',
            alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
          }}
        >
          {url ? (
            <img
              src={url}
              alt={`Live view from ${camera.camera_id}`}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            <span style={{ color: 'var(--ink-tertiary)', fontSize: 'var(--text-sm)' }}>
              {error ?? 'Opening stream…'}
            </span>
          )}
        </div>

        <Card>
          <KeyValue
            items={[
              { key: 'Camera', value: camera.camera_id },
              { key: 'Name', value: camera.name || '—' },
              { key: 'DVR channel', value: String(camera.channel) },
              { key: 'Stream', value: camera.stream_type },
              { key: 'State', value: STREAM_STATE_LABEL[camera.state] },
              { key: 'Resolution', value: camera.width ? `${camera.width}×${camera.height}` : '—' },
              { key: 'Frames decoded', value: String(camera.frames_decoded) },
              { key: 'Reconnects', value: String(camera.reconnects) },
              {
                key: 'First frame',
                value: camera.first_frame_latency_s !== null
                  ? `${camera.first_frame_latency_s}s`
                  : '—',
              },
              { key: 'Last error', value: camera.last_error || '—' },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}

/* ── the wall ─────────────────────────────────────────────────────────────── */

export function CameraWallPage() {
  const [open, setOpen] = useState<WallCamera | null>(null);

  const wall = useQuery({
    queryKey: ['wall', 'cameras'],
    queryFn: wallApi.cameras,
    // Metadata only. The video is a separate long-lived response per tile and
    // is never re-fetched by this poll.
    refetchInterval: STATE_POLL_MS,
  });

  const cameras = useMemo(() => wall.data?.cameras ?? [], [wall.data]);
  const selected = useMemo(
    () => (open ? cameras.find((c) => c.camera_id === open.camera_id) ?? open : null),
    [open, cameras],
  );

  if (wall.isPending) return <LoadingState label="Loading cameras" />;
  if (wall.isError) {
    return (
      <ErrorState
        body={isApiError(wall.error) ? wall.error.message : 'The camera list could not be loaded.'}
        requestId={isApiError(wall.error) ? wall.error.requestId : undefined}
        onRetry={() => void wall.refetch()}
      />
    );
  }

  const data = wall.data;
  // Defensive: the summary block is a convenience, and a tile wall that
  // crashes because a count is missing is worse than one without the count.
  const counts = data.wall?.by_state ?? {};
  const notLive = data.total - data.live;

  return (
    <>
      <PageHeader
        title="Camera Wall"
        description="Every channel on the recorder, live. This view performs no analysis — opening a tile costs a video decode, never a model call."
        meta={<Badge>{data.total} channels</Badge>}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <StatCard label="Channels" value={data.total} detail="Every configured DVR channel" />
        <StatCard
          label="Live"
          value={data.live}
          tone={data.live > 0 ? 'accent' : 'default'}
          detail="Frames arriving now"
        />
        <StatCard
          label="Not live"
          value={notLive}
          detail={
            Object.entries(counts)
              .filter(([state]) => state !== 'live')
              .map(([state, n]) => `${n} ${state}`)
              .join(' · ') || 'None'
          }
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(18rem, 1fr))',
          gap: 'var(--space-4)',
        }}
      >
        {cameras.map((camera) => (
          <CameraTile
            key={camera.camera_id}
            camera={camera}
            fps={data.default_wall_fps}
            onOpen={setOpen}
          />
        ))}
      </div>

      {selected ? (
        <CameraDetail
          camera={selected}
          fps={data.default_detail_fps}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

export type { StreamState };

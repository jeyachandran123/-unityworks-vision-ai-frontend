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
 * ### One stream per tile, opened once — and actually opened
 *
 * Each tile fetches its own short-lived ticket once and holds a single `<img>`.
 * React StrictMode double-invokes effects in development, so the ticket request
 * is shared rather than repeated — without that every camera would open two
 * streams and the DVR would see thirty-two clients for sixteen channels.
 *
 * The first attempt at that guard was a boolean, and it made the page open
 * **zero** streams instead of two: the second invocation was turned away by the
 * guard while the first had already been cancelled by its own cleanup. See
 * `useStream`. The lesson is in the shape — the guard holds the in-flight
 * *promise*, so a later invocation subscribes to the request instead of being
 * refused it.
 *
 * ### Live means a frame arrived
 *
 * `camera.state` is the **server's** view of its DVR session and can read
 * `live` while this browser has received nothing. Only `<img onLoad>` — a
 * decoded frame — puts a tile into `live`. A ticket that returned 200 proves
 * only that a ticket was issued.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  STREAM_STATE_LABEL,
  streamTone,
  streamUrl,
  wallApi,
  type StreamState,
  type StreamTicket,
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

/**
 * How long a stream may be open without delivering a frame before the tile
 * says so. Measured against the real DVR: the ticket call and the first frame
 * each take a few seconds while the analysis stack shares this process, and the
 * server's own `first_frame_latency_s` for these cameras is 1.8 s. Twenty-five
 * seconds is far outside that and still finite — which is the point. A viewer
 * that waits forever reports "connecting" for a camera that is never coming.
 */
const FIRST_FRAME_TIMEOUT_MS = 25_000;

/**
 * What the viewer itself knows, which is not what the DVR session is doing.
 *
 * `camera.state` describes the **server's** session and can read `live` while
 * this browser has received nothing at all — that is exactly what the fault
 * below looked like on screen. These phases describe *this* `<img>`.
 */
type ViewerPhase = 'idle' | 'opening' | 'connecting' | 'live' | 'failed';

/**
 * A 1×1 transparent GIF, and the only reliable way to hang up on an MJPEG.
 *
 * Removing an `<img>` from the document does **not** close a
 * `multipart/x-mixed-replace` response in Chromium — the response never
 * completes, so there is nothing to finish, and the socket stays up until the
 * page unloads. Measured against the server's own viewer counter while
 * switching cameras: four tiles gave a baseline of 4 viewers, opening and
 * closing four detail views took it to **10**, and it stayed at 10 for the
 * rest of the session, dropping back to 4 only when the browser exited.
 *
 * Every leaked viewer keeps a generator running on the server, and each one
 * holds a worker thread while it waits for the next frame — which is why the
 * third and fourth camera switched to never showed a picture at all.
 *
 * Assigning a new `src` is what actually tears the old connection down. So the
 * element stays mounted and is pointed here instead of being unmounted.
 */
const BLANK_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/* ── one tile's video ─────────────────────────────────────────────────────── */

/**
 * Open one camera's MJPEG stream, and report honestly what stage it reached.
 *
 * ### The fault this shape exists for
 *
 * The previous version guarded ticket fetching with a ref so StrictMode's
 * double-invoked effect could not open two streams. It could not open *one*
 * either:
 *
 *     invoke 1   claims the ref, starts the ticket request
 *     cleanup    sets cancelled = true
 *     invoke 2   sees the ref already claimed, returns without fetching
 *     ticket 200 arrives — but invoke 1 was cancelled, so the URL is dropped
 *
 * The ticket was issued, no `<img>` was ever created, no stream request was
 * ever made, and Live Monitoring sat on "Opening stream…" indefinitely while
 * the server happily reported `state=live` and 125 501 frames decoded.
 *
 * The guard was right that there must be one ticket per camera. It was wrong
 * to turn the second invocation away: it has to **subscribe to the same
 * request** instead. Holding the promise rather than a boolean does that — one
 * network call, and every invocation that is still mounted gets the answer.
 */
function useStream(cameraId: string, fps: number, active: boolean) {
  const { user } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<ViewerPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  /** The in-flight ticket, shared by every invocation for the same key. */
  const pending = useRef<{ key: string; promise: Promise<StreamTicket> } | null>(null);

  useEffect(() => {
    if (!active || !user) return;
    const key = `${cameraId}:${fps}`;
    if (pending.current?.key !== key) {
      pending.current = { key, promise: wallApi.ticket(cameraId) };
    }
    const { promise } = pending.current;

    let cancelled = false;
    setPhase((current) => (current === 'live' ? current : 'opening'));

    promise
      .then((ticket) => {
        if (cancelled) return;
        setUrl(streamUrl(ticket, user, fps));
        setPhase('connecting');
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Cleared so the next activation asks again rather than re-reading a
        // rejected promise forever.
        pending.current = null;
        setError(isApiError(err) ? err.message : 'This stream could not be opened.');
        setPhase('failed');
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
    setPhase('idle');
    setError(null);
    pending.current = null;
  }, [active]);

  // A stream that opened and never delivered a picture must say so. Without
  // this the honest-looking "Opening stream…" is indistinguishable from the
  // fault above, which is how that fault survived.
  useEffect(() => {
    if (phase !== 'connecting') return;
    const timer = window.setTimeout(() => {
      setError('No video arrived from this camera. The stream timed out.');
      setPhase('failed');
      setUrl(null);
      pending.current = null;
    }, FIRST_FRAME_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [phase, url]);

  /**
   * The element showing this stream, so it can be hung up on explicitly.
   *
   * A **callback ref that keeps the last real node**, rather than a plain
   * `useRef` handed to `ref=`. React clears a ref before it runs unmount
   * cleanups, so by the time the cleanup below fires a plain ref is already
   * `null` and there is nothing left to cancel — which is how the first
   * version of this silently did nothing. Ignoring the `null` callback keeps
   * the node reachable after detachment, and assigning `src` still aborts the
   * request on a detached image.
   */
  const node = useRef<HTMLImageElement | null>(null);
  const element = useCallback((img: HTMLImageElement | null) => {
    if (img) node.current = img;
  }, []);

  useEffect(() => () => {
    // On unmount — closing the detail view, or leaving the page.
    if (node.current) node.current.src = BLANK_PIXEL;
  }, []);

  /** A frame decoded. The **only** thing that may report this viewer live. */
  const onFrame = useCallback(() => {
    setPhase('live');
    setError(null);
  }, []);

  /** The browser gave up on the stream: it is gone, not merely slow. */
  const onFailure = useCallback(() => {
    setUrl(null);
    pending.current = null;
    setPhase('failed');
    setError('The video stream stopped. Reconnecting when the camera returns.');
  }, []);

  return { url, phase, error, onFrame, onFailure, element };
}

/**
 * What to show over the picture, or `null` once a real frame has arrived.
 *
 * Never derived from the server's session state: this describes what this
 * browser has actually received.
 */
function viewerMessage(
  phase: ViewerPhase,
  error: string | null,
  camera: Pick<WallCamera, 'state'>,
): string | null {
  if (phase === 'live') return null;
  if (phase === 'failed') return error ?? 'This camera is unavailable.';
  if (phase === 'idle') return STREAM_STATE_LABEL[camera.state];
  if (phase === 'connecting') {
    return camera.state === 'reconnecting' ? 'Reconnecting…' : 'Waiting for video…';
  }
  return 'Opening stream…';
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
  // Deliberately *not* paused while the detail view covers the wall. That was
  // tried, on the theory that four never-ending MJPEG responses exhaust the
  // browser's six-connections-per-origin budget. Resource Timing says
  // otherwise: the detail view's ticket showed `stalled = 1 ms` and
  // `server = 5042 ms`, so it was never queued — the backend simply took five
  // seconds. And the server shares one JPEG encode across every viewer of a
  // camera, so a hidden tile costs almost nothing. Pausing bought nothing and
  // charged four fresh tickets every time the detail view closed.
  const streamable = camera.state === 'live' || camera.state === 'reconnecting';
  const { url, phase, error, onFrame, onFailure, element } = useStream(
    camera.camera_id, fps, streamable,
  );
  const tone = streamTone(camera.state);
  const message = viewerMessage(phase, error, camera);

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => onOpen(camera)}
        aria-label={`Open ${camera.camera_id}, channel ${camera.channel}, ${STREAM_STATE_LABEL[camera.state]}`}
        style={{
          display: 'block', width: '100%', padding: 0, border: 'none',
          // Footage letterboxes against black, not against an application
          // surface. `--surface-sunken` resolves to a pale grey in the light
          // theme, which framed every tile in grey and made a dark scene read
          // as a rendering fault rather than a dark scene.
          background: 'var(--video-ground)', cursor: 'pointer',
        }}
      >
        <div style={{ position: 'relative', aspectRatio: '16 / 9', overflow: 'hidden' }}>
          {/* Mounted as soon as there is a URL, and *kept* mounted underneath
              the message. It has to be in the document to load at all — the
              previous version rendered the placeholder **instead of** the
              image, so nothing ever requested the stream. */}
          {streamable ? (
            // Mounted for as long as this camera is streamable, and pointed at
            // a blank pixel until the ticket arrives — never unmounted while a
            // stream is running, because unmounting does not close one.
            <img
              ref={element}
              src={url ?? BLANK_PIXEL}
              alt={`Live view from ${camera.camera_id}`}
              onLoad={url ? onFrame : undefined}
              onError={url ? onFailure : undefined}
              data-testid={`stream-${camera.camera_id}`}
              data-phase={phase}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : null}
          {message ? (
            <div
              data-testid={`viewer-message-${camera.camera_id}`}
              style={{
                position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                color: 'var(--video-ink)', fontSize: 'var(--text-xs)',
                textAlign: 'center', padding: 'var(--space-3)',
                background: 'var(--video-ground)',
              }}
            >
              {/* An honest reason, never a spinner that implies a stream is
                  coming. `live` shows nothing at all — the picture is the
                  status. */}
              {message}
            </div>
          ) : null}

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
  const { url, phase, error, onFrame, onFailure, element } = useStream(
    camera.camera_id, fps, true,
  );
  const message = viewerMessage(phase, error, camera);
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
        position: 'fixed', inset: 0,
        // Modal tier. This was a bare `60`, which is `--z-toast`: the camera
        // dialog and the toast layer shared a level, so a session-expiry
        // notice — the one message that arrives without the operator doing
        // anything — could be painted underneath a fullscreen camera.
        zIndex: 'var(--z-modal)' as unknown as number,
        background: 'rgb(0 0 0 / 0.82)',
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
            position: 'relative',
            background: 'var(--video-ground)', aspectRatio: '16 / 9', display: 'flex',
            alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
          }}
        >
          <img
            ref={element}
            src={url ?? BLANK_PIXEL}
            alt={`Live view from ${camera.camera_id}`}
            onLoad={url ? onFrame : undefined}
            onError={url ? onFailure : undefined}
            data-testid={`stream-detail-${camera.camera_id}`}
            data-phase={phase}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
          {message ? (
            // Over the image, never instead of it: an `<img>` that is not in
            // the document never requests its stream, which is the whole fault
            // this page had.
            <span
              data-testid={`viewer-message-detail-${camera.camera_id}`}
              style={{
                position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: 'var(--video-ground)',
                color: 'var(--video-ink)', fontSize: 'var(--text-sm)',
              }}
            >
              {message}
            </span>
          ) : null}
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

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
import { Link } from 'react-router-dom';
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
import { Badge, Button, ErrorState, KeyValue, LoadingState } from '@shared/ui/primitives';
import {
  CameraSurface,
  Eyebrow,
  Figure,
  GoTo,
  LiveDot,
  Meter,
  PageIntro,
  SectionRule,
} from '@shared/ui/product';

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

/**
 * One tile.
 *
 * ### The streaming lifecycle below is untouched
 *
 * Everything Stage 3 changed here is presentation. `useStream`, the streamable
 * predicate, the deliberate refusal to pause a hidden tile, the blank-pixel
 * teardown, the `data-testid` and `data-phase` hooks and the honest viewer
 * message are exactly as they were — that logic was hard-won against a real
 * DVR and a redesign has no business touching it.
 *
 * What changed is that a tile stopped being a `Card` containing a picture and
 * became a picture with chrome over it. A `Card` puts footage on the page's
 * surface with the page's padding and border radius; a monitoring client
 * letterboxes against black and hangs its metadata on top. The distinction is
 * the difference between a dashboard that happens to show video and something
 * an operator will watch for eight hours.
 */
function CameraTile({
  camera,
  fps,
  selected,
  onOpen,
}: {
  camera: WallCamera;
  fps: number;
  selected: boolean;
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
  const message = viewerMessage(phase, error, camera);

  return (
    <CameraSurface
      name={camera.name || camera.camera_id}
      identifier={camera.camera_id}
      context={`CH${String(camera.channel).padStart(2, '0')} · ${camera.stream_type}`}
      tone={streamTone(camera.state)}
      stateLabel={STREAM_STATE_LABEL[camera.state]}
      selected={selected}
      onSelect={() => onOpen(camera)}
      label={`Open ${camera.camera_id}, channel ${camera.channel}, ${STREAM_STATE_LABEL[camera.state]}`}
      media={
        <>
          {/* Mounted as soon as there is a URL, and *kept* mounted underneath
              the message. It has to be in the document to load at all — an
              earlier version rendered the placeholder **instead of** the image,
              so nothing ever requested the stream. */}
          {streamable ? (
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
                textAlign: 'center', padding: 'var(--space-4)',
                background: 'var(--video-ground)',
              }}
            >
              {/* An honest reason, never a spinner that implies a stream is
                  coming. `live` shows nothing at all — the picture is the
                  status. */}
              {message}
            </div>
          ) : null}
        </>
      }
      meta={
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)' }}>
          {camera.width ? `${camera.width}×${camera.height}` : 'resolution unknown'}
          {camera.seconds_since_frame !== null ? ` · ${camera.seconds_since_frame}s since frame` : ''}
        </span>
      }
    />
  );
}

/* ── detail ───────────────────────────────────────────────────────────────── */

/**
 * The focused camera: one picture, at size, with its operational context beside
 * it rather than beneath it.
 *
 * The previous version was the same picture over a flat key/value grid of ten
 * rows, every row the same weight. What an operator actually asks when they
 * focus a camera is *is this healthy, how do I know, and where do I go next* —
 * so the numbers that answer the first are given rank, and the edges that
 * answer the third exist at all.
 */
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
        background: 'rgb(0 0 0 / 0.86)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'var(--space-6)',
        animation: 'uwv-fade-in var(--motion-fast) var(--ease-out)',
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(1280px, 100%)', display: 'grid', gap: 'var(--space-5)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-2xs)',
                letterSpacing: 'var(--tracking-wider)',
                textTransform: 'uppercase',
                color: 'var(--video-ink)',
              }}
            >
              Focused camera · CH{String(camera.channel).padStart(2, '0')} · {camera.stream_type}
            </div>
            <h2
              style={{
                fontSize: 'var(--text-2xl)',
                color: '#fff',
                margin: 0,
                marginTop: 'var(--space-2)',
                letterSpacing: 'var(--tracking-tight)',
              }}
            >
              {camera.camera_id}
            </h2>
          </div>
          <LiveDot tone={streamTone(camera.state)} label={STREAM_STATE_LABEL[camera.state]} />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <Button size="sm" onClick={fullscreen}>Fullscreen</Button>
            <Button size="sm" variant="secondary" onClick={onClose}>Close</Button>
          </div>
        </div>

        <div className="uwv-rail">
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

          <aside style={{ display: 'grid', gap: 'var(--space-6)', alignContent: 'start' }}>
            {/* Ranked rather than listed. Frames decoded is the number that
                says whether this camera has ever worked; the rest is context
                for it. */}
            <Figure
              label="Frames decoded"
              scale="lead"
              value={camera.frames_decoded}
              detail={`${camera.viewers} viewer(s) on this camera`}
              tone={camera.frames_decoded > 0 ? 'accent' : 'default'}
            />
            <div className="uwv-figures">
              <Figure
                label="Reconnects"
                scale="quiet"
                value={camera.reconnects}
                tone={camera.reconnects > 0 ? 'critical' : 'default'}
                detail="Since this session opened"
              />
              <Figure
                label="First frame"
                scale="quiet"
                // `null` rather than `0` when the server has never reported one:
                // "no frame has arrived" is not "it arrived instantly".
                value={camera.first_frame_latency_s !== null ? `${camera.first_frame_latency_s}s` : null}
                unavailableReason="No frame has arrived yet"
                detail="Time to the first picture"
              />
            </div>

            <div>
              <Eyebrow>Signal</Eyebrow>
              <div style={{ marginTop: 'var(--space-3)' }}>
                <KeyValue
                  items={[
                    { key: 'Name', value: camera.name || '—' },
                    { key: 'DVR channel', value: String(camera.channel) },
                    { key: 'Stream', value: camera.stream_type },
                    { key: 'State', value: STREAM_STATE_LABEL[camera.state] },
                    { key: 'Resolution', value: camera.width ? `${camera.width}×${camera.height}` : '—' },
                    {
                      key: 'Since frame',
                      value:
                        camera.seconds_since_frame === null
                          ? 'no frame yet'
                          : `${camera.seconds_since_frame}s`,
                    },
                    { key: 'Purpose', value: camera.purpose || '—' },
                    { key: 'Last error', value: camera.last_error || '—' },
                  ]}
                />
              </div>
            </div>

            <div>
              <Eyebrow>Go to</Eyebrow>
              <ul style={{ display: 'grid', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
                <li>
                  <Link to={`/cameras/${encodeURIComponent(camera.camera_id)}`} style={{ textDecoration: 'none' }}>
                    <GoTo>Everything about this camera</GoTo>
                  </Link>
                </li>
              </ul>
            </div>
          </aside>
        </div>
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
      <PageIntro
        eyebrow="Operations"
        title="Camera Wall"
        standfirst="Every channel on the recorder, live. This view performs no analysis — opening a tile costs a video decode, never a model call. A camera is never hidden for being dark: an operator who cannot see that channel 7 is black is worse served than one with no wall at all."
        meta={
          <>
            <Badge>{data.total} channels</Badge>
            <LiveDot tone={data.live > 0 ? 'online' : 'idle'} label={`${data.live} live`} />
          </>
        }
      />

      {/* The state of the estate, ranked: one dominant figure, the rest
          supporting, and a real proportion over a real denominator. */}
      <div className="uwv-lead" style={{ marginBottom: 'var(--space-8)' }}>
        <div style={{ display: 'grid', gap: 'var(--space-5)', alignContent: 'start' }}>
          <Meter
            caption="Channels by stream state"
            total={data.total}
            emptyNote="The recorder reports no channel at all. Nothing is being watched."
            segments={STREAM_STATES.map((state) => ({
              key: state,
              label: STREAM_STATE_LABEL[state],
              value: counts[state] ?? 0,
              color: STREAM_STATE_COLOR[state],
            }))}
          />
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-secondary)', maxWidth: 'var(--measure)' }}>
            Only <strong>Live</strong> means pictures are actually moving. The server sets it from
            genuine frame arrival, never from a session that merely opened — which is why a tile can
            read <em>Connecting</em> for a camera that is never coming, and says so rather than
            showing the last frame it had.
          </p>
        </div>

        <div className="uwv-figures" style={{ alignContent: 'start' }}>
          <Figure
            label="Live"
            scale="hero"
            value={data.live}
            tone={data.live > 0 ? 'accent' : 'default'}
            detail="Frames arriving now"
          />
          <Figure
            label="Not live"
            scale="lead"
            value={notLive}
            detail={
              Object.entries(counts)
                .filter(([state]) => state !== 'live')
                .map(([state, n]) => `${n} ${state}`)
                .join(' · ') || 'None'
            }
          />
        </div>
      </div>

      <SectionRule
        label="Channels"
        detail="Every configured channel, in recorder order. Selecting a tile focuses it; it does not start analysis."
      />

      <div className="uwv-tiles-wide">
        {cameras.map((camera) => (
          <CameraTile
            key={camera.camera_id}
            camera={camera}
            fps={data.default_wall_fps}
            selected={selected?.camera_id === camera.camera_id}
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

/**
 * The stream states, in the order an operator cares about them, with a colour
 * each.
 *
 * Reusing the health tones rather than inventing a palette: `live` is the same
 * green as an online camera everywhere else in the product, and `offline` the
 * same red. `disabled` is deliberately the neutral idle grey — a camera
 * somebody switched off is not a fault.
 */
const STREAM_STATES: ReadonlyArray<StreamState> = [
  'live',
  'connecting',
  'reconnecting',
  'offline',
  'error',
  'disabled',
];

const STREAM_STATE_COLOR: Record<StreamState, string> = {
  live: 'var(--health-online)',
  connecting: 'var(--health-degraded)',
  reconnecting: 'var(--health-degraded)',
  offline: 'var(--health-offline)',
  error: 'var(--severity-critical)',
  disabled: 'var(--health-idle)',
};

export type { StreamState };

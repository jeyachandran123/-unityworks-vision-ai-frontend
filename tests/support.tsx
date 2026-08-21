/**
 * Test harness.
 *
 * Renders the real application — real providers, real router, real guards, real
 * API client — against a stubbed `fetch`. Nothing here mocks a component or a
 * hook, because the properties under test (guards, single-flight refresh, lazy
 * loading, four-state rendering) only exist when the real ones run.
 */

import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { render, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@app/auth/AuthProvider';
import { ConnectionProvider } from '@shared/realtime/useConnection';
import { ToastProvider } from '@shared/ui/primitives';
import type { Identity } from '@shared/api/services';

/** Must equal the backend's `FIXTURE_OBSERVATION_COUNT`. */
export const FIXTURE_OBSERVATION_COUNT = 6;

export function identity(overrides: Partial<Identity> = {}): Identity {
  return {
    subject: 'developer@example.com',
    display_name: 'Dev User',
    tenant_id: 'org-test',
    roles: ['developer'],
    permissions: [
      'view_live',
      'view_observations',
      'view_evidence',
      'view_camera_health',
      'access_devtools',
      'register_demand',
    ],
    camera_scope: { breadth: 'listed', camera_ids: ['cam-fixture-01'] },
    site_ids: ['site-fixture'],
    ...overrides,
  };
}

export const managerIdentity = (): Identity =>
  identity({
    subject: 'manager@example.com',
    display_name: 'Manager',
    roles: ['restaurant_manager'],
    permissions: ['view_live', 'view_observations', 'view_evidence', 'view_camera_health'],
  });

export const supervisorIdentity = (): Identity =>
  identity({
    subject: 'supervisor@example.com',
    display_name: 'Supervisor',
    roles: ['kitchen_supervisor'],
    // No view_evidence. The role most likely to be a shared kitchen screen.
    permissions: ['view_live', 'view_observations', 'view_camera_health'],
  });

function attribute(key: string, value: string) {
  return {
    key,
    value,
    observed_at: 1_000_000_000,
    valid_until: 121_000_000_000,
    confidence: { value: 0.9, semantics: 'self_reported', calibrated: false },
  };
}

function fixtureObject(id: string, head: string, hand: string) {
  return {
    object_id: id,
    camera_id: 'cam-fixture-01',
    class_id: 'person',
    lifecycle: 'active',
    first_seen: 1_000_000_000,
    last_seen: 2_000_000_000,
    observation_count: 2,
    attributes: [attribute('head_covering', head), attribute('hand_covering', hand)],
  };
}

/**
 * The DevTools state payload, matching the backend fixture exactly.
 *
 * Three subjects: compliant, observed-absent, and refused. A fixture where
 * everything is compliant would let a UI that cannot draw NOT_VISIBLE pass its
 * own smoke test.
 */
export function fixtureState() {
  return {
    kind: 'fixture',
    session_id: 'fixture-kitchen-01',
    observation_count: FIXTURE_OBSERVATION_COUNT,
    complete: true,
    partitions: [{ camera_id: 'cam-fixture-01', object_count: 3 }],
    objects: [
      fixtureObject('obj-fixture-1', 'hairnet', 'gloves'),
      fixtureObject('obj-fixture-2', 'none', 'gloves'),
      fixtureObject('obj-fixture-3', 'hairnet', 'not_visible'),
    ],
  };
}

export function emptyLiveRuntime() {
  return {
    runtime: {
      enabled: false,
      reason: 'FEATURE_LIVE_CCTV is off; no camera session will start',
      active_sessions: 0,
      streaming_sessions: 0,
      streaming: false,
    },
    sessions: [],
    cameras_configured: [],
    backpressure: { policy: 'drop-oldest', rationale: 'newest frame is the valuable one' },
  };
}

/** A running REPLAY source. Never labelled live. */
export function replayLiveRuntime() {
  return {
    runtime: {
      enabled: true,
      reason: '',
      active_sessions: 1,
      streaming_sessions: 1,
      streaming: true,
    },
    sessions: [
      {
        session_id: 'sess-replay-1',
        kind: 'replay',
        camera_id: 'cam-01',
        tenant_id: 'org-test',
        state: 'running',
        streaming: true,
        seekable: false,
        bounded: true,
        analysis_fps: 4,
        error: '',
        source: {
          camera_id: 'cam-01',
          kind: 'replay',
          state: 'running',
          health: 'online',
          uri: 'file://kitchen.mp4',
          epoch: 0,
          frames_produced: 120,
          reconnects: 0,
          errors: 0,
          last_error: '',
          producing: true,
          stale: false,
          transitions: [],
        },
        queue: {
          capacity: 8,
          depth: 2,
          high_water: 8,
          accepted: 120,
          dropped_total: 37,
          dropped_queue_full: 5,
          dropped_sampled: 32,
          dropped_shutdown: 0,
        },
        stats: {
          frames_received: 157,
          frames_processed: 118,
          frames_dropped: 37,
          processing_errors: 0,
          mean_processing_ms: 4.2,
        },
      },
    ],
    cameras_configured: [],
    backpressure: { policy: 'drop-oldest', rationale: 'newest frame is the valuable one' },
  };
}

export interface StubOptions {
  /** Overrides the camera block on /status. */
  cameras?: unknown;
  /** Overrides the live_runtime block on /status. */
  runtime?: unknown;
  /** Overrides /devtools/live. */
  live?: unknown;
  /** `null` makes /auth/refresh 401 — i.e. no existing session. */
  session?: Identity | null;
  /** Envelope code returned by /auth/login. */
  loginFailure?: string;
  /** Extra `pathSuffix → payload` overrides, checked before the defaults. */
  routes?: Record<string, unknown>;
  /** Every call is appended here, for assertions. */
  calls?: string[];
  /** Fails the first N /auth/refresh calls with a network error. */
  refreshNetworkFailures?: number;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'req-test' },
  });
}

function envelope(code: string, status: number): Response {
  return jsonResponse(
    { code, message: `error: ${code}`, retryable: false, details: {}, request_id: 'req-test' },
    status,
  );
}

export function stubFetch(options: StubOptions = {}) {
  const { session = identity(), routes = {}, calls = [] } = options;
  let networkFailures = options.refreshNetworkFailures ?? 0;

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url}`);

    if (url.includes('/auth/refresh')) {
      if (networkFailures > 0) {
        networkFailures -= 1;
        throw new TypeError('network failure');
      }
      return session
        ? jsonResponse({ access_token: 'access-1', token_type: 'bearer', expires_at: '', user: session })
        : envelope('UNAUTHENTICATED', 401);
    }

    if (url.includes('/auth/login')) {
      if (options.loginFailure) return envelope(options.loginFailure, 401);
      return jsonResponse({
        access_token: 'access-1',
        token_type: 'bearer',
        expires_at: '',
        user: session ?? identity(),
      });
    }

    if (url.includes('/auth/logout')) return jsonResponse({ ok: true });

    if (url.includes('/auth/me')) {
      return session ? jsonResponse(session) : envelope('UNAUTHENTICATED', 401);
    }

    for (const [path, payload] of Object.entries(routes)) {
      if (url.includes(path)) {
        return payload instanceof Response ? payload : jsonResponse(payload);
      }
    }

    if (url.includes('/status')) {
      return jsonResponse({
        service: { ok: true },
        vision_os: { assembled: false, reason: 'VISION_AUTOSTART is false', attributes: [], policies: [] },
        tenant_id: 'org-test',
        cameras: options.cameras ?? {
          configured: 0,
          sessions: 0,
          streaming: 0,
          health: [],
        },
        live_runtime: options.runtime ?? {
          enabled: false,
          reason: 'FEATURE_LIVE_CCTV is off; no camera session will start',
          active_sessions: 0,
          streaming_sessions: 0,
          streaming: false,
        },
        // 'cameras' left this list in Phase 3 — real camera health is reported.
        not_yet_reported: ['coverage', 'incidents'],
      });
    }

    if (url.includes('/devtools/live')) {
      return jsonResponse(options.live ?? emptyLiveRuntime());
    }

    if (url.includes('/devtools/vision')) {
      return jsonResponse({
        assembled: true,
        reason: '',
        attributes: ['face_covering', 'hand_covering', 'head_covering'],
        policies: ['kitchen-safety@2.1.0'],
        imagery: { serve_frames: false, allow_evidence: false },
      });
    }

    if (url.includes('/devtools/state')) return jsonResponse(fixtureState());

    if (url.includes('/devtools/sessions')) {
      return jsonResponse({
        sessions: [
          {
            session_id: 'fixture-kitchen-01',
            kind: 'fixture',
            camera_id: 'cam-fixture-01',
            tenant_id: 'org-test',
            observation_count: FIXTURE_OBSERVATION_COUNT,
            note: 'deterministic fixture',
          },
        ],
      });
    }

    if (url.includes('/devtools/capabilities')) {
      return jsonResponse({
        kind: 'fixture',
        taxonomy_version: 'fixture-taxonomy-1',
        producible_classes: ['person'],
        producible_attributes: ['head_covering', 'hand_covering'],
      });
    }

    return envelope('NOT_FOUND', 404);
  });
}

export function installFetch(options: StubOptions = {}) {
  const stub = stubFetch(options);
  vi.stubGlobal('fetch', stub);
  return stub;
}

export function renderApp(ui: ReactElement, route = '/'): RenderResult {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });

  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AuthProvider>
          <ConnectionProvider>
            <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
          </ConnectionProvider>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/**
 * The nine product routes.
 *
 * **These are foundations, not features.** Each one uses the real shell, the
 * real permission system and the real design system, and each one says honestly
 * that its backing data does not exist yet.
 *
 * ### The rule that governs every page here
 *
 * No fabricated metric. Not one invented incident count, camera status,
 * compliance percentage or trend line. `StatCard` renders `—` rather than `0`
 * when a value is `null`, and every page states which backend capability it is
 * waiting for.
 *
 * The reason is the product's whole thesis: "no violations" and "not watching"
 * must never look the same. A placeholder that shows a plausible-looking `0`
 * teaches an operator to trust a number the system cannot produce, and the day
 * it becomes real nobody will know which readings were which.
 */

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { healthApi, type OperatorStatus } from '@shared/api/services';
import { incidentsApi } from '@shared/api/persistence';
import { useAuth } from '@app/auth/AuthProvider';
import { has, PERMISSIONS } from '@app/permissions/permissions';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatCard,
  StatusBadge,
  UnavailableState,
} from '@shared/ui/primitives';
import { isApiError } from '@shared/api/errors';

/** Marks a surface whose backend does not exist yet. Visible, never subtle. */
function NotConnected({ capability }: { capability: string }) {
  return (
    <Badge>
      <span aria-hidden="true">◌</span> awaiting {capability}
    </Badge>
  );
}

function ProductPage({
  title,
  description,
  capability,
  children,
}: {
  title: string;
  description: string;
  capability: string;
  children: ReactNode;
}) {
  return (
    <>
      <PageHeader title={title} description={description} meta={<NotConnected capability={capability} />} />
      {children}
    </>
  );
}

/* ── Dashboard ────────────────────────────────────────────────────────────── */

export function DashboardPage() {
  const status = useQuery({
    queryKey: ['status'],
    queryFn: () => healthApi.status(),
    staleTime: 15_000,
  });

  // Incidents are durable as of Phase 5, so this figure is real. It is fetched
  // separately from status on purpose: if the incident store is unreachable the
  // card goes back to `—`, rather than the whole dashboard reporting nothing.
  const canSeeIncidents = has(useAuth().user, PERMISSIONS.viewIncidents);
  const openIncidents = useQuery({
    queryKey: ['incidents', 'active'],
    queryFn: () => incidentsApi.list('active'),
    enabled: canSeeIncidents,
    staleTime: 15_000,
  });

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Today at a glance. Every figure here shows its coverage, because a count without one cannot be read."
      />

      {status.isPending ? <LoadingState label="Loading status" /> : null}

      {status.isError ? (
        <ErrorState
          body={isApiError(status.error) ? status.error.friendlyMessage : 'Status could not be loaded.'}
          requestId={isApiError(status.error) ? status.error.requestId : undefined}
          onRetry={() => void status.refetch()}
        />
      ) : null}

      {status.isSuccess ? (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(13rem, 1fr))',
              gap: 'var(--space-4)',
              marginBottom: 'var(--space-6)',
            }}
          >
            {/* Real, from the durable incident store. Still `—` rather than
                `0` whenever the count is not actually known — the account may
                not read incidents, or the query may have failed, and both must
                look different from "nothing is wrong". */}
            <StatCard
              label="Open incidents"
              value={openIncidents.isSuccess ? openIncidents.data.count : null}
              unavailableReason={
                !canSeeIncidents
                  ? 'Your account does not read incidents'
                  : openIncidents.isError
                    ? 'The incident store could not be reached'
                    : 'Loading'
              }
              detail="Raised and not yet resolved"
            />
            {/* Real, from the live runtime. Still refuses to imply anything it
                does not know: zero configured cameras reads as zero configured
                cameras, never as zero problems. */}
            <StatCard
              label="Cameras online"
              value={
                status.data.cameras.configured === 0
                  ? null
                  : status.data.cameras.health.filter((c) => c.health === 'online').length
              }
              unavailableReason="No camera is configured yet"
              detail={`${status.data.cameras.configured} configured · ${status.data.cameras.streaming} streaming`}
            />
            <StatCard label="Subjects assessed" value={null} unavailableReason="Requires a live source" />
            <StatCard
              label="Service"
              value={status.data.service.ok ? 'OK' : 'Degraded'}
              detail={`Tenant ${status.data.tenant_id}`}
              tone={status.data.service.ok ? 'accent' : 'default'}
            />
          </div>

          <Card>
            <h2 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-3)' }}>Not yet reported</h2>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-secondary)', maxWidth: '62ch' }}>
              The backend names the signals it cannot yet produce rather than
              returning zero for them. Each appears here until the phase that
              delivers it.
            </p>
            <ul style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-4)' }}>
              {status.data.not_yet_reported.map((item) => (
                <li key={item}>
                  <Badge>{item}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}
    </>
  );
}

/* ── The remaining eight ──────────────────────────────────────────────────── */

export function LiveMonitoringPage() {
  const status = useQuery({
    queryKey: ['status'],
    queryFn: () => healthApi.status(),
    // Camera health changes on the scale of seconds, so this refetches faster
    // than the rest of the product. Still not a substitute for the WebSocket,
    // which reports a stream starting or stopping between polls.
    refetchInterval: 5_000,
  });

  return (
    <>
      <PageHeader
        title="Live Monitoring"
        description="What each camera is seeing now — or a plain statement that it is not seeing anything."
      />

      {status.isPending ? <LoadingState label="Loading cameras" /> : null}

      {status.isError ? (
        <ErrorState
          body={isApiError(status.error) ? status.error.friendlyMessage : 'Camera state could not be loaded.'}
          requestId={isApiError(status.error) ? status.error.requestId : undefined}
          onRetry={() => void status.refetch()}
        />
      ) : null}

      {status.isSuccess ? <CameraWall status={status.data} /> : null}
    </>
  );
}

function CameraWall({ status }: { status: OperatorStatus }) {
  const { cameras, live_runtime: runtime } = status;

  if (cameras.health.length === 0) {
    return (
      <UnavailableState
        title={runtime.enabled ? 'No camera session is running' : 'Live monitoring is not enabled'}
        body={
          <>
            {runtime.reason ||
              `${cameras.configured} camera(s) are configured and none has an active session.`}{' '}
            Nothing is being observed — which is not the same as observing
            nothing, and this page will never imply otherwise.
          </>
        }
      />
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(16rem, 1fr))',
        gap: 'var(--space-4)',
      }}
    >
      {cameras.health.map((camera) => (
        <Card key={camera.camera_id}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <StatusBadge tone={cameraTone(camera.health)}>{camera.health}</StatusBadge>
            <Badge>{camera.kind}</Badge>
          </div>
          <div style={{ marginTop: 'var(--space-3)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
            {camera.camera_id}
          </div>
          {/* Deliberately no image. The backend serves no frame, and a black
              rectangle — or worse, a stale one — would be a claim this page
              cannot support. A camera that is not producing says so in words. */}
          <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)' }}>
            {camera.health === 'online'
              ? 'Producing frames. No image is shown until imagery egress is enabled.'
              : 'Not producing frames.'}
          </div>
        </Card>
      ))}
    </div>
  );
}

function cameraTone(health: string): 'online' | 'degraded' | 'offline' | 'idle' {
  if (health === 'online') return 'online';
  if (health === 'degraded' || health === 'connecting') return 'degraded';
  if (health === 'error') return 'offline';
  return 'idle';
}

export function StaffHygienePage() {
  return (
    <ProductPage
      title="Staff Hygiene"
      description="PPE observations by person and zone, with the four observation states kept distinct."
      capability="observation history"
    >
      <EmptyState
        title="No observations yet"
        body="Once a camera is acquiring, each subject appears here with head, face and hand coverings — each shown as present, absent, not visible or unknown."
      />
    </ProductPage>
  );
}

export function ReportsPage() {
  return (
    <ProductPage
      title="Reports"
      description="Periods, trends and export. Every figure carries the coverage it was computed from and the rule version in force."
      capability="reporting"
    >
      <EmptyState
        title="No reporting period available"
        body="Reports need observation history. They arrive with the data that makes them meaningful."
      />
    </ProductPage>
  );
}

export function AdministrationPage() {
  return (
    <ProductPage
      title="Administration"
      description="Restaurants, zones, users and roles."
      capability="organisation management"
    >
      <EmptyState
        title="Administration is not connected"
        body="User and organisation management endpoints arrive in Phase 4. Accounts are provisioned directly for now."
      />
    </ProductPage>
  );
}

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" description="That address does not match anything in this application." />
      <EmptyState title="Nothing here" body="Check the address, or pick a destination from the navigation." />
    </>
  );
}

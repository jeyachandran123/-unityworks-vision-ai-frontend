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
import { healthApi } from '@shared/api/services';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatCard,
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
  // The one product page with a real backend call. `/api/v1/status` exists, so
  // the dashboard reports what it genuinely knows and nothing more.
  const status = useQuery({
    queryKey: ['status'],
    queryFn: () => healthApi.status(),
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
            {/* Every one of these is null on purpose. The backend reports them
                under `not_yet_reported`, and inventing a zero would be the exact
                failure this product exists to avoid. */}
            <StatCard label="Open incidents" value={null} unavailableReason="Incidents arrive in Phase 4" />
            <StatCard label="Cameras online" value={null} unavailableReason="Camera management arrives in Phase 3" />
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
  return (
    <ProductPage
      title="Live Monitoring"
      description="The camera wall. A tile shows what a camera is seeing, or says plainly that it is not seeing anything."
      capability="live camera sources"
    >
      <UnavailableState
        title="No camera sources configured"
        body={
          <>
            Live ingestion arrives in Phase 3. When a camera goes offline this
            surface will show it as offline — never a frozen last frame, which is
            the most dangerous default in CCTV software.
          </>
        }
      />
    </ProductPage>
  );
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

export function AlertsPage() {
  return (
    <ProductPage
      title="Alerts"
      description="Things that need attention now, ordered by severity."
      capability="alert delivery"
    >
      <EmptyState
        title="No alerts"
        body="Nothing is currently raised. This is not a compliance statement — it means no alert rule has fired, and alert delivery is not connected yet."
      />
    </ProductPage>
  );
}

export function CamerasPage() {
  return (
    <ProductPage
      title="Cameras"
      description="Coverage, health and blind spots. A camera that has produced no frames is the most important thing on this page."
      capability="camera management"
    >
      <EmptyState
        title="No cameras registered"
        body="Camera configuration arrives in Phase 3, together with the RTSP source adapter."
      />
    </ProductPage>
  );
}

export function IncidentsPage() {
  return (
    <ProductPage
      title="Incidents"
      description="The work queue: open, assigned, resolved. Each incident freezes the finding that raised it, so it stays explicable after the rules change."
      capability="incident persistence"
    >
      <EmptyState
        title="No incidents"
        body="Incident persistence arrives in Phase 4. Nothing is being suppressed — there is no store to read from yet."
      />
    </ProductPage>
  );
}

export function EvidencePage() {
  return (
    <ProductPage
      title="Evidence"
      description="Imagery that supports a finding. Every view is an access event, and access is a separate privilege from reading observations."
      capability="durable evidence storage"
    >
      <UnavailableState
        title="Evidence storage is not durable yet"
        body={
          <>
            The platform holds evidence in memory, so nothing survives a restart.
            A durable, encrypted store with a working retention sweeper is
            required before real imagery is retained.
          </>
        }
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

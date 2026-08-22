/**
 * The route table.
 *
 * One place. Every path in the application appears here, each declaring the
 * permission it needs — never a role, because roles change and the backend
 * already owns the mapping from role to permission.
 *
 * ### DevTools is one lazy chunk
 *
 * `React.lazy` at the route boundary means a restaurant manager's browser never
 * downloads the engineering workspace. One import boundary is also one place to
 * enforce the permission gate: `RequirePermission` sits above the lazy element,
 * so an unauthorised user is redirected *before* the chunk is requested.
 */

import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequirePermission } from '@app/permissions/guards';
import { PERMISSIONS } from '@app/permissions/permissions';
import { AppShell } from '@shared/layout/AppShell';
import { LoadingState } from '@shared/ui/primitives';
import { LoginPage } from '@features/auth/LoginPage';
import {
  AdministrationPage,
  AlertsPage,
  DashboardPage,
  LiveMonitoringPage,
  NotFoundPage,
  ReportsPage,
  StaffHygienePage,
} from '@features/product-routes';
// The four surfaces backed by durable state. Kept in their own module so it is
// obvious at a glance which pages read a database and which are still waiting
// for one.
import {
  AuditPage,
  CamerasPage,
  EvidencePage,
  IncidentsPage,
} from '@features/persistence-routes';

/**
 * The single dynamic import in the application.
 *
 * A test asserts there is exactly one, because a second entry point into
 * DevTools would be a second place the permission gate could be forgotten.
 */
const DevToolsRoutes = lazy(() => import('@devtools/vision-os/DevToolsRoutes'));

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />

          {/* Every signed-in user reaches the dashboard. It is the fallback for
              a redirect, so it must never itself be permission-gated. */}
          <Route path="/dashboard" element={<DashboardPage />} />

          <Route element={<RequirePermission permissions={[PERMISSIONS.viewLive]} />}>
            <Route path="/live" element={<LiveMonitoringPage />} />
          </Route>

          <Route element={<RequirePermission permissions={[PERMISSIONS.viewObservations]} />}>
            <Route path="/hygiene" element={<StaffHygienePage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
          </Route>

          {/* Incidents are not implied by observations: an incident is what the
              organisation decided to do about a finding, and acting on one is a
              further privilege still. */}
          <Route element={<RequirePermission permissions={[PERMISSIONS.viewIncidents]} />}>
            <Route path="/incidents" element={<IncidentsPage />} />
          </Route>

          {/* Evidence is its own permission, never implied by observations. */}
          <Route element={<RequirePermission permissions={[PERMISSIONS.viewEvidence]} />}>
            <Route path="/evidence" element={<EvidencePage />} />
          </Route>

          <Route
            element={
              <RequirePermission
                permissions={[PERMISSIONS.viewCameras, PERMISSIONS.viewCameraHealth]}
              />
            }
          >
            <Route path="/cameras" element={<CamerasPage />} />
          </Route>

          {/* Reading the trail is its own privilege. Knowing who looked at
              imagery of a named employee is not an administrative by-product. */}
          <Route element={<RequirePermission permissions={[PERMISSIONS.viewAudit]} />}>
            <Route path="/audit" element={<AuditPage />} />
          </Route>

          <Route
            element={
              <RequirePermission
                permissions={[PERMISSIONS.manageUsers, PERMISSIONS.manageOrganization]}
              />
            }
          >
            <Route path="/admin" element={<AdministrationPage />} />
          </Route>

          <Route element={<RequirePermission permissions={[PERMISSIONS.accessDevtools]} />}>
            <Route
              path="/devtools/vision/*"
              element={
                <Suspense fallback={<LoadingState label="Loading Vision OS tools" />}>
                  <DevToolsRoutes />
                </Suspense>
              }
            />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

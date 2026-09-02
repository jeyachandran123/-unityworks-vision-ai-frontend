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
import { DashboardPage, LiveMonitoringPage, NotFoundPage } from '@features/product-routes';
// Reports left  when it stopped being a placeholder: it reads
// incidents, observations, cameras and the audit trail, and is the densest page
// in the product.
import { ReportsPage } from '@features/reports';
// Staff Hygiene and Administration left `product-routes` when they stopped
// being placeholders: both now read a real backend, and both are large enough
// that keeping them beside the pages still awaiting one would hide which is
// which.
import { StaffHygienePage } from '@features/hygiene';
import { AdministrationPage } from '@features/administration';
// The seven modules with a schema, a permission and no data source. Each page
// states the specific real-world input it is waiting for; none renders a
// number. Patron ID is separate because it is blocked by a decision rather
// than waiting on work, and that must not read as the same thing.
import {
  CuttingBoardPage,
  DemographyPage,
  MealDetectionPage,
  PeopleCountingPage,
  PosIntegrationPage,
  TableOccupancyPage,
} from '@features/module-routes';
import { PatronIdPage } from '@features/patron-id';
// Reads the evaluation artifacts `tools/vision_eval` and `experiments/vlm_prompt`
// already produce. Read-only: no evaluation can be triggered from the product.
import { ModelEvaluationPage } from '@features/model-evaluation';
// The four surfaces backed by durable state. Kept in their own module so it is
// obvious at a glance which pages read a database and which are still waiting
// for one.
import { CameraWallPage } from '@features/camera-wall';
import { AlertsPage } from '@features/alerts';
import {
  AuditPage,
  CameraDetailPage,
  CamerasPage,
  EvidenceDetailPage,
  EvidencePage,
  IncidentDetailPage,
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
            <Route path="/live" element={<CameraWallPage />} />
          </Route>

          {/* Runtime diagnostics. Gated on **both** permissions, `mode="all"`.
              It was reachable by any account holding `view_live` — including a
              kitchen supervisor — while appearing in no navigation at all, so
              route access and navigation visibility disagreed in the one
              direction that matters. Stage 2 tightened the gate rather than
              loosening the navigation: the page reports session state and shows
              no imagery, which is a diagnostic and not an operator view. */}
          <Route
            element={
              <RequirePermission
                permissions={[PERMISSIONS.viewLive, PERMISSIONS.accessDevtools]}
                mode="all"
              />
            }
          >
            <Route path="/live/runtime" element={<LiveMonitoringPage />} />
          </Route>

          <Route element={<RequirePermission permissions={[PERMISSIONS.viewObservations]} />}>
            <Route path="/hygiene" element={<StaffHygienePage />} />
            <Route path="/alerts" element={<AlertsPage />} />
          </Route>

          {/* Reports gates on its own permission rather than on observations.
              The catalogue spans incidents, cameras and the audit trail, and
              each report separately requires the permission for every source it
              reads — so reaching this page grants nothing by itself. */}
          <Route element={<RequirePermission permissions={[PERMISSIONS.viewReports]} />}>
            <Route path="/reports" element={<ReportsPage />} />
          </Route>

          {/* Each module gates on its own permission. Deliberately not grouped
              under one `RequirePermission`: reading footfall and reading
              inferred demography are different purposes, and a shared guard
              would make holding one imply reaching the other. */}
          <Route element={<RequirePermission permissions={[PERMISSIONS.viewPeopleCount]} />}>
            <Route path="/people-counting" element={<PeopleCountingPage />} />
          </Route>
          <Route element={<RequirePermission permissions={[PERMISSIONS.viewDemography]} />}>
            <Route path="/demography" element={<DemographyPage />} />
          </Route>
          <Route element={<RequirePermission permissions={[PERMISSIONS.viewTableOccupancy]} />}>
            <Route path="/tables" element={<TableOccupancyPage />} />
          </Route>
          <Route element={<RequirePermission permissions={[PERMISSIONS.viewCuttingBoard]} />}>
            <Route path="/cutting-boards" element={<CuttingBoardPage />} />
          </Route>
          <Route element={<RequirePermission permissions={[PERMISSIONS.viewMealDetection]} />}>
            <Route path="/meals" element={<MealDetectionPage />} />
          </Route>
          {/* Its own permission. Evaluation artifacts are candid about how well
              the model actually scores, which is not something an operational
              read of the product implies access to. */}
          <Route element={<RequirePermission permissions={[PERMISSIONS.viewModelEvaluation]} />}>
            <Route path="/model-evaluation" element={<ModelEvaluationPage />} />
          </Route>
          <Route element={<RequirePermission permissions={[PERMISSIONS.viewPosIntegration]} />}>
            <Route path="/integrations/pos" element={<PosIntegrationPage />} />
          </Route>
          {/* The most sensitive surface in the product, and it operates
              nothing. Gated anyway: reading that a biometric module exists is
              itself a disclosure about what this deployment could do. */}
          <Route element={<RequirePermission permissions={[PERMISSIONS.viewPatronId]} />}>
            <Route path="/patron-id" element={<PatronIdPage />} />
          </Route>

          {/* Incidents are not implied by observations: an incident is what the
              organisation decided to do about a finding, and acting on one is a
              further privilege still. */}
          <Route element={<RequirePermission permissions={[PERMISSIONS.viewIncidents]} />}>
            <Route path="/incidents" element={<IncidentsPage />} />
            {/* An address per incident. This is the reason a router exists at
                all — `FRONTEND_MIGRATION_MATRIX.md` names "no view has a URL,
                so no view can be linked, bookmarked, deep-linked from an alert"
                as the first structural absence of the validation console, and
                three of those four were solved while this one was not. Same
                permission as the list: an object route must never be a way in
                to something the list would refuse. */}
            <Route path="/incidents/:incidentId" element={<IncidentDetailPage />} />
          </Route>

          {/* Evidence is its own permission, never implied by observations. */}
          <Route element={<RequirePermission permissions={[PERMISSIONS.viewEvidence]} />}>
            <Route path="/evidence" element={<EvidencePage />} />
            {/* Resolves the **record**, never the image. Arriving at this
                address must not be what causes an access — otherwise a link in
                an email becomes an audit row against a named person's likeness,
                fired by a mail client's link preview. The imagery still
                requires the explicit request it always did. */}
            <Route path="/evidence/:evidenceRef" element={<EvidenceDetailPage />} />
          </Route>

          <Route
            element={
              <RequirePermission
                permissions={[PERMISSIONS.viewCameras, PERMISSIONS.viewCameraHealth]}
              />
            }
          >
            <Route path="/cameras" element={<CamerasPage />} />
            <Route path="/cameras/:cameraKey" element={<CameraDetailPage />} />
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

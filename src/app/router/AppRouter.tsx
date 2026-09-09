/**
 * The route table.
 *
 * One place. Every path in the application appears here, each declaring the
 * permission it needs — never a role, because roles change and the backend
 * already owns the mapping from role to permission.
 *
 ### Two shells, and the boundary between them is the product
 *
 *     /login                  no session
 *     /choose-organization    a session, no organisation chosen yet
 *     /platform/*             PlatformShell — no tenant, cross-organisation
 *     everything else         AppShell — one tenant, from the token
 *
 * `/platform/*` renders in its own shell and never inside `AppShell`. It used
 * to: `/platform/organizations` was declared inside the organisation shell,
 * which put a cross-customer console inside one customer's navigation and made
 * the console look like it belonged to whichever organisation happened to be
 * selected. That was the route table contradicting the domain model, and moving
 * it is the structural correction this layer needed.
 *
 * The chooser is a third thing again, and it is deliberately *not* under
 * `/platform`. Most of the people who see it are not platform administrators —
 * a multi-organisation `org_admin` owes an organisation choice and must never
 * be shown a cross-customer console. Serving both from one address made those
 * two audiences look like one group, and they are separated by a security
 * boundary rather than by a layout preference.
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
import {
  RequireAuth,
  RequireChoosableOrganizations,
  RequireOrganization,
  RequirePermission,
  RequirePlatformOperator,
} from '@app/permissions/guards';
import { PERMISSIONS } from '@app/permissions/permissions';
import { AppShell } from '@shared/layout/AppShell';
import { LoadingState } from '@shared/ui/primitives';
import { LoginPage } from '@features/auth/LoginPage';
// The organisation chooser. Sits between login and the application, and renders
// outside both shells — before an organisation is chosen there is nothing for
// the product navigation to be about, and a chooser is not a control plane.
import { OrganizationChooser } from '@features/platform/OrganizationChooser';
// The Platform Control Plane. Its own shell, above every organisation.
import { PlatformShell } from '@shared/layout/PlatformShell';
import { PlatformDashboard } from '@features/platform/PlatformDashboard';
import { PlatformPeoplePage, PlatformPersonPage } from '@features/platform/PlatformPeople';
import {
  PlatformAuditPage,
  PlatformFleetPage,
  PlatformOperatorsPage,
  PlatformRolesPage,
} from '@features/platform/PlatformAccess';
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
import { UserDetailPage } from '@features/user-detail';
// Administration is no longer one page. Sites, Cameras, People, Roles & Access
// and the organisation hub are separate surfaces, because a site and a person
// are objects worth looking at and the stacked page had nowhere to look at
// them. The platform console sits above all of them and answers to a different
// principal entirely — see `@shared/api/platform`.
import { AdminOverviewPage, RolesAndAccessPage } from '@features/admin/overview';
import { SiteDetailPage, SitesPage } from '@features/admin/sites';
import { AdminCameraDetailPage, AdminCamerasPage } from '@features/admin/cameras';
import { CameraOnboardingPage } from '@features/admin/camera-onboarding';
import { PeoplePage } from '@features/admin/people';
import { OrganizationDetailPage, OrganizationsPage } from '@features/admin/organizations';
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
        {/* Authenticated, and deliberately in neither shell. The one product
            surface that exists before an organisation does. Gated on having
            something to choose between: a single-organisation administrator who
            types this address is sent to their Command Center rather than shown
            a page with one card on it. */}
        <Route element={<RequireChoosableOrganizations />}>
          <Route path="/choose-organization" element={<OrganizationChooser />} />
        </Route>

        {/* ── The Platform Control Plane ──────────────────────────────────
            Its own shell, gated once on being a platform operator. Nothing
            here declares a `Permission`, because the principal that reaches it
            holds none — see `RequirePlatformOperator`. */}
        <Route element={<RequirePlatformOperator />}>
          <Route element={<PlatformShell />}>
            <Route path="/platform" element={<PlatformDashboard />} />
            <Route path="/platform/organizations" element={<OrganizationsPage />} />
            <Route
              path="/platform/organizations/:organizationId"
              element={<OrganizationDetailPage />}
            />
            <Route path="/platform/people" element={<PlatformPeoplePage />} />
            <Route path="/platform/people/:userId" element={<PlatformPersonPage />} />
            <Route path="/platform/operators" element={<PlatformOperatorsPage />} />
            <Route path="/platform/roles" element={<PlatformRolesPage />} />
            {/* Structural: a place in the architecture, no backend behind it
                yet. Each page says so rather than rendering an empty table. */}
            <Route path="/platform/audit" element={<PlatformAuditPage />} />
            <Route path="/platform/fleet" element={<PlatformFleetPage />} />
            <Route path="/platform/*" element={<NotFoundPage />} />
          </Route>
        </Route>

        <Route element={<RequireOrganization />}>
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

          {/* The hub. Any administration read gets in, and the page itself
              lists only the areas this account can actually reach — rather
              than showing four links and letting three of them 403. */}
          <Route
            element={
              <RequirePermission
                permissions={[
                  PERMISSIONS.viewSites,
                  PERMISSIONS.viewZones,
                  PERMISSIONS.viewCameras,
                  PERMISSIONS.viewUsers,
                  PERMISSIONS.manageOrganization,
                ]}
              />
            }
          >
            <Route path="/admin" element={<AdminOverviewPage />} />
          </Route>

          {/* Sites and zones read on their own permissions now, not on
              `view_users`. That separation is the entire point of the
              vocabulary correction: reading the estate and reading the staff
              list are different questions. */}
          <Route element={<RequirePermission permissions={[PERMISSIONS.viewSites]} />}>
            <Route path="/admin/sites" element={<SitesPage />} />
            <Route path="/admin/sites/:siteId/*" element={<SiteDetailPage />} />
          </Route>

          <Route element={<RequirePermission permissions={[PERMISSIONS.viewCameras]} />}>
            <Route path="/admin/cameras" element={<AdminCamerasPage />} />
            <Route path="/admin/cameras/:cameraKey/*" element={<AdminCameraDetailPage />} />
          </Route>

          {/* Adding one needs the write permission, and is declared above the
              detail route so `/admin/cameras/new` is never read as a camera
              whose key is "new". */}
          <Route element={<RequirePermission permissions={[PERMISSIONS.manageCameras]} />}>
            <Route path="/admin/cameras/new" element={<CameraOnboardingPage />} />
          </Route>

          <Route element={<RequirePermission permissions={[PERMISSIONS.viewUsers]} />}>
            <Route path="/admin/people" element={<PeoplePage />} />
            <Route path="/admin/access" element={<RolesAndAccessPage />} />
          </Route>

          {/* Narrower than the roster: changing a person always needs
              MANAGE_USERS specifically. A `view_users` holder reads the list
              and is redirected off a profile, matching `RequirePermission`'s
              redirect-not-403 posture. */}
          <Route element={<RequirePermission permissions={[PERMISSIONS.manageUsers]} />}>
            <Route path="/admin/people/:userId" element={<UserDetailPage />} />
            {/* The path this page lived at before People existed. Kept so
                links in older audit rows and bookmarks still resolve. */}
            <Route path="/admin/users/:userId" element={<UserDetailPage />} />
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
      </Route>
    </Routes>
  );
}

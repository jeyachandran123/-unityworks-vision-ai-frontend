/**
 * GENERATED FILE — do not edit.
 *
 * Source: ../unityworks-vision-ai-backend/docs/api/openapi.json
 * Regenerate: npm run types:generate
 * Verify:     npm run types:check
 */

/* eslint-disable */

export const API_PATHS = [
  "/api/v1/admin/users",
  "/api/v1/admin/users/{user_id}",
  "/api/v1/admin/users/{user_id}/activate",
  "/api/v1/admin/users/{user_id}/camera-scope",
  "/api/v1/admin/users/{user_id}/deactivate",
  "/api/v1/admin/users/{user_id}/permissions",
  "/api/v1/admin/users/{user_id}/permissions/{permission_value}",
  "/api/v1/admin/users/{user_id}/roles",
  "/api/v1/admin/users/{user_id}/roles/{role_value}",
  "/api/v1/audit",
  "/api/v1/auth/login",
  "/api/v1/auth/logout",
  "/api/v1/auth/me",
  "/api/v1/auth/organizations",
  "/api/v1/auth/organizations/{organization_id}/select",
  "/api/v1/auth/refresh",
  "/api/v1/cameras",
  "/api/v1/cameras/test-connection",
  "/api/v1/cameras/{camera_key}",
  "/api/v1/cameras/{camera_key}/frames",
  "/api/v1/devtools/capabilities",
  "/api/v1/devtools/compliance",
  "/api/v1/devtools/evidence/{blob_ref}",
  "/api/v1/devtools/live",
  "/api/v1/devtools/metrics",
  "/api/v1/devtools/observations",
  "/api/v1/devtools/sessions",
  "/api/v1/devtools/state",
  "/api/v1/devtools/vision",
  "/api/v1/evaluation",
  "/api/v1/evaluation/artifacts",
  "/api/v1/evaluation/runs/{run_id}",
  "/api/v1/evidence/{evidence_ref}",
  "/api/v1/evidence/{evidence_ref}/image",
  "/api/v1/incidents",
  "/api/v1/incidents/{incident_id}",
  "/api/v1/incidents/{incident_id}/acknowledge",
  "/api/v1/incidents/{incident_id}/resolve",
  "/api/v1/modules/cutting-board",
  "/api/v1/modules/demography",
  "/api/v1/modules/meal-detection",
  "/api/v1/modules/patron-id",
  "/api/v1/modules/patron-id/gate",
  "/api/v1/modules/people-counting",
  "/api/v1/modules/pos-integration",
  "/api/v1/modules/table-occupancy",
  "/api/v1/observations",
  "/api/v1/platform/me",
  "/api/v1/platform/operators",
  "/api/v1/platform/organizations",
  "/api/v1/platform/organizations/{organization_id}",
  "/api/v1/platform/organizations/{organization_id}/enter",
  "/api/v1/platform/organizations/{organization_id}/members",
  "/api/v1/platform/organizations/{organization_id}/members/{user_id}",
  "/api/v1/platform/organizations/{organization_id}/status",
  "/api/v1/platform/overview",
  "/api/v1/platform/people",
  "/api/v1/platform/people/{user_id}",
  "/api/v1/platform/roles",
  "/api/v1/pos-connectors",
  "/api/v1/reports/types",
  "/api/v1/reports/{report_id}",
  "/api/v1/reports/{report_id}/export",
  "/api/v1/restaurants",
  "/api/v1/restaurants/{restaurant_id}",
  "/api/v1/status",
  "/api/v1/users",
  "/api/v1/wall/cameras",
  "/api/v1/wall/cameras/{camera_id}",
  "/api/v1/wall/cameras/{camera_id}/stream.mjpg",
  "/api/v1/wall/cameras/{camera_id}/ticket",
  "/api/v1/zones",
  "/api/v1/zones/{zone_id}",
  "/health",
  "/health/ready"
] as const;

export type ApiPath = (typeof API_PATHS)[number];

export type HTTPValidationError = {
  "detail"?: Array<{
  "loc": Array<string | number>;
  "msg": string;
  "type": string;
}>;
};

export type ValidationError = {
  "loc": Array<string | number>;
  "msg": string;
  "type": string;
};

/** `GET /api/v1/admin/users` */
export type ListUsersApiV1AdminUsersGetResponse = Record<string, unknown>;

/** `POST /api/v1/admin/users` */
export type CreateUserApiV1AdminUsersPostResponse = Record<string, unknown>;

/** `GET /api/v1/admin/users/{user_id}` */
export type GetUserApiV1AdminUsersUserIdGetResponse = Record<string, unknown>;

/** `PATCH /api/v1/admin/users/{user_id}` */
export type UpdateUserApiV1AdminUsersUserIdPatchResponse = Record<string, unknown>;

/** `POST /api/v1/admin/users/{user_id}/activate` */
export type ActivateUserApiV1AdminUsersUserIdActivatePostResponse = Record<string, unknown>;

/** `GET /api/v1/admin/users/{user_id}/camera-scope` */
export type GetCameraScopeApiV1AdminUsersUserIdCameraScopeGetResponse = Record<string, unknown>;

/** `PUT /api/v1/admin/users/{user_id}/camera-scope` */
export type SetCameraScopeRouteApiV1AdminUsersUserIdCameraScopePutResponse = Record<string, unknown>;

/** `POST /api/v1/admin/users/{user_id}/deactivate` */
export type DeactivateUserApiV1AdminUsersUserIdDeactivatePostResponse = Record<string, unknown>;

/** `GET /api/v1/admin/users/{user_id}/permissions` */
export type ListPermissionOverridesApiV1AdminUsersUserIdPermissionsGetResponse = Record<string, unknown>;

/** `DELETE /api/v1/admin/users/{user_id}/permissions/{permission_value}` */
export type ResetOverrideApiV1AdminUsersUserIdPermissionsPermissionValueDeleteResponse = Record<string, unknown>;

/** `PUT /api/v1/admin/users/{user_id}/permissions/{permission_value}` */
export type SetOverrideApiV1AdminUsersUserIdPermissionsPermissionValuePutResponse = Record<string, unknown>;

/** `POST /api/v1/admin/users/{user_id}/roles` */
export type AssignRoleApiV1AdminUsersUserIdRolesPostResponse = Record<string, unknown>;

/** `DELETE /api/v1/admin/users/{user_id}/roles/{role_value}` */
export type RemoveRoleApiV1AdminUsersUserIdRolesRoleValueDeleteResponse = Record<string, unknown>;

/** `GET /api/v1/audit` */
export type ListAuditApiV1AuditGetResponse = Record<string, unknown>;

/** `POST /api/v1/auth/login` */
export type LoginApiV1AuthLoginPostResponse = Record<string, unknown>;

/** `POST /api/v1/auth/logout` */
export type LogoutApiV1AuthLogoutPostResponse = Record<string, unknown>;

/** `GET /api/v1/auth/me` */
export type MeApiV1AuthMeGetResponse = Record<string, unknown>;

/** `GET /api/v1/auth/organizations` */
export type MyOrganizationsApiV1AuthOrganizationsGetResponse = Record<string, unknown>;

/** `POST /api/v1/auth/organizations/{organization_id}/select` */
export type SelectOrganizationApiV1AuthOrganizationsOrganizationIdSelectPostResponse = Record<string, unknown>;

/** `POST /api/v1/auth/refresh` */
export type RefreshApiV1AuthRefreshPostResponse = Record<string, unknown>;

/** `GET /api/v1/cameras` */
export type ListCamerasApiV1CamerasGetResponse = Record<string, unknown>;

/** `POST /api/v1/cameras` */
export type CreateCameraApiV1CamerasPostResponse = Record<string, unknown>;

/** `POST /api/v1/cameras/test-connection` */
export type TestCameraConnectionApiV1CamerasTestConnectionPostResponse = Record<string, unknown>;

/** `DELETE /api/v1/cameras/{camera_key}` */
export type DeleteCameraApiV1CamerasCameraKeyDeleteResponse = Record<string, unknown>;

/** `PATCH /api/v1/cameras/{camera_key}` */
export type UpdateCameraApiV1CamerasCameraKeyPatchResponse = Record<string, unknown>;

/** `GET /api/v1/cameras/{camera_key}/frames` */
export type ListFramesApiV1CamerasCameraKeyFramesGetResponse = Record<string, unknown>;

/** `GET /api/v1/devtools/capabilities` */
export type CapabilitiesApiV1DevtoolsCapabilitiesGetResponse = Record<string, unknown>;

/** `GET /api/v1/devtools/compliance` */
export type ComplianceStateApiV1DevtoolsComplianceGetResponse = Record<string, unknown>;

/** `GET /api/v1/devtools/evidence/{blob_ref}` */
export type EvidenceApiV1DevtoolsEvidenceBlobRefGetResponse = Record<string, unknown>;

/** `GET /api/v1/devtools/live` */
export type LiveRuntimeApiV1DevtoolsLiveGetResponse = Record<string, unknown>;

/** `GET /api/v1/devtools/metrics` */
export type PlatformMetricsApiV1DevtoolsMetricsGetResponse = Record<string, unknown>;

/** `GET /api/v1/devtools/observations` */
export type RealObservationsApiV1DevtoolsObservationsGetResponse = Record<string, unknown>;

/** `GET /api/v1/devtools/sessions` */
export type SessionsApiV1DevtoolsSessionsGetResponse = Record<string, unknown>;

/** `GET /api/v1/devtools/state` */
export type VisionStateApiV1DevtoolsStateGetResponse = Record<string, unknown>;

/** `GET /api/v1/devtools/vision` */
export type VisionDiagnosticsApiV1DevtoolsVisionGetResponse = Record<string, unknown>;

/** `GET /api/v1/evaluation` */
export type EvaluationSummaryApiV1EvaluationGetResponse = Record<string, unknown>;

/** `GET /api/v1/evaluation/artifacts` */
export type EvaluationArtifactsApiV1EvaluationArtifactsGetResponse = Record<string, unknown>;

/** `GET /api/v1/evaluation/runs/{run_id}` */
export type EvaluationRunApiV1EvaluationRunsRunIdGetResponse = Record<string, unknown>;

/** `DELETE /api/v1/evidence/{evidence_ref}` */
export type DeleteEvidenceApiV1EvidenceEvidenceRefDeleteResponse = Record<string, unknown>;

/** `GET /api/v1/evidence/{evidence_ref}` */
export type GetEvidenceMetadataApiV1EvidenceEvidenceRefGetResponse = Record<string, unknown>;

/** `GET /api/v1/evidence/{evidence_ref}/image` */
export type GetEvidenceImageApiV1EvidenceEvidenceRefImageGetResponse = unknown;

/** `GET /api/v1/incidents` */
export type ListIncidentsApiV1IncidentsGetResponse = Record<string, unknown>;

/** `GET /api/v1/incidents/{incident_id}` */
export type GetIncidentApiV1IncidentsIncidentIdGetResponse = Record<string, unknown>;

/** `POST /api/v1/incidents/{incident_id}/acknowledge` */
export type AcknowledgeIncidentApiV1IncidentsIncidentIdAcknowledgePostResponse = Record<string, unknown>;

/** `POST /api/v1/incidents/{incident_id}/resolve` */
export type ResolveIncidentApiV1IncidentsIncidentIdResolvePostResponse = Record<string, unknown>;

/** `GET /api/v1/modules/cutting-board` */
export type CuttingBoardApiV1ModulesCuttingBoardGetResponse = Record<string, unknown>;

/** `GET /api/v1/modules/demography` */
export type DemographyApiV1ModulesDemographyGetResponse = Record<string, unknown>;

/** `GET /api/v1/modules/meal-detection` */
export type MealDetectionApiV1ModulesMealDetectionGetResponse = Record<string, unknown>;

/** `GET /api/v1/modules/patron-id` */
export type PatronIdApiV1ModulesPatronIdGetResponse = Record<string, unknown>;

/** `GET /api/v1/modules/patron-id/gate` */
export type PatronIdGateApiV1ModulesPatronIdGateGetResponse = Record<string, unknown>;

/** `GET /api/v1/modules/people-counting` */
export type PeopleCountingApiV1ModulesPeopleCountingGetResponse = Record<string, unknown>;

/** `GET /api/v1/modules/pos-integration` */
export type PosIntegrationApiV1ModulesPosIntegrationGetResponse = Record<string, unknown>;

/** `GET /api/v1/modules/table-occupancy` */
export type TableOccupancyApiV1ModulesTableOccupancyGetResponse = Record<string, unknown>;

/** `GET /api/v1/observations` */
export type ListObservationsApiV1ObservationsGetResponse = Record<string, unknown>;

/** `GET /api/v1/platform/me` */
export type WhoamiApiV1PlatformMeGetResponse = Record<string, unknown>;

/** `GET /api/v1/platform/operators` */
export type ListOperatorsApiV1PlatformOperatorsGetResponse = Record<string, unknown>;

/** `GET /api/v1/platform/organizations` */
export type ListOrganizationsApiV1PlatformOrganizationsGetResponse = Record<string, unknown>;

/** `POST /api/v1/platform/organizations` */
export type CreateOrganizationApiV1PlatformOrganizationsPostResponse = Record<string, unknown>;

/** `GET /api/v1/platform/organizations/{organization_id}` */
export type GetOrganizationApiV1PlatformOrganizationsOrganizationIdGetResponse = Record<string, unknown>;

/** `PATCH /api/v1/platform/organizations/{organization_id}` */
export type UpdateOrganizationApiV1PlatformOrganizationsOrganizationIdPatchResponse = Record<string, unknown>;

/** `POST /api/v1/platform/organizations/{organization_id}/enter` */
export type EnterOrganizationApiV1PlatformOrganizationsOrganizationIdEnterPostResponse = Record<string, unknown>;

/** `GET /api/v1/platform/organizations/{organization_id}/members` */
export type ListMembersApiV1PlatformOrganizationsOrganizationIdMembersGetResponse = Record<string, unknown>;

/** `POST /api/v1/platform/organizations/{organization_id}/members` */
export type AddMemberApiV1PlatformOrganizationsOrganizationIdMembersPostResponse = Record<string, unknown>;

/** `DELETE /api/v1/platform/organizations/{organization_id}/members/{user_id}` */
export type RemoveMemberApiV1PlatformOrganizationsOrganizationIdMembersUserIdDeleteResponse = Record<string, unknown>;

/** `PUT /api/v1/platform/organizations/{organization_id}/status` */
export type SetOrganizationStatusApiV1PlatformOrganizationsOrganizationIdStatusPutResponse = Record<string, unknown>;

/** `GET /api/v1/platform/overview` */
export type OverviewApiV1PlatformOverviewGetResponse = Record<string, unknown>;

/** `GET /api/v1/platform/people` */
export type ListPeopleApiV1PlatformPeopleGetResponse = Record<string, unknown>;

/** `GET /api/v1/platform/people/{user_id}` */
export type GetPersonApiV1PlatformPeopleUserIdGetResponse = Record<string, unknown>;

/** `GET /api/v1/platform/roles` */
export type RolePolicyApiV1PlatformRolesGetResponse = Record<string, unknown>;

/** `GET /api/v1/pos-connectors` */
export type ListPosConnectorsApiV1PosConnectorsGetResponse = Record<string, unknown>;

/** `GET /api/v1/reports/types` */
export type ListReportTypesApiV1ReportsTypesGetResponse = Record<string, unknown>;

/** `GET /api/v1/reports/{report_id}` */
export type GenerateReportApiV1ReportsReportIdGetResponse = Record<string, unknown>;

/** `GET /api/v1/reports/{report_id}/export` */
export type ExportReportApiV1ReportsReportIdExportGetResponse = unknown;

/** `GET /api/v1/restaurants` */
export type ListRestaurantsApiV1RestaurantsGetResponse = Record<string, unknown>;

/** `POST /api/v1/restaurants` */
export type CreateRestaurantApiV1RestaurantsPostResponse = Record<string, unknown>;

/** `GET /api/v1/restaurants/{restaurant_id}` */
export type GetRestaurantApiV1RestaurantsRestaurantIdGetResponse = Record<string, unknown>;

/** `PATCH /api/v1/restaurants/{restaurant_id}` */
export type UpdateRestaurantApiV1RestaurantsRestaurantIdPatchResponse = Record<string, unknown>;

/** `GET /api/v1/status` */
export type StatusApiV1StatusGetResponse = Record<string, unknown>;

/** `GET /api/v1/users` */
export type ListUsersApiV1UsersGetResponse = Record<string, unknown>;

/** `GET /api/v1/wall/cameras` */
export type ListWallCamerasApiV1WallCamerasGetResponse = Record<string, unknown>;

/** `GET /api/v1/wall/cameras/{camera_id}` */
export type CameraDetailApiV1WallCamerasCameraIdGetResponse = Record<string, unknown>;

/** `GET /api/v1/wall/cameras/{camera_id}/stream.mjpg` */
export type StreamCameraApiV1WallCamerasCameraIdStreamMjpgGetResponse = unknown;

/** `POST /api/v1/wall/cameras/{camera_id}/ticket` */
export type IssueTicketApiV1WallCamerasCameraIdTicketPostResponse = Record<string, unknown>;

/** `GET /api/v1/zones` */
export type ListZonesApiV1ZonesGetResponse = Record<string, unknown>;

/** `POST /api/v1/zones` */
export type CreateZoneApiV1ZonesPostResponse = Record<string, unknown>;

/** `PATCH /api/v1/zones/{zone_id}` */
export type UpdateZoneApiV1ZonesZoneIdPatchResponse = Record<string, unknown>;

/** `GET /health` */
export type LivenessHealthGetResponse = Record<string, unknown>;

/** `GET /health/ready` */
export type ReadinessHealthReadyGetResponse = Record<string, unknown>;

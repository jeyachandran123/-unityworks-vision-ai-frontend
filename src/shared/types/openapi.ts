/**
 * GENERATED FILE — do not edit.
 *
 * Source: ../unityworks-vision-ai-backend/docs/api/openapi.json
 * Regenerate: npm run types:generate
 * Verify:     npm run types:check
 */

/* eslint-disable */

export const API_PATHS = [
  "/api/v1/audit",
  "/api/v1/auth/login",
  "/api/v1/auth/logout",
  "/api/v1/auth/me",
  "/api/v1/auth/refresh",
  "/api/v1/cameras",
  "/api/v1/cameras/{camera_key}",
  "/api/v1/cameras/{camera_key}/frames",
  "/api/v1/devtools/capabilities",
  "/api/v1/devtools/evidence/{blob_ref}",
  "/api/v1/devtools/live",
  "/api/v1/devtools/sessions",
  "/api/v1/devtools/state",
  "/api/v1/devtools/vision",
  "/api/v1/evidence/{evidence_ref}",
  "/api/v1/evidence/{evidence_ref}/image",
  "/api/v1/incidents",
  "/api/v1/incidents/{incident_id}",
  "/api/v1/incidents/{incident_id}/acknowledge",
  "/api/v1/incidents/{incident_id}/resolve",
  "/api/v1/status",
  "/api/v1/wall/cameras",
  "/api/v1/wall/cameras/{camera_id}",
  "/api/v1/wall/cameras/{camera_id}/stream.mjpg",
  "/api/v1/wall/cameras/{camera_id}/ticket",
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

/** `GET /api/v1/audit` */
export type ListAuditApiV1AuditGetResponse = Record<string, unknown>;

/** `POST /api/v1/auth/login` */
export type LoginApiV1AuthLoginPostResponse = Record<string, unknown>;

/** `POST /api/v1/auth/logout` */
export type LogoutApiV1AuthLogoutPostResponse = Record<string, unknown>;

/** `GET /api/v1/auth/me` */
export type MeApiV1AuthMeGetResponse = Record<string, unknown>;

/** `POST /api/v1/auth/refresh` */
export type RefreshApiV1AuthRefreshPostResponse = Record<string, unknown>;

/** `GET /api/v1/cameras` */
export type ListCamerasApiV1CamerasGetResponse = Record<string, unknown>;

/** `POST /api/v1/cameras` */
export type CreateCameraApiV1CamerasPostResponse = Record<string, unknown>;

/** `PATCH /api/v1/cameras/{camera_key}` */
export type UpdateCameraApiV1CamerasCameraKeyPatchResponse = Record<string, unknown>;

/** `GET /api/v1/cameras/{camera_key}/frames` */
export type ListFramesApiV1CamerasCameraKeyFramesGetResponse = Record<string, unknown>;

/** `GET /api/v1/devtools/capabilities` */
export type CapabilitiesApiV1DevtoolsCapabilitiesGetResponse = Record<string, unknown>;

/** `GET /api/v1/devtools/evidence/{blob_ref}` */
export type EvidenceApiV1DevtoolsEvidenceBlobRefGetResponse = Record<string, unknown>;

/** `GET /api/v1/devtools/live` */
export type LiveRuntimeApiV1DevtoolsLiveGetResponse = Record<string, unknown>;

/** `GET /api/v1/devtools/sessions` */
export type SessionsApiV1DevtoolsSessionsGetResponse = Record<string, unknown>;

/** `GET /api/v1/devtools/state` */
export type VisionStateApiV1DevtoolsStateGetResponse = Record<string, unknown>;

/** `GET /api/v1/devtools/vision` */
export type VisionDiagnosticsApiV1DevtoolsVisionGetResponse = Record<string, unknown>;

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

/** `GET /api/v1/status` */
export type StatusApiV1StatusGetResponse = Record<string, unknown>;

/** `GET /api/v1/wall/cameras` */
export type ListWallCamerasApiV1WallCamerasGetResponse = Record<string, unknown>;

/** `GET /api/v1/wall/cameras/{camera_id}` */
export type CameraDetailApiV1WallCamerasCameraIdGetResponse = Record<string, unknown>;

/** `GET /api/v1/wall/cameras/{camera_id}/stream.mjpg` */
export type StreamCameraApiV1WallCamerasCameraIdStreamMjpgGetResponse = unknown;

/** `POST /api/v1/wall/cameras/{camera_id}/ticket` */
export type IssueTicketApiV1WallCamerasCameraIdTicketPostResponse = Record<string, unknown>;

/** `GET /health` */
export type LivenessHealthGetResponse = Record<string, unknown>;

/** `GET /health/ready` */
export type ReadinessHealthReadyGetResponse = Record<string, unknown>;

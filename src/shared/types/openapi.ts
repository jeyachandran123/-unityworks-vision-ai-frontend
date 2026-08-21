/**
 * GENERATED FILE — do not edit.
 *
 * Source: ../unityworks-vision-ai-backend/docs/api/openapi.json
 * Regenerate: npm run types:generate
 * Verify:     npm run types:check
 */

/* eslint-disable */

export const API_PATHS = [
  "/api/v1/auth/login",
  "/api/v1/auth/logout",
  "/api/v1/auth/me",
  "/api/v1/auth/refresh",
  "/api/v1/devtools/capabilities",
  "/api/v1/devtools/evidence/{blob_ref}",
  "/api/v1/devtools/sessions",
  "/api/v1/devtools/state",
  "/api/v1/devtools/vision",
  "/api/v1/status",
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

/** `POST /api/v1/auth/login` */
export type LoginApiV1AuthLoginPostResponse = Record<string, unknown>;

/** `POST /api/v1/auth/logout` */
export type LogoutApiV1AuthLogoutPostResponse = Record<string, unknown>;

/** `GET /api/v1/auth/me` */
export type MeApiV1AuthMeGetResponse = Record<string, unknown>;

/** `POST /api/v1/auth/refresh` */
export type RefreshApiV1AuthRefreshPostResponse = Record<string, unknown>;

/** `GET /api/v1/devtools/capabilities` */
export type CapabilitiesApiV1DevtoolsCapabilitiesGetResponse = Record<string, unknown>;

/** `GET /api/v1/devtools/evidence/{blob_ref}` */
export type EvidenceApiV1DevtoolsEvidenceBlobRefGetResponse = Record<string, unknown>;

/** `GET /api/v1/devtools/sessions` */
export type SessionsApiV1DevtoolsSessionsGetResponse = Record<string, unknown>;

/** `GET /api/v1/devtools/state` */
export type VisionStateApiV1DevtoolsStateGetResponse = Record<string, unknown>;

/** `GET /api/v1/devtools/vision` */
export type VisionDiagnosticsApiV1DevtoolsVisionGetResponse = Record<string, unknown>;

/** `GET /api/v1/status` */
export type StatusApiV1StatusGetResponse = Record<string, unknown>;

/** `GET /health` */
export type LivenessHealthGetResponse = Record<string, unknown>;

/** `GET /health/ready` */
export type ReadinessHealthReadyGetResponse = Record<string, unknown>;

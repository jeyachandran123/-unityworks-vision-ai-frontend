/**
 * User management, role assignment, and permission-override administration.
 *
 * The Stage 5 backend surface at `/api/v1/admin/users` — eleven routes, all
 * `MANAGE_USERS`-gated and tenant-scoped server-side
 * (`app/api/user_administration.py`). This is a distinct client from
 * `organizationApi.users` in `observations.ts`, which stays pointed at the
 * older, read-only `GET /users` route unchanged (Stage 5 left that route in
 * place by design, and so does this stage — it is not retired here).
 *
 * ### `role_grants`
 *
 * Every row `permissions()` returns carries `role_grants`: whether the
 * user's role(s) alone, with no override applied, would already hold this
 * permission. It is what lets the UI show "the role says X, the override
 * changes it to Y" without re-deriving `ROLE_PERMISSIONS` client-side — a
 * table this frontend deliberately does not keep a copy of.
 */

import { api } from './client';

export type ScopeBreadth = 'none' | 'listed' | 'all_in_tenant';

/**
 * Which cameras an account reaches.
 *
 * Three states, never two. `none` and `all_in_tenant` must never be confusable,
 * which an empty list would make them — and the server treats an empty camera
 * tuple as *every* camera, so the confusion would fail open.
 */
export interface CameraScope {
  breadth: ScopeBreadth;
  camera_keys: string[];
  site_ids: string[];
}

export interface AdminUser {
  id: string;
  email: string;
  display_name: string;
  is_active: boolean;
  roles: string[];
  /**
   * The other half of access. A user with `view_live` and no camera grant
   * sees nothing; one with a tenant-wide grant sees every kitchen. It was
   * previously invisible to every administration screen, and accounts were
   * being created without one at all.
   */
  camera_scope: CameraScope;
  created_at: string | null;
  last_login_at: string | null;
  /**
   * Present only in the response to `create`, and only when no password was
   * supplied. Shown exactly once — the same "printed once, deliberately"
   * convention the backend module doc names — and never persisted by this
   * client.
   */
  generated_password?: string;
}

export interface AdminUserList {
  users: AdminUser[];
  count: number;
  total: number;
  limit: number;
  offset: number;
}

export interface UserQuery {
  q?: string;
  role?: string;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}

export type OverrideState = 'inherit' | 'grant' | 'revoke';

export interface PermissionRow {
  permission: string;
  state: OverrideState;
  /** Whether the user's role(s) alone grant this, before any override. */
  role_grants: boolean;
  effective: boolean;
}

export interface PermissionsResponse {
  user_id: string;
  permissions: PermissionRow[];
}

export interface SetOverrideResponse {
  permission: string;
  state: 'grant' | 'revoke';
  effective: boolean;
}

export interface ResetOverrideResponse {
  permission: string;
  state: 'inherit';
  effective: boolean;
}

export interface CreateUserDraft {
  email: string;
  display_name?: string;
  roles?: string[];
  /**
   * Required by the server, with no default — and that is the fix for a real
   * bug rather than an inconvenience. Accounts used to be created with no
   * camera grant at all, which reads as "no cameras": they signed in, held
   * every permission their role carried, and could reach nothing. Both
   * possible defaults are wrong, so the administrator says which.
   */
  camera_scope: { breadth: ScopeBreadth; camera_keys?: string[] };
  /** Omit to have the server generate one, returned once in the response. */
  password?: string;
}

export interface CameraScopeResponse {
  user_id: string;
  camera_scope: CameraScope;
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

export const adminUsersApi = {
  list: (params: UserQuery = {}) => api.get<AdminUserList>(`/admin/users${query({ ...params })}`),
  get: (userId: string) => api.get<AdminUser>(`/admin/users/${encodeURIComponent(userId)}`),
  create: (draft: CreateUserDraft) => api.post<AdminUser>('/admin/users', draft),
  updateDisplayName: (userId: string, displayName: string) =>
    api.patch<AdminUser>(`/admin/users/${encodeURIComponent(userId)}`, {
      display_name: displayName,
    }),
  activate: (userId: string) =>
    api.post<AdminUser>(`/admin/users/${encodeURIComponent(userId)}/activate`, undefined),
  deactivate: (userId: string) =>
    api.post<AdminUser>(`/admin/users/${encodeURIComponent(userId)}/deactivate`, undefined),
  assignRole: (userId: string, role: string) =>
    api.post<AdminUser>(`/admin/users/${encodeURIComponent(userId)}/roles`, { role }),
  removeRole: (userId: string, role: string) =>
    api.del<AdminUser>(
      `/admin/users/${encodeURIComponent(userId)}/roles/${encodeURIComponent(role)}`,
    ),
  permissions: (userId: string) =>
    api.get<PermissionsResponse>(`/admin/users/${encodeURIComponent(userId)}/permissions`),
  setOverride: (userId: string, permission: string, state: 'grant' | 'revoke') =>
    api.put<SetOverrideResponse>(
      `/admin/users/${encodeURIComponent(userId)}/permissions/${encodeURIComponent(permission)}`,
      { state },
    ),
  resetOverride: (userId: string, permission: string) =>
    api.del<ResetOverrideResponse>(
      `/admin/users/${encodeURIComponent(userId)}/permissions/${encodeURIComponent(permission)}`,
    ),

  cameraScope: (userId: string) =>
    api.get<CameraScopeResponse>(`/admin/users/${encodeURIComponent(userId)}/camera-scope`),
  setCameraScope: (
    userId: string,
    scope: { breadth: ScopeBreadth; camera_keys?: string[] },
  ) =>
    api.put<CameraScopeResponse>(`/admin/users/${encodeURIComponent(userId)}/camera-scope`, {
      camera_scope: scope,
    }),
};

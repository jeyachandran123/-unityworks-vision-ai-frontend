/**
 * Route guards and conditional rendering.
 *
 * **These are UX, not security.** They stop a user from reaching a page the
 * backend would refuse them anyway, and they keep the navigation honest. Every
 * protected endpoint is separately enforced server-side, and this application is
 * written on the assumption that anyone can bypass everything in this file.
 *
 * The guards read `GET /auth/me`. No role name is hardcoded into a condition —
 * a route declares the *permission* it needs, and the backend decides who holds
 * it.
 */

import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@app/auth/AuthProvider';
import { hasAll, hasAny, hasRole, type Permission, type Role } from './permissions';
import { LoadingState } from '@shared/ui/primitives';

/** Waits for the session restore, then admits or redirects to the login screen. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'restoring') {
    return <LoadingState label="Restoring session" />;
  }

  if (status === 'unauthenticated') {
    // The intended destination travels with the redirect so that signing in
    // lands where the user was going, not on a generic dashboard.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <Outlet />;
}

/**
 * Requires one or more permissions.
 *
 * `mode="all"` for routes that genuinely need several. The default is `any`,
 * because most routes have one sufficient permission.
 */
export function RequirePermission({
  permissions,
  mode = 'any',
  fallback = '/dashboard',
}: {
  permissions: Permission[];
  mode?: 'any' | 'all';
  fallback?: string;
}) {
  const { user } = useAuth();
  const allowed = mode === 'all' ? hasAll(user, permissions) : hasAny(user, permissions);

  // Redirect rather than render a 403 page. The navigation never offered this
  // route, so arriving here means a typed URL or a stale bookmark, and a
  // redirect to somewhere useful beats an accusatory dead end.
  return allowed ? <Outlet /> : <Navigate to={fallback} replace />;
}

export function RequireRole({ role, fallback = '/dashboard' }: { role: Role; fallback?: string }) {
  const { user } = useAuth();
  return hasRole(user, role) ? <Outlet /> : <Navigate to={fallback} replace />;
}

/**
 * Conditional rendering inside a page.
 *
 * For a button or panel that only some roles should see. Renders `fallback`
 * — usually nothing — rather than a disabled control, because a disabled
 * control advertises a capability the user cannot have.
 */
export function PermissionGate({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { user } = useAuth();
  return hasAny(user, [permission]) ? <>{children}</> : <>{fallback}</>;
}

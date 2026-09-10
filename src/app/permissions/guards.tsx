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
 * Requires that this session is *in* an organization before the application
 * loads.
 *
 * ### Where the routing rule actually lives
 *
 * Not here. The decision "does this person owe us a choice" is made once, by
 * the server, at login — `must_select` on the login response — and acted on
 * once, by the login screen, which sends them to `/platform` instead of
 * `/dashboard`. Putting it in a guard as well was tried and is wrong: a guard
 * that redirects whenever the account *could* choose has no way to know that it
 * just did, so choosing an organization bounces straight back to the chooser.
 *
 * What is left for a guard is the thing that is true for the whole life of the
 * session rather than for one navigation: the shell renders an organization's
 * application, so there has to be an organization. A session always has one
 * after login, so in practice this admits every time — it is the statement that
 * the shell has a precondition, and the safety net if a future path ever
 * produces a session without one.
 *
 * ### It is not a tenant boundary
 *
 * Like every other guard in this file, it is UX. The organization a session can
 * reach is the tenant claim inside its access token, checked against the
 * membership table on every single request. Editing your way past this
 * component gets you the application for exactly the organization your token
 * already named.
 */
export function RequireOrganization() {
  const { status, user } = useAuth();

  if (status === 'restoring') {
    return <LoadingState label="Restoring session" />;
  }

  return user?.tenant_id ? <Outlet /> : <Navigate to="/choose-organization" replace />;
}

/**
 * The chooser's own gate: it exists only for accounts with something to choose
 * between.
 *
 * A single-organization administrator who types the chooser's address is sent
 * to their Command Center rather than shown a page with one card on it. That is
 * the requirement stated from the other side — "do not force
 * single-organization users to select their organization" — and it has to be
 * enforced on the route as well as on the redirect, because a bookmark is not a
 * redirect.
 *
 * ### Membership count, not `mustSelect`
 *
 * `mustSelect` is true for a platform operator even when they belong to exactly
 * one organization, because the customers they administer are not the ones they
 * are a member of. That makes it the right signal for *where to send somebody
 * after login* and the wrong one for *may this page render*: an operator with
 * one membership has nothing to choose between here, and their destination is
 * the control plane. So this gate counts memberships, and sends an operator on
 * to the console rather than to a chooser with a single card.
 */
export function RequireChoosableOrganizations() {
  const { status, organizations, isPlatformOperator, organizationsResolved } = useAuth();

  // The list is empty until the server has answered, and a reload lands here
  // before it has. Redirecting on the unresolved value would bounce somebody
  // off the chooser they just reloaded — so wait for the answer.
  if (status === 'restoring' || !organizationsResolved) {
    return <LoadingState label="Restoring session" />;
  }

  if (organizations.length > 1) return <Outlet />;
  return <Navigate to={isPlatformOperator ? '/platform' : '/dashboard'} replace />;
}

/**
 * Requires a platform operator. The single door to the control plane.
 *
 * ### One gate on the group, not one per page
 *
 * Every other guard in this file declares a `Permission`, because every other
 * route belongs to an organization and permissions are what an organization
 * grants. The control plane has none: a `PlatformOperator` carries no
 * `Permission` and no tenant at all, deliberately, so that no role anywhere can
 * produce one. There is therefore nothing per-page to check — the question is
 * "is this account an operator", it is the same question on all seven pages,
 * and it is asked once here.
 *
 * ### The redirect is to the application, not to the login screen
 *
 * Somebody who reaches `/platform` without platform authority is not
 * unauthenticated and has done nothing wrong — most often they are a
 * multi-organization administrator who followed a stale link. They are sent to
 * their own Command Center, which is the same redirect-not-403 posture
 * `RequirePermission` takes.
 *
 * And, as with every guard here: this is UX. The server refuses all seven
 * endpoints for anyone who is not an operator, and would still refuse them if
 * this component were deleted.
 */
export function RequirePlatformOperator() {
  const { status, isPlatformOperator, organizationsResolved } = useAuth();

  // `isPlatformOperator` is `false` until the server has answered, and a reload
  // straight onto a platform URL lands here before it has. Redirecting on the
  // unresolved value would bounce an operator out of the console they just
  // reloaded.
  if (status === 'restoring' || !organizationsResolved) {
    return <LoadingState label="Restoring session" />;
  }

  return isPlatformOperator ? <Outlet /> : <Navigate to="/dashboard" replace />;
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

/**
 * "What may this account do?" — as a hook rather than only as a wrapper.
 *
 * `PermissionGate` covers showing or not showing a control, which is most
 * cases. It cannot answer the ones where the permission changes the *words*
 * rather than the presence of something: an empty list says "add the first
 * one" to somebody who can, and "nobody has added one yet" to somebody who
 * cannot, and both of those are a single sentence rather than two branches
 * worth wrapping.
 */
export function usePermissions() {
  const { user } = useAuth();
  return {
    has: (permission: Permission) => hasAny(user, [permission]),
    hasAny: (permissions: Permission[]) => hasAny(user, permissions),
    hasAll: (permissions: Permission[]) => hasAll(user, permissions),
  };
}

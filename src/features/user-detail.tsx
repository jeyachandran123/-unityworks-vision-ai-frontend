/**
 * One account, at its own address — `/admin/users/:userId`.
 *
 * Reached only by clicking a row on `/admin`'s Accounts table; there is no
 * nav entry, matching every other `:id` detail route in the product
 * (`/cameras/:cameraKey`, `/evidence/:evidenceRef`, `/incidents/:incidentId`).
 *
 * ### Four parts, ranked, not four equal cards
 *
 * Identity and account state carry the page's visual weight — they are the
 * first thing anyone lands here to check. Roles are secondary. The
 * permission-override table is its own, quieter, structured register: eleven
 * routes' worth of detail that would drown identity if it were given the same
 * weight, exactly the "wall of equal cards" the Stage 6 discovery report
 * warns against.
 *
 * ### Server-authoritative, always
 *
 * Every mutation here refetches from the server afterward rather than
 * predicting the result locally. A permission override is the one place in
 * this product where showing the *wrong* answer for half a second is worse
 * than showing nothing for half a second — `decide()` composes roles,
 * overrides and organization lifecycle together server-side, and this page
 * never re-derives that.
 *
 * ### Vocabulary
 *
 * `INHERIT`/`GRANT`/`REVOKE` are the backend's words. An operator reads
 * `Inherited` / `+ Added` / `− Restricted` instead — the labels the frozen
 * architecture document itself recommends. Every state carries its word, so
 * colour is never the only signal.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '@app/auth/AuthProvider';
import { PERMISSIONS, ROLES, roleLabel } from '@app/permissions/permissions';
import {
  adminUsersApi,
  type OverrideState,
  type PermissionRow,
  type ScopeBreadth,
} from '@shared/api/user-administration';
import { camerasApi } from '@shared/api/persistence';
import { CameraPicker, SCOPE_MEANING } from '@features/admin/people';
import { isApiError } from '@shared/api/errors';
import {
  Badge,
  Button,
  type Column,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  Select,
  StatusBadge,
} from '@shared/ui/primitives';
import { Figure, GoTo, PageIntro, Plane, Region, SectionRule } from '@shared/ui/product';

function Failed({ error }: { error: unknown }) {
  return (
    <ErrorState
      body={isApiError(error) ? error.message : 'The request did not complete.'}
      requestId={isApiError(error) ? error.requestId : undefined}
    />
  );
}

function when(iso: string | null): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString();
}

function permissionLabel(permission: string): string {
  const words = permission.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const STATE_WORD: Record<OverrideState, string> = {
  inherit: 'Inherited',
  grant: '+ Added',
  revoke: '− Restricted',
};

/**
 * Permission groups, derived from `Permission`'s own section comments in
 * `app/authorization/model.py` (identity/administration, observation
 * surfaces, sites/cameras, incidents, evidence/audit, reporting, product
 * modules with no data source yet, engineering) — not invented categories.
 * Exhaustive over every key in `PERMISSIONS`.
 */
const PERMISSION_GROUPS: ReadonlyArray<{ label: string; permissions: string[] }> = [
  {
    label: 'Identity & administration',
    permissions: [PERMISSIONS.manageOrganization, PERMISSIONS.manageUsers, PERMISSIONS.viewUsers],
  },
  {
    label: 'Observation surfaces',
    permissions: [
      PERMISSIONS.viewLive,
      PERMISSIONS.viewObservations,
      PERMISSIONS.viewEvidence,
      PERMISSIONS.viewCameraHealth,
    ],
  },
  { label: 'Sites & cameras', permissions: [PERMISSIONS.manageCameras, PERMISSIONS.viewCameras] },
  {
    label: 'Incidents',
    permissions: [
      PERMISSIONS.viewIncidents,
      PERMISSIONS.acknowledgeIncidents,
      PERMISSIONS.resolveIncidents,
    ],
  },
  { label: 'Evidence & audit', permissions: [PERMISSIONS.deleteEvidence, PERMISSIONS.viewAudit] },
  {
    label: 'Reporting',
    permissions: [PERMISSIONS.viewReports, PERMISSIONS.exportReports, PERMISSIONS.viewModelEvaluation],
  },
  {
    label: 'Product modules',
    permissions: [
      PERMISSIONS.viewPeopleCount,
      PERMISSIONS.viewDemography,
      PERMISSIONS.viewTableOccupancy,
      PERMISSIONS.manageTableOccupancy,
      PERMISSIONS.viewCuttingBoard,
      PERMISSIONS.manageCuttingBoard,
      PERMISSIONS.viewMealDetection,
      PERMISSIONS.viewPatronId,
      PERMISSIONS.managePatronId,
      PERMISSIONS.viewPosIntegration,
      PERMISSIONS.managePosIntegration,
    ],
  },
  { label: 'Engineering', permissions: [PERMISSIONS.accessDevtools, PERMISSIONS.registerDemand] },
];

/**
 * Roles that carry `MANAGE_USERS` or `MANAGE_ORGANIZATION` today
 * (`ROLE_PERMISSIONS`, `app/authorization/model.py`, confirmed by the Stage 5
 * report's own §12 investigation: exactly `super_admin` and `org_admin`).
 * Used only to decide whether removing a role needs confirmation — not a
 * general permission table, and not re-derived client-side, because the
 * frontend deliberately keeps no copy of `ROLE_PERMISSIONS` (Stage 6
 * discovery report §7). If the backend's role/permission mapping changes,
 * this constant must be revisited by hand.
 */
const ADMIN_CARRYING_ROLES = new Set<string>([ROLES.superAdmin, ROLES.orgAdmin]);

export function UserDetailPage() {
  const { userId = '' } = useParams();
  const client = useQueryClient();
  const { user: actor } = useAuth();

  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmRemoveRole, setConfirmRemoveRole] = useState<string | null>(null);
  const [pickedRole, setPickedRole] = useState('');

  const userQuery = useQuery({
    queryKey: ['admin-user', userId],
    queryFn: () => adminUsersApi.get(userId),
    enabled: userId.length > 0,
    retry: false,
  });

  const permsQuery = useQuery({
    queryKey: ['admin-user-permissions', userId],
    queryFn: () => adminUsersApi.permissions(userId),
    enabled: userId.length > 0,
    retry: false,
  });

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['admin-user', userId] });
    void client.invalidateQueries({ queryKey: ['admin-user-permissions', userId] });
    // The accounts list on `/admin` shows role and active-state too — kept in
    // step so navigating back never shows a stale row.
    void client.invalidateQueries({ queryKey: ['admin-users'] });
  };

  const activate = useMutation({
    mutationFn: () => adminUsersApi.activate(userId),
    onSuccess: refresh,
  });
  const deactivate = useMutation({
    mutationFn: () => adminUsersApi.deactivate(userId),
    onSuccess: () => {
      setConfirmDeactivate(false);
      refresh();
    },
  });
  const assignRole = useMutation({
    mutationFn: (role: string) => adminUsersApi.assignRole(userId, role),
    onSuccess: () => {
      setPickedRole('');
      refresh();
    },
  });
  const removeRole = useMutation({
    mutationFn: (role: string) => adminUsersApi.removeRole(userId, role),
    onSuccess: () => {
      setConfirmRemoveRole(null);
      refresh();
    },
  });
  const setOverride = useMutation({
    mutationFn: (vars: { permission: string; state: 'grant' | 'revoke' }) =>
      adminUsersApi.setOverride(userId, vars.permission, vars.state),
    onSuccess: refresh,
  });
  const resetOverride = useMutation({
    mutationFn: (permission: string) => adminUsersApi.resetOverride(userId, permission),
    onSuccess: refresh,
  });

  if (userQuery.isPending) return <LoadingState label="Loading account" />;

  if (userQuery.isError) {
    const notFound = isApiError(userQuery.error) && userQuery.error.kind === 'not_found';
    return (
      <>
        <PageIntro eyebrow="Platform · Administration" title="Account" />
        {notFound ? (
          <EmptyState
            title="No account with that id"
            body="It may have been removed, or it may belong to an organization this account does not reach."
          />
        ) : (
          <Failed error={userQuery.error} />
        )}
      </>
    );
  }

  const user = userQuery.data;
  const isSelf = Boolean(actor && actor.subject === user.email);
  const assignableRoles = Object.values(ROLES).filter((role) => !user.roles.includes(role));

  const rowsByPermission = new Map<string, PermissionRow>(
    (permsQuery.data?.permissions ?? []).map((row) => [row.permission, row]),
  );

  const addedCount = permsQuery.data?.permissions.filter((r) => r.state === 'grant').length ?? null;
  const restrictedCount =
    permsQuery.data?.permissions.filter((r) => r.state === 'revoke').length ?? null;

  return (
    <>
      <PageIntro
        eyebrow="Platform · Administration"
        title={user.display_name || user.email}
        standfirst={user.display_name ? user.email : undefined}
        meta={
          <>
            {user.is_active ? (
              <StatusBadge tone="online">Active</StatusBadge>
            ) : (
              <StatusBadge tone="idle">Disabled</StatusBadge>
            )}
            {user.roles.length === 0 ? (
              <Badge>no role assigned</Badge>
            ) : (
              user.roles.map((role) => <Badge key={role}>{roleLabel(role)}</Badge>)
            )}
          </>
        }
        actions={
          <Link to="/admin" style={{ textDecoration: 'none' }}>
            <GoTo>Back to Administration</GoTo>
          </Link>
        }
      />

      {/* ── Identity + Account (top weight) ── */}
      <SectionRule
        lead
        order={2}
        label="Identity & account"
        detail="Who this is, and whether they can sign in right now."
      />
      <Region order={2} style={{ marginBottom: 'var(--space-10)' }}>
        <Plane className="uwv-figure-row" style={{ alignSelf: 'start' }}>
          <Figure label="Email" scale="lead" value={user.email} detail="Signs in with this address" />
          <Figure
            label="Created"
            scale="quiet"
            value={when(user.created_at)}
            detail="When the account was created"
          />
          <Figure
            label="Last sign-in"
            scale="quiet"
            value={when(user.last_login_at)}
            detail="Most recent successful login"
          />
        </Plane>

        <div style={{ marginTop: 'var(--space-6)', display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          {user.is_active ? (
            <Button
              variant="danger"
              loading={deactivate.isPending}
              disabled={isSelf}
              onClick={() => setConfirmDeactivate(true)}
              title={isSelf ? 'You may not deactivate your own account' : undefined}
            >
              Deactivate
            </Button>
          ) : (
            <Button variant="primary" loading={activate.isPending} onClick={() => activate.mutate()}>
              Activate
            </Button>
          )}
          {isSelf ? (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)' }}>
              This is your own account. Its roles, overrides and activation state cannot be
              changed from here — the server refuses self-modification.
            </span>
          ) : null}
        </div>
        {deactivate.isError ? <Failed error={deactivate.error} /> : null}
        {activate.isError ? <Failed error={activate.error} /> : null}

        <Modal
          open={confirmDeactivate}
          onClose={() => setConfirmDeactivate(false)}
          title={`Deactivate ${user.email}?`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmDeactivate(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={deactivate.isPending}
                onClick={() => deactivate.mutate()}
              >
                Deactivate
              </Button>
            </>
          }
        >
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-secondary)' }}>
            This account will be signed out and refused login immediately. It can be undone by
            activating the account again, but if this is your organization's only administrator
            it may leave nobody able to reverse it — check before continuing.
          </p>
        </Modal>
      </Region>

      {/* ── Roles (secondary) ── */}
      <SectionRule
        order={3}
        label="Roles"
        detail="What this account is assigned. Removing a role only narrows what it can reach."
      />
      <Region order={3} style={{ marginBottom: 'var(--space-10)' }}>
        <Plane>
          {user.roles.length === 0 ? (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-tertiary)' }}>
              No role is assigned. This account holds no permission at all.
            </p>
          ) : (
            <ul style={{ display: 'grid', gap: 'var(--space-2)', listStyle: 'none' }}>
              {user.roles.map((role) => (
                <li
                  key={role}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 'var(--space-3)',
                  }}
                >
                  <Badge>{roleLabel(role)}</Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isSelf}
                    loading={removeRole.isPending && confirmRemoveRole === role}
                    onClick={() => {
                      if (ADMIN_CARRYING_ROLES.has(role)) {
                        setConfirmRemoveRole(role);
                      } else {
                        removeRole.mutate(role);
                      }
                    }}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {!isSelf && assignableRoles.length > 0 ? (
            <div
              style={{
                marginTop: 'var(--space-5)',
                display: 'flex',
                gap: 'var(--space-3)',
                alignItems: 'flex-end',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ minWidth: '14rem' }}>
                <Select
                  label="Assign a role"
                  value={pickedRole}
                  onChange={(event) => setPickedRole(event.target.value)}
                >
                  <option value="">Choose a role…</option>
                  {assignableRoles.map((role) => (
                    <option key={role} value={role}>
                      {roleLabel(role)}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                loading={assignRole.isPending}
                disabled={pickedRole.length === 0}
                onClick={() => assignRole.mutate(pickedRole)}
              >
                Assign
              </Button>
            </div>
          ) : null}
          {assignRole.isError ? <Failed error={assignRole.error} /> : null}
          {removeRole.isError ? <Failed error={removeRole.error} /> : null}
        </Plane>

        <Modal
          open={confirmRemoveRole !== null}
          onClose={() => setConfirmRemoveRole(null)}
          title={confirmRemoveRole ? `Remove ${roleLabel(confirmRemoveRole)}?` : 'Remove role?'}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmRemoveRole(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={removeRole.isPending}
                onClick={() => confirmRemoveRole && removeRole.mutate(confirmRemoveRole)}
              >
                Remove
              </Button>
            </>
          }
        >
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-secondary)' }}>
            {roleLabel(confirmRemoveRole ?? '')} carries administration-level access. Removing it
            may take away this account's ability to manage users or the organization's structure.
          </p>
        </Modal>
      </Region>

      {/* ── Camera access ──

          Its own section rather than a row in the permission table, because it
          is not a permission. Permissions say what kind of thing this account
          may do; this says which cameras those verbs reach. Holding
          `view_live` with no camera grant is a working account that sees a
          blank wall, and neither half explains that on its own. */}
      <SectionRule
        order={4}
        label="Camera access"
        detail="Which cameras this account can reach. Separate from permissions, and both are needed."
      />
      <Region order={4} style={{ marginBottom: 'var(--space-10)' }}>
        <Plane>
          <CameraAccess userId={user.id} scope={user.camera_scope} />
        </Plane>
      </Region>

      {/* ── Access (its own quieter register) ── */}
      <SectionRule
        order={5}
        label="Access"
        detail="Every permission, grouped by product area: whether the role grants it, any override, and the effective result."
      />
      <Region order={5}>
        {permsQuery.isPending ? (
          <LoadingState label="Loading access" />
        ) : permsQuery.isError ? (
          // Never guess. A failed permission read shows the error, not a
          // stale or assumed effective-access table.
          <Failed error={permsQuery.error} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--space-6)' }}>
            {/* Kept out of SectionRule's own `actions` slot: that row is
                `display: flex` with no wrap, sized for a single small `GoTo`
                link everywhere else it's used. Two `Figure`s with detail text
                don't shrink to fit beside it — at a narrow viewport the label
                column (which does shrink, via `minWidth: 0`) was squeezed
                toward zero instead, scrambling "Access" into single characters.
                `.uwv-figure-row` already wraps and shrinks correctly on its
                own; it just needed to not be fighting a non-wrapping row for
                space. */}
            <Plane className="uwv-figure-row" padded={false} style={{ background: 'transparent', border: 'none' }}>
              <Figure label="Added" scale="quiet" value={addedCount} detail="Permissions granted beyond the role" />
              <Figure
                label="Restricted"
                scale="quiet"
                value={restrictedCount}
                detail="Permissions revoked below the role"
              />
            </Plane>
            {PERMISSION_GROUPS.map((group) => {
              const rows = group.permissions
                .map((permission) => rowsByPermission.get(permission))
                .filter((row): row is PermissionRow => row !== undefined);
              if (rows.length === 0) return null;

              const columns: ReadonlyArray<Column<PermissionRow>> = [
                { key: 'permission', header: 'Permission', render: (r) => permissionLabel(r.permission) },
                {
                  key: 'role',
                  header: 'Role',
                  render: (r) => (
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)' }}>
                      {r.role_grants ? 'Role grants' : 'Role does not grant'}
                    </span>
                  ),
                  width: '10rem',
                },
                {
                  key: 'override',
                  header: 'Override',
                  render: (r) => (
                    <OverrideControl
                      row={r}
                      disabled={isSelf}
                      actorHoldsPermission={Boolean(actor?.permissions.includes(r.permission))}
                      pending={
                        (setOverride.isPending && setOverride.variables?.permission === r.permission) ||
                        (resetOverride.isPending && resetOverride.variables === r.permission)
                      }
                      onGrant={() => setOverride.mutate({ permission: r.permission, state: 'grant' })}
                      onRevoke={() => setOverride.mutate({ permission: r.permission, state: 'revoke' })}
                      onReset={() => resetOverride.mutate(r.permission)}
                    />
                  ),
                  width: '14rem',
                },
                {
                  key: 'effective',
                  header: 'Effective',
                  render: (r) => (
                    <StatusBadge tone={r.effective ? 'online' : 'idle'}>
                      {r.effective ? 'Effective' : 'Not effective'}
                    </StatusBadge>
                  ),
                  width: '9rem',
                },
              ];

              return (
                <div key={group.label}>
                  <h3
                    style={{
                      fontSize: 'var(--text-xs)',
                      fontWeight: 'var(--weight-medium)',
                      color: 'var(--ink-tertiary)',
                      textTransform: 'uppercase',
                      letterSpacing: 'var(--tracking-wide)',
                      marginBottom: 'var(--space-3)',
                    }}
                  >
                    {group.label}
                  </h3>
                  <Plane padded={false} style={{ overflow: 'hidden' }}>
                    <DataTable
                      columns={columns}
                      rows={rows}
                      rowKey={(row) => row.permission}
                      caption={`${group.label} permissions for ${user.email}`}
                    />
                  </Plane>
                </div>
              );
            })}
            {setOverride.isError ? <Failed error={setOverride.error} /> : null}
            {resetOverride.isError ? <Failed error={resetOverride.error} /> : null}
          </div>
        )}
      </Region>
    </>
  );
}

/**
 * Which cameras this account reaches, and changing it.
 *
 * Three states, never two. `none` and `all_in_tenant` must stay
 * distinguishable at every layer: the platform reads an empty camera list as
 * *every* camera, so a UI that collapsed "no cameras" into an empty selection
 * would fail open in the worst possible direction.
 */
function CameraAccess({
  userId,
  scope,
}: {
  userId: string;
  scope: { breadth: ScopeBreadth; camera_keys: string[] } | undefined;
}) {
  const client = useQueryClient();
  // A missing `camera_scope` reads as no cameras, which is exactly how the
  // server reads a missing grant row — the safe reading, and the only one that
  // cannot accidentally widen access. Defaulting to anything else here would
  // reintroduce the empty-list hazard on the client.
  const current = scope ?? { breadth: 'none' as ScopeBreadth, camera_keys: [] };
  const [breadth, setBreadth] = useState<ScopeBreadth>(current.breadth);
  const [chosen, setChosen] = useState<string[]>(current.camera_keys);

  const cameras = useQuery({ queryKey: ['cameras'], queryFn: camerasApi.list });

  const save = useMutation({
    mutationFn: () =>
      adminUsersApi.setCameraScope(
        userId,
        breadth === 'listed' ? { breadth, camera_keys: chosen } : { breadth },
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['admin-user', userId] });
      void client.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const changed =
    breadth !== current.breadth ||
    (breadth === 'listed' &&
      [...chosen].sort().join(',') !== [...current.camera_keys].sort().join(','));

  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '34rem' }}>
      {(['none', 'listed', 'all_in_tenant'] as const).map((option) => (
        <label
          key={option}
          style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}
        >
          <input
            type="radio"
            name="camera-breadth"
            checked={breadth === option}
            onChange={() => setBreadth(option)}
            style={{ marginTop: '0.3rem' }}
          />
          <span>
            <strong style={{ display: 'block' }}>
              {option === 'none'
                ? 'No cameras'
                : option === 'listed'
                  ? 'Specific cameras'
                  : 'All cameras'}
            </strong>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-tertiary)' }}>
              {SCOPE_MEANING[option]}
            </span>
          </span>
        </label>
      ))}

      {breadth === 'listed' ? (
        <CameraPicker
          cameras={cameras.data?.cameras ?? []}
          chosen={chosen}
          onChange={setChosen}
        />
      ) : null}

      <div>
        <Button loading={save.isPending} disabled={!changed} onClick={() => save.mutate()}>
          Save camera access
        </Button>
      </div>
      {save.isError ? <Failed error={save.error} /> : null}
    </div>
  );
}

function OverrideControl({
  row,
  disabled,
  actorHoldsPermission,
  pending,
  onGrant,
  onRevoke,
  onReset,
}: {
  row: PermissionRow;
  disabled: boolean;
  /** Mirrors the backend's own anti-escalation rule: a GRANT control is not
   * offered for a permission the acting admin does not themselves hold. */
  actorHoldsPermission: boolean;
  pending: boolean;
  onGrant: () => void;
  onRevoke: () => void;
  onReset: () => void;
}) {
  if (row.state !== 'inherit') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <Badge tone={row.state === 'grant' ? 'accent' : 'neutral'}>{STATE_WORD[row.state]}</Badge>
        <Button size="sm" variant="ghost" disabled={disabled} loading={pending} onClick={onReset}>
          Reset to inherited
        </Button>
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)' }}>
        {STATE_WORD.inherit}
      </span>
      {actorHoldsPermission ? (
        <Button size="sm" variant="ghost" disabled={disabled} loading={pending} onClick={onGrant}>
          + Add
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" disabled={disabled} loading={pending} onClick={onRevoke}>
        − Restrict
      </Button>
    </span>
  );
}

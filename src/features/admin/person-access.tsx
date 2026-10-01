/**
 * A person's access inside this organization — the access matrix, from the inside.
 *
 * The same grid as the platform console (`AccessMatrix`, `access-catalog.ts`,
 * `access-state.ts`), with two things only this side has:
 *
 * - **No organization to choose.** The tenant on the session is the only one
 *   there is, so the "Permissions for" row is not drawn.
 * - **You may only give what you hold.** Somebody administering people here can
 *   hold far less than an Organization Admin, so a box for a permission they do
 *   not hold is greyed until it is ticked — taking away is never restricted —
 *   and a role wider than theirs is listed but not offered. The server refuses
 *   the same things on save; this only says so before the click.
 *
 * Specific cameras are chosen here, because only the organization can see its
 * cameras to pick. The platform console offers None and All alone.
 */

import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@app/auth/AuthProvider';
import { ACCESS_CATALOG } from '@app/permissions/access-catalog';
import { roleLabel } from '@app/permissions/permissions';
import { camerasApi } from '@shared/api/persistence';
import type { OrganizationAccess, OrganizationAccessChange } from '@shared/api/platform';
import {
  adminRolesApi,
  adminUsersApi,
  type AdminUser,
  type TenantAccessChange,
  type TenantRole,
} from '@shared/api/user-administration';
import { Badge, Button, Input, LoadingState } from '@shared/ui/primitives';
import { Plane, SectionRule } from '@shared/ui/product';
import { AccessMatrix } from '@features/platform/AccessMatrix';
import { AccessReview, Controls, Stepper } from '@features/platform/PersonAccess';
import {
  blankDraft,
  changesFrom,
  draftFrom,
  setCameraKeys,
  ticksBySection,
  type CanGrant,
  type OrganizationDraft,
} from '@features/platform/access-state';

import { Failed } from './shared';

/* ── shared pieces ────────────────────────────────────────────────────────── */

/** Only what the signed-in administrator holds may be given. */
function useCanGrant(): CanGrant {
  const { user } = useAuth();
  const held = useMemo(() => new Set(user?.permissions ?? []), [user]);
  return useCallback((permission: string) => held.has(permission), [held]);
}

/** The "Specific cameras" list, drawn under the grid when that choice is made. */
function useCameraPicker(onChange: (next: OrganizationDraft) => void) {
  const cameras = useQuery({ queryKey: ['cameras'], queryFn: camerasApi.list });
  return (draft: OrganizationDraft) => (
    <CameraPicker
      cameras={cameras.data?.cameras ?? []}
      chosen={draft.cameraKeys}
      onChange={(keys) => onChange(setCameraKeys(draft, keys))}
    />
  );
}

/** An empty specific list is ambiguous — the platform reads it as every camera. */
function camerasIncomplete(draft: OrganizationDraft | undefined): boolean {
  return draft?.cameras === 'listed' && draft.cameraKeys.length === 0;
}

/** The organization is the caller's own and is never sent. */
function toTenantChange({
  organization_id: _organization,
  ...change
}: OrganizationAccessChange): TenantAccessChange {
  return change;
}

function cameraWord(draft: OrganizationDraft): string {
  if (draft.cameras === 'all_in_tenant') return 'All cameras';
  if (draft.cameras === 'listed') return `Specific cameras (${draft.cameraKeys.length})`;
  return 'No cameras';
}

/**
 * Picking cameras by name, grouped by nothing clever.
 *
 * Deliberately the camera's own name and key rather than an id: an
 * administrator choosing who may watch the kitchen line knows it as "Kitchen
 * line", and a UUID would make this step unusable in exactly the way the old
 * forms were.
 */
export function CameraPicker({
  cameras,
  chosen,
  onChange,
}: {
  cameras: ReadonlyArray<{ camera_key: string; name: string }>;
  chosen: string[];
  onChange: (next: string[]) => void;
}) {
  if (cameras.length === 0) {
    return (
      <p style={{ margin: 0, color: 'var(--ink-tertiary)', fontSize: 'var(--text-sm)' }}>
        This organization has no cameras yet, so there are none to choose.
      </p>
    );
  }

  return (
    <fieldset
      style={{
        border: '1px solid var(--line-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)',
        margin: 0,
        display: 'grid',
        gap: 'var(--space-2)',
        maxHeight: '18rem',
        overflowY: 'auto',
      }}
    >
      <legend style={{ padding: '0 var(--space-2)', fontSize: 'var(--text-sm)' }}>
        Which cameras
      </legend>
      {cameras.map((camera) => (
        <label
          key={camera.camera_key}
          style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}
        >
          <input
            type="checkbox"
            checked={chosen.includes(camera.camera_key)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...chosen, camera.camera_key]
                  : chosen.filter((key) => key !== camera.camera_key),
              )
            }
          />
          <span>
            {camera.name} <Badge>{camera.camera_key}</Badge>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/* ── one person's access ──────────────────────────────────────────────────── */

/**
 * The Access section of a person's page: Permissions → Review & Submit.
 *
 * Remounted only by a save. Keyed on anything the query owns, a background
 * refetch would throw away what was being ticked.
 */
export function PersonAccessPanel({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const [version, setVersion] = useState(0);
  const [saved, setSaved] = useState(false);
  const access = useQuery({
    queryKey: ['admin-user-access', userId],
    queryFn: () => adminUsersApi.access(userId),
    enabled: !isSelf && userId.length > 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const roles = useQuery({ queryKey: ['admin-roles'], queryFn: adminRolesApi.list });

  if (isSelf) {
    return (
      <Plane>
        <p style={{ margin: 0 }}>
          This is your own account, and you cannot change your own access — somebody else who
          manages people here can. The server refuses self-modification, whatever this page shows.
        </p>
      </Plane>
    );
  }
  if (access.isLoading || roles.isLoading) return <LoadingState label="Reading access" />;
  // A failed *background* refetch keeps its data; only a read that never
  // succeeded replaces the editor — never a guessed grid.
  if (!access.data || !roles.data) return <Failed error={access.error ?? roles.error} />;

  return (
    <>
      {saved ? (
        <p role="status" style={{ marginTop: 0 }}>
          Access saved. It takes effect on their next request.
        </p>
      ) : null}
      <AccessEditor
        key={version}
        access={access.data}
        roles={roles.data.roles}
        userId={userId}
        onSaved={() => {
          setSaved(true);
          setVersion((current) => current + 1);
        }}
      />
    </>
  );
}

function AccessEditor({
  access,
  roles,
  userId,
  onSaved,
}: {
  access: OrganizationAccess;
  roles: TenantRole[];
  userId: string;
  onSaved: () => void;
}) {
  const client = useQueryClient();
  const loaded = useMemo(() => [draftFrom(access)], [access]);
  const [drafts, setDrafts] = useState(loaded);
  const [step, setStep] = useState(0);
  const canGrant = useCanGrant();
  const replace = (next: OrganizationDraft) => setDrafts([next]);
  const cameraPicker = useCameraPicker(replace);
  const changes = changesFrom(loaded, drafts);

  const save = useMutation({
    mutationFn: () => {
      const [change] = changes;
      if (!change) throw new Error('nothing to save');
      return adminUsersApi.setAccess(userId, toTenantChange(change));
    },
    onSuccess: (next) => {
      // The server's answer first, then the remount that reads it.
      client.setQueryData(['admin-user-access', userId], next);
      void client.invalidateQueries({ queryKey: ['admin-user', userId] });
      void client.invalidateQueries({ queryKey: ['admin-users'] });
      onSaved();
    },
  });

  return (
    <>
      <Stepper steps={['Permissions', 'Review & Submit']} current={step} />
      <Plane>
        {step === 0 ? (
          <>
            <AccessMatrix
              drafts={drafts}
              roles={roles}
              onChange={replace}
              showOrganizations={false}
              canGrant={canGrant}
              cameraPicker={cameraPicker}
            />
            <Controls>
              <span />
              <Button
                variant="primary"
                disabled={camerasIncomplete(drafts[0])}
                onClick={() => setStep(1)}
              >
                Next: Review
              </Button>
            </Controls>
          </>
        ) : (
          <>
            <AccessReview drafts={drafts} changes={changes} />
            {save.isError ? <Failed error={save.error} /> : null}
            <Controls>
              <Button onClick={() => setStep(0)}>Back</Button>
              <Button
                variant="primary"
                loading={save.isPending}
                disabled={changes.length === 0}
                onClick={() => save.mutate()}
              >
                Save access
              </Button>
            </Controls>
          </>
        )}
      </Plane>
    </>
  );
}

/* ── adding somebody ──────────────────────────────────────────────────────── */

const ADD_STEPS = ['Account Details', 'Permissions', 'Review & Submit'];

/**
 * Account Details → Permissions → Review & Submit, inside this organization.
 *
 * The password is optional: left empty, the server generates one and returns
 * it once, and this flow shows it once. It is deliberately not closed on
 * success — unmounting the moment the account exists would destroy the only
 * copy anyone will ever see. The person closes it when they have it.
 */
export function AddPersonFlow({
  onCreated,
  onClose,
}: {
  onCreated: () => void;
  onClose: () => void;
}) {
  const { user, activeOrganization } = useAuth();
  const baseline = useMemo(
    () => [blankDraft(user?.tenant_id ?? '', activeOrganization?.name ?? 'This organization')],
    [user?.tenant_id, activeOrganization?.name],
  );
  const [drafts, setDrafts] = useState(baseline);
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [created, setCreated] = useState<AdminUser | null>(null);

  const roles = useQuery({ queryKey: ['admin-roles'], queryFn: adminRolesApi.list });
  const canGrant = useCanGrant();
  const replace = (next: OrganizationDraft) => setDrafts([next]);
  const cameraPicker = useCameraPicker(replace);
  const draft = drafts[0];

  const create = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error('no access drafted');
      return adminUsersApi.create({
        email: email.trim(),
        display_name: displayName.trim() || undefined,
        password: password.trim() || undefined,
        role: draft.role,
        permissions: draft.permissions,
        camera_scope:
          draft.cameras === 'listed'
            ? { breadth: 'listed', camera_keys: draft.cameraKeys }
            : { breadth: draft.cameras },
      });
    },
    onSuccess: (person) => {
      setCreated(person);
      onCreated();
    },
  });

  const restart = () => {
    setCreated(null);
    setStep(0);
    setEmail('');
    setDisplayName('');
    setPassword('');
    setDrafts(baseline);
  };

  if (created) {
    return (
      <>
        <SectionRule lead label="Account created" />
        <Plane>
          <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '34rem' }}>
            <p style={{ margin: 0 }}>
              <strong>{created.display_name || created.email}</strong> can now sign in.
            </p>
            {created.generated_password ? (
              <div
                style={{
                  display: 'grid',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-4)',
                  border: '1px solid var(--line-default)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <strong>Their password — shown once</strong>
                <code style={{ fontSize: 'var(--text-lg)', wordBreak: 'break-all' }}>
                  {created.generated_password}
                </code>
                <span style={{ color: 'var(--ink-tertiary)', fontSize: 'var(--text-sm)' }}>
                  This is the only time it is shown. It is not stored anywhere this screen can
                  reach, and leaving the page loses it. Give it to them over something other than
                  email.
                </span>
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <Link to={`/admin/people/${encodeURIComponent(created.id)}`}>
                <Button variant="secondary">Open their profile</Button>
              </Link>
              <Button variant="ghost" onClick={restart}>
                Add another
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        </Plane>
      </>
    );
  }

  return (
    <>
      <SectionRule
        lead
        label="Add a person"
        detail="Their account, then what they may do here, then a last look before it is created."
      />
      <Stepper steps={ADD_STEPS} current={step} />
      <Plane>
        {step === 0 ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (email.includes('@')) setStep(1);
            }}
            style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '32rem' }}
          >
            <Input
              label="Email"
              type="email"
              hint="How they sign in. Unique across UnityWorks."
              // Somebody else's account is being created: a browser must not
              // fill in the administrator's own saved login.
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoFocus
            />
            <Input
              label="Name"
              hint="Optional. Shown instead of the email wherever there is room."
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
            <Input
              label="Password"
              type="password"
              hint="Leave empty and one will be generated and shown to you once."
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Controls>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={!email.includes('@')}>
                Next: Permissions
              </Button>
            </Controls>
          </form>
        ) : null}

        {step === 1 ? (
          roles.data ? (
            <>
              <AccessMatrix
                drafts={drafts}
                roles={roles.data.roles}
                onChange={replace}
                showOrganizations={false}
                canGrant={canGrant}
                cameraPicker={cameraPicker}
              />
              <Controls>
                <Button onClick={() => setStep(0)}>Back</Button>
                <Button
                  variant="primary"
                  disabled={camerasIncomplete(draft)}
                  onClick={() => setStep(2)}
                >
                  Next: Review
                </Button>
              </Controls>
            </>
          ) : roles.isError ? (
            <Failed error={roles.error} />
          ) : (
            <LoadingState label="Reading roles" />
          )
        ) : null}

        {step === 2 && draft ? (
          <>
            <dl
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, auto) minmax(0, 1fr)',
                gap: 'var(--space-3) var(--space-6)',
                margin: 0,
                maxWidth: '40rem',
              }}
            >
              {[
                ['Email', email.trim()],
                ['Name', displayName.trim() || '—'],
                ['Password', password.trim() ? 'Set by you' : 'Generated, shown once'],
                ['Starts from', draft.role ? roleLabel(draft.role) : 'No role'],
                ['Cameras', cameraWord(draft)],
                [
                  'Permissions',
                  `${draft.permissions.length} — ${ticksBySection(draft, ACCESS_CATALOG)
                    .map((s) => `${s.label} ${s.count}`)
                    .join(' · ')}`,
                ],
              ].map(([term, value]) => (
                <div key={term} style={{ display: 'contents' }}>
                  <dt style={{ color: 'var(--ink-tertiary)', fontSize: 'var(--text-sm)' }}>{term}</dt>
                  <dd style={{ margin: 0 }}>{value}</dd>
                </div>
              ))}
            </dl>
            {draft.permissions.length === 0 ? (
              <p style={{ marginBottom: 0, color: 'var(--ink-tertiary)', fontSize: 'var(--text-sm)' }}>
                Nothing is ticked. The account will exist and be able to sign in, and will reach
                nothing until somebody gives it access.
              </p>
            ) : null}
            {create.isError ? <Failed error={create.error} /> : null}
            <Controls>
              <Button onClick={() => setStep(1)}>Back</Button>
              <Button variant="primary" loading={create.isPending} onClick={() => create.mutate()}>
                Create person
              </Button>
            </Controls>
          </>
        ) : null}
      </Plane>
    </>
  );
}

/**
 * People — who works here, and what they can reach.
 *
 * ### Creating an account is a guided flow because it has two halves
 *
 * An account's reach is *roles* and *camera scope*, and the second was
 * invisible in every previous screen. That was not cosmetic: accounts were
 * being created with no camera grant at all, which reads as "no cameras" — so
 * they signed in, held every permission their role carried, and could see
 * nothing. Nothing anywhere reported it.
 *
 * So camera access is a step of its own with no default. Both candidate
 * defaults are wrong — "none" recreates the unusable account, "all" creates an
 * over-privileged one — which is exactly why the administrator has to say.
 *
 * ### The generated password is shown once
 *
 * When no password is supplied the server generates one and returns it in the
 * creation response only. It is never stored by this client and never fetched
 * again, so the screen that shows it says plainly that this is the only time.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import {
  adminUsersApi,
  type AdminUser,
  type ScopeBreadth,
} from '@shared/api/user-administration';
import { camerasApi } from '@shared/api/persistence';
import { PERMISSIONS, ROLES, roleLabel } from '@app/permissions/permissions';
import { PermissionGate, usePermissions } from '@app/permissions/guards';
import {
  Badge,
  Button,
  type Column,
  DataTable,
  EmptyState,
  Input,
  LoadingState,
  Select,
  StatusBadge,
} from '@shared/ui/primitives';
import { PageIntro, Plane, Region, SectionRule } from '@shared/ui/product';

import { Failed, Pager, SearchField, useDebounced, when } from './shared';

const PAGE = 25;

/** What a camera scope means, in words. Used wherever one is shown or chosen. */
export const SCOPE_MEANING: Record<ScopeBreadth, string> = {
  none: 'No cameras. This account can sign in and use everything its role allows that does not involve video.',
  listed: 'Only the cameras named below.',
  all_in_tenant: 'Every camera in this organization, including ones added later.',
};

export function PeoplePage() {
  const { has } = usePermissions();
  const client = useQueryClient();

  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [showing, setShowing] = useState<'all' | 'active' | 'inactive'>('all');
  const [offset, setOffset] = useState(0);
  const [adding, setAdding] = useState(false);
  const q = useDebounced(search);

  const params = useMemo(
    () => ({
      q: q.trim() || undefined,
      role: role || undefined,
      is_active: showing === 'all' ? undefined : showing === 'active',
      limit: PAGE,
      offset,
    }),
    [q, role, showing, offset],
  );

  const people = useQuery({
    queryKey: ['admin-users', params],
    queryFn: () => adminUsersApi.list(params),
  });

  const columns: ReadonlyArray<Column<AdminUser>> = [
    {
      key: 'name',
      header: 'Person',
      render: (user) => (
        <Link to={`/admin/people/${encodeURIComponent(user.id)}`}>
          {user.display_name || user.email}
        </Link>
      ),
    },
    { key: 'email', header: 'Email', render: (user) => user.email },
    {
      key: 'roles',
      header: 'Roles',
      render: (user) =>
        user.roles.length === 0 ? (
          <span style={{ color: 'var(--text-muted)' }}>None</span>
        ) : (
          <span style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {user.roles.map((held) => (
              <Badge key={held}>{roleLabel(held)}</Badge>
            ))}
          </span>
        ),
    },
    {
      key: 'cameras',
      header: 'Cameras',
      render: (user) => <ScopeSummary scope={user.camera_scope} />,
    },
    {
      key: 'status',
      header: 'Account',
      render: (user) => (
        <StatusBadge tone={user.is_active ? 'online' : 'offline'}>
          {user.is_active ? 'Active' : 'Deactivated'}
        </StatusBadge>
      ),
    },
    { key: 'seen', header: 'Last signed in', render: (user) => when(user.last_login_at) },
  ];

  return (
    <>
      <PageIntro
        eyebrow="organization"
        title="People"
        standfirst="Everyone with an account here, the roles they hold, and the cameras they can reach."
        actions={
          <PermissionGate permission={PERMISSIONS.manageUsers}>
            <Button onClick={() => setAdding((open) => !open)}>
              {adding ? 'Cancel' : 'Add a person'}
            </Button>
          </PermissionGate>
        }
      />

      {adding ? (
        <Region order={2}>
          {/* Deliberately not closed on success. The generated password is
              shown exactly once and is never fetched again, so unmounting the
              flow the moment the account exists would destroy the only copy
              anyone will ever see. The person closes it when they have it. */}
          <AddPerson
            onCreated={() => void client.invalidateQueries({ queryKey: ['admin-users'] })}
            onClose={() => setAdding(false)}
          />
        </Region>
      ) : null}

      <Region order={adding ? 3 : 2}>
        <SectionRule
          lead
          label="People"
          detail={people.data ? `${people.data.total} in this organization` : 'Reading the roster'}
          actions={
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-3)',
                alignItems: 'flex-end',
                flexWrap: 'wrap',
              }}
            >
              <SearchField
                label="Search"
                value={search}
                placeholder="Name or email"
                onChange={(next) => {
                  setSearch(next);
                  setOffset(0);
                }}
              />
              <Select
                label="Role"
                value={role}
                onChange={(event) => {
                  setRole(event.target.value);
                  setOffset(0);
                }}
              >
                <option value="">Any role</option>
                {Object.values(ROLES).map((value) => (
                  <option key={value} value={value}>
                    {roleLabel(value)}
                  </option>
                ))}
              </Select>
              <Select
                label="Account"
                value={showing}
                onChange={(event) => {
                  setShowing(event.target.value as typeof showing);
                  setOffset(0);
                }}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Deactivated</option>
              </Select>
            </div>
          }
        />
        <Plane>
          {people.isLoading ? <LoadingState label="Reading people" /> : null}
          {people.isError ? <Failed error={people.error} /> : null}
          {people.data ? (
            <>
              <DataTable
                caption="People in this organization"
                columns={columns}
                rows={people.data.users}
                rowKey={(user) => user.id}
                empty={
                  <EmptyState
                    title="Nobody matches"
                    body={
                      has(PERMISSIONS.manageUsers)
                        ? 'Try clearing the filters, or add someone.'
                        : 'Try clearing the filters.'
                    }
                  />
                }
              />
              <Pager
                noun="people"
                offset={people.data.offset}
                limit={people.data.limit}
                total={people.data.total}
                count={people.data.count}
                onOffset={setOffset}
              />
            </>
          ) : null}
        </Plane>
      </Region>
    </>
  );
}

/** A camera scope, in one short phrase. Never a bare number. */
export function ScopeSummary({
  scope,
}: {
  scope: { breadth: ScopeBreadth; camera_keys: string[] } | undefined;
}) {
  // A missing scope reads as none — the same reading the server gives a
  // missing grant row, and the only one that cannot accidentally widen access.
  if (!scope) return <span style={{ color: 'var(--text-muted)' }}>None</span>;
  if (scope.breadth === 'all_in_tenant') return <>All cameras</>;
  if (scope.breadth === 'listed') {
    return (
      <>
        {scope.camera_keys.length} camera{scope.camera_keys.length === 1 ? '' : 's'}
      </>
    );
  }
  return <span style={{ color: 'var(--text-muted)' }}>None</span>;
}

/* ── adding somebody ──────────────────────────────────────────────────────── */

const ADD_STEPS = ['Identity', 'Role', 'Cameras', 'Review'] as const;
type AddStep = (typeof ADD_STEPS)[number];

function AddPerson({
  onCreated,
  onClose,
}: {
  onCreated: () => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<AddStep>('Identity');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [breadth, setBreadth] = useState<ScopeBreadth>('none');
  const [chosen, setChosen] = useState<string[]>([]);
  const [created, setCreated] = useState<AdminUser | null>(null);

  const cameras = useQuery({ queryKey: ['cameras'], queryFn: camerasApi.list });

  const create = useMutation({
    mutationFn: () =>
      adminUsersApi.create({
        email: email.trim(),
        display_name: displayName.trim() || undefined,
        roles,
        camera_scope:
          breadth === 'listed' ? { breadth, camera_keys: chosen } : { breadth },
        password: password.trim() || undefined,
      }),
    onSuccess: (user) => {
      setCreated(user);
      onCreated();
    },
  });

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
                <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
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
              <Button variant="ghost" onClick={() => setCreated(null)}>
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

  const index = ADD_STEPS.indexOf(step);
  const canAdvance =
    step === 'Identity'
      ? email.includes('@')
      : step === 'Cameras'
        ? breadth !== 'listed' || chosen.length > 0
        : true;

  return (
    <>
      <SectionRule
        lead
        label="Add a person"
        detail="Four steps. An account that exists but cannot reach anything is worse than no account."
      />
      <Plane>
        <ol
          aria-label="Progress"
          style={{
            display: 'flex',
            gap: 'var(--space-5)',
            listStyle: 'none',
            margin: '0 0 var(--space-6)',
            padding: 0,
            flexWrap: 'wrap',
          }}
        >
          {ADD_STEPS.map((name, position) => (
            <li
              key={name}
              aria-current={position === index ? 'step' : undefined}
              style={{
                display: 'flex',
                gap: 'var(--space-2)',
                fontSize: 'var(--text-sm)',
                color: position > index ? 'var(--text-muted)' : 'var(--text-primary)',
              }}
            >
              <span
                aria-hidden
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: position === index ? 'var(--accent)' : 'var(--text-muted)',
                }}
              >
                {position + 1}
              </span>
              {name}
            </li>
          ))}
        </ol>

        {step === 'Identity' ? (
          <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '32rem' }}>
            <Input
              label="Email"
              type="email"
              hint="How they sign in. Unique within this organization."
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
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />
          </div>
        ) : null}

        {step === 'Role' ? (
          <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '34rem' }}>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
              A role is a starting point, not a cage. Two people on the same role can differ —
              add or remove individual permissions from their profile afterwards.
            </p>
            {Object.values(ROLES).map((value) => (
              <label
                key={value}
                style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}
              >
                <input
                  type="checkbox"
                  checked={roles.includes(value)}
                  onChange={(event) =>
                    setRoles((current) =>
                      event.target.checked
                        ? [...current, value]
                        : current.filter((held) => held !== value),
                    )
                  }
                />
                {roleLabel(value)}
              </label>
            ))}
            {roles.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                No role selected. The account will exist and be able to sign in, and will reach
                nothing until a role or an individual permission is granted.
              </p>
            ) : null}
          </div>
        ) : null}

        {step === 'Cameras' ? (
          <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '34rem' }}>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
              Separate from roles, and it has no default on purpose. A permission to view live
              video reaches nothing without this, and this reaches nothing without that
              permission.
            </p>
            {(['none', 'listed', 'all_in_tenant'] as const).map((option) => (
              <label
                key={option}
                style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}
              >
                <input
                  type="radio"
                  name="breadth"
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
                  <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
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
          </div>
        ) : null}

        {step === 'Review' ? (
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, auto) minmax(0, 1fr)',
              gap: 'var(--space-3) var(--space-6)',
              margin: 0,
              maxWidth: '34rem',
            }}
          >
            {[
              ['Email', email.trim()],
              ['Name', displayName.trim() || '—'],
              ['Password', password.trim() ? 'Set by you' : 'Generated, shown once'],
              ['Roles', roles.length ? roles.map(roleLabel).join(', ') : 'None'],
              [
                'Cameras',
                breadth === 'listed' ? `${chosen.length} named` : SCOPE_MEANING[breadth],
              ],
            ].map(([term, value]) => (
              <div key={term} style={{ display: 'contents' }}>
                <dt style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>{term}</dt>
                <dd style={{ margin: 0 }}>{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            marginTop: 'var(--space-6)',
            flexWrap: 'wrap',
          }}
        >
          <Button
            variant="ghost"
            disabled={index === 0}
            onClick={() => setStep(ADD_STEPS[index - 1] ?? 'Identity')}
          >
            Back
          </Button>
          {step === 'Review' ? (
            <Button disabled={create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? 'Creating…' : 'Create account'}
            </Button>
          ) : (
            <Button
              disabled={!canAdvance}
              onClick={() => setStep(ADD_STEPS[index + 1] ?? 'Review')}
            >
              Continue
            </Button>
          )}
        </div>

        {create.isError ? (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Failed error={create.error} />
          </div>
        ) : null}
      </Plane>
    </>
  );
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
      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
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

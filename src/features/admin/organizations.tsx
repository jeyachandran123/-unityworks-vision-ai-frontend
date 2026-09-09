/**
 * The platform-operator console — organizations, and their lifecycle.
 *
 * ### Why this is not "the admin page for super admins"
 *
 * Every other surface in this application belongs to *one organisation*. This
 * one is above them, and the account that reaches it is a different kind of
 * principal, not a more powerful role. A tenant `super_admin` holds every
 * permission there is and cannot open this page — the server does not check a
 * permission here, it checks whether the account is a platform operator, which
 * no role can confer.
 *
 * Which is why the surface looks different rather than merely deeper. Mixing
 * it into `/admin` would say the two are the same kind of authority, and the
 * entire multi-tenant boundary rests on their not being.
 *
 * ### Suspension and archival are not settings
 *
 * They stop a paying customer's product working, so both demand a written
 * reason before the button does anything, and both stop the customer's cameras
 * in the same request. The page reports how many actually stopped, because
 * "the status field says suspended" and "the cameras are off" are different
 * facts and only the second one matters.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, Link, useNavigate } from 'react-router-dom';

import { useAuth } from '@app/auth/AuthProvider';
import { isApiError } from '@shared/api/errors';

import {
  platformAdminApi,
  platformApi,
  STATUS_MEANING,
  type Organization,
  type OrganizationStatus,
} from '@shared/api/platform';
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
import { Figure, PageIntro, Plane, Region, SectionRule } from '@shared/ui/product';

import { DangerConfirm, Failed, SearchField, useDebounced, when, whenExact } from './shared';

const TONE: Record<OrganizationStatus, 'online' | 'degraded' | 'offline'> = {
  active: 'online',
  suspended: 'degraded',
  archived: 'offline',
};

const LABEL: Record<OrganizationStatus, string> = {
  active: 'Active',
  suspended: 'Suspended',
  archived: 'Archived',
};

/**
 * Is this account a platform operator?
 *
 * A 403 is the answer "no", not a failure — so this never retries and never
 * surfaces an error. There is no permission to check instead: operator status
 * is deliberately not expressible as one.
 */
export function useIsOperator() {
  const query = useQuery({
    queryKey: ['platform-me'],
    queryFn: platformApi.me,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  return { isOperator: query.isSuccess, settled: !query.isLoading };
}

export function OrganizationsPage() {
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | OrganizationStatus>('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const q = useDebounced(search);

  const params = useMemo(
    () => ({ q: q.trim() || undefined, status: status || undefined, limit: 100 }),
    [q, status],
  );

  const organizations = useQuery({
    queryKey: ['organizations', params],
    queryFn: () => platformApi.organizations(params),
  });

  const create = useMutation({
    mutationFn: () => platformApi.create({ name: name.trim() }),
    onSuccess: () => {
      setName('');
      setAdding(false);
      void client.invalidateQueries({ queryKey: ['organizations'] });
    },
  });

  const columns: ReadonlyArray<Column<Organization>> = [
    {
      key: 'name',
      header: 'Organisation',
      render: (organization) => (
        <Link to={`/platform/organizations/${encodeURIComponent(organization.id)}`}>
          {organization.name}
        </Link>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (organization) => (
        <StatusBadge tone={TONE[organization.status]}>{LABEL[organization.status]}</StatusBadge>
      ),
    },
    { key: 'sites', header: 'Sites', render: (organization) => organization.site_count },
    {
      key: 'cameras',
      header: 'Cameras',
      render: (organization) =>
        `${organization.running_cameras} of ${organization.camera_count} running`,
    },
    { key: 'users', header: 'People', render: (organization) => organization.user_count },
    { key: 'created', header: 'Created', render: (organization) => when(organization.created_at) },
  ];

  const all = organizations.data?.organizations ?? [];

  return (
    <>
      <PageIntro
        eyebrow="Platform"
        title="Organisations"
        standfirst="Every customer on this deployment. Creating, suspending and archving one happens here and nowhere else."
        actions={
          <Button onClick={() => setAdding((open) => !open)}>
            {adding ? 'Cancel' : 'New organisation'}
          </Button>
        }
      />

      {adding ? (
        <Region order={2}>
          <SectionRule
            label="New organisation"
            detail="It starts active, with no sites, cameras or people."
          />
          <Plane>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (name.trim()) create.mutate();
              }}
              style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '32rem' }}
            >
              <Input
                label="Name"
                hint="Its identifier is derived from this and cannot be changed afterwards — it becomes part of every camera's runtime identity and names files on disk."
                value={name}
                placeholder="Customer B"
                onChange={(event) => setName(event.target.value)}
                autoFocus
              />
              <div>
                <Button type="submit" disabled={!name.trim() || create.isPending}>
                  {create.isPending ? 'Creating…' : 'Create organisation'}
                </Button>
              </div>
              {create.isError ? <Failed error={create.error} /> : null}
            </form>
          </Plane>
        </Region>
      ) : null}

      <Region order={adding ? 3 : 2}>
        <SectionRule label="Across the platform" />
        <Plane>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(11rem, 100%), 1fr))',
              gap: 'var(--space-6)',
            }}
          >
            <Figure scale="lead" label="Organisations" value={String(all.length)} />
            <Figure
              scale="lead"
              label="Active"
              value={String(all.filter((o) => o.status === 'active').length)}
            />
            <Figure
              scale="lead"
              label="Cameras running"
              value={String(all.reduce((sum, o) => sum + o.running_cameras, 0))}
              detail="Read from the live runtime, not from configuration."
            />
          </div>
        </Plane>
      </Region>

      <Region order={adding ? 4 : 3}>
        <SectionRule
          lead
          label="Organisations"
          actions={
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-3)',
                alignItems: 'flex-end',
                flexWrap: 'wrap',
              }}
            >
              <SearchField label="Search" value={search} onChange={setSearch} />
              <Select
                label="Status"
                value={status}
                onChange={(event) => setStatus(event.target.value as typeof status)}
              >
                <option value="">Any</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="archived">Archived</option>
              </Select>
            </div>
          }
        />
        <Plane>
          {organizations.isLoading ? <LoadingState label="Reading organisations" /> : null}
          {organizations.isError ? <Failed error={organizations.error} /> : null}
          {organizations.data ? (
            <DataTable
              caption="Organisations on this platform"
              columns={columns}
              rows={all}
              rowKey={(organization) => organization.id}
              empty={<EmptyState title="Nothing matches" body="Try clearing the filters." />}
            />
          ) : null}
        </Plane>
      </Region>
    </>
  );
}

/* ── one organisation ─────────────────────────────────────────────────────── */

export function OrganizationDetailPage() {
  const { organizationId = '' } = useParams();
  const client = useQueryClient();

  const organization = useQuery({
    queryKey: ['organization', organizationId],
    queryFn: () => platformApi.organization(organizationId),
    enabled: Boolean(organizationId),
  });

  const [name, setName] = useState('');
  const rename = useMutation({
    mutationFn: () => platformApi.rename(organizationId, name.trim()),
    onSuccess: () => {
      setName('');
      void client.invalidateQueries({ queryKey: ['organization', organizationId] });
      void client.invalidateQueries({ queryKey: ['organizations'] });
    },
  });

  if (organization.isLoading) return <LoadingState label="Reading organisation" />;
  if (organization.isError) return <Failed error={organization.error} />;
  if (!organization.data) return null;

  const it = organization.data;

  return (
    <>
      <PageIntro
        eyebrow="Organisation"
        title={it.name}
        standfirst={
          <>
            <code>{it.id}</code> · created {when(it.created_at)}
          </>
        }
        meta={<StatusBadge tone={TONE[it.status]}>{LABEL[it.status]}</StatusBadge>}
        actions={<Link to="/platform/organizations">All organisations</Link>}
      />

      <Region order={2}>
        <SectionRule lead label="Where it stands" detail={STATUS_MEANING[it.status]} />
        <Plane>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(11rem, 100%), 1fr))',
              gap: 'var(--space-6)',
            }}
          >
            <Figure scale="lead" label="Sites" value={String(it.site_count)} />
            <Figure scale="lead" label="Cameras" value={String(it.camera_count)} />
            <Figure
              scale="lead"
              label="Running now"
              value={String(it.running_cameras)}
              detail="From the live runtime. If this is not zero for a suspended or archived organisation, something is wrong."
            />
            <Figure scale="lead" label="People" value={String(it.user_count)} />
          </div>

          {it.status_changed_at ? (
            <p style={{ marginTop: 'var(--space-6)', marginBottom: 0 }}>
              Status changed {whenExact(it.status_changed_at)}
              {it.status_reason ? (
                <>
                  {' — '}
                  <span style={{ color: 'var(--text-secondary)' }}>{it.status_reason}</span>
                </>
              ) : null}
            </p>
          ) : null}
        </Plane>
      </Region>

      <Region order={3}>
        <SectionRule
          label="Members"
          detail="Who may enter this organisation. Membership is the entry ticket; roles decide what they can do once inside."
        />
        <Members organizationId={it.id} archived={it.status === 'archived'} />
      </Region>

      <Region order={4}>
        <SectionRule label="Name" detail="The slug and id cannot change. Only the display name." />
        <Plane>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) rename.mutate();
            }}
            style={{
              display: 'flex',
              gap: 'var(--space-3)',
              alignItems: 'flex-end',
              flexWrap: 'wrap',
            }}
          >
            <Input
              label="Name"
              value={name}
              placeholder={it.name}
              onChange={(event) => setName(event.target.value)}
            />
            <Button type="submit" disabled={!name.trim() || rename.isPending}>
              {rename.isPending ? 'Saving…' : 'Rename'}
            </Button>
          </form>
          {rename.isError ? <Failed error={rename.error} /> : null}
        </Plane>
      </Region>

      <Region order={5}>
        <SectionRule
          label="Enter this organisation"
          detail="Administering an organisation and working inside it are different acts. This is the second one."
        />
        <EnterOrganization organization={it} />
      </Region>

      <Region order={6}>
        <Lifecycle organization={it} />
      </Region>
    </>
  );
}

/**
 * The explicit boundary between administering an organisation and entering it.
 *
 * ### Looking at this page did not change the active tenant, and must not
 *
 * Everything above is platform administration: it reads the organisation as an
 * *object*, through operator-authorised endpoints, and the session's tenant is
 * untouched by having opened it. Entering is a different act — it mints a new
 * token, it changes which customer every subsequent request is about, and for
 * an operator it writes an audit row against that customer before it returns.
 *
 * So it is a button, with the consequence written next to it, and never a side
 * effect of navigation. A console where inspecting a customer silently moved
 * the operator into that customer would make the audit trail describe browsing
 * rather than intent.
 *
 * ### Members go in as themselves
 *
 * If the account actually belongs to this organisation, entry uses their
 * membership — their real roles, their real camera scope. Only somebody with no
 * membership enters as a read-only operator. Entering your own organisation as
 * a stranger would be a worse experience and a misleading audit row.
 */
function EnterOrganization({ organization }: { organization: Organization }) {
  const navigate = useNavigate();
  const { organizations, selectOrganization, enterOrganization } = useAuth();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const asMember = organizations.some((candidate) => candidate.id === organization.id);
  const archived = organization.status === 'archived';

  async function go() {
    setFailure(null);
    setBusy(true);
    try {
      if (asMember) await selectOrganization(organization.id);
      else await enterOrganization(organization.id);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setBusy(false);
      setFailure(
        isApiError(error) ? error.friendlyMessage : 'This organisation could not be opened.',
      );
    }
  }

  return (
    <Plane>
      <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Button onClick={() => void go()} disabled={busy || archived}>
          {busy ? 'Opening…' : 'Enter organisation'}
        </Button>
        <p style={{ margin: 0, flex: 1, minWidth: '18rem', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
          {archived
            ? 'An archived organisation cannot be entered. Nobody may sign in to one.'
            : asMember
              ? 'You are a member here, so you will enter with your own roles and camera access, and the Command Center will be this organisation.'
              : 'You will enter read-only, as a platform operator. The entry is recorded against this organisation, and evidence, patron identity and the audit trail stay closed.'}
        </p>
      </div>
      {failure ? (
        <p role="alert" style={{ marginBottom: 0, color: 'var(--severity-critical, inherit)' }}>
          {failure}
        </p>
      ) : null}
    </Plane>
  );
}

/**
 * Membership administration for one organisation.
 *
 * Admits and removes, and does nothing else. Roles are granted inside the
 * organisation by somebody who holds `MANAGE_USERS` there — this console
 * deliberately does not reach into a customer's user administration, because a
 * cross-customer principal that could hand out roles inside any customer would
 * be the unrestricted tenant authority the whole architecture avoids.
 */
function Members({ organizationId, archived }: { organizationId: string; archived: boolean }) {
  const client = useQueryClient();
  const [addUser, setAddUser] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  const members = useQuery({
    queryKey: ['platform', 'members', organizationId],
    queryFn: () => platformAdminApi.members(organizationId),
  });

  const everyone = useQuery({
    queryKey: ['platform', 'people', 'all-for-admit'],
    queryFn: () => platformAdminApi.people({ limit: 200 }),
  });

  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ['platform', 'members', organizationId] });
    void client.invalidateQueries({ queryKey: ['platform', 'people'] });
    void client.invalidateQueries({ queryKey: ['platform', 'overview'] });
  };

  const add = useMutation({
    mutationFn: (userId: string) => platformAdminApi.addMember(organizationId, userId),
    onSuccess: () => {
      setAddUser('');
      setFailure(null);
      invalidate();
    },
    onError: (error) =>
      setFailure(isApiError(error) ? error.friendlyMessage : 'The member could not be added.'),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => platformAdminApi.removeMember(organizationId, userId),
    onSuccess: (result) => {
      // Reported rather than hidden: removing somebody's last membership means
      // the account can no longer sign in anywhere, which is what offboarding
      // looks like and is also what a mistake looks like.
      setFailure(
        result.left_without_access
          ? `${result.email} now has no organisation and cannot sign in anywhere.`
          : null,
      );
      invalidate();
    },
    onError: (error) =>
      setFailure(isApiError(error) ? error.friendlyMessage : 'The member could not be removed.'),
  });

  if (members.isLoading) return <LoadingState label="Reading members" />;
  if (members.isError) return <Failed error={members.error} />;

  const rows = members.data?.members ?? [];
  const held = new Set(rows.map((person) => person.id));
  const admittable = (everyone.data?.people ?? []).filter((person) => !held.has(person.id));

  return (
    <Plane>
      {failure ? (
        <p role="alert" style={{ marginTop: 0 }}>
          {failure}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="No members"
          body="Nobody can sign in to this organisation yet. Admit someone below."
        />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-3)' }}>
          {rows.map((person) => (
            <li
              key={person.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                paddingBottom: 'var(--space-3)',
                borderBottom: '1px solid var(--line-subtle)',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: 1, minWidth: '14rem' }}>
                <Link to={`/platform/people/${encodeURIComponent(person.id)}`}>
                  {person.display_name || person.email}
                </Link>
                {person.home_organization_id === organizationId ? (
                  <span style={{ marginLeft: 'var(--space-2)' }}>
                    <Badge>home</Badge>
                  </span>
                ) : null}
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  {(person.memberships.find((m) => m.organization_id === organizationId)?.roles ?? [])
                    .length === 0
                    ? 'No role here — can enter, sees nothing'
                    : person.memberships
                        .find((m) => m.organization_id === organizationId)!
                        .roles.join(', ')}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={remove.isPending}
                onClick={() => remove.mutate(person.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div
        style={{
          marginTop: 'var(--space-6)',
          paddingTop: 'var(--space-5)',
          borderTop: '1px solid var(--line-subtle)',
          display: 'flex',
          gap: 'var(--space-3)',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
        }}
      >
        <Select
          label="Admit somebody"
          value={addUser}
          onChange={(event) => setAddUser(event.target.value)}
          disabled={archived}
        >
          <option value="">Choose…</option>
          {admittable.map((person) => (
            <option key={person.id} value={person.id}>
              {person.display_name || person.email} · {person.email}
            </option>
          ))}
        </Select>
        <Button disabled={!addUser || add.isPending || archived} onClick={() => add.mutate(addUser)}>
          {add.isPending ? 'Admitting…' : 'Admit'}
        </Button>
        <p style={{ margin: 0, flexBasis: '100%', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
          {archived
            ? 'An archived organisation takes no new members.'
            : 'Admitting grants no role. They will be able to sign in and will see nothing until somebody grants them a role inside this organisation.'}
        </p>
      </div>
    </Plane>
  );
}

function Lifecycle({ organization }: { organization: Organization }) {
  const client = useQueryClient();
  const [target, setTarget] = useState<OrganizationStatus>(
    organization.status === 'active' ? 'suspended' : 'active',
  );
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<Organization | null>(null);

  const change = useMutation({
    mutationFn: () => platformApi.setStatus(organization.id, target, reason.trim()),
    onSuccess: (updated) => {
      setReason('');
      setResult(updated);
      void client.invalidateQueries({ queryKey: ['organization', organization.id] });
      void client.invalidateQueries({ queryKey: ['organizations'] });
    },
  });

  const narrowing = target !== 'active';
  const needsReason = narrowing && !reason.trim();

  return (
    <>
      <SectionRule
        lead
        label="Lifecycle"
        detail="This reaches sign-in, permissions and the camera runtime. It is not a label."
      />
      <Plane>
        <div style={{ display: 'grid', gap: 'var(--space-5)', maxWidth: '36rem' }}>
          <Select
            label="Move to"
            value={target}
            onChange={(event) => setTarget(event.target.value as OrganizationStatus)}
          >
            {(['active', 'suspended', 'archived'] as const)
              .filter((state) => state !== organization.status)
              .map((state) => (
                <option key={state} value={state}>
                  {LABEL[state]}
                </option>
              ))}
          </Select>

          <p
            style={{
              margin: 0,
              padding: 'var(--space-4)',
              border: '1px solid var(--line-subtle)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-secondary)',
            }}
          >
            {STATUS_MEANING[target]}
            {narrowing && organization.running_cameras > 0 ? (
              <>
                {' '}
                <strong>
                  {organization.running_cameras} running camera
                  {organization.running_cameras === 1 ? '' : 's'} will be stopped immediately.
                </strong>
              </>
            ) : null}
          </p>

          {narrowing ? (
            <Input
              label="Reason"
              hint="Required. It stops the customer's product working, and this is the only moment anyone reliably knows why."
              value={reason}
              placeholder="Invoice 41 unpaid for 60 days."
              onChange={(event) => setReason(event.target.value)}
            />
          ) : null}

          {target === 'archived' ? (
            <DangerConfirm
              expect={organization.name}
              label={`Type ${organization.name} to confirm`}
              actionLabel="Archive this organisation"
              pending={change.isPending}
              hint={
                <>
                  Nobody at <strong>{organization.name}</strong> will be able to sign in, and
                  every camera stops. Data is retained and nothing is deleted, but the product
                  stops for everyone there the moment you confirm.
                </>
              }
              onConfirm={() => {
                if (!needsReason) change.mutate();
              }}
            />
          ) : (
            <div>
              <Button
                variant={narrowing ? 'danger' : 'primary'}
                disabled={needsReason || change.isPending}
                onClick={() => change.mutate()}
              >
                {change.isPending ? 'Applying…' : `Move to ${LABEL[target].toLowerCase()}`}
              </Button>
            </div>
          )}

          {change.isError ? <Failed error={change.error} /> : null}

          {result ? (
            <div
              style={{
                display: 'grid',
                gap: 'var(--space-2)',
                padding: 'var(--space-4)',
                border: '1px solid var(--line-default)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <strong>
                Now <Badge>{LABEL[result.status]}</Badge>
              </strong>
              {typeof result.cameras_stopped === 'number' ? (
                <span>
                  {result.cameras_stopped} camera
                  {result.cameras_stopped === 1 ? '' : 's'} stopped.
                </span>
              ) : null}
              {result.note ? (
                <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                  {result.note}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </Plane>
    </>
  );
}

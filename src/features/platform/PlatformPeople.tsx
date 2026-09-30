/**
 * People — everyone on the platform, and what they may enter.
 *
 * ### Membership here; access in the matrix
 *
 * This page answers "who exists across the platform, and which customers can
 * they reach", and it administers **membership** — the entry ticket. What a
 * person may do inside each organization is set on the access matrix
 * (`/platform/people/:id/access`, `PersonAccess.tsx`), which writes the same
 * role and override rows an Organization Admin writes from `/admin/users/:id`
 * and audits every change into the organization it changes. That is not a back
 * door: the Platform Admin can already enter any organization with every
 * permission and do the same from inside it.
 *
 * ### Home organization and memberships are always shown separately
 *
 * `home_organization_id` is where the account *lives*: it owns email
 * uniqueness and it is where a failed login is filed. It is not, by itself,
 * permission to enter anywhere. `memberships` is what the person may actually
 * enter. For nearly every account the two agree — and the moment they stop
 * agreeing is exactly when somebody needs to see both, so the page never
 * collapses them into one "organization" column.
 */

import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  platformAdminApi,
  platformApi,
  type Person,
  type PersonMembership,
} from '@shared/api/platform';
import { roleLabel } from '@app/permissions/permissions';
import { isApiError } from '@shared/api/errors';
import {
  Badge,
  Button,
  type Column,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Select,
  StatusBadge,
} from '@shared/ui/primitives';
import { GoTo, PageIntro, Plane, Region, SectionRule } from '@shared/ui/product';

/* ── the directory ────────────────────────────────────────────────────────── */

export function PlatformPeoplePage() {
  const [search, setSearch] = useState('');
  const [organizationId, setOrganizationId] = useState('');

  const organizations = useQuery({
    queryKey: ['platform', 'organizations', 'for-filter'],
    queryFn: () => platformApi.organizations({ limit: 200 }),
  });

  const people = useQuery({
    queryKey: ['platform', 'people', { search, organizationId }],
    queryFn: () =>
      platformAdminApi.people({
        q: search.trim() || undefined,
        organization_id: organizationId || undefined,
        limit: 100,
      }),
  });

  const columns: ReadonlyArray<Column<Person>> = useMemo(
    () => [
      {
        key: 'email',
        header: 'Person',
        render: (person) => (
          <div style={{ minWidth: 0 }}>
            <Link to={`/platform/people/${encodeURIComponent(person.id)}`}>
              {person.display_name || person.email}
            </Link>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-2xs)',
                color: 'var(--ink-tertiary)',
              }}
            >
              {person.email}
            </div>
          </div>
        ),
      },
      {
        key: 'home',
        header: 'Home organization',
        render: (person) => (
          <span title="Where the account lives. Not, by itself, permission to enter.">
            {person.home_organization_id === null
              ? 'None — Platform Admin'
              : person.home_organization_name}
            {person.home_membership_missing ? (
              <span style={{ marginLeft: 'var(--space-2)' }}>
                <Badge tone="accent">cannot enter</Badge>
              </span>
            ) : null}
          </span>
        ),
      },
      {
        key: 'memberships',
        header: 'May enter',
        render: (person) =>
          person.memberships.length === 0 ? (
            <span style={{ color: 'var(--ink-tertiary)' }}>nothing</span>
          ) : (
            <span>
              {person.organization_count}
              <span style={{ color: 'var(--ink-tertiary)' }}>
                {' '}
                {person.organization_count === 1 ? 'organization' : 'organizations'}
              </span>
            </span>
          ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (person) => (
          <span style={{ display: 'inline-flex', gap: 'var(--space-2)' }}>
            <StatusBadge tone={person.is_active ? 'online' : 'offline'}>
              {person.is_active ? 'Active' : 'Disabled'}
            </StatusBadge>
            {person.is_platform_operator ? <Badge>Operator</Badge> : null}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <PageIntro
        eyebrow="Platform"
        title="People"
        standfirst="Everyone on the platform. Membership is what lets somebody enter an organization; roles decide what they can do once inside."
        actions={
          <Link to="/platform/people/new" style={{ textDecoration: 'none' }}>
            <GoTo>New person</GoTo>
          </Link>
        }
      />

      <Region order={2}>
        <SectionRule lead label="Directory" />
        <Plane>
          <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
            <Input
              label="Search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name or email"
            />
            <Select
              label="In organization"
              value={organizationId}
              onChange={(event) => setOrganizationId(event.target.value)}
            >
              <option value="">Any</option>
              {(organizations.data?.organizations ?? []).map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </Select>
          </div>

          {people.isLoading ? <LoadingState label="Reading people" /> : null}
          {people.isError ? <ErrorState title="People could not be read" body="The directory is unavailable." /> : null}
          {people.data ? (
            <DataTable
              caption="Everyone on the platform, with their home organization and what they may enter"
              rows={people.data.people}
              columns={columns}
              rowKey={(person) => person.id}
              empty="No account matches."
            />
          ) : null}
        </Plane>
      </Region>
    </>
  );
}

/* ── one person ───────────────────────────────────────────────────────────── */

export function PlatformPersonPage() {
  const { userId = '' } = useParams();
  const client = useQueryClient();
  const [addTo, setAddTo] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  const person = useQuery({
    queryKey: ['platform', 'person', userId],
    queryFn: () => platformAdminApi.person(userId),
    enabled: Boolean(userId),
  });

  const organizations = useQuery({
    queryKey: ['platform', 'organizations', 'for-filter'],
    queryFn: () => platformApi.organizations({ limit: 200 }),
  });

  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ['platform', 'person', userId] });
    void client.invalidateQueries({ queryKey: ['platform', 'people'] });
    void client.invalidateQueries({ queryKey: ['platform', 'overview'] });
  };

  const add = useMutation({
    mutationFn: (organizationId: string) =>
      platformAdminApi.addMember(organizationId, userId, 'org_admin'),
    onSuccess: () => {
      setAddTo('');
      setFailure(null);
      invalidate();
    },
    onError: (error) =>
      setFailure(isApiError(error) ? error.friendlyMessage : 'The membership could not be added.'),
  });

  const remove = useMutation({
    mutationFn: (organizationId: string) => platformAdminApi.removeMember(organizationId, userId),
    onSuccess: () => {
      setFailure(null);
      invalidate();
    },
    onError: (error) =>
      setFailure(isApiError(error) ? error.friendlyMessage : 'The membership could not be removed.'),
  });

  if (person.isLoading) return <LoadingState label="Reading person" />;
  if (person.isError) return <ErrorState title="Person could not be read" body="No such account, or the directory is unavailable." />;
  if (!person.data) return null;

  const it = person.data;
  const held = new Set(it.memberships.map((m) => m.organization_id));
  const addable = (organizations.data?.organizations ?? []).filter(
    (organization) => !held.has(organization.id) && organization.status !== 'archived',
  );

  return (
    <>
      <PageIntro
        eyebrow="Person"
        title={it.display_name || it.email}
        standfirst={
          <>
            <code>{it.email}</code> ·{' '}
            {it.home_organization_id === null
              ? 'Platform Admin — belongs to no organization'
              : `lives in ${it.home_organization_name}`}
          </>
        }
        meta={
          <span style={{ display: 'inline-flex', gap: 'var(--space-2)' }}>
            <StatusBadge tone={it.is_active ? 'online' : 'offline'}>
              {it.is_active ? 'Active' : 'Disabled'}
            </StatusBadge>
            {it.is_platform_operator ? <Badge>Platform operator</Badge> : null}
          </span>
        }
        actions={
          <span style={{ display: 'inline-flex', gap: 'var(--space-4)' }}>
            {it.is_platform_operator ? null : (
              <Link
                to={`/platform/people/${encodeURIComponent(it.id)}/access`}
                style={{ textDecoration: 'none' }}
              >
                <GoTo>Edit access</GoTo>
              </Link>
            )}
            <Link to="/platform/people">All people</Link>
          </span>
        }
      />

      {failure ? (
        <div
          role="alert"
          style={{
            marginBottom: 'var(--space-5)',
            padding: 'var(--space-3) var(--space-4)',
            border: '1px solid var(--line-default)',
            borderLeft: '3px solid var(--severity-critical, var(--ink-primary))',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface-raised)',
            fontSize: 'var(--text-sm)',
          }}
        >
          {failure}
        </div>
      ) : null}

      <Region order={2}>
        <SectionRule
          lead
          label="organizations they may enter"
          detail="Membership is the entry ticket. What they may do inside each one is set under Edit access."
        />
        <Plane>
          {it.home_membership_missing ? (
            <p style={{ marginTop: 0, color: 'var(--ink-secondary)' }}>
              This account is filed in <strong>{it.home_organization_name}</strong> but has no
              membership there, so it cannot enter its own home organization. That is a legitimate
              state — it is also what a mistaken revocation looks like.
            </p>
          ) : null}

          {it.is_platform_operator && it.memberships.length === 0 ? (
            <p style={{ margin: 0 }}>
              Platform Admin. Belongs to no organization, and can enter any of them from the
              organizations list.
            </p>
          ) : it.memberships.length === 0 ? (
            <EmptyState
              title="No memberships"
              body="This account cannot sign in to any organization. Give it one below."
            />
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-3)' }}>
              {it.memberships.map((membership) => (
                <MembershipRow
                  key={membership.organization_id}
                  membership={membership}
                  busy={remove.isPending}
                  onRemove={() => remove.mutate(membership.organization_id)}
                />
              ))}
            </ul>
          )}

          {it.is_platform_operator ? null : (
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
              label="Make Organization Admin of"
              value={addTo}
              onChange={(event) => setAddTo(event.target.value)}
            >
              <option value="">Choose…</option>
              {addable.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </Select>
            <Button disabled={!addTo || add.isPending} onClick={() => add.mutate(addTo)}>
              {add.isPending ? 'Adding…' : 'Add as Organization Admin'}
            </Button>
            {/* Said before the click, because it is the part people get wrong. */}
            <p
              style={{
                margin: 0,
                flexBasis: '100%',
                color: 'var(--ink-tertiary)',
                fontSize: 'var(--text-xs)',
              }}
            >
              They become Organization Admin of that organization, with every camera, alongside
              any organizations they already run. With more than one, they choose which to open
              when they sign in.
            </p>
          </div>
          )}
        </Plane>
      </Region>
    </>
  );
}

function MembershipRow({
  membership,
  busy,
  onRemove,
}: {
  membership: PersonMembership;
  busy: boolean;
  onRemove: () => void;
}) {
  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        paddingBottom: 'var(--space-3)',
        borderBottom: '1px solid var(--line-subtle)',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: 1, minWidth: '12rem' }}>
        <Link to={`/platform/organizations/${encodeURIComponent(membership.organization_id)}`}>
          {membership.organization_name}
        </Link>
        {membership.is_home ? (
          <span style={{ marginLeft: 'var(--space-2)' }}>
            <Badge tone="neutral">home</Badge>
          </span>
        ) : null}
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)' }}>
          {membership.roles.length === 0
            ? 'No role here — can enter, sees nothing'
            : membership.roles.map(roleLabel).join(', ')}
        </div>
      </div>
      <Button variant="ghost" size="sm" disabled={busy} onClick={onRemove}>
        Remove
      </Button>
    </li>
  );
}

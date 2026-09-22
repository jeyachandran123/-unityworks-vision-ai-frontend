/**
 * Creating Organization Admins, and giving them organizations.
 *
 * The Platform Admin creates an organization and then the person who runs it.
 * Both controls here are one step on the server — account, membership, role and
 * every camera are written together or not at all — so an organization can
 * never be left with somebody who signs in and can do nothing, which is how a
 * customer ended up with "0 people" before these existed.
 *
 * Everyone else in an organization is created from inside it, by its
 * Organization Admin. The platform makes the first person; that person makes
 * the rest.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PLATFORM_ADMIN_LABEL, ROLES } from '@app/permissions/permissions';
import { isApiError } from '@shared/api/errors';
import { platformAdminApi, platformApi, type Person } from '@shared/api/platform';
import { Button, Input, Select } from '@shared/ui/primitives';
import { Plane } from '@shared/ui/product';

/** The server's floor, stated here so the form can say it before submitting. */
export const PASSWORD_MIN_LENGTH = 12;

function failureText(error: unknown, fallback: string): string {
  return isApiError(error) ? error.friendlyMessage : fallback;
}

function useInvalidatePlatform() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ['platform'] });
    void client.invalidateQueries({ queryKey: ['organizations'] });
    void client.invalidateQueries({ queryKey: ['organization'] });
  };
}

/** Organizations an admin can still be given: every one that is not archived. */
function useOpenOrganizations(enabled: boolean) {
  return useQuery({
    queryKey: ['platform', 'organizations', 'open'],
    queryFn: () => platformApi.organizations({ limit: 200 }),
    enabled,
    select: (list) => list.organizations.filter((o) => o.status !== 'archived'),
  });
}

/**
 * New Organization Admin.
 *
 * With `organizationId`, the organization is fixed (the organization's own
 * page); without it, the form asks which organization (Roles & Access).
 */
export function CreateOrganizationAdmin({ organizationId }: { organizationId?: string }) {
  const invalidate = useInvalidatePlatform();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [chosen, setChosen] = useState('');
  const [created, setCreated] = useState<Person | null>(null);

  const organizations = useOpenOrganizations(organizationId === undefined);
  const target = organizationId ?? chosen;

  const create = useMutation({
    mutationFn: () =>
      platformAdminApi.createOrganizationAdmin(target, {
        email: email.trim(),
        display_name: name.trim(),
        password,
      }),
    onSuccess: (person) => {
      setCreated(person);
      setName('');
      setEmail('');
      setPassword('');
      invalidate();
    },
  });

  const shortPassword = password.length > 0 && password.length < PASSWORD_MIN_LENGTH;
  const ready = Boolean(target) && email.includes('@') && password.length >= PASSWORD_MIN_LENGTH;

  return (
    <Plane>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (ready && !create.isPending) {
            setCreated(null);
            create.mutate();
          }
        }}
        style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '32rem' }}
      >
        {organizationId === undefined ? (
          <Select
            id="new-admin-organization"
            label="Organization"
            value={chosen}
            onChange={(event) => setChosen(event.target.value)}
          >
            <option value="">Choose…</option>
            {(organizations.data ?? []).map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </Select>
        ) : null}
        <Input
          id="new-admin-name"
          label="Name"
          value={name}
          placeholder="Priya Raman"
          onChange={(event) => setName(event.target.value)}
        />
        <Input
          id="new-admin-email"
          label="Email"
          type="email"
          value={email}
          placeholder="priya@gayathri.example"
          onChange={(event) => setEmail(event.target.value)}
        />
        <Input
          id="new-admin-password"
          label="Password"
          type="password"
          value={password}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters. Give it to them directly; it is not sent anywhere.`}
          error={
            shortPassword
              ? `${PASSWORD_MIN_LENGTH - password.length} more character${
                  PASSWORD_MIN_LENGTH - password.length === 1 ? '' : 's'
                } needed`
              : undefined
          }
          onChange={(event) => setPassword(event.target.value)}
        />
        <div>
          <Button type="submit" disabled={!ready || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create Organization Admin'}
          </Button>
        </div>
        {create.isError ? (
          <p role="alert" style={{ margin: 0, color: 'var(--severity-critical, inherit)' }}>
            {failureText(create.error, 'The Organization Admin could not be created.')}
          </p>
        ) : null}
        {created ? (
          <p role="status" style={{ margin: 0 }}>
            <strong>{created.display_name || created.email}</strong> is now Organization Admin of{' '}
            {created.memberships.map((m) => m.organization_name).join(', ')}, and can sign in with{' '}
            {created.email}.
          </p>
        ) : null}
      </form>
    </Plane>
  );
}

/**
 * Give an existing Organization Admin another organization.
 *
 * One Organization Admin may hold one organization or several. Whoever holds
 * more than one chooses which to work in when they sign in.
 */
export function GiveOrganization() {
  const invalidate = useInvalidatePlatform();
  const [personId, setPersonId] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [done, setDone] = useState<string | null>(null);

  const people = useQuery({
    queryKey: ['platform', 'people', 'organization-admins'],
    queryFn: () => platformAdminApi.people({ limit: 200 }),
    select: (list) =>
      list.people.filter(
        (person) =>
          !person.is_platform_operator &&
          person.memberships.some((m) => m.roles.includes(ROLES.orgAdmin)),
      ),
  });
  const organizations = useOpenOrganizations(true);

  const person = (people.data ?? []).find((candidate) => candidate.id === personId);
  const held = new Set(person?.memberships.map((m) => m.organization_id) ?? []);
  const available = (organizations.data ?? []).filter((o) => !held.has(o.id));

  const give = useMutation({
    mutationFn: () => platformAdminApi.addMember(organizationId, personId, 'org_admin'),
    onSuccess: (updated) => {
      const organization = updated.memberships.find((m) => m.organization_id === organizationId);
      setDone(
        `${updated.display_name || updated.email} is now Organization Admin of ${
          organization?.organization_name ?? organizationId
        } as well.`,
      );
      setOrganizationId('');
      invalidate();
    },
  });

  return (
    <Plane>
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
        }}
      >
        <Select
          id="give-organization-person"
          label="Organization Admin"
          value={personId}
          onChange={(event) => {
            setPersonId(event.target.value);
            setOrganizationId('');
            setDone(null);
          }}
        >
          <option value="">Choose…</option>
          {(people.data ?? []).map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.display_name || candidate.email} · {candidate.email}
            </option>
          ))}
        </Select>
        <Select
          id="give-organization-target"
          label="Also give them"
          value={organizationId}
          disabled={!personId}
          onChange={(event) => setOrganizationId(event.target.value)}
        >
          <option value="">Choose…</option>
          {available.map((organization) => (
            <option key={organization.id} value={organization.id}>
              {organization.name}
            </option>
          ))}
        </Select>
        <Button
          disabled={!personId || !organizationId || give.isPending}
          onClick={() => {
            setDone(null);
            give.mutate();
          }}
        >
          {give.isPending ? 'Giving…' : 'Give organization'}
        </Button>
      </div>
      {person ? (
        <p
          style={{
            marginBottom: 0,
            color: 'var(--ink-tertiary)',
            fontSize: 'var(--text-sm)',
          }}
        >
          Holds today: {person.memberships.map((m) => m.organization_name).join(', ') || 'nothing'}.
        </p>
      ) : null}
      {give.isError ? (
        <p
          role="alert"
          style={{
            marginBottom: 0,
            color: 'var(--severity-critical, inherit)',
          }}
        >
          {failureText(give.error, 'The organization could not be given.')}
        </p>
      ) : null}
      {done ? (
        <p role="status" style={{ marginBottom: 0 }}>
          {done}
        </p>
      ) : null}
    </Plane>
  );
}

/** Shown where the Platform Admin is named, so the two admins read as two. */
export function PlatformAdminNote() {
  return (
    <p
      style={{
        margin: 0,
        color: 'var(--ink-tertiary)',
        fontSize: 'var(--text-sm)',
      }}
    >
      The {PLATFORM_ADMIN_LABEL} belongs to no organization and can enter any of them. An
      Organization Admin runs the organizations they are given — one or several.
    </p>
  );
}

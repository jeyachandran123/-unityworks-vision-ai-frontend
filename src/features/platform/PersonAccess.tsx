/**
 * Creating a person and setting their access, from the platform console.
 *
 * Two pages on one flow, shaped like the UnityWorks ERP's user wizard:
 *
 * - `/platform/people/new` — Account Details → Permissions → Review & Submit.
 * - `/platform/people/:userId/access` — Permissions → Review & Submit.
 *
 * Both send only what changed (`changesFrom`), and both refetch afterwards:
 * the server composes roles, overrides and suspension, and this page never
 * predicts its answer.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ACCESS_CATALOG } from '@app/permissions/access-catalog';
import { roleLabel } from '@app/permissions/permissions';
import { isApiError } from '@shared/api/errors';
import {
  platformAdminApi,
  platformApi,
  type OrganizationAccessChange,
  type PersonAccess,
  type RolePolicy,
} from '@shared/api/platform';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Select,
} from '@shared/ui/primitives';
import { GoTo, PageIntro, Plane, Region } from '@shared/ui/product';
import { AccessMatrix } from '@features/platform/AccessMatrix';
import { PASSWORD_MIN_LENGTH } from '@features/platform/OrganizationAdmins';
import {
  blankDrafts,
  changesFrom,
  draftsFrom,
  ticksBySection,
  type OrganizationDraft,
} from '@features/platform/access-state';

const CAMERA_WORD: Record<string, string> = {
  none: 'No cameras',
  all_in_tenant: 'All cameras',
  listed: 'Specific cameras (unchanged)',
};

function failure(error: unknown, fallback: string) {
  return (
    <ErrorState
      title="Not saved"
      body={isApiError(error) ? error.friendlyMessage : fallback}
      requestId={isApiError(error) ? error.requestId : undefined}
    />
  );
}

/* ── the stepper ──────────────────────────────────────────────────────────── */

function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol
      aria-label="Progress"
      style={{
        display: 'flex',
        gap: 'var(--space-4)',
        listStyle: 'none',
        margin: '0 0 var(--space-6)',
        padding: 'var(--space-4)',
        border: '1px solid var(--line-default)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--surface-raised)',
      }}
    >
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li
            key={label}
            aria-current={active ? 'step' : undefined}
            style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
          >
            <span
              aria-hidden="true"
              style={{
                width: '1.8rem',
                height: '1.8rem',
                borderRadius: '50%',
                display: 'inline-grid',
                placeItems: 'center',
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--weight-semibold)',
                border: `2px solid ${done || active ? 'var(--accent)' : 'var(--line-default)'}`,
                background: done ? 'var(--accent)' : 'transparent',
                color: done ? 'var(--ink-on-accent)' : 'var(--ink-primary)',
              }}
            >
              {index + 1}
            </span>
            <span
              style={{
                fontSize: 'var(--text-sm)',
                color: active ? 'var(--ink-primary)' : 'var(--ink-tertiary)',
              }}
            >
              {label}
              {done ? <span className="sr-only"> (done)</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ── the review ───────────────────────────────────────────────────────────── */

function AccessReview({
  drafts,
  changes,
}: {
  drafts: OrganizationDraft[];
  changes: OrganizationAccessChange[];
}) {
  if (changes.length === 0) {
    return (
      <EmptyState
        title="Nothing to change"
        body="No organization's access differs from what is saved."
      />
    );
  }
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-4)' }}>
      {changes.map((change) => {
        const draft = drafts.find((d) => d.organizationId === change.organization_id);
        if (!draft) return null;
        return (
          <li
            key={change.organization_id}
            style={{ paddingBottom: 'var(--space-3)', borderBottom: '1px solid var(--line-subtle)' }}
          >
            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
              <strong>{draft.name}</strong>
              {draft.isMember ? null : <Badge tone="accent">Will be admitted</Badge>}
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-secondary)' }}>
              {change.role ? roleLabel(change.role) : 'No role'} ·{' '}
              {CAMERA_WORD[draft.cameras] ?? draft.cameras} · {draft.permissions.length} permissions
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)' }}>
              {ticksBySection(draft, ACCESS_CATALOG)
                .map((s) => `${s.label} ${s.count}`)
                .join(' · ')}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Controls({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        marginTop: 'var(--space-6)',
      }}
    >
      {children}
    </div>
  );
}

/* ── new person ───────────────────────────────────────────────────────────── */

const NEW_STEPS = ['Account Details', 'Permissions', 'Review & Submit'];

export function NewPersonPage() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [homeId, setHomeId] = useState('');
  const [baseline, setBaseline] = useState<OrganizationDraft[]>([]);
  const [drafts, setDrafts] = useState<OrganizationDraft[]>([]);

  const organizations = useQuery({
    queryKey: ['platform', 'organizations', 'for-filter'],
    queryFn: () => platformApi.organizations({ limit: 200 }),
  });
  const roles = useQuery({ queryKey: ['platform', 'roles'], queryFn: platformAdminApi.roles });

  const all = organizations.data?.organizations ?? [];
  const open = all.filter((o) => o.status !== 'archived');
  const changes = changesFrom(baseline, drafts);
  const shortPassword = password.length > 0 && password.length < PASSWORD_MIN_LENGTH;
  const accountReady =
    email.includes('@') && password.length >= PASSWORD_MIN_LENGTH && homeId !== '';

  const create = useMutation({
    mutationFn: () =>
      platformAdminApi.createPerson({
        email: email.trim(),
        display_name: name.trim(),
        password,
        home_organization_id: homeId,
        organizations: changes,
      }),
    onSuccess: (access) => {
      void client.invalidateQueries({ queryKey: ['platform'] });
      navigate(`/platform/people/${encodeURIComponent(access.user_id)}`);
    },
  });

  const toPermissions = () => {
    // A new home organization restarts the grid: membership there changed.
    if (baseline.find((d) => d.isMember)?.organizationId !== homeId) {
      const fresh = blankDrafts(all, homeId);
      setBaseline(fresh);
      setDrafts(fresh);
    }
    setStep(1);
  };

  const replace = (next: OrganizationDraft) =>
    setDrafts((current) =>
      current.map((d) => (d.organizationId === next.organizationId ? next : d)),
    );

  return (
    <>
      <PageIntro
        eyebrow="Platform"
        title="New person"
        standfirst="Create an account and decide, organization by organization, what it may do."
        actions={
          <Link to="/platform/people" style={{ textDecoration: 'none' }}>
            <GoTo>All people</GoTo>
          </Link>
        }
      />
      <Stepper steps={NEW_STEPS} current={step} />

      {step === 0 ? (
        <Region order={2}>
          <Plane>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (accountReady) toPermissions();
              }}
              style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '32rem' }}
            >
              <Input
                id="new-person-name"
                label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <Input
                id="new-person-email"
                label="Email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <Input
                id="new-person-password"
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
              <Select
                id="new-person-home"
                label="Home organization"
                value={homeId}
                hint="Where the account lives. They are always a member here."
                onChange={(event) => setHomeId(event.target.value)}
              >
                <option value="">Choose…</option>
                {open.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </Select>
              <Controls>
                <span />
                <Button type="submit" variant="primary" disabled={!accountReady}>
                  Next: Permissions
                </Button>
              </Controls>
            </form>
          </Plane>
        </Region>
      ) : null}

      {step === 1 ? (
        <Region order={2}>
          {roles.isLoading ? <LoadingState label="Reading roles" /> : null}
          {roles.isError ? (
            <ErrorState title="Roles could not be read" body="The role policy is unavailable." />
          ) : null}
          {roles.data ? (
            <Plane>
              <AccessMatrix drafts={drafts} roles={roles.data.roles} onChange={replace} />
              <Controls>
                <Button onClick={() => setStep(0)}>Back</Button>
                <Button variant="primary" onClick={() => setStep(2)}>
                  Next: Review
                </Button>
              </Controls>
            </Plane>
          ) : null}
        </Region>
      ) : null}

      {step === 2 ? (
        <Region order={2}>
          <Plane>
            <p style={{ marginTop: 0 }}>
              <strong>{name || email}</strong> · <code>{email}</code> · home{' '}
              {all.find((o) => o.id === homeId)?.name ?? homeId}
            </p>
            <AccessReview drafts={drafts} changes={changes} />
            {create.isError ? failure(create.error, 'The person could not be created.') : null}
            <Controls>
              <Button onClick={() => setStep(1)}>Back</Button>
              <Button variant="primary" loading={create.isPending} onClick={() => create.mutate()}>
                Create person
              </Button>
            </Controls>
          </Plane>
        </Region>
      ) : null}
    </>
  );
}

/* ── edit an existing person ──────────────────────────────────────────────── */

export function EditPersonAccessPage() {
  const { userId = '' } = useParams();
  const [saved, setSaved] = useState(false);
  const access = useQuery({
    queryKey: ['platform', 'person-access', userId],
    queryFn: () => platformAdminApi.personAccess(userId),
    enabled: Boolean(userId),
  });
  const roles = useQuery({ queryKey: ['platform', 'roles'], queryFn: platformAdminApi.roles });

  if (access.isLoading || roles.isLoading) return <LoadingState label="Reading access" />;
  if (access.isError || roles.isError || !access.data || !roles.data) {
    return (
      <ErrorState
        title="Access could not be read"
        body="No such account, or the platform is unavailable."
      />
    );
  }

  const person = access.data;
  return (
    <>
      <PageIntro
        eyebrow="Platform · Access"
        title={person.display_name || person.email}
        standfirst={person.email}
        actions={
          <Link
            to={`/platform/people/${encodeURIComponent(userId)}`}
            style={{ textDecoration: 'none' }}
          >
            <GoTo>Back to person</GoTo>
          </Link>
        }
      />
      {saved ? (
        <p role="status" style={{ marginTop: 0 }}>
          Access saved. It takes effect on their next request.
        </p>
      ) : null}
      {person.is_platform_operator ? (
        <EmptyState
          title="A Platform Admin belongs to no organization"
          body="Platform authority is not set here. It reaches every organization by entering it."
        />
      ) : (
        <AccessEditor
          key={access.dataUpdatedAt}
          access={person}
          roles={roles.data.roles}
          userId={userId}
          onSaved={() => setSaved(true)}
        />
      )}
    </>
  );
}

const EDIT_STEPS = ['Permissions', 'Review & Submit'];

function AccessEditor({
  access,
  roles,
  userId,
  onSaved,
}: {
  access: PersonAccess;
  roles: RolePolicy['roles'];
  userId: string;
  onSaved: () => void;
}) {
  const client = useQueryClient();
  const loaded = useMemo(() => draftsFrom(access), [access]);
  const [drafts, setDrafts] = useState(loaded);
  const [step, setStep] = useState(0);
  const changes = changesFrom(loaded, drafts);

  const save = useMutation({
    mutationFn: () => platformAdminApi.setPersonAccess(userId, changes),
    onSuccess: (next) => {
      onSaved();
      client.setQueryData(['platform', 'person-access', userId], next);
      void client.invalidateQueries({ queryKey: ['platform', 'person', userId] });
      void client.invalidateQueries({ queryKey: ['platform', 'people'] });
    },
  });

  const replace = (next: OrganizationDraft) =>
    setDrafts((current) =>
      current.map((d) => (d.organizationId === next.organizationId ? next : d)),
    );

  return (
    <>
      <Stepper steps={EDIT_STEPS} current={step} />
      <Region order={2}>
        <Plane>
          {step === 0 ? (
            <>
              <AccessMatrix drafts={drafts} roles={roles} onChange={replace} />
              <Controls>
                <span />
                <Button variant="primary" onClick={() => setStep(1)}>
                  Next: Review
                </Button>
              </Controls>
            </>
          ) : (
            <>
              <AccessReview drafts={drafts} changes={changes} />
              {save.isError ? failure(save.error, 'The access could not be saved.') : null}
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
      </Region>
    </>
  );
}

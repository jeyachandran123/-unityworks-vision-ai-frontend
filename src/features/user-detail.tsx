/**
 * One account, at its own address — `/admin/people/:userId`.
 *
 * Reached only by clicking a row on People; there is no nav entry, matching
 * every other `:id` detail route in the product (`/cameras/:cameraKey`,
 * `/evidence/:evidenceRef`, `/incidents/:incidentId`).
 *
 * ### Two parts, ranked
 *
 * Identity and account state carry the page's visual weight — they are the
 * first thing anyone lands here to check. Access is the second part: the
 * access matrix (`person-access.tsx`), the same grid the platform console
 * uses, pinned to this organization. It replaced three older sections — a role
 * list, a camera-access form and a per-permission Added/Restricted table —
 * that together said what the grid now says in one place.
 *
 * ### Server-authoritative, always
 *
 * Every save refetches from the server rather than predicting the result
 * locally. `decide()` composes roles, overrides and organization lifecycle
 * together server-side, and this page never re-derives that.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

import { useAuth } from '@app/auth/AuthProvider';
import { ROLES, roleLabel } from '@app/permissions/permissions';
import { adminUsersApi } from '@shared/api/user-administration';
import { PersonAccessPanel } from '@features/admin/person-access';
import { ScopeSummary } from '@features/admin/people';
import { isApiError } from '@shared/api/errors';
import { Callout, useToast } from '@shared/ui/feedback';
import { ActionIcons, Icon } from '@shared/ui/icons';
import { ConfirmDialog } from '@shared/ui/overlays';
import { Badge, Button, EmptyState, ErrorState, LoadingState } from '@shared/ui/primitives';
import { PageIntro, SectionRule } from '@shared/ui/product';
import { FactList, Panel, StatusPill, initialsOf } from '@shared/ui/surfaces';

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

export function UserDetailPage() {
  const { userId = '' } = useParams();
  const client = useQueryClient();
  const toast = useToast();
  const { user: actor } = useAuth();

  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const userQuery = useQuery({
    queryKey: ['admin-user', userId],
    queryFn: () => adminUsersApi.get(userId),
    enabled: userId.length > 0,
    retry: false,
  });

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['admin-user', userId] });
    // The accounts list on People shows active-state too — kept in step so
    // navigating back never shows a stale row.
    void client.invalidateQueries({ queryKey: ['admin-users'] });
  };

  const activate = useMutation({
    mutationFn: () => adminUsersApi.activate(userId),
    onSuccess: (updated) => {
      refresh();
      toast.success(`${updated.display_name || updated.email} activated`, { description: 'They can sign in again.' });
    },
  });
  const deactivate = useMutation({
    mutationFn: () => adminUsersApi.deactivate(userId),
    onSuccess: (updated) => {
      setConfirmDeactivate(false);
      refresh();
      toast.success(`${updated.display_name || updated.email} deactivated`, {
        description: 'Signed out and refused login immediately.',
      });
    },
  });

  if (userQuery.isPending) return <LoadingState label="Loading account" />;

  if (userQuery.isError) {
    const notFound = isApiError(userQuery.error) && userQuery.error.kind === 'not_found';
    return (
      <>
        <PageIntro eyebrow="People" back="/admin/people" title="Account" />
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
  const name = user.display_name || user.email;

  return (
    <>
      <PageIntro
        eyebrow="People"
        back="/admin/people"
        title={name}
        mark={initialsOf(name)}
        meta={
          <>
            {user.is_active ? <StatusPill tone="online">Active</StatusPill> : <StatusPill tone="idle">Disabled</StatusPill>}
            {user.roles.length === 0 ? (
              <Badge>No role assigned</Badge>
            ) : (
              user.roles.map((role) => (
                <Badge key={role} tone={role === ROLES.orgAdmin ? 'accent' : 'neutral'}>
                  {roleLabel(role)}
                </Badge>
              ))
            )}
            {user.display_name ? <span className="uwv-page-meta-item">{user.email}</span> : null}
          </>
        }
        actions={
          user.is_active ? (
            <Button
              variant="danger"
              icon={<Icon icon={ActionIcons.suspend} />}
              loading={deactivate.isPending}
              disabled={isSelf}
              onClick={() => {
                deactivate.reset();
                setConfirmDeactivate(true);
              }}
              title={isSelf ? 'You may not deactivate your own account' : undefined}
            >
              Deactivate
            </Button>
          ) : (
            <Button
              variant="primary"
              icon={<Icon icon={ActionIcons.activate} />}
              loading={activate.isPending}
              onClick={() => activate.mutate()}
            >
              Activate
            </Button>
          )
        }
      />

      {isSelf ? (
        <Callout variant="banner" tone="neutral" title="This is your own account">
          Its access and activation state cannot be changed from here — the server refuses self-modification.
        </Callout>
      ) : null}
      {!user.is_active ? (
        <Callout variant="banner" tone="warning" title="Deactivated">
          This account cannot sign in. Activating it restores the roles and cameras it held.
        </Callout>
      ) : null}
      {activate.isError ? <Failed error={activate.error} /> : null}

      <SectionRule
        lead
        order={2}
        label="Identity & account"
        detail="Who this is, and whether they can sign in right now."
      />
      <div className="uwv-arrive" data-order="2">
        <Panel>
          <FactList
            items={[
              { label: 'Email', value: user.email },
              { label: 'Signs in', value: user.is_active ? 'Allowed' : 'Refused — deactivated' },
              { label: 'Cameras', value: <ScopeSummary scope={user.camera_scope} /> },
              { label: 'Created', value: when(user.created_at) },
              { label: 'Last sign-in', value: when(user.last_login_at) },
            ]}
          />
        </Panel>
      </div>

      {/* ── Access: the matrix, this organization only ── */}
      <div id="access">
        <SectionRule
          order={3}
          label="Access"
          detail="What this person may do here, screen by screen, and which cameras they reach."
        />
      </div>
      <section className="uwv-arrive" data-order="3">
        <PersonAccessPanel userId={user.id} isSelf={isSelf} />
      </section>

      <ConfirmDialog
        open={confirmDeactivate}
        title={`Deactivate ${user.email}?`}
        confirmLabel="Deactivate"
        tone="danger"
        pending={deactivate.isPending}
        error={
          deactivate.isError
            ? isApiError(deactivate.error)
              ? deactivate.error.friendlyMessage
              : 'The account could not be deactivated.'
            : undefined
        }
        onConfirm={() => deactivate.mutate()}
        onCancel={() => setConfirmDeactivate(false)}
      >
        <p>
          This account will be signed out and refused login immediately. It can be undone by activating the account again,
          but if this is your organization&apos;s only administrator it may leave nobody able to reverse it — check before
          continuing.
        </p>
      </ConfirmDialog>
    </>
  );
}

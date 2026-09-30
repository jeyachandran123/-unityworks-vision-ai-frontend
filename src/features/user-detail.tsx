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
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '@app/auth/AuthProvider';
import { roleLabel } from '@app/permissions/permissions';
import { adminUsersApi } from '@shared/api/user-administration';
import { PersonAccessPanel } from '@features/admin/person-access';
import { isApiError } from '@shared/api/errors';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
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

export function UserDetailPage() {
  const { userId = '' } = useParams();
  const client = useQueryClient();
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
    onSuccess: refresh,
  });
  const deactivate = useMutation({
    mutationFn: () => adminUsersApi.deactivate(userId),
    onSuccess: () => {
      setConfirmDeactivate(false);
      refresh();
    },
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
          <Link to="/admin/people" style={{ textDecoration: 'none' }}>
            <GoTo>Back to People</GoTo>
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
              This is your own account. Its access and activation state cannot be changed from
              here — the server refuses self-modification.
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

      {/* ── Access: the matrix, this organization only ── */}
      <SectionRule
        order={3}
        label="Access"
        detail="What this person may do here, screen by screen, and which cameras they reach."
      />
      <Region order={3}>
        <PersonAccessPanel userId={user.id} isSelf={isSelf} />
      </Region>
    </>
  );
}

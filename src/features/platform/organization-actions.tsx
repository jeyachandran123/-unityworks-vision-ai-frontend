/**
 * What can be done to an organization, wherever it is offered.
 *
 * The list's row menu, the bulk bar and the organization's own page all offer
 * the same acts, and each act has one dialog. Keeping them here is what stops
 * "Suspend" asking for a reason in one place and not in another.
 *
 * ### The lifecycle is not a setting
 *
 * Suspending or archiving stops a paying customer's product working, so both
 * are confirmations with a written reason, and archiving also waits for the
 * organization's name to be typed. The server stops the customer's cameras in
 * the same request and says how many it stopped; that number is reported back,
 * because "the status says suspended" and "the cameras are off" are different
 * facts and only the second one matters. There is no delete: an organization
 * ends archived, with its data kept — the backend offers nothing further, and
 * this console does not pretend it does.
 */

import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@app/auth/AuthProvider';
import { isApiError } from '@shared/api/errors';
import { platformApi, STATUS_MEANING, type Organization, type OrganizationStatus } from '@shared/api/platform';
import { useToast } from '@shared/ui/feedback';
import { ActionIcons } from '@shared/ui/icons';
import { ConfirmDialog, type MenuEntry } from '@shared/ui/overlays';
import { Button, Input, Modal, Textarea } from '@shared/ui/primitives';
import { StatusPill } from '@shared/ui/surfaces';

export const STATUS_TONE: Record<OrganizationStatus, 'online' | 'degraded' | 'offline'> = {
  active: 'online',
  suspended: 'degraded',
  archived: 'offline',
};

export const STATUS_LABEL: Record<OrganizationStatus, string> = {
  active: 'Active',
  suspended: 'Suspended',
  archived: 'Archived',
};

export function OrganizationStatusPill({ status }: { status: OrganizationStatus }) {
  return <StatusPill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusPill>;
}

function failure(error: unknown, fallback: string): string {
  return isApiError(error) ? error.friendlyMessage || error.message : fallback;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Every cache an organization's change can make stale. */
export function useInvalidateOrganizations() {
  const client = useQueryClient();
  return (id?: string) => {
    void client.invalidateQueries({ queryKey: ['organizations'] });
    void client.invalidateQueries({ queryKey: ['platform'] });
    if (id) void client.invalidateQueries({ queryKey: ['organization', id] });
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   Enter
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Enter an organization as the Platform Admin.
 *
 * An act, not a navigation: it mints a new token for that tenant and writes a
 * row into the customer's audit trail before it returns. Offered as a button
 * with the consequence written beside it; never a side effect of opening a page.
 */
export function useEnterOrganization() {
  const navigate = useNavigate();
  const { enterOrganization } = useAuth();
  const toast = useToast();
  const [entering, setEntering] = useState<string | null>(null);

  const enter = async (organization: Organization) => {
    setEntering(organization.id);
    try {
      await enterOrganization(organization.id);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setEntering(null);
      toast.error(`${organization.name} could not be opened`, {
        description: failure(error, 'The organization refused the entry.'),
      });
    }
  };

  return { enter, entering };
}

/* ────────────────────────────────────────────────────────────────────────────
   Rename
   ──────────────────────────────────────────────────────────────────────────── */

export function RenameDialog({
  organization,
  open,
  onClose,
}: {
  organization: Organization;
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState(organization.name);
  const invalidate = useInvalidateOrganizations();
  const toast = useToast();
  const trimmed = name.trim();
  const changed = trimmed !== '' && trimmed !== organization.name;

  const rename = useMutation({
    mutationFn: () => platformApi.rename(organization.id, trimmed),
    onSuccess: (updated) => {
      invalidate(organization.id);
      toast.success('Organization renamed', { description: `${organization.name} is now ${updated?.name || trimmed}.` });
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!rename.isPending) onClose();
      }}
      title={`Rename ${organization.name}`}
      description="Only the display name changes. The slug and id stay as they are."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={rename.isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="rename-organization" loading={rename.isPending} disabled={!changed}>
            Rename
          </Button>
        </>
      }
    >
      <form
        id="rename-organization"
        onSubmit={(event) => {
          event.preventDefault();
          if (changed) rename.mutate();
        }}
        style={{ display: 'grid', gap: 'var(--space-4)' }}
      >
        <Input
          label="Organization name"
          value={name}
          autoFocus
          onChange={(event) => setName(event.target.value)}
          error={rename.isError ? failure(rename.error, 'The name could not be changed.') : undefined}
        />
        <p className="uwv-type-caption">
          Slug <span className="uwv-id">{organization.slug}</span> — part of every camera's runtime identity, so it never
          changes.
        </p>
      </form>
    </Modal>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Lifecycle
   ──────────────────────────────────────────────────────────────────────────── */

const VERB: Record<OrganizationStatus, string> = {
  active: 'Reactivate',
  suspended: 'Suspend',
  archived: 'Archive',
};

/**
 * Move one organization — or several, from the bulk bar — to a status.
 *
 * Several are moved one request at a time, because that is the API there is;
 * the result says how many succeeded and names any that did not.
 */
export function StatusDialog({
  organizations,
  target,
  open,
  onClose,
  onDone,
}: {
  organizations: ReadonlyArray<Organization>;
  target: OrganizationStatus;
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [reason, setReason] = useState('');
  const invalidate = useInvalidateOrganizations();
  const toast = useToast();
  const single = organizations.length === 1 ? organizations[0]! : null;
  const narrowing = target !== 'active';
  const running = organizations.reduce((sum, o) => sum + o.running_cameras, 0);

  const change = useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled(
        organizations.map((organization) => platformApi.setStatus(organization.id, target, reason.trim())),
      );
      return results;
    },
    onSuccess: (results) => {
      const done = results.filter((r): r is PromiseFulfilledResult<Organization> => r.status === 'fulfilled');
      const failed = results.length - done.length;
      organizations.forEach((o) => invalidate(o.id));
      const stopped = done.reduce((sum, r) => sum + (r.value.cameras_stopped ?? 0), 0);
      const notes = done.map((r) => r.value.note).filter(Boolean);

      if (done.length > 0) {
        const title = single
          ? `${single.name} is now ${STATUS_LABEL[target].toLowerCase()}`
          : `${plural(done.length, 'organization')} ${target === 'active' ? 'reactivated' : STATUS_LABEL[target].toLowerCase()}`;
        const description = [narrowing ? `${plural(stopped, 'camera')} stopped.` : null, ...notes]
          .filter(Boolean)
          .join(' ');
        toast.success(title, { description: description || undefined });
      }
      if (failed > 0) {
        const first = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
        toast.error(`${plural(failed, 'organization')} could not be changed`, {
          description: failure(first?.reason, 'The server refused the change.'),
        });
      }
      if (failed === 0) {
        setReason('');
        onDone?.();
        onClose();
      }
    },
  });

  const title = single
    ? `${VERB[target]} ${single.name}?`
    : `${VERB[target]} ${plural(organizations.length, 'organization')}?`;

  const body: ReactNode = (
    <>
      <p>{STATUS_MEANING[target]}</p>
      {narrowing && running > 0 ? (
        <p>
          <strong>{plural(running, 'running camera')} will be stopped immediately.</strong>
        </p>
      ) : null}
      {target === 'active' ? (
        <p>Cameras are not restarted by this: each is started again from the organization's camera list.</p>
      ) : null}
      {!single ? (
        <p className="uwv-type-caption">{organizations.map((o) => o.name).join(', ')}</p>
      ) : null}
      {narrowing ? (
        <Textarea
          label="Reason"
          hint="Required, and kept with the change. It stops a customer's product working; this is the moment anyone reliably knows why."
          placeholder="Invoice 41 unpaid for 60 days."
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      ) : null}
    </>
  );

  return (
    <ConfirmDialog
      open={open}
      title={title}
      confirmLabel={single ? `${VERB[target]} organization` : `${VERB[target]} ${plural(organizations.length, 'organization')}`}
      tone={target === 'archived' ? 'danger' : target === 'suspended' ? 'warning' : 'default'}
      requireText={target === 'archived' && single ? single.name : undefined}
      confirmDisabled={narrowing && !reason.trim()}
      pending={change.isPending}
      error={change.isError ? failure(change.error, 'The change did not complete.') : undefined}
      onConfirm={() => change.mutate()}
      onCancel={() => {
        setReason('');
        change.reset();
        onClose();
      }}
    >
      {body}
    </ConfirmDialog>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   One organization's acts, as a menu and its dialogs
   ──────────────────────────────────────────────────────────────────────────── */

type Pending = { kind: 'rename' } | { kind: 'status'; target: OrganizationStatus } | null;

/**
 * The acts on one organization: a menu's entries, and the dialogs they open.
 * Mount `dialogs` once beside whatever renders the menu.
 */
export function useOrganizationMenu() {
  const navigate = useNavigate();
  const { enter, entering } = useEnterOrganization();
  const [subject, setSubject] = useState<Organization | null>(null);
  const [pending, setPending] = useState<Pending>(null);

  const close = () => setPending(null);

  const menuFor = (organization: Organization, { includeView = true } = {}): MenuEntry[] => {
    const archived = organization.status === 'archived';
    const open = (next: Pending) => () => {
      setSubject(organization);
      setPending(next);
    };
    return [
      ...(includeView
        ? [
            {
              id: 'view',
              label: 'View details',
              icon: ActionIcons.view,
              onSelect: () => navigate(`/platform/organizations/${encodeURIComponent(organization.id)}`),
            },
          ]
        : []),
      {
        id: 'enter',
        label: 'Enter organization',
        icon: ActionIcons.enter,
        disabled: archived || entering !== null,
        hint: archived ? 'Nobody may sign in to an archived organization' : 'Recorded in its audit trail',
        onSelect: () => void enter(organization),
      },
      { id: 'rename', label: 'Rename…', icon: ActionIcons.edit, onSelect: open({ kind: 'rename' }) },
      { id: 'sep', type: 'separator' },
      organization.status === 'active'
        ? { id: 'suspend', label: 'Suspend…', icon: ActionIcons.suspend, onSelect: open({ kind: 'status', target: 'suspended' }) }
        : { id: 'activate', label: 'Reactivate…', icon: ActionIcons.activate, onSelect: open({ kind: 'status', target: 'active' }) },
      ...(archived
        ? []
        : [
            {
              id: 'archive',
              label: 'Archive…',
              icon: ActionIcons.archive,
              tone: 'danger' as const,
              onSelect: open({ kind: 'status', target: 'archived' }),
            },
          ]),
    ];
  };

  const dialogs = subject ? (
    <>
      {pending?.kind === 'rename' ? (
        <RenameDialog key={`rename-${subject.id}`} organization={subject} open onClose={close} />
      ) : null}
      <StatusDialog
        organizations={[subject]}
        target={pending?.kind === 'status' ? pending.target : 'suspended'}
        open={pending?.kind === 'status'}
        onClose={close}
      />
    </>
  ) : null;

  const ask = (organization: Organization, next: Exclude<Pending, null>) => {
    setSubject(organization);
    setPending(next);
  };

  return { menuFor, dialogs, ask, enter, entering };
}

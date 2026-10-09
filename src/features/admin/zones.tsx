/**
 * Zones — where a camera is, and the only place it can be.
 *
 * A zone is the thing an incident is attributed to, the thing a camera hangs
 * off, and the thing a report is scoped by. It replaced the site on
 * 2026-09-23: the estate was organization → site → zone → camera, and the
 * people running a restaurant say where a camera is in one step — the kitchen,
 * the dine hall, billing.
 *
 * ### Read and manage are separate, and the page says so
 *
 * `view_zones` renders everything here. `manage_zones` is what adds the
 * controls. Two people on the same role can differ on exactly that, so this
 * page is routinely rendered read-only for somebody who is not an
 * administrator: the read-only view is the base and the controls are the
 * addition, never the reverse.
 *
 * Hiding a control is a courtesy. The server checks the permission on every
 * write, and a hidden button is not a closed door.
 *
 * ### Delete and deactivate are different acts
 *
 * A zone that has never held a camera is configuration, and deleting it loses
 * nothing. A zone that holds cameras is part of the record of what was watched
 * and where, so the page offers **Deactivate** instead and says why. The server
 * refuses the delete regardless; this page explains it before the click rather
 * than after.
 *
 * ### The list is the server's
 *
 * Searched and paged by the server, so the count is its total. Not sortable:
 * the API has no sort.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { PERMISSIONS } from '@app/permissions/permissions';
import { PermissionGate, usePermissions } from '@app/permissions/guards';
import { isApiError } from '@shared/api/errors';
import { organizationApi, type Zone } from '@shared/api/observations';
import { camerasApi, type Camera } from '@shared/api/persistence';
import {
  DataGrid,
  Pagination,
  TableCard,
  TableToolbar,
  useTableState,
  type GridColumn,
} from '@shared/ui/data-table';
import { Callout, useToast } from '@shared/ui/feedback';
import { FormActions, FormSection, useUnsavedChanges } from '@shared/ui/forms';
import { ActionIcons, Icon, NavIcons } from '@shared/ui/icons';
import { ConfirmDialog } from '@shared/ui/overlays';
import { Button, EmptyState, ErrorState, Input, LoadingState, Modal } from '@shared/ui/primitives';
import { PageIntro } from '@shared/ui/product';
import { ButtonLink, FactList, MetricTile, Panel, StatusPill } from '@shared/ui/surfaces';

import { DangerConfirm, Failed, when } from './shared';

function failure(error: unknown, fallback: string): string {
  return isApiError(error) ? error.friendlyMessage : fallback;
}

function ZoneState({ zone }: { zone: Zone }) {
  return zone.is_active ? <StatusPill tone="online">In use</StatusPill> : <StatusPill tone="idle">Not in use</StatusPill>;
}

/* ── the list ─────────────────────────────────────────────────────────────── */

export function ZonesPage() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const { has } = usePermissions();
  const canManage = has(PERMISSIONS.manageZones);
  const table = useTableState('admin-zones', { pageSize: 25 });
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<Zone | null>(null);
  const [deleting, setDeleting] = useState<Zone | null>(null);

  const params = useMemo(
    () => ({ q: table.query || undefined, limit: table.pageSize, offset: table.offset }),
    [table.query, table.pageSize, table.offset],
  );
  const zones = useQuery({
    queryKey: ['zones', params],
    queryFn: () => organizationApi.zones(params),
    placeholderData: (previous) => previous,
  });

  const invalidate = () => void client.invalidateQueries({ queryKey: ['zones'] });

  const setActive = useMutation({
    mutationFn: ({ zone, active }: { zone: Zone; active: boolean }) => organizationApi.updateZone(zone.id, { is_active: active }),
    onSuccess: (_, { zone, active }) => {
      invalidate();
      toast.success(active ? `${zone.name} is back in use` : `${zone.name} taken out of use`);
    },
    onError: (error) => toast.error('The zone could not be changed', { description: failure(error, '') || undefined }),
  });

  const remove = useMutation({
    mutationFn: (zone: Zone) => organizationApi.deleteZone(zone.id),
    onSuccess: (_, zone) => {
      invalidate();
      setDeleting(null);
      toast.success(`${zone.name} deleted`);
    },
  });

  const rows = zones.data?.zones ?? [];
  const total = zones.data?.total ?? 0;
  const wholeList = total <= rows.length && !table.query;
  const cameras = rows.reduce((sum, zone) => sum + zone.camera_count, 0);
  const idle = rows.filter((zone) => !zone.is_active).length;

  const columns: ReadonlyArray<GridColumn<Zone>> = [
    {
      key: 'name',
      header: 'Zone',
      render: (zone) => (
        <span className="uwv-cell-primary">
          <span className="uwv-metric-icon">
            <Icon icon={NavIcons.administration} size="control" />
          </span>
          <Link className="uwv-cell-title" to={`/admin/zones/${encodeURIComponent(zone.id)}`}>
            {zone.name}
          </Link>
        </span>
      ),
    },
    { key: 'cameras', header: 'Cameras', numeric: true, render: (zone) => zone.camera_count },
    { key: 'state', header: 'State', render: (zone) => <ZoneState zone={zone} /> },
    { key: 'created', header: 'Added', render: (zone) => <span className="uwv-cell-muted">{when(zone.created_at)}</span> },
  ];

  if (zones.isError && !zones.data) return <Failed error={zones.error} />;

  return (
    <>
      <PageIntro
        eyebrow="Estate"
        title="Zones"
        standfirst="Where your cameras are. A zone is an area of one organization — the kitchen, the dine hall, billing — and every camera belongs to one."
        actions={
          <PermissionGate permission={PERMISSIONS.manageZones}>
            <Button variant="primary" icon={<Icon icon={ActionIcons.add} />} onClick={() => setAdding(true)}>
              New zone
            </Button>
          </PermissionGate>
        }
      />

      {zones.isLoading ? (
        <LoadingState label="Reading zones" />
      ) : (
        <>
          {total > 0 ? (
            <section className="uwv-metrics uwv-arrive" data-order="2" aria-label="Across this organization" style={{ marginBottom: 'var(--space-8)' }}>
              <MetricTile label="Zones" icon={NavIcons.administration} value={total} detail="Areas cameras are placed in" />
              <MetricTile
                label="Cameras placed"
                icon={NavIcons.cameras}
                value={cameras}
                detail={wholeList ? 'Across every zone' : 'In the zones on this page'}
              />
              <MetricTile
                label="Not in use"
                icon={ActionIcons.suspend}
                value={idle}
                detail={wholeList ? 'Kept for the record, not watched' : 'On this page'}
              />
            </section>
          ) : null}

          <section className="uwv-arrive" data-order="3" aria-label="Zones in this organization">
            <TableCard label="Zones">
              {total > 0 || table.query ? (
                <TableToolbar
                  state={table}
                  searchLabel="Search zones"
                  searchPlaceholder="Search by name…"
                  searching={zones.isFetching && table.query !== ''}
                  columns={columns}
                />
              ) : null}
              <DataGrid<Zone>
                caption="Zones in this organization"
                columns={columns}
                rows={rows}
                rowKey={(zone) => zone.id}
                hidden={table.hidden}
                density={table.density}
                narrowed={table.narrowed}
                onRowOpen={(zone) => navigate(`/admin/zones/${encodeURIComponent(zone.id)}`)}
                rowActions={(zone) => [
                  { id: 'view', label: 'View zone', icon: ActionIcons.view, onSelect: () => navigate(`/admin/zones/${encodeURIComponent(zone.id)}`) },
                  ...(canManage
                    ? [
                        { id: 'rename', label: 'Rename…', icon: ActionIcons.edit, onSelect: () => setRenaming(zone) },
                        zone.is_active
                          ? { id: 'deactivate', label: 'Take out of use', icon: ActionIcons.suspend, onSelect: () => setActive.mutate({ zone, active: false }) }
                          : { id: 'activate', label: 'Put back in use', icon: ActionIcons.activate, onSelect: () => setActive.mutate({ zone, active: true }) },
                        { id: 'sep', type: 'separator' as const },
                        {
                          id: 'delete',
                          label: 'Delete…',
                          icon: ActionIcons.remove,
                          tone: 'danger' as const,
                          disabled: zone.camera_count > 0,
                          hint: zone.camera_count > 0 ? 'It holds cameras — take it out of use instead' : undefined,
                          onSelect: () => {
                            remove.reset();
                            setDeleting(zone);
                          },
                        },
                      ]
                    : []),
                ]}
                rowActionsLabel={(zone) => `Actions for ${zone.name}`}
                empty={
                  <EmptyState
                    title="No zones yet"
                    body={
                      canManage
                        ? 'Add a zone before adding a camera — a camera is placed in one.'
                        : 'Somebody with estate permissions adds these. A camera is placed in a zone.'
                    }
                    action={
                      canManage ? (
                        <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
                          New zone
                        </Button>
                      ) : undefined
                    }
                  />
                }
                noResults={
                  <EmptyState
                    title="No zone matches"
                    body={`Nothing here is called “${table.query}”.`}
                    action={
                      <Button size="sm" onClick={table.clearFilters}>
                        Clear search
                      </Button>
                    }
                  />
                }
              />
              {total > 0 ? (
                <Pagination
                  total={total}
                  offset={table.offset}
                  limit={table.pageSize}
                  onOffset={table.setOffset}
                  onLimit={table.setPageSize}
                  noun="zones"
                  busy={zones.isFetching}
                />
              ) : null}
            </TableCard>
          </section>
        </>
      )}

      <NewZoneDialog open={adding} onClose={() => setAdding(false)} />
      {renaming ? <RenameZoneDialog zone={renaming} onClose={() => setRenaming(null)} /> : null}
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? ''}?`}
        confirmLabel="Delete zone"
        tone="danger"
        requireText={deleting?.name}
        pending={remove.isPending}
        error={remove.isError ? failure(remove.error, 'The zone could not be deleted.') : undefined}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      >
        <p>It holds no cameras and no readings, so nothing is lost. This cannot be undone.</p>
      </ConfirmDialog>
    </>
  );
}

function NewZoneDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState('');

  const create = useMutation({
    mutationFn: () => organizationApi.createZone({ name: name.trim() }),
    onSuccess: (zone) => {
      setName('');
      onClose();
      void client.invalidateQueries({ queryKey: ['zones'] });
      toast.success(`${zone.name} created`, {
        description: 'Place a camera in it from the camera’s own page, or add a new camera.',
        action: { label: 'Open zone', onClick: () => navigate(`/admin/zones/${encodeURIComponent(zone.id)}`) },
      });
    },
  });

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!create.isPending) onClose();
      }}
      title="New zone"
      description="A name is all a zone needs."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="new-zone" loading={create.isPending} disabled={!name.trim()}>
            Create zone
          </Button>
        </>
      }
    >
      <form
        id="new-zone"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <Input
          id="new-zone-name"
          label="Name"
          value={name}
          placeholder="Kitchen"
          hint="What the people who work there call it."
          autoFocus
          onChange={(event) => setName(event.target.value)}
          error={create.isError ? failure(create.error, 'The zone could not be created.') : undefined}
        />
      </form>
    </Modal>
  );
}

function RenameZoneDialog({ zone, onClose }: { zone: Zone; onClose: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(zone.name);
  const changed = name.trim() !== '' && name.trim() !== zone.name;

  const rename = useMutation({
    mutationFn: () => organizationApi.updateZone(zone.id, { name: name.trim() }),
    onSuccess: (updated) => {
      void client.invalidateQueries({ queryKey: ['zones'] });
      void client.invalidateQueries({ queryKey: ['zone', zone.id] });
      toast.success('Zone renamed', { description: `${zone.name} is now ${updated?.name || name.trim()}.` });
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`Rename ${zone.name}`}
      description="Renaming does not relabel past readings."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={rename.isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="rename-zone" loading={rename.isPending} disabled={!changed}>
            Rename
          </Button>
        </>
      }
    >
      <form
        id="rename-zone"
        onSubmit={(event) => {
          event.preventDefault();
          if (changed) rename.mutate();
        }}
      >
        <Input
          label="Zone name"
          value={name}
          autoFocus
          onChange={(event) => setName(event.target.value)}
          error={rename.isError ? failure(rename.error, 'The zone could not be renamed.') : undefined}
        />
      </form>
    </Modal>
  );
}

/* ── one zone ─────────────────────────────────────────────────────────────── */

export function ZoneDetailPage() {
  const { zoneId = '' } = useParams();
  const client = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();

  const zone = useQuery({
    queryKey: ['zone', zoneId],
    queryFn: () => organizationApi.zone(zoneId),
  });

  const cameras = useQuery({
    queryKey: ['cameras', 'zone', zoneId],
    queryFn: () => camerasApi.list(),
  });

  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ['zone', zoneId] });
    void client.invalidateQueries({ queryKey: ['zones'] });
  };

  const setActive = useMutation({
    mutationFn: (active: boolean) => organizationApi.updateZone(zoneId, { is_active: active }),
    onSuccess: (updated) => {
      invalidate();
      toast.success(updated.is_active ? `${updated.name} is back in use` : `${updated.name} taken out of use`);
    },
  });

  const remove = useMutation({
    mutationFn: () => organizationApi.deleteZone(zoneId),
    onSuccess: () => {
      invalidate();
      toast.success(`${zone.data?.name ?? 'Zone'} deleted`);
      navigate('/admin/zones', { replace: true });
    },
  });

  if (zone.isLoading) return <LoadingState label="Reading this zone" />;
  if (zone.isError) return <Failed error={zone.error} />;
  if (!zone.data) return <ErrorState title="Zone not found" body="It may have been deleted." />;

  const it = zone.data;
  const placed = (cameras.data?.cameras ?? []).filter((camera) => camera.zone_id === zoneId);
  const holdsCameras = it.camera_count > 0;
  const plural = it.camera_count === 1;

  return (
    <>
      <PageIntro
        eyebrow="Zones"
        back="/admin/zones"
        title={it.name}
        meta={
          <>
            <ZoneState zone={it} />
            <span className="uwv-page-meta-item">
              {holdsCameras ? `${it.camera_count} camera${plural ? '' : 's'} watch this zone` : 'No camera watches this zone yet'}
            </span>
            <span className="uwv-page-meta-item">Added {when(it.created_at)}</span>
          </>
        }
        actions={
          <PermissionGate permission={PERMISSIONS.manageCameras}>
            <ButtonLink to="/admin/cameras/new" variant="secondary" icon={ActionIcons.add}>
              Add a camera
            </ButtonLink>
          </PermissionGate>
        }
      />

      {!it.is_active ? (
        <Callout variant="banner" tone="neutral" title="Not in use">
          Kept as part of the record of what was watched here. Its cameras are not being read for this zone.
        </Callout>
      ) : null}
      {setActive.isError ? (
        <Callout variant="banner" tone="error" live>
          {failure(setActive.error, 'The zone could not be changed.')}
        </Callout>
      ) : null}

      <div className="uwv-detail-grid uwv-arrive" data-order="2">
        <Panel
          title="Cameras here"
          description="A camera belongs to exactly one zone. Move it from the camera's own page."
          flush
        >
          {cameras.isLoading ? (
            <LoadingState label="Reading cameras" />
          ) : placed.length === 0 ? (
            <div className="uwv-datatable-state">
              <EmptyState title="No cameras here" body="Add a camera and choose this zone, or move an existing one to it." />
            </div>
          ) : (
            <ul className="uwv-person-list">
              {placed.map((camera: Camera) => (
                <li key={camera.camera_key}>
                  <span className="uwv-metric-icon">
                    <Icon icon={NavIcons.cameras} size="control" />
                  </span>
                  <span className="uwv-cell-stack">
                    <Link className="uwv-cell-title" to={`/admin/cameras/${encodeURIComponent(camera.camera_key)}`}>
                      {camera.name || camera.camera_key}
                    </Link>
                    <span className="uwv-cell-sub">
                      {camera.recorder_name ? `${camera.recorder_name} · channel ${camera.channel}` : camera.camera_key}
                    </span>
                  </span>
                  <StatusPill tone={camera.enabled ? 'online' : 'idle'}>{camera.enabled ? 'Streaming' : 'Not streaming'}</StatusPill>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Details">
          <FactList
            items={[
              { label: 'State', value: <ZoneState zone={it} /> },
              { label: 'Cameras', value: String(it.camera_count) },
              { label: 'Added', value: when(it.created_at) },
            ]}
          />
        </Panel>
      </div>

      <PermissionGate permission={PERMISSIONS.manageZones}>
        <div style={{ marginTop: 'var(--space-10)' }}>
          <ZoneNameSection zone={it} />
          <FormSection
            tone={holdsCameras ? undefined : 'danger'}
            title={holdsCameras ? 'Taking it out of use' : 'Deleting it'}
            description={
              holdsCameras
                ? 'It holds cameras, so it cannot be deleted: it is part of the record of what was watched here.'
                : 'It has never held a camera, so there is nothing to lose.'
            }
          >
            {holdsCameras ? (
              <div className="uwv-danger-row">
                <div className="uwv-danger-row-text">
                  <p className="uwv-danger-row-title">{it.is_active ? 'Deactivate this zone' : 'Put this zone back in use'}</p>
                  <p className="uwv-danger-row-description">
                    {it.camera_count} camera{plural ? '' : 's'} still belong{plural ? 's' : ''} here. Move {plural ? 'it' : 'them'} to
                    another zone, or retire {plural ? 'it' : 'them'}, before deleting this zone.
                  </p>
                </div>
                <Button
                  variant={it.is_active ? 'secondary' : 'primary'}
                  loading={setActive.isPending}
                  onClick={() => setActive.mutate(!it.is_active)}
                >
                  {it.is_active ? 'Deactivate zone' : 'Put back in use'}
                </Button>
              </div>
            ) : (
              <DangerConfirm
                expect={it.name}
                label={`Type the zone's name to delete it`}
                hint="It holds no cameras and no readings, so nothing is lost. This cannot be undone."
                actionLabel="Delete zone"
                pending={remove.isPending}
                onConfirm={() => remove.mutate()}
              />
            )}
            {remove.isError ? (
              <Callout tone="error" live>
                {failure(remove.error, 'The zone could not be deleted.')}
              </Callout>
            ) : null}
          </FormSection>
        </div>
      </PermissionGate>
    </>
  );
}

function ZoneNameSection({ zone }: { zone: Zone }) {
  const client = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(zone.name);
  const trimmed = name.trim();
  const dirty = trimmed !== zone.name;
  useUnsavedChanges(dirty);

  const rename = useMutation({
    mutationFn: () => organizationApi.updateZone(zone.id, { name: trimmed }),
    onSuccess: (updated) => {
      void client.invalidateQueries({ queryKey: ['zone', zone.id] });
      void client.invalidateQueries({ queryKey: ['zones'] });
      toast.success('Zone renamed', { description: `${zone.name} is now ${updated?.name || trimmed}.` });
    },
  });

  return (
    <FormSection title="Name" description="What the people who work there call it. Renaming does not relabel past readings.">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (dirty && trimmed) rename.mutate();
        }}
        style={{ display: 'grid', gap: 'var(--space-5)' }}
      >
        <Input
          id="zone-name"
          label="Zone name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={!trimmed ? 'A name is required.' : rename.isError ? failure(rename.error, 'The zone could not be renamed.') : undefined}
        />
        <FormActions dirty={dirty} saving={rename.isPending} disabled={!trimmed} saveLabel="Save name" onCancel={() => setName(zone.name)} />
      </form>
    </FormSection>
  );
}

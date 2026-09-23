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
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { PERMISSIONS } from '@app/permissions/permissions';
import { PermissionGate, usePermissions } from '@app/permissions/guards';
import { isApiError } from '@shared/api/errors';
import { organizationApi, type Zone } from '@shared/api/observations';
import { camerasApi } from '@shared/api/persistence';
import {
  Badge,
  Button,
  type Column,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  StatusBadge,
} from '@shared/ui/primitives';
import { Figure, PageIntro, Plane, Region, SectionRule } from '@shared/ui/product';
import { PAGE_SIZE, PagedTable } from '@shared/ui/table';

import { DangerConfirm, Failed, when } from './shared';

/* ── the list ─────────────────────────────────────────────────────────────── */

export function ZonesPage() {
  const client = useQueryClient();
  const { has } = usePermissions();
  const [offset, setOffset] = useState(0);
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const zones = useQuery({
    queryKey: ['zones', offset],
    queryFn: () => organizationApi.zones({ limit: PAGE_SIZE, offset }),
  });

  const create = useMutation({
    mutationFn: () => organizationApi.createZone({ name: name.trim() }),
    onSuccess: () => {
      setName('');
      setAdding(false);
      setFailure(null);
      void client.invalidateQueries({ queryKey: ['zones'] });
    },
    onError: (error) =>
      setFailure(isApiError(error) ? error.friendlyMessage : 'The zone could not be created.'),
  });

  const columns: ReadonlyArray<Column<Zone>> = [
    {
      key: 'name',
      header: 'Zone',
      render: (zone) => (
        <Link to={`/admin/zones/${encodeURIComponent(zone.id)}`}>{zone.name}</Link>
      ),
    },
    {
      key: 'cameras',
      header: 'Cameras',
      numeric: true,
      render: (zone) => zone.camera_count,
    },
    {
      key: 'state',
      header: 'State',
      render: (zone) =>
        zone.is_active ? (
          <StatusBadge tone="online">In use</StatusBadge>
        ) : (
          <StatusBadge tone="offline">Not in use</StatusBadge>
        ),
    },
    { key: 'created', header: 'Added', render: (zone) => when(zone.created_at) },
  ];

  if (zones.isLoading) return <LoadingState label="Reading zones" />;
  if (zones.isError) return <Failed error={zones.error} />;

  const page = zones.data;
  const rows = page?.zones ?? [];
  const cameras = rows.reduce((total, zone) => total + zone.camera_count, 0);

  return (
    <>
      <PageIntro
        eyebrow="Estate"
        title="Zones"
        standfirst="Where your cameras are. A zone is an area of one organization — the kitchen, the dine hall, billing — and every camera belongs to one."
        actions={
          <PermissionGate permission={PERMISSIONS.manageZones}>
            <Button onClick={() => setAdding((open) => !open)}>
              {adding ? 'Cancel' : 'New zone'}
            </Button>
          </PermissionGate>
        }
      />

      {adding ? (
        <Region order={2}>
          <SectionRule label="New zone" detail="A name is all a zone needs." />
          <Plane>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (name.trim()) create.mutate();
              }}
              style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '28rem' }}
            >
              <Input
                id="new-zone-name"
                label="Name"
                value={name}
                placeholder="Kitchen"
                hint="What the people who work there call it."
                onChange={(event) => setName(event.target.value)}
                autoFocus
              />
              <div>
                <Button type="submit" disabled={!name.trim() || create.isPending}>
                  {create.isPending ? 'Creating…' : 'Create zone'}
                </Button>
              </div>
              {failure ? (
                <p role="alert" style={{ margin: 0, color: 'var(--severity-critical, inherit)' }}>
                  {failure}
                </p>
              ) : null}
            </form>
          </Plane>
        </Region>
      ) : null}

      <Region order={adding ? 3 : 2}>
        <SectionRule label="Across this organization" />
        <Plane>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(11rem, 100%), 1fr))',
              gap: 'var(--space-6)',
            }}
          >
            <Figure scale="lead" label="Zones" value={String(page?.total ?? 0)} />
            <Figure
              scale="lead"
              label="Cameras placed"
              value={String(cameras)}
              detail={page && page.total > rows.length ? 'On this page' : undefined}
            />
          </div>
        </Plane>
      </Region>

      <Region order={adding ? 4 : 3}>
        <SectionRule label="Zones" />
        <PagedTable<Zone>
          columns={columns}
          rows={rows}
          rowKey={(zone) => zone.id}
          caption="Zones in this organization"
          paging={{ limit: PAGE_SIZE, offset, total: page?.total ?? 0 }}
          onPage={setOffset}
          empty={
            <EmptyState
              title="No zones yet"
              body={
                has(PERMISSIONS.manageZones)
                  ? 'Add a zone before adding a camera — a camera is placed in one.'
                  : 'Somebody with estate permissions adds these. A camera is placed in a zone.'
              }
            />
          }
        />
      </Region>
    </>
  );
}

/* ── one zone ─────────────────────────────────────────────────────────────── */

export function ZoneDetailPage() {
  const { zoneId = '' } = useParams();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

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

  const rename = useMutation({
    mutationFn: () => organizationApi.updateZone(zoneId, { name: renaming.trim() }),
    onSuccess: () => {
      setRenaming('');
      invalidate();
    },
    onError: (error) =>
      setFailure(isApiError(error) ? error.friendlyMessage : 'The zone could not be renamed.'),
  });

  const setActive = useMutation({
    mutationFn: (active: boolean) => organizationApi.updateZone(zoneId, { is_active: active }),
    onSuccess: invalidate,
    onError: (error) =>
      setFailure(isApiError(error) ? error.friendlyMessage : 'The zone could not be changed.'),
  });

  const remove = useMutation({
    mutationFn: () => organizationApi.deleteZone(zoneId),
    onSuccess: () => {
      invalidate();
      navigate('/admin/zones', { replace: true });
    },
    onError: (error) =>
      setFailure(isApiError(error) ? error.friendlyMessage : 'The zone could not be deleted.'),
  });

  if (zone.isLoading) return <LoadingState label="Reading this zone" />;
  if (zone.isError) return <Failed error={zone.error} />;
  if (!zone.data) return <ErrorState title="Zone not found" body="It may have been deleted." />;

  const it = zone.data;
  const placed = (cameras.data?.cameras ?? []).filter((camera) => camera.zone_id === zoneId);
  const holdsCameras = it.camera_count > 0;

  return (
    <>
      <PageIntro
        eyebrow="Zone"
        title={it.name}
        standfirst={
          holdsCameras
            ? `${it.camera_count} camera${it.camera_count === 1 ? '' : 's'} watch this zone.`
            : 'No camera watches this zone yet.'
        }
        meta={
          it.is_active ? (
            <StatusBadge tone="online">In use</StatusBadge>
          ) : (
            <StatusBadge tone="offline">Not in use</StatusBadge>
          )
        }
      />

      {failure ? (
        <Region order={2}>
          <Plane>
            <p role="alert" style={{ margin: 0 }}>
              {failure}
            </p>
          </Plane>
        </Region>
      ) : null}

      <Region order={failure ? 3 : 2}>
        <SectionRule
          lead
          label="Cameras here"
          detail="A camera belongs to exactly one zone. Move it from the camera's own page."
        />
        <Plane>
          {placed.length === 0 ? (
            <EmptyState
              title="No cameras here"
              body="Add a camera and choose this zone, or move an existing one to it."
            />
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-2)' }}>
              {placed.map((camera) => (
                <li key={camera.camera_key}>
                  <Link to={`/admin/cameras/${encodeURIComponent(camera.camera_key)}`}>
                    {camera.name || camera.camera_key}
                  </Link>{' '}
                  <Badge>{camera.enabled ? 'Streaming' : 'Not streaming'}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Plane>
      </Region>

      <PermissionGate permission={PERMISSIONS.manageZones}>
        <Region order={failure ? 4 : 3}>
          <SectionRule label="Name" detail="Renaming does not relabel past readings." />
          <Plane>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (renaming.trim()) rename.mutate();
              }}
              style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end', flexWrap: 'wrap' }}
            >
              <Input
                id="zone-name"
                label="Zone name"
                value={renaming || it.name}
                onChange={(event) => setRenaming(event.target.value)}
              />
              <Button type="submit" disabled={rename.isPending || !renaming.trim()}>
                {rename.isPending ? 'Saving…' : 'Save name'}
              </Button>
            </form>
          </Plane>
        </Region>

        <Region order={failure ? 5 : 4}>
          <SectionRule
            label={holdsCameras ? 'Taking it out of use' : 'Deleting it'}
            detail={
              holdsCameras
                ? 'It holds cameras, so it cannot be deleted: it is part of the record of what was watched here.'
                : 'It has never held a camera, so there is nothing to lose.'
            }
          />
          <Plane>
            {holdsCameras ? (
              <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                <p style={{ margin: 0 }}>
                  {it.camera_count} camera{it.camera_count === 1 ? '' : 's'} still belong
                  {it.camera_count === 1 ? 's' : ''} here. Move {it.camera_count === 1 ? 'it' : 'them'}{' '}
                  to another zone, or retire {it.camera_count === 1 ? 'it' : 'them'}, before deleting
                  this zone.
                </p>
                <div>
                  <Button
                    variant={it.is_active ? 'secondary' : 'primary'}
                    disabled={setActive.isPending}
                    onClick={() => setActive.mutate(!it.is_active)}
                  >
                    {it.is_active ? 'Deactivate zone' : 'Put back in use'}
                  </Button>
                </div>
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
          </Plane>
        </Region>
      </PermissionGate>
    </>
  );
}

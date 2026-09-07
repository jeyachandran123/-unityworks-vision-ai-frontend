/**
 * Sites — a first-class domain, not a form on a dashboard.
 *
 * A site is the thing an incident is attributed to, the thing a camera hangs
 * off, and the thing a report is scoped by. It was previously a two-field row
 * in a stacked administration page, which is why nothing about a site could be
 * looked at: there was no page to look at it on.
 *
 * ### Read and manage are separate, and the page says so
 *
 * `view_sites` renders everything here. `manage_sites` is what adds the
 * controls. Two people on the same role can differ on exactly that, which is
 * the point of the override engine — and it means this page is routinely
 * rendered read-only for somebody who is *not* an administrator. It has to
 * read well in that state rather than looking broken, so the read-only view is
 * the base and the controls are the addition, never the reverse.
 *
 * Hiding a control is a courtesy. The server checks the permission on every
 * write, and a hidden button is not a closed door.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { organizationApi, type Restaurant, type Zone } from '@shared/api/observations';
import { camerasApi, type Camera } from '@shared/api/persistence';
import { PERMISSIONS } from '@app/permissions/permissions';
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
import { Figure, PageIntro, Plane, Region, SectionRule } from '@shared/ui/product';

import { Failed, ObjectTabs, Pager, SearchField, useDebounced, when } from './shared';

/**
 * Timezones offered at creation.
 *
 * A short, honest list rather than the full IANA database. The site's timezone
 * decides what "yesterday's incidents" means, so it must be *chosen* — the
 * server defaults it to UTC, and a restaurant in Chennai silently filed under
 * UTC produces reports that are wrong by five and a half hours and look right.
 */
const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Dubai',
  'Europe/London',
  'America/New_York',
  'UTC',
];

const PAGE = 25;

/* ── the list ─────────────────────────────────────────────────────────────── */

export function SitesPage() {
  const { has } = usePermissions();
  const client = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [showing, setShowing] = useState<'all' | 'active' | 'inactive'>('all');
  const q = useDebounced(search);

  const params = useMemo(
    () => ({
      q: q.trim() || undefined,
      is_active: showing === 'all' ? undefined : showing === 'active',
      limit: PAGE,
      offset,
    }),
    [q, showing, offset],
  );

  const sites = useQuery({
    queryKey: ['sites', params],
    queryFn: () => organizationApi.restaurants(params),
  });

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState(TIMEZONES[0] ?? 'UTC');

  const create = useMutation({
    mutationFn: () => organizationApi.createRestaurant({ name: name.trim(), timezone }),
    onSuccess: (created) => {
      setName('');
      setCreating(false);
      void client.invalidateQueries({ queryKey: ['sites'] });
      navigate(`/admin/sites/${encodeURIComponent(created.id)}`);
    },
  });

  const columns: ReadonlyArray<Column<Restaurant>> = [
    {
      key: 'name',
      header: 'Site',
      render: (site) => (
        <Link to={`/admin/sites/${encodeURIComponent(site.id)}`}>{site.name}</Link>
      ),
    },
    { key: 'timezone', header: 'Timezone', render: (site) => site.timezone },
    { key: 'zones', header: 'Zones', render: (site) => site.zone_count },
    { key: 'cameras', header: 'Cameras', render: (site) => site.camera_count },
    {
      key: 'status',
      header: 'Status',
      render: (site) => (
        <StatusBadge tone={site.is_active ? 'online' : 'idle'}>
          {site.is_active ? 'Active' : 'Inactive'}
        </StatusBadge>
      ),
    },
    { key: 'created', header: 'Added', render: (site) => when(site.created_at) },
  ];

  return (
    <>
      <PageIntro
        eyebrow="Estate"
        title="Sites"
        standfirst="The places this organisation operates. Every camera hangs off one, and every finding is attributed to one."
        actions={
          <PermissionGate permission={PERMISSIONS.manageSites}>
            <Button onClick={() => setCreating((open) => !open)}>
              {creating ? 'Cancel' : 'Add a site'}
            </Button>
          </PermissionGate>
        }
      />

      {creating ? (
        <Region order={2}>
          <SectionRule label="New site" detail="Both fields are used from the moment it exists." />
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
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Adyar Restaurant"
                autoFocus
              />
              <Select
                label="Timezone"
                hint="Decides what a day means here. Reports and retention both read it, and it cannot be guessed from an address."
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
              >
                {TIMEZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </Select>
              <div>
                <Button type="submit" disabled={!name.trim() || create.isPending}>
                  {create.isPending ? 'Adding…' : 'Add site'}
                </Button>
              </div>
              {create.isError ? <Failed error={create.error} /> : null}
            </form>
          </Plane>
        </Region>
      ) : null}

      <Region order={creating ? 3 : 2}>
        <SectionRule
          lead
          label="Sites"
          detail={
            sites.data
              ? `${sites.data.total} in this organisation`
              : 'Reading the estate'
          }
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
                placeholder="Name or slug"
                onChange={(next) => {
                  setSearch(next);
                  setOffset(0);
                }}
              />
              <Select
                label="Showing"
                value={showing}
                onChange={(event) => {
                  setShowing(event.target.value as typeof showing);
                  setOffset(0);
                }}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
          }
        />
        <Plane>
          {sites.isLoading ? <LoadingState label="Reading sites" /> : null}
          {sites.isError ? <Failed error={sites.error} /> : null}
          {sites.data ? (
            <>
              <DataTable
                caption="Sites in this organisation"
                columns={columns}
                rows={sites.data.restaurants}
                rowKey={(site) => site.id}
                empty={
                  <EmptyState
                    title={q ? 'No site matches that' : 'No sites yet'}
                    body={
                      q
                        ? 'Try a shorter search, or clear it to see everything.'
                        : has(PERMISSIONS.manageSites)
                          ? 'Add the first one to start placing cameras.'
                          : 'Nobody has added a site to this organisation yet.'
                    }
                  />
                }
              />
              <Pager
                noun="sites"
                offset={sites.data.offset}
                limit={sites.data.limit}
                total={sites.data.total}
                count={sites.data.count}
                onOffset={setOffset}
              />
            </>
          ) : null}
        </Plane>
      </Region>
    </>
  );
}

/* ── one site ─────────────────────────────────────────────────────────────── */

export function SiteDetailPage() {
  const { siteId = '' } = useParams();

  const site = useQuery({
    queryKey: ['site', siteId],
    queryFn: () => organizationApi.restaurant(siteId),
    enabled: Boolean(siteId),
  });

  const zones = useQuery({
    queryKey: ['zones', siteId],
    queryFn: () => organizationApi.zones(siteId),
    enabled: Boolean(siteId),
  });

  const cameras = useQuery({ queryKey: ['cameras'], queryFn: camerasApi.list });

  if (site.isLoading) return <LoadingState label="Reading site" />;
  if (site.isError) return <Failed error={site.error} />;
  if (!site.data) return null;

  const here = (cameras.data?.cameras ?? []).filter((c) => c.restaurant_id === siteId);
  const base = `/admin/sites/${encodeURIComponent(siteId)}`;

  return (
    <>
      <PageIntro
        eyebrow="Site"
        title={site.data.name}
        standfirst={
          <>
            {site.data.timezone} · added {when(site.data.created_at)}
          </>
        }
        meta={
          <StatusBadge tone={site.data.is_active ? 'online' : 'idle'}>
            {site.data.is_active ? 'Active' : 'Inactive'}
          </StatusBadge>
        }
        actions={<Link to="/admin/sites">All sites</Link>}
      />

      <Region order={2}>
        <ObjectTabs
          tabs={[
            { to: base, label: 'Overview', end: true },
            { to: `${base}/zones`, label: `Zones (${zones.data?.count ?? 0})` },
            { to: `${base}/cameras`, label: `Cameras (${here.length})` },
            { to: `${base}/settings`, label: 'Settings' },
          ]}
        />
        <SiteSection site={site.data} zones={zones.data?.zones ?? []} cameras={here} />
      </Region>
    </>
  );
}

/**
 * Which tab is showing, decided from the URL.
 *
 * Read from `useParams`'s wildcard rather than held in state, so the tab is
 * part of the address: bookmarkable, linkable, and correct after a reload.
 */
function SiteSection({
  site,
  zones,
  cameras,
}: {
  site: Restaurant;
  zones: readonly Zone[];
  cameras: readonly Camera[];
}) {
  const { '*': tab = '' } = useParams();

  if (tab.startsWith('zones')) return <SiteZones site={site} zones={zones} cameras={cameras} />;
  if (tab.startsWith('cameras')) return <SiteCameras site={site} cameras={cameras} />;
  if (tab.startsWith('settings')) return <SiteSettings site={site} />;
  return <SiteOverview site={site} zones={zones} cameras={cameras} />;
}

function SiteOverview({
  site,
  zones,
  cameras,
}: {
  site: Restaurant;
  zones: readonly Zone[];
  cameras: readonly Camera[];
}) {
  const streaming = cameras.filter((c) => c.enabled).length;
  const analysed = cameras.filter((c) => c.enabled && c.analysis_enabled).length;
  const placed = cameras.filter((c) => c.zone_id).length;

  return (
    <>
      <SectionRule
        lead
        label="At this site"
        detail="What is configured here, and how much of it is actually working."
      />
      <Plane>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(11rem, 100%), 1fr))',
            gap: 'var(--space-6)',
          }}
        >
          <Figure scale="lead" label="Zones" value={String(zones.length)} />
          <Figure scale="lead" label="Cameras" value={String(cameras.length)} />
          <Figure
            scale="lead"
            label="Streaming"
            value={`${streaming} of ${cameras.length}`}
            detail={
              streaming === cameras.length
                ? 'Every camera here is switched on.'
                : 'A camera that is off opens no connection and costs nothing.'
            }
          />
          <Figure
            scale="lead"
            label="Analysed"
            value={String(analysed)}
            detail="Streaming to the wall and processed by AI are two decisions."
          />
        </div>

        {cameras.length > placed ? (
          <p style={{ marginTop: 'var(--space-6)', color: 'var(--text-secondary)' }}>
            {cameras.length - placed} camera{cameras.length - placed === 1 ? ' is' : 's are'} at
            this site but not in a zone. Findings from{' '}
            {cameras.length - placed === 1 ? 'it' : 'them'} can be attributed to the site but not
            to a room.
          </p>
        ) : null}
      </Plane>

      <div style={{ marginTop: 'var(--space-8)' }}>
        <SectionRule label="Identity" />
        <Plane>
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, auto) minmax(0, 1fr)',
              gap: 'var(--space-3) var(--space-6)',
              margin: 0,
            }}
          >
            {[
              ['Name', site.name],
              ['Handle', site.slug],
              ['Timezone', site.timezone],
              ['Added', when(site.created_at)],
            ].map(([term, value]) => (
              <div key={term} style={{ display: 'contents' }}>
                <dt style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>{term}</dt>
                <dd style={{ margin: 0 }}>{value}</dd>
              </div>
            ))}
          </dl>
        </Plane>
      </div>
    </>
  );
}

function SiteZones({
  site,
  zones,
  cameras,
}: {
  site: Restaurant;
  zones: readonly Zone[];
  cameras: readonly Camera[];
}) {
  const client = useQueryClient();
  const [name, setName] = useState('');

  const create = useMutation({
    mutationFn: () => organizationApi.createZone({ restaurant_id: site.id, name: name.trim() }),
    onSuccess: () => {
      setName('');
      void client.invalidateQueries({ queryKey: ['zones'] });
      void client.invalidateQueries({ queryKey: ['site', site.id] });
    },
  });

  const columns: ReadonlyArray<Column<Zone>> = [
    { key: 'name', header: 'Zone', render: (zone) => zone.name },
    {
      key: 'cameras',
      header: 'Cameras',
      render: (zone) => cameras.filter((c) => c.zone_id === zone.id).length,
    },
    { key: 'created', header: 'Added', render: (zone) => when(zone.created_at) },
  ];

  return (
    <>
      <SectionRule
        lead
        label="Zones"
        detail={`The areas inside ${site.name}. A camera is placed in one, and its findings are attributed there.`}
      />
      <Plane>
        <DataTable
          caption={`Zones at ${site.name}`}
          columns={columns}
          rows={zones}
          rowKey={(zone) => zone.id}
          empty={
            <EmptyState
              title="No zones yet"
              body="Add the rooms you want findings attributed to — a kitchen, a prep area, a store."
            />
          }
        />
      </Plane>

      <PermissionGate permission={PERMISSIONS.manageZones}>
        <div style={{ marginTop: 'var(--space-8)' }}>
          <SectionRule
            label="Add a zone"
            detail={`It belongs to ${site.name}. Nothing else to choose — you are already inside the site.`}
          />
          <Plane>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (name.trim()) create.mutate();
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
                placeholder="Kitchen"
                onChange={(event) => setName(event.target.value)}
              />
              <Button type="submit" disabled={!name.trim() || create.isPending}>
                {create.isPending ? 'Adding…' : 'Add zone'}
              </Button>
            </form>
            {create.isError ? <Failed error={create.error} /> : null}
          </Plane>
        </div>
      </PermissionGate>
    </>
  );
}

function SiteCameras({ site, cameras }: { site: Restaurant; cameras: readonly Camera[] }) {
  const columns: ReadonlyArray<Column<Camera>> = [
    {
      key: 'name',
      header: 'Camera',
      render: (camera) => (
        <Link to={`/admin/cameras/${encodeURIComponent(camera.camera_key)}`}>{camera.name}</Link>
      ),
    },
    { key: 'key', header: 'Key', render: (camera) => <Badge>{camera.camera_key}</Badge> },
    { key: 'channel', header: 'Channel', render: (camera) => camera.channel },
    {
      key: 'state',
      header: 'State',
      render: (camera) => (
        <StatusBadge tone={camera.enabled ? 'online' : 'idle'}>
          {camera.enabled ? 'On' : 'Off'}
        </StatusBadge>
      ),
    },
    {
      key: 'analysis',
      header: 'Analysis',
      render: (camera) => (camera.analysis_enabled ? 'On' : 'Off'),
    },
  ];

  return (
    <>
      <SectionRule
        lead
        label="Cameras"
        detail={`Everything watching ${site.name}.`}
        actions={
          <PermissionGate permission={PERMISSIONS.manageCameras}>
            <Link to={`/admin/cameras/new?site=${encodeURIComponent(site.id)}`}>Add a camera</Link>
          </PermissionGate>
        }
      />
      <Plane>
        <DataTable
          caption={`Cameras at ${site.name}`}
          columns={columns}
          rows={cameras}
          rowKey={(camera) => camera.camera_key}
          empty={
            <EmptyState
              title="No cameras here"
              body="Nothing is watching this site yet."
            />
          }
        />
      </Plane>
    </>
  );
}

function SiteSettings({ site }: { site: Restaurant }) {
  const client = useQueryClient();
  const [name, setName] = useState(site.name);
  const [timezone, setTimezone] = useState(site.timezone);
  const [active, setActive] = useState(site.is_active);

  const save = useMutation({
    mutationFn: () =>
      organizationApi.updateRestaurant(site.id, {
        name: name.trim(),
        timezone,
        is_active: active,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['site', site.id] });
      void client.invalidateQueries({ queryKey: ['sites'] });
    },
  });

  const dirty = name.trim() !== site.name || timezone !== site.timezone || active !== site.is_active;
  const options = TIMEZONES.includes(site.timezone) ? TIMEZONES : [site.timezone, ...TIMEZONES];

  return (
    <>
      <SectionRule
        lead
        label="Settings"
        detail="Renaming a site changes how every past incident attributed to it reads. It is recorded in the audit trail."
      />
      <Plane>
        <PermissionGate
          permission={PERMISSIONS.manageSites}
          fallback={
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
              You can read this site's settings but not change them. Editing a site needs{' '}
              <code>manage_sites</code>.
            </p>
          }
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (dirty) save.mutate();
            }}
            style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '32rem' }}
          >
            <Input
              label="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Select
              label="Timezone"
              hint="What a day means here. Changing it changes how reports are bucketed from now on."
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
            >
              {options.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </Select>
            <label style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
                style={{ marginTop: '0.25rem' }}
              />
              <span>
                <strong style={{ display: 'block' }}>Active</strong>
                <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                  An inactive site is kept, with its history, and stops appearing as somewhere to
                  place new cameras.
                </span>
              </span>
            </label>
            <div>
              <Button type="submit" disabled={!dirty || save.isPending}>
                {save.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
            {save.isError ? <Failed error={save.error} /> : null}
          </form>

          <p
            style={{
              marginTop: 'var(--space-6)',
              color: 'var(--text-muted)',
              fontSize: 'var(--text-sm)',
            }}
          >
            The handle <code>{site.slug}</code> cannot be changed. It is the stable identifier
            other records are formed from, and renaming it would orphan them.
          </p>
        </PermissionGate>
      </Plane>
    </>
  );
}

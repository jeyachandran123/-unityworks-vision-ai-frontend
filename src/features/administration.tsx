/**
 * Administration — sites, zones, and who holds which role.
 *
 * ### The write path is real for structure and absent for identity
 *
 * Restaurants and zones are created and renamed here, gated on
 * `manage_organization` and audited on the server. Users are **listed only**.
 *
 * That asymmetry is deliberate and the backend states it in the payload:
 * `write_available: false`, with the reason. Creating an account issues a
 * credential, and every safe way to do that needs a delivery channel this
 * deployment does not have yet. The page shows the sentence the server sent
 * rather than a disabled button with no explanation — a control that looks
 * broken teaches an operator to distrust the ones that work.
 *
 * ### Permission shapes what renders, and never what is enforced
 *
 * `PermissionGate` hides the forms from an account that cannot use them. That
 * is a courtesy. The server checks `MANAGE_ORGANIZATION` on every write, and a
 * hidden form is not a closed door.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  organizationApi,
  type OrgUser,
  type Restaurant,
  type Zone,
} from '@shared/api/observations';
import { isApiError } from '@shared/api/errors';
import { PERMISSIONS } from '@app/permissions/permissions';
import { PermissionGate } from '@app/permissions/guards';
import {
  Badge,
  Button,
  Card,
  type Column,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  SectionHeader,
  StatCard,
  StatusBadge,
} from '@shared/ui/primitives';

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
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString();
}

export function AdministrationPage() {
  const client = useQueryClient();

  const restaurants = useQuery({
    queryKey: ['restaurants'],
    queryFn: organizationApi.restaurants,
  });
  const zones = useQuery({ queryKey: ['zones'], queryFn: () => organizationApi.zones() });
  const users = useQuery({ queryKey: ['users'], queryFn: organizationApi.users });

  const [siteName, setSiteName] = useState('');
  const [zoneName, setZoneName] = useState('');
  const [zoneSite, setZoneSite] = useState('');

  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ['restaurants'] });
    void client.invalidateQueries({ queryKey: ['zones'] });
  };

  const createSite = useMutation({
    mutationFn: (name: string) => organizationApi.createRestaurant({ name }),
    onSuccess: () => {
      setSiteName('');
      invalidate();
    },
  });

  const createZone = useMutation({
    mutationFn: (draft: { restaurant_id: string; name: string }) =>
      organizationApi.createZone(draft),
    onSuccess: () => {
      setZoneName('');
      invalidate();
    },
  });

  if (restaurants.isPending) return <LoadingState label="Loading organisation" />;
  if (restaurants.isError) return <Failed error={restaurants.error} />;

  const sites = restaurants.data.restaurants;

  const siteColumns: ReadonlyArray<Column<Restaurant>> = [
    { key: 'name', header: 'Site', render: (r) => r.name },
    { key: 'slug', header: 'Handle', render: (r) => r.slug, width: '12rem' },
    { key: 'timezone', header: 'Timezone', render: (r) => r.timezone, width: '11rem' },
    { key: 'zones', header: 'Zones', render: (r) => r.zone_count, numeric: true, width: '6rem' },
    {
      key: 'cameras',
      header: 'Cameras',
      render: (r) => r.camera_count,
      numeric: true,
      width: '7rem',
    },
    {
      key: 'state',
      header: 'State',
      render: (r) =>
        r.is_active ? (
          <StatusBadge tone="online">Active</StatusBadge>
        ) : (
          <StatusBadge tone="idle">Inactive</StatusBadge>
        ),
      width: '8rem',
    },
  ];

  const zoneColumns: ReadonlyArray<Column<Zone>> = [
    { key: 'name', header: 'Zone', render: (z) => z.name },
    {
      key: 'site',
      header: 'Site',
      render: (z) => sites.find((s) => s.id === z.restaurant_id)?.name ?? '—',
    },
    {
      key: 'cameras',
      header: 'Cameras',
      render: (z) => z.camera_count,
      numeric: true,
      width: '7rem',
    },
  ];

  const userColumns: ReadonlyArray<Column<OrgUser>> = [
    { key: 'email', header: 'Account', render: (u) => u.email },
    { key: 'name', header: 'Name', render: (u) => u.display_name || '—' },
    {
      key: 'roles',
      header: 'Roles',
      render: (u) => (
        <span style={{ display: 'inline-flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
          {u.roles.length === 0 ? (
            // A user with no role holds no permission at all. Worth showing as
            // its own state rather than as an empty cell.
            <Badge>no role assigned</Badge>
          ) : (
            u.roles.map((role) => <Badge key={role}>{role.replace(/_/g, ' ')}</Badge>)
          )}
        </span>
      ),
    },
    {
      key: 'state',
      header: 'State',
      render: (u) =>
        u.is_active ? (
          <StatusBadge tone="online">Active</StatusBadge>
        ) : (
          <StatusBadge tone="idle">Disabled</StatusBadge>
        ),
      width: '8rem',
    },
    { key: 'seen', header: 'Last sign-in', render: (u) => when(u.last_login_at), width: '11rem' },
  ];

  return (
    <>
      <PageHeader
        title="Administration"
        description="Sites, zones and accounts. Renaming a site changes how every incident attributed to it reads afterwards, so each change here is recorded in the audit trail."
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <StatCard label="Sites" value={sites.length} detail="Restaurants in this organisation" />
        <StatCard
          label="Zones"
          value={zones.isSuccess ? zones.data.count : null}
          unavailableReason={zones.isError ? 'Zones could not be read' : 'Loading'}
          detail="Named areas across every site"
        />
        <StatCard
          label="Accounts"
          value={users.isSuccess ? users.data.count : null}
          unavailableReason={
            users.isError ? 'Your account does not read users' : 'Loading'
          }
          detail="People who can sign in"
        />
      </div>

      {/* ── Sites ── */}
      <Card>
        <SectionHeader
          title="Sites"
          description="A site maps to a Vision OS location. Its handle is fixed once created, because other records are formed from it."
        />
        <DataTable
          columns={siteColumns}
          rows={sites}
          rowKey={(site) => site.id}
          caption="Restaurants in this organisation, with their zone and camera counts"
          empty={
            <EmptyState
              title="No sites yet"
              body="Add the first restaurant. Cameras and zones are attached to a site, so this comes first."
            />
          }
        />

        <PermissionGate permission={PERMISSIONS.manageOrganization}>
          <div style={{ marginTop: 'var(--space-5)', display: 'grid', gap: 'var(--space-3)' }}>
            <SectionHeader title="Add a site" />
            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, maxWidth: '24rem' }}>
                <Input
                  label="Site name"
                  hint="For example: Harbour Kitchen"
                  value={siteName}
                  onChange={(event) => setSiteName(event.target.value)}
                />
              </div>
              <Button
                variant="primary"
                loading={createSite.isPending}
                disabled={siteName.trim().length === 0}
                onClick={() => createSite.mutate(siteName.trim())}
              >
                Add site
              </Button>
            </div>
            {createSite.isError ? <Failed error={createSite.error} /> : null}
          </div>
        </PermissionGate>
      </Card>

      {/* ── Zones ── */}
      <div style={{ marginTop: 'var(--space-6)' }}>
        <Card>
          <SectionHeader
            title="Zones"
            description="A named area within a site — a prep line, a wash station. Zones are what let a report say where something happened without naming a camera."
          />
          {zones.isPending ? (
            <LoadingState label="Loading zones" />
          ) : zones.isError ? (
            <Failed error={zones.error} />
          ) : (
            <DataTable
              columns={zoneColumns}
              rows={zones.data.zones}
              rowKey={(zone) => zone.id}
              caption="Zones across every site in this organisation"
              empty={
                <EmptyState
                  title="No zones yet"
                  body="Zones are optional. Add one when a site needs to be reported on by area rather than by camera."
                />
              }
            />
          )}

          <PermissionGate permission={PERMISSIONS.manageOrganization}>
            <div style={{ marginTop: 'var(--space-5)', display: 'grid', gap: 'var(--space-3)' }}>
              <SectionHeader title="Add a zone" />
              {sites.length === 0 ? (
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-tertiary)' }}>
                  A zone belongs to a site. Add a site first.
                </p>
              ) : (
                <>
                  <div
                    style={{
                      display: 'flex',
                      gap: 'var(--space-3)',
                      alignItems: 'flex-end',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ minWidth: '14rem' }}>
                      <label
                        htmlFor="zone-site"
                        style={{
                          display: 'block',
                          fontSize: 'var(--text-xs)',
                          fontWeight: 'var(--weight-medium)',
                          color: 'var(--ink-secondary)',
                          marginBottom: 'var(--space-2)',
                        }}
                      >
                        Site
                      </label>
                      <select
                        id="zone-site"
                        value={zoneSite || sites[0]?.id || ''}
                        onChange={(event) => setZoneSite(event.target.value)}
                        style={{
                          padding: '0.45rem 0.6rem',
                          background: 'var(--surface-sunken)',
                          border: '1px solid var(--line-default)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--ink-primary)',
                          fontSize: 'var(--text-sm)',
                          minWidth: '14rem',
                        }}
                      >
                        {sites.map((site) => (
                          <option key={site.id} value={site.id}>
                            {site.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ flex: 1, maxWidth: '20rem' }}>
                      <Input
                        label="Zone name"
                        hint="For example: Prep line"
                        value={zoneName}
                        onChange={(event) => setZoneName(event.target.value)}
                      />
                    </div>
                    <Button
                      variant="primary"
                      loading={createZone.isPending}
                      disabled={zoneName.trim().length === 0}
                      onClick={() =>
                        createZone.mutate({
                          restaurant_id: zoneSite || sites[0]!.id,
                          name: zoneName.trim(),
                        })
                      }
                    >
                      Add zone
                    </Button>
                  </div>
                  {createZone.isError ? <Failed error={createZone.error} /> : null}
                </>
              )}
            </div>
          </PermissionGate>
        </Card>
      </div>

      {/* ── Accounts ── */}
      <div style={{ marginTop: 'var(--space-6)' }}>
        <Card>
          <SectionHeader
            title="Accounts"
            description="Who can sign in, and what each account may reach. Roles are assigned directly for now."
          />
          {users.isPending ? (
            <LoadingState label="Loading accounts" />
          ) : users.isError ? (
            <Failed error={users.error} />
          ) : (
            <>
              <DataTable
                columns={userColumns}
                rows={users.data.users}
                rowKey={(user) => user.id}
                caption="Accounts in this organisation, with their roles and last sign-in"
                empty={
                  <EmptyState
                    title="No accounts listed"
                    body="This organisation has no user records your account can read."
                  />
                }
              />
              {!users.data.write_available ? (
                // The server's own sentence, not a paraphrase. It is the one
                // place that knows why, and it may become true later.
                <div style={{ marginTop: 'var(--space-4)' }}>
                  <EmptyState
                    title="Accounts cannot be created here yet"
                    body={users.data.write_unavailable_reason}
                  />
                </div>
              ) : null}
            </>
          )}
        </Card>
      </div>
    </>
  );
}

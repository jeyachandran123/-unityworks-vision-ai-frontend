/**
 * The organization chooser — pick one, then enter the application.
 *
 * ### What this page is not
 *
 * It is not a dashboard, it is not a second Command Center, and it is **not the
 * Platform Control Plane**. It is the one screen that sits between signing in
 * and the organization application, and its only job is to let somebody
 * recognise the customer they meant and go in. Everything after that click is
 * the application that was already there.
 *
 * ### Why it is not at `/platform` any more
 *
 * Because most of the people who see it are not platform administrators. A
 * multi-organization `org_admin` — somebody who manages two restaurant groups
 * and nothing else — owes an organization choice and must never be shown a
 * cross-customer console. Serving both from one address made the chooser's
 * audience and the control plane's audience look like one group; they are not,
 * and the difference is a security boundary rather than a layout preference.
 *
 * A platform operator reaching this page sees the same chooser, plus a way into
 * the console. Everyone else sees only their own organizations.
 *
 * That is why it shows a name, a status and two counts and stops. A chooser
 * that reported incident rates would be answering a question the Command Center
 * behind it answers better, and would make the operator read a report to decide
 * which report to read.
 *
 * ### It renders outside `AppShell`, deliberately
 *
 * Before an organization is chosen there is no organization context, so there
 * is nothing for the sidebar to be *about*. Rendering the product navigation
 * here would offer Live Wall and Incidents for an organization the session is
 * not yet in — every one of which the backend would refuse, correctly, and
 * confusingly.
 *
 * ### Two data sources, because there are two questions
 *
 * A member asks "which of my organizations?" and is answered from
 * `GET /auth/organizations` — membership, and nothing else. A platform operator
 * asks "which customer?" and is answered from `GET /platform/organizations`,
 * which requires a different principal entirely. They are not merged into one
 * endpoint: an endpoint that answers both would be a second authorization
 * system, and the second one is always the one that turns out to be wrong.
 *
 * ### An operator who is also a member enters through the member door
 *
 * If one of the organizations an operator can see is one they actually belong
 * to, selecting it uses their **membership** — their real roles, their real
 * camera scope — rather than a read-only operator entry. Entering their own
 * organization as a stranger would be a worse experience and a misleading audit
 * row.
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@app/auth/AuthProvider';
import { platformApi, type Organization } from '@shared/api/platform';
import type { OrganizationSummary } from '@shared/api/services';
import { isApiError } from '@shared/api/errors';
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  StatusBadge,
  type HealthTone,
} from '@shared/ui/primitives';
import { Icon, ControlIcons } from '@shared/ui/icons';

const TONE: Record<string, HealthTone> = {
  active: 'online',
  suspended: 'degraded',
  archived: 'offline',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  suspended: 'Suspended',
  archived: 'Archived',
};

/** What a status means for somebody about to walk into it. */
const STATUS_NOTE: Record<string, string> = {
  active: '',
  suspended: 'Reads work. Changes are refused and cameras are stopped.',
  archived: 'Cannot be entered. Nobody may sign in to an archived organization.',
};

export function OrganizationChooser() {
  const navigate = useNavigate();
  const { user, organizations, isPlatformOperator, selectOrganization, enterOrganization } =
    useAuth();

  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  /**
   * The operator's cross-customer list. Not fetched at all for an ordinary
   * member — the request would 403, and the answer is already in `organizations`.
   */
  const everyOrganization = useQuery({
    queryKey: ['platform-organizations-chooser'],
    queryFn: () => platformApi.organizations({ limit: 200 }),
    enabled: isPlatformOperator,
    retry: false,
  });

  const memberOf = useMemo(
    () => new Set(organizations.map((organization) => organization.id)),
    [organizations],
  );

  const rows: OrganizationSummary[] = useMemo(() => {
    const source: OrganizationSummary[] = isPlatformOperator
      ? (everyOrganization.data?.organizations ?? []).map(toSummary)
      : organizations;

    const needle = search.trim().toLowerCase();
    if (!needle) return source;
    return source.filter(
      (organization) =>
        organization.name.toLowerCase().includes(needle) ||
        organization.id.toLowerCase().includes(needle),
    );
  }, [isPlatformOperator, everyOrganization.data, organizations, search]);

  async function open(organization: OrganizationSummary) {
    setFailure(null);
    setBusy(organization.id);
    try {
      // Membership first. An operator standing in front of their own
      // organization should go in as themselves, not as a read-only visitor.
      if (memberOf.has(organization.id)) {
        await selectOrganization(organization.id);
      } else {
        await enterOrganization(organization.id);
      }
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setBusy(null);
      if (isApiError(error)) {
        setFailure(
          error.kind === 'forbidden'
            ? `You do not have access to ${organization.name}.`
            : error.friendlyMessage,
        );
        return;
      }
      setFailure(`${organization.name} could not be opened.`);
    }
  }

  const loading = isPlatformOperator && everyOrganization.isLoading;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--atmosphere, var(--ground))',
        backgroundAttachment: 'fixed',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Masthead />

      <main
        id="main"
        style={{
          flex: 1,
          width: '100%',
          maxWidth: 'var(--content-max)',
          margin: '0 auto',
          padding: 'var(--space-10) var(--space-6) var(--space-12)',
        }}
      >
        <header style={{ marginBottom: 'var(--space-8)' }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-2xs)',
              letterSpacing: 'var(--tracking-wider)',
              textTransform: 'uppercase',
              color: 'var(--ink-tertiary)',
            }}
          >
            Platform
          </div>
          <h1
            style={{
              margin: 'var(--space-2) 0 0',
              fontSize: 'var(--text-2xl)',
              fontWeight: 'var(--weight-semibold)',
              letterSpacing: 'var(--tracking-tight)',
            }}
          >
            {isPlatformOperator ? 'Choose a customer' : 'Choose an organization'}
          </h1>
          <p
            style={{
              margin: 'var(--space-3) 0 0',
              maxWidth: 'var(--measure-tight)',
              color: 'var(--ink-secondary)',
              lineHeight: 'var(--leading-relaxed)',
            }}
          >
            {isPlatformOperator
              ? 'Entering a customer opens their application read-only and records that you did. Evidence, patron identity and the audit trail stay closed.'
              : 'Everything after this point — the Command Center, the wall, alerts, reports — belongs to the organization you pick.'}
          </p>
        </header>

        {isPlatformOperator && rows.length > 6 ? (
          <div style={{ maxWidth: '22rem', marginBottom: 'var(--space-6)' }}>
            <Input
              label="Find an organization"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name or id"
            />
          </div>
        ) : null}

        {failure ? (
          <div
            role="alert"
            style={{
              marginBottom: 'var(--space-5)',
              padding: 'var(--space-3) var(--space-4)',
              border: '1px solid var(--line-default)',
              borderLeft: '3px solid var(--state-critical, var(--ink-primary))',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-raised)',
              fontSize: 'var(--text-sm)',
            }}
          >
            {failure}
          </div>
        ) : null}

        {loading ? <LoadingState label="Loading organizations" /> : null}

        {!loading && everyOrganization.isError ? (
          <ErrorState
            title="organizations could not be loaded"
            body="The platform list is unavailable. Any organization you are a member of is still listed below."
          />
        ) : null}

        {!loading && rows.length === 0 ? (
          <EmptyState
            title="No organizations"
            body={
              isPlatformOperator
                ? 'No organization matches. Create one in the management console.'
                : 'This account is not a member of any organization. Contact your administrator.'
            }
          />
        ) : null}

        <ul
          aria-label="organizations"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'grid',
            gap: 'var(--space-4)',
            gridTemplateColumns: 'repeat(auto-fill, minmax(19rem, 1fr))',
          }}
        >
          {rows.map((organization) => (
            <OrganizationCard
              key={organization.id}
              organization={organization}
              active={organization.id === user?.tenant_id}
              asMember={memberOf.has(organization.id)}
              operator={isPlatformOperator}
              busy={busy === organization.id}
              disabled={busy !== null}
              onOpen={() => void open(organization)}
            />
          ))}
        </ul>

        {isPlatformOperator ? (
          <p style={{ marginTop: 'var(--space-8)', fontSize: 'var(--text-sm)' }}>
            <Button variant="ghost" size="sm" onClick={() => navigate('/platform')}>
              Platform control plane
              <Icon icon={ControlIcons.goTo} size="inline" />
            </Button>
            <span style={{ marginLeft: 'var(--space-3)', color: 'var(--ink-tertiary)' }}>
              organizations, people, operators and access — above every customer, in its own
              console. A different job from entering one.
            </span>
          </p>
        ) : null}
      </main>
    </div>
  );
}

function OrganizationCard({
  organization,
  active,
  asMember,
  operator,
  busy,
  disabled,
  onOpen,
}: {
  organization: OrganizationSummary;
  active: boolean;
  asMember: boolean;
  operator: boolean;
  busy: boolean;
  disabled: boolean;
  onOpen: () => void;
}) {
  const status = String(organization.status || '').toLowerCase();
  const archived = status === 'archived';
  const note = STATUS_NOTE[status] ?? '';

  return (
    <li
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-raised)',
        border: '1px solid var(--line-default)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-5)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 'var(--text-base)',
              fontWeight: 'var(--weight-semibold)',
              letterSpacing: 'var(--tracking-tight)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {organization.name}
          </div>
          <div
            style={{
              marginTop: 2,
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-2xs)',
              color: 'var(--ink-tertiary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {organization.id}
          </div>
        </div>
        <StatusBadge tone={TONE[status] ?? 'idle'}>{STATUS_LABEL[status] ?? status}</StatusBadge>
      </div>

      {/* Two counts, because two is what tells one customer from another at a
          glance. A number, never a dash: these come from the same query for
          every row, so a zero here is a real zero. */}
      <dl
        style={{
          display: 'flex',
          gap: 'var(--space-6)',
          margin: 'var(--space-5) 0 0',
        }}
      >
        <Count label="Sites" value={organization.site_count} />
        <Count label="Cameras" value={organization.camera_count} />
      </dl>

      {note ? (
        <p
          style={{
            margin: 'var(--space-4) 0 0',
            fontSize: 'var(--text-xs)',
            color: 'var(--ink-tertiary)',
            lineHeight: 'var(--leading-relaxed)',
          }}
        >
          {note}
        </p>
      ) : null}

      <div
        style={{
          marginTop: 'auto',
          paddingTop: 'var(--space-5)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
        }}
      >
        <Button onClick={onOpen} disabled={disabled || archived} size="sm">
          {busy ? 'Opening…' : active ? 'Continue' : 'Enter organization'}
        </Button>
        {/* Said before the click, not discovered after it. An operator entering
            a customer they do not belong to gets a read-only session, and that
            is a different thing from the session they get in their own. */}
        {operator && !asMember && !archived ? (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-2xs)',
              letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase',
              color: 'var(--ink-tertiary)',
            }}
          >
            Read-only · audited
          </span>
        ) : null}
      </div>
    </li>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-2xs)',
          letterSpacing: 'var(--tracking-wider)',
          textTransform: 'uppercase',
          color: 'var(--ink-tertiary)',
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          margin: '2px 0 0',
          fontSize: 'var(--text-xl)',
          fontWeight: 'var(--weight-semibold)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </dd>
    </div>
  );
}

/** The identity bar. No navigation on it — there is nowhere to navigate yet. */
function Masthead() {
  const { user, logout } = useAuth();
  return (
    <header
      style={{
        height: 'var(--topbar-height)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: '0 var(--space-6)',
        borderBottom: '1px solid var(--line-subtle)',
        background: 'var(--surface-raised)',
      }}
    >
      <span
        style={{
          fontSize: 'var(--text-sm)',
          fontWeight: 'var(--weight-semibold)',
          letterSpacing: 'var(--tracking-tight)',
        }}
      >
        UnityWorks Vision AI
      </span>
      <span style={{ flex: 1 }} />
      <span
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--ink-tertiary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '18rem',
        }}
      >
        {user?.display_name || user?.subject}
      </span>
      <Button variant="ghost" size="sm" onClick={() => void logout()}>
        Sign out
      </Button>
    </header>
  );
}

/** The operator's richer row, narrowed to what a chooser may show. */
function toSummary(organization: Organization): OrganizationSummary {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    status: organization.status,
    site_count: organization.site_count,
    camera_count: organization.camera_count,
  };
}

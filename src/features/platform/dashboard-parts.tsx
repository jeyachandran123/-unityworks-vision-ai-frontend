/**
 * The control plane dashboard's instruments.
 *
 * Presentational only: every decision about what a count means was already
 * made in `dashboard-model.ts`, and these components draw the result. Each one
 * keeps the product's null contract — a proportion with no denominator is a
 * sentence, never an empty ring or a bar of zeros.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { roleLabel } from '@app/permissions/permissions';
import type { ActivityDay, ActivityRow, FleetRow } from '@shared/api/platform';
import { AttentionIcons, ControlIcons, Icon, PlatformIcons, type LucideIcon } from '@shared/ui/icons';
import { Button, EmptyState, StatusBadge, type HealthTone } from '@shared/ui/primitives';
import { GoTo } from '@shared/ui/product';

import {
  ACTIVITY_CATEGORIES,
  activityCategory,
  activitySentence,
  chartDayLabel,
  clockTime,
  fleetFlags,
  groupByDay,
  organizationPath,
  plural,
  relativeTime,
  type ActivityCategory,
  type Band,
  type FleetFlag,
  type QueueItem,
} from './dashboard-model';

/* ── the attention queue, beside the headline ─────────────────────────────── */

const QUEUE_TONE = {
  critical: { color: 'var(--severity-critical)', icon: AttentionIcons.critical, word: 'Urgent' },
  attention: { color: 'var(--severity-medium)', icon: AttentionIcons.attention, word: 'Look' },
} as const;

function Road({ to, children, className, label }: { to: string; children: ReactNode; className?: string; label?: string }) {
  // A `#fragment` is a place on this page; anything else is a route.
  return to.startsWith('#') ? (
    <a href={to} className={className} aria-label={label}>
      {children}
    </a>
  ) : (
    <Link to={to} className={className} aria-label={label}>
      {children}
    </Link>
  );
}

export function AttentionList({ items }: { items: QueueItem[] }) {
  return (
    <div>
      <div className="uwv-mini-label" style={{ marginBottom: 'var(--space-3)' }}>
        In order of urgency
      </div>
      <ol className="uwv-queue">
        {items.map((item) => {
          const tone = QUEUE_TONE[item.tone];
          return (
            <li key={item.key}>
              <Road to={item.to} className="uwv-queue-row">
                <span style={{ color: tone.color, display: 'flex', flexShrink: 0 }}>
                  <Icon icon={tone.icon} size="inline" />
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className="uwv-queue-title">{item.title}</span>
                  <span className="uwv-queue-detail">
                    <span className="sr-only">{tone.word}: </span>
                    {item.detail}
                  </span>
                </span>
                <span className="uwv-queue-go" aria-hidden="true">
                  <Icon icon={ControlIcons.goTo} size="inline" />
                </span>
              </Road>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ── a headline instrument ────────────────────────────────────────────────── */

export function KpiTile({
  icon,
  label,
  value,
  unit,
  badge,
  visual,
  children,
  road,
}: {
  icon: LucideIcon;
  label: string;
  value: number | null;
  /** Said after the number, quieter: "of 23 switched on". */
  unit?: ReactNode;
  badge?: ReactNode;
  /** A small drawing beside the number — a ring, a run of bars. */
  visual?: ReactNode;
  children?: ReactNode;
  road?: { to: string; label: string };
}) {
  return (
    <article className="uwv-kpi" data-figure={label} aria-label={label}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <span className="uwv-kpi-icon" aria-hidden="true">
          <Icon icon={icon} size="inline" />
        </span>
        <span className="uwv-mini-label" style={{ flex: 1, minWidth: 0 }}>
          {label}
        </span>
        {badge}
      </header>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-4)', minHeight: '3.5rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="uwv-kpi-value">{value === null ? '—' : value.toLocaleString()}</span>
          {unit ? <span className="uwv-kpi-unit">{unit}</span> : null}
        </div>
        {visual}
      </div>

      {children ? <div style={{ display: 'grid', gap: 'var(--space-3)' }}>{children}</div> : null}

      {road ? (
        <div style={{ marginTop: 'auto', paddingTop: 'var(--space-1)' }}>
          <Road to={road.to}>
            <GoTo>{road.label}</GoTo>
          </Road>
        </div>
      ) : null}
    </article>
  );
}

/** A small "+1 this month" mark. Neutral: growth is a fact, not a cheer. */
export function DeltaBadge({ children, icon }: { children: ReactNode; icon?: LucideIcon }) {
  return (
    <span className="uwv-delta">
      {icon ? <Icon icon={icon} size="inline" /> : null}
      {children}
    </span>
  );
}

/* ── a proportion, as a ring ──────────────────────────────────────────────── */

/**
 * `value` of `total`, drawn as a ring — and only with a real denominator.
 *
 * With nothing switched on there is no share to draw, and an empty ring would
 * read exactly like "everything is off". The caller says so in words instead.
 */
export function RingGauge({ value, total, label }: { value: number; total: number; label: string }) {
  if (total <= 0) return null;
  const share = Math.max(0, Math.min(1, value / total));
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const percent = Math.round(share * 100);
  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 56 56"
      role="img"
      aria-label={`${label}: ${value} of ${total}`}
      style={{ flexShrink: 0 }}
    >
      <circle cx="28" cy="28" r={radius} fill="none" stroke="var(--surface-sunken)" strokeWidth="6" />
      <circle
        cx="28"
        cy="28"
        r={radius}
        fill="none"
        stroke={share === 0 ? 'var(--severity-critical)' : 'var(--health-online)'}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${circumference * share} ${circumference}`}
        transform="rotate(-90 28 28)"
        style={{ transition: 'stroke-dasharray var(--motion-slow) var(--ease-out)' }}
      />
      <text
        x="28"
        y="31"
        textAnchor="middle"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          fontWeight: 600,
          fill: 'var(--ink-secondary)',
        }}
      >
        {percent}%
      </text>
    </svg>
  );
}

/* ── a fortnight, as bars ─────────────────────────────────────────────────── */

/**
 * Platform acts per day, with the refused share of each day stacked in red.
 *
 * Zero is a real count here — the server ran it over a table that exists — so
 * a quiet day is drawn as a quiet day: a stub, not a gap.
 */
export function ActivityBars({
  days,
  compact = false,
}: {
  days: ActivityDay[];
  compact?: boolean;
}) {
  const peak = Math.max(1, ...days.map((day) => day.total));
  const total = days.reduce((sum, day) => sum + day.total, 0);
  const last = days.length - 1;
  return (
    <div>
      <div
        className="uwv-bars"
        role="img"
        aria-label={`Platform acts per day over the last ${days.length} days: ${total} in all`}
        style={{ height: compact ? '2.5rem' : '6rem' }}
      >
        {days.map((day, index) => {
          const { long } = chartDayLabel(day.date);
          const height = day.total === 0 ? 0 : Math.max(6, (day.total / peak) * 100);
          const refusedShare = day.total > 0 ? (day.refused / day.total) * 100 : 0;
          return (
            <span
              key={day.date}
              className="uwv-bar"
              data-today={index === last ? 'true' : undefined}
              title={`${long} — ${plural(day.total, 'act')}${day.refused ? `, ${day.refused} refused` : ''}`}
              style={{ height: `${height}%` }}
            >
              {day.refused > 0 ? (
                <span className="uwv-bar-refused" style={{ height: `${refusedShare}%` }} />
              ) : null}
            </span>
          );
        })}
      </div>
      {compact ? null : (
        <div className="uwv-bars-axis" aria-hidden="true">
          {days.map((day, index) => (
            <span key={day.date} data-today={index === last ? 'true' : undefined}>
              {index === last ? 'Today' : chartDayLabel(day.date).short}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── every customer on one line ───────────────────────────────────────────── */

const STATUS: Record<string, { tone: HealthTone; word: string }> = {
  active: { tone: 'online', word: 'Active' },
  suspended: { tone: 'degraded', word: 'Suspended' },
  archived: { tone: 'idle', word: 'Archived' },
};

const FLAG: Record<FleetFlag, { word: string; tone: 'critical' | 'attention' }> = {
  not_live: { word: 'Not live', tone: 'critical' },
  no_admin: { word: 'No admin', tone: 'critical' },
  unfinished: { word: 'Setup unfinished', tone: 'attention' },
};

function Flag({ flag }: { flag: FleetFlag }) {
  const spec = FLAG[flag];
  const color = spec.tone === 'critical' ? 'var(--severity-critical)' : 'var(--severity-medium)';
  return (
    <span className="uwv-flag" style={{ color, borderColor: color }}>
      <Icon icon={spec.tone === 'critical' ? AttentionIcons.critical : AttentionIcons.attention} size="inline" />
      {spec.word}
    </span>
  );
}

function LiveShare({ row }: { row: FleetRow }) {
  if (row.cameras === 0) return <span className="uwv-quiet-ink">No cameras</span>;
  if (row.cameras_enabled === 0) return <span className="uwv-quiet-ink">{plural(row.cameras, 'camera')}, all off</span>;
  const share = row.cameras_live / row.cameras_enabled;
  return (
    <span style={{ display: 'grid', gap: 6, minWidth: '7.5rem' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
        <strong style={{ color: 'var(--ink-primary)', fontWeight: 'var(--weight-semibold)' }}>{row.cameras_live}</strong>
        <span className="uwv-quiet-ink"> / {row.cameras_enabled} live</span>
      </span>
      <span className="uwv-track" aria-hidden="true">
        <span
          style={{
            width: `${Math.round(share * 100)}%`,
            background: share === 0 ? 'var(--severity-critical)' : 'var(--health-online)',
          }}
        />
      </span>
    </span>
  );
}

const FLEET_PREVIEW = 8;

export function FleetTable({ rows, now }: { rows: FleetRow[]; now: Date }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, FLEET_PREVIEW);

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No customers yet"
        body="Create the first organization from Organizations, and it will appear here."
      />
    );
  }

  return (
    <>
      <div className="uwv-scroll-x">
        <table className="uwv-fleet">
          <caption className="sr-only">Every customer, the ones that need attention first</caption>
          <thead>
            <tr>
              <th scope="col">Customer</th>
              <th scope="col">Status</th>
              <th scope="col">Cameras</th>
              <th scope="col" className="num">Zones</th>
              <th scope="col" className="num">People</th>
              <th scope="col" className="num">Admins</th>
              <th scope="col">Last sign-in</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const flags = fleetFlags(row);
              const status = STATUS[row.status] ?? { tone: 'idle' as const, word: row.status };
              return (
                <tr key={row.id} data-flagged={flags.length > 0 ? 'true' : undefined}>
                  <td>
                    <div style={{ display: 'grid', gap: 4, minWidth: '11rem' }}>
                      <Link to={organizationPath(row.id)} className="uwv-fleet-name">
                        {row.name}
                      </Link>
                      <span style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span className="uwv-quiet-ink" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)' }}>
                          {row.slug}
                        </span>
                        {flags.map((flag) => (
                          <Flag key={flag} flag={flag} />
                        ))}
                      </span>
                    </div>
                  </td>
                  <td>
                    <StatusBadge tone={status.tone}>{status.word}</StatusBadge>
                  </td>
                  <td>
                    <LiveShare row={row} />
                  </td>
                  <td className="num">{row.zones}</td>
                  <td className="num">{row.members}</td>
                  <td className="num">
                    {row.admins === 0 ? (
                      <span style={{ color: row.status === 'active' ? 'var(--severity-critical)' : 'var(--ink-tertiary)' }}>
                        None
                      </span>
                    ) : (
                      row.admins
                    )}
                  </td>
                  <td>
                    <span title={row.last_sign_in_at ? new Date(row.last_sign_in_at).toLocaleString() : undefined}>
                      {relativeTime(row.last_sign_in_at, now)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > FLEET_PREVIEW ? (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <Button size="sm" variant="ghost" onClick={() => setAll((value) => !value)}>
            {all ? 'Show fewer' : `Show all ${rows.length} customers`}
          </Button>
        </div>
      ) : null}
    </>
  );
}

/* ── the activity feed ────────────────────────────────────────────────────── */

const ACTION_ICON: Record<string, LucideIcon> = {
  'organization.created': PlatformIcons.created,
  'organization.updated': PlatformIcons.updated,
  'organization.status_changed': PlatformIcons.status,
  'organization.operator_entered': PlatformIcons.entered,
  'organization.member_added': PlatformIcons.memberAdded,
  'organization.member_removed': PlatformIcons.memberRemoved,
  'organization.admin_created': PlatformIcons.adminCreated,
  'user.access_set': PlatformIcons.access,
};

/** The quieter second line: what changed, in a few facts. */
function changeLine(row: ActivityRow): string | null {
  const change = row.change;
  if (!change || row.outcome === 'denied') return null;
  if (row.action === 'user.access_set') {
    const role = change.role ? roleLabel(change.role) : 'Custom access';
    const added = change.added ?? 0;
    const removed = change.removed ?? 0;
    const moved = [added ? `+${added}` : '', removed ? `−${removed}` : ''].filter(Boolean).join(' ');
    return moved ? `${role} · ${moved} ${added + removed === 1 ? 'permission' : 'permissions'}` : role;
  }
  if (row.action === 'organization.status_changed' && change.from && change.to) {
    return `${change.from} → ${change.to}${change.reason ? ` · “${change.reason}”` : ''}`;
  }
  if (row.action === 'organization.updated' && change.fields?.length) {
    return `Changed: ${change.fields.join(', ')}`;
  }
  return null;
}

function FeedItem({ row, now }: { row: ActivityRow; now: Date }) {
  const refused = row.outcome === 'denied';
  const parts = activitySentence(row);
  const second = changeLine(row);
  return (
    <li className="uwv-feed-item" data-refused={refused ? 'true' : undefined}>
      <span className="uwv-feed-icon" aria-hidden="true">
        <Icon icon={ACTION_ICON[row.action] ?? PlatformIcons.activity} size="inline" />
      </span>
      <div style={{ minWidth: 0 }}>
        <p className="uwv-feed-sentence">
          {parts.map((part, index) =>
            part.kind === 'place' && part.id ? (
              <Link key={index} to={organizationPath(part.id)} className="uwv-feed-place">
                {part.text}
              </Link>
            ) : part.kind === 'person' ? (
              <strong key={index} className="uwv-feed-person">
                {part.text}
              </strong>
            ) : (
              <span key={index}>{part.text}</span>
            ),
          )}
        </p>
        {refused || second ? (
          <p className="uwv-feed-meta">
            {refused ? (
              <span className="uwv-flag" style={{ color: 'var(--severity-critical)', borderColor: 'var(--severity-critical)' }}>
                <Icon icon={AttentionIcons.critical} size="inline" />
                Refused
              </span>
            ) : null}
            {second ? <span>{second}</span> : null}
          </p>
        ) : null}
      </div>
      <time
        className="uwv-feed-time"
        dateTime={row.occurred_at ?? undefined}
        title={row.occurred_at ? `${new Date(row.occurred_at).toLocaleString()} · ${relativeTime(row.occurred_at, now)}` : undefined}
      >
        {clockTime(row.occurred_at)}
      </time>
    </li>
  );
}

const FEED_PREVIEW = 12;

export function ActivityFeed({ rows, now }: { rows: ActivityRow[]; now: Date }) {
  const [filter, setFilter] = useState<ActivityCategory | 'all'>('all');
  const [all, setAll] = useState(false);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const row of rows) {
      const key = activityCategory(row.action);
      out[key] = (out[key] ?? 0) + 1;
    }
    return out;
  }, [rows]);

  const filtered = filter === 'all' ? rows : rows.filter((row) => activityCategory(row.action) === filter);
  const shown = all ? filtered : filtered.slice(0, FEED_PREVIEW);
  const groups = groupByDay(shown, now);

  if (rows.length === 0) {
    return <EmptyState title="No activity yet" body="Platform acts will appear here as they happen." />;
  }

  return (
    <div>
      <div className="uwv-chips" role="group" aria-label="Show activity of one kind">
        <button type="button" className="uwv-chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          All <span>{rows.length}</span>
        </button>
        {ACTIVITY_CATEGORIES.map((category) => (
          <button
            key={category.key}
            type="button"
            className="uwv-chip"
            aria-pressed={filter === category.key}
            disabled={!counts[category.key]}
            onClick={() => setFilter(category.key)}
          >
            {category.label} <span>{counts[category.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {groups.map((group) => (
        <section key={group.label} className="uwv-feed-day" aria-label={group.label}>
          <h3 className="uwv-feed-day-label">{group.label}</h3>
          <ol className="uwv-feed">
            {group.rows.map((row) => (
              <FeedItem key={row.id} row={row} now={now} />
            ))}
          </ol>
        </section>
      ))}

      {filtered.length > FEED_PREVIEW ? (
        <Button size="sm" variant="ghost" onClick={() => setAll((value) => !value)}>
          {all ? 'Show fewer' : `Show all ${filtered.length}`}
        </Button>
      ) : null}
    </div>
  );
}

/* ── bands, one per line ──────────────────────────────────────────────────── */

/**
 * A breakdown read line by line: label, a bar for its share of everybody, the
 * count. Each bar is a share of the *total*, not of the biggest band, so two
 * bars side by side compare the way the counts do.
 */
export function BandBars({
  bands,
  total,
  caption,
  emptyNote,
}: {
  bands: Band[];
  total: number;
  caption: string;
  emptyNote: string;
}) {
  if (total <= 0) {
    return (
      <p className="uwv-kpi-note">
        <span aria-hidden="true" style={{ marginRight: 'var(--space-2)' }}>
          —
        </span>
        {emptyNote}
      </p>
    );
  }
  return (
    <ul className="uwv-bandbars" aria-label={caption}>
      {bands.map((band) => (
        <li key={band.key}>
          <span className="uwv-bandbars-label">{band.label}</span>
          <span className="uwv-track" aria-hidden="true" style={{ height: 8 }}>
            <span style={{ width: `${(band.value / total) * 100}%`, background: band.color }} />
          </span>
          <span className="uwv-bandbars-value">{band.value.toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}

/* ── people, as a list of facts ───────────────────────────────────────────── */

export function FactRow({
  icon,
  label,
  detail,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  detail: string;
  value: number;
  tone?: 'attention';
}) {
  const color = tone === 'attention' && value > 0 ? 'var(--severity-medium)' : undefined;
  return (
    <li className="uwv-fact" data-figure={label}>
      <span className="uwv-kpi-icon" aria-hidden="true" style={color ? { color } : undefined}>
        <Icon icon={icon} size="inline" />
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span className="uwv-fact-label">{label}</span>
        <span className="uwv-fact-detail">{detail}</span>
      </span>
      <span className="uwv-fact-value" style={color ? { color } : undefined}>
        {value.toLocaleString()}
      </span>
    </li>
  );
}

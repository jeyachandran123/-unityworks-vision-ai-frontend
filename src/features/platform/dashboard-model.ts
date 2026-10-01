/**
 * What the control plane dashboard decides about the counts before it draws
 * them.
 *
 * Kept apart from the page so every rule is a plain function with a test, not a
 * branch inside a render: which customers reach the attention queue and in what
 * order, what the headline may claim, how sign-ins fall into recency bands, how
 * stream states group, and how an audit row becomes a sentence.
 *
 * ### The headline claims only what was counted
 *
 * "Nothing needs you right now" is said when the three checks the server ran —
 * onboarding finished, somebody can administer it, its switched-on cameras are
 * live — all came back clear. It never says "healthy" or "compliant", because
 * nothing here measured either.
 */

import type {
  ActivityRow,
  FleetRow,
  PlatformOverview,
  StreamStates,
} from '@shared/api/platform';

/* ── small words ───────────────────────────────────────────────────────────── */

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function organizationPath(id: string): string {
  return `/platform/organizations/${encodeURIComponent(id)}`;
}

/* ── attention ─────────────────────────────────────────────────────────────── */

export type QueueTone = 'critical' | 'attention';

export interface QueueItem {
  key: string;
  tone: QueueTone;
  title: string;
  detail: string;
  /** A route inside the application, or a `#fragment` on this page. */
  to: string;
  /** The customer this item is about, when it is about one. */
  organizationId?: string;
}

/**
 * Everything on the platform that needs a Platform Admin, most urgent first.
 *
 * Critical is reserved for a customer that cannot fix itself or does not know
 * it is broken: switched-on cameras with none live, and nobody left who can
 * administer it. Unfinished onboarding, refused changes and stranded accounts
 * are housekeeping — real, worth a look, and never a siren.
 */
export function attentionQueue(o: PlatformOverview): QueueItem[] {
  // One row per customer. A customer with two problems is one place to go,
  // so its problems are joined on its row and it takes the more urgent tone.
  const customers = new Map<string, QueueItem>();
  const note = (org: { id: string; name: string }, tone: QueueTone, detail: string) => {
    const seen = customers.get(org.id);
    if (seen) {
      seen.detail = `${seen.detail} · ${detail}`;
      if (tone === 'critical') seen.tone = 'critical';
      return;
    }
    customers.set(org.id, {
      key: `organization:${org.id}`,
      tone,
      title: org.name,
      detail,
      to: organizationPath(org.id),
      organizationId: org.id,
    });
  };

  for (const org of o.attention.organizations_not_live) {
    note(org, 'critical', `${plural(org.cameras_enabled, 'camera')} switched on, none live`);
  }
  for (const org of o.attention.organizations_without_admin) {
    note(org, 'critical', 'Nobody can administer it');
  }
  for (const org of o.attention.organizations_needing_setup) {
    note(
      org,
      'attention',
      org.zone_count === 0 && org.camera_count === 0
        ? 'No zones and no cameras yet'
        : org.zone_count === 0
          ? 'No zones yet'
          : 'No cameras yet',
    );
  }

  const ranked = [...customers.values()];
  const queue: QueueItem[] = [
    ...ranked.filter((item) => item.tone === 'critical'),
    ...ranked.filter((item) => item.tone !== 'critical'),
  ];

  if (o.attention.refused_changes_7d > 0) {
    queue.push({
      key: 'refused',
      tone: 'attention',
      title: plural(o.attention.refused_changes_7d, 'refused change'),
      detail: 'Access edits the server turned down this week',
      to: '#platform-activity',
    });
  }
  if (o.people.without_membership > 0) {
    queue.push({
      key: 'stranded',
      tone: 'attention',
      title: `${plural(o.people.without_membership, 'account')} can enter nowhere`,
      detail: 'A password, and no organization to use it in',
      to: '/platform/people',
    });
  }
  return queue;
}

export interface AttentionSummary {
  tone: 'critical' | 'attention' | 'clear';
  headline: string;
  statement: string;
}

export function attentionSummary(o: PlatformOverview, queue: QueueItem[]): AttentionSummary {
  if (o.organizations.total === 0) {
    return { tone: 'clear', headline: 'Platform', statement: 'No customers on this deployment yet.' };
  }
  const urgent = new Set(
    queue.filter((item) => item.tone === 'critical').map((item) => item.organizationId ?? item.key),
  );
  if (urgent.size > 0) {
    return {
      tone: 'critical',
      headline: 'Needs you',
      statement: `${plural(urgent.size, 'customer')} ${urgent.size === 1 ? 'needs' : 'need'} you now.`,
    };
  }
  if (queue.length > 0) {
    return {
      tone: 'attention',
      headline: 'Worth a look',
      statement: `${plural(queue.length, 'thing')} to look at. Nothing urgent.`,
    };
  }
  return { tone: 'clear', headline: 'All clear', statement: 'Nothing needs you right now.' };
}

/* ── the fleet ─────────────────────────────────────────────────────────────── */

export type FleetFlag = 'not_live' | 'no_admin' | 'unfinished';

/** What is wrong with one customer. Only an active customer can be wrong. */
export function fleetFlags(row: FleetRow): FleetFlag[] {
  if (row.status !== 'active') return [];
  const flags: FleetFlag[] = [];
  if (row.cameras_enabled > 0 && row.cameras_live === 0) flags.push('not_live');
  if (row.admins === 0) flags.push('no_admin');
  if (row.zones === 0 || row.cameras === 0) flags.push('unfinished');
  return flags;
}

function weight(row: FleetRow): number {
  const flags = fleetFlags(row);
  if (flags.includes('not_live') || flags.includes('no_admin')) return 0;
  if (flags.length > 0) return 1;
  return row.status === 'active' ? 2 : 3;
}

/** Customers that need somebody first, then the rest by name. */
export function orderFleet(rows: FleetRow[]): FleetRow[] {
  return [...rows].sort(
    (a, b) => weight(a) - weight(b) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
}

/* ── bands ─────────────────────────────────────────────────────────────────── */

export interface Band {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** Everybody, once each, by when they last signed in. The bands do not overlap. */
export function signInBands(people: PlatformOverview['people']): Band[] {
  const today = people.signed_in_24h;
  const week = Math.max(0, people.signed_in_7d - people.signed_in_24h);
  const month = Math.max(0, people.signed_in_30d - people.signed_in_7d);
  const older = Math.max(0, people.users - people.never_signed_in - people.signed_in_30d);
  return [
    { key: 'today', label: 'Today', value: today, color: 'var(--accent)' },
    { key: 'week', label: 'This week', value: week, color: 'var(--accent-active)' },
    { key: 'month', label: 'This month', value: month, color: 'var(--accent-line)' },
    { key: 'older', label: 'Longer ago', value: older, color: 'var(--line-strong)' },
    { key: 'never', label: 'Never', value: people.never_signed_in, color: 'var(--state-unknown)' },
  ];
}

/**
 * Stream states, grouped by what they mean for somebody watching.
 *
 * Live is the only band that means a picture. Connecting and reconnecting are a
 * camera on its way back; offline and error are a camera that is not coming
 * back on its own; disabled is a camera somebody switched off.
 */
export function streamBands(states: StreamStates): Band[] {
  let live = 0;
  let recovering = 0;
  let down = 0;
  let disabled = 0;
  let other = 0;
  for (const [state, count] of Object.entries(states)) {
    if (state === 'live') live += count;
    else if (state === 'connecting' || state === 'reconnecting') recovering += count;
    else if (state === 'offline' || state === 'error') down += count;
    else if (state === 'disabled') disabled += count;
    else other += count;
  }
  const bands: Band[] = [
    { key: 'live', label: 'Live', value: live, color: 'var(--health-online)' },
    { key: 'recovering', label: 'Reconnecting', value: recovering, color: 'var(--health-degraded)' },
    { key: 'down', label: 'Offline', value: down, color: 'var(--health-offline)' },
    { key: 'disabled', label: 'Switched off', value: disabled, color: 'var(--health-idle)' },
  ];
  if (other > 0) bands.push({ key: 'other', label: 'Other', value: other, color: 'var(--state-unknown)' });
  return bands;
}

export interface WeekOnWeek {
  direction: 'up' | 'down' | 'level';
  words: string;
}

/** A count against the count before it. Activity going up is not a verdict. */
export function weekOnWeek(thisWeek: number, weekBefore: number): WeekOnWeek {
  const delta = thisWeek - weekBefore;
  if (delta > 0) return { direction: 'up', words: `${delta} more than the week before` };
  if (delta < 0) return { direction: 'down', words: `${-delta} fewer than the week before` };
  return { direction: 'level', words: 'Same as the week before' };
}

/* ── the activity feed ─────────────────────────────────────────────────────── */

export type ActivityCategory = 'access' | 'membership' | 'entry' | 'lifecycle' | 'other';

export const ACTIVITY_CATEGORIES: ReadonlyArray<{ key: ActivityCategory; label: string }> = [
  { key: 'access', label: 'Access' },
  { key: 'membership', label: 'Membership' },
  { key: 'lifecycle', label: 'Organizations' },
  { key: 'entry', label: 'Entries' },
];

export function activityCategory(action: string): ActivityCategory {
  switch (action) {
    case 'user.access_set':
      return 'access';
    case 'organization.member_added':
    case 'organization.member_removed':
    case 'organization.admin_created':
      return 'membership';
    case 'organization.operator_entered':
      return 'entry';
    case 'organization.created':
    case 'organization.updated':
    case 'organization.status_changed':
      return 'lifecycle';
    default:
      return 'other';
  }
}

export interface SentencePart {
  kind: 'person' | 'place' | 'text';
  text: string;
  /** The organization id, on a place. */
  id?: string;
}

/** Why the server refused a change, in words. */
const REFUSAL: Record<string, string> = {
  self: 'changing their own access',
  escalation: 'giving {subject} more than they hold',
  email_in_use: 'creating an admin with an email already in use',
};

/**
 * One audit row as a sentence: who did what, to whom, where.
 *
 * Returned as parts rather than as a string so the page can set the people and
 * the place apart — and link the place — without parsing its own prose.
 */
export function activitySentence(row: ActivityRow): SentencePart[] {
  const actor: SentencePart = { kind: 'person', text: row.actor || 'Somebody' };
  const place: SentencePart = {
    kind: 'place',
    text: row.organization_name || row.organization_id,
    id: row.organization_id,
  };
  const subject: SentencePart = { kind: 'person', text: row.subject || 'somebody' };
  const say = (text: string): SentencePart => ({ kind: 'text', text });

  if (row.outcome === 'denied') {
    const why = REFUSAL[row.change?.reason ?? ''];
    if (why) {
      const [before, after] = why.split('{subject}');
      return after === undefined
        ? [actor, say(` was refused ${before} in `), place]
        : [actor, say(` was refused ${before}`), subject, say(`${after} in `), place];
    }
    return [actor, say(' was refused in '), place];
  }

  switch (row.action) {
    case 'organization.created':
      return [actor, say(' created '), place];
    case 'organization.updated':
      return [actor, say(row.change?.fields?.includes('name') ? ' renamed ' : ' edited '), place];
    case 'organization.status_changed': {
      const to = row.change?.to;
      const verb = to === 'suspended' ? 'suspended' : to === 'archived' ? 'archived' : to === 'active' ? 'restored' : 'changed the status of';
      return [actor, say(` ${verb} `), place];
    }
    case 'organization.operator_entered':
      return [actor, say(' entered '), place];
    case 'organization.member_added':
      return [actor, say(' added '), subject, say(' to '), place];
    case 'organization.member_removed':
      return [actor, say(' removed '), subject, say(' from '), place];
    case 'organization.admin_created':
      return [actor, say(' made '), subject, say(' an Organization Admin of '), place];
    case 'user.access_set':
      return [actor, say(' changed what '), subject, say(' may do in '), place];
    default:
      return [actor, say(` — ${row.action.replace(/[._]/g, ' ')} in `), place];
  }
}

/* ── time ──────────────────────────────────────────────────────────────────── */

function startOfDay(at: Date): number {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
}

const DAY_MS = 86_400_000;

export function relativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'Never';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  const seconds = Math.max(0, Math.round((now.getTime() - at.getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  if (days <= 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return at.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function dayLabel(at: Date, now: Date = new Date()): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return at.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
}

export function clockTime(iso: string | null): string {
  if (!iso) return '—';
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? '—'
    : at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export interface DayGroup {
  label: string;
  rows: ActivityRow[];
}

/** The feed by the reader's own days, newest first. Order inside a day is kept. */
export function groupByDay(rows: ActivityRow[], now: Date = new Date()): DayGroup[] {
  const groups: DayGroup[] = [];
  let undated: DayGroup | null = null;
  for (const row of rows) {
    const at = row.occurred_at ? new Date(row.occurred_at) : null;
    if (!at || Number.isNaN(at.getTime())) {
      undated ??= { label: 'Undated', rows: [] };
      undated.rows.push(row);
      continue;
    }
    const label = dayLabel(at, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(row);
    else groups.push({ label, rows: [row] });
  }
  return undated ? [...groups, undated] : groups;
}

/** A chart day's short name: `Mon`, or the date on the first of a month. */
export function chartDayLabel(date: string): { short: string; long: string } {
  const [y, m, d] = date.split('-').map(Number);
  const at = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  return {
    short: at.toLocaleDateString(undefined, { weekday: 'narrow' }),
    long: at.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
  };
}

/**
 * The control plane dashboard's derivations — everything the page decides
 * about the counts before it draws them.
 *
 * Pure functions over a `PlatformOverview`, so each rule is pinned without a
 * render: which customers reach the attention queue and in what order, what the
 * headline may claim, how sign-ins fall into recency bands, how stream states
 * group, and how an audit row becomes a sentence a person can read.
 */

import { describe, expect, it } from 'vitest';

import type { ActivityRow, FleetRow, PlatformOverview } from '@shared/api/platform';
import {
  activityCategory,
  activitySentence,
  attentionQueue,
  attentionSummary,
  dayLabel,
  fleetFlags,
  groupByDay,
  orderFleet,
  relativeTime,
  signInBands,
  streamBands,
  weekOnWeek,
} from '@features/platform/dashboard-model';

function overview(patch: Partial<PlatformOverview> = {}): PlatformOverview {
  return {
    generated_at: '2026-10-01T02:00:00+00:00',
    organizations: { total: 2, active: 2, suspended: 0, archived: 0, new_30d: 0 },
    estate: {
      zones: 3,
      cameras: 6,
      cameras_enabled: 6,
      cameras_running: 6,
      cameras_live: 4,
      stream_states: { live: 4, reconnecting: 2 },
    },
    people: {
      users: 10,
      active_users: 9,
      disabled_users: 1,
      multi_organization_users: 1,
      never_signed_in: 2,
      signed_in_24h: 3,
      signed_in_7d: 5,
      signed_in_30d: 7,
      without_membership: 0,
      platform_operators: 1,
    },
    fleet: [],
    attention: {
      organizations_needing_setup: [],
      organizations_without_admin: [],
      organizations_not_live: [],
      refused_changes_7d: 0,
    },
    activity: { utc_offset: 0, days: [], last_7d: 0, previous_7d: 0 },
    recent_activity: [],
    ...patch,
  };
}

function fleetRow(patch: Partial<FleetRow> = {}): FleetRow {
  return {
    id: 'org-a',
    name: 'Acme',
    slug: 'acme',
    status: 'active',
    created_at: null,
    zones: 1,
    cameras: 2,
    cameras_enabled: 2,
    cameras_live: 2,
    stream_states: { live: 2 },
    members: 3,
    admins: 1,
    last_sign_in_at: null,
    ...patch,
  };
}

function row(patch: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id: 'a1',
    action: 'organization.member_added',
    organization_id: 'org-a',
    organization_name: 'Acme',
    actor: 'ops@example.com',
    resource_id: 'user-1',
    subject: 'cook@example.com',
    outcome: 'success',
    change: null,
    occurred_at: '2026-10-01T01:00:00+00:00',
    ...patch,
  };
}

const text = (parts: ReturnType<typeof activitySentence>) => parts.map((p) => p.text).join('');

describe('the attention queue', () => {
  it('is empty when every customer is set up, administered and live', () => {
    expect(attentionQueue(overview())).toEqual([]);
  });

  it('puts what is urgent before what is merely unfinished', () => {
    const queue = attentionQueue(
      overview({
        attention: {
          organizations_needing_setup: [{ id: 'org-n', name: 'Newco', zone_count: 0, camera_count: 0 }],
          organizations_without_admin: [{ id: 'org-b', name: 'Borden' }],
          organizations_not_live: [{ id: 'org-c', name: 'Cafe', cameras_enabled: 4 }],
          refused_changes_7d: 2,
        },
        people: { ...overview().people, without_membership: 3 },
      }),
    );

    expect(queue.map((item) => item.tone)).toEqual([
      'critical',
      'critical',
      'attention',
      'attention',
      'attention',
    ]);
    expect(queue[0]).toMatchObject({ title: 'Cafe', detail: '4 cameras switched on, none live' });
    expect(queue[1]).toMatchObject({ title: 'Borden', detail: 'Nobody can administer it' });
    expect(queue[2]).toMatchObject({ title: 'Newco', detail: 'No zones and no cameras yet' });
    expect(queue.map((item) => item.title)).toContain('2 refused changes');
    expect(queue.map((item) => item.title)).toContain('3 accounts can enter nowhere');
  });

  it('gives a customer one row, naming every problem it has, at its most urgent', () => {
    const queue = attentionQueue(
      overview({
        attention: {
          organizations_needing_setup: [{ id: 'org-a', name: 'Atmiralty', zone_count: 0, camera_count: 0 }],
          organizations_without_admin: [{ id: 'org-a', name: 'Atmiralty' }],
          organizations_not_live: [],
          refused_changes_7d: 0,
        },
      }),
    );

    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      tone: 'critical',
      title: 'Atmiralty',
      detail: 'Nobody can administer it · No zones and no cameras yet',
    });
  });

  it('links each customer to its own page', () => {
    const queue = attentionQueue(
      overview({
        attention: {
          ...overview().attention,
          organizations_without_admin: [{ id: 'org b/1', name: 'Borden' }],
        },
      }),
    );
    expect(queue[0]?.to).toBe('/platform/organizations/org%20b%2F1');
  });
});

describe('the headline', () => {
  it('counts customers, not problems, when something is urgent', () => {
    const o = overview({
      attention: {
        organizations_needing_setup: [],
        // The same customer twice: not live and no admin. One customer needs you.
        organizations_without_admin: [{ id: 'org-c', name: 'Cafe' }],
        organizations_not_live: [{ id: 'org-c', name: 'Cafe', cameras_enabled: 1 }],
        refused_changes_7d: 0,
      },
    });
    const summary = attentionSummary(o, attentionQueue(o));
    expect(summary.tone).toBe('critical');
    expect(summary.statement).toBe('1 customer needs you now.');
  });

  it('says nothing is urgent when only housekeeping is left', () => {
    const o = overview({ attention: { ...overview().attention, refused_changes_7d: 1 } });
    const summary = attentionSummary(o, attentionQueue(o));
    expect(summary.tone).toBe('attention');
    expect(summary.statement).toBe('1 thing to look at. Nothing urgent.');
  });

  it('claims nothing it did not count when all is clear', () => {
    const summary = attentionSummary(overview(), []);
    expect(summary.tone).toBe('clear');
    expect(summary.statement).toBe('Nothing needs you right now.');
  });

  it('says so plainly when there are no customers at all', () => {
    const o = overview({ organizations: { total: 0, active: 0, suspended: 0, archived: 0, new_30d: 0 } });
    expect(attentionSummary(o, []).statement).toBe('No customers on this deployment yet.');
  });
});

describe('the fleet', () => {
  it('flags each customer by what is wrong with it', () => {
    expect(fleetFlags(fleetRow())).toEqual([]);
    expect(fleetFlags(fleetRow({ admins: 0 }))).toEqual(['no_admin']);
    expect(fleetFlags(fleetRow({ cameras_live: 0 }))).toEqual(['not_live']);
    expect(fleetFlags(fleetRow({ zones: 0 }))).toEqual(['unfinished']);
  });

  it('flags nothing on a customer that is not active', () => {
    // A suspended customer's cameras are stopped on purpose.
    expect(fleetFlags(fleetRow({ status: 'suspended', cameras_live: 0, admins: 0 }))).toEqual([]);
  });

  it('orders customers that need attention first, then by name', () => {
    const ordered = orderFleet([
      fleetRow({ id: '1', name: 'Zeta' }),
      fleetRow({ id: '2', name: 'Alpha' }),
      fleetRow({ id: '3', name: 'Mid', zones: 0 }),
      fleetRow({ id: '4', name: 'Late', admins: 0 }),
    ]);
    expect(ordered.map((r) => r.name)).toEqual(['Late', 'Mid', 'Alpha', 'Zeta']);
  });
});

describe('bands', () => {
  it('splits sign-ins into non-overlapping recency bands that sum to everybody', () => {
    const bands = signInBands(overview().people);
    expect(bands.map((b) => [b.key, b.value])).toEqual([
      ['today', 3],
      ['week', 2],
      ['month', 2],
      ['older', 1],
      ['never', 2],
    ]);
    expect(bands.reduce((sum, b) => sum + b.value, 0)).toBe(10);
  });

  it('groups stream states by what they mean for somebody watching', () => {
    const bands = streamBands({ live: 3, connecting: 1, reconnecting: 2, offline: 1, error: 1, disabled: 4, weird: 1 });
    expect(bands.map((b) => [b.key, b.value])).toEqual([
      ['live', 3],
      ['recovering', 3],
      ['down', 2],
      ['disabled', 4],
      ['other', 1],
    ]);
  });

  it('compares the week with the week before, without calling it good or bad', () => {
    expect(weekOnWeek(7, 4)).toEqual({ direction: 'up', words: '3 more than the week before' });
    expect(weekOnWeek(2, 5)).toEqual({ direction: 'down', words: '3 fewer than the week before' });
    expect(weekOnWeek(4, 4)).toEqual({ direction: 'level', words: 'Same as the week before' });
  });
});

describe('the activity feed', () => {
  it('reads each act as a sentence about people and places', () => {
    expect(text(activitySentence(row()))).toBe('ops@example.com added cook@example.com to Acme');
    expect(text(activitySentence(row({ action: 'organization.member_removed' })))).toBe(
      'ops@example.com removed cook@example.com from Acme',
    );
    expect(text(activitySentence(row({ action: 'organization.operator_entered', subject: null })))).toBe(
      'ops@example.com entered Acme',
    );
    expect(text(activitySentence(row({ action: 'organization.admin_created' })))).toBe(
      'ops@example.com made cook@example.com an Organization Admin of Acme',
    );
    expect(text(activitySentence(row({ action: 'user.access_set' })))).toBe(
      'ops@example.com changed what cook@example.com may do in Acme',
    );
    expect(text(activitySentence(row({ action: 'organization.created', subject: null })))).toBe(
      'ops@example.com created Acme',
    );
  });

  it('says what a status change did', () => {
    const changed = (to: string) =>
      text(
        activitySentence(
          row({ action: 'organization.status_changed', subject: null, change: { from: 'active', to } }),
        ),
      );
    expect(changed('suspended')).toBe('ops@example.com suspended Acme');
    expect(changed('archived')).toBe('ops@example.com archived Acme');
    expect(changed('active')).toBe('ops@example.com restored Acme');
  });

  it('says a refused change was refused, and why', () => {
    expect(
      text(
        activitySentence(row({ action: 'user.access_set', outcome: 'denied', change: { reason: 'self' } })),
      ),
    ).toBe('ops@example.com was refused changing their own access in Acme');
    expect(
      text(
        activitySentence(
          row({ action: 'user.access_set', outcome: 'denied', change: { reason: 'escalation' } }),
        ),
      ),
    ).toBe('ops@example.com was refused giving cook@example.com more than they hold in Acme');
  });

  it('falls back to the organization id, and to plain words for an act it does not know', () => {
    expect(text(activitySentence(row({ organization_name: '', action: 'organization.operator_entered' })))).toBe(
      'ops@example.com entered org-a',
    );
    expect(text(activitySentence(row({ action: 'billing.plan_changed', subject: null })))).toBe(
      'ops@example.com — billing plan changed in Acme',
    );
  });

  it('marks the people and the place so they can be set apart', () => {
    const parts = activitySentence(row());
    expect(parts.filter((p) => p.kind === 'person').map((p) => p.text)).toEqual([
      'ops@example.com',
      'cook@example.com',
    ]);
    expect(parts.find((p) => p.kind === 'place')).toMatchObject({ text: 'Acme', id: 'org-a' });
  });

  it('files each act under a category the filter can use', () => {
    expect(activityCategory('user.access_set')).toBe('access');
    expect(activityCategory('organization.member_added')).toBe('membership');
    expect(activityCategory('organization.admin_created')).toBe('membership');
    expect(activityCategory('organization.operator_entered')).toBe('entry');
    expect(activityCategory('organization.status_changed')).toBe('lifecycle');
    expect(activityCategory('something.else')).toBe('other');
  });
});

describe('time, in the reader’s own words', () => {
  const now = new Date('2026-10-01T12:00:00');

  it('says how long ago, briefly', () => {
    expect(relativeTime(new Date('2026-10-01T11:59:40').toISOString(), now)).toBe('Just now');
    expect(relativeTime(new Date('2026-10-01T11:45:00').toISOString(), now)).toBe('15 min ago');
    expect(relativeTime(new Date('2026-10-01T09:00:00').toISOString(), now)).toBe('3 h ago');
    expect(relativeTime(new Date('2026-09-29T12:00:00').toISOString(), now)).toBe('2 days ago');
    expect(relativeTime(null, now)).toBe('Never');
  });

  it('names today and yesterday, and dates the rest', () => {
    expect(dayLabel(new Date('2026-10-01T08:00:00'), now)).toBe('Today');
    expect(dayLabel(new Date('2026-09-30T23:00:00'), now)).toBe('Yesterday');
    expect(dayLabel(new Date('2026-09-27T08:00:00'), now)).toMatch(/27/);
  });

  it('groups the feed by day, newest first, keeping order inside a day', () => {
    const groups = groupByDay(
      [
        row({ id: '1', occurred_at: new Date('2026-10-01T10:00:00').toISOString() }),
        row({ id: '2', occurred_at: new Date('2026-10-01T09:00:00').toISOString() }),
        row({ id: '3', occurred_at: new Date('2026-09-30T09:00:00').toISOString() }),
        row({ id: '4', occurred_at: null }),
      ],
      now,
    );
    expect(groups.map((g) => [g.label, g.rows.map((r) => r.id)])).toEqual([
      ['Today', ['1', '2']],
      ['Yesterday', ['3']],
      ['Undated', ['4']],
    ]);
  });
});

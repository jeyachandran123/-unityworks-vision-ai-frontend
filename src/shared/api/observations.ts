/**
 * PPE observations, and the organisation they happened in.
 *
 * Separate from `persistence.ts` because the two answer different questions and
 * are backed by different stores. Everything there is an application row
 * somebody wrote — an incident, an evidence record. Everything here is read
 * from Vision OS's own observation log through the product API; the application
 * stores none of it, and `app/domain/models.py` explains at length why it must
 * not.
 *
 * ### `available` is not `subjects.length === 0`
 *
 * The observation response carries availability as its own field. A platform
 * that is not assembled answers `available: false` with a reason, and that is a
 * different fact from a platform that watched and saw nobody. Every consumer of
 * this module has to branch on it before it looks at the list — which is why
 * the field is required rather than optional.
 */

import { api } from './client';

/* ── observations ─────────────────────────────────────────────────────────── */

export interface ObservationConfidence {
  value: number;
  /**
   * `self_reported` is a model's opinion about itself, and the platform's own
   * documentation states it is not a probability. Carried so a UI cannot
   * silently render it as one.
   */
  semantics: string;
  calibrated: boolean;
}

export interface ObservedAttribute {
  /** `head_covering`, `hand_covering`, `face_covering`. */
  key: string;
  /**
   * The raw platform value — `hairnet`, `none`, `not_visible`, `gloves`.
   *
   * **Never pre-interpreted.** It is resolved to one of the four observation
   * states by `shared/semantics/observation.ts`, in one place, exactly as every
   * other surface does it.
   */
  value: string;
  /** Nanoseconds since the Unix epoch, as the platform reports time. */
  observed_at: number | null;
  valid_until: number | null;
  confidence: ObservationConfidence | null;
}

export interface ObservedSubject {
  /** A tracked object, never a person. The platform identifies nobody. */
  object_id: string;
  camera_key: string;
  class_id: string;
  first_seen: number | null;
  last_seen: number | null;
  attributes: ObservedAttribute[];

  /**
   * Where this was observed, **as recorded at the time**.
   *
   * Resolved from the camera's zone-assignment history rather than from
   * `cameras.zone_id`, so moving a camera does not relocate every reading it has
   * ever produced. That would be the same class of error the frozen
   * `finding_snapshot` exists to prevent.
   */
  zone_id?: string | null;
  zone_name?: string;
  /**
   * Whether a zone was ever recorded for this camera at this instant.
   *
   * `false` means nobody wrote it down — distinct from being recorded as
   * belonging to no zone. Both render as no zone; only one is a gap somebody can
   * close, and nothing is inferred from today's mapping to fill it.
   */
  zone_recorded?: boolean;
}

export interface ObservationWindow {
  since: string;
  until: string;
}

export interface ObservationPage {
  /** False means the platform could not be read. Not the same as no subjects. */
  available: boolean;
  /** Why, when `available` is false. Shown to the operator verbatim. */
  reason: string;
  subjects: ObservedSubject[];
  count: number;
  observation_count?: number;
  cameras_queried: string[];
  window: ObservationWindow;
  window_fully_observable: boolean;
}

export interface ObservationQuery {
  since?: string;
  until?: string;
  camera_key?: string;
  limit?: number;
}

function query(params: ObservationQuery): string {
  const search = new URLSearchParams();
  if (params.since) search.set('since', params.since);
  if (params.until) search.set('until', params.until);
  if (params.camera_key) search.set('camera_key', params.camera_key);
  if (params.limit) search.set('limit', String(params.limit));
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

export const observationsApi = {
  list: (params: ObservationQuery = {}) =>
    api.get<ObservationPage>(`/observations${query(params)}`),
};

/** Nanoseconds → a readable local time, or `—` when the platform gave none. */
export function observedAtLabel(ns: number | null): string {
  if (ns === null || ns === undefined) return '—';
  const when = new Date(ns / 1_000_000);
  return Number.isNaN(when.getTime()) ? '—' : when.toLocaleString();
}

/** `head_covering` → `Head covering`. The attribute key, made readable. */
export function attributeLabel(key: string): string {
  const words = key.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/* ── organisation ─────────────────────────────────────────────────────────── */

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  is_active: boolean;
  created_at: string | null;
  zone_count: number;
  camera_count: number;
}

export interface RestaurantList {
  restaurants: Restaurant[];
  count: number;
}

export interface Zone {
  id: string;
  restaurant_id: string;
  name: string;
  created_at: string | null;
  camera_count: number;
}

export interface ZoneList {
  zones: Zone[];
  count: number;
}

export interface OrgUser {
  id: string;
  email: string;
  display_name: string;
  is_active: boolean;
  roles: string[];
  created_at: string | null;
  last_login_at: string | null;
}

export interface UserList {
  users: OrgUser[];
  count: number;
  /**
   * Whether this deployment can create an account at all.
   *
   * Decided by the server and carried in the payload rather than assumed by the
   * client, so the reason travels with the capability and one place owns it.
   */
  write_available: boolean;
  write_unavailable_reason: string;
}

export const organizationApi = {
  restaurants: () => api.get<RestaurantList>('/restaurants'),
  createRestaurant: (draft: { name: string; timezone?: string }) =>
    api.post<Restaurant>('/restaurants', draft),
  updateRestaurant: (
    id: string,
    changes: { name?: string; timezone?: string; is_active?: boolean },
  ) => api.patch<Restaurant>(`/restaurants/${encodeURIComponent(id)}`, changes),

  zones: (restaurantId?: string) =>
    api.get<ZoneList>(
      restaurantId ? `/zones?restaurant_id=${encodeURIComponent(restaurantId)}` : '/zones',
    ),
  createZone: (draft: { restaurant_id: string; name: string }) =>
    api.post<Zone>('/zones', draft),
  updateZone: (id: string, changes: { name: string }) =>
    api.patch<Zone>(`/zones/${encodeURIComponent(id)}`, changes),

  users: () => api.get<UserList>('/users'),
};

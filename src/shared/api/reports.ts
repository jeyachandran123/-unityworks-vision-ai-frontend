/**
 * Reports: the catalogue, a generated report, and the export download.
 *
 * ### `coverage.complete` is the field that matters
 *
 * Same discipline as `observations.ts` and `capabilities.ts`: the thing a
 * consumer must branch on is its own field rather than something inferred from
 * the payload's shape. A report with rows is not necessarily complete — the
 * period may not have ended, a source may have been unreadable, a section may
 * have been truncated — and a page that only looked at `sections.length` would
 * present all of those as a finished month.
 *
 * `complete` is therefore required, and every one of the reasons is in `gaps`.
 *
 * ### Export is a download, not a fetch
 *
 * `exportReport` returns a `Blob` through `authorizedFetch`, the same path
 * evidence imagery uses: the URL needs an Authorization header, so it can never
 * be an `<a href>`, and the retrieval has to be an act somebody chose rather
 * than something a render triggered. The backend writes an audit row for it.
 */

import { api, authorizedFetch } from './client';

/* ── catalogue ────────────────────────────────────────────────────────────── */

export type Granularity = 'total' | 'day' | 'week' | 'month';

export interface ReportTypeSummary {
  id: string;
  title: string;
  summary: string;
  granularities: Granularity[];
  /** Every permission required — a conjunction, including the data's own. */
  requires: string[];
  /** Whether this caller may run it. Listed either way, so absence never reads as non-existence. */
  permitted: boolean;
  /** `data` is backed by a real store; `capability` is a Phase 2 module with no source. */
  kind: 'data' | 'capability';
  capability_module: string;
}

export interface FormatAvailability {
  available: boolean;
  reason: string;
}

export interface ReportCatalogue {
  reports: ReportTypeSummary[];
  count: number;
  can_export: boolean;
  /** Which formats this deployment can actually produce. */
  formats: Record<string, FormatAvailability>;
  max_window_days: number;
}

/* ── a generated report ───────────────────────────────────────────────────── */

export interface Gap {
  /** `future`, `before_history`, `source_unavailable`, `truncated`. */
  kind: string;
  detail: string;
  since: string | null;
  until: string | null;
}

export interface SourceCoverage {
  source: string;
  /** False means the source could not be read. Never the same as `rows === 0`. */
  available: boolean;
  reason: string;
  rows: number;
  truncated: boolean;
  earliest: string | null;
}

export interface Coverage {
  since: string;
  until: string;
  timezone: string;
  /** False means the zone did not resolve and boundaries are UTC. Shown, never swallowed. */
  timezone_resolved: boolean;
  granularity: Granularity;
  /** The one field a reader needs before comparing these figures with another period. */
  complete: boolean;
  basis: string;
  sources: SourceCoverage[];
  gaps: Gap[];
}

export interface ReportColumn {
  key: string;
  header: string;
  numeric: boolean;
}

export interface ReportSection {
  key: string;
  title: string;
  columns: ReportColumn[];
  rows: Array<Record<string, unknown>>;
  /** What kind of nothing this is. Rendered instead of an empty table. */
  empty_note: string;
  note: string;
}

export interface Report {
  report_id: string;
  title: string;
  subtitle: string;
  coverage: Coverage;
  sections: ReportSection[];
  /** `not_configured` / `blocked` for a Phase 2 module. Empty for a data report. */
  capability_state: string;
  capability_reason: string;
  awaiting: Array<{ id: string; detail: string }>;
  generated_at: string | null;
}

export interface ReportQuery {
  since?: string;
  until?: string;
  granularity?: Granularity;
  restaurant_id?: string;
}

function query(params: ReportQuery & { format?: string }): string {
  const search = new URLSearchParams();
  if (params.since) search.set('since', params.since);
  if (params.until) search.set('until', params.until);
  if (params.granularity) search.set('granularity', params.granularity);
  if (params.restaurant_id) search.set('restaurant_id', params.restaurant_id);
  if (params.format) search.set('format', params.format);
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

export const reportsApi = {
  types: () => api.get<ReportCatalogue>('/reports/types'),

  generate: (id: string, params: ReportQuery = {}) =>
    api.get<Report>(`/reports/${encodeURIComponent(id)}${query(params)}`),

  /**
   * Downloads a report file. Returns the blob and the filename the server chose.
   *
   * The filename comes from `Content-Disposition` rather than being built here,
   * so the name in the download matches the one in the audit row.
   */
  export: async (
    id: string,
    format: string,
    params: ReportQuery = {},
  ): Promise<{ blob: Blob; filename: string }> => {
    const response = await authorizedFetch(
      `/reports/${encodeURIComponent(id)}/export${query({ ...params, format })}`,
    );
    if (!response.ok) {
      // The envelope carries a reason — an unsupported format, a missing
      // permission, a window too long — and it is worth surfacing rather than
      // replacing with "download failed".
      let message = 'The report could not be exported.';
      try {
        const body = (await response.json()) as { message?: string };
        if (body?.message) message = body.message;
      } catch {
        /* a non-JSON error body is not worth a second failure */
      }
      throw new Error(message);
    }
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const matched = /filename="([^"]+)"/.exec(disposition);
    return {
      blob: await response.blob(),
      filename: matched?.[1] ?? `${id}.${format}`,
    };
  },
};

/** The formats offered, in the order a person is most likely to want them. */
export const EXPORT_FORMATS: ReadonlyArray<{ id: string; label: string; hint: string }> = [
  { id: 'pdf', label: 'PDF', hint: 'A document to circulate or file' },
  { id: 'xlsx', label: 'Excel', hint: 'One sheet per section, coverage on the first' },
  { id: 'csv', label: 'CSV', hint: 'Coverage and every section in one file' },
  { id: 'json', label: 'JSON', hint: 'The exact payload this page rendered' },
];

export const GRANULARITY_LABELS: Record<Granularity, string> = {
  total: 'Whole period',
  day: 'Daily',
  week: 'Weekly',
  month: 'Monthly',
};

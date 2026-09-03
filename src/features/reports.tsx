/**
 * Reports — the densest page in the product, and the one that must lie least.
 *
 * ### Coverage renders above the figures, not below them
 *
 * The layout decision this page turns on. A reader who scrolls past a table of
 * numbers and finds a footnote saying half the period was unreadable has
 * already formed a conclusion. So the coverage panel sits between the heading
 * and the first section, and when a period is incomplete it is the loudest
 * thing on the page.
 *
 * ### An empty section renders its own sentence
 *
 * Never a table with headers and no rows. Every `Section` carries an
 * `empty_note` written by the backend that says *which* kind of nothing it is —
 * "no incident was raised" and "the incident store could not be read" are
 * different facts and the reader has to be able to tell them apart.
 *
 * ### The seven unconnected modules are in the catalogue on purpose
 *
 * Running one produces a real report that states the module's own
 * `not_configured` / `blocked` answer, in the module's own words, from the same
 * Phase 2 shape its page already uses. Omitting them from a list that claims to
 * cover the product would let their absence read as "nothing to report".
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import {
  EXPORT_FORMATS,
  GRANULARITY_LABELS,
  reportsApi,
  type Granularity,
  type Report,
  type ReportSection,
  type ReportTypeSummary,
} from '@shared/api/reports';
import { organizationApi } from '@shared/api/observations';
import { isApiError } from '@shared/api/errors';
import {
  CoverageSeal,
  Eyebrow,
  PageIntro,
  SectionRule,
} from '@shared/ui/product';
import { useAuth } from '@app/auth/AuthProvider';
import { has, PERMISSIONS } from '@app/permissions/permissions';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  Select,
  StatusBadge,
  UnavailableState,
  type Column,
} from '@shared/ui/primitives';
import { Icon, StatusIcons } from '@shared/ui/icons';

/** Period presets. `days` is how far back from now the window starts. */
const PERIODS: ReadonlyArray<{ id: string; label: string; days: number }> = [
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last quarter', days: 90 },
  { id: '365d', label: 'Last 12 months', days: 365 },
];

export function ReportsPage() {
  const user = useAuth().user;
  const canExport = has(user, PERMISSIONS.exportReports);

  const [selected, setSelected] = useState<string>('');
  const [periodId, setPeriodId] = useState('30d');
  const [granularity, setGranularity] = useState<Granularity>('total');
  const [restaurantId, setRestaurantId] = useState('');

  const catalogue = useQuery({
    queryKey: ['reports', 'types'],
    queryFn: () => reportsApi.types(),
    staleTime: 60_000,
  });

  // Sites drive the timezone the period boundaries are computed in, so this is
  // not decoration: "September" for a Singapore kitchen is not September UTC.
  const sites = useQuery({
    queryKey: ['restaurants'],
    queryFn: () => organizationApi.restaurants(),
    staleTime: 60_000,
    enabled: has(user, PERMISSIONS.viewUsers) || has(user, PERMISSIONS.manageOrganization),
  });

  const days = PERIODS.find((p) => p.id === periodId)?.days ?? 30;
  const since = useMemo(
    () => new Date(Date.now() - days * 86_400_000).toISOString(),
    [days],
  );

  const active = catalogue.data?.reports.find((r) => r.id === selected) ?? null;
  const granularities = active?.granularities ?? ['total'];
  const effectiveGranularity: Granularity = granularities.includes(granularity)
    ? granularity
    : 'total';

  const report = useQuery({
    queryKey: ['reports', selected, since, effectiveGranularity, restaurantId],
    queryFn: () =>
      reportsApi.generate(selected, {
        since,
        granularity: effectiveGranularity,
        restaurant_id: restaurantId || undefined,
      }),
    enabled: Boolean(selected) && Boolean(active?.permitted),
  });

  const download = useMutation({
    mutationFn: async (format: string) => {
      const { blob, filename } = await reportsApi.export(selected, format, {
        since,
        granularity: effectiveGranularity,
        restaurant_id: restaurantId || undefined,
      });
      // An object URL revoked immediately after the click: the bytes are
      // already in the download, and an un-revoked URL keeps a report about a
      // named shift team alive in the tab for as long as it is open.
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      return filename;
    },
  });

  return (
    <>
      <PageIntro
        eyebrow="Compliance"
        title="Reports"
        standfirst="Periods, coverage and export. Every figure states the window and the sources it was computed from, because a count without its coverage cannot be read — and a period that has not finished is never presented as one that has."
        meta={
          catalogue.isSuccess ? (
            <>
              <Badge mono>{catalogue.data.count} report types</Badge>
              {canExport ? null : <Badge>read-only — this account cannot export</Badge>}
            </>
          ) : undefined
        }
      />

      {catalogue.isPending ? <LoadingState label="Loading report types" /> : null}

      {catalogue.isError ? (
        <ErrorState
          body={
            isApiError(catalogue.error)
              ? catalogue.error.friendlyMessage
              : 'The report catalogue could not be loaded.'
          }
          requestId={isApiError(catalogue.error) ? catalogue.error.requestId : undefined}
          onRetry={() => void catalogue.refetch()}
        />
      ) : null}

      {catalogue.isSuccess ? (
        <>
        <SectionRule
          lead
          order={2}
          label="Choose a report"
          detail="Twelve types. The ones backed by records in this organisation are listed first; the rest are listed on purpose, because an omitted module reads as nothing to report."
        />
        <div
          className="uwv-arrive"
          data-order="2"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(15rem, 19rem) minmax(0, 1fr)',
            gap: 'var(--space-6)',
            alignItems: 'start',
          }}
        >
          <ReportPicker
            reports={catalogue.data.reports}
            selected={selected}
            onSelect={(id) => {
              setSelected(id);
              download.reset();
            }}
          />

          <div style={{ display: 'grid', gap: 'var(--space-5)', minWidth: 0 }}>
            <Controls
              periodId={periodId}
              onPeriod={setPeriodId}
              granularity={effectiveGranularity}
              granularities={granularities}
              onGranularity={setGranularity}
              restaurantId={restaurantId}
              onRestaurant={setRestaurantId}
              sites={sites.data?.restaurants ?? []}
              disabled={!active}
              maxWindowDays={catalogue.data.max_window_days}
            />

            {!active ? (
              <EmptyState
                title="Choose a report"
                body="Every report states its period, its timezone and what it was computed from. Reports for modules that are not connected yet say so, in that module's own words."
              />
            ) : !active.permitted ? (
              <UnavailableState
                title="Your account cannot run this report"
                body={
                  <>
                    A report requires the permission for every source it reads, so
                    that reporting is never a way to reach data an account is
                    otherwise refused. This one needs{' '}
                    <strong>{active.requires.join(', ')}</strong>.
                  </>
                }
              />
            ) : (
              <ReportBody
                query={report}
                canExport={canExport}
                formats={catalogue.data.formats}
                onExport={(format) => download.mutate(format)}
                exporting={download.isPending ? (download.variables as string) : null}
                exportError={download.error instanceof Error ? download.error.message : null}
                exportedAs={download.isSuccess ? (download.data as string) : null}
              />
            )}
          </div>
        </div>
        </>
      ) : null}
    </>
  );
}

/* ── the catalogue, grouped by whether it has data ────────────────────────── */

function ReportPicker({
  reports,
  selected,
  onSelect,
}: {
  reports: ReportTypeSummary[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const backed = reports.filter((r) => r.kind === 'data');
  const modules = reports.filter((r) => r.kind === 'capability');

  return (
    <Card padded={false}>
      <nav aria-label="Report types" style={{ padding: 'var(--space-3)' }}>
        <Group title="Backed by data" hint="Real records in this organisation">
          {backed.map((report) => (
            <PickerItem
              key={report.id}
              report={report}
              active={report.id === selected}
              onSelect={onSelect}
            />
          ))}
        </Group>

        <Group
          title="Not connected yet"
          hint="Listed on purpose — an omitted module reads as nothing to report"
        >
          {modules.map((report) => (
            <PickerItem
              key={report.id}
              report={report}
              active={report.id === selected}
              onSelect={onSelect}
              awaiting
            />
          ))}
        </Group>
      </nav>
    </Card>
  );
}

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      <div
        style={{
          fontSize: 'var(--text-2xs)',
          textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-wider)',
          color: 'var(--ink-tertiary)',
          padding: '0 var(--space-2) var(--space-1)',
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 'var(--text-2xs)',
          color: 'var(--ink-tertiary)',
          padding: '0 var(--space-2) var(--space-2)',
        }}
      >
        {hint}
      </div>
      <ul style={{ listStyle: 'none', display: 'grid', gap: '2px' }}>{children}</ul>
    </div>
  );
}

function PickerItem({
  report,
  active,
  onSelect,
  awaiting = false,
}: {
  report: ReportTypeSummary;
  active: boolean;
  onSelect: (id: string) => void;
  /**
   * Whether this report's module has no data source connected yet.
   *
   * Before Stage 5 the two halves of this list were set in the same size, the
   * same weight and the same colour, and only a group heading told them apart
   * — so a reader scanning the twelve entries saw twelve equivalent reports,
   * six of which cannot produce anything. The marker is the same hollow ring
   * the navigation uses for the same fact, which is what makes it legible
   * without a legend.
   */
  awaiting?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(report.id)}
        aria-current={active ? 'true' : undefined}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: 'var(--space-2) var(--space-3)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid',
          borderColor: active ? 'var(--accent-line)' : 'transparent',
          background: active ? 'var(--accent-wash)' : 'transparent',
          color: report.permitted ? 'var(--ink-primary)' : 'var(--ink-tertiary)',
          cursor: 'pointer',
          fontSize: 'var(--text-sm)',
          display: 'grid',
          gap: '2px',
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            justifyContent: 'space-between',
            fontWeight: active ? 'var(--weight-medium)' : 'var(--weight-regular)',
          }}
        >
          <span style={{ minWidth: 0 }}>{report.title}</span>
          {awaiting ? (
            <span style={{ color: 'var(--ink-tertiary)', flexShrink: 0, display: 'flex' }}>
              <Icon icon={StatusIcons.awaiting} size="inline" />
            </span>
          ) : null}
          {awaiting ? <span className="sr-only">awaiting a data source</span> : null}
        </span>
        {/* Listed even when refused, and saying so. A menu that silently varied
            by account would leave an operator unable to tell "does not exist"
            from "you may not run it". */}
        {!report.permitted ? (
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-tertiary)' }}>
            Not available to your account
          </span>
        ) : null}
      </button>
    </li>
  );
}

/* ── period controls ──────────────────────────────────────────────────────── */

function Controls({
  periodId,
  onPeriod,
  granularity,
  granularities,
  onGranularity,
  restaurantId,
  onRestaurant,
  sites,
  disabled,
  maxWindowDays,
}: {
  periodId: string;
  onPeriod: (id: string) => void;
  granularity: Granularity;
  granularities: Granularity[];
  onGranularity: (g: Granularity) => void;
  restaurantId: string;
  onRestaurant: (id: string) => void;
  sites: Array<{ id: string; name: string; timezone: string }>;
  disabled: boolean;
  maxWindowDays: number;
}) {
  return (
    <Card>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
          alignItems: 'flex-end',
        }}
      >
        <fieldset
          disabled={disabled}
          style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 'var(--space-2)' }}
        >
          <legend
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 'var(--weight-medium)',
              color: 'var(--ink-secondary)',
              padding: 0,
            }}
          >
            Period
          </legend>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {PERIODS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onPeriod(option.id)}
                aria-pressed={periodId === option.id}
                style={{
                  padding: '0.3rem 0.7rem',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 'var(--weight-medium)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  background: periodId === option.id ? 'var(--accent)' : 'var(--surface-raised)',
                  color:
                    periodId === option.id ? 'var(--ink-on-accent)' : 'var(--ink-primary)',
                  borderColor:
                    periodId === option.id ? 'var(--accent)' : 'var(--line-default)',
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <Select
          label="Granularity"
          value={granularity}
          disabled={disabled || granularities.length <= 1}
          onChange={(event) => onGranularity(event.target.value as Granularity)}
        >
          {granularities.map((option) => (
            <option key={option} value={option}>
              {GRANULARITY_LABELS[option]}
            </option>
          ))}
        </Select>

        <Select
          label="Site (sets the timezone)"
          value={restaurantId}
          disabled={disabled}
          onChange={(event) => onRestaurant(event.target.value)}
        >
          <option value="">All sites · UTC boundaries</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name} · {site.timezone}
            </option>
          ))}
        </Select>
      </div>

      <p
        style={{
          marginTop: 'var(--space-3)',
          fontSize: 'var(--text-xs)',
          color: 'var(--ink-tertiary)',
          maxWidth: '70ch',
        }}
      >
        Period boundaries are computed in the selected site's own timezone — a
        month for a Singapore kitchen does not begin at midnight UTC. Windows are
        capped at {maxWindowDays} days; a longer period is refused rather than
        scanned.
      </p>
    </Card>
  );
}

/* ── the report itself ────────────────────────────────────────────────────── */

function ReportBody({
  query,
  canExport,
  formats,
  onExport,
  exporting,
  exportError,
  exportedAs,
}: {
  query: ReturnType<typeof useQuery<Report>>;
  canExport: boolean;
  formats: Record<string, { available: boolean; reason: string }>;
  onExport: (format: string) => void;
  exporting: string | null;
  exportError: string | null;
  exportedAs: string | null;
}) {
  if (query.isPending) return <LoadingState label="Generating report" />;

  if (query.isError) {
    return (
      <ErrorState
        body={
          isApiError(query.error)
            ? query.error.friendlyMessage
            : 'The report could not be generated.'
        }
        requestId={isApiError(query.error) ? query.error.requestId : undefined}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const report = query.data;

  return (
    /* A report is an issued document, so it is given a document's surface.

       Stage 5's critique found this page reading as "a form with an export
       button": a picker, a control panel and a placeholder, all on the same
       plane, with the report itself arriving as three more cards among them.
       A compliance report is the artefact somebody defends an inspection with.
       It now sits on a raised surface with a document's margins and a rule
       under its masthead, so that the moment a report exists it looks like a
       thing that was produced rather than a region that was filled. */
    <article
      style={{
        display: 'grid',
        gap: 'var(--space-6)',
        minWidth: 0,
        background: 'var(--surface-raised)',
        border: '1px solid var(--line-subtle)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        padding: 'var(--space-8) var(--space-8) var(--space-6)',
      }}
    >
      {/* Coverage first. A reader who meets the numbers before the caveat has
          already formed a conclusion. */}
      <CoveragePanel report={report} />

      {report.capability_state ? (
        <UnavailableState
          title={
            report.capability_state === 'blocked'
              ? 'This module is blocked'
              : 'This module is not connected'
          }
          body={report.capability_reason}
        />
      ) : null}

      <SectionRule
        label="Figures"
        detail="Counts of what was recorded in the window above. An empty section says which kind of nothing it is."
      />

      {report.sections.map((section) => (
        <SectionCard key={section.key} section={section} />
      ))}

      <ExportBar
        canExport={canExport}
        formats={formats}
        onExport={onExport}
        exporting={exporting}
        error={exportError}
        exportedAs={exportedAs}
        complete={report.coverage.complete}
      />
    </article>
  );
}

/**
 * Coverage, before the figures — and at the weight of a verdict.
 *
 * The brief's requirement is that an incomplete report must not look like a
 * complete one with a small warning somewhere. The previous panel was a `Card`
 * identical to every other `Card` on the page, carrying a status badge among
 * other badges; a reader scanning for numbers met the numbers first.
 *
 * `CoverageSeal` gives it a band, a colour that changes with the verdict and a
 * headline written as a sentence rather than a label. It stays when coverage is
 * complete, deliberately: a treatment that only appears when something is wrong
 * is a treatment readers learn to skip, and "this period is whole" is itself
 * worth stating before a figure is compared with another month.
 *
 * Every fact the old panel carried is still here — window, timezone and whether
 * it resolved, granularity, basis, per-source availability, every gap — and the
 * strings a reader relies on are unchanged.
 */
function CoveragePanel({ report }: { report: Report }) {
  const { coverage } = report;

  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <div>
        <h2
          style={{
            fontSize: 'var(--text-2xl)',
            letterSpacing: 'var(--tracking-display)',
          }}
        >
          {report.title}
        </h2>
        <p
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--ink-secondary)',
            maxWidth: 'var(--measure)',
            marginTop: 'var(--space-2)',
          }}
        >
          {report.subtitle}
        </p>
      </div>

      <CoverageSeal
        complete={coverage.complete}
        headline={
          coverage.complete
            ? 'Every source this report reads answered for the whole period.'
            : 'Part of this period is not represented. Read the gaps before comparing these figures with another period.'
        }
        basis={
          <>
            {coverage.basis ? <>{coverage.basis} </> : null}
            Figures are counts of what was recorded, not estimates — nothing here is
            interpolated across a gap.
          </>
        }
        facts={[
          {
            key: 'Window',
            value: (
              <>
                {formatInstant(coverage.since)} — {formatInstant(coverage.until)}
              </>
            ),
          },
          {
            key: 'Timezone',
            value: (
              <>
                {coverage.timezone}
                {!coverage.timezone_resolved ? (
                  // Not swallowed. A zone that did not resolve means the
                  // boundaries are UTC and may be a day out, and that must be
                  // visible next to the window it distorts.
                  <span style={{ color: 'var(--state-absent)' }}>
                    {' '}
                    — unresolved, boundaries computed in UTC
                  </span>
                ) : null}
              </>
            ),
          },
          { key: 'Granularity', value: GRANULARITY_LABELS[coverage.granularity] },
        ]}
        gaps={coverage.gaps.map((gap, index) => ({
          key: `${gap.kind}-${index}`,
          detail: (
            <>
              <Badge mono>{gap.kind}</Badge> {gap.detail}
            </>
          ),
        }))}
      />

      {coverage.gaps.length > 0 ? (
        <p
          style={{
            fontSize: 'var(--text-2xs)',
            textTransform: 'uppercase',
            letterSpacing: 'var(--tracking-wider)',
            color: 'var(--health-degraded)',
            fontWeight: 'var(--weight-semibold)',
          }}
        >
          Read this before comparing these figures
        </p>
      ) : null}

      {coverage.sources.length > 0 ? (
        <div>
          <Eyebrow>Sources</Eyebrow>
          <ul
            style={{
              listStyle: 'none',
              display: 'flex',
              gap: 'var(--space-2) var(--space-4)',
              flexWrap: 'wrap',
              marginTop: 'var(--space-3)',
            }}
          >
            {coverage.sources.map((source) => (
              <li key={source.source}>
                {/* Availability and emptiness look different, because they are.
                    A source that could not be read is not a source that
                    returned nothing, and collapsing the two is how a report
                    comes to say "0 violations" about a camera that was off. */}
                <StatusBadge tone={source.available ? 'online' : 'offline'}>
                  {source.source}:{' '}
                  {source.available
                    ? `${source.rows} rows${source.truncated ? ' (truncated)' : ''}`
                    : 'not available'}
                </StatusBadge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function SectionCard({ section }: { section: ReportSection }) {
  const columns = useMemo<ReadonlyArray<Column<Record<string, unknown>>>>(
    () =>
      section.columns.map((column) => ({
        key: column.key,
        header: column.header,
        numeric: column.numeric,
        render: (row: Record<string, unknown>) => String(row[column.key] ?? '—'),
      })),
    [section.columns],
  );

  return (
    <Card padded={false}>
      <div style={{ padding: 'var(--space-5) var(--space-5) 0' }}>
        <h3 style={{ fontSize: 'var(--text-md)' }}>{section.title}</h3>
        {section.note ? (
          <p
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--ink-tertiary)',
              maxWidth: '78ch',
              marginTop: 'var(--space-2)',
            }}
          >
            {section.note}
          </p>
        ) : null}
      </div>
      <div style={{ marginTop: 'var(--space-4)' }}>
        <DataTable
          columns={columns}
          rows={section.rows}
          rowKey={(row) => String(row[section.columns[0]?.key ?? ''] ?? Math.random())}
          caption={section.title}
          // The backend's own sentence about which kind of nothing this is.
          // Never a table with headers and no rows under them.
          empty={<EmptyState title="Nothing to show for this period" body={section.empty_note} />}
        />
      </div>
    </Card>
  );
}

function ExportBar({
  canExport,
  formats,
  onExport,
  exporting,
  error,
  exportedAs,
  complete,
}: {
  canExport: boolean;
  formats: Record<string, { available: boolean; reason: string }>;
  onExport: (format: string) => void;
  exporting: string | null;
  error: string | null;
  exportedAs: string | null;
  complete: boolean;
}) {
  if (!canExport) {
    return (
      <Card>
        <h3 style={{ fontSize: 'var(--text-md)' }}>Export</h3>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-secondary)', maxWidth: '70ch', marginTop: 'var(--space-2)' }}>
          Your account can read this report but not take a copy away. Exporting is
          a separate permission because a downloaded file leaves this system: no
          retention policy here reaches it, and it outlives every rule this
          application enforces.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h3 style={{ fontSize: 'var(--text-md)' }}>Export</h3>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-secondary)', maxWidth: '70ch', marginTop: 'var(--space-2)' }}>
        Every format carries the coverage above it, including the gaps.{' '}
        {complete
          ? 'This period is complete.'
          : 'This period is incomplete, and the file will say so on its first page.'}{' '}
        Each download is recorded in the audit trail.
      </p>

      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-4)' }}>
        {EXPORT_FORMATS.map((format) => {
          const availability = formats[format.id] ?? { available: true, reason: '' };
          return (
            <Button
              key={format.id}
              variant={format.id === 'pdf' ? 'primary' : 'secondary'}
              disabled={!availability.available}
              loading={exporting === format.id}
              title={availability.available ? format.hint : availability.reason}
              onClick={() => onExport(format.id)}
            >
              {format.label}
            </Button>
          );
        })}
      </div>

      {/* A format this deployment cannot produce says why, rather than being a
          button that fails when pressed. */}
      {Object.entries(formats)
        .filter(([, value]) => !value.available)
        .map(([id, value]) => (
          <p
            key={id}
            style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)', marginTop: 'var(--space-3)', maxWidth: '70ch' }}
          >
            {value.reason}
          </p>
        ))}

      {error ? (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--state-absent)', marginTop: 'var(--space-3)' }}>
          {error}
        </p>
      ) : null}

      {exportedAs && !error ? (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)', marginTop: 'var(--space-3)' }}>
          Downloaded <span style={{ fontFamily: 'var(--font-mono)' }}>{exportedAs}</span>. This
          export has been recorded in the audit trail.
        </p>
      ) : null}
    </Card>
  );
}

function formatInstant(iso: string): string {
  const when = new Date(iso);
  return Number.isNaN(when.getTime()) ? iso : when.toLocaleString();
}

/**
 * The data table: how every list worth working with is worked with.
 *
 * Small, fixed tables keep the plain `DataTable` in `primitives.tsx`. Anything
 * somebody searches, narrows, sorts, pages through or acts on in bulk is built
 * from the parts here, composed inside one `TableCard`:
 *
 *     TableCard
 *       TableToolbar   search · Filters · View (columns, density) · actions
 *       FilterChips    Status: Active ×   Clear all
 *       BulkActionBar  3 selected · Suspend · Export · Clear
 *       DataGrid       sortable headers · selection · row menus · states
 *       Pagination     Showing 1–25 of 42 · rows per page · ‹ 1 2 ›
 *
 * ### Honest by construction
 *
 * Nothing here fetches. A list the server pages, searches and filters passes
 * the server's own `total` and pages by `offset`; a list the server returns
 * whole is derived on the client with `useClientRows`. **Sorting is offered
 * only where the whole list is on the client**: the API has no sort parameter,
 * and sorting one server page would present the first twenty-five rows in
 * order as if they were the first twenty-five in order.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

import { DataIcons, Icon } from './icons';
import { Checkbox, SearchInput } from './forms';
import { DropdownMenu, Popover, type MenuEntry } from './overlays';
import { Button, EmptyState, ErrorState, Skeleton } from './primitives';

/* ────────────────────────────────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────────────────────────────────── */

export interface GridColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Right-aligned, tabular figures. */
  numeric?: boolean;
  width?: string;
  /** Offer a sort on this column. Only honoured when the grid is given `onSort`. */
  sortable?: boolean;
  /** May the column chooser hide it? The first column never can. */
  hideable?: boolean;
  /** Text for an exported CSV. Defaults to nothing for columns without one. */
  exportValue?: (row: T) => string | number | null;
}

export type SortDirection = 'asc' | 'desc';
export interface SortState {
  key: string;
  direction: SortDirection;
}

export type Density = 'comfortable' | 'compact';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDefinition {
  id: string;
  label: string;
  options: ReadonlyArray<FilterOption>;
  /** One value at a time — the server takes one. */
  single?: boolean;
}

export type FilterValues = Readonly<Record<string, ReadonlyArray<string>>>;

/* ────────────────────────────────────────────────────────────────────────────
   State
   ──────────────────────────────────────────────────────────────────────────── */

function readPreference<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writePreference(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* A private window, or storage switched off: the preference lasts the page. */
  }
}

/** A value that settles a moment after the last keystroke. */
export function useSettled<T>(value: T, delayMs = 250): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

export const PAGE_SIZES = [10, 25, 50, 100] as const;

/**
 * Everything a table remembers about how it is being looked at.
 *
 * Changing what is asked for — search, filters, sort, page size — goes back to
 * the first page and drops the selection, because a selection of rows that are
 * no longer on screen is a selection nobody can see before acting on it.
 * Column choice and density are a viewer's preference and outlive the page.
 */
export function useTableState(
  id: string,
  init: { pageSize?: number; sort?: SortState | null; filters?: FilterValues } = {},
) {
  const [search, setSearchRaw] = useState('');
  const settledSearch = useSettled(search);
  const [filters, setFiltersRaw] = useState<FilterValues>(init.filters ?? {});
  const [sort, setSortRaw] = useState<SortState | null>(init.sort ?? null);
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSizeRaw] = useState(init.pageSize ?? 25);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [hidden, setHiddenRaw] = useState<ReadonlySet<string>>(
    () => new Set(readPreference<string[]>(`uwv.table.${id}.hidden`, [])),
  );
  const [density, setDensityRaw] = useState<Density>(() =>
    readPreference<Density>(`uwv.table.${id}.density`, 'comfortable'),
  );

  const restart = () => {
    setOffset(0);
    setSelected(new Set());
  };

  // The settled search, not each keystroke, sends the list back to page one.
  const firstSearch = useRef(true);
  useEffect(() => {
    if (firstSearch.current) {
      firstSearch.current = false;
      return;
    }
    setOffset(0);
    setSelected(new Set());
  }, [settledSearch]);

  return {
    search,
    setSearch: setSearchRaw,
    /** What to query with: the search a quarter-second after the last keystroke. */
    query: settledSearch.trim(),
    filters,
    setFilter: (filterId: string, values: ReadonlyArray<string>) => {
      setFiltersRaw((current) => ({ ...current, [filterId]: values }));
      restart();
    },
    clearFilters: () => {
      setFiltersRaw({});
      setSearchRaw('');
      restart();
    },
    sort,
    setSort: (next: SortState | null) => {
      setSortRaw(next);
      restart();
    },
    offset,
    setOffset: (next: number) => setOffset(Math.max(0, next)),
    pageSize,
    setPageSize: (next: number) => {
      setPageSizeRaw(next);
      restart();
    },
    selected,
    setSelected,
    hidden,
    setHidden: (next: ReadonlySet<string>) => {
      setHiddenRaw(next);
      writePreference(`uwv.table.${id}.hidden`, [...next]);
    },
    density,
    setDensity: (next: Density) => {
      setDensityRaw(next);
      writePreference(`uwv.table.${id}.density`, next);
    },
    /** Is the person looking at a narrowed list, rather than all of it? */
    narrowed: settledSearch.trim() !== '' || Object.values(filters).some((values) => values.length > 0),
  };
}

export type TableState = ReturnType<typeof useTableState>;

/** The first value of a single-choice filter, or `undefined`. */
export function filterValue(filters: FilterValues, id: string): string | undefined {
  return filters[id]?.[0];
}

/**
 * Search, filter, sort and page a list that is entirely on the client.
 *
 * Only for lists the server returns whole. `total` is the count after
 * filtering — what "Showing 1–25 of 40" must mean.
 */
export function useClientRows<T>(
  rows: ReadonlyArray<T>,
  state: Pick<TableState, 'query' | 'filters' | 'sort' | 'offset' | 'pageSize'>,
  {
    text,
    filterBy = {},
    sortBy = {},
  }: {
    /** The words a row is found by. */
    text: (row: T) => string;
    /** For each filter id, the value a row has. */
    filterBy?: Record<string, (row: T) => string | ReadonlyArray<string>>;
    /** For each sortable column key, what it sorts by. */
    sortBy?: Record<string, (row: T) => string | number | null>;
  },
) {
  const { query, filters, sort, offset, pageSize } = state;
  return useMemo(() => {
    const needle = query.toLowerCase();
    let matched = rows.filter((row) => {
      if (needle && !text(row).toLowerCase().includes(needle)) return false;
      for (const [id, wanted] of Object.entries(filters)) {
        if (wanted.length === 0) continue;
        const read = filterBy[id];
        if (!read) continue;
        const has = read(row);
        const values = typeof has === 'string' ? [has] : has;
        if (!values.some((value) => wanted.includes(value))) return false;
      }
      return true;
    });
    const read = sort ? sortBy[sort.key] : undefined;
    if (sort && read) {
      const sign = sort.direction === 'asc' ? 1 : -1;
      matched = [...matched].sort((a, b) => {
        const x = read(a);
        const y = read(b);
        // Missing values sort last in either direction: "unknown" is not small.
        if (x === null && y === null) return 0;
        if (x === null) return 1;
        if (y === null) return -1;
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * sign;
        return String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' }) * sign;
      });
    }
    return {
      page: matched.slice(offset, offset + pageSize),
      matched,
      total: matched.length,
    };
    // `text`, `filterBy` and `sortBy` are left out of the dependencies on
    // purpose: they are pure functions of the row, and callers write them inline.
  }, [rows, query, filters, sort, offset, pageSize]);
}

/* ────────────────────────────────────────────────────────────────────────────
   The card
   ──────────────────────────────────────────────────────────────────────────── */

/** One surface for a list: its controls, its rows and its pages, together. */
export function TableCard({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <section className="uwv-datatable" aria-label={label}>
      {children}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Toolbar
   ──────────────────────────────────────────────────────────────────────────── */

export function TableToolbar<T>({
  state,
  searchLabel,
  searchPlaceholder,
  searching = false,
  filters = [],
  columns,
  actions,
  leading,
  shortcut = true,
}: {
  state: TableState;
  /** Before the search: the list's views (All · Active · Deactivated). */
  leading?: ReactNode;
  /** "Search organizations". Omit for a list that cannot be searched. */
  searchLabel?: string;
  searchPlaceholder?: string;
  /** A request for the settled search is in flight. */
  searching?: boolean;
  filters?: ReadonlyArray<FilterDefinition>;
  /** Pass the grid's columns to offer the column chooser. */
  columns?: ReadonlyArray<GridColumn<T>>;
  /** The list's own acts, at the far end: New, Export. */
  actions?: ReactNode;
  shortcut?: boolean;
}) {
  return (
    <div className="uwv-datatable-toolbar">
      {leading}
      {searchLabel ? (
        <div className="uwv-datatable-search">
          <SearchInput
            label={searchLabel}
            placeholder={searchPlaceholder}
            value={state.search}
            onChange={state.setSearch}
            busy={searching}
            shortcut={shortcut}
          />
        </div>
      ) : null}
      {filters.length > 0 ? <FilterButton filters={filters} state={state} /> : null}
      {columns ? <ViewOptions columns={columns} state={state} /> : null}
      {actions ? <div className="uwv-datatable-actions">{actions}</div> : null}
    </div>
  );
}

/** Narrow by a property. One popover, every filter the list has. */
export function FilterButton({ filters, state }: { filters: ReadonlyArray<FilterDefinition>; state: TableState }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const active = filters.reduce((sum, filter) => sum + (state.filters[filter.id]?.length ?? 0), 0);

  return (
    <>
      <Button
        ref={anchor}
        variant="secondary"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        icon={<Icon icon={DataIcons.filter} />}
      >
        Filters
        {active > 0 ? (
          <span className="uwv-count-pill" aria-label={`${active} active`}>
            {active}
          </span>
        ) : null}
      </Button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} label="Filters" width="18rem">
        <div className="uwv-filter-panel">
          {filters.map((filter) => {
            const chosen = state.filters[filter.id] ?? [];
            return (
              <fieldset key={filter.id} className="uwv-filter-group">
                <legend className="uwv-filter-legend">{filter.label}</legend>
                {filter.options.map((option) =>
                  filter.single ? (
                    <label key={option.value} className="uwv-check">
                      <input
                        type="radio"
                        name={`filter-${filter.id}`}
                        checked={chosen[0] === option.value}
                        onChange={() => state.setFilter(filter.id, [option.value])}
                      />
                      <span className="uwv-check-label">{option.label}</span>
                    </label>
                  ) : (
                    <Checkbox
                      key={option.value}
                      label={option.label}
                      checked={chosen.includes(option.value)}
                      onChange={(next) =>
                        state.setFilter(
                          filter.id,
                          next ? [...chosen, option.value] : chosen.filter((value) => value !== option.value),
                        )
                      }
                    />
                  ),
                )}
              </fieldset>
            );
          })}
        </div>
        <div className="uwv-popover-foot">
          <Button
            variant="ghost"
            size="sm"
            disabled={active === 0}
            onClick={() => filters.forEach((filter) => state.setFilter(filter.id, []))}
          >
            Clear filters
          </Button>
          <Button variant="primary" size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </Popover>
    </>
  );
}

/** Which columns, and how tightly. A viewer's preference, remembered. */
function ViewOptions<T>({ columns, state }: { columns: ReadonlyArray<GridColumn<T>>; state: TableState }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const hideable = columns.filter((column, index) => index > 0 && column.hideable !== false);

  return (
    <>
      <Button
        ref={anchor}
        variant="secondary"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        icon={<Icon icon={DataIcons.columns} />}
      >
        View
      </Button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} label="View options" align="end" width="16rem">
        <div className="uwv-filter-panel">
          <fieldset className="uwv-filter-group">
            <legend className="uwv-filter-legend">Density</legend>
            <div role="group" aria-label="Row density" className="uwv-tabs" style={{ width: '100%' }}>
              {(['comfortable', 'compact'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className="uwv-tab"
                  style={{ flex: 1 }}
                  aria-pressed={state.density === option}
                  onClick={() => state.setDensity(option)}
                >
                  {option === 'comfortable' ? 'Comfortable' : 'Compact'}
                </button>
              ))}
            </div>
          </fieldset>
          {hideable.length > 0 ? (
            <fieldset className="uwv-filter-group">
              <legend className="uwv-filter-legend">Columns</legend>
              {hideable.map((column) => (
                <Checkbox
                  key={column.key}
                  label={column.header}
                  checked={!state.hidden.has(column.key)}
                  onChange={(show) => {
                    const next = new Set(state.hidden);
                    if (show) next.delete(column.key);
                    else next.add(column.key);
                    state.setHidden(next);
                  }}
                />
              ))}
            </fieldset>
          ) : null}
        </div>
      </Popover>
    </>
  );
}

/** What the list is narrowed by, each removable, and a way back to all of it. */
export function FilterChips({
  filters,
  state,
}: {
  filters: ReadonlyArray<FilterDefinition>;
  state: TableState;
}) {
  const chips = filters.flatMap((filter) =>
    (state.filters[filter.id] ?? []).map((value) => ({
      filter,
      value,
      label: filter.options.find((option) => option.value === value)?.label ?? value,
    })),
  );
  if (chips.length === 0 && !state.query) return null;

  return (
    <div className="uwv-filter-chips" aria-label="Active filters" role="group">
      {state.query ? (
        <span className="uwv-filter-chip">
          <span className="uwv-filter-chip-key">Search:</span> “{state.query}”
          <button type="button" aria-label="Remove search" onClick={() => state.setSearch('')}>
            <Icon icon={DataIcons.clear} size="inline" />
          </button>
        </span>
      ) : null}
      {chips.map((chip) => (
        <span key={`${chip.filter.id}:${chip.value}`} className="uwv-filter-chip">
          <span className="uwv-filter-chip-key">{chip.filter.label}:</span> {chip.label}
          <button
            type="button"
            aria-label={`Remove filter ${chip.filter.label}: ${chip.label}`}
            onClick={() =>
              state.setFilter(
                chip.filter.id,
                (state.filters[chip.filter.id] ?? []).filter((value) => value !== chip.value),
              )
            }
          >
            <Icon icon={DataIcons.clear} size="inline" />
          </button>
        </span>
      ))}
      <button type="button" className="uwv-link-button" onClick={state.clearFilters}>
        Clear all
      </button>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Bulk actions
   ──────────────────────────────────────────────────────────────────────────── */

/** Appears with a selection; says how many, offers what can be done to all of them. */
export function BulkActionBar({
  count,
  noun,
  onClear,
  children,
}: {
  count: number;
  /** Plural noun: "organizations". */
  noun: string;
  onClear: () => void;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="uwv-bulkbar" role="region" aria-label="Bulk actions">
      <span className="uwv-bulkbar-count" aria-live="polite">
        <strong>{count}</strong> {count === 1 ? noun.replace(/s$/, '') : noun} selected
      </span>
      <div className="uwv-bulkbar-actions">{children}</div>
      <Button variant="ghost" size="sm" onClick={onClear}>
        Clear selection
      </Button>
    </div>
  );
}

/** A CSV of the rows given, through the columns that say how to write themselves. */
export function downloadCsv<T>(filename: string, columns: ReadonlyArray<GridColumn<T>>, rows: ReadonlyArray<T>) {
  const exportable = columns.filter((column) => column.exportValue);
  const cell = (value: string | number | null | undefined) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [
    exportable.map((column) => cell(column.header)).join(','),
    ...rows.map((row) => exportable.map((column) => cell(column.exportValue!(row))).join(',')),
  ];
  const blob = new Blob([`${lines.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ────────────────────────────────────────────────────────────────────────────
   The grid
   ──────────────────────────────────────────────────────────────────────────── */

const SKELETON_ROWS = 6;

function nextSort(current: SortState | null, key: string): SortState | null {
  if (!current || current.key !== key) return { key, direction: 'asc' };
  if (current.direction === 'asc') return { key, direction: 'desc' };
  return null;
}

/**
 * The rows themselves.
 *
 * - A sortable header is a button inside the `th`, with `aria-sort` on the
 *   cell — the pattern screen readers announce as "sorted ascending".
 * - Selection is a real checkbox per row and a tri-state one in the header,
 *   covering the rows on this page.
 * - Row acts sit in a final column that stays pinned while a wide table
 *   scrolls, behind one "•••" per row.
 * - ↑ and ↓ move between rows, keeping the column: a keyboard user can walk a
 *   list of links or checkboxes the way a mouse user scans it.
 */
export function DataGrid<T>({
  caption,
  columns,
  rows,
  rowKey,
  hidden,
  density = 'comfortable',
  sort,
  onSort,
  selection,
  rowActions,
  rowActionsLabel,
  rowInline,
  loading = false,
  error,
  onRetry,
  empty,
  noResults,
  narrowed = false,
  onRowOpen,
}: {
  caption: string;
  columns: ReadonlyArray<GridColumn<T>>;
  rows: ReadonlyArray<T>;
  rowKey: (row: T) => string;
  hidden?: ReadonlySet<string>;
  density?: Density;
  sort?: SortState | null;
  /** Give this only when the whole list is on the client. */
  onSort?: (next: SortState | null) => void;
  selection?: {
    selected: ReadonlySet<string>;
    onChange: (next: ReadonlySet<string>) => void;
    /** The accessible name of a row's box: "Select PCC2". */
    label: (row: T) => string;
    canSelect?: (row: T) => boolean;
  };
  rowActions?: (row: T) => ReadonlyArray<MenuEntry>;
  rowActionsLabel?: (row: T) => string;
  /** The one act a row offers in plain sight, beside its menu — "Edit". */
  rowInline?: (row: T) => ReactNode;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Nothing exists yet. Says what to do first. */
  empty: ReactNode;
  /** Nothing matches the search or filters. Offers the way back. */
  noResults?: ReactNode;
  narrowed?: boolean;
  /** Open the row's own page on a click anywhere in the row. */
  onRowOpen?: (row: T) => void;
}) {
  const visible = columns.filter((column, index) => index === 0 || !hidden?.has(column.key));
  const selectable = selection ? rows.filter((row) => selection.canSelect?.(row) ?? true) : [];
  const pageKeys = selectable.map(rowKey);
  const chosenHere = selection ? pageKeys.filter((key) => selection.selected.has(key)).length : 0;
  const body = useRef<HTMLTableSectionElement>(null);

  const toggleAll = useCallback(
    (on: boolean) => {
      if (!selection) return;
      const next = new Set(selection.selected);
      for (const key of pageKeys) {
        if (on) next.add(key);
        else next.delete(key);
      }
      selection.onChange(next);
    },
    [selection, pageKeys],
  );

  const onBodyKey = (event: ReactKeyboardEvent<HTMLTableSectionElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const target = event.target as HTMLElement;
    if (target.getAttribute('aria-haspopup') || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) && target.getAttribute('type') !== 'checkbox') return;
    const cell = target.closest('td');
    const row = target.closest('tr');
    if (!cell || !row || !body.current) return;
    const rowsEls = [...body.current.querySelectorAll('tr')];
    const index = rowsEls.indexOf(row);
    const nextRow = rowsEls[index + (event.key === 'ArrowDown' ? 1 : -1)];
    const nextCell = nextRow?.children[cell.cellIndex] as HTMLElement | undefined;
    const focusable = nextCell?.querySelector<HTMLElement>('a[href], button:not([disabled]), input:not([disabled])');
    if (focusable) {
      event.preventDefault();
      focusable.focus();
    }
  };

  const hasActions = Boolean(rowActions || rowInline);
  const columnCount = visible.length + (selection ? 1 : 0) + (hasActions ? 1 : 0);
  const showSkeleton = loading && rows.length === 0;

  if (error && rows.length === 0) {
    return (
      <div className="uwv-datatable-state">
        <ErrorState
          title="This list could not be loaded"
          body={(error as { message?: string })?.message ?? 'The request did not complete.'}
          requestId={(error as { requestId?: string })?.requestId}
          onRetry={onRetry}
        />
      </div>
    );
  }

  if (!loading && rows.length === 0) {
    return (
      <div className="uwv-datatable-state">
        {narrowed ? (noResults ?? <EmptyState title="Nothing matches" body="Try a different search, or clear the filters." />) : empty}
      </div>
    );
  }

  return (
    <div className="uwv-datatable-scroll" data-density={density} aria-busy={loading || undefined}>
      <table className="uwv-grid">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {selection ? (
              <th scope="col" className="uwv-grid-select">
                <Checkbox
                  label="Select all rows on this page"
                  hideLabel
                  checked={pageKeys.length > 0 && chosenHere === pageKeys.length}
                  indeterminate={chosenHere > 0 && chosenHere < pageKeys.length}
                  disabled={pageKeys.length === 0}
                  onChange={toggleAll}
                />
              </th>
            ) : null}
            {visible.map((column) => {
              const sorted = sort?.key === column.key ? sort.direction : null;
              const canSort = Boolean(onSort && column.sortable);
              return (
                <th
                  key={column.key}
                  scope="col"
                  data-numeric={column.numeric ? 'true' : undefined}
                  aria-sort={canSort ? (sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none') : undefined}
                  style={column.width ? { width: column.width } : undefined}
                >
                  {canSort ? (
                    <button
                      type="button"
                      className="uwv-grid-sort"
                      data-sorted={sorted ?? undefined}
                      onClick={() => onSort!(nextSort(sort ?? null, column.key))}
                    >
                      {column.header}
                      <Icon
                        icon={sorted === 'asc' ? DataIcons.ascending : sorted === 'desc' ? DataIcons.descending : DataIcons.sortable}
                        size="inline"
                      />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
            {hasActions ? (
              <th scope="col" className="uwv-grid-actions">
                <span className="sr-only">Actions</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody ref={body} onKeyDown={onBodyKey}>
          {showSkeleton
            ? Array.from({ length: SKELETON_ROWS }, (_, index) => (
                <tr key={`skeleton-${index}`} aria-hidden="true">
                  {Array.from({ length: columnCount }, (__, cell) => (
                    <td key={cell}>
                      <Skeleton width={cell === 0 ? '60%' : '45%'} />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => {
                const key = rowKey(row);
                const isSelected = selection?.selected.has(key) ?? false;
                return (
                  <tr
                    key={key}
                    data-selected={isSelected ? 'true' : undefined}
                    data-openable={onRowOpen ? 'true' : undefined}
                    onClick={
                      onRowOpen
                        ? (event) => {
                            // A click on something that acts on its own is that act, not "open".
                            if ((event.target as HTMLElement).closest('a, button, input, label, select')) return;
                            onRowOpen(row);
                          }
                        : undefined
                    }
                  >
                    {selection ? (
                      <td className="uwv-grid-select">
                        <Checkbox
                          label={selection.label(row)}
                          hideLabel
                          checked={isSelected}
                          disabled={!(selection.canSelect?.(row) ?? true)}
                          onChange={(on) => {
                            const next = new Set(selection.selected);
                            if (on) next.add(key);
                            else next.delete(key);
                            selection.onChange(next);
                          }}
                        />
                      </td>
                    ) : null}
                    {visible.map((column, index) => (
                      <td
                        key={column.key}
                        data-numeric={column.numeric ? 'true' : undefined}
                        // On a phone a row becomes a card: the first column is its
                        // title and every other cell is labelled with its header.
                        data-primary={index === 0 ? 'true' : undefined}
                        data-label={column.header}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                    {hasActions ? (
                      <td className="uwv-grid-actions">
                        <span className="uwv-grid-actions-inner">
                          {rowInline?.(row)}
                          {rowActions ? (
                            <DropdownMenu label={rowActionsLabel?.(row) ?? 'Row actions'} items={rowActions(row)} />
                          ) : null}
                        </span>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
        </tbody>
      </table>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Pagination
   ──────────────────────────────────────────────────────────────────────────── */

/** Page numbers to draw: the ends, the neighbourhood, and a gap where there is one. */
export function pageWindow(current: number, count: number): Array<number | 'gap'> {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const pages = new Set([1, count, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (current >= count - 2) [count - 3, count - 2, count - 1].forEach((p) => pages.add(p));
  const sorted = [...pages].filter((p) => p >= 1 && p <= count).sort((a, b) => a - b);
  const out: Array<number | 'gap'> = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1]! > 1) out.push('gap');
    out.push(page);
  });
  return out;
}

/**
 * Where you are in a long list, and how to move through it.
 *
 * Always states the range, even on one page: "Showing 1–3 of 3" is an answer,
 * and a footer that appears only sometimes reads as a glitch. The page-size
 * choice appears only once a list is longer than the smallest page.
 */
export function Pagination({
  total,
  offset,
  limit,
  onOffset,
  onLimit,
  noun,
  busy = false,
  sizes = PAGE_SIZES,
}: {
  total: number;
  offset: number;
  limit: number;
  onOffset: (next: number) => void;
  onLimit?: (next: number) => void;
  /** Plural: "organizations". */
  noun: string;
  busy?: boolean;
  sizes?: ReadonlyArray<number>;
}) {
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const current = Math.min(Math.floor(offset / limit) + 1, pageCount);
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + limit, total);

  return (
    <nav className="uwv-pagination" aria-label={`Pages of ${noun}`}>
      <span className="uwv-pagination-range" aria-live="polite">
        {total === 0 ? (
          `No ${noun}`
        ) : (
          <>
            <span>{`Showing ${first}–${last} of ${total}`}</span> {total === 1 ? noun.replace(/s$/, '') : noun}
          </>
        )}
      </span>
      <div className="uwv-pagination-controls">
        {onLimit && total > (sizes[0] ?? limit) ? (
          <label className="uwv-pagination-size">
            <span>Rows per page</span>
            <select
              className="uwv-control"
              value={limit}
              onChange={(event) => onLimit(Number(event.target.value))}
            >
              {sizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {pageCount > 1 ? (
          <div className="uwv-pager">
            <button
              type="button"
              className="uwv-pager-button"
              aria-label="Previous page"
              disabled={current <= 1 || busy}
              onClick={() => onOffset(Math.max(0, offset - limit))}
            >
              <Icon icon={DataIcons.previous} size="control" />
            </button>
            {pageWindow(current, pageCount).map((page, index) =>
              page === 'gap' ? (
                <span key={`gap-${index}`} className="uwv-pager-gap" aria-hidden="true">
                  …
                </span>
              ) : (
                <button
                  key={page}
                  type="button"
                  className="uwv-pager-button"
                  aria-label={`Page ${page}`}
                  aria-current={page === current ? 'page' : undefined}
                  disabled={busy}
                  onClick={() => onOffset((page - 1) * limit)}
                >
                  {page}
                </button>
              ),
            )}
            <button
              type="button"
              className="uwv-pager-button"
              aria-label="Next page"
              disabled={current >= pageCount || busy}
              onClick={() => onOffset(offset + limit)}
            >
              <Icon icon={DataIcons.next} size="control" />
            </button>
          </div>
        ) : null}
      </div>
    </nav>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Saved views
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The few views of a list everybody wants — all, active, deactivated — as one
 * pressed choice with the server's count beside each. A count it does not have
 * is left off rather than shown as zero.
 */
export function ViewTabs<T extends string>({
  label,
  views,
  value,
  onChange,
}: {
  label: string;
  views: ReadonlyArray<{ id: T; label: string; count?: number | null }>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="uwv-tabs uwv-view-tabs">
      {views.map((view) => (
        <button
          key={view.id}
          type="button"
          className="uwv-tab"
          aria-pressed={view.id === value}
          onClick={() => onChange(view.id)}
        >
          {view.label}
          {typeof view.count === 'number' ? <span className="uwv-view-count">{view.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

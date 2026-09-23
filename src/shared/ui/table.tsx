/**
 * The paginated table. One shape, every list.
 *
 * Every table in the product reads the same way: the same footer in the same
 * place, saying which rows you are looking at and how many there are, with the
 * same two controls. A list that silently showed the first hundred rows and
 * stopped is the failure this closes — it looks complete, and there is nothing
 * on screen to say it is not.
 *
 * ### `empty` is required
 *
 * A table with no rows renders the empty state instead of a bare grid, and the
 * caller has to supply it. "No zones yet" tells somebody nothing; "No zones
 * yet. Add one before placing a camera" tells them what to do next, and only
 * the caller knows which.
 */

import type { ReactNode } from 'react';

import { Button, type Column, DataTable } from './primitives';

export interface Paging {
  /** How many rows a page holds. */
  limit: number;
  /** How many rows precede this page. */
  offset: number;
  /** How many rows match in total, across every page. */
  total: number;
}

/** The product's page size. One number, so every list agrees. */
export const PAGE_SIZE = 25;

export function pageRange({ limit, offset, total }: Paging): string {
  if (total === 0) return 'No rows';
  const first = offset + 1;
  const last = Math.min(offset + limit, total);
  return `Showing ${first}–${last} of ${total}`;
}

export function PagedTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  empty,
  paging,
  onPage,
  busy = false,
}: {
  columns: ReadonlyArray<Column<T>>;
  rows: ReadonlyArray<T>;
  rowKey: (row: T, index: number) => string;
  caption: string;
  /** What to show when there are no rows. Says the next step, not just "empty". */
  empty: ReactNode;
  paging: Paging;
  onPage: (offset: number) => void;
  busy?: boolean;
}) {
  const { limit, offset, total } = paging;
  const onFirstPage = offset <= 0;
  const onLastPage = offset + limit >= total;

  if (total === 0) return <>{empty}</>;

  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <DataTable columns={columns} rows={rows} rowKey={rowKey} caption={caption} empty={empty} />

      {/* The footer is rendered even on a single page: "Showing 1–3 of 3" is an
          answer, and a footer that appears only sometimes reads as a glitch. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          flexWrap: 'wrap',
        }}
      >
        <span
          aria-live="polite"
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--ink-tertiary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {pageRange(paging)}
        </span>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button
            size="sm"
            variant="ghost"
            disabled={onFirstPage || busy}
            onClick={() => onPage(Math.max(offset - limit, 0))}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={onLastPage || busy}
            onClick={() => onPage(offset + limit)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

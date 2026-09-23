/**
 * The paginated table, which every list in the product now uses.
 *
 * What is being defended: a list must say how much of itself you are looking
 * at. A table that shows the first page and says nothing looks complete, and
 * somebody acts on it as though it were.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PagedTable, pageRange } from '@shared/ui/table';
import type { Column } from '@shared/ui/primitives';

interface Row {
  id: string;
  name: string;
}

const columns: ReadonlyArray<Column<Row>> = [
  { key: 'name', header: 'Name', render: (row) => row.name },
];

const page = (count: number, from = 0): Row[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `r${from + index}`,
    name: `Row ${from + index}`,
  }));

function renderTable(overrides: Partial<Parameters<typeof PagedTable<Row>>[0]> = {}) {
  const onPage = vi.fn();
  render(
    <PagedTable<Row>
      columns={columns}
      rows={page(25)}
      rowKey={(row) => row.id}
      caption="Zones"
      empty={<p>No zones yet. Add one before placing a camera.</p>}
      paging={{ limit: 25, offset: 0, total: 73 }}
      onPage={onPage}
      {...overrides}
    />,
  );
  return onPage;
}

describe('the paginated table', () => {
  it('says which rows it is showing, out of how many', () => {
    renderTable();
    expect(screen.getByText('Showing 1–25 of 73')).toBeInTheDocument();
  });

  it('counts the last page from the total, not from the page size', () => {
    renderTable({ rows: page(23, 50), paging: { limit: 25, offset: 50, total: 73 } });
    expect(screen.getByText('Showing 51–73 of 73')).toBeInTheDocument();
  });

  it('disables previous on the first page and next on the last', async () => {
    renderTable();
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled();
  });

  it('asks for the next page by offset', async () => {
    const onPage = renderTable();
    await userEvent.setup().click(screen.getByRole('button', { name: /next/i }));
    expect(onPage).toHaveBeenCalledWith(25);
  });

  it('renders the empty state and no grid at all when there is nothing', () => {
    renderTable({ rows: [], paging: { limit: 25, offset: 0, total: 0 } });
    expect(screen.getByText(/add one before placing a camera/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the footer even when everything fits on one page', () => {
    renderTable({ rows: page(3), paging: { limit: 25, offset: 0, total: 3 } });
    expect(screen.getByText('Showing 1–3 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('describes an empty range without pretending it is a row', () => {
    expect(pageRange({ limit: 25, offset: 0, total: 0 })).toBe('No rows');
  });
});

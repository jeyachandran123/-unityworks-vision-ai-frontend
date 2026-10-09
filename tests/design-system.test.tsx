/**
 * Design System 2.0 — the interaction layer every list, form and confirmation
 * in the product is built from.
 *
 * What is being defended:
 *
 * - A table says how much of itself is on screen, sorts only what it has, and
 *   tells "nothing exists" apart from "nothing matches".
 * - A destructive act cannot be confirmed by habit: focus starts on Cancel, an
 *   irreversible one waits for the object's name, and a failure is shown
 *   inside the dialog rather than lost.
 * - A menu is operable from the keyboard alone.
 * - A toast is announced as well as shown, and can be dismissed.
 * - The command palette finds only what it was given.
 */

import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import {
  DataGrid,
  FilterChips,
  Pagination,
  pageWindow,
  useClientRows,
  useTableState,
  type FilterDefinition,
  type GridColumn,
} from '@shared/ui/data-table';
import { ConfirmDialog, ConfirmProvider, DropdownMenu, useConfirm } from '@shared/ui/overlays';
import { ToastProvider, useToast } from '@shared/ui/feedback';
import { CommandPalette } from '@shared/ui/command';
import { Combobox } from '@shared/ui/forms';
import { MetricTile } from '@shared/ui/surfaces';
import { EmptyState } from '@shared/ui/primitives';
import { PageErrorBoundary } from '@shared/ui/boundary';

interface Org {
  id: string;
  name: string;
  status: 'active' | 'suspended';
  cameras: number;
}

const ORGS: Org[] = [
  { id: 'o1', name: 'Org-1', status: 'active', cameras: 18 },
  { id: 'o2', name: 'Admiralty', status: 'active', cameras: 0 },
  { id: 'o3', name: 'PCC1', status: 'suspended', cameras: 1 },
];

const COLUMNS: ReadonlyArray<GridColumn<Org>> = [
  { key: 'name', header: 'Organization', render: (o) => o.name, sortable: true },
  { key: 'status', header: 'Status', render: (o) => o.status },
  { key: 'cameras', header: 'Cameras', render: (o) => o.cameras, numeric: true, sortable: true },
];

const STATUS_FILTER: FilterDefinition = {
  id: 'status',
  label: 'Status',
  options: [
    { value: 'active', label: 'Active' },
    { value: 'suspended', label: 'Suspended' },
  ],
};

function ClientList({ rows = ORGS, onAct = vi.fn() }: { rows?: Org[]; onAct?: (id: string) => void }) {
  const state = useTableState('test-orgs', { pageSize: 2 });
  const view = useClientRows(rows, state, {
    text: (o) => o.name,
    filterBy: { status: (o) => o.status },
    sortBy: { name: (o) => o.name, cameras: (o) => o.cameras },
  });
  return (
    <>
      <input aria-label="Search" value={state.search} onChange={(e) => state.setSearch(e.target.value)} />
      <button type="button" onClick={() => state.setFilter('status', ['suspended'])}>
        Only suspended
      </button>
      <FilterChips filters={[STATUS_FILTER]} state={state} />
      <DataGrid<Org>
        caption="Organizations"
        columns={COLUMNS}
        rows={view.page}
        rowKey={(o) => o.id}
        sort={state.sort}
        onSort={state.setSort}
        narrowed={state.narrowed}
        selection={{ selected: state.selected, onChange: state.setSelected, label: (o) => `Select ${o.name}` }}
        rowActions={(o) => [{ id: 'act', label: 'Suspend', onSelect: () => onAct(o.id) }]}
        rowActionsLabel={(o) => `Actions for ${o.name}`}
        empty={<EmptyState title="No organizations yet" body="Create the first one." />}
        noResults={<EmptyState title="Nothing matches" body="Clear the filters." />}
      />
      <Pagination
        total={view.total}
        offset={state.offset}
        limit={state.pageSize}
        onOffset={state.setOffset}
        noun="organizations"
      />
      <output aria-label="selected">{[...state.selected].join(',')}</output>
    </>
  );
}

describe('the data table', () => {
  it('states the range and pages through what the client holds', async () => {
    const user = userEvent.setup();
    render(<ClientList />);
    expect(screen.getByText('Showing 1–2 of 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Showing 3–3 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
  });

  it('sorts a column ascending, then descending, then not at all, and says so', async () => {
    const user = userEvent.setup();
    render(<ClientList />);
    const header = () => screen.getByRole('columnheader', { name: /Cameras/ });
    expect(header()).toHaveAttribute('aria-sort', 'none');

    await user.click(screen.getByRole('button', { name: /Cameras/ }));
    expect(header()).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('Admiralty');

    await user.click(screen.getByRole('button', { name: /Cameras/ }));
    expect(header()).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('Org-1');

    await user.click(screen.getByRole('button', { name: /Cameras/ }));
    expect(header()).toHaveAttribute('aria-sort', 'none');
  });

  it('offers no sort on a column that does not declare one', () => {
    render(<ClientList />);
    expect(screen.getByRole('columnheader', { name: 'Status' })).not.toHaveAttribute('aria-sort');
  });

  it('selects every row on the page from the header, and half-ticks it for some', async () => {
    const user = userEvent.setup();
    render(<ClientList />);
    await user.click(screen.getByRole('checkbox', { name: 'Select Org-1' }));
    expect(screen.getByRole('checkbox', { name: 'Select all rows on this page' })).toHaveAttribute(
      'aria-checked',
      'mixed',
    );
    await user.click(screen.getByRole('checkbox', { name: 'Select all rows on this page' }));
    expect(screen.getByLabelText('selected')).toHaveTextContent('o1,o2');
  });

  it('tells "nothing matches" apart from "nothing exists", and removes a filter by its chip', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ClientList rows={[]} />);
    expect(screen.getByText('No organizations yet')).toBeInTheDocument();
    unmount();

    render(<ClientList />);
    await user.click(screen.getByRole('button', { name: 'Only suspended' }));
    expect(screen.getByText('PCC1')).toBeInTheDocument();
    expect(screen.queryByText('Org-1')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Search'), 'zzz');
    expect(await screen.findByText('Nothing matches')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove filter Status: Suspended' }));
    await user.clear(screen.getByLabelText('Search'));
    expect(await screen.findByText('Org-1')).toBeInTheDocument();
  });

  it('runs a row act from its menu', async () => {
    const user = userEvent.setup();
    const onAct = vi.fn();
    render(<ClientList onAct={onAct} />);
    await user.click(screen.getByRole('button', { name: 'Actions for Admiralty' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Suspend' }));
    expect(onAct).toHaveBeenCalledWith('o2');
  });

  it('draws the ends and the neighbourhood of a long run of pages', () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(6, 12)).toEqual([1, 'gap', 5, 6, 7, 'gap', 12]);
    expect(pageWindow(1, 12)).toEqual([1, 2, 3, 4, 'gap', 12]);
    expect(pageWindow(12, 12)).toEqual([1, 'gap', 9, 10, 11, 12]);
  });
});

describe('the dropdown menu', () => {
  it('opens on ArrowDown, moves with the arrows, and closes on Escape back to its button', async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    render(
      <DropdownMenu
        label="Actions for PCC2"
        items={[
          { id: 'view', label: 'View', onSelect: onView },
          { id: 'sep', type: 'separator' },
          { id: 'archive', label: 'Archive', tone: 'danger', onSelect: vi.fn() },
        ]}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Actions for PCC2' });
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    const menu = await screen.findByRole('menu', { name: 'Actions for PCC2' });
    await vi.waitFor(() => expect(within(menu).getByRole('menuitem', { name: 'View' })).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitem', { name: 'Archive' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe('confirmations', () => {
  function Archive({ onConfirm, error }: { onConfirm: () => void; error?: string }) {
    const [open, setOpen] = useState(true);
    return (
      <ConfirmDialog
        open={open}
        title="Archive PCC2?"
        confirmLabel="Archive organization"
        tone="danger"
        requireText="PCC2"
        error={error}
        onConfirm={onConfirm}
        onCancel={() => setOpen(false)}
      >
        Nobody will be able to sign in.
      </ConfirmDialog>
    );
  }

  it('keeps an irreversible act unarmed until the name is typed', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Archive onConfirm={onConfirm} />);
    const button = screen.getByRole('button', { name: 'Archive organization' });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText('Type PCC2 to confirm'), 'PCC2');
    expect(button).toBeEnabled();
    await user.click(button);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows a failure inside the dialog', () => {
    render(<Archive onConfirm={vi.fn()} error="The organization could not be archived." />);
    expect(within(screen.getByRole('alertdialog')).getByRole('alert')).toHaveTextContent(
      'The organization could not be archived.',
    );
  });

  it('starts a dangerous question on Cancel, so a reflexive Enter does nothing', async () => {
    function Ask() {
      const confirm = useConfirm();
      const [answer, setAnswer] = useState('');
      return (
        <>
          <button
            type="button"
            onClick={async () =>
              setAnswer(String(await confirm({ title: 'Remove Asha?', confirmLabel: 'Remove', tone: 'danger' })))
            }
          >
            Ask
          </button>
          <output aria-label="answer">{answer}</output>
        </>
      );
    }
    const user = userEvent.setup();
    render(
      <ConfirmProvider>
        <Ask />
      </ConfirmProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('answer')).toHaveTextContent('false');
  });
});

describe('toasts', () => {
  function Notifier() {
    const toast = useToast();
    return (
      <>
        <button type="button" onClick={() => toast.success('Organization renamed', { description: 'Now “PCC 2”.' })}>
          ok
        </button>
        <button type="button" onClick={() => toast.error('Failed to update organization')}>
          fail
        </button>
        <button type="button" onClick={() => toast('Legacy message')}>
          legacy
        </button>
      </>
    );
  }

  it('shows, announces and dismisses', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Notifier />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'ok' }));
    const stack = screen.getByRole('region', { name: 'Notifications' });
    expect(within(stack).getByText('Organization renamed')).toBeInTheDocument();
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('Organization renamed');

    await user.click(screen.getByRole('button', { name: 'fail' }));
    expect(document.querySelector('[aria-live="assertive"]')).toHaveTextContent('Failed to update organization');

    await user.click(screen.getByRole('button', { name: 'legacy' }));
    expect(within(stack).getByText('Legacy message')).toBeInTheDocument();

    const close = within(stack).getAllByRole('button', { name: 'Dismiss notification' });
    await user.click(close[0]!);
    await vi.waitFor(() => expect(within(stack).queryByText('Organization renamed')).not.toBeInTheDocument());
  });

  it('leaves on its own', async () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Notifier />
      </ToastProvider>,
    );
    act(() => screen.getByRole('button', { name: 'ok' }).click());
    expect(screen.getByText('Organization renamed')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.queryByText('Organization renamed')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});

describe('the command palette', () => {
  it('finds only what it was given, and runs the chosen one on Enter', async () => {
    const user = userEvent.setup();
    const go = vi.fn();
    function Palette() {
      const [query, setQuery] = useState('');
      return (
        <CommandPalette
          open
          onClose={vi.fn()}
          query={query}
          onQuery={setQuery}
          groups={[
            {
              id: 'pages',
              label: 'Go to',
              items: [
                { id: 'orgs', label: 'Organizations', onSelect: () => go('orgs') },
                { id: 'people', label: 'People', onSelect: () => go('people') },
              ],
            },
          ]}
        />
      );
    }
    render(<Palette />);
    await user.type(screen.getByRole('combobox', { name: 'Search' }), 'peo');
    expect(screen.queryByRole('option', { name: /Organizations/ })).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(go).toHaveBeenCalledWith('people');
  });

  it('says plainly when nothing is found', async () => {
    const user = userEvent.setup();
    function Palette() {
      const [query, setQuery] = useState('');
      return <CommandPalette open onClose={vi.fn()} query={query} onQuery={setQuery} groups={[]} />;
    }
    render(<Palette />);
    await user.type(screen.getByRole('combobox', { name: 'Search' }), 'nope');
    expect(screen.getByText('Nothing found for “nope”.')).toBeInTheDocument();
  });
});

describe('the combobox', () => {
  it('narrows a long list by typing and chooses with Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Combobox
        label="Person"
        value=""
        onChange={onChange}
        options={[
          { value: 'u1', label: 'Asha Rao', detail: 'asha@example.com' },
          { value: 'u2', label: 'Ben Ong', detail: 'ben@example.com' },
        ]}
      />,
    );
    await user.type(screen.getByRole('combobox', { name: 'Person' }), 'ben');
    expect(screen.queryByRole('option', { name: /Asha/ })).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('u2');
  });
});

describe('the metric tile', () => {
  it('renders an em dash and the reason for a number it does not have — never zero', () => {
    render(
      <MemoryRouter>
        <MetricTile label="Cameras running" value={null} unavailableReason="The runtime is not reporting" />
      </MemoryRouter>,
    );
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('The runtime is not reporting')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});

describe('a page that fails to render', () => {
  it('fails alone, says so, and clears when the page changes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    function Broken(): never {
      throw new Error('malformed record');
    }
    const { rerender } = render(
      <PageErrorBoundary resetKey="/admin/people">
        <Broken />
      </PageErrorBoundary>,
    );
    expect(screen.getByText('This page could not be shown')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();

    rerender(
      <PageErrorBoundary resetKey="/admin/zones">
        <p>Zones</p>
      </PageErrorBoundary>,
    );
    expect(screen.getByText('Zones')).toBeInTheDocument();
  });
});

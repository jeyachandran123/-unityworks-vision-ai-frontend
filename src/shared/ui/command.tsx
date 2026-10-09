/**
 * The command palette: Ctrl K (⌘ K on a Mac) from anywhere.
 *
 * It finds only what is real. Each shell hands it the destinations this
 * account can actually reach — the same model that draws the navigation, so it
 * never offers a page that would redirect — and, where the backend can search,
 * the organizations and people a query matches. It invents no results and
 * keeps no index of its own.
 */

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { DataIcons, Icon, type LucideIcon } from './icons';
import { Spinner } from './primitives';

export interface CommandItem {
  id: string;
  label: string;
  /** A second line: where it goes, or what it is. */
  hint?: string;
  icon?: LucideIcon;
  /** Extra words it can be found by. */
  keywords?: string;
  onSelect: () => void;
}

export interface CommandGroup {
  id: string;
  label: string;
  items: ReadonlyArray<CommandItem>;
  /**
   * Items already matched by somebody else — a server search. The palette
   * shows them as given rather than filtering them again by its own rule.
   */
  preMatched?: boolean;
}

function matches(item: CommandItem, needle: string): boolean {
  if (!needle) return true;
  const haystack = `${item.label} ${item.hint ?? ''} ${item.keywords ?? ''}`.toLowerCase();
  return needle
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/** Opens the palette on Ctrl K / ⌘ K, wherever focus is. */
export function useCommandShortcut(onOpen: () => void) {
  const open = useRef(onOpen);
  open.current = onOpen;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        open.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}

/** The platform's own name for the shortcut. */
export function shortcutLabel(): string {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  return mac ? '⌘ K' : 'Ctrl K';
}

/** The topbar's way in: a search field that is really a button. */
export function CommandTrigger({ onOpen, label = 'Search or jump to…' }: { onOpen: () => void; label?: string }) {
  return (
    <button type="button" className="uwv-command-trigger" onClick={onOpen} aria-keyshortcuts="Control+K Meta+K">
      <Icon icon={DataIcons.search} size="control" />
      <span className="uwv-command-trigger-label">{label}</span>
      <kbd className="uwv-kbd" aria-hidden="true">
        {shortcutLabel()}
      </kbd>
    </button>
  );
}

export function CommandPalette({
  open,
  onClose,
  query,
  onQuery,
  groups,
  searching = false,
  placeholder = 'Search pages, organizations, people…',
  footer,
}: {
  open: boolean;
  onClose: () => void;
  query: string;
  onQuery: (next: string) => void;
  groups: ReadonlyArray<CommandGroup>;
  /** A server search for the query is in flight. */
  searching?: boolean;
  placeholder?: string;
  footer?: ReactNode;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const previous = useRef<HTMLElement | null>(null);

  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          items: group.preMatched ? group.items : group.items.filter((item) => matches(item, needle)).slice(0, 8),
        }))
        .filter((group) => group.items.length > 0),
    [groups, needle],
  );
  const flat = visible.flatMap((group) => group.items);

  useEffect(() => setActive(0), [needle, groups]);

  useEffect(() => {
    if (!open) return;
    previous.current = document.activeElement as HTMLElement | null;
    input.current?.focus();
    return () => {
      const back = previous.current;
      if (back && document.contains(back)) back.focus();
    };
  }, [open]);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const run = (item: CommandItem) => {
    onClose();
    item.onSelect();
  };

  let index = -1;

  return createPortal(
    <div className="uwv-scrim uwv-command-scrim" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="uwv-command"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((i) => (flat.length === 0 ? 0 : (i + 1) % flat.length));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((i) => (flat.length === 0 ? 0 : (i - 1 + flat.length) % flat.length));
          } else if (event.key === 'Enter' && flat[active]) {
            event.preventDefault();
            run(flat[active]!);
          } else if (event.key === 'Tab') {
            // One field: Tab has nowhere to go but out, so it stays.
            event.preventDefault();
          }
        }}
      >
        <div className="uwv-command-input">
          {searching ? <Spinner size={15} /> : <Icon icon={DataIcons.search} size="nav" />}
          <input
            ref={input}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={flat[active] ? `${listId}-${active}` : undefined}
            aria-label="Search"
            placeholder={placeholder}
            value={query}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => onQuery(event.target.value)}
          />
          <kbd className="uwv-kbd" aria-hidden="true">
            Esc
          </kbd>
        </div>
        <div ref={list} id={listId} role="listbox" aria-label="Results" className="uwv-command-list">
          {flat.length === 0 ? (
            <p className="uwv-command-empty">
              {searching ? 'Searching…' : needle ? `Nothing found for “${query.trim()}”.` : 'Type to search.'}
            </p>
          ) : (
            visible.map((group) => (
              <div key={group.id} role="group" aria-label={group.label} className="uwv-command-group">
                <div className="uwv-command-group-label" aria-hidden="true">
                  {group.label}
                </div>
                {group.items.map((item) => {
                  index += 1;
                  const at = index;
                  return (
                    <div
                      key={`${group.id}:${item.id}`}
                      id={`${listId}-${at}`}
                      role="option"
                      aria-selected={at === active}
                      data-index={at}
                      className="uwv-command-item"
                      onMouseMove={() => setActive(at)}
                      onClick={() => run(item)}
                    >
                      <span className="uwv-command-item-icon">
                        {item.icon ? <Icon icon={item.icon} size="control" /> : null}
                      </span>
                      <span className="uwv-command-item-text">
                        <span className="uwv-command-item-label">{item.label}</span>
                        {item.hint ? <span className="uwv-command-item-hint">{item.hint}</span> : null}
                      </span>
                      {at === active ? <Icon icon={DataIcons.enter} size="inline" /> : null}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="uwv-command-foot">
          {footer ?? (
            <>
              <span>
                <kbd className="uwv-kbd" aria-label="Up"><Icon icon={DataIcons.ascending} size="inline" /></kbd>{' '}
                <kbd className="uwv-kbd" aria-label="Down"><Icon icon={DataIcons.descending} size="inline" /></kbd> to move
              </span>
              <span>
                <kbd className="uwv-kbd">Enter</kbd> to open
              </span>
              <span>
                <kbd className="uwv-kbd">Esc</kbd> to close
              </span>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* eslint-disable jsx-a11y/interactive-supports-focus -- focus stays on the container, which points at the active item with aria-activedescendant */
import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { useTypeahead } from './hooks/useTypeahead';
import { useVirtualRows } from './hooks/useVirtualRows';

export type ListEntry<K extends string | number> =
  | { kind: 'item'; key: K; label: string; disabled?: boolean }
  | { kind: 'group'; key: string; label: string };

export interface ListBoxProps<K extends string | number, T extends ListEntry<K>> {
  label: string;
  entries: readonly T[];
  selectedKey: K | null;
  onSelect: (key: K) => void;
  /** Enter or double-click. */
  onActivate?: (key: K) => void;
  renderItem?: (entry: Extract<T, { kind: 'item' }>) => ReactNode;
  emptyState?: ReactNode;
  className?: string;
}

/**
 * A virtualised single-select list with optional group headings. Up/Down, Page Up/Down, Home and
 * End move the selection; Enter activates; typing jumps by name.
 */
export function ListBox<K extends string | number, T extends ListEntry<K>>({
  label,
  entries,
  selectedKey,
  onSelect,
  onActivate,
  renderItem,
  emptyState,
  className,
}: ListBoxProps<K, T>) {
  const id = useId();
  const virtual = useVirtualRows(entries.length);
  const items = entries.map((e, i) => [e, i] as const).filter(([e]) => e.kind === 'item' && !e.disabled);
  const selectedIndex = entries.findIndex((e) => e.kind === 'item' && e.key === selectedKey);
  const typeahead = useTypeahead(useCallback(() => items.map(([e]) => e.label), [items]));
  const { reveal } = virtual;

  const revealed = useRef<K | null>(null);
  useEffect(() => {
    if (selectedIndex < 0 || revealed.current === selectedKey) return;
    revealed.current = selectedKey;
    reveal(selectedIndex, 'center');
  }, [selectedIndex, selectedKey, reveal]);

  const go = (itemPosition: number) => {
    const entry = items[Math.max(0, Math.min(items.length - 1, itemPosition))];
    if (!entry) return;
    onSelect((entry[0] as { key: K }).key);
    reveal(entry[1]);
  };
  const position = items.findIndex(([, i]) => i === selectedIndex);

  const optionId = (key: string | number) => `${id}-opt-${String(key)}`;

  // A listbox may only hold options, so while empty the container is a plain box for the message.
  const empty = !entries.length;

  return (
    <div
      ref={virtual.scrollRef}
      role={empty ? undefined : 'listbox'}
      aria-label={empty ? undefined : label}
      tabIndex={empty ? -1 : 0}
      aria-activedescendant={selectedKey !== null && selectedIndex >= 0 ? optionId(selectedKey) : undefined}
      className={`ui-listbox ui-listbox--inline${className ? ` ${className}` : ''}`}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') go(position + 1);
        else if (e.key === 'ArrowUp') go(position < 0 ? 0 : position - 1);
        else if (e.key === 'PageDown') go(position + virtual.pageSize);
        else if (e.key === 'PageUp') go(position - virtual.pageSize);
        else if (e.key === 'Home') go(0);
        else if (e.key === 'End') go(items.length - 1);
        else if (e.key === 'Enter' && selectedKey !== null) onActivate?.(selectedKey);
        else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const at = typeahead(e.key, position);
          if (at >= 0) go(at);
          else return;
        } else return;
        e.preventDefault();
      }}
    >
      <div ref={virtual.probeRef} className="ui-row-probe" aria-hidden="true" />
      {!entries.length && emptyState}
      <div style={{ position: 'relative', height: virtual.totalHeight }}>
        {entries.slice(virtual.start, virtual.end).map((entry, i) => {
          const top = (virtual.start + i) * virtual.rowHeight;
          if (entry.kind === 'group') {
            return (
              <div key={`g:${entry.key}`} role="presentation" className="ui-listbox-group" style={{ top }}>
                {entry.label}
              </div>
            );
          }
          const selected = entry.key === selectedKey;
          return (
            // The listbox owns focus and keyboard handling.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <div
              key={String(entry.key)}
              id={optionId(entry.key)}
              role="option"
              aria-selected={selected}
              aria-disabled={entry.disabled || undefined}
              data-key={entry.key}
              className={`ui-option ui-listbox-item${selected ? ' is-selected' : ''}`}
              style={{ top }}
              onClick={() => !entry.disabled && onSelect(entry.key)}
              onDoubleClick={() => !entry.disabled && onActivate?.(entry.key)}
            >
              {renderItem ? renderItem(entry as Extract<T, { kind: 'item' }>) : <span className="ui-option-label">{entry.label}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

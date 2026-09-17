/* eslint-disable jsx-a11y/interactive-supports-focus -- focus stays on the container, which points at the active item with aria-activedescendant */
import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { useTypeahead } from './hooks/useTypeahead';
import { useVirtualRows } from './hooks/useVirtualRows';

export interface TreeItem<K extends string | number> {
  key: K;
  depth: number;
  label: string;
  hasChildren: boolean;
  expanded: boolean;
}

export interface SelectModifiers {
  /** Ctrl or Cmd: add to or remove from the selection. */
  toggle: boolean;
  /** Shift: select the range from the anchor. */
  range: boolean;
}

export interface TreeProps<K extends string | number, T extends TreeItem<K>> {
  label: string;
  /** The visible rows in order, already flattened by expansion. */
  items: readonly T[];
  selected: ReadonlySet<K>;
  /** The keyboard-focused row; the tree follows it when it changes from outside. */
  focusKey: K | null;
  onFocusChange: (key: K) => void;
  onSelect: (key: K, modifiers: SelectModifiers) => void;
  onToggle: (key: K) => void;
  /** Enter or double-click. */
  onActivate?: (key: K) => void;
  /** `*` on a row: open everything below it. */
  onExpandAll?: (key: K) => void;
  onContextMenu?: (key: K, e: React.MouseEvent) => void;
  /** Row content after the twisty; defaults to the label. */
  renderItem?: (item: T) => ReactNode;
  itemClassName?: (item: T) => string;
  multiselectable?: boolean;
  /** Width of one indent level, in rem. */
  indent?: number;
  emptyState?: ReactNode;
  className?: string;
}

/**
 * A virtualised ARIA tree view. The tree itself keeps focus and points at the active row with
 * aria-activedescendant, because rows scrolled out of view aren't rendered.
 *
 * Up/Down move and select, Shift extends, Ctrl moves without selecting (Ctrl+Space toggles),
 * Right opens or goes to the first child, Left closes or goes to the parent, Home/End, Page
 * Up/Down, Enter activates, `*` opens the subtree, and typing jumps by name.
 */
export function Tree<K extends string | number, T extends TreeItem<K>>({
  label,
  items,
  selected,
  focusKey,
  onFocusChange,
  onSelect,
  onToggle,
  onActivate,
  onExpandAll,
  onContextMenu,
  renderItem,
  itemClassName,
  multiselectable = true,
  indent = 0.75,
  emptyState,
  className,
}: TreeProps<K, T>) {
  const id = useId();
  const rows = useVirtualRows(items.length);
  const focusIndex = focusKey === null ? -1 : items.findIndex((item) => item.key === focusKey);
  const typeahead = useTypeahead(useCallback(() => items.map((i) => i.label), [items]));
  const { reveal } = rows;

  // Keep the focused row in view, including when the selection changes elsewhere.
  const lastRevealed = useRef<K | null>(null);
  useEffect(() => {
    if (focusIndex < 0 || focusKey === lastRevealed.current) return;
    lastRevealed.current = focusKey;
    reveal(focusIndex, 'nearest');
  }, [focusIndex, focusKey, reveal]);

  const rowId = (key: K) => `${id}-row-${String(key)}`;

  const go = (index: number, e: React.KeyboardEvent) => {
    const clamped = Math.max(0, Math.min(items.length - 1, index));
    const item = items[clamped];
    if (!item) return;
    onFocusChange(item.key);
    reveal(clamped);
    if (e.ctrlKey || e.metaKey) return;
    onSelect(item.key, { toggle: false, range: e.shiftKey && multiselectable });
  };

  const parentIndex = (index: number) => {
    const depth = items[index]!.depth;
    for (let i = index - 1; i >= 0; i--) if (items[i]!.depth < depth) return i;
    return -1;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const at = focusIndex < 0 ? 0 : focusIndex;
    const item = items[at];
    if (!item) return;
    switch (e.key) {
      case 'ArrowDown':
        go(focusIndex < 0 ? 0 : at + 1, e);
        break;
      case 'ArrowUp':
        go(at - 1, e);
        break;
      case 'Home':
        go(0, e);
        break;
      case 'End':
        go(items.length - 1, e);
        break;
      case 'PageDown':
        go(at + rows.pageSize, e);
        break;
      case 'PageUp':
        go(at - rows.pageSize, e);
        break;
      case 'ArrowRight':
        if (item.hasChildren && !item.expanded) onToggle(item.key);
        else if (item.hasChildren) go(at + 1, e);
        break;
      case 'ArrowLeft':
        if (item.hasChildren && item.expanded) onToggle(item.key);
        else if (parentIndex(at) >= 0) go(parentIndex(at), e);
        break;
      case 'Enter':
        onActivate?.(item.key);
        break;
      case ' ':
        onSelect(item.key, { toggle: (e.ctrlKey || e.metaKey) && multiselectable, range: e.shiftKey && multiselectable });
        break;
      case '*':
        onExpandAll?.(item.key);
        break;
      default: {
        if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
        const match = typeahead(e.key, at);
        if (match >= 0) go(match, e);
      }
    }
    e.preventDefault();
  };

  const active = focusIndex >= 0 ? items[focusIndex] : undefined;

  // A tree may only hold tree items, so while empty the container is a plain box for the message.
  const empty = !items.length;

  return (
    <div
      ref={rows.scrollRef}
      role={empty ? undefined : 'tree'}
      aria-label={empty ? undefined : label}
      aria-multiselectable={!empty && multiselectable ? true : undefined}
      aria-activedescendant={active ? rowId(active.key) : undefined}
      tabIndex={empty ? -1 : 0}
      className={`ui-tree${className ? ` ${className}` : ''}`}
      onKeyDown={onKeyDown}
      onFocus={() => {
        if (focusIndex < 0 && items[0]) onFocusChange(items[0].key);
      }}
    >
      <div ref={rows.probeRef} className="ui-row-probe" aria-hidden="true" />
      {empty && emptyState}
      <div style={{ position: 'relative', height: rows.totalHeight }}>
        {items.slice(rows.start, rows.end).map((item, i) => {
          const index = rows.start + i;
          const isSelected = selected.has(item.key);
          const extra = itemClassName?.(item);
          return (
            // Keyboard interaction lives on the tree, which owns focus.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <div
              key={String(item.key)}
              id={rowId(item.key)}
              role="treeitem"
              aria-level={item.depth + 1}
              aria-expanded={item.hasChildren ? item.expanded : undefined}
              aria-selected={isSelected}
              data-key={item.key}
              className={`ui-tree-row${isSelected ? ' is-selected' : ''}${item === active ? ' is-active' : ''}${extra ? ` ${extra}` : ''}`}
              style={{ top: index * rows.rowHeight, paddingLeft: `${item.depth * indent + 0.125}rem` }}
              onClick={(e) => {
                onFocusChange(item.key);
                onSelect(item.key, { toggle: (e.ctrlKey || e.metaKey) && multiselectable, range: e.shiftKey && multiselectable });
              }}
              onDoubleClick={() => onActivate?.(item.key)}
              onContextMenu={onContextMenu ? (e) => onContextMenu(item.key, e) : undefined}
            >
              <span
                className={`ui-tree-twisty${item.hasChildren ? '' : ' is-leaf'}`}
                aria-hidden="true"
                onClick={(e) => {
                  if (!item.hasChildren) return;
                  e.stopPropagation();
                  onToggle(item.key);
                }}
              >
                {item.hasChildren && <ChevronRight className={`ui-icon${item.expanded ? ' is-open' : ''}`} strokeWidth={2} />}
              </span>
              {renderItem ? renderItem(item) : <span className="ui-tree-label">{item.label}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

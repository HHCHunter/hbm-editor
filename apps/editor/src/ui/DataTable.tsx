/* eslint-disable jsx-a11y/interactive-supports-focus -- focus stays on the container, which points at the active item with aria-activedescendant */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useVirtualRows } from './hooks/useVirtualRows';

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Makes the column sortable by this value. */
  sortValue?: (row: T) => string | number;
  /** Initial width in rem; the last column takes the remaining space when left out. */
  width?: number;
  align?: 'start' | 'end';
  mono?: boolean;
}

export interface SortState {
  column: string;
  direction: 'asc' | 'desc';
}

export interface DataTableProps<T, K extends string | number> {
  label: string;
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => K;
  selectedKey?: K | null;
  onSelect?: (key: K) => void;
  /** Enter or double-click. */
  onActivate?: (key: K) => void;
  sort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  defaultSort?: SortState | null;
  emptyState?: ReactNode;
  rowClassName?: (row: T) => string | undefined;
  className?: string;
}

/**
 * A virtualised, sortable table: the ARIA grid pattern with row selection. The grid keeps focus;
 * Up/Down, Page Up/Down, Home and End move the selection, Enter activates. Column edges drag to
 * resize.
 */
export function DataTable<T, K extends string | number>({
  label,
  columns,
  rows,
  rowKey,
  selectedKey = null,
  onSelect,
  onActivate,
  sort: controlledSort,
  onSortChange,
  defaultSort = null,
  emptyState,
  rowClassName,
  className,
}: DataTableProps<T, K>) {
  const id = useId();
  const [ownSort, setOwnSort] = useState<SortState | null>(defaultSort);
  const sort = controlledSort !== undefined ? controlledSort : ownSort;
  const setSort = (next: SortState | null) => {
    setOwnSort(next);
    onSortChange?.(next);
  };
  const [widths, setWidths] = useState<Record<string, number>>({});

  const sorted = useMemo(() => {
    const column = sort && columns.find((c) => c.id === sort.column);
    if (!column?.sortValue) return rows;
    const value = column.sortValue;
    const dir = sort!.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * dir;
    });
  }, [rows, columns, sort]);

  const virtual = useVirtualRows(sorted.length);
  const selectedIndex = selectedKey === null ? -1 : sorted.findIndex((r) => rowKey(r) === selectedKey);
  const { reveal } = virtual;
  const revealed = useRef<K | null>(null);
  useEffect(() => {
    if (selectedIndex < 0 || revealed.current === selectedKey) return;
    revealed.current = selectedKey;
    reveal(selectedIndex);
  }, [selectedIndex, selectedKey, reveal]);

  const template = columns
    .map((c, i) => {
      const w = widths[c.id];
      if (w !== undefined) return `${w}px`;
      if (c.width !== undefined) return `${c.width}rem`;
      return i === columns.length - 1 ? 'minmax(6rem, 1fr)' : 'minmax(6rem, 1fr)';
    })
    .join(' ');

  const go = (index: number) => {
    const row = sorted[Math.max(0, Math.min(sorted.length - 1, index))];
    if (!row) return;
    onSelect?.(rowKey(row));
    reveal(sorted.indexOf(row));
  };

  const rowId = (key: K) => `${id}-row-${String(key)}`;

  return (
    <div
      ref={virtual.scrollRef}
      role="grid"
      aria-label={label}
      aria-rowcount={sorted.length + 1}
      aria-colcount={columns.length}
      aria-activedescendant={selectedIndex >= 0 ? rowId(selectedKey!) : undefined}
      tabIndex={0}
      className={`ui-table${className ? ` ${className}` : ''}`}
      style={{ ['--ui-table-columns' as string]: template }}
      onKeyDown={(e) => {
        const at = selectedIndex;
        if (e.key === 'ArrowDown') go(at + 1);
        else if (e.key === 'ArrowUp') go(at < 0 ? 0 : at - 1);
        else if (e.key === 'PageDown') go(at + virtual.pageSize);
        else if (e.key === 'PageUp') go(at - virtual.pageSize);
        else if (e.key === 'Home') go(0);
        else if (e.key === 'End') go(sorted.length - 1);
        else if (e.key === 'Enter' && selectedKey !== null) onActivate?.(selectedKey);
        else return;
        e.preventDefault();
      }}
    >
      <div ref={virtual.probeRef} className="ui-row-probe" aria-hidden="true" />
      <div role="row" aria-rowindex={1} className="ui-table-row ui-table-head" data-sticky-header>
        {columns.map((column, ci) => {
          const sorting = sort?.column === column.id ? sort.direction : null;
          return (
            <div
              key={column.id}
              role="columnheader"
              aria-colindex={ci + 1}
              aria-sort={sorting === 'asc' ? 'ascending' : sorting === 'desc' ? 'descending' : column.sortValue ? 'none' : undefined}
              className={`ui-table-cell ui-table-header${column.align === 'end' ? ' is-end' : ''}`}
            >
              {column.sortValue ? (
                <button
                  type="button"
                  tabIndex={-1}
                  className="ui-table-sort"
                  onClick={() =>
                    setSort(
                      sorting === 'asc'
                        ? { column: column.id, direction: 'desc' }
                        : sorting === 'desc'
                          ? null
                          : { column: column.id, direction: 'asc' },
                    )
                  }
                >
                  {column.header}
                  {sorting === 'asc' && <ChevronUp className="ui-icon" aria-hidden="true" />}
                  {sorting === 'desc' && <ChevronDown className="ui-icon" aria-hidden="true" />}
                </button>
              ) : (
                column.header
              )}
              {ci < columns.length - 1 && (
                <div
                  className="ui-table-resize"
                  aria-hidden="true"
                  onPointerDown={(e) => {
                    const cell = e.currentTarget.parentElement!;
                    const startX = e.clientX;
                    const startW = cell.getBoundingClientRect().width;
                    const target = e.currentTarget;
                    target.setPointerCapture(e.pointerId);
                    const move = (ev: PointerEvent) =>
                      setWidths((w) => ({ ...w, [column.id]: Math.max(48, startW + ev.clientX - startX) }));
                    const up = () => {
                      target.removeEventListener('pointermove', move);
                      target.removeEventListener('pointerup', up);
                    };
                    target.addEventListener('pointermove', move);
                    target.addEventListener('pointerup', up);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      {!sorted.length && emptyState && (
        <div role="row" aria-rowindex={2} className="ui-table-empty">
          <div role="gridcell" aria-colspan={columns.length}>
            {emptyState}
          </div>
        </div>
      )}
      <div role="rowgroup" style={{ position: 'relative', height: virtual.totalHeight }}>
        {sorted.slice(virtual.start, virtual.end).map((row, i) => {
          const index = virtual.start + i;
          const key = rowKey(row);
          const selected = key === selectedKey;
          const extra = rowClassName?.(row);
          return (
            // The grid owns focus and keyboard handling.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <div
              key={String(key)}
              id={rowId(key)}
              role="row"
              aria-rowindex={index + 2}
              aria-selected={selected}
              data-key={key}
              className={`ui-table-row${selected ? ' is-selected' : ''}${extra ? ` ${extra}` : ''}`}
              style={{ position: 'absolute', top: index * virtual.rowHeight, left: 0, right: 0 }}
              onClick={() => onSelect?.(key)}
              onDoubleClick={() => onActivate?.(key)}
            >
              {columns.map((column, ci) => (
                <div
                  key={column.id}
                  role="gridcell"
                  aria-colindex={ci + 1}
                  className={`ui-table-cell${column.align === 'end' ? ' is-end' : ''}${column.mono ? ' is-mono' : ''}`}
                >
                  {column.cell(row)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

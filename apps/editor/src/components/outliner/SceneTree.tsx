import { useMemo, useRef, useState, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  clearSelection,
  invertSelection,
  selectAll,
  selectNext,
  selectNode,
  setAllExpanded,
  toggleExpanded,
  toggleFreezeSelection,
  toggleHideSelection,
  zoomSelected,
} from '../../state/actions';
import { useEditor } from '../../state/store';
import { GroupHeader, Radio, TextButton } from '../chrome/widgets';
import { buildTreeRows, type TreeRow } from './treeRows';

const ROW_HEIGHT = 14;
const OVERSCAN = 20;

function setSearch(open: boolean, text = '') {
  useEditor.getState().update((s) => {
    s.searchOpen = open;
    s.search = text;
  });
}

interface RowProps {
  row: TreeRow;
  top: number;
  selected: boolean;
  hidden: boolean;
  frozen: boolean;
}

function TreeRowView({ row, top, selected, hidden, frozen }: RowProps) {
  const classes = ['tree-row', `kind-${row.kind}`];
  if (selected) classes.push('selected');
  if (frozen) classes.push('frozen');
  if (hidden) classes.push('hidden');

  return (
    <div
      className={classes.join(' ')}
      style={{ position: 'absolute', top, left: 0, right: 0 }}
      data-index={row.index}
      onClick={(e) => selectNode(row.index, e.ctrlKey || e.metaKey)}
      onDoubleClick={() => {
        selectNode(row.index, false);
        zoomSelected();
      }}
    >
      <div style={{ width: row.depth * 11, flex: 'none' }} />
      <div
        className="tree-twisty"
        onClick={(e) => {
          e.stopPropagation();
          if (row.hasChildren) toggleExpanded(row.index);
        }}
      >
        {row.hasChildren ? (row.expanded ? '−' : '+') : ''}
      </div>
      <div className="tree-name">{row.label}</div>
      <div className="tree-flags">
        {hidden ? 'H' : ''}
        {frozen ? 'f' : ''}
      </div>
    </div>
  );
}

export function SceneTree() {
  const { scene, sel, hidden, frozen, expanded, search, searchOpen, sorting } = useEditor(
    useShallow((s) => ({
      scene: s.scene,
      sel: s.sel,
      hidden: s.hidden,
      frozen: s.frozen,
      expanded: s.expanded,
      search: s.search,
      searchOpen: s.searchOpen,
      sorting: s.sorting,
    })),
  );

  const rows = useMemo(
    () =>
      scene ? buildTreeRows({ nodes: scene.graph.nodes, children: scene.children, expanded, search, sorting }) : [],
    [scene, expanded, search, sorting],
  );
  const selected = useMemo(() => new Set(sel), [sel]);

  const listRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 400 });
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => setView({ top: list.scrollTop, height: list.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    list.addEventListener('scroll', measure, { passive: true });
    return () => {
      observer.disconnect();
      list.removeEventListener('scroll', measure);
    };
  }, []);

  // Bring a selection made elsewhere (the viewport) into view.
  const first = sel[0];
  useEffect(() => {
    const list = listRef.current;
    if (!list || first === undefined) return;
    const at = rows.findIndex((r) => r.index === first);
    if (at < 0) return;
    const y = at * ROW_HEIGHT;
    if (y < list.scrollTop || y + ROW_HEIGHT > list.scrollTop + list.clientHeight) {
      list.scrollTop = Math.max(0, y - list.clientHeight / 2);
    }
    // Only when the selection changes, not on every scroll-driven re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first]);

  const start = Math.max(0, Math.floor(view.top / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(rows.length, Math.ceil((view.top + view.height) / ROW_HEIGHT) + OVERSCAN);

  const setSorting = (value: 'Alpha' | 'None') =>
    useEditor.getState().update((s) => {
      s.sorting = value;
    });

  const sideButton = (label: string, onClick: () => void, active = false) => (
    <TextButton key={label} label={label} active={active} className="tree-side-btn" onClick={onClick} />
  );

  return (
    <div className="tree-area">
      <div className="tree-side">
        <GroupHeader>Sorting</GroupHeader>
        <Radio label="Alpha" checked={sorting === 'Alpha'} onSelect={() => setSorting('Alpha')} />
        <Radio label="None" checked={sorting === 'None'} onSelect={() => setSorting('None')} />
        <div className="select-hdr">Select</div>
        {sideButton('All', selectAll)}
        {sideButton('None', () => clearSelection())}
        {sideButton('Invert', invertSelection)}
        {sideButton('Search', () => setSearch(!searchOpen, search), searchOpen)}
        {sideButton('Next', () => selectNext(rows.map((r) => r.index)))}
        {sideButton('3D View', zoomSelected)}
        {sideButton('Hide', toggleHideSelection)}
        {sideButton('Freeze', toggleFreezeSelection)}
        {sideButton('Expand', () => setAllExpanded(true))}
        {sideButton('Collapse', () => setAllExpanded(false))}
      </div>

      <div className="tree-panel bevel-in">
        <div className="col-header">
          <div className="col-object">Object</div>
          <div className="col-icon">{scene ? scene.graph.nodes.length : ''}</div>
        </div>
        {searchOpen && (
          <div className="search-bar">
            <input
              className="sunken-input"
              value={search}
              placeholder="name filter"
              autoFocus
              onChange={(e) => setSearch(true, e.target.value)}
            />
            <div className="btn search-close" onClick={() => setSearch(false)}>
              ✕
            </div>
          </div>
        )}
        <div className="tree-list" ref={listRef}>
          <div style={{ position: 'relative', height: rows.length * ROW_HEIGHT }}>
            {rows.slice(start, end).map((row, i) => (
              <TreeRowView
                key={row.index}
                row={row}
                top={(start + i) * ROW_HEIGHT}
                selected={selected.has(row.index)}
                hidden={!!hidden[row.index]}
                frozen={!!frozen[row.index]}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

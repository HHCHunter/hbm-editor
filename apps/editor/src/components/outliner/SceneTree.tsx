import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  clearSelection,
  invertSelection,
  selectAll,
  selectNext,
  selectObject,
  setAllExpanded,
  setStatus,
  toggleExpanded,
  toggleFreezeSelection,
  toggleHideSelection,
  zoomSelected,
} from '../../state/actions';
import { useEditor } from '../../state/store';
import { IconButton, Radio, GroupHeader, TextButton } from '../chrome/widgets';
import { buildTreeRows, type TreeRow } from './treeRows';

const FILTER_ICONS: [glyph: string, title: string][] = [
  ['◐', 'Toggle geometry'],
  ['◑', 'Toggle helpers'],
  ['☼', 'Toggle lights'],
  ['♪', 'Toggle sounds'],
];

function setSearch(open: boolean, text = '') {
  useEditor.getState().update((s) => {
    s.searchOpen = open;
    s.search = text;
  });
}

function TreeRowView({ row }: { row: TreeRow }) {
  const classes = ['tree-row'];
  if (row.isRoot) classes.push('root');
  else classes.push(`cls-${row.cls || 'none'}`);
  if (row.selected) classes.push('selected');
  if (row.frozen) classes.push('frozen');
  if (row.hidden) classes.push('hidden');

  return (
    <div
      className={classes.join(' ')}
      onClick={(e) => {
        if (row.isRoot) clearSelection('Root');
        else selectObject(row.id, e.ctrlKey || e.metaKey);
      }}
    >
      <div style={{ width: row.depth * 11, flex: 'none' }} />
      <div
        className="tree-twisty"
        onClick={(e) => {
          e.stopPropagation();
          if (!row.isRoot && row.hasChildren) toggleExpanded(row.id);
        }}
      >
        {row.hasChildren ? (row.expanded ? '−' : '+') : ''}
      </div>
      <div className="tree-name">{row.name}</div>
      <div className="tree-flags">
        {row.hidden ? 'H' : ''}
        {row.frozen ? 'f' : ''}
      </div>
    </div>
  );
}

export function SceneTree() {
  const { objects, sel, collapsed, search, searchOpen, sorting } = useEditor(
    useShallow((s) => ({
      objects: s.objects,
      sel: s.sel,
      collapsed: s.collapsed,
      search: s.search,
      searchOpen: s.searchOpen,
      sorting: s.sorting,
    })),
  );

  const rows = useMemo(
    () => buildTreeRows(objects, sel, collapsed, search, sorting),
    [objects, sel, collapsed, search, sorting],
  );

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
        <div className="tree-icon-grid">
          {FILTER_ICONS.map(([glyph, title]) => (
            <IconButton key={title} glyph={glyph} title={title} onClick={() => setStatus(title)} />
          ))}
        </div>
        {sideButton('All', selectAll)}
        {sideButton('None', () => clearSelection())}
        {sideButton('Invert', invertSelection)}
        {sideButton('Search', () => setSearch(!searchOpen, search))}
        {sideButton('Next', () => selectNext(rows.filter((r) => !r.isRoot).map((r) => r.id)))}
        {sideButton('3D View', zoomSelected, true)}
        {sideButton('Hide', toggleHideSelection)}
        {sideButton('Freeze', toggleFreezeSelection)}
        {sideButton('Hierarchy', () => setStatus('Hierarchy mode'), true)}
        {sideButton('Expand', () => setAllExpanded(true))}
        {sideButton('Collapse', () => setAllExpanded(false))}
      </div>

      <div className="tree-panel bevel-in">
        <div className="col-header">
          <div className="col-object">Object</div>
          <div className="col-icon">Icon</div>
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
        <div className="tree-list">
          {rows.map((row) => (
            <TreeRowView key={row.id} row={row} />
          ))}
        </div>
      </div>
    </div>
  );
}

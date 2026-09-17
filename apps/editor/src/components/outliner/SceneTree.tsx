import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Camera, Folder, FolderTree, Lightbulb, Lock, EyeOff, Shapes, type LucideIcon } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import type { SceneNodeDTO } from '@hbm/protocol';
import {
  clearSelection,
  expandSubtree,
  invertSelection,
  selectAll,
  selectNode,
  selectRange,
  setAllExpanded,
  toggleExpanded,
  toggleFreezeSelection,
  toggleHideSelection,
  zoomSelected,
} from '../../state/actions';
import { useEditor } from '../../state/store';
import { Button, PanelState, RadioGroup, SearchField, Toolbar, Tree, type TreeItem } from '../../ui';
import { buildTreeRows, type TreeRow } from './treeRows';

const KIND_ICONS: Record<SceneNodeDTO['kind'], LucideIcon> = {
  room: Folder,
  group: FolderTree,
  mesh: Box,
  light: Lightbulb,
  camera: Camera,
  other: Shapes,
};

type Row = TreeRow & TreeItem<number>;

function setSearch(text: string) {
  useEditor.getState().update((s) => {
    s.search = text;
  });
}

function setSorting(value: 'Alpha' | 'None') {
  useEditor.getState().update((s) => {
    s.sorting = value;
  });
}

export function SceneTree() {
  const { scene, sel, hidden, frozen, expanded, search, sorting } = useEditor(
    useShallow((s) => ({
      scene: s.scene,
      sel: s.sel,
      hidden: s.hidden,
      frozen: s.frozen,
      expanded: s.expanded,
      search: s.search,
      sorting: s.sorting,
    })),
  );

  const rows = useMemo<Row[]>(
    () =>
      scene
        ? buildTreeRows({ nodes: scene.graph.nodes, children: scene.children, expanded, search, sorting }).map((r) => ({ ...r, key: r.index }))
        : [],
    [scene, expanded, search, sorting],
  );
  const order = useMemo(() => rows.map((r) => r.index), [rows]);
  const selected = useMemo(() => new Set(sel), [sel]);

  // The keyboard cursor follows a selection made elsewhere, such as a viewport click.
  const [focusKey, setFocusKey] = useState<number | null>(null);
  const anchor = useRef<number | null>(null);
  const first = sel[0];
  useEffect(() => {
    if (first !== undefined && !sel.includes(focusKey ?? -1)) setFocusKey(first);
    // Only when the selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first]);

  const matchCount = search ? rows.length : null;

  return (
    <div className="tree-area">
      <Toolbar label="Outliner" orientation="vertical" className="tree-side">
        <Button variant="tool" disabled={!scene} onClick={selectAll}>
          All
        </Button>
        <Button variant="tool" disabled={!sel.length} onClick={() => clearSelection()}>
          None
        </Button>
        <Button variant="tool" disabled={!scene} onClick={invertSelection}>
          Invert
        </Button>
        <Button variant="tool" disabled={!sel.length} onClick={zoomSelected}>
          Frame
        </Button>
        <Button variant="tool" disabled={!sel.length} onClick={toggleHideSelection}>
          Hide
        </Button>
        <Button variant="tool" disabled={!sel.length} onClick={toggleFreezeSelection}>
          Freeze
        </Button>
        <Button variant="tool" disabled={!scene} onClick={() => setAllExpanded(true)}>
          Expand
        </Button>
        <Button variant="tool" disabled={!scene} onClick={() => setAllExpanded(false)}>
          Collapse
        </Button>
      </Toolbar>

      <div className="tree-panel bevel-in">
        <div className="tree-header">
          <SearchField
            label="Filter objects by name"
            placeholder="Filter objects"
            value={search}
            onChange={setSearch}
            count={matchCount !== null ? `${matchCount} shown` : scene ? `${scene.graph.nodes.length} objects` : undefined}
          />
          <RadioGroup
            label="Sort objects"
            orientation="horizontal"
            value={sorting}
            options={[
              { value: 'None', label: 'Scene order' },
              { value: 'Alpha', label: 'A–Z' },
            ]}
            onChange={setSorting}
          />
        </div>
        <Tree<number, Row>
          label="Scene objects"
          className="tree-list"
          items={rows}
          selected={selected}
          focusKey={focusKey}
          onFocusChange={setFocusKey}
          onToggle={toggleExpanded}
          onExpandAll={expandSubtree}
          onActivate={(index) => {
            if (!selected.has(index)) selectNode(index, false);
            zoomSelected();
          }}
          onSelect={(index, { toggle, range }) => {
            if (range && anchor.current !== null) return selectRange(order, anchor.current, index);
            anchor.current = index;
            selectNode(index, toggle);
          }}
          itemClassName={(row) =>
            [`kind-${row.kind}`, hidden[row.index] ? 'is-hidden' : '', frozen[row.index] ? 'is-frozen' : ''].filter(Boolean).join(' ')
          }
          renderItem={(row) => {
            const Icon = KIND_ICONS[row.kind];
            return (
              <>
                <Icon className="ui-icon tree-kind" aria-hidden="true" strokeWidth={1.75} />
                <span className="ui-tree-label">{row.label}</span>
                {hidden[row.index] && <EyeOff className="ui-icon tree-flag" aria-label="hidden" role="img" />}
                {frozen[row.index] && <Lock className="ui-icon tree-flag" aria-label="frozen" role="img" />}
              </>
            );
          }}
          emptyState={
            !scene ? (
              <PanelState variant="empty" title="No scene open" message="Open a scene to list its objects." />
            ) : search ? (
              <PanelState
                variant="empty"
                layout="inline"
                title={`No objects match “${search}”`}
                action={{ label: 'Clear Filter', onClick: () => setSearch('') }}
              />
            ) : null
          }
        />
      </div>
    </div>
  );
}

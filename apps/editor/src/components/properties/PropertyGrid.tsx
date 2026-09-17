import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { SceneNodeDTO } from '@hbm/protocol';
import { drawsVariant } from '@hbm/scene';
import { useEditor } from '../../state/store';
import { useNodeDetail } from '../../hooks/useNodeDetail';
import { useAsync } from '../../hooks/useAsync';
import { PanelState } from '../../ui';
import { meshPartsOf } from '../../viewport/meshStore';
import { skeletonFor } from '../../viewport/skeletonStore';
import { buildPropRows, type PropRow } from './rows';

function PropRowView({ row }: { row: PropRow }) {
  if (row.kind === 'group') {
    return (
      <div className="prop-row group" role="row">
        <div className="prop-label" role="rowheader" aria-colspan={2}>
          {row.label}
        </div>
      </div>
    );
  }
  return (
    <div className="prop-row" role="row" title={row.title}>
      <div className="prop-label" role="rowheader">
        {row.label}
      </div>
      <div className="prop-value" role="cell">
        {row.value}
      </div>
    </div>
  );
}

export function PropertyGrid() {
  const { scene, sel } = useEditor(useShallow((s) => ({ scene: s.scene, sel: s.sel })));
  const { detail, error: detailError, retry } = useNodeDetail();
  const meshProgress = useEditor((s) => s.meshProgress);

  const skeletonRoot = scene && sel.length === 1 ? (scene.graph.nodes[sel[0]!]?.meshRoot ?? 0) : 0;
  const hasSkeleton = !!scene && (scene.roots[skeletonRoot]?.bones ?? 0) > 0;
  const skeleton = useAsync(scene && hasSkeleton ? () => skeletonFor(scene.id, skeletonRoot) : null, [scene?.id, skeletonRoot, hasSkeleton]);

  const rows = useMemo(() => {
    if (!scene) return [];
    const nodes = sel.map((i) => scene.graph.nodes[i]).filter((n): n is SceneNodeDTO => !!n);
    const one = nodes.length === 1 ? nodes[0]! : null;
    const parts = one?.meshRoot
      ? (meshPartsOf(scene.id, one.meshRoot)?.filter((p) => drawsVariant(one.variantId, p.variantId)) ?? null)
      : null;
    return buildPropRows(nodes, detail, scene.surfaces, parts, skeleton.value ?? null, detailError);
    // meshProgress: the model's parts may arrive after the selection.
  }, [scene, sel, detail, detailError, meshProgress, skeleton.value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="prop-panel bevel-in">
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling region has to be focusable to scroll from the keyboard */}
      <div className="prop-list" role="region" aria-label="Properties list" tabIndex={0}>
        <div role="table" aria-label="Properties">
        <div className="prop-header" role="row">
          <div className="prop-header-name" role="columnheader">
            Name
          </div>
          <div className="prop-header-value" role="columnheader">
            Value
          </div>
        </div>
        {rows.map((row, i) => (
          <PropRowView key={`${sel[0]}:${i}:${row.label}`} row={row} />
        ))}
        </div>
        {detailError && (
          <PanelState
            variant="error"
            layout="inline"
            title="Couldn't read this object's properties"
            message={detailError}
            action={{ label: 'Retry', onClick: retry }}
          />
        )}
        {!sel.length && scene && (
          <PanelState variant="empty" layout="inline" title="Nothing selected" message="Click an object in the viewport or the outliner." />
        )}
      </div>
    </div>
  );
}

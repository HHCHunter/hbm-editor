import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { SceneNodeDTO } from '@hbm/protocol';
import { drawsVariant } from '@hbm/scene';
import { useEditor } from '../../state/store';
import { PushButton } from '../chrome/Dialog';
import { useNodeDetail } from '../../hooks/useNodeDetail';
import { useAsync } from '../../hooks/useAsync';
import { meshPartsOf } from '../../viewport/meshStore';
import { skeletonFor } from '../../viewport/skeletonStore';
import { buildPropRows, type PropRow } from './rows';

function PropRowView({ row }: { row: PropRow }) {
  if (row.kind === 'group') {
    return (
      <div className="prop-row group">
        <div className="prop-label">{row.label}</div>
      </div>
    );
  }
  return (
    <div className="prop-row" title={row.title ?? `${row.label}: ${row.value}`}>
      <div className="prop-label">{row.label}</div>
      <div className="prop-value">
        <input className="prop-input" value={row.value} readOnly />
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
      <div className="prop-header">
        <div className="prop-header-name">Name</div>
        <div className="prop-header-value">Value</div>
      </div>
      <div className="prop-list">
        {rows.map((row, i) => (
          <PropRowView key={`${sel[0]}:${i}:${row.label}`} row={row} />
        ))}
        {detailError && (
          <div className="prop-retry">
            <PushButton label="Retry" onClick={retry} />
          </div>
        )}
      </div>
    </div>
  );
}

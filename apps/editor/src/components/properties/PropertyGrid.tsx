import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { SceneNodeDTO } from '@hbm/protocol';
import { drawsVariant } from '@hbm/scene';
import { useEditor } from '../../state/store';
import { useNodeDetail } from '../../hooks/useNodeDetail';
import { meshPartsOf } from '../../viewport/meshStore';
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
    <div className="prop-row" title={`${row.label}: ${row.value}`}>
      <div className="prop-label">{row.label}</div>
      <div className="prop-value">
        <input className="prop-input" value={row.value} readOnly />
      </div>
    </div>
  );
}

export function PropertyGrid() {
  const { scene, sel } = useEditor(useShallow((s) => ({ scene: s.scene, sel: s.sel })));
  const detail = useNodeDetail();
  const meshProgress = useEditor((s) => s.meshProgress);

  const rows = useMemo(() => {
    if (!scene) return [];
    const nodes = sel.map((i) => scene.graph.nodes[i]).filter((n): n is SceneNodeDTO => !!n);
    const one = nodes.length === 1 ? nodes[0]! : null;
    const parts = one?.meshRoot
      ? (meshPartsOf(scene.id, one.meshRoot)?.filter((p) => drawsVariant(one.variantId, p.variantId)) ?? null)
      : null;
    return buildPropRows(nodes, detail, scene.surfaces, parts);
    // meshProgress: the model's parts may arrive after the selection.
  }, [scene, sel, detail, meshProgress]); // eslint-disable-line react-hooks/exhaustive-deps

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
      </div>
    </div>
  );
}

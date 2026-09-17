import { useShallow } from 'zustand/react/shallow';
import { formatNumber } from '../../state/actions';
import { nodeLabel, nodePosition } from '../../scene/sceneModel';
import { useEditor } from '../../state/store';

export function HeaderFields() {
  const { scene, sel } = useEditor(useShallow((s) => ({ scene: s.scene, sel: s.sel })));
  const one = scene && sel.length === 1 ? (scene.graph.nodes[sel[0]!] ?? null) : null;

  const fields: [label: string, value: string][] = [
    ['Name', one ? nodeLabel(one) : sel.length ? `(${sel.length} selected)` : ''],
    ['Class', one?.className ?? (one ? one.kind : '')],
    ['Controllers', one?.controllers.join(', ') ?? ''],
    ['Model', one?.meshRoot ? String(one.meshRoot) : ''],
    ['Wrld', one && scene ? nodePosition(scene.transforms, one.index).map(formatNumber).join(', ') : ''],
  ];

  return (
    <div className="head-fields bevel-in">
      {fields.map(([label, value]) => (
        <div className="head-field" key={label}>
          <div className="head-label">{label}</div>
          <input className="head-input" value={value} readOnly title={value} />
        </div>
      ))}
    </div>
  );
}

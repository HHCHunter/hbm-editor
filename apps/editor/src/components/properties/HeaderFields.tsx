import { useShallow } from 'zustand/react/shallow';
import { formatNumber } from '../../state/actions';
import { nodeLabel, nodePosition } from '../../scene/sceneModel';
import { useEditor } from '../../state/store';

export function HeaderFields() {
  const { scene, sel } = useEditor(useShallow((s) => ({ scene: s.scene, sel: s.sel })));
  const one = scene && sel.length === 1 ? (scene.graph.nodes[sel[0]!] ?? null) : null;

  const fields: [label: string, value: string][] = [
    ['Name', one ? nodeLabel(one) : sel.length ? `${sel.length} objects selected` : 'Nothing selected'],
    ['Class', one?.className ?? (one ? one.kind : '')],
    ['Controllers', one ? one.controllers.join(', ') || 'None' : ''],
    ['Model', one?.meshRoot ? `${one.meshRoot}${one.variantId ? ` · variant ${one.variantId}` : ''}` : one ? 'None' : ''],
    ['Position', one && scene ? nodePosition(scene.transforms, one.index).map(formatNumber).join(', ') : ''],
  ];

  return (
    <dl className="head-fields bevel-in" aria-label="Selected object">
      {fields.map(([label, value]) => (
        <div className="head-field" key={label}>
          <dt className="head-label">{label}</dt>
          <dd className="head-value" title={value}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

import { nodeLabel } from '../scene/sceneModel';
import { selectNode, setTab, zoomSelected } from '../state/actions';
import { useEditor } from '../state/store';

/** Select a scene object and frame it in the scene view. */
export function showNode(index: number): void {
  setTab('scene');
  selectNode(index, false, true);
  zoomSelected();
}

export interface NodeLinkListProps {
  label: string;
  nodes: readonly number[];
  /** List only this many, and count the rest. */
  limit?: number;
}

/** Scene objects as links that select and frame them. */
export function NodeLinkList({ label, nodes, limit = Infinity }: NodeLinkListProps) {
  const graphNodes = useEditor((s) => s.scene?.graph.nodes);
  const shown = nodes.slice(0, limit);
  return (
    <div className="node-links">
      <h4 className="group-hdr">{label}</h4>
      <ul className="side-list">
        {shown.map((index) => {
          const node = graphNodes?.[index];
          return (
            <li key={index}>
              <button type="button" className="list-item link" title={node?.name} onClick={() => showNode(index)}>
                <span className="grow">{node ? nodeLabel(node) : `Object ${index}`}</span>
                <span className="list-meta">#{index}</span>
              </button>
            </li>
          );
        })}
        {nodes.length > shown.length && <li className="list-item list-meta">and {nodes.length - shown.length} more</li>}
        {!nodes.length && <li className="list-item list-meta">None</li>}
      </ul>
    </div>
  );
}

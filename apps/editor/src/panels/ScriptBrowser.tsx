import { useMemo, useState } from 'react';
import type { ScriptCreatorDTO } from '@hbm/protocol';
import { getSceneScripts } from '../api/endpoints';
import { useAsync } from '../hooks/useAsync';
import { nodeLabel } from '../scene/sceneModel';
import { selectNode, setTab, zoomSelected } from '../state/actions';
import { useEditor } from '../state/store';

function showNode(index: number) {
  setTab('scene');
  selectNode(index, false, true);
  zoomSelected();
}

function ScriptDetail({ creator }: { creator: ScriptCreatorDTO }) {
  const nodes = useEditor((s) => s.scene?.graph.nodes);
  return (
    <div className="side-detail bevel-in">
      <div className="tex-title">{creator.name}</div>
      <table className="kv">
        <tbody>
          <tr>
            <td>Bases</td>
            <td>{creator.bases.length ? creator.bases.join(' → ') : '(none)'}</td>
          </tr>
          <tr>
            <td>Instance size</td>
            <td>{creator.size} bytes</td>
          </tr>
          <tr>
            <td>Used by</td>
            <td>{creator.users.length} object(s)</td>
          </tr>
        </tbody>
      </table>
      <div className="group-hdr">Objects</div>
      <div className="side-list">
        {creator.users.map((index) => {
          const node = nodes?.[index];
          return (
            <div key={index} className="list-item link" title={node?.name} onClick={() => showNode(index)}>
              {node ? nodeLabel(node) : `node ${index}`}
              <span className="list-meta">#{index}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ScriptBrowser() {
  const sceneId = useEditor((s) => s.scene?.id ?? null);
  const scripts = useAsync(sceneId ? () => getSceneScripts(sceneId) : null, [sceneId]);
  const [filter, setFilter] = useState('');
  const [showUnused, setShowUnused] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (scripts.value?.creators ?? [])
      .filter((c) => (showUnused || c.users.length) && (!q || c.name.toLowerCase().includes(q)))
      .sort((a, b) => b.users.length - a.users.length || a.name.localeCompare(b.name));
  }, [scripts.value, filter, showUnused]);
  const creator = scripts.value?.creators.find((c) => c.name === chosen) ?? null;
  const unmatched = scripts.value?.users.filter((u) => !u.creator) ?? [];

  if (!sceneId) return <div className="panel-empty">Open a scene to browse its mission scripts.</div>;

  return (
    <div className="browser">
      <div className="browser-bar">
        <input className="sunken-input" value={filter} placeholder="script class" onChange={(e) => setFilter(e.target.value)} />
        <label className="radio-label">
          <input type="checkbox" checked={showUnused} onChange={(e) => setShowUnused(e.target.checked)} />
          show classes no object uses
        </label>
        <span className="browser-count">
          {scripts.status === 'loading'
            ? 'Reading…'
            : scripts.value
              ? `${scripts.value.dll ?? `no DLL for ${scripts.value.module ?? 'this scene'}`} · ${scripts.value.creators.length} classes · ${scripts.value.users.length} scripted objects`
              : ''}
          {unmatched.length ? ` · ${unmatched.length} unmatched` : ''}
        </span>
        {scripts.status === 'error' && <span className="error">{scripts.error}</span>}
      </div>
      <div className="browser-body">
        <div className="loc-table-wrap bevel-in">
          <table className="loc-table">
            <thead>
              <tr>
                <th>Script class</th>
                <th>Base</th>
                <th>Objects</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.name} className={c.name === chosen ? 'selected' : ''} data-script={c.name} onClick={() => setChosen(c.name)}>
                  <td className="loc-name">{c.name}</td>
                  <td className="loc-name">{c.bases[0] ?? ''}</td>
                  <td className="loc-num">{c.users.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {creator && <ScriptDetail key={creator.name} creator={creator} />}
      </div>
    </div>
  );
}

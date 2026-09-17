import { useMemo, useState } from 'react';
import type { AnimationClipDTO, SceneAnimationsDTO } from '@hbm/protocol';
import { getSceneAnimations } from '../api/endpoints';
import { useAsync } from '../hooks/useAsync';
import { nodeLabel } from '../scene/sceneModel';
import { selectNode, setTab, zoomSelected } from '../state/actions';
import { useEditor } from '../state/store';

const ROOT_TRACK = 0x38;

/** The clip's decoding path, as its flags select it. */
function clipKind(clip: AnimationClipDTO): string {
  const kinds: string[] = [];
  if (clip.mask & 0x4) kinds.push('human state');
  if (clip.mask & 0x2) kinds.push('bone quaternions');
  if (clip.mask & 0x20) kinds.push('pose');
  return kinds.join(' + ') || 'none';
}

/** "anim:Male_Reg/Male_Reg_Run#Run_Backward" → collection "Male_Reg", clip "Run_Backward". */
function splitName(name: string): { collection: string; clip: string } {
  const m = /^anim:([^/]*)\/(?:[^#]*#)?(.*)$/.exec(name);
  return m ? { collection: m[1]!, clip: m[2]! } : { collection: '', clip: name };
}

function showNode(index: number) {
  setTab('scene');
  selectNode(index, false, true);
  zoomSelected();
}

function ClipDetail({ clip, data }: { clip: AnimationClipDTO; data: SceneAnimationsDTO }) {
  return (
    <div className="side-detail bevel-in">
      <div className="tex-title">{clip.name}</div>
      <table className="kv">
        <tbody>
          <tr>
            <td>Frames</td>
            <td>
              {clip.frames} at {clip.fps} fps ({(clip.frames / Math.max(1, clip.fps)).toFixed(2)} s)
            </td>
          </tr>
          <tr>
            <td>Data</td>
            <td>{clipKind(clip)}</td>
          </tr>
          <tr>
            <td>Flags</td>
            <td>0x{clip.mask.toString(16).toUpperCase()}</td>
          </tr>
          <tr>
            <td>Blend frames</td>
            <td>{clip.blendFrames}</td>
          </tr>
        </tbody>
      </table>
      {clip.mask & 0x4 ? (
        <div className="dialog-text">
          Human-state channels are expanded per character by the engine's StateFit, which isn't recovered yet.
        </div>
      ) : null}
      <div className="group-hdr">Bones ({clip.boneIds.length})</div>
      <div className="side-list">
        {clip.boneIds.map((id) => (
          <div key={id} className="list-item">
            {data.boneNames[id] ?? `bone ${id}`}
            <span className="list-meta">{id === ROOT_TRACK ? 'root track' : `#${id}`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Users listed per collection; the rest are counted. */
const USERS_SHOWN = 50;

function Collections({ data }: { data: SceneAnimationsDTO }) {
  const nodes = useEditor((s) => s.scene?.graph.nodes);
  return (
    <div className="side-detail bevel-in">
      <div className="group-hdr">Collections ({data.collections.length})</div>
      <div className="side-list">
        {data.collections.map((c) => (
          <div key={c.name}>
            <div className="list-group">
              {c.name.replace(/^anmcol:animationdatabase#/, '')} <span className="list-meta">{c.users.length} object(s)</span>
            </div>
            {c.users.slice(0, USERS_SHOWN).map((index) => (
              <div key={index} className="list-item link" onClick={() => showNode(index)}>
                {nodes?.[index] ? nodeLabel(nodes[index]!) : `node ${index}`}
                <span className="list-meta">#{index}</span>
              </div>
            ))}
            {c.users.length > USERS_SHOWN && (
              <div className="list-item list-meta">and {c.users.length - USERS_SHOWN} more</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AnimationBrowser() {
  const sceneId = useEditor((s) => s.scene?.id ?? null);
  const data = useAsync(sceneId ? () => getSceneAnimations(sceneId) : null, [sceneId]);
  const [filter, setFilter] = useState('');
  const [chosen, setChosen] = useState<number | null>(null);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (data.value?.clips ?? []).filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [data.value, filter]);
  const clip = data.value?.clips[chosen ?? -1] ?? null;

  if (!sceneId) return <div className="panel-empty">Open a scene to browse its animations.</div>;

  return (
    <div className="browser">
      <div className="browser-bar">
        <input className="sunken-input" value={filter} placeholder="clip name" onChange={(e) => setFilter(e.target.value)} />
        <span className="browser-count">
          {data.status === 'loading'
            ? 'Reading…'
            : data.value
              ? `${shown.length} of ${data.value.clips.length} clips · ${data.value.boneNames.length} bones · playback needs the clip decoder, not recovered yet`
              : ''}
        </span>
        {data.status === 'error' && <span className="error">{data.error}</span>}
      </div>
      <div className="browser-body">
        <div className="loc-table-wrap bevel-in">
          <table className="loc-table">
            <thead>
              <tr>
                <th>Collection</th>
                <th>Clip</th>
                <th>Frames</th>
                <th>Seconds</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const { collection, clip: clipName } = splitName(c.name);
                return (
                  <tr key={c.index} className={c.index === chosen ? 'selected' : ''} data-clip={c.index} onClick={() => setChosen(c.index)} title={c.name}>
                    <td className="loc-name">{collection}</td>
                    <td className="loc-name">{clipName}</td>
                    <td className="loc-num">{c.frames}</td>
                    <td className="loc-num">{(c.frames / Math.max(1, c.fps)).toFixed(2)}</td>
                    <td className="loc-name">{clipKind(c)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {data.value && (clip ? <ClipDetail key={clip.index} clip={clip} data={data.value} /> : <Collections data={data.value} />)}
      </div>
    </div>
  );
}
